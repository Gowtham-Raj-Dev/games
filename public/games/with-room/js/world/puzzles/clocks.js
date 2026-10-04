/**
 * STAGE 7 - THE HOUR.
 *
 * Six clocks on the walls of a 70 by 50 metre room, all of them stopped at
 * different wrong times. Set every one of them to four o'clock.
 *
 * It is the longest callback in the game. The first puzzle in the first room was
 * one clock and one time, and the player was told by a book what the time should
 * be. Nothing tells them this time - the answer is something they learned twenty
 * minutes ago, and the stage is built on the assumption that four o'clock is now
 * the most memorable number in the game, because it is the hour he stopped
 * breathing and the ghost said so out loud.
 *
 * THE ONE CRUELTY. When five of the six are set, the ghost puts one back. Once,
 * announced by a sound, and never again - so it reads as something in the room
 * interfering rather than as the game cheating. The player is told which one by
 * the chime that comes from it, and fixing it takes under a minute. Doing this
 * twice would be a different game and a worse one.
 */

import * as THREE from "three";

import { audio } from "../../audio/manager.js";
import { EV, emit } from "../../core/bus.js";
import { t } from "../../i18n/strings.js";
import * as hud from "../../ui/hud.js";
import * as dialogue from "../../story/dialogue.js";
import * as ghost from "../../story/ghost.js";
import * as roomScale from "../roomScale.js";
import { setClockTime } from "../roomContent.js";

export const id = "clocks";

const STATE = 6;
const STEP = 5;
/** 04:00, as minutes past twelve. */
const TARGET = 4 * 60;

/**
 * Where they hang, and what each one is stopped at.
 *
 * The start times are all deliberately awkward: none is a multiple of five, so
 * every clock's first press is the snap onto the grid, exactly as the first
 * clock in the game behaved. A player who remembers that behaviour is ahead.
 */
const CLOCKS = [
  { side: "north", along: 0.18, start: 11 * 60 + 47 },
  { side: "north", along: 0.74, start: 2 * 60 + 13 },
  { side: "east", along: 0.34, start: 7 * 60 + 56 },
  { side: "south", along: 0.28, start: 9 * 60 + 2 },
  { side: "south", along: 0.82, start: 1 * 60 + 38 },
  { side: "west", along: 0.56, start: 6 * 60 + 29 },
];

let api = null;
let group = null;
let clocks = [];
let solved = false;
let meddled = false;

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

export function build(outer) {
  api = outer;
  group = new THREE.Group();
  group.name = "puzzle:clocks";
  group.visible = false;
  api.root.add(group);

  for (let i = 0; i < CLOCKS.length; i++) {
    const spec = CLOCKS[i];
    const clock = api.makeProp("wallclock");
    if (!clock) continue;
    clock.name = `clock${i}`;

    api.place(clock, {
      kind: "wall",
      side: spec.side,
      along: spec.along,
      offset: 0.08,
      // Staggered heights, so six identical clocks in one room do not read as
      // wallpaper. All of them stay within reach of the interaction range.
      y: 1.7 + (i % 3) * 0.16,
    });
    group.add(clock);

    const entry = { clock, minutes: spec.start, done: false, index: i };
    setClockTime(clock, Math.floor(entry.minutes / 60), entry.minutes % 60);

    api.register(clock, {
      verb: "turnDial",
      name: "objClock",
      onUse: () => press(entry),
    });

    clocks.push(entry);
  }
}

/** Advance one clock five minutes, snapping to the grid on the first press. */
function press(entry) {
  if (solved) {
    audio.play("clockTick");
    return true;
  }

  api.setFlag("usedClocks");

  if (entry.minutes % STEP !== 0) entry.minutes += STEP - (entry.minutes % STEP);
  else entry.minutes += STEP;
  entry.minutes %= 720;

  setClockTime(entry.clock, Math.floor(entry.minutes / 60), entry.minutes % 60);
  audio.play("clockTick");

  const face = `${String(Math.floor(entry.minutes / 60) || 12).padStart(2, "0")}:${String(
    entry.minutes % 60,
  ).padStart(2, "0")}`;

  const wasDone = entry.done;
  entry.done = entry.minutes === TARGET;

  if (entry.done && !wasDone) {
    audio.play("clockChime", { gain: 0.7 });
    const left = clocks.filter((c) => !c.done).length;
    hud.subtitle(left > 0 ? t("clocksLeft", left) : t("clocksAll"), 3.2);
    check();
  } else {
    hud.subtitle(face, 1.6);
  }

  return true;
}

/**
 * Have they all been set - and if five of six have, does the ghost interfere?
 */
function check() {
  const done = clocks.filter((c) => c.done).length;

  if (!meddled && done === clocks.length - 1) {
    meddled = true;
    // One of the already-correct ones is put back, loudly, so the player knows
    // it happened and roughly where from.
    const candidates = clocks.filter((c) => c.done);
    const victim = candidates[Math.floor(Math.random() * candidates.length)];
    window.setTimeout(() => {
      if (solved) return;
      victim.done = false;
      victim.minutes = 3 * 60 + 17; // the time the first clock in the game was stopped at
      setClockTime(victim.clock, 3, 17);
      audio.play("clockStop");
      audio.play("ghostBreath", { gain: 0.8 });
      ghost.behind({ level: 0.6, seconds: 1.4 });
      dialogue.play(
        [
          {
            who: "ghost", emo: "whisper", after: 0,
            en: "Three seventeen. That one is mine.",
            ta: "மூணு பதினேழு. அது என்னுடையது.",
          },
        ],
        { id: "clockMeddle" },
      );
      emit(EV.PUZZLE_FAILED_MINOR, { id: "clocks" });
    }, 1400);
    return;
  }

  if (done < clocks.length) return;

  solved = true;
  api.setFlag("stage7Solved");
  // Every clock chimes at once. It is the loudest moment in the game that is
  // not a wall moving, and it is the only one that is a reward.
  for (let i = 0; i < clocks.length; i++) {
    window.setTimeout(() => audio.play("clockChime", { gain: 0.9 }), i * 90);
  }
  audio.stinger("solved");
  api.solve(7);
}

/* -------------------------------------------------------------------------- *
 * Beat
 * -------------------------------------------------------------------------- */

export function onBeat() {
  const on = roomScale.stateId() >= STATE;
  if (group) group.visible = on;
}

export function tick() {
  // Event-driven. The clocks do not run - that is the point of them.
}

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export function serialise() {
  return {
    solved,
    meddled,
    minutes: clocks.map((c) => c.minutes),
  };
}

export function deserialise(data) {
  if (!data) return;
  solved = !!data.solved;
  meddled = !!data.meddled;
  for (let i = 0; i < clocks.length; i++) {
    const m = data.minutes?.[i];
    if (typeof m !== "number") continue;
    clocks[i].minutes = m;
    clocks[i].done = m === TARGET;
    setClockTime(clocks[i].clock, Math.floor(m / 60), m % 60);
  }
  onBeat();
}

export function reset() {
  solved = false;
  meddled = false;
  for (let i = 0; i < clocks.length; i++) {
    clocks[i].minutes = CLOCKS[i].start;
    clocks[i].done = false;
    setClockTime(clocks[i].clock, Math.floor(clocks[i].minutes / 60), clocks[i].minutes % 60);
  }
  onBeat();
}
