/**
 * The first-person hand viewmodel.
 *
 * The player has no body anywhere else in this game, so this one prop carries
 * the entire claim that there is a person in the room. It is also the closest
 * geometry to the camera by a factor of five and it is on screen for the whole
 * runtime, which means two things: every shortcut in it is visible, and every
 * triangle in it is cheap by comparison with the room behind it.
 *
 * THE RIG IS PARENTED TO THE CAMERA. Three only renders what is in the scene
 * graph, and a camera that was never added to the scene is still a perfectly
 * good camera - so `build()` does `scene.add(camera)` itself rather than
 * leaving the caller with an invisible hand and no error to go on. The scene
 * here is built once for the whole game (roomManager keeps the same Scene
 * across every room state), so that add happens once and survives a resize.
 * If a future change ever does swap the Scene out, call `build()` again.
 *
 * WHAT MAKES A HAND READ AS A HAND. In order of how much each one is worth:
 *
 *   1. The thumb. Opposed, rooted low on the palm and rotated out of the palm
 *      plane. Four fingers and no thumb is a mitten; a thumb in roughly the
 *      right place forgives a great deal elsewhere.
 *   2. Motion that is not welded to the view. The look-lag below is about ten
 *      lines and does more for the illusion than the geometry does.
 *   3. A curved knuckle line. Fingers rooted on a straight row read as a rake
 *      however well they are modelled, so the four bases differ in all three
 *      axes and in their splay.
 *   4. Three real joints per finger. Baking a curl into the mesh was the first
 *      attempt and it looked like a shop mannequin the instant anything else
 *      in the frame moved.
 *
 * DRAW CALLS. Seventeen meshes: palm, forearm, sleeve, and one per animated
 * segment. That is a lot next to a merged nine-part table, and it is the one
 * place in the game where the cost is worth paying - the joints have to be
 * separate objects to rotate, and everything that is not a joint is merged.
 *
 * SHADOWS. Nothing here casts. A viewmodel arm is 0.35 m from the eye and
 * about two metres from where its owner's shoulder would be, so its shadow
 * lands in the middle of the room as a severed forearm hanging in mid air.
 * This is not hypothetical; it is what the first build did.
 */

import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";

import { PLAYER } from "../core/config.js";
import { get as getPlatform } from "../core/platform.js";
import { clamp, clamp01, damp, lerp, noise1, angleDelta } from "../core/maths.js";
import { mat } from "../engine/materials.js";
import { lod } from "../props/geom.js";
import { player } from "./controller.js";

/* -------------------------------------------------------------------------- *
 * Dimensions
 *
 * Metres, measured off a real adult right hand rather than invented, because
 * a hand that is five millimetres wrong across the palm is uncanny in a way
 * nobody can name. Hand space has the wrist at the origin, the fingers down
 * -Z, the back of the hand toward +Y and the thumb toward -X; the group's own
 * rotation is what turns that into a hand held up in front of a face.
 * -------------------------------------------------------------------------- */

const PALM_W = 0.082; // across the knuckles
const PALM_T = 0.028; // front to back
const PALM_L = 0.095; // wrist crease to the knuckle line
const PALM_R = 0.011; // corner rounding

const FOREARM_LEN = 0.28;

/**
 * Per finger: the knuckle position, its splay and roll, the three bone
 * lengths, the radii at each of the four joints, and the relaxed curl.
 *
 * The lengths follow a real hand, where the MIDDLE finger is longest - not a
 * strict index-to-little ramp. The ramp was built first, because it is what a
 * stylised hand does and it is what the spec asked for, and at 35 cm from the
 * eye it reads as a cartoon fan: the middle finger standing proud of its
 * neighbours is one of the things the eye checks without being asked. Every
 * other finger does shorten toward the little one.
 *
 * `y` and `z` differ across all four so the knuckle line is an arc rather than
 * a row, and `rest` climbs toward the little finger exactly as the curl of a
 * hand hanging by its side does.
 */
