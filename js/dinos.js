// 3D dinosaurs. Two sources:
//  1) Procedural rigs built in code (smooth swept bodies, jointed legs, hinged jaws, painted skin + bump).
//  2) Optional CC0 Quaternius glTF models listed in models/models.json (skinned, with their own clips).
// Both expose the same Dino API: pos, heading, speed, setAnim(), update(dt), hit meshes tagged head/body.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, rng, fbm, vnoise, canvasTex } from './util.js';

/* ---------------- species ---------------- */
export const SPECIES = {
  raptor: { name: 'Raptor', type: 'thero', hip: 0.85, bulk: 0.22, back: 0.78, neck: 0.55, head: 0.36, tail: 1.65, arm: 0.36, headType: 'raptor', speed: [5.0, 9.5], hp: 1, cry: 'screech', fea: true,
    pal: [{ dark: '#4a3420', base: '#a3804c', belly: '#e2d0a4', stripe: '#2e1e10' }, { dark: '#38431f', base: '#7f8f52', belly: '#d6daac', stripe: '#232b12' }] },
  trike: { name: 'Triceratops', type: 'quad', legF: 1.15, legR: 1.3, bulk: 0.95, body: 3.0, neck: 0.5, head: 1.0, tail: 2.2, headType: 'trike', speed: [2.0, 4.8], hp: 3, cry: 'bellow',
    pal: [{ dark: '#3e3a2f', base: '#857e69', belly: '#c8bfa2', stripe: '#2f2b22', frill: '#9a5236', frill2: '#d8a35a' }] },
  stego: { name: 'Stegosaurus', type: 'quad', legF: 0.95, legR: 1.55, bulk: 0.9, body: 3.2, neck: 0.7, head: 0.5, tail: 2.8, headType: 'stego', speed: [1.3, 2.8], hp: 3, cry: 'bellow', plates: true,
    pal: [{ dark: '#3c4629', base: '#80905a', belly: '#cdcda0', stripe: '#2c3420', plate: '#a85e36', plate2: '#e0a05e' }] },
  ptera: { name: 'Pteranodon', type: 'flyer', span: 5.6, speed: [7, 11], hp: 1, cry: 'squawk',
    pal: [{ dark: '#4e3428', base: '#ad8063', belly: '#e6d0ba', stripe: '#6e4a36', wing: '#8e6249', crest: '#b9452c' }] },
  spino: { name: 'Spinosaurus', type: 'thero', hip: 2.2, bulk: 0.68, back: 2.5, neck: 1.25, head: 1.55, tail: 5.2, arm: 1.0, headType: 'spino', sail: 2.1, speed: [3, 6], hp: 12, cry: 'roar',
    pal: [{ dark: '#26322f', base: '#5e7068', belly: '#c4c2a8', stripe: '#1e2826', sail: '#a94f33', sail2: '#e1a15a' }] },
  rex: { name: 'T. rex', type: 'thero', hip: 2.5, bulk: 0.9, back: 2.2, neck: 0.85, head: 1.4, tail: 5.0, arm: 0.55, headType: 'rex', speed: [3.5, 7], hp: 14, cry: 'roar',
    pal: [{ dark: '#382a1c', base: '#7a644a', belly: '#c6b28c', stripe: '#2a1e12' }] },
  apato: { name: 'Apatosaurus', type: 'quad', legF: 4.0, legR: 4.4, bulk: 2.1, body: 7.0, neck: 9.0, head: 0.9, tail: 11, headType: 'apato', speed: [1.0, 1.6], hp: 99, cry: 'hoot', longNeck: true,
    pal: [{ dark: '#3e463e', base: '#7c8679', belly: '#b9bca8', stripe: '#323a32' }] },
};
SPECIES.bigTrike = Object.assign({}, SPECIES.trike, { base: 'trike', hp: 10, cry: 'bellowBig' });
SPECIES.bigStego = Object.assign({}, SPECIES.stego, { base: 'stego', hp: 10, cry: 'bellowBig' });
SPECIES.alphaRaptor = Object.assign({}, SPECIES.raptor, { base: 'raptor', hp: 10, cry: 'screech' });
SPECIES.kingRex = Object.assign({}, SPECIES.rex, { base: 'rex', hp: 16, cry: 'roar' });
SPECIES.shadowRex = Object.assign({}, SPECIES.rex, { base: 'rex', hp: 14, cry: 'roar', tint: 0x26304a, tintK: 0.5 });
SPECIES.bigSpino = Object.assign({}, SPECIES.spino, { base: 'spino', hp: 14, cry: 'roar' });
SPECIES.frostTrike = Object.assign({}, SPECIES.trike, { base: 'trike', hp: 12, cry: 'bellowBig', tint: 0x8fb8e6, tintK: 0.5 });

// more species: built-in rigs with their own silhouettes (crests, horns, domes, armour)
Object.assign(SPECIES, {
  carno: { name: 'Carnotaurus', type: 'thero', hip: 1.7, bulk: 0.58, back: 1.6, neck: 0.6, head: 0.95, tail: 3.6, arm: 0.16, headType: 'carno', speed: [4.5, 8.5], hp: 5, cry: 'bellow',
    pal: [{ dark: '#5a1f18', base: '#a8493a', belly: '#e2c7a0', stripe: '#3a120e' }] },
  dilo: { name: 'Dilophosaurus', type: 'thero', hip: 1.15, bulk: 0.36, back: 1.15, neck: 0.75, head: 0.6, tail: 2.6, arm: 0.5, headType: 'dilo', speed: [4, 7.5], hp: 2, cry: 'screech',
    pal: [{ dark: '#3d4a18', base: '#a3a83c', belly: '#ece4b0', stripe: '#232c0c', crest: '#d9542b' }, { dark: '#1f3f4f', base: '#4f8fa8', belly: '#e0e4c8', stripe: '#122a36', crest: '#e8a02c' }] },
  pachy: { name: 'Pachycephalosaurus', type: 'thero', hip: 1.25, bulk: 0.44, back: 0.95, neck: 0.55, head: 0.62, tail: 2.1, arm: 0.36, headType: 'pachy', speed: [4.2, 7.8], hp: 2, cry: 'bellow',
    pal: [{ dark: '#3f3350', base: '#7a6a8f', belly: '#d8cfc0', stripe: '#2c2338', crest: '#c9a877' }] },
  para: { name: 'Parasaurolophus', type: 'quad', legF: 1.1, legR: 1.9, bulk: 0.72, body: 2.9, neck: 1.05, neckUp: 0.6, head: 0.62, tail: 3.0, headType: 'para', speed: [2.2, 4.6], hp: 2, cry: 'hoot',
    pal: [{ dark: '#20494a', base: '#4f9088', belly: '#dcd9b4', stripe: '#173536', crest: '#e0762f' }, { dark: '#4c3a20', base: '#b08a4a', belly: '#ece0ba', stripe: '#33260f', crest: '#c8402c' }] },
  anky: { name: 'Ankylosaurus', type: 'quad', legF: 0.8, legR: 0.95, bulk: 1.02, body: 3.4, neck: 0.35, head: 0.72, tail: 2.7, headType: 'anky', armor: true, club: true, speed: [1.2, 2.6], hp: 4, cry: 'bellow',
    pal: [{ dark: '#4a3a1f', base: '#9a7f3f', belly: '#d7c48e', stripe: '#33270f', crest: '#bfa569' }] },
  quetzal: Object.assign({}, SPECIES.ptera, { name: 'Quetzalcoatlus', span: 6.5, speed: [6, 9], hp: 2, sizeR: [1.5, 1.8],
    pal: [{ dark: '#26405e', base: '#5a86ad', belly: '#e4e8e0', stripe: '#3c5f82', wing: '#3f6f9c', crest: '#e8742c' }] }),
  compy: Object.assign({}, SPECIES.raptor, { base: 'raptor', name: 'Compsognathus', hp: 1, speed: [6, 10], tint: 0x6fbf3a, tintK: 0.45, sizeR: [0.7, 0.9] }),
});
// colour morphs: individuals of a species do not all look alike (null = natural colour)
SPECIES.raptor.morphs = [null, [0x3d7a3a, 0.35], [0x8a3a22, 0.35]];
SPECIES.trike.morphs = [null, [0x5b6f8a, 0.3], [0x9a7a3a, 0.3]];
SPECIES.stego.morphs = [null, [0x8a5a2a, 0.3], [0x4a7a6a, 0.3]];

