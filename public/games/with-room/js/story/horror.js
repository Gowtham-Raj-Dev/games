/**
 * The haunting.
 *
 * While the player is solving puzzles, this fires the small events that make the
 * room feel occupied: the light fails, the door handle moves, something falls off
 * a shelf, footsteps cross a space that is empty, a whisper arrives from behind.
 *
 * The brief is explicit that the horror must come from mystery, atmosphere and
 * psychological tension rather than from jumpscares, so the rules this scheduler
 * obeys are mostly rules about NOT firing:
 *
 *   NEVER DURING DIALOGUE. A whisper over a line of story is noise, and the one
 *   thing the player must always be able to do is hear what they are being told.
 *   NEVER IN THE FIRST MINUTE OF A STAGE. The player has just arrived, is
 *   working out what changed, and interrupting that is interrupting the puzzle.
 *   NEVER TWICE THE SAME. `lastKind` is excluded from the next draw, so no two
 *   consecutive events are the same event.
 *   NEVER MORE THAN ONE AT A TIME. `busy` holds the scheduler off while an
 *   event is still playing out.
 *   LOUD ONES ARE RARE. Each event has a WEIGHT, and the quiet ones - a breath,
 *   a creak, a shadow - are weighted an order of magnitude above the ones with a
 *   bang in them. Over a twenty-minute session the player gets perhaps two
 *   events with a transient in them and twenty that are just wrong.
 *
 * Escalation is one number, `tension`, which rises with the act and with how
 * long the player has been stuck. It shortens the gaps and unlocks the heavier
 * events; it never makes them louder.
 */

import { EV, emit, on } from "../core/bus.js";
import { clamp, clamp01, lerp } from "../core/maths.js";
import { audio } from "../audio/manager.js";
import * as lighting from "../engine/lighting.js";
import * as cinema from "../ui/cinema.js";
import * as controller from "../player/controller.js";
import * as roomScale from "../world/roomScale.js";
import * as dialogue from "./dialogue.js";
import * as ghost from "./ghost.js";
import * as state from "./state.js";
import { WHISPERS } from "./script.js";

/* -------------------------------------------------------------------------- *
 * The events
 *
 * `weight` is relative frequency. `min` is the tension below which the event
 * cannot fire at all. `run` does the thing and returns how many seconds the
 * scheduler should consider itself busy for.
 * -------------------------------------------------------------------------- */

