/* Velocity Rift game bundle. Built from src/ by tools/build.mjs; edit the files in src/ and rebuild. */

/* ===== src/01-engine.js ===== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

window.__vrLoaded = true;
{ const e = document.getElementById('err'); if (e && e.dataset.slow) { e.hidden = true; delete e.dataset.slow; } }
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const dampAngle = (a, b, k, dt) => a + wrapA(b - a) * (1 - Math.exp(-k * dt));
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoise(seed) {
  const r = mulberry(seed); const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint16Array(512); for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = new Float32Array(256); for (let i = 0; i < 256; i++) g[i] = r() * 2 - 1;
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const X = xi & 255, Y = yi & 255;
    const a = g[p[p[X] + Y]], b = g[p[p[X + 1] + Y]], c = g[p[p[X] + Y + 1]], d = g[p[p[X + 1] + Y + 1]];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  return (x, y, oct = 4) => { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < oct; i++) { s += n2(x * f + i * 17.3, y * f - i * 9.1) * a; t += a; a *= .5; f *= 2.03; } return s / t; };
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('vrift:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('vrift:' + k, JSON.stringify(v)); } catch (e) { } }
};
const fmt = t => { if (!isFinite(t)) return '--:--.---'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); };

/* ================= RENDERER ================= */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const MAXANISO = renderer.capabilities.getMaxAnisotropy();
const pmrem = new THREE.PMREMGenerator(renderer);
const IS_TOUCH = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');
/* Two different things, deliberately kept apart.
   `touch` means a coarse pointer: that device needs the on-screen control rig and
   the phone HUD whatever size its screen is.
   `phone` additionally means the screen is too small for the desktop garage rail,
   and switches in the separate garage design in css/mobile.css. A touch laptop is
   the first without the second.

   The test is on EITHER edge, not on width alone. Width alone looks right until
   you remember the Android app is locked to landscape (sensorLandscape in the
   manifest): a current phone is 880-930 CSS px across on its side, so a
   width-only rule leaves every one of them on the desktop rail - the exact
   layout the phone design exists to replace. What actually marks out a phone is
   that its SHORT edge is small, and that stays true however it is held. */
const NARROW = matchMedia('(max-width: 860px), (max-height: 560px)');
const IS_PHONE = () => IS_TOUCH && NARROW.matches;
/* Set before anything paints, so the desktop rail is never visible for a frame
   on a phone, and kept in step with the viewport from then on. */
const syncPhoneClass = () => document.body.classList.toggle('phone', IS_PHONE());
syncPhoneClass();
NARROW.addEventListener('change', syncPhoneClass);
/* Phones used to start on 'low', which meant no retina pixels and no MSAA - the game
   looked soft on hardware that can do far better. Anything with a modern core count
   starts sharp instead; adaptRes() still drops the resolution if frames get slow. */
const PHONE_TIER = (navigator.hardwareConcurrency || 4) >= 6 ? 'high' : 'low';

const S = {
  car: store.get('car', 0), stage: store.get('stage', 0), laps: store.get('laps', 3), diff: store.get('diff', 1),
  quality: store.get('quality', IS_TOUCH ? PHONE_TIER : 'high'), pads: store.get('pads', null), padAlpha: store.get('padAlpha', 1),
  steerMode: store.get('steerMode', 'pads'), steerSens: store.get('steerSens', 1), music: store.get('music2', 'synth'), lang: store.get('lang', (navigator.language || '').toLowerCase().startsWith('ta') ? 'ta' : 'en'), voice: store.get('voice', true), name: store.get('name', ''), paints: store.get('paints', {}), finishes: store.get('finishes', {}), cam: 0, mode: 'menu'
};
const QUALITY = {
  low: { pr: 1, shadow: 1024, samples: 0, density: .45, terrain: 160 },
  high: { pr: 1.5, shadow: 2048, samples: 4, density: .8, terrain: 220 },
  ultra: { pr: 2, shadow: 4096, samples: 4, density: 1.1, terrain: 280 }
};
let composer = null, renderPass = null, bloom = null;
let activeScene = null, activeCamera = null;
function buildComposer(scene, camera, bloomCfg) {
  const q = QUALITY[S.quality];
  const pr = Math.min(window.devicePixelRatio || 1, q.pr) * (window.__perfScale || 1);
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: q.samples });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr); composer.setSize(w, h);
  renderPass = new RenderPass(scene, camera); composer.addPass(renderPass);
  bloom = new UnrealBloomPass(new THREE.Vector2(w, h), bloomCfg.strength, bloomCfg.radius, bloomCfg.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  activeScene = scene; activeCamera = camera;
  renderer.shadowMap.enabled = q.shadow > 0;
}
addEventListener('resize', () => {
  if (!composer) return;
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  if (activeCamera) { activeCamera.aspect = w / h; activeCamera.updateProjectionMatrix(); }
});

/* ================= TEXTURES ================= */
function canvasTex(w, h, draw, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAXANISO; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(g, w, h, n, seed, a = .06) {
  const r = mulberry(seed);
  for (let i = 0; i < n; i++) { const v = r() > .5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${r() * a})`; const s = 1 + r() * 2.2; g.fillRect(r() * w, r() * h, s, s); }
}
function roadTextures(st) {
  const map = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = st.asphalt; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 14000, 3, .09);
    for (const x of [.28, .72]) { const gr = g.createLinearGradient(w * x - 50, 0, w * x + 50, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, 'rgba(0,0,0,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(w * x - 50, 0, 100, h); }
    g.fillStyle = st.edge; g.fillRect(w * .03, 0, w * .016, h); g.fillRect(w * .954, 0, w * .016, h);
    g.fillStyle = st.center; g.fillRect(w * .494, 0, w * .012, h * .45);
  });
  let emissive = null;
  if (st.glowLines) emissive = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = st.edge; g.fillRect(w * .03, 0, w * .016, h); g.fillRect(w * .954, 0, w * .016, h);
    g.fillStyle = st.center; g.fillRect(w * .494, 0, w * .012, h * .45);
  });
  let rough = null;
  if (st.wet) rough = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    const r = mulberry(11);
    for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, rr = 12 + r() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(10,10,10,.95)'); gr.addColorStop(1, 'rgba(10,10,10,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  }, { srgb: false });
  return { map, emissive, rough };
}
function stripeTex(a, b, n = 2) {
  return canvasTex(64, 128, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, i * h / n, w, h / n); } speckle(g, w, h, 300, 5, .08); });
}
function barrierTex(st) {
  return canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = st.barrier; g.fillRect(0, 0, w, h); speckle(g, w, h, 5000, 8, .07);
    g.fillStyle = st.barrierStripe; g.fillRect(0, h * .62, w, h * .14);
    g.font = 'italic 700 52px "Chakra Petch", Arial, sans-serif'; g.textBaseline = 'middle';
    g.fillStyle = st.barrierText; g.fillText('VELOCITY RIFT', 30, h * .32); g.fillText(st.sponsor, 560, h * .32);
  });
}
function barrierGlowTex(st) {
  return canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = st.barrierStripe; g.fillRect(0, h * .62, w, h * .14); });
}
function checkerTex() {
  return canvasTex(256, 64, (g, w, h) => { const s = 16; for (let y = 0; y < h / s; y++)for (let x = 0; x < w / s; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * s, y * s, s, s); } });
}
function noiseTex(seed, base = 200, amp = 55) {
  return canvasTex(256, 256, (g, w, h) => {
    const id = g.createImageData(w, h); const n = makeNoise(seed);
    for (let y = 0; y < h; y++)for (let x = 0; x < w; x++) {
      const tx = x / w, ty = y / h;
      // tileable blend of 4 samples
      const v = (n(tx * 8, ty * 8, 3) * (1 - tx) * (1 - ty) + n((tx - 1) * 8, ty * 8, 3) * tx * (1 - ty) + n(tx * 8, (ty - 1) * 8, 3) * (1 - tx) * ty + n((tx - 1) * 8, (ty - 1) * 8, 3) * tx * ty);
      const c = clamp(base + v * amp * 2, 0, 255); const i = (y * w + x) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = c; id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
  });
}
function waterNormalTex() {
  const size = 256; const hgt = new Float32Array(size * size);
  const waves = []; const r = mulberry(21);
  for (let i = 0; i < 18; i++) waves.push([Math.floor(r() * 9) - 4 || 1, Math.floor(r() * 9) - 4 || 2, r() * 6.28, .3 + r()]);
  for (let y = 0; y < size; y++)for (let x = 0; x < size; x++) { let v = 0; for (const [a, b, ph, amp] of waves) v += Math.sin((a * x + b * y) / size * 6.2832 + ph) * amp / Math.hypot(a, b); hgt[y * size + x] = v; }
  return canvasTex(size, size, (g, w, h) => {
    const id = g.createImageData(w, h);
    for (let y = 0; y < h; y++)for (let x = 0; x < w; x++) {
      const dx = hgt[y * w + (x + 1) % w] - hgt[y * w + (x - 1 + w) % w], dy = hgt[((y + 1) % h) * w + x] - hgt[((y - 1 + h) % h) * w + x];
      const nx = -dx * 2, ny = -dy * 2, nz = 1, l = Math.hypot(nx, ny, nz); const i = (y * w + x) * 4;
      id.data[i] = (nx / l * .5 + .5) * 255; id.data[i + 1] = (ny / l * .5 + .5) * 255; id.data[i + 2] = (nz / l * .5 + .5) * 255; id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
  }, { srgb: false });
}
function glowSprite() {
  return canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { repeat: false });
}
function textPanelTex(text, fg, bg, w = 1024, h = 160, font = 'italic 700 110px "Chakra Petch", Arial') {
  return canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 6); }, { repeat: false });
}

/* ================= TRACK ================= */
function buildTrack(def) {
  const pts = def.points.map(([x, z, y]) => new THREE.Vector3(x, y || 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const L = curve.getLength(); const N = Math.round(L / 1.6);
  const P = curve.getSpacedPoints(N); P.pop();
  if (def.jumps) for (const [u, hgt] of def.jumps) {
    const c = Math.round(u * N), up = Math.round(32 / (L / N)), down = Math.round(6 / (L / N));
    for (let k = -up; k <= down; k++) { const i = (c + k + N) % N; const f = k <= 0 ? 1 - Math.pow(-k / up, 1.6) : 1 - k / down; P[i].y += hgt * Math.max(0, f); }
  }
  const T = [], R = [], curv = new Float32Array(N), seg = L / N;
  for (let i = 0; i < N; i++) {
    const a = P[(i - 1 + N) % N], b = P[(i + 1) % N];
    const t = new THREE.Vector3().subVectors(b, a).normalize(); T.push(t);
    R.push(new THREE.Vector3(-t.z, 0, t.x).normalize());
  }
  for (let i = 0; i < N; i++) {
    const t0 = T[(i - 7 + N) % N], t1 = T[(i + 7) % N];
    curv[i] = wrapA(Math.atan2(t1.x, t1.z) - Math.atan2(t0.x, t0.z)) / (14 * seg);
  }
  const coarse = []; for (let i = 0; i < N; i += 8) coarse.push(i);
  const W = def.width;
  const tr = { curve, P, T, R, N, L, seg, curv, coarse, W, half: W / 2, wall: W / 2 + 2.4, gravity: def.gravity || 0 };
  if (def.shortcut) tr.branch = buildBranch(tr, def.shortcut);
  return tr;
}
function buildBranch(tr, sc) {
  const { P, R, T, N } = tr; const i = Math.round(sc.u0 * N), j = Math.round(sc.u1 * N), s = sc.side, off = tr.half - 1;
  const A = P[i].clone().addScaledVector(R[i], s * off), B = P[j].clone().addScaledVector(R[j], s * off);
  const ch = Math.hypot(B.x - A.x, B.z - A.z);
  const curve = new THREE.CubicBezierCurve3(A, A.clone().addScaledVector(T[i], ch * .38), B.clone().addScaledVector(T[j], -ch * .38), B);
  const Lb = curve.getLength(), n = Math.round(Lb / 1.6); const Pb = curve.getSpacedPoints(n); const M = Pb.length;
  const Tb = [], Rb = [], curv = new Float32Array(M), seg = Lb / n;
  for (let k = 0; k < M; k++) { const a = Pb[Math.max(k - 1, 0)], b2 = Pb[Math.min(k + 1, M - 1)]; const t = new THREE.Vector3().subVectors(b2, a).normalize(); Tb.push(t); Rb.push(new THREE.Vector3(-t.z, 0, t.x).normalize()); }
  for (let k = 0; k < M; k++) { const t0 = Tb[Math.max(k - 7, 0)], t1 = Tb[Math.min(k + 7, M - 1)]; const span = Math.min(k + 7, M - 1) - Math.max(k - 7, 0); curv[k] = wrapA(Math.atan2(t1.x, t1.z) - Math.atan2(t0.x, t0.z)) / (Math.max(span, 1) * seg); }
  const coarse = []; for (let k = 0; k < M; k += 8) coarse.push(k);
  return { i, j, side: s, P: Pb, T: Tb, R: Rb, N: M, L: Lb, seg, curv, coarse, W: sc.width, half: sc.width / 2, wall: sc.width / 2 + 1.6, grip: sc.grip, top: sc.top, surface: sc.surface, label: sc.label };
}
function trackNearest(tr, x, z, low = false) {
  let bi = 0, bd = Infinity;
  for (const i of tr.coarse) { const p = tr.P[i]; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  let fi = bi;
  for (let k = -8; k <= 8; k++) { const i = (bi + k + tr.N) % tr.N; const p = tr.P[i]; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; fi = i; } }
  let y = tr.P[fi].y, d = Math.sqrt(bd);
  if (low) { const r2 = (tr.half + 26) ** 2; for (const i of tr.coarse) { const p = tr.P[i]; if (p.y < y && (p.x - x) ** 2 + (p.z - z) ** 2 < r2) y = p.y; } }
  const br = tr.branch;
  if (br) {
    let kb = 0, bb = Infinity; for (const k of br.coarse) { const q = br.P[k]; const dd = (q.x - x) ** 2 + (q.z - z) ** 2; if (dd < bb) { bb = dd; kb = k; } }
    for (let k = Math.max(0, kb - 8); k <= Math.min(br.N - 1, kb + 8); k++) { const q = br.P[k]; const dd = (q.x - x) ** 2 + (q.z - z) ** 2; if (dd < bb) { bb = dd; kb = k; } }
    const db = Math.sqrt(bb) + (tr.half - br.half);
    if (db < d) { d = db; y = low ? Math.min(y, br.P[kb].y) : br.P[kb].y; }
  }
  return { i: fi, d, y };
}
function ribbon(tr, o0, o1, y0, y1, vScale, mask, open = false) {
  const pos = [], uv = [], idx = [];
  const { P, R, seg } = tr; const N = open ? tr.N - 1 : tr.N;
  for (let i = 0; i <= N; i++) {
    const k = open ? i : i % tr.N, p = P[k], r = R[k];
    pos.push(p.x + r.x * o0, p.y + y0, p.z + r.z * o0, p.x + r.x * o1, p.y + y1, p.z + r.z * o1);
    const v = i * seg / vScale; uv.push(0, v, 1, v);
  }
  for (let i = 0; i < N; i++) { if (mask && !mask[i]) continue; const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function orientOnTrack(obj, tr, i, lat, yOff = 0) {
  const p = tr.P[i], r = tr.R[i], t = tr.T[i];
  obj.position.set(p.x + r.x * lat, p.y + yOff, p.z + r.z * lat);
  obj.rotation.set(0, Math.atan2(t.x, t.z), 0);
  return obj;
}

/* ================= SHADERS ================= */
const skyGradientMat = (top, mid, bottom, glowCol, glowDir) => new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { cTop: { value: new THREE.Color(top) }, cMid: { value: new THREE.Color(mid) }, cBot: { value: new THREE.Color(bottom) }, cGlow: { value: new THREE.Color(glowCol) }, gDir: { value: glowDir.clone().normalize() } },
  vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
  fragmentShader: `uniform vec3 cTop,cMid,cBot,cGlow,gDir; varying vec3 vDir;
  void main(){ float h=vDir.y; vec3 c=mix(cMid,cTop,smoothstep(0.02,0.55,h)); c=mix(cBot,c,smoothstep(-0.25,0.02,h));
  float g=max(dot(normalize(vec3(vDir.x,0.,vDir.z)),normalize(vec3(gDir.x,0.,gDir.z))),0.); c+=cGlow*pow(g,6.)*smoothstep(0.35,0.,abs(h-0.03));
  c+=cGlow*0.25*exp(-abs(h)*14.); gl_FragColor=vec4(c,1.); }`
});
function starField(n, radius, seed, minY = .05) {
  const r = mulberry(seed); const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x, y, z; do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1 || y < minY);
    const l = Math.hypot(x, y, z); pos.set([x / l * radius, y / l * radius, z / l * radius], i * 3);
    const b = .5 + r() * 1.8; const tint = r(); col.set([b * (tint > .8 ? .8 : 1), b * .95, b * (tint < .2 ? .75 : 1.1)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -1; return pts;
}
function weather(kind, count) {
  const r = mulberry(99); const box = kind === 'rain' ? [90, 60, 90] : [120, 70, 120];
  const pos = new Float32Array(count * 3); for (let i = 0; i < count; i++) pos.set([r() * box[0], r() * box[1], r() * box[2]], i * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: kind === 'rain' ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) }, uSpeed: { value: kind === 'rain' ? 38 : 3.2 }, uSize: { value: kind === 'rain' ? 1.3 : 0.4 }, uScale: { value: 600 }, uDrift: { value: kind === 'rain' ? .3 : 2.2 }, uColor: { value: kind === 'rain' ? new THREE.Color(.55, .7, 1.0) : new THREE.Color(1, 1, 1) }, uRain: { value: kind === 'rain' ? 1 : 0 } },
    vertexShader: `uniform float uTime,uSpeed,uSize,uScale,uDrift; uniform vec3 uCam,uBox; varying float vF;
    void main(){ vec3 p=position; p.y-=uTime*uSpeed*(0.8+fract(position.x*1.37)*0.4); p.x+=sin(uTime*0.6+position.z*0.3)*uDrift; p.z+=cos(uTime*0.5+position.x*0.2)*uDrift*0.6;
    p=mod(p-uCam,uBox)-uBox*0.5+uCam; vec4 mv=modelViewMatrix*vec4(p,1.); gl_PointSize=uSize*uScale/max(-mv.z,0.1); vF=smoothstep(60.,5.,-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uRain; varying float vF;
    void main(){ vec2 c=gl_PointCoord-0.5; float a; if(uRain>0.5){ a=(1.-smoothstep(0.0,0.06,abs(c.x)))*(1.-smoothstep(0.2,0.5,abs(c.y)))*0.22; } else { a=1.-smoothstep(0.1,0.5,length(c)); a*=0.9; }
    if(a<0.01)discard; gl_FragColor=vec4(uColor,a*vF); }`
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; return pts;
}

/* ================= PARTICLES ================= */
class Particles {
  constructor(max, additive) {
    this.max = max; this.n = 0; this.cursor = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grow = new Float32Array(max); this.a0 = new Float32Array(max); this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('size', this.aSize); g.setAttribute('alpha', this.aAlpha);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; uniform float uScale; varying float vA; varying vec3 vC;
      void main(){ vA=alpha; vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*uScale/max(-mv.z,0.1); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5)discard; float a=smoothstep(0.5,0.0,d); gl_FragColor=vec4(vC,a*a*vA); }`
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
  }
  emit(x, y, z, vx, vy, vz, r, g, b, size, life, grow, alpha, grav = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([r, g, b], i * 3);
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grow[i] = grow; this.a0[i] = alpha; this.alpha[i] = alpha; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      const dr = Math.exp(-1.6 * dt); this.vel[k] *= dr; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const f = Math.max(this.life[i] / this.maxLife[i], 0); this.alpha[i] = this.a0[i] * f * Math.min(1, (1 - f) * 8 + .2);
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
}
class Skids {
  constructor(max) {
    this.max = max; this.i = 0;
    const g = new THREE.PlaneGeometry(.26, 1); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: .55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(g, m, max); this.mesh.frustumCulled = false;
    const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, z);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3(); this.e = new THREE.Euler();
  }
  add(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz); if (len < .05 || len > 6) return;
    this.p.set((a.x + b.x) / 2, (a.y + b.y) / 2 + .03, (a.z + b.z) / 2);
    this.e.set(0, Math.atan2(dx, dz), 0); this.q.setFromEuler(this.e); this.s.set(1, 1, len + .05);
    this.m.compose(this.p, this.q, this.s); this.mesh.setMatrixAt(this.i, this.m); this.i = (this.i + 1) % this.max;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}


/* ===== src/02-cars.js ===== */

/* ================= CARS ================= */
const CARS = [
  { name: 'Kestrel GT', cls: 'Front-engine grand tourer', color: '#d8321c', accent: '#f4efe6', spd: .82, acc: .78, hnd: .8, num: 7, finish: 'gloss', livery: 'stripes',
    D: { L: 4.62, W: 2.0, rw: -1.42, fw: 1.46, mid: .42, n: 2.6, nb: 5, tuck: .22, flare: .05, yb: .27,
      yt: [[0, .58], [.02, .78], [.07, .88], [.2, .92], [.36, .92], [.56, .9], [.63, .88], [.8, .8], [.92, .7], [.975, .6], [1, .48]],
      w: [[0, .6], [.02, .83], [.06, .93], [.2, 1.0], [.5, .95], [.8, 1.0], [.93, .93], [.98, .8], [1, .5]],
      cab: { t0: .16, t1: .64, h: [[0, 0], [.1, .1], [.36, .28], [.62, .33], [.78, .3], [.93, .12], [1, 0]], w: [[0, .56], [.3, .72], [.7, .76], [1, .68]] },
      wing: 'duck', vents: true } },
  { name: 'Mako RS', cls: 'Mid-engine supercar', color: '#1646e0', accent: '#8ff3ff', spd: .97, acc: .7, hnd: .72, num: 21, finish: 'gloss', livery: 'shark',
    D: { L: 4.72, W: 2.04, rw: -1.46, fw: 1.34, mid: .38, n: 2.4, nb: 5, tuck: .26, flare: .07, yb: .25,
      yt: [[0, .64], [.02, .86], [.07, .94], [.17, .97], [.3, .96], [.45, .9], [.62, .8], [.78, .73], [.92, .62], [.98, .5], [1, .4]],
      w: [[0, .66], [.03, .9], [.18, 1.05], [.34, 1.0], [.5, .92], [.66, .94], [.82, .98], [.94, .9], [.99, .72], [1, .48]],
      cab: { t0: .3, t1: .7, h: [[0, 0], [.12, .2], [.38, .37], [.6, .36], [.84, .2], [1, 0]], w: [[0, .55], [.4, .7], [.8, .74], [1, .66]] },
      wing: 'big', intakes: true, vents: true } },
  { name: 'Solaris X', cls: 'Rally hatch', color: '#f2ad00', accent: '#101114', spd: .76, acc: .97, hnd: .84, num: 3, finish: 'gloss', livery: 'rally',
    D: { L: 4.3, W: 2.0, rw: -1.36, fw: 1.3, mid: .45, n: 3.4, nb: 6, tuck: .16, flare: .09, yb: .32,
      yt: [[0, .86], [.02, 1.02], [.07, 1.09], [.3, 1.1], [.55, 1.07], [.64, 1.02], [.82, .93], [.93, .82], [.985, .68], [1, .56]],
      w: [[0, .78], [.03, .95], [.18, 1.03], [.5, .95], [.82, 1.03], [.95, .96], [.99, .8], [1, .58]],
      cab: { t0: .06, t1: .68, h: [[0, 0], [.04, .3], [.18, .45], [.6, .46], [.8, .38], [.95, .12], [1, 0]], w: [[0, .72], [.3, .8], [.8, .8], [1, .74]] },
      wing: 'roof', scoop: true, flaps: true } },
  { name: 'Nova Drift', cls: 'Widebody drift coupe', color: '#10c796', accent: '#ff3fb4', spd: .8, acc: .83, hnd: .97, num: 44, finish: 'pearl', livery: 'split',
    D: { L: 4.52, W: 2.06, rw: -1.38, fw: 1.4, mid: .42, n: 2.9, nb: 5, tuck: .2, flare: .12, yb: .24,
      yt: [[0, .7], [.02, .9], [.07, .98], [.25, 1.0], [.4, .99], [.6, .95], [.8, .85], [.94, .72], [.985, .6], [1, .5]],
      w: [[0, .66], [.03, .88], [.18, 1.0], [.5, .9], [.82, 1.0], [.95, .92], [.99, .78], [1, .52]],
      cab: { t0: .17, t1: .67, h: [[0, 0], [.1, .2], [.36, .38], [.62, .4], [.8, .34], [.94, .12], [1, 0]], w: [[0, .6], [.35, .74], [.75, .76], [1, .7]] },
      wing: 'gt', canards: true } },
  { name: 'Umbra Phantom', cls: 'Endurance prototype', color: '#16161d', accent: '#a86bff', spd: .93, acc: .9, hnd: .88, num: 99, finish: 'matte', livery: 'neon',
    D: { L: 4.95, W: 2.02, rw: -1.6, fw: 1.52, mid: .35, n: 2.3, nb: 6, tuck: .28, flare: .08, yb: .2,
      yt: [[0, .72], [.02, .86], [.1, .9], [.3, .86], [.45, .78], [.6, .7], [.75, .6], [.9, .48], [.97, .38], [1, .3]],
      w: [[0, .78], [.03, .95], [.2, 1.0], [.4, .85], [.55, .82], [.78, .98], [.94, .92], [.99, .75], [1, .52]],
      cab: { t0: .34, t1: .7, h: [[0, 0], [.14, .28], [.45, .44], [.7, .4], [.9, .2], [1, 0]], w: [[0, .38], [.4, .5], [.8, .52], [1, .44]] },
      wing: 'lmp', fin: true, intakes: true } },
  { name: 'Ronin V8', cls: 'Classic muscle coupe', color: '#7a1020', accent: '#f4efe6', spd: .88, acc: .86, hnd: .66, num: 12, finish: 'gloss', livery: 'muscle',
    D: { L: 4.8, W: 2.02, rw: -1.5, fw: 1.55, mid: .4, n: 3.2, nb: 6, tuck: .14, flare: .06, yb: .3,
      yt: [[0, .7], [.02, .9], [.07, .98], [.2, 1.0], [.35, 1.0], [.5, .98], [.6, .96], [.75, .93], [.9, .88], [.975, .78], [1, .62]],
      w: [[0, .72], [.02, .9], [.1, .98], [.5, .97], [.9, .98], [.98, .88], [1, .64]],
      cab: { t0: .14, t1: .56, h: [[0, 0], [.12, .22], [.35, .36], [.65, .38], [.8, .33], [.94, .1], [1, 0]], w: [[0, .64], [.35, .76], [.8, .78], [1, .72]] },
      wing: 'duck', hoodScoop: true } },
  { name: 'Pulse E-1', cls: 'Electric hypercar', color: '#e8ecf2', accent: '#35e0ff', spd: .9, acc: 1.0, hnd: .82, num: 1, finish: 'pearl', livery: 'ev',
    D: { L: 4.75, W: 2.02, rw: -1.45, fw: 1.42, mid: .36, n: 2.2, nb: 5, tuck: .3, flare: .05, yb: .22,
      yt: [[0, .62], [.02, .82], [.08, .88], [.2, .9], [.35, .88], [.5, .82], [.65, .74], [.8, .66], [.93, .56], [.98, .46], [1, .36]],
      w: [[0, .64], [.03, .9], [.2, 1.0], [.5, .9], [.8, .98], [.95, .9], [.99, .72], [1, .46]],
      cab: { t0: .26, t1: .72, h: [[0, 0], [.12, .24], [.42, .38], [.62, .37], [.86, .2], [1, 0]], w: [[0, .58], [.4, .72], [.8, .74], [1, .66]] },
      wing: 'none', ev: true } },
  { name: 'Dune Raider', cls: 'Off-road buggy', color: '#c8a46a', accent: '#1f1f22', spd: .72, acc: .88, hnd: .78, num: 9, finish: 'matte', livery: 'offroad', offroad: true,
    D: { L: 4.4, W: 2.1, rw: -1.4, fw: 1.35, mid: .5, n: 3.8, nb: 6, tuck: .12, flare: .12, yb: .52, wr: .47,
      yt: [[0, 1.1], [.03, 1.25], [.1, 1.3], [.4, 1.3], [.6, 1.28], [.7, 1.22], [.85, 1.12], [.96, 1.0], [1, .82]],
      w: [[0, .82], [.04, .96], [.2, 1.0], [.8, 1.0], [.96, .94], [1, .7]],
      cab: { t0: .1, t1: .64, h: [[0, 0], [.05, .3], [.2, .46], [.7, .46], [.86, .36], [.96, .1], [1, 0]], w: [[0, .76], [.3, .82], [.8, .82], [1, .76]] },
      wing: 'roof', roofLights: true, bullbar: true, flaps: true } },
  { name: 'Comet LM', cls: 'Retro endurance racer', color: '#0f6d57', accent: '#f6e9c8', spd: .84, acc: .8, hnd: .9, num: 6, finish: 'gloss', livery: 'retro',
    D: { L: 4.5, W: 1.96, rw: -1.4, fw: 1.38, mid: .38, n: 2.2, nb: 4, tuck: .2, flare: .1, yb: .22,
      yt: [[0, .6], [.03, .8], [.1, .86], [.2, .88], [.3, .84], [.45, .78], [.6, .74], [.75, .7], [.88, .64], [.96, .54], [1, .42]],
      w: [[0, .62], [.03, .86], [.2, .98], [.45, .86], [.55, .84], [.8, .97], [.95, .88], [1, .52]],
      cab: { t0: .32, t1: .66, h: [[0, 0], [.15, .26], [.45, .38], [.7, .35], [.9, .16], [1, 0]], w: [[0, .5], [.4, .64], [.8, .66], [1, .58]] },
      wing: 'duck' } },
];
const DRIVERS = [
  { name: 'R. Vega', color: '#e8e4d8', num: 11 }, { name: 'K. Tanaka', color: '#c21f3a', num: 27 }, { name: 'M. Okafor', color: '#2bb3ff', num: 5 },
  { name: 'L. Novak', color: '#ff8a1f', num: 63 }, { name: 'S. Iyer', color: '#7a3cff', num: 18 }, { name: 'J. Moreau', color: '#39d353', num: 88 },
  { name: 'A. Rahman', color: '#ffd23f', num: 31 }, { name: 'E. Lindqvist', color: '#ff5fa2', num: 50 }
];
const PAINTS = ['#d8321c', '#1646e0', '#f2ad00', '#10c796', '#16161d', '#e8ecf2', '#7a1020', '#ff5fa2', '#c8a46a', '#6b3cff', '#0f6d57', '#ff7a1a'];
const carStats = s => ({ top: 64 + s.spd * 22, accel: 11 + s.acc * 12, turn: 1.9 + s.hnd * .9, grip: 5.5 + s.hnd * 5 });

/* ---- sculpted loft bodies ---- */
function keyFn(keys) {
  const n = keys.length;
  return t => {
    if (t <= keys[0][0]) return keys[0][1]; if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0; while (keys[i + 1][0] < t) i++;
    const t0 = keys[i][0], t1 = keys[i + 1][0], u = (t - t0) / (t1 - t0), dt = t1 - t0;
    const p1 = keys[i][1], p2 = keys[i + 1][1];
    const a = keys[Math.max(i - 1, 0)], b = keys[Math.min(i + 2, n - 1)];
    const m1 = i > 0 ? (p2 - a[1]) / (t1 - a[0]) * dt : (p2 - p1);
    const m2 = i + 2 < n ? (b[1] - p1) / (b[0] - t0) * dt : (p2 - p1);
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
  };
}
const WR = .36;
function bodySpec(D) {
  const L = D.L, ytK = keyFn(D.yt), wK = keyFn(D.w), wheels = [D.rw, D.fw], wr = D.wr || WR, ra = wr + .09;
  const sec = t => {
    const z = -L / 2 + t * L; let top = ytK(t), bot = D.yb, w = wK(t) * D.W / 2;
    for (const zw of wheels) {
      const dz = Math.abs(z - zw);
      if (dz < ra) bot = Math.max(bot, wr + Math.sqrt(ra * ra - dz * dz));
      const f = smooth(ra + .45, ra - .05, dz);
      top = Math.max(top, lerp(top, wr + ra + .1, f));
      w += D.flare * f;
    }
    return { z, top, bot: Math.min(bot, top - .05), w };
  };
  return { L, sec, D };
}
function loftPoint(spec, t, th, side, n, nb, tuck, mid, out, secOverride) {
  const s = secOverride || spec.sec(t);
  const c = Math.cos(th), sn = Math.sin(th);
  const e = sn > 0 ? n : nb;
  let x = s.w * Math.pow(Math.abs(c), 2 / e);
  const yy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
  if (sn > 0) x *= 1 - tuck * sn * sn;
  const yc = s.bot + (s.top - s.bot) * mid;
  const y = sn > 0 ? yc + (s.top - yc) * yy : yc + (yc - s.bot) * yy;
  return out.set(side * x, y, s.z);
}
function loftGeometry(secFn, T, M, n, nb, tuck, mid) {
  const pos = [], uv = [], idx = []; const v = new THREE.Vector3(); const RL = 2 * M + 1;
  const ts = []; for (let k = 0; k < T; k++) { const u = k / (T - 1); ts.push(.55 * (.5 - .5 * Math.cos(Math.PI * u)) + .45 * u); }
  for (const t of ts) {
    const s = secFn(t);
    for (let i = 0; i < RL; i++) {
      let th, side;
      if (i <= M) { side = 1; th = -Math.PI / 2 + i * Math.PI / M; } else { side = -1; th = Math.PI / 2 - (i - M) * Math.PI / M; }
      loftPoint(null, t, th, side, n, nb, tuck, mid, v, s); pos.push(v.x, v.y, v.z); uv.push(t, i / (RL - 1));
    }
  }
  for (let k = 0; k < T - 1; k++) for (let i = 0; i < RL - 1; i++) { const a = k * RL + i, b = a + 1, c = a + RL, d = c + 1; idx.push(a, c, b, b, c, d); }
  // caps
  for (const [k, flip] of [[0, true], [T - 1, false]]) {
    const s = secFn(ts[k]); const ci = pos.length / 3; pos.push(0, (s.top + s.bot) / 2, s.z); uv.push(ts[k], .5);
    for (let i = 0; i < RL - 1; i++) { const a = k * RL + i, b = a + 1; flip ? idx.push(ci, a, b) : idx.push(ci, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals face outward (top of the middle section should point up)
  const mi = Math.floor(T / 2) * RL + M, ny = g.attributes.normal.getY(mi);
  if (ny < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
function liveryTexture(spec, color, accent, number) {
  const W = 1024, H = 512; const D = spec.D;
  return canvasTex(W, H, (g) => {
    const base = new THREE.Color(color); g.fillStyle = color; g.fillRect(0, 0, W, H);
    const dark = '#0d0e12'; const acc = accent;
    const V = v => (1 - v) * H; // texture v -> canvas y
    const U = t => t * W;
    // lower body in dark trim
    g.fillStyle = dark; g.fillRect(0, V(.1), W, H * .1); g.fillRect(0, V(1), W, H * .1);
    switch (spec.livery) {
      case 'stripes': g.fillStyle = acc; g.fillRect(0, V(.535), W, H * .028); g.fillRect(0, V(.493), W, H * .028); break;
      case 'shark': { g.fillStyle = acc; for (const s of [0, 1]) { const y0 = s ? V(.86) : V(.14); g.beginPath(); g.moveTo(U(.1), y0); g.lineTo(U(.62), y0); g.lineTo(U(.9), s ? V(.8) : V(.2)); g.lineTo(U(.12), s ? V(.82) : V(.18)); g.closePath(); g.fill(); }
        g.fillStyle = dark; for (let k = 0; k < 3; k++) { g.fillRect(U(.36 + k * .025), V(.3), 7, H * .06); g.fillRect(U(.36 + k * .025), V(.76), 7, H * .06); } break; }
      case 'rally': g.fillStyle = '#f4efe6'; g.fillRect(U(.1), V(.62), U(.55), H * .24); g.fillStyle = acc; g.fillRect(0, V(.2), W, H * .03); g.fillRect(0, V(.83), W, H * .03); g.fillStyle = '#1b6cff'; g.fillRect(0, V(.24), W, H * .02); g.fillRect(0, V(.78), W, H * .02); break;
      case 'split': { g.fillStyle = acc; for (const s of [0, 1]) { g.beginPath(); const yA = s ? V(.9) : V(.1), yB = s ? V(.72) : V(.28); g.moveTo(0, yA); g.lineTo(W, yA); g.lineTo(W, s ? V(.86) : V(.14)); g.lineTo(U(.3), yB); g.lineTo(0, yB); g.closePath(); g.fill(); } break; }
      case 'muscle': g.fillStyle = acc; g.fillRect(0, V(.55), W, H * .05); g.fillRect(0, V(.48), W, H * .05); g.fillRect(U(.05), V(.26), U(.9), H * .02); g.fillRect(U(.05), V(.76), U(.9), H * .02); break;
      case 'ev': { const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(53,224,255,0)'); gr.addColorStop(1, acc); g.fillStyle = gr; g.fillRect(0, V(.2), W, H * .012); g.fillRect(0, V(.81), W, H * .012); g.fillStyle = 'rgba(20,24,32,.85)'; g.fillRect(U(.2), V(.62), U(.55), H * .24); break; }
      case 'offroad': g.fillStyle = 'rgba(40,36,28,.85)'; g.fillRect(0, V(.2), W, H * .1); g.fillRect(0, V(.9), W, H * .1); g.fillStyle = '#ff5a1f'; g.fillRect(U(.1), V(.33), U(.8), H * .025); g.fillRect(U(.1), V(.69), U(.8), H * .025); break;
      case 'retro': g.fillStyle = acc; g.fillRect(U(.9), V(.66), U(.06), H * .32); g.fillRect(0, V(.515), W, H * .03); break;
      case 'neon': g.strokeStyle = acc; g.lineWidth = 5; for (const v of [.33, .67]) { g.beginPath(); g.moveTo(0, V(v)); g.lineTo(W, V(v)); g.stroke(); } g.lineWidth = 2; for (const v of [.3, .7]) { g.beginPath(); g.moveTo(U(.2), V(v)); g.lineTo(W, V(v)); g.stroke(); } break;
    }
    // panel lines: doors and hood seam
    const tDoor0 = (D.cab.t0 + D.cab.t1) / 2 - .1, tDoor1 = tDoor0 + .22;
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 2;
    for (const [v0, v1] of [[.14, .4], [.6, .86]]) { for (const t of [tDoor0, tDoor1]) { g.beginPath(); g.moveTo(U(t), V(v0)); g.lineTo(U(t), V(v1)); g.stroke(); } }
    const hood = D.cab.t1 + .04; g.beginPath(); g.moveTo(U(hood), V(.4)); g.lineTo(U(hood), V(.6)); g.stroke();
    // race number roundels on both doors (mirrored per side)
    const tn = (tDoor0 + tDoor1) / 2;
    for (const side of [1, -1]) {
      g.save(); g.translate(U(tn), side > 0 ? V(.27) : V(.73)); side > 0 ? g.scale(-1, 1) : g.scale(1, -1); g.scale(1, .45);
      g.fillStyle = '#f4efe6'; g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.font = 'italic 700 46px "Chakra Petch", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), 0, 2); g.restore();
    }
    // bonnet number
    g.save(); g.translate(U(Math.min(.93, D.cab.t1 + .14)), V(.5)); g.rotate(-Math.PI / 2); g.scale(.45, 1); g.fillStyle = spec.livery === 'stripes' ? 'rgba(0,0,0,0)' : 'rgba(244,239,230,.9)'; g.font = 'italic 700 40px "Chakra Petch", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), 0, 0); g.restore();
    speckle(g, W, H, 2500, number, .025);
  }, { repeat: false });
}
function canopyTexture(roofColor) {
  return canvasTex(512, 256, (g, W, H) => {
    g.fillStyle = '#0a0d14'; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(120,150,190,.10)'); gr.addColorStop(.5, 'rgba(120,150,190,.02)'); gr.addColorStop(1, 'rgba(120,150,190,.12)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const V = v => (1 - v) * H, U = u => u * W;
    g.fillStyle = roofColor;
    g.fillRect(U(.3), V(.62), U(.42), H * .24);           // roof panel
    for (const v of [.37, .63]) g.fillRect(0, V(v + .025), W, H * .05); // roof rails / A-pillars
    for (const v0 of [.02, .6]) g.fillRect(U(.5), V(v0 + .38), U(.05), H * .38); // B pillars
    g.fillRect(0, V(.05), W, H * .05); g.fillRect(0, V(1), W, H * .05); // belt trim
    g.fillRect(0, 0, U(.05), H); g.fillRect(U(.95), 0, U(.05), H);
  }, { repeat: false });
}
function wheelParts() {
  return {
    tire: sg('tire2', () => { const r0 = .245, r1 = WR, hw = .155; const pts = [[r0, -hw], [r1 - .035, -hw], [r1 - .008, -hw + .025], [r1, -hw + .06], [r1, hw - .06], [r1 - .008, hw - .025], [r1 - .035, hw], [r0, hw]].map(([a, b]) => new THREE.Vector2(a, b)); const g = new THREE.LatheGeometry(pts, 40); g.rotateZ(Math.PI / 2); return g; }),
    rim: sg('rim2', () => {
      const s = new THREE.Shape(); const N = 10;
      for (let k = 0; k <= N * 4; k++) { const a = k / (N * 4) * Math.PI * 2; const phase = k % 4; const r = phase === 0 || phase === 1 ? .245 : .07; const x = Math.cos(a) * r, y = Math.sin(a) * r; k ? s.lineTo(x, y) : s.moveTo(x, y); }
      const g = new THREE.ExtrudeGeometry(s, { depth: .03, bevelEnabled: true, bevelThickness: .012, bevelSize: .01, bevelSegments: 2, curveSegments: 4 });
      g.rotateY(Math.PI / 2); g.translate(.1, 0, 0); return g;
    }),
    barrel: sg('barrel', () => { const g = new THREE.CylinderGeometry(.248, .248, .26, 32, 1, true); g.rotateZ(Math.PI / 2); return g; }),
    disc: sg('disc', () => { const g = new THREE.CylinderGeometry(.2, .2, .03, 28); g.rotateZ(Math.PI / 2); return g; }),
    cap: sg('cap', () => { const g = new THREE.CylinderGeometry(.05, .05, .04, 16); g.rotateZ(Math.PI / 2); g.translate(.13, 0, 0); return g; }),
    cal: sg('cal2', () => new THREE.BoxGeometry(.07, .14, .2))
  };
}
const sharedGeo = {};
const SHARED = new Set();
function sg(key, make) { if (!sharedGeo[key]) { sharedGeo[key] = make(); SHARED.add(sharedGeo[key]); } return sharedGeo[key]; }
function paintMaterial(map, finish) {
  if (finish === 'matte') return new THREE.MeshPhysicalMaterial({ map, metalness: .3, roughness: .5, clearcoat: .35, clearcoatRoughness: .35 });
  if (finish === 'pearl') return new THREE.MeshPhysicalMaterial({ map, metalness: .45, roughness: .24, clearcoat: 1, clearcoatRoughness: .03, iridescence: .5, iridescenceIOR: 1.35 });
  return new THREE.MeshPhysicalMaterial({ map, metalness: .5, roughness: .28, clearcoat: 1, clearcoatRoughness: .04 });
}
function buildCarModel(spec, colorOverride, numberOverride, finishOverride) {
  const D = spec.D, L = D.L, W = D.W, h = L / 2;
  const bs = bodySpec(D);
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const color = colorOverride || spec.color;
  const livery = liveryTexture(spec, color, spec.accent, numberOverride || spec.num);
  const paint = paintMaterial(livery, finishOverride || spec.finish);
  const carbon = new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: .42, metalness: .55 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: .25, metalness: .6 });
  const accent = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: .35, metalness: .4 });
  const add = (geo, mat, x = 0, y = 0, z = 0, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; body.add(m); return m; };
  const bodyGeo = sg('lb_' + spec.name, () => loftGeometry(t => bs.sec(t), 120, 24, D.n, D.nb, D.tuck, D.mid));
  const bodyMesh = add(bodyGeo, paint);
  // canopy
  const cK = { h: keyFn(D.cab.h), w: keyFn(D.cab.w) };
  const canSec = u => { const t = lerp(D.cab.t0, D.cab.t1, u); const s = bs.sec(t); return { z: s.z, top: s.top + cK.h(u), bot: s.top - .07, w: s.w * cK.w(u) }; };
  const canGeo = sg('lc_' + spec.name, () => loftGeometry(canSec, 60, 16, 2.5, 2, .42, .12));
  const roofCol = spec.livery === 'rally' ? '#f4efe6' : (spec.livery === 'neon' ? '#16161d' : '#0d0e12');
  const glass = new THREE.MeshPhysicalMaterial({ map: canopyTexture(roofCol), metalness: .05, roughness: .1, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: .9 });
  add(canGeo, glass);
  bodyMesh.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(); const tmpN = new THREE.Vector3();
  const hitAlong = (x, y, dir, axis = 'z') => {
    const o = new THREE.Vector3(x, y, 0), d = new THREE.Vector3();
    if (axis === 'z') { o.z = dir * 10; d.set(0, 0, -dir); } else if (axis === 'x') { o.set(dir * 10, y, x); d.set(-dir, 0, 0); } else { o.set(x, 10, dir); d.set(0, -1, 0); }
    rc.set(o, d); const hit = rc.intersectObject(bodyMesh)[0]; if (!hit) return null;
    tmpN.copy(hit.face.normal); return { p: hit.point.clone(), n: tmpN.clone() };
  };
  const strip = (pts, r, mat, key) => { if (pts.length < 2) return; const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 6, false); const m = add(g, mat, 0, 0, 0, false); return m; };
  const surfLine = (xs, yFn, dir, off) => xs.map(x => { const hh = hitAlong(x, yFn(x), dir); return hh ? hh.p.add(hh.n.multiplyScalar(off)) : null; }).filter(Boolean);
  // lights
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.3, 2.45, 2.7) });
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, .04, .06) });
  const midY = bs.sec(.97); const fy = midY.bot + (midY.top - midY.bot) * .62;
  for (const s of [1, -1]) {
    const xs = [.34, .46, .58, .7, .8].map(x => x * s * W / 2 / 1.0);
    strip(surfLine(xs, x => fy + Math.abs(x) * .09, 1, .012), .026, headMat);
    const hous = surfLine(xs.map(x => x * 1.02), x => fy + Math.abs(x) * .09 - .045, 1, .006); strip(hous, .04, trim);
  }
  const rearS = bs.sec(.02); const ty = rearS.bot + (rearS.top - rearS.bot) * .72;
  strip(surfLine([-.82, -.6, -.3, 0, .3, .6, .82].map(x => x * W / 2), () => ty, -1, .01), .034, tailMat);
  strip(surfLine([-.8, -.4, 0, .4, .8].map(x => x * W / 2), () => ty - .12, -1, .008), .03, trim);
  // front intake lip and splitter
  const lowF = bs.sec(.985); const iy = lowF.bot + .1;
  strip(surfLine([-.7, -.45, -.2, 0, .2, .45, .7].map(x => x * W / 2), () => iy, 1, 0), .085, trim);
  add(sg('split' + spec.name, () => new THREE.BoxGeometry(W * .88, .04, .42)), carbon, 0, D.yb - .06, h - .2);
  add(sg('diff' + spec.name, () => new THREE.BoxGeometry(W * .78, .05, .5)), carbon, 0, D.yb - .02, -h + .25);
  for (let k = -2; k <= 2; k++) add(sg('fin', () => new THREE.BoxGeometry(.025, .16, .42)), carbon, k * .28, D.yb + .04, -h + .24);
  // exhausts
  const exG = sg('ex2', () => { const g = new THREE.CylinderGeometry(.06, .07, .22, 16, 1, true); g.rotateX(Math.PI / 2); return g; });
  const exMat = new THREE.MeshStandardMaterial({ color: 0xa8abb4, metalness: 1, roughness: .2, side: THREE.DoubleSide });
  const exz = (hitAlong(.3, D.yb + .08, -1) || { p: { z: -h } }).p.z - .02;
  const exX = D.ev ? [] : spec.livery === 'rally' || D.roofLights ? [.55] : spec.D.wing === 'lmp' ? [.18, -.18] : [.42, .3, -.3, -.42];
  exX.forEach(x => add(exG, exMat, x, D.yb + .1, exz, false));
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.6, 6), transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flG = sg('fl', () => { const g = new THREE.ConeGeometry(.1, 1.1, 12, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, -.55); return g; });
  const flames = exX.map(x => add(flG, flameMat, x, D.yb + .1, exz - .1, false)); flames.forEach(f => f.visible = false);
  // wings and aero
  const deck = bs.sec(.06);
  if (D.wing === 'duck') {
    strip(surfLine([-.8, -.4, 0, .4, .8].map(x => x * W / 2 * .9), () => deck.top - .02, -1, .02), .035, carbon);
  } else if (D.wing === 'none') {
  } else if (D.wing === 'roof') {
    const cs = canSec(.03); add(sg('rwing', () => new THREE.BoxGeometry(W * .74, .05, .38)), carbon, 0, cs.top + .02, cs.z - .12).rotation.x = .18;
  } else {
    const big = D.wing === 'big' || D.wing === 'lmp', wy = deck.top + (D.wing === 'lmp' ? .3 : big ? .24 : .34), wz = -h + (D.wing === 'lmp' ? .12 : .32);
    const wingG = sg('wg_' + D.wing, () => { const s = new THREE.Shape(); s.moveTo(-.22, 0); s.quadraticCurveTo(0, .09, .24, .02); s.quadraticCurveTo(0, .02, -.22, 0); const g = new THREE.ExtrudeGeometry(s, { depth: W * (D.wing === 'lmp' ? 1.0 : .96), bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-W * (D.wing === 'lmp' ? .5 : .48), 0, 0); return g; });
    const wing = add(wingG, D.wing === 'gt' ? accent : carbon, 0, wy, wz); wing.rotation.x = -.08; wing.rotation.y = Math.PI;
    const ep = sg('ep2', () => new THREE.BoxGeometry(.025, .17, .44));
    const ex = W * (D.wing === 'lmp' ? .5 : .48); add(ep, carbon, ex, wy + .02, wz); add(ep, carbon, -ex, wy + .02, wz);
    const st = sg('wst_' + D.wing, () => new THREE.BoxGeometry(.04, wy - deck.top + .06, .16));
    for (const s of [1, -1]) add(st, carbon, s * (D.wing === 'gt' ? .55 : .35), (wy + deck.top) / 2, wz + .02);
  }
  if (D.fin) {
    const fs = new THREE.Shape(); const c0 = canSec(0.02), zA = c0.z, topA = c0.top;
    fs.moveTo(zA + .2, topA - .05); fs.lineTo(-h + .15, deck.top + .42); fs.lineTo(-h + .15, deck.top - .05); fs.closePath();
    const fg = new THREE.ExtrudeGeometry(fs, { depth: .03, bevelEnabled: false }); fg.rotateY(-Math.PI / 2); fg.translate(.015, 0, 0);
    add(fg, paint);
  }
  if (D.hoodScoop) { const hs = bs.sec(.8); add(sg('hscoop', () => { const g = new THREE.BoxGeometry(.7, .16, .9); return g; }), carbon, 0, hs.top + .04, hs.z); }
  if (D.roofLights) { const cs = canSec(.62); add(sg('lbar', () => new THREE.BoxGeometry(1.3, .14, .16)), carbon, 0, cs.top + .1, cs.z); for (let k = -2; k <= 2; k++) add(sg('lled', () => new THREE.BoxGeometry(.18, .09, .03)), headMat, k * .25, cs.top + .1, cs.z + .09, false); }
  if (D.bullbar) { const fr = bs.sec(.99); const bb = add(sg('bull', () => { const g = new THREE.TorusGeometry(.62, .045, 8, 24, Math.PI); return g; }), carbon, 0, D.yb + .02, fr.z + .12, false); bb.scale.y = .55; add(sg('bullx', () => new THREE.BoxGeometry(1.3, .07, .07)), carbon, 0, D.yb + .22, fr.z + .12, false); }
  if (D.ev) { strip(surfLine([-.8, -.5, -.2, 0, .2, .5, .8].map(x => x * W / 2), () => ty - .16, -1, .012), .018, new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.accent).multiplyScalar(1.4) })); }
  if (D.scoop) { const cs = canSec(.55); add(sg('scoop', () => { const g = new THREE.BoxGeometry(.5, .1, .5); return g; }), carbon, 0, cs.top + .03, cs.z); }
  if (D.canards) for (const s of [1, -1]) { const c = add(sg('can', () => new THREE.BoxGeometry(.28, .02, .12)), carbon, s * W * .42, fy - .16, h - .18, false); c.rotation.z = s * .25; }
  if (D.flaps) for (const s of [1, -1]) add(sg('flap', () => new THREE.BoxGeometry(.3, .26, .02)), carbon, s * (W / 2 - .2), .28, D.rw - .52, false);
  if (D.intakes) for (const s of [1, -1]) { const hh = hitAlong(D.rw + .75, .6, s, 'x'); if (hh) { const m = add(sg('intake', () => { const g = new THREE.SphereGeometry(.5, 16, 10); g.scale(.06, .3, 1); return g; }), trim, hh.p.x - s * .02, hh.p.y, hh.p.z, false); } }
  if (D.vents) for (const s of [1, -1]) { const zz = lerp(D.cab.t1, 1, .45); const sc = bs.sec(zz); const hh = hitAlong(s * .35, 0, sc.z, 'y'); if (hh) add(sg('vent', () => { const g = new THREE.BoxGeometry(.22, .02, .38); return g; }), trim, hh.p.x, hh.p.y + .005, hh.p.z, false).rotation.x = -.15; }
  // wheels
  const wp = wheelParts();
  const tireM = new THREE.MeshStandardMaterial({ color: 0x131315, roughness: .9, side: THREE.DoubleSide });
  const rimM = new THREE.MeshStandardMaterial({ color: spec.livery === 'rally' ? 0xf4efe6 : spec.livery === 'neon' ? 0x1a1a22 : 0xb9bec8, metalness: .9, roughness: .25 });
  const barrelM = new THREE.MeshStandardMaterial({ color: 0x1b1c21, metalness: .8, roughness: .4, side: THREE.DoubleSide });
  const discM = new THREE.MeshStandardMaterial({ color: 0x6d7078, metalness: .9, roughness: .45 });
  const wheels = [];
  for (const [zw, front] of [[D.fw, true], [D.rw, false]]) for (const s of [1, -1]) {
    const x = s * (D.W / 2 + D.flare * .7 - .2);
    const wr = D.wr || WR; const steerG = new THREE.Group(); steerG.position.set(x, wr, zw); steerG.scale.setScalar(wr / WR); body.add(steerG);
    const spin = new THREE.Group(); steerG.add(spin); spin.scale.x = s;
    const t = new THREE.Mesh(wp.tire, tireM); t.castShadow = true; spin.add(t);
    spin.add(new THREE.Mesh(wp.barrel, barrelM)); spin.add(new THREE.Mesh(wp.rim, rimM)); spin.add(new THREE.Mesh(wp.cap, accent));
    const disc = new THREE.Mesh(wp.disc, discM); disc.position.x = s * .02; steerG.add(disc);
    const cal = new THREE.Mesh(wp.cal, accent); cal.position.set(s * .05, .1, -.12); steerG.add(cal);
    wheels.push({ steerG, spin, front, x, z: zw });
  }
  // underglow + contact shadow
  const ug = new THREE.Mesh(sg('ug' + spec.name, () => { const g = new THREE.PlaneGeometry(W * 1.35, L * 1.1); g.rotateX(-Math.PI / 2); return g; }),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.accent).multiplyScalar(1), map: glowTexture, transparent: true, opacity: .28, blending: THREE.AdditiveBlending, depthWrite: false }));
  ug.position.y = .04; ug.visible = false; root.add(ug);
  const cs = new THREE.Mesh(sg('cs' + spec.name, () => { const g = new THREE.PlaneGeometry(W * 1.2, L * 1.08); g.rotateX(-Math.PI / 2); return g; }),
    new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: glowTexture, transparent: true, opacity: .8, depthWrite: false }));
  cs.position.y = .03; root.add(cs);
  return { root, body, wheels, tailMat, flames, underglow: ug, paint, headMat, L, rearZ: D.rw };
}
const glowTexture = glowSprite(); SHARED.add(glowTexture);

