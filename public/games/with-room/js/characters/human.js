/**
 * The people.
 *
 * Two characters - a husband and a wife - built from geometry at runtime,
 * because this game ships no model files and cannot: everything in it is
 * generated, and a 40 MB rigged GLB would be larger than the rest of the build
 * put together.
 *
 * That constraint turns out to decide the whole approach. A believable human
 * at cutscene distance is NOT a question of polygon count. In order of how much
 * each one actually buys:
 *
 *   1. PROPORTION. Seven and a half heads tall, shoulders two heads wide, the
 *      elbow at the navel, the wrist at the crotch, the eyes halfway down the
 *      skull - not a third of the way, which is where everybody puts them and
 *      is why hand-made heads look like children. Get the measurements right
 *      and crude geometry reads as a person; get them wrong and no amount of
 *      detail rescues it.
 *   2. THE EYES. Wet, with a visible catchlight, a dark limbus, and the two of
 *      them converging on something. A blink on a human schedule. Saccades.
 *      More of "alive" lives in two 12 mm spheres than in the entire body.
 *   3. MICRO-MOTION. Nobody is ever still. Breath, weight shifts, the head
 *      drifting a degree or two, the eyes flicking. A character that holds a
 *      pose is a mannequin no matter how good the pose is.
 *   4. SILHOUETTE. The outline carries at any distance and in any light, which
 *      in a game this dark is most of what is ever visible. Hence the torso is
 *      a surface of revolution through authored ELLIPTICAL rings rather than a
 *      capsule: a capsule has no shoulders, and shoulders are the silhouette.
 *   5. MATERIAL. Skin is rough diffuse under a thin specular film; see
 *      engine/materials.js `face`.
 *
 * Only then does detail matter, and the detail here is spent exactly where the
 * camera goes: the face. The feet are two boxes.
 *
 * CONSISTENCY. The brief is explicit that the two characters must look the same
 * in every scene, so a character is built ONCE and cached by id. The car scene,
 * the flashback and the ending are handed the same object, re-posed. There is no
 * code path that can produce a second, differently-proportioned husband.
 */

import * as THREE from "three";

import { mat } from "../engine/materials.js";
import { clamp, clamp01, damp, lerp, makeRng, noise1 } from "../core/maths.js";
import { get as getPlatform } from "../core/platform.js";
import * as models from "./models.js";
import * as posekit from "./pose.js";

/* -------------------------------------------------------------------------- *
 * The two people
 *
 * Everything that differs between them, in one table. Nothing below reads
 * `who` - it reads these numbers - so a third character is a row here.
 * -------------------------------------------------------------------------- */

export const PRESETS = {
  him: {
    height: 1.78,
    /** Head height in metres. 1.78 / 0.232 is 7.67 heads: an adult male. */
    headH: 0.232,
    headW: 0.152,
    headD: 0.198,
    /** Jaw: wider and squarer. This single number is most of "male face". */
    jawWidth: 1.0,
    jawDepth: 1.0,
    browRidge: 1.0,
    cheek: 0.75,
    lipFull: 0.8,
    neckR: 0.062,
    shoulder: 0.215,
    skinTone: 0.42,
    /*
     * Nearly white, because the TONE is already in the texture.
     *
     * `textures.skin(tone)` paints a full skin colour; multiplying that by a
     * second brown here applied the tone twice and both characters came out
     * the colour of terracotta. The material colour is now a slight warm trim
     * on a map that is already right.
     */
    skinColour: 0xc2a894,
    lipColour: 0x9c6f60,
    hair: { style: "short", shade: "dark", colour: 0x171310 },
    eye: "brown",
    /** Torso rings: [y, half-width, half-depth]. See `torsoGeometry`. */
    torso: [
      [0.0, 0.158, 0.112],
      [0.075, 0.149, 0.105],
      [0.165, 0.166, 0.119],
      [0.255, 0.192, 0.133],
      [0.325, 0.202, 0.127],
      [0.375, 0.185, 0.113],
      [0.415, 0.122, 0.096],
    ],
    garment: {
      top: 0x2f3338,
      topRough: 0.9,
      sleeve: "long",
      trouser: 0x24262a,
      /* An open jacket over a shirt. Two colours and a vertical opening down
       * the front is the cheapest way to stop a torso being one slab, and the
       * lapels widen the shoulder line, which is most of "adult male" in a
       * silhouette. */
      jacket: 0x1a1d21,
      shirt: 0x5c5f63,
      collar: "jacket",
      belt: 0x171717,
      shoe: 0x14151a,
    },
    bust: 0,
  },

  her: {
    height: 1.655,
    headH: 0.219,
    headW: 0.142,
    headD: 0.187,
    jawWidth: 0.82,
    jawDepth: 0.9,
    browRidge: 0.45,
    cheek: 1.0,
    lipFull: 1.15,
    neckR: 0.053,
    shoulder: 0.178,
    skinTone: 0.36,
    skinColour: 0xc8b0a0,
    lipColour: 0xa3685f,
    hair: { style: "long", shade: "dark", colour: 0x1b1512 },
    eye: "hazel",
    torso: [
      [0.0, 0.166, 0.108],
      [0.072, 0.134, 0.094],
      [0.158, 0.148, 0.112],
      [0.242, 0.164, 0.126],
      [0.308, 0.162, 0.111],
      [0.355, 0.152, 0.1],
      [0.395, 0.106, 0.086],
    ],
    garment: {
      top: 0x58403c,
      topRough: 0.95,
      sleeve: "short",
      trouser: 0x2b2b31,
      /* A long cardigan rather than a jacket: it falls past the hip, which
       * lengthens her and separates her shape from his at a glance. */
      jacket: 0x3b2e2c,
      shirt: 0x7a5f58,
      collar: "round",
      belt: null,
      shoe: 0x191418,
    },
    bust: 0.028,
  },
};

/** Built characters, by id. The brief's consistency rule, enforced in code. */
const cache = new Map();

/* -------------------------------------------------------------------------- *
 * Geometry helpers
 * -------------------------------------------------------------------------- */

const seg = (low, med, high) => {
  const d = getPlatform().settings.propDetail;
  return d <= 0 ? low : d === 1 ? med : high;
};

/**
 * A surface of revolution through elliptical rings.
 *
 * `rings` is [y, halfWidth, halfDepth] and optionally a fourth value, a forward
 * offset, which is what gives a chest a bust or a back a slouch. Each ring is
 * an ellipse rather than a circle, because no part of a human body is round in
 * cross-section and a circular torso is the clearest possible signal that
 * something was built out of cylinders.
 *
 * Built by hand rather than with LatheGeometry for exactly that reason: Lathe
 * revolves a profile and can only produce circular cross-sections.
 */
