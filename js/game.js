// Dino Ranger v3 — game flow, jeep ride, dinosaur AI, aiming/raycast hits, HUD, menus, Field Guide.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, rnd, pick, weighted, ease } from './util.js';
import { World, WEATHER } from './world.js';
import { Dino, SPECIES, loadPack, PACK, DINO_LOOK } from './dinos.js';
import { Cockpit, makeDart } from './rifle.js';
import { FX } from './fx.js';
import { Convoy } from './convoy.js';
import { audioBind, audioInit, sfx, cry, say, musicStart, musicStop, audioTick, ambOff, AC, setRain, englishVoices, resetVoice, LINES, loadRecordings, hasRec, saveRec, delRec, playRec, stopRec, startRecording, stopRecording, recording } from './audio.js';

export const VERSION = '3.19.0';

/* ================= settings (this device only) ================= */
const SKEY = 'dinoRanger.v1';
const DEF = { sound: true, music: true, voice: true, diff: 'easy', intensity: 'action', blood: true, energy: true, weather: 'random', ridesPerDay: 2, name: '', today: '', rides: 0, seen: {}, totalStars: 0 };
const S = load();
function load() { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (e) { return Object.assign({}, DEF); } }
function save() { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function ridesToday() { if (S.today !== todayStr()) { S.today = todayStr(); S.rides = 0; save(); } return S.rides; }
// assist = screen-pixel ring searched around a missed tap (Easy only); Normal is exact.
const DIFF = {
  easy:   { assist: 34, interval: 2.3, max: 3, speedMul: 0.75, hpIdx: 0 },
  normal: { assist: 0, interval: 1.5, max: 5, speedMul: 1.0, hpIdx: 1 },
};
const D = () => DIFF[S.diff] || DIFF.easy;
const ACT = () => S.intensity !== 'gentle';
const BLOOD = () => S.blood !== false;

/* ================= missions ================= */
const LEVELS = [
  { name: 'Fern Valley', emoji: '🌿', say: 'Ranger, this is Fern Valley. Dinosaurs ahead! Tap to fire the darts!',
    boss: 'bigTrike', bossSize: 1.9, bossHp: [25, 40], bossRoll: 0, bossSay: 'Whoa! A giant Triceratops! Keep firing!', kinds: { raptor: 3, trike: 1.2 }, root: 45, herd: true },
  { name: 'River Gorge', emoji: '🏞️', say: 'River Gorge! Watch the sky for Pteranodons!',
    boss: 'spino', bossSize: 1, bossHp: [30, 45], bossRoll: 0, bossSay: 'A huge Spinosaurus by the river! Fire, fire, fire!', kinds: { raptor: 2, ptera: 2, stego: 1.2 }, root: 43 },
  { name: 'Volcano Ridge', emoji: '🌋', say: 'Volcano Ridge. Last mission, ranger! Stay sharp!',
    boss: 'rex', bossSize: 1, bossHp: [35, 55], bossRoll: 1.8, bossSay: "It's the T. rex! Fire the darts!", kinds: { raptor: 3, ptera: 1, stego: 1, trike: 1 }, root: 40 },
  { name: 'Misty Marsh', emoji: '🐸', say: 'Misty Marsh, ranger. Stay on the causeway, and watch the water!',
    boss: 'bigStego', bossSize: 1.7, bossHp: [30, 45], bossRoll: 0, bossSay: 'A giant Stegosaurus! Look at those spikes! Fire!', kinds: { raptor: 2, stego: 1.5, ptera: 1.5 }, root: 42 },
  { name: 'Red Canyon', emoji: '🏜️', say: 'Red Canyon. Raptors love the rocks here. Eyes open!',
    boss: 'alphaRaptor', bossSize: 2.6, bossHp: [30, 45], bossRoll: 0, bossSay: "That's the Alpha Raptor! It's fast. Keep firing!", kinds: { raptor: 4, trike: 1, ptera: 0.7 }, root: 44 },
  { name: 'Sunset Plains', emoji: '🌅', say: 'Sunset Plains. Giant herds all around. Final mission, ranger!',
    boss: 'kingRex', bossSize: 1.3, bossHp: [40, 60], bossRoll: 1.8, bossSay: "It's the King Rex! The biggest one of all!", kinds: { raptor: 2, trike: 1.5, stego: 1, ptera: 1 }, root: 41, herd: true },
  { name: 'Moonlight Jungle', emoji: '🌙', say: 'Moonlight Jungle. It is dark out here, ranger. Look for the shining eyes!',
    boss: 'shadowRex', bossSize: 1.1, bossHp: [35, 50], bossRoll: 1.8, bossSay: "It's the Shadow Rex! It hides in the dark. Fire!", kinds: { raptor: 3.5, trike: 1, ptera: 0.6 }, root: 43 },
  { name: 'Lagoon Shore', emoji: '🏝️', say: 'Lagoon Shore! Sunny beach, blue water. Watch the palm trees!',
    boss: 'bigSpino', bossSize: 1.35, bossHp: [35, 50], bossRoll: 0, bossSay: 'A giant Spinosaurus out of the lagoon! Fire, fire, fire!', kinds: { raptor: 2, ptera: 2.2, stego: 1, trike: 0.8 }, root: 45 },
  { name: 'Frozen Peaks', emoji: '❄️', say: 'Frozen Peaks. Brrr, it is snowy! Final mission, ranger!',
    boss: 'frostTrike', bossSize: 2.3, bossHp: [40, 60], bossRoll: 0, bossSay: "The giant Frost Horn! It's the strongest one. Keep firing!", kinds: { raptor: 2.5, trike: 1.6, stego: 1 }, root: 40, herd: true },
];
const SET = 3;   // each course has 3 levels; a ride plays from the chosen level to the end of its course
const COURSES = [{ name: 'Jungle Trail', emoji: '🌴', first: 0 }, { name: 'Wild Lands', emoji: '🗺️', first: 3 }, { name: 'Far Frontier', emoji: '🧭', first: 6 }];
const TEETH = ['rex', 'spino', 'kingRex', 'alphaRaptor', 'shadowRex', 'bigSpino'];
const GUIDE = ['raptor', 'trike', 'stego', 'ptera', 'spino', 'rex'];
const RIDE = 6.5;
audioBind(S, ACT, () => (LEVELS[G ? G.level : 0] || LEVELS[0]).root);

/* ================= renderer, camera, world ================= */
const $ = id => document.getElementById(id);
const cv = $('cv'), hud = $('hud'), hx = hud.getContext('2d');
const isTouch = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
let PR = Math.min(window.devicePixelRatio || 1, isTouch ? 1.3 : 1.75);
const world = new World(renderer); world.setShadowSize(isTouch ? 1024 : 2048); if (isTouch) world.quality = 0.75;
const scene = world.scene;
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1400); scene.add(camera);
const cockpit = new Cockpit(camera);
const fx = new FX(scene);
const convoy = new Convoy(scene);   // Ranger Two's jeep
let W = 0, H = 0;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setPixelRatio(PR); renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.fov = W / H < 1.3 ? 66 : 60; G.baseFov = camera.fov; camera.updateProjectionMatrix();
  const dpr = Math.min(window.devicePixelRatio || 1, 2); hud.width = Math.round(W * dpr); hud.height = Math.round(H * dpr); hx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fx.setScale(H * PR); checkOrient();
}

/* ================= state ================= */
const G = { state: 'boot', level: 0, s: 0, v: 0, vT: 0, t: 0, dinos: [], bg: [], boss: null, darts: [], stuck: [], spawnT: 1, score: 0, levelScore: 0,
  phase: 'ride', shake: 0, flash: 0, red: 0, introT: 0, doneT: 0, pointers: new Map(), hudBump: 0, aim: { x: 0, y: 0 }, birdT: 2, stars: [], pops: [], marks: [], splats: [], ride: null, ms: null, dmgFx: 0, fovPunch: 0, camRoll: 0, camPitch: 0, heartT: 0, camKick: 0, camKickV: 0, hitStop: 0,
  bump: new THREE.Vector3(), bumpV: new THREE.Vector3(), fps: 60, fpsT: 0, fpsN: 0 };
const jeepPos = new THREE.Vector3(), jeepF = new THREE.Vector3(), jeepR = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const L = () => LEVELS[G.level];

/* ================= dino management ================= */
function optimise(d) { // merge static meshes that share a joint + material -> far fewer draw calls
  const groups = []; d.root.traverse(o => { if (o.isGroup || o.isObject3D) groups.push(o); });
  for (const g of groups) {
    const kids = g.children.filter(c => c.isMesh && !c.isSkinnedMesh && c.children.length === 0 && c.geometry.attributes.uv && c.geometry.index);
    const by = new Map(); for (const k of kids) { const key = k.material.uuid + k.userData.part + k.castShadow; if (!by.has(key)) by.set(key, []); by.get(key).push(k); }
    for (const list of by.values()) { if (list.length < 2) continue;
      const geos = list.map(m => { m.updateMatrix(); const gg = m.geometry.clone().applyMatrix4(m.matrix); for (const a of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(a)) gg.deleteAttribute(a); return gg; });
      let merged = null; try { merged = mergeGeometries(geos); } catch (e) { merged = null; } if (!merged) continue;
      const m0 = list[0], nm = new THREE.Mesh(merged, m0.material); nm.castShadow = m0.castShadow; nm.receiveShadow = true; nm.userData = Object.assign({}, m0.userData);
      for (const m of list) { g.remove(m); m.geometry.dispose(); } g.add(nm); }
  }
  d.hitMeshes = []; d.root.traverse(o => { if (o.isMesh && o !== d.blob) { o.userData.dino = d; if (!o.userData.part) o.userData.part = 'body'; d.hitMeshes.push(o); } });
}
function mkDino(kind, size = 1, variant = 0) { const d = new Dino(kind, { size, variant }); if (!d.gl) optimise(d); scene.add(d.root); d.onStep = footfall; return d; }
function footfall(d, side) {
  const big = d.mass >= 1.6; if (!big || !d.root.parent) return;
  const dist = Math.max(2, d.pos.distanceTo(camera.position)), w = d.mass;
  if (dist < 45) sfx.step(clamp(w * 0.9 / dist, 0.02, 0.45));
  if (dist < 30) G.shake = Math.max(G.shake, clamp(w * 0.35 / dist, 0, 0.28));
  if (dist < 35) { const fx0 = Math.sin(d.heading), fz0 = Math.cos(d.heading), L = d.dims.len * d.size * 0.15, W = d.dims.halfW * d.size;
    fx.dust(tmp2.set(d.pos.x + fx0 * L * side + fz0 * W * side, d.pos.y + 0.1, d.pos.z + fz0 * L * side - fx0 * W * side), 3, clamp(w * 0.18, 0.3, 1.1)); }
}
function removeDino(d) { scene.remove(d.root); d.dispose(); }
function groundAt(p) { return world.ground(p.x, p.z); }
// stand a dinosaur on the visible ground: lowest of hip/front/back samples, and pitch it along the slope
function settle(d) {
  if (d.sp.type === 'flyer') return;
  const L = Math.max(1, d.dims.len * d.size * 0.4), fx = Math.sin(d.heading), fz = Math.cos(d.heading);
  const hc = world.ground(d.pos.x, d.pos.z), hf = world.ground(d.pos.x + fx * L, d.pos.z + fz * L), hb = world.ground(d.pos.x - fx * L, d.pos.z - fz * L);
  d.pos.y = Math.min(hc, (hf + hb) / 2 + 0.02);
  d.root.rotation.order = 'YXZ'; d.root.rotation.x = d.mode === 'dead' ? 0 : clamp((hb - hf) / (2 * L), -0.35, 0.35);
}
function speciesHp(kind) { const sp = SPECIES[kind]; let hp = sp.hp; if (S.diff === 'easy') hp = Math.min(hp, 2); return hp; }

