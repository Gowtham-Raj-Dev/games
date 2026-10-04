/**
 * A ceramic mug. About 98 mm tall.
 *
 * Lathe-turned, because a mug IS a lathe-turned object and faking it with a
 * cylinder throws away the two details that make it one: the swell of the
 * belly, and the fact that the rim has a thickness you can see down onto.
 *
 * The profile below runs all the way round the cross-section - up the
 * outside, over the rim, down the inside, across the floor - so the mug is a
 * genuine vessel with a wall. Looking into it shows an inner surface catching
 * the lamp, not a hole into backface-culled nothing.
 *
 * The handle is a torus arc whose ends are deliberately driven a few
 * millimetres INTO the wall. A handle that stops at the surface leaves a
 * visible seam at every angle; one that overshoots has none, and the overlap
 * is invisible from outside.
 */

import { lod, lathe, torus, xf, mergeAll } from "../geom.js";

/** Full profile: [radius, height] from the centre of the base, anticlockwise. */
const PROFILE = [
  [0, 0],
  [0.0300, 0],
  [0.0330, 0.0035],
  [0.0345, 0.0120],
  [0.0375, 0.0450],
  [0.0400, 0.0780],
  [0.0398, 0.0920],
  [0.0385, 0.0975],   // over the rim
  [0.0358, 0.0975],
  [0.0352, 0.0900],
  [0.0342, 0.0600],
  [0.0310, 0.0200],
  [0.0260, 0.0085],
  [0.0150, 0.0062],
  [0, 0.0060],        // inner floor
];

/** The same vessel in seven points. Still a wall, still a rim, no swell. */
const PROFILE_LOW = [
  [0, 0],
  [0.0320, 0],
  [0.0400, 0.0750],
  [0.0385, 0.0975],
  [0.0350, 0.0975],
  [0.0330, 0.0100],
  [0, 0.0080],
];

const HANDLE_ARC = 4.8;
const HANDLE_R = 0.021;
const HANDLE_TUBE = 0.0048;
const HANDLE_X = 0.0515;
const HANDLE_Y = 0.055;

export function build(ctx) {
  const { THREE, mat, detail } = ctx;
  const group = new THREE.Group();

  const geo = ctx.sg("mug.body", () => {
    const radial = lod(detail, 8, 14, 24, 36);
    const body = detail === 0
      ? lathe(detail, "mugLow", PROFILE_LOW, radial)
      : lathe(detail, "mug", PROFILE, radial);

    const handle = torus(
      detail,
      HANDLE_R,
      HANDLE_TUBE,
      lod(detail, 5, 6, 10, 14),
      lod(detail, 8, 12, 20, 28),
      HANDLE_ARC,
    );

    return mergeAll([
      xf(body, {}),
      // A torus arc starts at +x and sweeps anticlockwise, so half the arc is
      // rotated back off to centre the opening on the mug.
      xf(handle, { x: HANDLE_X, y: HANDLE_Y, rz: -HANDLE_ARC / 2 }),
    ]);
  });

  const mug = new THREE.Mesh(geo, mat.ceramic());
  mug.castShadow = true;
  mug.receiveShadow = true;
  group.add(mug);

  return group;
}
