/**
 * Room stability - this game's health bar.
 *
 * The number is only interesting because it is scarce, so the rules about
 * what moves it are strict and live in exactly one place:
 *
 *   - Nothing the player does by walking, looking or picking things up moves
 *     it. Exploration is free.
 *   - A minor mistake costs nothing. Pressing the wrong button has to be free
 *     or players stop experimenting, and a puzzle game nobody experiments in
 *     is a puzzle game nobody finishes.
 *   - Only a major puzzle outcome moves it, and a major failure also shrinks
 *     the room. The two are deliberately coupled: the player should never
 *     have to read a number to know they are losing, because they can see the
 *     walls.
 *
 * Reaching zero is not instant death. It arms the game-over sequence, which
 * is a slow collapse the player watches, because the collapse is the point.
 */

import { STABILITY, stabilityBand } from "../core/config.js";
import { EV, emit } from "../core/bus.js";
import { clamp } from "../core/maths.js";

let value = STABILITY.start;
let band = stabilityBand(value);

/** Smoothed toward `value` for the HUD, so the bar never jumps. */
let display = STABILITY.start;

export const get = () => value;
export const getDisplay = () => display;
export const getBand = () => band;
export const isCritical = () => value <= 20;
export const isDead = () => value <= STABILITY.min;

/** 0..1, for driving the vignette, the light flicker and the audio mix. */
export const dread = () => 1 - clamp(value / STABILITY.max, 0, 1);

/**
 * Apply a change.
 *
 * `reason` is carried through to the event so the HUD can explain itself -
 * "+10 PUZZLE SOLVED" rather than a number that silently moves.
 */
export function change(delta, reason = "") {
  if (delta === 0) return value;

  const before = value;
  value = clamp(value + delta, STABILITY.min, STABILITY.max);
  if (value === before) return value;

  const nextBand = stabilityBand(value);
  const bandChanged = nextBand.key !== band.key;
  band = nextBand;

  emit(EV.STABILITY_CHANGED, { value, delta: value - before, reason, band });

  // A band change is a separate event because it is a presentation moment -
  // the light rig re-tints, the ambience shifts, the HUD flashes - and most
  // listeners care about crossing the line, not about every point lost.
  if (bandChanged) emit(EV.STABILITY_BAND, { band, value });

  return value;
}

/* Named helpers, so call sites read as intent rather than arithmetic. */
export const solvedMajor = () => change(STABILITY.gainMajor, "solvedMajor");
export const solvedMinor = () => change(STABILITY.gainMinor, "solvedMinor");
export const recovered = () => change(STABILITY.gainRecovery, "recovered");
export const failedMajor = () => change(-STABILITY.lossMajor, "failedMajor");
export const failedCritical = () => change(-STABILITY.lossCritical, "failedCritical");
/** Exists so a caller can be explicit that a minor failure is deliberately free. */
export const failedMinor = () => change(-STABILITY.lossMinor, "failedMinor");

/** Set directly, without an event reason. Used by save/load and the debug panel. */
export function set(next, silent = false) {
  const before = value;
  value = clamp(next, STABILITY.min, STABILITY.max);
  band = stabilityBand(value);
  if (silent) {
    display = value;
    return;
  }
  if (value !== before) {
    emit(EV.STABILITY_CHANGED, { value, delta: value - before, reason: "set", band });
    emit(EV.STABILITY_BAND, { band, value });
  }
}

export function reset() {
  set(STABILITY.start, true);
}

/**
 * Ease the displayed value toward the real one.
 *
 * Called once a frame. The bar is deliberately slow: a 15-point drop that
 * takes most of a second to land reads as damage being done to the room,
 * where an instant jump reads as a UI update.
 */
export function tick(dt) {
  if (display === value) return;
  const speed = display > value ? 26 : 42; // falls slower than it rises
  const step = (value - display) * Math.min(1, dt * (speed / 10));
  display += step;
  if (Math.abs(display - value) < 0.05) display = value;
}

export const serialise = () => ({ value });

export function deserialise(data) {
  if (data && typeof data.value === "number") set(data.value, true);
}
