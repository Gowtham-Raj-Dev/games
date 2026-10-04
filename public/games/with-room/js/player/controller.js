/**
 * First-person player controller.
 *
 * Movement is a capsule against axis-aligned boxes. That is unfashionably
 * simple and exactly right for this game: the world is a rectangular room
 * full of rectangular furniture, and a general-purpose mesh collider would
 * cost an order of magnitude more for no difference the player could see.
 *
 * The one genuinely interesting problem here is that the walls move. During
 * an expansion or a shrink the room's half-extents change every fixed step,
 * so the player can be outside the room through no fault of their own.
 * Clamping the position to the room every step - after integrating velocity,
 * not before - solves it and gives the shrink its best moment for free: the
 * walls physically shove the player toward the middle, and if they are stood
 * next to a prop they get pinned against it.
 */

import * as THREE from "three";

import { PLAYER } from "../core/config.js";
import { EV, emit } from "../core/bus.js";
import { clamp, clamp01, damp, lerp } from "../core/maths.js";
import { dims } from "../world/roomScale.js";
import { input } from "./input/index.js";

export const player = {
  /** Feet position. The camera sits `eye` above this. */
  position: new THREE.Vector3(0, 0, 1.2),
  velocity: new THREE.Vector3(),
  /** Yaw and pitch in radians. Yaw is unbounded; pitch is clamped. */
  yaw: 0,
  pitch: 0,

  onGround: true,
  crouching: false,
  sprinting: false,
  /** Current eye height, blended between standing and crouching. */
  eye: PLAYER.eyeHeight,

  /** Distance walked, used to phase the head bob and footsteps. */
  distance: 0,
  /** Horizontal speed, metres per second. Read by the camera and the audio. */
  speed: 0,

  /** Set while a cutscene or a room transition owns the player. */
  locked: false,
};

/** Solid boxes in the room: furniture, pillars, anything that blocks. */
const colliders = [];

/* Scratch, reused every step. Nothing in this file allocates after boot. */
const _wish = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _prev = new THREE.Vector3();

/** Footstep bookkeeping, so the audio fires on the stride and not on a timer. */
let stepPhase = 0;

/* -------------------------------------------------------------------------- *
 * Colliders
 * -------------------------------------------------------------------------- */

/**
 * Register a solid box, in world space.
 *
 * `box` is a THREE.Box3 the caller continues to own; if the prop moves, the
 * caller updates the box and collision follows with no re-registration. That
 * matters for a game where the furniture gets pushed around.
 */
export function addCollider(box, owner = null) {
  colliders.push({ box, owner, enabled: true });
  return colliders[colliders.length - 1];
}

export function removeCollider(entry) {
  const i = colliders.indexOf(entry);
  if (i >= 0) colliders.splice(i, 1);
}

export function clearColliders() {
  colliders.length = 0;
}

/* -------------------------------------------------------------------------- *
 * Look
 * -------------------------------------------------------------------------- */

/**
 * Apply accumulated look delta.
 *
 * Runs in the FRAME step rather than the fixed step. Look has no physics in
 * it, and sampling it at 60 Hz on a 144 Hz display is instantly noticeable
 * as a stutter in the one thing the player's hand is directly connected to.
 */
export function applyLook() {
  if (player.locked) return;
  if (input.look.x === 0 && input.look.y === 0) return;

  player.yaw += input.look.x;
  player.pitch = clamp(
    player.pitch + input.look.y,
    -PLAYER.pitchLimit,
    PLAYER.pitchLimit,
  );

  // Keep yaw bounded. Left unbounded it grows without limit over a long
  // session and eventually loses float precision, which shows up as the view
  // snapping in coarse steps.
  if (player.yaw > Math.PI) player.yaw -= Math.PI * 2;
  else if (player.yaw < -Math.PI) player.yaw += Math.PI * 2;
}