function spawnDino(o = {}) {
  const lv = L(), kind = o.kind || weighted(lv.kinds), sp = SPECIES[kind];
  const pairs = o.count || (kind === 'raptor' && Math.random() < 0.25 ? 2 : 1);
  let side = o.side || (Math.random() < 0.5 ? -1 : 1); if (world.env.river && sp.type !== 'flyer') side = 1;
  const swamp = world.env.swamp && sp.type !== 'flyer';
  const roleR = Math.random(), role = o.role && !swamp && sp.type !== 'flyer' ? o.role : swamp ? 'charge' : sp.type === 'flyer' ? 'swoop' : (kind === 'stego' ? (roleR < 0.25 ? 'charge' : 'cross') : kind === 'raptor' ? (roleR < 0.6 ? 'charge' : 'cross') : (roleR < 0.5 ? 'charge' : 'cross'));
  // ambush: burst out of the trees right beside the road, close in front (Action mode, ground dinosaurs)
  const ambush = o.ambush != null ? o.ambush && ACT() && sp.type !== 'flyer' && !swamp : ACT() && sp.type !== 'flyer' && !swamp && Math.random() < 0.4;
  const ahead = (ambush ? rnd(12, 20) : rnd(26, 40)) + (o.ahead || 0);
  for (let i = 0; i < pairs; i++) {
    const d = mkDino(kind, kind === 'raptor' ? rnd(1.3, 1.6) : rnd(0.9, 1.15), Math.random() < 0.5 ? 0 : 1);
    const s = G.s + ahead + i * (o.gap || 3), base = world.posAt(s), F = world.dirAt(s), R = tmp.crossVectors(F, UP).normalize();
    const lat = swamp ? rnd(-2, 2) + i * 2.5 : side * (sp.type === 'flyer' ? rnd(-10, 10) : ambush ? rnd(8, 10.5) : rnd(7, 18)) + i * side * 2;
    d.pos.copy(base).addScaledVector(R, lat); d.pos.y = groundAt(d.pos);
    // every individual moves at its own pace: sprinters and plodders
    d.vmax = rnd(sp.speed[0], sp.speed[1]) * D().speedMul; d.gait = d.vmax > (sp.type === 'thero' ? 3.4 : 3.0) ? 'run' : 'walk';
    d.mode = role; d.hp = speciesHp(kind); d.hpMax = d.hp; d.side = side; d.t = 0; d.stun = 0; d.cried = false; d.leapRoll = kind === 'raptor' && Math.random() < 0.5;
    if (role === 'cross') { const tgtS = G.s + (ambush ? rnd(9, 14) : rnd(13, 22)), Rb = world.dirAt(tgtS).cross(UP).normalize(); d.goal = world.posAt(tgtS).addScaledVector(Rb, -side * (world.env.river ? 4.5 : ambush ? rnd(8, 12) : rnd(10, 22))); }
    if (ambush) { d.vmax = Math.max(d.vmax, sp.speed[1] * 0.8 * D().speedMul); d.gait = 'run'; d.cried = true; setTimeout(() => cry(sp.cry, 0.9), 50); }
    if (kind === 'raptor' && role === 'charge' && ACT() && !swamp && !ambush && Math.random() < 0.25) { // this one hunts Ranger Two's jeep
      d.mode = 'chargeNPC'; d.attackingConvoy = true; const cs = convoy.s + rnd(10, 20), cb = world.posAt(cs), cR = world.dirAt(cs).cross(UP).normalize();
      d.pos.copy(cb).addScaledVector(cR, side * rnd(7, 11)); d.pos.y = groundAt(d.pos); }
    if (sp.type === 'flyer') { d.alt = rnd(9, 14); d.pos.y += d.alt; d.setAnim('fly'); d.lane = rnd(-3.5, 3.5); }
    else d.setAnim(d.gait);
    d.heading = Math.atan2(jeepPos.x - d.pos.x, jeepPos.z - d.pos.z);
    if (d.pos.distanceTo(jeepPos) < 11) { removeDino(d); continue; }   // never pop in right next to the jeep
    G.dinos.push(d);
  }
}
// spawn director: irregular timing and group sizes (singles, pairs, raptor packs, mixed groups, herd crossings, lulls)
function spawnWave() {
  const lv = L(), kinds = Object.keys(lv.kinds), r = Math.random(), side = Math.random() < 0.5 ? -1 : 1;
  const ground = kinds.filter(k => SPECIES[k].type !== 'flyer'), plant = ground.filter(k => k !== 'raptor');
  let wait = D().interval * (0.45 + Math.random() * 1.3);                    // uneven gaps
  if (r < 0.42) spawnDino();                                                   // single
  else if (r < 0.6) { spawnDino({ side }); if (Math.random() < 0.6) spawnDino({ side: -side, ahead: rnd(2, 8) }); }   // pair, often both sides
  else if (r < 0.74 && ground.includes('raptor')) { const n = S.diff === 'easy' ? 3 : 2 + Math.floor(Math.random() * 3); spawnDino({ kind: 'raptor', count: n, side, gap: 2.2, ambush: Math.random() < 0.6 }); wait += D().interval * 0.8; }   // raptor pack
  else if (r < 0.84 && plant.length) { const k = pick(plant); spawnDino({ kind: k, count: 2 + (Math.random() < 0.4 ? 1 : 0), side, gap: 5, role: 'cross', ambush: false }); wait += D().interval; }   // herd crossing
  else if (r < 0.93 && plant.length && ground.includes('raptor')) { spawnDino({ kind: pick(plant), side, role: 'charge' }); spawnDino({ kind: 'raptor', count: 2, side, ahead: -4, gap: 2 }); wait += D().interval * 0.6; }   // mixed group
  else wait = D().interval * rnd(2.2, 3.5);                                   // lull: nothing for a while
  G.spawnT = wait;
}
function spawnHerd() { // gentle background giants (not targets)
  for (const d of G.bg) removeDino(d); G.bg = [];
  if (!L().herd) return;
  const herd = [[70, -55, 1], [80, -68, 0.85], [150, 60, 1.05], [230, -62, 0.95], [238, -75, 0.8]].concat(world.env.plains ? [[110, 48, 1.1], [300, 58, 1], [310, 72, 0.9], [360, -52, 1.05], [400, 66, 0.95]] : []);
  for (const [s, lat, k] of herd) {
    const d = mkDino('apato', k); const b = world.posAt(s), R = world.dirAt(s).cross(UP).normalize(); d.pos.copy(b).addScaledVector(R, lat); d.pos.y = groundAt(d.pos);
    d.heading = Math.atan2(-R.x * Math.sign(lat), -R.z * Math.sign(lat)) + rnd(-0.6, 0.6) + Math.PI / 2; d.vmax = rnd(0.6, 1.2); d.setAnim('walk'); d.speed = d.vmax;
    d.hitMeshes.forEach(m => { m.userData.dino = null; }); G.bg.push(d);
  }
}

/* ================= aiming & firing ================= */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function liveTargets() { const out = []; for (const d of G.dinos) if (d.mode !== 'dead') out.push(...d.hitMeshes); if (G.boss && G.boss.mode !== 'dead') out.push(...G.boss.hitMeshes); return out; }
function castAt(x, y, objs) { ndc.set(x / W * 2 - 1, -(y / H) * 2 + 1); ray.setFromCamera(ndc, camera); const hits = ray.intersectObjects(objs, false); return hits.find(h => h.object.userData.dino) || null; }
function pickHit(x, y) {
  const objs = liveTargets(); if (!objs.length) return null;
  let h = castAt(x, y, objs); if (h) return h;
  const A = D().assist; if (!A) return null;          // Normal: exact hits only
  for (const r of [A * 0.5, A]) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; h = castAt(x + Math.cos(a) * r, y + Math.sin(a) * r, objs); if (h) return h; }
  return null;
}
function missPoint(x, y) { ndc.set(x / W * 2 - 1, -(y / H) * 2 + 1); ray.setFromCamera(ndc, camera); const o = ray.ray.origin, d = ray.ray.direction; for (let t = 2; t < 140; t += 1.2) { tmp.copy(o).addScaledVector(d, t); if (tmp.y < world.height(tmp.x, tmp.z)) return { p: tmp.clone(), ground: true }; } return { p: o.clone().addScaledVector(d, 140), ground: false }; }
// weapons: dart rifle, rapid darts, spread (double barrel), sleepy cannon (explodes, hits everything nearby)
const WEAPONS = {
  rifle:  { kick: 0.035, buzz: 15, icon: '🎯', name: 'Dart rifle', cd: 0.3, dmg: 1, pellets: 1, spread: 0, sfx: 'dart' },
  rapid:  { kick: 0.012, buzz: 6, icon: '⚡', name: 'Rapid darts', cd: 0.11, dmg: 0.4, pellets: 1, spread: 7, sfx: 'rapid', small: true },
  spread: { kick: 0.065, buzz: 30, icon: '✴️', name: 'Spread gun', cd: 0.8, dmg: 0.6, pellets: 6, spread: 34, sfx: 'spread', small: true },
  mg:     { kick: 0.02, buzz: 8, icon: '🔥', name: 'Machine gun', cd: 0.07, dmg: 0.45, pellets: 1, spread: 12, sfx: 'mg', small: true },
  cannon: { kick: 0.11, buzz: 60, icon: '💥', name: 'Sleepy cannon', cd: 1.4, dmg: 3, pellets: 1, spread: 0, sfx: 'launch', splash: 5, speed: 55 },
};
const BOSS_ARMOR = 0.4;   // bosses shrug off most of each hit: they take endurance to bring down
const curW = () => WEAPONS[G.weapon] || WEAPONS.rifle;
function setWeapon(k) { G.weapon = k; cockpit.setWeapon(k); G.cool = 0; document.querySelectorAll('#weapons button').forEach(b => b.classList.toggle('sel', b.dataset.w === k)); }
let shellGeo = null;
function makeShell() { if (!shellGeo) { shellGeo = [new THREE.CylinderGeometry(0.05, 0.05, 0.22, 12).rotateX(Math.PI / 2), new THREE.ConeGeometry(0.05, 0.1, 12).rotateX(-Math.PI / 2).translate(0, 0, -0.16)]; shellGeo.forEach(g => (g.userData.keep = true)); shellGeo.mats = [new THREE.MeshStandardMaterial({ color: 0x55603a, roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: 0xe8873a, roughness: 0.4 })]; }
  const g = new THREE.Group(); g.add(new THREE.Mesh(shellGeo[0], shellGeo.mats[0]), new THREE.Mesh(shellGeo[1], shellGeo.mats[1])); return g; }
