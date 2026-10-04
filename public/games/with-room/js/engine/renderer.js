/**
 * Renderer, post-processing chain and the adaptive resolution scaler.
 *
 * The adaptive scaler at the bottom of this file is the main reason the game
 * stays responsive on hardware nobody tested it on. The quality tier picked at
 * boot is a guess; this corrects it continuously by measuring real frame times
 * and trading resolution - and only resolution - for frame rate. Quality
 * settings are never touched at runtime, because a shadow map that switches
 * off mid-room is far more noticeable than a slightly softer image.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { VignetteShader } from "three/addons/shaders/VignetteShader.js";

import { get as getPlatform } from "../core/platform.js";
import { stats } from "../core/loop.js";
import * as textures from "./textures.js";

export let renderer = null;
export let composer = null;

let renderPass = null;
let bloomPass = null;
let vignettePass = null;
let fxaaPass = null;
let smaaPass = null;

let scene = null;
let camera = null;

/** 0.6..1 multiplier on the tier's pixel ratio, owned by the scaler below. */
let perfScale = 1;

/* -------------------------------------------------------------------------- *
 * Setup
 * -------------------------------------------------------------------------- */

export function init(canvas) {
  const q = getPlatform().settings;

  renderer = new THREE.WebGLRenderer({
    canvas,
    // MSAA is requested on the composer's render target instead, because the
    // scene is rendered offscreen and canvas antialiasing would be thrown away.
    antialias: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: true,
  });

  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  // ACES is what makes the single bare bulb in the first room look like a
  // photograph rather than a blown-out white disc.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  renderer.shadowMap.enabled = q.shadows;
  /*
   * The shadow map is NOT re-rendered every frame.
   *
   * A PointLight renders six cube faces, each re-drawing every caster in the
   * room. Nothing in this game moves most of the time - the walls are still,
   * the furniture is still, and the player casts nothing (the hand viewmodel
   * is explicitly castShadow:false). Re-rendering six faces at 60 Hz to
   * produce an identical result was by a wide margin the largest GPU cost in
   * the game.
   *
   * Instead the map is refreshed only when something that casts has actually
   * moved: see requestShadowUpdate() and its callers.
   */
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = q.shadows;
  // VSM is softer and handles the single-light interior better than PCF, but
  // it bleeds through thin geometry; PCFSoft is the safer choice for a room
  // whose walls are 10 cm thick.
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  textures.init(renderer);
  return renderer;
}

/** The tier's pixel-ratio cap, scaled by the adaptive scaler. */
function pixelRatio() {
  const q = getPlatform().settings;
  return Math.min(window.devicePixelRatio || 1, q.pixelRatio) * perfScale;
}

/**
 * Build the post chain.
 *
 * Called once at boot and again only if the player changes quality. Every
 * pass is disposed before being replaced: the sibling game in this repo leaks
 * a bloom pass's five mip render targets on every rebuild, and this is where
 * that bug would otherwise be reproduced.
 */
export function buildComposer(newScene, newCamera) {
  scene = newScene;
  camera = newCamera;

  const q = getPlatform().settings;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pr = pixelRatio();

  disposeComposer();

  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);

  /*
   * A half-float target keeps highlights above 1.0 intact so that bloom has
   * something to find and so ACES has headroom to roll off. An 8-bit target
   * clips the bulb to white before the tone mapper ever sees it, which is the
   * usual reason a Three.js interior looks flat.
   */
  const target = new THREE.WebGLRenderTarget(
    Math.round(w * pr),
    Math.round(h * pr),
    {
      type: THREE.HalfFloatType,
      samples: q.antialias === "smaa" || q.antialias === "none" ? 0 : 4,
    },
  );

  composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);

  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  if (q.bloom) {
    // Threshold is high and strength low on purpose. This is a dark game lit
    // by one or two practical lights; bloom is here to bleed the bulb and the
    // cube's seams, not to haze the whole image.
    bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.62, 0.86);
    composer.addPass(bloomPass);
  }

  if (q.antialias === "smaa") {
    smaaPass = new SMAAPass(w * pr, h * pr);
    composer.addPass(smaaPass);
  } else if (q.antialias === "fxaa") {
    fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    composer.addPass(fxaaPass);
  }

  // A heavy vignette is most of the claustrophobia. It is driven at runtime
  // from room size and stability: tighter when the room is small or failing.
  vignettePass = new ShaderPass(VignetteShader);
  vignettePass.uniforms.offset.value = 1.05;
  vignettePass.uniforms.darkness.value = 1.25;
  composer.addPass(vignettePass);

  composer.addPass(new OutputPass());
}

/** Point the existing chain at a different scene or camera, cheaply. */
/** Whatever is on screen right now. For the debug handle and the test harness. */
export const currentView = () => ({ scene, camera });

export function setView(newScene, newCamera) {
  scene = newScene;
  camera = newCamera;
  if (renderPass) {
    renderPass.scene = newScene;
    renderPass.camera = newCamera;
  }
}

/**
 * Drive the vignette from gameplay.
 *
 * `tight` 0..1 closes the aperture; `dark` 0..1 deepens it. The room shrinking
 * and stability falling both push these up, so the frame physically closes in
 * on the player as they lose.
 */
export function setVignette(tight, dark) {
  if (!vignettePass) return;
  vignettePass.uniforms.offset.value = 1.15 - tight * 0.55;
  vignettePass.uniforms.darkness.value = 1.0 + dark * 0.9;
}