function ringMesh(rings, segs, { capTop = true, capBottom = true } = {}) {
  const rows = rings.length;
  const verts = [];
  const uvs = [];
  const indices = [];

  for (let r = 0; r < rows; r++) {
    const [y, hw, hd, dz = 0] = rings[r];
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      verts.push(Math.sin(a) * hw, y, Math.cos(a) * hd + dz);
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

  // Caps are a fan to a centre vertex at the ring's own height. Flat, and never
  // seen: the top is inside the neck and the bottom inside the hips.
  const capFan = (rowIndex, flip) => {
    const [y, , , dz = 0] = rings[rowIndex];
    const centre = verts.length / 3;
    verts.push(0, y, dz);
    uvs.push(0.5, 0.5);
    for (let s = 0; s < segs; s++) {
      const a = rowIndex * stride + s;
      if (flip) indices.push(centre, a + 1, a);
      else indices.push(centre, a, a + 1);
    }
  };
  if (capBottom) capFan(0, true);
  if (capTop) capFan(rows - 1, false);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Half a surface of revolution, left or right.
 *
 * The jacket is two panels with a gap down the front, and a gap is the whole
 * reason the jacket reads as a jacket: a closed tube over a torso is just a
 * second torso. `side` picks which half, and both run from the back seam round
 * to a front edge that stops short of the midline.
 */
function halfRingMesh(rings, segs, side) {
  const rows = rings.length;
  const verts = [];
  const uvs = [];
  const indices = [];

  // From the back (PI) round to just short of the front (0.16 rad off centre),
  // in the direction `side` points.
  const from = Math.PI;
  const to = side * 0.16;

  for (let r = 0; r < rows; r++) {
    const [y, hw, hd, dz = 0] = rings[r];
    for (let s = 0; s <= segs; s++) {
      const a = lerp(from * side, to, s / segs);
      verts.push(Math.sin(a) * hw, y, Math.cos(a) * hd + dz);
      uvs.push(s / segs, r / (rows - 1));
    }
  }

  const stride = segs + 1;
  for (let r = 0; r < rows - 1; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * stride + s;
      const b = a + stride;
      if (side < 0) indices.push(a, b, a + 1, b, b + 1, a + 1);
      else indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * A limb: a tapered tube with a bulge, round at both ends.
 *
 * The bulge is the whole reason this is not a capsule. An upper arm is widest a
 * third of the way down (the biceps), a calf two fifths of the way down, a
 * thigh at the top. A limb of constant radius is the second clearest signal
 * that a body was built out of primitives, after the circular torso.
 *
 * Built along +Y from the joint at the origin DOWNWARD, matching the pivot
 * convention below: every joint rotates about its own top.
 */
function limbGeometry(len, rTop, rBulge, rBot, bulgeAt = 0.35) {
  const segs = seg(6, 9, 14);
  const rows = seg(5, 7, 9);
  const rings = [];
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    // Two quadratics joined at the bulge, so the widest point lands exactly
    // where it was asked for instead of at the midpoint.
    const r =
      t < bulgeAt
        ? lerp(rTop, rBulge, smooth(t / bulgeAt))
        : lerp(rBulge, rBot, smooth((t - bulgeAt) / (1 - bulgeAt)));
    rings.push([-t * len, r, r * 0.92]);
  }
  // Round the ends by pinching the first and last rings in, which is cheaper
  // and reads identically to a hemisphere cap at this scale.
  rings.unshift([0.012, rTop * 0.72, rTop * 0.66]);
  rings.push([-len - 0.012, rBot * 0.7, rBot * 0.64]);
  return ringMesh(rings, segs);
}

const smooth = (t) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/* -------------------------------------------------------------------------- *
 * The head
 *
 * A sphere, scaled to a skull, then pushed about by a list of named features.
 * Each feature is a smooth radial bump or dent at a point, and the list reads
 * like a description of a face - which is the point: the alternative is three
 * hundred lines of hand-placed vertices that nobody can ever edit again.
 *
 * The measurements are from life, not from invention:
 *   - the eyes sit at HALF the skull's height, not a third
 *   - the ears run from the eye line to the base of the nose
 *   - the mouth is a third of the way from the nose to the chin
 *   - the skull is deeper than it is wide
 * -------------------------------------------------------------------------- */

function headGeometry(p) {
  const wSeg = seg(16, 24, 34);
  const hSeg = seg(12, 18, 26);
  const g = new THREE.SphereGeometry(0.5, wSeg, hSeg);

  const pos = g.attributes.position;
  const hw = p.headW / 2;
  const hh = p.headH / 2;
  const hd = p.headD / 2;

  /*
   * Features, in head-local metres with the skull centre at the origin.
   *
   * amp > 0 pushes outward along the surface normal, amp < 0 inward. `fall`
   * controls the falloff curve: 2 is a soft dome, 4 is a tight dimple.
   */
  const ex = hw * 0.46;       // eye centre, from the midline
  const ey = 0;               // eye line: the middle of the skull
  const features = [
    // Brow ridge. One continuous ridge rather than two, because it is one bone.
    { at: [0, hh * 0.22, hd * 0.86], r: hw * 1.15, amp: 0.004 * p.browRidge, fall: 2.4 },
    // Glabella: the flat between the brows. Without it the ridge reads as a
    // single bar and the face looks like a helmet.
    { at: [0, hh * 0.2, hd * 0.95], r: hw * 0.3, amp: -0.0022, fall: 3 },
    // Eye sockets.
    { at: [ex, ey + hh * 0.06, hd * 0.8], r: hw * 0.46, amp: -0.0085, fall: 2.6 },
    { at: [-ex, ey + hh * 0.06, hd * 0.8], r: hw * 0.46, amp: -0.0085, fall: 2.6 },
    // Cheekbones, out and forward.
    { at: [hw * 0.82, -hh * 0.1, hd * 0.52], r: hw * 0.62, amp: 0.005 * p.cheek, fall: 2.2 },
    { at: [-hw * 0.82, -hh * 0.1, hd * 0.52], r: hw * 0.62, amp: 0.005 * p.cheek, fall: 2.2 },
    // The hollow under them. This is the single feature that stops a head
    // looking like a baby's: an adult face has planes, and planes need valleys.
    { at: [hw * 0.72, -hh * 0.34, hd * 0.58], r: hw * 0.5, amp: -0.0045, fall: 2.6 },
    { at: [-hw * 0.72, -hh * 0.34, hd * 0.58], r: hw * 0.5, amp: -0.0045, fall: 2.6 },
    // Temples. A dent, not a bulge - and the reason a bald skull reads as a
    // skull.
    { at: [hw * 0.92, hh * 0.42, hd * 0.2], r: hw * 0.5, amp: -0.004, fall: 2.8 },
    { at: [-hw * 0.92, hh * 0.42, hd * 0.2], r: hw * 0.5, amp: -0.004, fall: 2.8 },
    // Chin: forward and slightly up, with a crease above it.
    { at: [0, -hh * 0.84, hd * 0.72], r: hw * 0.46, amp: 0.006, fall: 2.4 },
    { at: [0, -hh * 0.6, hd * 0.86], r: hw * 0.3, amp: -0.0028, fall: 3.2 },
    // Jaw corners. Square for him, soft for her: `jawWidth` does the work.
    { at: [hw * 0.86, -hh * 0.56, -hd * 0.08], r: hw * 0.56, amp: 0.004 * p.jawWidth, fall: 2.2 },
    { at: [-hw * 0.86, -hh * 0.56, -hd * 0.08], r: hw * 0.56, amp: 0.004 * p.jawWidth, fall: 2.2 },
    // Occiput: the back of the skull is not a hemisphere, it bulges low.
    { at: [0, -hh * 0.1, -hd * 0.92], r: hw * 1.1, amp: 0.006, fall: 2 },
    // Upper lip shelf and the philtrum above it.
    { at: [0, -hh * 0.44, hd * 0.9], r: hw * 0.34, amp: 0.0022 * p.lipFull, fall: 2.8 },
    // Crown, raised very slightly: a sphere's top is too flat for a skull.
    { at: [0, hh * 0.94, -hd * 0.1], r: hw * 0.9, amp: 0.004, fall: 2 },
  ];

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    // Start on the unit sphere, so the normal is the position.
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    // Scale into skull proportions: taller than wide, deeper than tall.
    v.set(n.x * hw, n.y * hh, n.z * hd);

    /*
     * Global jaw taper, before the features.
     *
     * The lower third of a head is dramatically narrower than the upper two
     * thirds, front to back as well as side to side. Doing this as a global
     * shape rather than as features is what makes the chin a chin instead of a
     * lump on the bottom of a ball.
     */
    const ny = v.y / hh;
    if (ny < 0.1) {
      const t = smooth((0.1 - ny) / 1.1);
      const taper = 1 - t * 0.46 * (2 - p.jawWidth);
      v.x *= taper;
      // Back of the jaw tucks under much harder than the front: that is the
      // shape of a mandible seen from above.
      v.z *= v.z < 0 ? 1 - t * 0.5 * p.jawDepth : 1 - t * 0.14;
    }

    // The face is flatter than a sphere: everything forward of centre is
    // pulled back toward a plane, which is what gives a profile.
    if (v.z > 0) v.z *= 0.94;

    // Features.
    for (const f of features) {
      const dx = v.x - f.at[0];
      const dy = v.y - f.at[1];
      const dz = v.z - f.at[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= f.r) continue;
      const w = Math.pow(1 - d / f.r, f.fall);
      v.addScaledVector(n, f.amp * w);
    }

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** The nose, as its own small mesh. */
function noseGeometry(p) {
  const hw = p.headW / 2;
  const hh = p.headH / 2;
  const hd = p.headD / 2;
  const segs = seg(6, 8, 12);

  /*
   * Rings down the length of the nose, bridge to tip.
   *
   * The numbers are small and they have to be: a nose is about 4 cm wide and
   * projects about 2 cm, and a nose built to look right in isolation is a beak
   * once it is on a face. The whole form sits mostly INSIDE the skull - only
   * the last centimetre of it is outside the surface - so the silhouette is a
   * nose rather than a cone stuck to a sphere, which is what the first pass
   * produced.
   */
  const rings = [
    [hh * 0.16, hw * 0.1, hd * 0.07],
    [hh * 0.02, hw * 0.095, hd * 0.1],
    [-hh * 0.12, hw * 0.11, hd * 0.145],
    [-hh * 0.24, hw * 0.15, hd * 0.185],
    [-hh * 0.31, hw * 0.19, hd * 0.19],
    [-hh * 0.35, hw * 0.17, hd * 0.12],
  ];
  const g = ringMesh(
    rings.map(([y, w, d]) => [y, w, d, hd * 0.52]),
    segs,
  );
  return g;
}

/** An ear: a flattened disc with a rim and a hollow. */
function earGeometry(p) {
  const h = p.headH * 0.26;
  const segs = seg(7, 10, 14);
  const rings = [
    [h * 0.5, h * 0.17, h * 0.05],
    [h * 0.22, h * 0.26, h * 0.1],
    [-h * 0.1, h * 0.24, h * 0.1],
    [-h * 0.36, h * 0.16, h * 0.07],
    [-h * 0.5, h * 0.08, h * 0.04],
  ];
  const g = ringMesh(rings, segs);
  // Rotate so the disc faces sideways: built in the XY plane, worn on the side
  // of a head.
  g.rotateY(Math.PI / 2);
  g.scale(1, 1, 0.55);
  return g;
}

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

/**
 * Build - or return - a character.
 *
 * The returned object is a rig with a flat `parts` map and an `update`. Nothing
 * outside this file touches a part's transform except through a pose, so the
 * joint conventions below are local knowledge and can be changed freely.
 *
 * JOINT CONVENTION, which every pose depends on: every limb group has its
 * origin AT ITS JOINT and its geometry hanging down -Y from there. A shoulder
 * is therefore one rotation, an elbow is one rotation on a child of it, and no
 * pose anywhere needs to compute a position.
 */
export function build(who = "him") {
  const existing = cache.get(who);
  if (existing) return existing;

  /*
   * A real model wins, every time.
   *
   * Everything below this line is the fallback: a person built out of rings and
   * joints, which is remarkable for what it is and still not a human being. If
   * somebody has put a .glb on disk, that is used instead and the rest of the
   * game never finds out - `makeModelRig` returns the same object shape, so the
   * car scene, the flashback and the lobby are identical either way.
   */
  const model = models.instance(who);
  if (model) {
    const rig = makeModelRig(who, model);
    cache.set(who, rig);
    return rig;
  }

  const p = PRESETS[who] ?? PRESETS.him;
  const rng = makeRng(who === "her" ? 8821 : 4409);

  /* --- proportions, derived once ------------------------------------------ */
  const H = p.height;
  const hipY = H * 0.52;            // top of the pelvis
  const shoulderY = H * 0.82;       // acromion
  const headBase = H * 0.868;       // where the neck meets the skull
  const thighLen = H * 0.245;
  const shinLen = H * 0.235;
  const upperArm = H * 0.172;
  const foreArm = H * 0.152;
  const handLen = H * 0.108;

  /* --- materials ---------------------------------------------------------- */
  const skinMat = mat.face(p.skinTone, p.skinColour);
  const hairMat = mat.hair(p.hair.shade, p.hair.colour);
  const topMat = mat.cloth(p.garment.top, p.garment.topRough);
  const legMat = mat.cloth(p.garment.trouser, 0.88);
  const shoeMat = mat.cloth(0x14151a, 0.6);
  const eyeMat = mat.eye(p.eye);
  const lipMat = mat.lip(p.lipColour);
  const mouthMat = mat.mouth();

  const root = new THREE.Group();
  root.name = `human:${who}`;

  const parts = {};
  const mesh = (geo, material, parent, cast = true) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  /* ---------------------------------------------------------------------- *
   * Spine
   *
   * hips -> spine -> chest -> neck -> head, each a child of the last, so one
   * rotation at the hips leans the whole body and one at the neck turns only
   * the head. Four joints is enough for every pose in this game and is the
   * most that can be animated by hand without a solver.
   * ---------------------------------------------------------------------- */

  const hips = new THREE.Group();
  hips.position.y = hipY;
  root.add(hips);
  parts.hips = hips;

  const spine = new THREE.Group();
  hips.add(spine);
  parts.spine = spine;

  const chest = new THREE.Group();
  // The chest pivots above the waist, not at the hip: bending at the hip is a
  // bow, bending at the waist is a slouch, and they look nothing alike.
  chest.position.y = (shoulderY - hipY) * 0.42;
  spine.add(chest);
  parts.chest = chest;

  /* --- torso ------------------------------------------------------------- */
  // Rings are authored in a 0..0.42 space and scaled to the real span, so the
  // two presets can share a shape and differ in size.
  const span = shoulderY - hipY;
  const torsoRings = p.torso.map(([y, w, d], i) => [
    (y / 0.415) * span - chest.position.y,
    w * (H / 1.78),
    d * (H / 1.78),
    // The bust, as a forward offset on the two rings that carry it. A shape in
    // the silhouette, which is where it belongs, rather than two spheres.
    i === 3 ? p.bust : i === 4 ? p.bust * 0.4 : 0,
  ]);
  /*
   * The torso, with FOLDS.
   *
   * A surface of revolution is perfectly smooth, and cloth is not: a shirt on a
   * body has vertical creases where it hangs off the chest and gathers at the
   * waist. Pushing every other column of vertices in by a couple of millimetres
   * costs nothing and gives the whole garment something for the light to catch,
   * which at the distance these are seen is the difference between "a shirt"
   * and "a painted cylinder".
   */
  const torsoGeo = ringMesh(torsoRings, seg(10, 14, 20));
  {
    const pos = torsoGeo.attributes.position;
    const uv = torsoGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      // Six creases around, deepest at the waist and fading out at the
      // shoulders where the cloth is pulled tight.
      const crease = Math.cos(u * Math.PI * 2 * 6) * 0.5 + 0.5;
      const gather = Math.sin(v * Math.PI) * 0.6 + 0.2;
      const k = 1 - crease * gather * 0.035;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    pos.needsUpdate = true;
    torsoGeo.computeVertexNormals();
  }
  parts.torso = mesh(torsoGeo, topMat, chest);

  /* --- the jacket, over the top ------------------------------------------ *
   * Two panels down the front and a collar, all slightly outside the torso.
   * They are separate meshes rather than part of it because a jacket IS a
   * separate thing: it has an edge, and that edge is the detail doing the work.
   */
  const jacketMat = mat.cloth(p.garment.jacket, 0.88);
  const jacketRings = torsoRings
    .filter(([y]) => y < span * 0.95)
    .map(([y, w, d, dz]) => [y, w * 1.055, d * 1.06, dz]);
  // Dropped lower than the shirt: a jacket hangs past the waist.
  jacketRings.unshift([torsoRings[0][0] - span * 0.16, torsoRings[0][1] * 1.02, torsoRings[0][2] * 1.03, 0]);

  for (const side of [-1, 1]) {
    // Half a tube each, left and right, with a gap down the middle where the
    // shirt shows through.
    const panel = new THREE.Mesh(
      halfRingMesh(jacketRings, seg(7, 10, 14), side),
      jacketMat,
    );
    panel.castShadow = true;
    panel.receiveShadow = true;
    chest.add(panel);
  }

  // The collar: a short flared band around the neck opening.
  const collar = new THREE.Mesh(
    ringMesh(
      [
        [span - chest.position.y - H * 0.055, p.neckR * 1.5, p.neckR * 1.45],
        [span - chest.position.y + H * 0.012, p.neckR * 2.1, p.neckR * 1.95],
      ],
      seg(8, 12, 16),
      { capTop: false, capBottom: false },
    ),
    jacketMat,
  );
  collar.castShadow = true;
  chest.add(collar);

  // The belt, where there is one. One dark band at the waist, and it reads as a
  // waist from across a room.
  if (p.garment.belt) {
    const beltY = torsoRings[1][0];
    const belt = new THREE.Mesh(
      ringMesh(
        [
          [beltY - H * 0.012, torsoRings[1][1] * 1.03, torsoRings[1][2] * 1.04],
          [beltY + H * 0.012, torsoRings[1][1] * 1.03, torsoRings[1][2] * 1.04],
        ],
        seg(8, 12, 16),
        { capTop: false, capBottom: false },
      ),
      mat.cloth(p.garment.belt, 0.5),
    );
    chest.add(belt);
  }

  /* --- shoulders --------------------------------------------------------- */
  // Deltoids as flattened spheres. They sit over the joint and hide it, which
  // is the one place this rig would otherwise show a seam when an arm lifts.
  const deltoid = new THREE.SphereGeometry(H * 0.047, seg(8, 10, 14), seg(6, 8, 10));
  const shoulderLocalY = span - chest.position.y - H * 0.028;
  for (const side of [-1, 1]) {
    const d = mesh(deltoid, topMat, chest);
    d.position.set(side * p.shoulder * (H / 1.78) * 0.92, shoulderLocalY, 0);
    d.scale.set(1, 1.08, 0.92);
  }

  /* --- neck and head ----------------------------------------------------- */
  const neck = new THREE.Group();
  neck.position.y = span - chest.position.y + H * 0.012;
  chest.add(neck);
  parts.neck = neck;

  // The neck leans FORWARD, because a real cervical spine does. A vertical neck
  // is the most common tell in a hand-built character: it makes everybody look
  // like they are standing to attention.
  const neckMesh = mesh(
    ringMesh(
      [
        [0, p.neckR * 1.25, p.neckR * 1.15],
        [H * 0.03, p.neckR * 1.02, p.neckR * 0.98],
        [H * 0.058, p.neckR * 0.96, p.neckR * 0.95],
      ],
      seg(8, 10, 14),
    ),
    skinMat,
    neck,
  );
  neckMesh.rotation.x = -0.12;

  const head = new THREE.Group();
  head.position.y = headBase - (hipY + chest.position.y + neck.position.y) + p.headH * 0.42;
  head.position.z = H * 0.012;
  neck.add(head);
  parts.head = head;

  parts.skull = mesh(headGeometry(p), skinMat, head);
  parts.nose = mesh(noseGeometry(p), skinMat, head);

  const earGeo = earGeometry(p);
  for (const side of [-1, 1]) {
    const ear = mesh(earGeo, skinMat, head);
    ear.position.set((side * p.headW) / 2 * 0.94, -p.headH * 0.02, -p.headD * 0.06);
    ear.rotation.z = side * 0.1;
    ear.rotation.y = side * -0.2;
    ear.scale.x = side;
  }

  /* --- eyes -------------------------------------------------------------- */
  /*
   * Two spheres in two sockets, each in its own group so the eyeball can
   * rotate inside the head without moving.
   *
   * The eyeball is pushed back into the socket by 85% of its radius, so only
   * the cornea shows. An eyeball sitting on the surface of a face is the
   * single most unsettling thing this rig can produce - and not in a useful
   * way.
   */
  const eyeR = p.headH * 0.0545;
  const eyeGeo = new THREE.SphereGeometry(eyeR, seg(10, 14, 20), seg(8, 10, 16));
  const eyeX = (p.headW / 2) * 0.46;
  /*
   * Far enough forward that the eye sits IN the socket rather than behind it.
   *
   * The socket is a dent about 8 mm deep in a skull whose front surface is
   * roughly 0.37 of its depth from centre; an eyeball centred any further back
   * than this is entirely inside the head and the face has two holes in it.
   */
  const eyeZ = (p.headD / 2) * 0.78 - eyeR * 0.18;
  parts.eyes = [];
  parts.lids = [];
  parts.brows = [];

  /*
   * A lid is a spherical cap a hair larger than the eyeball, so it slides over
   * it without intersecting.
   *
   * The ANGLE is the whole thing. A cap of 0.52 of a half-turn covers 94
   * degrees from its pole - past the equator - so with the pole at the top of
   * the eye it reaches the forward axis and keeps going. Two of those, top and
   * bottom, cover the eyeball completely, and the first pass rendered two
   * skin-coloured balls where the eyes should have been.
   *
   * 0.33 covers 59 degrees, so at rest the two lids leave a 60-degree aperture
   * at the front of the eye - which is about the angular size of an iris, and
   * is therefore an open eye. The blink then has to travel the whole 60
   * degrees, which is why the rotations below are nearly a radian.
   */
  const lidGeo = new THREE.SphereGeometry(
    eyeR * 1.07,
    seg(10, 14, 18),
    seg(5, 7, 9),
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.33,
  );
  // A flattened half-ellipsoid rather than a box: a brow follows the curve of
  // the ridge it grows on, and a rectangle on a round face reads as a sticker.
  const browGeo = new THREE.SphereGeometry(1, seg(8, 10, 14), seg(5, 6, 8), 0, Math.PI * 2, 0, Math.PI * 0.55);

  for (const side of [-1, 1]) {
    const socket = new THREE.Group();
    socket.position.set(side * eyeX, 0, eyeZ);
    head.add(socket);

    // The iris is painted at the sphere's own +Z pole, so an unrotated eyeball
    // already looks straight ahead and `gaze` can treat rotation as pure aim.
    const ball = mesh(eyeGeo, eyeMat, socket, false);
    parts.eyes.push({ socket, ball });

    const upper = mesh(lidGeo, skinMat, socket, false);
    const lower = mesh(lidGeo, skinMat, socket, false);
    lower.rotation.x = Math.PI;
    parts.lids.push({ upper, lower });

    const brow = mesh(browGeo, hairMat, head, false);
    brow.scale.set(eyeR * 1.35, eyeR * 0.5, eyeR * 0.55);
    brow.position.set(side * eyeX * 1.02, eyeR * 1.8, eyeZ + eyeR * 0.78);
    brow.rotation.z = side * -0.12;
    brow.rotation.x = -0.5;
    parts.brows.push(brow);
  }

  /* --- mouth ------------------------------------------------------------- *
   * The jaw is a PIVOT with the lower lip and the mouth interior on it, not a
   * deformation of the skull.
   *
   * A deforming jaw needs either morph targets or a skinned mesh, and both
   * would mean the head could no longer be one static buffer. At the distance
   * these characters are seen - a metre at the closest - a lower lip that
   * drops away from a dark interior is indistinguishable from a jaw that
   * opens, and it costs one group.
   */
  const jaw = new THREE.Group();
  jaw.position.set(0, -p.headH * 0.3, 0);
  head.add(jaw);
  parts.jaw = jaw;

  const mouthW = p.headW * 0.26;
  const lipH = p.headH * 0.016 * p.lipFull;

  const upperLip = mesh(
    new THREE.SphereGeometry(1, seg(10, 14, 18), seg(5, 7, 9)),
    lipMat,
    head,
    false,
  );
  upperLip.scale.set(mouthW, lipH, p.headD * 0.04);
  // 0.355 rather than 0.44: the face surface at mouth height is about 0.37 of
  // the head's depth from centre, so the first pass put both lips a centimetre
  // in front of the face and they read as a pair of floating lozenges.
  upperLip.position.set(0, -p.headH * 0.285, p.headD * 0.355);

  const lowerLip = mesh(
    new THREE.SphereGeometry(1, seg(10, 14, 18), seg(5, 7, 9)),
    lipMat,
    jaw,
    false,
  );
  lowerLip.scale.set(mouthW * 0.95, lipH * 1.2, p.headD * 0.038);
  lowerLip.position.set(0, -p.headH * 0.025, p.headD * 0.35);

  // The interior. A dark box behind the lips, so an open mouth is a hole
  // rather than a gap showing the far wall through the head.
  const cavity = mesh(
    new THREE.BoxGeometry(mouthW * 1.7, p.headH * 0.075, p.headD * 0.12),
    mouthMat,
    head,
    false,
  );
  // Well back, so an open mouth is a hole and a closed one shows nothing at
  // all. At 0.36 its front face broke the skin and left a dark slot across the
  // chin.
  cavity.position.set(0, -p.headH * 0.3, p.headD * 0.24);
  parts.cavity = cavity;

  /* --- hair -------------------------------------------------------------- */
  parts.hair = buildHair(p, head, hairMat, mat.hairFall(p.hair.shade, p.hair.colour), rng);

  /* --- arms -------------------------------------------------------------- */
  parts.arms = [];
  const armGeoUpper = limbGeometry(upperArm, H * 0.043, H * 0.046, H * 0.034, 0.3);
  const armGeoFore = limbGeometry(foreArm, H * 0.034, H * 0.036, H * 0.024, 0.22);

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * p.shoulder * (H / 1.78), shoulderLocalY, 0);
    chest.add(shoulder);

    mesh(armGeoUpper, topMat, shoulder);

    const elbow = new THREE.Group();
    elbow.position.y = -upperArm;
    shoulder.add(elbow);
    // A short sleeve means the forearm is skin; a long one means it is cloth.
    mesh(armGeoFore, p.garment.sleeve === "short" ? skinMat : topMat, elbow);

    const wrist = new THREE.Group();
    wrist.position.y = -foreArm;
    elbow.add(wrist);
    parts.arms.push({ shoulder, elbow, wrist, side });

    /*
     * A cuff where the sleeve ends.
     *
     * Without it the forearm runs straight into the hand and the hand reads as
     * a pale lump on the end of a tube - which is exactly how it looked. One
     * band of cloth, two centimetres deep, and the hand becomes a hand.
     */
    if (p.garment.sleeve === "long") {
      const cuff = new THREE.Mesh(
        ringMesh(
          [
            [H * 0.016, H * 0.038, H * 0.034],
            [-H * 0.006, H * 0.036, H * 0.032],
          ],
          seg(6, 8, 12),
          { capTop: false, capBottom: false },
        ),
        jacketMat,
      );
      wrist.add(cuff);
    }

    buildHand(wrist, handLen, H, skinMat, seg(6, 8, 12));
  }

  /* --- legs -------------------------------------------------------------- */
  parts.legs = [];
  const thighGeo = limbGeometry(thighLen, H * 0.062, H * 0.065, H * 0.044, 0.18);
  const shinGeo = limbGeometry(shinLen, H * 0.044, H * 0.046, H * 0.028, 0.3);
  // A shoe, not a brick: an upper, a sole that overhangs it, and a heel. Three
  // boxes, and the foot stops reading as the end of a leg.
  const footGeo = new THREE.BoxGeometry(H * 0.055, H * 0.032, H * 0.135);
  const soleGeo = new THREE.BoxGeometry(H * 0.062, H * 0.012, H * 0.15);
  const heelGeo = new THREE.BoxGeometry(H * 0.05, H * 0.016, H * 0.035);

  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * H * 0.052, 0, 0);
    hips.add(hip);
    mesh(thighGeo, legMat, hip);

    const knee = new THREE.Group();
    knee.position.y = -thighLen;
    hip.add(knee);
    mesh(shinGeo, legMat, knee);

    const ankle = new THREE.Group();
    ankle.position.y = -shinLen;
    knee.add(ankle);
    const foot = mesh(footGeo, shoeMat, ankle);
    // The box is centred on its origin, so it has to be lifted by half its
    // height and pushed forward: a foot is in front of the ankle, not under it.
    foot.position.set(0, -H * 0.012, H * 0.04);
    const sole = mesh(soleGeo, mat.cloth(0x0b0b0d, 0.75), ankle, false);
    sole.position.set(0, -H * 0.03, H * 0.042);
    const heel = mesh(heelGeo, mat.cloth(0x0b0b0d, 0.75), ankle, false);
    heel.position.set(0, -H * 0.042, -H * 0.018);
    parts.legs.push({ hip, knee, ankle, foot, side });
  }

  const character = makeRig(who, p, root, parts, {
    H, hipY, shoulderY, upperArm, foreArm, thighLen, shinLen,
  });
  cache.set(who, character);
  return character;
}

