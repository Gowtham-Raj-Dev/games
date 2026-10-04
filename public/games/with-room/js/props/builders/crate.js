/**
 * A packing crate. 0.5 x 0.45 x 0.5 m, flat top and flat bottom so they stack.
 *
 * Crates are the prop most likely to be duplicated around a room, which makes
 * them the prop most likely to look duplicated. Two things fight that:
 *
 *   The gaps between the boards are real. Light from the desk lamp passes
 *   between them and the interior goes dark, so a crate reads as hollow
 *   without ever being opened. A solid box with a plank texture never does.
 *
 *   Three seeded variants. The boards are not identical: each is nudged a
 *   millimetre or two in thickness and position. The jitter is drawn from the
 *   VARIANT INDEX, not from the caller's stream, because the whole merged
 *   body is cached - if the jitter came from the live rng, two crates built
 *   in a different order would share one buffer and silently become the same
 *   crate. Three buckets is enough that a stack does not read as a pattern,
 *   and few enough that the cache stays small.
 */

import { lod, box, xf, mergeAll } from "../geom.js";
import { makeRng } from "../../core/maths.js";

const W = 0.5;
const H = 0.45;
const POST = 0.042;
const BOARD = 0.016;     // board thickness, and the gap between boards
const VARIANTS = 3;

export function build(ctx) {
  const { THREE, mat, detail } = ctx;
  const group = new THREE.Group();

  const chamfer = lod(detail, 0, 0.0015, 0.003, 0.004);
  const variant = Math.floor(ctx.rng() * VARIANTS) % VARIANTS;

  /* ---------------------------------------------------------------------- *
   * Boards and posts
   * ---------------------------------------------------------------------- */

  const bodyGeo = ctx.sg(`crate.body.v${variant}`, () => {
    const rng = makeRng(9001 + variant * 137);
    const jitter = (amount) => (rng() - 0.5) * 2 * amount;
    const parts = [];

    const postInset = W / 2 - POST / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push(
          xf(box(detail, POST, H, POST, chamfer), {
            x: sx * postInset,
            y: H / 2,
            z: sz * postInset,
          }),
        );
      }
    }

    // Sides. The z-facing boards run the full width and the x-facing ones
    // butt into them, which is how a crate is actually nailed up and why the
    // corner posts show on two faces and not four.
    const rows = lod(detail, 3, 4, 4, 5);
    const sideH = (H - (rows - 1) * BOARD) / rows;
    // The x-facing boards stop at the inner faces of the z-facing ones.
    const inner = W / 2 - BOARD;
    for (let i = 0; i < rows; i++) {
      const y = sideH / 2 + i * (sideH + BOARD) + jitter(0.0015);
      const t = BOARD + jitter(0.0015);
      const h = sideH + jitter(0.0012);
      for (const s of [-1, 1]) {
        parts.push(
          xf(box(detail, W, h, t, chamfer), { y, z: s * (W / 2 - BOARD / 2) + jitter(0.0008) }),
        );
        parts.push(
          xf(box(detail, t, h, inner * 2, chamfer), {
            x: s * (W / 2 - BOARD / 2) + jitter(0.0008),
            y,
          }),
        );
      }
    }

    // Lid and floor. The lid gets gaps like the sides; the floor is close
    // boarded, because a crate with a gappy bottom spills its contents and
    // because the floor is the surface the player never sees.
    const lidBoards = lod(detail, 3, 4, 4, 5);
    const lidW = (W - (lidBoards - 1) * BOARD) / lidBoards;
    for (let i = 0; i < lidBoards; i++) {
      const z = -W / 2 + lidW / 2 + i * (lidW + BOARD) + jitter(0.001);
      parts.push(xf(box(detail, W, BOARD, lidW + jitter(0.0012), chamfer), { y: H - BOARD / 2, z }));
    }
    const floorW = (W - 2 * BOARD) / 3;
    for (let i = 0; i < 3; i++) {
      const z = -W / 2 + floorW / 2 + i * (floorW + BOARD);
      parts.push(xf(box(detail, W, BOARD, floorW, chamfer), { y: BOARD / 2, z }));
    }

    return mergeAll(parts);
  });

  const boards = new THREE.Mesh(bodyGeo, mat.woodPale());
  boards.castShadow = true;
  boards.receiveShadow = true;
  group.add(boards);

  /* ---------------------------------------------------------------------- *
   * Corner straps
   *
   * Two per post, each an L wrapping the two outer faces. They are what make
   * the corners read as reinforced rather than merely mitred, and they are
   * the only metal on the prop, so they take all the specular.
   * ---------------------------------------------------------------------- */

  const strapGeo = ctx.sg("crate.straps", () => {
    const parts = [];
    const face = W / 2 + 0.0015;
    const reach = 0.09;
    const along = W / 2 - reach / 2;
    for (const y of [0.045, H - 0.045]) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          parts.push(xf(box(detail, reach, 0.03, 0.004), { x: sx * along, y, z: sz * face }));
          parts.push(xf(box(detail, 0.004, 0.03, reach), { x: sx * face, y, z: sz * along }));
        }
      }
    }
    return mergeAll(parts);
  });

  const straps = new THREE.Mesh(strapGeo, mat.iron());
  // 4 mm of strap sitting flush on a board it cannot be separated from in any
  // shadow map we ship: casting from it is pure acne along every corner.
  straps.castShadow = false;
  straps.receiveShadow = true;
  group.add(straps);

  return group;
}
