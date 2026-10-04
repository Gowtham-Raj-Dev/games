/**
 * Device probe and quality tiers.
 *
 * The brief asks for three separate experiences - browser, mobile, desktop -
 * and this is where that split is decided, once, at boot. Everything
 * downstream asks this module rather than sniffing the user agent again.
 *
 * Two independent axes are deliberately kept apart:
 *
 *   INPUT   does this device have a pointer to lock, or thumbs?  -> `touch`
 *   POWER   how much GPU can we spend per frame?                 -> `tier`
 *
 * They are not the same question. An iPad Pro is touch and fast; a cheap
 * Windows laptop with integrated graphics is mouse and slow. Conflating them
 * is why so many web games either waste a tablet's GPU or melt a netbook.
 */

export const TIER = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  ULTRA: "ultra",
};

/** Resolved once at boot by `detect()`. */
let platform = null;

/* -------------------------------------------------------------------------- *
 * Probes
 * -------------------------------------------------------------------------- */

/**
 * Touch is detected by capability, not by user agent string.
 *
 * `pointer: coarse` is the honest question - "is the primary pointer
 * imprecise" - and it stays correct on a Surface used as a tablet, where a
 * user-agent check gets it wrong in both directions.
 */
function detectTouch() {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const noHover = window.matchMedia?.("(hover: none)").matches ?? false;
  const hasTouch = navigator.maxTouchPoints > 0;
  return hasTouch && (coarse || noHover);
}

/**
 * Read the GPU string through the debug extension.
 *
 * Browsers increasingly mask this (Safari returns "Apple GPU" for everything),
 * so it is used only as a tie-breaker, never as the primary signal.
 */
function probeGpu(gl) {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "";
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
  } catch {
    return "";
  }
}

/**
 * Score the device and pick a tier.
 *
 * Scoring beats a lookup table of device names: the table is out of date the
 * day it ships, and this degrades sensibly on hardware nobody tested. The
 * adaptive resolution scaler in the renderer corrects the rest at runtime, so
 * an occasional wrong guess here costs a second of blur, not a broken game.
 */
function scoreDevice(gl, touch) {
  let score = 50;

  // Core count is the single most reliable proxy available to a web page.
  const cores = navigator.hardwareConcurrency || 4;
  score += Math.min(cores, 16) * 3;

  // Only Chromium reports this, and it is clamped to 8 for privacy. Still the
  // best memory signal there is.
  const mem = navigator.deviceMemory;
  if (mem) score += Math.min(mem, 8) * 4;

  // A phone doing the same work as a laptop does it inside a thermal budget
  // and on a battery. Start it lower on purpose.
  if (touch) score -= 28;

  if (gl) {
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
    if (maxTex >= 16384) score += 14;
    else if (maxTex >= 8192) score += 8;
    else if (maxTex < 4096) score -= 20;

    // Float render targets gate most of the post-processing stack.
    if (gl.getExtension("EXT_color_buffer_float")) score += 6;
    // Anisotropic filtering keeps floors from turning to mush at a distance.
    if (gl.getExtension("EXT_texture_filter_anisotropic")) score += 4;

    const gpu = probeGpu(gl).toLowerCase();
    if (/rtx|radeon rx|arc a/.test(gpu)) score += 26;
    else if (/gtx|quadro|radeon pro/.test(gpu)) score += 16;
    else if (/apple m\d/.test(gpu)) score += 20;
    // Named here because integrated Intel parts are the most common machine
    // that passes every other check and still cannot hold 60fps with shadows.
    else if (/intel|uhd|iris|mali|adreno 6|powervr/.test(gpu)) score -= 14;
  }

  // A very small viewport is a phone regardless of what anything else says.
  const px = Math.min(window.innerWidth, window.innerHeight);
  if (px <= 420) score -= 10;

  if (score >= 108) return TIER.ULTRA;
  if (score >= 82) return TIER.HIGH;
  if (score >= 56) return TIER.MEDIUM;
  return TIER.LOW;
}

/* -------------------------------------------------------------------------- *
 * Tier settings
 *
 * One row per tier. Every renderer and world system reads its budget from
 * here, so raising the low tier is a one-line change rather than a hunt.
 * -------------------------------------------------------------------------- */