/* -------------------------------------------------------------------------- *
 * Hair
 *
 * Shells, not strands. A head of individual hairs is tens of thousands of
 * primitives and alpha-tested transparency on every one; a dozen curved shells
 * with a strand TEXTURE reads the same in anything but a close-up and costs a
 * dozen draw calls - and here, one, because they are merged.
 * -------------------------------------------------------------------------- */

function buildHair(p, head, material, fallMaterial, rng) {
  const group = new THREE.Group();
  head.add(group);

  const hw = p.headW / 2;
  const hh = p.headH / 2;
  const hd = p.headD / 2;

  /*
   * The cap.
   *
   * A sphere slightly larger than the skull, cut off AT THE HAIRLINE - which is
   * about a third of the way down from the crown, not past the eyes. The first
   * pass used 0.62 of a half-turn, which reaches 20 degrees below the equator,
   * and since the equator of this skull IS the eye line the result was a black
   * helmet with a pair of eyebrows painted on the front of it.
   *
   * The small backward tilt is what gives a hairline its shape: higher at the
   * forehead, lower at the nape, which one spherical cap cannot do on its own.
   */
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(1, seg(14, 20, 28), seg(10, 14, 18), 0, Math.PI * 2, 0, Math.PI * 0.5),
    material,
  );
  cap.scale.set(hw * 1.06, hh * 1.05, hd * 1.05);
  cap.position.set(0, hh * 0.02, -hd * 0.05);
  /*
   * A 90-degree cap, tilted half a radian BACK.
   *
   * The tilt is what shapes the hairline: it lifts the front edge to 29 degrees
   * above the eye line, where a forehead ends, and drops the back edge the same
   * distance below it, which covers the nape. A cap small enough to clear the
   * brow without the tilt left the back of the head bare, and from behind - the
   * angle the ending is shot from - he had a bald patch.
   */
  cap.rotation.x = -0.5;
  cap.castShadow = true;
  group.add(cap);

  if (p.hair.style === "long") {
    /*
     * Long hair: curved sheets falling from the cap to below the shoulders.
     *
     * Each is a TubeGeometry along a short Catmull-Rom curve, scaled flat in
     * one axis so it is a ribbon rather than a worm. The curves differ per
     * sheet by a seeded random, so the mass has internal variation without
     * anyone having to author fourteen curves by hand - and the seed means she
     * has the same hair every time the game is loaded.
     */
    const sheets = seg(5, 8, 12);
    for (let i = 0; i < sheets; i++) {
      const side = i % 2 ? 1 : -1;
      const t = Math.floor(i / 2) / Math.max(1, Math.floor(sheets / 2) - 1 || 1);
      /*
       * Fan the sheets from BESIDE the face round to behind the ear.
       *
       * The first pass started at 0.25 radians - fourteen degrees off the
       * centre line of the face - so the innermost sheets hung straight down
       * over her nose and she had no face at all. Starting at 0.78 puts the
       * first sheet at the temple, which is where hair actually parts company
       * with a forehead.
       */
      const a = lerp(0.78, 1.55, t) * side;
      const topX = Math.sin(a) * hw * 1.02;
      const topZ = Math.cos(a) * hd * 0.86 - hd * 0.12;
      const len = p.headH * (1.5 + rng() * 0.75);

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(topX, hh * 0.72, topZ),
        new THREE.Vector3(topX * 1.08, hh * 0.1, topZ * 1.12),
        new THREE.Vector3(topX * 1.12, -hh * 0.5, topZ * 1.15 - hd * 0.08),
        // The ends curl in and forward, which is what stops long hair reading
        // as a pair of curtains hanging off a ball.
        new THREE.Vector3(
          topX * (0.86 + rng() * 0.2),
          hh * 0.72 - len,
          topZ * 0.8 + (rng() - 0.5) * hd * 0.3,
        ),
      ]);

      const tube = new THREE.Mesh(
        // More segments around: at four the tube is a square prism and every
        // highlight on it has a corner in it.
        new THREE.TubeGeometry(curve, seg(6, 10, 16), p.headW * (0.085 + rng() * 0.055), seg(6, 8, 12), false),
        fallMaterial,
      );
      // Flattened across its width: a ribbon of hair, not a rope. Half the
      // thickness of the first pass, which produced twelve 9 cm sausages and a
      // silhouette wider than her shoulders.
      tube.scale.x = 1.4;
      tube.castShadow = true;
      group.add(tube);
    }
  } else {
    /*
     * Short hair: the cap, a FRINGE, two sideburns and a nape.
     *
     * The fringe is the one that matters. A smooth cap with a clean edge reads
     * as a swimming hat; a broken edge at the forehead reads as hair, and three
     * overlapping wedges is enough to break it.
     */
    for (let i = 0; i < 5; i++) {
      const t = (i / 4 - 0.5) * 2;
      const wedge = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
        material,
      );
      wedge.scale.set(hw * 0.3, hh * 0.26, hd * 0.26);
      wedge.position.set(
        t * hw * 0.62,
        hh * 0.52 - Math.abs(t) * hh * 0.06,
        hd * 0.62 - Math.abs(t) * hd * 0.14,
      );
      wedge.rotation.x = 0.55 + rng() * 0.25;
      wedge.rotation.z = t * 0.18;
      wedge.castShadow = false;
      group.add(wedge);
    }

    const patch = new THREE.BoxGeometry(hw * 0.2, hh * 0.3, hd * 0.5);
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(patch, material);
      m.position.set(side * hw * 0.98, -hh * 0.08, -hd * 0.1);
      m.castShadow = false;
      group.add(m);
    }
    const nape = new THREE.Mesh(new THREE.BoxGeometry(hw * 1.5, hh * 0.34, hd * 0.3), material);
    nape.position.set(0, -hh * 0.18, -hd * 0.92);
    group.add(nape);
  }

  return group;
}

