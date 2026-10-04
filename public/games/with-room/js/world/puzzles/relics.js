/**
 * STAGE 5 - HER THINGS.
 *
 * Three objects that belong to his wife are somewhere in the room. Find them
 * and put them on the bed.
 *
 * It is the simplest puzzle in the game and the one carrying the most weight,
 * because act two has a different problem from act one: the player now knows
 * what happened and has to be made to feel it. So the mechanic is barely a
 * mechanic - search a dark room, carry three small things to one place - and
 * every single beat of it is a story beat. Each object placed plays one line of
 * her voice, and the three lines together are the only account of what she went
 * through that the game ever gives.
 *
 * The searching is real, though, and each object is found a different way:
 *
 *   PHONE   lights itself. Found with the eyes, from across the room, and it is
 *           the one that teaches the player that there is anything to look for.
 *   SCARF   on the back of the chair, in plain sight, and almost everybody
 *           walks past it twice because it reads as furniture.
 *   RING    under the table, 9 mm across, with one facet that catches the bulb.
 *           Found by crouching and by patience.
 */

import * as THREE from "three";

import { audio } from "../../audio/manager.js";
import { lerp } from "../../core/maths.js";
import { mat } from "../../engine/materials.js";
import * as textures from "../../engine/textures.js";
import { t } from "../../i18n/strings.js";
import * as hud from "../../ui/hud.js";
import * as dialogue from "../../story/dialogue.js";
import * as roomScale from "../roomScale.js";
import { standingOn } from "./index.js";

export const id = "relics";

const STATE = 4;

/**
 * The three objects, where they start, and the line each one plays.
 *
 * `at` is a function of the live room dimensions rather than a fixed point,
 * because every one of them is tucked against a piece of furniture and the
 * furniture is wall-anchored - it travels outward when the room grows.
 */
const RELICS = [
  {
    id: "phone",
    name: "objPhone",
    // On the floor in the far corner, past the crate. Its own screen is the
    // only reason it is findable, which is the point of it.
    at: (d) => [d.hw - 1.1, 0.02, -d.hd + 1.4],
    line: {
      who: "her", emo: "far", after: 0.6,
      en: "Thirty-one missed calls. All of them yours.",
      ta: "முப்பத்தொரு அழைப்புகள். எல்லாம் உன்னுடையது.",
    },
  },
  {
    id: "scarf",
    name: "objScarf",
    // Over the back of the chair, which is tucked under the table on the west
    // wall. In plain sight, and almost everybody walks past it twice.
    at: (d) => [-d.hw + 1.0, 0.56, d.d * 0.28],
    line: {
      who: "her", emo: "far", after: 0.6,
      en: "It took this off me first. Like it was being careful.",
      ta: "இதை முதல்ல கழட்டுச்சு. கவனமா இருக்குற மாதிரி.",
    },
  },
  {
    id: "ring",
    name: "objRing",
    // Under the table, 9 mm across. Found by crouching and by patience.
    at: (d) => [-d.hw + 0.58, 0.015, d.d * 0.2],
    line: {
      who: "her", emo: "far", after: 0.6,
      en: "I'm still wearing mine, {name}. Wherever this is.",
      ta: "என்னுடையது இன்னும் என் கையிலே இருக்கு, {name}. இது எந்த இடமாக இருந்தாலும்.",
    },
  },
];

let api = null;
let group = null;
let altar = null;
let records = new Map();
const placedFlags = new Set();
let solved = false;
let check = 0;

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

export function build(outer) {
  api = outer;
  group = new THREE.Group();
  group.name = "puzzle:relics";
  group.visible = false;
  api.root.add(group);

  buildAltar();

  for (const relic of RELICS) {
    const prop = api.makeProp(relic.id);
    if (!prop) continue;
    const record = api.place(
      prop,
      { kind: "free" },
      { size: api.propSize(relic.id), id: relic.id },
    );
    if (!record) continue;

    record.item = api.register(prop, {
      verb: "takeItem",
      name: relic.name,
      carry: true,
      inspect: true,
      mass: 0.12,
      collider: record.collider,
      onUse: () => {
        if (!api.getFlag(`found:${relic.id}`)) {
          api.setFlag(`found:${relic.id}`);
          hud.subtitle(t(`found_${relic.id}`), 3.6);
        }
        return false; // falls through to pick up
      },
    });
    records.set(relic.id, record);
    group.add(prop);
  }

  layout();
}

/**
 * The bed, marked.
 *
 * A faint rectangle of light on the mattress - not a glow, a fall of light from
 * nowhere in particular - so the player knows the bed is where things go. It is
 * the only piece of unexplained signposting in the game and it is here because
 * the alternative is a player carrying a ring around a 25 m room for five
 * minutes.
 */