/* -------------------------------------------------------------------------- *
 * Fixed step
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  _prev.copy(player.position);

  updateStance(dt);
  updateVelocity(dt);
  integrate(dt);
  resolveRoom();
  resolveColliders();

  // Horizontal speed, for the camera bob and the audio.
  const dx = player.position.x - _prev.x;
  const dz = player.position.z - _prev.z;
  const moved = Math.hypot(dx, dz);
  player.speed = dt > 0 ? moved / dt : 0;
  player.distance += moved;

  updateFootsteps(moved);
}

function updateStance(dt) {
  const wantCrouch = input.crouch && !player.locked;

  /*
   * Refuse to stand if there is no headroom.
   *
   * Only reachable when the room is shrinking and the ceiling has come down
   * on top of a crouching player, which is exactly the moment it needs to be
   * right - standing up through the ceiling would break the one scene the
   * game is built around.
   */
  const headroom = dims.h - 0.12;
  const canStand = headroom > PLAYER.eyeHeight;
  player.crouching = wantCrouch || !canStand;

  const target = player.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
  player.eye = damp(player.eye, target, 1 / PLAYER.crouchTime, dt);

  player.sprinting =
    input.sprint && !player.crouching && !player.locked && input.move.y > 0.1;
}

function updateVelocity(dt) {
  const speed = player.crouching
    ? PLAYER.crouchSpeed
    : player.sprinting
      ? PLAYER.sprintSpeed
      : PLAYER.walkSpeed;

  if (player.locked) {
    _wish.set(0, 0, 0);
  } else {
    // Movement is relative to where the player is looking, flattened: looking
    // at the floor must not make W walk into it.
    _forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    _right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    _wish
      .copy(_forward)
      .multiplyScalar(input.move.y)
      .addScaledVector(_right, input.move.x);
    if (_wish.lengthSq() > 1) _wish.normalize();
    _wish.multiplyScalar(speed);
  }

  const control = player.onGround ? 1 : PLAYER.airControl;

  // Accelerate toward the wish velocity, decelerate toward zero when there
  // is none. Two different rates, because stopping should be crisper than
  // starting - it is what makes the character feel like it has feet.
  const rate = _wish.lengthSq() > 0.001 ? PLAYER.accel : PLAYER.damping;
  player.velocity.x = damp(player.velocity.x, _wish.x, rate * control, dt);
  player.velocity.z = damp(player.velocity.z, _wish.z, rate * control, dt);

  player.velocity.y += PLAYER.gravity * dt;
  // Terminal velocity, so a long fall cannot tunnel through the floor.
  if (player.velocity.y < -32) player.velocity.y = -32;
}

function integrate(dt) {
  player.position.addScaledVector(player.velocity, dt);

  if (player.position.y <= 0) {
    player.position.y = 0;
    player.velocity.y = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  const ceiling = dims.h - 0.1;
  if (player.position.y + player.eye > ceiling) {
    player.position.y = Math.max(0, ceiling - player.eye);
    if (player.velocity.y > 0) player.velocity.y = 0;
  }
}

/**
 * Keep the player inside the room.
 *
 * Reads the LIVE half-extents, which during a transition are somewhere
 * between two states. That is the whole trick: the same three lines that
 * stop the player walking through a wall also make a shrinking room push
 * them, with no special case for it anywhere.
 */
function resolveRoom() {
  const r = PLAYER.radius;
  const limX = Math.max(r, dims.hw - r);
  const limZ = Math.max(r, dims.hd - r);

  const p = player.position;
  if (p.x > limX) {
    p.x = limX;
    if (player.velocity.x > 0) player.velocity.x = 0;
  } else if (p.x < -limX) {
    p.x = -limX;
    if (player.velocity.x < 0) player.velocity.x = 0;
  }
  if (p.z > limZ) {
    p.z = limZ;
    if (player.velocity.z > 0) player.velocity.z = 0;
  } else if (p.z < -limZ) {
    p.z = -limZ;
    if (player.velocity.z < 0) player.velocity.z = 0;
  }
}

/**
 * Push the capsule out of any box it has entered.
 *
 * Resolves along the axis of least penetration, which for axis-aligned boxes
 * is both correct and cheap, and slides naturally along a wall rather than
 * stopping dead against it.
 */
function resolveColliders() {
  const r = PLAYER.radius;
  const p = player.position;
  const feet = p.y;
  const head = p.y + player.eye;

  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.enabled) continue;
    const b = c.box;

    // Vertical overlap first: it rejects most props in one comparison, and a
    // player can walk over a book without the horizontal maths ever running.
    if (b.max.y <= feet + 0.001 || b.min.y >= head) continue;

    // Step up onto anything low enough, instead of being blocked by it.
    if (b.max.y - feet <= PLAYER.stepHeight && player.onGround) {
      const insideX = p.x > b.min.x - r && p.x < b.max.x + r;
      const insideZ = p.z > b.min.z - r && p.z < b.max.z + r;
      if (insideX && insideZ) {
        p.y = b.max.y;
        player.velocity.y = Math.max(0, player.velocity.y);
        player.onGround = true;
      }
      continue;
    }

    const dx = p.x - clamp(p.x, b.min.x, b.max.x);
    const dz = p.z - clamp(p.z, b.min.z, b.max.z);
    if (dx * dx + dz * dz >= r * r) continue;

    // Inside. Work out how far out each axis is and take the cheaper exit.
    const pushMinX = b.min.x - r - p.x;
    const pushMaxX = b.max.x + r - p.x;
    const pushMinZ = b.min.z - r - p.z;
    const pushMaxZ = b.max.z + r - p.z;

    const bestX = Math.abs(pushMinX) < Math.abs(pushMaxX) ? pushMinX : pushMaxX;
    const bestZ = Math.abs(pushMinZ) < Math.abs(pushMaxZ) ? pushMinZ : pushMaxZ;

    if (Math.abs(bestX) < Math.abs(bestZ)) {
      p.x += bestX;
      player.velocity.x = 0;
    } else {
      p.z += bestZ;
      player.velocity.z = 0;
    }
  }
}

