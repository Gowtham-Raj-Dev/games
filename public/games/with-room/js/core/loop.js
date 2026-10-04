/**
 * The main loop.
 *
 * "Make it not hang" is a hard requirement for this game, and most browser
 * games that stutter do it for one of four reasons. This file exists to close
 * all four:
 *
 *   1. Variable-timestep physics. Movement and collision resolve differently
 *      at 30, 60 and 144fps, so a slow frame tunnels the player through a
 *      wall. Fixed steps with an accumulator fix it.
 *   2. An unclamped delta. A backgrounded tab returns with a delta measured in
 *      minutes, the loop tries to simulate all of it, and the page locks up
 *      for several seconds. Clamping fixes it.
 *   3. Rendering a tab nobody is looking at, which on a laptop is pure heat.
 *   4. Per-frame allocation. Garbage collection shows up as a hitch every few
 *      seconds, which is the most common "why does it stutter" report.
 *
 * Systems register as either `fixed` (simulation - runs 0..n times a frame at
 * exactly 1/60s) or `frame` (presentation - runs once a frame with the real
 * delta and an interpolation alpha).
 */

import { WORLD } from "./config.js";
import { EV, emit } from "./bus.js";

const fixedSystems = [];
const frameSystems = [];

let running = false;
let rafId = 0;
let last = 0;
let accumulator = 0;
let paused = false;
/** Pauses that came from losing focus, as opposed to the pause menu. */
let autoPaused = false;

/* -------------------------------------------------------------------------- *
 * Frame-time statistics
 *
 * The adaptive resolution scaler needs a stable read on how long frames take.
 * A ring buffer of raw samples, allocated once, gives a median - which ignores
 * the occasional 200 ms frame from a texture upload in a way a mean does not.
 * -------------------------------------------------------------------------- */

const SAMPLES = 60;
const samples = new Float32Array(SAMPLES);
const sorted = new Float32Array(SAMPLES);
let sampleIndex = 0;
let sampleCount = 0;

export const stats = {
  fps: 60,
  /** Median frame time in milliseconds. */
  frameMs: 16.7,
  /** Fixed steps run in the last frame. 5 means the simulation is drowning. */
  steps: 1,
  /** Frames since boot. Handy for staggering expensive work across frames. */
  frame: 0,
};

function recordFrame(dtMs) {
  samples[sampleIndex] = dtMs;
  sampleIndex = (sampleIndex + 1) % SAMPLES;
  if (sampleCount < SAMPLES) sampleCount++;

  // Recompute a quarter-second apart rather than every frame: sorting 60
  // floats 60 times a second is exactly the kind of waste this file is about.
  if (stats.frame % 15 !== 0 || sampleCount < 8) return;

  sorted.set(samples);
  const view = sorted.subarray(0, sampleCount);
  view.sort();
  stats.frameMs = view[(sampleCount >> 1)];
  stats.fps = stats.frameMs > 0 ? 1000 / stats.frameMs : 60;
}

/* -------------------------------------------------------------------------- *
 * Registration
 * -------------------------------------------------------------------------- */

/**
 * Register a simulation system. Called with a constant dt of WORLD.fixedStep,
 * zero or more times per rendered frame.
 *
 * Lower `order` runs first. Input must read before the player moves, and the
 * player must move before the camera follows, or the view lags by a frame.
 */
export function addFixed(fn, order = 0) {
  fixedSystems.push({ fn, order });
  fixedSystems.sort((a, b) => a.order - b.order);
  return () => remove(fixedSystems, fn);
}

/**
 * Register a presentation system. Called once per rendered frame with the real
 * delta and `alpha`, the 0..1 fraction of a fixed step left in the
 * accumulator, for interpolating between simulation states.
 */
export function addFrame(fn, order = 0) {
  frameSystems.push({ fn, order });
  frameSystems.sort((a, b) => a.order - b.order);
  return () => remove(frameSystems, fn);
}

function remove(list, fn) {
  const i = list.findIndex((e) => e.fn === fn);
  if (i >= 0) list.splice(i, 1);
}

/** Ordering constants, so the numbers are not scattered as literals. */
export const ORDER = {
  INPUT: -100,
  PLAYER: -50,
  PHYSICS: -20,
  WORLD: 0,
  INTERACT: 20,
  CAMERA: 50,
  AUDIO: 80,
  UI: 90,
  RENDER: 100,
};

/* -------------------------------------------------------------------------- *
 * The loop
 * -------------------------------------------------------------------------- */

function tick(now) {
  rafId = requestAnimationFrame(tick);

  const rawMs = now - last;
  last = now;

  if (paused) return;

  recordFrame(rawMs);
  stats.frame++;

  // Seconds, clamped. This single line is what stops an alt-tab from locking
  // the page for however long the player was away.
  let dt = Math.min(rawMs / 1000, WORLD.maxStep);
  if (dt < 0) dt = 0;

  accumulator += dt;

  let steps = 0;
  const step = WORLD.fixedStep;
  while (accumulator >= step && steps < WORLD.maxSubSteps) {
    for (let i = 0; i < fixedSystems.length; i++) fixedSystems[i].fn(step);
    accumulator -= step;
    steps++;
  }

  /*
   * Bleed off anything left when the sub-step cap is hit.
   *
   * Without this the accumulator grows every frame on a machine too slow to
   * keep up, the loop runs the maximum steps forever, and the game enters a
   * death spiral that gets slower the longer it runs. Dropping the remainder
   * makes the game run in slow motion instead - visibly worse, but still
   * responsive, still recoverable, and never a hang.
   */
  if (steps >= WORLD.maxSubSteps) accumulator = 0;

  stats.steps = steps;

  const alpha = accumulator / step;
  for (let i = 0; i < frameSystems.length; i++) frameSystems[i].fn(dt, alpha);
}

export function start() {
  if (running) return;
  running = true;
  paused = false;
  last = performance.now();
  accumulator = 0;
  rafId = requestAnimationFrame(tick);
}

export function stop() {
  running = false;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

/**
 * Pause the simulation. The rAF keeps running so the loop can resume without
 * a stale `last` timestamp, but no system is called.
 */
export function pause(auto = false) {
  if (paused) return;
  paused = true;
  autoPaused = auto;
  emit(EV.GAME_PAUSE, { auto });
}

export function resume() {
  if (!paused) return;
  paused = false;
  autoPaused = false;
  // Reset the clock: the time spent paused is not time the game experienced.
  last = performance.now();
  accumulator = 0;
  emit(EV.GAME_RESUME);
}

export const isPaused = () => paused;
export const isRunning = () => running;

/**
 * Pause when the page is hidden and when focus is lost.
 *
 * `visibilitychange` covers tab switches and the phone being locked.
 * `blur` additionally covers another window being brought forward on a
 * desktop, where the tab stays visible. Both matter: the first is correctness,
 * the second is a laptop fan.
 *
 * Only an automatic pause auto-resumes. If the player opened the pause menu
 * and then alt-tabbed, coming back must not throw them into a live game.
 */
export function installVisibilityHandlers() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause(true);
    else if (autoPaused) resume();
  });

  window.addEventListener("blur", () => pause(true));
  window.addEventListener("focus", () => {
    if (autoPaused) resume();
  });
}