/* ================= PHYSICS ================= */
class Car {
  constructor(spec, opts) {
    this.spec = spec; Object.assign(this, carStats(spec));
    this.name = opts.name; this.tag = opts.tag || opts.name; this.isPlayer = !!opts.isPlayer; this.color = opts.color || spec.color;
    this.model = buildCarModel(spec, opts.color, opts.num, opts.finish);
    this.x = 0; this.z = 0; this.y = 0; this.heading = 0; this.vx = 0; this.vz = 0; this.vf = 0; this.vl = 0;
    this.steer = 0; this.nitro = .4; this.boosting = false; this.idx = 0; this.raceDist = 0; this.along = 0; this.lat = 0;
    this.maxLap = -1; this.lapStart = 0; this.bestLap = Infinity; this.lapTimes = []; this.finished = false; this.finishTime = 0;
    this.pitch = 0; this.roll = 0; this.slope = 0; this.vy = 0; this.air = false; this.airT = 0; this.isRemote = false; this.spinA = 0; this.wrongT = 0; this.hitCool = 0; this.skidPrev = [null, null]; this.drifting = false; this.stuck = 0;
    this.lane = 0; this.laneT = 0; this.skill = 1; this.aiBoost = 1; this.rpm = 900; this.gear = 1; this.throttle = 0; this.braking = false; this.aiPhase = Math.random() * 10;
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get prog() { return this.raceDist + this.along / (game.track ? game.track.seg : 1); }
  place(tr, i, lat) {
    const p = tr.P[i], r = tr.R[i], t = tr.T[i];
    this.x = p.x + r.x * lat; this.z = p.z + r.z * lat; this.y = p.y; this.idx = i; this.heading = Math.atan2(t.x, t.z);
    this.vx = this.vz = this.vf = this.vl = 0; this.steer = 0; this.vy = 0; this.air = false; this.airT = 0;
  }
}
const FX = { onHit: null, onSkid: null };
function stepCar(c, inp, dt, tr) {
  const air = c.air;
  if (air) inp = { steer: inp.steer * .35, throttle: 0, brake: 0, hand: false, nitro: inp.nitro, analog: inp.analog, rev: inp.throttle };
  const hand = inp.hand && Math.abs(c.vf) > 8;
  c.steer = inp.analog ? inp.steer : damp(c.steer, inp.steer, inp.steer === 0 ? 10 : 6, dt);
  const sp = Math.abs(c.vf);
  const k = clamp(sp / 6, 0, 1) / (1 + sp / 30);
  const turn = c.turn * k * (hand ? 1.55 : 1);
  c.heading -= c.steer * turn * dt * (c.vf < -.5 ? -1 : 1);
  const fX = Math.sin(c.heading), fZ = Math.cos(c.heading), rX = -fZ, rZ = fX;
  let vf = c.vx * fX + c.vz * fZ, vl = c.vx * rX + c.vz * rZ;
  const boosting = inp.nitro && c.nitro > .01 && vf > 4;
  c.boosting = boosting;
  if (boosting) c.nitro = Math.max(0, c.nitro - dt * .3);
  const surf = c.onBranch && tr.branch ? tr.branch : null;
  const offK = surf && c.spec.offroad ? .5 : 1;
  const top = c.top * (boosting ? 1.24 : 1) * c.aiBoost * c.skill * (surf ? 1 - (1 - surf.top) * offK : 1);
  let a = 0;
  if (inp.throttle > 0) {
    if (vf < -1 && inp.brake === 0) a += 26;
    a += c.accel * inp.throttle * Math.max(0, 1 - Math.pow(Math.max(vf, 0) / top, 2.2));
    if (boosting) a += 16;
  }
  c.braking = false;
  if (inp.brake > 0) {
    if (vf > 1) { a -= 36 * inp.brake; c.braking = true; }
    else if (vf > -16) a -= 11 * inp.brake;
  }
  if (!inp.throttle && !inp.brake) a -= clamp(vf, -1, 1) * (1.8 + Math.abs(vf) * .05);
  a -= 9.8 * c.slope * .6;
  vf += a * dt;
  if (vf > top) vf = damp(vf, top, 1.6, dt);
  if (!inp.throttle && !inp.brake && Math.abs(vf) < .3) vf = 0;
  const grip = air ? .25 : (hand ? 1.25 : c.grip * (1 - .35 * smooth(.6, 1, Math.abs(vl) / 12))) * (surf ? 1 - (1 - surf.grip) * offK : 1);
  vl *= Math.exp(-grip * dt);
  if (hand) vf *= Math.exp(-.35 * dt);
  vf -= Math.abs(vl) * .25 * dt * Math.sign(vf);
  c.vf = vf; c.vl = vl;
  c.vx = fX * vf + rX * vl; c.vz = fZ * vf + rZ * vl;
  c.drifting = !air && Math.abs(vl) > 3.2 && sp > 12;
  if (c.drifting) c.nitro = Math.min(1, c.nitro + dt * .16);
  c.nitro = Math.min(1, c.nitro + dt * .012);
  c.x += c.vx * dt; c.z += c.vz * dt;
  // track following (main loop plus an optional shortcut branch)
  const N = tr.N, br = tr.branch; let best = c.idx, bd = Infinity;
  for (let j = -24; j <= 24; j++) { const i = (c.idx + j + N) % N; const p = tr.P[i]; const d = (p.x - c.x) ** 2 + (p.z - c.z) ** 2; if (d < bd) { bd = d; best = i; } }
  const pm = tr.P[best], Rm = tr.R[best], Tm = tr.T[best];
  const latM = (c.x - pm.x) * Rm.x + (c.z - pm.z) * Rm.z, alongM = (c.x - pm.x) * Tm.x + (c.z - pm.z) * Tm.z;
  const limM = tr.wall - 1.05; const vM = Math.abs(latM) - limM;
  let useB = false, kb = 0, latB = 0, alongB = 0, vB = Infinity;
  if (br) {
    const dA = wrapI(br.i - c.idx, N), dB = wrapI(br.j - c.idx, N);
    if (c.onBranch || Math.abs(dA) < 45 || Math.abs(dB) < 45) {
      let k0, k1; if (c.onBranch) { k0 = Math.max(0, c.bk - 24); k1 = Math.min(br.N - 1, c.bk + 24); } else if (Math.abs(dA) < 45) { k0 = 0; k1 = Math.min(br.N - 1, 40); } else { k0 = Math.max(0, br.N - 41); k1 = br.N - 1; }
      let bb = Infinity; for (let k = k0; k <= k1; k++) { const q = br.P[k]; const d = (q.x - c.x) ** 2 + (q.z - c.z) ** 2; if (d < bb) { bb = d; kb = k; } }
      const q = br.P[kb], Rb = br.R[kb], Tb = br.T[kb];
      latB = (c.x - q.x) * Rb.x + (c.z - q.z) * Rb.z; alongB = (c.x - q.x) * Tb.x + (c.z - q.z) * Tb.z;
      vB = Math.abs(latB) - (br.wall - 1.05);
      if (kb === 0 && alongB < 0) vB = Math.max(vB, -alongB); if (kb === br.N - 1 && alongB > 0) vB = Math.max(vB, alongB);
      useB = vB < vM && vB < 4;
    }
  }
  let p, R, T, lat, along, lim, seg, nbP;
  if (useB) {
    c.onBranch = true; c.bk = kb;
    const eq = (br.i + Math.round((br.j - br.i) * kb / (br.N - 1))) % N;
    c.raceDist += wrapI(eq - c.idx, N); c.idx = eq;
    p = br.P[kb]; R = br.R[kb]; T = br.T[kb]; lat = latB; along = alongB; lim = br.wall - 1.05; seg = br.seg;
    nbP = along >= 0 ? br.P[Math.min(kb + 1, br.N - 1)] : br.P[Math.max(kb - 1, 0)];
  } else {
    c.onBranch = false;
    c.raceDist += wrapI(best - c.idx, N); c.idx = best;
    p = pm; R = Rm; T = Tm; lat = latM; along = alongM; lim = limM; seg = tr.seg;
    nbP = tr.P[along >= 0 ? (best + 1) % N : (best - 1 + N) % N];
  }
  c.hitCool -= dt;
  if (Math.abs(lat) > lim) {
    const s = Math.sign(lat), over = Math.abs(lat) - lim;
    c.x -= R.x * over * s; c.z -= R.z * over * s; lat = lim * s;
    const vn = c.vx * R.x + c.vz * R.z;
    if (vn * s > 0) {
      c.vx -= R.x * vn * 1.3; c.vz -= R.z * vn * 1.3;
      const imp = Math.abs(vn);
      const fr = Math.exp(-(0.6 + imp * .05) * dt * 6); c.vx *= fr; c.vz *= fr;
      const th = Math.atan2(T.x, T.z); c.heading = dampAngle(c.heading, wrapA(th - c.heading) > Math.PI / 2 || wrapA(th - c.heading) < -Math.PI / 2 ? th + Math.PI : th, imp * .4, dt);
      if (FX.onHit && c.hitCool <= 0 && imp > 2.5) { FX.onHit(c, imp, s, R); c.hitCool = .25; }
    }
    if (FX.onScrape) FX.onScrape(c, s, R);
  }
  c.lat = lat; c.along = along;
  const f = Math.min(Math.abs(along) / seg, 1);
  const yr = lerp(p.y, nbP.y, f);
  if (tr.gravity) {
    const g = tr.gravity;
    if (c.air) {
      c.vy -= g * dt; c.y += c.vy * dt; c.airT += dt;
      if (c.y <= yr) { const imp = -c.vy; c.y = yr; c.air = false; c.vy = 0; if (FX.onLand) FX.onLand(c, imp, c.airT); c.airT = 0; }
    } else {
      const yb = c.y + c.vy * dt - .5 * g * dt * dt;
      if (yr < yb - .05 && sp > 14) { c.air = true; c.airT = 0; c.y = yb; c.vy -= g * dt; }
      else { c.vy = clamp((yr - c.y) / dt, -30, 30); c.y = yr; }
    }
  } else c.y = yr;
  const dirSign = (fX * T.x + fZ * T.z) >= 0 ? 1 : -1;
  c.slope = c.air ? 0 : T.y * dirSign;
  c.pitch = damp(c.pitch, c.air ? clamp(-Math.atan2(c.vy, Math.max(sp, 5)) * .8, -.5, .5) : -Math.asin(clamp(T.y * dirSign, -1, 1)), c.air ? 3 : 10, dt);
  c.roll = damp(c.roll, clamp(-c.steer * sp * .004 + vl * .012, -.09, .09), 5, dt);
  // engine sim
  const gears = [0, .16, .3, .45, .6, .78, 1.0];
  const vr = Math.max(0, vf) / c.top; let g = 1; while (g < 6 && vr > gears[g] * .98) g++;
  const lo = gears[g - 1], hi = gears[g];
  const target = c.air ? (inp.rev ? 7900 : 3200) : vf < .5 ? 900 + (inp.throttle ? 2600 : 0) : 2600 + 5400 * clamp((vr - lo) / (hi - lo), 0, 1.08) + (c.drifting ? 700 : 0);
  c.gear = vf < -.5 ? 'R' : (vf < .5 ? 'N' : g); c.rpm = damp(c.rpm, target, 9, dt); c.throttle = c.air ? (inp.rev || 0) : inp.throttle;
  c.spinA += vf * dt / .36;
}
function wrapI(d, N) { if (d > N / 2) d -= N; if (d < -N / 2) d += N; return d; }
function syncModel(c, dt) {
  const m = c.model;
  m.root.position.set(c.x, c.y, c.z);
  m.root.rotation.set(c.pitch, c.heading, 0, 'YXZ');
  m.body.rotation.z = c.roll; m.body.position.y = Math.sin(performance.now() * .03 + c.aiPhase) * .004 * Math.min(1, c.speed / 20);
  for (const w of m.wheels) { w.spin.rotation.x = c.spinA; if (w.front) w.steerG.rotation.y = -c.steer * .45; }
  m.tailMat.color.setRGB(c.braking ? 3.6 : 1.3, c.braking ? .1 : .04, c.braking ? .14 : .06);
  for (const f of m.flames) { f.visible = c.boosting; if (c.boosting) f.scale.set(1, 1, .7 + Math.random() * .6); }
}
function carCollisions(cars) {
  const cp = (c, s) => [c.x + Math.sin(c.heading) * 1.15 * s, c.z + Math.cos(c.heading) * 1.15 * s];
  for (let i = 0; i < cars.length; i++)for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if ((a.isRemote && b.isRemote) || (a.x - b.x) ** 2 + (a.z - b.z) ** 2 > 36 || Math.abs(a.y - b.y) > 3) continue;
    const wa = a.isRemote ? 0 : (b.isRemote ? 1 : .5), wb = b.isRemote ? 0 : (a.isRemote ? 1 : .5);
    for (const sa of [1, -1]) for (const sb of [1, -1]) {
      const [ax, az] = cp(a, sa), [bx, bz] = cp(b, sb);
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), min = 2.05;
      if (d < min && d > 1e-4) {
        const nx = dx / d, nz = dz / d, push = (min - d) / 2;
        a.x -= nx * push * 2 * wa; a.z -= nz * push * 2 * wa; b.x += nx * push * 2 * wb; b.z += nz * push * 2 * wb;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0) { const imp = -rv * .9; a.vx -= nx * imp * wa; a.vz -= nz * imp * wa; b.vx += nx * imp * wb; b.vz += nz * imp * wb; if (FX.onBump && imp > 2) FX.onBump(a, b, imp, (ax + bx) / 2, (az + bz) / 2); }
      }
    }
  }
}
function vCurve(c, kappa) {
  kappa = Math.max(Math.abs(kappa), 1e-4);
  const A = kappa / 30, B = kappa, C = -c.turn * .93;
  return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
}
function aiInput(c, tr, dt, cars) {
  const N = tr.N;
  c.laneT -= dt;
  if (c.laneT <= 0) { c.laneT = 2 + Math.random() * 4; c.laneBase = (Math.random() * 2 - 1) * (tr.half - 3); }
  // racing line: drift toward inside of upcoming corner
  const kAhead = tr.curv[(c.idx + 25) % N];
  let lane = (c.laneBase || 0) * .6 + clamp(kAhead * 260, -1, 1) * (tr.half - 2.5) * -.55;
  // avoid cars ahead
  for (const o of cars) {
    if (o === c) continue;
    let d = o.idx - c.idx; if (d < -N / 2) d += N; if (d > N / 2) d -= N;
    if (d > 0 && d < 14 && Math.abs(o.lat - lane) < 2.6) { lane = o.lat + (o.lat > 0 ? -3.2 : 3.2); }
  }
  lane = clamp(lane, -tr.half + 1.8, tr.half - 1.8);
  c.lane = damp(c.lane, lane, 1.5, dt);
  const look = Math.round(9 + Math.abs(c.vf) * .42);
  const br = tr.branch; let tx, tz, curvAt = k => tr.curv[(c.idx + k) % N], topMul = 1;
  if (br) {
    const dA = wrapI(br.i - c.idx, N);
    if (c.plan === undefined && dA > 25 && dA < 90) c.plan = Math.random() < .4;
    if (c.plan && !c.onBranch && dA > -3 && dA < 60) c.lane = damp(c.lane, br.side * (tr.half - 2.4), 3, dt);
    if (wrapI(c.idx - br.j, N) > 15 && wrapI(c.idx - br.j, N) < 200) c.plan = undefined;
    if (c.onBranch || (c.plan && dA >= -12 && dA < look)) {
      const k0 = c.onBranch ? c.bk : 0, kt = c.onBranch ? k0 + look : Math.max(3, look - dA);
      const q = kt < br.N ? br.P[kt] : tr.P[(br.j + kt - br.N) % N];
      tx = q.x; tz = q.z; curvAt = k => (k0 + k < br.N ? br.curv[k0 + k] : tr.curv[(br.j + k0 + k - br.N) % N]); topMul = c.onBranch ? br.top : 1;
    }
  }
  if (tx === undefined) { const ti = (c.idx + look) % N; const p = tr.P[ti], r = tr.R[ti]; tx = p.x + r.x * c.lane; tz = p.z + r.z * c.lane; }
  const diff = wrapA(Math.atan2(tx - c.x, tz - c.z) - c.heading);
  let target = c.top * c.skill * c.aiBoost * topMul;
  for (let k = 0; k < 160; k += 4) { const v = vCurve(c, curvAt(k)) * c.skill * (c.onBranch ? Math.sqrt(br.grip) : 1); const allow = Math.sqrt(v * v + 2 * 26 * k * tr.seg); if (allow < target) target = allow; }
  const inp = { steer: clamp(-diff * 2.6, -1, 1), throttle: c.vf < target ? 1 : 0, brake: c.vf > target + 3 ? 1 : 0, hand: false, nitro: false, analog: true };
  let mc = 0; for (let k = 0; k < 120; k += 8) mc = Math.max(mc, Math.abs(tr.curv[(c.idx + k) % N]));
  if (mc < .004 && c.nitro > .45 && c.vf > 25) c.aiNitro = true;
  if (c.nitro < .05 || mc > .008) c.aiNitro = false;
  inp.nitro = !!c.aiNitro;
  return inp;
}


/* ===== src/03-stages.js ===== */

