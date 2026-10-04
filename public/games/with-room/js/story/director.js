/**
 * The camera director.
 *
 * During gameplay the camera is the player's head and player/camera.js owns it.
 * During a cutscene it is a camera on a crane, and this owns it instead. They
 * are deliberately two different cameras rather than one camera in two modes:
 * the gameplay rig reads the controller every frame, and a cutscene that
 * borrowed it would be fighting the player's last mouse movement for control
 * of the shot.
 *
 * A cutscene is a list of SHOTS, and a shot is a move, not a position:
 *
 *   { pos, to, look, lookTo, fov, fovTo, dur, ease, shake, hold, space }
 *
 *   pos/to       camera position at the start and end of the shot. `to` may be
 *                omitted for a static shot.
 *   look/lookTo  what it is pointed at, start and end. Same rule.
 *   fov/fovTo    focal length, in the only unit three.js offers. A zoom.
 *   dur          seconds of movement. `hold` adds stillness after it.
 *   space        an Object3D to work INSIDE. Every vector in the shot is then
 *                local to it, so a shot can be framed on a car's interior
 *                while the car drives, with no per-frame arithmetic.
 *
 * Three things make this read as camerawork rather than as interpolation:
 *
 *   HANDHELD     a small amount of continuous noise on position and rotation,
 *                always, even in a locked-off shot. It is the single biggest
 *                difference between "cinematic" and "a tween". The frequency is
 *                low (around 0.4 Hz) because an operator's drift is slow; fast
 *                noise reads as a vibrating tripod.
 *   EASED ENDS   every shot uses a soft in and out by default, so the camera
 *                is never travelling at the instant of a cut.
 *   NO REPEATS   each shot names its own easing and its own noise weight, and
 *                the sequences in the scene files deliberately alternate - a
 *                slow push, then a static, then a drift. A cutscene where every
 *                shot is the same move is the most common way a hand-authored
 *                camera still reads as automatic.
 */

import * as THREE from "three";

import { WORLD } from "../core/config.js";
import { clamp01, damp, ease, lerp, noise1 } from "../core/maths.js";
import * as renderer from "../engine/renderer.js";

/* -------------------------------------------------------------------------- *
 * State
 * -------------------------------------------------------------------------- */

export let camera = null;

/** Where the camera is being driven from, in whatever space the shot uses. */
const _pos = new THREE.Vector3();
const _target = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _lookFrom = new THREE.Vector3();
const _lookTo = new THREE.Vector3();
const _world = new THREE.Vector3();
const _shakeOff = new THREE.Vector3();

let shots = [];
let index = -1;
let shot = null;
/** Seconds into the current shot, including its hold. */
let elapsed = 0;
let resolveAll = null;

/** Continuous handheld, independent of any shot. */
let handheld = 1;
let driftTime = 0;

/** Impulse shake, decaying. Same trauma model as the gameplay rig. */
let trauma = 0;

/** Camera-shake setting, 0..1.5, so the player's preference applies here too. */
let shakeScale = 1;

export const isPlaying = () => shot !== null;

/* -------------------------------------------------------------------------- *
 * Setup
 * -------------------------------------------------------------------------- */

export function build() {
  if (camera) return camera;
  camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    WORLD.near,
    WORLD.far,
  );
  // Cutscene cameras are aimed with lookAt, which wants the default order.
  camera.rotation.order = "YXZ";
  camera.name = "cutsceneCamera";
  return camera;
}

export function applySettings(settings) {
  shakeScale = settings?.cameraShake ?? 1;
}

