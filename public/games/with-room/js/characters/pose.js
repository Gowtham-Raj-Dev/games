/**
 * Posing a model that has no skeleton.
 *
 * THE PROBLEM. Two of the three character models in this game are static
 * meshes. The husband is frozen standing in an A-pose and the wife in a T-pose,
 * with no bones, no skin weights and no animation clips - they are sculptures.
 * That is fine for the lobby, where the cast stands still and looks at the
 * camera, and it is useless for the opening, where both of them have to be
 * SITTING IN A CAR. A standing figure placed on a car seat does not read as a
 * person sitting down; it reads as a mannequin that has been dropped through
 * the floor, which is exactly how it looked.
 *
 * THE USUAL ANSWER is to open the model in Blender, rig it, weight it, and
 * export a sitting pose. That is an hour per character and it has to happen
 * again every time a model is replaced.
 *
 * WHAT THIS DOES INSTEAD. A static mesh can be bent without a skeleton, because
 * a skeleton is only a way of saying "these vertices rotate about this point".
 * Say it directly: a joint is a pivot, an axis, an angle, and a rule for which
 * vertices it takes with it. Bend at the hips and the legs swing forward. Bend
 * at the knees and the shins drop. The figure is sitting. It costs one pass
 * over the vertex buffer, once, when the pose is first asked for.
 *
 * It is not skinning and it does not pretend to be. There is no volume
 * preservation, so a 90-degree hip bend creases rather than bulges, and a limb
 * bent far enough will pinch at the inside of the joint. Both are invisible
 * through a car window at night with the character in clothes, which is the
 * only place this is used. Anywhere the bend would show, the answer is a real
 * rig, not a bigger blend radius.
 *
 *
 * HOW A CHAIN COMPOSES
 * --------------------
 * Joints are listed root-first, and each vertex's final transform is the
 * product of every joint that claims it, in that order:
 *
 *     v' = R_hip * R_knee * v
 *
 * which is forward kinematics written out. The knee rotation happens in the
 * thigh's frame - that is, about the knee's ORIGINAL position - and the hip
 * rotation then carries the whole leg. Weights are computed from the original
 * vertex positions and never from the deformed ones, so the order of
 * application cannot change which joint owns which vertex.
 */

import * as THREE from "three";

/* -------------------------------------------------------------------------- *
 * The bend
 * -------------------------------------------------------------------------- */

/**
 * One cutting plane: 1 on the far side, 0 on the near side, smooth between.
 *
 * `blend` is the width of the band either side of the plane over which the
 * rotation fades in. Zero would shear the mesh into two pieces at the cut, and
 * anything wider than the limb's own thickness drags the torso along with the
 * leg. A few centimetres is the whole useful range.
 */
function band(value, cut, sign, blend) {
  const d = sign * (value - cut);
  if (d <= -blend) return 0;
  if (d >= blend) return 1;
  const t = (d + blend) / (2 * blend);
  return t * t * (3 - 2 * t); // smoothstep: no crease at the edge of the band
}

const axisOf = (p, a) => (a === "x" ? p.x : a === "z" ? p.z : p.y);

/**
 * How much of this joint applies to a vertex at `p`.
 *
 * ONE PLANE IS NOT ENOUGH, and assuming it was did real damage. A shoulder
 * joint written as "everything further out than x = 0.14" is true of the arm
 * and equally true of the right hip, the right thigh and the right boot - so
 * "bring the arms down" rotated half the body ninety degrees about the
 * shoulder and the wife lost her legs. On screen she was a torso with limbs
 * sticking out sideways, standing in the dark where nobody could see what had
 * actually happened to her.
 *
 * So a joint can carry extra GATES, each one another plane, multiplied
 * together. A shoulder is "further out than the ribcage AND above the waist",
 * which is a description of an arm and of nothing else.
 */
function weightOf(joint, p) {
  let w = band(axisOf(p, joint.axisOfCut), joint.cut, joint.sign, joint.blend);
  if (w <= 0 || !joint.gates) return w;
  for (const g of joint.gates) {
    w *= band(axisOf(p, g.axis), g.cut, g.sign, g.blend ?? joint.blend);
    if (w <= 0) return 0;
  }
  return w;
}