/* ================= STAGES ================= */
function addLights(ctx, hemiSky, hemiGround, hemiI, sunCol, sunI, sunDir) {
  const { scene, q } = ctx;
  scene.add(new THREE.HemisphereLight(hemiSky, hemiGround, hemiI));
  const sun = new THREE.DirectionalLight(sunCol, sunI);
  sun.castShadow = q.shadow > 0;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    const c = sun.shadow.camera; c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 500;
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
  }
  scene.add(sun); scene.add(sun.target);
  ctx.sun = sun; ctx.sunDir = sunDir.clone().normalize();
}
function gradientSky(ctx, top, mid, bot, glow, glowDir) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), skyGradientMat(top, mid, bot, glow, glowDir));
  m.renderOrder = -2; m.frustumCulled = false; ctx.scene.add(m);
  ctx.updaters.push((t, dt, cam) => m.position.copy(cam.position));
  return m;
}
function envFromScene(builder) {
  const s = new THREE.Scene(); builder(s);
  const rt = pmrem.fromScene(s, 0.03, .1, 200);
  s.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return rt.texture;
}
function envGlowPanels(s, items) {
  for (const [col, x, y, z, w, h] of items) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  }
}
function buildTerrain(ctx, colorFn) {
  const { tr, def, noise, q, scene } = ctx;
  const size = 2600, seg = q.terrain;
  const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
  const cx = def.center[0], cz = def.center[1]; g.translate(cx, 0, cz);
  const p = g.attributes.position; const D = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); const n = trackNearest(tr, x, z, true);
    D[i] = n.d; p.setY(i, def.height(x, z, n.d, n.y, noise, tr));
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal; const col = new Float32Array(p.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { colorFn(c, p.getX(i), p.getY(i), p.getZ(i), nrm.getY(i), D[i]); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const detail = noiseTex(def.seed + 3, 215, 40); detail.repeat.set(180, 180);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: def.terrainRough || .95, metalness: 0, envMapIntensity: .6 }));
  m.receiveShadow = true; scene.add(m);
  return m;
}
function scatter(ctx, count, test, seed) {
  const r = mulberry(seed); const out = []; let tries = 0;
  const [cx, cz] = ctx.def.center; const rad = ctx.def.scatterR || 800;
  while (out.length < count && tries < count * 12) {
    tries++;
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad; const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const n = trackNearest(ctx.tr, x, z);
    const res = test(x, z, n, r); if (res) out.push(res);
  }
  return out;
}
function instanced(geo, mat, items, cast = true, recv = false) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(items.length, 1));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pv = new THREE.Vector3();
  items.forEach((it, i) => {
    e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e); s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1); pv.set(it.x, it.y, it.z);
    m.compose(pv, q, s); mesh.setMatrixAt(i, m);
    if (it.c) mesh.setColorAt(i, it.c);
  });
  mesh.count = items.length; mesh.castShadow = cast; mesh.receiveShadow = recv;
  mesh.computeBoundingSphere();
  return mesh;
}

/* ---- trackside common ---- */
function buildTrackMeshes(ctx) {
  const { tr, def, scene } = ctx; const st = def.style; const half = tr.half;
  const tex = roadTextures(st);
  const road = ribbon(tr, -half, half, .02, .02, half * 2);
  if (tex.map) tex.map.repeat.set(1, 1);
  const roadMat = new THREE.MeshStandardMaterial({ map: tex.map, roughness: st.wet ? 1 : .88, metalness: st.wet ? .15 : 0, roughnessMap: tex.rough || null, envMapIntensity: st.wet ? .9 : .5 });
  if (tex.emissive) { roadMat.emissiveMap = tex.emissive; roadMat.emissive = new THREE.Color(st.glowLines); roadMat.emissiveIntensity = .5; }
  const rm = new THREE.Mesh(road, roadMat); rm.receiveShadow = true; scene.add(rm);
  // kerbs only where the road bends
  const mask = new Uint8Array(tr.N);
  for (let i = 0; i < tr.N; i++) if (Math.abs(tr.curv[i]) > .0085) for (let k = -10; k <= 10; k++) mask[(i + k + tr.N) % tr.N] = 1;
  const kt = stripeTex(st.kerb[0], st.kerb[1]);
  const kMat = new THREE.MeshStandardMaterial({ map: kt, roughness: .6, envMapIntensity: .6 });
  if (st.kerbGlow) { kMat.emissiveMap = kt; kMat.emissive = new THREE.Color(st.kerbGlow); kMat.emissiveIntensity = .16; }
  for (const s of [-1, 1]) {
    const g = s > 0 ? ribbon(tr, half, half + 1.3, .02, .09, 3, mask) : ribbon(tr, -half - 1.3, -half, .09, .02, 3, mask);
    const m = new THREE.Mesh(g, kMat); m.receiveShadow = true; scene.add(m);
  }
  // runoff strip
  const runMat = new THREE.MeshStandardMaterial({ color: st.runoff, roughness: .95, envMapIntensity: .4 });
  for (const s of [-1, 1]) {
    const g = s > 0 ? ribbon(tr, half, tr.wall, .0, .0, 4) : ribbon(tr, -tr.wall, -half, 0, 0, 4);
    const m = new THREE.Mesh(g, runMat); m.receiveShadow = true; scene.add(m);
  }
  // barriers
  const bt = barrierTex(st); const bMat = new THREE.MeshStandardMaterial({ map: bt, roughness: .7, side: THREE.DoubleSide, envMapIntensity: .5 });
  if (st.barrierGlow) { bMat.emissiveMap = barrierGlowTex(st); bMat.emissive = new THREE.Color(st.barrierGlow); bMat.emissiveIntensity = .6; }
  const capMat = new THREE.MeshStandardMaterial({ color: st.barrierCap, roughness: .6 });
  const br = tr.branch;
  // open the main barrier where the shortcut peels off and rejoins
  const gapMask = s => { const m = new Uint8Array(tr.N).fill(1); if (!br || s !== br.side) return m;
    for (let i = 0; i < tr.N; i++) { if (Math.abs(wrapI(i - br.i, tr.N)) > 70 && Math.abs(wrapI(i - br.j, tr.N)) > 70) continue;
      const p = tr.P[i], R = tr.R[i]; for (const off of [tr.wall, tr.wall + .35]) { const x = p.x + R.x * off * s, z = p.z + R.z * off * s;
        for (let k = 0; k < br.N; k++) { const q = br.P[k], Rb = br.R[k]; const la = (x - q.x) * Rb.x + (z - q.z) * Rb.z, al = (x - q.x) * br.T[k].x + (z - q.z) * br.T[k].z; if (Math.abs(la) < br.wall + .6 && Math.abs(al) < 2) { m[i] = 0; m[(i - 1 + tr.N) % tr.N] = 0; break; } } } }
    return m; };
  for (const s of [-1, 1]) {
    const o = tr.wall * s, mk = gapMask(s);
    const wall = new THREE.Mesh(ribbon(tr, o, o, 0, 1.1, 14, mk), bMat); wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
    const cap = new THREE.Mesh(ribbon(tr, s > 0 ? o : o - .35, s > 0 ? o + .35 : o, 1.1, 1.1, 4, mk), capMat); scene.add(cap);
    const outer = new THREE.Mesh(ribbon(tr, o + .35 * s, o + .35 * s, -6, 1.1, 14, mk), capMat); scene.add(outer);
  }
  if (br) {
    // shortcut road surface
    const sfc = br.surface;
    const bTex = canvasTex(256, 512, (g, w, h) => {
      const base = sfc === 'ice' ? '#a9c9e6' : sfc === 'alley' ? '#1b1b22' : sfc === 'regolith' ? '#707279' : '#8a6a48'; g.fillStyle = base; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 9000, 17, sfc === 'ice' ? .12 : .18);
      if (sfc === 'dirt' || sfc === 'regolith') { g.fillStyle = sfc === 'regolith' ? 'rgba(20,20,26,.3)' : 'rgba(40,25,10,.25)'; g.fillRect(w * .22, 0, w * .14, h); g.fillRect(w * .64, 0, w * .14, h); }
      if (sfc === 'ice') { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; const r = mulberry(4); for (let i = 0; i < 40; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - .5) * 60; y += (r() - .5) * 60; g.lineTo(x, y); } g.stroke(); } }
      if (sfc === 'alley') { g.fillStyle = '#ff3fb4'; g.fillRect(w * .03, 0, w * .03, h); g.fillRect(w * .94, 0, w * .03, h); }
    });
    const bm = new THREE.MeshStandardMaterial({ map: bTex, roughness: sfc === 'ice' ? .12 : sfc === 'alley' ? .35 : .95, metalness: sfc === 'ice' ? .1 : 0, envMapIntensity: sfc === 'ice' ? 1.4 : .6 });
    if (sfc === 'alley') { bm.emissiveMap = bTex; bm.emissive = new THREE.Color(.6, .6, .6); }
    const road = new THREE.Mesh(ribbon(br, -br.half, br.half, .03, .03, br.W, null, true), bm); road.receiveShadow = true; scene.add(road);
    // shortcut barriers, left open where they meet the main road
    for (const s of [-1, 1]) {
      const mk = new Uint8Array(br.N).fill(1); for (let k = 0; k < br.N; k++) { const q = br.P[k], R = br.R[k]; const x = q.x + R.x * br.wall * s, z = q.z + R.z * br.wall * s; const n = trackNearest({ ...tr, branch: null }, x, z); if (n.d < tr.wall + .6) mk[Math.max(k - 1, 0)] = mk[k] = 0; }
      const o = br.wall * s;
      const w = new THREE.Mesh(ribbon(br, o, o, 0, 1.1, 14, mk, true), bMat); w.castShadow = true; scene.add(w);
      scene.add(new THREE.Mesh(ribbon(br, o + .35 * s, o + .35 * s, -6, 1.1, 14, mk, true), capMat));
      scene.add(new THREE.Mesh(ribbon(br, s > 0 ? o : o - .35, s > 0 ? o + .35 : o, 1.1, 1.1, 4, mk, true), capMat));
    }
    // entrance sign
    const k = Math.min(10, br.N - 1); const sign = new THREE.Group(); orientOnTrack(sign, br, k, 0, 0); scene.add(sign);
    const post = new THREE.MeshStandardMaterial({ color: 0x22242c, metalness: .7, roughness: .4 });
    for (const s2 of [-1, 1]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(.4, 6, .4), post); pl.position.set(s2 * (br.wall + .6), 3, 0); pl.castShadow = true; sign.add(pl); }
    const stex = textPanelTex(br.label, '#170800', '#ffb020', 1024, 160, 'italic 700 104px "Chakra Petch", Arial');
    for (const face of [-1, 1]) { const pn = new THREE.Mesh(new THREE.PlaneGeometry(br.W + 2, (br.W + 2) * 160 / 1024), new THREE.MeshBasicMaterial({ map: stex, color: new THREE.Color(1.6, 1.6, 1.6) })); pn.position.set(0, 6.2, face * .05); if (face < 0) pn.rotation.y = Math.PI; sign.add(pn); }
  }
  // bridges: deck underside + pillars wherever the road is lifted off the ground
  const groundAt = ctx.heightAt;
  const lifted = new Uint8Array(tr.N); const gH = new Float32Array(tr.N);
  for (let i = 0; i < tr.N; i++) { gH[i] = groundAt(tr.P[i].x, tr.P[i].z); if (tr.P[i].y - gH[i] > 3) lifted[i] = 1; }
  const liftMask = new Uint8Array(tr.N); for (let i = 0; i < tr.N; i++) if (lifted[i]) for (let k = -4; k <= 4; k++) liftMask[(i + k + tr.N) % tr.N] = 1;
  const concrete = new THREE.MeshStandardMaterial({ color: st.pillar || 0x5c5f68, roughness: .8, metalness: .1 });
  const deck = new THREE.Mesh(ribbon(tr, tr.wall + .35, -tr.wall - .35, -.9, -.9, 6, liftMask), concrete); deck.receiveShadow = true; scene.add(deck);
  for (const s of [-1, 1]) scene.add(new THREE.Mesh(ribbon(tr, s * (tr.wall + .35), s * (tr.wall + .35), -.9, 0, 6, liftMask), concrete));
  const pillars = [];
  for (let i = 0; i < tr.N; i += 9) {
    if (!lifted[i]) continue;
    for (const s of [-1, 1]) {
      const p = tr.P[i], R = tr.R[i], o = s * (tr.half - 1);
      const x = p.x + R.x * o, z = p.z + R.z * o, top = p.y - .9;
      let blocked = false;
      for (let j = 0; j < tr.N; j += 3) { const q = tr.P[j]; if (q.y < top - 4 && (q.x - x) ** 2 + (q.z - z) ** 2 < (tr.half + 3) ** 2) { blocked = true; break; } }
      if (blocked) continue;
      const g0 = Math.min(groundAt(x, z), gH[i]) - .5; const h = top - g0; if (h < 1) continue;
      pillars.push({ x, y: g0 + h / 2, z, sx: 1.6, sy: h, sz: 1.6, ry: Math.atan2(R.x, R.z) });
    }
  }
  if (pillars.length && !def.floating) { const pm = instanced(new THREE.BoxGeometry(1, 1, 1), concrete, pillars, true, true); scene.add(pm); }
  if (def.floating) {
    const pyl = []; for (let i = 0; i < tr.N; i += 34) { const p = tr.P[i], t = tr.T[i]; pyl.push({ x: p.x, y: p.y - 2.2, z: p.z, ry: Math.atan2(t.x, t.z), s: 1 }); }
    const ringG = new THREE.TorusGeometry(tr.wall * .8, .35, 8, 40); ringG.rotateX(Math.PI / 2);
    scene.add(instanced(ringG, new THREE.MeshBasicMaterial({ color: new THREE.Color(st.pylon || '#ffb020').multiplyScalar(1.4) }), pyl, false));
    const under = new THREE.Mesh(ribbon(tr, -tr.half * .5, tr.half * .5, -1, -1, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(st.pylon || '#ffb020').multiplyScalar(.8), side: THREE.DoubleSide, transparent: true, opacity: .3 }));
    scene.add(under);
  }
  // start line
  const chk = new THREE.Mesh(new THREE.PlaneGeometry(tr.W, 2.2), new THREE.MeshStandardMaterial({ map: checkerTex(), roughness: .8, polygonOffset: true, polygonOffsetFactor: -2 }));
  chk.geometry.rotateX(-Math.PI / 2); orientOnTrack(chk, tr, 0, 0, .04); chk.receiveShadow = true; scene.add(chk);
  // gantry
  const gan = new THREE.Group(); orientOnTrack(gan, tr, 2, 0, 0); scene.add(gan);
  const metal = new THREE.MeshStandardMaterial({ color: 0x1c1f27, metalness: .8, roughness: .35 });
  const span = tr.wall + 1.2;
  for (const s of [-1, 1]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9.5, 1.2), metal); pl.position.set(s * span, 4.75, 0); pl.castShadow = true; gan.add(pl); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 1.2, 2.2, 1.2), metal); beam.position.set(0, 8.6, 0); beam.castShadow = true; gan.add(beam);
  const bannerTex = textPanelTex('VELOCITY RIFT', '#ffffff', '#0b0c12', 1024, 128, 'italic 700 92px "Chakra Petch", Arial');
  for (const face of [-1, 1]) {
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 1.3), new THREE.MeshBasicMaterial({ map: bannerTex, color: new THREE.Color(1, 1, 1) }));
    bn.position.set(0, 9.0, face * .62); if (face < 0) bn.rotation.y = Math.PI; gan.add(bn);
  }
  ctx.startLights = [];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.08, .02, .02) });
    const l = new THREE.Mesh(new THREE.CircleGeometry(.36, 20), mat); l.position.set((i - 2) * 1.05, 7.8, -.63); l.rotation.y = Math.PI; gan.add(l); ctx.startLights.push(mat);
  }
}

