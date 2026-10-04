/**
 * THE DRIVE.
 *
 * The opening cutscene: two people in a car on a wet road at night, and the
 * thing that is waiting on it.
 *
 * It has its own THREE.Scene, swapped in through the renderer's existing
 * composer, so none of the room's geometry, lighting or post chain is disturbed
 * and coming back from it costs one `setView`.
 *
 * THE CAR DOES NOT MOVE. The world moves past it. The road is a fixed strip
 * whose texture scrolls, the trees are recycled from front to back as they pass,
 * and the rain is a box of streaks that wraps around the origin. This is how
 * every driving game does it and the reasons are all still good here: the
 * numbers stay small, the camera rig never has to chase anything, and the
 * headlights illuminate the same patch of road for the whole scene so the
 * lighting can be tuned once.
 *
 * What makes it read as cinematic rather than as a tech demo is almost all
 * lighting:
 *
 *   DASH GLOW      a dim amber point light low in the cabin. Faces lit from
 *                  below by an instrument cluster is the single most
 *                  recognisable look in night-driving photography, and it is
 *                  the reason these two faces read as faces at all in a scene
 *                  this dark.
 *   HEADLIGHT SPILL  two spotlights far down the road, so there is something
 *                  bright at the vanishing point and the fog has a shape.
 *   LIGHTNING      occasional full-scene flashes that rim-light both of them
 *                  from the side and show, for a fifth of a second, how much
 *                  fog there actually is.
 */

import * as THREE from "three";

import { EV, emit } from "../core/bus.js";
import { WORLD } from "../core/config.js";
import { clamp01, damp, lerp, makeRng, noise1 } from "../core/maths.js";
import { get as getPlatform } from "../core/platform.js";
import { mat } from "../engine/materials.js";
import * as textures from "../engine/textures.js";
import * as renderer from "../engine/renderer.js";
import { audio } from "../audio/manager.js";
import * as human from "../characters/human.js";
import * as models from "../characters/models.js";
import * as wraithFactory from "../characters/wraith.js";
import * as cinema from "../ui/cinema.js";
import * as dialogue from "../story/dialogue.js";
import * as director from "../story/director.js";
import { CAR as CAR_SCRIPT } from "../story/script.js";

/* -------------------------------------------------------------------------- *
 * Scene state
 * -------------------------------------------------------------------------- */

let scene = null;
let world = null;      // everything that scrolls past
let cabin = null;      // the car interior; the camera's space
let lights = null;
let rain = null;
let trees = [];
let smokeMass = null;
let wraith = null;
let him = null;
let her = null;
let glassTex = null;

/** Per-frame state. */
const S = {
  active: false,
  time: 0,
  /** Road speed in metres per second. Dropped to zero by the impact. */
  speed: 13,
  wantSpeed: 13,
  /** Wiper sweep phase. */
  wiper: 0,
  wiperOn: true,
  /** Lightning: level now, and when the next one is due. */
  flash: 0,
  nextFlash: 6,
  /** How far along the "something is on the road" beat we are. */
  smokeApproach: -1,
  talking: null,
  /** Which way each character is looking, as a world point or null. */
  himLook: null,
  herLook: null,
};

const ROAD_LEN = 160;
const TREE_SPACING = 11;

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

