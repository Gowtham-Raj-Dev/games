/**
 * THE STRANGE CUBE. 220 mm on a side.
 *
 * The signature object. The player is told nothing about it; it has to
 * announce itself purely as geometry and material, from under a metre away,
 * against walls and furniture that are deliberately ordinary. So it is built
 * to the opposite brief from everything else in the room: where the table is
 * hand-made and slightly irregular, this is machined to a tolerance nothing
 * else here could hold.
 *
 * Three things do that work, and none of them is the box primitive:
 *
 *   CHAMFER      every edge is cut, so the silhouette catches a hard
 *                highlight all the way round instead of dying at a corner.
 *   PANELS       each face is a raised border around a recessed square. The
 *                recess is real geometry, not a texture, so it parallaxes and
 *                self-shadows as the player circles it.
 *   SEAMS        a thin emissive inlay lies in the groove between border and
 *                panel - set INTO the step, below the border's lip, so the
 *                glow is occluded at grazing angles exactly as an inlay would
 *                be. A glowing decal painted on a flat face never does that,
 *                and that difference is most of why this reads as an object
 *                rather than an effect.
 */

import { lod, box, xf, mergeAll } from "../geom.js";

const S = 0.22;            // outer size
const RECESS = 0.008;      // how far the panel sits below the border
const CORE = S - RECESS * 2;
const BORDER = 0.034;      // width of the raised frame on each face
const PANEL = S - BORDER * 2;

/**
 * The six face transforms, as rotations that carry +y onto each face normal.
 *
 * One canonical face is authored below and stamped six times. Writing out six
 * sets of coordinates instead would be six chances to transpose an axis, and
 * on a cube a single transposed panel is invisible in code and glaring on
 * screen.
 */
const FACES = [
  {},
  { rx: Math.PI },
  { rx: Math.PI / 2 },
  { rx: -Math.PI / 2 },
  { rz: -Math.PI / 2 },
  { rz: Math.PI / 2 },
];

/** A copy of `geo` placed in canonical +y-face space, then turned to `face`. */
function onFace(geo, canonical, face) {
  const g = xf(geo, canonical);
  if (face.rx) g.rotateX(face.rx);
  if (face.rz) g.rotateZ(face.rz);
  return g;
}

export function build(ctx) {
  const { THREE, mat, detail } = ctx;
  const group = new THREE.Group();

  const chamfer = lod(detail, 0, 0.004, 0.006, 0.006);
  const barChamfer = lod(detail, 0, 0.0015, 0.0025, 0.003);

  /* ---------------------------------------------------------------------- *
   * Body
   * ---------------------------------------------------------------------- */

  const bodyGeo = ctx.sg("cube.body", () => {
    // Low tier: the correct silhouette and nothing else. A phone cannot
    // afford twenty-five merged solids for one prop, and the seams below
    // carry the identity on their own.
    if (detail === 0) return box(detail, S, S, S);

    const parts = [];

    // The core's faces ARE the recessed panels; the border bars below stand
    // proud of them. Modelling it this way means the recess costs nothing
    // extra - it is simply where the core stops.
    parts.push(xf(box(detail, CORE, CORE, CORE, chamfer), {}));

    const barH = RECESS + 0.010;              // sunk into the core to close the joint
    const barY = S / 2 - barH / 2;
    const inset = S / 2 - BORDER / 2;

    for (const face of FACES) {
      for (const s of [-1, 1]) {
        parts.push(
          onFace(box(detail, S, barH, BORDER, barChamfer), { y: barY, z: s * inset }, face),
        );
        parts.push(
          onFace(box(detail, BORDER, barH, PANEL, barChamfer), { x: s * inset, y: barY }, face),
        );
      }

      // A second, finer step in the middle of each panel. Only worth its
      // triangles where there are enough pixels to resolve two steps.
      if (detail >= 2) {
        parts.push(
          onFace(box(detail, 0.118, 0.003, 0.118, 0.0012), { y: CORE / 2 + 0.0015 }, face),
        );
      }
    }

    return mergeAll(parts);
  });

  const body = new THREE.Mesh(bodyGeo, mat.anomaly());
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  /* ---------------------------------------------------------------------- *
   * Seams
   *
   * Separate mesh, separate material: the inlay is unlit and must not pick up
   * the room's light, and the body must not pick up the inlay's emission.
   * ---------------------------------------------------------------------- */

  const seamGeo = ctx.sg("cube.seams", () => {
    const parts = [];
    // At detail 0 there is no groove to sit in, so the inlay lies on the face
    // and is given a hair of relief to keep it off the surface it shares.
    const inGroove = detail > 0;
    const y = inGroove ? CORE / 2 + 0.0015 : S / 2 + 0.0005;
    const t = inGroove ? 0.004 : 0.003;
    const edge = PANEL / 2 - 0.0005;

    for (const face of FACES) {
      for (const s of [-1, 1]) {
        parts.push(onFace(box(detail, PANEL, t, 0.005), { y, z: s * edge }, face));
        parts.push(onFace(box(detail, 0.005, t, PANEL - 0.01), { x: s * edge, y }, face));
      }
    }

    // Ultra only: a hairline following every chamfered edge, turned 45 degrees
    // so it lies flat in the cut. This is the detail that makes the cube look
    // powered rather than decorated, and it is also twelve more solids, which
    // is why nothing below ultra gets it.
    if (detail >= 3) {
      const L = S + 0.0015;
      const r = 0.0035;
      const o = S / 2 - 0.0025;
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) {
          parts.push(xf(box(detail, L, r, r), { y: a * o, z: b * o, rx: Math.PI / 4 }));
          parts.push(xf(box(detail, r, r, L), { x: a * o, y: b * o, rz: Math.PI / 4 }));
          parts.push(xf(box(detail, r, L, r), { x: a * o, z: b * o, ry: Math.PI / 4 }));
        }
      }
    }

    return mergeAll(parts);
  });

  const seams = new THREE.Mesh(seamGeo, mat.emissive(0x2fe0b8, 2.6));
  // 4 mm inlays fall between shadow-map texels at every tier; casting from
  // them produces nothing but acne across the panels they sit in.
  seams.castShadow = false;
  seams.receiveShadow = false;
  group.add(seams);

  return group;
}
