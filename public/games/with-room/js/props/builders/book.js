/**
 * A hardback book. Closed by default; `ctx.variant === "open"` lays it open.
 *
 * Small, cheap, and picked up and turned over in the player's hands, which
 * means the fore-edge gets looked at directly. That edge is the whole prop:
 *
 *   At detail 2 and above the page block is a stack of separate leaves with a
 *   fraction of a millimetre of jitter on each, so the edge is ragged and
 *   catches light in bands. At detail 0 and 1 it is one slab, because fifteen
 *   boxes for one book is not a trade a phone should make and the slab still
 *   has the right silhouette.
 *
 *   The boards overhang the pages by 5 mm on three sides, which is what makes
 *   a book look bound rather than glued. It costs nothing and it is the
 *   difference between a book and a brick.
 *
 * The leaf jitter comes from a fixed seed rather than `ctx.rng`, so every book
 * in the game shares one cached page block. Books are told apart by where
 * they lie and which way up they are, not by their page edges, and a
 * per-instance stack would mean a separate 15-box merge for each one.
 */

import { lod, box, cylArc, xf, mergeAll } from "../geom.js";
import { makeRng } from "../../core/maths.js";

const W = 0.222;           // board width, spine to fore-edge
const T = 0.042;           // closed thickness
const DEEP = 0.152;        // board depth, head to tail
const BOARD = 0.004;

export function build(ctx) {
  const { THREE, mat, detail } = ctx;
  const open = ctx.variant === "open";
  const group = new THREE.Group();

  const chamfer = lod(detail, 0, 0.0008, 0.0015, 0.002);
  const segs = lod(detail, 4, 6, 10, 14);

  const clothGeo = ctx.sg(open ? "book.cloth.open" : "book.cloth", () =>
    open
      ? buildOpenCloth(detail, chamfer, segs)
      : buildClosedCloth(detail, chamfer, segs),
  );
  const pagesGeo = ctx.sg(open ? "book.pages.open" : "book.pages", () =>
    open ? buildOpenPages(THREE) : buildClosedPages(detail),
  );

  const cloth = new THREE.Mesh(clothGeo, mat.fabric());
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  group.add(cloth);

  const pages = new THREE.Mesh(pagesGeo, mat.paper());
  pages.castShadow = true;
  pages.receiveShadow = true;
  group.add(pages);

  return group;
}

/* -------------------------------------------------------------------------- *
 * Closed
 * -------------------------------------------------------------------------- */

function buildClosedCloth(detail, chamfer, segs) {
  const parts = [
    xf(box(detail, W, BOARD, DEEP, chamfer), { y: BOARD / 2 }),
    xf(box(detail, W, BOARD, DEEP, chamfer), { y: T - BOARD / 2 }),
  ];

  // Rounded spine. A half cylinder of half the book's thickness, with its
  // axis set in from the board edge so it bulges 5 mm proud - which is what
  // a rounded back does, and what makes the book readable end-on in a shelf.
  const r = T / 2;
  const spine = cylArc(detail, r, W, segs, Math.PI / 2, Math.PI);
  parts.push(xf(spine, { y: r, z: -DEEP / 2 + 0.016, rz: -Math.PI / 2 }));

  return mergeAll(parts);
}

function buildClosedPages(detail) {
  const pw = W - 0.01;        // boards overhang 5 mm at each side
  const pd = DEEP - 0.02;
  const ph = T - BOARD * 2;
  const z = 0.004;            // pushed toward the fore-edge, away from the spine

  const leaves = lod(detail, 1, 1, 7, 15);
  if (leaves === 1) return xf(box(detail, pw, ph, pd, 0.0008), { y: T / 2, z });

  const rng = makeRng(5171);
  const gap = 0.0003;
  const lh = (ph - (leaves - 1) * gap) / leaves;
  const parts = [];
  for (let i = 0; i < leaves; i++) {
    parts.push(
      xf(box(detail, pw, lh, pd), {
        x: (rng() - 0.5) * 0.0014,
        y: BOARD + lh / 2 + i * (lh + gap),
        z: z + (rng() - 0.5) * 0.0014,
      }),
    );
  }
  return mergeAll(parts);
}

/* -------------------------------------------------------------------------- *
 * Open
 *
 * Laid on a surface with the spine running away from the reader, so the two
 * halves are wedges: thick at the gutter, thin at the fore-edge. The mirrored
 * half is turned a half circle about y rather than scaled by -1, because a
 * negative scale flips the winding and the back half would render inside out.
 * -------------------------------------------------------------------------- */

const OPEN_IN = 0.004;       // gutter edge
const OPEN_OUT = 0.148;      // fore-edge
const OPEN_THICK = 0.026;    // page stack height at the gutter
const OPEN_THIN = 0.011;
const OPEN_DEEP = 0.158;
const OPEN_SLOPE = Math.atan((OPEN_THICK - OPEN_THIN) / (OPEN_OUT - OPEN_IN));

function buildOpenCloth(detail, chamfer, segs) {
  const parts = [];

  // Spine, lying in the gutter with its axis along z.
  const r = 0.012;
  parts.push(xf(cylArc(detail, r, OPEN_DEEP, segs, Math.PI / 2, Math.PI), { y: r, rx: -Math.PI / 2 }));

  const mid = (OPEN_IN + OPEN_OUT) / 2;
  for (const s of [-1, 1]) {
    // Board under the leaves.
    parts.push(
      xf(box(detail, OPEN_OUT - OPEN_IN + 0.008, BOARD, OPEN_DEEP, chamfer), {
        x: s * mid,
        y: BOARD / 2,
      }),
    );
    // Board on top of them, tilted to lie on the wedge.
    parts.push(
      xf(box(detail, OPEN_OUT - OPEN_IN, 0.0035, OPEN_DEEP, chamfer), {
        x: s * mid,
        y: (OPEN_THICK + OPEN_THIN) / 2 + 0.0022,
        rz: -s * OPEN_SLOPE,
      }),
    );
  }
  return mergeAll(parts);
}

function buildOpenPages(THREE) {
  // A true wedge needs a four-sided profile, which no box primitive has.
  const shape = new THREE.Shape();
  shape.moveTo(OPEN_IN, BOARD + 0.001);
  shape.lineTo(OPEN_OUT, BOARD + 0.001);
  shape.lineTo(OPEN_OUT, OPEN_THIN);
  shape.lineTo(OPEN_IN, OPEN_THICK);
  shape.closePath();

  const wedge = new THREE.ExtrudeGeometry(shape, { depth: OPEN_DEEP, bevelEnabled: false });
  wedge.translate(0, 0, -OPEN_DEEP / 2);

  const parts = [xf(wedge, {}), xf(wedge, { ry: Math.PI })];
  wedge.dispose();
  return mergeAll(parts);
}
