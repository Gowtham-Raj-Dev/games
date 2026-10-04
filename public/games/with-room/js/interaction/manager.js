/**
 * Interaction: looking at things, picking them up, carrying them, using them.
 *
 * The raycast is deliberately narrow. It tests only objects that have been
 * registered as interactable, never the whole scene, because by room state 8
 * the scene contains thousands of meshes and a full-scene raycast every frame
 * is one of the few things in this game genuinely capable of costing a frame.
 *
 * Carrying uses a spring rather than parenting the object to the camera.
 * Parenting is simpler and looks wrong: the object becomes rigidly welded to
 * the view and reads as a UI element rather than as an object being held. A
 * critically-damped spring gives it mass - it lags when you turn, settles when
 * you stop, and knocks against things on the way past.
 */

import * as THREE from "three";

import { INTERACT } from "../core/config.js";
import { EV, emit } from "../core/bus.js";
import { get as getPlatform } from "../core/platform.js";
import { clamp, damp } from "../core/maths.js";
import { player } from "../player/controller.js";
import { camera, eyeRay } from "../player/camera.js";
import { input } from "../player/input/index.js";

/**
 * One registered interactable.
 *
 * `root` is what moves when carried; `hit` is what the raycast tests, which
 * is usually a simplified proxy rather than the detailed mesh - testing a
 * chair's forty slats to find out the player is looking at a chair is waste.
 */
const items = new Map();

const raycaster = new THREE.Raycaster();
/** Only test the layer interactables live on. */
raycaster.layers.set(1);

/* Scratch. */
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();
const _delta = new THREE.Vector3();
/** Separate from `_dir`, which the focus raycast owns. */
const _hold = new THREE.Vector3();
const _hitList = [];

/** The item currently under the crosshair, or null. */
let focused = null;
/** The item in the player's hands, or null. */
let carried = null;

const carryState = {
  velocity: new THREE.Vector3(),
  /** Extra rotation the player has applied while inspecting. */
  spin: new THREE.Euler(0, 0, 0, "YXZ"),
  /** Distance in front of the camera; the wheel moves it in and out. */
  distance: INTERACT.carryDistance,
};

/* -------------------------------------------------------------------------- *
 * Registration
 * -------------------------------------------------------------------------- */

/**
 * Make an object interactable.
 *
 * `opts.verb` is an i18n key shown in the prompt. `opts.onUse` is called when
 * the player presses the interact key on it and returns `true` if it handled
 * the press - returning false lets a carryable object fall through to being
 * picked up, so a switch mounted on a crate can be used without the crate
 * jumping into the player's hands.
 */
export function register(root, opts = {}) {
  const entry = {
    root,
    hit: opts.hit ?? root,
    verb: opts.verb ?? "inspect",
    carry: opts.carry ?? false,
    inspect: opts.inspect ?? false,
    mass: opts.mass ?? 1,
    onUse: opts.onUse ?? null,
    onFocus: opts.onFocus ?? null,
    enabled: opts.enabled ?? true,
    /** Collider the controller owns, disabled while the item is carried. */
    collider: opts.collider ?? null,
    /** Set while held, so the owner can tell. */
    held: false,
    name: opts.name ?? root.name ?? "object",
    data: opts.data ?? null,
  };

  // Layer 1 is the interaction layer. Putting the proxy on it rather than
  // filtering by name or userData keeps the raycast cost proportional to the
  // number of interactables rather than to the size of the scene.
  entry.hit.traverse((o) => o.layers.enable(1));

  items.set(root, entry);
  return entry;
}

export function unregister(root) {
  const entry = items.get(root);
  if (!entry) return;
  if (carried === entry) drop(false);
  if (focused === entry) setFocus(null);
  entry.hit.traverse((o) => o.layers.disable(1));
  items.delete(root);
}

export function clear() {
  carried = null;
  focused = null;
  items.clear();
}

/**
 * Every registered interactable.
 *
 * Exported for the debug handle, which is how a stage gets exercised without a
 * person aiming at it: the console can find "objClock" and press it. It is a
 * live view of the map rather than a copy, so nothing here can go stale.
 */
export const list = () => [...items.values()];

export const getFocused = () => focused;
export const getCarried = () => carried;
export const isCarrying = () => carried !== null;

/* -------------------------------------------------------------------------- *
 * Focus
 * -------------------------------------------------------------------------- */

function setFocus(entry) {
  if (focused === entry) return;
  focused?.onFocus?.(false);
  focused = entry;
  focused?.onFocus?.(true);

  emit(EV.FOCUS_CHANGED, {
    item: entry,
    verb: entry ? entry.verb : null,
    name: entry ? entry.name : null,
  });
}

/**
 * Is this object actually on screen?
 *
 * Walks the ancestry, because a puzzle hides itself by hiding its GROUP and the
 * meshes inside it keep `visible === true`.
 */
function isShown(object) {
  let node = object;
  while (node) {
    if (node.visible === false) return false;
    node = node.parent;
  }
  return true;
}

