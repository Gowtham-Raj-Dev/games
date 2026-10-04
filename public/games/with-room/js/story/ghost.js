/**
 * The ghost, as it exists inside the room.
 *
 * characters/wraith.js is the figure - smoke, eyes, no face. This is the part
 * that decides WHERE and WHEN it is, which is the half that does the actual
 * frightening.
 *
 * Every rule here is about restraint, because an apparition that can be studied
 * stops working after the second time:
 *
 *   NEVER IN FRONT. It appears at the edge of vision or behind the player.
 *   `behind()` puts it at the player's back, where they can only find it by
 *   turning round - and by the time they have, it has gone.
 *   NEVER FOR LONG. A show is one to two seconds. The timer is in `showFor`,
 *   and nothing can extend it except an explicit second call.
 *   NEVER TWICE IN THE SAME PLACE. `lastSpot` is checked, so the player cannot
 *   learn a position and watch it.
 *   NEVER WHILE BEING WATCHED. `visibleToPlayer` is tested before a show is
 *   allowed in front of them: if the point is in frame, the apparition is
 *   refused and tried somewhere else. Something that materialises in plain
 *   sight is a special effect; something that is simply THERE when you turn
 *   round is a presence.
 */

import * as THREE from "three";

import { clamp01 } from "../core/maths.js";
import { audio } from "../audio/manager.js";
import * as wraithFactory from "../characters/wraith.js";
import * as controller from "../player/controller.js";
import * as roomScale from "../world/roomScale.js";

let wraith = null;
let showFor = 0;
let lastSpot = new THREE.Vector3();

const _spot = new THREE.Vector3();
const _toSpot = new THREE.Vector3();
const _facing = new THREE.Vector3();

export function init(scene) {
  if (wraith) return wraith;
  wraith = wraithFactory.build(scene, { seed: 1313 });
  return wraith;
}

export const exists = () => !!wraith;
export const presence = () => wraith?.presence ?? 0;

/* -------------------------------------------------------------------------- *
 * Visibility test
 * -------------------------------------------------------------------------- */

/**
 * Would the player see something appear at this point?
 *
 * A dot product against where they are facing, with a generous cone - 100
 * degrees rather than the camera's own field of view, because peripheral vision
 * notices MOVEMENT better than detail and an apparition at the edge of the
 * screen is the most noticeable thing there is.
 */
function visibleToPlayer(point) {
  const p = controller.player;
  _toSpot.set(point.x - p.position.x, 0, point.z - p.position.z);
  const dist = _toSpot.length();
  if (dist < 0.1) return true;
  _toSpot.divideScalar(dist);
  // The controller's yaw is the direction the player is looking, with -z
  // forward: the same convention camera.eyeRay uses.
  _facing.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  return _toSpot.dot(_facing) > -0.2;
}

/* -------------------------------------------------------------------------- *
 * Showing
 * -------------------------------------------------------------------------- */

/**
 * Appear at a spot in the room, for `seconds`.
 *
 * Returns false if the spot was refused - too close to the last one, or in
 * plain sight when it was asked to be unseen. The caller is expected to shrug
 * and try again later rather than to insist.
 */
export function showAt(x, z, { level = 0.7, seconds = 1.6, unseen = true } = {}) {
  if (!wraith) return false;
  _spot.set(x, 0, z);

  if (unseen && visibleToPlayer(_spot)) return false;
  // Two metres apart, minimum. Close enough to be the same corner, far enough
  // not to be the same silhouette.
  if (_spot.distanceTo(lastSpot) < 2) return false;

  lastSpot.copy(_spot);
  wraith.place(x, 0, z);
  wraith.appear(level);
  showFor = seconds;
  return true;
}

/**
 * Directly behind the player, close.
 *
 * The single most effective thing in this file, and the one with the strictest
 * rule attached: it is never followed by a sound in front of them. The player
 * turns round, finds nothing, and the game does not confirm or deny.
 */
export function behind({ level = 0.85, seconds = 1.3, distance = 1.5 } = {}) {
  if (!wraith) return false;
  const p = controller.player;
  // Behind is +z in the player's own frame, which is the opposite of the
  // forward vector above.
  const x = p.position.x + Math.sin(p.yaw) * distance;
  const z = p.position.z + Math.cos(p.yaw) * distance;

  const dims = roomScale.dims;
  // Inside the walls, or it appears in the concrete.
  if (Math.abs(x) > dims.hw - 0.4 || Math.abs(z) > dims.hd - 0.4) return false;

  lastSpot.set(x, 0, z);
  wraith.place(x, 0, z);
  wraith.appear(level);
  showFor = seconds;
  audio.play("ghostBreath", { gain: 0.8 });
  return true;
}

/** In a corner of the room, at a distance, barely there. */
export function inCorner({ level = 0.5, seconds = 2.2 } = {}) {
  const dims = roomScale.dims;
  const corners = [
    [-dims.hw + 0.6, -dims.hd + 0.6],
    [dims.hw - 0.6, -dims.hd + 0.6],
    [-dims.hw + 0.6, dims.hd - 0.6],
    [dims.hw - 0.6, dims.hd - 0.6],
  ];
  // Try them in a random order and take the first that is allowed, rather than
  // picking one and giving up: in a small room three of the four corners are
  // usually in frame.
  for (let i = corners.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [corners[i], corners[j]] = [corners[j], corners[i]];
  }
  for (const [x, z] of corners) {
    if (showAt(x, z, { level, seconds, unseen: true })) return true;
  }
  return false;
}

/**
 * In the mirror, and not in the room.
 *
 * Placed at the mirrored position of a point in front of the glass, so that a
 * player looking into the mirror sees a figure standing behind them - and a
 * player who turns round sees nothing, because it is on the far side of the
 * west wall and the wall is between them.
 *
 * It is the only apparition that is ALLOWED to be in plain sight, because the
 * place it is plainly in is not the room.
 */
export function inMirror({ seconds = 2.4 } = {}) {
  if (!wraith) return false;
  const dims = roomScale.dims;
  // Just outside the west wall: inside the mirror's modelled space.
  const x = -dims.hw - 0.9;
  const z = -dims.d * 0.2;
  lastSpot.set(x, 0, z);
  wraith.place(x, 0, z);
  wraith.appear(0.75);
  showFor = seconds;
  return true;
}

export function hide() {
  showFor = 0;
  wraith?.vanish();
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt, camera) {
  if (!wraith) return;

  if (showFor > 0) {
    showFor -= dt;
    if (showFor <= 0) wraith.vanish();
  }
  wraith.update(dt, camera);
}

export function dispose() {
  wraith?.dispose();
  wraith = null;
  showFor = 0;
}
