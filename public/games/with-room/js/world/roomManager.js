/**
 * RoomManager - owns the scene graph for the room itself.
 *
 * Its whole job is to keep the geometry agreeing with `roomScale.dims`, which
 * changes every frame while the room is in motion. It builds nothing per
 * frame: the shell modules are allocated once at the largest room state and
 * repositioned, and only a change of room STATE (not of dimensions) triggers
 * new materials.
 *
 * The one subtle decision in here is the floor extent during a transition.
 * The floor is always sized to the LARGER of the two states, never to the
 * live dimensions. Growing, that means there is already floor out there for
 * the walls to uncover as they travel; shrinking, it means the floor the
 * walls are crossing still exists under them until they arrive. Sizing the
 * floor to the live dimensions instead - which was the first attempt - makes
 * the walls slide across a void, and the illusion dies instantly.
 */

import * as THREE from "three";

import { EV, on } from "../core/bus.js";
import { get as getPlatform } from "../core/platform.js";
import { EXPANSION, SHRINK, WORLD } from "../core/config.js";
import { clamp01, lerp, makeRng } from "../core/maths.js";
import * as materials from "../engine/materials.js";
import * as lighting from "../engine/lighting.js";
import * as textures from "../engine/textures.js";
import * as roomScale from "./roomScale.js";
import * as shellModule from "./modules/shell.js";

export let scene = null;
let shell = null;
let shellMats = null;
let dust = null;

/** Floor/ceiling extent, held at the larger state through a transition. */
const extent = { w: 0, d: 0 };

/** Group every prop and puzzle object is parented to. Survives a resize. */
export let contents = null;

/* -------------------------------------------------------------------------- *
 * Build
 * -------------------------------------------------------------------------- */

export function build(renderer) {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(WORLD.fogColor, WORLD.fogNear, 20);
  scene.background = new THREE.Color(WORLD.fogColor);

  lighting.build(scene, renderer);
  materials.setEnvironment(lighting.environment());

  const state = roomScale.state();
  shellMats = materials.buildShell(state);
  shell = shellModule.build(shellMats);
  scene.add(shell.group);

  contents = new THREE.Group();
  contents.name = "contents";
  scene.add(contents);

  dust = buildDust();
  scene.add(dust.points);

  extent.w = roomScale.dims.w;
  extent.d = roomScale.dims.d;
  applyLayout();

  wireEvents();
  return scene;
}

function wireEvents() {
  /*
   * Materials swap at the START of a transition, together with the index.
   *
   * Chapter 1's bare concrete becomes chapter 2's plaster and floorboards.
   * Doing it at the start means the newly revealed floor is already the new
   * chapter's material as the walls uncover it, which reads as the room
   * becoming a different place rather than re-skinning after the fact.
   */
  on(EV.ROOM_WILL_CHANGE, ({ from, to, kind }) => {
    extent.w = Math.max(from.w, to.w);
    extent.d = Math.max(from.d, to.d);

    shellMats = materials.buildShell(to);
    shellModule.setMaterials(shell, shellMats);

    const cfg = kind === "expand" ? EXPANSION : SHRINK;
    armDust(cfg.dust, cfg.anticipation, cfg.duration, kind);
  });

  on(EV.ROOM_CHANGED, ({ state }) => {
    // The transition is over: the floor can shrink back to the real room.
    extent.w = state.w;
    extent.d = state.d;
    applyLayout();
  });
}

/* -------------------------------------------------------------------------- *
 * Per-frame
 * -------------------------------------------------------------------------- */

function applyLayout() {
  const dims = roomScale.dims;

  shellModule.layout(shell, dims, roomScale.stateId());

  // Floor and ceiling use the held extent, not the live dimensions.
  shell.floor.scale.set(extent.w, extent.d, 1);
  shell.ceiling.scale.set(extent.w, extent.d, 1);
  shell.ceiling.position.y = dims.h;

  lighting.fitToRoom(dims);
  lighting.fitFog(scene, roomScale.state(), dims);
}

/** Fixed-step update. Only does work while the room is actually moving. */
export function tick(dt) {
  if (roomScale.isTransitioning()) applyLayout();
  tickDust(dt);
}

/* -------------------------------------------------------------------------- *
 * Dust
 *
 * Motes shaken loose by the walls moving. They are the main reason an
 * expansion reads as a physical event rather than a camera move: something
 * has to fall when a building shifts.
 *
 * Implemented as one Points system with flat typed arrays and a ring-buffer
 * cursor. Nothing is allocated after build, and dead particles are simply
 * not drawn rather than being removed from an array.
 * -------------------------------------------------------------------------- */