const FINGERS = [
  {
    name: "index",
    base: [-0.03, 0.0015, -0.086],
    splay: 0.085,
    roll: 0.05,
    bones: [0.04, 0.025, 0.019],
    r: [0.0092, 0.0082, 0.0072, 0.006],
    rest: 0.3,
  },
  {
    name: "middle",
    base: [-0.01, 0.003, -0.092],
    splay: 0.02,
    roll: 0.01,
    bones: [0.044, 0.028, 0.02],
    r: [0.0094, 0.0084, 0.0073, 0.0061],
    rest: 0.33,
  },
  {
    name: "ring",
    base: [0.01, 0.0015, -0.088],
    splay: -0.055,
    roll: -0.03,
    bones: [0.04, 0.026, 0.019],
    r: [0.0088, 0.0079, 0.0069, 0.0058],
    rest: 0.37,
  },
  {
    name: "little",
    base: [0.029, -0.003, -0.077],
    splay: -0.135,
    roll: -0.08,
    bones: [0.032, 0.02, 0.016],
    r: [0.0078, 0.007, 0.0061, 0.0052],
    rest: 0.44,
  },
];

/** Thumb: two segments, rooted low on the thenar and swung out of the plane. */
const THUMB = {
  base: [-0.034, -0.004, -0.032],
  /** Out of the palm plane: ~55 degrees across, dipped toward the palm. */
  rot: [-0.18, 0.96, 0.42],
  bones: [0.037, 0.028],
  r: [0.0122, 0.0105, 0.009],
  rest: 0.22,
};

/**
 * Radians of flexion per unit of curl, per joint.
 *
 * A fist is roughly 85/100/70 degrees at the three joints, and the fact that
 * the middle joint closes furthest is most of why a curled finger reads as
 * gripping something rather than as bending.
 */
const JOINT_GAIN = [1.48, 1.75, 1.18];
const THUMB_GAIN = [1.0, 1.05];

/* -------------------------------------------------------------------------- *
 * Poses
 *
 * All eyeball-tuned, and all in one table so they can be re-tuned without
 * reading a line of the animation code below. Positions are camera space in
 * metres (+x right, +y up, -z forward); rotations are the group's Euler.
 *
 * Three's XYZ order applies Z first, so the z term is a roll in the hand's own
 * space - it is what turns the palm toward the middle of the screen and puts
 * the thumb on top - and y then x aim the whole arm.
 *
 * Depth is 0.33-0.40 m. The near plane is 0.05 m (WORLD.near) and the forearm
 * trails back about 0.22 m of that depth from the wrist, putting the elbow end
 * near z=-0.15 at its closest: a 0.1 m margin on being sliced open by the near
 * plane, which is the other classic viewmodel failure. Anything that moves the
 * rest pose further back, or flattens the forearm's angle, spends that margin.
 * -------------------------------------------------------------------------- */

/** At rest the hand hangs in the bottom-right corner, mostly out of frame. */
/*
 * Lowered from -0.275 after seeing it in the game: at that height the hand
 * sat in the middle of the lower third of the frame and covered whatever the
 * player had just walked up to. At rest an arm hangs; only the reach pose
 * should bring it up into the view.
 */
const REST_POS = new THREE.Vector3(0.275, -0.325, -0.38);
const REST_ROT = new THREE.Euler(0.12, 0.35, -1.15);

/** Looking at something in reach: rises, swings toward the centre, opens up. */
const FOCUS_POS = new THREE.Vector3(0.16, -0.17, -0.4);
const FOCUS_ROT = new THREE.Euler(0.26, 0.3, -1.0);

/**
 * Carrying: lower, more central, palm turned up as though taking the weight.
 *
 * Offset below and short of the hold point on purpose. The carry system floats
 * the object at (0, -0.12, -0.85) relative to the camera; a hand that actually
 * reached it would intersect it on every frame, because nothing in that spring
 * knows the hand exists. Supporting from beneath and in front reads correctly
 * and cannot ever clip, whatever the object turns out to be.
 */
const CARRY_POS = new THREE.Vector3(0.165, -0.3, -0.335);
const CARRY_ROT = new THREE.Euler(0.3, 0.58, -1.92);

/** Curl per finger in each pose; index first. Rest lives in FINGERS above. */
const FOCUS_CURL = [0.09, 0.3, 0.35, 0.42];
const CARRY_CURL = [0.74, 0.78, 0.8, 0.82];

/** The jab. 250 ms: long enough to see, short enough to feel like a press. */
const PRESS_DUR = 0.25;
const PRESS_POS = new THREE.Vector3(-0.024, 0.016, -0.058);
const PRESS_ROT = new THREE.Euler(0.12, -0.14, 0.16);

/** Metres of hand sway per unit of walk amplitude. Larger than the camera's. */
const HAND_BOB = 0.016;

/** Look-lag: metres of trail per radian-per-second of turn, and its ceiling. */
const SWAY_GAIN = 0.0062;
const SWAY_LIMIT = 0.055;