export const TIER_SETTINGS = {
  [TIER.LOW]: {
    pixelRatio: 1.0,
    /** Adaptive scaler floor. Below this the image is worse than the stutter. */
    minScale: 0.6,
    shadows: false,
    shadowMapSize: 0,
    ssao: false,
    bloom: false,
    antialias: "none",
    /** Resolution of each generated PBR texture, in pixels. */
    textureSize: 256,
    /** Max simultaneous dust motes. */
    particles: 120,
    /** Extra geometry detail on props: 0 = silhouette only. */
    propDetail: 0,
    envMapSize: 64,
    anisotropy: 1,
    /** Reflections on the floor and glass. */
    reflections: false,
  },
  [TIER.MEDIUM]: {
    pixelRatio: 1.5,
    minScale: 0.7,
    shadows: true,
    shadowMapSize: 1024,
    ssao: false,
    bloom: true,
    antialias: "fxaa",
    textureSize: 384,
    particles: 300,
    propDetail: 1,
    envMapSize: 128,
    anisotropy: 4,
    reflections: false,
  },
  [TIER.HIGH]: {
    pixelRatio: 2.0,
    minScale: 0.75,
    shadows: true,
    /*
     * A PointLight packs its six faces into an atlas FOUR times the width
     * and TWICE the height of this number. 2048 therefore meant an
     * 8192x4096 texture - 200 MB of VRAM - and 4096 meant 16384x8192, which
     * is over MAX_TEXTURE_SIZE on most GPUs and silently fails or crawls.
     * 1024 gives a 4096x2048 atlas at ~50 MB, which is the right budget for
     * one light in one room.
     */
    shadowMapSize: 1024,
    ssao: true,
    bloom: true,
    antialias: "smaa",
    textureSize: 512,
    particles: 600,
    propDetail: 2,
    envMapSize: 256,
    anisotropy: 8,
    reflections: true,
  },
  [TIER.ULTRA]: {
    pixelRatio: 2.0,
    minScale: 0.85,
    shadows: true,
    /* 6144x3072 atlas, ~113 MB. See the note on the high tier above. */
    shadowMapSize: 1536,
    ssao: true,
    bloom: true,
    antialias: "smaa",
    textureSize: 1024,
    particles: 1000,
    propDetail: 3,
    envMapSize: 512,
    anisotropy: 16,
    reflections: true,
  },
};

/* -------------------------------------------------------------------------- *
 * Public API
 * -------------------------------------------------------------------------- */

/**
 * Probe the device. Safe to call more than once - the result is cached, since
 * the answer cannot change without a reload.
 */
export function detect() {
  if (platform) return platform;

  // A throwaway context, so the probe never competes with the real renderer
  // for the one context some mobile browsers allow.
  let gl = null;
  let canvas = null;
  try {
    canvas = document.createElement("canvas");
    gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
  } catch {
    gl = null;
  }

  const touch = detectTouch();
  const tier = gl ? scoreDevice(gl, touch) : TIER.LOW;

  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  platform = {
    /** No WebGL2 at all: the caller shows the unsupported screen. */
    webgl2: !!gl,
    touch,
    /** Phone-sized as opposed to tablet-sized. Drives the HUD layout. */
    phone: touch && Math.min(screen.width, screen.height) <= 500,
    ios,
    safari: /^((?!chrome|android).)*safari/i.test(ua),
    /** Standalone PWA, which has no browser chrome to allow for. */
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches ||
      navigator.standalone === true,
    tier,
    settings: { ...TIER_SETTINGS[tier] },
    cores: navigator.hardwareConcurrency || 4,
    gpu: gl ? probeGpu(gl) : "",
    /** Respect the OS-level motion preference in every animation we author. */
    reducedMotion:
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  };

  // Release the probe context immediately rather than waiting for the GC.
  try {
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    /* Nothing to do: the probe canvas is unreferenced either way. */
  }
  canvas = null;

  return platform;
}

/** The probe result. Call `detect()` first; this throws if you have not. */
export function get() {
  if (!platform) throw new Error("platform.detect() must run before get()");
  return platform;
}

/**
 * Override the tier from the settings menu.
 *
 * Returns the new settings block. The renderer listens for the settings event
 * and reconfigures itself rather than requiring a reload.
 */
export function setTier(tier) {
  if (!TIER_SETTINGS[tier]) return platform.settings;
  platform.tier = tier;
  platform.settings = { ...TIER_SETTINGS[tier] };
  return platform.settings;
}

/**
 * Tag the document so CSS can lay out for the device.
 *
 * The mobile stylesheet is its own design rather than a stack of overrides, so
 * it keys off `body.touch` / `body.phone` exactly like the other games here.
 */
export function applyBodyClasses(body = document.body) {
  const p = get();
  body.classList.toggle("touch", p.touch);
  body.classList.toggle("phone", p.phone);
  body.classList.toggle("desktop", !p.touch);
  body.classList.toggle("ios", p.ios);
  body.classList.toggle("standalone", p.standalone);
  body.dataset.tier = p.tier;
}
