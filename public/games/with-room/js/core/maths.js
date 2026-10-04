/**
 * Small maths helpers shared across systems.
 *
 * The easing curves matter more than they look. Expansion and shrinking are
 * the whole game, and the difference between the two being a reward and a
 * punishment is almost entirely in the shape of these curves.
 */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));

/**
 * Frame-rate independent exponential smoothing.
 *
 * `lerp(a, b, 0.1)` in a frame callback moves twice as fast at 120fps as at
 * 60fps, which makes every smoothed value in the game subtly different on
 * different machines. This does not.
 *
 * `rate` is roughly "how many e-foldings per second" - higher converges faster.
 */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** Shortest signed angular distance from a to b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* -------------------------------------------------------------------------- *
 * Easing
 *
 * Named so config.js can reference a curve as a string and a designer can
 * swap it without touching code.
 * -------------------------------------------------------------------------- */

export const EASING = {
  linear: (t) => t,

  /** Gentle both ends. The default for anything cosmetic. */
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  quadOut: (t) => 1 - (1 - t) * (1 - t),
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  /**
   * EXPANSION. Barely moves for the first fifth, then glides a long way and
   * settles almost imperceptibly. The slow entry is what sells the weight of
   * the walls; the long tail is what makes the new space feel earned.
   */
  expoInOut: (t) =>
    t === 0 ? 0
    : t === 1 ? 1
    : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2
    : (2 - Math.pow(2, -20 * t + 10)) / 2,

  /**
   * SHRINK. Pulls back a fraction - the walls flinch outward - and then
   * lunges in. That flinch is the tell that something bad is coming, and it
   * lands about 300 ms before the player can react, which is the point.
   */
  backIn: (t) => {
    const c = 1.70158;
    return (c + 1) * t * t * t - c * t * t;
  },

  /** A hard arrival, for the walls hitting their final position. */
  bounceOut: (t) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },

  /** Settling oscillation, for objects shaken loose by a transition. */
  elasticOut: (t) => {
    if (t === 0 || t === 1) return t;
    const p = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * p) + 1;
  },
};

/** Look up an easing curve by name, falling back to something harmless. */
export const ease = (name) => EASING[name] ?? EASING.sineInOut;

/* -------------------------------------------------------------------------- *
 * Noise
 * -------------------------------------------------------------------------- */

/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * Puzzles must never depend on Math.random: a player who reloads after a
 * failure has to meet the same puzzle, and a bug report has to be
 * reproducible. Seed this from the save file instead.
 */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash one lattice point.
 *
 * Hoisted to module scope rather than living inside `noise1`. It looked
 * tidier as a closure, but the camera rig and the hand viewmodel between
 * them call `noise1` about a dozen times a frame, and a closure allocated
 * per call is a dozen short-lived objects a frame - which is exactly the
 * kind of drip that shows up later as a garbage-collection hitch every few
 * seconds and takes an afternoon to track down.
 */
function hash1(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Smooth 1D value noise, for tremor and flicker.
 *
 * Camera shake built from Math.random jitters in a way the eye reads as video
 * noise rather than as the ground moving. Sampling a smooth curve instead
 * reads as a rumble.
 */
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}