/* ---------------- visibility: rim light, lighter fog, lifted shadows ---------------- */
export const DINO_LOOK = { rim: { value: 0.4 }, rimColor: { value: new THREE.Color(0xfff0d6) }, fog: { value: 0.6 }, lift: { value: 0.07 } };
const tintCache = new Map();
function tinted(m, tint, k) { // shared per material + colour, so morphs add no extra materials per spawn
  const key = m.uuid + '|' + tint + '|' + k; let c = tintCache.get(key);
  if (!c) { c = m.clone(); c.userData.dinoLook = false; if (c.color) c.color.lerp(new THREE.Color(tint), k); tintCache.set(key, c); }
  return c;
}
const crestCache = new Map();
function crestMat(col) { let c = crestCache.get(col); if (!c) { c = new THREE.MeshStandardMaterial({ color: col, roughness: 0.65, side: THREE.DoubleSide }); crestCache.set(col, c); } return c; }
function dinoLook(m) {
  if (m.userData.dinoLook) return m; m.userData.dinoLook = true;
  m.onBeforeCompile = sh => {
    sh.uniforms.uRim = DINO_LOOK.rim; sh.uniforms.uRimCol = DINO_LOOK.rimColor; sh.uniforms.uFogK = DINO_LOOK.fog; sh.uniforms.uLift = DINO_LOOK.lift;
    sh.fragmentShader = 'uniform float uRim; uniform vec3 uRimCol; uniform float uFogK; uniform float uLift;' + String.fromCharCode(10) + sh.fragmentShader
      .replace('#include <opaque_fragment>', `float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.8);
        outgoingLight += uRimCol * rimF * uRim + diffuseColor.rgb * uLift;
        #include <opaque_fragment>`)
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
        float fogF = smoothstep( fogNear, fogFar, vFogDepth ) * uFogK;
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogF );
        #endif`);
  };
  m.customProgramCacheKey = () => 'dinoLook';
  return m;
}

/* ---------------- skin textures ---------------- */
const texCache = {};
function skinTex(key, pal, opts = {}) {
  if (texCache[key]) return texCache[key];
  const W = 256, H = 512, r = rng(key.length * 97 + 13);
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const dk = hex(pal.dark), bs = hex(pal.base), bl = hex(pal.belly), st = hex(pal.stripe || pal.dark);
  const map = canvasTex(W, H, (g) => {
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H, d = Math.sin(u * Math.PI * 2);           // d=1 dorsal, -1 belly
      const kB = Math.min(1, Math.max(0, (d + 0.45) / 0.6)), kD = Math.min(1, Math.max(0, (d - 0.2) / 0.7));
      let c = [0, 1, 2].map(i => bl[i] + (bs[i] - bl[i]) * kB); c = c.map((q, i) => q + (dk[i] - q) * kD * 0.85);
      // stripes across the back
      const band = Math.sin(v * (opts.stripes || 34) + fbm(u * 6, v * 9, 2) * 4);
      if (band > 0.45 && d > -0.15) { const s = Math.min(1, (band - 0.45) * 3) * 0.55 * Math.min(1, (d + 0.15) * 2); c = c.map((q, i) => q + (st[i] - q) * s); }
      // scales: cellular-ish dark creases + speckle
      const cx = x / 5, cy = y / 5, cell = vnoise(cx * 1.0, cy * 1.0), crease = Math.abs(Math.sin(cx * 1.9 + cell * 3) * Math.sin(cy * 1.7 - cell * 3));
      const shadeK = 0.82 + crease * 0.22 + (r() - 0.5) * 0.06 + (fbm(u * 10, v * 20, 3) - 0.5) * 0.25;
      const i = (y * W + x) * 4; img.data[i] = c[0] * shadeK; img.data[i + 1] = c[1] * shadeK; img.data[i + 2] = c[2] * shadeK; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: true });
  const bump = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const cx = x / 6, cy = y / 6, cell = vnoise(cx, cy); const v = 120 + Math.abs(Math.sin(cx * 2.1 + cell * 4) * Math.sin(cy * 1.8 - cell * 4)) * 110 + vnoise(x / 2, y / 2) * 25; const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, { repeat: true, linear: true });
  bump.repeat.set(3, 6);
  return (texCache[key] = { map, bump });
}
function skinMat(key, pal, opts) { const t = skinTex(key, pal, opts); return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 2.2, roughness: 0.72, metalness: 0, envMapIntensity: 0.8 }); }
const MAT = {};
function shared() {
  if (MAT.tooth) return MAT;
  MAT.tooth = new THREE.MeshStandardMaterial({ color: 0xeee6cc, roughness: 0.4 });
  MAT.claw = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.5 });
  MAT.mouth = new THREE.MeshStandardMaterial({ color: 0x6a1c1c, roughness: 0.6 });
  MAT.eye = new THREE.MeshStandardMaterial({ color: 0xd9a032, roughness: 0.15, metalness: 0.1, emissive: 0x2a1800 });
  MAT.pupil = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.05 });
  MAT.horn = new THREE.MeshStandardMaterial({ color: 0xe0d6b8, roughness: 0.55 });
  return MAT;
}

/* ---------------- geometry helpers ---------------- */
// sweep an elliptical section along a smooth spine. pts: [x,y,z, ry, rx]
function tube(pts, radial = 14, seg = 4) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
  const n = (pts.length - 1) * seg, pos = [], uv = [], idx = [], up = new THREE.Vector3(), side = new THREE.Vector3(), N = new THREE.Vector3(), P = new THREE.Vector3(), T = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n; curve.getPoint(t, P); curve.getTangent(t, T);
    const f = t * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f)), w = f - k, sw = w * w * (3 - 2 * w);
    const ry = lerp(pts[k][3], pts[k + 1][3], sw), rx = lerp(pts[k][4] ?? pts[k][3], pts[k + 1][4] ?? pts[k + 1][3], sw);
    up.set(0, 1, 0); if (Math.abs(T.y) > 0.92) up.set(0, 0, 1);
    side.crossVectors(T, up).normalize(); N.crossVectors(side, T).normalize();
    for (let j = 0; j <= radial; j++) {
      const th = j / radial * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      pos.push(P.x + side.x * c * rx + N.x * s * ry, P.y + side.y * c * rx + N.y * s * ry, P.z + side.z * c * rx + N.z * s * ry);
      uv.push(j / radial, t);
    }
  }
  const R = radial + 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) { const a = i * R + j, b = a + R, c = a + 1, d = b + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function mesh(g, m, parent, part) { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; if (part) o.userData.part = part; parent.add(o); return o; }
function pivot(parent, x, y, z) { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; }
function cone(r, h, m, parent, x, y, z, rx = 0, rz = 0, part) { const g = new THREE.ConeGeometry(r, h, 7); g.translate(0, h / 2, 0); const o = mesh(g, m, parent, part); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = false; return o; }
function eye(parent, x, y, z, r) { const m = shared(); const e = mesh(new THREE.SphereGeometry(r, 12, 8), m.eye, parent, 'head'); e.position.set(x, y, z); const p = mesh(new THREE.SphereGeometry(r * 0.55, 8, 6), m.pupil, e, 'head'); p.position.set(Math.sign(x) * r * 0.6, 0, r * 0.15); p.scale.set(0.4, 1, 1); e.castShadow = false; return e; }
// a membrane between points (sails, wings)
function membrane(outline, mat, parent, part) {
  const shape = new THREE.Shape(); outline.forEach((p, i) => i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1]));
  const g = new THREE.ShapeGeometry(shape, 8); const o = mesh(g, mat, parent, part); return o;
}

