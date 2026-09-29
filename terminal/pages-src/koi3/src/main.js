// Koi pond v3 — photographic garden pond. Opens looking straight down at the water like a table top,
// then tilts up to an eye-level view across the pond to the bridge and the garden beyond.
// three.js (MIT). Photo assets: Poly Haven (CC0). Koi body outline tables: koi-pond-garden (MIT). See koi-LICENSES.md.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Vector3, Vector2, Vector4, Color, Euler, Matrix4, Quaternion,
  ACESFilmicToneMapping, SRGBColorSpace, PCFSoftShadowMap, EquirectangularReflectionMapping, RepeatWrapping,
  LinearMipmapLinearFilter, LinearFilter, TextureLoader, PMREMGenerator, DataTexture, RGBAFormat, UnsignedByteType,
  DirectionalLight, HemisphereLight, Mesh, Group, InstancedMesh, Object3D, BufferGeometry, BufferAttribute,
  PlaneGeometry, BoxGeometry, CylinderGeometry, SphereGeometry, LatheGeometry, IcosahedronGeometry, CircleGeometry,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshDepthMaterial, MeshBasicMaterial, ShaderMaterial, RGBADepthPacking,
  DoubleSide, CanvasTexture, WebGLRenderTarget, HalfFloatType, OrthographicCamera, MathUtils, Shape, ShapeGeometry, Plane,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  UW_PARS_FRAG, UW_CAUSTICS, UW_ABSORB, UW_VERT_PARS, UW_VERT, KOI_BEND_PARS, KOI_BEND,
  WATER_PARS, WATER_NORMAL, WATER_REFL, WATER_VERT_PARS, WATER_VERT, POST_VS, PAINT_FS,
} from './shaders.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const DEG = Math.PI / 180;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let rng = mulberry32(20260929);
const rand = (a = 1, b) => (b === undefined ? rng() * a : a + rng() * (b - a));
function hash2(x, y) { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, fu = u * u * (3 - 2 * u), fv = v * v * (3 - 2 * v); return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), fu), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), fu), fv) * 2 - 1; }
function fbm(x, y, o = 4) { let a = 0.5, f = 1, s = 0, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 17.1, y * f + i * 9.3); n += a; a *= 0.5; f *= 2.03; } return s / n; }

const params = new URLSearchParams(location.search);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ASSET = './koi3/';

// ---------------------------------------------------------------------------
// Pond shape: an organic ellipse. d < ~0.93 is open water.
// ---------------------------------------------------------------------------
const RX = 5.6, RZ = 4.0, WATER_Y = 0;
function pondD(x, z) {
  const a = Math.atan2(z / RZ, x / RX);
  const wob = 1 + 0.07 * Math.sin(3 * a + 1.1) + 0.045 * Math.sin(5 * a + 2.3) + 0.03 * Math.sin(8 * a + 0.4);
  return Math.hypot(x / RX, z / RZ) / wob;
}
function heightAt(x, z) {
  const d = pondD(x, z);
  let h = lerp(0.3, -0.95, smooth(1.07, 0.42, d));
  h += 0.035 * fbm(x * 0.9, z * 0.9, 3) * (d < 1 ? 1 : 0.4);
  if (d > 1.05) {
    const r = Math.hypot(x, z);
    h += 0.09 * fbm(x * 0.25, z * 0.25, 3) + 0.9 * smooth(10, 26, r) * (0.5 + 0.5 * fbm(x * 0.07 + 4, z * 0.07, 3));
    // a low mound behind the bridge so the far bank rises a little
    h += 0.35 * Math.exp(-((x * x) / 40 + ((z + 7.5) * (z + 7.5)) / 6));
  }
  return h;
}
const BRIDGE_Z = -3.0;

// ---------------------------------------------------------------------------
// Public API shells (filled once the scene exists)
// ---------------------------------------------------------------------------
const koi = { version: '3.0.0', three: '0.170.0', webgl: false, fps: 0, quality: 'auto', tier: 'high', calm: false, fishCount: 0, look: 'photo',
  disturb() {}, ripple() {}, setQuality() {}, setCalm() {}, stats() { return { fps: koi.fps, quality: koi.quality, tier: koi.tier, fish: koi.fishCount, look: koi.look }; } };
const pond = { addPad() {}, removePad() {}, updatePad() {}, addPath() {}, removePath() {}, setCamera() {}, getCamera() { return {}; }, setView() {}, setTimeOfDay() {}, list() { return { pads: [], paths: [] }; }, applyJSON() {} };
window.koi = koi; window.pond = pond;

// ---------------------------------------------------------------------------
// i18n (English / Spanish)
// ---------------------------------------------------------------------------
const STR = {
  en: { top: 'Top-down', fwd: 'Forward', light: 'light', quality: 'quality', calm: 'calm', on: 'on', off: 'off', dev: 'dev', licenses: 'licenses', loading: 'Filling the pond…', placeholder: 'type something into the pond…', hint: 'drag, scroll or ↑ ↓ to tilt · ← → to turn · tap the water', notWired: 'Not wired yet', settings: 'settings', dawn: 'dawn', day: 'day', dusk: 'dusk', night: 'night', auto: 'auto', high: 'high', low: 'low', today: 'Today', pinned: 'Pinned', inbox: 'Inbox' },
  es: { top: 'Desde arriba', fwd: 'Al frente', light: 'luz', quality: 'calidad', calm: 'calma', on: 'sí', off: 'no', dev: 'dev', licenses: 'licencias', loading: 'Llenando el estanque…', placeholder: 'escribe algo en el estanque…', hint: 'arrastra, desplaza o ↑ ↓ para inclinar · ← → para girar · toca el agua', notWired: 'Aún no conectado', settings: 'ajustes', dawn: 'alba', day: 'día', dusk: 'ocaso', night: 'noche', auto: 'auto', high: 'alta', low: 'baja', today: 'Hoy', pinned: 'Fijados', inbox: 'Bandeja' },
};
let lang = (() => { try { return localStorage.getItem('koi.lang') || (navigator.language || 'en').slice(0, 2); } catch { return 'en'; } })();
if (!STR[lang]) lang = 'en';
const t = (k) => STR[lang][k] ?? STR.en[k] ?? k;

