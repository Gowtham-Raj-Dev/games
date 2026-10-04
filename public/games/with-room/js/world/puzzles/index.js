/**
 * The puzzles.
 *
 * One module per puzzle, all of them built, ticked, saved and reset through
 * this file - so world/roomContent.js knows about "the puzzles" and nothing
 * about any particular one, and a puzzle can be rewritten without touching the
 * room it is in.
 *
 * Every puzzle module exports the same five functions:
 *
 *   build(api)       create its geometry and register its interactions
 *   tick(dt)         per-frame, usually a throttled proximity check
 *   onBeat(beat)     show or hide itself for the story beat
 *   serialise()      its own state, as a plain object
 *   deserialise(d)   restore it, including the world it has already changed
 *   reset()          back to the start of a new game
 *
 * `api` is the contract with the room: a puzzle may place objects, register
 * interactions, read and write world flags, and declare itself solved. It may
 * NOT touch the room's dimensions, the stability economy or the story state -
 * declaring a stage solved is the only thing it says to the rest of the game,
 * and what that is worth is decided in one place in main.js.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a stage is solved by the world being
 * in a particular state, never by a button that says "solve". Every one of
 * these checks a physical arrangement - a tile on a mark, a fuse in a socket, a
 * code on a keypad, three objects on a bed, a key taken off a hook that only
 * exists in a mirror.
 */

import * as sigils from "./sigils.js";
import * as mechanism from "./mechanism.js";
import * as keypad from "./keypad.js";
import * as relics from "./relics.js";
import * as voices from "./voices.js";
import * as clocks from "./clocks.js";
import * as mirror from "./mirror.js";
import * as herdoor from "./herdoor.js";

/*
 * In stage order: 2, 3, 4, 5, 6, 7, 8, 9.
 *
 * Stage one - the clock - is not here. It lives in world/roomContent.js with the
 * furniture, because it is one interaction on a prop that was already in the
 * room for other reasons, and giving it a module of its own would be four files
 * of ceremony around nine lines of logic.
 *
 * The order matters for build cost and for one real dependency: herdoor reads
 * the ring that relics placed, so relics has to exist first.
 */
const PUZZLES = [sigils, mechanism, keypad, relics, voices, clocks, mirror, herdoor];

export function build(api) {
  for (const p of PUZZLES) {
    try {
      p.build(api);
    } catch (err) {
      // One broken puzzle must not take the room down with it. The player gets
      // a room with a missing mechanism, which is survivable; a thrown error
      // during content build leaves them on a black screen, which is not.
      console.error("[puzzles] build failed", err);
    }
  }
}

export function tick(dt) {
  for (const p of PUZZLES) p.tick?.(dt);
}

export function onBeat(beat) {
  for (const p of PUZZLES) p.onBeat?.(beat);
}

export function serialise() {
  const out = {};
  for (const p of PUZZLES) {
    if (!p.id || !p.serialise) continue;
    out[p.id] = p.serialise();
  }
  return out;
}

export function deserialise(data) {
  if (!data) return;
  for (const p of PUZZLES) {
    if (!p.id || !p.deserialise) continue;
    p.deserialise(data[p.id]);
  }
}

export function reset() {
  for (const p of PUZZLES) p.reset?.();
}

/* -------------------------------------------------------------------------- *
 * Shared helper
 * -------------------------------------------------------------------------- */

/**
 * Is this object standing on this spot?
 *
 * Used by every placement puzzle in the game, and the tolerances are the same
 * everywhere on purpose: a player who learns how close is close enough in
 * stage two must not have to learn it again in stage five.
 *
 * Generous by design. A puzzle whose solution is correct but whose tolerance is
 * not is the most infuriating kind there is - and the player is aiming with a
 * thumb on half the devices this runs on.
 */
export function standingOn(record, x, z, { radius = 0.42, maxY = 0.6 } = {}) {
  if (!record || record.item?.held) return false;
  const o = record.object;
  const dx = o.position.x - x;
  const dz = o.position.z - z;
  return dx * dx + dz * dz <= radius * radius && o.position.y < maxY;
}