/* ---- per-stage builders ---- */
const MOON_CRATERS = (() => { const r = mulberry(71), out = []; for (let i = 0; i < 70; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 900; const R = 14 + Math.pow(r(), 2) * 90; out.push([20 + Math.cos(a) * d, 200 + Math.sin(a) * d, R, R * (.18 + r() * .12)]); } return out; })();
function moonCraters(x, z) { let h = 0; for (const [cx, cz, R, dep] of MOON_CRATERS) { const dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz; if (d2 > R * R * 2.3) continue; const q = Math.sqrt(d2) / R; h += (q < 1 ? -dep * (1 - q * q) : 0) + dep * .45 * Math.exp(-Math.pow((q - 1) / .2, 2)); } return h; }
const STAGES = [
  {
    shortcut: { u0: .722, u1: .884, side: 1, width: 10, surface: 'dirt', grip: .72, top: .9, label: 'SHORTCUT  ›  DIRT CUT' },
    key: 'coast', name: 'Golden Coast', sub: 'Seaside chicanes and hilltop esses', seed: 11, width: 17, center: [50, 170], scatterR: 760,
    points: [[0,  0,  0],  [150,  -12,  0],  [215,  -40,  1],  [262,  -18,  1],  [292,  -50,  1],  [335,  -32,  2],  [420,  -10,  3],  [470,  60,  5],  [455,  140,  8],  [395,  175,  10],  [365,  235,  11],  [410,  290,  12],  [385,  350,  12],  [300,  365,  11],  [250,  318,  9],  [185,  345,  7],  [110,  300,  5],  [40,  345,  3],  [-60,  390,  2],  [-170,  365,  3],  [-230,  300,  6],  [-200,  230,  8],  [-265,  175,  9],  [-345,  165,  9],  [-365,  85,  7],  [-295,  20,  4],  [-200,  -22,  2],  [-100,  -30,  1]],
    style: { asphalt: '#3b3a3f', edge: '#f4f1ea', center: '#f5cf45', kerb: ['#d8262b', '#f4f4f4'], runoff: '#6f6552', barrier: '#ece6da', barrierStripe: '#d8262b', barrierText: '#1b1b1f', barrierCap: '#c9c2b4', sponsor: 'SOLTIDE ENERGY' },
    exposure: .42, bloom: { strength: .12, radius: .4, threshold: .97 }, fog: [0xe6ad84, .0009], night: false, smoke: [.85, .78, .68],
    height(x, z, d, ty, n, tr) {
      const t = smooth(tr.half + 14, tr.half + 70, d);
      const cd = Math.hypot(x - 50, z - 170);
      let h = 5 + n(x * .004, z * .004, 5) * 24 + Math.max(0, n(x * .0017 + 5, z * .0017, 4)) * 110 * smooth(260, 620, cd);
      h -= smooth(-40, -240, z) * 55; h -= smooth(620, 1000, cd) * 60;
      return lerp(ty - .45, h, t);
    },
    build(ctx) {
      const { scene, q, tr } = ctx;
      const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(84), THREE.MathUtils.degToRad(100));
      const mkSky = () => { const s = new Sky(); s.scale.setScalar(4500); const u = s.material.uniforms; u.turbidity.value = 4.5; u.rayleigh.value = 2; u.mieCoefficient.value = .007; u.mieDirectionalG.value = .86; u.sunPosition.value.copy(sunDir); return s; };
      const sky = mkSky(); sky.material.fog = false; scene.add(sky); ctx.updaters.push((t, dt, cam) => sky.position.copy(cam.position));
      scene.environment = envFromScene(s => { const sk = mkSky(); sk.scale.setScalar(150); s.add(sk); });
      scene.fog = new THREE.FogExp2(0xe0a07c, .0008);
      addLights(ctx, 0xbfd3ff, 0x8a6a48, 1.0, 0xffc38a, 3.4, sunDir);
      buildTerrain(ctx, (c, x, y, z, ny, d) => {
        if (y < -2.2) c.set('#7e6c4c'); else if (y < 1.2) c.set('#d8c090');
        else { c.set('#6a8a35').lerp(new THREE.Color('#a79c52'), clamp(ctx.noise(x * .01, z * .01, 2) + .5, 0, 1)); }
        if (ny < .8 && y > 1) c.lerp(new THREE.Color('#8b7563'), smooth(.8, .6, ny));
        if (d < tr.half + 10 && y > 0) c.lerp(new THREE.Color('#8a7a58'), .5);
      });
      // sea
      const wn = waterNormalTex(); wn.repeat.set(160, 160);
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshPhysicalMaterial({ color: 0x0c3550, roughness: .06, metalness: 0, normalMap: wn, normalScale: new THREE.Vector2(.35, .35), clearcoat: .6, envMapIntensity: 1.1 }));
      sea.rotation.x = -Math.PI / 2; sea.position.y = -2.6; scene.add(sea);
      ctx.updaters.push((t) => { wn.offset.set(t * .006, t * .0035); });
      // palms
      const dens = q.density;
      const palms = scatter(ctx, Math.round(420 * dens), (x, z, n, r) => {
        if (n.d < tr.half + 9) return null; const y = ctx.heightAt(x, z); if (y < -.8 || y > 30) return null;
        return { x, y: y - .2, z, ry: r() * 6.28, rz: (r() - .5) * .25, rx: (r() - .5) * .25, s: .8 + r() * .6 };
      }, 3);
      const trunkG = new THREE.CylinderGeometry(.16, .3, 9, 7, 6); trunkG.translate(0, 4.5, 0);
      { const p = trunkG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.pow(y / 9, 2) * 1.4); } trunkG.computeVertexNormals(); }
      const leafParts = []; for (let k = 0; k < 8; k++) { const lg = new THREE.PlaneGeometry(1.1, 5.2, 1, 6); const p = lg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 2.6; p.setY(i, y); p.setZ(i, -Math.pow(y / 5.2, 2) * 2.2); p.setX(i, p.getX(i) * (1 - Math.abs(y / 5.2 - .45))); } lg.rotateX(-Math.PI / 2 + .5); lg.rotateY(k / 8 * Math.PI * 2); lg.translate(1.4, 9, 0); leafParts.push(lg); }
      const crownG = mergeGeometries(leafParts); crownG.computeVertexNormals();
      scene.add(instanced(trunkG, new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: .95 }), palms));
      scene.add(instanced(crownG, new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: .8, side: THREE.DoubleSide }), palms));
      // round trees and bushes
      const bushes = scatter(ctx, Math.round(520 * dens), (x, z, n, r) => {
        if (n.d < tr.half + 8) return null; const y = ctx.heightAt(x, z); if (y < 1.5) return null;
        const s = 1 + r() * 2.6; return { x, y: y + s * .5, z, s, ry: r() * 6, c: new THREE.Color().setHSL(.2 + r() * .08, .45, .22 + r() * .12) };
      }, 4);
      scene.add(instanced(new THREE.IcosahedronGeometry(1.4, 1), new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }), bushes));
      const rocks = scatter(ctx, Math.round(140 * dens), (x, z, n, r) => {
        if (n.d < tr.half + 8) return null; const y = ctx.heightAt(x, z); if (y < -6 || y > 4) return null;
        return { x, y, z, s: 1 + r() * 3.5, sy: .6 + r() * 1.4, ry: r() * 6, rx: r() };
      }, 5);
      scene.add(instanced(new THREE.DodecahedronGeometry(1.2, 0), new THREE.MeshStandardMaterial({ color: 0x8b7a68, roughness: .9, flatShading: true }), rocks));
      // grandstand facing the start straight
      const gs = new THREE.Group(); orientOnTrack(gs, tr, 18, tr.wall + 9, 0); scene.add(gs);
      const standM = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: .8 });
      const crowd = []; const rr = mulberry(8);
      for (let k = 0; k < 6; k++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2 + k * 1.2, 70), standM); step.position.set(-(k * 2 + 1), (1.2 + k * 1.2) / 2, 0); step.receiveShadow = true; step.castShadow = true; gs.add(step);
        for (let j = 0; j < 44; j++) crowd.push({ x: 4 - k * 2, y: 1.2 + k * 1.2 + .45, z: -33 + j * 1.5 + rr() * .4, s: .5, sy: .9 + rr() * .3, c: new THREE.Color().setHSL(rr(), .7, .5) });
      }
      const roofM = new THREE.Mesh(new THREE.BoxGeometry(16, .4, 72), new THREE.MeshStandardMaterial({ color: 0xd8262b, roughness: .5 })); roofM.position.set(-5, 12.5, 0); roofM.rotation.z = .12; roofM.castShadow = true; gs.add(roofM);
      const cm = instanced(new THREE.BoxGeometry(.9, 1, .9), new THREE.MeshStandardMaterial({ roughness: .8 }), crowd, false); gs.add(cm);
      // lighthouse on a rock out at sea
      const lh = new THREE.Group(); const base = tr.P[40]; lh.position.set(base.x + 60, -2.6, base.z - 210); scene.add(lh);
      const isl = new THREE.Mesh(new THREE.DodecahedronGeometry(16, 1), new THREE.MeshStandardMaterial({ color: 0x6d6255, roughness: .9, flatShading: true })); isl.scale.set(1, .45, 1); lh.add(isl);
      const towerT = canvasTex(64, 256, (g, w, h) => { for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#c8262b' : '#f3efe6'; g.fillRect(0, i * h / 6, w, h / 6); } });
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 26, 24), new THREE.MeshStandardMaterial({ map: towerT, roughness: .6 })); tower.position.y = 18; tower.castShadow = true; lh.add(tower);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.1, 1.3) })); lamp.position.y = 32.5; lh.add(lamp);
      const beamG = new THREE.ConeGeometry(9, 140, 24, 1, true); beamG.translate(0, -70, 0); beamG.rotateZ(Math.PI / 2);
      const beamM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .85, .5), transparent: true, opacity: .05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(beamG, beamM); beam.position.y = 32.5; lh.add(beam);
      ctx.updaters.push((t) => { beam.rotation.y = t * .6; });
      // sailboats
      const boats = []; const br = mulberry(31);
      for (let i = 0; i < 12; i++) {
        const b = new THREE.Group(); b.position.set(-500 + br() * 1200, -2.6, -300 - br() * 500); b.rotation.y = br() * 6;
        const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 7), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: .5 })); hull.position.y = .4; b.add(hull);
        const sailG = new THREE.BufferGeometry(); sailG.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, -2.4, 0, 11, 0, 0, 1, 2.2], 3)); sailG.computeVertexNormals();
        const sail = new THREE.Mesh(sailG, new THREE.MeshStandardMaterial({ color: br() > .5 ? 0xfff6e8 : 0xff7a3d, side: THREE.DoubleSide, roughness: .7 })); b.add(sail);
        scene.add(b); boats.push([b, br() * 6]);
      }
      ctx.updaters.push((t) => { for (const [b, ph] of boats) { b.position.y = -2.6 + Math.sin(t * .8 + ph) * .25; b.rotation.z = Math.sin(t * .6 + ph) * .05; } });
    }
  },
  {
    shortcut: { u0: .346, u1: .549, side: -1, width: 10, surface: 'alley', grip: .9, top: .9, label: 'SHORTCUT  ›  BACK ALLEY' },
    key: 'metro', name: 'Neon Metro', sub: 'Rainy figure-eight with a flyover', seed: 23, width: 16, center: [70, 265], scatterR: 800,
    points: [[0,  0,  0],  [120,  0,  0],  [200,  0,  0],  [250,  20,  0],  [275,  70,  1],  [270,  115,  3],  [230,  150,  6],  [150,  210,  9],  [58,  262,  10],  [-20,  318,  8],  [-80,  360,  5],  [-120,  420,  2],  [-100,  490,  0],  [-30,  530,  0],  [40,  530,  0],  [80,  510,  0],  [120,  530,  0],  [160,  505,  0],  [185,  440,  0],  [170,  390,  0],  [120,  330,  0],  [0,  190,  0],  [-50,  130,  0],  [-110,  90,  0],  [-140,  40,  0],  [-100,  5,  0]],
    style: { asphalt: '#1d1d24', edge: '#35e0ff', center: '#ff3fb4', glowLines: '#ffffff', wet: true, kerb: ['#ff2fa8', '#101018'], kerbGlow: '#ffffff', runoff: '#15151c', barrier: '#15161e', barrierStripe: '#35e0ff', barrierGlow: '#ffffff', barrierText: '#3a3d52', barrierCap: '#262835', sponsor: 'HALCYON GRID' },
    exposure: .72, bloom: { strength: .32, radius: .45, threshold: .93 }, night: true, smoke: [.55, .6, .8],
    build(ctx) {
      const { scene, q, tr } = ctx;
      gradientSky(ctx, '#05030f', '#2a0b45', '#12071c', '#ff2f9a', new THREE.Vector3(1, 0, .2));
      scene.add(starField(900, 4200, 5, .15));
      scene.environment = envFromScene(s => {
        const sk = new THREE.Mesh(new THREE.SphereGeometry(100, 16, 8), skyGradientMat('#05030f', '#35104f', '#0d0714', '#ff2f9a', new THREE.Vector3(1, 0, .2))); s.add(sk);
        envGlowPanels(s, [['#ff2fa8', 60, 10, 0, 30, 14], ['#35e0ff', -60, 14, 20, 34, 12], ['#ffb020', 0, 12, -60, 20, 10], ['#7a4bff', 10, 30, 60, 40, 10], ['#35e0ff', 40, 8, -50, 18, 8]]);
      });
      scene.environmentIntensity = .5;
      scene.fog = new THREE.FogExp2(0x100a1a, .0014);
      addLights(ctx, 0x6b5bb0, 0x140a1c, .7, 0xa9bcff, .9, new THREE.Vector3(-.4, 1, .3));
      // wet ground
      const gt = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#16161d'; g.fillRect(0, 0, w, h); speckle(g, w, h, 9000, 2, .08); g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); });
      gt.repeat.set(120, 120);
      const gr = roadTextures({ asphalt: '#000', edge: '#000', center: '#000', wet: true }).rough; gr.repeat.set(90, 90);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: gt, roughnessMap: gr, roughness: .9, metalness: .1, envMapIntensity: .6 }));
      ground.rotation.x = -Math.PI / 2; ground.position.set(70, -.03, 265); ground.receiveShadow = true; scene.add(ground);
      // buildings merged into one mesh with world-scaled UVs
      const winT = canvasTex(256, 512, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const r = mulberry(4);
        const cols = ['#ffd9a0', '#9fe8ff', '#ffb3e6', '#ffffff', '#ffc070'];
        for (let y = 0; y < 16; y++)for (let x = 0; x < 8; x++) { if (r() < .42) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = .35 + r() * .65; g.fillRect(x * 32 + 6, y * 32 + 8, 20, 17); } }
        g.globalAlpha = 1;
      });
      const facT = canvasTex(256, 512, (g, w, h) => {
        g.fillStyle = '#1a1c27'; g.fillRect(0, 0, w, h);
        for (let y = 0; y < 16; y++)for (let x = 0; x < 8; x++) { g.fillStyle = '#0a0b10'; g.fillRect(x * 32 + 5, y * 32 + 7, 22, 19); }
        speckle(g, w, h, 3000, 9, .05);
      });
      const boxes = []; const r = mulberry(77); const signs = []; const neonCols = [[4, .3, 2.4], [.3, 3, 4], [4, 2, .2], [2.2, .6, 4.5], [.4, 4, 1.4]];
      for (let gx = -760; gx <= 840; gx += 44) for (let gz = -600; gz <= 980; gz += 44) {
        const x = gx + (r() - .5) * 14, z = gz + (r() - .5) * 14; const w = 16 + r() * 18, dpt = 16 + r() * 18;
        const n = trackNearest(tr, x, z); if (n.d < tr.half + 12 + Math.max(w, dpt) * .75) continue;
        if (n.d > 300 && r() > q.density + .1) continue;
        const cd = Math.hypot(x - 70, z - 265); const hgt = (18 + Math.pow(r(), 2.2) * 150) * (1 + smooth(500, 150, cd) * .6);
        const bg = new THREE.BoxGeometry(w, hgt, dpt); bg.translate(x, hgt / 2, z);
        const uv = bg.attributes.uv; // faces: px,nx,py,ny,pz,nz (4 verts each)
        for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
          const i = f * 4 + v; let u = uv.getX(i), vv = uv.getY(i);
          if (f === 2 || f === 3) { uv.setXY(i, .01, .01); continue; }
          const span = f < 2 ? dpt : w; uv.setXY(i, u * span / 32 + (x * .013), vv * hgt / 64);
        }
        boxes.push(bg);
        if (r() < .35 && n.d < 260) {
          const face = r() < .5 ? 1 : -1; const sw = Math.min(w * .8, 6 + r() * 10), sh = 3 + r() * 9;
          signs.push({ x: x + (r() - .5) * w * .3, y: hgt * (.3 + r() * .5), z: z + face * (dpt / 2 + .3), sx: sw, sy: sh, sz: .3, c: new THREE.Color(...neonCols[Math.floor(r() * neonCols.length)]) });
        }
        if (r() < .25) signs.push({ x, y: hgt + 1.2, z, sx: w * .7, sy: .6, sz: dpt * .7, c: new THREE.Color(...neonCols[Math.floor(r() * neonCols.length)]).multiplyScalar(.6) });
      }
      if (boxes.length) {
        const merged = mergeGeometries(boxes); boxes.forEach(b => b.dispose());
        const bm = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ map: facT, emissiveMap: winT, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: .55, roughness: .45, metalness: .5, envMapIntensity: .8 }));
        bm.castShadow = false; bm.receiveShadow = true; scene.add(bm);
      }
      scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x8c8c8c }), signs, false));
      // neon arches over the track that chase in sequence
      const arches = []; const archG = new THREE.TorusGeometry(tr.wall + .6, .28, 10, 64, Math.PI);
      const step = Math.round(95 / tr.seg);
      for (let i = 30, k = 0; i < tr.N - 20; i += step, k++) {
        const col = k % 2 ? new THREE.Color(.25, 2.2, 3) : new THREE.Color(3, .25, 1.8);
        const m = new THREE.Mesh(archG, new THREE.MeshBasicMaterial({ color: col.clone() })); orientOnTrack(m, tr, i, 0, 0); scene.add(m);
        arches.push({ m, col, i });
      }
      ctx.updaters.push((t) => { arches.forEach((a, k) => { const pulse = .35 + .65 * Math.pow(.5 + .5 * Math.sin(t * 4 - k * .8), 3); a.m.material.color.copy(a.col).multiplyScalar(pulse * .6); }); });
      // street lamps
      const poles = [], heads = []; const ls = Math.round(38 / tr.seg);
      for (let i = 0; i < tr.N; i += ls) { const s = (i / ls) % 2 ? 1 : -1; const p = tr.P[i], R = tr.R[i]; const o = (tr.wall + 1.5) * s; poles.push({ x: p.x + R.x * o, y: 4, z: p.z + R.z * o, s: 1 }); heads.push({ x: p.x + R.x * (o - s * 1.6), y: 8, z: p.z + R.z * (o - s * 1.6), sx: 2.4, sy: .18, sz: .6, ry: Math.atan2(R.x, R.z) }); }
      scene.add(instanced(new THREE.CylinderGeometry(.14, .2, 8, 8), new THREE.MeshStandardMaterial({ color: 0x2a2c36, metalness: .7, roughness: .4 }), poles));
      scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.7, 1.3) }), heads, false));
      // the rift: a giant ring gate hanging over the skyline
      const rift = new THREE.Group(); rift.position.set(1100, 320, 120); rift.rotation.y = -Math.PI / 2; scene.add(rift);
      const ringCols = new THREE.Mesh(new THREE.TorusGeometry(230, 7, 16, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, .2, 1), fog: false })); rift.add(ringCols);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(205, 2.5, 8, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(.2, 1.2, 1.6), fog: false })); rift.add(ring2);
      const portalM = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ vec2 p=vUv-0.5; float r=length(p)*2.; float a=atan(p.y,p.x);
        float sw=sin(a*6.+r*14.-uTime*1.4)*0.5+0.5; float sw2=sin(a*3.-r*9.+uTime*0.9)*0.5+0.5;
        float m=smoothstep(1.0,0.2,r)*(0.25+0.75*sw*sw2);
        vec3 c=mix(vec3(1.0,0.15,0.7),vec3(0.2,0.9,1.0),sw2)*m*0.9; gl_FragColor=vec4(c*0.6,m*0.5); }`
      });
      const portal = new THREE.Mesh(new THREE.CircleGeometry(205, 96), portalM); rift.add(portal);
      ctx.updaters.push((t) => { portalM.uniforms.uTime.value = t; ringCols.rotation.z = t * .05; });
      // sky traffic
      const flyers = []; const fr = mulberry(55);
      for (let i = 0; i < 70; i++) flyers.push({ lane: fr(), h: 60 + fr() * 90, sp: (fr() > .5 ? 1 : -1) * (20 + fr() * 30), off: fr() * 2000, ang: fr() * Math.PI, c: fr() > .5 ? new THREE.Color(4, 1, .4) : new THREE.Color(.8, 2.5, 4) });
      const fm = instanced(new THREE.BoxGeometry(1.4, .5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), flyers.map(f => ({ x: 0, y: f.h, z: 0, c: f.c })), false);
      fm.frustumCulled = false; scene.add(fm);
      const fmm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fs = new THREE.Vector3(1, 1, 1), fp = new THREE.Vector3(), fe = new THREE.Euler();
      ctx.updaters.push((t) => {
        flyers.forEach((f, i) => { const d = ((f.off + t * f.sp) % 2000 + 2000) % 2000 - 1000; const cx = 40 + Math.cos(f.ang) * d - Math.sin(f.ang) * (f.lane - .5) * 900, cz = 190 + Math.sin(f.ang) * d + Math.cos(f.ang) * (f.lane - .5) * 900; fp.set(cx, f.h, cz); fe.set(0, Math.PI / 2 - f.ang + (f.sp < 0 ? Math.PI : 0), 0); fq.setFromEuler(fe); fmm.compose(fp, fq, fs); fm.setMatrixAt(i, fmm); });
        fm.instanceMatrix.needsUpdate = true;
      });
      const rain = weather('rain', Math.round(5000 * q.density)); scene.add(rain);
      ctx.updaters.push((t, dt, cam) => { rain.material.uniforms.uTime.value = t; rain.material.uniforms.uCam.value.copy(cam.position); rain.material.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() * .9; });
    }
  },
  {
    shortcut: { u0: .741, u1: .893, side: 1, width: 10, surface: 'ice', grip: .5, top: .92, label: 'SHORTCUT  ›  FROZEN CREEK' },
    key: 'aurora', name: 'Aurora Pass', sub: 'Icy hairpins, 32 m of climb', seed: 37, width: 16, center: [10, 195], scatterR: 720, terrainRough: .7,
    points: [[0,  0,  0],  [160,  -30,  4],  [280,  -10,  8],  [330,  60,  12],  [290,  120,  16],  [200,  110,  18],  [160,  160,  21],  [230,  210,  24],  [330,  220,  27],  [380,  290,  30],  [330,  360,  32],  [220,  380,  32],  [120,  350,  30],  [40,  400,  26],  [-80,  420,  22],  [-180,  370,  18],  [-200,  280,  15],  [-140,  220,  12],  [-230,  180,  10],  [-330,  160,  9],  [-360,  80,  7],  [-300,  10,  5],  [-200,  -30,  3],  [-100,  -30,  1]],
    style: { asphalt: '#34373f', edge: '#dfe9f5', center: '#9fdcff', kerb: ['#2a6cff', '#f2f6fb'], runoff: '#c8d2de', barrier: '#dfe6ee', barrierStripe: '#2a6cff', barrierText: '#2b3140', barrierCap: '#aab5c3', sponsor: 'POLARIS TYRES' },
    exposure: .85, bloom: { strength: .26, radius: .45, threshold: .93 }, night: true, smoke: [.92, .95, 1],
    height(x, z, d, ty, n, tr) {
      const t = smooth(tr.half + 14, tr.half + 70, d);
      const cd = Math.hypot(x - 10, z - 195);
      let h = 6 + n(x * .005, z * .005, 5) * 22;
      h += smooth(330, 760, cd) * (150 + n(x * .003 + 9, z * .003, 5) * 170);
      const lk = smooth(120, 50, Math.hypot(x - 20, z - 265)) * smooth(tr.half + 16, tr.half + 60, d); h = lerp(h, -4, lk);
      return lerp(ty - .45, h, t);
    },
    build(ctx) {
      const { scene, q, tr } = ctx;
      gradientSky(ctx, '#020716', '#0b2342', '#0a1422', '#2bffb0', new THREE.Vector3(0, 0, 1));
      scene.add(starField(2400, 4200, 9, .02));
      scene.environment = envFromScene(s => {
        s.add(new THREE.Mesh(new THREE.SphereGeometry(100, 16, 8), skyGradientMat('#030a1c', '#0f2d4d', '#9fb0c4', '#2bffb0', new THREE.Vector3(0, 0, 1))));
        envGlowPanels(s, [['#2bffb0', 0, 40, 70, 80, 16], ['#9a5bff', 30, 55, 60, 50, 10]]);
      });
      scene.fog = new THREE.FogExp2(0x0d1b2e, .0011);
      addLights(ctx, 0x8fb0e0, 0x3a4458, .9, 0xc4dcff, 1.5, new THREE.Vector3(-.3, .8, -.5));
      buildTerrain(ctx, (c, x, y, z, ny, d) => {
        c.set('#eef3fa').lerp(new THREE.Color('#c9d6ea'), clamp(ctx.noise(x * .02, z * .02, 2) + .5, 0, 1) * .6);
        if (ny < .78) c.lerp(new THREE.Color('#3b4250'), smooth(.78, .55, ny));
        if (d < tr.half + 10) c.lerp(new THREE.Color('#b8c3d2'), .6);
      });
      // frozen lake
      const lake = new THREE.Mesh(new THREE.CircleGeometry(115, 64), new THREE.MeshPhysicalMaterial({ color: 0x9cc8e8, roughness: .07, metalness: .1, clearcoat: 1, envMapIntensity: 1.4 }));
      lake.rotation.x = -Math.PI / 2; lake.position.set(20, -1.4, 265); lake.receiveShadow = true; scene.add(lake);
      // pines with snowy tips
      const pineParts = []; for (let k = 0; k < 4; k++) { const cg = new THREE.ConeGeometry(2.6 - k * .55, 3.6, 9); cg.translate(0, 2.6 + k * 2.1, 0); pineParts.push(cg); }
      const trunk = new THREE.CylinderGeometry(.25, .35, 2.4, 6); trunk.translate(0, 1.2, 0); pineParts.push(trunk);
      const pineG = mergeGeometries(pineParts.map(g => g.toNonIndexed()));
      { const p = pineG.attributes.position, n = pineG.attributes.normal; const col = new Float32Array(p.count * 3); const c = new THREE.Color();
        for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 2.4 && Math.hypot(p.getX(i), p.getZ(i)) < .4) c.set('#4a3626'); else { c.set('#183a2c').lerp(new THREE.Color('#f2f6fb'), smooth(.1, .9, n.getY(i)) * .85); } col.set([c.r, c.g, c.b], i * 3); }
        pineG.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
      const pines = scatter(ctx, Math.round(1100 * q.density), (x, z, n, r) => {
        if (n.d < tr.half + 8) return null; const y = ctx.heightAt(x, z); if (y < -.5 || y > 140) return null;
        const s = .8 + r() * 1.1; return { x, y: y - .2, z, s, sy: s * (.9 + r() * .4), ry: r() * 6 };
      }, 6);
      scene.add(instanced(pineG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, flatShading: true }), pines));
      // ice crystal beacons along the track
      const crystals = []; const cs = Math.round(44 / tr.seg);
      for (let i = 0; i < tr.N; i += cs) for (const s of [-1, 1]) { const p = tr.P[i], R = tr.R[i]; const o = (tr.wall + 2.2) * s; crystals.push({ x: p.x + R.x * o, y: p.y + 2.2, z: p.z + R.z * o, sx: .7, sy: 1.6, sz: .7, ry: i }); }
      const crM = instanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, 1.2, 2) }), crystals, false); scene.add(crM);
      // cabins with warm windows
      const cr = mulberry(3); let placed = 0;
      for (let tries = 0; tries < 200 && placed < 7; tries++) {
        const i = Math.floor(cr() * tr.N); const s = cr() > .5 ? 1 : -1; const p = tr.P[i], R = tr.R[i]; const o = (tr.wall + 16 + cr() * 20) * s;
        const x = p.x + R.x * o, z = p.z + R.z * o; if (trackNearest(tr, x, z).d < tr.wall + 12) continue; const y = ctx.heightAt(x, z);
        const cab = new THREE.Group(); cab.position.set(x, y, z); cab.rotation.y = Math.atan2(R.x, R.z); scene.add(cab);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), new THREE.MeshStandardMaterial({ color: 0x5a3b28, roughness: .9 })); wall.position.y = 2; wall.castShadow = true; cab.add(wall);
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(.01, 5.4, 3, 4, 1), new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: .8 })); roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, .85); roof.position.y = 5.5; roof.castShadow = true; cab.add(roof);
        for (const wx of [-2, 2]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.1, .4) })); w.position.set(wx, 2.2, -3.01); w.rotation.y = Math.PI; cab.add(w); }
        placed++;
      }
      // aurora curtains
      const auroraM = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
        void main(){ float x=vUv.x*7.;
          float w=n(vec2(x*1.2+uTime*0.06,uTime*0.05))*2.;
          float rays=pow(0.5+0.5*sin(x*38.+w*5.+uTime*0.3),2.)*0.7+0.3;
          float band=smoothstep(0.0,0.18,vUv.y)*(1.-smoothstep(0.3,1.,vUv.y));
          float fl=0.45+0.55*n(vec2(x*2.3-uTime*0.12,4.));
          float I=band*rays*fl;
          vec3 c=mix(vec3(0.1,1.0,0.55),vec3(0.55,0.25,1.0),smoothstep(0.25,0.85,vUv.y));
          gl_FragColor=vec4(c*I*1.25,I); }`
      });
      for (let k = 0; k < 3; k++) {
        const g = new THREE.PlaneGeometry(2600, 420, 160, 1); const p = g.attributes.position; const R = 1500 + k * 250;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const a = x / R; p.setXYZ(i, Math.sin(a) * R + Math.sin(x * .004 + k) * 90, y + 520 + k * 60 + Math.sin(x * .002 + k * 2) * 60, Math.cos(a) * R); }
        const m = new THREE.Mesh(g, auroraM); m.rotation.y = -.6 + k * .5; m.position.set(40, 0, 180); m.frustumCulled = false; scene.add(m);
      }
      // moon
      const moonT = canvasTex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.33, 'rgba(235,240,255,1)'); gr.addColorStop(.36, 'rgba(160,190,255,.35)'); gr.addColorStop(1, 'rgba(120,150,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }, { repeat: false });
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonT, color: new THREE.Color(2.5, 2.5, 2.8), fog: false, depthWrite: false })); moon.scale.set(520, 520, 1); scene.add(moon);
      ctx.updaters.push((t, dt, cam) => { auroraM.uniforms.uTime.value = t; moon.position.set(cam.position.x + 1400, cam.position.y + 1500, cam.position.z - 2600); crM.rotation.y = 0; });
      const snow = weather('snow', Math.round(4000 * q.density)); scene.add(snow);
      ctx.updaters.push((t, dt, cam) => { snow.material.uniforms.uTime.value = t; snow.material.uniforms.uCam.value.copy(cam.position); snow.material.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() * .9; });
    }
  },
  {
    shortcut: { u0: .336, u1: .486, side: 1, width: 10, surface: 'dirt', grip: .72, top: .9, label: 'SHORTCUT  ›  DRY GULLY' },
    key: 'canyon', name: 'Rift Canyon', sub: 'Desert figure-eight over a stone bridge', seed: 53, width: 17, center: [0, 170], scatterR: 780,
    points: [[430, 180, 2], [420, 90, 1], [380, 40, 1], [300, 10, 1], [230, 30, 1], [150, 70, 1], [0, 150, 0], [-150, 230, 0], [-230, 290, 1], [-300, 330, 1], [-380, 310, 2], [-440, 250, 3], [-400, 190, 3], [-460, 130, 3], [-420, 50, 3], [-330, 10, 3], [-240, 20, 4], [-150, 70, 7], [0, 150, 12], [150, 230, 8], [230, 300, 5], [290, 330, 4], [340, 300, 4], [390, 330, 3], [440, 290, 2]],
    style: { asphalt: '#3a3533', edge: '#f4efe6', center: '#ff7a1a', kerb: ['#ff6a1a', '#1c1a19'], runoff: '#b98a5c', barrier: '#2a2522', barrierStripe: '#ff7a1a', barrierText: '#e8dccb', barrierCap: '#4a403a', sponsor: 'DUNE LINE FUEL', pillar: 0xa0613e },
    exposure: .44, bloom: { strength: .1, radius: .4, threshold: .97 }, night: false, smoke: [.85, .66, .48],
    height(x, z, d, ty, n, tr) {
      const t = smooth(tr.half + 14, tr.half + 70, d);
      const cd = Math.hypot(x, z - 170);
      let h = 2 + n(x * .006, z * .006, 4) * 8;
      const m = n(x * .0035 + 3, z * .0035 - 7, 3);
      h += smooth(.06, .14, m) * (55 + n(x * .01, z * .01, 2) * 25) * smooth(tr.half + 40, tr.half + 110, d);
      h += smooth(520, 900, cd) * (90 + n(x * .004 + 1, z * .004, 4) * 60);
      return lerp(ty - .45, h, t);
    },
    build(ctx) {
      const { scene, q, tr } = ctx;
      const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(72), THREE.MathUtils.degToRad(230));
      const mkSky = () => { const s = new Sky(); s.scale.setScalar(4500); const u = s.material.uniforms; u.turbidity.value = 9; u.rayleigh.value = 1.3; u.mieCoefficient.value = .008; u.mieDirectionalG.value = .82; u.sunPosition.value.copy(sunDir); return s; };
      const sky = mkSky(); scene.add(sky); ctx.updaters.push((t, dt, cam) => sky.position.copy(cam.position));
      scene.environment = envFromScene(s => { const sk = mkSky(); sk.scale.setScalar(150); s.add(sk); });
      scene.fog = new THREE.FogExp2(0xd8a57c, .0009);
      addLights(ctx, 0xcfd8ff, 0xa0643a, 1.0, 0xffd6a8, 3.6, sunDir);
      buildTerrain(ctx, (c, x, y, z, ny, d) => {
        c.set('#d6a36a').lerp(new THREE.Color('#c58a52'), clamp(ctx.noise(x * .012, z * .012, 2) + .5, 0, 1));
        if (y > 20) c.lerp(new THREE.Color('#b8663c'), smooth(20, 45, y));
        if (ny < .75) c.lerp(new THREE.Color(y > 15 ? '#9a4a2c' : '#a8603a'), smooth(.75, .45, ny));
        if (d < tr.half + 10) c.lerp(new THREE.Color('#a88560'), .5);
      });
      const dens = q.density;
      // saguaro-style cacti
      const cParts = []; const trunk = new THREE.CylinderGeometry(.35, .42, 6, 8); trunk.translate(0, 3, 0); cParts.push(trunk);
      for (const [sx, y, h] of [[1, 2.4, 2.2], [-1, 3.2, 1.8]]) { const arm = new THREE.CylinderGeometry(.25, .28, .9, 8); arm.rotateZ(Math.PI / 2); arm.translate(sx * .7, y, 0); cParts.push(arm); const up = new THREE.CylinderGeometry(.24, .26, h, 8); up.translate(sx * 1.1, y + h / 2, 0); cParts.push(up); }
      const cactusG = mergeGeometries(cParts);
      const cacti = scatter(ctx, Math.round(300 * dens), (x, z, n, r) => { if (n.d < tr.half + 8) return null; const y = ctx.heightAt(x, z); if (y > 18) return null; return { x, y: y - .2, z, s: .7 + r() * .6, ry: r() * 6 }; }, 12);
      scene.add(instanced(cactusG, new THREE.MeshStandardMaterial({ color: 0x4f6b35, roughness: .8 }), cacti));
      const rocks = scatter(ctx, Math.round(260 * dens), (x, z, n, r) => { if (n.d < tr.half + 8) return null; const y = ctx.heightAt(x, z); return { x, y, z, s: 1 + r() * 4, sy: .5 + r() * 1.2, ry: r() * 6, rx: r() * .4 }; }, 13);
      scene.add(instanced(new THREE.DodecahedronGeometry(1.2, 0), new THREE.MeshStandardMaterial({ color: 0xa55a35, roughness: .95, flatShading: true }), rocks));
      // hoodoo rock spires
      const hoodoos = scatter(ctx, Math.round(90 * dens), (x, z, n, r) => { if (n.d < tr.half + 20) return null; const y = ctx.heightAt(x, z); if (y > 15) return null; const h = 10 + r() * 26; return { x, y: y + h / 2 - 1, z, sx: 2 + r() * 3, sy: h, sz: 2 + r() * 3, ry: r() * 6 }; }, 14);
      const hG = new THREE.CylinderGeometry(.42, .5, 1, 7, 4); { const p = hG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + Math.sin(y * 9) * .12; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } hG.computeVertexNormals(); }
      scene.add(instanced(hG, new THREE.MeshStandardMaterial({ color: 0xb2623a, roughness: .95, flatShading: true }), hoodoos));
      // hot-air balloons drifting over the canyon
      const balloons = []; const br = mulberry(61); const bcol = ['#ff5a1f', '#ffc83d', '#35a0ff', '#e03a6a', '#39c07a'];
      for (let i = 0; i < 9; i++) {
        const g = new THREE.Group(); const env = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 16), new THREE.MeshStandardMaterial({ color: bcol[i % 5], roughness: .7 })); env.scale.y = 1.2; g.add(env);
        const bas = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), new THREE.MeshStandardMaterial({ color: 0x5a3a22 })); bas.position.y = -11; g.add(bas);
        g.position.set(-500 + br() * 1000, 70 + br() * 90, -250 + br() * 800); scene.add(g); balloons.push([g, br() * 6, g.position.x]);
      }
      ctx.updaters.push((t) => { for (const [g, ph, x0] of balloons) { g.position.y += Math.sin(t * .3 + ph) * .02; g.position.x = x0 + Math.sin(t * .02 + ph) * 60; } });
      const dust = weather('snow', Math.round(1500 * dens)); dust.material.uniforms.uColor.value.set(1.0, .8, .6); dust.material.uniforms.uSpeed.value = .6; dust.material.uniforms.uDrift.value = 4; scene.add(dust);
      ctx.updaters.push((t, dt, cam) => { dust.material.uniforms.uTime.value = t; dust.material.uniforms.uCam.value.copy(cam.position); dust.material.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() * .5; });
    }
  },
  {
    key: 'moon', name: 'Lunar Leap', sub: 'Low gravity: crest the dunes and fly', seed: 71, width: 17, center: [20, 200], scatterR: 760, gravity: 7.5, jumps: [[.07, 3], [.29, 3.3], [.5, 3], [.64, 3.6], [.86, 3.1]],
    shortcut: { u0: .779, u1: .91, side: 1, width: 10, surface: 'regolith', grip: .7, top: .92, label: 'SHORTCUT  ›  CRATER RUN' },
    points: [[0,  0,  0],  [150,  0,  2],  [240,  -30,  10],  [330,  -10,  2],  [380,  60,  6],  [330,  130,  12],  [230,  120,  3],  [180,  180,  9],  [260,  250,  2],  [380,  260,  10],  [440,  340,  3],  [350,  420,  8],  [220,  400,  1],  [120,  340,  11],  [0,  380,  2],  [-120,  420,  8],  [-240,  380,  13],  [-300,  290,  3],  [-230,  210,  9],  [-320,  150,  2],  [-400,  80,  8],  [-330,  0,  1],  [-180,  -20,  6]],
    style: { asphalt: '#2b2d34', edge: '#cdefff', center: '#35e0ff', glowLines: '#ffffff', kerb: ['#35e0ff', '#1a1c22'], kerbGlow: '#ffffff', runoff: '#5d5f66', barrier: '#1c1e25', barrierStripe: '#35e0ff', barrierGlow: '#ffffff', barrierText: '#7c859a', barrierCap: '#2c2f38', sponsor: 'SELENE ORBITAL', pillar: 0x6a6d75 },
    exposure: .75, bloom: { strength: .16, radius: .4, threshold: .95 }, night: true, smoke: [.72, .72, .75],
    height(x, z, d, ty, n, tr) {
      const t = smooth(tr.half + 14, tr.half + 70, d);
      const cd = Math.hypot(x - 20, z - 200);
      let h = 3 + n(x * .006, z * .006, 5) * 9 + moonCraters(x, z);
      h += smooth(430, 820, cd) * (45 + n(x * .004 + 3, z * .004, 4) * 40);
      return lerp(ty - .45, h, t);
    },
    build(ctx) {
      const { scene, q, tr } = ctx;
      gradientSky(ctx, '#000004', '#02030a', '#04050b', '#16243f', new THREE.Vector3(-1, 0, -.4));
      scene.add(starField(3200, 4200, 13, -.05));
      scene.environment = envFromScene(s => { s.add(new THREE.Mesh(new THREE.SphereGeometry(100, 16, 8), skyGradientMat('#000004', '#05070f', '#2a2c33', '#35e0ff', new THREE.Vector3(0, 0, 1)))); envGlowPanels(s, [['#ffffff', 60, 40, 30, 30, 18], ['#35e0ff', -50, 10, -40, 30, 8]]); });
      scene.fog = new THREE.FogExp2(0x05060c, .00045);
      addLights(ctx, 0x4a5670, 0x0c0c10, .35, 0xfff6e8, 3.4, new THREE.Vector3(.55, .5, -.3));
      buildTerrain(ctx, (c, x, y, z, ny, d) => {
        c.set('#8e9097').lerp(new THREE.Color('#65676e'), clamp(ctx.noise(x * .015, z * .015, 3) + .5, 0, 1));
        if (y < 0) c.lerp(new THREE.Color('#4d4f56'), smooth(0, -8, y) * .7);
        if (ny < .8) c.lerp(new THREE.Color('#55575e'), smooth(.8, .55, ny));
        if (d < tr.half + 10) c.lerp(new THREE.Color('#5a5c63'), .5);
      });
      const dens = q.density;
      const rocks = scatter(ctx, Math.round(420 * dens), (x, z, n, r) => { if (n.d < tr.half + 8) return null; const y = ctx.heightAt(x, z); const s = .6 + Math.pow(r(), 3) * 6; return { x, y: y + s * .2, z, s, sy: s * (.5 + r() * .5), ry: r() * 6, rx: r() }; }, 21);
      scene.add(instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x7c7e85, roughness: .95, flatShading: true }), rocks));
      // Earth hanging in the black sky
      const earthT = canvasTex(768, 384, (g, w, h) => {
        const id = g.createImageData(w, h), n = makeNoise(5);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const u = x / w * Math.PI * 2, v = y / h * Math.PI; const px = Math.cos(u) * Math.sin(v), py = Math.cos(v), pz = Math.sin(u) * Math.sin(v);
          const land = n(px * 1.8 + 5, pz * 1.8 + py * 1.3, 5) + .08 * Math.cos(v * 2); const cl = n(px * 3 + 9, py * 3 + pz * 2, 4);
          let r = 22, gg = 70, b = 150; if (land > .05) { r = 70 + land * 160; gg = 110 + land * 60; b = 60; } if (Math.abs(py) > .88) { r = gg = b = 235; }
          if (cl > .12) { const k = Math.min(1, (cl - .12) * 5); r = lerp(r, 245, k); gg = lerp(gg, 248, k); b = lerp(b, 255, k); }
          const i = (y * w + x) * 4; id.data[i] = r; id.data[i + 1] = gg; id.data[i + 2] = b; id.data[i + 3] = 255;
        }
        g.putImageData(id, 0, 0);
      }, { repeat: false });
      const earth = new THREE.Mesh(new THREE.SphereGeometry(230, 48, 32), new THREE.MeshStandardMaterial({ map: earthT, roughness: .7, fog: false }));
      const atm = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: new THREE.Color(.35, .7, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); atm.scale.set(620, 620, 1);
      scene.add(earth, atm);
      ctx.updaters.push((t, dt, cam) => { earth.position.set(cam.position.x - 1500, cam.position.y + 700, cam.position.z - 2400); atm.position.copy(earth.position); earth.rotation.y = t * .01; });
      // lunar base beside the start straight
      const base = new THREE.Group(); orientOnTrack(base, tr, 30, -(tr.wall + 40), 0); base.position.y = ctx.heightAt(base.position.x, base.position.z) - .3; scene.add(base);
      const white = new THREE.MeshStandardMaterial({ color: 0xe8eaee, roughness: .5, metalness: .2 });
      const winM = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.6) });
      for (const [x, z, r] of [[0, 0, 11], [26, 10, 8], [-22, 14, 7]]) {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), white); dome.position.set(x, 0, z); dome.castShadow = true; base.add(dome);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.001, r * 1.001, .5, 32, 1, true), winM); band.position.set(x, r * .3, z); base.add(band);
      }
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 20, 12), white); tube.rotation.z = Math.PI / 2; tube.position.set(12, 1.4, 5); base.add(tube);
      const dish = new THREE.Group(); dish.position.set(-8, 0, -18); base.add(dish);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.4, .6, 12, 8), white); mast.position.y = 6; dish.add(mast);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3), white); bowl.material = white; bowl.position.y = 12; bowl.rotation.x = Math.PI * .7; dish.add(bowl);
      ctx.updaters.push(t => { dish.rotation.y = t * .25; });
      const rocket = new THREE.Group(); rocket.position.set(40, 0, -22); base.add(rocket);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 22, 20), white); body.position.y = 13; body.castShadow = true; rocket.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 20), new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: .5 })); nose.position.y = 27; rocket.add(nose);
      for (let k = 0; k < 4; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(.3, 5, 3), new THREE.MeshStandardMaterial({ color: 0xff5a1f })); fin.position.set(Math.cos(k * Math.PI / 2) * 2.6, 3.5, Math.sin(k * Math.PI / 2) * 2.6); fin.rotation.y = -k * Math.PI / 2; rocket.add(fin); }
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, .4, 32), new THREE.MeshStandardMaterial({ color: 0x3a3c44, roughness: .8 })); pad.position.set(40, .2, -22); base.add(pad);
      const blinks = []; for (let k = 0; k < 8; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, .4, .2) })); const a = k / 8 * Math.PI * 2; m.position.set(40 + Math.cos(a) * 8.6, .6, -22 + Math.sin(a) * 8.6); base.add(m); blinks.push(m); }
      ctx.updaters.push(t => { blinks.forEach((m, k) => m.visible = (Math.floor(t * 3) + k) % 4 === 0); });
      // light posts along the road
      const beacons = []; for (let i = 0; i < tr.N; i += Math.round(40 / tr.seg)) for (const s of [-1, 1]) { const p = tr.P[i], R = tr.R[i]; const o = (tr.wall + 1.2) * s; beacons.push({ x: p.x + R.x * o, y: p.y + 1.6, z: p.z + R.z * o, sx: .25, sy: 3.2, sz: .25 }); }
      scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.3, 1.5) }), beacons, false));
    }
  },
  {
    key: 'saturn', name: 'Saturn Ringway', sub: 'Floating figure-eight above the rings', seed: 83, width: 17, center: [0, 170], scatterR: 700, gravity: 11, floating: true, jumps: [[.12, 2.6], [.45, 3], [.9, 2.6]],
    points: [[430,  180,  40],  [420,  90,  44],  [370,  30,  50],  [290,  0,  56],  [210,  20,  60],  [140,  70,  62],  [0,  150,  58],  [-140,  230,  52],  [-230,  300,  46],  [-320,  330,  40],  [-410,  300,  36],  [-460,  220,  34],  [-430,  120,  38],  [-460,  40,  44],  [-380,  -10,  50],  [-260,  10,  60],  [-140,  70,  68],  [0,  150,  72],  [140,  230,  70],  [230,  300,  62],  [300,  340,  54],  [370,  320,  48],  [420,  270,  44]],
    style: { asphalt: '#1d1e29', edge: '#ffe2a8', center: '#ffb020', glowLines: '#ffffff', kerb: ['#ffb020', '#16161e'], kerbGlow: '#ffffff', runoff: '#262734', barrier: '#15161e', barrierStripe: '#ffb020', barrierGlow: '#ffffff', barrierText: '#5a5f78', barrierCap: '#232531', sponsor: 'RINGWAY LOGISTICS', pillar: 0x2a2c38, pylon: '#ffb020' },
    exposure: .85, bloom: { strength: .24, radius: .45, threshold: .94 }, night: true, smoke: [.8, .78, .9],
    build(ctx) {
      const { scene, q, tr } = ctx;
      gradientSky(ctx, '#010108', '#06051c', '#0b0820', '#ff8a4a', new THREE.Vector3(1, 0, -1));
      scene.add(starField(3500, 4200, 17, -1));
      scene.environment = envFromScene(s => { s.add(new THREE.Mesh(new THREE.SphereGeometry(100, 16, 8), skyGradientMat('#02020a', '#0d0a26', '#2a1a10', '#ffb46a', new THREE.Vector3(0, -.3, -1)))); envGlowPanels(s, [['#ffcf8a', 0, -30, -80, 90, 30], ['#7a8cff', -60, 20, 30, 30, 10]]); });
      addLights(ctx, 0x6a6ab0, 0x2a1a10, .45, 0xfff0d8, 3.2, new THREE.Vector3(.8, .45, -.2));
      // Saturn and its rings
      const R0 = 1100;
      const bands = canvasTex(1024, 512, (g, w, h) => {
        const n = makeNoise(9); const cols = ['#e8d2a0', '#d6b57c', '#c29a62', '#f0e0b8', '#b88c55', '#dcc28c', '#a87c4a', '#ead9ae'];
        for (let y = 0; y < h; y++) { const k = y / h; const b = Math.floor((k * 22 + n(k * 9, 1, 3) * 3 + 40)) % cols.length; g.fillStyle = cols[b]; g.fillRect(0, y, w, 1); }
        g.globalAlpha = .08; for (let i = 0; i < 400; i++) { g.fillStyle = Math.random() > .5 ? '#fff' : '#6a4a2a'; g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 200, 1 + Math.random() * 2); }
        g.globalAlpha = 1;
      }, { repeat: false });
      const planet = new THREE.Group(); planet.position.set(900, -950, -2300); planet.rotation.z = .35; planet.rotation.x = .12; scene.add(planet);
      const sat = new THREE.Mesh(new THREE.SphereGeometry(R0, 96, 64), new THREE.MeshStandardMaterial({ map: bands, roughness: .9, fog: false })); planet.add(sat);
      const ringTex = canvasTex(1024, 8, (g, w, h) => { const n = makeNoise(4); for (let x = 0; x < w; x++) { const k = x / w; let a = .25 + .65 * Math.abs(n(k * 30, 2, 3)) * 2; if (k > .56 && k < .6) a = .05; if (k < .03 || k > .97) a *= k < .03 ? k / .03 : (1 - k) / .03; const c = Math.floor(190 + 50 * Math.sin(k * 40)); g.fillStyle = `rgba(${c},${c - 20},${c - 55},${clamp(a, 0, 1)})`; g.fillRect(x, 0, 1, h); } }, { repeat: false });
      const ringG = new THREE.RingGeometry(R0 * 1.25, R0 * 2.35, 256, 1); { const p = ringG.attributes.position, uv = ringG.attributes.uv; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (r - R0 * 1.25) / (R0 * 1.1), .5); } }
      const ring = new THREE.Mesh(ringG, new THREE.MeshStandardMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, roughness: .9, depthWrite: false, fog: false, emissive: new THREE.Color(.25, .2, .14), emissiveMap: ringTex }));
      ring.rotation.x = -Math.PI / 2; planet.add(ring);
      const moonS = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 1, fog: false })); moonS.position.set(-2400, 500, -2800); scene.add(moonS);
      ctx.updaters.push(t => { sat.rotation.y = t * .004; });
      // ring debris floating around the circuit
      const dens = q.density; const rr = mulberry(33); const bits = [];
      for (let k = 0; k < Math.round(1400 * dens); k++) {
        const a = rr() * Math.PI * 2, d = 120 + rr() * 900; const x = Math.cos(a) * d, z = 170 + Math.sin(a) * d * .8; const n = trackNearest(tr, x, z);
        const y = 10 + rr() * 110 - (rr() < .5 ? 60 : 0); if (n.d < tr.wall + 25 && Math.abs(y - n.y) < 30) continue;
        const s = .6 + Math.pow(rr(), 4) * 14; bits.push({ x, y, z, s, sy: s * (.6 + rr() * .6), rx: rr() * 6, ry: rr() * 6, c: new THREE.Color().setHSL(.1 + rr() * .05, .25, .45 + rr() * .35) });
      }
      const debris = instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: .8, flatShading: true }), bits, false); scene.add(debris);
      ctx.updaters.push((t, dt) => { debris.rotation.y = Math.sin(t * .02) * .01; });
      const big = []; for (let k = 0; k < 10; k++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(12 + rr() * 20, 1), new THREE.MeshStandardMaterial({ color: 0x9a8a7a, roughness: .9, flatShading: true })); const a = rr() * Math.PI * 2; m.position.set(Math.cos(a) * (600 + rr() * 300), -40 + rr() * 160, 170 + Math.sin(a) * (500 + rr() * 300)); scene.add(m); big.push([m, rr() * .2]); }
      ctx.updaters.push((t, dt) => { for (const [m, s] of big) { m.rotation.x += dt * s; m.rotation.y += dt * s * .7; } });
    }
  }
];


/* ===== src/04-assets.js ===== */
/* Asset paths for the hosted build (the claude.ai build embeds these instead). */
const THUMBS = {"coast": "assets/tracks/coast.jpg", "metro": "assets/tracks/metro.jpg", "aurora": "assets/tracks/aurora.jpg", "canyon": "assets/tracks/canyon.jpg", "moon": "assets/tracks/moon.jpg", "saturn": "assets/tracks/saturn.jpg"};
const VO_KEYS = ["air", "back", "bestLap", "drift", "finalLap", "finish_2", "finish_3", "finish_4", "finish_5", "finish_6", "finish_7", "finish_8", "go", "lap_2", "lap_3", "lap_4", "lap_5", "n1", "n2", "n3", "nitro", "overtake_1", "overtake_2", "overtake_3", "overtake_4", "overtake_5", "overtake_6", "overtake_7", "overtake_8", "perfect", "wall", "welcome_aurora", "welcome_canyon", "welcome_coast", "welcome_metro", "welcome_moon", "welcome_saturn", "win", "wrong"];


/* ===== src/05-i18n-voice.js ===== */

