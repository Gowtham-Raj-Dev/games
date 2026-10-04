/**
 * Procedural PBR texture factory.
 *
 * The brief asks for realistic materials - wood, concrete, metal, glass,
 * fabric, dust, scratches, small imperfections - with no flat colours. Every
 * one of those is generated here on a 2D canvas at boot rather than shipped as
 * an image, for three reasons:
 *
 *   1. Weight. A realistic interior needs albedo + roughness + normal for a
 *      dozen surfaces. As PNGs that is 30-60 MB; as code it is this file.
 *   2. Scale. The room grows from 4 m to 250 m. A texture authored to look
 *      right on a 4 m floor is mush at 250 m, so the tiling has to be derived
 *      from the room size at runtime - which means owning the texture.
 *   3. Tiers. A phone gets 256 px maps and a desktop 2048 px from the same
 *      code path, instead of shipping both.
 *
 * Everything is cached by key. Nothing here is generated twice.
 */

import * as THREE from "three";

import { get as getPlatform } from "../core/platform.js";
import { makeRng } from "../core/maths.js";

/** key -> THREE.Texture. Shared, and never disposed while the game runs. */
const cache = new Map();
/** Shared textures must survive the scene teardown between room states. */
export const SHARED = new Set();

let maxAnisotropy = 1;

/** Call once, after the renderer exists, so anisotropy can be clamped to it. */
export function init(renderer) {
  maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
}

/* -------------------------------------------------------------------------- *
 * Core helper
 * -------------------------------------------------------------------------- */

/**
 * Draw into an offscreen canvas and wrap it as a texture.
 *
 * `srgb` must be false for anything that is data rather than colour -
 * roughness, metalness, normals, AO. Getting that wrong is the single most
 * common cause of a PBR surface that looks subtly plastic, because the
 * renderer applies a gamma curve to numbers that are not colours.
 */