/* -------------------------------------------------------------------------- *
 * Hands
 *
 * A palm, a thumb and one block of fingers with a knuckle line - not four
 * separate fingers. At this distance the only things that read are the
 * silhouette of the palm, the angle of the thumb, and whether the fingers
 * curl, and a single fingers block does all three while costing a quarter as
 * much as four does.
 * -------------------------------------------------------------------------- */

function buildHand(wrist, handLen, H, material, segs) {
  const palmW = H * 0.052;
  const palm = new THREE.Mesh(
    ringMesh(
      [
        [0, palmW * 0.42, palmW * 0.3],
        [-handLen * 0.22, palmW * 0.52, palmW * 0.3],
        [-handLen * 0.46, palmW * 0.5, palmW * 0.26],
      ],
      segs,
    ),
    material,
  );
  palm.castShadow = true;
  wrist.add(palm);

  const knuckle = new THREE.Group();
  knuckle.position.y = -handLen * 0.46;
  wrist.add(knuckle);

  const fingers = new THREE.Mesh(
    ringMesh(
      [
        [0, palmW * 0.48, palmW * 0.24],
        [-handLen * 0.3, palmW * 0.44, palmW * 0.22],
        [-handLen * 0.5, palmW * 0.3, palmW * 0.16],
      ],
      segs,
    ),
    material,
  );
  fingers.castShadow = true;
  knuckle.add(fingers);

  const thumb = new THREE.Mesh(
    ringMesh(
      [
        [0, palmW * 0.2, palmW * 0.18],
        [-handLen * 0.34, palmW * 0.15, palmW * 0.14],
      ],
      Math.max(5, segs - 2),
    ),
    material,
  );
  thumb.position.set(palmW * 0.36, -handLen * 0.14, palmW * 0.1);
  thumb.rotation.z = -0.7;
  thumb.rotation.x = -0.3;
  thumb.castShadow = false;
  wrist.add(thumb);

  wrist.userData.knuckle = knuckle;
}

