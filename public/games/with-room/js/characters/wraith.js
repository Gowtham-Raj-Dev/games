/**
 * The thing in the building.
 *
 * It is a FIGURE, not a cloud. The first version of this file was a cluster of
 * drifting smoke billboards, which was defensible on paper - something you
 * cannot resolve is frightening - and wrong in practice: smoke at the end of a
 * corridor reads as weather, and a player who is not sure whether they are
 * looking at anything is not frightened, they are confused.
 *
 * So this is a woman in a shroud, and every part of it is built to be read in
 * one glance and never looked at closely:
 *
 *   THE GOWN      a long torn shift, wider at the hem than the shoulders, that
 *                 moves on its own. It is the silhouette, and the silhouette is
 *                 what carries at twenty metres in fog.
 *   THE HAIR      a curtain of black hanging past the chest, PARTED BY NOTHING -
 *                 it covers where the face is. The hair is doing the work the
 *                 face would otherwise have to do, and it never disappoints the
 *                 way a modelled face does.
 *   THE FACE      a hollow. Unlit black geometry set back inside the hair, with
 *                 two pale points in it. There is deliberately nothing else: no
 *                 nose, no mouth, no jaw. A player fills that in themselves and
 *                 what they fill it in with is always worse.
 *   NO FEET       the gown trails off into smoke at the floor. Feet imply
 *                 walking, walking implies weight, and weight implies something
 *                 that obeys rules.
 *
 * It is also still cheap: one shared material per part, no skeleton, no
 * animation data - all the movement is arithmetic on a handful of vertices and
 * three rotations.
 *
 * If a `ghost.glb` has been dropped into assets/characters, the scenes use that
 * instead and none of this runs. See characters/models.js.
 */

import * as THREE from "three";

import { mat } from "../engine/materials.js";
import { clamp01, damp, lerp, makeRng, noise1 } from "../core/maths.js";
import { get as getPlatform } from "../core/platform.js";
import * as textures from "../engine/textures.js";

const seg = (low, med, high) => {
  const d = getPlatform().settings.propDetail;
  return d <= 0 ? low : d === 1 ? med : high;
};

/**
 * The gown, as rings from the shoulders down.
 *
 * [y, halfWidth, halfDepth]. It narrows at the waist and then flares hard,
 * because a shift hanging on a thin body does exactly that - and because a
 * silhouette that widens toward the floor reads as taller than it is.
 */
const GOWN = [
  [1.52, 0.1, 0.09],   // collar
  [1.44, 0.19, 0.14],  // shoulders
  [1.26, 0.2, 0.15],
  [1.05, 0.17, 0.13],  // waist
  [0.82, 0.22, 0.17],
  [0.55, 0.3, 0.23],
  [0.28, 0.4, 0.3],
  [0.06, 0.52, 0.4],   // hem
];