/* -------------------------------------------------------------------------- *
 * Footsteps
 * -------------------------------------------------------------------------- */

/**
 * Fire a footstep every stride, measured in distance rather than time.
 *
 * Timing footsteps to a clock desynchronises them from the walk the moment
 * the player changes speed, and the mismatch is uncanny even when nobody can
 * say why. Measuring distance keeps the sound locked to the legs.
 */
function updateFootsteps(moved) {
  if (!player.onGround || moved <= 0) return;

  const stride = player.crouching ? 0.55 : player.sprinting ? 0.95 : 0.78;
  stepPhase += moved;
  if (stepPhase < stride) return;
  stepPhase -= stride;

  emit(EV.USED, { kind: "footstep" });
  footstepListeners.forEach((fn) =>
    fn(player.crouching ? 0.35 : player.sprinting ? 1 : 0.7),
  );
}

const footstepListeners = new Set();
export function onFootstep(fn) {
  footstepListeners.add(fn);
  return () => footstepListeners.delete(fn);
}

/* -------------------------------------------------------------------------- *
 * Placement
 * -------------------------------------------------------------------------- */

export function teleport(x, y, z, yaw = player.yaw) {
  player.position.set(x, y, z);
  player.velocity.set(0, 0, 0);
  player.yaw = yaw;
  player.pitch = 0;
  stepPhase = 0;
}

/** Freeze the player for a cutscene or a transition, without losing their pose. */
export function setLocked(locked) {
  player.locked = locked;
  if (locked) player.velocity.set(0, 0, 0);
}

/**
 * Nudge the player toward the centre of the room.
 *
 * Used after a shrink: a player who was stood against a wall when the room
 * halved can end up wedged between the new wall and a prop. Rather than
 * writing a general unstick, the game just eases them toward the middle,
 * which is always free because that is where the room is.
 */
export function nudgeInward(dt, strength = 1) {
  const p = player.position;
  const margin = PLAYER.radius * 2.2;
  if (Math.abs(p.x) > dims.hw - margin) {
    p.x = lerp(p.x, 0, clamp01(dt * strength));
  }
  if (Math.abs(p.z) > dims.hd - margin) {
    p.z = lerp(p.z, 0, clamp01(dt * strength));
  }
}

export const serialise = () => ({
  x: player.position.x,
  y: player.position.y,
  z: player.position.z,
  yaw: player.yaw,
  pitch: player.pitch,
});

export function deserialise(data) {
  if (!data) return;
  teleport(data.x ?? 0, data.y ?? 0, data.z ?? 1.2, data.yaw ?? 0);
  player.pitch = clamp(data.pitch ?? 0, -PLAYER.pitchLimit, PLAYER.pitchLimit);
}
