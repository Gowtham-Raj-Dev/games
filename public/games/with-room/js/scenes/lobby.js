/**
 * THE LOBBY.
 *
 * What the title screen became. The old one was the menu laid over a slowly
 * drifting view of the empty cell, which was atmospheric and said nothing - a
 * player arriving at it had no idea what the game contained.
 *
 * This is the cast, standing in the dark, looking at you: the husband, the
 * wife, and the thing between them. The menu is a column down the left and the
 * three of them fill the rest of the frame. It is the first thing anybody sees
 * and its whole job is to make the game legible in one glance - two people, and
 * something that should not be standing with them.
 *
 * THE LIGHTING IS THE WHOLE SCENE and it is three sources, in this order of
 * importance:
 *
 *   THE LANTERN   on the ground, front right, warm and weak. It is the only
 *                 motivated light, it flickers, and it lights all three of them
 *                 from BELOW - which is the single most reliable way to make a
 *                 face unsettling, and the reason this reads as horror rather
 *                 than as a character select screen.
 *   THE MOON      cold, high, behind and to the left. It is a rim: it separates
 *                 them from the trees without putting any light on their faces.
 *   THE FILL      a hemisphere so dim it is almost an admission. Without it the
 *                 shadow side of everything is pure black and the figures lose
 *                 their volume entirely.
 *
 * Nothing in here is interactive. The menu is DOM, over the top, and the scene
 * only has to hold still and look like somewhere.
 */

import * as THREE from "three";

import { clamp01, damp, lerp, makeRng, noise1 } from "../core/maths.js";
import { get as getPlatform } from "../core/platform.js";
import { mat } from "../engine/materials.js";
import * as textures from "../engine/textures.js";
import * as renderer from "../engine/renderer.js";
import * as human from "../characters/human.js";
import * as wraithFactory from "../characters/wraith.js";
import * as models from "../characters/models.js";
import * as director from "../story/director.js";

let scene = null;
let lights = null;
let lantern = null;
let him = null;
let her = null;
let wraith = null;
let ghost = null;   // the ghost MODEL, when there is one
let fog = null;

const S = {
  active: false,
  time: 0,
  /** Which of the three the camera is nearest to, for the small head turns. */
  look: new THREE.Vector3(0, 1.5, 4),
};

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

