// The 3D world: spline jeep track with curves and hills, textured terrain, sky dome, fog,
// instanced jungle (trees, tree ferns, ferns, grass, rocks), river, volcano, sun + shadows.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smooth, fbm, vnoise, rng, canvasTex, detailTexture, radialTex } from './util.js';

export const ENV = [
  { // Fern Valley: sunny jungle valley
    seed: 11, len: 420, curve: [[9, 52, 0.3], [4, 21, 1.4]], hills: [[2.4, 38, 0], [1.1, 16, 2]],
    skyTop: 0x5f97c8, skyHor: 0xd9e6d6, fog: 0xc9d8c4, fogNear: 22, fogFar: 175, sunDir: [0.5, 0.75, 0.35], sunCol: 0xfff1d6, sunI: 3.0,
    hemiSky: 0xcfe2ff, hemiGround: 0x4a5a2a, hemiI: 1.15, grass: [0x55702f, 0x7e9a45], dirt: 0x8b6b45, rock: 0x7d7a6e, leaf: [0x2f5a26, 0x4f8034], bark: 0x5a4330, mtn: 0x8fa79c,
    veg: { broad: 240, palm: 170, fern: 800, grass: 1300, rock: 110, dead: 0 }, motes: 0xfff6c8,
  },
  { // River Gorge: river on the left, cliffs on the right
    seed: 23, len: 430, curve: [[7, 60, 0.5], [3, 26, 2.0]], hills: [[0.9, 34, 1]], river: true, waterY: -1.5,
    skyTop: 0x4f8fc4, skyHor: 0xdfe9e8, fog: 0xc8d8dc, fogNear: 25, fogFar: 195, sunDir: [-0.45, 0.7, 0.2], sunCol: 0xfff3dc, sunI: 3.0,
    hemiSky: 0xcfe6ff, hemiGround: 0x52603a, hemiI: 1.1, grass: [0x5a7231, 0x86a050], dirt: 0x94754e, rock: 0x9a8a72, leaf: [0x35602e, 0x52813a], bark: 0x5a4330, mtn: 0x8b9ea6,
    veg: { broad: 150, palm: 170, fern: 600, grass: 1100, rock: 220, dead: 0 }, motes: 0xffffff,
  },
  { // Volcano Ridge: dusk, ash, smoking volcano ahead
    seed: 37, len: 440, curve: [[10, 48, 2.0], [5, 20, 0.4]], hills: [[3.2, 44, 0.5], [1.3, 18, 1]], volcano: true,
    skyTop: 0x3c3458, skyHor: 0xf09a5c, fog: 0xc98a68, fogNear: 14, fogFar: 150, sunDir: [-0.6, 0.22, -0.75], sunCol: 0xffb070, sunI: 2.4,
    hemiSky: 0xffc39a, hemiGround: 0x4a4030, hemiI: 1.35, grass: [0x4a5c28, 0x6e7c3e], dirt: 0x7a5e42, rock: 0x5e5654, leaf: [0x2e4a26, 0x45683a], bark: 0x3e3226, mtn: 0x6e5a66,
    veg: { broad: 90, palm: 110, fern: 450, grass: 900, rock: 200, dead: 110 }, motes: 0xff9a50,
  },
];

