// Environment dressing (v3.22): painted clouds, mountain ridges, the jeep trail, leafy tree crowns,
// sunbeams and one signature sight per course (waterfalls, lava, moon and mushrooms, northern lights).
// Everything is drawn in code. Things that repeat are merged into a single mesh to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, fbm, vnoise, clamp, lerp, smooth, canvasTex, radialTex } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);
const keep = t => { t.userData.keep = true; return t; };
const once = (cache, k, make) => cache[k] || (cache[k] = make());
const T = {}, G = {};   // textures and geometries shared by every level

function ribbon(pos, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
function glowPoints(pts, tex, size, opacity) {   // one draw call for any number of glows
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.frustumCulled = false; return m;
}

/* ---------- sky ---------- */
export function cloudMap() {
  return once(T, 'cloud', () => {
    const t = canvasTex(1024, 1024, (g, W, H) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H); const r = rng(77); g.globalCompositeOperation = 'lighter';
      const blob = (x, y, R, a) => { for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) { const X = x + dx, Y = y + dy; if (X < -R || Y < -R || X > W + R || Y > H + R) continue; const gr = g.createRadialGradient(X, Y, 0, X, Y, R); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(X - R, Y - R, R * 2, R * 2); } };
      for (let c = 0; c < 26; c++) { const cx = r() * W, cy = r() * H, big = 60 + r() * 110; for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = Math.pow(r(), 0.7) * big * 1.5; blob(cx + Math.cos(a) * d * 1.5, cy + Math.sin(a) * d * 0.8, 18 + r() * big * 0.55, 0.18 + r() * 0.22); } }
    }, { repeat: true, linear: true });
    return keep(t);
  });
}
export const SKY_FRAG = `uniform vec3 top, hor, sunCol, fogc, lit, dark; uniform vec3 sunDir; uniform sampler2D cl; uniform float t, cover, glow; varying vec3 vD;
  void main(){ vec3 d = normalize(vD); float h = d.y; vec3 c = mix(hor, top, pow(clamp(h,0.,1.),0.55)); c = mix(c, fogc, smoothstep(0.08,-0.05,h));
    float sd = max(dot(d, normalize(sunDir)), 0.); c += glow * sunCol * (pow(sd, 900.) * 3.0 + pow(sd, 18.) * 0.35 + pow(sd, 4.) * 0.12);
    if (h > 0.0) { vec2 p = d.xz / (h + 0.2) * 0.11; p.x += t * 0.004; vec2 sv = normalize(sunDir.xz + 1e-4) * 0.028;
      float n = texture2D(cl, p).r * 0.8 + texture2D(cl, p * 3.1 + 0.37).r * 0.32;
      float n2 = texture2D(cl, p + sv).r * 0.8 + texture2D(cl, p * 3.1 + 0.37 + sv * 3.1).r * 0.32;
      float a = smoothstep(0.66 - cover, 0.98 - cover, n) * smoothstep(0.0, 0.1, h);
      float l = clamp(0.52 + (n - n2) * 2.4 + glow * pow(sd, 6.) * 0.5, 0., 1.);
      vec3 cc = mix(dark, lit, l); cc = mix(cc, fogc, smoothstep(0.26, 0.02, h) * 0.75); c = mix(c, cc, a * 0.96); }
    gl_FragColor = vec4(c, 1.0); }`;