function build() {
  const q = getPlatform().settings;
  const rng = makeRng(70707);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x01020a);
  /*
   * Fog, and a lot of it.
   *
   * 42 m of visibility at 13 m/s means about three seconds of road ahead, which
   * is the whole premise of the scene: they cannot see what is coming. It also
   * means nothing past 42 m needs to exist, which is why the road is 160 m long
   * and not 2 km.
   */
  scene.fog = new THREE.Fog(0x05070c, 2, 46);

  world = new THREE.Group();
  scene.add(world);

  /* --- road ------------------------------------------------------------- */
  const roadMat = mat.asphalt();
  /*
   * The texture is cloned so this scene can own its scroll offset.
   *
   * The material library hands out shared materials, and animating the offset
   * on a shared map would scroll the tarmac in every other place it is used.
   */
  const roadMaps = {};
  for (const key of ["map", "roughnessMap", "normalMap"]) {
    if (!roadMat[key]) continue;
    const clone = roadMat[key].clone();
    clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(3, 42);
    clone.needsUpdate = true;
    roadMaps[key] = clone;
  }
  const scrollMat = new THREE.MeshStandardMaterial({
    ...roadMaps,
    color: 0x32353a,
    roughness: 1,
    metalness: 0,
  });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, ROAD_LEN, 1, 1), scrollMat);
  road.rotation.x = -Math.PI / 2;
  road.position.z = -ROAD_LEN / 2 + 14;
  road.receiveShadow = false;
  world.add(road);
  world.userData.roadMaps = roadMaps;

  // Verges: wet grass either side, dark enough to be a suggestion.
  const vergeMat = mat.cloth(0x14180f, 1);
  for (const side of [-1, 1]) {
    const verge = new THREE.Mesh(new THREE.PlaneGeometry(14, ROAD_LEN), vergeMat);
    verge.rotation.x = -Math.PI / 2;
    verge.position.set(side * 11.4, -0.04, road.position.z);
    world.add(verge);
  }

  // Centre line: dashes on their own strip, scrolled with the road. A painted
  // line is the only thing in the scene that gives a sense of speed, because
  // tarmac texture at this distance does not.
  const dashMat = new THREE.MeshStandardMaterial({
    color: 0xbfae86,
    roughness: 0.6,
    metalness: 0,
    emissive: 0x161208,
    emissiveIntensity: 0.4,
  });
  const dashes = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 2.2), dashMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(0, 0.002, -i * 6);
    dashes.add(d);
  }
  world.add(dashes);
  world.userData.dashes = dashes;

  /* --- trees ------------------------------------------------------------ */
  /*
   * Bare, dead, and only ever seen in silhouette against the fog, so each one
   * is a trunk and three angled branches - no canopy at all. A dense canopy
   * would be invisible in this light and would cost ten times as much.
   */
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.19, 7, getPlatform().settings.propDetail <= 0 ? 4 : 6);
  const branchGeo = new THREE.CylinderGeometry(0.03, 0.07, 2.6, 4);
  const barkMat = mat.cloth(0x0d0f0c, 1);
  trees = [];
  const count = q.propDetail <= 0 ? 12 : 22;
  for (let i = 0; i < count; i++) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.position.y = 3.5;
    tree.add(trunk);
    for (let b = 0; b < 3; b++) {
      const branch = new THREE.Mesh(branchGeo, barkMat);
      branch.position.y = 4.4 + b * 0.8;
      branch.rotation.z = (rng() - 0.5) * 1.6;
      branch.rotation.y = rng() * Math.PI;
      tree.add(branch);
    }
    const side = i % 2 ? 1 : -1;
    tree.position.set(side * (6.4 + rng() * 3.4), 0, -(i / 2) * TREE_SPACING - 6);
    tree.rotation.y = rng() * Math.PI;
    tree.scale.setScalar(0.7 + rng() * 0.6);
    world.add(tree);
    trees.push(tree);
  }

  /* --- rain ------------------------------------------------------------- */
  rain = buildRain(q.propDetail <= 0 ? 420 : 1100);
  scene.add(rain.object);

  /* --- the car ---------------------------------------------------------- */
  cabin = buildCabin();
  scene.add(cabin);
  addShell(cabin);

  /* --- lights ----------------------------------------------------------- */
  lights = buildLights(cabin, scene);

  /* --- the people ------------------------------------------------------- */
  him = human.build("him");
  her = human.build("her");
  /*
   * Right-hand drive: the driver sits on the right.
   *
   * The seat positions are the only place the handedness is decided, and
   * everything else - the wheel, the mirror, which way she turns to look at
   * him - is derived from them.
   */
  /*
   * DERIVED from the cushion, not typed in.
   *
   * A posed figure's hips stay where its standing hips were - the pose swings
   * the legs, it does not lower the body - so sitting it on a cushion means
   * dropping the whole rig by the distance from the floor to its own hip. Doing
   * that arithmetic here, from `SEAT`, means the cushion can move without
   * anybody remembering to move two characters with it. Which is how they ended
   * up standing on the seats the first time.
   */
  him.place(0.37, SEAT - him.dims.H * 0.53, 0.12, Math.PI);
  her.place(-0.37, SEAT - her.dims.H * 0.53, 0.12, Math.PI);
  him.setPose("driving", { instant: true });
  her.setPose("passenger", { instant: true });
  cabin.add(him.root);
  cabin.add(her.root);

  /* --- the thing on the road -------------------------------------------- */
  smokeMass = buildSmokeMass();
  world.add(smokeMass.group);
  wraith = wraithFactory.build(scene);
  wraith.place(0, 0, -34);

  renderer.requestShadowUpdate();
  return scene;
}

/**
 * The car interior.
 *
 * Only what is visible from inside: windscreen frame, A-pillars, dash, wheel,
 * seats, door cards, roof lining, mirror. Nothing outside the cabin is modelled
 * at all - there is no bonnet, no bodywork, no wheels - because the camera
 * never leaves it, and a scene that models what it cannot show is a scene that
 * runs at half the frame rate for nothing.
 */
/**
 * How high the seat cushion is above the road, in metres.
 *
 * THIS ONE NUMBER DECIDES THE WHOLE SCENE and it has been wrong twice. It sets
 * where the two of them sit, which sets where their eyes are, which is where
 * every camera in the shot list has to be - so getting it wrong does not look
 * like a seating bug, it looks like every shot in the opening being framed at
 * somebody's chin.
 *
 * 0.44 was the first value: too low, and the characters were placed to
 * compensate, which put their hips below the cushion and their legs through the
 * floor. 0.55 was the second: the fix for that, and now too HIGH - a seated
 * adult is about 0.86m from hip to crown, so a cushion at 0.55 puts the top of
 * a head at 1.41 and the roof of this car is at 1.42. Both of them were wearing
 * the roof as a hat, and the two-shot was framed on the underside of a jaw.
 *
 * 0.40 is what a car of this period actually measures, and it is derived rather
 * than guessed: roof at 1.42, a seated crown at 1.26 leaves a hand's width of
 * headroom, and 1.26 minus 0.86 is where the cushion goes.
 */
const SEAT = 0.4;

/** Seated eye height, which is where every camera in this scene lives. */
const EYE = SEAT + 0.74;

