/**
 * The prop registry.
 *
 * One table describing every object that can be placed in the room, and one
 * function that turns an id into a THREE.Group. Nothing else in the game
 * should import a builder directly: the layout asks for "table", the save file
 * stores "table", and the collision system reads this file's `size` to decide
 * how much space that costs.
 *
 * ORIGIN CONTRACT, which the layout depends on absolutely:
 *
 *   Floor props  - origin at the centre of the footprint, bottom on y = 0.
 *                  Place one by setting its position to a point on the floor.
 *   Wall props   - origin at the mounting point on the wall, model entirely
 *                  in front of it (z >= 0), facing +z. Place one by setting
 *                  its position to a point on the wall and turning it to face
 *                  into the room.
 *
 * Builders are not trusted to honour that by hand; `build` measures the
 * finished group and re-origins it. `userData.bounds` then carries the
 * MEASURED size, which is the one collision should prefer - `size` in the
 * table below is a designer-facing approximation for layout planning.
 */

import * as THREE from "three";

import { get as getPlatform } from "../core/platform.js";
import { makeRng } from "../core/maths.js";
import { mat as library } from "../engine/materials.js";

import { sg, SHARED, groundOnFootprint } from "./geom.js";

import * as table from "./builders/table.js";
import * as chair from "./builders/chair.js";
import * as cube from "./builders/cube.js";
import * as wallclock from "./builders/wallclock.js";
import * as lamp from "./builders/lamp.js";
import * as crate from "./builders/crate.js";
import * as book from "./builders/book.js";
import * as mug from "./builders/mug.js";
import * as key from "./builders/key.js";
import * as bed from "./builders/bed.js";
import * as fuse from "./builders/fuse.js";
import * as trinket from "./builders/trinket.js";

export { sg, SHARED };

/* -------------------------------------------------------------------------- *
 * Material tagging
 *
 * `disposeProp` has to tell a material the library owns - shared with every
 * other prop, and fatal to dispose - from one a builder made for itself. The
 * library does not publish that list, so it is recorded here as it is handed
 * out: every builder receives this wrapper rather than the library directly,
 * so by the time a prop exists, every material in it is known.
 *
 * A WeakSet, so a material the library ever drops can still be collected.
 * -------------------------------------------------------------------------- */

const LIB_MATERIALS = new WeakSet();

const mat = {};
for (const name of Object.keys(library)) {
  mat[name] = (...args) => {
    const m = library[name](...args);
    LIB_MATERIALS.add(m);
    return m;
  };
}

/* -------------------------------------------------------------------------- *
 * The table
 *
 * `size`     approximate bounding box in metres, for layout and collision.
 * `mass`     kilograms, for the carry system. Anything over about 15 kg is
 *            not liftable and should not set `interact.carry`.
 * `interact` null for scenery. `verb` is an i18n key for the prompt the HUD
 *            shows when the object is in focus.
 * `origin`   "floor" (default) or "wall" - see the contract above.
 * -------------------------------------------------------------------------- */

export const PROPS = {
  table: {
    id: "table",
    build: table.build,
    size: { w: 1.2, h: 0.75, d: 0.61 },   // the drawer pull adds 11 mm of depth
    mass: 32,
    interact: { verb: "openDrawer", carry: false, inspect: false },
  },

  chair: {
    id: "chair",
    build: chair.build,
    size: { w: 0.46, h: 0.93, d: 0.52 },
    mass: 6.5,
    interact: { verb: "pushObject", carry: false, inspect: true },
  },

  cube: {
    id: "cube",
    build: cube.build,
    size: { w: 0.22, h: 0.22, d: 0.22 },
    // Deliberately about three times the mass its size suggests. The carry
    // system reads this, so the player feels the anomaly before being told
    // there is one.
    mass: 8.5,
    interact: { verb: "takeItem", carry: true, inspect: true },
  },

  wallclock: {
    id: "wallclock",
    build: wallclock.build,
    size: { w: 0.3, h: 0.3, d: 0.065 },
    mass: 1.4,
    interact: { verb: "inspect", carry: false, inspect: true },
    origin: "wall",
  },

  lamp: {
    id: "lamp",
    build: lamp.build,
    size: { w: 0.165, h: 0.465, d: 0.225 },
    mass: 1.8,
    interact: { verb: "toggleLamp", carry: false, inspect: true },
  },

  crate: {
    id: "crate",
    build: crate.build,
    size: { w: 0.51, h: 0.45, d: 0.51 },
    mass: 12,
    interact: { verb: "pushObject", carry: false, inspect: true },
  },

  book: {
    id: "book",
    build: book.build,
    size: { w: 0.225, h: 0.042, d: 0.157 },
    mass: 0.65,
    interact: { verb: "takeItem", carry: true, inspect: true },
    variant: "closed",
  },

  /* Registered as its own id rather than an option, because it is a different
   * size and the layout has to know that before it builds anything. */
  bookOpen: {
    id: "bookOpen",
    build: book.build,
    size: { w: 0.305, h: 0.03, d: 0.16 },
    mass: 0.65,
    interact: { verb: "takeItem", carry: true, inspect: true },
    variant: "open",
  },

  mug: {
    id: "mug",
    build: mug.build,
    // Wider than it is deep because the handle only sticks out on one side.
    size: { w: 0.118, h: 0.098, d: 0.08 },
    mass: 0.33,
    interact: { verb: "takeItem", carry: true, inspect: true },
  },

  key: {
    id: "key",
    build: key.build,
    size: { w: 0.08, h: 0.01, d: 0.029 },   // the collar is the thickest part
    mass: 0.02,
    interact: { verb: "takeItem", carry: true, inspect: true },
  },

  /* ======================================================================== *
   * WITHROOM
   *
   * The bed he wakes on, the fuses that bring the building back to life, and
   * the three things of hers that are somewhere in this room.
   * ======================================================================== */

  bed: {
    id: "bed",
    build: bed.build,
    size: { w: 0.92, h: 0.78, d: 1.96 },
    mass: 48,
    // Deliberately NOT interactable. It is the one piece of furniture in the
    // game the player has already been in contact with, and a prompt offering
    // to examine it would turn the opening image into a point of interest.
    interact: null,
  },

  /* One entry per band colour. Three sockets, three fuses, and the hint system
   * can name the one that is still missing - which it cannot do if they are one
   * id with a runtime option. */
  fuseRed: { id: "fuseRed", build: fuse.build, size: { w: 0.05, h: 0.018, d: 0.018 }, mass: 0.06,
    interact: { verb: "takeItem", carry: true, inspect: true }, variant: "red" },
  fuseAmber: { id: "fuseAmber", build: fuse.build, size: { w: 0.05, h: 0.018, d: 0.018 }, mass: 0.06,
    interact: { verb: "takeItem", carry: true, inspect: true }, variant: "amber" },
  fuseBlue: { id: "fuseBlue", build: fuse.build, size: { w: 0.05, h: 0.018, d: 0.018 }, mass: 0.06,
    interact: { verb: "takeItem", carry: true, inspect: true }, variant: "blue" },

  ring: { id: "ring", build: trinket.build, size: { w: 0.02, h: 0.006, d: 0.02 }, mass: 0.005,
    interact: { verb: "takeItem", carry: true, inspect: true }, variant: "ring" },
  phone: { id: "phone", build: trinket.build, size: { w: 0.071, h: 0.009, d: 0.146 }, mass: 0.19,
    interact: { verb: "takeItem", carry: true, inspect: true }, variant: "phone" },
  scarf: { id: "scarf", build: trinket.build, size: { w: 0.14, h: 0.03, d: 0.12 }, mass: 0.12,
    interact: { verb: "takeItem", carry: true, inspect: true }, variant: "scarf" },
};