export function cloudColors(E) {
  const dim = E.night || E.twilight, sc = new THREE.Color(E.sunCol), hor = new THREE.Color(E.skyHor), top = new THREE.Color(E.skyTop);
  return { lit: new THREE.Color(1, 1, 1).lerp(sc, 0.6).lerp(hor, dim ? 0.8 : 0.15).multiplyScalar(dim ? 0.45 : 1), dark: top.clone().lerp(hor, 0.45).multiplyScalar(dim ? 0.5 : 0.72) };
}
// three mountain ranges, far to near, in one mesh; fades into the fog with the weather
export function ridges(E) {
  const fog = new THREE.Color(E.fog), mc = new THREE.Color(E.mtn), snow = new THREE.Color(0xf4f6fa), dim = E.night || E.twilight;
  const layers = E.canyon || E.plains ? [[780, 150, 0], [640, 96, 0], [520, 58, 0]] : [[800, 260, E.snow ? 1 : 0], [650, 150, 0], [520, 72, 0]];
  const pos = [], col = [], idx = []; let base = 0;
  layers.forEach(([R, amp, cap], L) => {
    const N = 480;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      let v = 0, am = 1, fq = 3.2 + L * 2; for (let o = 0; o < 5; o++) { v += am * (1 - Math.abs(2 * vnoise(cx * fq + 40 + E.seed + L * 11, cz * fq + 7) - 1)); am *= 0.5; fq *= 2.1; }
      v = Math.pow(v / 1.94, 1.5);
      pos.push(cx * R, -40, cz * R, cx * R, 8 + v * amp, cz * R);
      const peak = mc.clone().lerp(fog, [0.5, 0.28, 0.08][L]).multiplyScalar(dim ? 0.8 : lerp(1, 0.72, L / 2)); if (E.swamp) peak.lerp(fog, 0.55);
      if (cap && v > 0.42) peak.lerp(snow, smooth(0.42, 0.6, v) * (E.night ? 0.3 : E.twilight ? 0.5 : 0.92));
      col.push(fog.r, fog.g, fog.b, peak.r, peak.g, peak.b);
      if (i < N) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    base += (N + 1) * 2;
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, fog: false, vertexColors: true, uniforms: { fogc: { value: fog.clone() }, shade: { value: 1 }, haze: { value: 0 } },
    vertexShader: 'varying vec3 vC; void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 fogc; uniform float shade, haze; varying vec3 vC; void main(){ gl_FragColor = vec4(mix(vC * shade, fogc, haze), 1.0); }' });
  const m = new THREE.Mesh(g, mat); m.renderOrder = -9; m.frustumCulled = false; return m;
}