const _m = new THREE.Matrix4();
const _t1 = new THREE.Matrix4();
const _t2 = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/** The matrix for one joint at a given strength: translate, rotate, translate back. */
function jointMatrix(joint, w, out) {
  if (w <= 0) return out.identity();
  _axis.fromArray(joint.axis).normalize();
  _q.setFromAxisAngle(_axis, joint.angle * w);
  _r.makeRotationFromQuaternion(_q);
  _t1.makeTranslation(joint.pivot[0], joint.pivot[1], joint.pivot[2]);
  _t2.makeTranslation(-joint.pivot[0], -joint.pivot[1], -joint.pivot[2]);
  return out.copy(_t1).multiply(_r).multiply(_t2);
}

/**
 * Bend one geometry, in POSE SPACE rather than in its own.
 *
 * A pose is written in human terms - "the hip is at 53% of standing height" -
 * and that only means anything in a space where the model is upright, in
 * metres, standing on the origin. A mesh inside a glTF is in none of those: the
 * two human models here are stored Z-up, in units of about five centimetres,
 * under three nested nodes that rotate and rescale them. A pose applied in that
 * space bends the figure sideways at the ankles.
 *
 * So the caller passes the matrix into pose space and the matrix back out, each
 * vertex makes the round trip, and the joints below can be written the way a
 * person would describe them.
 *
 * Returns a NEW geometry; the original is left alone, so the same loaded model
 * can be posed two different ways in two different scenes.
 */
export function bendGeometry(geometry, joints, toPose, fromPose) {
  const geo = geometry.clone();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const n = pos.count;

  const chain = new THREE.Matrix4();
  const toN = new THREE.Matrix3().setFromMatrix4(toPose);
  const fromN = new THREE.Matrix3().setFromMatrix4(fromPose);
  const q = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    // Into pose space: metres, Y up, feet at the origin, facing +Z.
    _p.fromBufferAttribute(pos, i).applyMatrix4(toPose);
    chain.identity();

    let touched = false;
    for (const joint of joints) {
      const w = weightOf(joint, _p);
      if (w <= 0) continue;
      jointMatrix(joint, w, _m);
      chain.multiply(_m);
      touched = true;
    }
    if (!touched) continue;

    q.copy(_p).applyMatrix4(chain).applyMatrix4(fromPose);
    pos.setXYZ(i, q.x, q.y, q.z);

    if (nor) {
      _nm.setFromMatrix4(chain);
      _n.fromBufferAttribute(nor, i)
        .applyMatrix3(toN)
        .applyMatrix3(_nm)
        .applyMatrix3(fromN)
        .normalize();
      nor.setXYZ(i, _n.x, _n.y, _n.z);
    }
  }

  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/* -------------------------------------------------------------------------- *
 * Poses
 * -------------------------------------------------------------------------- */

const D = Math.PI / 180;

/**
 * Where the joints are on a human, as fractions of standing height.
 *
 * The vertical ones are standard anthropometric ratios and they hold for every
 * human model ever made, because the models are made from the same references.
 * A hip is a little over half way up a person and a knee is a little over a
 * quarter, whoever sculpted them.
 */
const H = {
  hip: 0.53,
  knee: 0.285,
  shoulder: 0.818,
};

/**
 * Find the arms, by looking.
 *
 * The SIDEWAYS positions cannot be assumed the way the vertical ones can,
 * because they depend entirely on the pose the model was sculpted in. A T-posed
 * figure has its wrists at half its own height from the centre line; an A-posed
 * one has them at a fifth of that; and the wife's model, which looks T-posed,
 * actually has her arms dropped far enough that her fingertips are at a third
 * of her height. Guessing cost real damage: the elbow joint derived from the
 * textbook ratio landed past her wrists, so "bend the elbow" bent her fingers
 * and the hands came out as a splayed mess.
 *
 * So measure. Bucket every vertex by height, record how far out each slice
 * reaches, and the arms announce themselves: they are the only part of a person
 * that is much wider than the torso. The widest slice is the arm line, the
 * torso's own half-width is read from the slice just below it, and the elbow is
 * placed proportionally between the two.
 */
