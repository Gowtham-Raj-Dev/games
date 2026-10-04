/**
 * The bed he wakes up on.
 *
 * An institutional iron-framed single: the kind in a hospital, a barracks or a
 * cell, never in a bedroom. That is the whole reason it is this bed and not a
 * nicer one - the first thing the player ever sees in WITHROOM is the ceiling
 * above this frame, and a bed that belongs to an institution says somebody put
 * him here before any line of dialogue does.
 *
 * Built as four parts so the shadow pass can skip the ones that cannot
 * usefully cast: the mattress and the frame cast, the springs and the castors
 * do not. A bed is also the one prop in the game the player will be INSIDE at
 * the moment of the wake-up, so the head end gets the detail and the foot end
 * is two tubes.
 */

import { lod, box, cyl, sphere, torus, xf, mergeAll } from "../geom.js";

const W = 0.92;          // frame width
const L = 1.96;          // frame length
const DECK = 0.4;        // height of the sprung deck
const TUBE = 0.019;      // frame tube radius
const HEAD_H = 0.78;     // head end rail height
const FOOT_H = 0.52;

export function build(ctx) {
  const { THREE, mat, detail } = ctx;
  const group = new THREE.Group();

  const segs = lod(detail, 5, 6, 8, 10);

  /* ---------------------------------------------------------------------- *
   * Frame
   *
   * One merged mesh: four legs, the deck rails, and the head and foot ends
   * with their vertical bars. All of it is the same painted iron, so merging
   * turns about twenty primitives into one draw call.
   * ---------------------------------------------------------------------- */

  const frame = new THREE.Mesh(
    ctx.sg("bed.frame", () => {
      const parts = [];
      const hw = W / 2 - TUBE;
      const hl = L / 2 - TUBE;

      // Legs. They stop at the deck rather than running up to the rails: the
      // corner posts above are a separate run, because on a real frame the
      // head end is a welded assembly bolted to the side rails.
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          parts.push(
            xf(cyl(detail, TUBE, TUBE * 1.1, DECK, segs), {
              x: sx * hw,
              y: DECK / 2,
              z: sz * hl,
            }),
          );
        }
      }

      // Side and end rails at deck height.
      for (const sx of [-1, 1]) {
        parts.push(
          xf(cyl(detail, TUBE, TUBE, L - TUBE * 2, segs), {
            x: sx * hw, y: DECK, rx: Math.PI / 2,
          }),
        );
      }
      for (const sz of [-1, 1]) {
        parts.push(
          xf(cyl(detail, TUBE, TUBE, W - TUBE * 2, segs), {
            z: sz * hl, y: DECK, rz: Math.PI / 2,
          }),
        );
      }

      // Head and foot ends: two posts, a top rail, and the vertical bars
      // between them. The bars are what make it read as institutional.
      for (const [h, sz, bars] of [[HEAD_H, -1, lod(detail, 3, 4, 5, 6)], [FOOT_H, 1, lod(detail, 2, 3, 4, 4)]]) {
        for (const sx of [-1, 1]) {
          parts.push(
            xf(cyl(detail, TUBE, TUBE, h - DECK, segs), {
              x: sx * hw, y: DECK + (h - DECK) / 2, z: sz * hl,
            }),
          );
        }
        // The top rail is a shallow arc, not a straight tube. Two short tubes
        // meeting at a raised centre is enough of an arc at this distance and
        // costs nothing next to a torus segment.
        parts.push(
          xf(cyl(detail, TUBE, TUBE, W * 0.52, segs), {
            x: -W * 0.24, y: h - 0.012, z: sz * hl, rz: Math.PI / 2 - 0.05,
          }),
        );
        parts.push(
          xf(cyl(detail, TUBE, TUBE, W * 0.52, segs), {
            x: W * 0.24, y: h - 0.012, z: sz * hl, rz: Math.PI / 2 + 0.05,
          }),
        );
        // Finials. The one piece of decoration on the whole object, and the
        // reason it reads as old rather than as cheap.
        for (const sx of [-1, 1]) {
          parts.push(
            xf(sphere(detail, TUBE * 1.7, segs, Math.max(4, segs / 2)), {
              x: sx * hw, y: h + 0.006, z: sz * hl,
            }),
          );
        }
        for (let i = 1; i < bars; i++) {
          const x = -hw + (i / bars) * hw * 2;
          parts.push(
            xf(cyl(detail, TUBE * 0.55, TUBE * 0.55, h - DECK - 0.02, Math.max(4, segs - 2)), {
              x, y: DECK + (h - DECK) / 2, z: sz * hl,
            }),
          );
        }
      }

      return mergeAll(parts);
    }),
    mat.iron(),
  );
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  /* ---------------------------------------------------------------------- *
   * Springs
   *
   * A grid of thin tubes under the mattress. Almost never visible - and that
   * is the point: the one angle it IS visible from is lying on the floor
   * looking under the bed, which is exactly where this game sends the player
   * to find the last digit of the code.
   * ---------------------------------------------------------------------- */

  if (detail >= 1) {
    const springs = new THREE.Mesh(
      ctx.sg("bed.springs", () => {
        const parts = [];
        const n = lod(detail, 0, 5, 8, 11);
        for (let i = 0; i < n; i++) {
          const z = -L / 2 + 0.1 + (i / (n - 1)) * (L - 0.2);
          parts.push(
            xf(cyl(detail, 0.004, 0.004, W - 0.06, 4), { y: DECK - 0.02, z, rz: Math.PI / 2 }),
          );
        }
        for (const x of [-W * 0.3, 0, W * 0.3]) {
          parts.push(xf(cyl(detail, 0.004, 0.004, L - 0.1, 4), { x, y: DECK - 0.026, rx: Math.PI / 2 }));
        }
        return mergeAll(parts);
      }),
      mat.steel(),
    );
    springs.castShadow = false;
    springs.receiveShadow = true;
    group.add(springs);
  }

  /* ---------------------------------------------------------------------- *
   * Mattress and pillow
   *
   * The mattress sags. It is one number - the middle is 3 cm lower than the
   * edges - and it is most of what makes the bed read as slept in rather than
   * as made up. A flat slab looks like a shop display.
   * ---------------------------------------------------------------------- */

  const mattress = new THREE.Mesh(
    ctx.sg("bed.mattress", () => {
      const g = box(detail, W - 0.04, 0.13, L - 0.05, 0.02).clone();
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        // Only the top surface sags; the underside stays flat on the springs.
        if (y <= 0) continue;
        const u = 1 - Math.abs(x) / (W / 2);
        const v = 1 - Math.abs(z) / (L / 2);
        pos.setY(i, y - u * v * 0.032);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      return g;
    }),
    mat.fabric(),
  );
  mattress.position.y = DECK + 0.065;
  mattress.castShadow = true;
  mattress.receiveShadow = true;
  group.add(mattress);

  const pillow = new THREE.Mesh(
    ctx.sg("bed.pillow", () =>
      // Squashed in the middle where a head has been. The dent is the detail
      // that tells the player they were lying here, which no amount of
      // dialogue does as economically.
      xf(sphere(detail, 1, lod(detail, 8, 12, 16, 20), lod(detail, 6, 8, 10, 12)), {
        sx: 0.3, sy: 0.055, sz: 0.17,
      }),
    ),
    mat.paper(),
  );
  pillow.position.set(0, DECK + 0.15, -L / 2 + 0.26);
  pillow.rotation.y = 0.08;
  pillow.castShadow = true;
  pillow.receiveShadow = true;
  group.add(pillow);

  /* --- blanket, thrown back ------------------------------------------- *
   * Pushed to the foot of the bed in a heap, because he got up. A neatly
   * folded blanket would be the single most reassuring object in the room.
   */
  const blanket = new THREE.Mesh(
    ctx.sg("bed.blanket", () => {
      const parts = [
        xf(box(detail, W - 0.02, 0.07, 0.5, 0.03), { y: 0 }),
        xf(box(detail, W - 0.1, 0.05, 0.3, 0.03), { y: 0.05, z: -0.12, rx: 0.12 }),
        xf(box(detail, W - 0.22, 0.04, 0.22, 0.02), { y: 0.08, z: 0.1, rx: -0.2, ry: 0.2 }),
      ];
      return mergeAll(parts);
    }),
    mat.fabric(),
  );
  blanket.position.set(0, DECK + 0.14, L / 2 - 0.42);
  blanket.castShadow = true;
  blanket.receiveShadow = true;
  group.add(blanket);

  return group;
}