/* ---------- the trail ---------- */
function roadTex() {
  return once(T, 'road', () => keep(canvasTex(512, 1024, (g, W, H) => {
    const r = rng(5); g.fillStyle = '#d8d0c4'; g.fillRect(0, 0, W, H);
    const wrap = fn => { for (const dy of [-H, 0, H]) { g.save(); g.translate(0, dy); fn(); g.restore(); } };
    for (let i = 0; i < 520; i++) { const x = r() * W, y = r() * H, R = 10 + r() * 46, d = r() < 0.5, a = 0.06 + r() * 0.1, sq = 0.5 + r() * 0.6, ro = r() * 3; wrap(() => { g.fillStyle = d ? `rgba(70,50,30,${a})` : `rgba(255,245,225,${a})`; g.beginPath(); g.ellipse(x, y, R, R * sq, ro, 0, 7); g.fill(); }); }
    for (const c of [0.36, 0.64]) {   // two ruts with tyre tread (the wobble is a whole number of waves, so it tiles)
      const px = y => W * c + Math.sin(y / H * Math.PI * 4 + c * 7) * 7;
      g.beginPath(); for (let y = 0; y <= H; y += 8) g.lineTo(px(y) - 26, y); for (let y = H; y >= 0; y -= 8) g.lineTo(px(y) + 26, y); g.closePath(); g.fillStyle = 'rgba(62,44,28,0.3)'; g.fill();
      g.strokeStyle = 'rgba(30,20,12,0.24)'; g.lineWidth = 4; for (const e of [-26, 26]) { g.beginPath(); for (let y = 0; y <= H; y += 8) g.lineTo(px(y) + e, y); g.stroke(); }
      g.strokeStyle = 'rgba(25,16,10,0.2)'; g.lineWidth = 5; for (let y = 0; y < H; y += 18) { const x = px(y); g.beginPath(); g.moveTo(x - 20, y + 7); g.lineTo(x, y); g.lineTo(x + 20, y + 7); g.stroke(); }
    }
    for (let i = 0; i < 900; i++) { const x = r() * W, y = r() * H, R = 1.5 + r() * r() * 9, t = 120 + r() * 130; g.fillStyle = 'rgba(20,14,8,0.45)'; g.beginPath(); g.ellipse(x + 1.5, y + 2, R, R * 0.7, 0, 0, 7); g.fill(); g.fillStyle = `rgb(${t},${t * 0.95},${t * 0.86})`; g.beginPath(); g.ellipse(x, y, R, R * 0.7, r() * 3, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'destination-in'; const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.14, 'rgba(0,0,0,1)'); gr.addColorStop(0.86, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }, { repeat: true })));
}
export function buildRoad(w) {
  const E = w.env, hw = 3.9, nA = 8, pos = [], uv = [], idx = []; let n = 0; const P = new THREE.Vector3(), D = new THREE.Vector3(), R = new THREE.Vector3(), end = E.len + 120;
  for (let s = -30; s < end; s += 1) { w.posAt(s, P); w.dirAt(s, D); R.crossVectors(D, UP).normalize();
    for (let j = 0; j <= nA; j++) { const t = j / nA, o = (t - 0.5) * 2 * hw, x = P.x + R.x * o, z = P.z + R.z * o; pos.push(x, w.ground(x, z) + 0.05, z); uv.push(t, s / 9); }
    if (s + 1 < end) for (let j = 0; j < nA; j++) { const a = n + j, b = a + nA + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    n += nA + 1; }
  const g = ribbon(pos, uv, idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(E.dirt).multiplyScalar(1.5), map: roadTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.95 }));
  m.receiveShadow = true; m.renderOrder = 1; m.frustumCulled = false; w.root.add(m);
}

/* ---------- plants ---------- */
export function flowerTex() {
  return once(T, 'flower', () => keep(canvasTex(512, 512, g => {
    g.clearRect(0, 0, 512, 512); const r = rng(8);
    [['#ff7fb0', '#ffe27a'], ['#ffd23c', '#c8741c'], ['#fff6ee', '#ffc93c'], ['#a678f0', '#ffe27a']].forEach(([pet, mid], i) => { const cx = (i % 2) * 256, cy = (i >> 1) * 256;
      for (let k = 0; k < 4; k++) { const x = cx + 40 + r() * 176, y = cy + 40 + r() * 90; g.strokeStyle = '#3f7a2c'; g.lineWidth = 6; g.beginPath(); g.moveTo(x + (r() - 0.5) * 18, cy + 256); g.quadraticCurveTo(x, y + 80, x, y); g.stroke();
        g.fillStyle = pet; for (let p = 0; p < 6; p++) { const a = p / 6 * 6.28; g.beginPath(); g.ellipse(x + Math.cos(a) * 19, y + Math.sin(a) * 19, 17, 11, a, 0, 7); g.fill(); } g.fillStyle = mid; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); } });
  })));
}
export function flowerGeo(yellowOnly) {
  return once(G, 'flower' + !!yellowOnly, () => { const r = rng(61), cards = [];
    for (let i = 0; i < 16; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 1.5, sz = 0.42 + r() * 0.32, p = new THREE.PlaneGeometry(sz, sz); p.translate(0, sz / 2, 0); p.rotateY(r() * 3.14); p.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
      const cell = yellowOnly ? 1 : Math.floor(r() * 4), uv = p.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) + (cell % 2)) / 2, (uv.getY(k) + 1 - (cell >> 1)) / 2);
      const N = p.attributes.normal; for (let k = 0; k < N.count; k++) N.setXYZ(k, 0, 1, 0); cards.push(p); }
    const g = mergeGeometries(cards); g.userData.keep = true; return g; });
}
export function pebbleGeo() {
  return once(G, 'pebble', () => { const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (vnoise(x * 2.1 + 5, y * 2.1 + z * 1.3) - 0.5) * 0.55; p.setXYZ(i, x * k * 1.2, Math.max(y * k * 0.7, -0.25), z * k); } g.computeVertexNormals(); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3).fill(1), 3)); g.userData.keep = true; return g; });
}
export function logGeo() {
  return once(G, 'log', () => { const g = new THREE.CylinderGeometry(0.3, 0.42, 7, 8, 1); g.rotateZ(Math.PI / 2); g.userData.keep = true; return g; });
}
export function clumpTex() {   // left half: a clump of leaves; right half: a hanging vine
  return once(T, 'clump', () => keep(canvasTex(512, 256, g => {
    g.clearRect(0, 0, 512, 256); const r = rng(14);
    for (let i = 0; i < 420; i++) { const a = r() * 6.28, d = Math.pow(r(), 0.65) * 256 * 0.44, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, v = 120 + i / 420 * 135 * (0.75 + r() * 0.25); g.fillStyle = `rgb(${v * (0.92 + r() * 0.1)},${v},${v * 0.82})`; g.beginPath(); g.ellipse(x, y, 13 + r() * 7, 5.5 + r() * 3, r() * 3.14, 0, 7); g.fill(); }
    g.strokeStyle = '#b8c890'; g.lineWidth = 5; g.beginPath(); g.moveTo(384, 0); g.lineTo(384, 256); g.stroke();
    for (let y = 6; y < 252; y += 13) { const s = (y / 13 & 1) ? 1 : -1, v = 170 + r() * 80; g.fillStyle = `rgb(${v * 0.92},${v},${v * 0.8})`; g.beginPath(); g.ellipse(384 + s * 26, y + 10, 30, 11, s * 0.7, 0, 7); g.fill(); }
  })));
}
const BLOBS = [[0, 0, 0, 2.6], [-1.9, -0.4, 0.6, 1.9], [1.8, -0.3, -0.5, 2.0], [0.4, 0.9, 1.6, 1.8], [-0.6, 0.7, -1.7, 1.9], [0.2, 1.6, 0.1, 1.7], [2.4, -1.0, 1.4, 1.3], [-2.3, -0.9, -1.5, 1.3]];
export function cardGeo(vines) {   // the leafy shell of a broadleaf crown; normals point out of the crown, so it lights softly
  return once(G, 'cards' + !!vines, () => {
    const r = rng(31), Q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), parts = [], paint = (p, f) => { const n = p.attributes.position.count, c = new Float32Array(n * 3); for (let k = 0; k < n; k++) c[k * 3] = c[k * 3 + 1] = c[k * 3 + 2] = f(k); p.setAttribute('color', new THREE.BufferAttribute(c, 3)); };
    for (const [x, y, z, s] of BLOBS) { const n = Math.round(5 + s * 4), C = new THREE.Vector3(x, y + 9.6, z);
      for (let i = 0; i < n; i++) { const d = new THREE.Vector3(r() * 2 - 1, r() * 1.5 - 0.5, r() * 2 - 1).normalize(), sz = s * (1.25 + r() * 0.75), p = new THREE.PlaneGeometry(sz, sz);
        Q.setFromUnitVectors(Z, d); p.applyQuaternion(Q); p.translate(C.x + d.x * s * 0.78, C.y + d.y * s * 0.62, C.z + d.z * s * 0.78);
        const P = p.attributes.position, N = p.attributes.normal, U = p.attributes.uv, nn = new THREE.Vector3();
        for (let k = 0; k < P.count; k++) { nn.set(P.getX(k) - C.x, (P.getY(k) - C.y) * 1.3 + 0.5, P.getZ(k) - C.z).normalize(); N.setXYZ(k, nn.x, nn.y, nn.z); U.setX(k, U.getX(k) * 0.5); }
        paint(p, k => 0.6 + 0.55 * clamp((P.getY(k) - 7.6) / 4.5, 0, 1)); parts.push(p); } }
    if (vines) for (let i = 0; i < 7; i++) { const a = r() * 6.28, R = 1.4 + r() * 2.2, L = 2.6 + r() * 4, x = Math.cos(a) * R, z = Math.sin(a) * R, top = 8.6 - R * 0.25;
      for (const ang of [0, 1.57]) { const p = new THREE.PlaneGeometry(0.42, L); p.translate(0, -L / 2, 0); p.rotateY(ang + a); p.translate(x, top, z); const U = p.attributes.uv; for (let k = 0; k < U.count; k++) { U.setX(k, 0.53 + U.getX(k) * 0.44); U.setY(k, U.getY(k) * L / 3); } paint(p, () => 1); parts.push(p); } }
    const g = mergeGeometries(parts); g.userData.keep = true; return g;
  });
}
export function barkTex() {
  return once(T, 'bark', () => { const t = canvasTex(256, 256, (g, W) => { g.fillStyle = '#a89a88'; g.fillRect(0, 0, W, W); const r = rng(3); for (let i = 0; i < 260; i++) { const x = r() * W, v = r() < 0.55; g.strokeStyle = v ? `rgba(40,28,18,${0.25 + r() * 0.4})` : `rgba(235,222,200,${0.12 + r() * 0.25})`; g.lineWidth = 1.5 + r() * 5; const y0 = r() * W, L = 40 + r() * 150, a = (r() - 0.5) * 12, b = (r() - 0.5) * 12; for (const dy of [-W, 0, W]) { g.beginPath(); g.moveTo(x, y0 + dy); g.bezierCurveTo(x + a, y0 + dy + L / 3, x + b, y0 + dy + L * 0.66, x, y0 + dy + L); g.stroke(); } } }, { repeat: true }); t.repeat.set(3, 1.5); return keep(t); });
}
export function earTex() {
  return once(T, 'ear', () => keep(canvasTex(128, 256, (g, W, H) => { g.fillStyle = '#e6f0c8'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(70,110,40,0.55)'; g.lineWidth = 2.5; for (let y = -30; y < H; y += 16) { g.beginPath(); g.moveTo(W / 2, y); g.quadraticCurveTo(W * 0.72, y + 16, W, y + 42); g.moveTo(W / 2, y); g.quadraticCurveTo(W * 0.28, y + 16, 0, y + 42); g.stroke(); } g.strokeStyle = '#fbfbe0'; g.lineWidth = 5; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke(); })));
}
export function earGeo() {   // big-leaf plant
  return once(G, 'ear', () => { const r = rng(66), leaves = [];
    for (let i = 0; i < 8; i++) { const seg = 4, len = 1.5 + r() * 0.7, wid = 0.62 + r() * 0.26, pos = [], uv = [], idx = [], bend = 0.5 + r() * 0.5;
      for (let k = 0; k <= seg; k++) { const t = k / seg, y = Math.sin(t * 1.5) * len * 0.75 - bend * t * t * len, zz = t * len * 0.85, wd = wid * Math.sin(Math.min(1, 0.22 + t * 0.9) * Math.PI); for (const sx of [-1, 0, 1]) pos.push(sx * wd, y - Math.abs(sx) * wd * 0.28 + 0.65, zz); for (const u of [0, 0.5, 1]) uv.push(u, t); if (k < seg) { const q = k * 3; idx.push(q, q + 1, q + 3, q + 1, q + 4, q + 3, q + 1, q + 2, q + 4, q + 2, q + 5, q + 4); } }
      const g = ribbon(pos, uv, idx); g.rotateX(-0.25 - r() * 0.3); g.rotateY(i / 8 * 6.28 + r() * 0.4); g.computeVertexNormals(); leaves.push(g.toNonIndexed()); }
    const g = mergeGeometries(leaves); g.userData.keep = true; return g; });
}
export function mushroomGeo() {
  return once(G, 'shroom', () => { const cap = new THREE.SphereGeometry(0.34, 10, 6, 0, 6.28, 0, 1.6); cap.scale(1, 0.7, 1); cap.translate(0, 0.46, 0); const stem = new THREE.CylinderGeometry(0.07, 0.1, 0.46, 6); stem.translate(0, 0.23, 0); const parts = [];
    for (const [x, z, k] of [[0, 0, 1.2], [0.5, 0.2, 0.8], [-0.35, 0.42, 0.65], [0.1, -0.5, 0.9]]) for (const g0 of [cap, stem]) { const g = g0.clone(); g.deleteAttribute('uv'); g.scale(k, k, k); g.translate(x, 0, z); parts.push(g.toNonIndexed()); }
    const g = mergeGeometries(parts); g.userData.keep = true; return g; });
}
export function iceGeo() {
  return once(G, 'ice', () => { const c = new THREE.ConeGeometry(0.7, 5, 6, 3); c.translate(0, 2.3, 0); const p = c.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (vnoise(p.getX(i) * 3, p.getY(i)) - 0.5) * 0.6; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } c.computeVertexNormals(); const parts = [];
    for (const [x, z, k, a, b] of [[0, 0, 1.2, 0, 0], [0.9, 0.2, 0.75, 0.2, -0.3], [-0.8, 0.4, 0.65, -0.3, 0.25], [0.2, -0.9, 0.5, 0.3, 0.3]]) { const g = c.clone(); g.deleteAttribute('uv'); g.scale(k, k, k); g.rotateX(a); g.rotateZ(b); g.translate(x, 0, z); parts.push(g.toNonIndexed()); }
    const g = mergeGeometries(parts); g.userData.keep = true; return g; });
}

/* ---------- sunbeams in the dense jungle ---------- */
export function buildBeams(w) {
  const E = w.env; if (w.lite || !(E.veg.broad >= 150) || E.snow) return;
  const r = rng(E.seed + 91);
  const tex = canvasTex(64, 256, (g, W, H) => { g.clearRect(0, 0, W, H); const a = g.createLinearGradient(0, 0, W, 0); a.addColorStop(0, 'rgba(255,255,255,0)'); a.addColorStop(0.5, 'rgba(255,255,255,1)'); a.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = a; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'destination-in'; const b = g.createLinearGradient(0, 0, 0, H); b.addColorStop(0, 'rgba(0,0,0,0)'); b.addColorStop(0.3, 'rgba(0,0,0,1)'); b.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = b; g.fillRect(0, 0, W, H); });
  const beams = [], dir = w.sunDir.clone().setY(Math.max(w.sunDir.y, 0.7)).normalize(), qq = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  for (let i = 0, n = Math.round(60 * w.quality * E.len / 430); i < n; i++) { const s = r() * E.len, side = r() < 0.5 ? -1 : 1, x = w.xr(s) + side * (2 + r() * 13), z = -s, y = w.ground(x, z) + 6.5, wd = 1.2 + r() * 2.2; if (E.river && (side < 0 || y < E.waterY + 7)) continue; for (const ang of [0, 1.57]) { const p = new THREE.PlaneGeometry(wd, 14); p.rotateY(ang + r() * 0.6); p.applyQuaternion(qq); p.translate(x, y, z); beams.push(p); } }
  const m = new THREE.Mesh(mergeGeometries(beams), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(E.sunCol).multiplyScalar(E.night ? 0.07 : 0.075), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  m.frustumCulled = false; w.root.add(m); w.beams = m;
}

/* ---------- River Gorge: waterfalls over rock walls on the far bank ---------- */
export function buildFalls(w) {
  const E = w.env, rockC = new THREE.Color(E.rock), rocks = [], falls = [], mist = [], R = rng(E.seed + 13), yaw = new THREE.Matrix4();
  const tex = canvasTex(256, 512, (g, W, H) => { g.clearRect(0, 0, W, H); const r = rng(9); for (let i = 0; i < 900; i++) { const x = W * (0.03 + r() * 0.94), L = 40 + r() * 180, y = r() * H, v = 205 + r() * 50; g.strokeStyle = `rgba(${v},${v + 5},${Math.min(255, v + 12)},${0.25 + r() * 0.6})`; g.lineWidth = 1.5 + r() * 5; const dx = (r() - 0.5) * 3; for (const dy of [-H, 0, H]) { g.beginPath(); g.moveTo(x, y + dy); g.lineTo(x + dx, y + dy + L); g.stroke(); } } }, { repeat: true });
  for (const [s, dx, W, H] of [[105, -56, 12, 30], [190, -50, 7, 22], [290, -56, 12, 30], [375, -50, 8, 24]]) {
    const x = w.xr(s) + dx, z = -s, base = E.waterY - 2; yaw.makeRotationY(0.55).setPosition(x, base, z);
    const g = new THREE.BoxGeometry(W * 2.6 + 20, H + 8, 26, 30, 16, 3), p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const px = p.getX(i), py = p.getY(i) + (H + 8) / 2, pz = p.getZ(i), n = fbm(px * 0.11 + s, py * 0.16, 3), notch = smooth(W * 0.72, W * 0.5, Math.abs(px)) * smooth(H - 7, H, py) * 3.5, fr = pz > 0 ? 1 : 0;
      p.setY(i, py - notch + (py > H ? (n - 0.5) * 7 : 0)); p.setZ(i, pz + (n - 0.5) * 7 * fr - smooth(W * 0.75, W * 0.45, Math.abs(px)) * 2.4 * fr); p.setX(i, px + (fbm(py * 0.14, pz * 0.14 + 3, 2) - 0.5) * 4);
      const k = (0.55 + n * 0.8) * (0.85 + 0.2 * Math.sin(py * 1.5 + n * 5)); c[i * 3] = rockC.r * k; c[i * 3 + 1] = rockC.g * k; c[i * 3 + 2] = rockC.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.applyMatrix4(yaw); rocks.push(g);
    const f = new THREE.PlaneGeometry(W, H - 2.5, 6, 8); f.translate(0, (H - 2.5) / 2, 0); const q = f.attributes.position, u = f.attributes.uv;
    for (let i = 0; i < q.count; i++) { const py = q.getY(i), t = py / (H - 2.5); q.setZ(i, 11.2 + (1 - t) * 1.6 + vnoise(q.getX(i) * 0.4, py * 0.2) * 0.8); u.setXY(i, u.getX(i) * 1.4, u.getY(i) * H / 12); }
    f.applyMatrix4(yaw); falls.push(f);
    const V = new THREE.Vector3(); for (let i = 0; i < 9; i++) { V.set((R() - 0.5) * W * 1.2, 2.2 + R() * 3, 13 + R() * 4).applyMatrix4(yaw); mist.push(V.x, V.y, V.z); }
  }
  const rock = new THREE.Mesh(mergeGeometries(rocks), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: w.detail })); rock.geometry.computeVertexNormals(); rock.receiveShadow = true; w.root.add(rock);
  const fall = new THREE.Mesh(mergeGeometries(falls), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.3, emissive: 0x8fb4c0, emissiveIntensity: 0.55, emissiveMap: tex, side: THREE.DoubleSide })); w.root.add(fall); w.fallTex = tex;
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(mist, 3));
  const pm = new THREE.Points(pg, new THREE.PointsMaterial({ map: radialTex([[0, 'rgba(255,255,255,0.75)'], [0.55, 'rgba(255,255,255,0.32)'], [1, 'rgba(255,255,255,0)']]), size: 13, transparent: true, opacity: 0.62, depthWrite: false })); pm.frustumCulled = false; w.root.add(pm);
}