/* ---------------- procedural rigs ---------------- */
function buildHead(D, hp, sp, skin, h) {
  const m = shared(), type = sp.headType;
  const head = { pivot: hp };
  if (type === 'trike') {
    mesh(tube([[0, 0.1 * h, -0.25 * h, 0.34 * h, 0.3 * h], [0, 0.05 * h, 0.15 * h, 0.4 * h, 0.34 * h], [0, -0.05 * h, 0.6 * h, 0.28 * h, 0.22 * h], [0, -0.2 * h, 0.95 * h, 0.12 * h, 0.1 * h], [0, -0.3 * h, 1.05 * h, 0.03 * h, 0.03 * h]]), skin, hp, 'head');
    const fm = new THREE.MeshStandardMaterial({ map: skinTex('frill', { dark: sp.pal[0].frill, base: sp.pal[0].frill2, belly: sp.pal[0].frill2, stripe: sp.pal[0].frill }).map, bumpMap: skinTex('frill', sp.pal[0]).bump, bumpScale: 2, roughness: 0.7, side: THREE.DoubleSide });
    const fg = pivot(hp, 0, 0.42 * h, -0.28 * h); fg.rotation.x = -0.55;
    const fr = mesh(new THREE.SphereGeometry(0.8 * h, 24, 12), fm, fg, 'head'); fr.scale.set(1.15, 1.0, 0.16);
    for (let i = 0; i < 13; i++) { const a = -0.15 * Math.PI + i / 12 * 1.3 * Math.PI; const bmp = mesh(new THREE.SphereGeometry(0.07 * h, 8, 6), m.horn, fg, 'head'); bmp.position.set(Math.cos(a) * 0.9 * h, Math.sin(a) * 0.79 * h, 0); bmp.scale.set(1, 1, 0.7); bmp.castShadow = false; }
    cone(0.09 * h, 0.85 * h, m.horn, hp, 0.2 * h, 0.3 * h, 0.2 * h, 0.95, -0.15, 'head'); cone(0.09 * h, 0.85 * h, m.horn, hp, -0.2 * h, 0.3 * h, 0.2 * h, 0.95, 0.15, 'head');
    cone(0.06 * h, 0.32 * h, m.horn, hp, 0, 0.05 * h, 0.78 * h, 0.6, 0, 'head');
    const beak = mesh(new THREE.ConeGeometry(0.1 * h, 0.3 * h, 6), m.claw, hp, 'head'); beak.rotation.x = Math.PI * 0.62; beak.position.set(0, -0.28 * h, 1.05 * h);
    head.jaw = pivot(hp, 0, -0.22 * h, 0.1 * h); mesh(tube([[0, 0, 0, 0.16 * h, 0.2 * h], [0, -0.06 * h, 0.5 * h, 0.12 * h, 0.14 * h], [0, -0.08 * h, 0.85 * h, 0.03 * h]]), skin, head.jaw, 'head');
    eye(hp, 0.27 * h, 0.12 * h, 0.35 * h, 0.06 * h); eye(hp, -0.27 * h, 0.12 * h, 0.35 * h, 0.06 * h);
    return head;
  }
  if (type === 'stego' || type === 'apato' || type === 'para' || type === 'pachy' || type === 'anky') {
    mesh(tube([[0, 0, -0.3 * h, 0.3 * h, 0.28 * h], [0, 0.04 * h, 0.2 * h, 0.32 * h, 0.3 * h], [0, -0.02 * h, 0.7 * h, 0.2 * h, 0.2 * h], [0, -0.08 * h, 1.0 * h, 0.04 * h]]), skin, hp, 'head');
    head.jaw = pivot(hp, 0, -0.16 * h, 0); mesh(tube([[0, 0, -0.1 * h, 0.12 * h, 0.2 * h], [0, -0.02 * h, 0.5 * h, 0.1 * h, 0.16 * h], [0, 0, 0.9 * h, 0.03 * h]]), skin, head.jaw, 'head');
    eye(hp, 0.25 * h, 0.12 * h, 0.15 * h, 0.07 * h); eye(hp, -0.25 * h, 0.12 * h, 0.15 * h, 0.07 * h);
    if (type === 'para') mesh(tube([[0, 0.18 * h, -0.05 * h, 0.13 * h, 0.08 * h], [0, 0.5 * h, -0.55 * h, 0.14 * h, 0.09 * h], [0, 0.78 * h, -1.15 * h, 0.11 * h, 0.07 * h], [0, 0.86 * h, -1.6 * h, 0.03 * h]], 8, 3), crestMat(sp.pal[0].crest), hp, 'head');
    if (type === 'pachy') {
      const dome = mesh(new THREE.SphereGeometry(0.44 * h, 14, 10), crestMat(sp.pal[0].crest), hp, 'head'); dome.position.set(0, 0.3 * h, -0.08 * h); dome.scale.set(1, 0.9, 1.1);
      const kn = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, g = new THREE.ConeGeometry(0.05 * h, 0.17 * h, 5); g.translate(Math.cos(a) * 0.43 * h, 0.14 * h, -0.08 * h + Math.sin(a) * 0.47 * h); kn.push(g); }
      mesh(mergeG(kn), m.horn, hp, 'head').castShadow = false;
    }
    if (type === 'anky') for (const s of [-1, 1]) cone(0.08 * h, 0.34 * h, m.horn, hp, s * 0.28 * h, 0.04 * h, -0.15 * h, -0.4, -s * 1.1, 'head');
    return head;
  }
  // theropod skulls
  const long = type === 'spino' ? 1.45 : type === 'carno' ? 0.85 : type === 'dilo' ? 1.2 : 1, deep = type === 'rex' ? 1.25 : type === 'carno' ? 1.15 : type === 'spino' ? 0.7 : type === 'dilo' ? 0.75 : 0.9, wide = type === 'rex' ? 1.15 : type === 'carno' ? 1 : type === 'dilo' ? 0.7 : 0.8;
  mesh(tube([[0, 0.08 * h, -0.22 * h, 0.3 * h * deep, 0.3 * h * wide], [0, 0.12 * h * deep, 0.15 * h, 0.36 * h * deep, 0.32 * h * wide], [0, 0.06 * h * deep, 0.55 * h * long, 0.25 * h * deep, 0.22 * h * wide], [0, 0, 0.92 * h * long, 0.16 * h * deep, 0.15 * h * wide], [0, -0.04 * h, 1.04 * h * long, 0.05 * h]]), skin, hp, 'head');
  if (type === 'spino') { const cr = mesh(tube([[0, 0.25 * h, 0.1 * h, 0.06 * h, 0.03 * h], [0, 0.32 * h, 0.35 * h, 0.08 * h, 0.03 * h], [0, 0.2 * h, 0.6 * h, 0.03 * h]]), skin, hp, 'head'); void cr; }
  if (type === 'rex') { mesh(tube([[0.2 * h, 0.36 * h, 0.12 * h, 0.06 * h], [0.18 * h, 0.4 * h, 0.28 * h, 0.07 * h], [0.16 * h, 0.3 * h, 0.45 * h, 0.03 * h]]), skin, hp, 'head'); mesh(tube([[-0.2 * h, 0.36 * h, 0.12 * h, 0.06 * h], [-0.18 * h, 0.4 * h, 0.28 * h, 0.07 * h], [-0.16 * h, 0.3 * h, 0.45 * h, 0.03 * h]]), skin, hp, 'head'); }
  if (type === 'carno') for (const s of [-1, 1]) cone(0.08 * h, 0.52 * h, m.horn, hp, s * 0.22 * h, 0.38 * h * deep, 0.1 * h, 0.15, -s * 0.75, 'head');
  if (type === 'dilo') for (const s of [-1, 1]) { const c = membrane([[-0.25 * h, 0], [-0.1 * h, 0.4 * h], [0.25 * h, 0.36 * h], [0.62 * h, 0.1 * h], [0.62 * h, 0]], crestMat(sp.pal[0].crest), hp, 'head'); c.rotation.y = -Math.PI / 2; c.rotation.z = s * 0.14; c.position.set(s * 0.13 * h, 0.2 * h, 0.2 * h); }
  // upper teeth
  const tg = []; const nT = type === 'spino' ? 14 : 9;
  for (let i = 0; i < nT; i++) { const z = (0.12 + i / nT * 0.8) * h * long; for (const s of [-1, 1]) { const g = new THREE.ConeGeometry(0.035 * h, 0.12 * h * (type === 'rex' ? 1.3 : 1), 5); g.rotateX(Math.PI); g.translate(s * (0.2 - i / nT * 0.08) * h * wide, -0.12 * h * deep, z); tg.push(g); } }
  head.teeth = mesh(mergeG(tg), m.tooth, hp, 'head'); head.teeth.castShadow = false;
  head.jaw = pivot(hp, 0, -0.1 * h * deep, -0.05 * h);
  mesh(tube([[0, 0, -0.08 * h, 0.17 * h * deep, 0.27 * h * wide], [0, -0.06 * h, 0.4 * h * long, 0.15 * h * deep, 0.2 * h * wide], [0, -0.02 * h, 0.9 * h * long, 0.08 * h, 0.12 * h * wide], [0, 0, 1.0 * h * long, 0.03 * h]]), skin, head.jaw, 'head');
  const mg = mesh(new THREE.BoxGeometry(0.3 * h * wide, 0.02 * h, 0.85 * h * long), m.mouth, head.jaw, 'head'); mg.position.set(0, 0.06 * h, 0.45 * h * long); mg.castShadow = false;
  const lt = []; for (let i = 0; i < nT - 1; i++) { const z = (0.15 + i / nT * 0.75) * h * long; for (const s of [-1, 1]) { const g = new THREE.ConeGeometry(0.03 * h, 0.1 * h, 5); g.translate(s * (0.15 - i / nT * 0.06) * h * wide, 0.08 * h, z); lt.push(g); } }
  mesh(mergeG(lt), m.tooth, head.jaw, 'head').castShadow = false;
  eye(hp, 0.24 * h * wide, 0.2 * h * deep, 0.12 * h, 0.055 * h); eye(hp, -0.24 * h * wide, 0.2 * h * deep, 0.12 * h, 0.055 * h);
  return head;
}
function mergeG(gs) { // tiny merge (same attributes)
  let nV = 0, nI = 0; for (const g of gs) { nV += g.attributes.position.count; nI += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), idx = []; let o = 0;
  for (const g of gs) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); const ix = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()]; for (const i of ix) idx.push(i + o); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(idx); return g;
}