/** How fast a pose change converges. Low enough to see, high enough to obey. */
const POSE_RATE = 9;

/* -------------------------------------------------------------------------- *
 * State
 *
 * Every vector, euler and accumulator the per-frame code touches lives here.
 * `tick` runs every frame for the whole session and must not allocate: a
 * viewmodel that produces one Vector3 per frame is 3600 of them a minute, and
 * the GC pause lands in the middle of whatever the player was reaching for.
 * -------------------------------------------------------------------------- */

let cam = null;
let group = null;
/** Every mesh, for teardown. Materials belong to the library and are not ours. */
const meshes = [];
/** One entry per digit: four fingers, then the thumb. */
const chains = [];

let time = 0;
let focusW = 0;
let carryW = 0;
let walkW = 0;
let walkPhase = 0;
/** -1 when no press is running; otherwise seconds since it started. */
let pressT = -1;

let swayX = 0;
let swayY = 0;
let prevYaw = 0;
let prevPitch = 0;

const _anchorP = new THREE.Vector3();
const _poseP = new THREE.Vector3();
const _poseR = new THREE.Euler();
/** Build-time vertex scratch. Module level so the loops below cannot churn. */
const _v = new THREE.Vector3();

/** So `tick(dt)` with no state object is legal and still allocates nothing. */
const NO_STATE = Object.freeze({});

/* -------------------------------------------------------------------------- *
 * Geometry
 * -------------------------------------------------------------------------- */

/**
 * Merge skin parts into one buffer.
 *
 * UVs are stripped first. `mat.skin()` carries no maps - the hand is too close
 * for a generated texture to read as anything but grime - so the attribute is
 * dead weight, and dropping it also lets the hand-built palm (which loses its
 * UVs to the vertex weld below) merge with primitives that still have theirs.
 * If skin ever gains a map, this is the line that has to go.
 */
function mergeSkin(parts) {
  for (const g of parts) g.deleteAttribute("uv");
  if (parts.length === 1) return parts[0];
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("hands: incompatible skin geometry");
  for (const g of parts) g.dispose();
  return merged;
}

/**
 * A box with rounded edges, by projecting each vertex onto the rounded
 * surface: clamp it into the inner box, then push it back out by the radius.
 *
 * BoxGeometry gives every face its own vertices, so the straightforward
 * version creases hard along each rounded edge - which on skin looks like a
 * chamfered block, the exact thing the rounding was for. Welding by position
 * before recomputing the normals is what makes the corners smooth, and that
 * weld is also why the UVs go: coincident vertices from two faces carry
 * different UVs and would refuse to merge.
 */
function roundedBox(w, h, d, r, segs) {
  const g = new THREE.BoxGeometry(w, h, d, segs, segs, segs);
  const pos = g.attributes.position;
  const hx = w / 2 - r;
  const hy = h / 2 - r;
  const hz = d / 2 - r;

  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const cx = clamp(_v.x, -hx, hx);
    const cy = clamp(_v.y, -hy, hy);
    const cz = clamp(_v.z, -hz, hz);
    const dx = _v.x - cx;
    const dy = _v.y - cy;
    const dz = _v.z - cz;
    const len = Math.hypot(dx, dy, dz) || 1;
    const k = r / len;
    pos.setXYZ(i, cx + dx * k, cy + dy * k, cz + dz * k);
  }

  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const welded = mergeVertices(g);
  g.dispose();
  welded.computeVertexNormals();
  return welded;
}