function buildCabin() {
  const g = new THREE.Group();
  g.name = "cabin";

  const body = mat.carPaint(0x1b1f23);
  const trim = mat.cloth(0x14161a, 0.82);
  const seatMat = mat.cloth(0x1d1b1c, 0.95);

  /* --- floor and bulkheads --------------------------------------------- */
  /*
   * The floor pan, and it is deliberately deep.
   *
   * It is a box rather than a plane and it reaches well below the cabin,
   * because it is also the thing that HIDES THE LEGS. The characters are static
   * meshes bent into a sitting pose, and a bent static mesh gets the hips and
   * the knees right and puts the feet somewhere approximate - in this case
   * through the floor. Nothing in the scene is ever shot from below the waist,
   * so an opaque pan that extends past the feet is the whole fix, and it is
   * what a real floor pan does anyway.
   */
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.5, 2.6), trim);
  floor.position.set(0, SEAT - 0.37, 0.3);
  g.add(floor);

  // Dash: two boxes, an upper cowl and a lower face, with a gap for the
  // instrument binnacle. The gap is where the glow comes from.
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.34, 0.42), trim);
  dash.position.set(0, 0.8, -0.72);
  g.add(dash);
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.1, 0.5), trim);
  cowl.position.set(0, 0.99, -0.78);
  cowl.rotation.x = -0.18;
  g.add(cowl);

  // The instrument cluster: a dark face with two emissive dials. This is a
  // light SOURCE in the scene as well as a piece of dressing.
  const cluster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.14),
    new THREE.MeshStandardMaterial({
      color: 0x08090a,
      emissive: 0xd98a2a,
      emissiveIntensity: 0.55,
      roughness: 0.6,
    }),
  );
  cluster.position.set(0.37, 0.94, -0.52);
  cluster.rotation.x = -0.5;
  g.add(cluster);

  /* --- steering wheel --------------------------------------------------- */
  const wheel = new THREE.Group();
  wheel.position.set(0.37, 0.84, -0.44);
  wheel.rotation.x = -0.42;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.017, 8, 24), trim);
  wheel.add(rim);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.022, 0.016), trim);
    spoke.rotation.z = (i / 3) * Math.PI * 2 + Math.PI / 2;
    spoke.position.set(Math.cos(spoke.rotation.z) * 0.08, Math.sin(spoke.rotation.z) * 0.08, 0);
    wheel.add(spoke);
  }
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), trim);
  boss.rotation.x = Math.PI / 2;
  wheel.add(boss);
  g.add(wheel);
  g.userData.wheel = wheel;

  /* --- seats ------------------------------------------------------------ */
  /*
   * Seat height is the number everything else in this cabin depends on.
   *
   * A car seat cushion is about 30 cm above the floor pan, which with this
   * cabin's floor at 0.29 puts its top at about 0.6. The first version had it
   * at 0.44 and then seated both characters at a root height that put their
   * HIPS at 1.23 and their heads at 1.83 - they were standing on the seats with
   * their legs folded, and every shot in the scene was aimed at a lap.
   */
  for (const x of [-0.37, 0.37]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, 0.54), seatMat);
    base.position.set(x, SEAT - 0.07, 0.2);
    g.add(base);
    /*
     * A low back, and NO HEAD RESTRAINT.
     *
     * Correct for 1959 - head restraints were not fitted until the late
     * sixties - and it is also what the two-shot needs. The restraints sat at
     * exactly the height of both their heads, caught the full force of the dash
     * glow, and put a pale lit slab directly behind each face. Two people in a
     * dark car should have darkness behind them.
     */
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.62, 0.13), seatMat);
    back.position.set(x, SEAT + 0.3, 0.48);
    back.rotation.x = 0.13;
    g.add(back);
  }

  /* --- roof, pillars, doors -------------------------------------------- */
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 2.0), trim);
  roof.position.set(0, 1.45, 0.34);
  g.add(roof);

  // The windscreen aperture is defined by its frame: a header rail and two
  // raked A-pillars. Those three pieces are what make a shot read as "inside a
  // car" from any angle.
  const header = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.09, 0.12), body);
  header.position.set(0, 1.42, -0.66);
  g.add(header);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.78, 0.1), body);
    pillar.position.set(side * 0.86, 1.08, -0.7);
    pillar.rotation.x = 0.36;
    g.add(pillar);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 1.5), trim);
    door.position.set(side * 0.88, 0.72, 0.26);
    g.add(door);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 1.5), body);
    sill.position.set(side * 0.88, 1.04, 0.26);
    g.add(sill);
  }

  /* --- glass ------------------------------------------------------------ */
  /*
   * The windscreen is where the rain lives.
   *
   * An alpha-mapped plane with the droplet texture, scrolled upward: the
   * droplets run UP a windscreen at speed, not down. It is drawn after
   * everything else and writes no depth, so it tints the road without clipping
   * the dashboard.
   */
  glassTex = textures.rainGlass().clone();
  glassTex.wrapS = glassTex.wrapT = THREE.RepeatWrapping;
  glassTex.repeat.set(2.2, 1.6);
  glassTex.needsUpdate = true;

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.74, 0.82),
    new THREE.MeshBasicMaterial({
      color: 0x9fb4c4,
      alphaMap: glassTex,
      transparent: true,
      opacity: 0.33,
      depthWrite: false,
      fog: false,
    }),
  );
  screen.position.set(0, 1.08, -0.78);
  screen.rotation.x = 0.36;
  screen.renderOrder = 10;
  g.add(screen);
  g.userData.screen = screen;

  /* --- wipers ----------------------------------------------------------- */
  const wipers = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.42, 0.74, -0.96);
    arm.rotation.x = 0.36;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.5, 0.016), mat.cloth(0x0a0a0c, 0.7));
    blade.position.y = 0.25;
    arm.add(blade);
    g.add(arm);
    wipers.push({ arm, side });
  }
  g.userData.wipers = wipers;

  /* --- rear-view mirror ------------------------------------------------- */
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.03), mat.mirror());
  mirror.position.set(0, 1.33, -0.6);
  mirror.rotation.x = 0.1;
  g.add(mirror);
  g.userData.mirror = mirror;

  return g;
}