/* ---------- Volcano Ridge: lava on the cone and in streams beside the track ---------- */
export function buildLava(w) {
  const E = w.env, grp = w.volcano;
  const tex = canvasTex(128, 512, (g, W, H) => { const r = rng(12), gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(70,14,0,0)'); gr.addColorStop(0.16, '#a82a06'); gr.addColorStop(0.36, '#ff7a14'); gr.addColorStop(0.5, '#ffe68a'); gr.addColorStop(0.64, '#ff7a14'); gr.addColorStop(0.84, '#a82a06'); gr.addColorStop(1, 'rgba(70,14,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); for (let i = 0; i < 120; i++) { const x = W * (0.12 + r() * 0.76), y = r() * H, R = 4 + r() * 16, ro = r() * 0.8; for (const dy of [-H, 0, H]) { g.fillStyle = 'rgba(38,16,10,0.85)'; g.beginPath(); g.ellipse(x, y + dy, R * 0.6, R, ro, 0, 7); g.fill(); } } }, { repeat: true });
  w.lavaTex = tex; grp.scale.setScalar(1.05);
  const cone = [];
  for (const [a0, y0] of [[1.57, 1], [1.2, 0.86], [1.98, 0.9], [0.86, 0.78], [2.3, 0.72]]) { const pos = [], uv = [], idx = [], N = 22; for (let i = 0; i <= N; i++) { const t = y0 - i / N * y0, R = lerp(230, 26, Math.pow(t, 0.7)) + 2.5, a = a0 + Math.sin(t * 13 + a0 * 7) * 0.05, wd = 4 + (1 - t) * 11, cx = Math.cos(a), cz = Math.sin(a); for (const sd of [-1, 1]) { pos.push(cx * R - cz * wd * sd, t * 170, cz * R + cx * wd * sd); uv.push((sd + 1) / 2, i / 6); } if (i < N) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } } cone.push(ribbon(pos, uv, idx)); }
  grp.add(new THREE.Mesh(mergeGeometries(cone), new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false, side: THREE.DoubleSide })));
  const streams = [], halos = [], r = rng(E.seed + 3);
  for (let k = 0; k < 12; k++) { const side = k % 2 ? 1 : -1, L = 8.5 + r() * 12, A = 3 + r() * 2, ph = r() * 6, sa = -10 + k * (E.len - 40) / 11 + r() * 12 - 20, sb = sa + 90 + r() * 70, pos = [], uv = [], idx = []; let n = 0;
    for (let s = sa; s < sb; s += 1.4) { const lat = side * (L + A * Math.sin(s * 0.07 + ph) + 1.5 * Math.sin(s * 0.21 + ph)), wd = 1.3 + 0.6 * Math.sin(s * 0.13 + ph), cx = w.xr(s) + lat, z = -s; for (const sd of [-1, 0, 1]) { const x = cx + sd * wd; pos.push(x, w.ground(x, z) + 0.12, z); uv.push((sd + 1) / 2, s / 7); } if (s + 1.4 < sb) for (let j = 0; j < 2; j++) { const q = n + j; idx.push(q, q + 1, q + 3, q + 1, q + 4, q + 3); } n += 3; if ((n / 3) % 6 === 0) halos.push(cx, w.ground(cx, z) + 1.1, z); }
    streams.push(ribbon(pos, uv, idx)); }
  const m = new THREE.Mesh(mergeGeometries(streams), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.frustumCulled = false; w.root.add(m);
  w.root.add(glowPoints(halos, radialTex([[0, 'rgba(255,120,40,0.9)'], [0.35, 'rgba(255,120,40,0.4)'], [1, 'rgba(255,120,40,0)']]), 11, 0.55));
}