/** An ellipsoid, for the fleshy pads. A sphere is the cheapest soft shape there is. */
function pad(r, sx, sy, sz, x, y, z, wSegs, hSegs) {
  const g = new THREE.SphereGeometry(r, wSegs, hSegs);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

/**
 * One finger bone, running from the origin down -Z, with its joint at the base.
 *
 * The joint sphere is squashed along the bone because a knuckle is wider than
 * it is long; a round one gives the finger a beaded, insect look. At detail 0
 * the spheres go entirely - the chain stays, so the animation is unchanged and
 * only the silhouette at the joints is poorer.
 */
function bone(len, rBase, rTip, radial, jointR, capped) {
  const parts = [];

  const shaft = new THREE.CylinderGeometry(rTip, rBase, len, radial, 1, false);
  shaft.rotateX(-Math.PI / 2); // +Y stock becomes -Z, narrow end at the tip
  shaft.translate(0, 0, -len / 2);
  parts.push(shaft);

  const rings = Math.max(3, radial >> 1);
  if (jointR > 0) {
    const j = new THREE.SphereGeometry(jointR, radial, rings);
    j.scale(1.0, 0.95, 0.74);
    parts.push(j);
  }
  // The fingertip. A flat cylinder cap is the most obvious tell that a hand is
  // made of primitives, and it is a handful of triangles to fix.
  if (capped) {
    const tip = new THREE.SphereGeometry(rTip, radial, rings);
    tip.scale(1, 1, 1.25);
    tip.translate(0, 0, -len);
    parts.push(tip);
  }

  return mergeSkin(parts);
}

/**
 * Palm, heel and thenar as one buffer.
 *
 * The taper is the part that matters: a palm is noticeably narrower at the
 * wrist than at the knuckles, and a rounded box without it is still a box with
 * soft edges. The two pads - the ball of the thumb and the heel on the
 * little-finger side - are what give the palm its asymmetry, and they are the
 * reason a left hand would not be this one mirrored by eye.
 *
 * Fingernails were tried here and dropped. Without a second material they are
 * a lump on the back of each fingertip, and a nail material for four square
 * millimetres apiece is not worth a draw call or a library entry.
 */
function buildPalm(detail) {
  /*
   * Segment counts are high for a box because the rounding is sampled, not
   * generated: only vertices that land inside the rounding band get pushed
   * out, so at three segments a 28 mm-thick slab with an 11 mm radius has
   * almost no vertex in the flat part of a face and the palm comes out a
   * millimetre narrow and visibly faceted. Eight at the top tier is still
   * only a couple of hundred vertices after the weld.
   */
  const segs = lod(detail, 3, 4, 6, 8);
  const sphW = lod(detail, 6, 8, 10, 12);
  const sphH = lod(detail, 4, 6, 8, 8);

  const palm = roundedBox(PALM_W, PALM_T, PALM_L, PALM_R, segs);
  const pos = palm.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    // 0 at the wrist end, 1 at the knuckles.
    const t = clamp01(0.5 - _v.z / PALM_L);
    pos.setX(i, _v.x * lerp(0.8, 1.0, t));
  }
  palm.computeVertexNormals();
  palm.translate(0, 0, -PALM_L / 2);

  const parts = [palm];
  parts.push(pad(0.019, 1.0, 0.7, 1.45, -0.026, -0.006, -0.03, sphW, sphH));
  parts.push(pad(0.015, 0.95, 0.66, 1.55, 0.03, -0.005, -0.03, sphW, sphH));

  // Wrist stub. Without it the palm ends in a flat face that the forearm has
  // to meet exactly, and the first wrist rotation opens a seam straight
  // through to the inside of the arm.
  const stub = new THREE.CylinderGeometry(0.0255, 0.0255, 0.03, sphW, 1, true);
  stub.scale(1.18, 1, 0.84);
  stub.rotateX(Math.PI / 2);
  stub.translate(0, 0, 0.004);
  parts.push(stub);

  return mergeSkin(parts);
}

/**
 * Forearm, as a lathe running from the wrist back along +Z.
 *
 * A lathe rather than a plain tapered cylinder because the swell below the
 * elbow and the pinch at the wrist are a profile, not a taper, and the wrist
 * is the one piece of anatomy legible at this distance. Flattened on one axis
 * afterwards: a forearm in section is an oval, and a round one reads as a
 * length of pipe with a hand on the end.
 */
function buildForearm(detail) {
  const segs = lod(detail, 6, 8, 12, 16);
  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.0255, 0.0),
    new THREE.Vector2(0.0272, 0.022),
    new THREE.Vector2(0.032, 0.065),
    new THREE.Vector2(0.0395, 0.13),
    new THREE.Vector2(0.0455, 0.2),
    new THREE.Vector2(0.047, FOREARM_LEN),
    new THREE.Vector2(0, FOREARM_LEN),
  ];
  const g = new THREE.LatheGeometry(profile, segs);
  g.scale(1.14, 1, 0.86);
  g.rotateX(Math.PI / 2); // +Y profile becomes +Z, running back to the elbow
  return mergeSkin([g]);
}

/**
 * The rolled sleeve. Its own material, so its own mesh whatever happens.
 *
 * Rolled rather than a plain cuff for one reason: a straight tube ending on
 * the forearm is a hard circular seam, and the torus at the roll hides it
 * while also being the clearest single signal that there is a person wearing
 * clothes here rather than a bare arm floating in a cell.
 */
