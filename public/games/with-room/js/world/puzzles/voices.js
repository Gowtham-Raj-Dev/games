/**
 * STAGE 6 - THE VOICES.
 *
 * Five iron grilles are set into the walls of a 40 by 30 metre room. One at a
 * time, one of them crackles into life and she speaks through it. Reach that
 * grille and answer it before it goes quiet, three times running, and the room
 * opens.
 *
 * WHY IT IS A LIGHT AND NOT A SOUND. The obvious design is "follow her voice",
 * and it cannot be built: this game's entire audio layer is synthesised through
 * one mono bus, with no PannerNode anywhere, because every sound in it is
 * either the room itself or something in the player's own hands. Adding 3D
 * panning for one puzzle would mean re-routing every voice in the mixer, and
 * the result would still be unusable for half the players - laptop speakers
 * 20 cm apart cannot place a sound in a 40 m room.
 *
 * So the grille announces itself with a dim glow and a crackle, and the hunt is
 * a hunt across a dark room against a clock rather than an ear test. The voice
 * is still what the player is chasing; the light is how the game is honest
 * about being playable on a phone.
 *
 * THE WINDOW. Eight seconds, which at a walk is about 20 metres - so from the
 * middle of the room any grille is reachable, and from the far corner the
 * furthest one is not. That is deliberate: the player has to start moving
 * before they know where they are going.
 */

import * as THREE from "three";

import { audio } from "../../audio/manager.js";
import { EV, emit } from "../../core/bus.js";
import { clamp01, damp } from "../../core/maths.js";
import { mat } from "../../engine/materials.js";
import * as textures from "../../engine/textures.js";
import { t } from "../../i18n/strings.js";
import * as hud from "../../ui/hud.js";
import * as dialogue from "../../story/dialogue.js";
import * as roomScale from "../roomScale.js";

export const id = "voices";

const STATE = 5;
/** How many must be answered in a row. */
const NEEDED = 3;
/** Seconds a grille stays live. */
const WINDOW = 8;

/**
 * Where the grilles are: a wall, and how far along it.
 *
 * Spread so that no two are adjacent and the two on the long walls are at
 * opposite ends - the shortest route between any pair is most of the room.
 */
const GRILLES = [
  { side: "north", along: 0.22 },
  { side: "east", along: 0.3 },
  { side: "south", along: 0.74 },
  { side: "west", along: 0.66 },
  { side: "north", along: 0.8 },
];

/** Her lines, in order. The third is the one the stage exists for. */
const LINES = [
  { who: "her", emo: "far", after: 0.4,
    en: "{name}? Is that you walking?",
    ta: "{name}? அது நீயா நடக்கிறது?" },
  { who: "her", emo: "far", after: 0.4,
    en: "There are stairs. I counted forty going down.",
    ta: "படிக்கட்டு இருக்கு. கீழ நாற்பது படி எண்ணினேன்." },
  { who: "her", emo: "far", after: 0.4,
    en: "It's standing behind you while you listen to me.",
    ta: "நீ என் பேச்சைக் கேட்கும்போது அது உன் பின்னாடியே நிக்குது." },
  { who: "her", emo: "far", after: 0.4,
    en: "Don't stop. If you stop it comes closer.",
    ta: "நிற்காத. நின்னா அது நெருங்கிடும்." },
  { who: "her", emo: "far", after: 0.4,
    en: "The hour on the clocks. All of them. Please.",
    ta: "கடிகாரத்துல அந்த நேரம். எல்லாத்துலயும். ப்ளீஸ்." },
];

let api = null;
let group = null;
let grilles = [];
let live = -1;
let timeLeft = 0;
let answered = 0;
let solved = false;
let idle = 0;
let lineIndex = 0;

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

export function build(outer) {
  api = outer;
  group = new THREE.Group();
  group.name = "puzzle:voices";
  group.visible = false;
  api.root.add(group);

  for (let i = 0; i < GRILLES.length; i++) {
    const spec = GRILLES[i];
    const grille = new THREE.Group();
    grille.name = `grille${i}`;

    /* --- the fixture --------------------------------------------------- *
     * A cast surround with slats across it and a dark void behind. The void is
     * what makes it read as a hole into the building rather than as a vent
     * stuck on a wall.
     */
    const surround = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.42, 0.05),
      mat.iron(),
    );
    surround.castShadow = true;
    surround.receiveShadow = true;
    grille.add(surround);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.34), mat.void());
    back.position.z = 0.026;
    grille.add(back);

    for (let k = 0; k < 6; k++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.022, 0.016),
        mat.iron(),
      );
      slat.position.set(0, 0.14 - k * 0.055, 0.032);
      slat.rotation.x = 0.4;
      grille.add(slat);
    }

    /*
     * The glow.
     *
     * An additive plate behind the slats, so when it lights the light comes
     * THROUGH the grille in bars. Unlit and fog-exempt: it is the only thing in
     * a 40 m room the player can see from the far side of it, and that is its
     * entire job.
     */
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.38),
      mat.beam(0xd8c9a8, 0).clone(),
    );
    glow.material.opacity = 0;
    glow.position.z = 0.028;
    grille.add(glow);

    // A real light as well, at a low intensity, so the wall around a live
    // grille is lit and the player can tell distance from how bright it is.
    const lamp = new THREE.PointLight(0xe0c89c, 0, 7, 2);
    lamp.position.z = 0.3;
    lamp.castShadow = false;
    grille.add(lamp);

    api.place(grille, {
      kind: "wall",
      side: spec.side,
      along: spec.along,
      offset: 0.08,
      y: 1.45,
    });
    group.add(grille);

    const index = i;
    api.register(grille, {
      hit: surround,
      verb: "listen",
      name: "objGrille",
      onUse: () => answer(index),
    });

    grilles.push({ group: grille, glow, lamp, level: 0 });
  }
}

