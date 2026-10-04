/**
 * STAGE 2 - THE SIGILS.
 *
 * Four stone tiles, each cut with a mark. Four recesses in the floor. The order
 * is scratched on the wall above the bed, and the tiles have to go into the
 * recesses in that order.
 *
 * This is the stage that teaches CARRYING, which is the other half of the verb
 * set after stage one taught looking and pressing. It is also the first puzzle
 * with a wrong answer: a tile in the wrong recess is accepted, sits there, and
 * does nothing - and the puzzle says so by lighting the recesses that are right
 * rather than by refusing the ones that are not.
 *
 * Why that way round: a puzzle that rejects a wrong placement has told the
 * player the answer by elimination within four attempts. A puzzle that accepts
 * everything and confirms only what is correct makes them read the wall.
 *
 * The order is 3-1-4-2 of the sigils as the clue draws them, which looks
 * arbitrary and is: it has to be learned from the wall, not deduced.
 */

import * as THREE from "three";

import { audio } from "../../audio/manager.js";
import { lerp } from "../../core/maths.js";
import { mat } from "../../engine/materials.js";
import * as textures from "../../engine/textures.js";
import { t } from "../../i18n/strings.js";
import * as hud from "../../ui/hud.js";
import * as roomScale from "../roomScale.js";

export const id = "sigils";

/** The four marks, in the order they are DRAWN on the wall. */
const SIGILS = ["eye", "down", "door", "pair"];

/**
 * Which sigil belongs in each recess, left to right.
 *
 * Read off the wall clue, which draws the four marks in SIGILS order with a
 * number scratched under each: the number is the recess it goes in.
 */
const SOLUTION = ["door", "eye", "pair", "down"];

/** Recess positions as a fraction of the room, so they spread as it grows. */
const RECESS_X = [-0.3, -0.1, 0.1, 0.3];
const RECESS_Z = 0.04;

const TILE = 0.17;   // tile edge, in metres
const STATE = 1;     // the room state this stage is played at

let api = null;
let group = null;
let recesses = [];
let tiles = [];
let clue = null;
let solved = false;
let check = 0;

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

export function build(outer) {
  api = outer;
  group = new THREE.Group();
  group.name = "puzzle:sigils";
  group.visible = false;
  api.root.add(group);

  buildRecesses();
  buildTiles();
  buildClue();
}

/**
 * The recesses.
 *
 * A square of shadow cut into the floor with a sigil-less rim, so an empty one
 * reads as a socket waiting for something rather than as a decoration. The rim
 * is drawn in the signal colour the whole game uses for "the room is paying
 * attention to this".
 */
