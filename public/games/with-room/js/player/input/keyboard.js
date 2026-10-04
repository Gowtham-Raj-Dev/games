/**
 * Desktop input: keyboard, mouse and gamepad.
 *
 * Keys are tracked by `event.code`, never by `event.key`. `code` is the
 * physical key, so W is the same key on AZERTY and QWERTY and the player on a
 * French keyboard is not asked to walk sideways. `key` would also break the
 * moment the player holds shift, because the character changes.
 */

import { PLAYER, DEFAULT_SETTINGS } from "../../core/config.js";
import { EV, emit } from "../../core/bus.js";
import { clamp } from "../../core/maths.js";

const keys = Object.create(null);

let state = null;
let element = null;
let locked = false;
let settings = { ...DEFAULT_SETTINGS };

/** Gamepad polling is skipped entirely until one is actually connected. */
let gamepadPresent = false;

/* -------------------------------------------------------------------------- *
 * Bindings
 *
 * One table, so a remapping screen later has a single thing to rewrite.
 * -------------------------------------------------------------------------- */

export const BINDINGS = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  crouch: ["KeyC", "ControlLeft"],
  interact: ["KeyE"],
  drop: ["KeyQ"],
  pause: ["Escape"],
};

const down = (action) => BINDINGS[action].some((code) => keys[code]);

/* -------------------------------------------------------------------------- *
 * Setup
 * -------------------------------------------------------------------------- */

export function init(canvas, inputState) {
  state = inputState;
  element = canvas;

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", release);

  element.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousemove", onMouseMove);
  element.addEventListener("wheel", onWheel, { passive: false });
  // Right-click is a game action (drop / secondary), so the browser menu has
  // to go. Only over the canvas - the UI keeps its context menu.
  element.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("pointerlockchange", onLockChange);
  document.addEventListener("pointerlockerror", () => {
    locked = false;
  });

  window.addEventListener("gamepadconnected", () => {
    gamepadPresent = true;
  });
  window.addEventListener("gamepaddisconnected", () => {
    gamepadPresent = navigator.getGamepads?.().some(Boolean) ?? false;
  });
}

export function applySettings(next) {
  settings = { ...settings, ...next };
}

/* -------------------------------------------------------------------------- *
 * Pointer lock
 * -------------------------------------------------------------------------- */

export function requestPointerLock() {
  if (locked || !element) return;
  // Chromium returns a promise that rejects if the gesture has expired, and
  // an unhandled rejection in the console is the first thing a developer
  // blames for an unrelated bug.
  const result = element.requestPointerLock?.({ unadjustedMovement: true });
  if (result?.catch) {
    result.catch(() => {
      // `unadjustedMovement` is not supported everywhere. Retry plain.
      try {
        element.requestPointerLock();
      } catch {
        /* The player will have to click again; nothing else to do. */
      }
    });
  }
}

export function exitPointerLock() {
  if (locked) document.exitPointerLock?.();
}

export const hasPointerLock = () => locked;

function onLockChange() {
  locked = document.pointerLockElement === element;
  if (state) state.looking = locked;
  // Losing the lock is how a player leaves the game - Escape, or an alert.
  // Treat it as a pause request rather than silently continuing to simulate.
  if (!locked) {
    release();
    emit(EV.GAME_PAUSE, { auto: false, source: "pointerlock" });
  }
}

/* -------------------------------------------------------------------------- *
 * Handlers
 * -------------------------------------------------------------------------- */

function onKeyDown(e) {
  // Let the browser have its own shortcuts. Intercepting ctrl/cmd combos
  // means breaking refresh and devtools for no gameplay benefit.
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (keys[e.code]) {
    // Auto-repeat. Levels are already correct; edges must not re-fire.
    e.preventDefault();
    return;
  }
  keys[e.code] = true;

  if (!state) return;

  if (down("interact")) {
    state.interactPressed = true;
    state.interactHeld = true;
  }
  if (down("drop")) state.dropPressed = true;
  if (down("pause")) state.pausePressed = true;

  if (settings.toggleCrouch && down("crouch")) state.crouch = !state.crouch;
  if (settings.toggleSprint && down("sprint")) state.sprint = !state.sprint;

  // Keys the page would otherwise act on: space scrolls, the arrows scroll,
  // and tab moves focus out of the canvas mid-game.
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(
      e.code,
    )
  ) {
    e.preventDefault();
  }
}

function onKeyUp(e) {
  keys[e.code] = false;
  if (!state) return;
  if (!down("interact")) state.interactHeld = false;
}

function onMouseDown(e) {
  if (!state) return;
  if (e.button === 0) {
    state.interactPressed = true;
    state.interactHeld = true;
  } else if (e.button === 2) {
    state.secondaryPressed = true;
  }
}

function onMouseUp(e) {
  if (!state) return;
  if (e.button === 0) state.interactHeld = false;
}

function onMouseMove(e) {
  if (!state || !locked) return;

  /*
   * Clamp each event's movement before accumulating.
   *
   * A pointer-lock implementation occasionally delivers one enormous delta -
   * on a mode switch, on some RDP sessions, after a Windows sleep. Without a
   * clamp that single event spins the camera through several full turns and
   * the player has no idea which way they are now facing.
   */
  const dx = clamp(e.movementX || 0, -220, 220);
  const dy = clamp(e.movementY || 0, -220, 220);

  const sens = PLAYER.lookSpeed * settings.sensitivity;
  state.look.x -= dx * sens;
  state.look.y += (settings.invertY ? dy : -dy) * sens;
}

function onWheel(e) {
  if (!state) return;
  // Only meaningful while inspecting a carried object; the controller
  // ignores it otherwise, so there is nothing to gate here.
  state.rotate.y += e.deltaY * 0.0012;
  if (locked) e.preventDefault();
}

/* -------------------------------------------------------------------------- *
 * Per-frame sampling
 * -------------------------------------------------------------------------- */

/** Fold the key and pad state into the shared movement axes. */
export function sample() {
  if (!state) return;

  let x = (down("right") ? 1 : 0) - (down("left") ? 1 : 0);
  let y = (down("forward") ? 1 : 0) - (down("back") ? 1 : 0);

  if (!settings.toggleSprint) state.sprint = down("sprint");
  if (!settings.toggleCrouch) state.crouch = down("crouch");

  if (gamepadPresent) {
    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      const dead = 0.18;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.abs(ax) > dead) x += ax;
      if (Math.abs(ay) > dead) y -= ay;

      const rx = pad.axes[2] ?? 0;
      const ry = pad.axes[3] ?? 0;
      // Stick look is rate-based, so it is scaled by nothing here and by dt
      // in the camera - unlike the mouse, which is already a displacement.
      const look = 0.055 * settings.sensitivity;
      if (Math.abs(rx) > dead) state.look.x -= rx * Math.abs(rx) * look;
      if (Math.abs(ry) > dead) {
        state.look.y += (settings.invertY ? 1 : -1) * ry * Math.abs(ry) * look;
      }

      if (pad.buttons[0]?.pressed) state.sprint = true;
      if (pad.buttons[1]?.pressed) state.crouch = true;
    }
  }

  // Normalise so diagonal movement is not 41% faster than straight ahead.
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  state.move.x = x;
  state.move.y = y;
}

export function release() {
  for (const code in keys) keys[code] = false;
  if (state) {
    state.move.x = state.move.y = 0;
    state.sprint = false;
    state.crouch = false;
    state.interactHeld = false;
  }
}

export function dispose() {
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("blur", release);
  window.removeEventListener("mouseup", onMouseUp);
  window.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("pointerlockchange", onLockChange);
  element = null;
  state = null;
}