export function resize() {
  if (!camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

/**
 * Point the renderer at a cutscene scene through this camera.
 *
 * The composer is reused rather than rebuilt: it is a chain of render targets
 * and a bloom mip pyramid, and rebuilding it for a cutscene would cost a
 * visible stall at the exact moment the screen is supposed to be cutting to
 * something.
 */
export function takeOver(scene) {
  build();
  renderer.setView(scene, camera);
  renderer.requestShadowUpdate();
}

/** Hand the renderer back to a scene and camera that are not ours. */
export function release(scene, gameCamera) {
  stop();
  renderer.setView(scene, gameCamera);
  renderer.requestShadowUpdate();
}

/* -------------------------------------------------------------------------- *
 * Playing
 * -------------------------------------------------------------------------- */

/**
 * Play a shot list. Resolves when the last shot's hold has elapsed.
 *
 * Interrupts whatever was playing: there is one camera, so there is one
 * sequence, and a queued second list would play to an empty room after the
 * scene that wanted it had been torn down.
 */
export function play(list) {
  stop();
  shots = (list ?? []).filter(Boolean);
  if (shots.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    resolveAll = resolve;
    index = -1;
    advance();
  });
}

/** Which shot of the current list is running, or -1. For tests and the HUD. */
export const shotIndex = () => (shot ? index : -1);

function advance() {
  index++;
  if (index >= shots.length) {
    const done = resolveAll;
    shot = null;
    shots = [];
    resolveAll = null;
    done?.();
    return;
  }

  shot = shots[index];
  elapsed = 0;

  /*
   * Re-parent for this shot.
   *
   * `camera.parent` is changed rather than the vectors being transformed,
   * because a shot inside a moving space has to keep tracking it every frame -
   * transforming once at the start would frame the shot on where the car was
   * when the cut happened.
   */
  const space = shot.space ?? null;
  if (space) {
    if (camera.parent !== space) space.add(camera);
  } else if (camera.parent) {
    camera.parent.remove(camera);
    // A camera with no parent is not in the scene graph, and three.js will
    // still render from it - but its world matrix stops being updated by the
    // scene's traversal, so it has to be updated by hand in `tick`.
  }

  _from.fromArray(shot.pos ?? [0, 1.6, 0]);
  _to.fromArray(shot.to ?? shot.pos ?? [0, 1.6, 0]);
  _lookFrom.fromArray(shot.look ?? [0, 1.6, -1]);
  _lookTo.fromArray(shot.lookTo ?? shot.look ?? [0, 1.6, -1]);

  handheld = shot.handheld ?? 1;
  if (shot.fov) {
    camera.fov = shot.fov;
    camera.updateProjectionMatrix();
  }
  if (shot.shake) addTrauma(shot.shake);
}

/** Abandon the sequence. Resolves anything awaiting it, so no caller hangs. */
export function stop() {
  const done = resolveAll;
  shot = null;
  shots = [];
  index = -1;
  resolveAll = null;
  done?.();
}

/** Skip to the end of the current shot. */
export function skipShot() {
  if (!shot) return;
  elapsed = (shot.dur ?? 1) + (shot.hold ?? 0);
}

export function addTrauma(amount) {
  trauma = Math.min(1.6, trauma + amount);
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  if (!camera) return;

  driftTime += dt;
  trauma = Math.max(0, trauma - dt * 1.15);

  if (shot) {
    const dur = Math.max(0.0001, shot.dur ?? 1);
    const k = clamp01(elapsed / dur);
    const eased = ease(shot.ease ?? "sineInOut")(k);

    _pos.lerpVectors(_from, _to, eased);
    _target.lerpVectors(_lookFrom, _lookTo, eased);

    if (shot.fovTo) {
      const f = lerp(shot.fov ?? camera.fov, shot.fovTo, eased);
      if (Math.abs(camera.fov - f) > 0.01) {
        camera.fov = f;
        camera.updateProjectionMatrix();
      }
    }

    camera.position.copy(_pos);

    /*
     * Aim before shaking, then shake the position only.
     *
     * Shaking the target as well makes the subject slide around inside the
     * frame, which reads as a camera that cannot find what it is looking at.
     * Shaking the camera and keeping the aim means the subject stays put and
     * the frame moves around it, which is what a real handheld shot does.
     */
    aim(_target);

    // --- handheld drift ---
    // Three different low frequencies so the drift never finds a rhythm, and
    // amplitudes in centimetres: this has to be felt rather than seen.
    const h = handheld * 0.016;
    _shakeOff.set(
      noise1(driftTime * 0.37) * h,
      noise1(driftTime * 0.29 + 11) * h * 0.7,
      noise1(driftTime * 0.21 + 23) * h * 0.5,
    );

    // --- impulse shake ---
    if (trauma > 0.001) {
      const s = trauma * trauma * 0.12 * shakeScale;
      _shakeOff.x += noise1(driftTime * 24.1) * s;
      _shakeOff.y += noise1(driftTime * 19.3 + 31) * s;
      _shakeOff.z += noise1(driftTime * 27.7 + 57) * s * 0.5;
      camera.rotation.z += noise1(driftTime * 17.9 + 7) * s * 0.5;
    }

    _shakeOff.applyQuaternion(camera.quaternion);
    camera.position.add(_shakeOff);

    elapsed += dt;
    if (elapsed >= dur + (shot.hold ?? 0)) advance();
  }

  /*
   * Keep the matrices current.
   *
   * An unparented camera is outside the scene graph, so nothing updates its
   * world matrix; a parented one is updated by its parent's traversal but not
   * before this frame's render if the parent was moved after it. Updating here
   * covers both, and costs one matrix multiply.
   */
  if (!camera.parent) camera.updateMatrixWorld(true);
}

/**
 * Point the camera at a target expressed in the shot's space.
 *
 * `lookAt` works in world space, so a shot inside a moving car has to convert
 * - and this is the conversion. Getting it wrong is subtle and horrible: the
 * camera tracks the right point while the car is at the origin and drifts off
 * it as the car drives away.
 */
function aim(localTarget) {
  if (camera.parent) {
    camera.parent.updateMatrixWorld(true);
    _world.copy(localTarget).applyMatrix4(camera.parent.matrixWorld);
    camera.lookAt(_world);
  } else {
    camera.lookAt(localTarget);
  }
}

/* -------------------------------------------------------------------------- *
 * Hand-driven camera
 *
 * For the two moments that are not a shot list: the wake-up, where the camera
 * is the character's head and has to be driven by an eyelid, and the ending,
 * where it pulls back under its own slow momentum. `set` puts it somewhere and
 * `damped` eases it there, both honouring the handheld drift above.
 * -------------------------------------------------------------------------- */

export function set(pos, target, { space = null, fov = null } = {}) {
  build();
  if (space && camera.parent !== space) space.add(camera);
  if (!space && camera.parent) camera.parent.remove(camera);

  shot = null;
  camera.position.fromArray(pos);
  _target.fromArray(target);
  aim(_target);
  if (fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true);
}

/** Ease toward a pose. Call every frame; `rate` is the usual damp constant. */
export function damped(pos, target, rate, dt) {
  build();
  camera.position.x = damp(camera.position.x, pos[0], rate, dt);
  camera.position.y = damp(camera.position.y, pos[1], rate, dt);
  camera.position.z = damp(camera.position.z, pos[2], rate, dt);
  _target.x = damp(_target.x, target[0], rate, dt);
  _target.y = damp(_target.y, target[1], rate, dt);
  _target.z = damp(_target.z, target[2], rate, dt);
  aim(_target);
  camera.updateMatrixWorld(true);
}