function buildRecesses() {
  const plate = new THREE.PlaneGeometry(TILE * 1.5, TILE * 1.5);
  const sunk = new THREE.PlaneGeometry(TILE * 1.16, TILE * 1.16);

  recesses = SOLUTION.map((want, i) => {
    const holder = new THREE.Group();

    // The hole: flat black, so the recess has depth without any geometry.
    const hole = new THREE.Mesh(sunk, mat.void());
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.0015;
    holder.add(hole);

    // The rim: a painted square around it, which dims when the right tile
    // lands. This is the only feedback the puzzle gives.
    const rim = new THREE.Mesh(
      plate,
      new THREE.MeshBasicMaterial({
        map: textures.sigil("door", "rgba(226,222,214,0.0)"),
        color: 0x6fe0bd,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.003;
    holder.add(rim);

    // A number scratched beside each recess, 1 to 4. It is what makes the wall
    // clue readable: without numbers the clue is four marks in a row and the
    // player has no way to know which recess is "first".
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, 0.1),
      new THREE.MeshBasicMaterial({
        map: textures.wallText(String(i + 1), { width: 128, height: 128, font: "700 92px Share Tech Mono, monospace" }),
        transparent: true,
        depthWrite: false,
        opacity: 0.5,
      }),
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 0.0025, TILE * 1.05);
    holder.add(label);

    group.add(holder);
    return { holder, want, filled: null, ok: false, rim };
  });
}

/**
 * The tiles.
 *
 * Built here rather than in the prop registry because they are a set: four
 * instances of one shape that differ only by the mark on their face, and the
 * registry's one-entry-per-id contract would mean four nearly identical rows.
 *
 * Each is a carryable, registered through the room's interaction API, so they
 * use the same pick-up, carry and drop code as every other object in the game.
 */
function buildTiles() {
  const slab = new THREE.BoxGeometry(TILE, 0.028, TILE);
  const faceGeo = new THREE.PlaneGeometry(TILE * 0.82, TILE * 0.82);

  tiles = SIGILS.map((name, i) => {
    const tile = new THREE.Group();
    tile.name = `tile:${name}`;

    const body = new THREE.Mesh(slab, mat.cloth(0x4b463e, 0.92));
    body.castShadow = true;
    body.receiveShadow = true;
    tile.add(body);

    // The mark, cut into the top face. A decal on a plane rather than part of
    // the material, so one geometry and one stone material serve all four.
    const face = new THREE.Mesh(
      faceGeo,
      new THREE.MeshStandardMaterial({
        map: textures.sigil(name),
        transparent: true,
        roughness: 0.9,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.0145;
    tile.add(face);

    /*
     * Laid out in a deliberately unhelpful order, as fractions of the room.
     *
     * They start scattered - not in a row next to the recesses - because the
     * stage is about recognising four marks, and four tiles already lined up in
     * front of the sockets reduces it to trying permutations.
     *
     * All four spots are in the southern half, clear of the bed on the north
     * wall and the table against the west: a tile that spawns inside a table is
     * a tile the player can see and cannot reach.
     */
    const spots = [
      [-0.26, 0.3],
      [0.3, 0.32],
      [0.34, 0.06],
      [-0.06, 0.38],
    ];
    const record = api.place(
      tile,
      { kind: "free" },
      { size: { w: TILE, h: 0.028, d: TILE }, id: `tile:${name}` },
    );
    if (record) {
      record.item = api.register(tile, {
        hit: body,
        verb: "takeItem",
        name: "objTile",
        carry: true,
        inspect: true,
        mass: 1.6,
        collider: record.collider,
        onUse: () => {
          api.setFlag("sawSigil");
          return false; // fall through to pick up
        },
      });
      record.spawn = spots[i];
    }

    /*
     * Re-parented into the puzzle's group.
     *
     * `api.place` adds to the room's content root, which is correct for
     * furniture and wrong for a puzzle piece: the group is what gets hidden
     * between stages, and a tile left on the root is visible - and solid - in
     * every room in the game.
     */
    group.add(tile);

    return { name, tile, record };
  });

  layout();
}

/**
 * The clue.
 *
 * Scratched into the wall above the bed: the four marks in a row, each with the
 * recess number under it. Readable as an interactable, so the player can
 * re-read it from anywhere in the room rather than having to remember four
 * symbol-number pairs.
 */
function buildClue() {
  const strip = new THREE.Group();

  for (let i = 0; i < SIGILS.length; i++) {
    const name = SIGILS[i];
    const x = (i - 1.5) * 0.3;

    const glyph = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshStandardMaterial({
        map: textures.sigil(name, "rgba(206,196,180,0.9)"),
        transparent: true,
        roughness: 0.95,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    glyph.position.set(x, 0.1, 0);
    strip.add(glyph);

    // The number under it: which recess this mark goes in.
    const n = SOLUTION.indexOf(name) + 1;
    const num = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, 0.1),
      new THREE.MeshStandardMaterial({
        map: textures.wallText(String(n), { width: 128, height: 128, font: "700 92px Share Tech Mono, monospace" }),
        transparent: true,
        roughness: 0.95,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    num.position.set(x, -0.1, 0);
    strip.add(num);
  }

  clue = strip;
  // Placed through the room, then re-parented into the group for the same
  // reason the tiles are.
  // On the wall the bed stands against, beside the writing and at the height of
  // someone sitting up in it - so the first thing he can read is the thing he
  // needs. It is scratched rather than painted: whoever left it was in this bed.
  api.place(strip, { kind: "wall", side: "north", along: 0.72, offset: 0.015, y: 1.3 });

  // A hit plane, because four glyphs and four numbers are a terrible raycast
  // target: the gaps between them are most of the area.
  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 0.5),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.z = 0.01;
  strip.add(hit);

  group.add(strip);

  api.register(strip, {
    hit,
    verb: "readIt",
    name: "objScratches",
    onUse: () => {
      api.setFlag("readSigilClue");
      hud.subtitle(t("sigilClue"), 5);
      audio.play("paperRustle", { gain: 0.6 });
      return true;
    },
  });
}

/* -------------------------------------------------------------------------- *
 * Layout
 * -------------------------------------------------------------------------- */

/** Re-place the recesses and any tile that has never been picked up. */
export function layout() {
  if (!group) return;
  const dims = roomScale.dims;

  for (let i = 0; i < recesses.length; i++) {
    recesses[i].holder.position.set(RECESS_X[i] * dims.w, 0, RECESS_Z * dims.d);
  }

  // Tiles only follow the room until the player first touches one. After that
  // they are wherever they were left, which is the whole point of them.
  for (const tile of tiles) {
    const rec = tile.record;
    if (!rec || rec.touched || rec.item?.held) continue;
    rec.object.position.set(rec.spawn[0] * dims.w, 0.015, rec.spawn[1] * dims.d);
  }
}

/* -------------------------------------------------------------------------- *
 * Beat
 * -------------------------------------------------------------------------- */

export function onBeat() {
  /*
   * The group is on from this stage onward - the scratches on the wall stay
   * readable for the rest of the game, because they are the first thing the
   * player ever decoded and the game refers back to the marks twice more.
   *
   * The tiles and the recesses are the stage itself, and they go once it is
   * finished: four stone slabs left on the floor of every later room would be
   * clutter the player keeps re-checking.
   */
  const state = roomScale.stateId();
  if (group) group.visible = state >= STATE;

  const stageOn = state === STATE && !solved;
  for (const recess of recesses) recess.holder.visible = stageOn;
  for (const tile of tiles) tile.tile.visible = stageOn;

  layout();
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  if (solved || !group || roomScale.stateId() !== STATE) return;

  // Four times a second. A player cannot set a tile down faster than that, and
  // this runs a 4x4 distance test.
  check += dt;
  if (check < 0.25) return;
  check = 0;

  let all = true;

  for (const recess of recesses) {
    let found = null;
    for (const tile of tiles) {
      const rec = tile.record;
      if (!rec || rec.item?.held) continue;
      const dx = rec.object.position.x - recess.holder.position.x;
      const dz = rec.object.position.z - recess.holder.position.z;
      // Tighter than the general placement tolerance: a recess is 25 cm across
      // and two of them are 20 cm apart at the starting room size, so a
      // generous radius would match both.
      if (dx * dx + dz * dz <= 0.14 * 0.14 && rec.object.position.y < 0.4) {
        found = tile;
        break;
      }
    }

    const ok = !!found && found.name === recess.want;
    if (ok !== recess.ok) {
      recess.ok = ok;
      // The rim lights when the right mark lands in it. Nothing happens when
      // the wrong one does - see the note at the top of the file.
      recess.rim.material.opacity = ok ? 0.5 : 0;
      if (ok) audio.play("switchOn", { gain: 0.7 });
    }
    if (!ok) all = false;
  }

  if (!all) return;

  solved = true;
  api.setFlag("stage2Solved");
  audio.play("keypadRight");
  audio.stinger("solved");
  api.solve(2);
  onBeat();
}

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export function serialise() {
  return {
    solved,
    // Tile positions are stored by the room's own item serialiser; what is
    // stored here is which ones the player has moved, so an untouched tile
    // still follows the room after a reload.
    touched: tiles.map((t2) => !!t2.record?.touched),
  };
}

export function deserialise(data) {
  if (!data) return;
  solved = !!data.solved;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].record) tiles[i].record.touched = !!data.touched?.[i];
  }
  for (const r of recesses) {
    r.ok = false;
    r.rim.material.opacity = 0;
  }
  onBeat();
}

export function reset() {
  solved = false;
  check = 0;
  for (const r of recesses) {
    r.ok = false;
    r.rim.material.opacity = 0;
  }
  for (const tile of tiles) {
    if (tile.record) tile.record.touched = false;
  }
  onBeat();
}