function toast(msg) {
  const el = $('#toast'); if (!el) return;
  el.textContent = msg; el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------------------------------------------------------------------------
// Koi body (outline tables from koi-pond-garden, MIT)
// ---------------------------------------------------------------------------
const KOI_TOP = [[0, 0.006], [0.015, 0.025], [0.05, 0.053], [0.1, 0.076], [0.17, 0.095], [0.26, 0.117], [0.36, 0.126], [0.48, 0.117], [0.62, 0.091], [0.76, 0.062], [0.9, 0.039], [1.0, 0.032]];
const KOI_BOT = [[0, -0.006], [0.015, -0.021], [0.05, -0.043], [0.1, -0.058], [0.17, -0.07], [0.28, -0.087], [0.42, -0.093], [0.56, -0.083], [0.7, -0.061], [0.84, -0.039], [1.0, -0.028]];
const KOI_W = [[0, 0.007], [0.015, 0.03], [0.05, 0.06], [0.1, 0.077], [0.17, 0.087], [0.27, 0.098], [0.37, 0.1], [0.5, 0.087], [0.64, 0.063], [0.78, 0.038], [0.91, 0.021], [1.0, 0.013]];
function tab(tb, s) {
  s = clamp(s, 0, 1);
  for (let i = 0; i < tb.length - 1; i++) {
    const [s0, v0] = tb[i], [s1, v1] = tb[i + 1];
    if (s <= s1) { const u = (s - s0) / (s1 - s0), p = tb[Math.max(0, i - 1)][1], n = tb[Math.min(tb.length - 1, i + 2)][1]; const u2 = u * u, u3 = u2 * u; return 0.5 * (2 * v0 + (-p + v1) * u + (2 * p - 5 * v0 + 4 * v1 - n) * u2 + (-p + 3 * v0 - 3 * v1 + n) * u3); }
  }
  return tb[tb.length - 1][1];
}
const BODY_FRAC = 0.8;
function koiBodyGeo(L) {
  const RINGS = 34, SEG = 20, pos = [], uv = [], idx = [];
  for (let i = 0; i <= RINGS; i++) {
    const s = Math.pow(i / RINGS, 1.15);
    const x = L * 0.5 - s * L * BODY_FRAC;
    const top = tab(KOI_TOP, s) * L, bot = tab(KOI_BOT, s) * L, w = tab(KOI_W, s) * L * 1.12;
    const cy = (top + bot) / 2, ry = (top - bot) / 2;
    for (let j = 0; j <= SEG; j++) {
      const a = (j / SEG) * Math.PI * 2; // 0 = belly, PI = back
      const c = -Math.cos(a), sn = Math.sin(a);
      const flat = c > 0 ? 1 : 0.92; // slightly flatter belly
      pos.push(x, cy + ry * c * flat, w * sn * (1 - 0.08 * c));
      uv.push(s, j / SEG);
    }
  }
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + SEG + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// A fin is a fan: a root edge and a tip curve, built as a small triangle strip with uv (u root->tip, v across)
function finFan(root0, root1, tip, bulge, n = 10) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const v = i / n;
    const r = new Vector3().lerpVectors(root0, root1, v);
    const tp = new Vector3().lerpVectors(tip[0], tip[1], v);
    const mid = Math.sin(v * Math.PI) * bulge;
    const dir = tp.clone().sub(r); const len = dir.length(); dir.normalize();
    const e = tp.clone().addScaledVector(dir, mid * len);
    pos.push(r.x, r.y, r.z, e.x, e.y, e.z); uv.push(0, v, 1, v);
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function koiFinsGeo(L) {
  const V = (x, y, z) => new Vector3(x * L, y * L, z * L);
  const xs = (s) => 0.5 - s * BODY_FRAC;
  const parts = [];
  // caudal: two lobes in a shallow V so the tail reads from above and from the side
  const tx = xs(0.97);
  parts.push(finFan(V(tx, 0.02, 0), V(tx, 0.0, 0), [V(tx - 0.2, 0.1, 0.1), V(tx - 0.13, 0.0, 0.01)], 0.12));
  parts.push(finFan(V(tx, 0.0, 0), V(tx, -0.02, 0), [V(tx - 0.13, 0.0, -0.01), V(tx - 0.2, 0.1, -0.1)], 0.12));
  // dorsal ridge
  parts.push(finFan(V(xs(0.36), 0.12, 0), V(xs(0.74), 0.06, 0), [V(xs(0.44), 0.19, 0), V(xs(0.82), 0.07, 0)], 0.05, 8));
  // pelvic pair
  parts.push(finFan(V(xs(0.5), -0.07, 0.04), V(xs(0.56), -0.065, 0.035), [V(xs(0.56), -0.08, 0.11), V(xs(0.66), -0.07, 0.08)], 0.1, 6));
  parts.push(finFan(V(xs(0.56), -0.065, -0.035), V(xs(0.5), -0.07, -0.04), [V(xs(0.66), -0.07, -0.08), V(xs(0.56), -0.08, -0.11)], 0.1, 6));
  return mergeGeometries(parts);
}
function koiPectoralGeo(L, side) {
  const V = (x, y, z) => new Vector3(x * L, y * L, z * L * side);
  return finFan(V(0, 0, 0), V(-0.05, 0.005, 0), [V(-0.1, -0.02, 0.17), V(-0.2, -0.02, 0.1)], 0.18, 8);
}

// Koi varieties painted into a small canvas (u along body, v around; v = 0.5 is the back)
const VARIETIES = {
  kohaku: { base: '#f4efe6', patches: [['#d8321c', 0.34]], metal: 0 },
  sanke: { base: '#f5f0e8', patches: [['#d33a1f', 0.5], ['#141414', 0.12]], metal: 0 },
  showa: { base: '#1a1614', patches: [['#d63e1f', 0.42], ['#f2ede4', 0.3]], metal: 0 },
  tancho: { base: '#f6f2ea', patches: [], crown: '#d62d1a', metal: 0 },
  yamabuki: { base: '#e9b534', patches: [['#f3c64a', 0.3]], metal: 0.55 },
  platinum: { base: '#e6e4de', patches: [], metal: 0.6 },
  chagoi: { base: '#8a6a45', patches: [['#6f5436', 0.3]], metal: 0.2 },
  asagi: { base: '#8ea3ad', patches: [['#d8652f', 0.22]], metal: 0, belly: '#d8652f' },
  ochiba: { base: '#9aa4a6', patches: [['#b4833f', 0.4]], metal: 0.1 },
  kujaku: { base: '#dcdad2', patches: [['#e0752c', 0.45], ['#2f3a3c', 0.1]], metal: 0.45 },
};
const ROSTER = ['kohaku', 'sanke', 'showa', 'kohaku', 'tancho', 'yamabuki', 'platinum', 'sanke', 'chagoi', 'asagi', 'kohaku', 'kujaku', 'ochiba', 'showa'];
function paintKoi(name, seed) {
  const vr = VARIETIES[name]; const r = mulberry32(seed);
  const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = vr.base; g.fillRect(0, 0, W, H);
  if (vr.belly) { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, vr.belly); gr.addColorStop(0.22, vr.base); gr.addColorStop(0.78, vr.base); gr.addColorStop(1, vr.belly); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  // pale belly for everyone
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, 'rgba(250,246,238,0.55)'); bg.addColorStop(0.2, 'rgba(250,246,238,0)'); bg.addColorStop(0.8, 'rgba(250,246,238,0)'); bg.addColorStop(1, 'rgba(250,246,238,0.55)');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // patches: noisy blobs mostly on the back half (v 0.2..0.8), wrapping across the dorsal line
  for (const [col, cover] of vr.patches) {
    const n = Math.round(2 + cover * 7);
    for (let i = 0; i < n; i++) {
      const cx = (0.08 + ((i + 0.2 + r() * 0.6) / n) * 0.74) * W, cy = (0.5 + (r() - 0.5) * 0.16) * H, rx = (0.035 + r() * 0.07 * (cover + 0.5)) * W, ry = (0.1 + r() * 0.16 * (cover + 0.4)) * H;
      g.fillStyle = col; g.beginPath();
      for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI * 2; const w = 1 + 0.22 * Math.sin(a * 3 + i) + 0.12 * Math.sin(a * 7 + i * 2); const x = cx + Math.cos(a) * rx * w, y = cy + Math.sin(a) * ry * w; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.fill();
    }
  }
  if (vr.crown) { g.fillStyle = vr.crown; g.beginPath(); g.ellipse(0.1 * W, 0.5 * H, 0.05 * W, 0.16 * H, 0, 0, Math.PI * 2); g.fill(); }
  // scale net (subtle), stronger on metallic/asagi
  g.globalAlpha = vr.metal > 0 || name === 'asagi' ? 0.22 : 0.08; g.strokeStyle = name === 'asagi' ? '#2c3a44' : '#6b5a48'; g.lineWidth = 1;
  for (let y = 0; y < H + 8; y += 7) for (let x = 0.2 * W; x < 0.96 * W; x += 8) { g.beginPath(); g.arc(x + ((y / 7) % 2) * 4, y, 4.2, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  g.globalAlpha = 1;
  // head is scaleless and slightly lighter; eyes
  const hg = g.createLinearGradient(0, 0, 0.18 * W, 0); hg.addColorStop(0, 'rgba(255,250,240,0.25)'); hg.addColorStop(1, 'rgba(255,250,240,0)'); g.fillStyle = hg; g.fillRect(0, 0, 0.18 * W, H);
  g.fillStyle = '#0c0b0a';
  for (const v of [0.32, 0.68]) { g.beginPath(); g.ellipse(0.055 * W, v * H, 2.6, 3.2, 0, 0, Math.PI * 2); g.fill(); }
  // back shading: darker along the dorsal line so the fish has form from above
  const sg = g.createLinearGradient(0, 0, 0, H); sg.addColorStop(0.35, 'rgba(0,0,0,0)'); sg.addColorStop(0.5, 'rgba(40,20,10,0.10)'); sg.addColorStop(0.65, 'rgba(0,0,0,0)');
  g.fillStyle = sg; g.fillRect(0, 0, W, H);
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
function paintFin(name) {
  const vr = VARIETIES[name];
  const W = 128, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const tint = name === 'showa' ? '#2a2420' : name === 'yamabuki' ? '#f0c85a' : name === 'chagoi' ? '#9a7a55' : name === 'asagi' ? '#e07a45' : '#f2ece2';
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, tint); gr.addColorStop(1, 'rgba(255,255,255,0.35)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(80,60,40,0.35)'; g.lineWidth = 1;
  for (let y = 2; y < H; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (y - H / 2) * 0.1); g.stroke(); }
  if (vr.patches[0] && name !== 'showa') { g.fillStyle = vr.patches[0][0]; g.globalAlpha = 0.25; g.fillRect(0, 0, W * 0.3, H); g.globalAlpha = 1; }
  // alpha: opaque at the root, fading to the tip
  const id = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const u = x / W; const a = (1 - u * 0.72) * (0.7 + 0.3 * Math.sin((y / H) * Math.PI)); id.data[(y * W + x) * 4 + 3] = Math.round(clamp(a, 0, 1) * 255); }
  g.putImageData(id, 0, 0);
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Lily pad texture: veins, colour drift, darker rim, a few blemishes
function paintPad(seed, victoria) {
  const r = mulberry32(seed), S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const base = victoria ? ['#3f6b2a', '#4e7d33', '#335a22'] : ['#3b6a2c', '#4a7a34', '#2f5a24'];
  const gr = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
  gr.addColorStop(0, base[1]); gr.addColorStop(0.7, base[0]); gr.addColorStop(1, base[2]);
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '20,40,10' : '120,150,60'},${0.03 + r() * 0.05})`; const x = r() * S, y = r() * S, rr = 4 + r() * 22; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }
  g.strokeStyle = victoria ? 'rgba(170,200,110,0.55)' : 'rgba(160,190,100,0.4)'; g.lineCap = 'round';
  const nv = victoria ? 22 : 16;
  for (let i = 0; i < nv; i++) {
    const a = (i / nv) * Math.PI * 2 + r() * 0.05; g.lineWidth = victoria ? 3.2 : 2;
    g.beginPath(); g.moveTo(S / 2, S / 2);
    let x = S / 2, y = S / 2;
    for (let k = 1; k <= 12; k++) { const rr = (k / 12) * S * 0.49; const aa = a + Math.sin(k * 0.8 + i) * 0.03; x = S / 2 + Math.cos(aa) * rr; y = S / 2 + Math.sin(aa) * rr; g.lineTo(x, y); }
    g.stroke();
    if (victoria) { g.lineWidth = 1.2; g.strokeStyle = 'rgba(150,180,90,0.35)'; for (let k = 3; k < 12; k += 2) { const rr = (k / 12) * S * 0.49; g.beginPath(); g.arc(S / 2, S / 2, rr, a, a + (Math.PI * 2) / nv); g.stroke(); } g.strokeStyle = 'rgba(170,200,110,0.55)'; }
  }
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(120,90,40,${0.15 + r() * 0.2})`; g.beginPath(); g.arc(S / 2 + (r() - 0.5) * S * 0.8, S / 2 + (r() - 0.5) * S * 0.8, 3 + r() * 10, 0, 7); g.fill(); }
  const rim = g.createRadialGradient(S / 2, S / 2, S * 0.42, S / 2, S / 2, S * 0.5);
  rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, victoria ? 'rgba(120,50,30,0.35)' : 'rgba(90,70,20,0.3)');
  g.fillStyle = rim; g.fillRect(0, 0, S, S);
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// Tileable slope texture for water micro-waves
function makeSlopeTexture() {
  const N = 256, h = new Float32Array(N * N);
  const per = (x, y, p) => { const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, fu = u * u * (3 - 2 * u), fv = v * v * (3 - 2 * v); const H = (a, b) => hash2(((a % p) + p) % p, ((b % p) + p) % p); return lerp(lerp(H(xi, yi), H(xi + 1, yi), fu), lerp(H(xi, yi + 1), H(xi + 1, yi + 1), fu), fv); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, a = 1, f = 6, n = 0;
    for (let o = 0; o < 5; o++) { s += a * per((x / N) * f, (y / N) * f, f); n += a; a *= 0.5; f *= 2; }
    h[y * N + x] = s / n;
  }
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)], hy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    const i = (y * N + x) * 4; d[i] = clamp(128 + hx * 900, 0, 255); d[i + 1] = clamp(128 + hy * 900, 0, 255); d[i + 2] = 255; d[i + 3] = 255;
  }
  const tex = new DataTexture(d, N, N, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping; tex.magFilter = LinearFilter; tex.minFilter = LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}

