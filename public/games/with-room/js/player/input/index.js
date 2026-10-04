/**
 * Unified input state.
 *
 * Desktop and touch are genuinely different control schemes, not one scheme
 * with bigger buttons - a mouse gives an unbounded relative delta, a thumb
 * gives a bounded absolute deflection, and pretending otherwise produces a
 * game that is bad on both. They therefore get separate backends in
 * `keyboard.js` and `touch.js`.
 *
 * What they share is this: both write into the one `input` object below, and
 * nothing downstream of here knows or cares which device produced it. The
 * player controller reads intent, never events.
 *
 * Two kinds of field, and the distinction matters:
 *   LEVELS  (move, look, sprint, crouch) are sampled - whatever they are at
 *           the moment the controller runs is what it uses.
 *   EDGES   (*Pressed) are consumed - they latch when the button goes down
 *           and are cleared by `endFrame()`, so a single tap can never be
 *           read twice even if two fixed steps run in one rendered frame.
 */

import { get as getPlatform } from "../../core/platform.js";
import * as keyboard from "./keyboard.js";
import * as touch from "./touch.js";

export const input = {
  /** Strafe and forward, each -1..1, already deadzoned and normalised. */
  move: { x: 0, y: 0 },

  /**
   * Look delta to apply this frame, in radians, consumed by the camera.
   *
   * Accumulated rather than sampled: a 240 Hz mouse can deliver several
   * pointer events between frames, and dropping all but the last of them is
   * the usual cause of "my mouse feels like it skips".
   */
  look: { x: 0, y: 0 },

  sprint: false,
  crouch: false,

  /** Edge-triggered, cleared by endFrame(). */
  interactPressed: false,
  secondaryPressed: false,
  dropPressed: false,
  pausePressed: false,
  /** Held, for interactions that need a hold rather than a tap. */
  interactHeld: false,

  /** Drag while inspecting a held object, in radians. Also consumed. */
  rotate: { x: 0, y: 0 },

  /** True while the player has a pointer lock or a finger on the look zone. */
  looking: false,
};

let active = false;

/** Attach whichever backend this device needs. */
export function init(canvas) {
  const p = getPlatform();
  // Both are attached on a hybrid device - a touchscreen laptop is a real
  // thing and the player may use either at any moment - but only the touch
  // rig's DOM is shown, and that is gated on `body.touch` in CSS.
  keyboard.init(canvas, input);
  if (p.touch) touch.init(canvas, input);
  active = true;
}

/**
 * Fold both backends into the shared axes.
 *
 * Must run before anything reads `input.move`. Touch samples second so that
 * on a hybrid device a thumb on the stick wins over a stuck key - the far
 * more likely of the two to be wrong.
 */
export function sample() {
  keyboard.sample();
  if (getPlatform().touch) touch.sample();
}

/** Push changed settings into both backends. */
export function applySettings(next) {
  keyboard.applySettings(next);
  touch.applySettings(next);
}

/**
 * Clear the per-frame accumulators.
 *
 * Must be called at the very END of the frame, after every system that reads
 * input. Calling it at the start instead throws away anything that arrived
 * between the last frame's end and this one's beginning, which at high
 * refresh rates is most of the mouse movement.
 */
export function endFrame() {
  input.look.x = 0;
  input.look.y = 0;
  input.rotate.x = 0;
  input.rotate.y = 0;
  input.interactPressed = false;
  input.secondaryPressed = false;
  input.dropPressed = false;
  input.pausePressed = false;
}

/**
 * Drop every held input.
 *
 * Called on blur and when the pause menu opens. Without it, alt-tabbing while
 * walking forward leaves the player walking forward forever, because the
 * keyup is delivered to whatever window took focus.
 */
export function releaseAll() {
  input.move.x = input.move.y = 0;
  input.look.x = input.look.y = 0;
  input.rotate.x = input.rotate.y = 0;
  input.sprint = false;
  input.crouch = false;
  input.interactHeld = false;
  keyboard.release();
  touch.release();
}

export const isActive = () => active;

/** Ask for pointer lock. Desktop only; a no-op on touch. */
export function requestLook() {
  if (!getPlatform().touch) keyboard.requestPointerLock();
}

export function releaseLook() {
  keyboard.exitPointerLock();
}

export const hasPointerLock = () => keyboard.hasPointerLock();

export function dispose() {
  keyboard.dispose();
  touch.dispose();
  active = false;
}