/* ================= LANGUAGE + ANNOUNCER ================= */
const TA_ORD = ['முதல்', 'இரண்டாம்', 'மூன்றாம்', 'நான்காம்', 'ஐந்தாம்', 'ஆறாம்'];
const EN_ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const I18N = {
  en: {
    tag: 'Drift through corners to fill nitro, then fire it on the straights. Every circuit hides a shortcut.',
    spTag: 'Six circuits · Nine machines · One finish line', controls: 'Controls', settings: 'Settings', raceSetup: 'Race setup', done: 'Done', enterHint: 'Press Enter to start', spGo: 'Press any key to start', spFoot: 'Headphones on. Best with a keyboard or gamepad.',
    stEngine: 'Starting engine', stGarage: 'Opening the garage', stTune: 'Tuning five machines', stReady: 'Ready', ldEyebrow: 'Next circuit',
    stTerrain: 'Shaping the terrain', stAsphalt: 'Laying asphalt', stGrid: 'Rolling out the grid', stShaders: 'Warming up the lights',
    sLength: 'Length', sCorners: 'Corners', sClimb: 'Climb', sLaps: 'Laps', sBridge: 'Flyover crossing', shortcut: 'Shortcut', bigAir: 'Big air', sGravity: 'Gravity',
    paint: 'Paint', rotate: 'Turn your phone sideways to race', fullscreen: 'Full screen', rotHint: 'Drag to rotate · scroll to zoom', finishLbl: 'Finish', gloss: 'Gloss', matte: 'Matte', pearl: 'Pearl', playFriends: 'Play with friends', lowGravity: 'Low gravity',
    createRoom: 'Create a room', createHint: 'You host: pick the circuit, laps and whether bots join.', create: 'Create room', joinRoom: 'Join a room', joinHint: 'Type the code your friend shared.', join: 'Join',
    onIntro: 'Create a room and send the 6-digit code to your friends, or join a friend\'s room with their code.', roomCode: 'Room code', copy: 'Copy code', copied: 'Copied',
    opponents: 'Opponents', onlyUs: n => 'Only us (' + n + ')', addBots: n => '+ Bots to ' + n, leaveRoom: 'Leave room', close: 'Close',
    onNA: 'Online rooms work in the web version of this game on claude.ai. Open the shared game link in your browser to create or join a room.',
    yourName: 'Your driver name', nameHint: 'Shown on the leaderboard and to friends in online rooms.', save: 'Save', backLobby: 'Back to lobby',
    waitHost: 'Waiting for the host to start', waitPlayers: 'Waiting for players', raceInProgress: 'A race is running. You will join the next one.', hostLeft: 'The host left the room.',
    noRoom: 'No room with that code. Check the code and try again.', connecting: 'Connecting…', invalidCode: 'Enter the 6-digit code.', roomFull: 'That room is full (6 players).', playersOf: n => n + ' / 6 players', openSlot: 'Open slot · waiting for a friend', back: 'Back', fillAsk: (n, m) => (n === 1 ? 'Only you are here. ' : n + ' players are here. ') + 'Fill the other ' + m + ' spots with bots?', fillYes: m => 'Yes, add ' + m + ' bots', fillNo: n => 'No, race with ' + n, netErr: 'Could not reach the room. Try again in a moment.',
    playersIn: n => n + (n === 1 ? ' player in the room' : ' players in the room'), youTag: 'You', hostTag: 'Host', botTag: 'Bot', racingTag: 'Racing…',
    lobbyHintApp: 'Send this code to your friends. They open Velocity Rift on their PC, choose Play with friends, then Join room, and type it.', lobbyHintHost: 'Share this game with your friends (Share button at the top of the page), then send them this code.', lobbyHintGuest: 'You are in. The host starts the race.',
    online: 'Online', onlineRoom: c => 'Online · Room ' + c,
    kThrottle: 'Throttle', kBrake: 'Brake / reverse', kSteer: 'Steer', kDrift: 'Handbrake drift', kNitro: 'Nitro', kCam: 'Camera', kReset: 'Reset car', kPause: 'Pause', kLang: 'Language',
    tipLabel: 'Pro tip', tips: ['Tap Space in a corner to slide. Longer drifts fill the nitro gauge faster.', 'Hold throttle when the lights go out with revs in the orange zone for a perfect launch.', 'Save nitro for the long straights. It adds top speed, not grip.', 'Press C to switch between chase, far and bumper cameras.', 'Every circuit hides a shortcut. It is shorter but narrower, with less grip. Look for the yellow sign.', 'Brush the wall and you lose speed. Hit it hard and you lose a lot more.'],
    machine: 'Machine', circuit: 'Circuit', laps: 'Laps', rivals: 'Rivals', graphics: 'Graphics', music: 'Music', language: 'Language', voice: 'Announcer',
    btnGas: 'Gas', btnBrake: 'Brake', btnNitro: 'Nitro', btnDrift: 'Drift',
    padTitle: 'Controls layout', padSize: 'Size · all', padSizeOne: 'Size', padAlpha: 'Opacity', padReset: 'Reset', padCancel: 'Cancel', padSave: 'Save',
    steering: 'Steering', steerPads: 'Buttons', steerSlider: 'Slider', steerTilt: 'Tilt', sensitivity: 'Sensitivity', normal: 'Normal',
    tiltOk: 'Hold the phone the way you want to race. Tilt steering zeroes itself there every time a race starts.',
    tiltNo: 'This phone would not share its motion sensor, so steering stays on the buttons.',
    kTouch: 'Buttons, a slider or tilt — change it in Settings.',
    padHintAll: 'Drag a control to move it. The size slider resizes every control — tap one first to resize just that one.',
    padHintOne: 'Drag to move. The slider resizes the selected control. Tap it again to go back to all.',
    spGoTouch: 'Tap to start', spFootTouch: 'Headphones on. Turn the phone sideways to race.', rotHintTouch: 'Drag to rotate · pinch to zoom',
    start: 'Start race', musicKey: 'Change music', pads: 'Gamepad and touch controls work too.',
    lap: 'Lap', lapTime: 'Lap time', best: 'Best', total: 'Total', paused: 'Paused', resume: 'Resume', restart: 'Restart', garage: 'Garage',
    driver: 'Driver', car: 'Car', time: 'Time', bestLap: 'Best lap', again: 'Race again', next: 'Next circuit',
    on: 'On', off: 'Off', rookie: 'Rookie', pro: 'Pro', legend: 'Legend', low: 'Low', high: 'High', ultra: 'Ultra', synth: 'Synth', kuthu: 'Kuthu',
    topSpeed: 'Top speed', accel: 'Acceleration', handling: 'Handling', drift: 'Drift', yourBest: 'Your best lap',
    go: 'Go', finalLap: 'Final lap', wrongWay: 'Wrong way', victory: 'Victory', backOn: 'Back on track', perfect: 'Perfect launch',
    lapN: n => 'Lap ' + n, raceTime: 'Race time', place: n => 'P' + n, placeTitle: n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th') + ' place',
    overtake: 'Overtake', greatDrift: 'Great drift', nitroReady: 'Nitro ready', wall: 'Watch the wall', lapsWord: n => n + (n > 1 ? ' laps' : ' lap'), rivalsWord: d => ['Rookie', 'Pro', 'Legend'][d] + ' rivals',
    pauseInfo: (s, l, n) => s + ' · Lap ' + l + ' of ' + n, noTamil: '',
    say: {
      welcome: s => `Welcome to ${s}. Get ready.`, n3: 'Three', n2: 'Two', n1: 'One', go: 'Go!', perfect: 'Perfect launch!',
      lap: n => `Lap ${n}`, finalLap: 'Final lap! Give it everything!', bestLap: 'New best lap!', overtake: p => `Overtake! You are now ${EN_ORD[p - 1]}.`,
      air: 'Big air!', drift: 'Great drift!', nitro: 'Nitro ready!', wrong: 'Wrong way! Turn around!', wall: 'Watch the wall!',
      win: 'Victory! You win the race!', finish: p => `Race finished. You placed ${EN_ORD[p - 1]}.`, back: 'Back on track.'
    }
  },
  ta: {
    tag: 'வளைவுகளில் டிரிஃப்ட் செய்து நைட்ரோவை நிரப்புங்கள், நேர்ப்பாதையில் பறக்கவிடுங்கள். ஒவ்வொரு பாதையிலும் ஒரு குறுக்கு வழி உண்டு.',
    spTag: 'ஆறு பாதைகள் · ஒன்பது கார்கள் · ஒரே இலக்கு', controls: 'கட்டுப்பாடுகள்', settings: 'அமைப்புகள்', raceSetup: 'பந்தய அமைப்பு', done: 'சரி', enterHint: 'தொடங்க Enter அழுத்துங்கள்', spGo: 'தொடங்க ஏதேனும் விசையை அழுத்துங்கள்', spFoot: 'ஹெட்ஃபோன் போடுங்கள். கீபோர்டு அல்லது கேம்பேடில் சிறப்பு.',
    stEngine: 'இன்ஜின் ஸ்டார்ட் ஆகிறது', stGarage: 'கேரேஜ் திறக்கிறது', stTune: 'ஐந்து கார்களை டியூன் செய்கிறோம்', stReady: 'தயார்', ldEyebrow: 'அடுத்த பாதை',
    stTerrain: 'நிலப்பரப்பை உருவாக்குகிறோம்', stAsphalt: 'சாலை அமைக்கிறோம்', stGrid: 'கார்கள் வரிசையில்', stShaders: 'விளக்குகள் தயாராகின்றன',
    sLength: 'நீளம்', sCorners: 'வளைவுகள்', sClimb: 'ஏற்றம்', sLaps: 'சுற்றுகள்', sBridge: 'மேம்பாலக் கடப்பு', shortcut: 'குறுக்கு வழி', bigAir: 'சூப்பர் ஜம்ப்', sGravity: 'ஈர்ப்பு',
    paint: 'வண்ணம்', rotate: 'பந்தயத்துக்கு போனை பக்கவாட்டில் திருப்புங்கள்', fullscreen: 'முழுத் திரை', rotHint: 'இழுத்து சுழற்றுங்கள் · ஸ்க்ரோல் செய்து பெரிதாக்குங்கள்', finishLbl: 'பூச்சு', gloss: 'பளபளப்பு', matte: 'மேட்', pearl: 'முத்து', playFriends: 'நண்பர்களுடன் விளையாடு', lowGravity: 'குறைந்த ஈர்ப்பு',
    createRoom: 'அறை உருவாக்கு', createHint: 'நீங்கள் ஹோஸ்ட்: பாதை, சுற்றுகள், பாட்கள் வேண்டுமா என்பதை நீங்கள் தேர்வு செய்யலாம்.', create: 'அறை உருவாக்கு', joinRoom: 'அறையில் சேர்', joinHint: 'நண்பர் அனுப்பிய குறியீட்டை உள்ளிடுங்கள்.', join: 'சேர்',
    onIntro: 'ஒரு அறையை உருவாக்கி 6 இலக்கக் குறியீட்டை நண்பர்களுக்கு அனுப்புங்கள், அல்லது நண்பரின் குறியீட்டை உள்ளிட்டு சேருங்கள்.', roomCode: 'அறை குறியீடு', copy: 'குறியீட்டை நகலெடு', copied: 'நகலெடுக்கப்பட்டது',
    opponents: 'எதிராளிகள்', onlyUs: n => 'நாங்கள் மட்டும் (' + n + ')', addBots: n => '+ பாட்கள் ' + n + ' வரை', leaveRoom: 'அறையை விட்டு வெளியேறு', close: 'மூடு',
    onNA: 'ஆன்லைன் அறைகள் claude.ai-ல் உள்ள வெப் பதிப்பில் மட்டுமே வேலை செய்யும். நண்பர்களுடன் விளையாட பகிரப்பட்ட கேம் லிங்கை பிரவுசரில் திறங்கள்.',
    yourName: 'உங்கள் டிரைவர் பெயர்', nameHint: 'லீடர்போர்டிலும், ஆன்லைன் அறைகளில் நண்பர்களுக்கும் காட்டப்படும்.', save: 'சேமி', backLobby: 'லாபிக்கு திரும்பு',
    waitHost: 'ஹோஸ்ட் தொடங்கும் வரை காத்திருக்கிறோம்', waitPlayers: 'வீரர்களுக்காக காத்திருக்கிறோம்', raceInProgress: 'ஒரு பந்தயம் நடக்கிறது. அடுத்த பந்தயத்தில் சேருவீர்கள்.', hostLeft: 'ஹோஸ்ட் அறையை விட்டு வெளியேறினார்.',
    noRoom: 'அந்தக் குறியீட்டில் அறை இல்லை. சரிபார்த்து மீண்டும் முயலுங்கள்.', connecting: 'இணைக்கிறது…', invalidCode: '6 இலக்கக் குறியீட்டை உள்ளிடுங்கள்.', roomFull: 'அறை நிரம்பிவிட்டது (6 வீரர்கள்).', playersOf: n => n + ' / 6 வீரர்கள்', openSlot: 'காலி இடம் · நண்பருக்காக காத்திருக்கிறது', back: 'பின்செல்', fillAsk: (n, m) => (n === 1 ? 'நீங்கள் மட்டும் இருக்கிறீர்கள். ' : n + ' வீரர்கள் இருக்கிறார்கள். ') + 'மீதி ' + m + ' இடங்களை பாட்களால் நிரப்பவா?', fillYes: m => 'ஆம், ' + m + ' பாட்கள் சேர்', fillNo: n => 'இல்லை, ' + n + ' பேர் மட்டும்', netErr: 'அறையை அடைய முடியவில்லை. சிறிது நேரம் கழித்து முயலுங்கள்.',
    playersIn: n => 'அறையில் ' + n + ' வீரர்' + (n === 1 ? '' : 'கள்'), youTag: 'நீங்கள்', hostTag: 'ஹோஸ்ட்', botTag: 'பாட்', racingTag: 'பந்தயத்தில்…',
    lobbyHintApp: 'இந்தக் குறியீட்டை நண்பர்களுக்கு அனுப்புங்கள். அவர்கள் தங்கள் PC-ல் Velocity Rift-ஐத் திறந்து, நண்பர்களுடன் விளையாடு → அறையில் சேர் என்பதில் இந்தக் குறியீட்டை உள்ளிடலாம்.', lobbyHintHost: 'இந்த கேமை நண்பர்களுடன் பகிருங்கள் (பக்கத்தின் மேலே உள்ள Share பொத்தான்), பிறகு இந்தக் குறியீட்டை அனுப்புங்கள்.', lobbyHintGuest: 'நீங்கள் அறையில் இருக்கிறீர்கள். ஹோஸ்ட் பந்தயத்தைத் தொடங்குவார்.',
    online: 'ஆன்லைன்', onlineRoom: c => 'ஆன்லைன் · அறை ' + c,
    kThrottle: 'வேகம் கூட்டு', kBrake: 'பிரேக் / பின்னோக்கி', kSteer: 'திருப்பு', kDrift: 'ஹேண்ட்பிரேக் டிரிஃப்ட்', kNitro: 'நைட்ரோ', kCam: 'கேமரா', kReset: 'காரை மீட்டமை', kPause: 'இடைநிறுத்து', kLang: 'மொழி',
    tipLabel: 'டிப்ஸ்', tips: ['வளைவில் Space அழுத்தி சறுக்குங்கள். நீண்ட டிரிஃப்ட் நைட்ரோவை வேகமாக நிரப்பும்.', 'விளக்குகள் அணையும்போது RPM ஆரஞ்சு பகுதியில் இருந்தால் அருமையான தொடக்கம் கிடைக்கும்.', 'நைட்ரோவை நீண்ட நேர்ப்பாதைக்கு சேமியுங்கள். அது வேகத்தைக் கூட்டும், பிடிப்பை அல்ல.', 'C அழுத்தி கேமரா கோணத்தை மாற்றலாம்.', 'ஒவ்வொரு பாதையிலும் ஒரு குறுக்கு வழி உண்டு. தூரம் குறைவு, ஆனால் குறுகலானது, பிடிப்பு குறைவு. மஞ்சள் பலகையைப் பாருங்கள்.', 'சுவரில் உரசினால் வேகம் குறையும். பலமாக மோதினால் இன்னும் அதிகம் குறையும்.'],
    machine: 'கார்', circuit: 'பாதை', laps: 'சுற்றுகள்', rivals: 'போட்டியாளர்', graphics: 'கிராபிக்ஸ்', music: 'இசை', language: 'மொழி', voice: 'அறிவிப்பாளர்',
    btnGas: 'கேஸ்', btnBrake: 'பிரேக்', btnNitro: 'நைட்ரோ', btnDrift: 'டிரிஃப்ட்',
    padTitle: 'கட்டுப்பாடு அமைப்பு', padSize: 'அளவு · அனைத்தும்', padSizeOne: 'அளவு', padAlpha: 'வெளிப்படைத்தன்மை', padReset: 'மீட்டமை', padCancel: 'ரத்து', padSave: 'சேமி',
    steering: 'ஸ்டீயரிங்', steerPads: 'பட்டன்', steerSlider: 'ஸ்லைடர்', steerTilt: 'சாய்வு', sensitivity: 'உணர்திறன்', normal: 'சாதாரணம்',
    tiltOk: 'ரேஸ் ஓட்ட வசதியான நிலையில் ஃபோனைப் பிடியுங்கள். ஒவ்வொரு ரேஸ் தொடங்கும்போதும் சாய்வு அங்கேயே சுழியமாகும்.',
    tiltNo: 'இந்த ஃபோன் அதன் மோஷன் சென்சாரைப் பகிரவில்லை, அதனால் ஸ்டீயரிங் பட்டன்களிலேயே இருக்கும்.',
    kTouch: 'பட்டன், ஸ்லைடர் அல்லது சாய்வு — அமைப்புகளில் மாற்றலாம்.',
    padHintAll: 'நகர்த்த இழுங்கள். அளவு ஸ்லைடர் எல்லா பட்டன்களையும் மாற்றும் — ஒன்றை மட்டும் மாற்ற அதை தட்டுங்கள்.',
    padHintOne: 'நகர்த்த இழுங்கள். ஸ்லைடர் தேர்ந்தெடுத்த பட்டனை மாற்றும். மீண்டும் தட்டினால் அனைத்தும்.',
    spGoTouch: 'தொடங்க தட்டுங்கள்', spFootTouch: 'ஹெட்ஃபோன் போடுங்கள். ரேஸுக்கு ஃபோனை பக்கவாட்டில் திருப்புங்கள்.', rotHintTouch: 'சுழற்ற இழுங்கள் · பெரிதாக்க பிஞ்ச்',
    start: 'பந்தயம் தொடங்கு', musicKey: 'இசை மாற்று', pads: 'கேம்பேட் மற்றும் டச் கண்ட்ரோலும் வேலை செய்யும்.',
    lap: 'சுற்று', lapTime: 'சுற்று நேரம்', best: 'சிறந்தது', total: 'மொத்தம்', paused: 'இடைநிறுத்தம்', resume: 'தொடர்', restart: 'மீண்டும்', garage: 'கேரேஜ்',
    driver: 'ஓட்டுநர்', car: 'கார்', time: 'நேரம்', bestLap: 'சிறந்த சுற்று', again: 'மீண்டும் ஓட்டு', next: 'அடுத்த பாதை',
    on: 'ஆன்', off: 'ஆஃப்', rookie: 'எளிது', pro: 'நடுத்தரம்', legend: 'கடினம்', low: 'குறைவு', high: 'அதிகம்', ultra: 'அல்ட்ரா', synth: 'சிந்த்', kuthu: 'குத்து',
    topSpeed: 'அதிவேகம்', accel: 'முடுக்கம்', handling: 'கையாளுதல்', drift: 'டிரிஃப்ட்', yourBest: 'உங்கள் சிறந்த சுற்று',
    go: 'போ!', finalLap: 'கடைசி சுற்று', wrongWay: 'தவறான திசை', victory: 'வெற்றி!', backOn: 'மீண்டும் பாதையில்', perfect: 'அருமையான தொடக்கம்',
    lapN: n => 'சுற்று ' + n, raceTime: 'பந்தய நேரம்', place: n => TA_ORD[n - 1] + ' இடம்', placeTitle: n => TA_ORD[n - 1] + ' இடம்',
    overtake: 'முந்தினீர்கள்!', greatDrift: 'சூப்பர் டிரிஃப்ட்!', nitroReady: 'நைட்ரோ தயார்', wall: 'சுவர் கவனம்!', lapsWord: n => n + ' சுற்று', rivalsWord: d => ['எளிது', 'நடுத்தரம்', 'கடினம்'][d] + ' போட்டி',
    pauseInfo: (s, l, n) => s + ' · சுற்று ' + l + ' / ' + n,
    noTamil: 'இந்த சாதனத்தில் தமிழ் குரல் நிறுவப்படவில்லை. திரையில் அறிவிப்புகள் தமிழில் வரும்; குரல் வேறு மொழியில் ஒலிக்கலாம்.',
    say: {
      welcome: s => `${s} பந்தயத்துக்கு வரவேற்கிறோம்! தயாராகுங்கள்!`, n3: 'மூன்று', n2: 'இரண்டு', n1: 'ஒன்று', go: 'போ!', perfect: 'அருமையான தொடக்கம்!',
      lap: n => `சுற்று ${n}`, finalLap: 'கடைசி சுற்று! முழு வேகத்தில் போங்க!', bestLap: 'புதிய சிறந்த சுற்று நேரம்!', overtake: p => `முந்திவிட்டீர்கள்! இப்போது ${TA_ORD[p - 1]} இடம்!`,
      air: 'சூப்பர் ஜம்ப்!', drift: 'சூப்பர் டிரிஃப்ட்!', nitro: 'நைட்ரோ தயார்!', wrong: 'தவறான திசை! திரும்புங்கள்!', wall: 'சுவரைக் கவனியுங்கள்!',
      win: 'வெற்றி! நீங்கள் தான் சாம்பியன்!', finish: p => `பந்தயம் முடிந்தது. நீங்கள் ${TA_ORD[p - 1]} இடம் பிடித்தீர்கள்.`, back: 'மீண்டும் பாதையில்.'
    }
  }
};
const STAGE_TA = { coast: 'கடற்கரை சிக்கேன்கள், மலை வளைவுகள்', metro: 'மழை இரவு, மேம்பாலத்துடன் 8 வடிவம்', aurora: 'பனி ஹேர்பின் வளைவுகள், 32 மீ ஏற்றம்', canyon: 'பாலைவனம், கல் பாலத்தின் மேல் 8 வடிவம்', moon: 'குறைந்த ஈர்ப்பு: மேடுகளில் பறந்து செல்லுங்கள்', saturn: 'வளையங்களுக்கு மேல் மிதக்கும் 8 வடிவப் பாதை' };

const CLS_TA = ['சமநிலை கிராண்ட் டூரர்', 'அதிவேக வேட்டைக்காரன்', 'வேகத் தொடக்க நிபுணர்', 'டிரிஃப்ட் இயந்திரம்', 'ஹைப்பர்கார் முன்மாதிரி', 'கிளாசிக் மஸில் கார்', 'மின்சார ஹைப்பர்கார்', 'ஆஃப்-ரோடு பக்கி', 'ரெட்ரோ எண்டூரன்ஸ் ரேசர்'];
const L = () => I18N[S.lang] || I18N.en;
const tr_ = (k, ...a) => { const v = L()[k]; return typeof v === 'function' ? v(...a) : (v ?? k); };
function applyI18n() {
  document.documentElement.lang = S.lang === 'ta' ? 'ta' : 'en';
  document.body.classList.toggle('ta', S.lang === 'ta');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tr_(IS_TOUCH && el.dataset.i18nTouch ? el.dataset.i18nTouch : el.dataset.i18n); });
  document.querySelectorAll('.langpill button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === S.lang));
  const note = $('voiceNote');
  if (note) { const need = false; note.hidden = !need; note.textContent = need ? L().noTamil : ''; }
}
const VOICE = {
  ready: false, voices: [], last: {},
  load() { if (!('speechSynthesis' in window)) return; try { this.voices = speechSynthesis.getVoices() || []; this.ready = this.voices.length > 0; } catch (e) { } },
  hasLang(l) { return this.voices.some(v => (v.lang || '').toLowerCase().startsWith(l)); },
  pick() {
    const want = S.lang === 'ta' ? 'ta' : 'en';
    const list = this.voices.filter(v => (v.lang || '').toLowerCase().startsWith(want));
    if (want === 'en') return list.find(v => /en-gb/i.test(v.lang) && /male|daniel|george|ryan/i.test(v.name)) || list.find(v => /en-gb/i.test(v.lang)) || list.find(v => /en-us/i.test(v.lang)) || list[0];
    return list.find(v => /google/i.test(v.name)) || list[0];
  },
  bufs: {}, cur: null,
  clipKey(key, arg) {
    if (key === 'welcome') return 'welcome_' + STAGES[S.stage].key;
    if (key === 'lap') return 'lap_' + clamp(arg, 2, 5);
    if (key === 'overtake' || key === 'finish') return key + '_' + arg;
    return key;
  },
  async clip(lang, k) {
    const id = lang + ':' + k; if (this.bufs[id] !== undefined) return this.bufs[id];
    if (!AU.ctx) return null;
    try {
      let buf;
      if (typeof VO_DATA !== 'undefined') { const b64 = (VO_DATA[lang] || {})[k]; if (!b64) { this.bufs[id] = null; return null; } const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); buf = u8.buffer; }
      else { const r = await fetch((window.VR_ASSET_BASE || '') + 'assets/voice/' + lang + '/' + k + '.mp3'); if (!r.ok) throw new Error('missing'); buf = await r.arrayBuffer(); }
      this.bufs[id] = await AU.ctx.decodeAudioData(buf);
    } catch (e) { this.bufs[id] = null; }
    return this.bufs[id];
  },
  preload() { if (typeof VO_KEYS === 'undefined' || !AU.ctx) return; const lang = S.lang === 'ta' ? 'ta' : 'en'; VO_KEYS.forEach(k => this.clip(lang, k)); },
  async say(key, arg, { interrupt = false, cool = 0 } = {}) {
    if (!S.voice) return;
    const now = performance.now(); if (cool && this.last[key] && now - this.last[key] < cool * 1000) return; this.last[key] = now;
    const lang = S.lang === 'ta' ? 'ta' : 'en';
    const buf = await this.clip(lang, this.clipKey(key, arg));
    if (buf && AU.ctx) {
      if (this.cur && !interrupt && this.curEnd > AU.ctx.currentTime + .15 && !/^n[123]$|^go$/.test(key)) return; // don't talk over a line in progress
      if (this.cur) { try { this.cur.stop(); } catch (e) { } }
      const src = AU.ctx.createBufferSource(); src.buffer = buf; const g = AU.ctx.createGain(); g.gain.value = 1.25; src.connect(g).connect(AU.master);
      const t = AU.ctx.currentTime; src.start(t); this.cur = src; this.curEnd = t + buf.duration;
      if (AU.mus) { AU.mus.gain.setTargetAtTime(.06, t, .05); AU.mus.gain.setTargetAtTime(.16, t + buf.duration, .3); }
      return;
    }
    this.tts(key, arg, interrupt);
  },
  tts(key, arg, interrupt) {
    if (!('speechSynthesis' in window)) return;
    const lines = L().say; let text = lines[key]; if (typeof text === 'function') text = text(arg); if (!text) return;
    try {
      if (interrupt) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); const v = this.pick(); if (v) u.voice = v;
      u.lang = S.lang === 'ta' ? 'ta-IN' : (v ? v.lang : 'en-GB'); u.rate = 1.05; u.pitch = .9;
      speechSynthesis.speak(u);
    } catch (e) { }
  },
  stop() { try { if (this.cur) this.cur.stop(); this.cur = null; if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) { } }
};
if ('speechSynthesis' in window) { VOICE.load(); try { speechSynthesis.addEventListener('voiceschanged', () => { VOICE.load(); applyI18n(); }); } catch (e) { } }


/* ===== src/06-online.js ===== */

/* ================= ONLINE ROOMS (claude.ai room capability) ================= */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function cleanName(s) { return String(s || '').replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); }
function validHex(h) { return typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? h : undefined; }
function validFin(f) { return ['gloss', 'matte', 'pearl'].includes(f) ? f : undefined; }
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;


/* Desktop app transport: peer-to-peer rooms over WebRTC (PeerJS). The host's browser is the hub. */
function makeP2P() {
  if (typeof Peer === 'undefined') return null;
  const opts = Object.assign({ debug: 0 }, window.__VR_PEER_OPTS || {});
  return {
    kind: 'p2p',
    join(name, intent) {
      return new Promise((resolve, reject) => {
        const isHost = intent === 'host', hostId = 'vrift-' + name;
        let peer; try { peer = new Peer(isHost ? hostId : 'vrp-' + Math.random().toString(36).slice(2, 12), opts); } catch (e) { reject({ code: 'neterr' }); return; }
        const state = new Map(), conns = new Map(), dirty = new Set();
        let hostConn = null, myId = null, mine = {}, listeners = [], snap = Object.freeze([]), closed = false, settled = false;
        const makeSnap = () => { snap = Object.freeze([...state.entries()].map(([id, v]) => Object.freeze({ peer: id, by: null, isMe: id === myId, sameTab: id === myId, kind: 'viewer', guest: false, presence: v.presence, updatedAt: v.updatedAt }))); };
        const notify = () => { makeSnap(); const ch = { peers: snap, joined: [], left: [], updated: [] }; listeners.forEach(fn => { try { fn(ch); } catch (e) { } }); };
        const setP = (id, pres) => state.set(id, { presence: Object.freeze(pres && typeof pres === 'object' ? pres : {}), updatedAt: Date.now() });
        const fail = code => { clearTimeout(timer); if (!settled) { settled = true; reject({ code }); } closed = true; clearInterval(pump); try { peer.destroy(); } catch (e) { } };
        const timer = setTimeout(() => fail(isHost ? 'neterr' : 'noroom'), 15000);
        const room = {
          name, kind: 'p2p',
          presence: async patch => { mine = { ...mine }; for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; } if (myId) { setP(myId, mine); dirty.add(myId); notify(); } },
          peers: () => snap,
          onPeers: fn => { listeners.push(fn); setTimeout(() => fn({ peers: snap, joined: snap, left: [], updated: [] }), 0); return () => { listeners = listeners.filter(f => f !== fn); }; },
          leave: async () => { closed = true; clearInterval(pump); try { peer.destroy(); } catch (e) { } },
          connected: () => !closed
        };
        const pump = setInterval(() => {
          if (!dirty.size || closed) return;
          const items = [...dirty].map(id => [id, state.has(id) ? state.get(id).presence : null]); dirty.clear();
          if (isHost) { for (const [gid, c] of conns) { const out = items.filter(([id]) => id !== gid); if (out.length && c.open) try { c.send({ t: 'p', items: out }); } catch (e) { } } }
          else if (hostConn && hostConn.open) { const me = items.find(([id]) => id === myId); if (me) try { hostConn.send({ t: 'me', presence: me[1] }); } catch (e) { } }
        }, 45);
        peer.on('open', id => {
          myId = id; setP(myId, mine); makeSnap();
          if (isHost) { clearTimeout(timer); settled = true; resolve(room); return; }
          hostConn = peer.connect(hostId, { reliable: true, serialization: 'json' });
          const hello = () => { try { if (hostConn.open) hostConn.send({ t: 'me', presence: mine }); } catch (e) { } };
          hostConn.on('open', hello); const helloT = setInterval(() => { if (settled || closed) clearInterval(helloT); else hello(); }, 800);
          hostConn.on('data', m => {
            if (!m || typeof m !== 'object') return;
            if (m.t === 'full') return fail('full');
            if ((m.t === 'snap' || m.t === 'p') && Array.isArray(m.items)) {
              for (const it of m.items) { if (!Array.isArray(it) || typeof it[0] !== 'string' || it[0] === myId) continue; if (it[1] === null) state.delete(it[0]); else setP(it[0], it[1]); }
              notify();
              if (m.t === 'snap' && !settled) { clearTimeout(timer); settled = true; resolve(room); }
            }
          });
          hostConn.on('close', () => { for (const k of [...state.keys()]) if (k !== myId) state.delete(k); notify(); });
          hostConn.on('error', () => { });
        });
        if (isHost) peer.on('connection', c => {
          c.on('data', m => {
            if (!m || m.t !== 'me' || !m.presence || typeof m.presence !== 'object' || JSON.stringify(m.presence).length > 8000) return;
            if (!conns.has(c.peer)) {
              if (conns.size >= 5) { try { c.send({ t: 'full' }); } catch (e) { } setTimeout(() => c.close(), 400); return; }
              conns.set(c.peer, c);
              try { c.send({ t: 'snap', items: [...state.entries()].filter(([k]) => k !== c.peer).map(([k, v]) => [k, v.presence]) }); } catch (e) { }
            } else if (!state.has(c.peer)) { try { c.send({ t: 'snap', items: [...state.entries()].filter(([k]) => k !== c.peer).map(([k, v]) => [k, v.presence]) }); } catch (e) { } }
            setP(c.peer, m.presence); dirty.add(c.peer); notify();
          });
          c.on('close', () => { if (!conns.has(c.peer)) return; conns.delete(c.peer); state.delete(c.peer); dirty.add(c.peer); notify(); });
          c.on('error', () => { });
        });
        peer.on('error', err => { const t = err && err.type; if (t === 'unavailable-id') fail('taken'); else if (t === 'peer-unavailable') fail('noroom'); else if (!settled) fail('neterr'); });
        peer.on('disconnected', () => { try { if (!closed) peer.reconnect(); } catch (e) { } });
      });
    }
  };
}

const NET = {
  cap: null, capTried: false, r: null, code: '', role: '', me: '', peers: [], unsub: [],
  lobby: null, race: null, lastRaceId: null, built: null, go: false, inRace: false, hostMissing: 0, lastPub: 0, joinedAt: 0,
  hostPeer() { return this.peers.find(p => p.presence && p.presence.role === 'host'); },
  humans() {
    return this.peers.filter(p => p.kind !== 'agent' && p.presence && (p.presence.role === 'host' || p.presence.role === 'guest'))
      .sort((a, b) => (a.presence.role === 'host' ? -1 : 0) - (b.presence.role === 'host' ? -1 : 0) || (+a.presence.t0 || 0) - (+b.presence.t0 || 0)).slice(0, 6);
  },
  markLoaded(id) { if (this.r) this.r.presence({ loaded: id }).catch(() => { }); },
  publish() {
    if (!this.r || !game.player) return; const now = performance.now(); if (now - this.lastPub < 33) return; this.lastPub = now;
    const st = c => [r2(c.x), r2(c.y), r2(c.z), r3(c.heading), r3(c.pitch), r3(c.roll), r2(c.steer), r2(c.vf), (c.boosting ? 1 : 0) | (c.braking ? 2 : 0) | (c.air ? 4 : 0) | (c.drifting ? 8 : 0), r2(c.prog), c.maxLap, c.finished ? r3(c.finishTime) : 0, isFinite(c.bestLap) ? r3(c.bestLap) : 0];
    const pr = { s: st(game.player) };
    if (this.role === 'host') pr.b = game.cars.filter(c => c.isBot && !c.isRemote).map(st);
    this.r.presence(pr).catch(() => { });
  },
  applyRemotes(dt) {
    const now = Date.now(), host = this.hostPeer(), tr = game.track;
    for (const c of game.cars) {
      if (!c.isRemote) continue;
      let arr = null, age = 0;
      if (c.isBot) { if (host && Array.isArray(host.presence.b)) { arr = host.presence.b[c.botIdx]; age = (now - host.updatedAt) / 1000; } }
      else { const p = this.peers.find(q => q.peer === c.netId); if (p) { if (Array.isArray(p.presence.s)) { arr = p.presence.s; age = (now - p.updatedAt) / 1000; } } else if (this.peers.length) c.gone = true; }
      c.model.root.visible = !c.gone;
      if (!arr || arr.length < 13 || !arr.slice(0, 11).every(Number.isFinite)) continue;
      const [x, y, z, h, pitch, roll, steer, vf, flags, prog, maxLap, fin, best] = arr;
      const ext = clamp(age, 0, .3), tx = x + Math.sin(h) * vf * ext, tz = z + Math.cos(h) * vf * ext;
      if (!c.netInit || (c.x - tx) ** 2 + (c.z - tz) ** 2 > 900) { c.x = tx; c.z = tz; c.y = y; c.heading = h; c.netInit = true; }
      else { c.x = damp(c.x, tx, 12, dt); c.z = damp(c.z, tz, 12, dt); c.y = damp(c.y, y, 12, dt); c.heading = dampAngle(c.heading, h, 12, dt); }
      c.pitch = pitch; c.roll = roll; c.steer = clamp(steer, -1, 1); c.vf = vf; c.vx = Math.sin(h) * vf; c.vz = Math.cos(h) * vf; c.vl = 0;
      c.boosting = !!(flags & 1); c.braking = !!(flags & 2); c.air = !!(flags & 4); c.drifting = !!(flags & 8);
      c.raceDist = prog; c.along = 0; c.maxLap = maxLap | 0; c.idx = ((Math.floor(prog) % tr.N) + tr.N) % tr.N;
      const p = tr.P[c.idx], R = tr.R[c.idx]; c.lat = (c.x - p.x) * R.x + (c.z - p.z) * R.z;
      if (fin > 0) { c.finished = true; c.finishTime = fin; }
      c.bestLap = best > 0 ? best : Infinity;
      c.rpm = 1400 + clamp(Math.abs(vf) / c.top, 0, 1) * 6200; c.spinA += vf * dt / .36;
    }
  },
  tick() {
    const host = this.hostPeer();
    if (this.role === 'guest') {
      if (!host) { if (!this.hostMissing) this.hostMissing = performance.now(); else if (performance.now() - this.hostMissing > 4000) { showError(tr_('hostLeft')); leaveRoom(); return; } }
      else {
        this.hostMissing = 0; const race = host.presence.race;
        if (race && race.id && race.id !== this.lastRaceId && Array.isArray(race.grid) && race.grid.some(g => g && g[0] === this.me)) { this.lastRaceId = race.id; startOnlineRace(race); }
        if (race && this.race && race.id === this.race.id && race.go) this.go = true;
      }
    } else if (this.role === 'host' && this.race && !this.race.go && this.built === this.race.id) {
      const ids = this.race.grid.filter(g => String(g[0])[0] !== 'b').map(g => g[0]);
      const ready = ids.every(id => id === this.me || this.peers.some(p => p.peer === id && p.presence.loaded === this.race.id) || !this.peers.some(p => p.peer === id));
      if (ready || performance.now() - this.raceT0 > 30000) { this.race = { ...this.race, go: 1 }; this.r.presence({ race: this.race }).catch(() => { }); this.go = true; }
    }
  },
  backToLobby() { enterMenu(); this.inRace = false; openOnline(); }
};
(async () => { try { if (window.claude && typeof claude.use === 'function') NET.cap = await claude.use('room'); } catch (e) { NET.cap = null; } if (!NET.cap) NET.cap = makeP2P(); NET.capTried = true; if (!$('online').hidden) renderOnline(); })();