export function build(scene, { seed = 991 } = {}) {
  const rng = makeRng(seed);
  const detail = getPlatform().settings.propDetail;

  const root = new THREE.Group();
  root.name = "wraith";
  root.visible = false;
  scene.add(root);

  /* ---------------------------------------------------------------------- *
   * The gown
   *
   * Built as a tube through the rings above, then TORN: the bottom two rings
   * have their vertices pushed up and down at random so the hem is ragged
   * rather than a clean circle. One pass over the position attribute, done once
   * at build time.
   * ---------------------------------------------------------------------- */

  const segs = seg(10, 14, 20);
  const gownGeo = ringMesh(GOWN, segs);
  {
    const pos = gownGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0.34) continue;
      // Ragged, and more ragged the lower it goes.
      const k = 1 - y / 0.34;
      pos.setY(i, y + (rng() - 0.5) * 0.14 * k);
      pos.setX(i, pos.getX(i) * (1 + (rng() - 0.5) * 0.12 * k));
      pos.setZ(i, pos.getZ(i) * (1 + (rng() - 0.5) * 0.12 * k));
    }
    pos.needsUpdate = true;
    gownGeo.computeVertexNormals();
  }

  /*
   * Grey, not white, and barely lit.
   *
   * A white gown under this game's one warm bulb comes out cream and reads as
   * a nightdress. A desaturated grey that is slightly EMISSIVE reads as
   * something lit from nowhere, which is the entire point: it is the only
   * object in the game whose brightness does not depend on the room.
   */
  const gownMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a2,
    roughness: 0.92,
    metalness: 0,
    emissive: 0x2a3034,
    emissiveIntensity: 0.6,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const gown = new THREE.Mesh(gownGeo, gownMat);
  gown.castShadow = false;
  gown.receiveShadow = false;
  root.add(gown);

  /* ---------------------------------------------------------------------- *
   * Head, face hollow and hair
   * ---------------------------------------------------------------------- */

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.62;
  root.add(headGroup);

  // The skull: the same grey as the gown, and only ever seen as a pale shape
  // behind hair.
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, seg(12, 16, 22), seg(10, 12, 16)),
    gownMat,
  );
  skull.scale.set(0.82, 1.08, 0.92);
  headGroup.add(skull);

  /*
   * The hollow where a face would be.
   *
   * An unlit black disc, set INSIDE the skull sphere and slightly larger than
   * the opening, so from the front there is a hole and from the side there is
   * nothing to see. `fog: false` so it stays absolutely black at any distance -
   * fogging it to grey would turn the hollow into a smudge.
   */
  const faceMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
  });
  const hollow = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), faceMat);
  hollow.position.z = 0.03;
  hollow.scale.set(1, 1.05, 0.6);
  hollow.renderOrder = 5;
  headGroup.add(hollow);

  /*
   * The eyes.
   *
   * Two small additive points, unlit and unfogged, so they are the first thing
   * visible from the far end of a corridor and the last thing to fade. They do
   * not blink - they GUTTER, on two different clocks, which is wrong in a way
   * that is hard to name.
   */
  const eyeMat = mat.beam(0xd8e4ea, 0).clone();
  eyeMat.opacity = 0;
  const eyeGeo = new THREE.PlaneGeometry(0.034, 0.019);
  const eyes = [];
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    // Far enough forward to glint THROUGH the hair rather than behind it. The
    // hair is what hides the face; the eyes are what says there is one.
    e.position.set(side * 0.03, 0.014, 0.093);
    e.renderOrder = 7;
    eyes.push(e);
    headGroup.add(e);
  }

  /*
   * Hair.
   *
   * Flat curved sheets falling from the crown to below the chest, hanging in
   * FRONT of the face as well as behind it. The front curtain is the important
   * one: it is what hides the hollow, so the hollow is a suggestion rather than
   * a hole somebody can study.
   */
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0c,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const hair = new THREE.Group();
  headGroup.add(hair);

  const strands = seg(6, 10, 14);
  const hairPieces = [];
  for (let i = 0; i < strands; i++) {
    const t = i / (strands - 1);
    // Fanned right around the head, including across the face.
    const a = lerp(-2.6, 2.6, t) + (rng() - 0.5) * 0.2;
    const len = 0.44 + rng() * 0.34;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.sin(a) * 0.085, 0.07, Math.cos(a) * 0.085),
      new THREE.Vector3(Math.sin(a) * 0.1, -0.06, Math.cos(a) * 0.1),
      new THREE.Vector3(Math.sin(a) * 0.105, -0.24, Math.cos(a) * 0.1),
      new THREE.Vector3(
        Math.sin(a) * (0.09 + rng() * 0.05),
        -len,
        Math.cos(a) * (0.08 + rng() * 0.05),
      ),
    ]);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, seg(5, 8, 12), 0.016 + rng() * 0.012, seg(4, 5, 7), false),
      hairMat,
    );
    tube.scale.x = 1.6;
    hair.add(tube);
    hairPieces.push({ mesh: tube, phase: rng() * 40, rate: 0.2 + rng() * 0.3 });
  }

  /* ---------------------------------------------------------------------- *
   * Arms
   *
   * Thin, far too long, and hidden inside the gown until it reaches. Length is
   * the whole trick: an arm that comes down past the knee is the clearest
   * possible statement that this is not a person, and it costs one number.
   * ---------------------------------------------------------------------- */

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.17, 1.42, 0);
    arm.rotation.z = side * 0.12;
    root.add(arm);

    const upper = new THREE.Mesh(
      ringMesh(
        [
          [0, 0.035, 0.032],
          [-0.3, 0.028, 0.026],
          [-0.56, 0.022, 0.02],
        ],
        seg(6, 8, 10),
      ),
      gownMat,
    );
    arm.add(upper);

    const hand = new THREE.Group();
    hand.position.y = -0.56;
    arm.add(hand);
    const palm = new THREE.Mesh(
      ringMesh(
        [
          [0, 0.026, 0.016],
          [-0.07, 0.03, 0.014],
          [-0.11, 0.022, 0.01],
        ],
        seg(5, 7, 9),
      ),
      gownMat,
    );
    hand.add(palm);
    // Fingers: four thin tapers, far longer than a hand should have.
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(
        ringMesh(
          [
            [0, 0.007, 0.006],
            [-0.09, 0.005, 0.004],
            [-0.15, 0.002, 0.002],
          ],
          4,
        ),
        gownMat,
      );
      finger.position.set((f - 1.5) * 0.015, -0.11, 0);
      finger.rotation.z = (f - 1.5) * 0.1;
      hand.add(finger);
    }

    arms.push({ group: arm, side });
  }

  /* ---------------------------------------------------------------------- *
   * What it stands in
   *
   * Three smoke billboards at the hem, so the gown does not end at a visible
   * edge. They are the only thing left of the old smoke-cluster version, and
   * this is the one job that was always right for them.
   * ---------------------------------------------------------------------- */

  const smokeMat = mat.smoke(0x05070a, 0).clone();
  smokeMat.opacity = 0;
  const smokeGeo = new THREE.PlaneGeometry(1, 1);
  const puffs = [];
  for (let i = 0; i < seg(2, 3, 4); i++) {
    const m = new THREE.Mesh(smokeGeo, smokeMat);
    m.position.set((rng() - 0.5) * 0.3, 0.16 + rng() * 0.12, (rng() - 0.5) * 0.2);
    m.scale.setScalar(0.9 + rng() * 0.6);
    m.renderOrder = 4;
    root.add(m);
    puffs.push({ mesh: m, base: m.position.clone(), phase: rng() * 50, rate: 0.25 + rng() * 0.3 });
  }

  /* ---------------------------------------------------------------------- *
   * State
   * ---------------------------------------------------------------------- */

  const S = {
    time: 0,
    presence: 0,
    want: 0,
    reach: 0,
    wantReach: 0,
    fury: 0,
    wantFury: 0,
    float: 0,
  };

  const _camPos = new THREE.Vector3();
  const _toCam = new THREE.Vector3();

  function update(dt, camera) {
    S.time += dt;

    // Arrives slowly, leaves fast. Something that fades out at the speed it
    // faded in reads as a dissolve; something suddenly absent reads as gone.
    const rate = S.want > S.presence ? 1.1 : 3.4;
    S.presence = damp(S.presence, S.want, rate, dt);
    S.reach = damp(S.reach, S.wantReach, 5, dt);
    S.fury = damp(S.fury, S.wantFury, 3, dt);

    root.visible = S.presence > 0.004;
    if (!root.visible) return;

    const p = S.presence;
    gownMat.opacity = p * 0.9;
    hairMat.opacity = p;
    faceMat.opacity = p;
    smokeMat.opacity = p * 0.5;
    // The eyes come up LAST, in the final third of the fade, so the shape
    // arrives before the thing looking out of it.
    eyeMat.opacity = Math.max(0, p - 0.45) * 1.9;

    /* --- face the player ------------------------------------------------ */
    if (camera) {
      camera.getWorldPosition(_camPos);
      root.getWorldPosition(_toCam);
      _toCam.subVectors(_camPos, _toCam);
      // Yaw only: a figure that tips to track a camera's height stops being a
      // figure and becomes a billboard.
      root.rotation.y = Math.atan2(_toCam.x, _toCam.z);
    }

    /* --- it floats ------------------------------------------------------- */
    // Slow, and never still. The vertical drift is what removes the floor.
    S.float = noise1(S.time * 0.31) * 0.05 + Math.sin(S.time * 0.47) * 0.02;
    root.position.y = S.float + S.fury * 0.12;

    // A slight lean, and a sway. Both tiny, both constant.
    root.rotation.z = noise1(S.time * 0.23 + 4) * 0.035 * (1 + S.fury * 3);
    root.rotation.x = noise1(S.time * 0.19 + 8) * 0.02;

    /* --- the gown and the hair move independently of it ------------------ */
    const agitation = 1 + S.fury * 4;
    for (const h of hairPieces) {
      const t = S.time * h.rate * agitation + h.phase;
      h.mesh.rotation.z = noise1(t) * 0.1 * agitation;
      h.mesh.rotation.x = noise1(t * 0.7 + 11) * 0.07 * agitation;
    }
    for (const puff of puffs) {
      const t = S.time * puff.rate + puff.phase;
      puff.mesh.position.x = puff.base.x + noise1(t) * 0.1;
      puff.mesh.position.z = puff.base.z + noise1(t * 0.8 + 3) * 0.08;
      puff.mesh.rotation.z += dt * 0.2;
    }

    /* --- the eyes -------------------------------------------------------- */
    for (let i = 0; i < eyes.length; i++) {
      const g = 0.5 + noise1(S.time * (2.3 + i * 0.5) + i * 17) * 0.5;
      eyes[i].scale.y = 0.55 + g * 0.7;
      eyes[i].scale.x = 0.9 + g * 0.25;
    }

    /* --- the arms -------------------------------------------------------- */
    for (const arm of arms) {
      // Down and inside the gown at rest; out and forward when it reaches.
      arm.group.rotation.x = lerp(0.05, -1.5, S.reach);
      arm.group.rotation.z = arm.side * lerp(0.12, 0.5, S.reach);
      arm.group.visible = S.reach > 0.02;
    }
  }

  return {
    root,
    appear(level = 1) {
      S.want = clamp01(level);
    },
    vanish() {
      S.want = 0;
      S.wantReach = 0;
      S.wantFury = 0;
    },
    reach(on = true) {
      S.wantReach = on ? 1 : 0;
    },
    fury(level) {
      S.wantFury = clamp01(level);
    },
    place(x, y, z) {
      root.position.set(x, y, z);
    },
    get presence() {
      return S.presence;
    },
    update,
    dispose() {
      gownGeo.dispose();
      smokeGeo.dispose();
      eyeGeo.dispose();
      gownMat.dispose();
      hairMat.dispose();
      faceMat.dispose();
      eyeMat.dispose();
      smokeMat.dispose();
      root.traverse((n) => {
        if (n.isMesh && n.geometry && n.geometry !== gownGeo) n.geometry.dispose();
      });
      root.removeFromParent();
    },
  };
}

/* -------------------------------------------------------------------------- *
 * A surface of revolution through elliptical rings.
 *
 * The same shape-building helper the human rig uses, kept local rather than
 * shared: this file wants it for a gown and an arm, that one wants it for a
 * torso, and a shared version would end up carrying both sets of requirements.
 * -------------------------------------------------------------------------- */

function ringMesh(rings, segs) {
  const rows = rings.length;
  const verts = [];
  const uvs = [];
  const indices = [];

  for (let r = 0; r < rows; r++) {
    const [y, hw, hd] = rings[r];
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      verts.push(Math.sin(a) * hw, y, Math.cos(a) * hd);
      uvs.push(s / segs, r / (rows - 1));
    }
  }

  const stride = segs + 1;
  for (let r = 0; r < rows - 1; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * stride + s;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
