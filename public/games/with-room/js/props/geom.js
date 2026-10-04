/**
 * Shared geometry cache and the primitive factory every prop builder uses.
 *
 * Two problems are solved here, and they pull against each other.
 *
 * DRAW CALLS. The cell is four metres across and the player's face is often
 * under a metre from the furniture, so the props carry most of the frame's
 * detail. Built naively a table is a top, an apron, four legs, three
 * stretchers and a handle: fourteen meshes for one piece of furniture, and
 * nine props later the room costs more draw calls than the whole of the
 * sibling racing game. So anything static that shares a material is merged
 * into a single buffer at build time (`mergeAll`).
 *
 * MEMORY. Merging means a prop cannot simply instance a shared leg; it has to
 * bake a copy of it. The answer is to cache one level further back: every
 * primitive below is keyed by its exact parameters, so the table and the chair
 * asking for the same stock get the same source buffer and only the baked copy
 * is duplicated. Building a second table of the same tier costs nothing at all,
 * because the whole merged body is itself cached under one key.
 *
 * Every key carries the detail level. Two tiers want genuinely different
 * buffers - different segment counts, chamfers present or absent - and a tier
 * switch that handed back the previous tier's geometry would be invisible in
 * code review and obvious on screen.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* -------------------------------------------------------------------------- *
 * The registry
 * -------------------------------------------------------------------------- */

/** key -> BufferGeometry. Lives as long as the game does. */
const sharedGeo = new Map();

/**
 * Everything the registry owns.
 *
 * Teardown between room states walks the scene disposing geometry. Anything in
 * this set is still referenced by the cache and by every other prop built from
 * it, so disposing it would blank the next room. `disposeProp` checks this.
 */
export const SHARED = new Set();

/** Fetch a cached geometry, building it on first ask. */
export function sg(key, make) {
  let g = sharedGeo.get(key);
  if (!g) {
    g = make();
    sharedGeo.set(key, g);
    SHARED.add(g);
  }
  return g;
}

/** Drop the whole cache. Only on a full game teardown. */
export function disposeShared() {
  for (const g of sharedGeo.values()) g.dispose();
  sharedGeo.clear();
  SHARED.clear();
}

/* -------------------------------------------------------------------------- *
 * Detail helpers
 * -------------------------------------------------------------------------- */

/**
 * Pick one of four values by `propDetail`.
 *
 * Written as a function rather than an array lookup at every call site so that
 * the four tiers always read side by side: seeing `lod(d, 6, 10, 16, 24)` makes
 * the whole LOD ramp for that number legible in one line, which is the only way
 * these stay balanced as the props are tuned.
 */
export const lod = (detail, low, med, high, ultra) =>
  [low, med, high, ultra][detail < 0 ? 0 : detail > 3 ? 3 : detail | 0];

/** Stable cache-key fragment for a float. Avoids 0.30000000000000004 keys. */
const n = (v) => (+v).toFixed(5);

/* -------------------------------------------------------------------------- *
 * Transform helpers
 *
 * Scratch objects are module level: a prop with forty merged parts would
 * otherwise churn two hundred short-lived Vector3s through the GC during the
 * loading screen, which is exactly when a hitch is most visible.
 * -------------------------------------------------------------------------- */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _axis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const FWD = new THREE.Vector3(0, 0, 1);

/**
 * A transformed copy of a cached geometry, ready to be merged.
 *
 * Always a clone: the source is shared with every other prop in the game and
 * baking a translation into it would move the table's legs the next time a
 * chair asked for the same stock.
 */