// Visible pond span (metres, vertical on screen) in the top-down view: cover the pond on landscape, ~4.3 m across on portrait.
function topSpan() { const aspect = innerWidth / innerHeight; return aspect >= 1 ? 6.6 : Math.max(6.6, 4.3 / aspect); }
// glTF meshes arrive quantized (int16 positions + a dequantizing node transform); bake to float in world space.
function bakeGeo(mesh) {
  mesh.updateWorldMatrix(true, false);
  const src = mesh.geometry, g = new BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.attributes[name], n = a.count, k = a.itemSize, arr = new Float32Array(n * k);
    for (let i = 0; i < n; i++) { arr[i * k] = a.getX(i); if (k > 1) arr[i * k + 1] = a.getY(i); if (k > 2) arr[i * k + 2] = a.getZ(i); if (k > 3) arr[i * k + 3] = a.getW(i); }
    g.setAttribute(name, new BufferAttribute(arr, k));
  }
  if (src.index) g.setIndex(Array.from(src.index.array));
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}

// ---------------------------------------------------------------------------
// Main scene
// ---------------------------------------------------------------------------
async function start() {
  const canvas = $('#pond');
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
  } catch (err) { document.body.classList.add('nogl'); $('#loading')?.remove(); console.warn('WebGL unavailable', err); return; }
  koi.webgl = true;
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  let quality = params.get('q') || (() => { try { return localStorage.getItem('koi.q') || 'auto'; } catch { return 'auto'; } })();
  let tier = quality === 'auto' ? (mobile ? 'low' : 'high') : quality;
  koi.quality = quality; koi.tier = tier;
  const look = params.get('look') === 'painted' ? 'painted' : 'photo'; koi.look = look;

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  const setDPR = () => renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier === 'high' ? 2 : 1.25));
  setDPR();

  const scene = new Scene();
  const camera = new PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 600);

  // --- loaders
  const texLoader = new TextureLoader();
  const loadTex = (name, srgb, repeat = true) => new Promise((res) => texLoader.load(ASSET + name, (tx) => { if (srgb) tx.colorSpace = SRGBColorSpace; if (repeat) tx.wrapS = tx.wrapT = RepeatWrapping; tx.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(tx); }, undefined, () => res(null)));
  const gltf = new GLTFLoader();
  const loadGLB = (name) => new Promise((res) => gltf.load(ASSET + name, (g) => res(g), undefined, () => res(null)));
  const low = tier === 'low';
  const [envTex, bedD, bedN, grassD, grassN, woodD, woodN, stoneD, stoneN, rocksG, shrubG, fernG] = await Promise.all([
    loadTex(low ? 'env_low.webp' : 'env.webp', true, false), loadTex('bed_diff.webp', true), low ? null : loadTex('bed_nor.webp', false), loadTex('grass_diff.webp', true), low ? null : loadTex('grass_nor.webp', false),
    loadTex('wood_diff.webp', true), loadTex('wood_nor.webp', false), loadTex('stone_diff.webp', true), loadTex('stone_nor.webp', false),
    loadGLB('rocks.glb'), loadGLB('shrub.glb'), low ? null : loadGLB('fern.glb'),
  ]);

  // --- environment: a CC0 photographic panorama of a Chinese garden (Poly Haven "chinese_garden")
  const ENV_ROT = new Euler(0, params.has('envrot') ? Number(params.get('envrot')) : 1.65, 0);
  if (envTex) {
    envTex.mapping = EquirectangularReflectionMapping;
    scene.background = envTex;
    const pm = new PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(envTex).texture; pm.dispose();
    scene.backgroundRotation.copy(ENV_ROT); scene.environmentRotation.copy(ENV_ROT);
    scene.backgroundIntensity = 1.18; scene.environmentIntensity = 0.85;
  } else { scene.background = new Color('#8fb7d4'); }
  // average colour of the panorama just below the horizon: the far ground fades into it
  const horizon = new Color(0.16, 0.2, 0.12);
  if (envTex && envTex.image) { try { const c = document.createElement('canvas'); c.width = 64; c.height = 32; const g = c.getContext('2d'); g.drawImage(envTex.image, 0, 0, 64, 32); const d = g.getImageData(0, 16, 64, 2).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; horizon.setRGB(r / n / 255, gg / n / 255, b / n / 255, SRGBColorSpace); } catch {} }
  // sun matched to the panorama (u ~ 0.60, elevation ~ 31 degrees), rotated into world space
  const sunU = 0.6, sunEl = 31 * DEG; const sa = (sunU - 0.5) * Math.PI * 2;
  const sunPano = new Vector3(Math.cos(sunEl) * Math.cos(sa), Math.sin(sunEl), Math.cos(sunEl) * Math.sin(sa));
  const sunDir = sunPano.clone().applyMatrix4(new Matrix4().makeRotationFromEuler(ENV_ROT).invert()).normalize();

  const sun = new DirectionalLight(0xfff1dc, 2.6);
  sun.position.copy(sunDir).multiplyScalar(30); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  const sc = sun.shadow.camera; sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 5; sc.far = 60;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new HemisphereLight(0xcfe3ff, 0x3a4a2a, 0.25); scene.add(hemi);

  // --- shared underwater uniforms
  const U = {
    uTime: { value: 0 }, uWaterY: { value: WATER_Y }, uAbsorb: { value: new Vector3(1.25, 0.5, 0.95) }, uDeep: { value: new Color(0.014, 0.045, 0.026) },
    uCaus: { value: 1.0 }, uSunDir: { value: sunDir.clone() },
  };
  function underwater(mat, extra) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, extra?.uniforms || {});
      sh.vertexShader = (extra?.vpars || '') + UW_VERT_PARS + sh.vertexShader.replace('#include <project_vertex>', UW_VERT);
      if (extra?.vert) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', extra.vert);
      sh.fragmentShader = UW_PARS_FRAG + (extra?.fpars || '') + sh.fragmentShader.replace('#include <lights_fragment_end>', UW_CAUSTICS).replace('#include <opaque_fragment>', UW_ABSORB);
      if (extra?.frag) extra.frag(sh);
    };
    mat.customProgramCacheKey = () => 'uw' + (extra?.key || '');
    return mat;
  }

  // --- terrain: one radial mesh, pebble bed under water blending to moss/grass on the bank
  {
    const radii = []; for (let r = 0; r < 9.5; r += low ? 0.12 : 0.07) radii.push(r); for (let r = 9.5; r < 140; r *= low ? 1.12 : 1.07) radii.push(r);
    const SEG = low ? 160 : 360, pos = [], uv = [], idx = [];
    pos.push(0, heightAt(0, 0), 0); uv.push(0, 0);
    for (let i = 1; i < radii.length; i++) for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2, x = Math.cos(a) * radii[i], z = Math.sin(a) * radii[i];
      pos.push(x, heightAt(x, z), z); uv.push(x * 0.42, z * 0.42);
    }
    for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
    for (let i = 1; i < radii.length - 1; i++) for (let j = 0; j < SEG; j++) {
      const a = 1 + (i - 1) * SEG + j, b = 1 + (i - 1) * SEG + ((j + 1) % SEG), c = a + SEG, d = b + SEG;
      idx.push(a, b, c, b, d, c);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new MeshStandardMaterial({ map: bedD, normalMap: bedN || null, roughness: 0.92, metalness: 0 });
    if (bedN) mat.normalScale.set(1.1, 1.1);
    const extraU = { uGrass: { value: grassD }, uGrassN: { value: grassN || bedN }, uHorizon: { value: horizon.clone().multiplyScalar(1.1) } };
    underwater(mat, {
      key: 'terrain' + (bedN ? 'n' : ''), uniforms: extraU,
      fpars: 'uniform sampler2D uGrass; uniform sampler2D uGrassN; uniform vec3 uHorizon;\n',
      frag: (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
          float kH = vUwPos.y;
          float gN = 0.5 + 0.5 * sin(vUwPos.x * 1.7 + sin(vUwPos.z * 1.3) * 2.0) * sin(vUwPos.z * 1.1);
          float kG = smoothstep(0.05 + gN * 0.08, 0.2 + gN * 0.08, kH);
          vec3 bedC = texture2D(map, vMapUv).rgb;
          vec2 uvB = mat2(0.8, 0.6, -0.6, 0.8) * vMapUv * 0.43 + 0.37;
          float mB = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(vUwPos.x * 0.9 + 1.3 * sin(vUwPos.z * 0.7)) * sin(vUwPos.z * 0.8 - 0.6));
          bedC = mix(bedC, texture2D(map, uvB).rgb * vec3(0.92, 0.95, 0.9), mB);
          bedC *= 0.82 + 0.3 * smoothstep(-0.4, 0.6, sin(vUwPos.x * 0.45 + 2.0) * sin(vUwPos.z * 0.55 - 1.0));
          vec3 grassC = texture2D(uGrass, vMapUv * 0.55).rgb * vec3(0.9, 1.0, 0.82);
          vec3 kC = mix(bedC * vec3(0.95, 0.92, 0.86), grassC, kG);
          float wet = smoothstep(0.16, 0.0, kH) * (1.0 - smoothstep(-0.02, -0.25, kH));
          kC *= 1.0 - 0.35 * wet;
          diffuseColor.rgb *= kC;`);
        if (bedN) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `
          vec3 mapN = mix(texture2D(normalMap, vNormalMapUv).xyz, texture2D(uGrassN, vNormalMapUv * 0.55).xyz, kG) * 2.0 - 1.0;
          mapN.xy *= normalScale;
          normal = normalize(tbn * mapN);`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n { float fd = smoothstep(13.0, 42.0, length(vUwPos.xz - cameraPosition.xz)); gl_FragColor.rgb = mix(gl_FragColor.rgb, uHorizon, fd * 0.9); }');
        sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(mix(0.55, 0.95, kG), 0.35, wet);');
      },
    });
    const terrain = new Mesh(g, mat); terrain.receiveShadow = true; scene.add(terrain);
  }

  // --- water: physical transmission for refraction, env for reflection, procedural slopes + ripples
  const slopeTex = makeSlopeTexture();
  const ripples = Array.from({ length: 12 }, () => new Vector4(0, 0, -99, 0));
  let ripI = 0;
  function addRipple(x, z, amp = 0.5) { const r = ripples[ripI]; r.set(x, z, U.uTime.value, amp); ripI = (ripI + 1) % ripples.length; }
  const reflOn = tier === 'high' && !params.has('norefl');
  const reflRT = new WebGLRenderTarget(2, 2, { type: HalfFloatType });
  const reflMat4 = new Matrix4();
  const waterU = { uSlope: { value: slopeTex }, uRip: { value: ripples }, uChop: { value: 0.16 }, uRefl: { value: reflRT.texture }, uReflMat: { value: reflMat4 }, uReflOn: { value: reflOn ? 1 : 0 } };
  const waterMat = tier === 'high'
    ? new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.035, metalness: 0, transmission: 1, thickness: 0.35, ior: 1.333, specularIntensity: 1, envMapIntensity: 1.1 })
    : new MeshPhysicalMaterial({ color: 0x1d3a2c, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.26, ior: 1.333, envMapIntensity: 1.1 });
  waterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: U.uTime }, waterU);
    sh.vertexShader = WATER_VERT_PARS + sh.vertexShader.replace('#include <project_vertex>', WATER_VERT);
    sh.fragmentShader = WATER_PARS + sh.fragmentShader.replace('#include <normal_fragment_maps>', WATER_NORMAL).replace('#include <lights_fragment_maps>', WATER_REFL);
  };
  const water = new Mesh(new PlaneGeometry(2 * RX + 3, 2 * RZ + 3, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; waterMat.depthWrite = false; water.renderOrder = -1; scene.add(water);

  // planar reflection (technique of three.js Reflector, MIT): mirrored camera + oblique near plane
  const vcam = new PerspectiveCamera(); const rPlane = new Plane(); const clipPlane = new Vector4(); const qv = new Vector4();
  const _n = new Vector3(0, 1, 0), _mp = new Vector3(0, WATER_Y, 0), _view = new Vector3(), _look = new Vector3(), _tg = new Vector3(), _rot = new Matrix4();
  function renderReflection() {
    _view.subVectors(_mp, camera.position); if (_view.dot(_n) > 0) return;
    _view.reflect(_n).negate().add(_mp);
    _rot.extractRotation(camera.matrixWorld); _look.set(0, 0, -1).applyMatrix4(_rot).add(camera.position);
    _tg.subVectors(_mp, _look).reflect(_n).negate().add(_mp);
    vcam.position.copy(_view); vcam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n); vcam.lookAt(_tg);
    vcam.far = camera.far; vcam.updateMatrixWorld(); vcam.projectionMatrix.copy(camera.projectionMatrix);
    reflMat4.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1); reflMat4.multiply(vcam.projectionMatrix); reflMat4.multiply(vcam.matrixWorldInverse);
    rPlane.setFromNormalAndCoplanarPoint(_n, _mp); rPlane.applyMatrix4(vcam.matrixWorldInverse);
    clipPlane.set(rPlane.normal.x, rPlane.normal.y, rPlane.normal.z, rPlane.constant);
    const e = vcam.projectionMatrix.elements;
    qv.set((Math.sign(clipPlane.x) + e[8]) / e[0], (Math.sign(clipPlane.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clipPlane.multiplyScalar(2 / clipPlane.dot(qv));
    e[2] = clipPlane.x; e[6] = clipPlane.y; e[10] = clipPlane.z + 1 - 0.003; e[14] = clipPlane.w;
    water.visible = false; const bg = scene.background; scene.background = null;
    renderer.setRenderTarget(reflRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, vcam);
    renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); scene.background = bg; water.visible = true;
  }

  // --- rocks around the rim (Poly Haven rock_moss_set_01, CC0)
  const rockMeshes = [];
  if (rocksG) rocksG.scene.traverse((o) => { if (o.isMesh) rockMeshes.push(o); });
  const rockMat = rockMeshes[0] ? underwater(rockMeshes[0].material.clone(), { key: 'rock' }) : null;
  if (rockMat) { rockMat.roughness = 1; rockMat.envMapIntensity = 0.8; }
  const rim = new Group(); scene.add(rim);
  if (rockMeshes.length) {
    const byMesh = rockMeshes.map(() => []);
    const N = low ? 26 : 38;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rand(-0.05, 0.05);
      // find the shoreline along this angle
      let rr = 0.5; while (pondD(Math.cos(a) * rr, Math.sin(a) * rr) < 0.97 && rr < 10) rr += 0.02;
      const x = Math.cos(a) * (rr + rand(-0.15, 0.25)), z = Math.sin(a) * (rr + rand(-0.15, 0.25));
      if (Math.abs(z - BRIDGE_Z) < 1.1 && Math.abs(x) > 2.8) continue; // bridge landings
      if (z > 2.2 && Math.abs(x) < 3.0 && i % 3) continue; // keep the view from the south bank open
      if (z > 3 && Math.abs(x - 0.9) < 0.9) continue; // path landing
      const k = Math.floor(rand(rockMeshes.length));
      const s = rand(0.22, 0.42) * (i % 5 === 0 ? 1.5 : 1);
      byMesh[k].push({ x, z, s, ry: rand(Math.PI * 2), y: heightAt(x, z) - s * 0.15 });
    }
    rockMeshes.forEach((m, k) => {
      const list = byMesh[k]; if (!list.length) return;
      const g = bakeGeo(m); g.computeBoundingBox(); const bb = g.boundingBox; const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2; g.translate(-cx, -bb.min.y, -cz);
      const im = new InstancedMesh(g, rockMat, list.length); im.castShadow = true; im.receiveShadow = true;
      const o = new Object3D();
      list.forEach((r, i) => { o.position.set(r.x, r.y, r.z); o.rotation.set(rand(-0.1, 0.1), r.ry, rand(-0.1, 0.1)); o.scale.setScalar(r.s); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      rim.add(im);
    });
  }

  // --- planting: shrubs behind the rim and a far ring that meets the panorama's own trees
  if (shrubG) {
    const parts = []; shrubG.scene.traverse((o) => { if (o.isMesh) parts.push(o); });
    const geos = parts.map((p) => { const g = bakeGeo(p); g.computeBoundingBox(); const bb = g.boundingBox; g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); return g; });
    const lists = parts.map(() => []);
    const put = (x, z, s) => { if (pondD(x, z) < 1.18) return; if (z > 3.2 && Math.abs(x) < 4.2) return; if (Math.abs(z - BRIDGE_Z) < 1.2 && Math.abs(x) < 6.8 && Math.abs(x) > 3.4) return; lists[Math.floor(rand(parts.length))].push([x, z, s]); };
    // behind the rim, all round except the south bank where you stand
    for (let i = 0; i < (low ? 10 : 26); i++) { const a = rand(Math.PI * 2); let rr = 0.5; while (pondD(Math.cos(a) * rr, Math.sin(a) * rr) < 1.2 && rr < 12) rr += 0.05; put(Math.cos(a) * (rr + rand(0.2, 1.6)), Math.sin(a) * (rr + rand(0.2, 1.6)), rand(0.6, 1.1)); }
    // far bank: a loose hedge line that meets the trees of the panorama
    for (let i = 0; i < (params.has('hedge') ? 30 : 0); i++) { const a = rand(-Math.PI * 0.98, -Math.PI * 0.02) + (i % 4 === 0 ? rand(-0.5, 0.5) : 0); const r = rand(9.5, 15); put(Math.cos(a) * r * 1.15, Math.sin(a) * r * 0.85 - 1.5, rand(1.4, 2.4)); }
    parts.forEach((p, k) => {
      const list = lists[k]; if (!list.length) return;
      const mat = p.material; mat.alphaTest = 0.28; mat.side = DoubleSide;
      const im = new InstancedMesh(geos[k], mat, list.length); im.castShadow = !low; im.receiveShadow = true;
      const o = new Object3D();
      list.forEach(([x, z, sc], i) => { o.position.set(x, heightAt(x, z) - 0.06, z); o.rotation.set(0, hash2(i, k + 3) * 6.28, 0); o.scale.setScalar(sc); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      scene.add(im);
    });
  }
  if (fernG) {
    const parts = []; fernG.scene.traverse((o) => { if (o.isMesh) parts.push(o); });
    const place = [];
    for (let i = 0; i < 44; i++) { const a = rand(Math.PI * 2); let rr = 0.5; while (pondD(Math.cos(a) * rr, Math.sin(a) * rr) < 1.08 && rr < 12) rr += 0.03; const x = Math.cos(a) * (rr + rand(0, 0.6)), z = Math.sin(a) * (rr + rand(0, 0.6)); if (z > 3.5 && Math.abs(x - 0.6) < 1.4) continue; if (Math.abs(z - BRIDGE_Z) < 1 && Math.abs(x) > 3) continue; place.push([x, z, rand(0.6, 1.1)]); }
    for (const p of parts) {
      const mat = p.material; mat.alphaTest = 0.5; mat.side = DoubleSide;
      const fg = bakeGeo(p); fg.computeBoundingBox(); fg.translate(-(fg.boundingBox.min.x + fg.boundingBox.max.x) / 2, 0, -(fg.boundingBox.min.z + fg.boundingBox.max.z) / 2);
      const im = new InstancedMesh(fg, mat, place.length); im.castShadow = true; im.receiveShadow = true;
      const o = new Object3D();
      place.forEach(([x, z, s], i) => { o.position.set(x, heightAt(x, z) - 0.03, z); o.rotation.set(0, hash2(i, 9) * 6.28, 0); o.scale.setScalar(s); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      scene.add(im);
    }
  }

  // --- the bridge: a vermilion taiko arch with hinoki deck boards and bronze post caps
  const bridge = new Group(); scene.add(bridge);
  {
    let span = 0; for (const s of [1, -1]) { let x = 0; while (pondD(x * s, BRIDGE_Z) < 1.02 && x < 9) x += 0.05; span = Math.max(span, x); }
    const S = span * 2 + 0.9, W = 1.5, RISE = 1.05, Y0 = 0.3;
    const arcY = (x) => Y0 + RISE * (1 - Math.pow((2 * x) / S, 2));
    const slope = (x) => (-8 * RISE * x) / (S * S);
    if (woodD) { woodD.repeat.set(1, 1); }
    const deckMat = new MeshStandardMaterial({ map: woodD, normalMap: woodN, color: 0xb8a58c, roughness: 0.8 });
    const redMat = new MeshPhysicalMaterial({ color: 0x8c2a1b, roughness: 0.62, clearcoat: 0.18, clearcoatRoughness: 0.6 });
    const bronzeMat = new MeshStandardMaterial({ color: 0x6d5a2e, metalness: 0.85, roughness: 0.38 });
    underwater(redMat, { key: 'red' });
    const deck = [], red = [], bronze = [];
    const box = (arr, w, h, d, x, y, z, rz = 0) => { const g = new BoxGeometry(w, h, d); g.rotateZ(rz); g.translate(x, y, z); arr.push(g); };
    // deck boards across the width
    const nb = Math.round(S / 0.16);
    for (let i = 0; i < nb; i++) { const x = -S / 2 + (i + 0.5) * (S / nb); const g = new BoxGeometry(S / nb - 0.012, 0.05, W); const uvs = g.attributes.uv; for (let k = 0; k < uvs.count; k++) uvs.setXY(k, uvs.getX(k) * 0.15 + (i * 0.137) % 1, uvs.getY(k) * 0.9); g.rotateZ(Math.atan(slope(x))); g.translate(x, arcY(x), BRIDGE_Z); deck.push(g); }
    // stringers and rails as short segments along the arc
    const segs = 44;
    for (let i = 0; i < segs; i++) {
      const x0 = -S / 2 + (i / segs) * S, x1 = -S / 2 + ((i + 1) / segs) * S, xm = (x0 + x1) / 2, len = Math.hypot(x1 - x0, arcY(x1) - arcY(x0)) + 0.01, rz = Math.atan(slope(xm));
      for (const zs of [-1, 1]) {
        box(red, len, 0.2, 0.1, xm, arcY(xm) - 0.09, BRIDGE_Z + zs * (W / 2 + 0.03), rz);
        box(red, len, 0.075, 0.1, xm, arcY(xm) + 0.86, BRIDGE_Z + zs * (W / 2 - 0.02), rz);
        box(red, len, 0.05, 0.05, xm, arcY(xm) + 0.42, BRIDGE_Z + zs * (W / 2 - 0.02), rz);
      }
    }
    const np = 9;
    for (let i = 0; i < np; i++) {
      const x = -S / 2 + 0.12 + (i / (np - 1)) * (S - 0.24);
      for (const zs of [-1, 1]) {
        const z = BRIDGE_Z + zs * (W / 2 - 0.02), end = i === 0 || i === np - 1;
        box(red, end ? 0.14 : 0.1, 0.95, end ? 0.14 : 0.1, x, arcY(x) + 0.42, z);
        if (end) { const lg = new LatheGeometry([[0, 0], [0.075, 0], [0.08, 0.04], [0.06, 0.06], [0.085, 0.13], [0.06, 0.2], [0.02, 0.26], [0, 0.33]].map(([a, b]) => new Vector2(a, b)), 16); lg.translate(x, arcY(x) + 0.9, z); bronze.push(lg); }
      }
    }
    // piers into the water
    for (const x of [-S * 0.26, S * 0.26]) for (const zs of [-1, 1]) { const top = arcY(x) - 0.15; const g = new CylinderGeometry(0.075, 0.085, top + 1.1, 12); g.translate(x, top - (top + 1.1) / 2, BRIDGE_Z + zs * (W / 2 - 0.1)); red.push(g); }
    for (const x of [-S * 0.26, S * 0.26]) box(red, 0.08, 0.12, W, x, arcY(x) - 0.25, BRIDGE_Z);
    for (const [arr, mat] of [[deck, deckMat], [red, redMat], [bronze, bronzeMat]]) { const m = new Mesh(mergeGeometries(arr), mat); m.castShadow = true; m.receiveShadow = true; bridge.add(m); }
  }

  // --- lily pads, flowers
  const padTex = paintPad(11, false), vicTex = paintPad(23, true);
  const padMat = new MeshStandardMaterial({ map: padTex, roughness: 0.42, metalness: 0, envMapIntensity: 0.9, side: DoubleSide });
  const vicMat = new MeshStandardMaterial({ map: vicTex, roughness: 0.5, metalness: 0, envMapIntensity: 0.8, side: DoubleSide });
  function roundPadGeo(r, notch) {
    const g = new CircleGeometry(r, 48, notch / 2, Math.PI * 2 - notch);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), d = Math.hypot(x, y) / r; p.setZ(i, 0.012 * d * d); uv.setXY(i, 0.5 + x / (2 * r), 0.5 + y / (2 * r)); }
    g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return g;
  }
  // Victoria-style content pad: flat disc or rounded rectangle with an upturned rim
  function contentPadGeo(rec) {
    const [w, h] = rec.shape === 'roundedRect' ? (rec.size || [2.4, 1.7]) : [(rec.radius || 1.1) * 2, (rec.radius || 1.1) * 2];
    const cr = rec.shape === 'roundedRect' ? Math.min(rec.cornerRadius ?? 0.4, w / 2, h / 2) : w / 2;
    const s = new Shape(); const x = -w / 2, y = -h / 2;
    s.moveTo(x + cr, y); s.lineTo(x + w - cr, y); s.absarc(x + w - cr, y + cr, cr, -Math.PI / 2, 0); s.lineTo(x + w, y + h - cr); s.absarc(x + w - cr, y + h - cr, cr, 0, Math.PI / 2); s.lineTo(x + cr, y + h); s.absarc(x + cr, y + h - cr, cr, Math.PI / 2, Math.PI); s.lineTo(x, y + cr); s.absarc(x + cr, y + cr, cr, Math.PI, Math.PI * 1.5);
    const disc = new ShapeGeometry(s, 24);
    const uv = disc.attributes.uv, p = disc.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / Math.max(w, h), 0.5 + p.getY(i) / Math.max(w, h));
    disc.rotateX(-Math.PI / 2);
    // rim: a strip following the outline, rising 7 cm and leaning out
    const pts = s.getSpacedPoints(160); const rp = [], ruv = [], ri = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]; const nx = b.y - a.y, ny = -(b.x - a.x); const nl = Math.hypot(nx, ny) || 1;
      rp.push(a.x, 0, -a.y, a.x + (nx / nl) * 0.035, 0.075, -(a.y + (ny / nl) * 0.035)); ruv.push(i / pts.length, 0.02, i / pts.length, 0.0);
    }
    for (let i = 0; i < pts.length - 1; i++) { const q = i * 2; ri.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    const rg = new BufferGeometry(); rg.setAttribute('position', new BufferAttribute(new Float32Array(rp), 3)); rg.setAttribute('uv', new BufferAttribute(new Float32Array(ruv), 2)); rg.setIndex(ri);
    disc.deleteAttribute('normal');
    const merged = mergeGeometries([disc.toNonIndexed(), rg.toNonIndexed()]); merged.computeVertexNormals();
    return { geo: merged, w, h };
  }
  const rimMat = new MeshStandardMaterial({ color: 0x7a2f22, roughness: 0.6, side: DoubleSide });
  const pads = new Map(); const padsGroup = new Group(); scene.add(padsGroup);
  let padSeq = 0;
  function addPad(rec = {}) {
    const id = rec.id || 'pad-' + ++padSeq;
    const r = { id, shape: rec.shape === 'roundedRect' ? 'roundedRect' : 'circle', size: rec.size, radius: rec.radius, cornerRadius: rec.cornerRadius, position: rec.position || [0, 0], rotation: rec.rotation || 0, card: rec.card || null };
    const { geo, w, h } = contentPadGeo(r);
    const m = new Mesh(geo, vicMat); m.castShadow = true; m.receiveShadow = true;
    m.position.set(r.position[0], WATER_Y + 0.012, r.position[1]); m.rotation.y = r.rotation;
    padsGroup.add(m);
    pads.set(id, { rec: r, mesh: m, w, h, phase: rand(6.28) });
    refreshDev();
    return id;
  }
  function removePad(id) { const p = pads.get(id); if (!p) return false; padsGroup.remove(p.mesh); p.mesh.geometry.dispose(); pads.delete(id); refreshDev(); return true; }
  function updatePad(id, patch) { const p = pads.get(id); if (!p) return false; const rec = { ...p.rec, ...patch, id }; removePad(id); addPad(rec); return true; }

  // decorative pads (instanced) and water lilies
  const deco = [];
  {
    const clusters = [[-3.6, 1.9, 7], [3.7, 1.8, 6], [-1.2, -1.9, 5], [3.4, -1.4, 5], [0.4, 3.0, 4], [-4.2, -0.6, 4]];
    for (const [cx, cz, n] of clusters) for (let i = 0; i < n; i++) {
      const x = cx + rand(-0.9, 0.9), z = cz + rand(-0.7, 0.7);
      if (pondD(x, z) > 0.86) continue;
      deco.push({ x, z, r: rand(0.18, 0.36), ry: rand(6.28), ph: rand(6.28) });
    }
    const geo = roundPadGeo(1, 0.42);
    const im = new InstancedMesh(geo, padMat, deco.length); im.castShadow = true; im.receiveShadow = true;
    const o = new Object3D();
    deco.forEach((d, i) => { o.position.set(d.x, WATER_Y + 0.008, d.z); o.rotation.set(0, d.ry, 0); o.scale.set(d.r, 1, d.r); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    scene.add(im);
    // water lilies on a few pads
    const petal = new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); petal.scale(0.035, 0.03, 0.09); petal.translate(0, 0, 0.07);
    const petals = [], cores = [];
    const flowerAt = [2, 7, 12, 17, 22].filter((i) => deco[i]);
    for (const i of flowerAt) {
      const d = deco[i]; const fx = d.x + Math.cos(d.ry) * d.r * 0.35, fz = d.z + Math.sin(d.ry) * d.r * 0.35;
      for (let layer = 0; layer < 3; layer++) { const n = 8; const tilt = [0.25, 0.6, 0.95][layer]; const sc = [1.0, 0.85, 0.66][layer]; for (let k = 0; k < n; k++) { const g = petal.clone(); g.scale(sc, sc, sc); g.rotateX(-tilt); g.rotateY((k / n) * Math.PI * 2 + layer * 0.4); g.translate(fx, WATER_Y + 0.03 + layer * 0.012, fz); petals.push(g); } }
      const cg = new SphereGeometry(0.03, 10, 6); cg.scale(1, 0.5, 1); cg.translate(fx, WATER_Y + 0.06, fz); cores.push(cg);
    }
    if (petals.length) {
      const pm = new MeshPhysicalMaterial({ color: 0xf6d6e2, roughness: 0.5, sheen: 0.5, sheenColor: new Color(0xffe6ee), side: DoubleSide });
      const pmesh = new Mesh(mergeGeometries(petals), pm); pmesh.castShadow = true; scene.add(pmesh);
      const cmesh = new Mesh(mergeGeometries(cores), new MeshStandardMaterial({ color: 0xf2c43a, roughness: 0.7 })); scene.add(cmesh);
    }
  }

  // --- stepping-stone paths
  const paths = new Map(); let pathSeq = 0;
  const stoneMat = underwater(new MeshStandardMaterial({ map: stoneD, normalMap: stoneN, roughness: 0.9, color: 0xc9c4b8 }), { key: 'stone' });
  function stoneGeo(seed) {
    const g = new IcosahedronGeometry(1, 3); const p = g.attributes.position; const r = mulberry32(seed); const ox = r() * 10, oz = r() * 10;
    for (let i = 0; i < p.count; i++) { const v = new Vector3().fromBufferAttribute(p, i); const n = 1 + 0.18 * fbm(v.x * 1.6 + ox, v.z * 1.6 + oz + v.y, 3); v.multiplyScalar(n); v.y = v.y > 0 ? v.y * 0.28 : v.y * 0.5; p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g;
  }
  const stoneGeos = [0, 1, 2, 3].map((i) => stoneGeo(90 + i));
  function addPath(rec = {}) {
    const id = rec.id || 'path-' + ++pathSeq;
    const pts = (rec.points || []).map(([x, z]) => new Vector2(x, z)); const size = rec.stoneSize || 0.46;
    const group = new Group(); let k = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = a.distanceTo(b), n = Math.max(1, Math.round(L / (size * 1.25)));
      for (let j = 0; j < n; j++) {
        const u = (j + 0.5) / n; const x = lerp(a.x, b.x, u) + rand(-0.06, 0.06), z = lerp(a.y, b.y, u) + rand(-0.06, 0.06);
        const m = new Mesh(stoneGeos[k++ % stoneGeos.length], stoneMat); const s = size * rand(0.42, 0.55);
        const hy = heightAt(x, z); m.position.set(x, Math.max(hy + s * 0.12, WATER_Y + 0.05), z); m.scale.set(s, s, s * rand(0.75, 1)); m.rotation.y = rand(6.28);
        m.castShadow = true; m.receiveShadow = true; group.add(m);
      }
    }
    scene.add(group); paths.set(id, { rec: { id, points: rec.points || [], stoneSize: size }, group }); refreshDev(); return id;
  }
  function removePath(id) { const p = paths.get(id); if (!p) return false; scene.remove(p.group); paths.delete(id); refreshDev(); return true; }

  // --- koi
  const fishes = [];
  const nFish = low ? 9 : 13;
  for (let i = 0; i < nFish; i++) {
    const name = ROSTER[i % ROSTER.length]; const vr = VARIETIES[name];
    const L = rand(0.6, 0.92) * (i === 0 ? 1.12 : 1);
    const uni = { uLen: { value: L }, uPhase: { value: rand(6.28) }, uAmp: { value: 0.6 }, uCurv: { value: 0 } };
    const bend = { key: 'koi', uniforms: uni, vpars: KOI_BEND_PARS, vert: KOI_BEND };
    const bodyMat = underwater(new MeshPhysicalMaterial({ map: paintKoi(name, 100 + i), roughness: 0.38, metalness: vr.metal, clearcoat: 0.6, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: new Color(0xffffff) }), bend);
    const finMat = underwater(new MeshStandardMaterial({ map: paintFin(name), transparent: true, depthWrite: false, side: DoubleSide, roughness: 0.5 }), bend);
    const pecMat = underwater(new MeshStandardMaterial({ map: paintFin(name), transparent: true, depthWrite: false, side: DoubleSide, roughness: 0.5 }), { key: 'pec' });
    const depthMat = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    depthMat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, uni); sh.vertexShader = KOI_BEND_PARS + sh.vertexShader.replace('#include <begin_vertex>', KOI_BEND); };
    const g = new Group();
    const body = new Mesh(koiBodyGeo(L), bodyMat); body.castShadow = true; body.customDepthMaterial = depthMat;
    const fins = new Mesh(koiFinsGeo(L), finMat); fins.castShadow = true; fins.customDepthMaterial = depthMat;
    const pecs = [1, -1].map((side) => { const m = new Mesh(koiPectoralGeo(L, side), pecMat); m.position.set(L * (0.5 - 0.2 * BODY_FRAC), -0.05 * L, side * 0.06 * L); m.castShadow = true; g.add(m); return m; });
    g.add(body, fins); scene.add(g);
    let x, z; do { x = rand(-RX, RX) * 0.7; z = rand(-RZ, RZ) * 0.7; } while (pondD(x, z) > 0.7);
    fishes.push({ g, uni, pecs, L, x, z, y: rand(-0.45, -0.18), h: rand(6.28), speed: rand(0.12, 0.22), turn: 0, wander: rand(6.28), panic: 0, target: null, name });
  }
  koi.fishCount = fishes.length;
  const food = [];

  // --- camera rig. tilt t: 0 = top-down table view, 1 = eye-level forward view
  const cam = { t: 0, target: 0, az: 0, azTarget: 0, auto: !REDUCED && !params.has('view') && !params.has('tilt'), started: performance.now() };
  if (params.get('view') === 'forward') { cam.t = cam.target = 1; }
  if (params.has('tilt')) { const v = clamp(Number(params.get('tilt')), 8, 90); cam.t = cam.target = elevToT(v); }
  if (params.has('az')) cam.az = cam.azTarget = clamp(Number(params.get('az')), -35, 35) * DEG;
  function elevToT(deg) { return clamp((90 - deg) / (90 - 9), 0, 1); }
  function tToElev(t) { return 90 - t * (90 - 9); }
  const tmpV = new Vector3();
  function placeCamera() {
    const aspect = innerWidth / innerHeight; camera.aspect = aspect;
    const e = cam.t;
    // top-down framing covers ~6.6 m of pond vertically (portrait: ~4.2 m across)
    const topFov = 45, fwdFov = clamp(2 * Math.atan(Math.tan(31 * DEG) / Math.min(aspect, 1.6)) / DEG, 50, 74);
    camera.fov = lerp(topFov, fwdFov, smooth(0, 1, e));
    const Htop = topSpan() / (2 * Math.tan((topFov / 2) * DEG));
    const elev = lerp(90, 9.5, ease(e)) * DEG;
    const D = lerp(Htop, aspect < 1 ? 9.8 : 10.4, ease(e));
    const pz = lerp(0.35, -2.8, ease(e));
    const az = cam.az * smooth(0.05, 0.6, e);
    const tgt = tmpV.set(Math.sin(az) * 0, 0, pz);
    camera.position.set(tgt.x + Math.sin(az) * Math.cos(elev) * D, tgt.y + Math.sin(elev) * D, tgt.z + Math.cos(az) * Math.cos(elev) * D);
    camera.up.set(0, 1, 0);
    if (elev > 89.5 * DEG) camera.up.set(0, 0, -1);
    camera.lookAt(tgt.x, tgt.y + (1 - smooth(0.6, 1, e)) * 0 + smooth(0.5, 1, e) * 0.9, tgt.z);
    camera.updateProjectionMatrix();
  }

  // --- content cards (HTML) riding on pads. They rise to face you as the camera tilts up.
  const cardLayer = $('#padContent');
  function projectCard(p) {
    const el = p.cardEl; if (!el) return;
    const m = p.mesh; const circ = p.rec.shape === 'circle'; const cw = p.w * (circ ? 0.66 : 0.84), ch = p.h * (circ ? 0.66 : 0.8);
    const ppm = innerHeight / topSpan(); const CW = Math.round(cw * ppm), CH = Math.round(ch * ppm);
    if (p.CW !== CW || p.CH !== CH) { p.CW = CW; p.CH = CH; el.style.width = CW + 'px'; el.style.height = CH + 'px'; el.style.fontSize = (CW / 17).toFixed(2) + 'px'; }
    const up = smooth(0.25, 1, cam.t) * (innerWidth < innerHeight ? 6 : 16) * DEG; // hinge along the near edge
    const bob = Math.sin(U.uTime.value * 0.7 + p.phase) * 0.006;
    const cx = m.position.x, cz = m.position.z, rot = m.rotation.y;
    const local = [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2]]; // (x, z-depth) with z negative = far edge
    const pts = [];
    for (const [lx, lz] of local) {
      // hinge at the near edge (lz = +ch/2)
      const dz = lz - ch / 2; const yz = -dz * Math.sin(up), zz = ch / 2 + dz * Math.cos(up);
      const wx = cx + lx * Math.cos(rot) + zz * Math.sin(rot), wz = cz - lx * Math.sin(rot) + zz * Math.cos(rot);
      tmpV.set(wx, WATER_Y + 0.09 + bob + yz, wz).project(camera);
      if (tmpV.z > 1 || tmpV.z < -1) { el.style.display = 'none'; return; }
      pts.push([(tmpV.x * 0.5 + 0.5) * innerWidth, (-tmpV.y * 0.5 + 0.5) * innerHeight]);
    }
    const mtx = homography(CW, CH, pts);
    if (!mtx) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.style.transform = mtx; el.style.zIndex = String(1000 - Math.round(camera.position.distanceTo(m.position) * 10));
    const scr = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    el.style.opacity = scr < 60 ? String(clamp((scr - 30) / 30, 0, 1)) : '1';
  }
  function bindCard(id, elId) { const p = pads.get(id); const el = document.getElementById(elId); if (p && el) { p.cardEl = el; el.hidden = false; el.classList.toggle('round', p.rec.shape === 'circle'); cardLayer.appendChild(el); } }

  // --- default layout
  const DEFAULT_PADS = [
    { id: 'today', shape: 'roundedRect', size: [2.5, 1.75], cornerRadius: 0.5, position: [-1.35, 1.15], rotation: 0.05, card: 'card-today' },
    { id: 'pinned', shape: 'circle', radius: 1.08, position: [1.7, -0.25], rotation: -0.04, card: 'card-pinned' },
    { id: 'inbox', shape: 'roundedRect', size: [2.1, 1.5], cornerRadius: 0.45, position: [-1.4, -1.35], rotation: -0.06, card: 'card-inbox' },
  ];
  const DEFAULT_PATHS = [{ id: 'south-steps', points: [[-0.2, 7.2], [0.5, 5.6], [0.9, 4.2], [1.6, 3.1], [2.6, 2.5], [3.2, 1.7]], stoneSize: 0.5 }];
  if (innerWidth / innerHeight < 0.8) {
    Object.assign(DEFAULT_PADS[0], { position: [0, 2.15], size: [2.4, 1.6] });
    Object.assign(DEFAULT_PADS[1], { shape: 'roundedRect', size: [2.3, 1.5], cornerRadius: 0.45, position: [0.15, 0.3] });
    Object.assign(DEFAULT_PADS[2], { position: [-0.1, -1.6], size: [2.1, 1.35] });
  }
  function applyDefaults() { for (const p of DEFAULT_PADS) { addPad(p); if (p.card) bindCard(p.id, p.card); } for (const p of DEFAULT_PATHS) addPath(p); }

  // --- dev panel
  let devOpen = false;
  function refreshDev(force) { if (!devOpen && !force) return; const ta = $('#devjson'); if (!ta) return; ta.value = JSON.stringify(pond.list(), null, 1); }

  // --- painterly post (look B)
  let post = null;
  if (look === 'painted') {
    const rt = new WebGLRenderTarget(2, 2, { type: HalfFloatType, samples: 4 });
    const q = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader: POST_VS, fragmentShader: PAINT_FS, uniforms: { tDiffuse: { value: rt.texture }, uRes: { value: new Vector2(2, 2) }, uRadius: { value: 1.6 } }, depthTest: false, depthWrite: false }));
    const ps = new Scene(); ps.add(q); const oc = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    post = { rt, q, ps, oc };
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    { const s = new Vector2(); renderer.getDrawingBufferSize(s); reflRT.setSize(Math.max(2, s.x >> 1), Math.max(2, s.y >> 1)); }
    if (post) { const s = new Vector2(); renderer.getDrawingBufferSize(s); post.rt.setSize(s.x, s.y); post.q.material.uniforms.uRes.value.copy(s); }
    placeCamera();
  }
  addEventListener('resize', resize);

  // --- interaction
  const ray = { o: new Vector3(), d: new Vector3() };
  function waterPoint(cx, cy) {
    tmpV.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1, 0.5).unproject(camera);
    ray.o.copy(camera.position); ray.d.copy(tmpV).sub(camera.position).normalize();
    if (ray.d.y > -1e-3) return null; const k = (WATER_Y - ray.o.y) / ray.d.y; const x = ray.o.x + ray.d.x * k, z = ray.o.z + ray.d.z * k;
    return pondD(x, z) < 0.95 ? { x, z } : null;
  }
  let lastRip = 0, drag = null, pinch = null; const ptrs = new Map();
  function userTilt() { cam.auto = false; }
  function setTarget(v) { cam.target = clamp(v, 0, 1); syncViewButtons(); }
  canvas.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, t: cam.target, az: cam.azTarget, moved: false };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { y: (a.y + b.y) / 2, t: cam.target }; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag && ptrs.size) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) { drag.moved = true; userTilt(); }
      if (drag.moved) { setTarget(drag.t + dy / (innerHeight * 0.6)); cam.t = lerp(cam.t, cam.target, 0.6); cam.azTarget = clamp(drag.az - dx / innerWidth * 1.2, -0.6, 0.6); }
      return;
    }
    const now = performance.now();
    if (now - lastRip > 140) { const p = waterPoint(e.clientX, e.clientY); if (p) { addRipple(p.x, p.z, koi.calm ? 0.12 : 0.22); lastRip = now; } }
  });
  const endPtr = (e) => {
    ptrs.delete(e.pointerId);
    if (drag && !drag.moved && e.type === 'pointerup') { const p = waterPoint(e.clientX, e.clientY); if (p) { addRipple(p.x, p.z, 0.9); food.push({ x: p.x, z: p.z, life: 9 }); startle(p.x, p.z, 1.1); } }
    if (ptrs.size === 0) drag = null; if (ptrs.size < 2) pinch = null;
  };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  addEventListener('wheel', (e) => { if (e.target.closest && e.target.closest('#devpanel, #lines, .pad-card')) return; e.preventDefault(); userTilt(); setTarget(cam.target + e.deltaY * 0.0012); }, { passive: false });
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const k = e.key; let used = true;
    if (k === 'ArrowUp') { userTilt(); setTarget(cam.target + 0.12); }
    else if (k === 'ArrowDown') { userTilt(); setTarget(cam.target - 0.12); }
    else if (k === 'ArrowLeft') { cam.azTarget = clamp(cam.azTarget + 0.08, -0.6, 0.6); }
    else if (k === 'ArrowRight') { cam.azTarget = clamp(cam.azTarget - 0.08, -0.6, 0.6); }
    else if (k === 't' || k === 'T') { userTilt(); toggleView(); }
    else used = false;
    if (used) e.preventDefault();
  });
  function startle(x, z, s) { for (const f of fishes) { const d = Math.hypot(f.x - x, f.z - z); if (d < 1.6 * s) f.panic = Math.max(f.panic, (1.6 * s - d) / 1.6); } }
  koi.disturb = (s = 0.6) => { for (const f of fishes) f.panic = Math.max(f.panic, s * rand(0.5, 1)); };
  koi.ripple = (x = rand(-2, 2), z = rand(-1.5, 1.5), a = 0.6) => addRipple(x, z, a);

  // --- view toggle (Top-down <-> Forward)
  function toggleView() { setTarget(cam.target > 0.5 ? 0 : 1); if (REDUCED) cam.t = cam.target; }
  function syncViewButtons() { const fwd = cam.target > 0.5; $('#vTop')?.setAttribute('aria-pressed', String(!fwd)); $('#vFwd')?.setAttribute('aria-pressed', String(fwd)); const sl = $('#tilt'); if (sl && document.activeElement !== sl) sl.value = String(Math.round(cam.target * 100)); }
  $('#vTop')?.addEventListener('click', () => { userTilt(); setTarget(0); if (REDUCED) cam.t = 0; });
  $('#vFwd')?.addEventListener('click', () => { userTilt(); setTarget(1); if (REDUCED) cam.t = 1; });
  $('#tilt')?.addEventListener('input', (e) => { userTilt(); cam.target = Number(e.target.value) / 100; if (REDUCED) cam.t = cam.target; syncViewButtons(); });

  // --- time of day: a grade over the one photographic panorama (honest: the photo itself stays midday)
  const TOD = {
    day: { exp: 1.0, bg: 1.18, env: 0.85, sun: 2.6, sunC: 0xfff1dc, tint: [1, 1, 1] },
    dawn: { exp: 0.9, bg: 0.95, env: 0.7, sun: 1.6, sunC: 0xffc9a0, tint: [1.05, 0.92, 0.88] },
    dusk: { exp: 0.85, bg: 0.8, env: 0.6, sun: 1.5, sunC: 0xff9a5a, tint: [1.1, 0.85, 0.72] },
    night: { exp: 0.55, bg: 0.18, env: 0.22, sun: 0.35, sunC: 0x9ab4ff, tint: [0.7, 0.8, 1.1] },
  };
  let tod = TOD[params.get('tod')] ? params.get('tod') : 'day';
  function setTimeOfDay(name) {
    if (!TOD[name]) return false; tod = name; const s = TOD[name];
    renderer.toneMappingExposure = s.exp; scene.backgroundIntensity = s.bg; scene.environmentIntensity = s.env; sun.intensity = s.sun; sun.color.set(s.sunC);
    canvas.style.filter = name === 'day' ? '' : `sepia(${name === 'night' ? 0 : 0.12}) saturate(${name === 'night' ? 0.6 : 1.05}) hue-rotate(${name === 'night' ? 12 : -6}deg)`;
    const b = $('#todbtn .v'); if (b) b.textContent = t(name);
    return true;
  }
  setTimeOfDay(tod);
  $('#todbtn')?.addEventListener('click', () => { const o = ['day', 'dusk', 'night', 'dawn']; setTimeOfDay(o[(o.indexOf(tod) + 1) % o.length]); });

  function setQuality(q) { try { localStorage.setItem('koi.q', q); } catch {} const u = new URL(location.href); u.searchParams.set('q', q); location.assign(u.toString()); }
  koi.setQuality = setQuality;
  $('#qbtn')?.addEventListener('click', () => { const o = ['auto', 'high', 'low']; setQuality(o[(o.indexOf(quality) + 1) % o.length]); });
  const qbv = $("#qbtn .v"); if (qbv) qbv.textContent = t(quality) + (quality === 'auto' ? ' · ' + t(tier) : '');
  koi.setCalm = (on) => { koi.calm = !!on; document.body.classList.toggle('calm', koi.calm); $('#cbtn')?.setAttribute('aria-pressed', String(koi.calm)); const v = $('#cbtn .v'); if (v) v.textContent = koi.calm ? t('on') : t('off'); };
  $('#cbtn')?.addEventListener('click', () => koi.setCalm(!koi.calm));
  $('#devbtn')?.addEventListener('click', () => { devOpen = !devOpen; $('#devpanel').hidden = !devOpen; $('#devbtn').setAttribute('aria-expanded', String(devOpen)); refreshDev(true); });
  $('#devapply')?.addEventListener('click', () => { try { pond.applyJSON(JSON.parse($('#devjson').value)); $('#deverr').textContent = ''; } catch (err) { $('#deverr').textContent = String(err.message || err); } });
  $('#devreset')?.addEventListener('click', () => { pond.applyJSON({ pads: DEFAULT_PADS, paths: DEFAULT_PATHS }); });

  // --- API
  Object.assign(pond, {
    addPad: (r) => { const id = addPad(r); if (r && r.card) bindCard(id, r.card); return id; }, removePad, updatePad, addPath, removePath,
    setCamera({ tilt, azimuth } = {}) { if (tilt !== undefined) { cam.auto = false; setTarget(elevToT(tilt)); } if (azimuth !== undefined) cam.azTarget = clamp(azimuth * DEG, -0.6, 0.6); },
    getCamera() { return { tilt: Math.round(tToElev(cam.t) * 10) / 10, azimuth: Math.round((cam.az / DEG) * 10) / 10, view: cam.t > 0.5 ? 'forward' : 'top-down', t: Math.round(cam.t * 1000) / 1000 }; },
    setView(v) { cam.auto = false; setTarget(v === 'forward' ? 1 : 0); if (REDUCED) cam.t = cam.target; },
    setTimeOfDay,
    list() { return { pads: [...pads.values()].map((p) => ({ ...p.rec, card: p.cardEl ? p.cardEl.id : p.rec.card })), paths: [...paths.values()].map((p) => p.rec) }; },
    applyJSON(obj) { if (!obj || typeof obj !== 'object') throw new Error('expected {pads, paths}'); if (Array.isArray(obj.pads)) { for (const id of [...pads.keys()]) removePad(id); for (const p of obj.pads) { addPad(p); if (p.card) bindCard(p.id, p.card); } } if (Array.isArray(obj.paths)) { for (const id of [...paths.keys()]) removePath(id); obj.paths.forEach(addPath); } refreshDev(true); },
  });

  applyDefaults();
  resize();
  window.__koi = { scene, camera, renderer, cam, fishes };

  // --- simulation
  const clock = { last: performance.now(), frames: 0, acc: 0 };
  let tilted = false;
  function stepFish(dt, time) {
    for (const f of food) f.life -= dt; while (food.length && food[0].life <= 0) food.shift();
    for (const f of fishes) {
      // wander + stay in the pond + gentle separation + food
      f.wander += rand(-1, 1) * dt * 1.2;
      let desired = f.h + Math.sin(f.wander) * 0.6 * dt;
      const ahead = 0.9; const ax = f.x + Math.cos(f.h) * ahead, az = f.z + Math.sin(f.h) * ahead;
      const dA = pondD(ax, az);
      if (dA > 0.72) { const toC = Math.atan2(-f.z, -f.x); desired = f.h + angDiff(f.h, toC) * clamp((dA - 0.72) * 4, 0, 1.5); }
      // avoid bridge piers
      if (Math.abs(az - BRIDGE_Z) < 0.5 && Math.abs(Math.abs(ax) - 1.9) < 0.5) desired += 0.8 * dt * 10;
      for (const o of fishes) { if (o === f) continue; const dx = o.x - f.x, dz = o.z - f.z, dd = dx * dx + dz * dz; if (dd < 0.36 && Math.abs(o.y - f.y) < 0.25) { const aw = Math.atan2(-dz, -dx); desired += angDiff(f.h, aw) * 0.02; } }
      let goal = null; let best = 3.5;
      for (const fd of food) { const d = Math.hypot(fd.x - f.x, fd.z - f.z); if (d < best) { best = d; goal = fd; } }
      if (goal && f.panic < 0.3) { desired = f.h + angDiff(f.h, Math.atan2(goal.z - f.z, goal.x - f.x)) * 0.9; if (best < 0.25) goal.life -= dt * 3; }
      const turn = clamp(angDiff(f.h, desired), -1.6 * dt, 1.6 * dt) * (1 + f.panic * 2);
      f.h += turn; f.turn = lerp(f.turn, turn / Math.max(dt, 1e-3), 0.1);
      const sp = f.speed * (1 + f.panic * 3.5) * (goal ? 1.4 : 1) * (koi.calm ? 0.6 : 1);
      f.x += Math.cos(f.h) * sp * dt; f.z += Math.sin(f.h) * sp * dt;
      if (pondD(f.x, f.z) > 0.82) { f.x *= 0.995; f.z *= 0.995; }
      const bed = heightAt(f.x, f.z); const ty = goal && best < 1 ? -0.06 : clamp(-0.22 + Math.sin(time * 0.1 + f.wander) * 0.12, bed + 0.14, -0.08);
      f.y = lerp(f.y, ty, dt * 0.4);
      f.panic = Math.max(0, f.panic - dt * 0.5);
      f.uni.uPhase.value += dt * (4 + sp * 22);
      f.uni.uAmp.value = lerp(f.uni.uAmp.value, 0.45 + f.panic * 0.9 + sp * 1.3, 0.05);
      f.uni.uCurv.value = clamp(-f.turn * 0.35, -0.9, 0.9);
      f.g.position.set(f.x, f.y, f.z); f.g.rotation.set(0, -f.h, 0);
      const flap = Math.sin(time * 2.2 + f.wander) * 0.3;
      f.pecs[0].rotation.set(flap * 0.6, 0.25 + flap * 0.2, 0); f.pecs[1].rotation.set(-flap * 0.6, -0.25 - flap * 0.2, 0);
      if (!koi.calm && f.y > -0.1 && Math.random() < dt * 0.25) addRipple(f.x + Math.cos(f.h) * f.L * 0.5, f.z + Math.sin(f.h) * f.L * 0.5, 0.25);
    }
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - clock.last) / 1000); clock.last = now;
    const time = (U.uTime.value += dt * (koi.calm ? 0.6 : 1));
    // auto tilt ~1.5 s after the first frame, unless the viewer took over or prefers reduced motion
    if (cam.auto && !tilted && now - cam.started > 1500) { tilted = true; cam.target = 1; syncViewButtons(); cam.tiltSpeed = 0.42; }
    const speed = cam.tiltSpeed && cam.auto ? cam.tiltSpeed : 2.2;
    const diff = cam.target - cam.t; cam.t += Math.sign(diff) * Math.min(Math.abs(diff), dt * speed * (cam.auto ? 1 : Math.max(0.35, Math.abs(diff) * 3)));
    cam.az = lerp(cam.az, cam.azTarget, clamp(dt * 3, 0, 1));
    placeCamera();
    if (window.__koiCam) { const c = window.__koiCam === 'fish' ? [fishes[0].x, 1.3, fishes[0].z + 0.01, fishes[0].x, 0, fishes[0].z, 35] : window.__koiCam; camera.position.set(c[0], c[1], c[2]); camera.up.set(0, 1, 0); camera.lookAt(c[3], c[4], c[5]); if (c[6]) { camera.fov = c[6]; camera.updateProjectionMatrix(); } }
    stepFish(dt, time);
    for (const p of pads.values()) { p.mesh.position.y = WATER_Y + 0.012 + Math.sin(time * 0.7 + p.phase) * 0.006; projectCard(p); }
    if (reflOn && cam.t > 0.15) renderReflection();
    if (post) { renderer.setRenderTarget(post.rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(post.ps, post.oc); }
    else renderer.render(scene, camera);
    clock.frames++; clock.acc += dt; if (clock.acc > 1) { koi.fps = Math.round(clock.frames / clock.acc); clock.frames = 0; clock.acc = 0; const el = $('#fps'); if (el) el.textContent = koi.fps + ' fps'; }
    requestAnimationFrame(frame);
  }
  // first frame: compile, then remove the loading veil
  renderer.compile(scene, camera);
  requestAnimationFrame((n) => { clock.last = n; cam.started = n; frame(n); $('#loading')?.classList.add('done'); document.body.classList.add('ready'); });
  koi.stats = () => ({ fps: koi.fps, quality, tier, fish: fishes.length, look, view: pond.getCamera(), draws: renderer.info.render.calls, tris: renderer.info.render.triangles });
  syncViewButtons();
}

function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

// CSS matrix3d mapping a w x h element onto four screen points (tl, tr, br, bl)
function homography(w, h, pts) {
  const sx = [0, w, w, 0], sy = [0, 0, h, h]; const A = [], B = [];
  for (let i = 0; i < 4; i++) { const [dx, dy] = pts[i]; A.push([sx[i], sy[i], 1, 0, 0, 0, -sx[i] * dx, -sy[i] * dx]); B.push(dx); A.push([0, 0, 0, sx[i], sy[i], 1, -sx[i] * dy, -sy[i] * dy]); B.push(dy); }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [B[c], B[piv]] = [B[piv], B[c]];
    const d = A[c][c]; if (Math.abs(d) < 1e-12) return null;
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = A[r][c] / d; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; B[r] -= f * B[c]; }
  }
  const [a, b, c, d, e, f, g, hh] = B.map((v, i) => v / A[i][i]);
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${hh},0,0,1,0,${c},${f},0,1)`;
}

// ---------------------------------------------------------------------------
// Page chrome: composer, language, placeholders
// ---------------------------------------------------------------------------
function applyLang() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  const cmd = $('#cmd'); if (cmd) cmd.placeholder = t('placeholder');
  const lb = $('#langbtn .v'); if (lb) lb.textContent = lang.toUpperCase();
  const today = $('#todayDate'); if (today) today.textContent = new Date().toLocaleDateString(lang === 'es' ? 'es' : 'en', { weekday: 'long', month: 'short', day: 'numeric' });
}
function setupChrome() {
  applyLang();
  $('#langbtn')?.addEventListener('click', () => { lang = lang === 'en' ? 'es' : 'en'; try { localStorage.setItem('koi.lang', lang); } catch {} applyLang(); });
  for (const el of document.querySelectorAll('[data-not-wired]')) el.addEventListener('click', (e) => { e.preventDefault(); toast(t('notWired') + ' · ' + (el.dataset.notWired || '')); });
  $('#morebtn')?.addEventListener('click', () => { const open = document.body.classList.toggle('more-open'); $('#morebtn').setAttribute('aria-expanded', String(open)); });
  const input = $('#cmd'), lines = $('#lines'), form = $('#composer');
  input?.addEventListener('input', () => { koi.disturb(0.25); koi.ripple(undefined, undefined, 0.35); });
  form?.addEventListener('submit', (e) => {
    e.preventDefault(); const text = input.value.trim(); if (!text) return;
    const div = document.createElement('div'); div.className = 'etched'; div.textContent = '› ' + text; lines.appendChild(div);
    while (lines.children.length > 6) lines.removeChild(lines.firstChild);
    div.addEventListener('animationend', () => div.remove()); input.value = '';
    const handled = tryCommand(text); koi.disturb(handled ? 0.4 : 0.9); koi.ripple(0, 0.5, 0.8);
  });
}
function tryCommand(text) {
  const s = text.toLowerCase(); const side = /left|izquierda/.test(s) ? -1 : /right|derecha/.test(s) ? 1 : 0;
  if (/(dawn|day|dusk|night|alba|día|dia|ocaso|noche)/.test(s) && /(time|light|make it|set|switch|luz|pon)/.test(s)) { const m = { alba: 'dawn', 'día': 'day', dia: 'day', ocaso: 'dusk', noche: 'night' }; const w = s.match(/(dawn|day|dusk|night|alba|día|dia|ocaso|noche)/)[1]; pond.setTimeOfDay(m[w] || w); return true; }
  if (/(tilt up|look up|forward|ahead|al frente|levanta)/.test(s)) { pond.setView('forward'); return true; }
  if (/(top.?down|look down|table|desk|desde arriba|mesa)/.test(s)) { pond.setView('top-down'); return true; }
  if (/add .*pad|agrega .*hoja/.test(s)) { const rect = /(square|rect|cuadr)/.test(s); pond.addPad({ shape: rect ? 'roundedRect' : 'circle', size: [1.8, 1.3], radius: 0.8, position: [side * 3 + (Math.random() - 0.5), (Math.random() - 0.5) * 2] }); return true; }
  if (/add .*(path|stones)|agrega .*(camino|piedras)/.test(s)) { const x0 = side * 3.6 || -3.6; pond.addPath({ points: [[x0, 2.6], [x0 + 0.8, 1.8], [x0 + 1.5, 1.0]], stoneSize: 0.45 }); return true; }
  return false;
}

setupChrome();
start().catch((err) => { console.error(err); document.body.classList.add('nogl'); $('#loading')?.remove(); });