function updateFocus() {
  // Nothing to focus while carrying: the prompt should say "drop", not offer
  // to pick up whatever happens to be behind the thing already in hand.
  if (carried || player.locked) {
    setFocus(null);
    return;
  }

  eyeRay(_origin, _dir);
  raycaster.set(_origin, _dir);
  raycaster.far = getPlatform().touch ? INTERACT.touchRange : INTERACT.range;

  _hitList.length = 0;
  for (const entry of items.values()) {
    if (!entry.enabled || entry === carried) continue;
    // A hidden object is not interactable. Three's raycaster tests `layers`
    // but NOT `visible`, so without this every puzzle that is waiting for its
    // stage is still solid to the aim - and in a 4 m room that meant seven
    // invisible doors from stage nine standing in the middle of the floor.
    if (!isShown(entry.hit)) continue;
    _hitList.push(entry.hit);
  }
  if (_hitList.length === 0) {
    setFocus(null);
    return;
  }

  const hits = raycaster.intersectObjects(_hitList, true);
  if (hits.length === 0) {
    setFocus(null);
    return;
  }

  // Walk up from the hit mesh to whichever registered root owns it.
  let node = hits[0].object;
  while (node) {
    for (const entry of items.values()) {
      if (entry.hit === node || entry.root === node) {
        setFocus(entry);
        return;
      }
    }
    node = node.parent;
  }
  setFocus(null);
}

/* -------------------------------------------------------------------------- *
 * Carrying
 * -------------------------------------------------------------------------- */

export function pickUp(entry) {
  if (!entry || carried) return false;
  carried = entry;
  entry.held = true;

  carryState.velocity.set(0, 0, 0);
  carryState.spin.set(0, 0, 0);
  carryState.distance = INTERACT.carryDistance;

  // The carried object must stop colliding with its holder, or the spring
  // pushes the player backwards across the room.
  if (entry.collider) entry.collider.enabled = false;

  setFocus(null);
  emit(EV.PICKED_UP, { item: entry });
  return true;
}

export function drop(throwIt = false) {
  if (!carried) return;
  const entry = carried;
  carried = null;
  entry.held = false;
  if (entry.collider) entry.collider.enabled = true;

  emit(EV.DROPPED, {
    item: entry,
    thrown: throwIt,
    velocity: throwIt ? carryState.velocity.length() : 0,
  });
}

function updateCarry(dt) {
  if (!carried) return;

  // Hold point: in front of the camera, a little below the centre of view so
  // the object does not cover the thing the player is walking toward.
  _target
    .copy(camera.position)
    .addScaledVector(
      _hold.set(0, 0, -1).applyQuaternion(camera.quaternion),
      carryState.distance,
    );
  _target.y += INTERACT.carryHeight;

  const root = carried.root;
  _delta.copy(_target).sub(root.position);

  /*
   * Drop anything shoved too far from the hold point.
   *
   * This is what happens when a wall arrives during a shrink and the carried
   * object is pinned against it. Without the break the spring would either
   * force the object through the wall or fight it forever at full strength,
   * and the latter is audible as a hum in the physics.
   */
  if (_delta.lengthSq() > INTERACT.carryBreak * INTERACT.carryBreak) {
    drop(false);
    return;
  }

  // Critically-damped spring. Stiffness scaled down by mass, so a crate hangs
  // back and a key snaps to the hand.
  const massScale = 1 / Math.max(0.4, carried.mass);
  carryState.velocity.addScaledVector(
    _delta,
    INTERACT.carryStiffness * massScale * dt,
  );
  carryState.velocity.multiplyScalar(
    Math.max(0, 1 - INTERACT.carryDamping * dt),
  );
  root.position.addScaledVector(carryState.velocity, dt);

  // Face the player, plus whatever rotation they have dialled in.
  root.rotation.set(
    carryState.spin.x,
    player.yaw + carryState.spin.y,
    carryState.spin.z,
  );

  // Inspect rotation, from the mouse wheel or a two-finger drag.
  if (input.rotate.x !== 0 || input.rotate.y !== 0) {
    carryState.spin.x = clamp(
      carryState.spin.x + input.rotate.y * 6,
      -Math.PI,
      Math.PI,
    );
    carryState.spin.y += input.rotate.x * 6;
  }
}

/* -------------------------------------------------------------------------- *
 * Frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  updateFocus();
  updateCarry(dt);

  if (player.locked) return;

  // --- primary ---
  if (input.interactPressed) {
    if (carried) {
      // Pressing interact while holding something uses it on whatever is in
      // front, if anything wants it; otherwise it is a place-down.
      const handled = carried.onUse?.(carried, { carried: true }) === true;
      if (!handled) drop(false);
    } else if (focused) {
      const handled = focused.onUse?.(focused, { carried: false }) === true;
      if (!handled && focused.carry) pickUp(focused);
      emit(EV.USED, { item: focused, kind: "primary" });
    }
  }

  // --- secondary ---
  if (input.secondaryPressed) {
    if (carried) drop(true);
    else if (focused?.inspect) emit(EV.USED, { item: focused, kind: "inspect" });
  }

  if (input.dropPressed && carried) drop(false);
}

/** Smoothed hold distance, for the wheel-to-push-away gesture. */
export function pushCarried(delta, dt) {
  if (!carried) return;
  carryState.distance = damp(
    carryState.distance,
    clamp(carryState.distance + delta, 0.45, 1.4),
    12,
    dt,
  );
}
