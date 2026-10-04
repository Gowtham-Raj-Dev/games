/**
 * The light rig.
 *
 * One practical light does nearly all the work: a bare bulb hanging from the
 * ceiling. That is a deliberate art decision - a single source gives hard,
 * legible shadows and strong falloff, which is what makes a small room feel
 * small, and it gives the game somewhere to go when the lights stutter.
 *
 * Everything else here exists to stop that one light from looking like a
 * tech demo: a very dim hemisphere so the shadow side is not pure black, an
 * environment map so rough metal and glass have something to reflect, and a
 * flicker driven by how badly the room is doing.
 */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { get as getPlatform } from "../core/platform.js";
import { WORLD, stabilityBand } from "../core/config.js";
import { clamp01, damp, lerp, noise1 } from "../core/maths.js";

let bulb = null;
let bulbMesh = null;
let hemi = null;
let fill = null;
let group = null;
let pmrem = null;
let envTexture = null;

/** Smoothed flicker multiplier, so a tier change does not pop the exposure. */
let flicker = 1;
let timeAccum = 0;

/** Base intensity before flicker, set when the room resizes. */
let baseIntensity = 9;
/** Tint the bulb drifts toward as stability falls. */
const _targetColor = new THREE.Color(0xffe9cf);
const _currentColor = new THREE.Color(0xffe9cf);

export function build(scene, renderer) {
  group = new THREE.Group();
  group.name = "lighting";

  const q = getPlatform().settings;

  /*
   * The bulb.
   *
   * Decay 2 is physically correct inverse-square falloff, and it is the
   * reason the corners of the first room go genuinely dark. Intensity is in
   * candela at that decay, so the numbers look large compared to the
   * decay-0 lighting most Three.js examples use.
   */
  bulb = new THREE.PointLight(0xffe9cf, baseIntensity, 0, 2);
  bulb.castShadow = q.shadows;
  if (q.shadows) {
    bulb.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    // A point light renders six shadow faces. Keeping the near plane sane and
    // the far plane tight to the room is what keeps that affordable.
    bulb.shadow.camera.near = 0.08;
    bulb.shadow.camera.far = 30;
    // Bias fights the acne that a single harsh light produces on the flat
    // walls; normalBias handles the curved props, where a flat bias peters.
    bulb.shadow.bias = -0.0012;
    bulb.shadow.normalBias = 0.025;
  }
  group.add(bulb);

  // The visible filament, so looking up shows a source rather than a glow
  // emanating from nothing.
  bulbMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff0d0, fog: false }),
  );
  group.add(bulbMesh);

  /*
   * Hemisphere fill at a very low intensity.
   *
   * Without it the unlit side of every object is mathematically black, which
   * reads as a hole rather than as shadow. With it at 0.25 there is just
   * enough bounce to describe a silhouette. Sky colour is cool and ground
   * colour warm, imitating light bouncing off a wooden floor.
   */
  hemi = new THREE.HemisphereLight(0x4a586a, 0x2e2a26, 0.5);
  group.add(hemi);

  // A soft directional fill from the opposite side of the bulb, with no
  // shadow, purely to keep the far corners from crushing out entirely.
  fill = new THREE.DirectionalLight(0x5a6472, 0.12);
  fill.position.set(-3, 4, -2);
  fill.castShadow = false;
  group.add(fill);

  scene.add(group);

  buildEnvironment(scene, renderer);
  return group;
}

/**
 * Bake a tiny environment map from Three's RoomEnvironment.
 *
 * Generated once, at a resolution from the tier table, and the throwaway
 * scene is torn down immediately. This is what gives metal and glass
 * something to reflect; without it every MeshStandardMaterial in a dark
 * interior reflects pure black and reads as matte plastic.
 */
function buildEnvironment(scene, renderer) {
  const q = getPlatform().settings;
  pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const env = new RoomEnvironment();
  const target = pmrem.fromScene(env, 0.04, 0.1, 40);
  envTexture = target.texture;

  env.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) m.dispose();
    }
  });

  scene.environment = envTexture;
  // Deliberately NOT set as scene.background: the room is sealed, and a
  // visible environment behind the walls would show through the doorway.
  scene.environmentIntensity = q.reflections ? 0.35 : 0.2;

  return envTexture;
}

/**
 * Re-apply the current quality tier to the live rig.
 *
 * Shadows were wired once at boot and never revisited, so choosing a lower
 * Quality in Settings could not actually turn off the single most expensive
 * thing in the renderer. The old shadow map is disposed rather than left
 * resident - at the top tier it is over a hundred megabytes of VRAM.
 */
export function applyQuality() {
  if (!bulb) return;
  const q = getPlatform().settings;

  bulb.castShadow = q.shadows;
  if (q.shadows) {
    if (bulb.shadow.mapSize.x !== q.shadowMapSize) {
      bulb.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      // Three only re-allocates when the existing target is gone.
      bulb.shadow.map?.dispose();
      bulb.shadow.map = null;
    }
  } else {
    bulb.shadow.map?.dispose();
    bulb.shadow.map = null;
  }
}

export const environment = () => envTexture;

/* -------------------------------------------------------------------------- *
 * Reacting to the room
 * -------------------------------------------------------------------------- */