function buildSleeve(detail) {
  const segs = lod(detail, 7, 9, 14, 18);
  const parts = [];

  const tube = new THREE.CylinderGeometry(0.0515, 0.0555, 0.185, segs, 1, true);
  tube.rotateX(Math.PI / 2);
  tube.translate(0, 0, 0.195);
  parts.push(tube);

  const roll = new THREE.TorusGeometry(
    0.0475,
    0.0115,
    lod(detail, 4, 5, 7, 9),
    segs,
  );
  roll.translate(0, 0, 0.104);
  parts.push(roll);

  /*
   * Match the forearm's oval section, or the sleeve stands off the arm on one
   * axis and sinks into it on the other.
   *
   * X and Y, not X and Z: these parts have already been rotated onto the +Z
   * axis, so Z is now the length of the arm and scaling it would shorten the
   * sleeve instead of flattening it. The forearm's own flattening is applied
   * before its rotation, which is why the numbers there are on different axes.
   */
  for (const g of parts) g.scale(1.12, 0.88, 1);

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("hands: incompatible sleeve geometry");
  for (const g of parts) g.dispose();
  return merged;
}

/** Every mesh in the rig goes through here, so none of them can cast a shadow. */
function addMesh(parent, geo, material) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = false;
  // Receiving is fine and worth having: the hand picks up the lamp's falloff
  // and darkens when the player walks into shadow, which is free grounding.
  m.receiveShadow = true;
  /*
   * Never culled. The rig straddles the edge of the frustum by design, and the
   * failure mode is the whole hand blinking out for a frame when the player
   * turns. Seventeen small meshes are not worth the cull test anyway.
   */
  m.frustumCulled = false;
  parent.add(m);
  meshes.push(m);
  return m;
}

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

/**
 * Create the rig and parent it to the camera.
 *
 * The caller does NOT have to add anything to the scene itself: this adds the
 * CAMERA to the scene if it is not already there, because camera children are
 * invisible otherwise and the symptom - no error, no hand, no clue - is
 * miserable to chase.
 *
 * Call it where a prop would be built: after `platform.detect()` and
 * `textures.init()`, because `mat.sleeve()` generates the fabric maps on first
 * ask and both of those have to have happened for that to produce anything.
 */