export function build() {
  if (scene) return scene;
  const q = getPlatform().settings;
  const rng = makeRng(24601);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  /*
   * Fog that starts almost at the camera.
   *
   * Six metres to full occlusion is aggressive, and it is doing two jobs: it
   * hides the fact that there is almost nothing in this scene, and it puts a
   * visible depth between the three figures and the trees, so they read as
   * standing IN something rather than in front of a backdrop.
   */
  fog = new THREE.Fog(0x06080e, 1.5, 22);
  scene.fog = fog;

  /* --- ground ------------------------------------------------------------ */
  /*
   * SUBDIVIDED, and sitting a centimetre and a half low.
   *
   * It was a single 60-metre quad at exactly y = 0, which is two problems in
   * one mesh. The first is coplanarity: every character stands with their soles
   * at y = 0 too, so the feet and the ground fight for the same depth values.
   * The second is worse and is why the wife spent several builds as a floating
   * head - a quad that large, seen almost edge-on, is interpolated across four
   * vertices that are tens of metres away in every direction, and the depth it
   * writes near the horizon is not the depth of the ground anywhere near the
   * camera. It won the depth test against anything standing beyond about four
   * metres and simply painted over her from the collarbone down.
   *
   * Subdividing gives the rasteriser vertices near the thing it is drawing, and
   * dropping the plane 15mm takes the feet out of the fight. Neither costs
   * anything: it is sixty-four triangles on a title screen.
   */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60, 24, 24),
    new THREE.MeshStandardMaterial({
      map: textures.asphalt().map,
      roughnessMap: textures.asphalt().roughnessMap,
      color: 0x24231e,
      roughness: 1,
      metalness: 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.015;
  ground.receiveShadow = q.shadows;
  scene.add(ground);

  /* --- trees -------------------------------------------------------------- *
   * Bare, and only ever a silhouette. Placed in an arc BEHIND the cast and
   * nowhere else, because the camera never moves and anything outside that arc
   * would never be seen.
   */
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.22, 8, q.propDetail <= 0 ? 4 : 6);
  const branchGeo = new THREE.CylinderGeometry(0.02, 0.06, 2.4, 4);
  const barkMat = mat.cloth(0x0c0e0c, 1);
  const trees = q.propDetail <= 0 ? 7 : 14;
  for (let i = 0; i < trees; i++) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.position.y = 4;
    tree.add(trunk);
    for (let b = 0; b < 3; b++) {
      const branch = new THREE.Mesh(branchGeo, barkMat);
      branch.position.y = 4.6 + b * 0.9;
      branch.rotation.z = (rng() - 0.5) * 1.7;
      branch.rotation.y = rng() * Math.PI;
      tree.add(branch);
    }
    const a = lerp(-1.5, 1.5, i / (trees - 1)) + (rng() - 0.5) * 0.2;
    const r = 7 + rng() * 7;
    tree.position.set(Math.sin(a) * r, 0, -Math.abs(Math.cos(a)) * r - 2);
    tree.scale.setScalar(0.7 + rng() * 0.7);
    scene.add(tree);
  }

  /* --- a fence, and a sign ----------------------------------------------- *
   * Two pieces of set dressing, both on the right, both behind the cast. They
   * exist to give the fog something to eat and to stop the right half of the
   * frame being empty once the menu takes the left.
   */
  /*
   * Pushed back and out of the way.
   *
   * It used to start at x = 5.3 and z = -3.4, which put the first two posts
   * directly behind the wife - pale wood, lit, at head height, growing out of
   * her shoulders. Set dressing is allowed to be in the frame and is not
   * allowed to be in a face.
   */
  const woodMat = mat.woodPale();
  for (let i = 0; i < 5; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), woodMat);
    post.position.set(6.4 + i * 1.3, 0.55, -5.2 - i * 0.5);
    post.rotation.z = (rng() - 0.5) * 0.12;
    post.castShadow = q.shadows;
    scene.add(post);
    if (i < 4) {
      for (const y of [0.75, 0.42]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.07, 0.05), woodMat);
        rail.position.set(7.05 + i * 1.3, y, -5.45 - i * 0.5);
        rail.rotation.y = 0.36;
        scene.add(rail);
      }
    }
  }

  /* --- the lantern -------------------------------------------------------- *
   * On the ground, front right, between the camera and the cast. It is the
   * reason their faces are lit from below.
   */
  lantern = new THREE.Group();
  lantern.position.set(2.75, 0, 1.75);
  scene.add(lantern);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 10), mat.iron());
  base.position.y = 0.025;
  lantern.add(base);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.2, 8, 1, true), mat.iron());
  cage.position.y = 0.15;
  lantern.add(cage);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.09, 8), mat.iron());
  top.position.y = 0.3;
  lantern.add(top);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.007, 5, 10, Math.PI), mat.iron());
  handle.position.y = 0.34;
  handle.rotation.y = Math.PI / 2;
  lantern.add(handle);

  // The flame: a small unlit sprite, so it is the brightest thing in frame and
  // stays that way whatever the exposure does.
  const flame = new THREE.Mesh(
    new THREE.PlaneGeometry(0.075, 0.1),
    mat.beam(0xffb760, 0.95),
  );
  flame.position.y = 0.15;
  flame.renderOrder = 6;
  lantern.add(flame);
  lantern.userData.flame = flame;

  /* --- lights ------------------------------------------------------------- */
  lights = {};

  /*
   * Brighter and with far more reach than the first pass.
   *
   * 6.5 candela over 9 metres with inverse-square falloff put about a tenth of
   * a lux on a face two metres away: the cast came out as three dark shapes.
   * This is a lantern in the dark, so it is allowed to be the brightest thing
   * in the scene by a long way.
   */
  lights.lantern = new THREE.PointLight(0xffb066, 15, 14, 2);
  lights.lantern.position.set(2.75, 0.18, 1.75);
  /*
   * The lantern does NOT cast shadows, and that is a fix rather than a saving.
   *
   * A point light casts into a cube shadow map, and this one sits a metre and a
   * half from three figures at ankle height - about the worst case there is for
   * shadow acne. The wife took the brunt of it: her head cleared the map and
   * everything below her collarbone self-shadowed into black, so the title
   * screen had a husband, a ghost, and a floating face. Nothing in this shot
   * casts a shadow worth the artefacts: there is no floor detail to receive
   * one, and the fog eats the ground at four metres.
   */
  lights.lantern.castShadow = false;
  if (lights.lantern.castShadow) {
    lights.lantern.shadow.mapSize.set(
      Math.min(1024, q.shadowMapSize),
      Math.min(1024, q.shadowMapSize),
    );
    lights.lantern.shadow.camera.near = 0.1;
    lights.lantern.shadow.camera.far = 10;
    lights.lantern.shadow.bias = -0.002;
  }
  scene.add(lights.lantern);

  lights.moon = new THREE.DirectionalLight(0x8fb0d8, 2.2);
  lights.moon.position.set(-7, 9, -6);
  scene.add(lights.moon);

  /*
   * The key on the faces, from the front and slightly left.
   *
   * Cold, so it never competes with the lantern for warmth, and strong enough
   * that there is something to look at. A horror lobby still has to SHOW the
   * thing it is frightening you with - the first pass was so under-lit that the
   * cast read as three dark lumps, which is not restraint, it is a bug.
   */
  lights.key = new THREE.DirectionalLight(0x9fb8d4, 2.8);
  lights.key.position.set(-1.5, 3.6, 7);
  lights.key.target.position.set(2.2, 1.1, 0);
  scene.add(lights.key);
  scene.add(lights.key.target);

  // And a weak wrap from the right, so the side away from the key is not a
  // silhouette and the three of them do not merge into one mass.
  lights.fill = new THREE.DirectionalLight(0x5c7390, 1.4);
  lights.fill.position.set(7, 3, 4);
  scene.add(lights.fill);

  /*
   * A rim from behind and to the right.
   *
   * Three figures lit only from the front merge into one silhouette against a
   * black wood, and the eye reads the group as a single shape. An edge light
   * behind them separates each one from the next and from the dark - it is the
   * oldest trick in portrait lighting and it is the single cheapest thing that
   * can be done for this screen.
   */
  lights.rim = new THREE.DirectionalLight(0xbcd0e8, 1.3);
  lights.rim.position.set(6, 4.5, -6);
  lights.rim.target.position.set(2.2, 1.2, 0);
  scene.add(lights.rim);
  scene.add(lights.rim.target);

  lights.hemi = new THREE.HemisphereLight(0x2a3644, 0x080a0e, 0.9);
  scene.add(lights.hemi);

  /* --- the cast ----------------------------------------------------------- *
   * Spaced wide enough that each has its own silhouette, and turned slightly
   * inward so they are a group rather than three people queueing.
   *
   * The thing stands in the MIDDLE and half a step forward. That is the whole
   * composition: the two people are its, and it is not theirs.
   */
  /*
   * THE CAST LINE.
   *
   * The reference for this screen is the lobby of every horror game that has a
   * lobby: the characters stand in a row, facing you, lit from one side, and
   * the menu runs down the edge in front of them. The thing that makes it work
   * is that they are BIG - near enough that a face is a face - and the thing
   * that kills it is depth. The first staging had the husband at five metres
   * and the wife at six, which is only twenty per cent further away and still
   * enough, at this focal length, to make her look like a child standing behind
   * a fence. Which is what she looked like.
   *
   * So all three stand on one arc at the same distance from the lens, turned a
   * few degrees in toward each other, between x = 1.2 and x = 3.1 - the part of
   * the frame the menu column leaves alone.
   */
  him = human.build("him");
  her = human.build("her");

  // Shoulders squared to the camera, give or take: a row of figures all facing
  // exactly front reads as a police line-up.
  him.place(1.35, 0, 0.1, 0.16);
  her.place(3.05, 0, 0.0, -0.2);
  him.setPose("wary", { instant: true });
  her.setPose("wary", { instant: true });
  scene.add(him.root);
  scene.add(her.root);

  /*
   * THE GHOST, and it is the model if there is one.
   *
   * `wraith.js` builds a ghost out of a torn gown, a skull and two burning
   * eyes, and from a distance in a dark room it is genuinely unpleasant. On
   * this screen it is three metres away under a lantern, and at that range it
   * stops being a figure and becomes a white cone - a lampshade with a hood,
   * which is a long way from frightening.
   *
   * ghost.glb is a woman, with a face and hands and an idle animation that
   * breathes. Drained of colour and made translucent by models.js she is a
   * ghost standing between two people, and that is a different screen
   * entirely. The built one stays as the fallback, and stays in use everywhere
   * the apparition has to appear and vanish on cue rather than stand still.
   */
  if (models.has("ghost")) {
    ghost = human.build("ghost");
    ghost.place(2.2, 0, -0.1, 0.06);
    ghost.setPose("stand", { instant: true });
    scene.add(ghost.root);
    wraith = null;
  } else {
    wraith = wraithFactory.build(scene, { seed: 7311 });
    wraith.place(2.2, 0, -0.1);
    wraith.appear(0.95);
  }

  renderer.requestShadowUpdate();
  return scene;
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  if (!S.active || !scene) return;
  S.time += dt;

  /* --- the lantern flickers ---------------------------------------------- */
  // Two noise rates and one rare deep dip. A regular flicker reads as a bad
  // bulb; an irregular one reads as a flame.
  const n = noise1(S.time * 7.2) * 0.5 + noise1(S.time * 2.3) * 0.5;
  const dip = n < -0.72 ? 0.45 : 1;
  const k = (0.84 + n * 0.16) * dip;
  lights.lantern.intensity = 15 * k;
  lantern.userData.flame.scale.set(0.85 + k * 0.3, 0.8 + k * 0.4, 1);
  lantern.userData.flame.material.opacity = 0.75 + k * 0.25;
  // The flame always faces the camera, or it disappears at a grazing angle.
  if (director.camera) lantern.userData.flame.lookAt(director.camera.position);

  /* --- the cast ----------------------------------------------------------- */
  // All three look at the camera, which is to say at the player. Nothing else
  // on this screen is doing any work, so this has to.
  if (director.camera) S.look.copy(director.camera.position);

  him.update(dt, {
    pose: "wary",
    emotion: "worried",
    breathRate: 0.26,
    lookAt: S.look,
    talking: false,
  });
  her.update(dt, {
    pose: "wary",
    emotion: "afraid",
    breathRate: 0.3,
    lookAt: S.look,
    talking: false,
  });
  if (ghost) {
    /*
     * The model's own idle clip drives her, and a slow drift on top of it
     * keeps her from looking like a statue with a loop playing. The bob is
     * three centimetres: any more and she is bouncing.
     */
    ghost.update(dt, { pose: "stand", lookAt: S.look, talking: false });
    ghost.root.position.y = 0.02 + Math.sin(S.time * 0.55) * 0.03;
    ghost.root.rotation.y = 0.06 + Math.sin(S.time * 0.31) * 0.05;
  }
  wraith?.update(dt, director.camera);
}