/* -------------------------------------------------------------------------- *
 * Building
 * -------------------------------------------------------------------------- */

const _box3 = new THREE.Box3();

const clampDetail = (d) => (d < 0 ? 0 : d > 3 ? 3 : d | 0);

/**
 * A stable seed for a prop that was not given one.
 *
 * Variation has to survive a reload: a player who saves, quits and comes back
 * must meet the same crate with the same boards. Hashing the id means an
 * unseeded prop is identical every run, and the layout can pass an explicit
 * per-instance seed where it wants two crates to differ.
 */
function hashSeed(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Build a prop.
 *
 * `detailOverride` forces a tier - used by the inspect view, which shows an
 * object centimetres from the camera and wants the full model even on a
 * machine running everything else at tier 1.
 *
 * `opts.seed` picks a variation; `opts.variant` overrides the table's.
 */
export function build(id, detailOverride = null, opts = {}) {
  const def = PROPS[id];
  if (!def) throw new Error(`props.build: unknown prop id "${id}"`);

  const detail = clampDetail(
    detailOverride === null || detailOverride === undefined
      ? getPlatform().settings.propDetail
      : detailOverride,
  );

  const ctx = {
    THREE,
    mat,
    detail,
    rng: makeRng(opts.seed ?? hashSeed(id)),
    variant: opts.variant ?? def.variant ?? null,
    /**
     * The builder's own geometry cache. Wraps `sg` purely to stamp the detail
     * level into every key - a builder cannot forget to, which is the point,
     * because a missing suffix is invisible until someone changes tier mid
     * session and gets last tier's chamfers.
     */
    sg: (name, make) => sg(`${name}@d${detail}`, make),
  };

  const group = def.build(ctx);
  group.name = id;

  const bounds = def.origin === "wall"
    ? measure(group)
    : groundOnFootprint(group);

  group.userData = {
    propId: id,
    detail,
    variant: ctx.variant,
    mass: def.mass,
    interact: def.interact,
    origin: def.origin ?? "floor",
    /** Measured, not declared. Prefer this over PROPS[id].size. */
    bounds,
  };

  return group;
}

/** Bounding size of a finished group, without moving it. */
function measure(group) {
  _box3.setFromObject(group);
  if (_box3.isEmpty()) return { w: 0, h: 0, d: 0 };
  return {
    w: _box3.max.x - _box3.min.x,
    h: _box3.max.y - _box3.min.y,
    d: _box3.max.z - _box3.min.z,
  };
}

/* -------------------------------------------------------------------------- *
 * Teardown
 * -------------------------------------------------------------------------- */

/**
 * Release a prop.
 *
 * Skips anything shared, which is nearly everything: the geometry cache and
 * the material library both outlive any individual room state, and disposing
 * out of them would blank every other prop built from the same stock. In
 * practice this disposes very little - which is the design working, not the
 * function failing.
 */
export function disposeProp(object) {
  object.traverse((node) => {
    if (!node.isMesh && !node.isLine && !node.isPoints) return;

    if (node.geometry && !SHARED.has(node.geometry)) node.geometry.dispose();

    const m = node.material;
    if (!m) return;
    if (Array.isArray(m)) {
      for (const sub of m) if (sub && !LIB_MATERIALS.has(sub)) sub.dispose();
    } else if (!LIB_MATERIALS.has(m)) {
      m.dispose();
    }
  });

  object.removeFromParent();
}