function buildDust() {
  const max = getPlatform().settings.particles;
  const positions = new Float32Array(max * 3);
  const velocities = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const maxLife = new Float32Array(max);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  // The shader moves vertices around the camera, so the CPU-side bounds are
  // meaningless and culling against them would pop the whole system out.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

  const mat = new THREE.PointsMaterial({
    map: textures.glowSprite(),
    color: 0xcfc8b8,
    size: 0.03,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.NormalBlending,
    fog: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = "dust";

  return {
    points,
    geo,
    mat,
    positions,
    velocities,
    life,
    maxLife,
    max,
    cursor: 0,
    alive: 0,
    /** Seconds of emission remaining, and the rate while it lasts. */
    emitFor: 0,
    emitDelay: 0,
    rate: 0,
    carry: 0,
    rng: makeRng(2027),
    opacity: 0,
  };
}

/** Schedule an emission burst for a transition. */
function armDust(count, delay, duration, kind) {
  if (!dust) return;
  const scale = getPlatform().settings.particles / 1000;
  dust.emitDelay = delay * 0.6; // starts during the anticipation tremor
  dust.emitFor = duration;
  dust.rate = (count * Math.max(0.25, scale)) / duration;
  dust.kind = kind;
}

function spawnMote() {
  const d = dust;
  const i = d.cursor;
  d.cursor = (d.cursor + 1) % d.max;

  const dims = roomScale.dims;
  const r = d.rng;

  /*
   * Spawn along the walls and the ceiling edge, not uniformly in the volume.
   *
   * Dust falls off the surfaces that are moving. Filling the room evenly
   * looks like weather; emitting from the edges looks like the building
   * shedding itself, which is the point.
   */
  const edge = r();
  let x;
  let z;
  if (edge < 0.5) {
    x = (r() - 0.5) * dims.w;
    z = (r() < 0.5 ? -1 : 1) * dims.hd * (0.86 + r() * 0.14);
  } else {
    x = (r() < 0.5 ? -1 : 1) * dims.hw * (0.86 + r() * 0.14);
    z = (r() - 0.5) * dims.d;
  }
  const y = dims.h * (0.35 + r() * 0.63);

  const p = i * 3;
  d.positions[p] = x;
  d.positions[p + 1] = y;
  d.positions[p + 2] = z;

  // Mostly falling, with a small drift inward or outward depending on which
  // way the walls are going, so the motes read as being pushed by the air.
  const push = d.kind === "expand" ? -0.22 : 0.3;
  d.velocities[p] = (r() - 0.5) * 0.18 + Math.sign(x) * push * r();
  d.velocities[p + 1] = -0.12 - r() * 0.3;
  d.velocities[p + 2] = (r() - 0.5) * 0.18 + Math.sign(z) * push * r();

  d.maxLife[i] = 3.5 + r() * 4.5;
  d.life[i] = d.maxLife[i];
}

function tickDust(dt) {
  const d = dust;
  if (!d) return;

  // --- emission ---
  if (d.emitDelay > 0) {
    d.emitDelay -= dt;
  } else if (d.emitFor > 0) {
    d.emitFor -= dt;
    d.carry += d.rate * dt;
    let n = Math.floor(d.carry);
    d.carry -= n;
    // Hard cap per frame: a long stall must not dump a thousand motes at once.
    if (n > 24) n = 24;
    for (let k = 0; k < n; k++) spawnMote();
  }

  // --- integrate ---
  let alive = 0;
  const pos = d.positions;
  const vel = d.velocities;
  for (let i = 0; i < d.max; i++) {
    if (d.life[i] <= 0) continue;
    d.life[i] -= dt;
    const p = i * 3;
    if (d.life[i] <= 0) {
      // Park dead motes far below the floor rather than compacting the array.
      pos[p + 1] = -1000;
      continue;
    }
    // Air drag, so motes slow into a hang rather than falling like gravel.
    vel[p] *= 1 - 1.1 * dt;
    vel[p + 1] = Math.max(vel[p + 1] - 0.08 * dt, -0.42);
    vel[p + 2] *= 1 - 1.1 * dt;
    pos[p] += vel[p] * dt;
    pos[p + 1] += vel[p + 1] * dt;
    pos[p + 2] += vel[p + 2] * dt;
    if (pos[p + 1] < 0.01) {
      pos[p + 1] = -1000;
      d.life[i] = 0;
      continue;
    }
    alive++;
  }
  d.alive = alive;

  // Fade the whole system in and out rather than per-particle alpha, which
  // would need a custom shader for a result nobody would be able to see.
  const want = alive > 0 ? 0.5 : 0;
  d.opacity = lerp(d.opacity, want, clamp01(dt * 2.5));
  d.mat.opacity = d.opacity;
  d.points.visible = d.opacity > 0.01;

  if (alive > 0 || d.opacity > 0.01) {
    d.geo.attributes.position.needsUpdate = true;
  }
}

/** Shake a burst of dust loose outside a transition - a footfall, an impact. */
export function puff(count = 12) {
  if (!dust) return;
  for (let i = 0; i < Math.min(count, 24); i++) spawnMote();
}

/* -------------------------------------------------------------------------- *
 * Teardown
 * -------------------------------------------------------------------------- */

export function dispose() {
  if (shell) shellModule.dispose(shell);
  if (dust) {
    dust.geo.dispose();
    dust.mat.dispose();
  }
  lighting.dispose();
  materials.disposeAll();
  textures.disposeAll();
  scene = null;
  shell = null;
  dust = null;
  contents = null;
}