function canvasTex(size, draw, { srgb = true, repeat = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  draw(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(maxAnisotropy, getPlatform().settings.anisotropy);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  SHARED.add(tex);
  return tex;
}

/** Generate once, then hand out the same texture forever. */
function cached(key, make) {
  let tex = cache.get(key);
  if (!tex) {
    tex = make();
    cache.set(key, tex);
  }
  return tex;
}

/** Texture resolution for this device, optionally scaled for a minor surface. */
const res = (scale = 1) =>
  Math.max(64, Math.round(getPlatform().settings.textureSize * scale));

/* -------------------------------------------------------------------------- *
 * Noise primitives
 *
 * All drawing below is built from these three. They are deliberately cheap:
 * this runs during the loading screen and must not stall it.
 * -------------------------------------------------------------------------- */

/**
 * Tileable value noise.
 *
 * Tileable matters more than it sounds. A floor at room state 8 repeats the
 * texture 60 times across; any seam shows up as a visible grid and instantly
 * reads as a videogame. Blending the four corners of the lattice against
 * themselves makes the edges match.
 */
function valueNoise(size, cells, seed) {
  const rng = makeRng(seed);
  // Only the unique lattice cells are stored. Sampling wraps with a modulo,
  // which is what makes the result tile: the cell past the right edge is the
  // cell at the left edge, so the interpolation matches across the seam.
  const base = new Float32Array(cells * cells);
  for (let i = 0; i < base.length; i++) base[i] = rng();
  const at = (x, y) => base[(y % cells) * cells + (x % cells)];

  const out = new Float32Array(size * size);
  const step = cells / size;
  const smooth = (t) => t * t * (3 - 2 * t);

  for (let y = 0; y < size; y++) {
    const fy = y * step;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    for (let x = 0; x < size; x++) {
      const fx = x * step;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const a = at(x0, y0);
      const b = at(x0 + 1, y0);
      const c = at(x0, y0 + 1);
      const d = at(x0 + 1, y0 + 1);
      out[y * size + x] =
        a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

/** Sum several octaves of value noise into a 0..1 height field that tiles. */
function fbm(size, { octaves = 5, cells = 4, gain = 0.5, seed = 1 } = {}) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  let c = cells;
  for (let o = 0; o < octaves; o++) {
    const layer = valueNoise(size, c, seed + o * 1013);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= gain;
    c *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Paint a height field into the canvas as greyscale, through a transform. */
function paintField(ctx, size, field, map) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < field.length; i++) {
    const v = Math.max(0, Math.min(255, map(field[i], i) * 255)) | 0;
    const p = i * 4;
    d[p] = d[p + 1] = d[p + 2] = v;
    d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Convert a height field to a tangent-space normal map by central difference.
 *
 * Authoring a normal map directly is impossible by hand; deriving it from the
 * height that already drew the albedo keeps the bumps and the colour aligned,
 * which is what sells a surface as one material rather than two.
 */
function normalFromField(size, field, strength = 2.2) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const at = (x, y) => field[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // Normalise (-dx, -dy, 1) and pack into 0..255.
      const len = Math.hypot(dx, dy, 1);
      const p = (y * size + x) * 4;
      d[p] = ((-dx / len) * 0.5 + 0.5) * 255;
      d[p + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      d[p + 2] = (1 / len) * 0.5 * 255 + 127.5;
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(maxAnisotropy, getPlatform().settings.anisotropy);
  tex.colorSpace = THREE.NoColorSpace;
  SHARED.add(tex);
  return tex;
}

/** Scatter small dark specks: dirt, grit, pinholes. The "imperfections" pass. */
function speckle(ctx, size, count, seed, { min = 0.4, max = 1.6, alpha = 0.18, dark = true } = {}) {
  const rng = makeRng(seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = min + rng() * (max - min);
    const a = alpha * (0.4 + rng() * 0.6);
    ctx.fillStyle = dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Fine directional scratches. Draws wrapped, so it tiles. */
function scratches(ctx, size, count, seed, { alpha = 0.06, len = 0.2, angle = 0 } = {}) {
  const rng = makeRng(seed);
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const a = angle + (rng() - 0.5) * 0.5;
    const l = size * len * (0.2 + rng() * 0.8);
    ctx.strokeStyle = `rgba(255,255,255,${alpha * (0.3 + rng() * 0.7)})`;
    ctx.lineWidth = 0.4 + rng() * 0.8;
    // Draw three times, offset by the tile, so a scratch crossing the edge
    // reappears on the other side instead of being clipped.
    for (const [ox, oy] of [[0, 0], [-size, 0], [0, -size]]) {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* -------------------------------------------------------------------------- *
 * Surfaces
 *
 * Each returns { map, roughnessMap, normalMap } ready to spread into a
 * MeshStandardMaterial. Low tiers skip the normal map, which is the single
 * biggest saving available and the least missed at 256 px.
 * -------------------------------------------------------------------------- */

const wantsNormal = () => getPlatform().settings.propDetail >= 1;

/**
 * Poured concrete: the walls and floor of the first room.
 *
 * Generated ONCE, neutral, and tinted per surface by the material's `color`.
 * Baking the tint in instead meant the floor, the walls and the ceiling each
 * generated their own full set of maps - three times the work for three
 * shades of the same grey, which at the top tier was most of a second of
 * blocked main thread per surface.
 */
export function concrete() {
  return cached("concrete", () => {
    const size = res();
    const height = fbm(size, { octaves: 5, cells: 3, gain: 0.55, seed: 7 });

    const map = canvasTex(size, (ctx, s) => {
      // Base: the height field remapped to a narrow value range. Concrete is
      // nearly flat in albedo; almost all of its read comes from roughness.
      // Near-white, so the material's colour multiplies cleanly over it.
      paintField(ctx, s, height, (v) => 0.78 + v * 0.22);

      // Air pockets left by the pour, and the grit that collects in them.
      speckle(ctx, s, Math.round(s * 1.6), 31, { min: 0.5, max: 2.4, alpha: 0.3 });
      speckle(ctx, s, Math.round(s * 0.5), 57, { min: 0.3, max: 1.0, alpha: 0.1, dark: false });

      // Faint form-work seams. Real poured concrete is cast in panels.
      ctx.strokeStyle = "rgba(0,0,0,0.085)";
      ctx.lineWidth = Math.max(1, s / 256);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.5);
      ctx.lineTo(s, s * 0.5);
      ctx.moveTo(s * 0.5, 0);
      ctx.lineTo(s * 0.5, s);
      ctx.stroke();
    });

    const roughnessMap = canvasTex(
      size,
      (ctx, s) => {
        // Rough overall, with the hollows slightly smoother where dust settles.
        paintField(ctx, s, height, (v) => 0.78 + v * 0.18);
        speckle(ctx, s, Math.round(s * 1.2), 31, { min: 0.5, max: 2.2, alpha: 0.22, dark: false });
      },
      { srgb: false },
    );

    return {
      map,
      roughnessMap,
      normalMap: wantsNormal() ? normalFromField(size, height, 1.5) : null,
    };
  });
}

/** Painted plaster: later rooms, where the building is finished. */
export function plaster() {
  return cached("plaster", () => {
    const size = res();
    // Much smoother than concrete, but not flat: a skim coat has trowel marks.
    const height = fbm(size, { octaves: 4, cells: 2, gain: 0.42, seed: 19 });

    const map = canvasTex(size, (ctx, s) => {
      paintField(ctx, s, height, (v) => 0.86 + v * 0.14);
      scratches(ctx, s, Math.round(s / 8), 83, { alpha: 0.03, len: 0.3, angle: 0.4 });
      speckle(ctx, s, Math.round(s * 0.3), 97, { min: 0.3, max: 0.9, alpha: 0.07 });
    });

    const roughnessMap = canvasTex(
      size,
      (ctx, s) => paintField(ctx, s, height, (v) => 0.86 + v * 0.1),
      { srgb: false },
    );

    return {
      map,
      roughnessMap,
      normalMap: wantsNormal() ? normalFromField(size, height, 0.7) : null,
    };
  });
}

/**
 * Floorboards.
 *
 * Drawn as real planks with staggered ends rather than a repeating stripe,
 * because a stripe reads as a pattern and planks read as a floor. The grain
 * is a sine warped by noise, which is cheap and close enough.
 */
export function wood(planks = 6) {
  return cached(`wood:${planks}`, () => {
    const size = res();
    const height = new Float32Array(size * size);
    const grain = fbm(size, { octaves: 4, cells: 6, gain: 0.5, seed: 41 });
    const rng = makeRng(409);

    // Plank layout, computed once and shared by all three maps so the grain,
    // the gaps and the bumps line up exactly.
    const plankH = size / planks;
    const rows = [];
    for (let i = 0; i < planks; i++) {
      rows.push({ shade: 0.82 + rng() * 0.3, offset: rng() * size, warp: 0.5 + rng() });
    }

    const map = canvasTex(size, (ctx, s) => {
      const img = ctx.createImageData(s, s);
      const d = img.data;

      for (let y = 0; y < s; y++) {
        const row = rows[Math.floor(y / plankH) % planks];
        const inPlank = (y % plankH) / plankH;
        // Darken hard at the plank edge: that shadow line is the whole read.
        const edge = Math.min(inPlank, 1 - inPlank);
        const edgeDark = edge < 0.035 ? 0.45 + (edge / 0.035) * 0.55 : 1;

        for (let x = 0; x < s; x++) {
          const u = (x + row.offset) % s;
          const g = grain[y * s + x];
          // Grain: tight rings along the plank, warped by the noise field.
          // Warp was 9x in the first pass, which bent the rings into waves
          // and read as watered silk rather than as sawn timber. Grain runs
          // nearly straight along a plank; the noise only breaks it up.
          const rings = Math.sin((u / s) * Math.PI * 2 * 34 + g * 2.2 * row.warp);
          const v = 0.84 + rings * 0.055 + g * 0.1;
          const shade = v * row.shade * edgeDark;

          // Luminance only. The species - oak, pine, stained mahogany - is
          // the material's `color`; this map carries grain and plank edges.
          const lum = Math.min(255, shade * 255);
          const p = (y * s + x) * 4;
          d[p] = d[p + 1] = d[p + 2] = lum;
          d[p + 3] = 255;
          height[y * s + x] = Math.min(1, shade * 0.6 + 0.2);
        }
      }
      ctx.putImageData(img, 0, 0);

      // Wear along the walking line, and the odd scuff.
      scratches(ctx, s, Math.round(s / 5), 127, { alpha: 0.05, len: 0.35, angle: 0 });
      speckle(ctx, s, Math.round(s * 0.4), 149, { min: 0.3, max: 1.2, alpha: 0.12 });
    });

    const roughnessMap = canvasTex(
      size,
      (ctx, s) => {
        // Varnish is smoother on the plank face and rougher in the gaps.
        paintField(ctx, s, height, (v) => 1 - v * 0.42);
      },
      { srgb: false },
    );

    return {
      map,
      roughnessMap,
      normalMap: wantsNormal() ? normalFromField(size, height, 1.1) : null,
    };
  });
}

/** Brushed metal: hinges, the door handle, the cube's banding. */
export function metal() {
  return cached("metal", () => {
    const size = res(0.5);
    const grain = fbm(size, { octaves: 3, cells: 10, gain: 0.5, seed: 61 });

    const map = canvasTex(size, (ctx, s) => {
      paintField(ctx, s, grain, (v) => 0.86 + v * 0.14);
      // Brushing: many near-parallel scratches in one direction. This is what
      // makes an anisotropic-looking highlight on an isotropic material.
      scratches(ctx, s, Math.round(s * 1.5), 173, { alpha: 0.07, len: 0.6, angle: 0 });
    });

    const roughnessMap = canvasTex(
      size,
      (ctx, s) => {
        paintField(ctx, s, grain, () => 0.34);
        scratches(ctx, s, Math.round(s * 1.5), 173, { alpha: 0.22, len: 0.6, angle: 0 });
      },
      { srgb: false },
    );

    return { map, roughnessMap, normalMap: null };
  });
}

/** Coarse upholstery for the chair seat. */
export function fabric() {
  return cached("fabric", () => {
    const size = res(0.5);
    const height = new Float32Array(size * size);
    const fuzz = fbm(size, { octaves: 3, cells: 16, gain: 0.5, seed: 211 });

    const map = canvasTex(size, (ctx, s) => {
      const img = ctx.createImageData(s, s);
      const d = img.data;
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          // A plain weave: two interleaved sine threads at right angles.
          const weave =
            Math.sin((x / s) * Math.PI * 2 * 48) * Math.cos((y / s) * Math.PI * 2 * 48);
          const v = 0.86 + weave * 0.1 + fuzz[y * s + x] * 0.14;
          const lum = Math.min(255, v * 255);
          const p = (y * s + x) * 4;
          d[p] = d[p + 1] = d[p + 2] = lum;
          d[p + 3] = 255;
          height[y * s + x] = v * 0.5;
        }
      }
      ctx.putImageData(img, 0, 0);
    });

    const roughnessMap = canvasTex(size, (ctx, s) => paintField(ctx, s, height, () => 0.95), {
      srgb: false,
    });

    return {
      map,
      roughnessMap,
      normalMap: wantsNormal() ? normalFromField(size, height, 1.6) : null,
    };
  });
}

/**
 * A dust/grime overlay, used as an alpha-blended decal on floors and sills.
 *
 * Kept separate from the surfaces so the same dust can sit on concrete, wood
 * and the table top without three near-identical textures.
 */
export function grime() {
  return cached("grime", () => {
    const size = res(0.5);
    const field = fbm(size, { octaves: 5, cells: 2, gain: 0.6, seed: 307 });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < field.length; i++) {
      const p = i * 4;
      d[p] = d[p + 1] = d[p + 2] = 40;
      // Only the darkest part of the field becomes dust, so it pools in
      // patches rather than greying the whole surface uniformly.
      d[p + 3] = Math.max(0, field[i] - 0.45) * 2 * 150;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    SHARED.add(tex);
    return { map: tex };
  });
}

/**
 * A floor mark: a dashed outline of the shape an object's shadow makes.
 *
 * Stage 2 asks the player to stand three objects on three marks. The mark
 * has to say WHICH object without a label - the game has no tutorial text in
 * the world and is bilingual - so each one is drawn as the silhouette of the
 * thing that belongs on it. A square for the cube, a circle with a handle
 * for the mug, a rectangle for the book.
 */
export function floorMark(shape) {
  return cached(`mark:${shape}`, () => {
    const size = 256;
    return canvasTex(
      size,
      (ctx, s) => {
        ctx.clearRect(0, 0, s, s);
        const m = s * 0.18;
        ctx.strokeStyle = "rgba(111,224,189,0.95)";
        ctx.lineWidth = s * 0.028;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        // Dashed, so it reads as a marking painted on the floor rather than
        // as an object lying there.
        ctx.setLineDash([s * 0.07, s * 0.05]);

        if (shape === "square") {
          ctx.strokeRect(m, m, s - m * 2, s - m * 2);
        } else if (shape === "circle") {
          ctx.beginPath();
          ctx.arc(s / 2, s / 2, s / 2 - m, 0, Math.PI * 2);
          ctx.stroke();
          // The handle, so it is unmistakably the mug and not the cube.
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(s * 0.82, s / 2, s * 0.1, -Math.PI / 2, Math.PI / 2);
          ctx.stroke();
        } else {
          // Book: a wide rectangle with a spine line.
          const h = (s - m * 2) * 0.66;
          ctx.strokeRect(m, (s - h) / 2, s - m * 2, h);
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(s * 0.5, (s - h) / 2);
          ctx.lineTo(s * 0.5, (s + h) / 2);
          ctx.stroke();
        }

        // A corner tick on each side: the survey motif the rest of the game
        // uses, and it makes the mark read as measured rather than drawn.
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(111,224,189,0.55)";
        ctx.lineWidth = s * 0.016;
        const t = s * 0.07;
        for (const [x, y, dx, dy] of [
          [s / 2, m * 0.45, 0, 1], [s / 2, s - m * 0.45, 0, -1],
          [m * 0.45, s / 2, 1, 0], [s - m * 0.45, s / 2, -1, 0],
        ]) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + dx * t, y + dy * t);
          ctx.stroke();
        }
      },
      { repeat: false },
    );
  });
}

/** A soft radial sprite, for dust motes and light shafts. */
/* -------------------------------------------------------------------------- *
 * WITHROOM - people
 *
 * Skin, eyes and hair. These are the maps that decide whether the husband and
 * wife read as people or as mannequins, and all three are built on the same
 * observation: what makes a surface look alive is NOT detail, it is VARIATION
 * AT TWO SCALES. Skin has pores (high frequency) and blood (low frequency).
 * Hair has strands (high) and clumps (low). An iris has fibres (high) and
 * sectors (low). Get both scales into the map and the eye accepts it; get only
 * one and no amount of resolution helps.
 * -------------------------------------------------------------------------- */

/**
 * Skin.
 *
 * Three fields combined, in this order and for these reasons:
 *
 *   BLOOD    very low frequency, warm. This is subsurface scattering faked in
 *            albedo - real skin is not one colour, it is pale over bone and
 *            red over muscle and blue over vein, and the patchiness is most of
 *            what the eye reads as "flesh".
 *   PORES    high frequency, dense, slightly darker. Goes into the normal map
 *            far more strongly than into albedo: pores are geometry, and
 *            painting them dark instead gives the grey, dirty look that
 *            procedural skin usually has.
 *   SHEEN    inverse of the pore field in roughness, so the raised skin
 *            between pores is glossier than the pits. That single relationship
 *            is what makes a cheek catch a highlight the way a cheek does.
 *
 * `tone` 0..1 runs pale to deep. One generator, two characters, no second
 * texture: they differ by material colour, not by bitmap.
 */
export function skin(tone = 0.5) {
  const key = `skin:${tone.toFixed(2)}`;
  return cached(key, () => {
    const size = res(0.5);
    /*
     * 140 cells, not 46.
     *
     * The map wraps a whole head, so a cell is a real size on a real face: at
     * 46 the "pores" came out four millimetres across and the skin read as
     * orange peel. At 140 they are about a millimetre, which is what a pore is.
     */
    const pores = fbm(size, { octaves: 4, cells: 140, gain: 0.44, seed: 907 });
    const blood = fbm(size, { octaves: 3, cells: 3, gain: 0.62, seed: 1301 });
    const height = new Float32Array(size * size);

    // Base flesh, interpolated between a pale and a deep tone. Both are
    // deliberately desaturated: saturated skin under ACES tone mapping and a
    // warm practical light goes orange immediately.
    const pale = [228, 196, 178];
    const deep = [146, 104, 80];
    const base = pale.map((c, i) => c + (deep[i] - pale[i]) * tone);

    const map = canvasTex(size, (ctx, s) => {
      const img = ctx.createImageData(s, s);
      const d = img.data;
      for (let i = 0; i < pores.length; i++) {
        const p = i * 4;
        const bl = (blood[i] - 0.5) * 2;      // -1..1
        const po = (pores[i] - 0.5) * 2;

        // Blood pushes red up and blue down - it is a hue shift, not a
        // brightness change, which is why a single luminance variation never
        // looks like skin.
        d[p] = clampByte(base[0] * (1 + bl * 0.055 + po * 0.016));
        d[p + 1] = clampByte(base[1] * (1 + bl * 0.012 + po * 0.016));
        d[p + 2] = clampByte(base[2] * (1 - bl * 0.045 + po * 0.016));
        d[p + 3] = 255;

        height[i] = 0.5 + po * 0.5;
      }
      ctx.putImageData(img, 0, 0);
      // A few larger marks per face: moles, old scars, pigmentation. Skin with
      // no blemishes at all is the most artificial thing a renderer can show.
      speckle(ctx, s, Math.round(size * 0.12), 1709, { min: 0.6, max: 2.4, alpha: 0.1 });
    });

    const roughnessMap = canvasTex(
      size,
      (ctx, s) =>
        // Glossy on the ridges, matte in the pits. 0.42 to 0.62 is the whole
        // usable range for skin; outside it reads as wax or as paper.
        paintField(ctx, s, height, (v) => 0.62 - v * 0.2),
      { srgb: false },
    );

    return {
      map,
      roughnessMap,
      // Present, but gentle. Pores are a millimetre deep, not a centimetre, and
      // the first pass at 2.6 lit every one of them like a crater.
      normalMap: wantsNormal() ? normalFromField(size, height, 0.9) : null,
    };
  });
}

/** Clamp a float to one byte. Used by every per-pixel loop below. */
const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/**
 * An eye, as one strip: sclera, limbus, iris, pupil.
 *
 * Laid out as a single equirectangular map for a sphere, so the iris lands on
 * the front of the eyeball and the sclera wraps the rest. The alternative -
 * a separate iris disc parented to the eyeball - needs two draw calls per eye
 * and z-fights at a grazing angle.
 *
 * The details that matter, in order of how much they buy:
 *   1. The LIMBUS: the dark ring at the iris edge. Without it an iris looks
 *      printed on. It is also what makes an eye read as wet.
 *   2. Radial FIBRES at two frequencies, not one.
 *   3. The sclera is not white. It is a very pale warm grey with vessels.
 */
export function iris(colour = "brown") {
  return cached(`iris:${colour}`, () => {
    const size = Math.max(256, res(0.5));
    const h = size / 2;

    const COLOURS = {
      brown: ["#6b4426", "#3f2412", "#8a5c30"],
      hazel: ["#7a6134", "#4a3a1c", "#9c7f45"],
      grey: ["#6d7378", "#3e4347", "#878d92"],
      dark: ["#3a2a1e", "#1d140e", "#55402e"],
    };
    const [mid, dark, light] = COLOURS[colour] ?? COLOURS.brown;

    const tex = canvasTex(
      size,
      (ctx, s) => {
        const half = s / 2;

        // --- sclera, everywhere -------------------------------------------
        // The whole sphere is eye white; the iris is painted onto the part of
        // it that ends up facing forward.
        // Not white. An eye white is a warm grey - a true white sclera is the
        // single most doll-like thing a face can have.
        ctx.fillStyle = "#cdc7bd";
        ctx.fillRect(0, 0, s, s);
        // Vessels. Drawn only toward the outer edge, as a few short forking
        // lines, because a web of them over the whole eye reads as an injury.
        const rng = makeRng(4201);
        ctx.lineCap = "round";
        for (let i = 0; i < 22; i++) {
          const x = rng() * s;
          const y = half * 0.3 + rng() * half * 1.1;
          ctx.strokeStyle = `rgba(190,96,88,${0.1 + rng() * 0.16})`;
          ctx.lineWidth = 0.6 + rng() * 1.1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          let px = x;
          let py = y;
          for (let k = 0; k < 3; k++) {
            px += (rng() - 0.5) * s * 0.06;
            py += (rng() - 0.3) * half * 0.05;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }

        /* --- the iris, centred on the front of the sphere ---------------- *
         * u = 0.25, v = 0.5 is the +Z pole of a three.js SphereGeometry - the
         * point that faces forward when the mesh is unrotated. The first pass
         * painted it at u = 0.5, v = 0.26, which is up and to one side, so the
         * eyes showed nothing but sclera from the front.
         */
        const cx = s * 0.25;
        const cy = s * 0.5;
        /*
         * HALF the radius horizontally.
         *
         * This is an equirectangular map: u spans 360 degrees across the width
         * and v spans 180 down the height, so a circle drawn on the canvas comes
         * out twice as wide as it is tall once it is on the sphere. Drawing an
         * ellipse of 1:2 is what makes a round iris. The first pass drew a
         * circle and produced an iris 83 degrees wide and 41 tall - a letterbox
         * slot, which is exactly what it looked like.
         */
        const irisR = s * 0.1;
        const irisRX = irisR * 0.5;

        const grad = ctx.createRadialGradient(cx, cy, irisR * 0.22, cx, cy, irisR);
        grad.addColorStop(0, dark);
        grad.addColorStop(0.42, mid);
        grad.addColorStop(0.78, light);
        grad.addColorStop(1, dark);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, irisRX, irisR, 0, 0, Math.PI * 2);
        ctx.fill();

        // Fibres: two passes at different counts and lengths. The long sparse
        // pass gives the iris its sectors, the short dense one its texture.
        for (const [count, len, alpha, width] of [
          [34, 0.86, 0.3, 1.9],
          [150, 0.52, 0.16, 0.9],
        ]) {
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + rng() * 0.08;
            const r0 = irisR * (0.24 + rng() * 0.1);
            const r1 = irisR * len * (0.7 + rng() * 0.3);
            ctx.strokeStyle = rng() > 0.5
              ? `rgba(255,236,206,${alpha * rng()})`
              : `rgba(18,10,6,${alpha * rng()})`;
            ctx.lineWidth = width * (0.5 + rng() * 0.8);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r0 * 0.5, cy + Math.sin(a) * r0);
            ctx.lineTo(cx + Math.cos(a) * r1 * 0.5, cy + Math.sin(a) * r1);
            ctx.stroke();
          }
        }

        // --- limbus -------------------------------------------------------
        ctx.strokeStyle = "rgba(14,9,6,0.62)";
        ctx.lineWidth = irisR * 0.13;
        ctx.beginPath();
        ctx.ellipse(cx, cy, irisRX * 0.97, irisR * 0.97, 0, 0, Math.PI * 2);
        ctx.stroke();

        // --- pupil --------------------------------------------------------
        // Not pure black: a pupil is a hole, and a hole in a lit room still
        // bounces a little light back out of the retina.
        ctx.fillStyle = "#0a0708";
        ctx.beginPath();
        ctx.ellipse(cx, cy, irisRX * 0.37, irisR * 0.37, 0, 0, Math.PI * 2);
        ctx.fill();

        // --- the back of the eye ------------------------------------------
        // The half of the sphere that is inside the skull. Never seen, and
        // darker, so any sliver of it that does show reads as shadow.
        ctx.fillStyle = "#9a9388";
        ctx.fillRect(s * 0.62, 0, s * 0.26, s);
      },
      { repeat: false },
    );
    return tex;
  });
}

/**
 * Hair, as a strand map for the shell meshes.
 *
 * Long vertical streaks at several widths and opacities. The map's job is not
 * to be seen as hairs - at the distance these characters are viewed from, no
 * strand is a pixel wide - it is to break the specular highlight into bands.
 * A hair shell with a clean highlight looks like plastic however dark it is.
 */
export function hair(shade = "dark") {
  return cached(`hair:${shade}`, () => {
    const size = res(0.5);
    const height = new Float32Array(size * size);
    const base = shade === "dark" ? 22 : shade === "brown" ? 44 : 70;

    const map = canvasTex(size, (ctx, s) => {
      ctx.fillStyle = `rgb(${base},${base * 0.82},${base * 0.7})`;
      ctx.fillRect(0, 0, s, s);

      const rng = makeRng(557);
      for (let i = 0; i < Math.round(s * 1.6); i++) {
        const x = rng() * s;
        const w = 0.5 + rng() * 2.4;
        const bright = rng();
        // A handful of much lighter strands. Real hair is never one value and
        // the lighter ones are what give it depth at a distance.
        const v = base * (0.5 + bright * 1.7);
        ctx.strokeStyle = `rgba(${clampByte(v)},${clampByte(v * 0.84)},${clampByte(v * 0.72)},${0.25 + rng() * 0.5})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        // Strands wander slightly across the map rather than running straight,
        // which is what stops the shells looking combed by a machine.
        let px = x;
        ctx.moveTo(px, 0);
        for (let y = 0; y <= s; y += s / 8) {
          px += (rng() - 0.5) * s * 0.02;
          ctx.lineTo(px, y);
        }
        ctx.stroke();

        const col = Math.max(0, Math.min(s - 1, Math.round(x)));
        for (let y = 0; y < s; y++) height[y * s + col] = 0.4 + bright * 0.6;
      }
    });

    const roughnessMap = canvasTex(
      size,
      // Hair is anisotropic and three.js standard materials are not, so the
      // nearest honest approximation is a roughness that varies along the
      // strand: the highlight then breaks up into the banding the eye expects.
      (ctx, s) => paintField(ctx, s, height, (v) => 0.78 - v * 0.34),
      { srgb: false },
    );

    return {
      map,
      roughnessMap,
      normalMap: wantsNormal() ? normalFromField(size, height, 1.4) : null,
    };
  });
}

/* -------------------------------------------------------------------------- *
 * WITHROOM - marks on the world
 * -------------------------------------------------------------------------- */

/**
 * One of the four sigils.
 *
 * The symbol puzzle needs glyphs that are (a) distinguishable at a glance from
 * across a room, (b) describable without words, so the bilingual hint can refer
 * to them, and (c) nothing recognisable from the real world - no pentagram, no
 * ankh, nothing with existing baggage. So each is built from two primitives
 * only: a containing shape and one internal stroke.
 *
 * `ink` is the colour. The floor marks are painted in a bleached white; the
 * matching glyphs cut into the door are the same shapes in rust.
 */
export function sigil(name, ink = "rgba(226,222,214,0.92)") {
  return cached(`sigil:${name}:${ink}`, () => {
    const size = 256;
    return canvasTex(
      size,
      (ctx, s) => {
        ctx.clearRect(0, 0, s, s);
        const c = s / 2;
        const r = s * 0.3;
        ctx.strokeStyle = ink;
        ctx.lineWidth = s * 0.035;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        switch (name) {
          // A circle with a vertical bar through it: the simplest, and the one
          // the first clue points at.
          case "eye":
            ctx.beginPath();
            ctx.ellipse(c, c, r, r * 0.6, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(c, c, r * 0.22, 0, Math.PI * 2);
            ctx.stroke();
            break;

          // A downward triangle with a horizontal bar: "below".
          case "down":
            ctx.beginPath();
            ctx.moveTo(c - r, c - r * 0.75);
            ctx.lineTo(c + r, c - r * 0.75);
            ctx.lineTo(c, c + r * 0.9);
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(c - r * 0.5, c + r * 0.05);
            ctx.lineTo(c + r * 0.5, c + r * 0.05);
            ctx.stroke();
            break;

          // A square standing on a corner, with one side missing: "the door".
          case "door":
            ctx.beginPath();
            ctx.moveTo(c, c - r);
            ctx.lineTo(c + r, c);
            ctx.lineTo(c, c + r);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(c, c + r);
            ctx.lineTo(c - r, c);
            ctx.stroke();
            break;

          // Two arcs that do not meet, one inside the other: "the two of them".
          case "pair":
          default:
            ctx.beginPath();
            ctx.arc(c, c, r, Math.PI * 0.18, Math.PI * 1.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(c, c, r * 0.52, Math.PI * 1.18, Math.PI * 2.5);
            ctx.stroke();
            break;
        }
      },
      { repeat: false },
    );
  });
}

/**
 * A dried stain.
 *
 * Deliberately not bright red. Blood on a concrete floor for any length of
 * time is almost black with a brown edge, and the restraint is what keeps the
 * room frightening rather than lurid - a scarlet splash reads as a prop.
 */
export function stain() {
  return cached("stain", () => {
    const size = Math.max(128, res(0.25));
    const field = fbm(size, { octaves: 5, cells: 3, gain: 0.58, seed: 4801 });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const half = size / 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const dx = (x - half) / half;
        const dy = (y - half) / half;
        const r = Math.sqrt(dx * dx + dy * dy);
        // An irregular edge: the noise field pushes the boundary in and out, so
        // the stain has the ragged outline a spill dries into.
        const edge = 0.62 + field[i] * 0.42;
        const a = r > edge ? 0 : Math.min(1, (edge - r) * 4.2);
        const p = i * 4;
        // Darker in the middle where it pooled, browner at the rim where it
        // was thin enough to oxidise.
        const centre = 1 - r / Math.max(0.001, edge);
        d[p] = clampByte(58 - centre * 26);
        d[p + 1] = clampByte(22 - centre * 12);
        d[p + 2] = clampByte(18 - centre * 10);
        d[p + 3] = clampByte(a * 215);
      }
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(maxAnisotropy, getPlatform().settings.anisotropy);
    SHARED.add(tex);
    return tex;
  });
}

/**
 * A painting, for the walls of the room.
 *
 * Not a picture of anything: a dark tonal field with one lighter shape in it,
 * varnish-yellowed and craquelured. That is enough for the player's eye to
 * finish the image itself, and whatever they finish it with is worse than
 * anything that could be drawn here - which is the entire principle the horror
 * in this game is built on.
 */
export function painting(variant = 0) {
  return cached(`painting:${variant}`, () => {
    const size = res(0.5);
    const grime = fbm(size, { octaves: 5, cells: 4, gain: 0.55, seed: 5100 + variant });
    const cracks = fbm(size, { octaves: 3, cells: 40, gain: 0.5, seed: 5200 + variant });

    return canvasTex(
      size,
      (ctx, s) => {
        // Ground: a very dark warm brown, the colour of old varnish.
        ctx.fillStyle = "#1a1310";
        ctx.fillRect(0, 0, s, s);

        // The shape. A standing figure for variant 0, a doorway for 1, a
        // horizon for 2 - all so vague they are barely there.
        ctx.save();
        if (variant === 0) {
          const g = ctx.createRadialGradient(s * 0.5, s * 0.46, s * 0.02, s * 0.5, s * 0.5, s * 0.34);
          g.addColorStop(0, "rgba(176,158,128,0.5)");
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(s * 0.5, s * 0.56, s * 0.1, s * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(s * 0.5, s * 0.3, s * 0.07, 0, Math.PI * 2);
          ctx.fill();
        } else if (variant === 1) {
          ctx.fillStyle = "rgba(8,6,5,0.9)";
          ctx.fillRect(s * 0.36, s * 0.3, s * 0.28, s * 0.58);
          const g = ctx.createLinearGradient(0, s * 0.3, 0, s * 0.9);
          g.addColorStop(0, "rgba(150,132,104,0.34)");
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.fillRect(s * 0.32, s * 0.26, s * 0.36, s * 0.64);
        } else {
          const g = ctx.createLinearGradient(0, 0, 0, s);
          g.addColorStop(0, "rgba(120,106,86,0.3)");
          g.addColorStop(0.52, "rgba(60,52,42,0.2)");
          g.addColorStop(1, "rgba(10,8,6,0.9)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, s, s);
        }
        ctx.restore();

        // Varnish bloom and dirt, then craquelure as a fine dark web. The
        // cracks are what date it: a clean surface reads as a print.
        const img = ctx.getImageData(0, 0, s, s);
        const d = img.data;
        for (let i = 0; i < grime.length; i++) {
          const p = i * 4;
          const dirt = 0.78 + grime[i] * 0.42;
          const crack = cracks[i] > 0.62 ? 0.62 : 1;
          d[p] = clampByte(d[p] * dirt * crack + 10 * grime[i]);
          d[p + 1] = clampByte(d[p + 1] * dirt * crack + 7 * grime[i]);
          d[p + 2] = clampByte(d[p + 2] * dirt * crack);
        }
        ctx.putImageData(img, 0, 0);
      },
      { repeat: false },
    );
  });
}

/* -------------------------------------------------------------------------- *
 * WITHROOM - the car scene
 * -------------------------------------------------------------------------- */

/**
 * Wet tarmac.
 *
 * Aggregate chippings in a dark binder, with standing water in the low spots.
 * The water is the point: it is painted as a near-black patch with a very LOW
 * roughness, so where the headlights hit it they streak instead of diffusing,
 * and that streak is 90% of what makes a night road read as wet.
 */
export function asphalt() {
  return cached("asphalt", () => {
    const size = res(0.75);
    const grit = fbm(size, { octaves: 5, cells: 30, gain: 0.5, seed: 2203 });
    const puddle = fbm(size, { octaves: 3, cells: 3, gain: 0.6, seed: 2207 });
    const height = new Float32Array(size * size);
    const wet = new Float32Array(size * size);

    const map = canvasTex(size, (ctx, s) => {
      const img = ctx.createImageData(s, s);
      const d = img.data;
      for (let i = 0; i < grit.length; i++) {
        const p = i * 4;
        const w = Math.max(0, puddle[i] - 0.52) * 2.4;
        const v = 26 + grit[i] * 30 - w * 16;
        d[p] = clampByte(v * 1.02);
        d[p + 1] = clampByte(v);
        d[p + 2] = clampByte(v * 1.06);
        d[p + 3] = 255;
        height[i] = grit[i] * (1 - w * 0.8);
        wet[i] = w;
      }
      ctx.putImageData(img, 0, 0);
      speckle(ctx, s, Math.round(size * 2), 2211, { min: 0.5, max: 1.8, alpha: 0.2, dark: false });
    });

    const roughnessMap = canvasTex(
      size,
      (ctx, s) => {
        const img = ctx.createImageData(s, s);
        const d = img.data;
        for (let i = 0; i < wet.length; i++) {
          // Dry chip 0.85, standing water 0.08. The gap has to be this large
          // or the wet patches read as slightly grey tarmac.
          const r = 0.85 - wet[i] * 0.77;
          const p = i * 4;
          d[p] = d[p + 1] = d[p + 2] = clampByte(r * 255);
          d[p + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      },
      { srgb: false },
    );

    return {
      map,
      roughnessMap,
      normalMap: wantsNormal() ? normalFromField(size, height, 2.2) : null,
    };
  });
}

/**
 * Rain on glass, as an alpha map for the windscreen.
 *
 * Two populations, because rain on a moving windscreen has two: beads that are
 * still being held by surface tension, and the streaks the airflow has already
 * pulled upward out of them. Drawing only beads gives a car that is parked;
 * drawing only streaks gives a car in a wind tunnel.
 *
 * Each bead is a tiny radial gradient with a bright rim: a water droplet is a
 * lens, and what the eye recognises is not the water but the bent highlight at
 * its edge.
 */
export function rainGlass() {
  return cached("rainGlass", () => {
    const size = res(0.5);
    const rng = makeRng(6301);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, size, size);

    // Streaks first, so beads sit on top of them.
    ctx.lineCap = "round";
    for (let i = 0; i < Math.round(size * 0.12); i++) {
      const x = rng() * size;
      const y = rng() * size;
      const len = size * (0.04 + rng() * 0.16);
      ctx.strokeStyle = `rgba(255,255,255,${0.1 + rng() * 0.22})`;
      ctx.lineWidth = 1 + rng() * 2.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      // Streaks run up the screen, not down: at speed the airflow beats
      // gravity, and this is the detail that makes a windscreen read as moving.
      ctx.lineTo(x + (rng() - 0.5) * size * 0.01, y - len);
      ctx.stroke();
    }

    for (let i = 0; i < Math.round(size * 0.55); i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 1 + rng() * 4.5;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.22 + rng() * 0.3})`);
      g.addColorStop(0.55, "rgba(255,255,255,0.06)");
      g.addColorStop(0.92, `rgba(255,255,255,${0.3 + rng() * 0.4})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(maxAnisotropy, getPlatform().settings.anisotropy);
    SHARED.add(tex);
    return tex;
  });
}

/**
 * A smoke / fog billboard.
 *
 * One soft blob with its own internal structure, drawn with a radial alpha
 * falloff multiplied by noise. Used for the black mass on the road and for the
 * wraith's body: a dozen of these at different scales and rotations, drifting
 * against each other, is how volumetric smoke is faked in every real-time
 * engine, and it costs nothing next to an actual volume.
 */
export function smokePuff() {
  return cached("smokePuff", () => {
    const size = 256;
    const field = fbm(size, { octaves: 5, cells: 4, gain: 0.58, seed: 3301 });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const half = size / 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const dx = (x - half) / half;
        const dy = (y - half) / half;
        const r = Math.sqrt(dx * dx + dy * dy);
        // Smooth radial falloff, squared so the edge is soft rather than a
        // visible disc, multiplied by noise so the blob has internal shape.
        const fall = Math.max(0, 1 - r);
        const a = fall * fall * (0.35 + field[i] * 0.9);
        const p = i * 4;
        // Mid grey, not black: an additive-looking dark puff is impossible, so
        // the colour is carried by the material's `color` and this is the mask.
        d[p] = d[p + 1] = d[p + 2] = 150;
        d[p + 3] = clampByte(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(maxAnisotropy, getPlatform().settings.anisotropy);
    SHARED.add(tex);
    return tex;
  });
}

export function glowSprite() {
  return cached("glow", () => {
    const size = 128;
    return canvasTex(
      size,
      (ctx, s) => {
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.25, "rgba(255,255,255,0.5)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
      },
      { repeat: false },
    );
  });
}

/**
 * Text written on a wall, as a transparent decal.
 *
 * The first room's instruction - MAKE THE ROOM BIGGER - is drawn this way so
 * it can be localised and so it can be scrawled rather than printed.
 */
export function wallText(text, { width = 1024, height = 256, font = "700 96px Cinzel, Georgia, serif" } = {}) {
  return cached(`text:${text}:${width}`, () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    /*
     * Fit the string to the canvas before drawing it.
     *
     * The size was hard-coded at first and the English string overflowed a
     * 1024 px plate by about 15% - the player read "AKE THE ROOM BIGGE".
     * Tamil and any future language would have overflowed by different
     * amounts again, so the size is measured rather than guessed.
     */
    const margin = width * 0.06;
    let px = Math.round(height * 0.42);
    for (let i = 0; i < 12; i++) {
      ctx.font = font.replace(/\d+px/, `${px}px`);
      if (ctx.measureText(text).width <= width - margin * 2) break;
      px = Math.round(px * 0.92);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Drawn three times with tiny offsets and low alpha: a single crisp pass
    // looks printed, and this was supposed to be written by hand in a hurry.
    const rng = makeRng(991);
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate((rng() - 0.5) * 4, (rng() - 0.5) * 4);
      ctx.rotate((rng() - 0.5) * 0.012);
      ctx.fillStyle = `rgba(28,26,24,${i === 0 ? 0.82 : 0.3})`;
      ctx.fillText(text, width / 2, height / 2);
      ctx.restore();
    }

    // Eat into the strokes so the paint looks dragged and partly absorbed.
    ctx.globalCompositeOperation = "destination-out";
    speckle(ctx, Math.max(width, height), Math.round(width / 3), 773, {
      min: 0.6,
      max: 2.6,
      alpha: 0.5,
    });
    ctx.globalCompositeOperation = "source-over";

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(maxAnisotropy, getPlatform().settings.anisotropy);
    SHARED.add(tex);
    return tex;
  });
}

/** Clock face, drawn at a fixed size because it is read up close. */
export function clockFace() {
  return cached("clockface", () => {
    const size = 512;
    return canvasTex(
      size,
      (ctx, s) => {
        const r = s / 2;
        ctx.fillStyle = "#e8e3d6";
        ctx.fillRect(0, 0, s, s);

        // Age the paper before anything is printed on it.
        const g = ctx.createRadialGradient(r, r, r * 0.2, r, r, r);
        g.addColorStop(0, "rgba(255,250,235,0)");
        g.addColorStop(1, "rgba(120,100,70,0.3)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);

        ctx.translate(r, r);
        ctx.strokeStyle = "#241f1a";
        ctx.fillStyle = "#241f1a";

        for (let i = 0; i < 60; i++) {
          const hour = i % 5 === 0;
          const a = (i / 60) * Math.PI * 2;
          ctx.lineWidth = hour ? s * 0.016 : s * 0.006;
          ctx.beginPath();
          ctx.moveTo(Math.sin(a) * r * 0.86, -Math.cos(a) * r * 0.86);
          ctx.lineTo(Math.sin(a) * r * (hour ? 0.76 : 0.81), -Math.cos(a) * r * (hour ? 0.76 : 0.81));
          ctx.stroke();
        }

        ctx.font = `600 ${s * 0.12}px "Share Tech Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let h = 1; h <= 12; h++) {
          const a = (h / 12) * Math.PI * 2;
          ctx.fillText(String(h), Math.sin(a) * r * 0.63, -Math.cos(a) * r * 0.63);
        }

        ctx.translate(-r, -r);
        speckle(ctx, s, 300, 613, { min: 0.4, max: 1.8, alpha: 0.12 });
      },
      { repeat: false },
    );
  });
}

/* -------------------------------------------------------------------------- *
 * Prewarm
 * -------------------------------------------------------------------------- */

/**
 * Generate every surface up front, yielding between each one.
 *
 * Each surface costs tens to hundreds of milliseconds of pure JavaScript -
 * several octaves of noise over up to a million pixels, then a normal map
 * derived from the same field. Generating them lazily on first use meant that
 * cost landed in one unbroken block during boot, and a block of that length
 * is indistinguishable from the page having hung: the splash froze, the
 * progress bar stopped, and on a slow machine the browser offered to kill the
 * tab.
 *
 * Yielding twice between surfaces hands the main thread back long enough for
 * the bar to repaint. The total time is slightly worse; the perceived time is
 * far better, because the player can see it working.
 */
export async function prewarm(onProgress) {
  const yieldFrame = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Ordered so the surfaces the first room actually shows arrive first. If a
  // device is slow enough to matter, it is better to be waiting on the chair
  // fabric than on the walls.
  const steps = [
    ["stSurfaces", () => concrete()],
    ["stSurfaces", () => wood(6)],
    ["stSurfaces", () => plaster()],
    ["stProps", () => wood(3)],
    ["stProps", () => metal()],
    ["stProps", () => fabric()],
    ["stProps", () => grime()],
    ["stProps", () => clockFace()],
    ["stProps", () => glowSprite()],
  ];

  for (let i = 0; i < steps.length; i++) {
    const [key, make] = steps[i];
    make();
    onProgress?.((i + 1) / steps.length, key);
    await yieldFrame();
  }
}

/** Dispose every generated texture. Only used when tearing the game down. */
export function disposeAll() {
  for (const entry of cache.values()) {
    if (entry.isTexture) entry.dispose();
    else for (const key in entry) entry[key]?.dispose?.();
  }
  cache.clear();
  SHARED.clear();
}
