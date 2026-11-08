// The 3D world: spline jeep track with curves and hills, textured terrain, sky dome, fog,
// instanced jungle (trees, tree ferns, ferns, grass, rocks), river, volcano, sun + shadows.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smooth, fbm, vnoise, rng, canvasTex, detailTexture, radialTex } from './util.js';
import { jeepModel } from './convoy.js';
import * as Sc from './scenery.js';

export const ENV = [
  { // Fern Valley: sunny jungle valley
    seed: 11, len: 420, trees: { n: 3, k: 1.6, near: 0.75, giants: 18 },  curve: [[9, 52, 0.3], [4, 21, 1.4]], hills: [[2.4, 38, 0], [1.1, 16, 2]],
    skyTop: 0x5f97c8, skyHor: 0xd9e6d6, fog: 0xc9d8c4, fogNear: 22, fogFar: 175, sunDir: [0.5, 0.75, 0.35], sunCol: 0xfff1d6, sunI: 3.0,
    hemiSky: 0xcfe2ff, hemiGround: 0x4a5a2a, hemiI: 1.15, grass: [0x55702f, 0x7e9a45], dirt: 0x8b6b45, rock: 0x7d7a6e, leaf: [0x2f5a26, 0x4f8034], bark: 0x5a4330, mtn: 0x8fa79c,
    veg: { broad: 240, palm: 170, fern: 800, grass: 1300, rock: 110, dead: 0 }, motes: 0xfff6c8,
  },
  { // River Gorge: river on the left, cliffs on the right
    seed: 23, len: 430, trees: { n: 3, k: 1.6, near: 0.75, giants: 18 },  curve: [[7, 60, 0.5], [3, 26, 2.0]], hills: [[0.9, 34, 1]], river: true, waterY: -1.5,
    skyTop: 0x4f8fc4, skyHor: 0xdfe9e8, fog: 0xc8d8dc, fogNear: 25, fogFar: 195, sunDir: [-0.45, 0.7, 0.2], sunCol: 0xfff3dc, sunI: 3.0,
    hemiSky: 0xcfe6ff, hemiGround: 0x52603a, hemiI: 1.1, grass: [0x5a7231, 0x86a050], dirt: 0x94754e, rock: 0x9a8a72, leaf: [0x35602e, 0x52813a], bark: 0x5a4330, mtn: 0x8b9ea6,
    veg: { broad: 150, palm: 170, fern: 600, grass: 1100, rock: 220, dead: 0 }, motes: 0xffffff,
  },
  { // Volcano Ridge: dusk, ash, smoking volcano ahead
    seed: 37, len: 440, trees: { n: 3, k: 1.6, near: 0.75, giants: 18 },  curve: [[10, 48, 2.0], [5, 20, 0.4]], hills: [[3.2, 44, 0.5], [1.3, 18, 1]], volcano: true,
    skyTop: 0x3c3458, skyHor: 0xf09a5c, fog: 0xc98a68, fogNear: 14, fogFar: 150, sunDir: [-0.6, 0.22, -0.75], sunCol: 0xffb070, sunI: 2.4,
    hemiSky: 0xffc39a, hemiGround: 0x4a4030, hemiI: 1.35, grass: [0x4a5c28, 0x6e7c3e], dirt: 0x7a5e42, rock: 0x5e5654, leaf: [0x2e4a26, 0x45683a], bark: 0x3e3226, mtn: 0x6e5a66,
    veg: { broad: 90, palm: 110, fern: 450, grass: 900, rock: 200, dead: 110 }, motes: 0xff9a50,
  },
  { // Misty Marsh: raised causeway through swamp water on both sides
    seed: 51, len: 430, trees: { n: 3, k: 1.6, near: 0.75, giants: 18 },  curve: [[8, 56, 1.1], [3, 23, 0.2]], hills: [[0.5, 40, 0]], swamp: true, waterY: -1.1,
    skyTop: 0x6f8f98, skyHor: 0xcfd8cc, fog: 0xb7c4b4, fogNear: 12, fogFar: 120, sunDir: [0.3, 0.6, 0.5], sunCol: 0xfff0d0, sunI: 2.5,
    hemiSky: 0xd8e4dc, hemiGround: 0x3e4a2c, hemiI: 1.25, grass: [0x4a5f2c, 0x6d8040], dirt: 0x6e5a3c, rock: 0x6e6a5c, leaf: [0x30502a, 0x4e7036], bark: 0x4a3a2a, mtn: 0x8a9a92,
    veg: { broad: 70, palm: 160, fern: 700, grass: 1200, rock: 120, dead: 70 }, motes: 0xfffbd0,
  },
  { // Red Canyon: dry badlands between tall red cliffs
    seed: 63, len: 430, curve: [[11, 50, 0.8], [4, 19, 2.2]], hills: [[2.0, 42, 0.3], [0.9, 15, 1]], canyon: true,
    skyTop: 0x4d86c9, skyHor: 0xf2dcc0, fog: 0xe6c9a6, fogNear: 30, fogFar: 230, sunDir: [0.35, 0.85, -0.2], sunCol: 0xfff0d8, sunI: 3.2,
    hemiSky: 0xf4e2c8, hemiGround: 0x7a4a2a, hemiI: 1.1, grass: [0x8a7a42, 0xb09a58], dirt: 0xb0744a, rock: 0xa4583a, leaf: [0x5a6a30, 0x7a8a40], bark: 0x5a4632, mtn: 0xb98a6a,
    veg: { broad: 0, palm: 25, fern: 0, grass: 420, rock: 340, dead: 70 }, motes: 0xffe2b0,
  },
  { // Sunset Plains: open golden grassland, giant herds, low sun
    seed: 77, len: 440, curve: [[9, 70, 0.1], [4, 27, 1.7]], hills: [[2.6, 60, 0.9], [1.0, 22, 0.2]], plains: true,
    skyTop: 0x5a6fa8, skyHor: 0xf6c27a, fog: 0xe8c08c, fogNear: 30, fogFar: 240, sunDir: [-0.5, 0.25, -0.8], sunCol: 0xffc480, sunI: 2.8,
    hemiSky: 0xffd6a8, hemiGround: 0x5a5030, hemiI: 1.25, grass: [0x8a8a3a, 0xb8a850], dirt: 0x8e6a42, rock: 0x857a68, leaf: [0x4a6028, 0x6a8034], bark: 0x5a4330, mtn: 0x9a8090,
    veg: { broad: 55, palm: 35, fern: 120, grass: 1900, rock: 70, dead: 10 }, motes: 0xffe8b0,
  },
  { // Moonlight Jungle: night ride, moonlight and fireflies
    seed: 89, len: 430, trees: { n: 3, k: 1.6, near: 0.75, giants: 18 }, curve: [[9, 54, 1.6], [4, 22, 0.6]], hills: [[2.0, 40, 1.2], [1.0, 17, 0.4]], night: true,
    skyTop: 0x16285a, skyHor: 0x5a74a8, fog: 0x415a86, fogNear: 18, fogFar: 150, sunDir: [0.35, 0.8, -0.35], sunCol: 0xc4d4ff, sunI: 2.8,
    hemiSky: 0xa8bce8, hemiGround: 0x3a4a34, hemiI: 1.9, grass: [0x40603a, 0x5e7e4a], dirt: 0x7a6650, rock: 0x5c5e66, leaf: [0x1f3c26, 0x325838], bark: 0x3a3026, mtn: 0x3c4a66,
    veg: { broad: 220, palm: 150, fern: 750, grass: 1200, rock: 110, dead: 20 }, motes: 0xd6ff70,
  },
  { // Lagoon Shore: turquoise lagoon on the left, palms and sand
    seed: 97, len: 430, trees: { n: 2, k: 1.4, near: 0.75, giants: 8 }, curve: [[8, 58, 0.9], [3, 24, 1.8]], hills: [[1.0, 36, 0.6]], river: true, lagoon: true, waterY: -1.5,
    skyTop: 0x3a8fdc, skyHor: 0xe6f2ee, fog: 0xcfe4e4, fogNear: 28, fogFar: 210, sunDir: [0.4, 0.8, 0.3], sunCol: 0xfff4dc, sunI: 3.2,
    hemiSky: 0xd4ecff, hemiGround: 0x7a6a44, hemiI: 1.15, grass: [0x6a8a38, 0x9cb45a], dirt: 0xc8a874, rock: 0x9a8e7a, leaf: [0x3a6a2e, 0x5a9040], bark: 0x6a5238, mtn: 0x8fb0a8,
    veg: { broad: 80, palm: 340, fern: 380, grass: 900, rock: 120, dead: 0 }, motes: 0xffffff,
  },
  { // Frozen Peaks: snowy pass between icy mountains, falling snow
    seed: 103, len: 440, trees: { n: 2, k: 1.4, near: 0.8, giants: 6 }, curve: [[10, 50, 0.4], [4, 20, 2.4]], hills: [[3.0, 46, 0.2], [1.2, 18, 1.4]], snow: true, twilight: true,
    skyTop: 0x101c4a, skyHor: 0x4a7a9c, fog: 0x6d8ba8, fogNear: 26, fogFar: 210, sunDir: [0.45, 0.5, 0.4], sunCol: 0xa8c0ff, sunI: 2.0,
    hemiSky: 0xa8c8ff, hemiGround: 0x7e8a96, hemiI: 1.75, grass: [0xc4ced6, 0xe2e9ee], dirt: 0x8a8580, rock: 0x666a72, leaf: [0x1c3628, 0x2a4a36], bark: 0x3a2e24, mtn: 0x4e5d78,
    veg: { broad: 150, palm: 0, fern: 0, grass: 260, rock: 220, dead: 90 }, motes: 0xffffff,
  },
];

