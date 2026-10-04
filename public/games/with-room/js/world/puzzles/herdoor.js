/**
 * STAGE 9 - HER DOOR.
 *
 * Seven doors standing free in a space 250 metres across, each cut with one of
 * the four marks. One of them is hers. The key from the mirror opens that one and
 * no other.
 *
 * The answer is engraved inside her wedding ring, which the player carried to
 * the bed four stages ago. Examining the ring shows the mark. Nothing ever tells
 * them to - and that is the design: the last puzzle in the game is whether they
 * were paying attention to the one object in it that mattered.
 *
 * A player who was not can still solve it. Trying doors is free, there are
 * seven, and the ghost comments on each wrong one - so the floor of the stage is
 * "try them all and listen", which takes a few minutes of walking in the dark
 * with something following you. That is an acceptable worst case for a final
 * puzzle; a dead end would not be.
 *
 * THE DOORS DO NOT LEAD ANYWHERE. They are door-shaped objects standing in an
 * enormous empty room, and the wrongness of that is the whole image the game
 * ends on - which is also why the correct one, when it opens, does not reveal a
 * room behind it. It reveals a corridor of more doors, and the ending takes over.
 */

import * as THREE from "three";

import { audio } from "../../audio/manager.js";
import { EV, emit } from "../../core/bus.js";
import { clamp01, damp, makeRng } from "../../core/maths.js";
import { mat } from "../../engine/materials.js";
import * as textures from "../../engine/textures.js";
import { t } from "../../i18n/strings.js";
import * as hud from "../../ui/hud.js";
import * as dialogue from "../../story/dialogue.js";
import * as ghost from "../../story/ghost.js";
import * as interaction from "../../interaction/manager.js";
import * as roomScale from "../roomScale.js";

export const id = "herdoor";

const STATE = 8;

/** The mark engraved in her ring, and therefore on her door. */
export const HER_MARK = "pair";

/**
 * The seven doors.
 *
 * Positions are fractions of the room, in a shallow arc facing the player's
 * spawn, so the whole row is visible from one place and walking to the far end
 * of it is a real journey - at state 8 the arc is nearly 90 metres wide.
 */
const DOORS = [
  { mark: "eye", ax: -0.3, az: -0.16 },
  { mark: "down", ax: -0.2, az: -0.24 },
  { mark: "door", ax: -0.1, az: -0.28 },
  { mark: HER_MARK, ax: 0.0, az: -0.3 },
  { mark: "eye", ax: 0.1, az: -0.28 },
  { mark: "down", ax: 0.2, az: -0.24 },
  { mark: "door", ax: 0.3, az: -0.16 },
];

/** Which position actually holds hers. Shuffled per game, from a stable seed. */
let herIndex = 3;

let api = null;
let group = null;
let doors = [];
let solved = false;
let tried = new Set();
let ringRead = false;

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