export function findArms(root, height) {
  const SLICES = 48;
  const reach = new Float32Array(SLICES);
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();

  root.traverse((node) => {
    if (!node.isMesh) return;
    const geo = node.userData.basePose ?? node.geometry;
    const pos = geo.attributes.position;
    m.multiplyMatrices(inv, node.matrixWorld);
    const step = pos.count > 12000 ? 3 : 1;
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const s = Math.min(SLICES - 1, Math.max(0, Math.floor((v.y / height) * SLICES)));
      const x = Math.abs(v.x);
      if (x > reach[s]) reach[s] = x;
    }
  });

  /*
   * The shoulder is NOT the widest slice, and believing it was is what broke
   * this the first time.
   *
   * On a T-posed figure the widest point of the body is the fingertips, and
   * they are level with the shoulders, so "widest slice" and "shoulder line"
   * are the same answer and the shortcut looks correct. On an A-posed figure -
   * which is what the wife's model actually is, arms angled down with her hands
   * near her hips - the widest slice is her HANDS, half a metre below her
   * shoulders. The shoulder joint was placed at her waist, and bringing "the
   * arms" down folded her legs up instead.
   *
   * So the shoulder height comes from anatomy, which does not vary, and the
   * mesh is asked only about the things anatomy cannot know: how far out the
   * hands are, and how far down.
   */
  const shoulderY = height * H.shoulder;

  // The widest point anywhere, and the height it is at: the hands.
  let armTip = 0;
  let handSlice = Math.round(H.shoulder * SLICES);
  for (let s = 0; s < SLICES; s++) {
    if (reach[s] > armTip) {
      armTip = reach[s];
      handSlice = s;
    }
  }
  const handY = ((handSlice + 0.5) / SLICES) * height;

  /*
   * Half the width of the body at the armpit.
   *
   * Just below the shoulder line, which is the one height where the torso is at
   * its widest and the arm has not yet travelled anywhere - true of a T-pose
   * and of an A-pose alike, which is the whole reason to measure it there.
   */
  let torso = 0;
  const lo = Math.round(SLICES * 0.68);
  const hi = Math.round(SLICES * 0.76);
  for (let s = lo; s <= hi; s++) torso = Math.max(torso, reach[s]);
  const shoulderOut = Math.min(torso * 0.82, height * 0.13);

  /*
   * How far the arms already hang, measured from the shoulder to the hand.
   *
   * 0 is straight out sideways, 90 is straight down. Everything that wants to
   * pose the arms works from this rather than from a guess about which pose the
   * model was sculpted in - a T-pose measures near 0, an A-pose near 50, and a
   * model already standing naturally measures near 70 and is then left alone.
   */
  const run = Math.max(armTip - shoulderOut, 1e-4);
  const rise = shoulderY - handY;
  const hang = (Math.atan2(rise, run) * 180) / Math.PI;

  return {
    shoulderY,
    shoulderOut,
    armTip,
    handY,
    hang,
    // Halfway out along the arm, which is close enough to an elbow.
    elbowOut: shoulderOut + (armTip - shoulderOut) * 0.5,
    /** True if there is a meaningful amount of arm sticking out to work with. */
    posed: armTip - shoulderOut > height * 0.06,
  };
}

/**
 * Arms down.
 *
 * Turns a T-pose into something a person would stand in. The angle is per side
 * because the two arms rotate opposite ways about the same axis: +Z takes +X
 * downwards for a negative angle and -X downwards for a positive one.
 *
 * `amount` is 0..1 where 1 is "arms hanging straight down". A T-posed model
 * needs the full 75 degrees; an A-posed one needs about a third of that, and a
 * model whose arms already hang needs none at all.
 */