/**
 * The real car, wrapped around the built interior.
 *
 * THESE TWO THINGS DO DIFFERENT JOBS and the scene needs both. The model is a
 * 1959 DeSoto - rust, chrome, a cracked windscreen, the whole car - and it has
 * no interior worth sitting in. The built cabin above has a dash, a cluster
 * that glows, seats, a wheel that turns and wipers that sweep, and from outside
 * it is a pile of boxes. So the model goes round the outside of the cabin and
 * each is seen only from the side it is good from.
 *
 * It works because of BACK-FACE CULLING, which is normally a performance
 * detail and here is the whole trick: from inside the car, every polygon of the
 * shell is facing away from the camera and is simply not drawn. The interior
 * shots see the built cabin and the road, exactly as they did before this
 * existed. Step outside for the establishing shot and the shell is solid.
 *
 * The one piece that is NOT culled is the glass, which is double-sided and
 * transparent and would hang in the middle of every interior shot, so it is
 * dropped: the cabin has its own windscreen with rain running up it.
 */
function addShell(car) {
  const model = models.instance("car");
  if (!model) return null;

  /*
   * The shell faces the other way.
   *
   * Everything models.js hands out faces +Z, which for a character is correct
   * and for this car is backwards: the cabin is built with its windscreen at
   * negative Z, so the car's forward is -Z and the scene drives that way.
   */
  model.root.rotation.y = Math.PI;

  /*
   * Where the ground is, relative to the cabin.
   *
   * The wheels sit on the road, which is y = 0 in the cabin's own space, and
   * the shell is scaled in the manifest so its roof clears the built one. The z
   * offset puts the model's passenger compartment over the built cabin rather
   * than over the boot - on a car of this period most of the length is bonnet,
   * so the people sit a long way back.
   */
  model.root.position.set(0, 0, 0.42);

  model.root.traverse((n) => {
    if (!n.isMesh) return;
    // The windscreen and side glass. Transparent, double-sided, and directly
    // in front of the camera for every interior shot.
    const name = (n.material?.name ?? "") + " " + n.name;
    if (/33|glass/i.test(name)) {
      n.visible = false;
      return;
    }
    n.castShadow = false;
    n.receiveShadow = false;
    n.material.side = THREE.FrontSide;
    // A car in a rainstorm at night is not showroom paint.
    if (n.material.roughness !== undefined) n.material.roughness = Math.min(1, n.material.roughness + 0.25);
  });

  car.add(model.root);
  car.userData.shell = model.root;
  return model.root;
}

/**
 * The lighting rig.
 *
 * Four sources and no more. Every one of them is doing a specific job and the
 * scene would be measurably worse without any of them - which is the test a
 * light has to pass before it is allowed into a scene this dark.
 */
function buildLights(car, root) {
  const q = getPlatform().settings;

  // 1. Ambient: almost nothing, and blue. Night is not black, it is very dark
  //    blue, and a true-black ambient makes everything outside the headlights
  //    vanish rather than lurk.
  const ambient = new THREE.HemisphereLight(0x1b2430, 0x05070a, 0.5);
  root.add(ambient);

  /*
   * 2. The road light.
   *
   * TWO SPOTS, HUNG WELL ABOVE THE CAR AND AIMED DOWN AT THE ROAD - which is a
   * lie, and is the only way this works.
   *
   * A real headlight sits 60 cm off the ground and therefore GRAZES the tarmac:
   * the angle between the beam and the road surface is about three degrees at
   * ten metres, so N dot L is 0.06 and the diffuse response of the road is
   * essentially zero. Real roads look lit anyway because a real headlight is
   * thousands of candela and real aggregate is partly retroreflective, and
   * neither of those is available here - the first pass put the lights at bumper
   * height, physically correctly, and the road came back black at every
   * distance the camera could see.
   *
   * Hanging them at 2.8 m and aiming down puts N dot L between 0.35 near and
   * 0.12 far, which is a usable gradient. Lights are not drawn, so the source
   * being above the roof is invisible; the two additive cones below are what the
   * player actually reads as headlights, and those stay at bumper height.
   */
  const beams = [];
  for (const side of [-1, 1]) {
    const spot = new THREE.SpotLight(0xfff0d0, 26, 85, 0.44, 0.82, 0.35);
    spot.position.set(side * 0.6, 2.8, -1.6);
    spot.target.position.set(side * 1.5, 0, -26);
    // No shadow: there is nothing in front of the car to cast one, and an 85 m
    // spot shadow map would be the most expensive thing in the scene by far.
    spot.castShadow = false;
    car.add(spot);
    car.add(spot.target);

    // The visible beam, at the height a headlight actually is. A long additive
    // cone - this is what makes fog look like fog rather than a grey filter.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 30, 10, 1, true),
      mat.beam(0xffeccb, 0.05),
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.set(side * 0.62, 0.6, -16);
    cone.renderOrder = 8;
    car.add(cone);
    beams.push({ spot, cone });
  }

  // 2b. The spread. One wide, weak spot covering the first fifteen metres,
  //     which is the part of a real beam pattern that comes off the lens rather
  //     than the reflector. Without it the road has two bright stripes on it
  //     and nothing between them.
  const spread = new THREE.SpotLight(0xffe8c4, 9, 26, 0.8, 0.92, 0.5);
  spread.position.set(0, 2.2, -1.9);
  spread.target.position.set(0, 0, -8);
  spread.castShadow = false;
  car.add(spread);
  car.add(spread.target);

  // 3. The dash glow. The reason the faces are visible, and the whole look of
  //    the scene. Amber, weak, and very close - inverse-square does the rest.
  /*
   * The dash glow, and it is the KEY LIGHT on both faces.
   *
   * At 0.9 candela it was doing nothing: the two of them sat in a black cabin
   * and the scene was a conversation between two silhouettes. An instrument
   * cluster at night genuinely does light a face from below - that is the whole
   * look - so it is allowed to be the brightest thing inside the car.
   */
  /*
   * Warm, but not sodium.
   *
   * At 3.4 candela and a saturated amber, a face half a metre away came back
   * fluorescent orange - the light was correct for the room and far too strong
   * for a close-up. Backing off and desaturating keeps the under-lighting that
   * makes the look and stops the skin cooking.
   */
  const dashGlow = new THREE.PointLight(0xffc9a0, 2.0, 2.8, 2);
  dashGlow.position.set(0.0, 1.0, -0.5);
  dashGlow.castShadow = false;
  car.add(dashGlow);

  /*
   * And a cold wash through the windscreen.
   *
   * Lighting a face from below and nowhere else gives a Halloween torch
   * effect - it is a cliche because it works, and a cliche because it is all
   * anybody does. The headlights bounce off the road and come back up through
   * the glass, which in a real car is a weak, cold, broad light on the upper
   * half of the face. Adding it is what makes the two of them look like people
   * in a car rather than people holding a candle.
   */
  /*
   * Moonlight, and it exists for exactly one shot.
   *
   * The opening is outside the car, and without this the car is a black shape
   * against black fog - the player cannot see that it is a car, let alone that
   * it is a rusted-out thing from 1959, which is most of what that shot is for.
   * It comes from high and behind so it rims the roof and the wing line and
   * leaves the body in shadow, which is how a car looks on a wet road at night
   * and not how a car looks in a showroom.
   */
  const moon = new THREE.DirectionalLight(0x8ea8c8, 3.1);
  moon.position.set(-9, 11, 7);
  moon.target.position.set(0, 0.7, 0);
  root.add(moon);
  root.add(moon.target);

  const bounce = new THREE.DirectionalLight(0xa8c0d8, 0.85);
  bounce.position.set(0, 2.4, -4);
  bounce.target.position.set(0, 1.25, 0.2);
  car.add(bounce);
  car.add(bounce.target);

  // 4. A cold fill from behind, standing in for streetlight and sky. Without it
  //    the backs of their heads are pure black and both of them read as a face
  //    floating in a cabin.
  const fill = new THREE.DirectionalLight(0x4e6b8c, 0.55);
  fill.position.set(-2, 3, 4);
  fill.castShadow = q.shadows;
  if (fill.castShadow) {
    fill.shadow.mapSize.set(Math.min(1024, q.shadowMapSize), Math.min(1024, q.shadowMapSize));
    fill.shadow.camera.near = 0.5;
    fill.shadow.camera.far = 8;
    fill.shadow.camera.left = -2;
    fill.shadow.camera.right = 2;
    fill.shadow.camera.top = 2;
    fill.shadow.camera.bottom = -2;
    fill.shadow.bias = -0.0015;
  }
  root.add(fill);

  // Lightning. One directional light at zero intensity, flashed by `tick`.
  const bolt = new THREE.DirectionalLight(0xdce8ff, 0);
  bolt.position.set(-8, 10, -6);
  root.add(bolt);

  return { ambient, beams, dashGlow, fill, bolt };
}