function newStats() { return { shots: 0, hits: 0, heads: 0, kills: 0, bites: 0, stars: 0, t: 0 }; }
function stat(k, n = 1) { if (G.ms) G.ms[k] += n; if (G.ride) G.ride[k] += n; }
function fire(x, y) {
  if (G.cool > 0 || G.darts.length > 36) return;
  const w = curW(); G.cool = w.cd; G.aim.x = x; G.aim.y = y;
  const from = cockpit.muzzleWorld(new THREE.Vector3()), k = H / 820;
  for (let i = 0; i < w.pellets; i++) {
    const a = Math.random() * Math.PI * 2, r = i === 0 && w.pellets > 1 ? 0 : Math.sqrt(Math.random()) * w.spread * k, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    const h = pickHit(px, py);
    const m = w.splash ? makeShell() : makeDart(); if (w.small) m.scale.setScalar(0.7); scene.add(m); m.position.copy(from);
    let to, hit;
    if (h) { const d = h.object.userData.dino; hit = { d, obj: h.object, local: h.object.worldToLocal(h.point.clone()), head: d.isHead(h.object, h.point) }; to = h.point.clone(); }
    else { const mp = missPoint(px, py); to = mp.p; hit = { miss: true, ground: mp.ground }; }
    const dist = from.distanceTo(to);
    stat('shots');
    G.darts.push({ m, from: from.clone(), to, t: 0, dur: clamp(dist / (w.speed || 140), 0.05, w.splash ? 1.2 : 0.22), hit, w });
    aimDart(m, from, to);
  }
  sfx[w.sfx](); cockpit.fire(); if (w.splash) G.shake = Math.max(G.shake, 0.12);
  G.camKick = Math.min(0.2, (G.camKick || 0) + w.kick); G.camKickV = (Math.random() - 0.5) * w.kick; buzz(w.buzz);
}
const NEGZ = new THREE.Vector3(0, 0, -1);
function aimDart(m, a, b) { m.quaternion.setFromUnitVectors(NEGZ, tmp2.copy(b).sub(a).normalize()); }
function stickDart(d, obj, local, dir) {
  if (d.stuckN >= 8) return; d.stuckN = (d.stuckN || 0) + 1;
  const m = makeDart(); m.scale.setScalar(0.9);
  const wq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.clone().normalize());
  const oq = obj.getWorldQuaternion(new THREE.Quaternion()), os = obj.getWorldScale(new THREE.Vector3());
  m.quaternion.copy(oq.invert().multiply(wq)); m.position.copy(local).add(new THREE.Vector3(0, 0, 0)); m.scale.divide(os);
  m.translateZ(0.06); obj.add(m);
  if (BLOOD()) { const w = new THREE.Mesh(WOUND_G, WOUND_M); w.position.copy(local); w.quaternion.copy(m.quaternion); w.scale.set(1 / os.x, 1 / os.y, 0.35 / os.z); obj.add(w); }
}
const WOUND_G = new THREE.SphereGeometry(0.075, 10, 8); WOUND_G.userData.keep = true; const WOUND_M = new THREE.MeshStandardMaterial({ color: 0x5a0606, roughness: 0.25, metalness: 0.1 });
function dartArrive(dt) {
  const { hit } = dt, w = dt.w || WEAPONS.rifle;
  if (w.splash) return explode(dt, hit);
  if (hit.miss) { sfx.miss(); if (hit.ground) fx.dust(dt.to, 4, 0.25, [0.55, 0.48, 0.36]); return; }
  const d = hit.d; if (!d || d.mode === 'dead' || !d.root.parent) { sfx.miss(); return; }
  const wp = hit.obj.localToWorld(hit.local.clone()), dir = tmp2.copy(dt.to).sub(dt.from).normalize();
  stickDart(d, hit.obj, hit.local, dir); stat('hits'); if (hit.head) stat('heads');
  damage(d, w.dmg * (hit.head ? (d.boss ? 1.5 : 2) : 1) * (d.boss ? BOSS_ARMOR : 1), wp, dir, hit.head, w.small ? 0.6 : 1);
}
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }   // phones only; iPad Safari has no web vibration
function mark(wp, big) { const p = toScreen(wp); if (p.ok) G.marks.push({ x: p.x, y: p.y, t: 0, big }); }
function damage(d, dmg, wp, dir, head, fxK = 1) {
  sfx.thunk(head);
  // knock back along the shot and jolt the body
  const kb = clamp(dmg * 1.6 / Math.max(0.6, d.mass || 1), 0.15, 4);
  d.kb = (d.kb || new THREE.Vector3()).addScaledVector(tmp.set(dir.x, 0, dir.z).normalize(), kb);
  d.jolt = Math.min(1, (d.jolt || 0) + 0.45 + dmg * 0.2); d.flinchDir = Math.sign(jeepR.dot(dir)) || 1;
  mark(wp, head);
  if (BLOOD()) fx.blood(wp, dir, (d.boss ? 1.6 : 1) * (head ? 1.3 : 1) * Math.max(0.8, d.size) * fxK, Math.round((head ? 30 : 20) * fxK));
  else fx.puff(wp, 0.3);
  d.hitT = 0.35; d.stun = 0.7; d.flinchDir = Math.random() < 0.5 ? -1 : 1;
  if (head) pop(wp, '★★');
  if (d.boss) { const before = Math.floor(d.fed); d.fed += dmg; d.jolt *= 0.4;
    if (!d.enraged && d.fed >= d.hp / 2 && d.fed < d.hp) { d.enraged = true; setSub(d, 'roar'); G.shake = Math.max(G.shake, 0.5); say("It's getting angry! Keep firing, ranger!", true, 'alert', 'angry'); } const n = Math.floor(d.fed) - before; if (n > 0) star(wp, Math.min(n, 4)); if (d.fed >= d.hp) bossDone(); else cry(d.sp.cry, 0.4); return; }
  d.hp -= dmg;
  if (d.hp <= 0) { killDino(d, wp, head); G.hitStop = 0.07; mark(wp, true); buzz(40); } else { cry(d.sp.cry, 0.6); if (head) G.hitStop = 0.04; }
}
function explode(dt, hit) {
  const at = hit.miss ? dt.to.clone() : hit.obj.localToWorld(hit.local.clone()), w = dt.w;
  let hitAny = false;
  sfx.boom(); G.shake = Math.max(G.shake, clamp(9 / at.distanceTo(camera.position), 0.2, 0.7)); G.flash = Math.max(G.flash, 0.25);
  fx.boom(at, 1.4);
  const dir = tmp2.copy(dt.to).sub(dt.from).normalize().clone();
  const all = G.dinos.filter(d => d.mode !== 'dead' && d.sp.type !== undefined).concat(G.boss && G.boss.mode !== 'dead' ? [G.boss] : []);
  for (const d of all) {
    const c = d.bodyWorld(new THREE.Vector3()), dist = c.distanceTo(at) - d.dims.len * d.size * 0.3;
    const direct = hit.d === d;
    if (!direct && dist > w.splash) continue;
    const dmg = direct ? w.dmg * (hit.head ? 1.5 : 1) : Math.max(1, w.dmg * (1 - Math.max(0, dist) / w.splash));
    const dmgB = d.boss ? dmg * BOSS_ARMOR : dmg;
    damage(d, dmgB, direct ? at : c, dir, direct && hit.head, 1.3); hitAny = true;
  }
  if (hitAny) stat('hits');
}
function killDino(d, wp, head) {
  stat('kills');
  d.mode = 'dead'; d.setAnim('dead'); d.deadT = 0; d.speed = 0; cry(d.sp.cry, 0.9);
  if (!BLOOD()) setTimeout(() => sfx.sleepy(false), 500);
  star(wp, d.hpMax + (head ? 1 : 0)); meet(d.kind);
}
function meet(kind) { const k = SPECIES[kind].base || kind; S.seen[k] = (S.seen[k] || 0) + 1; save(); }

