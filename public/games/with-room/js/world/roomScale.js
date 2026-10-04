/**
 * RoomScaleManager - the game's central mechanic.
 *
 * Owns which room state the world is in, the dimensions right now (which are
 * not the same thing during a transition), and the choreography of growing
 * and shrinking.
 *
 * The important design decision is that this module publishes *dimensions*,
 * not geometry. It never touches a mesh. The room builder, the collision
 * code, the light rig, the fog and the audio all read `dims` every frame and
 * make themselves agree with it. That is what lets the walls be mid-flight
 * and the player still collide correctly with where they actually are, and it
 * is why the expansion can be watched rather than cut to.
 *
 * The transition timeline, in order:
 *
 *   ANTICIPATION   nothing moves. The lights stutter and a sub-bass tremor
 *                  builds, so the player knows to brace. Control is locked.
 *   TRAVEL         dimensions ease from the old state to the new one. The
 *                  room builder has already created the target geometry, so
 *                  what the player sees is walls sliding over a floor that is
 *                  revealed as they pass.
 *   SETTLE         dimensions have arrived. Dust falls, the room rings, and
 *                  there is a deliberate beat of near-silence before control
 *                  returns. The silence is the reward.
 */

import {
  ROOM_STATES,
  MIN_STATE,
  MAX_STATE,
  EXPANSION,
  SHRINK,
} from "../core/config.js";
import { EV, emit } from "../core/bus.js";
import { clamp, clamp01, lerp, ease, noise1 } from "../core/maths.js";

export const PHASE = {
  IDLE: "idle",
  ANTICIPATION: "anticipation",
  TRAVEL: "travel",
  SETTLE: "settle",
};

/* -------------------------------------------------------------------------- *
 * State
 * -------------------------------------------------------------------------- */

let stateIndex = MIN_STATE;
/** The furthest the player has ever reached. Shrinking does not lower it. */
let highWater = MIN_STATE;

/**
 * Live dimensions. Mutated in place every frame rather than replaced, because
 * half the game holds a reference to this object and reads it in its own
 * update. Allocating a new one each frame would be both garbage and a bug.
 */
export const dims = {
  w: ROOM_STATES[MIN_STATE].w,
  d: ROOM_STATES[MIN_STATE].d,
  h: ROOM_STATES[MIN_STATE].h,
  /** Half-extents, kept in sync because collision wants them every step. */
  hw: ROOM_STATES[MIN_STATE].w / 2,
  hd: ROOM_STATES[MIN_STATE].d / 2,
};

const transition = {
  phase: PHASE.IDLE,
  /** "expand" | "shrink" */
  kind: null,
  /** Seconds elapsed in the current phase. */
  t: 0,
  /** 0..1 progress through TRAVEL. */
  progress: 0,
  from: null,
  to: null,
  cfg: EXPANSION,
  fromIndex: MIN_STATE,
  toIndex: MIN_STATE,
};

/** Current camera shake amplitude in metres, read by the camera rig. */
let shake = 0;
/** 0..1 light-stutter intensity, read by the light rig. */
let stutter = 0;

/* -------------------------------------------------------------------------- *
 * Queries
 * -------------------------------------------------------------------------- */

export const state = () => ROOM_STATES[stateIndex];
export const stateId = () => stateIndex;
export const maxReached = () => highWater;
export const phase = () => transition.phase;
export const isTransitioning = () => transition.phase !== PHASE.IDLE;
export const progress = () => transition.progress;
export const kind = () => transition.kind;
export const getShake = () => shake;
export const getStutter = () => stutter;

export const canExpand = () => stateIndex < MAX_STATE && !isTransitioning();
export const canShrink = () => stateIndex > MIN_STATE && !isTransitioning();
/** The room cannot get any smaller: the caller should trigger game over. */
export const atMinimum = () => stateIndex <= MIN_STATE;

/** Floor area in square metres. Used by the audio mix and the HUD. */
export const area = () => dims.w * dims.d;

/* -------------------------------------------------------------------------- *
 * Driving a change
 * -------------------------------------------------------------------------- */

function begin(targetIndex, isExpand) {
  const from = ROOM_STATES[stateIndex];
  const to = ROOM_STATES[targetIndex];

  transition.phase = PHASE.ANTICIPATION;
  transition.kind = isExpand ? "expand" : "shrink";
  transition.cfg = isExpand ? EXPANSION : SHRINK;
  transition.t = 0;
  transition.progress = 0;
  transition.from = from;
  transition.to = to;
  transition.fromIndex = stateIndex;
  transition.toIndex = targetIndex;

  /*
   * The index moves now, at the START of the transition, not at the end.
   *
   * The room builder listens for this event and builds the target geometry
   * immediately, so that by the time the walls start travelling there is
   * already a floor out there for them to uncover. Deferring the index change
   * to the end of the animation was the first implementation and it meant the
   * walls slid outward over blackness.
   */
  stateIndex = targetIndex;
  if (targetIndex > highWater) highWater = targetIndex;

  emit(EV.ROOM_WILL_CHANGE, {
    from,
    to,
    kind: transition.kind,
    duration: transition.cfg.anticipation + transition.cfg.duration + transition.cfg.settle,
  });
  emit(isExpand ? EV.ROOM_EXPAND_START : EV.ROOM_SHRINK_START, { from, to });
}

