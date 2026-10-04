/**
 * The writing table. 1.2 x 0.75 x 0.6 m.
 *
 * This is the largest object in the cell and the one the player leans over
 * while solving the first puzzle, so it carries the room's claim to being
 * built rather than assembled from primitives. Three things do that work:
 * the stepped edge profile under the top, the turned legs, and the fact that
 * the stretchers actually join the legs instead of floating near them.
 *
 * Everything static and wooden merges into one buffer. The drawer is its own
 * group because game code slides it, and the pull travels with it.
 */

import {
  lod, box, cyl, torus, xf, mergeAll, legStock,
} from "../geom.js";

/* Carcass dimensions, all in metres. Named because they appear in a dozen
 * expressions below and the relationships between them are the design. */
const W = 1.2;
const H = 0.75;
const D = 0.6;

const TOP_T = 0.048;           // top slab thickness
const LIP_T = 0.016;           // the moulding under it, which makes the step
const APRON_H = 0.12;          // rail depth under the top
const APRON_T = 0.022;
const LEG_X = 0.545;           // leg axis, inset so the top overhangs 0.02 m
const LEG_Z = 0.245;
const LEG_TOP = H - TOP_T;     // legs stop under the slab, not inside it
const STRETCH_Y = 0.14;

export function build(ctx) {
  const { THREE, mat, detail } = ctx;
  const group = new THREE.Group();

  const chamfer = lod(detail, 0, 0.002, 0.004, 0.005);

  /* ---------------------------------------------------------------------- *
   * Carcass
   * ---------------------------------------------------------------------- */

  const body = ctx.sg("table.body", () => {
    const parts = [];

    // Top slab. A heavier chamfer than the rest of the table: this is the one
    // edge the player's eye runs along, and it is the only place on the prop
    // where a highlight travels a full metre.
    parts.push(xf(box(detail, W, TOP_T, D, chamfer * 1.6), { y: H - TOP_T / 2 }));

    // The moulding under it. Set back 0.03 m all round so the slab reads as a
    // separate, thicker plank sitting on a frame - that step is most of what
    // separates a table from a box on sticks.
    parts.push(
      xf(box(detail, W - 0.06, LIP_T, D - 0.06, chamfer), {
        y: H - TOP_T - LIP_T / 2,
      }),
    );

    // Aprons. The front one is a frame around the drawer opening rather than
    // a solid rail, so the opening is a real hole with real edges.
    const apronY = LEG_TOP - LIP_T - APRON_H / 2;
    const apronW = (LEG_X - 0.035) * 2;
    const openW = 0.52;
    const openH = 0.085;

    const sideBlockW = (apronW - openW) / 2;
    for (const s of [-1, 1]) {
      parts.push(
        xf(box(detail, sideBlockW, APRON_H, APRON_T, chamfer), {
          x: (s * (openW + sideBlockW)) / 2,
          y: apronY,
          z: LEG_Z,
        }),
      );
    }
    // Equal rails above and below, so the opening sits on the apron's
    // centreline and the drawer front needs no vertical fudge.
    const railH = (APRON_H - openH) / 2;
    for (const s of [-1, 1]) {
      parts.push(
        xf(box(detail, openW, railH, APRON_T, chamfer), {
          y: apronY + (s * (openH + railH)) / 2,
          z: LEG_Z,
        }),
      );
    }

    // Back apron: solid, because nothing opens in it.
    parts.push(xf(box(detail, apronW, APRON_H, APRON_T, chamfer), { y: apronY, z: -LEG_Z }));
    // Side aprons.
    for (const s of [-1, 1]) {
      parts.push(
        xf(box(detail, APRON_T, APRON_H, LEG_Z * 2, chamfer), {
          x: s * LEG_X,
          y: apronY,
          z: 0,
        }),
      );
    }

    // Legs. Shared stock with the chair - same generator, same cache - with a
    // square block at the top where the aprons mortise in.
    const leg = legStock(detail, {
      len: LEG_TOP,
      top: 0.034,
      bot: 0.025,
      block: 0.14,
      turned: true,
    });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push(xf(leg, { x: sx * LEG_X, y: LEG_TOP, z: sz * LEG_Z }));
      }
    }

    // H-stretchers. Low enough to kick, which is why they are modelled at
    // every tier: their shadow on the floor is a large part of the table's
    // read from across a four-metre room.
    for (const s of [-1, 1]) {
      parts.push(
        xf(box(detail, 0.03, 0.045, LEG_Z * 2, chamfer), {
          x: s * LEG_X,
          y: STRETCH_Y,
        }),
      );
    }
    parts.push(xf(box(detail, LEG_X * 2, 0.035, 0.03, chamfer), { y: STRETCH_Y }));

    return mergeAll(parts);
  });

  const carcass = new THREE.Mesh(body, mat.wood());
  carcass.castShadow = true;
  // The top is the largest horizontal surface in the room that is not the
  // floor; anything set on it needs to land in its own contact shadow.
  carcass.receiveShadow = true;
  group.add(carcass);

  /* ---------------------------------------------------------------------- *
   * Drawer
   *
   * Its own group so the interaction system can slide it along +z without
   * touching the carcass. The front is lipped - wider and taller than the
   * opening - which is both period-correct and the cheap way to avoid a
   * z-fighting seam where two coplanar faces would otherwise meet.
   * ---------------------------------------------------------------------- */

  const apronY = LEG_TOP - LIP_T - APRON_H / 2;
  const drawer = new THREE.Group();
  drawer.name = "drawer";
  drawer.position.set(0, apronY, LEG_Z + APRON_T / 2);
  group.add(drawer);

  // Straight off the primitive cache: any other prop wanting a 530 x 95 x 20
  // panel at this tier gets the same buffer.
  const front = new THREE.Mesh(box(detail, 0.53, 0.095, 0.02, chamfer), mat.wood());
  front.position.z = 0.01;
  front.castShadow = true;
  front.receiveShadow = true;
  drawer.add(front);

  const pullGeo = ctx.sg("table.pull", () => {
    if (detail === 0) {
      // A knob: fewer than twenty triangles, and from a metre away a bail
      // handle and a knob read the same.
      return xf(box(detail, 0.034, 0.022, 0.014), { z: 0.027 });
    }
    const parts = [];
    const segs = lod(detail, 4, 6, 10, 14);
    // Bail handle: a half ring hanging from two posts. Rotated a half turn so
    // the arc hangs below its mounts rather than standing above them.
    parts.push(
      xf(torus(detail, 0.032, 0.0055, segs, lod(detail, 6, 10, 16, 24), Math.PI), {
        z: 0.03,
        rz: Math.PI,
      }),
    );
    for (const s of [-1, 1]) {
      parts.push(
        xf(cyl(detail, 0.006, 0.006, 0.014, segs + 2), {
          x: s * 0.032,
          z: 0.027,
          rx: Math.PI / 2,
        }),
      );
    }
    return mergeAll(parts);
  });

  const pull = new THREE.Mesh(pullGeo, mat.brass());
  pull.position.z = 0.02;
  // A 6 mm rod cannot resolve in a 1024 px shadow map; asking it to cast only
  // buys acne across the drawer front.
  pull.castShadow = false;
  pull.receiveShadow = true;
  drawer.add(pull);

  return group;
}