/* -------------------------------------------------------------------------- *
 * Poses
 *
 * Joint angles in radians, by name. Every pose in the game is in this table,
 * and a scene asks for one by name - so a scene file contains no joint
 * arithmetic at all, and a pose can be retuned once for every scene that uses
 * it.
 *
 * Angles are [left, right] where a limb differs by side, or a number where it
 * does not.
 * -------------------------------------------------------------------------- */

export const POSES = {
  /** Standing, weight even, arms hanging with the natural outward carry. */
  stand: {
    hips: [0, 0, 0],
    spine: [0.02, 0, 0],
    chest: [0.01, 0, 0],
    neck: [0.02, 0, 0],
    shoulder: { x: -0.08, z: [0.12, -0.12] },
    elbow: { x: -0.3 },
    knee: { x: 0.04 },
    hip: { x: 0 },
  },

  /** Standing but braced: shoulders dropped, chin down, feet apart. */
  wary: {
    hips: [0, 0, 0],
    spine: [0.06, 0, 0],
    chest: [0.04, 0, 0],
    neck: [-0.1, 0, 0],
    shoulder: { x: -0.22, z: [0.2, -0.2] },
    elbow: { x: -0.62 },
    knee: { x: 0.12 },
    hip: { x: -0.04 },
  },

  /**
   * Driving.
   *
   * The seat is at the origin of whatever space the character is placed in and
   * the thighs run forward from it, so the hips rotate back by most of a right
   * angle and the knees bend to put the feet on the floor. Hands come up and
   * in to the wheel - and the elbows stay LOW, because an upright driving
   * position with high elbows is the pose of someone in a driving simulator.
   */
  driving: {
    hips: [-0.12, 0, 0],
    spine: [0.14, 0, 0],
    chest: [0.04, 0, 0],
    neck: [0.02, 0, 0],
    shoulder: { x: -1.08, z: [0.34, -0.34] },
    elbow: { x: -0.72 },
    hip: { x: -1.42 },
    knee: { x: 1.02 },
    ankle: { x: -0.3 },
  },

  /** In the passenger seat, hands in the lap, turned slightly to the driver. */
  passenger: {
    hips: [-0.1, 0, 0],
    spine: [0.12, 0, 0.02],
    chest: [0.02, 0.1, 0],
    neck: [0.04, 0.12, 0],
    shoulder: { x: -0.72, z: [0.5, -0.5] },
    elbow: { x: -1.5 },
    hip: { x: -1.38 },
    knee: { x: 1.1 },
    ankle: { x: -0.28 },
  },

  /** Reaching forward with both arms: the grab in the flashback. */
  reach: {
    hips: [0.1, 0, 0],
    spine: [0.14, 0, 0],
    chest: [0.08, 0, 0],
    neck: [-0.06, 0, 0],
    shoulder: { x: -1.74, z: [0.22, -0.22] },
    elbow: { x: -0.24 },
    hip: { x: -0.12 },
    knee: { x: 0.22 },
  },

  /** Being pulled backwards: arms up and out, spine arched, head back. */
  taken: {
    hips: [-0.16, 0, 0],
    spine: [-0.22, 0, 0.06],
    chest: [-0.12, 0, 0],
    neck: [-0.4, 0, 0],
    shoulder: { x: -2.5, z: [0.5, -0.5] },
    elbow: { x: -0.5 },
    hip: { x: 0.3 },
    knee: { x: 0.5 },
  },

  /** Lying on their back. Used for the wake-up, seen from his own eyes. */
  supine: {
    hips: [-1.5, 0, 0],
    spine: [0, 0, 0],
    chest: [0, 0, 0],
    neck: [0.3, 0, 0],
    shoulder: { x: -0.1, z: [0.3, -0.3] },
    elbow: { x: -0.2 },
    hip: { x: 0.05 },
    knee: { x: 0.08 },
  },
};

