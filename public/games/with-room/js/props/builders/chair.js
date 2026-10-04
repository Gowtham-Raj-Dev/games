/**
 * The chair. Seat at 0.45 m, crest rail at about 0.93 m.
 *
 * Built the way a chair is actually made, because the shortcuts are the thing
 * that reads as fake:
 *
 *   - The rear legs and the back uprights are ONE member each, bent at the
 *     seat. A back that sits on top of a separate seat box always looks
 *     glued on.
 *   - Every joint is computed from the member it joins, never guessed. The
 *     legs splay, so the stretchers between them do not run along the plan
 *     view's grid lines, and eyeballing those positions leaves gaps you can
 *     see from across the room.
 *   - The seat is dished. A flat upholstered pad is the single loudest tell
 *     that furniture was modelled rather than built.
 */

import { lod, box, xf, mergeAll, strut, legBetween, polyBar } from "../geom.js";

const SEAT_Y = 0.45;
const RAIL_H = 0.05;           // seat frame rail depth
const RAIL_T = 0.032;
const JOINT_Y = 0.43;          // where legs meet the frame, inside the rail
const FRAME_X = 0.178;
const FRAME_Z = 0.185;
const BACK_Y = 0.89;           // top of the uprights, under the crest rail
const STRETCH_Y = 0.165;