/**
 * Rain, as line segments.
 *
 * Points would be cheaper and look like snow. Rain is a STREAK - the eye reads
 * the length of the streak as the speed of the drop - so each drop is a two
 * vertex segment, and there is exactly one draw call for all of them.
 */
function buildRain(count) {
  const positions = new Float32Array(count * 6);
  const drops = [];
  const rng = makeRng(1234);

  /*
   * Nothing closer than four metres.
   *
   * The drop volume used to start at the origin, which is where the camera is -
   * so every frame had a handful of raindrops rendered twenty centimetres from
   * the lens, each one filling a quarter of the screen. They read as white
   * bones falling past the windscreen, and they were the first thing anybody
   * noticed about the scene.
   *
   * Rain that close is also not needed: the windscreen has its own droplet
   * layer for the near field, which is what a driver actually sees.
   */
  const NEAR = 4;
  const spawn = (d) => {
    do {
      d.x = (rng() - 0.5) * 26;
      d.z = -rng() * 44;
    } while (Math.abs(d.x) < NEAR && d.z > -NEAR);
    return d;
  };

  for (let i = 0; i < count; i++) {
    drops.push(spawn({
      x: 0,
      y: rng() * 12,
      z: 0,
      // Length varies, so the rain has depth rather than reading as a grid.
      // Longer and thinner than the first pass, which at 0.3 m produced short
      // bright dashes that read as snow.
      len: 0.55 + rng() * 1.3,
      speed: 16 + rng() * 11,
    }));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  /*
   * Faint on purpose.
   *
   * Rain is only visible where something lights it, and in this scene that is
   * the headlight cones and nothing else. At 0.32 every drop in the box was
   * equally bright including the ones behind the camera's own fog, and the
   * result read as a snowstorm on black. A third of that, fogged, leaves the
   * drops in the beam and loses the rest.
   */
  const material = new THREE.LineBasicMaterial({
    color: 0x8fa6bc,
    transparent: true,
    opacity: 0.12,
    fog: true,
  });
  const object = new THREE.LineSegments(geo, material);
  object.frustumCulled = false;
  return { object, drops, positions, attr: geo.attributes.position };
}

/**
 * The mass on the road.
 *
 * A cluster of dark smoke billboards, low and wide, that sits waiting at a
 * fixed point in the world while the road scrolls toward it. It is NOT the
 * wraith - the wraith is inside it, revealed for about a second as the car
 * reaches it, and then both are gone. Showing the figure for any longer would
 * answer the question the rest of the game is built on.
 */
function buildSmokeMass() {
  const group = new THREE.Group();
  group.visible = false;
  const material = mat.smoke(0x04050a, 0.9).clone();
  material.opacity = 0;

  const plane = new THREE.PlaneGeometry(1, 1);
  const rng = makeRng(31337);
  const puffs = [];
  const count = getPlatform().settings.propDetail <= 0 ? 10 : 20;

  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(plane, material);
    const spread = 3.2;
    m.position.set(
      (rng() - 0.5) * spread * 2,
      0.3 + rng() * 2.8,
      (rng() - 0.5) * 2.4,
    );
    m.scale.setScalar(1.6 + rng() * 2.6);
    m.rotation.z = rng() * Math.PI * 2;
    m.renderOrder = 5;
    group.add(m);
    puffs.push({ mesh: m, base: m.position.clone(), phase: rng() * 50, rate: 0.3 + rng() * 0.5 });
  }

  return { group, material, puffs };
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

const _lookPoint = new THREE.Vector3();

export function tick(dt) {
  if (!S.active || !scene) return;
  S.time += dt;

  S.speed = damp(S.speed, S.wantSpeed, 2.2, dt);
  const travel = S.speed * dt;

  /* --- road and dashes -------------------------------------------------- */
  const maps = world.userData.roadMaps;
  for (const key in maps) {
    // Scrolling the V offset is the motion. The repeat is 42, so one unit of
    // offset is 42 texture lengths - hence the division.
    maps[key].offset.y -= travel / (ROAD_LEN / 42);
  }
  const dashes = world.userData.dashes;
  dashes.position.z += travel;
  // Wrap on the dash spacing, so the line never jumps mid-dash.
  if (dashes.position.z > 6) dashes.position.z -= 6;

  /* --- trees ------------------------------------------------------------ */
  for (const tree of trees) {
    tree.position.z += travel;
    // Recycled to the far end once they are behind the camera. The player never
    // sees the same tree twice because they never see one for long enough.
    if (tree.position.z > 12) tree.position.z -= (trees.length / 2) * TREE_SPACING;
  }

  /* --- rain ------------------------------------------------------------- */
  if (rain) {
    const p = rain.positions;
    for (let i = 0; i < rain.drops.length; i++) {
      const d = rain.drops[i];
      d.y -= d.speed * dt;
      // Rain falls down and the world moves back, so relative to the car the
      // drops also travel forward - which is what makes them streak diagonally
      // through the headlights.
      d.z += travel * 0.72;
      if (d.y < -1) {
        d.y = 11 + Math.random() * 3;
        // Respawned outside the cabin for the same reason it was spawned there.
        do {
          d.x = (Math.random() - 0.5) * 26;
          d.z = -Math.random() * 44;
        } while (Math.abs(d.x) < 4 && d.z > -4);
      }
      if (d.z > 10) d.z -= 44;

      const o = i * 6;
      p[o] = d.x;
      p[o + 1] = d.y;
      p[o + 2] = d.z;
      // The streak leans with the car's speed: straight down when stopped,
      // raked back at speed. One line of arithmetic, and it is the difference
      // between rain and a static curtain.
      p[o + 3] = d.x;
      p[o + 4] = d.y - d.len;
      p[o + 5] = d.z - d.len * (S.speed / 13) * 1.6;
    }
    rain.attr.needsUpdate = true;
  }

  /* --- windscreen ------------------------------------------------------- */
  if (glassTex) {
    // Droplets run UP the screen at speed. The rate is tied to road speed, so
    // the glass calms down as the car slows.
    glassTex.offset.y += dt * (0.05 + S.speed * 0.012);
    glassTex.offset.x = Math.sin(S.time * 0.3) * 0.01;
  }

  /* --- wipers ----------------------------------------------------------- */
  if (S.wiperOn) {
    const prev = S.wiper;
    S.wiper += dt * 0.62;
    const sweep = Math.sin(S.wiper * Math.PI * 2);
    for (const w of cabin.userData.wipers) {
      w.arm.rotation.z = w.side * (0.1 + (sweep * 0.5 + 0.5) * 1.05);
    }
    // One scrape per sweep, at the top of the arc.
    if (Math.floor(prev * 2) !== Math.floor(S.wiper * 2)) audio.play("wiper", { gain: 0.7 });
  }

  /* --- lightning -------------------------------------------------------- */
  S.nextFlash -= dt;
  if (S.nextFlash <= 0) {
    S.nextFlash = 9 + Math.random() * 14;
    S.flash = 1;
    audio.play("thunder", { gain: 0.8 });
  }
  if (S.flash > 0) {
    // Two-stage decay: a bright strike, a dip, then a second weaker one. A
    // single decaying flash reads as a lamp being switched; real lightning
    // stutters.
    S.flash = Math.max(0, S.flash - dt * 3.4);
    const stutter = S.flash > 0.72 ? 1 : S.flash > 0.6 ? 0.25 : 1;
    lights.bolt.intensity = S.flash * S.flash * 5.5 * stutter;
  }

  /* --- the mass on the road -------------------------------------------- */
  if (S.smokeApproach >= 0) {
    S.smokeApproach += dt;
    const g = smokeMass.group;
    g.visible = true;
    // It sits 34 m out and the road brings it in. The approach is therefore in
    // world units, not in time, so it arrives when the car reaches it however
    // long the dialogue took.
    g.position.z += travel;
    smokeMass.material.opacity = clamp01(S.smokeApproach * 0.8) * 0.92;

    for (const puff of smokeMass.puffs) {
      const t = S.time * puff.rate + puff.phase;
      // Churning hard: this is the one thing in the scene that is not blowing
      // past in the wind, and it has to look like it is moving under its own
      // power.
      puff.mesh.position.x = puff.base.x + noise1(t) * 0.9;
      puff.mesh.position.y = puff.base.y + noise1(t * 0.8 + 13) * 0.5;
      puff.mesh.rotation.z += dt * 0.3;
    }

    if (wraith) {
      wraith.root.position.z = g.position.z + 0.5;
      wraith.update(dt, director.camera);
    }
  }

  /* --- the people ------------------------------------------------------- */
  const speaker = dialogue.currentSpeaker();
  const emo = dialogue.currentLine()?.emo ?? "calm";

  him.update(dt, {
    talking: speaker === "him",
    emotion: speaker === "him" ? emo : "calm",
    breathRate: 0.24,
    lookAt: S.himLook,
    pose: "driving",
  });
  her.update(dt, {
    talking: speaker === "her",
    emotion: speaker === "her" ? emo : "worried",
    breathRate: 0.3,
    lookAt: S.herLook,
    pose: "passenger",
  });

  // His hands stay on the wheel, so the wheel moves with the road instead of
  // being a prop he happens to be near. Tiny corrections, on noise.
  cabin.userData.wheel.rotation.z = noise1(S.time * 0.5) * 0.09;
}

/* -------------------------------------------------------------------------- *
 * The sequence
 * -------------------------------------------------------------------------- */

/**
 * Shots.
 *
 * Authored as one list and played against the dialogue, rather than one shot
 * per line: a cut on every line is television, and the point of a 60-second
 * opening is that it breathes. Every vector is LOCAL TO THE CABIN - see
 * `space` - so the car can be moved or rotated and every shot still holds.
 */
function shotList() {
  return [
    /*
     * 1. THE CAR. Outside, three-quarters from behind, in the fog.
     *
     * This shot did not exist, and its absence was the first thing anybody
     * noticed about the scene: the opening of a film about two people driving
     * at night has to SHOW THE CAR. Without it the game cuts straight to the
     * inside of a dark box and the player has no idea what they are looking at
     * - no idea it is a car, how old it is, or that it is the only lit thing
     * for miles.
     *
     * It is also the only shot in the scene with no `space`, which is to say
     * the only one in world coordinates. The car sits at the origin and the
     * world scrolls past it, so a fixed camera out here watches the trees come
     * on while the car never actually moves - which is exactly the shot.
     */
    {
      pos: [-3.5, 1.5, 3.4], to: [-3.1, 1.42, 2.6],
      look: [0.1, 0.85, -0.3], lookTo: [0.1, 0.9, -0.6],
      fov: 40, dur: 8, hold: 0.4, ease: "sineInOut", handheld: 0.6,
    },

    /*
     * 2. THE DASHCAM TWO-SHOT. Both of them, from the mirror, looking back.
     *
     * Every shot in the first version was taken from BEHIND the seats, because
     * that is where a camera goes in a car in real life. In a modelled cabin it
     * means the lower half of every frame is the back of a seat and the people
     * are two dark shapes beyond it.
     *
     * Putting the camera where the rear-view mirror is and turning it round
     * solves all of it at once: both faces, lit from below by the cluster and
     * from in front by the bounce, with the back window and the dark road
     * behind them. The lens is WIDE because it has to be - they are sitting
     * three quarters of a metre apart and the mirror is barely a metre from
     * either of them, and a normal lens at that range holds one face, not two.
     */
    {
      space: cabin,
      pos: [0.0, EYE + 0.1, -0.62], to: [0.02, EYE + 0.09, -0.56],
      look: [0.0, EYE + 0.02, 0.2], lookTo: [0.0, EYE + 0.01, 0.18],
      fov: 54, dur: 10, hold: 0.8, ease: "sineInOut", handheld: 1.1,
    },

    // 3. Her, close, three-quarters. The dash is under her chin and the
    //    windscreen behind her shoulder.
    {
      space: cabin,
      pos: [-0.08, EYE + 0.08, -0.44], to: [-0.12, EYE + 0.07, -0.38],
      look: [-0.37, EYE - 0.06, 0.12], lookTo: [-0.37, EYE - 0.07, 0.1],
      fov: 44, dur: 10, hold: 0.5, ease: "sineInOut", handheld: 1.3,
    },

    // 4. The road, from his eye line. The only interior shot that looks out,
    //    and it is here so the fog has been established before anything is in
    //    it.
    {
      space: cabin,
      pos: [0.37, EYE + 0.02, -0.26], to: [0.37, EYE + 0.03, -0.34],
      look: [0.14, 0.5, -16], lookTo: [0.04, 0.42, -22],
      fov: 50, dur: 9, hold: 0.8, ease: "sineInOut", handheld: 0.7,
    },

    // 5. Him, close, from the passenger side - which is to say from where she
    //    is sitting. The one shot in the scene taken from her point of view.
    {
      space: cabin,
      pos: [0.08, EYE + 0.08, -0.4], to: [0.14, EYE + 0.07, -0.44],
      look: [0.37, EYE - 0.06, 0.12], lookTo: [0.37, EYE - 0.07, 0.1],
      fov: 44, dur: 10, hold: 0.5, ease: "sineInOut", handheld: 1.2,
    },

    // 6. Back to the two-shot, pulling back, and held for the rest of the
    //    scene. The smoke arrives in this one, so both of their faces are in
    //    frame when it does - which is the only reason the beat works.
    {
      space: cabin,
      pos: [0.02, EYE + 0.09, -0.58], to: [0.0, EYE + 0.12, -0.74],
      look: [0.0, EYE + 0.01, 0.2], lookTo: [0.0, EYE - 0.02, 0.26],
      fov: 54, fovTo: 60, dur: 18, hold: 0, ease: "sineInOut", handheld: 0.9,
    },
  ];
}

/** Cues the script fires, and what the scene does about each. */
function onCue(cue) {
  switch (cue) {
    case "wipers":
      S.wiperOn = true;
      break;

    case "lookAtHer":
      // He glances across. She is already looking at him, which is the point of
      // the beat: she has been watching him for a while.
      _lookPoint.set(0, 0, 0);
      her.parts.head.getWorldPosition(_lookPoint);
      S.himLook = _lookPoint.clone();
      break;

    case "roadAhead":
      // Eyes back on the road. A driver who talks to his passenger for a whole
      // conversation without looking forward is a driver nobody believes in.
      S.himLook = null;
      break;

    case "sheLooksOut":
      S.herLook = null;
      break;

    case "treesPass":
      him.parts.head.getWorldPosition(_lookPoint);
      S.herLook = _lookPoint.clone();
      break;

    /* --- the mass ----------------------------------------------------- */
    case "smoke":
      S.smokeApproach = 0;
      smokeMass.group.position.z = -32;
      wraith.appear(0.55);
      // The glitch is small here. It is the first time the game shows the
      // player that the picture itself is not reliable, and the second time
      // (at the impact) has to be bigger.
      cinema.glitch(0.35, 0.6);
      audio.play("glitchZap", { gain: 0.5 });
      emit(EV.HORROR, { kind: "smoke" });
      break;

    case "swerve":
      // Brakes and a swerve. The lift is audible before it is visible.
      S.wantSpeed = 4;
      audio.engineRpm(0.2, 0.5);
      director.addTrauma(0.5);
      break;

    default:
      break;
  }
}

/**
 * Play the scene. Resolves when the screen is black and the car is gone.
 *
 * The caller owns what happens next: this module knows nothing about the room,
 * the story state or what the player wakes up to.
 */
export async function play() {
  if (!scene) build();

  S.active = true;
  S.time = 0;
  S.speed = S.wantSpeed = 13;
  S.smokeApproach = -1;
  S.himLook = S.herLook = null;
  S.flash = 0;
  S.nextFlash = 7;
  smokeMass.group.visible = false;
  smokeMass.material.opacity = 0;
  wraith.vanish();

  emit(EV.CUTSCENE_START, { id: "CAR_SCENE" });

  director.takeOver(scene);
  // The first shot is in place before the fade lifts, so the scene does not
  // open on a camera already moving.
  director.play([shotList()[0]]);

  cinema.letterbox(true, 1.4);
  cinema.skipHint(true);

  audio.bed("rain", 1, 2.5);
  audio.bed("engine", 1, 2);
  audio.bed("tyres", 1, 2);
  audio.engineRpm(0.55, 2);

  await cinema.fade(0, 2.2);

  /*
   * Camera and dialogue run in PARALLEL and the scene waits for both.
   *
   * They are deliberately not locked to each other. The shots are timed to the
   * conversation's rhythm but if the speech engine is slow - or absent, and the
   * subtitles are running on estimates - the cuts still land where they were
   * authored, and the scene ends when the slower of the two finishes. Driving
   * the cuts off the dialogue index instead would make every shot length depend
   * on how fast the player's browser can say a sentence.
   */
  await Promise.all([
    director.play(shotList()),
    dialogue.play(CAR_SCRIPT, { id: "CAR_SCENE", onCue }),
  ]);

  /* --- the impact ------------------------------------------------------- */
  await impact();

  S.active = false;
  emit(EV.CUTSCENE_END, { id: "CAR_SCENE" });
}

/**
 * Hitting the thing on the road.
 *
 * Nothing is hit. The car passes through it, the picture fails for a quarter of
 * a second, and the scene ends - and NOT showing the collision is the entire
 * reason the player spends the next twenty minutes wanting to know what
 * happened. A crash would answer the question.
 */
async function impact() {
  // One frame of the figure, at full strength, as it arrives at the windscreen.
  wraith.appear(1);
  wraith.fury(1);
  wraith.reach(true);

  audio.play("crashImpact");
  audio.stopRumble();
  director.addTrauma(1.4);
  cinema.glitch(1, 0.9);

  // The beds are cut dead rather than faded. The sudden absence of the rain and
  // the engine is louder than the impact itself.
  audio.bedsOff(0.08);

  await new Promise((r) => window.setTimeout(r, 220));

  // Hard cut to black, mid-glitch. No fade: a fade is gentle and this is not.
  cinema.cut(1);
  cinema.glitchHold(0);
  cinema.clearSay();

  S.wantSpeed = 0;
  S.speed = 0;

  await new Promise((r) => window.setTimeout(r, 900));
}

/* -------------------------------------------------------------------------- *
 * Teardown
 * -------------------------------------------------------------------------- */

/**
 * Release the scene.
 *
 * The characters are NOT disposed: they are cached in characters/human.js and
 * the flashback needs the same two people, so they are only detached. Disposing
 * them here would mean the flashback rebuilt them - and a rebuilt character is
 * a character that might not match, which the brief explicitly forbids.
 */
export function dispose() {
  if (!scene) return;
  S.active = false;

  if (him?.root.parent) him.root.parent.remove(him.root);
  if (her?.root.parent) her.root.parent.remove(her.root);

  wraith?.dispose();
  glassTex?.dispose();
  smokeMass?.material.dispose();

  scene.traverse((node) => {
    if (!node.isMesh && !node.isLineSegments) return;
    // Shared geometry and library materials must survive: see props/geom.js
    // SHARED and engine/materials.js. Only what this scene made is released.
    if (node.geometry && !node.geometry.userData?.shared) node.geometry.dispose();
  });

  for (const key in world.userData.roadMaps ?? {}) {
    world.userData.roadMaps[key].dispose();
  }

  scene = world = cabin = lights = rain = smokeMass = wraith = null;
  trees = [];
  glassTex = null;
}