/* -------------------------------------------------------------------------- *
 * The rig
 * -------------------------------------------------------------------------- */

function makeRig(who, p, root, parts, dims) {
  /** Everything the animator needs to remember between frames. */
  const S = {
    pose: "stand",
    /** 0..1 blend into the current pose, so a pose change is not a snap. */
    blend: 1,
    time: 0,

    /* --- eyes --- */
    blinkTimer: 1 + Math.random() * 3,
    blinkPhase: 0,       // 0 = open, 1 = shut
    blinkDir: 0,
    saccadeTimer: 0,
    saccade: new THREE.Vector2(),
    lookTarget: null,    // world-space Vector3, or null for "ahead"
    lookWeight: 0,

    /* --- speech --- */
    talking: 0,
    jawOpen: 0,

    /* --- breath --- */
    breath: 0,
    breathRate: 0.26,
    breathDepth: 1,

    /* --- locomotion --- */
    walkPhase: 0,
    walkSpeed: 0,

    /* --- expression --- */
    browRaise: 0,
    emotion: "calm",
  };

  const target = {};   // the pose being blended toward
  const current = {};  // where the joints actually are

  const _v = new THREE.Vector3();
  const _m = new THREE.Matrix4();

  /** Resolve a pose entry that may be a number or a [left, right] pair. */
  const sided = (value, side) =>
    Array.isArray(value) ? (side < 0 ? value[0] : value[1]) : value ?? 0;

  function setPose(name, { instant = false } = {}) {
    if (!POSES[name]) return;
    S.pose = name;
    S.blend = instant ? 1 : 0;
    Object.assign(target, POSES[name]);
    if (instant) applyPose(1);
  }

  /**
   * Write the pose onto the joints.
   *
   * `k` blends from wherever the joints are now toward the pose, which is why
   * this damps rather than assigns: a cut from `driving` to `taken` has to be
   * a movement, because a character who changes pose between two frames reads
   * as a glitch rather than as an action.
   */
  function applyPose(k) {
    const t = target;
    if (!t.hips) return;

    lerpEuler(parts.hips.rotation, t.hips, k);
    lerpEuler(parts.spine.rotation, t.spine, k);
    lerpEuler(parts.chest.rotation, t.chest, k);
    lerpEuler(parts.neck.rotation, t.neck, k);

    for (const arm of parts.arms) {
      arm.shoulder.rotation.x = lerp(arm.shoulder.rotation.x, sided(t.shoulder?.x, arm.side), k);
      arm.shoulder.rotation.z = lerp(arm.shoulder.rotation.z, sided(t.shoulder?.z, arm.side), k);
      arm.elbow.rotation.x = lerp(arm.elbow.rotation.x, sided(t.elbow?.x, arm.side), k);
    }
    for (const leg of parts.legs) {
      leg.hip.rotation.x = lerp(leg.hip.rotation.x, sided(t.hip?.x, leg.side), k);
      leg.knee.rotation.x = lerp(leg.knee.rotation.x, sided(t.knee?.x, leg.side), k);
      leg.ankle.rotation.x = lerp(leg.ankle.rotation.x, sided(t.ankle?.x, leg.side), k);
    }
  }

  function lerpEuler(euler, triple, k) {
    if (!triple) return;
    euler.x = lerp(euler.x, triple[0] ?? 0, k);
    euler.y = lerp(euler.y, triple[1] ?? 0, k);
    euler.z = lerp(euler.z, triple[2] ?? 0, k);
  }

  /* ---------------------------------------------------------------------- *
   * Per-frame
   * ---------------------------------------------------------------------- */

  function update(dt, opts = {}) {
    S.time += dt;

    if (opts.pose && opts.pose !== S.pose) setPose(opts.pose);
    if (opts.talking !== undefined) S.talking = opts.talking ? 1 : 0;
    if (opts.breath !== undefined) S.breathDepth = opts.breath;
    if (opts.breathRate !== undefined) S.breathRate = opts.breathRate;
    if (opts.lookAt !== undefined) S.lookTarget = opts.lookAt;
    if (opts.walk !== undefined) S.walkSpeed = opts.walk;
    if (opts.emotion) S.emotion = opts.emotion;

    // --- pose blend ---
    // 3.4 is about 300 ms to settle: fast enough to be a reaction, slow enough
    // to be a movement.
    S.blend = Math.min(1, S.blend + dt * 3.4);
    applyPose(1 - Math.exp(-dt * 10 * S.blend));

    breathe(dt);
    blink(dt);
    gaze(dt);
    speak(dt);
    if (S.walkSpeed > 0.02) walk(dt);
    express(dt);
  }

  /* --- breathing -------------------------------------------------------- */
  function breathe(dt) {
    // Rate in breaths per second: 0.22 is calm (13/min), 0.6 is frightened.
    S.breath += dt * Math.PI * 2 * S.breathRate;
    const b = Math.sin(S.breath);
    const d = S.breathDepth;

    /*
     * Breathing is a CHEST movement, not a whole-body scale.
     *
     * Scaling the torso mesh is the obvious implementation and it is wrong: it
     * widens the shoulders in time with the breath, which reads as a balloon.
     * A real breath lifts and rotates the rib cage, so this scales the chest
     * only in depth, and lifts it.
     */
    parts.torso.scale.z = 1 + b * 0.022 * d;
    parts.torso.scale.y = 1 + b * 0.006 * d;
    parts.chest.position.y += 0; // kept explicit: the lift is in rotation below
    parts.chest.rotation.x -= b * 0.012 * d;
    // The breath reaches the head, faintly. This is the difference between a
    // character who is breathing and a torso that is.
    parts.neck.rotation.x += b * 0.006 * d;
  }

  /* --- blinking --------------------------------------------------------- */
  function blink(dt) {
    S.blinkTimer -= dt;
    if (S.blinkTimer <= 0 && S.blinkDir === 0) {
      S.blinkDir = 1;
      /*
       * Human blink interval: 2-8 seconds at rest, far faster under stress.
       * The variance matters more than the mean - a metronomic blink is
       * instantly readable as artificial, and it is the most common failure in
       * a hand-animated face.
       */
      const stress = S.emotion === "afraid" || S.emotion === "panic" ? 0.42 : 1;
      S.blinkTimer = (1.8 + Math.random() * 5.2) * stress;
    }

    if (S.blinkDir > 0) {
      // Closing is fast: about 90 ms. Opening is slower, about 160 ms. They are
      // NOT symmetrical, and the asymmetry is what makes a blink read as wet.
      S.blinkPhase += dt / 0.09;
      if (S.blinkPhase >= 1) {
        S.blinkPhase = 1;
        S.blinkDir = -1;
      }
    } else if (S.blinkDir < 0) {
      S.blinkPhase -= dt / 0.16;
      if (S.blinkPhase <= 0) {
        S.blinkPhase = 0;
        S.blinkDir = 0;
      }
    }

    const shut = smooth(S.blinkPhase);
    for (const lid of parts.lids) {
      /*
       * Small numbers, and they have to be.
       *
       * With a 75.6-degree cap, tilting the pole forward by a quarter radian is
       * enough to bring its edge down to the forward axis - so an open lid is
       * about -0.02 and a shut one about 0.46. The first pass swung through 1.9
       * radians: the lid went over the top of the eye, round the back, and came
       * out underneath.
       *
       * The upper lid travels three times as far as the lower, which is also
       * true of a real eye - a blink is mostly the top one coming down.
       */
      lid.upper.rotation.x = lerp(0.08, 0.98, shut);
      lid.lower.rotation.x = Math.PI - lerp(0.04, 0.2, shut);
    }
  }

  /* --- gaze ------------------------------------------------------------- */
  function gaze(dt) {
    /*
     * Saccades.
     *
     * Eyes do not drift, they JUMP, and then they are still. So the target
     * changes instantly on a random timer and the eyes snap to it rather than
     * easing - which is the opposite of how almost every other movement in
     * this file works, and is correct here specifically.
     */
    S.saccadeTimer -= dt;
    if (S.saccadeTimer <= 0) {
      S.saccadeTimer = 0.4 + Math.random() * 2.2;
      const spread = S.emotion === "afraid" || S.emotion === "panic" ? 0.16 : 0.07;
      S.saccade.set((Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread);
    }

    let yaw = S.saccade.x;
    let pitch = S.saccade.y;

    if (S.lookTarget) {
      // Convert the world target into head space, then into two angles. The
      // eyes converge on it, which is the thing a player notices without ever
      // being able to say what they noticed.
      parts.head.updateMatrixWorld(true);
      _m.copy(parts.head.matrixWorld).invert();
      _v.copy(S.lookTarget).applyMatrix4(_m);
      const dist = Math.max(0.2, _v.length());
      yaw += Math.atan2(_v.x, Math.max(0.05, _v.z));
      pitch += Math.atan2(_v.y, dist);
      S.lookWeight = Math.min(1, S.lookWeight + dt * 4);
    } else {
      S.lookWeight = Math.max(0, S.lookWeight - dt * 3);
    }

    // Eyes are mechanically limited to about 35 degrees off axis; past that a
    // person turns their head. Clamping is what stops a look-at target behind
    // the character turning the eyes inside out.
    yaw = clamp(yaw, -0.6, 0.6);
    pitch = clamp(pitch, -0.42, 0.42);

    for (const eye of parts.eyes) {
      eye.ball.rotation.y = Math.PI + yaw;
      eye.ball.rotation.x = -pitch;
    }

    // The head follows the eyes, partly and late. Eyes lead, head follows:
    // doing it the other way round is the single most robotic thing a
    // character can do.
    if (S.lookWeight > 0.001) {
      parts.neck.rotation.y = damp(parts.neck.rotation.y, yaw * 0.55 * S.lookWeight, 4, dt);
      parts.neck.rotation.x = damp(parts.neck.rotation.x, parts.neck.rotation.x - pitch * 0.2 * S.lookWeight, 3, dt);
    }

    // Idle micro-motion. Always on, and tiny: one degree of yaw and half of
    // pitch, on two noise rates that never line up.
    parts.neck.rotation.y += noise1(S.time * 0.21) * 0.018;
    parts.neck.rotation.z = noise1(S.time * 0.17 + 9) * 0.012;
  }

  /* --- speech ----------------------------------------------------------- */
  function speak(dt) {
    /*
     * The jaw is driven by a NOISE-SHAPED SYLLABLE RATE, not by the audio.
     *
     * The words come from the browser's speech synthesiser, whose output is
     * not reachable from an AudioContext - so there is no amplitude to follow
     * and there never will be. What is available is the knowledge that speech
     * runs at roughly 4-5 syllables a second with a wide variation in opening,
     * and that is enough: the eye cannot lip-read at this distance, it can
     * only tell whether a mouth is moving in a way that matches the rhythm of
     * what it is hearing.
     */
    let want = 0;
    if (S.talking > 0) {
      const syl = Math.sin(S.time * 27) * 0.5 + 0.5;
      const vary = noise1(S.time * 3.1) * 0.5 + 0.5;
      want = clamp01(syl * (0.35 + vary * 0.65));
      // Closed consonants: a quarter of the time the mouth shuts completely,
      // which is what gives speech its percussion.
      if (noise1(S.time * 7.3 + 4) < -0.25) want *= 0.1;
    }

    S.jawOpen = damp(S.jawOpen, want, 22, dt);
    parts.jaw.rotation.x = S.jawOpen * 0.3;
    // The whole lower face moves a little with the jaw, not just the lip.
    parts.jaw.position.z = S.jawOpen * -0.004;
  }

  /* --- walking ---------------------------------------------------------- */
  function walk(dt) {
    /*
     * One cycle per two steps, phase advanced by SPEED rather than by time, so
     * a character slowing down takes shorter strides instead of mincing on the
     * spot at the same cadence.
     *
     * Stride length is about 0.75 m at a walk, so a 1 m/s walk is about 1.33
     * steps a second, which is 0.67 cycles.
     */
    S.walkPhase += dt * S.walkSpeed * 1.35;
    const a = S.walkPhase * Math.PI * 2;

    for (const leg of parts.legs) {
      const phase = leg.side < 0 ? a : a + Math.PI;
      const swing = Math.sin(phase);
      const lift = Math.max(0, Math.cos(phase));

      // Hip swings fore and aft; knee only bends on the swing-through, because
      // a knee that bends on the stance leg is a limp.
      leg.hip.rotation.x = -swing * 0.42 * S.walkSpeed;
      leg.knee.rotation.x = lift * 0.78 * S.walkSpeed + 0.04;
      // Ankle: toe-off at the back of the stride, heel-strike at the front.
      leg.ankle.rotation.x = (swing > 0 ? -swing * 0.3 : swing * 0.18) * S.walkSpeed;
    }

    for (const arm of parts.arms) {
      // Arms counter-swing: opposite phase to the leg on the same side.
      const phase = arm.side < 0 ? a + Math.PI : a;
      arm.shoulder.rotation.x = -0.08 + Math.sin(phase) * 0.34 * S.walkSpeed;
      arm.elbow.rotation.x = -0.3 - Math.max(0, Math.sin(phase)) * 0.3 * S.walkSpeed;
    }

    // Pelvis: drops on the swing side and rotates with the stride. This is the
    // movement that reads as weight, and without it a walk is a puppet being
    // slid along the floor.
    parts.hips.rotation.z = Math.sin(a) * 0.055 * S.walkSpeed;
    parts.hips.rotation.y = Math.sin(a) * 0.1 * S.walkSpeed;
    parts.chest.rotation.y = -Math.sin(a) * 0.08 * S.walkSpeed;
    // Two bobs per cycle - one per footfall - not one.
    parts.hips.position.y = dims.hipY - Math.abs(Math.cos(a)) * 0.012 * S.walkSpeed;
  }

  /* --- expression ------------------------------------------------------- */
  function express(dt) {
    // Brows carry nearly all of it. Raised and together is fear; lowered and
    // together is anger; one number per emotion is enough at this distance.
    const want =
      S.emotion === "afraid" || S.emotion === "shock" || S.emotion === "panic"
        ? 1
        : S.emotion === "anger"
          ? -0.7
          : S.emotion === "worried" || S.emotion === "confused"
            ? 0.35
            : 0;
    S.browRaise = damp(S.browRaise, want, 5, dt);

    for (let i = 0; i < parts.brows.length; i++) {
      const side = i === 0 ? -1 : 1;
      const brow = parts.brows[i];
      brow.position.y = brow.userData.baseY ?? (brow.userData.baseY = brow.position.y);
      brow.position.y += S.browRaise * 0.006;
      // Inner ends up, outer ends down: the shape of worry. Pulling both ends
      // up evenly is surprise, which is a different face entirely.
      brow.rotation.z = side * -0.1 - S.browRaise * side * 0.14;
      brow.rotation.x = -0.18 - S.browRaise * 0.1;
    }

    // Fear widens the eyes: the lids retract past their resting position.
    const widen = Math.max(0, S.browRaise) * 0.06;
    for (const lid of parts.lids) {
      if (S.blinkPhase < 0.02) lid.upper.rotation.x -= widen;
    }
  }

  /* ---------------------------------------------------------------------- *
   * Public
   * ---------------------------------------------------------------------- */

  setPose("stand", { instant: true });

  return {
    who,
    preset: p,
    root,
    parts,
    dims,
    state: S,
    setPose,
    update,

    /** Put the character somewhere, facing a direction in radians. */
    place(x, y, z, yaw = 0) {
      root.position.set(x, y, z);
      root.rotation.y = yaw;
    },

    /** World position of the eyes, for a camera that wants to be behind them. */
    eyePosition(out = new THREE.Vector3()) {
      parts.head.updateMatrixWorld(true);
      return out.setFromMatrixPosition(parts.head.matrixWorld);
    },

    /** Look at a world point, or null to look ahead. */
    lookAt(v) {
      S.lookTarget = v;
    },

    setVisible(v) {
      root.visible = v;
    },
  };
}

/* ========================================================================== *
 * THE MODEL-BACKED RIG
 *
 * Same object shape as the generated one, so nothing that uses a character has
 * to know which kind it got. What it can do is necessarily different:
 *
 *   it CAN     play the model's own animation clips, turn its head toward a
 *              point, breathe, and be placed and posed like any other character
 *   it CANNOT  blink or move its mouth, because a Mixamo rig has no face bones
 *              and no blend shapes - there is nothing in the file to drive
 *
 * So the talking is carried by the head and the body instead: a character who
 * is speaking gets a little more head motion and a slightly raised chest, which
 * at the distance these are seen reads as someone talking far better than a
 * jaw that does not exist.
 * ========================================================================== */

function makeModelRig(who, model) {
  const root = new THREE.Group();
  root.name = `human:${who}:model`;
  root.add(model.root);

  const preset = PRESETS[who] ?? PRESETS.him;
  const bones = model.bones;

  /*
   * Proxies for the two parts the scenes reach into by name.
   *
   * `parts.head` and `parts.chest` are read by the car scene (to aim a look-at
   * and to hang the phone light off a chest) and they must exist whether or not
   * the model has the bones. A proxy is an empty Object3D at roughly the right
   * height, so a rig with no recognised skeleton still answers the question
   * "where is this character looking from" with something sensible.
   */
  const headProxy = new THREE.Object3D();
  headProxy.position.y = preset.height * 0.93;
  root.add(headProxy);
  const chestProxy = new THREE.Object3D();
  chestProxy.position.y = preset.height * 0.72;
  root.add(chestProxy);

  const parts = {
    head: bones.head ?? headProxy,
    chest: bones.spine ?? chestProxy,
    neck: bones.neck ?? headProxy,
    hips: bones.hips ?? root,
    // Nothing in a Mixamo file to drive these. They are empty so that any code
    // that iterates them does nothing rather than throwing.
    eyes: [],
    lids: [],
    brows: [],
    arms: [],
    legs: [],
  };

  /* --- animation --------------------------------------------------------- */
  const mixer = model.clips.length > 0 ? new THREE.AnimationMixer(model.scene) : null;
  const actions = new Map();
  if (mixer) {
    for (const clip of model.clips) actions.set(clip.name.toLowerCase(), mixer.clipAction(clip));
  }

  /**
   * Find a clip for a pose.
   *
   * Mixamo names every clip "mixamo.com" unless it is renamed on export, so the
   * match is deliberately loose and falls back to "whatever the first clip is".
   * One idle animation is enough for this game; more is a bonus.
   */
  function actionFor(pose) {
    const want = {
      stand: ["idle", "breathing", "stand"],
      wary: ["idle", "scared", "afraid"],
      driving: ["sit", "driving", "idle"],
      passenger: ["sit", "idle"],
      reach: ["reach", "idle"],
      taken: ["falling", "hit", "idle"],
      supine: ["dying", "idle"],
    }[pose] ?? ["idle"];

    for (const key of want) {
      for (const [name, action] of actions) {
        if (name.includes(key)) return action;
      }
    }
    return actions.values().next().value ?? null;
  }

  /*
   * A model with no skeleton still has to sit down.
   *
   * Two of the three character models in this game are sculptures: no bones, no
   * clips, frozen standing. `actionFor` above has nothing to give them, so
   * without this they stand to attention through the entire opening - including
   * the eleven minutes of it that take place inside a moving car, where both of
   * them were standing up through the roof with their legs hanging below the
   * floor pan.
   *
   * `pose.js` bends the vertices directly. It is cruder than skinning and it is
   * the difference between a scene that works and a scene that cannot be shot.
   */
  const isStatic = !mixer;
  let figure = null;

  function staticPose(name) {
    const h = preset.height;
    figure ??= posekit.findArms(root, h);

    // Always the full amount: `armsDown` measures how far the arms already
    // hang and only makes up the difference, so a model sculpted standing
    // naturally is left alone by the same call that unfolds a T-pose.
    const drop = 1;

    switch (name) {
      case "driving":
        return [
          ...posekit.seated(h, { lean: -6, spread: 7 }),
          ...posekit.armsDown(figure, h, drop),
          ...posekit.handsForward(figure, h, 1),
        ];
      case "passenger":
      case "sit":
        return [
          ...posekit.seated(h, { lean: -10, spread: 4 }),
          ...posekit.armsDown(figure, h, drop),
        ];
      case "supine":
        return [...posekit.seated(h, { lean: -62, spread: 10 }), ...posekit.armsDown(figure, h, drop)];
      case "reach":
        return [...posekit.armsDown(figure, h, drop), ...posekit.handsForward(figure, h, 0.8)];
      default:
        // Standing. Still worth a pass: a T-pose is not a way anyone stands.
        return posekit.armsDown(figure, h, drop);
    }
  }

  let current = null;
  function setPose(name) {
    if (isStatic) {
      posekit.applyPose(root, name, staticPose(name));
      return;
    }
    const next = actionFor(name);
    if (!next || next === current) return;
    next.reset().fadeIn(0.35).play();
    if (current) current.fadeOut(0.35);
    current = next;
  }

  /* --- state ------------------------------------------------------------- */
  const S = {
    pose: "stand",
    time: 0,
    talking: 0,
    emotion: "calm",
    breathRate: 0.26,
    breathDepth: 1,
    walkSpeed: 0,
    lookTarget: null,
    lookWeight: 0,
    headYaw: 0,
    headPitch: 0,
  };

  const _m = new THREE.Matrix4();
  const _v = new THREE.Vector3();

  function update(dt, opts = {}) {
    S.time += dt;
    if (opts.pose && opts.pose !== S.pose) {
      S.pose = opts.pose;
      setPose(opts.pose);
    }
    if (opts.talking !== undefined) S.talking = opts.talking ? 1 : 0;
    if (opts.lookAt !== undefined) S.lookTarget = opts.lookAt;
    if (opts.walk !== undefined) S.walkSpeed = opts.walk;
    if (opts.emotion) S.emotion = opts.emotion;
    if (opts.breathRate !== undefined) S.breathRate = opts.breathRate;

    if (mixer) mixer.update(dt);

    /* --- the head ------------------------------------------------------- */
    const head = bones.head;
    if (head) {
      let yaw = 0;
      let pitch = 0;

      if (S.lookTarget) {
        head.updateMatrixWorld(true);
        _m.copy(head.matrixWorld).invert();
        _v.copy(S.lookTarget).applyMatrix4(_m);
        // A bone's local axes are not the world's, and which way a Mixamo head
        // points depends on the export. Clamping hard keeps a wrong guess from
        // turning into a broken neck: the worst case is a head that does not
        // turn far enough, which nobody notices.
        yaw = clamp(Math.atan2(_v.x, Math.max(0.1, Math.abs(_v.z))), -0.5, 0.5);
        pitch = clamp(Math.atan2(_v.y, 1), -0.3, 0.3);
        S.lookWeight = Math.min(1, S.lookWeight + dt * 3);
      } else {
        S.lookWeight = Math.max(0, S.lookWeight - dt * 2);
      }

      // Idle motion, always. A model playing one looped idle clip is still a
      // loop; a degree of extra drift on two slow noise rates breaks it up.
      const idleYaw = noise1(S.time * 0.21) * 0.035;
      const idlePitch = noise1(S.time * 0.17 + 9) * 0.02;
      // Talking adds its own, faster: this is what stands in for a mouth.
      const talk = S.talking
        ? noise1(S.time * 2.6) * 0.045 + Math.sin(S.time * 7.4) * 0.012
        : 0;

      S.headYaw = damp(S.headYaw, yaw * S.lookWeight + idleYaw + talk, 5, dt);
      S.headPitch = damp(S.headPitch, pitch * S.lookWeight + idlePitch, 5, dt);
      head.rotation.y += (S.headYaw - (head.userData.appliedYaw ?? 0));
      head.rotation.x += (S.headPitch - (head.userData.appliedPitch ?? 0));
      head.userData.appliedYaw = S.headYaw;
      head.userData.appliedPitch = S.headPitch;
    }

    /* --- breathing ------------------------------------------------------- */
    // Only when there is no clip doing it already: doubling a breath on top of
    // an idle animation that already breathes reads as a hiccup.
    const spine = bones.spine;
    if (spine && !mixer) {
      const b = Math.sin(S.time * Math.PI * 2 * S.breathRate);
      spine.rotation.x += b * 0.01 * S.breathDepth - (spine.userData.breath ?? 0);
      spine.userData.breath = b * 0.01 * S.breathDepth;
    }
  }

  setPose("stand");

  return {
    who,
    preset,
    fromModel: true,
    root,
    parts,
    dims: { H: preset.height, hipY: preset.height * 0.52 },
    /** True when the model is posed by bending rather than by a skeleton. */
    isStatic,
    state: S,
    setPose: (name) => {
      S.pose = name;
      setPose(name);
    },
    update,
    place(x, y, z, yaw = 0) {
      root.position.set(x, y, z);
      root.rotation.y = yaw;
    },
    eyePosition(out = new THREE.Vector3()) {
      const node = bones.head ?? headProxy;
      node.updateMatrixWorld(true);
      return out.setFromMatrixPosition(node.matrixWorld);
    },
    lookAt(v) {
      S.lookTarget = v;
    },
    setVisible(v) {
      root.visible = v;
    },
  };
}

/** Drop the cache. Only on a full teardown: a character is built once a run. */
export function disposeAll() {
  for (const c of cache.values()) {
    c.root.traverse((n) => {
      if (n.isMesh) n.geometry?.dispose();
    });
    c.root.removeFromParent();
  }
  cache.clear();
}