const tmpV = new THREE.Vector3();

// weather presets: rain amount, fog distance factor, darkening, thunderstorm
export const WEATHER = {
  clear: { rain: 0, fogK: 1, dark: 0, storm: 0 },
  rain: { rain: 0.75, fogK: 0.62, dark: 0.32, storm: 0 },
  fog: { rain: 0, fogK: 0.3, dark: 0.12, storm: 0 },
  storm: { rain: 1, fogK: 0.5, dark: 0.58, storm: 1 },
};

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.root = null; this.env = null; this.time = 0;
    this.windU = { value: 0 };
    this.quality = 1;
    this.trees = { n: 1, k: 1, near: 1, giants: 0 };   // tree count / size / closeness / giant emergent trees (tunable)
    // lights (persist across missions)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.wx = Object.assign({}, WEATHER.clear); this.wxT = Object.assign({}, WEATHER.clear); this.lightning = 0; this.boltT = 6; this.onLightning = null;
    // rain streaks around the camera (one draw call)
    const N = 1400, rp = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 44, y = Math.random() * 24, z = (Math.random() - 0.5) * 44; rp.set([x, y, z, x + 0.05, y + 0.6, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xc8d4dc, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false; this.scene.add(this.rain);
    this.lite = false; this.tick = 0;
  }
  // slow device: thin out the costliest extras (called when resolution has already dropped as far as it can)
  shed() { if (this.lite) return; this.lite = true; this.sun.shadow.autoUpdate = false; this.sun.shadow.needsUpdate = true; if (this.beams) this.beams.visible = false; }
  setWeather(kind, instant) { this.wxT = Object.assign({}, WEATHER[kind] || WEATHER.clear); this.wxKind = kind; if (instant) Object.assign(this.wx, this.wxT); }
  setShadowSize(n) { this.sun.shadow.mapSize.set(n, n); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }

  /* ---------- track: centre line x(s), height y(s); s = metres travelled, world z = -s ---------- */
  xr(s) { let x = 0; for (const [a, l, p] of this.env.curve) x += a * Math.sin(s / l + p); return x; }
  yr(s) { let y = 0; for (const [a, l, p] of this.env.hills) y += a * Math.sin(s / l + p); return y; }
  posAt(s, out = new THREE.Vector3()) { return out.set(this.xr(s), this.yr(s), -s); }
  dirAt(s, out = new THREE.Vector3()) { return out.set(this.xr(s + 1) - this.xr(s - 1), this.yr(s + 1) - this.yr(s - 1), -2).normalize(); }
  curvature(s) { return (this.xr(s + 4) - 2 * this.xr(s) + this.xr(s - 4)) / 16; }
  // terrain height anywhere
  height(x, z) {
    const E = this.env, s = -z, base = this.yr(s), dx = x - this.xr(s), ad = Math.abs(dx);
    const n = fbm(x * 0.018 + E.seed, z * 0.018, 4);
    const far = smooth(3.6, 15, ad);
    let h = base + far * ((n - 0.42) * 16 + ad * 0.06) + fbm(x * 0.16, z * 0.16, 2) * 0.5 * far;
    if (ad < 3.6) { const r1 = Math.abs(ad - 0.95); if (r1 < 0.3) h -= (0.3 - r1) * 0.18; }
    if (E.river) {
      if (dx < 0) { h = lerp(h, E.waterY - 2.4, smooth(5.0, 10, -dx)); h += smooth(48, 72, -dx) * (14 + n * 10); }
      else h += smooth(13, 26, dx) * (12 + n * 14);
    }
    if (E.volcano) h += smooth(20, 60, ad) * n * 6;
    if (E.swamp) { const isl = fbm(x * 0.05 + 3, z * 0.05, 3); h = lerp(h, E.waterY - 1.6 + Math.max(0, isl - 0.55) * 9, smooth(4.5, 9, ad)); }
    if (E.canyon) { const wall = smooth(20, 34, ad); h += wall * (22 + n * 18) + smooth(34, 60, ad) * 10; h = wall > 0.3 ? Math.round(h / 3.2) * 3.2 * 0.35 + h * 0.65 : h; }
    if (E.plains) h = base + far * ((n - 0.45) * 7 + ad * 0.02) + fbm(x * 0.16, z * 0.16, 2) * 0.3 * far;
    return h;
  }
  // height of the rendered terrain mesh (same triangles), so feet sit exactly on what you see
  ground(x, z) {
    const g = this.hgrid; if (!g) return this.height(x, z);
    const fx = (x - g.xmin) / g.step, fz = (g.z0 - z) / g.step, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= g.nx - 1 || j >= g.nz - 1) return this.height(x, z);
    const u = fx - i, v = fz - j, k = j * g.nx + i, a = g.H[k], b = g.H[k + 1], d = g.H[k + g.nx], e = g.H[k + g.nx + 1];
    return u + v <= 1 ? a + (b - a) * u + (d - a) * v : e + (d - e) * (1 - u) + (b - e) * (1 - v);
  }
  roadDx(x, z) { return x - this.xr(-z); }

  build(i) {
    this.dispose();
    const E = this.env = ENV[i];
    this.trees = Object.assign({ n: 1, k: 1, near: 1, giants: 0 }, E.trees);   // dense jungle on the jungle missions (v3.6)
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.beams = this.fallTex = this.lavaTex = this.auroraMat = this.skyObjs = null; this.shrooms = null;
    this.scene.fog = new THREE.Fog(E.fog, E.fogNear, E.fogFar);
    this.scene.background = new THREE.Color(E.fog);
    this.hemi.color.set(E.hemiSky); this.hemi.groundColor.set(E.hemiGround); this.hemi.intensity = E.hemiI * 0.6;
    this.sun.color.set(E.sunCol); this.sun.intensity = E.sunI * 0.75;
    this.sunDir = new THREE.Vector3(...E.sunDir).normalize();
    this.base = Object.assign({ sunI: this.sun.intensity, hemiI: this.hemi.intensity, fog: new THREE.Color(E.fog), top: new THREE.Color(E.skyTop), hor: new THREE.Color(E.skyHor) }, Sc.cloudColors(E));
    this.buildSky(); this.buildTerrain(); this.planRuins(); this.buildVeg(); this.buildRuins();
    if (E.river || E.swamp) this.buildWater();
    if (E.volcano) this.buildVolcano();
    this.buildMotes();
    Sc.buildRoad(this); Sc.buildBeams(this);
    if (E.river && !E.lagoon) Sc.buildFalls(this);
    if (E.volcano) Sc.buildLava(this);
    if (E.night) Sc.buildNight(this, this.shrooms);
    if (E.twilight) Sc.buildAurora(this);
    // image-based lighting from the sky so PBR materials pick up the mood
    const envScene = new THREE.Scene(); envScene.add(this.sky.clone());
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0.02, 0.1, 1000);
    this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = 0.3;
  }
  dispose() {
    if (!this.root) return;
    this.scene.remove(this.root);
    this.root.traverse(o => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { for (const k of ['map', 'normalMap', 'alphaMap', 'emissiveMap', 'bumpMap']) if (m[k] && !m[k].userData.keep) m[k].dispose(); m.dispose(); } } });
    this.root = null;
  }

  buildSky() {
    const E = this.env;
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(E.skyTop) }, hor: { value: new THREE.Color(E.skyHor) }, sunDir: { value: this.sunDir }, sunCol: { value: new THREE.Color(E.sunCol) }, fogc: { value: new THREE.Color(E.fog) }, cl: { value: Sc.cloudMap() }, t: { value: 0 }, cover: { value: 0 }, glow: { value: E.night || E.twilight ? 0 : 1 }, lit: { value: this.base.lit.clone() }, dark: { value: this.base.dark.clone() } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: Sc.SKY_FRAG,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat); this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.root.add(this.sky);
    // distant mountain ranges (hazy, never reached)
    this.mtn = Sc.ridges(E); this.root.add(this.mtn);
  }

  buildTerrain() {
    const E = this.env, step = 2.2;
    let xmin = 1e9, xmax = -1e9; for (let s = -80; s < E.len + 220; s += 4) { const x = this.xr(s); xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); }
    xmin -= 150; xmax += 150; const z0 = 80, z1 = -(E.len + 230);
    const nx = Math.ceil((xmax - xmin) / step) + 1, nz = Math.ceil((z0 - z1) / step) + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    const gA = new THREE.Color(E.grass[0]), gB = new THREE.Color(E.grass[1]), dirt = new THREE.Color(E.dirt), rock = new THREE.Color(E.rock), mud = new THREE.Color(0x5a4a34), c = new THREE.Color();
    const H = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = xmin + i * step, z = z0 - j * step; H.push(this.height(x, z)); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = xmin + i * step, z = z0 - j * step, h = H[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
      const hx = H[j * nx + Math.min(i + 1, nx - 1)] - h, hz = H[Math.min(j + 1, nz - 1) * nx + i] - h, slope = Math.sqrt(hx * hx + hz * hz) / step;
      const ad = Math.abs(this.roadDx(x, z)), n = fbm(x * 0.07, z * 0.07, 3);
      c.copy(gA).lerp(gB, clamp(n * 1.6 - 0.3, 0, 1));
      c.lerp(dirt, smooth(5.2, 3.0, ad) * 0.95);
      if (ad < 3.4) { const r1 = Math.abs(ad - 0.95); if (r1 < 0.32) c.multiplyScalar(0.8); if (ad < 0.35) c.lerp(gA, 0.35); }
      c.lerp(rock, smooth(0.55, 1.1, slope));
      if ((E.river || E.swamp) && h < E.waterY + 0.9) c.lerp(mud, smooth(E.waterY + 0.9, E.waterY + 0.1, h));
      if (E.canyon) { const band = 0.5 + 0.5 * Math.sin(h * 1.7 + fbm(x * 0.03, z * 0.03, 2) * 3); c.lerp(new THREE.Color(band > 0.5 ? 0xb8643e : 0xd89a6a), smooth(4, 10, h - this.yr(-z)) * 0.85); }
      if (E.volcano) c.lerp(new THREE.Color(0x3a3430), smooth(0.55, 0.85, fbm(x * 0.02 + 9, z * 0.02, 3)) * 0.6);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    this.hgrid = { xmin, z0, step, nx, nz, H: Float32Array.from(H) };
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let p = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1; idx[p++] = a; idx[p++] = b; idx[p++] = d; idx[p++] = b; idx[p++] = e; idx[p++] = d; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    if (!this.detail) { this.detail = detailTexture(5, 215, 42); this.detail.userData.keep = true; }
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.detail, roughness: 0.96, metalness: 0 });
    this.terrain = new THREE.Mesh(g, m); this.terrain.receiveShadow = true;
    this.root.add(this.terrain);
  }

  buildWater() {
    const E = this.env;
    const nt = canvasTex(256, 256, (g, w, h) => { // ripple normal map
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const f = (u, v) => Math.sin(u * 0.098 + Math.sin(v * 0.05) * 2) + Math.sin(v * 0.147 + u * 0.03) * 0.7 + vnoise(u / 9, v / 9) * 1.2;
        const dx = f(x + 1, y) - f(x - 1, y), dy = f(x, y + 1) - f(x, y - 1), i = (y * w + x) * 4;
        img.data[i] = 128 + dx * 40; img.data[i + 1] = 128 + dy * 40; img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, { repeat: true, linear: true });
    nt.repeat.set(30, 60);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x2e6f78, roughness: 0.12, metalness: 0.05, normalMap: nt, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.88, envMapIntensity: 1.4 });
    const g = new THREE.PlaneGeometry(E.swamp ? 700 : 400, E.len + 400); g.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(g, this.waterMat); this.water.position.set(E.swamp ? 0 : -60, E.waterY, -E.len / 2);
    if (E.swamp) this.waterMat.color.set(0x3c5a3e); else if (E.lagoon) this.waterMat.color.set(0x2a9aa4); else this.waterMat.color.set(0x2e6f78); this.water.receiveShadow = true;
    this.root.add(this.water);
  }

  buildVolcano() {
    const E = this.env, grp = new THREE.Group();
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(lerp(230, 26, Math.pow(t, 0.7)), t * 170)); } pts.push(new THREE.Vector2(18, 160));
    const cone = new THREE.LatheGeometry(pts, 40);
    const pa = cone.attributes.position; const cols = [];
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i), a = Math.atan2(pa.getZ(i), pa.getX(i)); const ridge = Math.abs(Math.sin(a * 7)) * 8 * (1 - y / 170); pa.setX(i, pa.getX(i) * (1 + ridge * 0.004)); pa.setZ(i, pa.getZ(i) * (1 + ridge * 0.004));
      const lava = y > 120 && Math.sin(a * 5 + 1) > 0.75 ? 1 : 0; cols.push(0.32 + lava * 0.6, 0.27 + lava * 0.12, 0.28); }
    cone.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); cone.computeVertexNormals();
    const vm = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, emissive: 0x220800 });
    const v = new THREE.Mesh(cone, vm); grp.add(v);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, 'rgba(255,190,90,1)'], [0.3, 'rgba(255,110,40,0.6)'], [1, 'rgba(255,80,20,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.set(160, 120, 1); glow.position.y = 175; grp.add(glow);
    // smoke column
    const smokeTex = radialTex([[0, 'rgba(90,80,85,0.9)'], [0.6, 'rgba(90,80,85,0.45)'], [1, 'rgba(90,80,85,0)']]);
    this.smoke = [];
    for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, fog: false, opacity: 0.7 })); s.userData.u = i / 14; grp.add(s); this.smoke.push(s); }
    grp.position.set(-160, -20, -700); this.volcano = grp;
    this.root.add(grp);
  }

  buildMotes() {
    const N = 260, pos = new Float32Array(N * 3), r = rng(this.env.seed + 5);
    for (let i = 0; i < N; i++) { pos[i * 3] = (r() - 0.5) * 60; pos[i * 3 + 1] = r() * 14; pos[i * 3 + 2] = (r() - 0.5) * 60; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = radialTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']], 32);
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ color: this.env.motes, size: this.env.volcano ? 0.3 : this.env.night ? 0.3 : this.env.snow ? 0.12 : 0.09, map: tex, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false; this.root.add(this.motes);
  }

  /* ---------- vegetation ---------- */
  vegGeoms() {
    if (this._veg) return this._veg;
    const V = {};
    const ensure = (g, col) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count; if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2)); if (!g.attributes.color) { const c = new Float32Array(n * 3).fill(col == null ? 1 : col); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); } return g; };
    const shade = (g, f) => { const p = g.attributes.position, c = g.attributes.color; for (let i = 0; i < p.count; i++) { const k = f(p.getX(i), p.getY(i), p.getZ(i)); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); } };
    // broadleaf tree: trunk + lumpy crown
    { const trunk = new THREE.CylinderGeometry(0.22, 0.42, 9, 8, 4); trunk.translate(0, 4.5, 0);
      const tp = trunk.attributes.position; for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + Math.sin(y * 0.4) * 0.25); }
      const roots = new THREE.ConeGeometry(0.85, 1.4, 8, 1, true); roots.translate(0, 0.7, 0);
      V.broadTrunk = mergeGeometries([ensure(trunk), ensure(roots)]); V.broadTrunk.computeVertexNormals();
      const blobs = []; const r = rng(3);
      const B = [[0, 0, 0, 2.6], [-1.9, -0.4, 0.6, 1.9], [1.8, -0.3, -0.5, 2.0], [0.4, 0.9, 1.6, 1.8], [-0.6, 0.7, -1.7, 1.9], [0.2, 1.6, 0.1, 1.7], [2.4, -1.0, 1.4, 1.3], [-2.3, -0.9, -1.5, 1.3]];
      for (const [x, y, z, s] of B) { const g = new THREE.IcosahedronGeometry(s * 0.74, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (vnoise(p.getX(i) * 1.7 + x * 3, p.getY(i) * 1.7 + p.getZ(i)) - 0.5) * 0.45; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); } g.translate(x * 0.74, y * 0.72 + 9.6, z * 0.74); blobs.push(ensure(g)); }
      V.broadCrown = mergeGeometries(blobs); V.broadCrown.computeVertexNormals();
      shade(V.broadCrown, (x, y) => 0.55 + 0.45 * clamp((y - 7.4) / 4, 0, 1)); }
    // frond (shared by palms, tree ferns, ground ferns): bent strip with a leaf alpha texture
    const frond = (len, wid, droop, seg = 6) => { const pos = [], uv = [], idx = [];
      for (let i = 0; i <= seg; i++) { const t = i / seg, y = Math.sin(t * Math.PI * 0.55) * len * 0.35 - droop * t * t * len, z = t * len, w = wid * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (1 - t * 0.3) + 0.02;
        pos.push(-w, y + w * 0.25, z, w, y + w * 0.25, z); uv.push(0, t, 1, t); if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return ensure(g); };
    const crownOf = (n, len, wid, droop, y, tilt) => { const fs = []; for (let i = 0; i < n; i++) { const f = frond(len * (0.85 + (i % 3) * 0.1), wid, droop); f.rotateX(-tilt + (i % 2) * 0.15); f.rotateY(i / n * Math.PI * 2 + (i % 2) * 0.2); f.translate(0, y, 0); fs.push(f); } return mergeGeometries(fs); };
    { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, 2.5, 0.1), new THREE.Vector3(0.9, 5, 0), new THREE.Vector3(1.4, 7.2, 0.2)]);
      const t = new THREE.TubeGeometry(c, 10, 0.24, 7, false); const tp = t.attributes.position; for (let i = 0; i < tp.count; i++) tp.setY(i, tp.getY(i) + Math.sin(tp.getY(i) * 9) * 0.03);
      V.palmTrunk = ensure(t); V.palmTrunk.computeVertexNormals();
      const cr = crownOf(10, 3.6, 0.42, 0.9, 0, 0.35); cr.translate(1.4, 7.2, 0.2); V.palmCrown = cr; }
    { V.fern = crownOf(8, 1.1, 0.22, 0.6, 0.05, 0.6); }
    { const bl = []; for (let i = 0; i < 3; i++) { const p = new THREE.PlaneGeometry(0.9, 0.55); p.translate(0, 0.27, 0); p.rotateY(i * Math.PI / 3); bl.push(ensure(p)); } V.grass = mergeGeometries(bl); shade(V.grass, (x, y) => 0.6 + 0.4 * clamp(y / 0.5, 0, 1)); }
    { const g = new THREE.IcosahedronGeometry(1, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (vnoise(x * 2.1 + 5, y * 2.1 + z * 1.3) - 0.5) * 0.55; p.setXYZ(i, x * k * 1.2, Math.max(y * k * 0.7, -0.25), z * k); }
      V.rock = ensure(g); V.rock.computeVertexNormals(); const c = V.rock.attributes.color, pp = V.rock.attributes.position, n = V.rock.attributes.normal;
      for (let i = 0; i < c.count; i++) { const moss = clamp(n.getY(i) * 1.5 - 0.6, 0, 1); c.setXYZ(i, lerp(1, 0.55, moss), lerp(1, 0.75, moss), lerp(1, 0.4, moss)); } }
    { const parts = [new THREE.CylinderGeometry(0.12, 0.3, 7, 6)]; parts[0].translate(0, 3.5, 0);
      for (const [a, y, l] of [[0.9, 4.0, 2.4], [-1.0, 5.2, 2.0], [0.6, 6.0, 1.6]]) { const b = new THREE.CylinderGeometry(0.05, 0.11, l, 5); b.translate(0, l / 2, 0); b.rotateZ(a); b.translate(0, y, 0); parts.push(b); }
      V.dead = mergeGeometries(parts.map(g => ensure(g))); V.dead.computeVertexNormals(); }
    for (const k in V) V[k].userData.keep = true; this._veg = V; return V;
  }
  leafTex() {
    if (this._leafTex) return this._leafTex;
    this._leafTex = canvasTex(128, 256, (g, w, h) => { // pinnate frond: midrib + leaflets
      g.clearRect(0, 0, w, h); g.strokeStyle = '#d8e8b0'; g.lineCap = 'round';
      for (let y = 6; y < h - 4; y += 7) { const t = y / h, L = w * 0.47 * Math.sin(Math.min(1, t * 1.1) * Math.PI) + 4; g.lineWidth = 5 - t * 2;
        g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 - L, y + 10); g.moveTo(w / 2, y); g.lineTo(w / 2 + L, y + 10); g.stroke(); }
      g.lineWidth = 4; g.strokeStyle = '#c8d89a'; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    });
    this._leafTex.userData.keep = true;
    this._grassTex = canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); for (let i = 0; i < 26; i++) { const x = 8 + Math.random() * (w - 16), hh = h * (0.5 + Math.random() * 0.5), lean = (Math.random() - 0.5) * 30; g.strokeStyle = `rgb(${200 + Math.random() * 40},${225 + Math.random() * 30},${150 + Math.random() * 40})`; g.lineWidth = 3 + Math.random() * 2; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x, h - hh * 0.6, x + lean, h - hh); g.stroke(); } });
    this._grassTex.userData.keep = true;
    return this._leafTex;
  }
  swayMat(m, amt) {
    m.onBeforeCompile = sh => { sh.uniforms.uWind = this.windU; sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>\n#ifdef USE_INSTANCING\n vec3 ip = instanceMatrix[3].xyz;\n#else\n vec3 ip = vec3(0.);\n#endif\n float sw = sin(uWind*1.6 + ip.x*0.37 + ip.z*0.21) + 0.4*sin(uWind*3.1 + ip.z*0.5);\n transformed.x += sw * ${amt.toFixed(3)} * max(position.y, 0.);\n transformed.z += sw * ${(amt * 0.6).toFixed(3)} * max(position.y, 0.);`); };
    m.customProgramCacheKey = () => 'sway' + amt; return m;
  }
  buildVeg() {
    const E = this.env, V = this.vegGeoms(), leafT = this.leafTex(), r = rng(E.seed * 7), q = this.quality * E.len / 310;
    const bark = new THREE.MeshStandardMaterial({ color: new THREE.Color(E.bark).multiplyScalar(1.7), roughness: 0.95, map: Sc.barkTex() });
    const leafA = new THREE.Color(E.leaf[0]), leafB = new THREE.Color(E.leaf[1]);
    const crownM = this.swayMat(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, map: this.detail }), 0.006);
    const frondM = this.swayMat(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: leafT, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }), 0.025);
    const grassM = this.swayMat(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: this._grassTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }), 0.12);
    const rockM = new THREE.MeshStandardMaterial({ color: E.rock, vertexColors: true, roughness: 0.9, map: this.detail });
    // light both sides of a leaf card the same way, otherwise the far side of a crown turns black
    const soft = (m, key) => { const prev = m.onBeforeCompile; m.onBeforeCompile = (sh, rr) => { prev(sh, rr); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;')); }; m.customProgramCacheKey = () => key; return m; };
    const cardM = this.swayMat(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: Sc.clumpTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82 }), 0.008);
    if (E.snow) { const p = cardM.onBeforeCompile; cardM.onBeforeCompile = (sh, rr) => { p(sh, rr); sh.vertexShader = 'varying float vUpN;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vUpN = objectNormal.y;'); sh.fragmentShader = 'varying float vUpN;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92,0.95,1.0), smoothstep(0.1, 0.62, vUpN));'); }; }
    soft(cardM, 'cards' + !!E.snow);
    const earM = soft(this.swayMat(new THREE.MeshStandardMaterial({ map: Sc.earTex(), side: THREE.DoubleSide, roughness: 0.55 }), 0.03), 'ear');
    const flowerM = soft(this.swayMat(new THREE.MeshStandardMaterial({ map: Sc.flowerTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }), 0.05), 'flower');
    const rb = rng(E.seed * 3 + 2), blooms = (E.night || E.snow || E.canyon || E.volcano) ? [] : [0xf07aa8, 0xf4c440, 0xf07a3c, 0xc78af0];
    const deadM = new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 1 });
    const place = (n, minD, maxD, opts = {}) => { const out = []; let tries = 0;
      while (out.length < n && tries++ < n * 8) {
        const s = -40 + r() * (E.len + 200), side = r() < 0.5 ? -1 : 1, d = minD + Math.pow(r(), opts.pow || 1.4) * (maxD - minD);
        const z = -s, x = this.xr(s) + side * d, h = this.height(x, z);
        if ((E.river || E.swamp) && h < E.waterY + 0.25 && !opts.water) continue;
        if (opts.side && side !== opts.side) continue;
        if (opts.clump && fbm(x * 0.09 + 4, z * 0.09, 2) < opts.clump) continue;
        if (this.ruinSpots && !opts.water && this.ruinSpots.some(q => (q.x - x) ** 2 + (q.z - z) ** 2 < q.r * q.r)) continue;
        out.push([x, (opts.snap ? this.ground(x, z) : h) + (opts.lift || 0), z]); }
      return out; };
    // instanced meshes are split into 40 m chunks along the track so frustum + distance culling can skip them
    this.vegMeshes = [];
    const inst = (parts, pts, sc, tilt = 0.1) => {
      const by = new Map(); for (const p of pts) { const c = Math.floor(-p[2] / 40); if (!by.has(c)) by.set(c, []); by.get(c).push(p); }
      const Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), e = new THREE.Euler(), col = new THREE.Color();
      for (const list of by.values()) {
        const Ms = list.map(p => { const k = sc[0] + r() * (sc[1] - sc[0]); e.set((r() - 0.5) * tilt, r() * 6.28, (r() - 0.5) * tilt); Q.setFromEuler(e); S.set(k, k * (0.85 + r() * 0.3), k); P.set(p[0], p[1] - 0.05, p[2]); return new THREE.Matrix4().compose(P, Q, S); });
        for (const pt of parts) {
          const m = new THREE.InstancedMesh(pt.geo, pt.mat, list.length);
          Ms.forEach((M, i) => { m.setMatrixAt(i, M); if (pt.color) m.setColorAt(i, pt.color(col)); });
          m.castShadow = !!pt.cast; m.receiveShadow = true; m.computeBoundingSphere(); this.root.add(m); this.vegMeshes.push(m);
        }
      }
    };
    const leafCol = c => c.copy(leafA).lerp(leafB, r()).multiplyScalar(0.85 + r() * 0.3);
    const v = E.veg;
    const TR = this.trees, tk = TR.k, tn = TR.n * q;
    const vines = !E.snow && !E.canyon && !E.plains, cardCol = c => { c.copy(leafA).lerp(leafB, rb()).multiplyScalar((0.85 + rb() * 0.3) * 1.5); if (blooms.length && rb() < 0.13) c.set(blooms[Math.floor(rb() * blooms.length)]).multiplyScalar(1.05); return c; };
    const broadP = [{ geo: V.broadTrunk, mat: bark, cast: true }, { geo: V.broadCrown, mat: crownM, cast: true, color: c => leafCol(c).multiplyScalar(0.42) }, { geo: Sc.cardGeo(vines), mat: cardM, cast: this.quality >= 1, color: cardCol }];
    if (v.broad) inst(broadP, place(Math.round(v.broad * tn), 9 * TR.near, 120, { pow: 1.6 }), [0.8 * tk, 1.35 * tk], 0.06);
    if (v.broad && TR.giants) inst(broadP, place(Math.round(TR.giants * q), 14, 70, { pow: 1.2 }), [2.2, 2.9], 0.04);   // emergent giants
    if (v.palm) inst([{ geo: V.palmTrunk, mat: bark, cast: true }, { geo: V.palmCrown, mat: frondM, cast: true, color: c => c.copy(leafA).lerp(leafB, r()).multiplyScalar(0.9 + r() * 0.4) }], place(Math.round(v.palm * tn), 6.5 * TR.near, 90, { pow: 1.5 }), [0.7 * tk, 1.3 * tk], 0.05);
    if (v.fern) inst([{ geo: V.fern, mat: frondM, color: c => c.copy(leafB).lerp(leafA, r() * 0.6).multiplyScalar(1.0 + r() * 0.3) }], place(Math.round(v.fern * q), 3.9, 40, { pow: 1.8 }), [0.8, 1.6]);
    if (v.grass) inst([{ geo: V.grass, mat: grassM, color: c => c.set(E.grass[1]).lerp(new THREE.Color(E.grass[0]), r() * 0.7).multiplyScalar(1.15) }], place(Math.round(v.grass * q), 3.7, 30, { pow: 2 }), [0.8, 1.5]);
    if (v.rock) { inst([{ geo: V.rock, mat: rockM, cast: true }], place(Math.round(v.rock * 0.7), 4.5, 70, { water: true }), [0.4, 1.4], 0.5); inst([{ geo: V.rock, mat: rockM, cast: true }], place(Math.round(v.rock * 0.3), 14, 90, { water: true }), [2.0, 4.5], 0.5); }
    if (v.dead) inst([{ geo: V.dead, mat: deadM, cast: true }], place(v.dead, 6, 80), [0.8, 1.4]);
    // ground dressing: pebbles on the verge, drifts of flowers, fallen logs, big-leaf plants
    const qa = this.quality;
    inst([{ geo: Sc.pebbleGeo(), mat: rockM, color: c => c.setScalar(0.8 + r() * 0.5) }], place(Math.round(420 * qa), 2.4, 7, { pow: 1.3, snap: true }), [0.07, 0.3], 0.8);
    if (!E.snow && !E.volcano && !E.night) inst([{ geo: Sc.flowerGeo(E.canyon), mat: flowerM }], place(Math.round((E.canyon ? 90 : 340) * qa), 4.6, 22, { pow: 1.5, clump: 0.42, snap: true }), [0.9, 1.5], 0);
    if (!E.canyon && !E.plains) inst([{ geo: Sc.logGeo(), mat: new THREE.MeshStandardMaterial({ color: E.bark, roughness: 1, map: this.detail }), cast: true, color: c => c.set(0xffffff).lerp(new THREE.Color(0x6f8a4a), r() * 0.5) }], place(Math.round(34 * qa), 5, 24, { snap: true, lift: 0.3 }), [0.8, 1.4], 0.12);
    if (v.broad > 100 && !E.snow) inst([{ geo: Sc.earGeo(), mat: earM, color: c => c.copy(leafB).lerp(leafA, r() * 0.8).multiplyScalar(1.5) }], place(Math.round(300 * qa), 5.5, 24, { pow: 1.5, snap: true }), [0.8, 1.4], 0.1);
    // signature props
    if (E.volcano) inst([{ geo: Sc.pebbleGeo(), mat: new THREE.MeshStandardMaterial({ color: 0x2a2526, roughness: 0.95, map: this.detail }), cast: true }], place(Math.round(90 * qa), 6, 26, { snap: true }), [0.5, 1.8], 0.6);
    if (E.night) { const pts = place(Math.round(240 * qa), 3.6, 18, { pow: 1.2, snap: true }); this.shrooms = pts; inst([{ geo: Sc.mushroomGeo(), mat: new THREE.MeshStandardMaterial({ color: 0x0f4a60, emissive: 0x12a8d0, emissiveIntensity: 0.85, roughness: 0.5 }) }], pts, [0.5, 1.25], 0.2); }
    if (E.twilight) inst([{ geo: Sc.iceGeo(), mat: new THREE.MeshStandardMaterial({ color: 0x8fd4ff, emissive: 0x2a78c8, emissiveIntensity: 0.65, roughness: 0.12, metalness: 0.15, envMapIntensity: 2.2 }), cast: true }], place(Math.round(70 * qa), 6.5, 28, { pow: 1.1, snap: true }), [0.35, 1.0], 0.25);
  }

  updWeather(dt, cam) {
    const w = this.wx, t = this.wxT, k = Math.min(1, dt * 0.35), B = this.base, E = this.env; if (!B) return;
    for (const key in t) w[key] += (t[key] - w[key]) * k;
    const gray = new THREE.Color(E.night ? 0x2a3242 : E.snow ? 0x56687e : 0x7d8790), dark = w.dark;
    this.scene.fog.far = Math.max(45, E.fogFar * w.fogK); this.scene.fog.near = Math.min(E.fogNear, this.scene.fog.far * 0.12 + 4);
    this.scene.fog.color.copy(B.fog).lerp(gray, dark * 0.75); this.scene.background.copy(this.scene.fog.color);
    const u = this.sky.material.uniforms; u.top.value.copy(B.top).lerp(gray, dark * 0.85); u.hor.value.copy(B.hor).lerp(gray, dark * 0.8); u.fogc.value.copy(this.scene.fog.color);
    u.sunCol.value.set(E.sunCol).multiplyScalar(1 - dark * 0.95);
    u.lit.value.copy(B.lit).lerp(gray, dark * 0.85); u.dark.value.copy(B.dark).lerp(gray, dark * 0.9).multiplyScalar(1 - dark * 0.25); u.cover.value = dark * 0.22;
    { const m = this.mtn.material.uniforms; m.shade.value = 1 - dark * 0.45; m.haze.value = clamp(1 - w.fogK, 0, 1) * 0.9; m.fogc.value.copy(this.scene.fog.color); }
    { const vis = clamp((w.fogK - 0.3) / 0.7, 0, 1) * (1 - dark);   // moon, stars and northern lights fade behind weather
      if (this.skyObjs) for (const o of this.skyObjs) o.material.opacity = vis;
      if (this.auroraMat) this.auroraMat.uniforms.vis.value = vis;
      if (this.beams) this.beams.material.opacity = clamp(1 - dark * 1.5, 0, 1); }
    // lightning in storms
    if (w.storm > 0.6 && !E.snow && (this.boltT -= dt) <= 0) { this.boltT = 5 + Math.random() * 7; this.lightning = 1; if (this.onLightning) this.onLightning(); }
    this.lightning = Math.max(0, this.lightning - dt * 3.5);
    const fl = this.lightning > 0.6 || (this.lightning > 0.2 && this.lightning < 0.35) ? this.lightning : 0;
    this.sun.intensity = B.sunI * (1 - dark * 0.85); this.hemi.intensity = B.hemiI * (1 - dark * 0.35) + fl * 4;
    if (this.terrain) this.terrain.material.roughness = 0.96 - w.rain * 0.4;
    // rain streaks
    this.rain.visible = w.rain > 0.02; this.rain.material.opacity = w.rain * (E.snow ? 0.95 : 0.5); this.rain.material.color.set(E.snow ? 0xffffff : 0xc8d4dc);
    if (this.rain.visible) { this.rain.position.set(cam.position.x, cam.position.y - 6, cam.position.z);
      const p = this.rain.geometry.attributes.position, a = p.array, fall = (E.snow ? 2.6 : 20) * dt, seg = E.snow ? 0.09 : 0.6, tt = this.time;
      for (let i = 0; i < a.length; i += 6) { let y = a[i + 1] - fall; if (y < 0) y += 24; a[i + 1] = y; a[i + 4] = y + seg; if (E.snow) { const dx = Math.sin(tt * 0.9 + i) * dt * 0.6; a[i] += dx; a[i + 3] = a[i] + 0.06; } }
      p.needsUpdate = true; }
  }

  /* ---------- ruins: abandoned ranger outposts (our own design), overgrown ---------- */
  planRuins() {
    const E = this.env, r = rng(E.seed * 17 + 3), kinds = ['bunker', 'fence', 'tower', 'bunker', 'wreck', 'fence', 'bunker', 'tower'];
    this.ruinSpots = [];
    for (let i = 0; i < 6; i++) {
      const s = 45 + (i + r() * 0.6) * (E.len - 60) / 6, kind = kinds[(i + E.seed) % kinds.length];
      let side = r() < 0.5 ? -1 : 1; if (E.river) side = 1;
      const lat = kind === 'fence' ? 6.2 + r() * 1.5 : kind === 'wreck' ? 6.5 + r() * 2 : 8.5 + r() * 3;
      const base = this.posAt(s), f = this.dirAt(s), R = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
      const p = base.clone().addScaledVector(R, side * lat); p.y = this.height(p.x, p.z);
      if (E.swamp && p.y < E.waterY + 0.3) continue;
      this.ruinSpots.push({ s, kind, side, lat, x: p.x, z: p.z, y: p.y, f, r: kind === 'fence' ? 4 : kind === 'wreck' ? 4 : 8, rs: r() });
    }
  }
  buildRuins() {
    const E = this.env, r = rng(E.seed * 13 + 1);
    const M = {
      con: new THREE.MeshStandardMaterial({ color: 0x8e8a80, roughness: 0.95, map: this.detail }),
      moss: new THREE.MeshStandardMaterial({ color: 0x6f7a52, roughness: 0.95, map: this.detail }),
      rust: new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.75, metalness: 0.35 }),
      vine: new THREE.MeshStandardMaterial({ color: E.leaf[0], roughness: 0.9, side: THREE.DoubleSide }),
      wood: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 1 }),
    };
    const cluster = (kind) => {
      const parts = { con: [], moss: [], rust: [], vine: [], wood: [], dark: [] };
      const box = (m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); parts[m].push(g); };
      const cyl = (m, rad, h, x, y, z, rx = 0, rz = 0) => { const g = new THREE.CylinderGeometry(rad, rad, h, 6); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); parts[m].push(g); };
      const wall = (x0, z0, x1, z1, H, holeAt = -1) => { // broken wall: continuous slab with a jagged, crumbling top
        const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(3, Math.round(L / 0.55)), ang = Math.atan2(z1 - z0, x1 - x0), ph = r() * 10;
        for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; if (holeAt >= 0 && Math.abs(u - (holeAt + 0.5) / 3) < 0.09) continue;   // doorway gap
          const h = H * (0.5 + 0.35 * Math.sin(u * 5 + ph) + 0.15 * Math.sin(u * 17 + ph * 2)) * (r() < 0.06 ? 0.4 : 1) + r() * 0.15;
          box(r() < 0.22 ? 'moss' : 'con', L / n + 0.03, h + 0.5, 0.32, lerp(x0, x1, u), h / 2 - 0.25, lerp(z0, z1, u), 0, -ang, 0);
          if (h > H * 0.6 && r() < 0.18) cyl('rust', 0.02, 0.7, lerp(x0, x1, u), h + 0.25, lerp(z0, z1, u), r() - 0.5, r() - 0.5); }
        for (let i = 0; i < 3; i++) { const u = r(); box('vine', 0.05, H * (0.4 + 0.4 * r()), 0.6 + r(), lerp(x0, x1, u), H * 0.35, lerp(z0, z1, u), 0, -ang + Math.PI / 2, 0); }
        // window slot: dark recess near the top of the tallest stretch
        if (L > 3 && r() < 0.7) { const u = 0.3 + r() * 0.4; box('dark', 0.9, 0.5, 0.34, lerp(x0, x1, u), H * 0.55, lerp(z0, z1, u), 0, -ang, 0); }
      };
      if (kind === 'bunker') {
        const w = 6 + r() * 3, d = 5 + r() * 2, H = 3.6 + r() * 1.6;
        if (r() < 0.5) { wall(-w / 2, -d / 2, w * 0.1, -d / 2, H * 1.8, 1); box('con', w * 0.55, 0.3, d * 0.5, -w * 0.2, H * 1.05, -d * 0.2, 0, 0, 0.12); }   // broken upper storey
        wall(-w / 2, -d / 2, w / 2, -d / 2, H, 2); wall(w / 2, -d / 2, w / 2, d / 2, H); wall(w / 2, d / 2, -w / 2, d / 2, H * 0.7, 1); wall(-w / 2, d / 2, -w / 2, -d / 2, H * 0.5);
        box('con', w * 0.7, 0.25, d * 0.8, -0.3, H * 0.55, 0.2, 0.25 + r() * 0.2, r() * 0.3, 0.35);           // collapsed roof slab
        for (let i = 0; i < 8; i++) box(r() < 0.5 ? 'con' : 'moss', 0.3 + r() * 0.7, 0.25 + r() * 0.4, 0.3 + r() * 0.6, (r() - 0.5) * (w + 3), 0.15, (r() - 0.5) * (d + 3), r(), r() * 3, r());
      } else if (kind === 'fence') {
        const n = 9, step = 2.6;
        for (let i = 0; i < n; i++) { const z = (i - n / 2) * step, lean = r() < 0.25 ? (r() - 0.5) * 1.4 : (r() - 0.5) * 0.15, fallen = r() < 0.12;
          if (fallen) box('con', 0.35, 0.35, 4.2, 0.6 + r(), 0.2, z, 0, 0.6 * (r() - 0.5), 0);
          else { box('con', 0.35, 4.2, 0.35, 0, 1.9, z, 0, 0, lean); if (i < n - 1 && r() < 0.8) for (const y of [1.2, 2.2, 3.2]) cyl('rust', 0.025, step * 1.02, Math.sin(lean) * y * 0.5, y - 0.15 - r() * 0.3, z + step / 2, Math.PI / 2, 0); } }
        for (let i = 0; i < 5; i++) box('vine', 0.05, 1 + r() * 2, 1 + r() * 2, 0.2, 1, (r() - 0.5) * n * step);
      } else if (kind === 'tower') {
        const g = new THREE.Group(), H = 7 + r() * 2;
        for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) cyl('rust', 0.12, H, x, H / 2, z);
        box('wood', 3.2, 0.2, 3.2, 0, H, 0); box('rust', 3.6, 0.12, 3.6, 0, H + 1.8, 0, 0.15, 0, -0.1);
        for (const [x, z] of [[-1.5, -1.5], [1.5, 1.5], [1.5, -1.5]]) cyl('rust', 0.06, 1.8, x, H + 0.9, z);
        box('wood', 0.1, 1.0, 3.2, -1.55, H + 0.5, 0); box('vine', 0.05, H * 0.7, 1.4, 1.25, H * 0.4, 1.3);
        void g;
      }
      const grp = new THREE.Group();
      for (const k in parts) { if (!parts[k].length) continue; const m = new THREE.Mesh(mergeGeometries(parts[k]), M[k]); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
      if (kind === 'tower') grp.rotation.z = (r() - 0.5) * 0.35;
      return grp;
    };
    this.ruinList = [];
    for (const sp of this.ruinSpots) {
      const { s, kind, side, lat, f } = sp, p = new THREE.Vector3(sp.x, sp.y, sp.z);
      let o;
      if (kind === 'wreck') { o = jeepModel(); o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(0x6a3a20), 0.7); m.material.roughness = 0.9; } }); o.rotation.set(0, r() * 6, 1.35 * (r() < 0.5 ? 1 : -1)); o.position.y = 0.6; const w = new THREE.Group(); w.add(o); o = w; }
      else o = cluster(kind);
      o.position.add(p); o.position.y -= 0.1; o.rotation.y += Math.atan2(f.x, f.z) + (kind === 'fence' ? 0 : r() * 6);
      this.root.add(o); this.ruinList.push({ s, kind, side, lat });
    }
  }

  /* ---------- per-frame ---------- */
  update(dt, cam) {
    this.time += dt; this.windU.value = this.time;
    if (!this.root) return;
    if (this.lite && (this.tick++ & 1) === 0) this.sun.shadow.needsUpdate = true;   // slow device: shadows every other frame
    this.sky.material.uniforms.t.value = this.time;
    if (this.fallTex) this.fallTex.offset.y += dt * 0.9;
    if (this.lavaTex) this.lavaTex.offset.y -= dt * 0.06;
    if (this.auroraMat) this.auroraMat.uniforms.t.value = this.time * 0.25;
    this.sky.position.copy(cam.position); this.mtn.position.set(cam.position.x, 0, cam.position.z);
    // sun + shadow box follow the jeep
    const f = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion); f.y = 0; f.normalize();
    const tgt = new THREE.Vector3().copy(cam.position).addScaledVector(f, 16);
    this.sun.target.position.copy(tgt); this.sun.position.copy(tgt).addScaledVector(this.sunDir, 80);
    this.updWeather(dt, cam);
    if (this.vegMeshes) { const far = this.scene.fog.far + 25; for (const m of this.vegMeshes) { const bs = m.boundingSphere; m.visible = bs.center.distanceTo(cam.position) - bs.radius < far; } }
    if (this.water) { this.waterMat.normalMap.offset.y -= dt * 0.03; this.waterMat.normalMap.offset.x += dt * 0.004; }
    if (this.volcano) { this.volcano.position.x = cam.position.x - 60; this.volcano.position.z = cam.position.z - 600;
      for (const s of this.smoke) { const u = (s.userData.u + this.time * 0.02) % 1; s.position.set(u * 120 + Math.sin(u * 9) * 8, 175 + u * 260, 0); const k = 40 + u * 160; s.scale.set(k, k, 1); s.material.opacity = 0.75 * (1 - u); } }
    if (this.motes) { this.motes.position.set(cam.position.x, cam.position.y - 3, cam.position.z);
      const p = this.motes.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * (this.env.volcano ? 0.6 : this.env.snow ? -1.1 : this.env.night ? Math.sin(this.time * 1.3 + i) * 0.5 : 0.12); if (y > 14) y = 0; if (y < 0) y = 14; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(this.time + i) * dt * 0.2); } p.needsUpdate = true; }
  }
}