/* ================= AI ================= */
function turnTo(d, tx, tz, rate, dt) { rate /= Math.sqrt(Math.max(1, d.mass || 1)); const want = Math.atan2(tx - d.pos.x, tz - d.pos.z); let df = want - d.heading; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2; d.heading += clamp(df, -rate * dt, rate * dt); return Math.abs(df); }
function stepFwd(d, sp, dt) { d.speed += (sp - d.speed) * Math.min(1, dt * 5 / (d.mass || 1)); d.pos.x += Math.sin(d.heading) * d.speed * dt; d.pos.z += Math.cos(d.heading) * d.speed * dt; }
function biteHit(d, big) {
  if (!ACT()) return;
  ouch(big || d.boss);
  hurt(d.boss ? (S.diff === 'easy' ? 7 : 10) : big ? (S.diff === 'easy' ? 10 : 15) : (S.diff === 'easy' ? 9 : 15));
  const side = Math.sign(jeepR.dot(tmp.copy(d.pos).sub(jeepPos))) || 1;
  G.shake = Math.max(G.shake, big ? 0.75 : 0.5); G.flash = 0.35; G.red = BLOOD() ? 0.35 : 0;
  G.bumpV.addScaledVector(jeepR, -side * (big ? 0.9 : 0.6)).addScaledVector(UP, big ? 0.6 : 0.35);
  sfx.bump(); sfx.bite(); fx.dust(tmp.copy(jeepPos).addScaledVector(jeepF, 2.2), 6, 0.8);
}
function updDino(d, dt) {
  d.t += dt; d.stun = Math.max(0, d.stun - dt);
  const sp = d.sp, act = ACT(), toJ = tmp.copy(jeepPos).sub(d.pos), dist = Math.hypot(toJ.x, toJ.z), ahead = -toJ.dot(jeepF);
  const slow = d.stun > 0 ? 0.25 : 1;
  if (!d.cried && dist < 26 && d.mode !== 'dead') { d.cried = true; cry(sp.cry, 0.8); }
  if (sp.type === 'flyer') return updFlyer(d, dt, dist, ahead);
  const reach = 5.2 + d.dims.len * d.size * 0.3;
  switch (d.mode) {
    case 'charge': {
      const lead = clamp(dist * 0.75, 4, 26), tx = jeepPos.x + jeepF.x * lead, tz = jeepPos.z + jeepF.z * lead; // swing onto the road ahead, then straight at the jeep
      turnTo(d, tx, tz, 2.6, dt); stepFwd(d, d.vmax * slow, dt); d.setAnim(d.gait); d.headLook = 0;
      if (d.leapRoll && act && dist < 8 && !d.leapt) { d.leapt = true; d.setAnim('leap'); cry('screech'); }
      if (!act && dist < 10) { d.mode = 'stare'; d.t = 0; }
      else if (dist < reach) { d.mode = 'attack'; d.t = 0; d.bit = false; d.setAnim('attack'); }
      break; }
    case 'attack': {
      d.speed = 0; turnTo(d, jeepPos.x, jeepPos.z, 4, dt); d.pos.addScaledVector(jeepF, G.v * dt * 0.95);
      if (d.animT > 0.1 && d.animT < 0.45 && dist > 2.4 + d.dims.len * d.size * 0.2) { d.pos.x += toJ.x / dist * 7 * dt; d.pos.z += toJ.z / dist * 7 * dt; } // lunge in
      if (!d.bit && d.animT > 0.38) { d.bit = true; if (dist < reach + 1.5) biteHit(d, d.dims.len * d.size > 5); }
      if (d.animT > 0.85) { d.mode = 'leave'; d.t = 0; d.leaveSide = (jeepR.dot(tmp2.copy(d.pos).sub(jeepPos)) >= 0 ? 1 : -1); d.setAnim('run'); }
      break; }
    case 'chargeNPC': {
      const cp = convoy.root.position, cd = Math.hypot(cp.x - d.pos.x, cp.z - d.pos.z);
      turnTo(d, cp.x + convoy.fwd.x * 2, cp.z + convoy.fwd.z * 2, 3, dt); stepFwd(d, (d.vmax + convoy.v * 0.6) * slow, dt); d.setAnim(d.gait);
      if (cd < 3.4) { d.mode = 'attackNPC'; d.t = 0; d.bit = false; d.setAnim('attack'); }
      if (d.t > 14) { d.mode = 'leave'; d.t = 0; d.leaveSide = d.side; }
      break; }
    case 'attackNPC': {
      const cp = convoy.root.position; d.speed = 0; turnTo(d, cp.x, cp.z, 4, dt); d.pos.addScaledVector(convoy.fwd, convoy.v * dt);
      if (!d.bit && d.animT > 0.38) { d.bit = true; convoy.hitBy(); sfx.npc(); if (Math.random() < 0.4) say('Ranger Two here! A raptor is on our jeep!', false); }
      if (d.animT > 1.0) { d.leaps = (d.leaps || 0) + 1; if (d.leaps < 2) { d.mode = 'chargeNPC'; d.t = 0; } else { d.mode = 'leave'; d.t = 0; d.leaveSide = d.side; d.setAnim('run'); } }
      break; }
    case 'stare': d.speed = 0; d.setAnim('idle'); turnTo(d, jeepPos.x, jeepPos.z, 2, dt); d.pos.addScaledVector(jeepF, G.v * dt); if (d.t > 1.4) { d.mode = 'leave'; d.t = 0; d.leaveSide = d.side; d.setAnim('walk'); } break;
    case 'cross': {
      const r = turnTo(d, d.goal.x, d.goal.z, 1.6, dt); void r; stepFwd(d, d.vmax * slow, dt); d.setAnim(d.gait);
      d.headLook = clamp(Math.atan2(toJ.x, toJ.z) - d.heading, -0.6, 0.6) * 0.6;
      if (Math.hypot(d.goal.x - d.pos.x, d.goal.z - d.pos.z) < 2) { d.mode = 'leave'; d.t = 0; d.leaveSide = -d.side; }
      break; }
    case 'leave': {
      const lx = jeepPos.x + jeepR.x * d.leaveSide * 30 - jeepF.x * 12, lz = jeepPos.z + jeepR.z * d.leaveSide * 30 - jeepF.z * 12;
      turnTo(d, lx, lz, 2.2, dt); stepFwd(d, Math.max(d.vmax, 3.5) * slow, dt); if (d.anim !== 'run' && d.anim !== 'walk') d.setAnim('run'); d.headLook = 0;
      if (d.t > 9 || dist > 70) d.mode = 'gone';
      break; }
    case 'dead': {
      d.speed = 0; d.deadT += dt;
      if (!d.thud && d.animT > 0.5) { d.thud = true; sfx.fall(d.dims.len * d.size > 5); fx.dust(tmp2.copy(d.pos).setY(d.pos.y + 0.2), 12, Math.max(0.6, d.dims.len * d.size * 0.18)); G.shake = Math.max(G.shake, clamp(2 / dist, 0.04, 0.3));
        if (BLOOD()) fx.pool(d.pos.clone(), clamp(d.dims.len * d.size * 0.28, 0.6, 2.6)); }
      if (!BLOOD() && d.deadT > 1.2 && (d.zT = (d.zT || 0) - dt) <= 0) { d.zT = 1.3; fx.zzz(d.bodyWorld(tmp2).add(tmp.set(0, 0.6, 0)), clamp(d.dims.len * d.size * 0.25, 0.5, 1.5)); }
      if (ahead < -15) d.mode = 'gone';
      break; }
  }
  if (d.anim === 'leap' && d.animT > 0.6) d.setAnim(d.gait);
  if (d.mode !== 'dead') { if (ahead < -14 || dist > 90) d.mode = 'gone'; }
  // footsteps for the heavy ones
  if (d.kb && d.kb.lengthSq() > 1e-4) { d.pos.addScaledVector(d.kb, dt); d.kb.multiplyScalar(Math.max(0, 1 - dt * 7)); }
  settle(d);
}
function updFlyer(d, dt, dist, ahead) {
  const act = ACT();
  if (d.mode === 'dead') { d.vy = (d.vy || 0) - 9.8 * dt; d.pos.y += d.vy * dt; const gy = groundAt(d.pos); if (d.pos.y <= gy) { d.pos.y = gy; if (!d.thud) { d.thud = true; sfx.fall(false); fx.dust(d.pos, 10, 0.8); if (BLOOD()) fx.pool(d.pos.clone(), 0.8); } } if (ahead < -15) d.mode = 'gone'; return; }
  const gy = groundAt(d.pos);
  if (d.mode === 'swoop') {
    // dive along the road toward the jeep, then pass close overhead
    const tx = jeepPos.x + jeepR.x * d.lane, tz = jeepPos.z + jeepR.z * d.lane;
    turnTo(d, tx, tz, 1.4, dt); stepFwd(d, d.vmax * (d.stun > 0 ? 0.5 : 1), dt);
    const targetAlt = dist > 28 ? d.alt : (act ? lerp(2.4, d.alt, clamp((dist - 4) / 24, 0, 1)) : 7);
    d.pos.y += ((gy + targetAlt) - d.pos.y) * Math.min(1, dt * 1.5);
    d.bank = clamp((d.lastH != null ? (d.heading - d.lastH) / dt : 0) * -0.4, -0.6, 0.6); d.lastH = d.heading;
    d.setAnim(dist < 20 && dist > 6 ? 'glide' : 'fly');
    if (dist < 5) { d.mode = 'pass'; d.t = 0; cry('squawk'); if (act) { G.shake = Math.max(G.shake, 0.18); if (Math.abs(d.lane) < 2.5) hurt(S.diff === 'easy' ? 5 : 8); } }
  } else if (d.mode === 'pass') { stepFwd(d, d.vmax, dt); d.pos.y += dt * 4; d.setAnim('fly'); if (d.t > 5) d.mode = 'gone'; }
  if (ahead < -20 || dist > 110) d.mode = 'gone';
}

/* ================= boss ================= */
function spawnBoss() {
  const lv = L(), b = mkDino(lv.boss, lv.bossSize); b.boss = true; b.hp = lv.bossHp[D().hpIdx]; b.fed = 0; b.mode = 'walk'; b.sub = 'in'; b.subT = 0; b.fwd = 40; b.lat = 2.5;
  G.boss = b; G.vT = lv.bossRoll; G.phase = 'bossIn';
  for (const d of G.dinos) if (d.mode !== 'dead') { d.mode = 'leave'; d.t = 0; d.leaveSide = d.side || 1; }
  say(lv.bossSay, true, 'alert', 'boss');
}
function setSub(b, s) { b.sub = s; b.subT = 0; if (s === 'roar') { b.setAnim('roar'); cry(b.sp.cry); G.shake = Math.max(G.shake, ACT() ? 0.35 : 0.08); } }
function updBoss(b, dt) {
  b.subT += dt; const act = ACT();
  if (b.mode === 'walk') {
    switch (b.sub) {
      case 'in': b.fwd -= 7 * dt; b.setAnim('run'); b.speed = 7; if (b.fwd <= 15) { setSub(b, 'roar'); G.phase = 'boss'; } break;
      case 'roar': b.speed = 0; if (b.subT > 1.9) { setSub(b, 'stalk'); b.setAnim('walk'); } break;
      case 'stalk': { const want = act ? 11 : 14; b.fwd += (want - b.fwd) * dt * 0.6; b.lat = Math.sin(b.t * 0.55) * 3; b.speed = 2.2; b.setAnim('walk'); if (b.subT > (act ? (b.enraged ? 2.6 : 3.6) : 5.5)) setSub(b, act ? 'lunge' : 'roar'); break; }
      case 'lunge': b.fwd -= (b.enraged ? 12 : 9) * dt; b.lat += ((b.lat >= 0 ? 2.6 : -2.6) - b.lat) * dt * 2; b.speed = 8; b.setAnim('run'); if (b.fwd < 6.5 + b.size) { setSub(b, 'bite'); b.setAnim('attack'); } break;
      case 'bite': b.speed = 0; if (!b.bit && b.animT > 0.38) { b.bit = true; biteHit(b, true); cry(b.sp.cry, 0.5); } if (b.animT > 0.9) { b.bit = false; setSub(b, 'back'); } break;
      case 'back': b.fwd += 6 * dt; b.speed = 3; b.setAnim('walk'); if (b.fwd >= 13) setSub(b, 'roar'); break;
    }
  } else if (b.mode === 'dead') {
    b.deadT += dt;
    if (!b.thud && b.animT > 0.5) { b.thud = true; G.shake = 0.7; G.flash = 0.25; sfx.fall(true); fx.dust(b.pos.clone().setY(b.pos.y + 0.3), 26, 2.2); if (BLOOD()) fx.pool(b.pos.clone(), 3.2); }
    if (!BLOOD() && b.deadT > 1.3 && (b.zT = (b.zT || 0) - dt) <= 0) { b.zT = 1.1; fx.zzz(b.bodyWorld(tmp2).add(tmp.set(0, 1.4, 0)), 1.6); }
    b.fwd -= G.v * dt;
  }
  if (b.kb && b.kb.lengthSq() > 1e-4) { b.fwd += b.kb.dot(jeepF) * dt * 0.5; b.kb.multiplyScalar(Math.max(0, 1 - dt * 7)); }
  b.pos.copy(jeepPos).addScaledVector(jeepF, b.fwd).addScaledVector(jeepR, b.lat); settle(b);
  if (b.mode !== 'dead') b.heading = Math.atan2(jeepPos.x - b.pos.x, jeepPos.z - b.pos.z) + (b.sub === 'stalk' ? Math.cos(b.t * 0.55) * 0.55 : b.sub === 'roar' ? 0.6 * (b.lat >= 0 ? 1 : -1) : 0);
}
function bossDone() {
  stat('kills');
  const b = G.boss; b.mode = 'dead'; b.setAnim('dead'); b.deadT = 0; G.phase = 'done'; G.doneT = 0; G.vT = 0;
  cry(b.sp.cry, 1); if (!BLOOD()) setTimeout(() => sfx.sleepy(true), 600); setTimeout(() => sfx.fanfare(), 1700);
  star(b.bodyWorld(new THREE.Vector3()), 5); meet(b.kind);
  say((BLOOD() ? "It's down!" : "It's asleep!") + ' Great shot, ranger' + nameBit() + '!', true, 'cheer', 'down');
}
const nameBit = () => (S.name ? ', ' + S.name : '');

/* ================= stars & popups (HUD space) ================= */
function toScreen(p) { const v = p.clone().project(camera); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, ok: v.z < 1 }; }
function star(wp, n) { const s = toScreen(wp); for (let i = 0; i < n; i++) G.stars.push({ sx: s.x + rnd(-20, 20), sy: s.y + rnd(-20, 20), t: 0, dur: 0.7 + i * 0.09 }); }
function pop(wp, text) { const s = toScreen(wp); G.pops.push({ x: s.x, y: s.y - 30, t: 0, text }); }