/* ---------- Moonlight Jungle: a big moon and a star field (the mushrooms' glow is added here too) ---------- */
export function buildNight(w, shrooms) {
  const E = w.env, r = rng(E.seed + 7);
  const tex = canvasTex(256, 256, (g, W) => { g.clearRect(0, 0, W, W); g.fillStyle = '#f6f1dc'; g.beginPath(); g.arc(W / 2, W / 2, W * 0.47, 0, 7); g.fill(); g.save(); g.beginPath(); g.arc(W / 2, W / 2, W * 0.47, 0, 7); g.clip(); const q = rng(21); for (let i = 0; i < 26; i++) { const x = q() * W, y = q() * W, R = 6 + q() * 34; g.fillStyle = `rgba(150,158,180,${0.18 + q() * 0.3})`; g.beginPath(); g.ellipse(x, y, R, R * 0.85, q() * 3, 0, 7); g.fill(); } g.restore(); });
  const M = new THREE.Vector3(0.05, 0.25, -0.97).normalize().multiplyScalar(960);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, toneMapped: false, color: 0xb8b8b0 })); moon.position.copy(M); moon.scale.set(170, 170, 1); w.mtn.add(moon);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, 'rgba(170,195,255,0.28)'], [0.3, 'rgba(140,170,255,0.12)'], [1, 'rgba(120,150,255,0)']]), fog: false, depthWrite: false, blending: THREE.AdditiveBlending })); halo.position.copy(M); halo.scale.set(730, 730, 1); w.mtn.add(halo);
  const pos = [], cl = []; for (let i = 0; i < 1600; i++) { const a = r() * 6.28, y = 0.1 + r() * 0.9, q = Math.sqrt(1 - y * y); pos.push(Math.cos(a) * q * 1000, y * 1000, Math.sin(a) * q * 1000); const t = 0.5 + r() * 0.5; cl.push(t, t, 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 4.5, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false, toneMapped: false, map: radialTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']], 32) })); stars.frustumCulled = false; w.mtn.add(stars);
  w.skyObjs = [moon, halo, stars];
  if (shrooms && shrooms.length) { const pts = []; for (const p of shrooms) pts.push(p[0], p[1] + 0.6, p[2]); w.root.add(glowPoints(pts, radialTex([[0, 'rgba(90,235,255,0.8)'], [0.35, 'rgba(90,235,255,0.35)'], [1, 'rgba(90,235,255,0)']]), 2.6, 0.38)); }
}

/* ---------- Frozen Peaks: northern lights ---------- */
export function buildAurora(w) {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { t: { value: 3 }, vis: { value: 1 } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vU; uniform float t, vis; void main(){ float u = vU.x * 64., v = vU.y; float wave = sin(u*.9 + sin(u*.31+t)*2.2) * .5 + .5; float rays = pow(.5+.5*sin(u*22. + sin(u*4.1+t*.3)*3.), 2.) * .55 + .45; float low = smoothstep(.0,.1,v - wave*.16); float hi = pow(1. - clamp(v,0.,1.), 1.9); float bandm = smoothstep(.1,.5, sin(u*.27+1.2+t*.05)*.5+.5); vec3 col = mix(vec3(.15,1.,.55), vec3(.55,.25,1.), smoothstep(.22,.82,v)); gl_FragColor = vec4(col * (.3+bandm*.9), low*hi*rays*.95*vis); }` });
  const gs = []; for (const [R, H, y] of [[920, 430, 130], [860, 340, 170]]) { const g = new THREE.CylinderGeometry(R, R, H, 120, 1, true); g.translate(0, y + H / 2, 0); gs.push(g); }
  const a = new THREE.Mesh(mergeGeometries(gs), m); a.frustumCulled = false; w.mtn.add(a); w.auroraMat = m;
}