/**
 * Re-place and re-scale the rig for a room size.
 *
 * Called every frame while the room is in motion. The bulb rises with the
 * ceiling and its intensity grows with the floor area, so a 250 m hall is not
 * lit to the same candela as a 4 m cell and left pitch dark at the edges.
 */
export function fitToRoom(dims) {
  if (!bulb) return;

  // Hangs a little below the ceiling, on a flex that gets longer in a bigger
  // room so the bulb never ends up at an unreachable height.
  const drop = Math.min(0.55 + dims.h * 0.08, 1.8);
  const y = dims.h - drop;
  bulb.position.set(0, y, 0);
  bulbMesh.position.copy(bulb.position);

  /*
   * Intensity tracks the square root of the area, not the area.
   *
   * Linear scaling blows out the small rooms or leaves the large ones black;
   * the square root keeps perceived brightness roughly constant, because
   * inverse-square falloff is already doing most of the work.
   */
  const span = Math.sqrt(dims.w * dims.d);
  /*
   * Tuned down hard from the first pass. A warm bulb at high intensity
   * through ACES turns every grey surface in the room orange - the concrete
   * read as sandstone. Lower intensity plus a less saturated bulb keeps the
   * warmth in the highlight and leaves the walls grey.
   */
  baseIntensity = 4.5 + span * 1.15;

  // The shadow camera only needs to cover the room, and a tight far plane is
  // the single biggest shadow-quality win available.
  if (bulb.shadow) {
    const far = Math.max(dims.w, dims.d, dims.h) * 1.3;
    if (Math.abs(bulb.shadow.camera.far - far) > 0.5) {
      bulb.shadow.camera.far = far;
      bulb.shadow.camera.updateProjectionMatrix();
    }
  }

  // Fog is rescaled with the room so the far wall is always just readable.
  // This is the main tool for making a 250 m space feel limitless without
  // actually rendering 250 m of detail.
  if (fill) fill.position.set(-dims.w * 0.3, dims.h * 0.8, -dims.d * 0.3);
}

/** Fog for the current room state, applied to the scene. */
export function fitFog(scene, state, dims) {
  if (!scene.fog) {
    scene.fog = new THREE.Fog(WORLD.fogColor, WORLD.fogNear, state.fogFar);
  }
  scene.fog.near = WORLD.fogNear;
  // Blend the authored per-state distance with the live dimensions, so fog
  // closes in smoothly during a shrink rather than snapping at the end.
  scene.fog.far = Math.max(4, Math.min(state.fogFar, Math.max(dims.w, dims.d) * 2.6));
}

/**
 * Per-frame flicker and tint.
 *
 * `stutter` comes from the room transition (0..1), `dread` from stability
 * (0..1). They drive the same light in different ways on purpose: a
 * transition makes the bulb stutter violently and briefly, while low
 * stability makes it sag, redden and buzz continuously. The player learns to
 * read the light before they learn to read the meter.
 */
export function tick(dt, { stutter = 0, dread = 0, stability = 100 } = {}) {
  if (!bulb) return;
  timeAccum += dt;

  let target = 1;

  if (stutter > 0) {
    // Fast, hard stutter. Two noise rates beat against each other so it never
    // settles into a readable rhythm.
    const n = noise1(timeAccum * 31) * 0.5 + noise1(timeAccum * 7.3) * 0.5;
    target *= 1 - stutter * 0.55 * (0.5 + n * 0.5);
    // Occasional full dropout, the moment that sells the room as failing.
    if (n < -0.72 && stutter > 0.5) target *= 0.12;
  }

  if (dread > 0) {
    // A slow sag plus a mains-frequency buzz. Subtle at first, unmissable low.
    const buzz = Math.sin(timeAccum * 46) * 0.5 + 0.5;
    target *= lerp(1, 0.62 - buzz * 0.08, dread);
  }

  // Damped so the bulb has thermal inertia rather than switching like an LED.
  flicker = damp(flicker, target, 26, dt);
  bulb.intensity = baseIntensity * flicker;
  bulbMesh.material.color.setRGB(flicker, flicker * 0.94, flicker * 0.82);

  // Tint toward the stability band's colour. Reaching for the HUD's own
  // palette means the light and the meter agree without being wired together.
  const band = stabilityBand(stability);
  _targetColor.set(0xffe9cf).lerp(new THREE.Color(band.tint), clamp01(dread * 0.55));
  _currentColor.lerp(_targetColor, clamp01(dt * 1.4));
  bulb.color.copy(_currentColor);

  if (hemi) hemi.intensity = 0.5 * lerp(1, 0.45, dread);
}

/** Switch the practical light off entirely, for the game-over blackout. */
export function setBlackout(amount) {
  if (!bulb) return;
  bulb.intensity = baseIntensity * flicker * (1 - clamp01(amount));
  if (hemi) hemi.intensity = 0.25 * (1 - clamp01(amount));
}

export const bulbPosition = () => bulb?.position ?? null;

export function dispose() {
  bulbMesh?.geometry.dispose();
  bulbMesh?.material.dispose();
  envTexture?.dispose();
  pmrem?.dispose();
  bulb = bulbMesh = hemi = fill = group = pmrem = envTexture = null;
}
