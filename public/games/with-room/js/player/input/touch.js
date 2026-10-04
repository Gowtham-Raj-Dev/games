/**
 * Touch input.
 *
 * This is a separate control scheme, not the desktop one with bigger hit
 * areas. The layout follows the one rule that matters on a phone held in
 * landscape: the thumbs own the bottom corners and nothing important may
 * live in the middle, because that is where the game is.
 *
 *   LEFT  a floating stick. It appears wherever the thumb lands rather than
 *         sitting at a fixed spot, because a thumb cannot reliably find a
 *         fixed circle without looking, and looking away from a first-person
 *         game is the thing we are trying to avoid.
 *   RIGHT a bare drag zone for looking. No visible control: the whole right
 *         half of the screen is the control, and drawing a widget there
 *         would only cover the room.
 *   BUTTONS bottom right, above the look zone's thumb rest.
 *
 * Every finger is tracked by pointer id and its element captures the
 * pointer, so a thumb that drifts off the edge of a button mid-gesture keeps
 * doing what it was doing instead of silently letting go.
 */

import { PLAYER, DEFAULT_SETTINGS } from "../../core/config.js";
import { clamp } from "../../core/maths.js";

let state = null;
let root = null;
let settings = { ...DEFAULT_SETTINGS };

/** pointerId -> role. One entry per finger currently on the screen. */
const fingers = new Map();

/** The floating movement stick. */
const stick = {
  id: null,
  ox: 0,
  oy: 0,
  x: 0,
  y: 0,
  el: null,
  knob: null,
  /** Travel in pixels for full deflection. Scaled from the viewport. */
  radius: 56,
};

const look = { id: null, lx: 0, ly: 0 };

/** Buttons, keyed by the data-act attribute in index.html. */
const buttons = new Map();

/* -------------------------------------------------------------------------- *
 * Setup
 * -------------------------------------------------------------------------- */

export function init(canvas, inputState) {
  state = inputState;
  root = document.getElementById("touch");
  if (!root) return;

  stick.el = root.querySelector("[data-stick]");
  stick.knob = root.querySelector("[data-knob]");

  // Scale the stick travel from the short edge, not from a fixed pixel count,
  // so the control is the same size relative to the thumb on a small phone
  // and on a tablet.
  const shortEdge = Math.min(window.innerWidth, window.innerHeight);
  stick.radius = clamp(shortEdge * 0.16, 44, 88);

  const moveZone = root.querySelector("[data-zone='move']");
  const lookZone = root.querySelector("[data-zone='look']");

  if (moveZone) {
    moveZone.addEventListener("pointerdown", onStickDown, { passive: false });
  }
  if (lookZone) {
    lookZone.addEventListener("pointerdown", onLookDown, { passive: false });
  }

  for (const el of root.querySelectorAll("[data-act]")) {
    buttons.set(el.dataset.act, el);
    el.addEventListener("pointerdown", onButtonDown, { passive: false });
    el.addEventListener("pointerup", onButtonUp);
    el.addEventListener("pointercancel", onButtonUp);
    el.addEventListener("lostpointercapture", onButtonUp);
  }

  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  // The canvas must never scroll, zoom or select under a drag.
  canvas.style.touchAction = "none";
  window.addEventListener("resize", () => {
    const edge = Math.min(window.innerWidth, window.innerHeight);
    stick.radius = clamp(edge * 0.16, 44, 88);
  });
}

export function applySettings(next) {
  settings = { ...settings, ...next };
}

/* -------------------------------------------------------------------------- *
 * Movement stick
 * -------------------------------------------------------------------------- */

function onStickDown(e) {
  if (stick.id !== null) return;
  e.preventDefault();

  stick.id = e.pointerId;
  stick.ox = e.clientX;
  stick.oy = e.clientY;
  stick.x = 0;
  stick.y = 0;
  fingers.set(e.pointerId, "stick");

  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* Capture is a nicety; the window-level move handler still works. */
  }

  if (stick.el) {
    // Place the ring under the thumb, in viewport coordinates.
    stick.el.style.left = `${e.clientX}px`;
    stick.el.style.top = `${e.clientY}px`;
    stick.el.classList.add("on");
  }
  paintStick();
}

function moveStick(e) {
  const dx = e.clientX - stick.ox;
  const dy = e.clientY - stick.oy;
  const dist = Math.hypot(dx, dy);

  if (dist > stick.radius) {
    /*
     * Drag the origin along once the thumb passes the edge.
     *
     * Clamping alone means a thumb that has travelled a long way has to
     * travel all the way back before the player stops walking. Moving the
     * origin keeps the control under the thumb wherever it has got to.
     */
    const k = (dist - stick.radius) / dist;
    stick.ox += dx * k;
    stick.oy += dy * k;
    if (stick.el) {
      stick.el.style.left = `${stick.ox}px`;
      stick.el.style.top = `${stick.oy}px`;
    }
  }

  stick.x = clamp((e.clientX - stick.ox) / stick.radius, -1, 1);
  stick.y = clamp((e.clientY - stick.oy) / stick.radius, -1, 1);
  paintStick();
}