const EVENTS = [
  /* ---------------------------------------------------------------- quiet --- */

  {
    kind: "creak",
    weight: 10,
    min: 0,
    run() {
      // The building settling. The most common event in the game by a wide
      // margin, and the one nobody ever reports noticing - which is the point:
      // it is the bed of the haunting rather than a beat of it.
      audio.play("woodTap", { gain: 0.5 });
      return 2;
    },
  },

  {
    kind: "dust",
    weight: 8,
    min: 0,
    run() {
      audio.play("dustFall", { gain: 0.7 });
      return 3;
    },
  },

  {
    kind: "flicker",
    weight: 9,
    min: 0,
    run() {
      audio.play("lightFlicker", { gain: 0.8 });
      // A stutter rather than a blackout: the bulb is driven by the lighting
      // rig's own flicker system, so this asks for a brief dip instead of
      // seizing control of the light.
      lighting.setBlackout(0.55);
      window.setTimeout(() => lighting.setBlackout(0), 140);
      window.setTimeout(() => lighting.setBlackout(0.4), 260);
      window.setTimeout(() => lighting.setBlackout(0), 380);
      return 2.5;
    },
  },

  {
    kind: "breathBehind",
    weight: 8,
    min: 0.15,
    run() {
      /*
       * Someone exhaling, close, behind the player's head.
       *
       * No apparition and no follow-up. The player turns round to an empty
       * room, and the game offers them nothing - which is far worse than
       * showing them something, because there is no way to check.
       */
      audio.play("ghostBreath", { gain: 0.75 });
      return 3;
    },
  },

  {
    kind: "whisper",
    weight: 7,
    min: 0.1,
    run() {
      // One line, in her voice, using the player's name. Goes through the
      // dialogue sequencer so it gets a subtitle and the ghost's full voice
      // treatment, exactly as a scripted line does.
      const line = WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
      dialogue.play([line], { id: "whisper" });
      return 5;
    },
  },

  {
    kind: "footsteps",
    weight: 6,
    min: 0.2,
    run() {
      /*
       * Three or four steps crossing the room, and then stopping.
       *
       * Stopping is the whole event. Footsteps that cross and fade are
       * somebody leaving; footsteps that stop are somebody standing still.
       */
      const count = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        window.setTimeout(
          () => audio.play("footstepFar", { gain: 0.55 + i * 0.05 }),
          i * (430 + Math.random() * 90),
        );
      }
      return 4;
    },
  },

  {
    kind: "handle",
    weight: 5,
    min: 0.2,
    run() {
      // The door handle turns from the other side, and then does not open.
      audio.play("handleTurn", { gain: 0.9 });
      emit(EV.HORROR, { kind: "handle" });
      return 3.5;
    },
  },

  {
    kind: "cornerFigure",
    weight: 5,
    min: 0.25,
    run() {
      // In a corner, behind them, for two seconds. Refused if that corner is in
      // frame, in which case nothing happens at all and the scheduler moves on.
      return ghost.inCorner({ level: 0.42, seconds: 2.2 }) ? 4 : 0.5;
    },
  },

  /* ----------------------------------------------------------- escalating --- */

  {
    kind: "mirrorFigure",
    weight: 4,
    min: 0.35,
    run() {
      // Only worth firing once the mirror is in the room. Before that it would
      // be an apparition standing outside the west wall, visible to nobody.
      if (roomScale.stateId() < 4) return 0.5;
      audio.play("mirrorRing", { gain: 0.4 });
      return ghost.inMirror({ seconds: 2.6 }) ? 5 : 0.5;
    },
  },

  {
    kind: "shelfFall",
    weight: 3,
    min: 0.4,
    run() {
      audio.play("shelfFall");
      return 4;
    },
  },

  {
    kind: "knock",
    weight: 3,
    min: 0.45,
    run() {
      // Three knocks on the locked door. The only event in the file that is
      // unambiguously a message.
      audio.play("doorKnock", { gain: 0.9 });
      emit(EV.HORROR, { kind: "knock" });
      return 4;
    },
  },

  {
    kind: "clockStop",
    weight: 2,
    min: 0.5,
    run() {
      audio.play("clockStop");
      emit(EV.HORROR, { kind: "clockStop" });
      return 5;
    },
  },

  {
    kind: "distortion",
    weight: 3,
    min: 0.5,
    run() {
      // The picture fails for a fraction of a second. It is the only event that
      // breaks the fourth wall and it is deliberately the rarest heavy one:
      // the game has already established in the car that the image is not
      // reliable, and this is the reminder.
      audio.play("glitchZap", { gain: 0.5 });
      cinema.glitch(0.4, 0.35);
      return 4;
    },
  },

  {
    kind: "blackout",
    weight: 2,
    min: 0.6,
    run() {
      /*
       * The light goes out, and comes back with the figure standing there.
       *
       * The heaviest event in the game, and the only one that takes the room
       * away. It needs tension above 0.6, which means it cannot happen in act
       * one at all - the first blackout the player experiences is the scripted
       * one when the ghost introduces itself, and this is allowed to echo it
       * only once the story has earned the comparison.
       */
      audio.play("switchOff", { gain: 1.1 });
      lighting.setBlackout(1);
      audio.ghostVoiceBed(1.4, { grains: false });

      window.setTimeout(() => {
        // It appears IN the dark, in front of them, and is gone before the
        // light is fully back - so what the player sees is an afterimage they
        // cannot be sure of.
        const p = controller.player;
        ghost.showAt(
          p.position.x + Math.sin(p.yaw) * -2.2,
          p.position.z + Math.cos(p.yaw) * -2.2,
          { level: 0.9, seconds: 0.7, unseen: false },
        );
      }, 900);

      window.setTimeout(() => {
        lighting.setBlackout(0);
        audio.play("switchOn", { gain: 1 });
      }, 1700);

      return 7;
    },
  },
];

