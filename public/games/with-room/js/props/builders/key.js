/**
 * A small brass key. 80 mm long, lying flat.
 *
 * At this size surface detail is wasted - the whole prop covers a few dozen
 * pixels on the floor and a couple of hundred held up to the camera - so
 * everything here is spent on silhouette instead. The bow is a full ring
 * rather than a blob, the shank necks down toward the tip, and the bit has
 * three teeth of three different lengths. Those are the features that say
 * "key" from across a room; a bevelled edge would not survive the first
 * mipmap.
 *
 * Split into two meshes despite sharing one material, purely so the teeth can
 * be excluded from the shadow pass: a 4 mm tooth falls well inside a single
 * shadow-map texel at every tier we ship, so all it can contribute is acne
 * along the shank it is attached to.
 */

import { lod, box, cyl, sphere, torus, xf, mergeAll } from "../geom.js";

const BOW_X = -0.026;
const BOW_R = 0.0115;
const BOW_TUBE = 0.0026;
const SHANK_R = 0.0031;
const BIT_X = 0.027;

export function build(ctx) {
  const { THREE, mat, detail } = ctx;
  const group = new THREE.Group();

  const segs = lod(detail, 6, 8, 12, 16);

  /* ---------------------------------------------------------------------- *
   * Bow, collar and shank
   * ---------------------------------------------------------------------- */

  const shaft = new THREE.Mesh(
    ctx.sg("key.shaft", () => {
      const parts = [];

      // Lying flat on its side, so the ring reads as a ring in plan view -
      // which is the view the player has of it on the floor.
      parts.push(
        xf(torus(detail, BOW_R, BOW_TUBE, lod(detail, 5, 6, 8, 10), lod(detail, 8, 12, 18, 24)), {
          x: BOW_X,
          rx: Math.PI / 2,
        }),
      );

      // Collar where the bow is brazed to the shank. Two millimetres of
      // geometry, and without it the ring looks threaded onto the shaft.
      parts.push(xf(cyl(detail, 0.0048, 0.0048, 0.005, segs), { x: -0.0135, rz: Math.PI / 2 }));

      // Shank, tapering toward the tip. Negative rotation so the narrow end
      // of the cone lands at +x.
      parts.push(
        xf(cyl(detail, SHANK_R - 0.0003, SHANK_R + 0.0003, 0.048, segs), {
          x: 0.012,
          rz: -Math.PI / 2,
        }),
      );
      parts.push(
        xf(sphere(detail, SHANK_R - 0.0003, segs, Math.max(4, segs / 2)), { x: 0.036 }),
      );

      return mergeAll(parts);
    }),
    mat.brass(),
  );
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  /* ---------------------------------------------------------------------- *
   * Bit
   * ---------------------------------------------------------------------- */

  const bit = new THREE.Mesh(
    ctx.sg("key.bit", () => {
      // One blank at the low tier. The teeth are 4 mm features on a prop that
      // is a thumbnail wide; the plate alone still reads as the business end.
      if (detail === 0) return xf(box(detail, 0.020, 0.0055, 0.009), { x: BIT_X, z: 0.0045 });

      const parts = [
        xf(box(detail, 0.020, 0.0055, 0.0045), { x: BIT_X, z: 0.0022 }),
        xf(box(detail, 0.0040, 0.0055, 0.0075), { x: 0.0195, z: 0.0075 }),
        xf(box(detail, 0.0040, 0.0055, 0.0100), { x: 0.0275, z: 0.0090 }),
        xf(box(detail, 0.0040, 0.0055, 0.0060), { x: 0.0345, z: 0.0070 }),
      ];
      return mergeAll(parts);
    }),
    mat.brass(),
  );
  bit.castShadow = false;
  bit.receiveShadow = true;
  group.add(bit);

  return group;
}