export function build(ctx) {
  const { THREE, mat, detail } = ctx;
  const group = new THREE.Group();

  const chamfer = lod(detail, 0, 0.0015, 0.003, 0.004);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---------------------------------------------------------------------- *
   * Frame, legs and back - one merged wooden body
   * ---------------------------------------------------------------------- */

  const bodyGeo = ctx.sg("chair.body", () => {
    const parts = [];
    const railY = SEAT_Y - RAIL_H / 2;

    // Seat frame. Four rails, mitred at the corners by simply overlapping:
    // the joint is buried under the cushion and the leg blocks.
    for (const s of [-1, 1]) {
      parts.push(
        xf(box(detail, FRAME_X * 2 + RAIL_T, RAIL_H, RAIL_T, chamfer), {
          y: railY,
          z: s * FRAME_Z,
        }),
      );
      parts.push(
        xf(box(detail, RAIL_T, RAIL_H, FRAME_Z * 2 - RAIL_T, chamfer), {
          x: s * FRAME_X,
          y: railY,
        }),
      );
    }

    // Front legs: splayed out and forward. Shared stock with the table - the
    // same `legStock` generator and the same cache - just shorter and with a
    // smaller block, so a chair and a table in the same room look related
    // without looking identical.
    const frontTop = [];
    const frontBottom = [];
    for (const s of [-1, 1]) {
      const top = V(s * FRAME_X, JOINT_Y, FRAME_Z);
      const bottom = V(s * 0.212, 0, 0.238);
      frontTop.push(top);
      frontBottom.push(bottom);
      parts.push(
        legBetween(detail, top, bottom, {
          top: 0.019,
          bot: 0.014,
          block: 0.055,
          turned: true,
        }),
      );
    }

    // Rear legs continued as the back uprights, bent at the seat.
    const backTop = [];
    const rearBottom = [];
    for (const s of [-1, 1]) {
      const foot = V(s * 0.206, 0, -0.212);
      const knee = V(s * FRAME_X, JOINT_Y, -FRAME_Z);
      const head = V(s * 0.16, BACK_Y, -0.225);
      backTop.push(head);
      rearBottom.push(foot);
      parts.push(strut(detail, foot, knee, 0.032, 0.032, chamfer));
      parts.push(strut(detail, knee, head, 0.028, 0.028, chamfer));
    }

    /* Point on a member at a given height. Every stretcher and slat below
     * uses this rather than a literal, which is what keeps the joints shut
     * when any of the splay numbers above are retuned. */
    const atHeight = (a, b, y) => {
      const t = (y - a.y) / (b.y - a.y);
      return new THREE.Vector3().lerpVectors(a, b, t);
    };

    // H-stretchers, matching the table's. The rear member is the bent one, so
    // below the seat the segment to sample is foot-to-knee, not the whole
    // upright - sampling the upright would put the joint behind the leg.
    const sideMid = [];
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      const front = atHeight(frontTop[i], frontBottom[i], STRETCH_Y);
      const rear = atHeight(
        rearBottom[i],
        V(s * FRAME_X, JOINT_Y, -FRAME_Z),
        STRETCH_Y,
      );
      parts.push(strut(detail, front, rear, 0.022, 0.026, chamfer));
      sideMid.push(new THREE.Vector3().addVectors(front, rear).multiplyScalar(0.5));
    }
    sideMid[0].y = sideMid[1].y = STRETCH_Y - 0.02;
    parts.push(strut(detail, sideMid[0], sideMid[1], 0.02, 0.024, chamfer));

    // Back slats. Horizontal, bowed back a few millimetres to follow the
    // crest - a dead-straight slat against a curved crest is the detail that
    // gives away a back assembled from boxes.
    const slatYs = lod(detail, [0.615, 0.765], [0.585, 0.695, 0.805], [0.585, 0.695, 0.805], [0.57, 0.665, 0.76, 0.855]);
    const slatSegs = lod(detail, 1, 1, 3, 4);
    for (const y of slatYs) {
      const left = atHeight(V(-FRAME_X, JOINT_Y, -FRAME_Z), backTop[0], y);
      const right = atHeight(V(FRAME_X, JOINT_Y, -FRAME_Z), backTop[1], y);
      const pts = [];
      for (let i = 0; i <= slatSegs; i++) {
        const t = i / slatSegs;
        const p = new THREE.Vector3().lerpVectors(left, right, t);
        p.z -= Math.sin(t * Math.PI) * 0.014;
        pts.push(p);
      }
      parts.push(...polyBar(detail, pts, 0.012, 0.058, chamfer));
    }

    // Crest rail: a shallow arc, bowed back and lifted slightly in the middle.
    const crestSegs = lod(detail, 2, 3, 5, 7);
    const crest = [];
    for (let i = 0; i <= crestSegs; i++) {
      const t = i / crestSegs;
      const s = Math.sin(t * Math.PI);
      crest.push(
        V(
          THREE.MathUtils.lerp(backTop[0].x, backTop[1].x, t),
          BACK_Y + s * 0.012,
          THREE.MathUtils.lerp(backTop[0].z, backTop[1].z, t) - s * 0.027,
        ),
      );
    }
    parts.push(...polyBar(detail, crest, 0.024, 0.055, chamfer * 1.5));

    return mergeAll(parts);
  });

  const frame = new THREE.Mesh(bodyGeo, mat.wood());
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  /* ---------------------------------------------------------------------- *
   * Cushion
   *
   * A displaced box rather than a sculpted mesh: eight segments a side is
   * enough to carry a dish the eye reads as "someone has sat here", and the
   * crease that stays at the box's own face boundaries passes for the piped
   * seam of upholstery rather than a modelling artefact.
   * ---------------------------------------------------------------------- */

  const cushionGeo = ctx.sg("chair.cushion", () => {
    const cw = 0.372;
    const ch = 0.058;
    const cd = 0.382;
    const segs = lod(detail, 1, 4, 8, 10);
    const g = new THREE.BoxGeometry(cw, ch, cd, segs, 2, segs);

    if (detail > 0) {
      const pos = g.attributes.position;
      const dish = 0.013;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const u = x / (cw / 2);
        const v = z / (cd / 2);
        const r2 = Math.min(1, u * u * 0.85 + v * v * 0.85);
        if (y > 0.001) pos.setY(i, y - dish * (1 - r2));
        // Upholstery bulges at its waist and tucks under at top and bottom.
        const bulge = 1 - 0.13 * (Math.abs(y) / (ch / 2));
        pos.setX(i, x * bulge);
        pos.setZ(i, z * bulge);
      }
      g.computeVertexNormals();
    }
    return g;
  });

  const cushion = new THREE.Mesh(cushionGeo, mat.fabric());
  cushion.position.set(0, SEAT_Y - 0.012, 0);
  cushion.castShadow = true;
  cushion.receiveShadow = true;
  group.add(cushion);

  return group;
}