function buildThero(D, sp, skin) {
  const b = sp.bulk, hip = sp.hip, back = sp.back, n = sp.neck, m = shared();
  const body = D.body = pivot(D.tilt, 0, hip, 0);
  // torso + neck as one smooth sweep
  mesh(tube([[0, 0.12 * b, -0.7 * b, 0.82 * b, 0.7 * b], [0, 0.2 * b, 0, 1.0 * b, 0.88 * b], [0, 0.18 * b, back * 0.5, 1.05 * b, 0.9 * b], [0, 0.05 * b, back, 0.85 * b, 0.72 * b], [0, 0.3 * n + 0.1 * b, back + 0.35 * n, 0.58 * b, 0.5 * b], [0, 0.55 * n, back + 0.7 * n, 0.44 * b, 0.4 * b], [0, 0.62 * n, back + 0.92 * n, 0.38 * b, 0.34 * b]], 16, 5), skin, body, 'body');
  if (sp.sail) {
    const sm = new THREE.MeshStandardMaterial({ map: skinTex('sail', { dark: sp.pal[0].sail, base: sp.pal[0].sail2, belly: sp.pal[0].sail, stripe: sp.pal[0].sail }, { stripes: 60 }).map, roughness: 0.75, side: THREE.DoubleSide });
    const H = sp.sail, pts = [[-0.9 * b, 0.6 * b]]; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([lerp(-0.9 * b, back * 1.02, t), 0.7 * b + Math.sin(t * Math.PI) * H * (0.85 + 0.15 * Math.sin(t * 20))]); } pts.push([back * 1.02, 0.6 * b]);
    const sl = membrane(pts.map(p => [p[0], p[1]]), sm, body, 'body'); sl.rotation.y = -Math.PI / 2; sl.position.set(0, 0, 0);
  }
  // tail chain
  D.tail = []; let par = body, z = -0.6 * b, r0 = 0.72 * b, segs = [0.38, 0.33, 0.29];
  for (let i = 0; i < 3; i++) { const p = pivot(par, 0, i ? 0 : 0.18 * b, z); const L = sp.tail * segs[i], r1 = i === 2 ? 0.03 : r0 * 0.55;
    mesh(tube([[0, 0, 0.12 * b, r0, r0 * 0.85], [0, i === 0 ? 0.05 * b : 0, -L * 0.5, (r0 + r1) / 2, (r0 + r1) / 2 * 0.85], [0, -0.04 * b, -L, r1, r1 * 0.85]], 12, 3), skin, p, 'body');
    D.tail.push(p); par = p; z = -L; r0 = r1; }
  // head
  const hp = pivot(body, 0, 0.62 * n, back + 0.92 * n);
  D.head = buildHead(D, hp, sp, skin, sp.head); D.headPivot = hp; hp.rotation.x = 0.15;
  // legs
  const L = hip / 1.15; D.legs = []; const lk = hip > 1.5 ? 1.55 : 1;
  for (const s of [-1, 1]) {
    const th = pivot(body, s * 0.62 * b, 0, 0.05 * b);
    mesh(tube([[0, 0.3 * b, -0.05 * L, 0.85 * b, 0.55 * b], [0, -0.18 * L, 0.1 * L, 0.66 * b, 0.42 * b], [0, -0.46 * L, 0.18 * L, 0.26 * b, 0.22 * b]], 12, 3), skin, th, 'body');
    const kn = pivot(th, 0, -0.46 * L, 0.18 * L);
    mesh(tube([[0, 0, 0, 0.27 * b * lk, 0.22 * b * lk], [0, -0.2 * L, -0.1 * L, 0.22 * b * lk, 0.17 * b * lk], [0, -0.42 * L, -0.2 * L, 0.12 * b * lk, 0.11 * b * lk]], 10, 2), skin, kn, 'body');
    const an = pivot(kn, 0, -0.42 * L, -0.2 * L);
    mesh(tube([[0, 0, 0, 0.12 * b * lk, 0.11 * b * lk], [0, -0.3 * L, 0.06 * L, 0.09 * b * lk, 0.08 * b * lk]], 8, 2), skin, an, 'body');
    const ft = pivot(an, 0, -0.3 * L, 0.06 * L);
    for (const tx of [-1, 0, 1]) { mesh(tube([[0, 0, 0, 0.06 * b], [tx * 0.08 * L, -0.02 * L, 0.14 * L, 0.05 * b], [tx * 0.12 * L, -0.03 * L, 0.24 * L, 0.03 * b]], 6, 2), skin, ft, 'body'); cone(0.03 * b, 0.12 * L, m.claw, ft, tx * 0.12 * L, -0.03 * L, 0.23 * L, Math.PI / 2 + 0.3, 0); }
    if (sp.headType === 'raptor') cone(0.04, 0.16, m.claw, ft, -0.04 * s, 0.03, 0.08, -0.4, 0);
    D.legs.push({ th, kn, an, ft, s, front: false });
  }
  // little arms
  D.arms = [];
  for (const s of [-1, 1]) { const a = pivot(body, s * 0.5 * b, -0.25 * b, back * 0.92); const A = sp.arm;
    mesh(tube([[0, 0, 0, 0.16 * b, 0.13 * b], [0, -0.3 * A, 0.15 * A, 0.12 * b, 0.1 * b], [0, -0.35 * A, 0.45 * A, 0.07 * b, 0.06 * b]], 8, 2), skin, a, 'body');
    cone(0.025 * A + 0.01, 0.15 * A, m.claw, a, 0, -0.35 * A, 0.45 * A, Math.PI * 0.7, 0); a.rotation.x = 0.3; D.arms.push(a); }
  if (sp.fea) { // raptor: feather quills along neck/back and tail tip
    const fm = new THREE.MeshStandardMaterial({ color: new THREE.Color(sp.pal[0].stripe).multiplyScalar(1.4), roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) { const t = i / 8; const c = cone(0.025, 0.16, fm, body, 0, lerp(0.95 * b, 1.05 * n, t) + 0.15 * b, lerp(-0.2, back + 0.45 * n, t), -0.9, 0); c.castShadow = false; }
  }
  D.dims = { len: sp.tail + back + n * 0.6 + sp.head, height: hip + n + b, hipY: hip, halfW: b * 0.9, stride: 2.6 * hip };
}