function releaseStick() {
  stick.id = null;
  stick.x = 0;
  stick.y = 0;
  if (stick.el) stick.el.classList.remove("on");
  paintStick();
}

function paintStick() {
  if (!stick.knob) return;
  stick.knob.style.transform =
    `translate(-50%,-50%) translate(${stick.x * stick.radius * 0.62}px, ${
      stick.y * stick.radius * 0.62
    }px)`;
}

/* -------------------------------------------------------------------------- *
 * Look zone
 * -------------------------------------------------------------------------- */

function onLookDown(e) {
  if (look.id !== null) return;
  e.preventDefault();
  look.id = e.pointerId;
  look.lx = e.clientX;
  look.ly = e.clientY;
  fingers.set(e.pointerId, "look");
  if (state) state.looking = true;
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* As above. */
  }
}

function moveLook(e) {
  if (!state) return;
  const dx = e.clientX - look.lx;
  const dy = e.clientY - look.ly;
  look.lx = e.clientX;
  look.ly = e.clientY;

  /*
   * Touch look is tuned far more sensitive than the mouse, and is NOT
   * scaled by the mouse sensitivity setting.
   *
   * A thumb has perhaps 200 px of comfortable travel against a mouse's
   * unlimited desk, so the same radians-per-pixel would mean four swipes to
   * turn around. The settings menu exposes this separately.
   */
  const sens = PLAYER.lookSpeed * 2.6 * settings.sensitivity;
  state.look.x -= dx * sens;
  state.look.y += (settings.invertY ? dy : -dy) * sens;
}

/* -------------------------------------------------------------------------- *
 * Buttons
 * -------------------------------------------------------------------------- */

function onButtonDown(e) {
  if (!state) return;
  e.preventDefault();

  const el = e.currentTarget;
  const act = el.dataset.act;
  fingers.set(e.pointerId, `btn:${act}`);
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* As above. */
  }
  el.classList.add("on");

  switch (act) {
    case "interact":
      state.interactPressed = true;
      state.interactHeld = true;
      break;
    case "secondary":
      state.secondaryPressed = true;
      break;
    case "drop":
      state.dropPressed = true;
      break;
    case "crouch":
      state.crouch = !state.crouch;
      el.setAttribute("aria-pressed", String(state.crouch));
      break;
    case "sprint":
      state.sprint = !state.sprint;
      el.setAttribute("aria-pressed", String(state.sprint));
      break;
    case "pause":
      state.pausePressed = true;
      break;
    default:
      break;
  }

  // A short tick of haptic feedback on the actions that commit to something.
  if (act === "interact" || act === "drop") navigator.vibrate?.(12);
}

function onButtonUp(e) {
  const role = fingers.get(e.pointerId);
  if (!role?.startsWith("btn:")) return;
  fingers.delete(e.pointerId);

  const act = role.slice(4);
  buttons.get(act)?.classList.remove("on");
  // Crouch and sprint are latching on touch, so their visual state is the
  // aria-pressed attribute rather than the held class.
  if (act === "interact" && state) state.interactHeld = false;
}

/* -------------------------------------------------------------------------- *
 * Routing
 * -------------------------------------------------------------------------- */

function onPointerMove(e) {
  const role = fingers.get(e.pointerId);
  if (!role) return;
  if (role === "stick") {
    e.preventDefault();
    moveStick(e);
  } else if (role === "look") {
    e.preventDefault();
    moveLook(e);
  }
}

function onPointerUp(e) {
  const role = fingers.get(e.pointerId);
  if (!role) return;
  fingers.delete(e.pointerId);

  if (role === "stick") releaseStick();
  else if (role === "look") {
    look.id = null;
    if (state) state.looking = fingers.size > 0;
  } else if (role.startsWith("btn:")) onButtonUp(e);
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

/**
 * Fold the stick into the shared axes.
 *
 * The response curve has a flat spot at the centre and squares up toward the
 * edge: small corrections stay small on a control a thumb cannot place
 * precisely, while full speed is still reachable without hitting the rim.
 */
export function sample() {
  if (!state || stick.id === null) return;

  const curve = (v) => {
    const a = Math.abs(v);
    const dead = 0.12;
    if (a < dead) return 0;
    const n = (a - dead) / (1 - dead);
    return Math.sign(v) * (n * n * 0.55 + n * 0.45);
  };

  // Screen y is down, world forward is -y on the stick, hence the negation.
  state.move.x = curve(stick.x);
  state.move.y = -curve(stick.y);
}

export function release() {
  fingers.clear();
  releaseStick();
  look.id = null;
  for (const el of buttons.values()) el.classList.remove("on");
}

export function dispose() {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
  fingers.clear();
  buttons.clear();
  state = null;
  root = null;
}