function buildAltar() {
  altar = new THREE.Group();

  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 1.3),
    new THREE.MeshBasicMaterial({
      map: textures.glowSprite(),
      color: 0xbfd6cc,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  altar.add(pool);
  altar.userData.pool = pool;

  // Three small circles on the mattress, one per object. They dim as each is
  // filled, exactly as the sigil recesses do - the same feedback language in
  // both acts, so it never has to be learned twice.
  altar.userData.slots = [];
  for (let i = 0; i < 3; i++) {
    const slot = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshBasicMaterial({
        map: textures.glowSprite(),
        color: 0x6fe0bd,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    slot.rotation.x = -Math.PI / 2;
    slot.position.set(0, 0.002, -0.34 + i * 0.34);
    altar.add(slot);
    altar.userData.slots.push(slot);
  }

  api.place(altar, { kind: "free" }, { id: "altar" });
  group.add(altar);
}

/* -------------------------------------------------------------------------- *
 * Layout
 * -------------------------------------------------------------------------- */

export function layout() {
  if (!group) return;
  const dims = roomScale.dims;

  // The altar sits on the mattress, and the mattress height is the bed prop's
  // own - read from the record rather than hard-coded, so re-modelling the bed
  // does not leave three glowing circles floating above it.
  const bed = api.find("bed");
  if (bed && altar) {
    altar.position.set(
      bed.object.position.x,
      (bed.size?.h ?? 0.78) * 0.72,
      bed.object.position.z,
    );
    altar.rotation.y = bed.object.rotation.y;
  }

  for (const relic of RELICS) {
    const record = records.get(relic.id);
    if (!record || record.touched || record.item?.held) continue;
    const at = relic.at(dims);
    record.object.position.set(at[0], at[1], at[2]);
  }
}

export function onBeat() {
  // Act two only. Her things are not in the room during act one - he has not
  // remembered her yet, and the brief is explicit that the mystery is revealed
  // slowly.
  const on = roomScale.stateId() >= STATE;
  if (group) group.visible = on;
  layout();
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  if (!group || !group.visible) return;

  // The pool of light on the bed breathes very slightly, so it does not read as
  // a decal. One sine, and it is the only animation in this puzzle.
  if (altar?.userData.pool) {
    altar.userData.pool.material.opacity = 0.08 + Math.sin(performance.now() * 0.0007) * 0.025;
  }

  if (solved || roomScale.stateId() < STATE) return;

  check += dt;
  if (check < 0.25) return;
  check = 0;

  let all = true;
  for (let i = 0; i < RELICS.length; i++) {
    const relic = RELICS[i];
    const record = records.get(relic.id);
    const here =
      !!record &&
      !!altar &&
      standingOn(record, altar.position.x, altar.position.z, {
        radius: 0.55,
        // On the bed, not beside it: the mattress is 55 cm up, so the ceiling on
        // this test is above it and the floor below it is excluded.
        maxY: (api.find("bed")?.size?.h ?? 0.78) + 0.25,
      }) &&
      record.object.position.y > 0.3;

    if (here && !placedFlags.has(relic.id)) {
      placedFlags.add(relic.id);
      api.setFlag(`placed:${relic.id}`);
      audio.play("switchOn", { gain: 0.6 });
      audio.play("whisperPass", { gain: 0.5 });
      // Her voice, one line per object. Played through the dialogue sequencer so
      // it gets a subtitle, a speaker label and the voice engine - the same path
      // every other line in the game takes.
      dialogue.play([relic.line], { id: `relic:${relic.id}` });
      if (altar.userData.slots[i]) altar.userData.slots[i].material.opacity = 0.06;
    } else if (!here && placedFlags.has(relic.id)) {
      // Taken away again. The puzzle does not latch: picking an object back up
      // undoes its slot, because a latched placement puzzle is one the player
      // can break by tidying up.
      placedFlags.delete(relic.id);
      api.setFlag(`placed:${relic.id}`, false);
      if (altar.userData.slots[i]) altar.userData.slots[i].material.opacity = 0.22;
    }

    if (!here) all = false;
  }

  if (!all) return;

  solved = true;
  api.setFlag("stage5Solved");
  audio.stinger("solved");
  api.solve(5);
}

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export function serialise() {
  return { solved, placed: [...placedFlags] };
}

export function deserialise(data) {
  if (!data) return;
  solved = !!data.solved;
  placedFlags.clear();
  for (const k of data.placed ?? []) placedFlags.add(k);
  for (let i = 0; i < RELICS.length; i++) {
    const slot = altar?.userData.slots?.[i];
    if (slot) slot.material.opacity = placedFlags.has(RELICS[i].id) ? 0.06 : 0.22;
  }
  onBeat();
}

export function reset() {
  solved = false;
  check = 0;
  placedFlags.clear();
  for (const slot of altar?.userData.slots ?? []) slot.material.opacity = 0.22;
  for (const record of records.values()) record.touched = false;
  onBeat();
}