export function build(outer) {
  api = outer;
  group = new THREE.Group();
  group.name = "puzzle:herdoor";
  group.visible = false;
  api.root.add(group);

  /*
   * Which door is hers is decided by a SEEDED shuffle, not by Math.random.
   *
   * It has to be the same door across a save and a reload - a player who writes
   * down "the fourth one" and comes back tomorrow must find it there - but it
   * must not be the same door for every player, or the answer is on the
   * internet by the end of the week.
   */
  const seed = Math.floor(Date.now() / 86400000) * 7919;
  const rng = makeRng(seed);
  const slots = DOORS.map((_, i) => i);
  herIndex = slots[Math.floor(rng() * slots.length)];

  const W = 1.05;
  const H = 2.25;
  const leafGeo = new THREE.BoxGeometry(W, H, 0.07);
  const frameGeo = new THREE.BoxGeometry(0.1, H + 0.12, 0.14);
  const headGeo = new THREE.BoxGeometry(W + 0.2, 0.1, 0.14);
  const markGeo = new THREE.PlaneGeometry(0.42, 0.42);

  for (let i = 0; i < DOORS.length; i++) {
    const spec = DOORS[i];
    const door = new THREE.Group();
    door.name = `herdoor${i}`;

    for (const sx of [-1, 1]) {
      const jamb = new THREE.Mesh(frameGeo, mat.woodPale());
      jamb.position.set(sx * (W / 2 + 0.05), H / 2, 0);
      jamb.castShadow = true;
      jamb.receiveShadow = true;
      door.add(jamb);
    }
    const head = new THREE.Mesh(headGeo, mat.woodPale());
    head.position.set(0, H + 0.06, 0);
    head.castShadow = true;
    door.add(head);

    // Behind it: nothing. Flat black, unlit, so a door in the middle of a field
    // of nothing still reads as a way through.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat.void());
    back.position.set(0, H / 2, -0.06);
    door.add(back);

    const pivot = new THREE.Group();
    pivot.position.set(-W / 2, 0, 0);
    const leaf = new THREE.Mesh(leafGeo, mat.wood());
    leaf.position.set(W / 2, H / 2, 0);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    pivot.add(leaf);

    /*
     * The mark, cut into the leaf.
     *
     * Its map is assigned by `applyMarks` rather than here, because which door
     * is hers can change after this runs: loading a save restores the slot that
     * was chosen when that game started, and the glyphs have to follow it or
     * the answer and the engraving stop agreeing.
     */
    const glyph = new THREE.Mesh(
      markGeo,
      new THREE.MeshStandardMaterial({
        transparent: true,
        roughness: 0.9,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    glyph.position.set(W / 2, H * 0.62, 0.04);
    pivot.add(glyph);

    // A keyhole plate, so it is obvious these doors take a key rather than a
    // code - the player is carrying one and has to be told what it is for.
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.16, 0.012),
      mat.brass(),
    );
    plate.position.set(W - 0.14, H * 0.44, 0.042);
    pivot.add(plate);

    door.add(pivot);
    door.userData.pivot = pivot;
    door.userData.swing = 0;

    const record = api.place(door, { kind: "free" }, { id: `herdoor${i}`, solid: true });
    group.add(door);

    const index = i;
    api.register(door, {
      hit: leaf,
      verb: "unlockDoor",
      // The mark is read from the entry at the moment of the press, never
      // captured here: this closure outlives at least one shuffle.
      onUse: () => tryDoor(index),
      name: "objOneDoor",
    });

    doors.push({ door, record, glyph, mark: spec.mark, index, spec });
  }

  applyMarks();
  buildRing();
}

/**
 * Put the marks on the doors for the current shuffle.
 *
 * Her slot gets her mark; any other slot that would also have shown it is given
 * a different one, so there is exactly one of her mark in the row. Called on
 * build and again whenever a save moves her door.
 */
function applyMarks() {
  for (let i = 0; i < doors.length; i++) {
    const entry = doors[i];
    const mark =
      i === herIndex ? HER_MARK : entry.spec.mark === HER_MARK ? "door" : entry.spec.mark;
    entry.mark = mark;
    entry.glyph.material.map = textures.sigil(mark, "rgba(168,126,96,0.95)");
    entry.glyph.material.needsUpdate = true;
  }
}

/**
 * The engraving in her ring.
 *
 * The ring is already an object in the world - stage five put it there and the
 * player carried it to the bed. All this adds is that examining it now shows a
 * mark, which is the answer to this stage. It is registered as a second
 * interaction on the same object rather than as a new one, so there is exactly
 * one ring in the game.
 */
function buildRing() {
  const ring = api.find("ring");
  if (!ring?.item) return;

  const original = ring.item.onUse;
  ring.item.onUse = () => {
    // Only once the player is in the final stage: before that she is still
    // missing and the ring is evidence, not an instruction.
    if (roomScale.stateId() >= STATE) {
      ringRead = true;
      api.setFlag("readRing");
      hud.subtitle(t("ringEngraving"), 5);
      audio.play("glassTap", { gain: 0.6 });
      return true;
    }
    return original ? original() : false;
  };
}

/* -------------------------------------------------------------------------- *
 * Trying a door
 * -------------------------------------------------------------------------- */

function tryDoor(index) {
  const mark = doors[index]?.mark;
  if (solved) {
    audio.play("doorOpen", { gain: 0.5 });
    return true;
  }

  // The key is not optional. Without it every door in the row is just locked,
  // which is the correct answer to "what if the player skipped stage eight" -
  // they cannot have, but a save edited by hand could.
  if (!api.getFlag("hasFinalKey")) {
    audio.play("doorLocked");
    hud.subtitle(t("needKey"), 3.4);
    return true;
  }

  if (mark !== HER_MARK) {
    tried.add(index);
    audio.play("keyInsert");
    audio.play("doorLocked");
    hud.subtitle(t("wrongDoor", tried.size, doors.length), 3.6);

    /*
     * Wrong doors cost nothing but the walk.
     *
     * Consistent with every other wrong answer in the game: the stability
     * economy only moves on major outcomes, and making the last puzzle the one
     * place where guessing is punished would be a rule change at the worst
     * possible moment. The ghost's commentary is the punishment.
     */
    emit(EV.PUZZLE_FAILED_MINOR, { id: "herdoor" });

    if (tried.size === 3 || tried.size === 5) {
      ghost.behind({ level: 0.5, seconds: 1.2 });
      dialogue.play(
        [
          tried.size === 3
            ? {
                who: "ghost", emo: "whisper", after: 0,
                en: "You do not know which one she is behind.",
                ta: "அவ எந்தக் கதவுக்குப் பின்னால இருக்கான்னு உனக்குத் தெரியாது.",
              }
            : {
                who: "ghost", emo: "cold", after: 0,
                en: "You were holding the answer. You put it on a bed.",
                ta: "பதில் உன் கையிலேயே இருந்துச்சு. அதை நீ கட்டில்ல வெச்சுட்ட.",
              },
        ],
        { id: "wrongDoor" },
      );
    }
    return true;
  }

  /* --- hers ------------------------------------------------------------- */
  solved = true;
  api.setFlag("stage9Solved");
  api.setFlag("herDoorOpen");

  const entry = doors[index];
  entry.door.userData.swing = 0.001;
  // The collider goes away with the leaf, or the player cannot walk through the
  // door they have just unlocked.
  if (entry.record?.collider) entry.record.collider.enabled = false;

  audio.play("keyInsert");
  audio.play("lockTurn");
  audio.stinger("solved");
  hud.subtitle(t("herDoorOpens"), 4);

  api.solve(9);
  return true;
}

/* -------------------------------------------------------------------------- *
 * Layout and frame
 * -------------------------------------------------------------------------- */

export function layout() {
  if (!group) return;
  const dims = roomScale.dims;

  // Parked far below the floor until their stage, so that even if something
  // else reads their position - a placement check, a collider rebuild - it
  // cannot find them anywhere the player can be.
  if (roomScale.stateId() < STATE) {
    for (const d of doors) d.door.position.set(0, -200, 0);
    return;
  }

  for (const d of doors) {
    const x = d.spec.ax * dims.w;
    const z = d.spec.az * dims.d;
    d.door.position.set(x, 0, z);
    // Each one turns to face the middle of the room, so the row reads as an arc
    // of doors looking at the player rather than as a line of planks.
    d.door.rotation.y = Math.atan2(-x, -z) + Math.PI;
  }
}

export function onBeat() {
  const on = roomScale.stateId() >= STATE;
  if (group) group.visible = on;

  /*
   * Their COLLIDERS have to go too, not just their pixels.
   *
   * These are the only puzzle objects in the game that are solid, and the room
   * they belong in is 250 m across. Left enabled, seven invisible doors stand
   * in the middle of the 4 m cell the game opens in and the player cannot walk
   * past the bed. Visibility alone does not help: a collider is a box in the
   * controller's list and knows nothing about what is being drawn.
   */
  for (const d of doors) {
    if (d.record?.collider) {
      d.record.collider.enabled = on && !(solved && d.index === herIndex);
    }
  }

  layout();
}

export function tick(dt) {
  if (!group || !group.visible) return;
  for (const d of doors) {
    const swing = d.door.userData.swing;
    if (!swing || swing >= 1) continue;
    d.door.userData.swing = Math.min(1, swing + dt * 0.4);
    const k = d.door.userData.swing;
    d.door.userData.pivot.rotation.y = -(k * k * (3 - 2 * k)) * 2.1;
  }
}

/** Where her door is, so the ending can put the camera in front of it. */
export function herDoorPosition(out = new THREE.Vector3()) {
  const entry = doors[herIndex];
  return entry ? out.copy(entry.door.position) : out.set(0, 0, 0);
}

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export function serialise() {
  return { solved, herIndex, tried: [...tried], ringRead };
}

export function deserialise(data) {
  if (!data) return;
  solved = !!data.solved;
  ringRead = !!data.ringRead;
  tried = new Set(data.tried ?? []);
  // The stored slot wins: the daily seed would otherwise move her door under a
  // player who came back the next day.
  if (typeof data.herIndex === "number" && data.herIndex !== herIndex) {
    herIndex = data.herIndex;
    applyMarks();
  }
  if (solved && doors[herIndex]) {
    doors[herIndex].door.userData.swing = 1;
    doors[herIndex].door.userData.pivot.rotation.y = -2.1;
    if (doors[herIndex].record?.collider) doors[herIndex].record.collider.enabled = false;
  }
  onBeat();
}

export function reset() {
  solved = false;
  ringRead = false;
  tried.clear();
  for (const d of doors) {
    d.door.userData.swing = 0;
    d.door.userData.pivot.rotation.y = 0;
    if (d.record?.collider) d.record.collider.enabled = true;
  }
  onBeat();
}