/**
 * Re-render the shadow map on the next frame.
 *
 * Cheap to call redundantly - it only sets a flag, and Three clears it after
 * one render. Call it whenever a shadow caster moves: during a room
 * transition, while an object is being carried, when a light is switched.
 */
export function requestShadowUpdate() {
  if (renderer) renderer.shadowMap.needsUpdate = true;
}

/** Re-apply the current tier's shadow settings to a live renderer. */
export function applyShadowSettings() {
  if (!renderer) return;
  const q = getPlatform().settings;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.needsUpdate = q.shadows;
}

export function setExposure(value) {
  if (renderer) renderer.toneMappingExposure = value;
}

/* -------------------------------------------------------------------------- *
 * Resize
 * -------------------------------------------------------------------------- */

export function resize() {
  if (!renderer || !composer) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  // Re-read the device pixel ratio every time: dragging a window between a
  // laptop panel and an external monitor changes it, and a renderer that
  // never re-reads it stays blurry (or wastes half the GPU) until reload.
  const pr = pixelRatio();

  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);

  if (camera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if (fxaaPass) {
    fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }
  if (smaaPass) smaaPass.setSize(w * pr, h * pr);
  if (bloomPass) bloomPass.setSize(w, h);
}

/** Debounced resize, because a window drag fires this continuously. */
export function installResizeHandler() {
  let timer = 0;
  const onResize = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(resize, 120);
  };
  window.addEventListener("resize", onResize);
  // Orientation changes report the old size for a frame or two on iOS.
  window.addEventListener("orientationchange", () =>
    window.setTimeout(resize, 350),
  );
}

/* -------------------------------------------------------------------------- *
 * Adaptive resolution
 *
 * Measured over windows, not frames, with asymmetric hysteresis: drop fast so
 * a struggling device recovers quickly, climb slowly so it does not oscillate.
 * The dead band between the two thresholds is what stops it hunting.
 * -------------------------------------------------------------------------- */

const SCALER = {
  /** Seconds of samples before a decision. Long enough to ignore one bad frame. */
  window: 2.5,
  /** Below this frame rate, drop resolution. */
  dropBelow: 46,
  /** Above this, try to climb back. Gap from dropBelow is the dead band. */
  riseAbove: 58,
  dropStep: 0.12,
  riseStep: 0.05,
  /** A frame this long is a tab switch or a GC pause, not a slow frame. */
  outlierMs: 450,
};

let windowTime = 0;
let windowFrames = 0;
let windowMs = 0;
let scalerEnabled = true;

export function setAdaptiveEnabled(on) {
  scalerEnabled = on;
  if (!on && perfScale !== 1) {
    perfScale = 1;
    resize();
  }
}

export const getScale = () => perfScale;

/**
 * Feed one frame to the scaler. Called from the frame loop with the raw,
 * unclamped delta - the scaler needs the truth, not the simulation's
 * sanitised version.
 */
export function sampleFrame(rawMs) {
  if (!scalerEnabled || !composer) return;

  // Discard the entire window if it contains a stall. Reacting to one would
  // drop the resolution every time the player alt-tabs back in.
  if (rawMs > SCALER.outlierMs) {
    windowTime = windowFrames = windowMs = 0;
    return;
  }

  windowMs += rawMs;
  windowFrames++;
  windowTime += rawMs / 1000;
  if (windowTime < SCALER.window) return;

  const avgFps = 1000 / (windowMs / windowFrames);
  windowTime = windowFrames = windowMs = 0;

  const q = getPlatform().settings;
  let next = perfScale;

  if (avgFps < SCALER.dropBelow && perfScale > q.minScale) {
    next = Math.max(q.minScale, perfScale - SCALER.dropStep);
  } else if (avgFps > SCALER.riseAbove && perfScale < 1) {
    next = Math.min(1, perfScale + SCALER.riseStep);
  } else {
    return;
  }

  perfScale = next;
  const pr = pixelRatio();
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  composer.setSize(window.innerWidth, window.innerHeight);
  if (fxaaPass) {
    fxaaPass.material.uniforms.resolution.value.set(
      1 / (window.innerWidth * pr),
      1 / (window.innerHeight * pr),
    );
  }
}

/* -------------------------------------------------------------------------- *
 * Render
 * -------------------------------------------------------------------------- */

export function render(dt) {
  if (!composer) return;
  composer.render(dt);
}

/**
 * Compile every shader in the scene before the first frame is shown.
 *
 * Without this the first second of gameplay is a series of multi-hundred
 * millisecond stalls as each new material is compiled on first sight - which
 * the player experiences as the game hanging exactly when they start playing.
 * Doing it behind the loading screen costs nothing they can see.
 */
export function precompile(targetScene, targetCamera) {
  renderer.compile(targetScene, targetCamera);
}

function disposeComposer() {
  if (!composer) return;
  for (const pass of composer.passes) pass.dispose?.();
  composer.renderTarget1?.dispose();
  composer.renderTarget2?.dispose();
  composer = null;
  renderPass = bloomPass = vignettePass = fxaaPass = smaaPass = null;
}

export function dispose() {
  disposeComposer();
  renderer?.dispose();
  renderer = null;
}

/** Report, for the debug overlay. */
export function info() {
  if (!renderer) return null;
  const r = renderer.info;
  return {
    calls: r.render.calls,
    triangles: r.render.triangles,
    geometries: r.memory.geometries,
    textures: r.memory.textures,
    scale: perfScale,
    fps: Math.round(stats.fps),
  };
}