/** Grow by one state. Returns false if already at the largest, or mid-change. */
export function expand() {
  if (!canExpand()) return false;
  begin(stateIndex + 1, true);
  return true;
}

/** Shrink by one state. Returns false if already at the smallest. */
export function shrink() {
  if (!canShrink()) return false;
  begin(stateIndex - 1, false);
  return true;
}

/**
 * Jump straight to a state with no animation.
 *
 * Only for loading a save and for the debug panel. Gameplay must always go
 * through expand/shrink, or the player misses the only thing the game is about.
 */
export function setStateImmediate(index) {
  stateIndex = clamp(Math.round(index), MIN_STATE, MAX_STATE);
  if (stateIndex > highWater) highWater = stateIndex;

  const s = ROOM_STATES[stateIndex];
  applyDims(s.w, s.d, s.h);

  transition.phase = PHASE.IDLE;
  transition.kind = null;
  transition.progress = 0;
  shake = 0;
  stutter = 0;

  emit(EV.ROOM_CHANGED, { state: s, immediate: true });
}

function applyDims(w, d, h) {
  dims.w = w;
  dims.d = d;
  dims.h = h;
  dims.hw = w / 2;
  dims.hd = d / 2;
}

/* -------------------------------------------------------------------------- *
 * Per-frame update
 * -------------------------------------------------------------------------- */

/** Runs in the fixed step, so the dimensions collision reads are never stale. */
export function tick(dt) {
  if (transition.phase === PHASE.IDLE) {
    if (shake > 0) shake = Math.max(0, shake - dt * 0.4);
    if (stutter > 0) stutter = Math.max(0, stutter - dt * 2);
    return;
  }

  transition.t += dt;
  const cfg = transition.cfg;

  if (transition.phase === PHASE.ANTICIPATION) {
    const k = clamp01(transition.t / cfg.anticipation);
    /*
     * Build the tremor and the light stutter, but move nothing.
     *
     * The anticipation beat is doing real work: without it the walls simply
     * start moving and the player reads it as a glitch. With it, they get
     * about a second and a half to understand that the room is about to do
     * something, and the expansion lands as an event rather than a surprise.
     */
    shake = cfg.shake * 0.28 * k * k;
    stutter = k;
    if (transition.t >= cfg.anticipation) {
      transition.phase = PHASE.TRAVEL;
      transition.t = 0;
    }
    return;
  }

  if (transition.phase === PHASE.TRAVEL) {
    const k = clamp01(transition.t / cfg.duration);
    const eased = ease(cfg.ease)(k);
    transition.progress = k;

    const a = transition.from;
    const b = transition.to;
    applyDims(
      lerp(a.w, b.w, eased),
      lerp(a.d, b.d, eased),
      lerp(a.h, b.h, eased),
    );

    /*
     * Shake peaks in the middle of the travel, not at the start.
     *
     * sin(pi * k) rather than a constant: the walls are heaviest when they
     * are moving fastest, and tapering the shake at both ends keeps the
     * arrival clean so the settle beat reads as stillness.
     */
    shake = cfg.shake * Math.sin(Math.PI * k);
    // Noise, not random: random jitter reads as video noise, a sampled smooth
    // curve reads as the building moving.
    shake *= 0.75 + 0.25 * noise1(transition.t * 9);
    stutter = 1 - k * 0.6;

    emit(EV.ROOM_CHANGING, {
      progress: k,
      eased,
      kind: transition.kind,
      dims,
    });

    if (transition.t >= cfg.duration) {
      applyDims(b.w, b.d, b.h);
      transition.phase = PHASE.SETTLE;
      transition.t = 0;
      transition.progress = 1;
    }
    return;
  }

  // SETTLE
  const k = clamp01(transition.t / cfg.settle);
  // Ring down to nothing. The last third is deliberately dead still.
  shake = cfg.shake * 0.35 * Math.max(0, 1 - k * 1.5) * noise1(transition.t * 14);
  stutter = Math.max(0, 1 - k * 2);

  if (transition.t >= cfg.settle) {
    transition.phase = PHASE.IDLE;
    transition.kind = null;
    transition.t = 0;
    shake = 0;
    stutter = 0;
    emit(EV.ROOM_CHANGED, { state: ROOM_STATES[stateIndex], immediate: false });
  }
}

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export const serialise = () => ({ stateIndex, highWater });

export function deserialise(data) {
  if (!data) return;
  highWater = clamp(data.highWater ?? MIN_STATE, MIN_STATE, MAX_STATE);
  setStateImmediate(data.stateIndex ?? MIN_STATE);
}

export function reset() {
  highWater = MIN_STATE;
  setStateImmediate(MIN_STATE);
}