/* -------------------------------------------------------------------------- *
 * State
 * -------------------------------------------------------------------------- */

let enabled = false;
/** Seconds until the next attempt. */
let timer = 0;
/** Seconds the current event still owns the room for. */
let busy = 0;
/** Seconds since this stage started, so the opening of a stage is left alone. */
let settled = 0;
let lastKind = "";
/** 0..1. Rises with the act and with time spent in a stage. */
let tension = 0;

/** Base seconds between events, at zero and at full tension. */
const GAP_CALM = 46;
const GAP_TENSE = 17;

export function start() {
  enabled = true;
  settled = 0;
  // The first event is never immediate. Arriving in a new room is already an
  // event.
  timer = 24 + Math.random() * 18;
}

export function stop() {
  enabled = false;
  busy = 0;
  ghost.hide();
}

/** Called when the room changes, so the scheduler backs off while they look. */
export function roomChanged() {
  settled = 0;
  timer = Math.max(timer, 20 + Math.random() * 14);
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  if (!enabled) return;

  settled += dt;
  if (busy > 0) busy -= dt;

  /*
   * Tension.
   *
   * Act two sits half a point higher than act one, and within a stage it rises
   * for the first three minutes and then stops. It does NOT keep climbing: a
   * player who is genuinely stuck does not need the haunting to get worse, they
   * need a hint - which is what the H key is for.
   */
  const actFloor = state.act() === 2 ? 0.42 : 0;
  tension = clamp01(actFloor + clamp01(settled / 180) * 0.55);

  timer -= dt;
  if (timer > 0) return;

  // Re-armed whether or not the attempt succeeds, so a refused event does not
  // retry every frame.
  timer = lerp(GAP_CALM, GAP_TENSE, tension) * (0.7 + Math.random() * 0.6);

  if (!canFire()) return;
  fire();
}

/** Every reason not to. */
function canFire() {
  if (busy > 0) return false;
  // Not while being spoken to, and not while the walls are moving.
  if (dialogue.isPlaying()) return false;
  if (roomScale.isTransitioning()) return false;
  // Not in the first minute of a stage.
  if (settled < 55) return false;
  // Only while the player actually has the room.
  if (!state.isPlayable()) return false;
  return true;
}

function fire() {
  const pool = EVENTS.filter((e) => e.min <= tension && e.kind !== lastKind);
  if (pool.length === 0) return;

  let total = 0;
  for (const e of pool) total += e.weight;
  let roll = Math.random() * total;
  let chosen = pool[0];
  for (const e of pool) {
    roll -= e.weight;
    if (roll <= 0) {
      chosen = e;
      break;
    }
  }

  lastKind = chosen.kind;
  try {
    busy = chosen.run() ?? 2;
  } catch (err) {
    console.error("[horror] event threw", err);
    busy = 2;
  }
  emit(EV.HORROR, { kind: chosen.kind, tension });
}

/**
 * Fire one specific event, now, ignoring every rule above.
 *
 * For the scripted moments - the beat after a puzzle is solved, the ghost's
 * interruptions - where the story wants a particular effect at a particular
 * instant rather than an ambient one.
 */
export function force(kind) {
  const event = EVENTS.find((e) => e.kind === kind);
  if (!event) return false;
  lastKind = kind;
  try {
    busy = event.run() ?? 2;
  } catch (err) {
    console.error("[horror] forced event threw", err);
  }
  return true;
}

export const getTension = () => tension;