export function armsDown(fig, height, amount = 1) {
  const sh = fig.shoulderY;
  const out = fig.shoulderOut;
  const el = fig.elbowOut;

  /*
   * Rotate by what is MISSING, not by a fixed amount.
   *
   * `amount` used to be the angle, which meant the caller had to know which
   * pose the model had been sculpted in and pass 1 for a T-pose and 0.3 for an
   * A-pose - a number nobody can get right by looking, and wrong by fifty
   * degrees when they get it wrong. `hang` says where the arms already are, so
   * the joint only has to make up the difference, and the same call does the
   * right thing to any model.
   */
  const TARGET = 74;
  const a = Math.max(0, (TARGET - fig.hang) * amount) * D;
  const bend = Math.min(16, a * 25) * D; // a little elbow, so the arm is not a stick

  /*
   * Clear of the legs, and no higher.
   *
   * The sideways cut at `shoulderOut` is what actually separates an arm from a
   * torso, because an arm is the only thing that far out. This second gate only
   * has to keep the feet and shins out of it, so it sits at knee height - and
   * it matters that it is not higher. At waist height it cut each arm in two on
   * any model whose hands already hang below the waist, which is every model
   * sculpted standing: the shoulder took the upper arm, the gate refused the
   * forearm, and the arm tore between them.
   */
  const legs = { axis: "y", cut: height * 0.3, sign: 1, blend: height * 0.06 };

  if (a < 0.02) return []; // already standing like a person

  return [
    // right arm (+X)
    { pivot: [out, sh, 0], axis: [0, 0, 1], angle: -a, cut: out, axisOfCut: "x", sign: 1, blend: height * 0.035, gates: [legs] },
    { pivot: [el, sh - (el - out) * Math.tan(fig.hang * D), 0], axis: [1, 0, 0], angle: bend, cut: el, axisOfCut: "x", sign: 1, blend: height * 0.03, gates: [legs] },
    // left arm (-X)
    { pivot: [-out, sh, 0], axis: [0, 0, 1], angle: a, cut: -out, axisOfCut: "x", sign: -1, blend: height * 0.035, gates: [legs] },
    { pivot: [-el, sh - (el - out) * Math.tan(fig.hang * D), 0], axis: [1, 0, 0], angle: bend, cut: -el, axisOfCut: "x", sign: -1, blend: height * 0.03, gates: [legs] },
  ];
}

/**
 * Sitting.
 *
 * Hips to roughly square, knees to roughly square, which is a car seat. The
 * numbers are a little under ninety on purpose: a driving position is not a
 * right angle, the thighs slope down toward the knee and the shins slope back
 * under the seat, and a figure built from two exact right angles looks like
 * patio furniture.
 *
 * The legs swing toward -Z because every character in this game faces +Z, so
 * forward for them is +Z, and the thigh has to rotate about +X by a NEGATIVE
 * angle to lift the foot toward the front.
 */
export function seated(height, { lean = 0, spread = 4 } = {}) {
  const hip = height * H.hip;
  const knee = height * H.knee;
  /*
   * The knee angle MATCHES the hip angle, and that is not a coincidence.
   *
   * The thigh rotates forward by `a` and the shin has to come back by the same
   * amount to end up hanging vertically - the two rotations compose, so the
   * shin's angle from vertical is exactly (a + k). A couple of degrees of
   * daylight is a relaxed leg; eight degrees, which is what an unmatched pair
   * gave, is a leg that has been put on backwards.
   */
  const a = -82 * D;
  const k = 79 * D;

  const joints = [
    // Thighs forward, then shins back down under them.
    { pivot: [0, hip, 0], axis: [1, 0, 0], angle: a, cut: hip, axisOfCut: "y", sign: -1, blend: height * 0.045 },
    { pivot: [0, knee, 0], axis: [1, 0, 0], angle: k, cut: knee, axisOfCut: "y", sign: -1, blend: height * 0.04 },
  ];

  // Knees apart. Without it both legs occupy the same plane and the figure
  // looks like it is standing to attention while seated.
  if (spread) {
    // Gated to below the hips, or this rotates each arm outward too.
    const below = { axis: "y", cut: hip, sign: -1, blend: height * 0.04 };
    joints.push(
      { pivot: [0, hip, 0], axis: [0, 0, 1], angle: -spread * D, cut: 0.01, axisOfCut: "x", sign: 1, blend: height * 0.05, gates: [below] },
      { pivot: [0, hip, 0], axis: [0, 0, 1], angle: spread * D, cut: -0.01, axisOfCut: "x", sign: -1, blend: height * 0.05, gates: [below] },
    );
  }

  // A seated person's back is not vertical.
  if (lean) {
    joints.unshift({
      pivot: [0, hip * 1.02, 0], axis: [1, 0, 0], angle: lean * D,
      cut: hip * 1.02, axisOfCut: "y", sign: 1, blend: height * 0.09,
    });
  }

  return joints;
}