function setOnErr(t) { $('onErr').textContent = t || ''; $('onErr').hidden = !t; }
function openOnline() { $('online').hidden = false; setOnErr(''); renderOnline(); }
function renderOnline() {
  const na = NET.capTried && !NET.cap;
  $('onNA').hidden = !na; $('onChoose').hidden = na || !!NET.r; $('onLobby').hidden = na || !NET.r; $('btnOnLeave').hidden = !NET.r;
  $('btnCreate').disabled = !NET.cap; $('btnJoin').disabled = !NET.cap;
  if (NET.r) renderLobby();
}
function myPresence(role) {
  const p = { v: 1, role, name: cleanName(S.name) || 'Racer', car: S.car, paint: S.paints[S.car] || '', fin: S.finishes[S.car] || '', t0: NET.joinedAt, loaded: null };
  if (role === 'host') p.lobby = NET.lobby;
  return p;
}
async function createRoom() {
  if (!NET.cap) return renderOnline();
  setOnErr(tr_('connecting')); $('btnCreate').disabled = true;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      let r;
      try { r = NET.cap.kind === 'p2p' ? await NET.cap.join(code, 'host') : await NET.cap.join('vr-' + code); }
      catch (err) { if (err && err.code === 'taken') continue; throw err; }
      await wait(NET.cap.kind === 'p2p' ? 100 : 900);
      if (r.peers().some(p => !p.sameTab && p.presence && p.presence.role)) { await r.leave(); continue; }
      await enterRoom(r, code, 'host'); setOnErr(''); return;
    }
    setOnErr(tr_('netErr'));
  } catch (e) { setOnErr(tr_('netErr')); }
  finally { $('btnCreate').disabled = !NET.cap; }
}
async function joinRoom() {
  const code = $('codeIn').value.replace(/\D/g, '');
  if (code.length !== 6) return setOnErr(tr_('invalidCode'));
  if (!NET.cap) return renderOnline();
  setOnErr(tr_('connecting')); $('btnJoin').disabled = true;
  try {
    let r;
    try { r = NET.cap.kind === 'p2p' ? await NET.cap.join(code, 'guest') : await NET.cap.join('vr-' + code); }
    catch (err) { setOnErr(tr_(err && err.code === 'noroom' ? 'noRoom' : err && err.code === 'full' ? 'roomFull' : 'netErr')); return; }
    let host = null; const t0 = performance.now();
    while (performance.now() - t0 < 6000) { host = r.peers().find(p => !p.sameTab && p.presence && p.presence.role === 'host'); if (host) break; await wait(250); }
    if (!host) { await r.leave(); setOnErr(tr_('noRoom')); return; }
    const count = r.peers().filter(p => !p.sameTab && p.presence && p.presence.role).length;
    if (count >= 6) { await r.leave(); setOnErr(tr_('roomFull')); return; }
    await enterRoom(r, code, 'guest'); setOnErr('');
  } catch (e) { setOnErr(tr_('netErr')); }
  finally { $('btnJoin').disabled = !NET.cap; }
}
async function enterRoom(r, code, role) {
  NET.r = r; NET.code = code; NET.role = role; NET.joinedAt = Date.now(); NET.hostMissing = 0; NET.race = null; NET.lastRaceId = null; NET.go = false;
  NET.lobby = { stage: S.stage, laps: S.laps, bots: 'fill6', diff: S.diff };
  const hostNow = r.peers().find(p => !p.sameTab && p.presence && p.presence.role === 'host');
  if (role === 'guest' && hostNow && hostNow.presence.race) NET.lastRaceId = hostNow.presence.race.id; // a race already running: wait for the next one
  await r.presence(myPresence(role));
  NET.peers = r.peers(); const me = NET.peers.find(p => p.sameTab); if (me) NET.me = me.peer;
  NET.unsub.push(r.onPeers(ch => {
    NET.peers = ch.peers; const m = ch.peers.find(p => p.sameTab); if (m) NET.me = m.peer;
    if (!$('online').hidden) renderLobby();
  }, () => { showError(tr_('netErr')); leaveRoom(); }));
  renderOnline();
}
async function leaveRoom() {
  const r = NET.r; NET.unsub.forEach(u => { try { u(); } catch (e) { } }); NET.unsub = [];
  Object.assign(NET, { r: null, code: '', role: '', race: null, built: null, go: false, inRace: false, lastRaceId: null, hostMissing: 0 });
  if (r) { try { await r.leave(); } catch (e) { } }
  if (game.online && S.mode === 'race') enterMenu();
  renderOnline();
}
function botsFor(n) { return NET.lobby.bots === 'none' ? 0 : Math.max(0, (NET.lobby.bots === 'fill8' ? 8 : 6) - n); }
function renderLobby() {
  if (!NET.r) return;
  const hs = NET.humans(), host = NET.hostPeer(), isHost = NET.role === 'host';
  const lob = isHost ? NET.lobby : (host && host.presence.lobby) || {};
  $('roomCode').textContent = NET.code.slice(0, 3) + ' ' + NET.code.slice(3);
  $('pCount').textContent = tr_('playersOf', hs.length);
  $('lobbyHint').textContent = isHost ? tr_(NET.cap && NET.cap.kind === 'p2p' ? 'lobbyHintApp' : 'lobbyHintHost') : tr_('lobbyHintGuest');
  const ul = $('plist'); ul.innerHTML = '';
  hs.forEach(p => {
    const pr = p.presence; const spec = CARS[clamp(pr.car | 0, 0, CARS.length - 1)];
    const li = document.createElement('li'); li.style.setProperty('--c', validHex(pr.paint) || spec.color);
    const dot = document.createElement('i'); const nm = document.createElement('div'); const b = document.createElement('b'); b.textContent = cleanName(pr.name) || 'Racer';
    const sm = document.createElement('small'); sm.textContent = ' ' + spec.name; const wrap = document.createElement('span'); wrap.style.minWidth = '0'; wrap.append(b, document.createElement('br'), sm);
    const tags = document.createElement('span'); tags.style.display = 'flex'; tags.style.gap = '4px';
    if (pr.role === 'host') { const t = document.createElement('span'); t.className = 'tag2 host'; t.textContent = tr_('hostTag'); tags.append(t); }
    if (p.sameTab) { const t = document.createElement('span'); t.className = 'tag2'; t.textContent = tr_('youTag'); tags.append(t); }
    li.append(dot, wrap, tags); ul.append(li);
  });
  for (let k = hs.length; k < 6; k++) { const li = document.createElement('li'); li.className = 'open'; li.style.setProperty('--c', 'transparent'); li.innerHTML = '<i></i><span><b></b></span><span></span>'; li.querySelector('b').textContent = tr_('openSlot'); ul.append(li); }
  $('hostCtl').hidden = !isHost; $('guestWait').hidden = isHost;
  if (isHost) {
    const sel = $('onStage'); if (sel.options.length !== STAGES.length) { sel.innerHTML = ''; STAGES.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s.name; sel.append(o); }); }
    sel.value = NET.lobby.stage;
    if (!$('fillAsk').hidden) { const n = hs.length; if (n >= 6) hideAsk(); else { $('fillTxt').textContent = tr_('fillAsk', n, 6 - n); $('fillYes').textContent = tr_('fillYes', 6 - n); $('fillNo').textContent = tr_('fillNo', n); } }
    const seg = (id, opts, key) => { const el = $(id); el.innerHTML = ''; opts.forEach(([v, l]) => { const b = document.createElement('button'); b.textContent = l; b.setAttribute('aria-pressed', NET.lobby[key] === v); b.onclick = () => { NET.lobby[key] = v; NET.r.presence({ lobby: NET.lobby }).catch(() => { }); renderLobby(); }; el.append(b); }); };
    seg('onLaps', [[1, '1'], [3, '3'], [5, '5']], 'laps');
    $('btnOnStart').disabled = !!(NET.race && !NET.inRace && false);
  } else {
    const running = host && host.presence.race && host.presence.race.id === NET.lastRaceId && !NET.inRace && !(host.presence.race.grid || []).some(g => g[0] === NET.me);
    $('waitTxt').textContent = running ? tr_('raceInProgress') : tr_('waitHost');
    const st = STAGES[clamp(lob.stage | 0, 0, STAGES.length - 1)];
    $('hostSettings').textContent = st ? st.name + ' · ' + tr_('lapsWord', lob.laps || 3) + ' · ' + tr_('playersOf', hs.length) : '';
  }
}
function askStart() {
  if (NET.role !== 'host' || !NET.r) return;
  const n = NET.humans().length;
  if (n >= 6) return hostStart(false);
  $('fillTxt').textContent = tr_('fillAsk', n, 6 - n); $('fillYes').textContent = tr_('fillYes', 6 - n); $('fillNo').textContent = tr_('fillNo', n);
  $('fillAsk').hidden = false; $('btnOnStart').hidden = true;
}
function hideAsk() { $('fillAsk').hidden = true; $('btnOnStart').hidden = false; }
function hostStart(fillBots) {
  if (NET.role !== 'host' || !NET.r) return; hideAsk();
  const hs = NET.humans();
  const hGrid = hs.map(p => { const pr = p.presence; return [p.peer, clamp(pr.car | 0, 0, CARS.length - 1), validHex(pr.paint) || '', cleanName(pr.name) || 'Racer', 10 + Math.floor(Math.random() * 89), validFin(pr.fin) || '']; });
  const nb = fillBots ? Math.max(0, 6 - hs.length) : 0; const bots = [];
  for (let k = 0; k < nb; k++) { const d = DRIVERS[k % DRIVERS.length]; bots.push(['b' + k, (k * 3 + 1 + NET.lobby.stage) % CARS.length, '', d.name, d.num, '']); }
  const half = Math.ceil(nb / 2);
  const grid = [...bots.slice(0, half), ...hGrid, ...bots.slice(half)];
  NET.race = { id: Math.random().toString(36).slice(2, 8), stage: NET.lobby.stage, laps: NET.lobby.laps, diff: NET.lobby.diff, grid, go: 0 };
  NET.r.presence({ race: NET.race, loaded: null }).catch(() => { });
  NET.lastRaceId = NET.race.id;
  startOnlineRace(NET.race);
}
function startOnlineRace(race) {
  NET.race = race; NET.go = false; NET.inRace = true; NET.built = null; NET.raceT0 = performance.now();
  S.stage = clamp(race.stage | 0, 0, STAGES.length - 1); S.laps = [1, 3, 5].includes(race.laps) ? race.laps : 3;
  $('online').hidden = true; $('results').hidden = true; $('pause').hidden = true;
  if (S.mode === 'loading') { setTimeout(() => startOnlineRace(race), 500); return; }
  startRace({ grid: race.grid, diff: race.diff, id: race.id });
}
$('btnCreate').onclick = createRoom; $('btnJoin').onclick = joinRoom;
$('codeIn').addEventListener('input', () => { $('codeIn').value = $('codeIn').value.replace(/\D/g, '').slice(0, 6); });
$('btnOnLeave').onclick = () => leaveRoom(); $('btnOnClose').onclick = () => { $('online').hidden = true; };
$('onStage').onchange = () => { NET.lobby.stage = +$('onStage').value; NET.r && NET.r.presence({ lobby: NET.lobby }).catch(() => { }); renderLobby(); };
$('btnOnStart').onclick = askStart; $('fillYes').onclick = () => { goFullscreen(); hostStart(true); }; $('fillNo').onclick = () => { goFullscreen(); hostStart(false); }; $('fillBack').onclick = hideAsk;
$('btnCopy').onclick = () => { const t = NET.code; const done = () => { $('btnCopy').textContent = tr_('copied'); setTimeout(() => { $('btnCopy').textContent = tr_('copy'); }, 1500); };
  try { navigator.clipboard.writeText(t).then(done, () => { const s = getSelection(), rg = document.createRange(); rg.selectNodeContents($('roomCode')); s.removeAllRanges(); s.addRange(rg); }); } catch (e) { } };
$('online').addEventListener('pointerdown', ev => { if (ev.target.id === 'online') $('online').hidden = true; });


/* ===== src/07-game.js ===== */


/* ================= ENGINE VOICES ================= */
const ENGINE_PROFILES = {
  'Kestrel GT': { cyl: 8, harm: [1, .5, .85, .3, .55, .22, .32, .14, .2, .09, .12, .06], sub: .55, drive: 2.4, cut: [420, 3000], turbo: 0, crackle: .7, whine: 0 },
  'Mako RS': { cyl: 10, harm: [1, .75, .55, .5, .42, .34, .3, .24, .2, .16, .13, .1, .08], sub: .15, drive: 1.9, cut: [800, 5600], turbo: 0, crackle: .35, whine: 0 },
  'Solaris X': { cyl: 4, harm: [1, .28, .62, .2, .36, .12, .22, .08], sub: .08, drive: 3, cut: [520, 3300], turbo: 1, crackle: .95, whine: 0 },
  'Nova Drift': { cyl: 6, harm: [1, .45, .65, .32, .42, .2, .26, .12, .15], sub: .22, drive: 2.5, cut: [640, 4300], turbo: .75, crackle: .75, whine: 0 },
  'Ronin V8': { cyl: 8, harm: [1, .45, .95, .28, .6, .2, .38, .12, .22, .08], sub: .75, drive: 2.6, cut: [360, 2500], turbo: 0, crackle: .95, whine: 0 },
  'Pulse E-1': { cyl: 2, harm: [1, .08, .04], sub: 0, drive: 1.1, cut: [1400, 5200], turbo: 0, crackle: 0, whine: 2.6, ev: true },
  'Dune Raider': { cyl: 6, harm: [1, .62, .5, .42, .3, .22, .16], sub: .35, drive: 3.1, cut: [340, 2300], turbo: .95, crackle: .55, whine: 0 },
  'Comet LM': { cyl: 6, harm: [1, .72, .3, .56, .2, .36, .15, .2], sub: .2, drive: 2.2, cut: [780, 5200], turbo: 0, crackle: .6, whine: 0 },
  'Umbra Phantom': { cyl: 6, harm: [1, .62, .48, .42, .32, .26, .2, .16, .12], sub: .12, drive: 1.7, cut: [900, 6000], turbo: .45, crackle: .25, whine: 1 },
};
class EngineVoice {
  constructor(ctx, dest, prof) {
    this.ctx = ctx; this.prof = prof;
    const n = prof.harm.length + 1, re = new Float32Array(n), im = new Float32Array(n); prof.harm.forEach((a, i) => { im[i + 1] = a; re[i + 1] = a * .12 * ((i % 3) - 1); });
    const wave = ctx.createPeriodicWave(re, im);
    // two combustion layers: a mellow on-idle/off-load body and a raspy on-load layer, cross-faded by load
    this.osc = ctx.createOscillator(); this.osc.setPeriodicWave(wave);
    this.osc2 = ctx.createOscillator(); this.osc2.setPeriodicWave(wave); this.osc2.detune.value = 7;
    this.sub = ctx.createOscillator(); this.sub.type = 'sine';
    const subG = ctx.createGain(); subG.gain.value = prof.sub * .8;
    this.shaper = ctx.createWaveShaper(); const cv = new Float32Array(2048); for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; cv[i] = Math.tanh(prof.drive * x) / Math.tanh(prof.drive); } this.shaper.curve = cv; this.shaper.oversample = '2x';
    this.pre = ctx.createGain(); this.pre.gain.value = .45;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = .9;
    this.body = ctx.createBiquadFilter(); this.body.type = 'peaking'; this.body.frequency.value = 140; this.body.Q.value = 1.2; this.body.gain.value = 4;
    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 32;
    this.am = ctx.createGain(); this.am.gain.value = .92;
    this.lfo = ctx.createOscillator(); this.lfo.type = 'sine'; const lfoG = ctx.createGain(); lfoG.gain.value = .08; this.lfo.connect(lfoG).connect(this.am.gain);
    this.low = ctx.createGain(); this.low.gain.value = 1;
    this.rasp = ctx.createBiquadFilter(); this.rasp.type = 'bandpass'; this.rasp.Q.value = 1.1; this.raspG = ctx.createGain(); this.raspG.gain.value = 0;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.osc.connect(this.pre); this.osc2.connect(this.pre); this.sub.connect(subG).connect(this.pre);
    this.pre.connect(this.shaper);
    this.shaper.connect(this.lp).connect(this.body).connect(this.low).connect(this.hp);
    this.shaper.connect(this.rasp).connect(this.raspG).connect(this.hp);
    this.hp.connect(this.am).connect(this.out).connect(dest);
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine'; this.tG = ctx.createGain(); this.tG.gain.value = 0; this.turbo.connect(this.tG).connect(dest);
    this.whine = ctx.createOscillator(); this.whine.type = 'triangle'; this.wG = ctx.createGain(); this.wG.gain.value = 0;
    this.wF = ctx.createBiquadFilter(); this.wF.type = 'lowpass'; this.wF.frequency.value = 5000; this.whine.connect(this.wF).connect(this.wG).connect(dest);
    this.whine2 = ctx.createOscillator(); this.whine2.type = 'sine'; this.whine2.connect(this.wG);
    [this.osc, this.osc2, this.sub, this.lfo, this.turbo, this.whine, this.whine2].forEach(o => o.start());
    this.f = 60;
  }
  set(rpm, load, vol, boost) {
    const t = this.ctx.currentTime, p = this.prof, tc = .045;
    const r = clamp(rpm / 8500, 0, 1);
    const f = Math.max(rpm, 650) / 60 * p.cyl / 2; this.f = f;
    this.osc.frequency.setTargetAtTime(f, t, tc); this.osc2.frequency.setTargetAtTime(f, t, tc); this.sub.frequency.setTargetAtTime(f / 2, t, tc);
    this.lfo.frequency.setTargetAtTime(Math.max(rpm, 650) / 120, t, .08);
    this.lp.frequency.setTargetAtTime(lerp(p.cut[0], p.cut[1], clamp(load * .55 + r * .5, 0, 1)), t, .06);
    this.rasp.frequency.setTargetAtTime(f * 2.5, t, tc); this.raspG.gain.setTargetAtTime(.35 * load * (.3 + r), t, .08);
    this.pre.gain.setTargetAtTime(.32 + load * .38, t, .07);
    const eng = p.ev ? .18 : 1;
    this.out.gain.setTargetAtTime(vol * eng * (.5 + .5 * load) * (.72 + .28 * r), t, .08);
    this.turbo.frequency.setTargetAtTime(1300 + rpm * .36, t, .12); this.tG.gain.setTargetAtTime(vol * p.turbo * .018 * load * r * r * (boost ? 1.6 : 1), t, .15);
    this.whine.frequency.setTargetAtTime(p.ev ? 180 + rpm * .55 : f * 3.02, t, .05); this.whine2.frequency.setTargetAtTime(p.ev ? 360 + rpm * 1.1 : f * 6.04, t, .05);
    this.wG.gain.setTargetAtTime(vol * p.whine * (p.ev ? .03 * (.25 + .75 * r) * (.5 + .5 * load) : .01 * (.3 + r)), t, .1);
  }
  stop() { const t = this.ctx.currentTime; this.out.gain.setTargetAtTime(0, t, .06); this.tG.gain.setTargetAtTime(0, t, .06); this.wG.gain.setTargetAtTime(0, t, .06); setTimeout(() => { [this.osc, this.osc2, this.sub, this.lfo, this.turbo, this.whine, this.whine2].forEach(o => { try { o.stop(); } catch (e) { } }); }, 400); }
}
/* ================= AUDIO ================= */
const AU = {
  ctx: null, musicOn: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    try {
      const ctx = this.ctx = new C();
      this.master = ctx.createGain(); this.master.gain.value = .55; this.master.connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.mus = ctx.createGain(); this.mus.gain.value = .16; this.mus.connect(this.master);
      const comp = ctx.createDynamicsCompressor(); comp.connect(this.sfx);
      this.comp = comp; this.eg = ctx.createGain(); this.eg.gain.value = 1; this.eg.connect(comp);
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const ns = ctx.createBufferSource(); ns.buffer = buf; ns.loop = true; ns.start();
      this.skF = ctx.createBiquadFilter(); this.skF.type = 'bandpass'; this.skF.frequency.value = 1500; this.skF.Q.value = 3;
      this.skG = ctx.createGain(); this.skG.gain.value = 0; ns.connect(this.skF).connect(this.skG).connect(this.sfx);
      this.wF = ctx.createBiquadFilter(); this.wF.type = 'lowpass'; this.wF.frequency.value = 500;
      this.wG = ctx.createGain(); this.wG.gain.value = 0; ns.connect(this.wF).connect(this.wG).connect(this.sfx);
      this.kG = ctx.createGain(); this.kG.gain.value = 0; const kF = ctx.createBiquadFilter(); kF.type = 'lowpass'; kF.frequency.value = 140; ns.connect(kF).connect(this.kG).connect(this.sfx);
      this.skLfo = ctx.createOscillator(); this.skLfo.frequency.value = 7; const skL = ctx.createGain(); skL.gain.value = 260; this.skLfo.connect(skL).connect(this.skF.frequency); this.skLfo.start();
      this.rivalPan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); this.rivalPan.connect(comp);
      this.nG = ctx.createGain(); this.nG.gain.value = 0; const nF = ctx.createBiquadFilter(); nF.type = 'highpass'; nF.frequency.value = 2500; ns.connect(nF).connect(this.nG).connect(this.sfx);
    } catch (e) { this.ctx = null; }
  },
  setCar(spec) {
    if (!this.ctx) return; const prof = ENGINE_PROFILES[spec.name] || ENGINE_PROFILES['Kestrel GT'];
    if (this.eng && this.eng.prof === prof) return; if (this.eng) this.eng.stop();
    this.eng = new EngineVoice(this.ctx, this.eg, prof);
  },
  engine(c, on, rival) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const rpm = c ? c.rpm : 0, load = c ? c.throttle : 0, sp = c ? c.speed : 0;
    if (c && (!this.eng || this.eng.spec !== c.spec)) { this.setCar(c.spec); this.eng.spec = c.spec; }
    if (this.eng) this.eng.set(rpm, load, on ? .55 : 0, c && c.boosting);
    // throttle lift: exhaust crackle and turbo blow-off
    if (c && on) {
      if (this.lastLoad > .5 && load < .5 && rpm > 4200 && !this.eng.prof.ev && !c.air) { const p = this.eng.prof; const n = Math.round(2 + p.crackle * 5); for (let i = 0; i < n; i++) if (Math.random() < p.crackle + .2) this.pop(t + .04 + Math.random() * .5, .06 + Math.random() * .12 * p.crackle); if (p.turbo > .3) this.blowoff(p.turbo); }
      this.lastLoad = load;
    }
    this.skG.gain.setTargetAtTime(on && c && c.drifting ? .08 + Math.min(Math.abs(c.vl) / 60, .12) : 0, t, .05);
    this.skF.frequency.setTargetAtTime(1300 + Math.min(Math.abs(c ? c.vl : 0) * 40, 700), t, .1);
    this.wG.gain.setTargetAtTime(on ? Math.min(sp / 90, 1) * .2 : 0, t, .1);
    this.nG.gain.setTargetAtTime(on && c && c.boosting ? .06 : 0, t, .08);
    const onKerb = on && c && game.track && Math.abs(c.lat) > game.track.half - .3 && sp > 6;
    this.kG.gain.setTargetAtTime(onKerb ? .5 : 0, t, .04);
    // nearest rival engine, panned by where it sits on screen
    const rp = rival ? (ENGINE_PROFILES[rival.spec.name] || ENGINE_PROFILES['Mako RS']) : null;
    if (!this.rival || (rp && rp !== this.rival.prof && performance.now() - (this.rivalT || 0) > 1500)) { if (this.rival) this.rival.stop(); this.rival = new EngineVoice(this.ctx, this.rivalPan, rp || ENGINE_PROFILES['Mako RS']); this.rivalT = performance.now(); }
    if (rival && on) {
      const cam = game.camera; const dx = rival.x - cam.position.x, dz = rival.z - cam.position.z; const d = Math.hypot(dx, dz);
      const yaw = game.camYaw; const side = (dx * -Math.cos(yaw) + dz * Math.sin(yaw)) / Math.max(d, 1);
      if (this.rivalPan.pan) this.rivalPan.pan.setTargetAtTime(clamp(side, -1, 1) * .8, t, .1);
      this.rival.set(rival.rpm, 1, clamp(1 - d / 70, 0, 1) * .3, false);
    } else this.rival.set(900, 0, 0, false);
  },
  land(k) {
    if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + .25); g.gain.setValueAtTime(Math.min(.6, .12 + k * .05), t); g.gain.exponentialRampToValueAtTime(.001, t + .35);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + .4); this.hit(Math.min(.4, k * .04));
  },
  blowoff(k) {
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(1200, t + .35);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(.18 * k, t); g.gain.exponentialRampToValueAtTime(.001, t + .4); s.connect(f).connect(g).connect(this.sfx); s.start(t, Math.random()); s.stop(t + .45);
  },
  revPreview(spec) {
    if (!this.ctx || this.ctx.state !== 'running') return; const prof = ENGINE_PROFILES[spec.name]; if (!prof) return;
    if (this.preview) this.preview.stop(); const v = this.preview = new EngineVoice(this.ctx, this.eg, prof); const t0 = performance.now();
    const tick = () => { const k = (performance.now() - t0) / 1000; if (k > 1.9 || this.preview !== v) { v.stop(); return; } const rpm = k < .45 ? 1100 + k / .45 * 5600 : 6700 - (k - .45) * 4200; v.set(Math.max(rpm, 1000), k < .45 ? 1 : 0, .5, false); if (k > .45 && !v.popped) { v.popped = true; const t = this.ctx.currentTime; for (let i = 0; i < 4; i++) this.pop(t + .05 + i * .09, .1 * prof.crackle + .03); } requestAnimationFrame(tick); };
    tick();
  },
  beep(freq, dur, vol = .18, type = 'square') {
    if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur + .05);
  },
  hit(vol) {
    if (!this.ctx) return; const t = this.ctx.currentTime; const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.min(vol, .6), t); g.gain.exponentialRampToValueAtTime(.001, t + .35);
    s.connect(f).connect(g).connect(this.sfx); s.start(t, Math.random()); s.stop(t + .4);
  },
  whoosh() {
    if (!this.ctx) return; const t = this.ctx.currentTime, s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + .5);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.3, t + .08); g.gain.exponentialRampToValueAtTime(.001, t + .7);
    s.connect(f).connect(g).connect(this.sfx); s.start(t, Math.random()); s.stop(t + .75);
  },
  shift() {
    if (!this.ctx) return; const t = this.ctx.currentTime; this.eg.gain.cancelScheduledValues(t); this.eg.gain.setValueAtTime(.15, t); this.eg.gain.linearRampToValueAtTime(1, t + .12);
    this.pop(t + .02, .12); this.pop(t + .07, .08);
  },
  pop(t, v) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; const g = this.ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .06); s.connect(f).connect(g).connect(this.sfx); s.start(t, Math.random()); s.stop(t + .08); },
  crowd() {
    if (!this.ctx) return; const t = this.ctx.currentTime, s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = .6;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.25, t + .6); g.gain.exponentialRampToValueAtTime(.001, t + 4);
    s.connect(f).connect(g).connect(this.sfx); s.start(t); s.stop(t + 4.1);
    [0, .25, .5].forEach((d, i) => this.beep([660, 880, 1320][i], .4, .12, 'triangle'));
  },
  // tiny synthwave sequencer
  startMusic() { if (!this.ctx || this.musicOn || S.music === 'off') return; this.style = S.music; this.musicOn = true; this.mNext = this.ctx.currentTime + .1; this.mStep = 0; this.mTimer = setInterval(() => this.sched(), 25); },
  stopMusic() { clearInterval(this.mTimer); this.musicOn = false; },
  sched() { const spb = 60 / (this.style === 'kuthu' ? 136 : 116) / 4; while (this.mNext < this.ctx.currentTime + .12) { this.step(this.mStep, this.mNext, spb); this.mNext += spb; this.mStep = (this.mStep + 1) % 64; } },
  note(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  voice(freq, t, dur, type, vol, cutoff, vib = 0, ftype = 'lowpass') {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.value = freq; f.type = ftype; f.frequency.value = cutoff; if (ftype === 'bandpass') f.Q.value = 1.4;
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = freq * vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + .05); o.frequency.setValueAtTime(freq * .97, t); o.frequency.linearRampToValueAtTime(freq, t + .06); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(f).connect(g).connect(this.mus); o.start(t); o.stop(t + dur + .05);
  },
  drum(t, kind) {
    const c = this.ctx;
    if (kind === 'k') { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + .18); g.gain.setValueAtTime(.9, t); g.gain.exponentialRampToValueAtTime(.001, t + .25); o.connect(g).connect(this.mus); o.start(t); o.stop(t + .3); return; }
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); const g = c.createGain();
    f.type = kind === 'h' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'h' ? 7000 : 1800;
    const v = kind === 'h' ? .12 : .45, d = kind === 'h' ? .05 : .18;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d); s.connect(f).connect(g).connect(this.mus); s.start(t, Math.random()); s.stop(t + d + .02);
  },
  pdrum(t, f0, f1, dur, vol, click) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * .8);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g).connect(this.mus); o.start(t); o.stop(t + dur + .02);
    if (click) { const s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = click; f.Q.value = 1.2; const ng = c.createGain(); ng.gain.setValueAtTime(vol * .9, t); ng.gain.exponentialRampToValueAtTime(.001, t + .07); s.connect(f).connect(ng).connect(this.mus); s.start(t, Math.random()); s.stop(t + .1); }
  },
  kuthu(s, t, spb) {
    const st = s % 16, bar = Math.floor(s / 16) % 4;
    // dappu: open bass hits and sharp slaps in the classic kuthu gallop
    if ([0, 3, 6, 8, 11, 14].includes(st)) this.pdrum(t, 170, 70, .28, .85, 900);
    if ([2, 5, 10, 13].includes(st)) this.pdrum(t, 420, 300, .09, .35, 3200);
    if (st === 7 || st === 15) this.pdrum(t, 260, 150, .18, .45, 1400);
    if (st % 2 === 1 && Math.random() < .6) this.drum(t, 'h');
    // tanpura-style drone on D and A
    if (st === 0) { this.voice(this.note(38), t, spb * 16, 'sawtooth', .07, 500); this.voice(this.note(45), t + spb * 8, spb * 8, 'sawtooth', .05, 500); }
    // nadaswaram-style lead in Mayamalavagowla (D Eb F# G A Bb C# D)
    const sc = [62, 63, 66, 67, 69, 70, 73, 74, 75, 78];
    const phr = [[0, -1, 2, 3, 4, -1, 4, 3, 2, -1, 3, 2, 1, 0, -1, -1], [4, -1, 5, 4, 6, -1, 7, 6, 5, 4, 3, -1, 4, -1, -1, -1], [7, -1, 7, 6, 7, 9, 8, 7, 6, -1, 5, 4, 5, -1, 4, -1], [3, 4, 5, 4, 3, 2, 1, 2, 3, -1, 2, 1, 0, -1, -1, -1]][bar];
    const n = phr[st]; if (n >= 0) { let len = 1; while (st + len < 16 && phr[st + len] === -1 && len < 4) len++; this.voice(this.note(sc[n]), t, spb * len * 1.05, 'sawtooth', .075, 1600, .012, 'bandpass'); }
  },
  step(s, t, spb) {
    if (this.style === 'kuthu') return this.kuthu(s, t, spb);
    const bar = Math.floor(s / 16) % 4, st = s % 16;
    const roots = [45, 41, 36, 43]; const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    if (st % 4 === 0) this.drum(t, 'k'); if (st === 4 || st === 12) this.drum(t, 's'); if (st % 2 === 1) this.drum(t, 'h');
    this.voice(this.note(roots[bar] + (st % 4 === 2 ? 12 : 0)), t, spb * 1.6, 'sawtooth', .22, 600);
    const ch = chords[bar]; this.voice(this.note(ch[st % 3] + 12 + (st >= 8 ? 12 : 0)), t, spb * 1.2, 'square', .045, 2400);
    if (st === 0) ch.forEach(m => this.voice(this.note(m), t, spb * 15, 'sawtooth', .04, 1200));
  }
};

/* ================= GAME ================= */
const game = { phase: 'idle', scene: null, camera: null, track: null, cars: [], player: null, raceTime: 0, countdown: 0, laps: 3, updaters: [], acc: 0, t: 0, camYaw: 0, shake: 0, paused: false, finishOrder: [], lastBoard: 0, resultsShown: false, sun: null, sunDir: null, startLights: [] };
const keys = {}; const touch = { left: false, right: false, gas: false, brake: false, nitro: false, drift: false };
addEventListener('keydown', e => {
  if (!splash.left) { if (e.code === 'KeyL') setLang(S.lang === 'ta' ? 'en' : 'ta'); else leaveSplash(); return; }
  keys[e.code] = true; AU.init(); if (S.mode === 'menu') AU.startMusic();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (S.mode === 'race') {
    if (e.code === 'KeyC') S.cam = (S.cam + 1) % 3;
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyR' && game.phase === 'race' && !game.paused && !game.player.finished) resetPlayer();
    if (e.code === 'KeyM') { cycleMusic(); }
    if (e.code === 'KeyL') setLang(S.lang === 'ta' ? 'en' : 'ta');
  } else if (S.mode === 'menu') {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.code === 'Enter' && e.target.id === 'nameIn') saveName(); if (e.code === 'Enter' && e.target.id === 'codeIn') joinRoom(); return; }
    if (!$('online').hidden || !$('namebox').hidden) { if (e.code === 'Escape') { $('namebox').hidden = true; $('online').hidden = true; } return; }
    if (e.code === 'ArrowRight') setCar(S.car + 1); if (e.code === 'ArrowLeft') setCar(S.car - 1);
    if (e.code === 'Escape') { $('settings').hidden = true; $('controls').hidden = true; }
    if (e.code === 'Enter' && $('settings').hidden && $('controls').hidden) startRace();
    if (e.code === 'KeyL') setLang(S.lang === 'ta' ? 'en' : 'ta');
    if (e.code === 'KeyM') cycleMusic();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (S.mode === 'race' && game.phase === 'race' && !game.paused && !game.online) togglePause(); });
/* Touch controls.
   Every finger is tracked by its pointer id and the button captures its pointer, so
   a thumb that creeps off the edge halfway through a corner keeps the throttle on
   instead of silently letting go. Sliding from one control onto another re-targets,
   because that is what a thumb actually does under pressure. */
const TOUCH_MAP = [['tL', 'left'], ['tR', 'right'], ['tGas', 'gas'], ['tBrk', 'brake'], ['tNos', 'nitro'], ['tDrift', 'drift']];
const touchBtns = TOUCH_MAP.map(([id, key]) => ({ id, el: $(id), key, r: null, base: null }));
/* The layout editor arranges one more control than the game reads: the analog
   steering strip is draggable and resizable like any pad, but it carries no
   on/off key, so it stays out of touchBtns and the hit test that drives them. */
const padItems = touchBtns.concat([{ id: 'tSteer', el: $('tSteer'), key: null, r: null, base: null }]);
const touchHeld = new Map();  // pointerId -> control key, or null while off every control
function measureTouch() { for (const t of touchBtns) t.r = t.el.getBoundingClientRect(); }
function touchAt(x, y) {
  for (const t of touchBtns) { const r = t.r; if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return t.key; }
  return null;
}
function applyTouch() {
  for (const k in touch) touch[k] = false;
  for (const k of touchHeld.values()) if (k) touch[k] = true;
  for (const t of touchBtns) t.el.classList.toggle('on', !!touch[t.key]);
}
for (const t of touchBtns) {
  t.el.addEventListener('pointerdown', e => {
    if (padEditing) return;
    e.preventDefault();
    if (touchHeld.size === 0) measureTouch();  // the rig is hidden until a race starts
    try { t.el.setPointerCapture(e.pointerId); } catch (_) { }
    touchHeld.set(e.pointerId, t.key); applyTouch(); AU.init();
    if (t.key === 'nitro' && navigator.vibrate) navigator.vibrate(16);
  });
  t.el.addEventListener('pointermove', e => {
    if (padEditing || !touchHeld.has(e.pointerId)) return;
    const k = touchAt(e.clientX, e.clientY);
    if (touchHeld.get(e.pointerId) !== k) { touchHeld.set(e.pointerId, k); applyTouch(); }
  });
  const release = e => { if (touchHeld.delete(e.pointerId)) applyTouch(); };
  t.el.addEventListener('pointerup', release);
  t.el.addEventListener('pointercancel', release);
  t.el.addEventListener('lostpointercapture', release);
}
addEventListener('resize', () => padRefresh());
addEventListener('orientationchange', () => setTimeout(padRefresh, 150));

/* ---------------- STEERING MODES ----------------
   Two arrow pads give a thumb one bit of information: full lock or nothing. The
   car damps that (see updateCar) but a corner still has to be taken in taps.
   Two analog alternatives sit alongside, chosen in Settings:

     pads    the two pads, unchanged - still the default and the fallback
     slider  one strip the thumb slides along; lock follows the thumb and
             springs back to centre when it lets go
     tilt    the phone itself is the wheel, zeroed on the angle it is held at
             when the race starts, so it works lying down or sitting up

   Both analog modes feed one signed axis into readInput and set `analog`, which
   makes updateCar take the value as-is instead of ramping toward it. */
const STEER = { axis: 0, target: 0, on: false, base: null, live: false };
const steerEl = $('tSteer'), tiltEl = $('tTilt');

function steerCurve(v) {
  /* A flat spot around centre, then a square-ish ramp: small corrections stay
     small on a strip barely 200px wide, and full lock is still reachable at the
     end of it. Sensitivity scales the travel, not the output - turning it up
     reaches full lock with less thumb movement rather than steering the car past
     what the physics takes as a maximum. */
  const a = Math.abs(v), dead = .06;
  if (a < dead) return 0;
  const n = clamp((a - dead) / (1 - dead) * S.steerSens, 0, 1);
  return Math.sign(v) * (n * n * .55 + n * .45);
}

function steerPaint() {
  if (S.steerMode === 'slider') {
    steerEl.style.setProperty('--x', STEER.axis.toFixed(3));
    steerEl.classList.toggle('on', STEER.on);
    steerEl.setAttribute('aria-valuenow', Math.round(STEER.axis * 100));
  } else if (S.steerMode === 'tilt') tiltEl.style.setProperty('--x', STEER.axis.toFixed(3));
}

/* ---- slider ---- */
function sliderFrom(x) {
  const r = steerEl.getBoundingClientRect();
  if (!r.width) return 0;
  return clamp(((x - r.left) / r.width - .5) * 2, -1, 1);
}
steerEl.addEventListener('pointerdown', e => {
  if (padEditing || S.steerMode !== 'slider') return;
  e.preventDefault();
  try { steerEl.setPointerCapture(e.pointerId); } catch (_) { }
  STEER.on = true; STEER.target = sliderFrom(e.clientX); AU.init();
});
steerEl.addEventListener('pointermove', e => {
  if (!STEER.on || padEditing) return;
  STEER.target = sliderFrom(e.clientX);
});
const steerLetGo = () => { STEER.on = false; STEER.target = 0; };
steerEl.addEventListener('pointerup', steerLetGo);
steerEl.addEventListener('pointercancel', steerLetGo);
steerEl.addEventListener('lostpointercapture', steerLetGo);