const tmpV = new THREE.Vector3();

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.root = null; this.env = null; this.time = 0;
    this.windU = { value: 0 };
    this.quality = 1;
    // lights (persist across missions)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }
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
    return h;
  }
  roadDx(x, z) { return x - this.xr(-z); }

  build(i) {
    this.dispose();
    const E = this.env = ENV[i];
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.scene.fog = new THREE.Fog(E.fog, E.fogNear, E.fogFar);
    this.scene.background = new THREE.Color(E.fog);
    this.hemi.color.set(E.hemiSky); this.hemi.groundColor.set(E.hemiGround); this.hemi.intensity = E.hemiI * 0.6;
    this.sun.color.set(E.sunCol); this.sun.intensity = E.sunI * 0.75;
    this.sunDir = new THREE.Vector3(...E.sunDir).normalize();
    this.buildSky(); this.buildTerrain(); this.buildVeg();
    if (E.river) this.buildWater();
    if (E.volcano) this.buildVolcano();
    this.buildMotes();
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
      uniforms: { top: { value: new THREE.Color(E.skyTop) }, hor: { value: new THREE.Color(E.skyHor) }, sunDir: { value: this.sunDir }, sunCol: { value: new THREE.Color(E.sunCol) }, fogc: { value: new THREE.Color(E.fog) } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: `uniform vec3 top, hor, sunCol, fogc; uniform vec3 sunDir; varying vec3 vD;
        void main(){ float h = vD.y; vec3 c = mix(hor, top, pow(clamp(h,0.,1.),0.55)); c = mix(c, fogc, smoothstep(0.08,-0.05,h));
          float sd = max(dot(normalize(vD), normalize(sunDir)), 0.); c += sunCol * (pow(sd, 900.) * 3.0 + pow(sd, 18.) * 0.35 + pow(sd, 4.) * 0.12);
          float cl = sin(vD.x*9.+vD.z*3.)*sin(vD.z*11.-vD.x*2.)*0.5+0.5; c = mix(c, vec3(1.0,0.98,0.95), smoothstep(0.62,0.95,cl)*smoothstep(0.05,0.25,h)*smoothstep(0.6,0.3,h)*0.35);
          gl_FragColor = vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat); this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.root.add(this.sky);
    // distant mountain ring (hazy, never reached)
    const N = 160, pos = [], col = [], idx = [], c0 = new THREE.Color(E.mtn), c1 = new THREE.Color(E.fog), r = rng(E.seed);
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2, hgt = 40 + fbm(i * 0.08, E.seed, 4) * 160 + (r() - 0.5) * 6;
      const R = 760;
      pos.push(Math.cos(a) * R, -40, Math.sin(a) * R, Math.cos(a) * R, hgt, Math.sin(a) * R);
      col.push(c1.r, c1.g, c1.b, c0.r, c0.g, c0.b);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    this.mtn = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: false })); this.mtn.renderOrder = -9; this.mtn.frustumCulled = false;
    this.root.add(this.mtn);
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
      if (E.river && h < E.waterY + 0.9) c.lerp(mud, smooth(E.waterY + 0.9, E.waterY + 0.1, h));
      if (E.volcano) c.lerp(new THREE.Color(0x3a3430), smooth(0.55, 0.85, fbm(x * 0.02 + 9, z * 0.02, 3)) * 0.6);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
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
    const g = new THREE.PlaneGeometry(400, E.len + 400); g.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(g, this.waterMat); this.water.position.set(-60, E.waterY, -E.len / 2); this.water.receiveShadow = true;
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
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ color: this.env.motes, size: this.env.volcano ? 0.16 : 0.09, map: tex, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
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
      for (const [x, y, z, s] of B) { const g = new THREE.IcosahedronGeometry(s, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (vnoise(p.getX(i) * 1.7 + x * 3, p.getY(i) * 1.7 + p.getZ(i)) - 0.5) * 0.45; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); } g.translate(x, y + 9.6, z); blobs.push(ensure(g)); }
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
    const bark = new THREE.MeshStandardMaterial({ color: E.bark, roughness: 0.95, map: this.detail });
    const leafA = new THREE.Color(E.leaf[0]), leafB = new THREE.Color(E.leaf[1]);
    const crownM = this.swayMat(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, map: this.detail }), 0.006);
    const frondM = this.swayMat(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: leafT, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }), 0.025);
    const grassM = this.swayMat(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: this._grassTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }), 0.12);
    const rockM = new THREE.MeshStandardMaterial({ color: E.rock, vertexColors: true, roughness: 0.9, map: this.detail });
    const deadM = new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 1 });
    const place = (n, minD, maxD, opts = {}) => { const out = []; let tries = 0;
      while (out.length < n && tries++ < n * 8) {
        const s = -40 + r() * (E.len + 200), side = r() < 0.5 ? -1 : 1, d = minD + Math.pow(r(), opts.pow || 1.4) * (maxD - minD);
        const z = -s, x = this.xr(s) + side * d, h = this.height(x, z);
        if (E.river && h < E.waterY + 0.25 && !opts.water) continue;
        if (opts.side && side !== opts.side) continue;
        out.push([x, h, z]); }
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
    if (v.broad) inst([{ geo: V.broadTrunk, mat: bark, cast: true }, { geo: V.broadCrown, mat: crownM, cast: true, color: leafCol }], place(Math.round(v.broad * q), 9, 120, { pow: 1.6 }), [0.8, 1.35], 0.06);
    if (v.palm) inst([{ geo: V.palmTrunk, mat: bark, cast: true }, { geo: V.palmCrown, mat: frondM, cast: true, color: c => c.copy(leafA).lerp(leafB, r()).multiplyScalar(0.9 + r() * 0.4) }], place(Math.round(v.palm * q), 6.5, 90, { pow: 1.5 }), [0.7, 1.3], 0.05);
    if (v.fern) inst([{ geo: V.fern, mat: frondM, color: c => c.copy(leafB).lerp(leafA, r() * 0.6).multiplyScalar(1.0 + r() * 0.3) }], place(Math.round(v.fern * q), 3.9, 40, { pow: 1.8 }), [0.8, 1.6]);
    if (v.grass) inst([{ geo: V.grass, mat: grassM, color: c => c.set(E.grass[1]).lerp(new THREE.Color(E.grass[0]), r() * 0.7).multiplyScalar(1.15) }], place(Math.round(v.grass * q), 3.7, 30, { pow: 2 }), [0.8, 1.5]);
    if (v.rock) { inst([{ geo: V.rock, mat: rockM, cast: true }], place(Math.round(v.rock * 0.7), 4.5, 70, { water: true }), [0.4, 1.4], 0.5); inst([{ geo: V.rock, mat: rockM, cast: true }], place(Math.round(v.rock * 0.3), 14, 90, { water: true }), [2.0, 4.5], 0.5); }
    if (v.dead) inst([{ geo: V.dead, mat: deadM, cast: true }], place(v.dead, 6, 80), [0.8, 1.4]);
  }

  /* ---------- per-frame ---------- */
  update(dt, cam) {
    this.time += dt; this.windU.value = this.time;
    if (!this.root) return;
    this.sky.position.copy(cam.position); this.mtn.position.set(cam.position.x, 0, cam.position.z);
    // sun + shadow box follow the jeep
    const f = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion); f.y = 0; f.normalize();
    const tgt = new THREE.Vector3().copy(cam.position).addScaledVector(f, 16);
    this.sun.target.position.copy(tgt); this.sun.position.copy(tgt).addScaledVector(this.sunDir, 80);
    if (this.vegMeshes) { const far = this.env.fogFar + 25; for (const m of this.vegMeshes) { const bs = m.boundingSphere; m.visible = bs.center.distanceTo(cam.position) - bs.radius < far; } }
    if (this.water) { this.waterMat.normalMap.offset.y -= dt * 0.03; this.waterMat.normalMap.offset.x += dt * 0.004; }
    if (this.volcano) { this.volcano.position.x = cam.position.x - 170; this.volcano.position.z = cam.position.z - 620;
      for (const s of this.smoke) { const u = (s.userData.u + this.time * 0.02) % 1; s.position.set(u * 120 + Math.sin(u * 9) * 8, 175 + u * 260, 0); const k = 40 + u * 160; s.scale.set(k, k, 1); s.material.opacity = 0.75 * (1 - u); } }
    if (this.motes) { this.motes.position.set(cam.position.x, cam.position.y - 3, cam.position.z);
      const p = this.motes.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * (this.env.volcano ? 0.6 : 0.12); if (y > 14) y = 0; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(this.time + i) * dt * 0.2); } p.needsUpdate = true; }
  }
}