/* ================= flow ================= */
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); $('bPause').classList.toggle('on', id === null && G.state === 'play'); $('weapons').classList.toggle('on', id === null && G.state === 'play'); }
function dots(el, cur, lvl) { el.innerHTML = ''; const a = Math.floor(lvl / SET) * SET; cur -= a; for (let i = 0; i < SET; i++) { const d = document.createElement('i'); if (i < cur) d.className = 'done'; else if (i === cur) d.className = 'now'; el.appendChild(d); } }
function clearLevel() {
  for (const d of G.dinos) removeDino(d); G.dinos = []; if (G.boss) { removeDino(G.boss); G.boss = null; }
  for (const dt of G.darts) scene.remove(dt.m); G.darts = []; fx.clear(); G.stars = []; G.pops = [];
}
function buildLevel(i) { G.level = i; clearLevel(); world.build(i); spawnHerd(); G.s = 0; G.v = 0; G.vT = 0; G.lookPt = null; placeJeep(0); convoy.reset(0); }
function toTitle() {
  G.state = 'title'; musicStop(); buildLevel(0); world.setWeather('clear', true); G.wx = ['clear']; G.s = 4; G.vT = 0.8; G.aim = { x: W / 2, y: H * 0.45 };
  for (const [k, sOff, lat] of [['raptor', 13, -4.5], ['trike', 19, 6], ['raptor', 15, -6.5], ['stego', 30, -9]]) { const d = mkDino(k); const b = world.posAt(G.s + sOff), R = world.dirAt(G.s + sOff).cross(UP).normalize(); d.pos.copy(b).addScaledVector(R, lat); d.pos.y = groundAt(d.pos); d.heading = Math.atan2(-R.x * Math.sign(lat), -R.z * Math.sign(lat)) + 0.6; d.mode = 'idle'; d.setAnim('idle'); G.dinos.push(d); }
  show('title');
}
function courseOf(i) { return Math.floor(i / SET); }
// course & level picker (title ▶ opens it)
function openCourses() {
  const lim = +S.ridesPerDay;
  if (lim > 0 && ridesToday() >= lim) { G.state = 'rest'; show('rest'); say("The dinosaurs are sleeping. Let's go on a new mission tomorrow" + nameBit() + '!', true, 'calm', 'sleep'); return; }
  G.state = 'courses'; const box = $('clist'); box.innerHTML = '';
  S.best = S.best || {};
  COURSES.forEach((c, ci) => {
    const card = document.createElement('div'); card.className = 'course';
    const h = document.createElement('div'); h.className = 'chead'; h.textContent = c.emoji + ' ' + c.name; card.appendChild(h);
    const row = document.createElement('div'); row.className = 'lrow';
    for (let k = 0; k < SET; k++) {
      const i = c.first + k, lv = LEVELS[i]; if (!lv) continue;
      const b = document.createElement('button'); b.className = 'lvl';
      b.innerHTML = '<span class="ln">' + (k + 1) + '</span><span class="le">' + lv.emoji + '</span><span class="lt">' + lv.name + '</span><span class="lb">' + (TEETH.includes(lv.boss) ? '🦖' : '🦕') + (S.best[i] ? ' ⭐' + S.best[i] : '') + '</span>';
      b.addEventListener('click', e => { e.preventDefault(); audioInit(); sfx.ui(); startRide(i); });
      row.appendChild(b);
    }
    card.appendChild(row); box.appendChild(card);
  });
  show('courses'); say('Pick a course, ranger!', true, 'radio', 'pick');
}
function startRide(i) {
  const lim = +S.ridesPerDay;
  if (lim > 0 && ridesToday() >= lim) { G.state = 'rest'; show('rest'); say("The dinosaurs are sleeping. Let's go on a new mission tomorrow" + nameBit() + '!', true, 'calm', 'sleep'); return; }
  ridesToday(); S.rides++; save(); G.score = 0; G.courseEnd = courseOf(i) * SET + SET - 1; G.ride = newStats(); G.ride.course = courseOf(i); G.ride.from = i; startLevel(i);
}
function startLevel(i) {
  const lv = LEVELS[i];
  $('iEmoji').textContent = lv.emoji; $('iName').textContent = lv.name; dots($('iDots'), i, i); const wx = chooseWeather(i); $('iWx').textContent = wxIcon(wx[0], i) + ' ' + wxName(wx[0], i) + (wx[1] ? '  →  ' + wxIcon(wx[1], i) + ' ?' : '');
  G.state = 'intro'; G.introT = 99; G.vT = 0; show('intro'); say(lv.say, true, 'calm', 'start');   // hold the intro until the new track is built
  setTimeout(() => { // build after the card is painted
    buildLevel(i); G.pointers.clear(); G.phase = 'ride'; G.spawnT = 2.5; G.levelScore = 0; G.energy = 100; planWeather(wx); G.ms = newStats(); G.aim = { x: W / 2, y: H * 0.45 }; G.introT = 2.4;
  }, 60);
}
// jeep energy: bites drain it; at zero the mission is over (grown-ups can switch this off)
// Ranger Two's darts: they make dinosaurs flinch; only raptors attacking their jeep can be put down (no stars for the player)
const NPC_LINES = ['Ranger Two here! Dinosaurs ahead!', 'We see raptors on the left!', 'Nice shooting, partner!', 'Watch out, one is coming your way!', 'Ranger Two, still rolling!'];
function npcHit(d, wp, dir) {
  if (BLOOD()) fx.blood(wp, dir, 0.7, 10); else fx.puff(wp, 0.25);
  d.hitT = 0.3; d.stun = 0.4;
  if (d.attackingConvoy && !d.boss) { d.hp -= 1; if (d.hp <= 0) { d.mode = 'dead'; d.setAnim('dead'); d.deadT = 0; d.speed = 0; cry(d.sp.cry, 0.5); } }
}
// being bitten: red edge pulse, claw scratches, blood splats, camera jolt + zoom punch, gun knocked, slow-mo, buzz
function ouch(big) {
  stat('bites');
  const k = big ? 1 : 0.75;
  G.dmgFx = Math.min(1.4, (G.dmgFx || 0) + k); G.fovPunch = 1; G.camRoll = (Math.random() < 0.5 ? -1 : 1) * 0.14 * k; G.camPitch = -0.08 * k;
  G.hitStop = Math.max(G.hitStop, big ? 0.1 : 0.07); cockpit.knock(); sfx.hurt(); buzz([60, 40, 90]);
  const a = rnd(-0.5, 0.5); G.scratch = { t: 0, a, x: W * rnd(0.3, 0.7), y: H * rnd(0.3, 0.6) };
  if (BLOOD()) for (let i = 0; i < (big ? 7 : 5); i++) { const edge = Math.random() < 0.5; G.splats.push({ x: edge ? (Math.random() < 0.5 ? rnd(0, W * 0.2) : rnd(W * 0.8, W)) : rnd(0, W), y: edge ? rnd(0, H) : rnd(0, H * 0.25), r: rnd(25, 75) * k, t: 0, drip: rnd(30, 90) }); }
  if (Math.random() < 0.3) say(pick(['Hang on, ranger!', 'Ouch! Keep firing!', "We're okay! Shoot it!"]), false, 'alert', 'hurt');
}
function hurt(n) {
  if (!S.energy || G.state !== 'play' || G.phase === 'done') return;
  G.energy = Math.max(0, G.energy - n); G.hurtT = 1;
  if (G.energy <= 0) gameOver();
}
function recordRide(done) {
  if (!G.ride || G.ride.saved) return; G.ride.saved = true;
  S.history = S.history || [];
  const same = S.history.filter(h => h.course === G.ride.course), prev = same.length ? same[same.length - 1] : null;
  const bestStars = Math.max(0, ...same.map(h => h.stars));
  G.prevRide = prev; G.rideBest = done && same.length > 0 && G.ride.stars > bestStars;
  const d = new Date(), e = Object.assign({}, G.ride, { date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), to: G.level, done, t: Math.round(G.ride.t) });
  delete e.saved; S.history.push(e); if (S.history.length > 40) S.history.shift(); save();
}
function openRecords() {
  G.state = 'records'; const H = (S.history || []).slice().reverse(), box = $('rlist');
  let h = '<table><tr><th>Date</th><th>Start</th><th>⭐</th><th>🎯</th><th>💥</th><th>🦖</th><th>🩹</th><th></th></tr>';
  for (const r of H.slice(0, 12)) h += '<tr><td>' + r.date.slice(5) + '</td><td>' + (COURSES[r.course] ? COURSES[r.course].emoji + ' ' + LEVELS[r.from].name : '') + '</td><td>' + r.stars + '</td><td>' + pct(r.hits, r.shots) + '%</td><td>' + r.heads + '</td><td>' + r.kills + '</td><td>' + r.bites + '</td><td>' + (r.done ? '🏁' : '💥') + '</td></tr>';
  if (!H.length) h += '<tr><td colspan="8">No rides yet. Go play!</td></tr>';
  h += '</table><div class="bests">' + LEVELS.map((lv, i) => '<span>' + lv.emoji + ' ' + lv.name + ': ⭐ ' + ((S.best && S.best[i]) || 0) + '</span>').join('') + '</div>';
  box.innerHTML = h; show('records');
}
function gameOver() {
  if (G.ride) recordRide(false);
  G.state = 'over'; G.vT = 0; G.pointers.clear(); musicStop(); show('over');
  say('Oh no! The jeep is out of energy. Tap play to try again, ranger' + nameBit() + '!', true, 'radio', 'over');
}
// weather: each mission starts with one kind and may change once on the way
const WX_SAY_SNOW = { rain: "It's starting to snow, ranger!", fog: 'Fog is rolling in. Watch closely!', storm: 'A blizzard! Hold on tight!', clear: 'The sky is clearing up!' };
const WX_SAY = { rain: "It's starting to rain, ranger!", fog: 'Fog is rolling in. Watch closely!', storm: 'A thunderstorm! Hold on tight!', clear: 'The sky is clearing up!' };
const WX_ICON = { clear: '☀️', rain: '🌧️', fog: '🌫️', storm: '⛈️' };
const SNOWY = i => i === 8;
const wxName = (k, i) => i === 6 && k === 'clear' ? 'Clear night' : SNOWY(i) ? ({ clear: 'Sunny', rain: 'Snow', fog: 'Fog', storm: 'Blizzard' })[k] : ({ clear: 'Sunny', rain: 'Rain', fog: 'Fog', storm: 'Thunderstorm' })[k];
const wxIcon = (k, i) => i === 6 && k === 'clear' ? '🌙' : SNOWY(i) ? ({ clear: '☀️', rain: '🌨️', fog: '🌫️', storm: '❄️' })[k] : WX_ICON[k];
function chooseWeather(i) {
  const pref = S.weather || 'random';
  if (pref !== 'random') return [pref];
  S.lastWx = S.lastWx || {}; const last = S.lastWx[i];
  const start = pick(['clear', 'clear', 'rain', 'fog', 'storm', 'rain'].filter(k => k !== last)); S.lastWx[i] = start; save();
  return Math.random() < 0.7 ? [start, pick(['clear', 'rain', 'fog', 'storm'].filter(k => k !== start))] : [start];
}
function planWeather(wx) { G.wx = wx; G.wxAt = wx[1] ? world.env.len * rnd(0.35, 0.6) : 1e9; world.setWeather(wx[0], true); }
world.onLightning = () => { G.flash = Math.max(G.flash, 0.6); setTimeout(() => sfx.thunder(), 150); };
function beginPlay() { G.state = 'play'; G.vT = RIDE; show(null); musicStart(); }
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
function statRow(st, prev) {
  const acc = pct(st.hits, st.shots), pacc = prev ? pct(prev.hits, prev.shots) : null;
  const cmp = (v, p, better = 1) => p == null ? '' : v === p ? ' <i class="eq">=</i>' : ((v > p) === (better > 0) ? ' <i class="up">▲</i>' : ' <i class="dn">▼</i>');
  return '<span title="stars">⭐ ' + st.stars + cmp(st.stars, prev && prev.stars) + '</span><span title="accuracy">🎯 ' + acc + '%' + cmp(acc, pacc) + '</span>' +
    '<span title="head shots">💥 ' + st.heads + cmp(st.heads, prev && prev.heads) + '</span><span title="dinosaurs">🦖 ' + st.kills + cmp(st.kills, prev && prev.kills) + '</span><span title="bites">🩹 ' + st.bites + cmp(st.bites, prev && prev.bites, -1) + '</span>';
}
function levelClear() {
  S.totalStars += G.levelScore; musicStop();
  S.lastMission = S.lastMission || {}; const prevM = S.lastMission[G.level]; if (G.ms) { S.lastMission[G.level] = Object.assign({}, G.ms); $('cStats').innerHTML = statRow(G.ms, prevM); }
  const newBest = G.levelScore > ((S.best && S.best[G.level]) || 0) && prevM; $('cBest').style.display = newBest ? 'block' : 'none';
  if (G.level >= Math.min(LEVELS.length - 1, G.courseEnd ?? 2)) recordRide(true);
  save();
  S.best = S.best || {}; S.best[G.level] = Math.max(S.best[G.level] || 0, G.levelScore); save();
  if (G.level >= Math.min(LEVELS.length - 1, G.courseEnd ?? 2)) { G.state = 'end'; $('eStars').textContent = G.score; $('eStats').innerHTML = G.ride ? statRow(G.ride, G.prevRide) : ''; $('eBest').style.display = G.rideBest ? 'block' : 'none'; show('end'); setTimeout(() => say((BLOOD() ? 'Mission complete! You stopped every dinosaur. Great job, ranger' : 'Mission complete! All the dinosaurs are safe and sleeping. Great job, ranger') + nameBit() + '!', true, 'cheer', 'complete'), 400); return; }
  G.state = 'clear'; $('cStars').textContent = G.levelScore; dots($('cDots'), G.level + 1, G.level); show('clear');
}
function pauseGame() { if (G.state !== 'play') return; G.state = 'paused'; G.pointers.clear(); musicStop(); show('pause'); }
function resumeGame() { G.state = 'play'; show(null); musicStart(); }