/* -------------------------------------------------------------------------- *
 * Showing it
 * -------------------------------------------------------------------------- */

/**
 * The camera.
 *
 * Framed LEFT-HEAVY on purpose: the menu column takes the left third of the
 * screen, so the camera sits left of the group and looks right, which puts all
 * three figures in the clear part of the frame. A centred camera would have put
 * the husband behind the word SETTINGS.
 */
function shot() {
  return [
    /*
     * Aimed LEFT OF THE CAST on purpose.
     *
     * Pointing the camera at the middle of the group centres them on the
     * screen - and the left third of the screen is the menu, so the husband
     * ended up behind the word SETTINGS, two stops darker than the rest of the
     * scene. Aiming at x = 1.3 while the three of them stand between 1.55 and
     * 3.7 pushes the whole group into the right half of the frame, which is the
     * half the player can actually see.
     */
    {
      pos: [0.55, 1.5, 3.65],
      to: [0.72, 1.53, 3.45],
      look: [1.9, 1.18, 0],
      lookTo: [1.82, 1.22, 0],
      fov: 44,
      fovTo: 42,
      // Very long and very slow: it should never look like it is going
      // anywhere, only like it is not quite still.
      dur: 70,
      ease: "sineInOut",
      handheld: 0.9,
    },
  ];
}

export function show() {
  build();
  S.active = true;
  S.time = 0;
  wraith?.appear(0.95);
  director.takeOver(scene);
  director.play(shot());
  renderer.requestShadowUpdate();
}

export function hide() {
  S.active = false;
  director.stop();
}

export const isShowing = () => S.active;

/* -------------------------------------------------------------------------- *
 * Teardown
 * -------------------------------------------------------------------------- */

export function dispose() {
  if (!scene) return;
  S.active = false;
  // The characters are cached and shared with the cutscenes; detach only.
  if (him?.root.parent) him.root.parent.remove(him.root);
  if (her?.root.parent) her.root.parent.remove(her.root);
  if (ghost?.root.parent) ghost.root.parent.remove(ghost.root);
  wraith?.dispose();
  scene.traverse((node) => {
    if (node.isMesh && node.geometry) node.geometry.dispose();
  });
  scene = lights = lantern = wraith = ghost = fog = null;
}
