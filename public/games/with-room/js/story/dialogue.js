/**
 * The dialogue sequencer.
 *
 * Plays a list of scripted lines: subtitle, voice, authored pause, next line.
 * One at a time, globally - there is exactly one conversation happening in
 * this game at any moment, and a second sequence starting while the ghost is
 * mid-sentence would produce two overlapping subtitles and two queued
 * utterances. `play()` therefore interrupts rather than queues.
 *
 * IT IS DRIVEN FROM THE FRAME LOOP, not from setTimeout, and that is the
 * design decision this file exists to make. A cutscene paced by timers keeps
 * pacing while the game is paused: tab out during the flashback, come back
 * forty seconds later, and the scene has played itself to a black screen
 * without you. Running on `dt` means pausing the game pauses the conversation,
 * which is the only behaviour a player ever expects.
 *
 * Waiting for a line to finish is therefore not `await sleep(n)`. Each line
 * ends when EITHER the speech engine says it has finished OR the estimated
 * duration has elapsed on the frame clock - whichever comes first. With voices
 * on, the engine's own timing wins and the subtitles track the voice exactly.
 * With voices off or absent, the estimate carries the scene at the same pace.
 */

import { EV, emit } from "../core/bus.js";
import * as voice from "./voice.js";
import * as cinema from "../ui/cinema.js";

/** The sequence in flight, or null. */
let seq = null;

export const isPlaying = () => seq !== null;

/** What is being said right now, for anything that wants to react to it. */
export const currentLine = () => seq?.lines[seq.index] ?? null;
export const currentSpeaker = () => currentLine()?.who ?? null;

/* -------------------------------------------------------------------------- *
 * Playing
 * -------------------------------------------------------------------------- */

/**
 * Play a sequence. Resolves when the last line's pause has elapsed.
 *
 * `id` names the sequence on the bus so a scene can tell which conversation
 * ended. `onCue` is called with each line's `cue` as that line starts, and the
 * same cue also goes out on the bus - the callback is for the scene that owns
 * the sequence, the bus for everything else that wants to listen.
 */
export function play(lines, { id = "", onCue = null } = {}) {
  stop();

  const list = (lines ?? []).filter(Boolean);
  if (list.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    seq = {
      id,
      lines: list,
      index: -1,
      onCue,
      resolve,
      /** "speaking" | "holding" */
      phase: "speaking",
      /** Seconds left on the frame clock for the current phase. */
      left: 0,
      /** Set by the voice engine when the utterance actually finished. */
      spoken: false,
      cancelVoice: null,
    };
    emit(EV.DIALOGUE_START, { id, lines: list });
    next();
  });
}

function next() {
  if (!seq) return;

  seq.index++;
  if (seq.index >= seq.lines.length) {
    finish();
    return;
  }

  const line = seq.lines[seq.index];
  seq.phase = "speaking";
  seq.spoken = false;

  // The cue fires as the line STARTS, so a scene can hang an event on the
  // word that describes it. A cue on the line after would always be late by
  // the length of the line before.
  if (line.cue) {
    try {
      seq.onCue?.(line.cue, line);
    } catch (err) {
      console.error("[dialogue] cue handler threw", err);
    }
    emit(EV.STORY_CUE, { cue: line.cue, line });
  }

  emit(EV.DIALOGUE_LINE, { line, who: line.who, id: seq.id });

  const spoken = voice.speak(line, {
    onEnd: () => {
      // May arrive after a skip or a stop, when `seq` is a different sequence
      // or none at all. The index check is what makes this safe.
      if (seq && seq.lines[seq.index] === line) seq.spoken = true;
    },
  });

  seq.cancelVoice = spoken.cancel;
  seq.left = spoken.seconds;

  // Subtitles are shown for the line's own duration plus its pause, so a line
  // with a long authored silence after it stays readable through the silence.
  cinema.say(line, spoken.seconds + (line.after ?? 0) * 0.75);
}

function finish() {
  const done = seq;
  seq = null;
  cinema.clearSay();
  emit(EV.DIALOGUE_END, { id: done?.id ?? "" });
  done?.resolve?.();
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  if (!seq) return;

  if (seq.phase === "speaking") {
    seq.left -= dt;
    // The engine finishing early is the normal case: `estimate` is deliberately
    // generous so that it is a backstop rather than a cutoff.
    if (seq.spoken || seq.left <= 0) {
      seq.phase = "holding";
      seq.left = seq.lines[seq.index].after ?? 0;
      // A zero-length pause must not cost a frame, or a sequence of short
      // cues drifts by one frame per line.
      if (seq.left <= 0) next();
    }
    return;
  }

  seq.left -= dt;
  if (seq.left <= 0) next();
}

/* -------------------------------------------------------------------------- *
 * Skipping
 *
 * Two levels, because they are two different intentions. Tapping through a
 * line you have read is normal reading behaviour and should not cost you the
 * scene; abandoning the scene is a separate, deliberate act - which is why
 * `skipAll` is bound to a HOLD rather than a press in the input layer.
 * -------------------------------------------------------------------------- */

/** Finish the current line immediately and move to the next. */
export function skipLine() {
  if (!seq) return;
  seq.cancelVoice?.();
  seq.cancelVoice = null;
  next();
}

/** Abandon the whole sequence. Resolves the promise, so the scene continues. */
export function skipAll() {
  if (!seq) return;
  seq.cancelVoice?.();
  voice.cancel();
  finish();
}

/**
 * Stop without resolving anything that is waiting.
 *
 * Used when the game is torn down under a sequence - quitting to the menu
 * mid-cutscene. The promise is resolved rather than dropped, because a caller
 * awaiting it is holding the game's control flow and a dropped promise there
 * means the player is left in a cutscene with no input.
 */
export function stop() {
  if (!seq) return;
  seq.cancelVoice?.();
  voice.cancel();
  finish();
}