export function xf(geo, t = {}) {
  const g = geo.clone();
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
  _q.setFromEuler(_e);
  _p.set(t.x || 0, t.y || 0, t.z || 0);
  _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/**
 * Merge parts that share a material into one buffer.
 *
 * Takes ownership of everything passed in and disposes it, except geometry the
 * registry owns - a builder that hands over a cached primitive by mistake gets
 * away with it rather than corrupting every later prop.
 *
 * The index normalisation matters. ExtrudeGeometry is the only primitive here
 * that comes out non-indexed, so the moment a prop uses a chamfer it cannot be
 * merged with plain boxes until everything is de-indexed. mergeGeometries does
 * not do this itself; it logs and returns null, which would silently leave a
 * prop invisible.
 */
export function mergeAll(parts) {
  const list = parts.filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];

  const mixed = list.some((g) => g.index === null);
  const ready = mixed ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list;

  const merged = mergeGeometries(ready, false);
  if (!merged) throw new Error("mergeAll: incompatible geometry in prop build");

  for (const g of ready) if (!SHARED.has(g)) g.dispose();
  if (mixed) {
    for (const g of list) {
      if (!SHARED.has(g) && !ready.includes(g)) g.dispose();
    }
  }

  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Re-origin a finished prop: footprint centred on x/z, lowest point on y = 0.
 *
 * The room layout places every prop by that convention and it is far too easy
 * to break by hand - a chair's crest rail leans further back than its front
 * legs reach forward, so the "obviously symmetric" construction is in fact
 * off-centre. Measuring once, here, lets a builder work in whatever
 * construction space reads most clearly and still land on the contract.
 *
 * Only direct children move, so a named sub-group - a lamp head, a drawer -
 * keeps the internal pivot that game code animates.
 */
export function groundOnFootprint(group) {
  const box3 = new THREE.Box3().setFromObject(group);
  if (box3.isEmpty()) return { w: 0, h: 0, d: 0 };

  const dx = (box3.min.x + box3.max.x) / 2;
  const dz = (box3.min.z + box3.max.z) / 2;
  const dy = box3.min.y;
  for (const child of group.children) {
    child.position.set(
      child.position.x - dx,
      child.position.y - dy,
      child.position.z - dz,
    );
  }

  return {
    w: box3.max.x - box3.min.x,
    h: box3.max.y - box3.min.y,
    d: box3.max.z - box3.min.z,
  };
}

/* -------------------------------------------------------------------------- *
 * Primitives
 *
 * All centred on the origin unless stated. All cached by their parameters, so
 * reuse across props is automatic rather than something a builder has to
 * remember to arrange.
 * -------------------------------------------------------------------------- */

/**
 * Rescale a BoxGeometry's UVs from 0..1 per face to metres.
 *
 * Without this a 1.2 m table top and a 0.03 m stretcher each show exactly one
 * tile of the wood texture, so the grain on the top is stretched to a blur
 * while the grain on the stretcher is a dense stripe, and the two read as
 * different timber. Scaling every face by its own size in metres puts one
 * texture repeat per metre everywhere - which is also what ExtrudeGeometry's
 * UV generator does, so chamfered and plain parts of a prop match each other.
 *
 * Face order is BoxGeometry's own: +x, -x, +y, -y, +z, -z.
 */
function worldUv(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const scale = [
    [d, h], [d, h],
    [w, d], [w, d],
    [w, h], [w, h],
  ];
  for (let g = 0; g < geo.groups.length && g < 6; g++) {
    const { start, count } = geo.groups[g];
    const su = scale[g][0];
    const sv = scale[g][1];
    for (let i = start; i < start + count; i++) {
      const v = geo.index.getX(i);
      uv.setXY(v, uv.getX(v) * su, uv.getY(v) * sv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * A box, chamfered if asked.
 *
 * The chamfer is what stops furniture reading as programmer art: a real edge
 * catches a highlight along its length and a perfectly sharp one never does,
 * however good the material underneath is. It costs a handful of triangles per
 * part, so the low tier drops it and keeps the silhouette.
 *
 * Built as an extruded rectangle because ExtrudeGeometry's bevel chamfers all
 * twelve edges at once, corners included, where hand-building would mean
 * mitring twenty-four faces.
 */
export function box(detail, w, h, d, chamfer = 0) {
  const c = Math.min(chamfer, Math.min(w, h, d) * 0.45);
  const key = `box:${n(w)}x${n(h)}x${n(d)}:c${n(c)}@d${detail}`;
  return sg(key, () => {
    if (c <= 1e-5) return worldUv(new THREE.BoxGeometry(w, h, d), w, h, d);

    const segments = detail >= 3 ? 2 : 1;
    const hw = w / 2 - c;
    const hd = d / 2 - c;
    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hd);
    shape.lineTo(hw, -hd);
    shape.lineTo(hw, hd);
    shape.lineTo(-hw, hd);
    shape.closePath();

    // Extrudes along +z: depth plus one chamfer at each end is the full height
    // once the result is stood upright.
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: h - 2 * c,
      bevelEnabled: true,
      bevelThickness: c,
      bevelSize: c,
      bevelOffset: 0,
      bevelSegments: segments,
      curveSegments: 1,
    });
    g.translate(0, 0, -(h / 2 - c));
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** A cylinder about +y. `open` drops the end caps, for tubes and shades. */
export function cyl(detail, rTop, rBottom, h, segs, open = false) {
  const key = `cyl:${n(rTop)}/${n(rBottom)}x${n(h)}:${segs}${open ? "o" : ""}@d${detail}`;
  return sg(key, () =>
    new THREE.CylinderGeometry(rTop, rBottom, h, segs, 1, open),
  );
}

/** A partial cylinder about +y, for the rounded spine of a book. */
export function cylArc(detail, r, h, segs, thetaStart, thetaLength) {
  const key = `cylarc:${n(r)}x${n(h)}:${segs}:${n(thetaStart)}/${n(thetaLength)}@d${detail}`;
  return sg(key, () =>
    new THREE.CylinderGeometry(r, r, h, segs, 1, false, thetaStart, thetaLength),
  );
}

export function sphere(detail, r, wSegs, hSegs) {
  return sg(`sph:${n(r)}:${wSegs}x${hSegs}@d${detail}`, () =>
    new THREE.SphereGeometry(r, wSegs, hSegs),
  );
}

export function torus(detail, r, tube, radialSegs, tubularSegs, arc = Math.PI * 2) {
  const key = `tor:${n(r)}/${n(tube)}:${radialSegs}x${tubularSegs}:${n(arc)}@d${detail}`;
  return sg(key, () =>
    new THREE.TorusGeometry(r, tube, radialSegs, tubularSegs, arc),
  );
}

/** A flat disc facing +z. Clock dial, clock glass. */
export function disc(detail, r, segs) {
  return sg(`disc:${n(r)}:${segs}@d${detail}`, () => new THREE.CircleGeometry(r, segs));
}

/** A flat annulus facing +z. The rims of the lamp shade. */
export function ring(detail, rInner, rOuter, segs) {
  return sg(`ring:${n(rInner)}/${n(rOuter)}:${segs}@d${detail}`, () =>
    new THREE.RingGeometry(rInner, rOuter, segs),
  );
}

/**
 * A surface of revolution from a profile of [radius, height] pairs.
 *
 * The caller supplies the key because the profile IS the identity of the
 * shape, and hashing a float array on every call would cost more than building
 * the geometry.
 *
 * Profiles run bottom to top. Three derives its triangle winding from the
 * point order, so a reversed profile comes out inside-out - which is exactly
 * how the lamp shade gets an inner surface that is lit from within.
 */
export function lathe(detail, key, profile, segs) {
  return sg(`lathe:${key}:${segs}@d${detail}`, () => {
    const pts = profile.map((p) => new THREE.Vector2(p[0], p[1]));
    return new THREE.LatheGeometry(pts, segs);
  });
}

/* -------------------------------------------------------------------------- *
 * Compound stock
 * -------------------------------------------------------------------------- */

/**
 * One furniture leg, hanging from the origin.
 *
 * The origin is the TOP of the leg, not its centre, and that is the whole
 * point of this helper. A chair's legs splay, and a splayed leg built about
 * its centre and then rotated pulls its top a centimetre out of the seat
 * frame - the classic "furniture modelled by someone who has never built
 * furniture" tell. Pivoting at the joint means the leg meets the rail wherever
 * it is pointed.
 *
 * `block` is the square section at the top where rails mortise in; the
 * turnings only start below it, exactly as on a real leg.
 */
export function legStock(detail, { len, top, bot, block = 0, turned = true }) {
  const key =
    `leg:${n(len)}:${n(top)}/${n(bot)}:${n(block)}:${turned ? "t" : "p"}@d${detail}`;
  return sg(key, () => {
    const segs = lod(detail, 4, 8, 14, 20);
    const parts = [];

    // Four radial segments is a tapered square prism: both the cheapest leg
    // possible and an honest low-detail reading of a real one.
    if (!turned || detail === 0) {
      const g = new THREE.CylinderGeometry(top, bot, len, segs);
      g.translate(0, -len / 2, 0);
      parts.push(g);
    } else {
      const profile = [
        [0, 0],
        [bot * 0.9, 0],
        [bot * 1.18, len * 0.015],
        [bot * 1.18, len * 0.05],
        [bot, len * 0.085],
        [top * 0.8, len * 0.5],
        [top * 1.06, len - block - 0.05],
        [top * 0.92, len - block - 0.015],
        [top, len - block],
        [top, len],
        [0, len],
      ];
      const pts = profile.map((p) => new THREE.Vector2(p[0], p[1]));
      const g = new THREE.LatheGeometry(pts, segs);
      g.translate(0, -len, 0);
      parts.push(g);
    }

    if (block > 0 && detail >= 1) {
      const b = new THREE.BoxGeometry(top * 2, block, top * 2);
      worldUv(b, top * 2, block, top * 2);
      b.translate(0, -block / 2, 0);
      parts.push(b);
    }

    return mergeAll(parts);
  });
}

/**
 * A rectangular member spanning two points, as a merge-ready copy.
 *
 * Stretchers between splayed legs are why this exists: their ends have to land
 * on the leg axes, which are no longer where the plan view says they are.
 * Handing the helper two endpoints makes that arithmetic impossible to get
 * wrong, and the joint closes every time.
 */
export function strut(detail, a, b, w, h, chamfer = 0) {
  const len = a.distanceTo(b);
  const g = box(detail, w, h, len, chamfer).clone();
  _d.subVectors(b, a).normalize();
  _q.setFromUnitVectors(FWD, _d);
  _p.addVectors(a, b).multiplyScalar(0.5);
  _s.set(1, 1, 1);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/** As `strut`, but round stock: lamp arms, wire, anything turned. */
export function rod(detail, a, b, r, segs) {
  const len = a.distanceTo(b);
  const g = cyl(detail, r, r, len, segs).clone();
  _d.subVectors(b, a).normalize();
  _q.setFromUnitVectors(UP, _d);
  _p.addVectors(a, b).multiplyScalar(0.5);
  _s.set(1, 1, 1);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/**
 * Leg stock hung from `topPoint` and aimed at `bottomPoint`.
 *
 * Pairs with `legStock`'s top-at-origin convention: the leg is generated at
 * exactly the right length for the span, then swung into place about its joint.
 */
export function legBetween(detail, topPoint, bottomPoint, opts) {
  const len = topPoint.distanceTo(bottomPoint);
  const g = legStock(detail, { ...opts, len }).clone();
  _axis.subVectors(bottomPoint, topPoint).normalize();
  _q.setFromUnitVectors(DOWN, _axis);
  _s.set(1, 1, 1);
  _m.compose(topPoint, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/**
 * A bar chained along a polyline, for anything gently curved.
 *
 * A chair's crest rail is a shallow arc. Bending one out of a torus segment
 * means fighting three axes of rotation to get the bow pointing the right way;
 * three short struts along a sampled curve read identically from the half
 * metre these are seen at, and the curve can be written where it is used.
 *
 * Returns the parts rather than a merge, so the caller can fold them into a
 * larger merge with the rest of the prop.
 */
export function polyBar(detail, points, w, h, chamfer = 0) {
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) {
    parts.push(strut(detail, points[i], points[i + 1], w, h, chamfer));
  }
  return parts;
}