/* ================= jeep + camera ================= */
const _cf = new THREE.Vector3(), _cb = new THREE.Vector3(), _ca = new THREE.Vector3();
function camFocus(base, eye) {
  _cb.copy(base); if (!['play', 'over'].includes(G.state)) return _cb;
  let best = null, score = 0;
  if (G.boss && G.boss.mode !== 'dead') { best = G.boss; score = 1; }
  else for (const d of G.dinos) {
    if (d.mode === 'dead' || d.mode === 'leave' || d.mode === 'gone' || d.mode === 'chargeNPC' || d.mode === 'attackNPC') continue;
    const dist = d.pos.distanceTo(eye), ahead = _ca.copy(d.pos).sub(eye).dot(jeepF);
    if (dist > 30 || ahead < 1) continue;
    const sc = (d.mode === 'attack' ? 2 : d.mode === 'charge' ? 1.4 : 1) * (1 - dist / 30);
    if (sc > score) { score = sc; best = d; }
  }
  if (!best) return _cb;
  best.bodyWorld(_cf);
  const k = best.boss ? 0.5 : clamp(score * 0.45, 0, 0.4);
  // keep the turn moderate: limit how far sideways/up the focus may pull the view
  _cf.sub(eye); _cb.sub(eye); const dist = _cb.length(); _cf.setLength(dist);
  return _cb.lerp(_cf, k).add(eye);
}
function placeJeep(dt) {
  world.posAt(G.s, jeepPos); world.dirAt(G.s, jeepF); jeepR.crossVectors(jeepF, UP).normalize();
  const k = clamp(G.v / RIDE, 0, 1), t = G.t;
  // bump spring
  G.bumpV.addScaledVector(G.bump, -40 * dt); G.bumpV.multiplyScalar(Math.max(0, 1 - 7 * dt)); G.bump.addScaledVector(G.bumpV, dt);
  const eye = tmp.copy(jeepPos).addScaledVector(UP, 1.85 + Math.sin(t * 9) * 0.012 * k + Math.sin(t * 3.7) * 0.02 * k).add(G.bump);
  camera.position.copy(eye);
  const look = world.posAt(G.s + 12, tmp2); look.y += 1.25; look.addScaledVector(jeepR, Math.sin(t * 0.37) * 0.25);
  // follow the action: lean the view toward the most pressing dinosaur (or the boss), then drift back to the road
  const want = camFocus(look, eye);
  if (!G.lookPt || G.lookPt.distanceTo(want) > 25) G.lookPt = want.clone(); else G.lookPt.lerp(want, Math.min(1, dt * 2.4));   // snap after a jump (new level)
  camera.lookAt(G.lookPt);
  camera.rotateZ(clamp(-world.curvature(G.s + 6) * 9, -0.07, 0.07) + Math.sin(t * 1.9) * 0.006 * k + G.bump.x * 0.05);
  if (Math.abs(G.camRoll) > 0.001 || Math.abs(G.camPitch) > 0.001) { camera.rotateZ(G.camRoll); camera.rotateX(G.camPitch); G.camRoll *= Math.max(0, 1 - dt * 5); G.camPitch *= Math.max(0, 1 - dt * 5); }
  if (G.fovPunch > 0.001) { G.fovPunch = Math.max(0, G.fovPunch - dt * 3); camera.fov = G.baseFov * (1 - 0.1 * Math.sin(G.fovPunch * Math.PI)); camera.updateProjectionMatrix(); }
  if (G.camKick > 0.0005) { camera.rotateX(G.camKick); camera.rotateY(G.camKickV || 0); camera.position.y += G.camKick * 0.15; G.camKick *= Math.max(0, 1 - dt * 11); G.camKickV *= Math.max(0, 1 - dt * 11); }
  if (G.shake > 0) { const s = G.shake * G.shake; camera.position.x += rnd(-1, 1) * s * 0.18; camera.position.y += rnd(-1, 1) * s * 0.14; camera.rotateX(rnd(-1, 1) * s * 0.05); camera.rotateZ(rnd(-1, 1) * s * 0.05); }
}

/* ================= update ================= */
let engT = 0;
function update(dt) {
  G.t += dt;
  const live = ['title', 'intro', 'play', 'clear', 'end', 'rest', 'over', 'courses'].includes(G.state);
  if (AC && (engT -= dt) <= 0) { engT = 0.1; audioTick(S.sound && live && !['title', 'end', 'rest', 'courses'].includes(G.state), G.v / RIDE, S.sound && live); }
  if (!live && G.state !== 'guide' && G.state !== 'parent') return;
  if (!live) { world.update(dt, camera); return; }
  if ((G.birdT -= dt) <= 0) { G.birdT = rnd(2, 5); if (G.level !== 2) sfx.bird(); }
  G.v += (G.vT - G.v) * Math.min(1, dt * 1.4); G.s += G.v * dt;
  if ((G.state === 'title' || G.state === 'courses') && G.s > 30) G.s = 4;
  placeJeep(dt);
  convoy.update(dt, { world, s: G.s, v: G.v, phase: G.phase, state: G.state, targets: G.boss ? G.dinos.concat([G.boss]) : G.dinos,
    onHit: npcHit, sfx: () => sfx.npc(), say: () => say(pick(NPC_LINES), false) });
  if (G.state === 'intro') { G.introT -= dt; if (G.introT <= 0) beginPlay(); }
  if (G.state === 'play') {
    const env = world.env;
    if (G.phase === 'ride') {
      G.spawnT -= dt;
      const active = G.dinos.filter(d => d.mode !== 'dead' && d.mode !== 'leave').length;
      if (G.spawnT <= 0 && G.s < env.len - 30) { if (active < D().max + 2) spawnWave(); else G.spawnT = 0.6; }
      if (G.s >= env.len) spawnBoss();
      if (G.s >= G.wxAt && G.wx[1]) { world.setWeather(G.wx[1]); G.wxAt = 1e9; say((SNOWY(G.level) ? WX_SAY_SNOW : WX_SAY)[G.wx[1]], false, 'alert', 'weather'); }
    }
    G.cool = Math.max(0, (G.cool || 0) - dt);
    for (const p of G.pointers.values()) { p.hold += dt; if (p.hold >= 0.12 && G.cool <= 0) fire(p.x, p.y); }
    if (G.phase === 'done') { G.doneT += dt; if (G.doneT > 4.5) levelClear(); }
  }
  for (const d of G.dinos) { if (d.mode !== 'idle') updDino(d, dt); else settle(d); d.update(dt); }
  G.dinos = G.dinos.filter(d => { if (d.mode === 'gone') { removeDino(d); return false; } return true; });
  for (const d of G.bg) { d.pos.x += Math.sin(d.heading) * d.speed * dt; d.pos.z += Math.cos(d.heading) * d.speed * dt; settle(d); d.update(dt); }
  if (G.boss) { G.boss.t += 0; updBoss(G.boss, dt); G.boss.update(dt); }
  // darts in flight
  for (const dt2 of G.darts) { dt2.t += dt; const u = clamp(dt2.t / dt2.dur, 0, 1); if (dt2.hit.d && dt2.hit.obj) dt2.to = dt2.hit.obj.localToWorld(dt2.hit.local.clone()); dt2.m.position.lerpVectors(dt2.from, dt2.to, u); aimDart(dt2.m, dt2.from, dt2.to); if (u >= 1) { dt2.done = true; scene.remove(dt2.m); dartArrive(dt2); } }
  G.darts = G.darts.filter(d => !d.done);
  // aim the rifle at the finger (or the last tap)
  ndc.set(G.aim.x / W * 2 - 1, -(G.aim.y / H) * 2 + 1); ray.setFromCamera(ndc, camera);
  const dc = ray.ray.direction.clone().applyQuaternion(camera.quaternion.clone().invert());
  cockpit.aimAt(dc, dt); cockpit.update(dt);
  fx.update(dt); world.update(dt, camera);
  // dinosaur visibility: stronger rim light in dark missions and bad weather
  if (world.env) { const dark = world.env.snow ? 0.16 : world.env.night ? 0.45 : world.env.trees || world.env.volcano || world.env.swamp ? 0.42 : 0.28, w = world.wx || { dark: 0, fogK: 1 };
    DINO_LOOK.rim.value = dark + w.dark * 0.35 + (1 - w.fogK) * 0.25; DINO_LOOK.lift.value = (world.env.night ? 0.1 : world.env.trees || world.env.volcano ? 0.09 : 0.05) + w.dark * 0.06; DINO_LOOK.fog.value = 0.6 - (1 - w.fogK) * 0.15; } if (AC) setRain(live && G.state !== 'title' ? world.wx.rain : 0);
  if (G.state === 'play' && G.ms) { G.ms.t += dt; if (G.ride) G.ride.t += dt; }
  for (const s of G.stars) { s.t += dt; if (s.t >= s.dur && !s.done) { s.done = true; G.score++; G.levelScore++; stat('stars'); G.hudBump = 1; sfx.ding(); } }
  G.stars = G.stars.filter(s => !s.done); for (const m of G.marks) m.t += dt; G.marks = G.marks.filter(m => m.t < 0.22);
  G.dmgFx = Math.max(0, G.dmgFx - dt * 1.1); if (G.scratch) { G.scratch.t += dt; if (G.scratch.t > 1.3) G.scratch = null; }
  for (const sp of G.splats) sp.t += dt; G.splats = G.splats.filter(sp => sp.t < 2.4);
  if (S.energy && G.state === 'play' && G.energy < 30 && (G.heartT -= dt) <= 0) { G.heartT = 0.9; sfx.heart(); } for (const p of G.pops) p.t += dt; G.pops = G.pops.filter(p => p.t < 0.9);
  G.shake = Math.max(0, G.shake - dt); G.flash = Math.max(0, G.flash - dt * 2); G.red = Math.max(0, G.red - dt * 1.5); G.hudBump = Math.max(0, G.hudBump - dt * 3); G.hurtT = Math.max(0, (G.hurtT || 0) - dt * 2);
}