/* ---- tilt ---- */
/* Which physical axis is "roll the phone like a wheel" depends on how the screen
   is rotated, so read the orientation angle rather than assuming landscape. */
function tiltRaw(e) {
  const a = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  if (a === 90) return -(e.beta || 0);
  if (a === 270 || a === -90) return (e.beta || 0);
  if (a === 180) return -(e.gamma || 0);
  return (e.gamma || 0);
}
function onTilt(e) {
  if (S.steerMode !== 'tilt' || e.beta == null && e.gamma == null) return;
  const raw = tiltRaw(e);
  if (STEER.base == null) STEER.base = raw;        // zeroed on however it is held
  STEER.live = true;
  STEER.target = clamp((raw - STEER.base) / 26, -1, 1);
}
/* iOS only delivers orientation after an explicit grant, and only asks from a
   user gesture - which is why this is called from the Settings tap, not on load. */
let tiltBound = false;
async function tiltEnable() {
  const D = window.DeviceOrientationEvent;
  if (!D) return false;
  if (tiltBound) return true;
  try {
    if (typeof D.requestPermission === 'function') {
      const r = await D.requestPermission();
      if (r !== 'granted') return false;
    }
  } catch (_) { return false; }
  addEventListener('deviceorientation', onTilt);
  tiltBound = true;
  return true;
}
/* Tilt chosen in an earlier session has to be re-armed on load. Where no grant is
   needed that just works; where one is, or where the phone has no usable sensor,
   nothing ever arrives - and since tilt mode draws no steering control, that
   would leave the car unsteerable. So wait briefly for real data and drop back to
   the pads if none comes. */
function tiltRearm() {
  if (S.steerMode !== 'tilt') return;
  tiltEnable().then(ok => {
    if (!ok) return tiltFallback();
    setTimeout(() => { if (S.steerMode === 'tilt' && !STEER.live) tiltFallback(); }, 1400);
  });
}
function tiltFallback() {
  S.steerMode = 'pads'; store.set('steerMode', 'pads');
  buildSegments(); showSteerNote('tiltNo'); applySteerMode();
}
/* Re-zero whenever a race starts or the phone is turned: the comfortable angle
   after a rotation is not the one from before it. */
function steerRecenter() { STEER.base = null; STEER.target = 0; STEER.axis = 0; steerPaint(); }
addEventListener('orientationchange', () => setTimeout(steerRecenter, 250));

function applySteerMode() {
  const b = document.body.classList;
  b.toggle('steer-slider', IS_TOUCH && S.steerMode === 'slider');
  b.toggle('steer-tilt', IS_TOUCH && S.steerMode === 'tilt');
  steerRecenter();
  if (IS_TOUCH) requestAnimationFrame(padRefresh);
}

/* ---------------- CONTROL LAYOUT EDITOR ----------------
   Thumbs differ, phones differ. Every control can be dragged, resized and faded,
   and the arrangement is stored per device. Positions are kept as a fraction of
   the viewport and sizes as a multiplier of the responsive default, so a saved
   layout still lands correctly after a rotation or on a different screen. */
let padEditing = false, padDraft = null, padSel = null, padDrag = null;

function measurePadDefaults() {
  const body = document.body, had = body.classList.contains('custompads');
  if (had) body.classList.remove('custompads');  // read the CSS layout, not our own
  for (const t of padItems) {
    const r = t.el.getBoundingClientRect();
    if (r.width) t.base = { w: r.width, h: r.height, cx: (r.left + r.width / 2) / innerWidth, cy: (r.top + r.height / 2) / innerHeight };
  }
  if (had) body.classList.add('custompads');
}

function padApply(L, alpha) {
  if (!L) {
    document.body.classList.remove('custompads');
    for (const t of padItems) { const st = t.el.style; st.width = st.height = st.left = st.top = ''; }
  } else {
    document.body.classList.add('custompads');
    for (const t of padItems) {
      const b = t.base; if (!b) continue;
      const c = L[t.id] || {}, k = c.k || 1, w = b.w * k, h = b.h * k, st = t.el.style;
      const cx = (c.cx == null ? b.cx : c.cx) * innerWidth, cy = (c.cy == null ? b.cy : c.cy) * innerHeight;
      st.width = w + 'px'; st.height = h + 'px';
      st.left = clamp(cx - w / 2, 2, innerWidth - w - 2) + 'px';
      st.top = clamp(cy - h / 2, 2, innerHeight - h - 2) + 'px';
    }
  }
  $('touch').style.opacity = alpha == null ? 1 : alpha;
  measureTouch();
}

function padRefresh() {
  if (!IS_TOUCH || $('touch').hidden) return;
  measurePadDefaults();
  padApply(padEditing ? padDraft : S.pads, padEditing ? +$('peAlpha').value / 100 : S.padAlpha);
}

function padSelect(t) {
  padSel = (t && padSel !== t.id) ? t.id : null;
  for (const b of padItems) b.el.classList.toggle('pe-sel', b.id === padSel);
  $('peSize').value = Math.round((padSel ? (padDraft[padSel].k || 1) : 1) * 100);
  $('peSizeLbl').textContent = tr_(padSel ? 'padSizeOne' : 'padSize');
  $('peHint').textContent = tr_(padSel ? 'padHintOne' : 'padHintAll');
}

/* The editor is reachable from two places with different backdrops: the pause
   card mid-race, where the rig is already on screen, and Settings in the garage,
   where it is not. `padFrom` records which, so closing returns to the right one
   and never reveals a pause card over a garage. */
let padFrom = null;

function padOpen() {
  if (!IS_TOUCH) return;
  padFrom = { pause: !$('pause').hidden, rig: $('touch').hidden, hud: $('hud').hidden };
  /* Opened from the garage there is no HUD behind the rig, and the lap times and
     minimap would be stale if there were - so the HUD comes up carrying only the
     controls being arranged. */
  if (padFrom.hud) { $('hud').hidden = false; document.body.classList.add('pad-garage'); }
  padEditing = true; padSel = null; padDrag = null;
  for (const k in touch) touch[k] = false;
  touchHeld.clear();
  for (const t of touchBtns) t.el.classList.remove('on');
  // arranging controls that are not on screen is not a thing; show the rig and
  // the HUD behind it for the length of the edit
  $('touch').hidden = false;
  measurePadDefaults();
  padDraft = {};
  for (const t of padItems) padDraft[t.id] = Object.assign({}, (S.pads && S.pads[t.id]) || {});
  $('peAlpha').value = Math.round((S.padAlpha == null ? 1 : S.padAlpha) * 100);
  $('pause').hidden = true; $('padedit').hidden = false;
  document.body.classList.add('padedit');
  padSelect(null);
  padApply(padDraft, +$('peAlpha').value / 100);
}

function padClose(save) {
  if (save) {
    S.pads = padDraft; S.padAlpha = +$('peAlpha').value / 100;
    store.set('pads', S.pads); store.set('padAlpha', S.padAlpha);
  }
  padEditing = false; padDraft = null; padDrag = null; padSel = null;
  for (const b of padItems) b.el.classList.remove('pe-sel');
  document.body.classList.remove('padedit');
  $('padedit').hidden = true;
  $('pause').hidden = !(padFrom && padFrom.pause);
  if (padFrom && padFrom.rig) $('touch').hidden = true;
  if (padFrom && padFrom.hud) { $('hud').hidden = true; document.body.classList.remove('pad-garage'); }
  padFrom = null;
  padApply(S.pads, S.padAlpha);
}

for (const t of padItems) {
  t.el.addEventListener('pointerdown', e => {
    if (!padEditing) return;
    e.preventDefault(); e.stopPropagation();
    padSelect(t);
    const r = t.el.getBoundingClientRect();
    padDrag = { id: t.id, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2), pid: e.pointerId };
    try { t.el.setPointerCapture(e.pointerId); } catch (_) { }
  });
  t.el.addEventListener('pointermove', e => {
    if (!padEditing || !padDrag || padDrag.pid !== e.pointerId) return;
    e.preventDefault();
    const c = padDraft[t.id];
    c.cx = clamp((e.clientX - padDrag.dx) / innerWidth, .02, .98);
    c.cy = clamp((e.clientY - padDrag.dy) / innerHeight, .05, .98);
    padApply(padDraft, +$('peAlpha').value / 100);
  });
  const endDrag = e => { if (padDrag && padDrag.pid === e.pointerId) padDrag = null; };
  t.el.addEventListener('pointerup', endDrag);
  t.el.addEventListener('pointercancel', endDrag);
}

$('peSize').addEventListener('input', () => {
  const k = +$('peSize').value / 100;
  if (padSel) padDraft[padSel].k = k; else for (const t of padItems) padDraft[t.id].k = k;
  padApply(padDraft, +$('peAlpha').value / 100);
});
$('peAlpha').addEventListener('input', () => padApply(padDraft, +$('peAlpha').value / 100));
$('peReset').addEventListener('click', () => {
  padDraft = {}; for (const t of padItems) padDraft[t.id] = {};
  $('peAlpha').value = 100; padSel = null; padSelect(null);
  padApply(padDraft, 1);
});
$('peCancel').addEventListener('click', () => padClose(false));
$('peSave').addEventListener('click', () => padClose(true));
function readInput(dt) {
  let steer = ((keys.KeyD || keys.ArrowRight || touch.right) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft || touch.left) ? 1 : 0);
  let throttle = (keys.KeyW || keys.ArrowUp || touch.gas) ? 1 : 0, brake = (keys.KeyS || keys.ArrowDown || touch.brake) ? 1 : 0;
  let hand = !!(keys.Space || touch.drift), nitro = !!(keys.ShiftLeft || keys.ShiftRight || touch.nitro), analog = false;
  /* Analog steering, when the player has chosen it. The axis is chased rather
     than jumped to: a slider released mid-corner would otherwise snap the wheels
     straight, and tilt data arrives in coarse steps that read as judder. */
  if (IS_TOUCH && S.steerMode !== 'pads' && dt) {
    STEER.axis = damp(STEER.axis, STEER.target, STEER.on || STEER.live ? 16 : 11, dt);
    steerPaint();
    // A held arrow key still wins, so a touch laptop left in slider mode can be
    // driven from the keyboard. Nothing held: the axis takes over, and because
    // it is the damped one it eases back to centre rather than snapping there.
    if (steer === 0 && (S.steerMode === 'slider' || STEER.live)) {
      steer = steerCurve(STEER.axis);
      analog = true;
    }
  }
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue; const ax = p.axes[0] || 0;
    if (Math.abs(ax) > .12) { steer = Math.sign(ax) * Math.pow((Math.abs(ax) - .12) / .88, 1.4); analog = true; }
    const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
    if (rt > .05) throttle = Math.max(throttle, rt); if (lt > .05) brake = Math.max(brake, lt);
    if (p.buttons[0] && p.buttons[0].pressed) nitro = true; if (p.buttons[2] && p.buttons[2].pressed) hand = true;
    if (p.buttons[1] && p.buttons[1].pressed) hand = true;
  }
  return { steer, throttle, brake, hand, nitro, analog };
}

let smoke = null, sparks = null, boostP = null, skids = null;
function disposeObj(root) {
  root.traverse(o => {
    if (o.geometry && !SHARED.has(o.geometry)) o.geometry.dispose();
    if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture && !SHARED.has(v)) v.dispose(); } m.dispose(); }); }
  });
}
function disposeRace() {
  if (!game.scene) return;
  disposeObj(game.scene); if (game.scene.environment) game.scene.environment.dispose();
  game.scene = null; game.cars = []; game.player = null; game.updaters = [];
}
async function buildRace(progress, net) {
  disposeRace();
  const def = STAGES[S.stage], q = QUALITY[S.quality];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 6000);
  const tr = buildTrack(def); const noise = makeNoise(def.seed);
  const ctx = { scene, tr, noise, def, q, updaters: [] };
  ctx.heightAt = (x, z) => { if (!def.height) return 0; const n = trackNearest(tr, x, z, true); return def.height(x, z, n.d, n.y, noise, tr); };
  await progress(22, 'stTerrain');
  def.build(ctx);
  await progress(62, 'stAsphalt');
  buildTrackMeshes(ctx);
  await progress(76, 'stGrid');
  Object.assign(game, { scene, camera, track: tr, updaters: ctx.updaters, sun: ctx.sun, sunDir: ctx.sunDir, startLights: ctx.startLights, def, laps: S.laps, raceTime: 0, finishOrder: [], resultsShown: false, acc: 0, t: 0, shake: 0, paused: false, wrongT: 0 });
  // cars
  const pSpec = CARS[S.car]; const cars = []; let player = null;
  const placeCar = (car, s) => { const i = (tr.N - 7 - s * 6) % tr.N; car.place(tr, i, s % 2 ? 3.3 : -3.3); car.raceDist = -(7 + s * 6); car.model.underglow.visible = def.night; cars.push(car); scene.add(car.model.root); };
  if (net) {
    let botIdx = 0;
    net.grid.forEach((g, s) => {
      const [id, ci, paint, name, num, fin] = g; const spec = CARS[clamp(ci | 0, 0, CARS.length - 1)];
      const isMe = id === NET.me, isBot = String(id)[0] === 'b';
      const drv = isBot ? DRIVERS[(parseInt(String(id).slice(1)) || 0) % DRIVERS.length] : null;
      const car = new Car(spec, { name: isMe ? (S.name || 'You') : cleanName(name) || 'Racer', isPlayer: isMe, color: validHex(paint) || (drv ? drv.color : undefined), num: num | 0 || spec.num, finish: validFin(fin) });
      car.netId = String(id); car.isBot = isBot; if (isBot) { car.botIdx = botIdx++; car.skill = [.9, .965, 1.015][clamp(net.diff | 0, 0, 2)] - s * .004; }
      if (!isMe && (!isBot || NET.role !== 'host')) car.isRemote = true;
      placeCar(car, s); if (isMe) player = car;
    });
  } else {
    const pool = CARS.filter((c, i) => i !== S.car); let ai = 0; const slotP = 3;
    for (let s = 0; s < 6; s++) {
      let car;
      if (s === slotP) car = new Car(pSpec, { name: S.name || 'You', isPlayer: true, color: S.paints[S.car] || undefined, finish: S.finishes[S.car] || undefined });
      else { const drv = DRIVERS[ai]; const spec = pool[(ai * 3 + S.stage) % pool.length]; car = new Car(spec, { name: drv.name, color: drv.color, num: drv.num }); car.skill = [.9, .965, 1.015][S.diff] - s * .004; ai++; }
      placeCar(car, s); if (s === slotP) player = car;
    }
  }
  const playerSlot = cars.indexOf(player);
  game.cars = cars; game.player = cars[playerSlot]; game.online = !!net;
  if (def.night) {
    const spot = new THREE.SpotLight(0xe8f0ff, 260, 140, .45, .6, 1.4); spot.position.set(0, .8, 2.2); spot.target.position.set(0, -.5, 30);
    game.player.model.root.add(spot, spot.target);
    const glow = new THREE.PointLight(new THREE.Color(game.player.spec.accent), 14, 9, 1.6); glow.position.set(0, .3, 0); game.player.model.root.add(glow);
  }
  smoke = new Particles(700, false); sparks = new Particles(400, true); boostP = new Particles(300, true); skids = new Skids(1600);
  scene.add(smoke.points, sparks.points, boostP.points, skids.mesh);
  game.camYaw = game.player.heading;
  renderer.toneMappingExposure = def.exposure;
  buildComposer(scene, camera, def.bloom);
  drawMinimapBase();
}
FX.onHit = (c, imp, s, R) => {
  const x = c.x + R.x * s * 1.05, z = c.z + R.z * s * 1.05;
  for (let i = 0; i < Math.min(40, imp * 3); i++) sparks.emit(x, c.y + .5, z, c.vx * .6 + (Math.random() - .5) * 8, 2 + Math.random() * 5, c.vz * .6 + (Math.random() - .5) * 8, 5, 2.4, .6, .22, .4 + Math.random() * .4, -.2, 1, 12);
  if (c.isPlayer) { game.shake = Math.min(.5, game.shake + imp * .03); AU.hit(imp * .03); if (imp > 11 && game.phase === 'race') VOICE.say('wall', null, { cool: 10 }); }
};
FX.onLand = (c, imp, airT) => {
  if (imp < 2) return; const near = (c.x - game.camera.position.x) ** 2 + (c.z - game.camera.position.z) ** 2 < 120 * 120; if (!near) return;
  const sc = game.def.smoke; for (let i = 0; i < Math.min(26, 6 + imp * 2); i++) { const a = Math.random() * Math.PI * 2; smoke.emit(c.x + Math.cos(a) * 1.5, c.y + .3, c.z + Math.sin(a) * 1.5, Math.cos(a) * 4 + c.vx * .2, 1 + Math.random() * 2, Math.sin(a) * 4 + c.vz * .2, sc[0], sc[1], sc[2], 1.4, 1.6 + Math.random(), 3, .4); }
  if (c.isPlayer) { game.shake = Math.min(.6, game.shake + imp * .04); AU.land(imp); if (airT > 1.3) { showSub(tr_('bigAir') + '  ' + airT.toFixed(1) + 's', 1.4); VOICE.say('air', null, { cool: 6 }); } }
};
FX.onScrape = (c, s, R) => { if (Math.random() < .5 && c.speed > 8) sparks.emit(c.x + R.x * s * 1.05, c.y + .4, c.z + R.z * s * 1.05, c.vx * .7, 1 + Math.random() * 2, c.vz * .7, 5, 2.2, .5, .18, .3, -.1, 1, 10); };
FX.onBump = (a, b, imp, x, z) => { for (let i = 0; i < 12; i++) sparks.emit(x, (a.y + b.y) / 2 + .6, z, (Math.random() - .5) * 6, 1 + Math.random() * 3, (Math.random() - .5) * 6, 4, 3, 1.5, .2, .35, -.1, 1, 10); if (a.isPlayer || b.isPlayer) { game.shake = Math.min(.4, game.shake + imp * .03); AU.hit(imp * .025); } };

function resetPlayer() { const c = game.player; const i = (c.idx + 3) % game.track.N; const rd = c.raceDist; c.place(game.track, i, 0); c.raceDist = rd + 3; showMsg(tr_('backOn'), .9, 'small'); VOICE.say('back'); }
function standings() {
  return game.cars.filter(c => !c.gone).sort((a, b) => { if (a.finished && b.finished) return a.finishTime - b.finishTime; if (a.finished) return -1; if (b.finished) return 1; return b.prog - a.prog; });
}
let msgTimer = 0, subTimer = 0;
function showMsg(text, dur = 1.2, cls = '') { const m = $('msg'); m.textContent = text; m.className = 'on ' + cls; msgTimer = dur; }
function showSub(text, dur = 1.6) { const m = $('sub'); m.textContent = text; m.className = 'on'; subTimer = dur; }
function lapLogic(c) {
  const lf = Math.floor(c.raceDist / game.track.N);
  if (lf > c.maxLap) {
    c.maxLap = lf;
    if (lf >= 1) {
      const lt = game.raceTime - c.lapStart; c.lapStart = game.raceTime; c.lapTimes.push(lt);
      const pb = lt < c.bestLap; if (pb) c.bestLap = lt;
      if (lf >= game.laps && !c.finished) { c.finished = true; c.finishTime = game.raceTime; game.finishOrder.push(c); if (c.isPlayer) playerFinished(); return; }
      if (c.isPlayer) {
        if (lf === game.laps - 1) { showMsg(tr_('finalLap'), 1.6, 'small'); AU.beep(660, .2); AU.beep(990, .35); VOICE.say('finalLap', null, { interrupt: true }); }
        else { showMsg(tr_('lapN', lf + 1), 1.2, 'small'); VOICE.say(pb && lf > 1 ? 'bestLap' : 'lap', lf + 1, { interrupt: true }); }
        showSub((pb && lf > 1 ? tr_('bestLap') : tr_('lap')) + '  ' + fmt(lt), 2);
      }
    }
  }
}
function playerFinished() {
  const pos = standings().indexOf(game.player) + 1;
  showMsg(pos === 1 ? tr_('victory') : tr_('place', pos), 3); showSub(tr_('raceTime') + '  ' + fmt(game.player.finishTime), 3);
  AU.crowd(); VOICE.say(pos === 1 ? 'win' : 'finish', pos, { interrupt: true });
  game.player.skill = .85;
  const key = 'best:' + STAGES[S.stage].key; const prev = store.get(key, null);
  if (isFinite(game.player.bestLap) && (prev == null || game.player.bestLap < prev)) store.set(key, game.player.bestLap);
  setTimeout(showResults, 3200);
}
function showResults() {
  if (S.mode !== 'race' || game.resultsShown) return; game.resultsShown = true;
  const st = standings(); const tr = game.track; const pos = st.indexOf(game.player) + 1;
  $('resTitle').textContent = pos === 1 ? tr_('victory') : tr_('placeTitle', pos);
  $('resSub').textContent = STAGES[S.stage].name + ' · ' + tr_('lapsWord', game.laps) + ' · ' + (game.online ? tr_('onlineRoom', NET.code.slice(0, 3) + ' ' + NET.code.slice(3)) : tr_('rivalsWord', S.diff));
  $('btnAgain').hidden = $('btnNextStage').hidden = game.online; $('btnLobby').hidden = !game.online;
  const body = $('resBody'); body.innerHTML = '';
  st.forEach((c, i) => {
    let time; if (c.finished) time = fmt(c.finishTime);
    else if (c.isRemote && !c.isBot) time = tr_('racingTag');
    else { const remain = (game.laps * tr.N - c.prog) * tr.seg; const avg = Math.max(c.raceDist * tr.seg / Math.max(game.raceTime, 1), 25); time = '~' + fmt(game.raceTime + remain / avg); }
    const row = document.createElement('tr'); if (c.isPlayer) row.className = 'me';
    row.innerHTML = `<td>${i + 1}</td><td>${esc(c.name)}${c.isPlayer ? ' (' + tr_('youTag') + ')' : ''}</td><td>${c.spec.name}</td><td>${time}</td><td>${fmt(c.bestLap)}</td>`;
    body.appendChild(row);
  });
  $('results').hidden = false;
  if (game.online) { clearTimeout(game.resT); game.resT = setTimeout(() => { if (!$('results').hidden && game.online) { game.resultsShown = false; showResults(); } }, 1000); }
}
function togglePause(force) {
  if (S.mode !== 'race' || game.resultsShown) return;
  if (game.online) { $('pause').hidden = force === false ? true : !$('pause').hidden; $('btnRestart').hidden = true; $('pauseInfo').textContent = tr_('onlineRoom', NET.code.slice(0, 3) + ' ' + NET.code.slice(3)); return; }
  $('btnRestart').hidden = false;
  game.paused = force !== undefined ? force : !game.paused;
  $('pause').hidden = !game.paused;
  $('pauseInfo').textContent = tr_('pauseInfo', STAGES[S.stage].name, Math.max(1, Math.min(game.player.maxLap + 1, game.laps)), game.laps);
  if (game.paused) { AU.engine(null, false); VOICE.stop(); }
}

/* ---- camera ---- */
const _v = new THREE.Vector3();
function updateCamera(dt) {
  const c = game.player, cam = game.camera;
  const sp = c.speed, top = c.top;
  const velYaw = sp > 6 ? Math.atan2(c.vx, c.vz) : c.heading;
  game.camYaw = dampAngle(game.camYaw, wrapA(c.heading + wrapA(velYaw - c.heading) * .35), S.cam === 2 ? 20 : 6, dt);
  const fX = Math.sin(game.camYaw), fZ = Math.cos(game.camYaw);
  let dist = 6.6 + sp * .018, hgt = 2.15 + sp * .004, look = 3.5;
  if (S.cam === 1) { dist = 10.5 + sp * .02; hgt = 3.8; look = 4; }
  if (S.cam === 2) {
    const hf = Math.sin(c.heading), hz = Math.cos(c.heading);
    cam.position.set(c.x + hf * .4, c.y + 1.12, c.z + hz * .4);
    _v.set(c.x + hf * 30, c.y + 1.2 - c.pitch * 30, c.z + hz * 30);
  } else {
    cam.position.set(c.x - fX * dist, c.y + hgt, c.z - fZ * dist);
    const ground = c.y + 1; if (cam.position.y < ground) cam.position.y = ground;
    _v.set(c.x + fX * look, c.y + 1.05, c.z + fZ * look);
  }
  if (game.shake > 0) { cam.position.x += (Math.random() - .5) * game.shake; cam.position.y += (Math.random() - .5) * game.shake; game.shake = Math.max(0, game.shake - dt * 1.6); }
  if (c.boosting) { cam.position.x += (Math.random() - .5) * .05; cam.position.y += (Math.random() - .5) * .05; }
  cam.lookAt(_v);
  const fov = 60 + 15 * clamp(sp / top, 0, 1.3) + (c.boosting ? 9 : 0);
  cam.fov = damp(cam.fov, fov, 4, dt); cam.updateProjectionMatrix();
}

/* ---- per-frame race ---- */
const rearW = [new THREE.Vector3(), new THREE.Vector3()];
function wheelWorld(c, side, out) { const fX = Math.sin(c.heading), fZ = Math.cos(c.heading); const back = c.model.rearZ; out.set(c.x + fX * back - fZ * .9 * side, c.y, c.z + fZ * back + fX * .9 * side); return out; }
function updateRace(dt) {
  if (game.paused) return;
  game.t += dt;
  const tr = game.track, P = game.player, inp = readInput(dt);
  if (game.online) NET.applyRemotes(dt);
  if (game.phase === 'waiting') {
    if (msgTimer < .3) showMsg(tr_('waitPlayers'), .6, 'small');
    P.rpm = damp(P.rpm, inp.throttle ? 6800 : 1000, 6, dt); P.throttle = inp.throttle;
    if (NET.go) { game.phase = 'countdown'; game.countdown = 4.2; VOICE.say('welcome', STAGES[S.stage].name, { interrupt: true }); }
  }
  if (game.phase === 'countdown') {
    const prev = game.countdown; game.countdown -= dt; const cd = game.countdown;
    for (const n of [3, 2, 1]) if (prev > n && cd <= n) { showMsg(String(n), .9); AU.beep(440, .18); VOICE.say('n' + n, null, { interrupt: true }); }
    const lit = clamp(Math.floor((4.2 - cd) / .6), 0, 5);
    game.startLights.forEach((m, i) => m.color.setRGB(i < lit ? 2.6 : .08, i < lit ? .08 : .02, i < lit ? .06 : .02));
    P.rpm = damp(P.rpm, inp.throttle ? 6800 : 1000, 6, dt); P.throttle = inp.throttle;
    if (cd <= 0) {
      game.phase = 'race'; showMsg(tr_('go'), 1); AU.beep(880, .45); VOICE.say('go', null, { interrupt: true });
      game.startLights.forEach(m => m.color.setRGB(.1, 2.4, .3));
      if (inp.throttle && P.rpm > 5200 && P.rpm < 7400) { P.vf = 12; P.vx = Math.sin(P.heading) * 12; P.vz = Math.cos(P.heading) * 12; P.nitro = Math.min(1, P.nitro + .2); showSub(tr_('perfect'), 1.4); AU.whoosh(); setTimeout(() => VOICE.say('perfect'), 700); }
    }
  }
  if (game.phase === 'race') {
    game.raceTime += dt;
    game.acc += dt; const h = 1 / 120; let n = 0;
    // rubber-banding
    for (const c of game.cars) { if (c.isPlayer || c.isRemote) continue; const gap = (P.prog - c.prog) * tr.seg; c.aiBoost = clamp(1 + gap * .00035, .95, 1.07); }
    while (game.acc >= h && n < 12) {
      for (const c of game.cars) {
        if (c.isRemote) continue;
        const ci = (c.isPlayer && !c.finished && !game.autopilot) ? inp : aiInput(c, tr, h, game.cars);
        stepCar(c, ci, h, tr);
      }
      carCollisions(game.cars);
      game.acc -= h; n++;
    }
    for (const c of game.cars) {
      if (c.isRemote) continue;
      lapLogic(c);
      if (!c.isPlayer || c.finished) { if (Math.abs(c.vf) < 2) c.stuck += dt; else c.stuck = 0; if (c.stuck > 2.5) { const rd = c.raceDist; c.place(tr, (c.idx + 2) % tr.N, 0); c.raceDist = rd + 2; c.stuck = 0; } }
    }
    // wrong way
    const T = tr.T[P.idx]; if (!P.onBranch && P.vx * T.x + P.vz * T.z < -4) game.wrongT += dt; else game.wrongT = 0;
    if (P.onBranch && !game.wasOnBranch) showSub(tr_('shortcut'), 1.4); game.wasOnBranch = P.onBranch;
    if (game.wrongT > .8 && !P.finished) { if (msgTimer < .2) showMsg(tr_('wrongWay'), .5, 'warn'); VOICE.say('wrong', null, { cool: 6 }); }
    announcer(dt);
  }
  // visuals
  for (const c of game.cars) {
    syncModel(c, dt);
    const near = (c.x - game.camera.position.x) ** 2 + (c.z - game.camera.position.z) ** 2 < 160 * 160;
    if (!near) { c.skidPrev = [null, null]; continue; }
    const skidding = game.phase === 'race' && (c.drifting || (c.braking && c.speed > 22));
    for (let s = 0; s < 2; s++) {
      const w = wheelWorld(c, s ? 1 : -1, rearW[s]);
      if (skidding) { if (c.skidPrev[s]) skids.add(c.skidPrev[s], w); c.skidPrev[s] = w.clone(); } else c.skidPrev[s] = null;
      if (c.onBranch && game.track.branch.surface !== 'alley' && c.speed > 10 && Math.random() < .35) { const ice = game.track.branch.surface === 'ice'; smoke.emit(w.x, w.y + .2, w.z, c.vx * .1, .6, c.vz * .1, ice ? .9 : .7, ice ? .95 : .55, ice ? 1 : .38, 1, 1.1, 2.6, ice ? .2 : .3); }
      if (c.drifting && Math.random() < .7) { const sc = game.def.smoke; smoke.emit(w.x, w.y + .25, w.z, c.vx * .15 + (Math.random() - .5) * 2, .8 + Math.random(), c.vz * .15 + (Math.random() - .5) * 2, sc[0], sc[1], sc[2], 1.2, 1.3 + Math.random(), 3.2, .32); }
    }
    if (c.boosting) {
      const h = c.model.L / 2, fX = Math.sin(c.heading), fZ = Math.cos(c.heading);
      for (const s of [-.35, .35]) boostP.emit(c.x - fX * (h + .3) - fZ * s, c.y + .32, c.z - fZ * (h + .3) + fX * s, c.vx * .5 - fX * 6, (Math.random() - .5), c.vz * .5 - fZ * 6, .6, 1.6, 4, .5, .18, -.6, 1);
    }
  }
  smoke.update(dt); sparks.update(dt); boostP.update(dt);
  const scale = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(game.camera.fov) / 2));
  smoke.mat.uniforms.uScale.value = sparks.mat.uniforms.uScale.value = boostP.mat.uniforms.uScale.value = scale;
  updateCamera(dt);
  if (game.sun) { game.sun.target.position.set(P.x, P.y, P.z); game.sun.position.set(P.x + game.sunDir.x * 200, P.y + game.sunDir.y * 200, P.z + game.sunDir.z * 200); }
  for (const u of game.updaters) u(game.t, dt, game.camera);
  let rv = null, rd = 1e9; for (const c of game.cars) { if (c === P || c.gone) continue; const d = (c.x - P.x) ** 2 + (c.z - P.z) ** 2; if (d < rd) { rd = d; rv = c; } }
  AU.engine(P, game.phase !== 'idle', rv);
  if (game.online) NET.publish();
  updateHUD(dt);
}


function announcer(dt) {
  const P = game.player, a = game.ann; if (!a || P.finished) return;
  const pos = standings().indexOf(P) + 1; a.posT -= dt;
  if (pos < a.pos && a.pos !== 99 && game.raceTime > 4 && a.posT <= 0) { showSub(tr_('overtake') + '  ' + tr_('place', pos), 1.4); VOICE.say('overtake', pos, { cool: 5 }); a.posT = 3; }
  a.pos = pos;
  if (P.drifting) a.driftT += dt; else { if (a.driftT > 1.6) { showSub(tr_('greatDrift'), 1.2); VOICE.say('drift', null, { cool: 7 }); } a.driftT = 0; }
  if (P.nitro >= .99 && !a.nitroFull) { a.nitroFull = true; VOICE.say('nitro', null, { cool: 12 }); } else if (P.nitro < .8) a.nitroFull = false;
  if (typeof P.gear === 'number' && typeof a.gear === 'number' && P.gear > a.gear && P.throttle) AU.shift();
  a.gear = P.gear;
  if (P.boosting && !a.boosting) AU.whoosh(); a.boosting = P.boosting;
}
function cycleMusic() {
  const order = ['synth', 'kuthu', 'off']; S.music = order[(order.indexOf(S.music) + 1) % 3]; store.set('music2', S.music);
  AU.init(); AU.stopMusic(); AU.startMusic(); buildSegments(); showSub(tr_('music') + ': ' + tr_(S.music), 1.2);
}

