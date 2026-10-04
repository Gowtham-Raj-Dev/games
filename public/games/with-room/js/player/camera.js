/**
 * The camera rig.
 *
 * Kept separate from the controller because they run at different rates and
 * for different reasons. The controller is simulation and runs at a fixed 60
 * Hz; the camera is presentation and runs once per rendered frame, so that on
 * a 144 Hz display the view is smooth even though the physics is not being
 * stepped any faster.
 *
 * Everything here is an offset applied on top of the player's actual position
 * and orientation. The rig never moves the player, which means a camera bug
 * can look wrong but can never push someone through a wall.
 */

import * as THREE from "three";

import { PLAYER, WORLD, DEFAULT_SETTINGS } from "../core/config.js";
import { clamp01, damp, lerp, noise1 } from "../core/maths.js";
import { player } from "./controller.js";

export let camera = null;

let settings = { ...DEFAULT_SETTINGS };

/** Bob phase, advanced by distance walked rather than by time. */
let bobPhase = 0;
/** Smoothed bob weight, so the bob fades in rather than switching on. */
let bobWeight = 0;

/** Trauma-based shake: a 0..1 value that decays, squared when applied. */
let trauma = 0;
let traumaTime = 0;
/** Shake requested directly by the room transition, in metres. */
let externalShake = 0;

/** Breathing offset. Rises with dread; always present at a low level. */
let breathPhase = 0;
let breathDepth = 0.0015;

let fovCurrent = PLAYER.fov;

const _offset = new THREE.Vector3();
/** Scratch for `eyeRay`, which the interaction raycast calls every frame. */
const _aim = new THREE.Euler(0, 0, 0, "YXZ");

export function build() {
  camera = new THREE.PerspectiveCamera(
    PLAYER.fov,
    window.innerWidth / window.innerHeight,
    WORLD.near,
    WORLD.far,
  );
  // Rotation is driven from yaw/pitch explicitly, in YXZ order. The default
  // XYZ order makes pitch and yaw interact and the view rolls as you look
  // around, which is the classic "my FPS camera is drunk" bug.
  camera.rotation.order = "YXZ";
  return camera;
}

export function applySettings(next) {
  settings = { ...settings, ...next };
  if (camera && settings.fov) {
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
  }
}

/* -------------------------------------------------------------------------- *
 * Shake
 * -------------------------------------------------------------------------- */

/**
 * Add trauma, 0..1. Decays on its own.
 *
 * Applied squared, which is the trick that makes a single system cover both
 * a footstep and a building collapsing: small values stay almost invisible
 * while large ones are violent, so callers can be generous without every
 * minor event rattling the screen.
 */
export function addTrauma(amount) {
  trauma = Math.min(1, trauma + amount);
}

/** Shake driven continuously by the room transition, in metres. */
export function setExternalShake(metres) {
  externalShake = metres;
}

/** Breathing depth, 0..1, from stability and from sprinting. */
export function setBreath(level) {
  breathDepth = lerp(0.0015, 0.012, clamp01(level));
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

export function tick(dt) {
  if (!camera) return;

  // --- base pose --------------------------------------------------------
  camera.position.set(
    player.position.x,
    player.position.y + player.eye,
    player.position.z,
  );
  camera.rotation.set(player.pitch, player.yaw, 0);

  _offset.set(0, 0, 0);

  // --- head bob ---------------------------------------------------------
  /*
   * Phase advances with distance walked, not with time.
   *
   * The two look identical at a constant speed and completely different the
   * moment the player accelerates: a time-driven bob keeps bobbing while
   * they stand still decelerating, which reads as the floor moving.
   */
  const walking = player.onGround && player.speed > 0.15;
  bobWeight = damp(bobWeight, walking ? 1 : 0, 8, dt);

  if (bobWeight > 0.001) {
    bobPhase += player.speed * dt * PLAYER.bobSpeed * 0.42;
    const amp =
      PLAYER.bobAmount *
      settings.headBob *
      bobWeight *
      (player.sprinting ? PLAYER.bobSprintScale : 1) *
      (player.crouching ? 0.5 : 1);

    // Vertical at twice the horizontal rate: one dip per footfall, one sway
    // per stride. Getting this ratio wrong is what makes a bob read as a
    // bounce rather than as walking.
    _offset.y += Math.sin(bobPhase * 2) * amp;
    _offset.x += Math.cos(bobPhase) * amp * 0.6;
    // A touch of roll sells it more than any amount of extra translation.
    camera.rotation.z += Math.cos(bobPhase) * amp * 0.5;
  }

  // --- breathing --------------------------------------------------------
  breathPhase += dt * lerp(0.9, 2.6, clamp01((breathDepth - 0.0015) / 0.0105));
  _offset.y += Math.sin(breathPhase) * breathDepth;

  // --- shake ------------------------------------------------------------
  trauma = Math.max(0, trauma - dt * 1.1);
  const shakeAmount =
    (trauma * trauma * 0.09 + externalShake) * settings.cameraShake;

  if (shakeAmount > 0.00005) {
    traumaTime += dt;
    // Three different noise rates so the motion never finds a rhythm the eye
    // can predict - a predictable shake stops reading as danger.
    _offset.x += noise1(traumaTime * 23.1) * shakeAmount;
    _offset.y += noise1(traumaTime * 19.7 + 31) * shakeAmount;
    _offset.z += noise1(traumaTime * 27.3 + 57) * shakeAmount * 0.5;
    camera.rotation.z += noise1(traumaTime * 17.3 + 11) * shakeAmount * 0.6;
    camera.rotation.x += noise1(traumaTime * 21.9 + 73) * shakeAmount * 0.35;
  }

  // Offsets are in view space: a shake has to move the camera relative to
  // where it is looking, or looking sideways turns a sway into a lurch.
  _offset.applyEuler(camera.rotation);
  camera.position.add(_offset);

  // --- field of view ----------------------------------------------------
  const targetFov =
    (settings.fov || PLAYER.fov) + (player.sprinting ? PLAYER.sprintFov : 0);
  if (Math.abs(fovCurrent - targetFov) > 0.01) {
    fovCurrent = damp(fovCurrent, targetFov, PLAYER.fovLerp, dt);
    camera.fov = fovCurrent;
    camera.updateProjectionMatrix();
  }
}

export function resize() {
  if (!camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

/** Where the player is actually looking from and toward, ignoring the shake. */
export function eyeRay(outOrigin, outDirection) {
  outOrigin.set(
    player.position.x,
    player.position.y + player.eye,
    player.position.z,
  );
  _aim.set(player.pitch, player.yaw, 0, "YXZ");
  outDirection.set(0, 0, -1).applyEuler(_aim);
  return outDirection;
}