/**
 * Hands forward onto a steering wheel.
 *
 * Applied AFTER `armsDown`, in the same list, so the arm is already hanging by
 * the time the shoulder lifts it forward. Only the driver gets this; the
 * passenger's hands stay in her lap, which is what `armsDown` alone produces.
 */
export function handsForward(fig, height, amount = 1) {
  const sh = fig.shoulderY;
  const out = fig.shoulderOut;
  const lift = 58 * D * amount;
  const bend = 62 * D * amount;
  const legs = { axis: "y", cut: height * 0.3, sign: 1, blend: height * 0.06 };

  return [
    { pivot: [out, sh, 0], axis: [1, 0, 0], angle: -lift, cut: out * 0.92, axisOfCut: "x", sign: 1, blend: height * 0.04, gates: [legs] },
    { pivot: [-out, sh, 0], axis: [1, 0, 0], angle: -lift, cut: -out * 0.92, axisOfCut: "x", sign: -1, blend: height * 0.04, gates: [legs] },
    {
      pivot: [out, sh - height * 0.19, 0], axis: [1, 0, 0], angle: -bend,
      cut: sh - height * 0.19, axisOfCut: "y", sign: -1, blend: height * 0.035,
      gates: [{ axis: "x", cut: out * 0.92, sign: 1, blend: height * 0.04 }],
    },
    {
      pivot: [-out, sh - height * 0.19, 0], axis: [1, 0, 0], angle: -bend,
      cut: sh - height * 0.19, axisOfCut: "y", sign: -1, blend: height * 0.035,
      gates: [{ axis: "x", cut: -out * 0.92, sign: -1, blend: height * 0.04 }],
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * Applying a pose to a whole model
 * -------------------------------------------------------------------------- */

/**
 * Bend every static mesh under `root` into a named pose.
 *
 * `root` must be the node that models.js hands out - the one whose local space
 * has the character upright, in metres, with its feet on y=0 - because that is
 * the space the joint tables above are written in.
 *
 * Posed geometries are cached on the mesh by pose name, so a scene that cuts
 * back and forth between two poses pays for each exactly once. The name "base"
 * is reserved and restores the model as it was loaded.
 *
 * Skinned meshes are skipped: a model with a skeleton should be posed with it.
 */


export function applyPose(root, name, build) {
  root.updateMatrixWorld(true);
  const toPose = new THREE.Matrix4();
  const fromPose = new THREE.Matrix4();
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();

  root.traverse((node) => {
    if (!node.isMesh || node.isSkinnedMesh) return;

    node.userData.poses ??= new Map();
    if (!node.userData.basePose) node.userData.basePose = node.geometry;

    const cache = node.userData.poses;
    if (!cache.has(name)) {
      if (name === "base") {
        cache.set(name, node.userData.basePose);
      } else {
        // Mesh local -> root local. The root is where models.js leaves the
        // character: upright, in metres, feet on the floor plane.
        toPose.multiplyMatrices(invRoot, node.matrixWorld);
        fromPose.copy(toPose).invert();
        cache.set(name, bendGeometry(node.userData.basePose, build, toPose, fromPose));
      }
    }
    node.geometry = cache.get(name);
  });
}