/* ================= HUD ================= */
// On a phone a shrunken round dial is unreadable, so the gauge becomes a wide strip.
const gaugeEl = $('gauge');
if (IS_TOUCH) { gaugeEl.width = 440; gaugeEl.height = 168; }
const gctx = gaugeEl.getContext('2d'), mctx = $('minimap').getContext('2d');
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
let mmBase = null, mmMap = null;
function drawMinimapBase() {
  const tr = game.track; let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of tr.P) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const S_ = 380, pad = 34, sc = (S_ - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = (S_ - (maxX - minX) * sc) / 2, oz = (S_ - (maxZ - minZ) * sc) / 2;
  mmMap = (x, z) => [ox + (x - minX) * sc, S_ - (oz + (z - minZ) * sc)];
  const c = document.createElement('canvas'); c.width = c.height = S_; const g = c.getContext('2d');
  g.fillStyle = 'rgba(7,8,13,.55)'; g.beginPath(); g.arc(S_ / 2, S_ / 2, S_ / 2 - 2, 0, Math.PI * 2); g.fill();
  g.lineJoin = 'round'; g.lineCap = 'round';
  const path = () => { g.beginPath(); tr.P.forEach((p, i) => { const [x, y] = mmMap(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  const k = IS_TOUCH ? 1.7 : 1;  // the phone minimap is half the size, so thicken everything
  path(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 16 * k; g.stroke();
  path(); g.strokeStyle = 'rgba(241,238,230,.85)'; g.lineWidth = 7 * k; g.stroke();
  if (tr.branch) { g.beginPath(); tr.branch.P.forEach((p, i) => { const [x, y] = mmMap(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.setLineDash([10 * k, 8 * k]); g.strokeStyle = '#ffb020'; g.lineWidth = 5 * k; g.stroke(); g.setLineDash([]); }
  const [sx, sy] = mmMap(tr.P[0].x, tr.P[0].z); g.fillStyle = '#ff5a1f'; g.fillRect(sx - 7 * k, sy - 7 * k, 14 * k, 14 * k);
  mmBase = c;
}
function drawMinimap() {
  if (!mmBase) return; mctx.clearRect(0, 0, 380, 380); mctx.drawImage(mmBase, 0, 0);
  for (const c of game.cars) {
    if (c.gone) continue; const [x, y] = mmMap(c.x, c.z);
    const k = IS_TOUCH ? 1.7 : 1;
    mctx.beginPath(); mctx.arc(x, y, (c.isPlayer ? 11 : 8) * k, 0, Math.PI * 2); mctx.fillStyle = c.isPlayer ? '#ff5a1f' : c.color; mctx.fill();
    mctx.lineWidth = 3 * k; mctx.strokeStyle = c.isPlayer ? '#fff' : 'rgba(0,0,0,.7)'; mctx.stroke();
  }
}
/* Phone speed strip: revs across the top, the speed big enough to read with one
   glance mid-corner, gear, and the nitro charge along the bottom. */
function drawGaugeMobile(c) {
  const g = gctx, W = 440, H = 168; g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(8,10,16,.74)'; roundRect(g, 2, 2, W - 4, H - 4, 26); g.fill();
  g.strokeStyle = 'rgba(241,238,230,.18)'; g.lineWidth = 2; g.stroke();
  const bx = 26, bw = W - 52, by = 20, bh = 13, rf = clamp(c.rpm / 8500, 0, 1);
  g.fillStyle = 'rgba(255,255,255,.1)'; roundRect(g, bx, by, bw, bh, 6); g.fill();
  const gr = g.createLinearGradient(bx, 0, bx + bw, 0);
  gr.addColorStop(0, '#ffb020'); gr.addColorStop(.74, '#ff5a1f'); gr.addColorStop(1, '#ff3b5c');
  g.fillStyle = gr; roundRect(g, bx, by, Math.max(bh, bw * rf), bh, 6); g.fill();
  g.fillStyle = c.gear === 'R' ? '#ff3b5c' : '#ffb020';
  g.font = 'italic 700 48px "Chakra Petch", Arial'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(c.gear, 28, 116);
  g.fillStyle = '#f1eee6'; g.font = 'italic 700 84px "Chakra Petch", Arial'; g.textAlign = 'right';
  g.fillText(Math.round(c.speed * 3.6), W - 92, 118);
  g.fillStyle = 'rgba(241,238,230,.6)'; g.font = '600 21px "Chakra Petch", Arial'; g.textAlign = 'left';
  g.fillText('KM/H', W - 84, 104);
  const ny = H - 30, nh = 11;
  g.fillStyle = 'rgba(53,224,255,.16)'; roundRect(g, bx, ny, bw, nh, 5); g.fill();
  g.fillStyle = c.boosting ? '#ffffff' : '#35e0ff';
  roundRect(g, bx, ny, Math.max(nh, bw * clamp(c.nitro, 0, 1)), nh, 5); g.fill();
}
function drawGauge(c) {
  if (IS_TOUCH) return drawGaugeMobile(c);
  const g = gctx, W = 480, cx = 240, cy = 250, R = 196; g.clearRect(0, 0, W, W);
  const a0 = Math.PI * .75, a1 = Math.PI * 2.25, span = a1 - a0;
  g.fillStyle = 'rgba(7,8,13,.5)'; g.beginPath(); g.arc(cx, cy, R + 20, 0, Math.PI * 2); g.fill();
  g.lineCap = 'butt'; g.lineWidth = 16; g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
  g.strokeStyle = 'rgba(255,59,92,.35)'; g.beginPath(); g.arc(cx, cy, R, a0 + span * 7 / 8.5, a1); g.stroke();
  const rf = clamp(c.rpm / 8500, 0, 1); const gr = g.createLinearGradient(cx - R, 0, cx + R, 0); gr.addColorStop(0, '#ffb020'); gr.addColorStop(1, rf > .82 ? '#ff3b5c' : '#ff5a1f');
  g.strokeStyle = gr; g.beginPath(); g.arc(cx, cy, R, a0, a0 + span * rf); g.stroke();
  g.fillStyle = 'rgba(241,238,230,.75)'; g.font = '600 22px "Chakra Petch", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i <= 8; i++) { const a = a0 + span * i / 8.5; g.fillText(i, cx + Math.cos(a) * (R - 34), cy + Math.sin(a) * (R - 34)); }
  g.lineWidth = 8; g.strokeStyle = 'rgba(53,224,255,.15)'; g.beginPath(); g.arc(cx, cy, R - 62, Math.PI * .8, Math.PI * 1.2); g.stroke();
  g.strokeStyle = c.boosting ? '#ffffff' : '#35e0ff'; g.beginPath(); g.arc(cx, cy, R - 62, Math.PI * 1.2 - Math.PI * .4 * c.nitro, Math.PI * 1.2); g.stroke();
  g.fillStyle = '#f1eee6'; g.font = 'italic 700 118px "Chakra Petch", Arial'; g.fillText(Math.round(c.speed * 3.6), cx + 10, cy - 4);
  g.fillStyle = 'rgba(241,238,230,.55)'; g.font = '600 22px "Chakra Petch", Arial'; g.fillText('KM/H', cx, cy + 62);
  g.fillStyle = c.gear === 'R' ? '#ff3b5c' : '#ffb020'; g.font = 'italic 700 46px "Chakra Petch", Arial'; g.fillText(c.gear, cx, cy + 118);
  g.fillStyle = '#35e0ff'; g.font = '600 18px "Chakra Petch", Arial'; g.fillText('NITRO', cx - 132, cy + 4);
}
const digitCache = {};
function setDigits(id, s) { if (digitCache[id] === s) return; digitCache[id] = s; $(id).innerHTML = s.replace(/[0-9-]/g, ch => `<span class="d">${ch}</span>`); }
function updateHUD(dt) {
  const P = game.player;
  msgTimer -= dt; if (msgTimer <= 0 && $('msg').classList.contains('on')) $('msg').classList.remove('on');
  subTimer -= dt; if (subTimer <= 0) $('sub').classList.remove('on');
  drawGauge(P); drawMinimap();
  $('boostfx').style.opacity = P.boosting ? 1 : 0;
  const lapT = P.finished ? P.lapTimes[P.lapTimes.length - 1] : (game.phase === 'race' ? game.raceTime - P.lapStart : 0);
  setDigits('hTime', fmt(lapT || 0)); setDigits('hTotal', fmt(P.finished ? P.finishTime : game.raceTime)); setDigits('hBest', fmt(P.bestLap));
  game.lastBoard -= dt;
  if (game.lastBoard <= 0) {
    game.lastBoard = .25;
    const st = standings(); const pos = st.indexOf(P) + 1;
    $('hPos').textContent = pos; $('hPosN').textContent = st.length;
    $('hLap').textContent = Math.max(1, Math.min(P.maxLap + 1, game.laps)) + '/' + game.laps;
    const leader = st[0]; const tr = game.track;
    $('board').innerHTML = st.map((c, i) => {
      let gap = i === 0 ? (S.lang === 'ta' ? 'முன்னணி' : 'Leader') : (c.finished ? 'Done' : '+' + ((leader.prog - c.prog) * tr.seg / Math.max(leader.speed, 20)).toFixed(1) + 's');
      if (i === 0 && c.finished) gap = 'Done';
      return `<li class="${c.isPlayer ? 'me' : ''}" style="--c:${c.isPlayer ? '#ff5a1f' : c.color}"><span>${i + 1}</span><span>${esc(c.name)}</span><span>${gap}</span></li>`;
    }).join('');
  }
}

/* ================= SHOWROOM ================= */
const show = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(34, innerWidth / innerHeight, .1, 300), model: null, table: new THREE.Group(), t: 0, ring: null };
function buildShowroom() {
  const s = show.scene; s.background = new THREE.Color(0x07080d); s.fog = new THREE.Fog(0x07080d, 18, 60);
  s.environment = pmrem.fromScene(new RoomEnvironment(renderer), .04).texture; s.environmentIntensity = .45;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(80, 64), new THREE.MeshStandardMaterial({ color: 0x0b0c12, roughness: .7, metalness: .2, envMapIntensity: .12 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
  const grid = new THREE.GridHelper(80, 80, 0x1c2030, 0x12141c); grid.position.y = .002; s.add(grid);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.05, .16, 96), new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: .3, metalness: .8 }));
  table.position.y = .08; table.receiveShadow = true; s.add(table);
  show.ring = new THREE.Mesh(new THREE.TorusGeometry(4.02, .035, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, .8, .25) })); show.ring.rotation.x = Math.PI / 2; show.ring.position.y = .165; s.add(show.ring);
  show.table.position.y = .16; s.add(show.table);
  for (let i = -1; i <= 1; i++) { const strip = new THREE.Mesh(new THREE.BoxGeometry(9, .06, .22), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.9) })); strip.position.set(0, 7.5, i * 2.4); s.add(strip); }
  const key = new THREE.SpotLight(0xffffff, 45, 40, .5, .6, 1.2); key.position.set(3, 11, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0002; s.add(key, key.target);
  const rimA = new THREE.DirectionalLight(0x35e0ff, .45); rimA.position.set(-9, 3, -6); s.add(rimA);
  const rimB = new THREE.DirectionalLight(0xff7a3a, .6); rimB.position.set(9, 3, -5); s.add(rimB);
  s.add(new THREE.HemisphereLight(0x8090b0, 0x101018, .5));
  for (let i = 0; i < 0; i++) { const pan = new THREE.Mesh(new THREE.PlaneGeometry(.12, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(i ? 4 : .6, i ? 1.2 : 2.6, i ? .4 : 3.4) })); pan.position.set(i ? 16 : -16, 3.5, -22); s.add(pan); }
}
function setShowCar() {
  if (show.model) { show.table.remove(show.model.root); disposeObj(show.model.root); }
  const spec = CARS[S.car]; show.model = buildCarModel(spec, S.paints[S.car] || undefined, undefined, S.finishes[S.car] || undefined);
  show.model.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  show.model.tailMat.color.setRGB(4, .1, .15);
  show.table.add(show.model.root);
  show.ring.material.color.set(spec.accent).multiplyScalar(.8);
}
const orbit = { drag: false, lastX: 0, vel: 0, idle: 0, zoom: 1, id: null };
canvas.addEventListener('pointerdown', ev => { if (S.mode !== 'menu') return; orbit.drag = true; orbit.lastX = ev.clientX; orbit.vel = 0; orbit.id = ev.pointerId; try { canvas.setPointerCapture(ev.pointerId); } catch (e) { } canvas.style.cursor = 'grabbing'; });
canvas.addEventListener('pointermove', ev => { if (!orbit.drag || ev.pointerId !== orbit.id) return; const dx = ev.clientX - orbit.lastX; orbit.lastX = ev.clientX; show.table.rotation.y += dx * .012; orbit.vel = dx * .012 * 60; orbit.idle = 0; if (Math.abs(dx) > 1) document.body.classList.add('m-spun'); });
const endDrag = ev => { if (!orbit.drag) return; orbit.drag = false; canvas.style.cursor = S.mode === 'menu' ? 'grab' : ''; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', ev => { if (S.mode !== 'menu') return; ev.preventDefault(); orbit.zoom = clamp(orbit.zoom * (ev.deltaY > 0 ? 1.08 : 1 / 1.08), .65, 1.5); }, { passive: false });
$('stages').addEventListener('wheel', ev => { if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) { ev.preventDefault(); $('stages').scrollBy({ left: ev.deltaY * 1.2 }); } }, { passive: false });
$('tPrev').onclick = () => $('stages').scrollBy({ left: -$('stages').clientWidth * .8 }); $('tNext').onclick = () => $('stages').scrollBy({ left: $('stages').clientWidth * .8 });
function updateShowroom(dt) {
  show.t += dt; orbit.idle += dt; canvas.style.cursor = orbit.drag ? 'grabbing' : 'grab';
  if (!orbit.drag) { show.table.rotation.y += orbit.vel * dt; orbit.vel *= Math.exp(-3 * dt); if (orbit.idle > 2.5) show.table.rotation.y += dt * .32 * Math.min(1, (orbit.idle - 2.5) / 1.5); }
  const w = innerWidth, h = innerHeight, cam = show.camera;
  cam.aspect = w / h;
  /* The phone shell gives the car a tall band of its own rather than the strip
     left between two rails, so it can be framed closer than the plain narrow
     layout - at 17 it sat small in a lot of empty black. */
  const narrow = w < 860;
  const r = (mGarage.on ? 15.8 : narrow ? 17 : 12.5) * orbit.zoom, a = .6 + Math.sin(show.t * .15) * .25;
  cam.position.set(Math.sin(a) * r, 2.4 + Math.sin(show.t * .2) * .2, Math.cos(a) * r); cam.lookAt(0, .75, 0);
  /* Lift the car clear of whatever is covering the bottom of the screen. With the
     phone shell up that is the sheet, whose height changes with the open tab, so
     the offset comes from a measurement rather than a guess. */
  cam.setViewOffset(w, h, mGarage.on ? mGarage.gapX : 0, mGarage.on ? mGarage.gap : (narrow ? h * .26 : h * .1), w, h);
  cam.updateProjectionMatrix();
}
function enterMenu() {
  orbit.idle = 3; document.body.classList.remove('racing');
  VOICE.stop(); game.online = false; $('netbadge').hidden = true; clearTimeout(game.resT); $('settings').hidden = true; $('controls').hidden = true;
  S.mode = 'menu'; $('menu').hidden = false; $('hud').hidden = true; $('results').hidden = true; $('pause').hidden = true;
  AU.engine(null, false); disposeRace();
  renderer.toneMappingExposure = .85; buildComposer(show.scene, show.camera, { strength: .16, radius: .35, threshold: .96 });
  refreshMenu();
}

/* ================= MENU ================= */
function setCar(i) { S.car = (i + CARS.length) % CARS.length; store.set('car', S.car); setShowCar(); refreshMenu(); AU.revPreview(CARS[S.car]); }
function segment(id, opts, key, onChange) {
  const el = $(id); el.innerHTML = '';
  opts.forEach(([v, label]) => { const b = document.createElement('button'); b.textContent = label; b.setAttribute('aria-pressed', S[key] === v); b.onclick = () => { S[key] = v; store.set(SKEY[key] || key, v); segment(id, opts, key, onChange); onChange && onChange(v); }; el.appendChild(b); });
}
function refreshMenu() {
  const c = CARS[S.car], st = carStats(c);
  $('carName').textContent = c.name; $('carCls').textContent = S.lang === 'ta' ? CLS_TA[S.car] : c.cls; $('carIdx').textContent = (S.car + 1) + ' / ' + CARS.length;
  $('showCar').textContent = c.name.split(' ')[0].toUpperCase(); $('showStage').textContent = STAGES[S.stage].name;
  const rows = [[tr_('topSpeed'), c.spd, Math.round(st.top * 3.6) + ' km/h'], [tr_('accel'), c.acc, (c.acc * 10).toFixed(1)], [tr_('handling'), c.hnd, (c.hnd * 10).toFixed(1)], [tr_('drift'), (c.hnd * .6 + (1 - c.spd) * .4 + .25), ((c.hnd * .6 + (1 - c.spd) * .4 + .25) * 10).toFixed(1)]];
  $('carDots').innerHTML = CARS.map((_, i) => `<i class="${i === S.car ? 'on' : ''}"></i>`).join('');
  $('stats').innerHTML = rows.map(([n, v, t]) => `<div class="stat"><span>${n}</span><i style="--v:${Math.round(clamp(v, 0, 1) * 100)}%"></i><em>${t}</em></div>`).join('');
  const sw = $('swatches'); sw.innerHTML = ''; const cur = S.paints[S.car] || '';
  ['', ...PAINTS].forEach(hex => { const b = document.createElement('button'); b.style.setProperty('--c', hex || c.color); if (!hex) b.className = 'def'; b.setAttribute('aria-pressed', cur === hex); b.setAttribute('aria-label', hex || 'Default'); b.onclick = () => { if (hex) S.paints[S.car] = hex; else delete S.paints[S.car]; store.set('paints', S.paints); setShowCar(); refreshMenu(); }; sw.appendChild(b); });
  const fe = $('segFinish'); fe.innerHTML = ''; const curF = S.finishes[S.car] || c.finish;
  [['gloss', tr_('gloss')], ['matte', tr_('matte')], ['pearl', tr_('pearl')]].forEach(([v, lbl]) => { const b = document.createElement('button'); b.textContent = lbl; b.setAttribute('aria-pressed', curF === v); b.onclick = () => { S.finishes[S.car] = v; store.set('finishes', S.finishes); setShowCar(); refreshMenu(); }; fe.appendChild(b); });
  $('nameLbl').textContent = S.name || tr_('yourName');
  $('trackCount').textContent = (S.stage + 1) + ' / ' + STAGES.length;
  const sEl = $('stages'); sEl.innerHTML = '';
  STAGES.forEach((s, i) => {
    const inf = stageInfo(s); const b = document.createElement('button'); b.className = 'stage'; b.setAttribute('aria-pressed', i === S.stage);
    b.innerHTML = `<div class="thumb" style="background-image:url(${THUMBS[s.key]})"></div><span class="num">${String(i + 1).padStart(2, '0')}</span><div class="cap"><b>${s.name}</b><small>${S.lang === 'ta' ? STAGE_TA[s.key] : s.sub}</small><div class="meta"><span>${(inf.L / 1000).toFixed(2)} km</span><span>${inf.corners} ${tr_('sCorners')}</span>${s.shortcut ? `<span class="sc">${tr_('shortcut')}</span>` : ''}${s.gravity ? `<span class="sc" style="background:rgba(53,224,255,.2);color:var(--cool)">${tr_('lowGravity')}</span>` : ''}</div></div>`;
    b.onclick = () => { S.stage = i; store.set('stage', i); refreshMenu(); }; sEl.appendChild(b);
    if (i === S.stage) requestAnimationFrame(() => { try { const r = b.getBoundingClientRect(), pr = sEl.getBoundingClientRect(); if (r.left < pr.left || r.right > pr.right) sEl.scrollTo({ left: b.offsetLeft - 20, behavior: 'smooth' }); } catch (err) { } });
  });
  const best = store.get('best:' + STAGES[S.stage].key, null);
  $('bestLbl').textContent = best != null ? fmt(best) : '--:--.---';
}
const STAGE_INFO = {};
function stageInfo(s) { if (!STAGE_INFO[s.key]) { const i = trackInfo(s); STAGE_INFO[s.key] = { L: i.tr.L, corners: i.corners }; } return STAGE_INFO[s.key]; }
$('carPrev').onclick = $('carPrev2').onclick = () => setCar(S.car - 1); $('carNext').onclick = $('carNext2').onclick = () => setCar(S.car + 1);
$('btnSettings').onclick = () => { $('settings').hidden = false; }; $('btnControls').onclick = () => { $('controls').hidden = false; };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { $(b.dataset.close).hidden = true; });
['settings', 'controls'].forEach(id => $(id).addEventListener('pointerdown', ev => { if (ev.target.id === id) $(id).hidden = true; }));
const SKEY = { music: 'music2' };
/* ================= MOBILE GARAGE =================
   The desktop garage is a rail of three panels either side of the showroom. On a
   narrow screen that rail has nowhere to go: stacked vertically it becomes one
   long scroll where Start is somewhere in the middle and the car is pushed off
   the top. So a phone gets a different shape instead of a squeezed one -

     the showroom keeps the top of the screen, with the car name and the
     prev/next arrows floating over it,
     every panel folds into a bottom sheet with four tabs, and
     Start sits in a bar below the sheet that never scrolls away.

   The panels themselves are the same DOM nodes, moved rather than rebuilt, so
   every listener, id and `refreshMenu()` write still lands exactly as before.
   Each move records where the node came from, which is what lets the whole shell
   be taken apart again when a tablet is rotated back into landscape. */
const ICONS = {
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16v2.2H2.8V16"/><path d="M21.2 16v2.2h-1.7V16"/><path d="M2.6 15.4v-3.1l1.7-4.1A2 2 0 0 1 6.2 7h11.6a2 2 0 0 1 1.9 1.2l1.7 4.1v3.1a.8.8 0 0 1-.8.8H3.4a.8.8 0 0 1-.8-.8z"/><path d="M4.6 12.3h14.8"/><circle cx="7" cy="14" r=".9" fill="currentColor" stroke="none"/><circle cx="17" cy="14" r=".9" fill="currentColor" stroke="none"/></svg>',
  paint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-1 .8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.3-9-7.3z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="11" cy="7.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="9" r="1.1" fill="currentColor" stroke="none"/></svg>',
  race: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 5h13l-1.6 3.5L18 12H5z"/></svg>',
  track: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 19.5c-3 0-4.8-1.5-4.8-3.6S4.6 12 7.8 12h8.4c3 0 4.6-1.2 4.6-3.1s-1.8-3.4-4.9-3.4H9"/></svg>',
};

const mGarage = {
  on: false, moved: [], pane: 'car', show: null, sheet: null, gap: 0, gapX: 0,

  /** Move `el` into `to`, remembering where it was so unmount can put it back. */
  take(el, to) {
    if (!el) return;
    this.moved.push({ el, parent: el.parentNode, next: el.nextSibling });
    to.appendChild(el);
  },

  build() {
    const menu = $('menu'), q = s => menu.querySelector(s);

    const show = document.createElement('div');
    show.className = 'm-show';
    const spin = document.createElement('div');
    spin.className = 'm-spin';
    spin.dataset.i18n = 'rotHint';
    spin.dataset.i18nTouch = 'rotHintTouch';
    show.appendChild(spin);
    this.take(q('.carhead'), show);
    this.take($('carDots'), show);

    const sheet = document.createElement('div');
    sheet.className = 'm-sheet';

    const tabs = document.createElement('div');
    tabs.className = 'm-tabs';
    tabs.setAttribute('role', 'tablist');
    const body = document.createElement('div');
    body.className = 'm-body';

    const panes = {};
    for (const key of ['car', 'paint', 'race', 'track']) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.innerHTML = ICONS[key] + '<span data-i18n="' + ({ car: 'machine', paint: 'paint', race: 'raceSetup', track: 'circuit' })[key] + '"></span>';
      tab.onclick = () => this.select(key);
      tabs.appendChild(tab);

      const pane = document.createElement('div');
      pane.className = 'm-pane';
      panes[key] = pane;
      body.appendChild(pane);
    }
    this.tabs = tabs;
    this.panes = panes;

    // car: the stat bars and the one-line primer
    this.take($('stats'), panes.car);
    this.take(q('.panel-car .tag'), panes.car);
    // paint: swatches and the finish picker, with the heading they sat under
    const eyebrows = menu.querySelectorAll('.panel-car .eyebrow');
    this.take(eyebrows[eyebrows.length - 1], panes.paint);
    this.take($('swatches'), panes.paint);
    this.take(q('.stylerow'), panes.paint);
    // race: laps, rivals, personal best
    for (const sec of menu.querySelectorAll('.panel-setup .sec')) this.take(sec, panes.race);
    this.take(q('.record'), panes.race);
    // track: the whole circuit block, restyled into a vertical list by mobile.css
    this.take(q('.trackwrap'), panes.track);

    const act = document.createElement('div');
    act.className = 'm-act';
    this.take($('btnStart'), act);
    this.take($('btnOnline'), act);

    sheet.append(tabs, body, act);
    menu.append(show, sheet);
    this.show = show;
    this.sheet = sheet;
    this.select(this.pane);
  },

  select(key) {
    this.pane = key;
    for (const k in this.panes) this.panes[k].hidden = k !== key;
    [...this.tabs.children].forEach((b, i) => b.setAttribute('aria-selected', ['car', 'paint', 'race', 'track'][i] === key));
    this.measure();
  },

  /* How far to shift the showroom camera so the car sits in the band the sheet
     leaves clear, rather than behind it. Both axes, because the sheet is across
     the bottom in portrait and down one side in landscape.

     Vertically the band ends at the car name and arrows, not at the sheet, so it
     is measured from the first thing floating over the showroom. Horizontally it
     ends at the sheet's own left edge - which in portrait is 0, giving no shift.

     Read once per layout change; never in the render loop. */
  measure() {
    if (!this.on || !this.show) { this.gap = this.gapX = 0; return; }
    const w = innerWidth, h = innerHeight;
    const sheet = this.sheet.getBoundingClientRect();
    // the first child that is actually laid out: landscape hides the orbit hint
    const first = [...this.show.children].find(el => el.getBoundingClientRect().height > 0);
    const bandBottom = first ? first.getBoundingClientRect().top : h * .55;
    const bandRight = sheet.left > w * .4 ? sheet.left : w;
    this.gap = clamp(h / 2 - (56 + bandBottom) / 2, 0, h * .36);
    this.gapX = clamp(w / 2 - bandRight / 2, 0, w * .4);
  },

  mount() {
    if (this.on) return;
    this.on = true;
    this.build();
    $('menu').classList.add('m-on');
    applyI18n();
    requestAnimationFrame(() => this.measure());
  },

  unmount() {
    if (!this.on) return;
    this.on = false;
    $('menu').classList.remove('m-on');
    // put every node back where it was, newest first so siblings land in order
    for (let i = this.moved.length - 1; i >= 0; i--) {
      const m = this.moved[i];
      m.parent.insertBefore(m.el, m.next);
    }
    this.moved = [];
    this.show.remove();
    this.sheet.remove();
    this.show = this.sheet = this.tabs = this.panes = null;
    this.gap = this.gapX = 0;
  },

  sync() {
    if (IS_PHONE()) this.mount(); else this.unmount();
  },
};
NARROW.addEventListener('change', () => mGarage.sync());
addEventListener('resize', () => mGarage.measure());

function buildSegments() {
  segment('segLaps', [[1, '1'], [3, '3'], [5, '5']], 'laps');
  segment('segDiff', [[0, tr_('rookie')], [1, tr_('pro')], [2, tr_('legend')]], 'diff');
  segment('segQ', [['low', tr_('low')], ['high', tr_('high')], ['ultra', tr_('ultra')]], 'quality', () => { if (S.mode === 'menu') buildComposer(show.scene, show.camera, { strength: .16, radius: .35, threshold: .96 }); });
  segment('segMusic', [['synth', tr_('synth')], ['kuthu', tr_('kuthu')], ['off', tr_('off')]], 'music', () => { AU.init(); AU.stopMusic(); AU.startMusic(); });
  segment('segLang', [['en', 'English'], ['ta', 'தமிழ்']], 'lang', () => setLang(S.lang));
  segment('segVoice', [[true, tr_('on')], [false, tr_('off')]], 'voice', v => { applyI18n(); if (v) VOICE.say('go', null, { interrupt: true }); else VOICE.stop(); });
  segment('pLang', [['en', 'English'], ['ta', 'தமிழ்']], 'lang', () => setLang(S.lang));
  segment('pMusic', [['synth', tr_('synth')], ['kuthu', tr_('kuthu')], ['off', tr_('off')]], 'music', () => { AU.init(); AU.stopMusic(); AU.startMusic(); });
  if (!IS_TOUCH) return;
  /* Touch-only rows. Tilt is asked for here rather than at startup because iOS
     grants device orientation from a user gesture and nowhere else - this tap is
     that gesture. A refusal falls straight back to the pads so the player is
     never left with a steering mode that cannot steer. */
  segment('segSteer', [['pads', tr_('steerPads')], ['slider', tr_('steerSlider')], ['tilt', tr_('steerTilt')]], 'steerMode', async mode => {
    if (mode === 'tilt' && !await tiltEnable()) {
      S.steerMode = 'pads'; store.set('steerMode', 'pads');
      buildSegments(); showSteerNote('tiltNo');
    } else showSteerNote(mode === 'tilt' ? 'tiltOk' : null);
    applySteerMode();
  });
  segment('segSens', [[.75, tr_('low')], [1, tr_('normal')], [1.3, tr_('high')]], 'steerSens');
}
/* One line under the steering rows: what tilt is doing, or why it is not. */
function showSteerNote(key) {
  const n = $('steerNote');
  n.hidden = !key;
  n.textContent = key ? tr_(key) : '';
}
function setLang(l) {
  S.lang = l; store.set('lang', l); applyI18n(); buildSegments(); refreshMenu();
  if (S.mode === 'race' && game.paused) togglePause(true);
  if (S.mode === 'race' && game.lastBoard !== undefined) game.lastBoard = 0;
  VOICE.say(S.mode === 'menu' ? 'welcome' : 'back', STAGES[S.stage].name, { interrupt: true });
}
document.querySelectorAll('.langpill button').forEach(b => b.onclick = () => setLang(b.dataset.lang));
/* The touch-only rows in Settings - steering mode, sensitivity, and the shortcut
   into the layout editor - only exist where there is a thumb to use them. */
document.querySelectorAll('.touchonly').forEach(el => el.hidden = !IS_TOUCH);
$('btnPads2').onclick = () => { $('settings').hidden = true; padOpen(); };
applyI18n(); buildSegments(); applySteerMode(); tiltRearm(); mGarage.sync();
document.addEventListener('pointerdown', () => { AU.init(); if (S.mode === 'menu') AU.startMusic(); }, { once: true });

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
async function startRace(net) {
  if (S.mode === 'loading') return;
  if (net && !net.grid) net = null;
  $('results').hidden = true; clearTimeout(game.resT);
  AU.init(); AU.startMusic();
  S.mode = 'loading'; $('loading').hidden = false; $('results').hidden = true; $('pause').hidden = true;
  $('ldT').textContent = STAGES[S.stage].name; $('ldS').textContent = S.lang === 'ta' ? STAGE_TA[STAGES[S.stage].key] : STAGES[S.stage].sub;
  const tips = L().tips; $('ldTip').innerHTML = '<b>' + tr_('tipLabel') + '</b>' + tips[Math.floor(Math.random() * tips.length)];
  showTrackCard(STAGES[S.stage]);
  const t0 = performance.now();
  const progress = async (p, k) => { $('ldBar').style.width = p + '%'; $('ldStep').textContent = tr_(k); await nextFrame(); await nextFrame(); };
  await progress(6, 'stEngine'); await new Promise(r => setTimeout(r, 120));
  try { await buildRace(progress, net); await progress(90, 'stShaders'); renderer.compile(game.scene, game.camera); await progress(100, 'stReady');
    const wait = 2200 - (performance.now() - t0); if (wait > 0) await new Promise(r => setTimeout(r, wait)); } catch (e) { console.error(e); showError('Could not build the circuit: ' + e.message); enterMenu(); $('loading').hidden = true; return; }
  $('menu').hidden = true; $('hud').hidden = false; $('touch').hidden = !IS_TOUCH; $('loading').hidden = true;
  if (IS_TOUCH) { requestAnimationFrame(padRefresh); steerRecenter(); }  // rects only exist once the rig is on screen
  $('hPosN').textContent = game.cars.length; game.lastBoard = 0;
  S.mode = 'race'; canvas.style.cursor = ''; document.body.classList.add('racing'); VOICE.preload(); $('netbadge').hidden = !net;
  if (net) { game.phase = 'waiting'; NET.built = net.id; NET.markLoaded(net.id); $('netbadge').textContent = tr_('onlineRoom', NET.code.slice(0, 3) + ' ' + NET.code.slice(3)); }
  else { game.phase = 'countdown'; game.countdown = 4.2; showMsg(STAGES[S.stage].name, 1.4, 'small'); VOICE.say('welcome', STAGES[S.stage].name, { interrupt: true }); }
  game.ann = { pos: 99, posT: 0, driftT: 0, nitroFull: false, gear: 1, boosting: false };
}
function goFullscreen() {
  if (!IS_TOUCH) return; const el = document.documentElement;
  try { if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }).catch(() => { }); } catch (e) { }
}
$('btnStart').onclick = () => { goFullscreen(); startRace(); };
$('btnPads').hidden = !IS_TOUCH;
$('btnPads').onclick = padOpen;
$('btnFull').hidden = !document.fullscreenEnabled;
$('btnFull').onclick = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => { }); } catch (e) { } };
$('btnPause').onclick = () => togglePause();
$('btnResume').onclick = () => togglePause(false);
$('btnRestart').onclick = () => { $('pause').hidden = true; startRace(); };
$('btnQuit').onclick = () => { if (game.online) NET.backToLobby(); else enterMenu(); }; $('btnGarage').onclick = () => { if (game.online) NET.backToLobby(); else enterMenu(); };
$('btnAgain').onclick = () => startRace();
$('btnLobby').onclick = () => NET.backToLobby();
$('btnNextStage').onclick = () => { S.stage = (S.stage + 1) % STAGES.length; store.set('stage', S.stage); startRace(); };
$('btnOnline').onclick = () => openOnline();
function showError(msg) { const e = $('err'); e.textContent = msg; e.hidden = false; setTimeout(() => e.hidden = true, 8000); }


/* ================= SPLASH + TRACK CARD ================= */
const splash = { ready: false, left: false };
const wait = ms => new Promise(r => setTimeout(r, ms));
function spStep(p, k) { $('spBar').style.width = p + '%'; $('spStep').textContent = tr_(k); }
async function bootSplash() {
  spStep(40, 'stEngine'); await wait(350); spStep(70, 'stGarage'); await wait(350); spStep(90, 'stTune'); await wait(400);
  spStep(100, 'stReady'); $('spGo').hidden = false; splash.ready = true;
}
function leaveSplash() {
  if (!splash.ready || splash.left) return; splash.left = true;
  AU.init(); AU.startMusic(); $('splash').classList.add('out'); setTimeout(() => { $('splash').hidden = true; }, 800);
  setTimeout(() => AU.revPreview(CARS[S.car]), 250);
  if (!S.name) setTimeout(openName, 900);
}
$('splash').addEventListener('pointerdown', e => { if (e.target.closest('.langpill')) return; leaveSplash(); });
function trackInfo(def) {
  const tr = buildTrack(def); let corners = 0, inC = false, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < tr.N; i++) { const k = Math.abs(tr.curv[i]); if (!inC && k > .011) { corners++; inC = true; } else if (inC && k < .006) inC = false; lo = Math.min(lo, tr.P[i].y); hi = Math.max(hi, tr.P[i].y); }
  let bridge = null;
  for (let i = 0; i < tr.N && !bridge; i += 4) for (let j = i + 60; j < tr.N; j += 4) { if (tr.N - (j - i) < 60) continue; const a = tr.P[i], b = tr.P[j]; if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 100 && Math.abs(a.y - b.y) > 5) { bridge = a; break; } }
  return { tr, corners, climb: hi - lo, bridge };
}
function showTrackCard(def) {
  const info = trackInfo(def), tr = info.tr;
  $('ldBg').className = 'ld-bg'; $('ldBg').style.backgroundImage = `url(${THUMBS[def.key]})`;
  const st = [[tr_('sLength'), (tr.L / 1000).toFixed(2), 'km'], [tr_('sCorners'), info.corners, ''], [tr_('sClimb'), Math.round(info.climb), 'm'], [tr_('sLaps'), S.laps, '']];
  $('ldStats').innerHTML = st.map(([k, v, u]) => `<div><dt>${k}</dt><dd>${v}${u ? `<small>${u}</small>` : ''}</dd></div>`).join('');
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of tr.P) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const sc = 340 / Math.max(maxX - minX, maxZ - minZ), ox = (400 - (maxX - minX) * sc) / 2, oz = (400 - (maxZ - minZ) * sc) / 2;
  const M = (x, z) => [(ox + (x - minX) * sc).toFixed(1), (400 - (oz + (z - minZ) * sc)).toFixed(1)];
  let d = ''; for (let i = 0; i < tr.N; i += 3) { const [x, y] = M(tr.P[i].x, tr.P[i].z); d += (i ? 'L' : 'M') + x + ' ' + y; } d += 'Z';
  const [sx, sy] = M(tr.P[0].x, tr.P[0].z);
  let extra = `<rect class="start" x="${sx - 7}" y="${sy - 7}" width="14" height="14" rx="2"/>`;
  if (info.bridge) { const [bx, by] = M(info.bridge.x, info.bridge.z); extra += `<circle class="bridge" cx="${bx}" cy="${by}" r="7"/><text x="${+bx + 14}" y="${+by + 5}" fill="#35e0ff" font-size="14" font-family="Chakra Petch, Arial" font-weight="700">${tr_('sBridge')}</text>`; }
  if (tr.branch) { let bd = ''; tr.branch.P.forEach((p, i) => { if (i % 3 && i !== tr.branch.N - 1) return; const [x, y] = M(p.x, p.z); bd += (bd ? 'L' : 'M') + x + ' ' + y; }); const mid = tr.branch.P[tr.branch.N >> 1]; const [mx, my] = M(mid.x, mid.z); extra += `<path d="${bd}" fill="none" stroke="#ffb020" stroke-width="4" stroke-dasharray="8 7"/><text x="${+mx + 10}" y="${+my}" fill="#ffb020" font-size="14" font-family="Chakra Petch, Arial" font-weight="700">${tr_('shortcut')}</text>`; }
  $('ldMap').innerHTML = `<path class="trk-shadow" d="${d}"/><path class="trk-glow" d="${d}"/><path class="trk" d="${d}"/>${extra}`;
  const path = $('ldMap').querySelector('.trk'); try { path.style.setProperty('--len', path.getTotalLength()); } catch (e) { }
}

/* ================= NAME + SMOOTHNESS ================= */
function openName() { $('nameIn').value = S.name || ''; $('namebox').hidden = false; setTimeout(() => $('nameIn').focus(), 50); }
function saveName() { const n = cleanName($('nameIn').value); S.name = n; store.set('name', n); $('namebox').hidden = true; refreshMenu(); if (NET.r) NET.r.presence({ name: n || 'Racer' }).catch(() => { }); }
$('btnName').onclick = openName; $('btnNameSave').onclick = saveName;
$('namebox').addEventListener('pointerdown', ev => { if (ev.target.id === 'namebox') $('namebox').hidden = true; });
const perf = { acc: 0, n: 0, t: 0 }; window.__perfScale = 1;
function adaptRes(raw) {
  if (S.mode !== 'race' || !composer || raw > .5) { perf.acc = perf.n = perf.t = 0; return; }
  perf.acc += raw; perf.n++; perf.t += raw; if (perf.t < 2.5) return;
  const avg = perf.acc / perf.n; perf.acc = perf.n = perf.t = 0; let s = window.__perfScale;
  if (avg > 1 / 45 && s > .6) s = Math.max(.6, s - .12); else if (avg < 1 / 58 && s < 1) s = Math.min(1, s + .06); else return;
  window.__perfScale = s; const pr = Math.min(window.devicePixelRatio || 1, QUALITY[S.quality].pr) * s;
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
}

/* ================= LOOP ================= */
buildShowroom(); setShowCar(); enterMenu(); bootSplash();
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; const dt = Math.min(raw, 1 / 20); last = now;
  adaptRes(raw); if (NET.r) NET.tick();
  try {
    if (S.mode === 'menu' || S.mode === 'loading') { if (!game.scene) updateShowroom(dt); }
    else if (S.mode === 'race') updateRace(dt);
    if (composer) composer.render(dt);
  } catch (e) { console.error(e); showError(e.message); }
}
requestAnimationFrame(frame);
window.__vr = { game, S, startRace, setCar, sim(sec) { for (let i = 0; i < sec * 60; i++) updateRace(1 / 60); } };