/* ================= HUD (2D overlay) ================= */
function rr(x, y, w, h, r) { hx.beginPath(); hx.moveTo(x + r, y); hx.arcTo(x + w, y, x + w, y + h, r); hx.arcTo(x + w, y + h, x, y + h, r); hx.arcTo(x, y + h, x, y, r); hx.arcTo(x, y, x + w, y, r); hx.closePath(); }
function starShape(x, y, r, fill, stroke) { hx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.48 : r; hx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } hx.closePath(); hx.fillStyle = fill; hx.fill(); if (stroke) { hx.strokeStyle = stroke; hx.lineWidth = Math.max(2, r * 0.14); hx.lineJoin = 'round'; hx.stroke(); } }
function drawHUD() {
  hx.clearRect(0, 0, W, H);
  if (G.red > 0) { hx.fillStyle = 'rgba(150,10,10,' + (G.red * 0.25) + ')'; hx.fillRect(0, 0, W, H); }
  // damage edge pulse (+ steady pulse when energy is low)
  const low = S.energy && G.state === 'play' && G.energy < 30 ? 0.18 + 0.12 * Math.sin(G.t * 6) : 0, dv = Math.min(1, G.dmgFx * 0.6 + low);
  if (dv > 0.01) { const g2 = hx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85); g2.addColorStop(0, 'rgba(160,0,0,0)'); g2.addColorStop(1, (BLOOD() ? 'rgba(170,0,0,' : 'rgba(255,255,255,') + dv + ')'); hx.fillStyle = g2; hx.fillRect(0, 0, W, H); }
  for (const sp of G.splats) { const a = Math.max(0, 1 - sp.t / 2.4) * 0.8, dr = Math.min(1, sp.t / 1.5) * sp.drip; hx.fillStyle = 'rgba(110,0,0,' + a + ')'; hx.beginPath(); hx.arc(sp.x, sp.y, sp.r, 0, 7); hx.fill(); hx.fillRect(sp.x - sp.r * 0.15, sp.y, sp.r * 0.3, sp.r * 0.4 + dr); hx.beginPath(); hx.arc(sp.x, sp.y + sp.r * 0.4 + dr, sp.r * 0.15, 0, 7); hx.fill(); }
  if (G.scratch) { const c = G.scratch, a = Math.max(0, 1 - c.t / 1.3), L = Math.min(W, H) * 0.55 * Math.min(1, c.t * 8);
    hx.save(); hx.translate(c.x, c.y); hx.rotate(c.a + 0.6); hx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) { hx.strokeStyle = (BLOOD() ? 'rgba(90,0,0,' : 'rgba(40,40,40,') + a * 0.85 + ')'; hx.lineWidth = 9; hx.beginPath(); hx.moveTo(-L / 2, i * 38); hx.quadraticCurveTo(0, i * 38 + 25, L / 2, i * 38 + 10); hx.stroke();
      hx.strokeStyle = 'rgba(255,230,220,' + a * 0.5 + ')'; hx.lineWidth = 2; hx.stroke(); }
    hx.restore(); }
  if (G.flash > 0) { hx.fillStyle = 'rgba(255,255,240,' + (G.flash * 0.45) + ')'; hx.fillRect(0, 0, W, H); }
  const vg = hx.createRadialGradient(W / 2, H * 0.45, H * 0.5, W / 2, H * 0.45, H * 1.0); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.3)'); hx.fillStyle = vg; hx.fillRect(0, 0, W, H);
  for (const p of G.pointers.values()) {
    hx.lineWidth = 4; hx.strokeStyle = 'rgba(255,255,255,0.95)'; hx.beginPath(); hx.arc(p.x, p.y, 30, 0, 7); hx.stroke();
    hx.strokeStyle = 'rgba(120,230,120,0.95)'; hx.lineWidth = 3; hx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { hx.moveTo(p.x + dx * 18, p.y + dy * 18); hx.lineTo(p.x + dx * 40, p.y + dy * 40); } hx.stroke();
    hx.fillStyle = 'rgba(255,80,60,0.95)'; hx.beginPath(); hx.arc(p.x, p.y, 3.5, 0, 7); hx.fill();
  }
  for (const m of G.marks) { const a = 1 - m.t / 0.22, r = (m.big ? 16 : 10) + m.t * 40; hx.globalAlpha = Math.max(0, a); hx.lineWidth = m.big ? 5 : 3.5; hx.strokeStyle = m.big ? '#ff4030' : '#ffffff'; hx.beginPath();
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { hx.moveTo(m.x + sx * r * 0.45, m.y + sy * r * 0.45); hx.lineTo(m.x + sx * r, m.y + sy * r); } hx.stroke(); hx.globalAlpha = 1; }
  for (const p of G.pops) { const a = clamp(1 - p.t / 0.9, 0, 1); hx.globalAlpha = a; hx.font = '900 34px system-ui, sans-serif'; hx.textAlign = 'center'; hx.lineWidth = 6; hx.strokeStyle = '#2E2A1E'; hx.strokeText(p.text, p.x, p.y - p.t * 50); hx.fillStyle = '#F2C14E'; hx.fillText(p.text, p.x, p.y - p.t * 50); hx.globalAlpha = 1; hx.textAlign = 'start'; }
  for (const s of G.stars) { const u = clamp(s.t / s.dur, 0, 1), e = u * u * (3 - 2 * u), tx = 60, ty = 52, cx = (s.sx + tx) / 2, cy = Math.min(s.sy, ty) - 120;
    starShape((1 - e) * (1 - e) * s.sx + 2 * (1 - e) * e * cx + e * e * tx, (1 - e) * (1 - e) * s.sy + 2 * (1 - e) * e * cy + e * e * ty, 22 - u * 6, '#F2C14E', '#2E2A1E'); }
  if (!['play', 'paused', 'clear', 'intro'].includes(G.state)) return;
  hx.fillStyle = 'rgba(243,235,211,0.92)'; rr(14, 14, 176, 78, 18); hx.fill(); hx.lineWidth = 4; hx.strokeStyle = '#2E2A1E'; hx.stroke();
  hx.save(); hx.translate(60, 53); const bb = 1 + G.hudBump * 0.35; hx.scale(bb, bb); starShape(0, 0, 26, '#F2C14E', '#2E2A1E'); hx.restore();
  hx.fillStyle = '#2E2A1E'; hx.font = '900 44px system-ui, sans-serif'; hx.textBaseline = 'middle'; hx.fillText(String(G.score), 98, 55);
  if (S.energy) { const e = clamp(G.energy / 100, 0, 1), sh = G.hurtT > 0 ? Math.sin(G.t * 60) * 4 * G.hurtT : 0;
    hx.fillStyle = 'rgba(243,235,211,0.92)'; rr(14 + sh, 100, 176, 34, 12); hx.fill(); hx.lineWidth = 3; hx.strokeStyle = '#2E2A1E'; hx.stroke();
    hx.font = '22px system-ui, sans-serif'; hx.fillText('🚙', 22 + sh, 118);
    hx.fillStyle = '#5a4a34'; rr(56 + sh, 108, 124, 18, 8); hx.fill();
    hx.fillStyle = e > 0.5 ? '#6DBE45' : e > 0.25 ? '#E8B83A' : '#D9472B'; if (e > 0) { rr(56 + sh, 108, Math.max(14, 124 * e), 18, 8); hx.fill(); } }
  const cx = W / 2, y = 52;
  if (G.phase === 'ride' && world.env) {
    const w = Math.min(420, W * 0.36), u = clamp(G.s / world.env.len, 0, 1);
    hx.fillStyle = 'rgba(243,235,211,0.85)'; rr(cx - w / 2 - 12, y - 17, w + 24, 34, 10); hx.fill(); hx.lineWidth = 3; hx.strokeStyle = '#2E2A1E'; hx.stroke();
    hx.fillStyle = '#E8873A'; rr(cx - w / 2 - 5, y - 10, (w + 10) * u + 4, 20, 6); hx.fill();
    hx.fillStyle = '#F3EBD3'; hx.beginPath(); hx.arc(cx + w / 2 + 18, y, 28, 0, 7); hx.fill(); hx.stroke();
    hx.font = '32px system-ui, sans-serif'; hx.textAlign = 'center'; hx.fillText(TEETH.includes(L().boss) ? '🦖' : '🦕', cx + w / 2 + 18, y + 2); hx.textAlign = 'start';
    hx.fillStyle = '#4E5B30'; hx.strokeStyle = '#2E2A1E'; hx.lineWidth = 3; rr(cx - w / 2 + w * u - 16, y - 11, 32, 22, 6); hx.fill(); hx.stroke();
    hx.font = '30px system-ui, sans-serif'; hx.textAlign = 'center'; hx.fillText(wxIcon(world.wxKind || 'clear', G.level) || '☀️', cx - w / 2 - 38, y + 2); hx.textAlign = 'start';
  } else if (G.boss) {
    const w = Math.min(460, W * 0.4), u = clamp(G.boss.fed / G.boss.hp, 0, 1);
    hx.fillStyle = 'rgba(243,235,211,0.9)'; rr(cx - w / 2 - 12, y - 20, w + 24, 40, 12); hx.fill(); hx.lineWidth = 3; hx.strokeStyle = '#2E2A1E'; hx.stroke();
    const bg = hx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); bg.addColorStop(0, '#7FD0FF'); bg.addColorStop(1, '#3A6FD6'); hx.fillStyle = bg; rr(cx - w / 2 - 4, y - 12, (w + 8) * u + 4, 24, 8); hx.fill();
    hx.font = '900 30px system-ui, sans-serif'; hx.fillStyle = '#2E2A1E'; hx.fillText('💤', cx + w / 2 + 20, y + 2);
  }
}

/* ================= loop & adaptive quality ================= */
let last = performance.now();
let loopErr = null;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try { frame(dt); } catch (e) { if (!loopErr) { loopErr = e; console.error(e); const w = $('errBox'); w.textContent = 'Error (please screenshot): ' + (e && e.message) + ' @ ' + String(e && e.stack || '').split(String.fromCharCode(10)).slice(0, 2).join(' '); w.style.display = 'block'; } }
}
function frame(dt) {
  if (G.hitStop > 0) { G.hitStop -= dt; dt *= 0.15; }
  if (!G.hold) update(dt);
  if (G.state !== 'guide') renderer.render(scene, camera);
  drawHUD();
  // keep ~60 fps on the iPad: drop resolution step by step if frames are slow
  G.fpsT += dt; G.fpsN++;
  if (G.fpsT > 2) { G.fps = G.fpsN / G.fpsT; G.fpsT = 0; G.fpsN = 0; if (G.state === 'play' && G.fps < 48 && PR > 0.75) { PR = Math.max(0.75, PR - 0.15); resize(); } }
}