function buildQuad(D, sp, skin) {
  const b = sp.bulk, Lf = sp.legF, Lr = sp.legR, bl = sp.body, m = shared();
  const hipY = Lr * 0.98;
  const body = D.body = pivot(D.tilt, 0, hipY, 0);
  const sh = Lf - Lr; // shoulder lower than hip when negative
  mesh(tube([[0, 0.1 * b, -0.75 * bl * 0.5, 0.7 * b, 0.65 * b], [0, 0.32 * b, -0.1 * bl, 1.0 * b, 0.92 * b], [0, 0.3 * b + sh * 0.35, bl * 0.25, 1.05 * b, 0.98 * b], [0, 0.1 * b + sh * 0.8, bl * 0.55, 0.82 * b, 0.8 * b], [0, sh + (sp.longNeck ? 0.3 * b : 0), bl * 0.68, 0.6 * b, 0.55 * b]], 16, 5), skin, body, 'body');
  if (sp.plates) {
    const pm = new THREE.MeshStandardMaterial({ map: skinTex('plate', { dark: sp.pal[0].plate, base: sp.pal[0].plate2, belly: sp.pal[0].plate, stripe: sp.pal[0].plate }).map, roughness: 0.7, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) { const t = i / 8, z = lerp(-0.62 * bl, 0.62 * bl, t) - 0.1 * bl, hgt = (0.35 + 0.65 * Math.exp(-Math.pow((t - 0.42) / 0.3, 2))) * b * 1.05;
      const top = 0.32 * b + Math.exp(-Math.pow((t - 0.4) / 0.5, 2)) * b * 0.95 + sh * t * 0.5;
      for (const s of [-1, 1]) { const p = membrane([[-hgt * 0.45, 0], [-hgt * 0.35, hgt * 0.7], [0, hgt], [hgt * 0.38, hgt * 0.7], [hgt * 0.45, 0]], pm, body, 'body'); p.rotation.y = Math.PI / 2; p.rotation.z = s * 0.12; p.position.set(s * 0.08 * b, top, z + s * 0.12 * bl * 0.15); } }
  }
  if (sp.armor) { // bony studs over the back, long spikes down the flanks
    const st = []; for (let i = 0; i < 8; i++) { const zz = lerp(-0.42 * bl, 0.5 * bl, i / 7); for (const a of [-1.42, -0.95, -0.5, 0, 0.5, 0.95, 1.42]) { const edge = Math.abs(a) > 1.3, h2 = (edge ? 0.62 : 0.3) * b, g = new THREE.ConeGeometry((edge ? 0.14 : 0.17) * b, h2, 6); g.translate(0, h2 / 2, 0); g.rotateZ(-a); g.translate(Math.sin(a) * 0.86 * b, 0.3 * b + Math.cos(a) * 0.92 * b, zz); st.push(g); } }
    mesh(mergeG(st), crestMat(sp.pal[0].crest), body, 'body').castShadow = false;
  }
  D.tail = []; let par = body, z = -0.42 * bl, r0 = 0.62 * b; const segs = [0.36, 0.34, 0.3];
  for (let i = 0; i < 3; i++) { const p = pivot(par, 0, i ? 0 : 0.1 * b, z); const L = sp.tail * segs[i], r1 = i === 2 ? 0.03 : r0 * 0.55;
    mesh(tube([[0, 0, 0.12 * b, r0, r0 * 0.9], [0, -0.05 * b, -L * 0.5, (r0 + r1) / 2], [0, -0.12 * b, -L, r1]], 12, 3), skin, p, 'body'); D.tail.push(p); par = p; z = -L; r0 = r1; }
  if (sp.plates) { const t = D.tail[2]; for (const s of [-1, 1]) for (const zz of [-0.4, -0.7]) cone(0.06 * b, 0.7 * b, m.horn, t, s * 0.05, 0.05, zz * sp.tail * 0.3, 0.3, s * 1.1); }
  if (sp.club) { const cl = mesh(new THREE.SphereGeometry(0.44 * b, 10, 8), crestMat(sp.pal[0].crest), D.tail[2], 'body'); cl.position.set(0, -0.12 * b, -sp.tail * 0.3); cl.scale.set(1.3, 0.72, 1); }
  // neck + head
  const nk = pivot(body, 0, sh + (sp.longNeck ? 0.3 * b : 0), bl * 0.62); D.neck = nk;
  let hp;
  if (sp.longNeck) { const N = sp.neck; mesh(tube([[0, 0, 0, 0.55 * b, 0.5 * b], [0, N * 0.35, N * 0.35, 0.35 * b, 0.3 * b], [0, N * 0.72, N * 0.55, 0.22 * b, 0.2 * b], [0, N * 0.95, N * 0.62, 0.17 * b, 0.15 * b]], 12, 4), skin, nk, 'head'); hp = pivot(nk, 0, N * 0.95, N * 0.62); }
  else { const N = sp.neck, up = (sp.neckUp || 0) * N; mesh(tube([[0, 0, -0.1, 0.55 * b, 0.5 * b], [0, -0.05 * b + up * 0.6, N * 0.6, 0.42 * b, 0.4 * b], [0, -0.1 * b + up, N, 0.3 * b]], 12, 3), skin, nk, 'body'); hp = pivot(nk, 0, -0.1 * b + up, N * 0.9); }
  D.head = buildHead(D, hp, sp, skin, sp.head); D.headPivot = hp; if (!sp.longNeck) hp.rotation.x = 0.25;
  // legs: rear pair + front pair
  D.legs = [];
  for (const [front, L, zz, yy] of [[false, Lr, -0.25 * bl, 0], [true, Lf, 0.42 * bl, sh * 0.9]]) for (const s of [-1, 1]) {
    const th = pivot(body, s * 0.72 * b, yy + 0.1 * b, zz);
    mesh(tube([[0, 0.25 * b, 0, (front ? 0.42 : 0.55) * b, 0.4 * b], [0, -0.45 * L, front ? 0.05 * L : -0.05 * L, 0.3 * b, 0.27 * b], [0, -0.55 * L, 0, 0.26 * b]], 12, 3), skin, th, 'body');
    const kn = pivot(th, 0, -0.52 * L, 0);
    mesh(tube([[0, 0, 0, 0.27 * b], [0, -0.3 * L, 0.02 * L, 0.23 * b], [0, -0.48 * L, 0.04 * L, 0.26 * b, 0.28 * b]], 10, 2), skin, kn, 'body');
    const pad = mesh(new THREE.CylinderGeometry(0.27 * b, 0.32 * b, 0.12 * L, 10), skin, kn, 'body'); pad.position.set(0, -0.48 * L, 0.05 * L);
    D.legs.push({ th, kn, s, front, an: null, ft: null });
  }
  D.dims = { len: bl + sp.tail * 0.8 + (sp.longNeck ? sp.neck * 0.6 : sp.neck + sp.head), height: hipY + b + (sp.longNeck ? sp.neck : 0), hipY, halfW: b * 0.95, stride: 2.2 * Lr };
}

function buildFlyer(D, sp, skin) {
  const pal = sp.pal[0], m = shared();
  const body = D.body = pivot(D.tilt, 0, 0, 0);
  mesh(tube([[0, 0, -0.6, 0.1, 0.1], [0, 0.02, -0.2, 0.2, 0.18], [0, 0.05, 0.25, 0.2, 0.18], [0, 0.12, 0.55, 0.12, 0.1], [0, 0.22, 0.75, 0.09]], 12, 3), skin, body, 'body');
  const hp = pivot(body, 0, 0.24, 0.78); D.headPivot = hp;
  mesh(tube([[0, 0, -0.1, 0.11, 0.09], [0, 0.02, 0.15, 0.12, 0.1], [0, -0.02, 0.55, 0.05, 0.04], [0, -0.04, 0.95, 0.015]], 10, 3), skin, hp, 'head');
  const cm = new THREE.MeshStandardMaterial({ color: pal.crest, roughness: 0.7, side: THREE.DoubleSide });
  const crest = membrane([[0, 0], [-0.7, 0.18], [-0.05, 0.14]], cm, hp, 'head'); crest.rotation.y = -Math.PI / 2; crest.position.set(0, 0.06, 0);
  eye(hp, 0.08, 0.06, 0.12, 0.03); eye(hp, -0.08, 0.06, 0.12, 0.03);
  D.head = { pivot: hp, jaw: pivot(hp, 0, -0.04, 0.1) }; mesh(tube([[0, 0, 0, 0.04, 0.05], [0, -0.01, 0.4, 0.025, 0.03], [0, 0, 0.8, 0.01]], 8, 2), skin, D.head.jaw, 'head');
  const wm = new THREE.MeshStandardMaterial({ map: skinTex('wing' + sp.name, { dark: pal.wing, base: pal.wing, belly: pal.belly, stripe: pal.dark }, { stripes: 8 }).map, roughness: 0.8, side: THREE.DoubleSide, transparent: false });
  D.wings = []; const half = sp.span / 2;
  for (const s of [-1, 1]) {
    const w = pivot(body, s * 0.12, 0.08, 0.25);
    const inner = membrane([[0, 0.12], [half * 0.48, 0.18], [half * 0.48, -0.5], [0.05, -0.75]].map(p => [p[0] * s, p[1]]), wm, w, 'body'); inner.rotation.x = Math.PI / 2;
    const wr = pivot(w, s * half * 0.48, 0, 0);
    const outer = membrane([[0, 0.18], [half * 0.52 * 0.92, 0.0], [half * 0.52, -0.08], [0, -0.5]].map(p => [p[0] * s, p[1]]), wm, wr, 'body'); outer.rotation.x = Math.PI / 2;
    mesh(tube([[0, 0, 0.15, 0.04], [s * half * 0.48, 0, 0.18, 0.035]], 6, 1), skin, w, 'body'); mesh(tube([[0, 0, 0.18, 0.035], [s * half * 0.5, 0, 0.0, 0.015]], 6, 1), skin, wr, 'body');
    D.wings.push({ w, wr, s });
  }
  D.legs = []; D.tail = [];
  for (const s of [-1, 1]) { const l = pivot(body, s * 0.08, -0.05, -0.45); mesh(tube([[0, 0, 0, 0.04], [0, -0.1, -0.3, 0.025]], 6, 1), skin, l, 'body'); }
  D.dims = { len: 1.8, height: 0.6, hipY: 0, halfW: 0.2, stride: 3 };
}

/* ---------------- optional glTF pack ---------------- */
export const PACK = {};
export async function loadPack(onProgress) {
  let list = null;
  try { const r = await fetch('models/models.json', { cache: 'no-cache' }); if (r.ok) list = await r.json(); } catch (e) { list = null; }
  if (!list) return PACK;
  const loader = new GLTFLoader(), fbx = new FBXLoader();
  const keys = Object.keys(list).filter(k => list[k] && list[k].file);
  let done = 0;
  await Promise.all(keys.map(async k => {
    try {
      const url = 'models/' + list[k].file;
      if (/\.fbx$/i.test(url)) { const g = await fbx.loadAsync(url); smoothAll(g); PACK[k] = { scene: g, clips: g.animations, cfg: list[k] }; }
      else { const g = await loader.loadAsync(url); PACK[k] = { scene: g.scene, clips: g.animations, cfg: list[k] }; }
    }
    catch (e) { console.warn('model load failed', k, e); }
    done++; if (onProgress) onProgress(done / keys.length);
  }));
  return PACK;
}
// FBX/GLB flat-colour materials -> PBR with a little scale bump so they sit in the lit scene
const pbrCache = new Map();
function pbr(m) {
  const key = m.color ? m.color.getHex() + (m.map ? m.map.uuid : '') : m.uuid; if (pbrCache.has(key)) return pbrCache.get(key);
  const c = m.color ? m.color.clone().convertLinearToSRGB().multiplyScalar(1.15) : new THREE.Color(0x888888);
  const n = new THREE.MeshStandardMaterial({ color: c, map: m.map || null, roughness: 0.78, metalness: 0, envMapIntensity: 0.8, flatShading: false });
  const b = skinTex('packbump', { dark: '#555555', base: '#888888', belly: '#aaaaaa' }).bump; n.bumpMap = b; n.bumpScale = 1.2;
  pbrCache.set(key, n); return n;
}
// low-poly packs ship flat (faceted) normals: weld vertices and recompute smooth normals once per model
function smoothAll(root) {
  root.traverse(o => { if (!o.isMesh) return; try {
    const g = o.geometry; g.deleteAttribute('normal'); const m = mergeVertices(g, 1e-4); m.computeVertexNormals();
    // regroup triangles by material: FBX gives hundreds of tiny groups (one draw call each)
    const groups = g.groups.length ? g.groups : [{ start: 0, count: m.index.count, materialIndex: 0 }], idx = m.index.array, byMat = new Map();
    for (const gr of groups) { if (!byMat.has(gr.materialIndex)) byMat.set(gr.materialIndex, []); const arr = byMat.get(gr.materialIndex); for (let i = gr.start; i < gr.start + gr.count; i++) arr.push(idx[i]); }
    const out = []; m.clearGroups(); let st = 0;
    for (const [mi, arr] of [...byMat.entries()].sort((a, b) => a[0] - b[0])) { for (const v of arr) out.push(v); m.addGroup(st, arr.length, mi); st += arr.length; }
    m.setIndex(out); o.geometry = m;
  } catch (e) { o.geometry.computeVertexNormals(); } });
}
function findClip(clips, re) { return clips.find(c => re.test(c.name)); }

/* ---------------- Dino ---------------- */
const BLOB_G = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); BLOB_G.userData.keep = true;
let BLOB_T = null;
function blobMat() {
  if (!BLOB_T) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); BLOB_T = new THREE.CanvasTexture(c); }
  return new THREE.MeshBasicMaterial({ map: BLOB_T, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, fog: true });
}
let uid = 0;
export class Dino {
  constructor(kind, opts = {}) {
    const sp = this.sp = SPECIES[kind]; this.kind = kind; this.id = ++uid;
    this.size = opts.size || 1;
    this.root = new THREE.Group(); this.tilt = new THREE.Group(); this.root.add(this.tilt);
    this.pos = this.root.position; this.heading = 0; this.speed = 0; this.ph = Math.random() * 6; this.t = 0;
    this.anim = 'idle'; this.animT = 0; this.jawT = 0.05; this.jaw = 0; this.headLook = 0; this.hitT = 0; this.flinchDir = 1; this.dead = false; this.deadT = 0; this.fallSide = Math.random() < 0.5 ? -1 : 1;
    this.alt = 0; this.bank = 0;
    const base = sp.base || kind, pack = PACK[base];
    if (pack && sp.type !== 'flyer') this.fromPack(pack); else this.procedural(opts.variant || 0);
    this.root.scale.setScalar(this.size);
    const tn = sp.tint != null ? [sp.tint, sp.tintK || 0.4] : sp.morphs ? sp.morphs[(opts.variant || 0) % sp.morphs.length] : null;
    if (tn) { const tm = m => tinted(m, tn[0], tn[1]); this.root.traverse(o => { if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map(tm) : tm(o.material); }); }
    this.root.traverse(o => { if (o.isMesh && o !== this.blob) { if (Array.isArray(o.material)) o.material.forEach(dinoLook); else if (o.material && o.material.isMeshStandardMaterial) dinoLook(o.material); } });
    this.hitMeshes = []; this.root.traverse(o => { if (o.isMesh) { o.userData.dino = this; if (!o.userData.part) o.userData.part = 'body'; this.hitMeshes.push(o); } });
    // soft contact shadow so the animal looks planted even in shade
    if (sp.type !== 'flyer') { const b = new THREE.Mesh(BLOB_G, blobMat()); b.scale.set(this.dims.halfW * 3.2 + 0.4, this.dims.len * 0.62, 1); b.position.y = 0.05; b.renderOrder = 1; b.raycast = () => {}; b.castShadow = false; this.root.add(b); this.blob = b; }
    this.mass = Math.max(0.4, this.dims.len * this.size / 3);   // ~1 raptor, 2-4 big plant-eaters, 4+ giants
    this.footPh = 0; this.dip = 0;
  }
  procedural(variant) {
    const sp = this.sp, pal = sp.pal[variant % sp.pal.length], base = sp.base || this.kind;
    const skin = skinMat(base + variant, pal);
    if (sp.type === 'thero') buildThero(this, sp, skin); else if (sp.type === 'quad') buildQuad(this, sp, skin); else buildFlyer(this, sp, skin);
  }
  fromPack(pack) {
    const sp = this.sp, cfg = pack.cfg || {};
    const obj = SkeletonUtils.clone(pack.scene);
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material) o.material = Array.isArray(o.material) ? o.material.map(pbr) : pbr(o.material); } });
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const target = cfg.length || ({ raptor: 2.6, trike: 7, stego: 7, rex: 11, apato: 22, spino: 13 })[sp.base || this.kind] || 4;
    const len = Math.max(size.x, size.z), k = target / len;
    obj.scale.multiplyScalar(k); obj.position.y = -box.min.y * k; if (cfg.yaw) obj.rotation.y = cfg.yaw;
    this.tilt.add(obj); this.gl = obj;
    this.mixer = new THREE.AnimationMixer(obj); const clips = pack.clips;
    const A = n => { const c = typeof n === 'string' ? clips.find(x => x.name === n) : n; return c ? this.mixer.clipAction(c) : null; };
    const cc = cfg.clips || {};
    this.acts = {
      idle: A(cc.idle || findClip(clips, /idle/i)), walk: A(cc.walk || findClip(clips, /walk/i)), run: A(cc.run || findClip(clips, /run|gallop/i)),
      attack: A(cc.attack || findClip(clips, /attack|bite/i)), roar: A(cc.roar || findClip(clips, /roar|howl|yell/i) || findClip(clips, /attack/i)), death: A(cc.death || findClip(clips, /death|die/i)),
      hit: A(cc.hit || findClip(clips, /hit|hurt|damage/i)), leap: A(cc.leap || findClip(clips, /jump|leap/i)),
    };
    if (this.acts.death) { this.acts.death.setLoop(THREE.LoopOnce); this.acts.death.clampWhenFinished = true; }
    for (const k2 of ['attack', 'roar', 'hit', 'leap']) if (this.acts[k2]) this.acts[k2].setLoop(THREE.LoopOnce);
    this.cur = null; this.playAct('idle');
    // feet calibration: the rest pose can differ from the animated pose, so measure the lowest skinned vertex
    // over a short walk cycle once per model and drop the model onto the ground
    const base = sp.base || this.kind;
    if (pack.yFix == null) {
      const v = new THREE.Vector3(); let low = 1e9, high = -1e9; this.playAct('walk');
      for (let f = 0; f < 12; f++) { this.mixer.update(0.1); this.root.updateMatrixWorld(true);
        obj.traverse(o => { if (!o.isSkinnedMesh) return; const pa = o.geometry.attributes.position, st = Math.max(1, Math.floor(pa.count / 400)); for (let i = 0; i < pa.count; i += st) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); if (v.y < low) low = v.y; if (v.y > high) high = v.y; } }); }
      pack.yFix = low < 1e8 ? low : 0; pack.hFix = high > low ? high - low : null; this.playAct('idle');
    }
    obj.position.y -= pack.yFix; void base;
    this._hFix = pack.hFix;
    obj.traverse(o => { if (o.isBone && /head/i.test(o.name) && !this.headBone) this.headBone = o; });
    const hh = this._hFix || size.y * k;
    this.dims = { len: target, height: hh, hipY: hh * 0.45, halfW: Math.min(size.x, size.z) * k * 0.4, stride: target * 0.6 };
  }
  playAct(name) {
    const a = this.acts[name] || this.acts.walk || this.acts.idle; if (!a || a === this.cur) return;
    a.reset(); a.play(); if (this.cur) this.cur.crossFadeTo(a, 0.25, false); this.cur = a;
  }
  setAnim(a) { if (this.anim === a) return; this.anim = a; this.animT = 0; if (this.gl) this.playAct(a === 'fly' ? 'walk' : a === 'dead' ? 'death' : a); }
  // is a world hit point on the head?
  isHead(hitObj, point) {
    if (this.gl) { if (!this.headBone) return false; const hp = this.headBone.getWorldPosition(new THREE.Vector3()); return hp.distanceTo(point) < this.dims.len * this.size * 0.12; }
    return hitObj.userData.part === 'head';
  }
  headWorld(out) { if (this.gl && this.headBone) return this.headBone.getWorldPosition(out); if (this.headPivot) { this.headPivot.updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.headPivot.matrixWorld).add(new THREE.Vector3(0, 0, (this.sp.head || 0.3) * 0.45 * this.size).applyQuaternion(this.headPivot.getWorldQuaternion(new THREE.Quaternion()))); } return this.bodyWorld(out); }
  bodyWorld(out) { if (this.body && !this.gl) { this.body.updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.body.matrixWorld); } return out.copy(this.pos).setY(this.pos.y + this.dims.height * 0.5 * this.size); }

  update(dt) {
    this.t += dt; this.animT += dt; this.hitT = Math.max(0, this.hitT - dt); this.jolt = Math.max(0, (this.jolt || 0) - dt * 3.2);
    const sp = this.sp, D = this.dims, a = this.anim;
    this.root.rotation.y = this.heading;
    const stride = D.stride * (a === 'run' ? 1.25 : 1);
    if (a === 'walk' || a === 'run' || a === 'fly') this.ph += dt * Math.PI * 2 * Math.max(0.35, Math.abs(this.speed)) / stride;
    else if (a === 'idle') this.ph += dt * 1.2;
    // jaw target
    let jawT = 0.04 + 0.03 * Math.sin(this.t * 2.3);
    if (a === 'attack') jawT = this.animT < 0.35 ? 0.75 : this.animT < 0.5 ? 0.02 : 0.3;
    if (a === 'roar') jawT = this.animT > 0.2 && this.animT < 1.6 ? 0.85 : 0.1;
    if (a === 'run' && sp.type === 'thero') jawT = 0.25;
    if (this.hitT > 0) jawT = Math.max(jawT, 0.5);
    if (a === 'dead') jawT = 0.25;
    this.jaw += (jawT - this.jaw) * Math.min(1, dt * 10);
    // footfalls: one per half stride (drives thuds, dust, camera tremble in the game)
    if ((a === 'walk' || a === 'run') && Math.abs(this.speed) > 0.3) {
      const half = D.len * this.size * (a === 'run' ? 0.42 : 0.26); const before = Math.floor(this.footPh); this.footPh += Math.abs(this.speed) * dt / half;
      if (Math.floor(this.footPh) !== before) { this.dip = 1; if (this.onStep) this.onStep(this, Math.floor(this.footPh) % 2 ? 1 : -1); }
    }
    this.dip = Math.max(0, this.dip - dt * 7);
    if (this.mixer) {
      // play walk/run at the speed the animal actually moves, so the feet do not skate
      if (a === 'walk' || a === 'run') { const clip = this.cur && this.cur.getClip(), stride = D.len * this.size * (a === 'run' ? 0.85 : 0.5);
        this.mixer.timeScale = clip ? clamp(Math.abs(this.speed) * clip.duration / stride, 0.35, 2.2) : 1; } else this.mixer.timeScale = 1;
      this.mixer.update(dt); this.poseRoot(dt); return; }
    if (sp.type === 'flyer') return this.poseFlyer(dt);
    const run = a === 'run' ? 1 : a === 'walk' ? 0.7 : a === 'dead' ? 0 : 0.12, ph = this.ph;
    // legs
    for (const L of this.legs) {
      const p = ph + (L.s > 0 ? Math.PI : 0) + (L.front ? Math.PI * 0.5 + (L.s > 0 ? Math.PI : 0) * 0 : 0);
      const sw = Math.sin(p), lift = Math.max(0, Math.cos(p));
      if (sp.type === 'thero') {
        L.th.rotation.x = -sw * 0.55 * run - 0.15; L.kn.rotation.x = 0.25 + lift * 0.9 * run; L.an.rotation.x = -0.35 - lift * 0.5 * run + sw * 0.2 * run; L.ft.rotation.x = 0.1 + Math.max(0, -Math.cos(p)) * 0.4 * run;
      } else { L.th.rotation.x = -sw * 0.38 * run; L.kn.rotation.x = lift * 0.55 * run * (L.front ? -1 : 1); }
      if (a === 'dead') { L.th.rotation.x = lerp(L.th.rotation.x, -0.35 * L.s, 0.05); L.kn.rotation.x *= 0.9; }
    }
    // body bob, sway
    const bob = (a === 'dead') ? 0 : Math.abs(Math.sin(ph)) * 0.05 * D.hipY * run;
    this.body.position.y = D.hipY - bob - (sp.type === 'thero' ? 0.04 * D.hipY * run : 0);
    this.body.rotation.z = Math.sin(ph) * 0.03 * run;
    let pitch = sp.type === 'thero' ? (a === 'run' ? 0.12 : 0.04) : 0;
    if (a === 'roar') pitch = this.animT < 0.3 ? -0.14 * this.animT / 0.3 : this.animT < 1.6 ? -0.14 : -0.14 * Math.max(0, 1 - (this.animT - 1.6) * 3);
    const small = D.hipY * this.size < 1.4;
    if (a === 'attack') pitch = small ? -0.14 * Math.sin(clamp(this.animT / 0.85, 0, 1) * Math.PI) : (this.animT < 0.3 ? -0.1 : this.animT < 0.55 ? 0.12 : 0.05);
    if (this.hitT > 0) pitch -= 0.3 * this.hitT * this.hitT * 4;
    this.body.rotation.x = pitch;
    // tail sway
    for (let i = 0; i < this.tail.length; i++) { this.tail[i].rotation.y = Math.sin(ph * 0.5 - i * 0.7 + this.t * 0.8) * (0.08 + run * 0.08); this.tail[i].rotation.x = (sp.type === 'thero' ? -0.03 : 0.04) - (a === 'run' ? 0.03 : 0); }
    if (this.arms) for (const ar of this.arms) ar.rotation.x = 0.3 + Math.sin(ph) * 0.15 * run;
    // head
    const hp = this.headPivot; let hx = sp.type === 'thero' ? 0.15 : (sp.longNeck ? 0 : 0.25);
    if (a === 'attack') hx += D.hipY * this.size < 1.4 ? 0.05 : (this.animT < 0.3 ? -0.3 : this.animT < 0.55 ? 0.22 : 0.1);
    if (a === 'roar') hx += -0.18 + Math.sin(this.animT * 9) * 0.03;
    if (a === 'idle') hx += Math.sin(this.t * 0.7) * 0.1;
    if (this.hitT > 0) hx -= 0.5 * this.hitT * 3;
    hp.rotation.x += (hx - hp.rotation.x) * Math.min(1, dt * 12);
    hp.rotation.y += ((a === 'idle' ? Math.sin(this.t * 0.5) * 0.3 : this.headLook) - hp.rotation.y) * Math.min(1, dt * 4);
    if (this.neck && sp.longNeck) this.neck.rotation.x = Math.sin(this.t * 0.4) * 0.08;
    if (this.head && this.head.jaw) this.head.jaw.rotation.x = this.jaw * (sp.type === 'thero' ? 0.75 : 0.4);
    this.poseRoot(dt);
  }
  poseRoot(dt) {
    // collapse onto the side, with a bounce
    if (this.anim === 'dead') {
      const t = this.animT, e = clamp(t / 0.55, 0, 1), k = 1 - Math.pow(1 - e, 3), b = t > 0.55 && t < 0.85 ? Math.sin((t - 0.55) / 0.3 * Math.PI) * 0.08 : 0;
      if (!this.gl || !this.acts.death) { this.tilt.rotation.z = this.fallSide * (Math.PI / 2 * 0.92) * k - this.fallSide * b; this.tilt.position.y = -(this.dims.hipY - this.dims.halfW) * k * 0.95; }
      if (t < 0.15) this.tilt.position.x = Math.sin(t * 60) * 0.05;
    } else {
      const j = this.jolt || 0, je = j * j * (3 - 2 * j);   // hit jolt: rear back + lurch sideways, springs back
      const dp = this.dip * this.dip * Math.min(0.06, 0.012 * this.mass) * this.dims.height;
      this.tilt.rotation.z = Math.sin(this.hitT * 30) * 0.05 * this.flinchDir + je * 0.16 * this.flinchDir; this.tilt.rotation.x = -je * 0.24; this.tilt.position.y = je * 0.12 - dp;
      if (this.anim === 'leap' && !this.gl) this.tilt.position.y = Math.sin(clamp(this.animT / 0.6, 0, 1) * Math.PI) * 1.1;
      if (this.anim === 'attack' && !this.gl && this.dims.hipY * this.size < 1.4) this.tilt.position.y = Math.sin(clamp(this.animT / 0.8, 0, 1) * Math.PI) * 0.45;
    }
  }
  poseFlyer(dt) {
    const a = this.anim, ph = this.ph;
    let flap = Math.sin(ph) * 0.65, fold = 0;
    if (a === 'glide') flap = Math.sin(this.t * 1.5) * 0.06 + 0.05;
    if (a === 'dead') { fold = clamp(this.animT * 2, 0, 1); flap = 0.9 * fold; this.tilt.rotation.z = this.animT * 4 * this.fallSide; this.tilt.rotation.x = Math.min(1.2, this.animT * 2); }
    else { this.tilt.rotation.z = this.bank; this.tilt.rotation.x = 0; }
    for (const w of this.wings) { w.w.rotation.z = w.s * flap; w.wr.rotation.z = w.s * (Math.sin(ph - 0.6) * 0.35 + fold * 1.6); w.w.rotation.y = -w.s * fold * 0.8; }
    this.body.position.y = -Math.sin(ph) * 0.12;
    if (this.head && this.head.jaw) this.head.jaw.rotation.x = this.jaw * 0.5;
    this.headPivot.rotation.x = this.hitT > 0 ? -0.6 : 0.1;
  }
  dispose() { this.root.traverse(o => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); }); }
}

// Field Guide portraits share one renderer pass into a render target
export function portraitPose(d) { d.anim = 'idle'; d.update(0.016); d.root.rotation.y = d.heading; }