export function build(camera, scene) {
  if (group) dispose();
  cam = camera;

  // propDetail is 0..3. Defaulted rather than thrown on, because a hand built
  // one tier too fine is survivable and a crash during boot is not.
  let detail = 2;
  try {
    detail = getPlatform().settings.propDetail ?? 2;
  } catch {
    /* platform.detect() has not run yet. Assume the middle of the range. */
  }

  const radial = lod(detail, 5, 6, 8, 10);
  const jointSph = detail === 0 ? 0 : 1;

  group = new THREE.Group();
  group.name = "handRig";
  group.position.copy(REST_POS);
  group.rotation.copy(REST_ROT);
  _poseP.copy(REST_POS);
  _poseR.copy(REST_ROT);

  /* --- forearm ---------------------------------------------------------- *
   * Its own node, so the wrist can turn without the elbow following it.
   *
   * One rotation, and it is a deviation toward the little finger rather than
   * the "tilt it down and to the right" the problem sounds like. Down and to
   * the right is the answer in CAMERA space, and the rig has already been
   * rolled 66 degrees to turn the palm inward by the time this applies - in
   * the hand's own space, down-and-right is mostly +X. Composing it by eye
   * instead sent the elbow across the bottom of the screen toward the left
   * shoulder and put the far end 0.06 m from the near plane.
   *
   * 19 degrees of deviation is also what a real wrist does holding a hand up
   * with the palm inward and the elbow at the waist. The pitch in REST_ROT is
   * carrying the rest of that geometry, which is why the fingers sit slightly
   * raised rather than level.
   * ---------------------------------------------------------------------- */
  const arm = new THREE.Group();
  arm.name = "forearm";
  arm.rotation.set(0, 0.34, 0);
  group.add(arm);
  addMesh(arm, buildForearm(detail), mat.skin());
  addMesh(arm, buildSleeve(detail), mat.sleeve());

  /* --- hand ------------------------------------------------------------- */
  const wrist = new THREE.Group();
  wrist.name = "wrist";
  group.add(wrist);

  const skin = mat.skin();
  addMesh(wrist, buildPalm(detail), skin);

  for (let i = 0; i < FINGERS.length; i++) {
    const f = FINGERS[i];
    const joints = [];
    const baseX = [];
    let parent = wrist;

    /*
     * proximal -> middle -> distal, each parented to the last.
     *
     * This is why one curl value per finger is enough: rotating the proximal
     * carries the whole finger, and the two children only add their own share
     * on top. Posing three independent meshes to match would be the same
     * maths done three times and wrong twice.
     */
    for (let j = 0; j < 3; j++) {
      const node = new THREE.Group();
      node.name = f.name + "." + j;

      if (j === 0) {
        node.position.set(f.base[0], f.base[1], f.base[2]);
        // Splay about Y and a little roll about Z. The roll is what stops the
        // four fingers looking cut from one extrusion: real ones lie on a
        // curved arcade and each sits at its own angle to the palm.
        node.rotation.set(0, f.splay, f.roll);
      } else {
        node.position.set(0, 0, -f.bones[j - 1]);
      }

      // A relaxed finger is not straight at any joint, and that residual bend
      // lives here rather than in the curl, so that curl 0 still means "as
      // open as this finger ever gets".
      baseX.push(j === 0 ? -0.04 : -0.05);
      node.rotation.x = baseX[j];

      parent.add(node);
      addMesh(
        node,
        bone(
          f.bones[j],
          f.r[j],
          f.r[j + 1],
          radial,
          jointSph * f.r[j] * 1.18,
          j === 2,
        ),
        skin,
      );
      joints.push(node);
      parent = node;
    }

    chains.push({ joints, baseX, gain: JOINT_GAIN, curl: f.rest, rest: f.rest });
  }

  /* --- thumb ------------------------------------------------------------ *
   * Two segments, rooted at the thenar and swung out of the palm plane. The
   * third real bone, the metacarpal, is inside the thenar pad built above, so
   * modelling it would only put geometry inside geometry.
   * ---------------------------------------------------------------------- */
  {
    const joints = [];
    const baseX = [];
    let parent = wrist;

    for (let j = 0; j < 2; j++) {
      const node = new THREE.Group();
      node.name = "thumb." + j;
      if (j === 0) {
        node.position.set(THUMB.base[0], THUMB.base[1], THUMB.base[2]);
        node.rotation.set(THUMB.rot[0], THUMB.rot[1], THUMB.rot[2]);
        baseX.push(THUMB.rot[0]);
      } else {
        node.position.set(0, 0, -THUMB.bones[0]);
        baseX.push(-0.08);
        node.rotation.x = baseX[j];
      }
      parent.add(node);
      addMesh(
        node,
        bone(
          THUMB.bones[j],
          THUMB.r[j],
          THUMB.r[j + 1],
          radial,
          jointSph * THUMB.r[j] * 1.1,
          j === 1,
        ),
        skin,
      );
      joints.push(node);
      parent = node;
    }

    chains.push({
      joints,
      baseX,
      gain: THUMB_GAIN,
      curl: THUMB.rest,
      rest: THUMB.rest,
    });
  }

  camera.add(group);

  // Camera children only render if the camera is itself in the graph. Done
  // here rather than left in a comment nobody reads.
  if (scene && camera.parent !== scene) scene.add(camera);

  prevYaw = camera.rotation.y;
  prevPitch = camera.rotation.x;
  return group;
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

/**
 * Advance the rig.
 *
 * Call once per RENDERED frame, after the camera rig has ticked - the look-lag
 * reads the camera's rotation and wants this frame's value, not last frame's,
 * or the hand trails by a whole frame on top of its intended lag and the whole
 * view starts to read as input delay.
 *
 * `state` is { focused, carrying, interacting, speed, crouching, sprinting }.
 * Anything missing falls back to the controller, which is also where `locked`
 * comes from: it is not in the state object and the hand still has to obey it.
 */
export function tick(dt, state) {
  if (!group || dt <= 0) return;
  const s = state || NO_STATE;

  time += dt;

  const locked = player.locked === true;
  const speed = s.speed ?? player.speed;
  const crouching = s.crouching ?? player.crouching;
  const sprinting = s.sprinting ?? player.sprinting;

  // Locked means a cutscene or a room transition owns the player. The hand
  // keeps breathing - freezing it dead is worse than anything it might do -
  // but it stops reacting to focus, carry and presses and settles to rest.
  focusW = damp(focusW, !locked && s.focused ? 1 : 0, 7.5, dt);
  carryW = damp(carryW, !locked && s.carrying ? 1 : 0, 6, dt);

  /* --- press ------------------------------------------------------------ *
   * One shot, restartable. The curve is a single lobe with its time axis bent
   * so the hand is most of the way out inside 70 ms and spends the rest of the
   * 250 ms coming back: a symmetric sine jabs and retracts at the same speed,
   * which reads as a wave rather than as pressing something. The settle at the
   * end is left to the pose damping, which is already going that way.
   * ---------------------------------------------------------------------- */
  if (s.interacting && !locked) pressT = 0;
  let punch = 0;
  if (pressT >= 0) {
    pressT += dt;
    if (pressT >= PRESS_DUR) pressT = -1;
    else punch = Math.sin(Math.PI * Math.pow(pressT / PRESS_DUR, 0.55));
  }

  /* --- look lag --------------------------------------------------------- *
   * The cheapest thing in this file and the one that sells it. Turn speed in
   * radians per second rather than per frame, or the lag doubles when the
   * frame rate halves. `angleDelta` because yaw wraps at +/-pi and the wrap
   * would otherwise throw the hand across the screen once per turn.
   *
   * Read off the CAMERA rather than off player.yaw/pitch, so this is lagging
   * the view that was actually rendered. That means the camera's shake feeds
   * it too, and the arm shudders when the room does - which was an accident
   * the first time and is kept on purpose, because an arm that stays rigid
   * while the view is rattling is the thing that looks wrong.
   * ---------------------------------------------------------------------- */
  const yawNow = cam.rotation.y;
  const pitchNow = cam.rotation.x;
  const perSecond = 1 / dt;
  const dYaw = angleDelta(prevYaw, yawNow) * perSecond;
  const dPitch = (pitchNow - prevPitch) * perSecond;
  prevYaw = yawNow;
  prevPitch = pitchNow;

  swayX = damp(swayX, clamp(dYaw * SWAY_GAIN, -SWAY_LIMIT, SWAY_LIMIT), 9, dt);
  swayY = damp(swayY, clamp(-dPitch * SWAY_GAIN, -SWAY_LIMIT, SWAY_LIMIT), 9, dt);

  /* --- walk ------------------------------------------------------------- *
   * Counter-phased against the camera's bob. camera.js advances its phase by
   * `speed * dt * bobSpeed * 0.42` and offsets by +cos and +sin(2x); this
   * mirrors that integrator and negates both, so the hand rises as the view
   * dips. The two phases are not guaranteed to stay exactly equal - the camera
   * gates its own on being on the ground, and bobPhase is not exported - and
   * they do not need to be. What must not happen is the hand bobbing WITH the
   * view, which is precisely what makes a viewmodel look nailed to the lens.
   * ---------------------------------------------------------------------- */
  const walking = !locked && player.onGround && speed > 0.15;
  walkW = damp(walkW, walking ? 1 : 0, 8, dt);
  if (walkW > 0.001) walkPhase += speed * dt * PLAYER.bobSpeed * 0.42;

  const amp = HAND_BOB * walkW * (sprinting ? 1.55 : 1) * (crouching ? 0.45 : 1);
  const bobX = -Math.cos(walkPhase) * amp * 0.9;
  const bobY = -Math.sin(walkPhase * 2) * amp * 1.15;
  const bobZ = Math.sin(walkPhase) * amp * 0.5;
  const bobRZ = -Math.cos(walkPhase) * amp * 2.6;

  /* --- idle ------------------------------------------------------------- *
   * Breathing is a sine; everything laid over it is noise. A pure sine finds a
   * loop the eye catches inside about twenty seconds, and the entire point of
   * an idle is that the player never notices there is one.
   * ---------------------------------------------------------------------- */
  const calm = 1 - walkW * 0.6;
  const breath = Math.sin(time * 1.05) * 0.6 + noise1(time * 0.23) * 0.4;
  const idleX = noise1(time * 0.17 + 9.3) * 0.0042 * calm;
  const idleY = breath * 0.0048 * calm;
  const idleRX = noise1(time * 0.21 + 3.1) * 0.022 * calm;
  const idleRZ = noise1(time * 0.19 + 17.7) * 0.026 * calm;

  /* --- pose ------------------------------------------------------------- *
   * Blend the anchors by weight, then chase the result with damp, so a pose
   * change is a move rather than a cut however fast the weights swing.
   * ---------------------------------------------------------------------- */
  _anchorP.copy(REST_POS);
  if (focusW > 0.0005) _anchorP.lerp(FOCUS_POS, focusW);
  if (carryW > 0.0005) _anchorP.lerp(CARRY_POS, carryW);

  _poseP.set(
    damp(_poseP.x, _anchorP.x, POSE_RATE, dt),
    damp(_poseP.y, _anchorP.y, POSE_RATE, dt),
    damp(_poseP.z, _anchorP.z, POSE_RATE, dt),
  );
  _poseR.set(
    damp(_poseR.x, blendAngle(REST_ROT.x, FOCUS_ROT.x, CARRY_ROT.x), POSE_RATE, dt),
    damp(_poseR.y, blendAngle(REST_ROT.y, FOCUS_ROT.y, CARRY_ROT.y), POSE_RATE, dt),
    damp(_poseR.z, blendAngle(REST_ROT.z, FOCUS_ROT.z, CARRY_ROT.z), POSE_RATE, dt),
  );

  /*
   * Keep the rig inside the frustum on a narrow viewport.
   *
   * The rest pose sits 0.245 m to the right, which is comfortably on screen at
   * 16:9 and entirely outside the frustum of a phone held in portrait - the
   * hand gets built, lit and animated and is never once visible. Clamping
   * against the real half-width costs one tangent a frame and removes a whole
   * class of "works on my machine".
   */
  const halfW =
    Math.tan(cam.fov * THREE.MathUtils.DEG2RAD * 0.5) *
    Math.abs(_poseP.z) *
    cam.aspect;
  const maxX = Math.max(0.06, halfW - 0.035);

  group.position.set(
    Math.min(_poseP.x + swayX + bobX + idleX + punch * PRESS_POS.x, maxX),
    _poseP.y + swayY + bobY + idleY + punch * PRESS_POS.y,
    _poseP.z + bobZ + punch * PRESS_POS.z,
  );
  group.rotation.set(
    _poseR.x + swayY * 2.0 + idleRX + punch * PRESS_ROT.x,
    _poseR.y + swayX * 1.7 + punch * PRESS_ROT.y,
    _poseR.z + swayX * 2.4 + bobRZ + idleRZ + punch * PRESS_ROT.z,
  );

  /* --- fingers ---------------------------------------------------------- */
  for (let i = 0; i < chains.length; i++) {
    const c = chains[i];
    const isThumb = i === FINGERS.length;

    let target = c.rest;
    if (isThumb) {
      // The thumb opposes rather than curls: it closes against the fingers
      // for a carry and lifts a little when the hand opens up to reach.
      target = lerp(target, 0.62, carryW);
      target = lerp(target, 0.14, focusW * 0.5);
    } else {
      target = lerp(c.rest, FOCUS_CURL[i], focusW);
      target = lerp(target, CARRY_CURL[i], carryW);
      // The index straightens for the press. This is the telegraph: the
      // player sees the pointing finger before they read the prompt.
      if (i === 0) target = lerp(target, 0.02, punch);
    }

    // Each digit drifts on its own noise stream. One shared stream makes all
    // five twitch in unison, which is worse than no settle at all.
    target += noise1(time * 0.55 + i * 5.7) * 0.025 * calm;

    c.curl = damp(c.curl, clamp01(target), 11, dt);
    for (let j = 0; j < c.joints.length; j++) {
      // Negative is flexion: -Z fingers rotated negatively about X fold into
      // the palm at -Y. The base angle is the finger's own resting bend.
      c.joints[j].rotation.x = c.baseX[j] - c.curl * c.gain[j];
    }
  }
}

/** rest -> focus -> carry, in that precedence. Carry wins; it is the strongest read. */
function blendAngle(rest, focus, carry) {
  return lerp(lerp(rest, focus, focusW), carry, carryW);
}

/* -------------------------------------------------------------------------- *
 * Lifecycle
 * -------------------------------------------------------------------------- */

export function setVisible(v) {
  if (group) group.visible = !!v;
}

/**
 * Tear the rig down.
 *
 * Geometry is ours and is disposed. Materials are NOT: `mat.skin()` and
 * `mat.sleeve()` live in the shared library, and disposing them from here
 * would blank anything else that ever asks for them.
 */
export function dispose() {
  if (group) {
    group.parent?.remove(group);
    for (const m of meshes) m.geometry.dispose();
  }
  meshes.length = 0;
  chains.length = 0;
  group = null;
  cam = null;
  time = 0;
  focusW = 0;
  carryW = 0;
  walkW = 0;
  walkPhase = 0;
  pressT = -1;
  swayX = 0;
  swayY = 0;
}