/* ================= input ================= */
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); audioInit();
  if (G.state !== 'play') return;
  const p = { x: e.clientX, y: e.clientY, hold: 0 }; G.pointers.set(e.pointerId, p); fire(p.x, p.y);
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
});
cv.addEventListener('pointermove', e => { const p = G.pointers.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; G.aim.x = p.x; G.aim.y = p.y; } else if (!isTouch && G.state === 'play') { G.aim.x = e.clientX; G.aim.y = e.clientY; } });
const up = e => G.pointers.delete(e.pointerId);
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up);
document.addEventListener('pointerdown', audioInit, true);
['gesturestart', 'gesturechange', 'contextmenu', 'dblclick', 'selectstart'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
document.addEventListener('touchmove', e => { if (!e.target.closest('#guide, #parent .card, #records')) e.preventDefault(); }, { passive: false });
function tapBtn(id, fn) { $(id).addEventListener('click', e => { e.preventDefault(); audioInit(); sfx.ui(); fn(); }); }
tapBtn('bPlay', openCourses); tapBtn('cBack', () => { G.state = 'title'; show('title'); }); tapBtn('bPause', pauseGame); tapBtn('bResume', resumeGame);
tapBtn('bNext', () => startLevel(G.level + 1));
tapBtn('bRetry', () => { G.score -= G.levelScore; startLevel(G.level); });
tapBtn('bHome4', toTitle);
tapBtn('bHome1', toTitle); tapBtn('bHome2', toTitle); tapBtn('bHome3', toTitle);
tapBtn('bGuide', openGuide); tapBtn('bRecords', openRecords); tapBtn('rBack', () => { G.state = 'title'; show('title'); });
for (const [k, w] of Object.entries(WEAPONS)) { const b = document.createElement('button'); b.dataset.w = k; b.textContent = w.icon; b.setAttribute('aria-label', w.name); b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audioInit(); sfx.ui(); setWeapon(k); }); $('weapons').appendChild(b); }
setWeapon('rifle');
tapBtn('fBack', () => { G.state = 'title'; show('title'); });

/* ================= field guide (3D portraits) ================= */
const portraitRT = new THREE.WebGLRenderTarget(520, 340);
portraitRT.texture.colorSpace = THREE.SRGBColorSpace;
function portrait(cvs, kind, seen) {
  const ps = new THREE.Scene(); ps.background = new THREE.Color(0xf7f1de); ps.environment = scene.environment;
  ps.add(new THREE.HemisphereLight(0xffffff, 0x8a7a50, 1.6)); const dl = new THREE.DirectionalLight(0xfff2dc, 2.6); dl.position.set(3, 5, 4); ps.add(dl);
  const d = new Dino(kind, { size: 1 }); d.heading = -Math.PI / 2 + 0.45; d.anim = 'idle'; d.jaw = kind === 'rex' || kind === 'spino' ? 0.6 : 0.1; d.t = 1; d.update(0.016);
  if (d.sp.type === 'flyer') { d.ph = 0.4; d.anim = 'glide'; d.update(0.016); }
  ps.add(d.root); d.root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(d.root), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const pc = new THREE.PerspectiveCamera(30, 520 / 340, 0.1, 500), r = Math.max(sz.x, sz.y * 1.5, sz.z) * 0.72;
  pc.position.set(c.x + r * 0.35, c.y + r * 0.25, c.z + r * 1.9); pc.lookAt(c);
  if (!seen) ps.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0x3a3424 });
  renderer.setRenderTarget(portraitRT); renderer.render(ps, pc); renderer.setRenderTarget(null);
  const px = new Uint8Array(520 * 340 * 4); renderer.readRenderTargetPixels(portraitRT, 0, 0, 520, 340, px);
  const g = cvs.getContext('2d'), img = g.createImageData(520, 340);
  for (let y = 0; y < 340; y++) img.data.set(px.subarray((339 - y) * 520 * 4, (340 - y) * 520 * 4), y * 520 * 4);
  g.putImageData(img, 0, 0);
  if (!seen) { g.globalAlpha = 0.6; g.fillStyle = '#f7f1de'; g.fillRect(0, 0, 520, 340); g.globalAlpha = 1; g.font = '900 140px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(46,42,30,0.75)'; g.fillText('?', 260, 170); }
  d.dispose();
}
function openGuide() {
  G.state = 'guide'; const grid = $('fgrid'); grid.innerHTML = '';
  for (const k of GUIDE) {
    const seen = (S.seen[k] || 0) > 0, b = document.createElement('button'); b.className = 'fcard';
    const cvs = document.createElement('canvas'); cvs.width = 520; cvs.height = 340; b.appendChild(cvs);
    const nm = document.createElement('i'); nm.textContent = seen ? SPECIES[k].name : ''; b.appendChild(nm);
    if (seen) { const n = document.createElement('b'); n.textContent = '🎯 ' + S.seen[k]; b.appendChild(n); }
    try { portrait(cvs, k, seen); } catch (e) { console.warn(e); }
    b.addEventListener('click', () => { audioInit(); b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop'); if (seen) { cry(SPECIES[k].cry, 0.6); setTimeout(() => say(SPECIES[k].name + '!'), 500); } else sfx.ui(); });
    grid.appendChild(b);
  }
  show('guide');
}

/* ================= grown-ups (hold the gear 2 s) ================= */
let gearT = null, gearStart = 0;
function gearTick() { const p = Math.min(100, (performance.now() - gearStart) / 20); $('bGear').style.setProperty('--p', p); if (p >= 100) { gearCancel(); openParent(); } else gearT = requestAnimationFrame(gearTick); }
function gearCancel() { cancelAnimationFrame(gearT); gearT = null; $('bGear').style.setProperty('--p', 0); }
$('bGear').addEventListener('pointerdown', e => { e.preventDefault(); gearStart = performance.now(); gearT = requestAnimationFrame(gearTick); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('bGear').addEventListener(ev, () => { if (gearT) gearCancel(); }));
function fillVoices() {
  const sel = $('pVoiceName'), list = englishVoices(); sel.innerHTML = '';
  const auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Auto (most natural available)' + (list[0] ? ' - ' + list[0].name : ''); sel.appendChild(auto);
  for (const v of list.slice(0, 25)) { const o = document.createElement('option'); o.value = v.name; o.textContent = v.name + ' (' + v.lang + ')'; sel.appendChild(o); }
  sel.value = S.voiceName || '';
}
function openParent() {
  G.state = 'parent';
  $('pInt').value = S.intensity; $('pBlood').checked = S.blood !== false; $('pDiff').value = S.diff; $('pSound').checked = S.sound; $('pMusic').checked = S.music; $('pVoice').checked = S.voice; $('pEnergy').checked = S.energy !== false; fillVoices(); $('pWeather').value = S.weather || 'random'; $('pRides').value = String(S.ridesPerDay); $('pName').value = S.name;
  const lim = +S.ridesPerDay;
  $('pStat').textContent = 'Missions today: ' + ridesToday() + (lim ? ' of ' + lim : '') + ' · Stars so far: ' + S.totalStars + ' · Species found: ' + GUIDE.filter(k => S.seen[k]).length + ' of ' + GUIDE.length;
  $('pVer').textContent = 'Dino Ranger: Jungle Run v' + VERSION + ' · 3D' + (Object.keys(PACK).length ? ' · models: ' + Object.keys(PACK).join(', ') : ' · built-in models') + ' · ' + Math.round(G.fps) + ' fps';
  show('parent');
}
$('pVoiceTest').addEventListener('click', e => { e.preventDefault(); const keep = S.voiceName; S.voiceName = $('pVoiceName').value; resetVoice(); const on = S.voice; S.voice = true; say('Ranger, this is Fern Valley. Dinosaurs ahead! Fire, fire, fire!', true, 'alert'); S.voice = on; S.voiceName = keep; resetVoice(); });
$('pReset').addEventListener('click', () => { S.rides = 0; S.today = todayStr(); save(); openParent(); });
$('pDone').addEventListener('click', () => {
  S.intensity = $('pInt').value; S.blood = $('pBlood').checked; S.diff = $('pDiff').value; S.sound = $('pSound').checked; S.music = $('pMusic').checked; S.voice = $('pVoice').checked; S.energy = $('pEnergy').checked; S.voiceName = $('pVoiceName').value; resetVoice(); S.weather = $('pWeather').value; S.ridesPerDay = +$('pRides').value; S.name = $('pName').value.trim().slice(0, 20);
  save(); G.state = 'title'; show('title');
});

/* ================= recorded ranger lines (grown-ups) ================= */
let recKey = null, recTimer = 0;
function openVoice() { G.state = 'voice'; musicStop(); drawVoice(); show('voice'); }
function drawVoice() {
  const box = $('vlist'); box.innerHTML = '';
  for (const [k, label, hint] of LINES) {
    const row = document.createElement('div'); row.className = 'vrow' + (hasRec(k) ? ' has' : '') + (recKey === k ? ' rec' : '');
    row.innerHTML = '<div class="vt"><b>' + (hasRec(k) ? '✅ ' : '') + label + '</b><i>e.g. “' + hint + '”</i></div>';
    const mk = (txt, cls, fn, off) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = txt; b.disabled = !!off; b.addEventListener('click', e => { e.preventDefault(); fn(); }); row.appendChild(b); };
    mk(recKey === k ? '■ Stop' : '● Record', 'vrec', () => toggleRec(k), recKey && recKey !== k);
    mk('▶', 'vplay', () => { audioInit(); playRec(k); }, !hasRec(k) || recKey);
    mk('🗑', 'vdel', () => { delRec(k).then(drawVoice); }, !hasRec(k) || recKey);
    box.appendChild(row);
  }
}
async function toggleRec(k) {
  audioInit();
  if (recKey === k) { clearTimeout(recTimer); const b = await stopRecording(); recKey = null; if (b) { await saveRec(k, b); playRec(k); } else $('vMsg').textContent = 'Nothing was recorded. Try again, a little closer to the iPad.'; drawVoice(); return; }
  if (recKey || recording()) return;
  stopRec(); if (window.speechSynthesis) speechSynthesis.cancel();
  try { await startRecording(); } catch (e) { $('vMsg').textContent = 'The microphone is not available. Allow it for this site in Settings → Safari → Microphone (or the address-bar ⓘ), then try again.'; return; }
  recKey = k; $('vMsg').textContent = 'Recording… say the line, then tap ■ Stop (stops by itself after 8 seconds).'; drawVoice();
  recTimer = setTimeout(() => { if (recKey === k) toggleRec(k); }, 8000);
}
$('pRecord').addEventListener('click', e => { e.preventDefault(); $('vMsg').textContent = ''; openVoice(); });
$('vDone').addEventListener('click', async e => { e.preventDefault(); if (recKey) { clearTimeout(recTimer); const b = await stopRecording(); if (b) await saveRec(recKey, b); recKey = null; } openParent(); });
loadRecordings().then(() => { if (G.state === 'voice') drawVoice(); });

/* ================= orientation, visibility, boot ================= */
function checkOrient() { const portraitMode = H > W * 1.05; $('rotate').classList.toggle('on', portraitMode); if (portraitMode) pauseGame(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); musicStop(); ambOff(); } else if (AC && AC.state !== 'running') AC.resume().catch(() => {}); });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // when a new version has been cached, reload once so the update shows straight away (not on the next open)
  const hadSW = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadSW && !reloaded && ['title', 'courses', 'rest', 'boot'].includes(G.state)) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

(async function boot() {
  resize();
  await loadPack(p => { $('loadBar').style.width = Math.round(p * 100) + '%'; });
  toTitle(); $('loading').classList.remove('on');
  requestAnimationFrame(loop);
})();

// test hooks for the grown-up/dev console (no effect on play)
window.__dino = { setWeapon, WEAPONS, step(n, dt = 1 / 60) { for (let i = 0; i < n; i++) update(dt); renderer.render(scene, camera); drawHUD(); }, G, S, world, camera, spawnDino, spawnBoss, fire, toScreen, SPECIES, startLevel, beginPlay, mkDino, LEVELS, renderer };