/* -------------------------------------------------------------------------- *
 * The sequence
 * -------------------------------------------------------------------------- */

/** Light one at random, never the one that was just live. */
function callNext() {
  const choices = grilles.map((_, i) => i).filter((i) => i !== live);
  live = choices[Math.floor(Math.random() * choices.length)];
  timeLeft = WINDOW;

  audio.play("lightFlicker", { gain: 0.6 });
  audio.play("whisperPass", { gain: 0.5 });

  // Her line comes from the grille, through the dialogue sequencer so it gets a
  // subtitle and her voice. The lines advance rather than repeat, so a player
  // who takes four attempts hears four different things.
  dialogue.play([LINES[lineIndex % LINES.length]], { id: "voices" });
  lineIndex++;

  hud.subtitle(t("voiceCalling"), 2.4);
}

/**
 * Answer a grille.
 *
 * The right one advances the count. The wrong one - or a dead one - costs
 * nothing except the time it took to walk there, which in this room is the
 * whole punishment.
 */
function answer(index) {
  if (solved) {
    audio.play("metalTap", { gain: 0.5 });
    return true;
  }

  api.setFlag("usedGrille");

  if (index !== live) {
    audio.play("metalTap", { gain: 0.7 });
    hud.subtitle(t("voiceDead"), 2.6);
    return true;
  }

  answered++;
  live = -1;
  timeLeft = 0;
  audio.play("switchOn", { gain: 0.9 });
  audio.play("keypadRight", { gain: 0.6 });

  if (answered < NEEDED) {
    hud.subtitle(t("voiceAnswered", answered, NEEDED), 3.4);
    // A beat of silence before the next one, so the player gets to breathe and
    // so the two calls never overlap.
    idle = 3.5;
    return true;
  }

  solved = true;
  api.setFlag("stage6Solved");
  audio.stinger("solved");
  hud.subtitle(t("voiceDone"), 4);
  api.solve(6);
  return true;
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  if (!group || !group.visible) return;

  // Glow levels, always: a dying grille fades rather than switching off, which
  // is what makes the window feel like it is closing.
  for (let i = 0; i < grilles.length; i++) {
    const g = grilles[i];
    const want = i === live ? clamp01(timeLeft / WINDOW) * 0.85 + 0.15 : 0;
    g.level = damp(g.level, want, 6, dt);
    g.glow.material.opacity = g.level * 0.75;
    g.lamp.intensity = g.level * 3.2;
  }

  if (solved || roomScale.stateId() !== STATE) return;

  if (live < 0) {
    idle -= dt;
    if (idle <= 0) callNext();
    return;
  }

  timeLeft -= dt;
  if (timeLeft > 0) return;

  /*
   * The window closed.
   *
   * The count resets. It is the only progress in the game that can be lost
   * without the room shrinking, and it is a fair loss: the player heard the
   * crackle, saw the light, and did not get there.
   */
  live = -1;
  idle = 2.5;
  if (answered > 0) {
    answered = 0;
    hud.subtitle(t("voiceLost"), 3.4);
    audio.play("keypadWrong", { gain: 0.7 });
    emit(EV.PUZZLE_FAILED_MINOR, { id: "voices" });
  }
}

/* -------------------------------------------------------------------------- *
 * Beat
 * -------------------------------------------------------------------------- */

export function onBeat() {
  const on = roomScale.stateId() >= STATE;
  if (group) group.visible = on;
  if (!on || solved) {
    live = -1;
    timeLeft = 0;
  } else if (roomScale.stateId() === STATE && live < 0 && idle <= 0) {
    // Arriving at this stage starts the first call after a pause long enough
    // for the player to have finished looking at the new room.
    idle = 6;
  }
}

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export function serialise() {
  // `answered` is NOT saved. A player who quits mid-run starts the run again,
  // which is kinder than restoring two thirds of a timed sequence they have no
  // memory of being in the middle of.
  return { solved, lineIndex };
}

export function deserialise(data) {
  if (!data) return;
  solved = !!data.solved;
  lineIndex = data.lineIndex ?? 0;
  answered = 0;
  live = -1;
  timeLeft = 0;
  idle = 6;
  onBeat();
}

export function reset() {
  solved = false;
  answered = 0;
  live = -1;
  timeLeft = 0;
  idle = 6;
  lineIndex = 0;
  for (const g of grilles) {
    g.level = 0;
    g.glow.material.opacity = 0;
    g.lamp.intensity = 0;
  }
  onBeat();
}
