// Dino Ranger v3 — game flow, jeep ride, dinosaur AI, aiming/raycast hits, HUD, menus, Field Guide.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, rnd, pick, weighted, ease } from './util.js';
import { World } from './world.js';
import { Dino, SPECIES, loadPack, PACK } from './dinos.js';
import { Cockpit, makeDart } from './rifle.js';
import { FX } from './fx.js';
import { audioBind, audioInit, sfx, cry, say, musicStart, musicStop, audioTick, ambOff, AC } from './audio.js';

export const VERSION = '3.1.0';

/* ================= settings (this device only) ================= */
const SKEY = 'dinoRanger.v1';
const DEF = { sound: true, music: true, voice: true, diff: 'easy', intensity: 'action', blood: true, ridesPerDay: 2, name: '', today: '', rides: 0, seen: {}, totalStars: 0 };
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
    boss: 'bigTrike', bossSize: 1.9, bossHp: [8, 12], bossRoll: 0, bossSay: 'Whoa! A giant Triceratops! Keep firing!', kinds: { raptor: 3, trike: 1.2 }, root: 45, herd: true },
  { name: 'River Gorge', emoji: '🏞️', say: 'River Gorge! Watch the sky for Pteranodons!',
    boss: 'spino', bossSize: 1, bossHp: [10, 14], bossRoll: 0, bossSay: 'A huge Spinosaurus by the river! Fire, fire, fire!', kinds: { raptor: 2, ptera: 2, stego: 1.2 }, root: 43 },
  { name: 'Volcano Ridge', emoji: '🌋', say: 'Volcano Ridge. Last mission, ranger! Stay sharp!',
    boss: 'rex', bossSize: 1, bossHp: [12, 16], bossRoll: 1.8, bossSay: "It's the T. rex! Fire the darts!", kinds: { raptor: 3, ptera: 1, stego: 1, trike: 1 }, root: 40 },
];
const GUIDE = ['raptor', 'trike', 'stego', 'ptera', 'spino', 'rex'];
const RIDE = 4.4;
audioBind(S, ACT, () => (LEVELS[G ? G.level : 0] || LEVELS[0]).root);

/* ================= renderer, camera, world ================= */
const $ = id => document.getElementById(id);
const cv = $('cv'), hud = $('hud'), hx = hud.getContext('2d');
const isTouch = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
let PR = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 1.75);
const world = new World(renderer); world.setShadowSize(isTouch ? 1024 : 2048);
const scene = world.scene;
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1400); scene.add(camera);
const cockpit = new Cockpit(camera);
const fx = new FX(scene);
let W = 0, H = 0;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setPixelRatio(PR); renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.fov = W / H < 1.3 ? 66 : 60; camera.updateProjectionMatrix();
  const dpr = Math.min(window.devicePixelRatio || 1, 2); hud.width = Math.round(W * dpr); hud.height = Math.round(H * dpr); hx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fx.setScale(H * PR); checkOrient();
}

/* ================= state ================= */
const G = { state: 'boot', level: 0, s: 0, v: 0, vT: 0, t: 0, dinos: [], bg: [], boss: null, darts: [], stuck: [], spawnT: 1, score: 0, levelScore: 0,
  phase: 'ride', shake: 0, flash: 0, red: 0, introT: 0, doneT: 0, pointers: new Map(), hudBump: 0, aim: { x: 0, y: 0 }, birdT: 2, stars: [], pops: [],
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
  d.hitMeshes = []; d.root.traverse(o => { if (o.isMesh) { o.userData.dino = d; if (!o.userData.part) o.userData.part = 'body'; d.hitMeshes.push(o); } });
}
function mkDino(kind, size = 1, variant = 0) { const d = new Dino(kind, { size, variant }); if (!d.gl) optimise(d); scene.add(d.root); return d; }
function removeDino(d) { scene.remove(d.root); d.dispose(); }
function groundAt(p) { return world.height(p.x, p.z); }
function speciesHp(kind) { const sp = SPECIES[kind]; let hp = sp.hp; if (S.diff === 'easy') hp = Math.min(hp, 2); return hp; }

function spawnDino() {
  const lv = L(), kind = weighted(lv.kinds), sp = SPECIES[kind];
  const pairs = kind === 'raptor' && Math.random() < 0.4 ? 2 : 1;
  let side = Math.random() < 0.5 ? -1 : 1; if (world.env.river && sp.type !== 'flyer') side = 1;
  const roleR = Math.random(), role = sp.type === 'flyer' ? 'swoop' : (kind === 'stego' ? (roleR < 0.25 ? 'charge' : 'cross') : kind === 'raptor' ? (roleR < 0.6 ? 'charge' : 'cross') : (roleR < 0.5 ? 'charge' : 'cross'));
  const ahead = rnd(36, 52);
  for (let i = 0; i < pairs; i++) {
    const d = mkDino(kind, kind === 'raptor' ? rnd(1.3, 1.6) : rnd(0.9, 1.15), Math.random() < 0.5 ? 0 : 1);
    const s = G.s + ahead + i * 3, base = world.posAt(s), F = world.dirAt(s), R = tmp.crossVectors(F, UP).normalize();
    const lat = side * (sp.type === 'flyer' ? rnd(-10, 10) : rnd(9, 24)) + i * side * 2;
    d.pos.copy(base).addScaledVector(R, lat); d.pos.y = groundAt(d.pos);
    // every individual moves at its own pace: sprinters and plodders
    d.vmax = rnd(sp.speed[0], sp.speed[1]) * D().speedMul; d.gait = d.vmax > (sp.type === 'thero' ? 3.4 : 3.0) ? 'run' : 'walk';
    d.mode = role; d.hp = speciesHp(kind); d.hpMax = d.hp; d.side = side; d.t = 0; d.stun = 0; d.cried = false; d.leapRoll = kind === 'raptor' && Math.random() < 0.5;
    if (role === 'cross') { const tgtS = s - rnd(4, 14), Rb = world.dirAt(tgtS).cross(UP).normalize(); d.goal = world.posAt(tgtS).addScaledVector(Rb, -side * (world.env.river ? 4.5 : rnd(10, 22))); }
    if (sp.type === 'flyer') { d.alt = rnd(9, 14); d.pos.y += d.alt; d.setAnim('fly'); d.lane = rnd(-3.5, 3.5); }
    else d.setAnim(d.gait);
    d.heading = Math.atan2(jeepPos.x - d.pos.x, jeepPos.z - d.pos.z);
    G.dinos.push(d);
  }
}
function spawnHerd() { // gentle background giants (not targets)
  for (const d of G.bg) removeDino(d); G.bg = [];
  if (!L().herd) return;
  for (const [s, lat, k] of [[70, -55, 1], [80, -68, 0.85], [150, 60, 1.05], [230, -62, 0.95], [238, -75, 0.8]]) {
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
function fire(x, y) {
  if (G.darts.length > 12) return;
  G.aim.x = x; G.aim.y = y;
  const h = pickHit(x, y), from = cockpit.muzzleWorld(new THREE.Vector3());
  const dart = makeDart(); scene.add(dart); dart.position.copy(from);
  let to, hit = null;
  if (h) { const d = h.object.userData.dino; hit = { d, obj: h.object, local: h.object.worldToLocal(h.point.clone()), head: d.isHead(h.object, h.point) }; to = h.point.clone(); }
  else { const m = missPoint(x, y); to = m.p; hit = { miss: true, ground: m.ground }; }
  const dist = from.distanceTo(to);
  G.darts.push({ m: dart, from, to, t: 0, dur: clamp(dist / 140, 0.05, 0.22), hit });
  aimDart(dart, from, to); sfx.dart(); cockpit.fire();
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
  const { hit } = dt;
  if (hit.miss) { sfx.miss(); if (hit.ground) fx.dust(dt.to, 4, 0.25, [0.55, 0.48, 0.36]); return; }
  const d = hit.d; if (!d || d.mode === 'dead' || !d.root.parent) { sfx.miss(); return; }
  const wp = hit.obj.localToWorld(hit.local.clone()), dir = tmp2.copy(dt.to).sub(dt.from).normalize();
  stickDart(d, hit.obj, hit.local, dir);
  const dmg = hit.head ? 2 : 1;
  sfx.thunk(hit.head);
  if (BLOOD()) fx.blood(wp, dir, (d.boss ? 1.6 : 1) * (hit.head ? 1.3 : 1) * Math.max(0.8, d.size), hit.head ? 30 : 20);
  else fx.puff(wp, 0.3);
  d.hitT = 0.35; d.stun = 0.7; d.flinchDir = Math.random() < 0.5 ? -1 : 1;
  if (hit.head) pop(wp, '★★');
  if (d.boss) { d.fed += dmg; star(wp, hit.head ? 2 : 1); if (d.fed >= d.hp) bossDone(); else cry(d.sp.cry, 0.4); return; }
  d.hp -= dmg;
  if (d.hp <= 0) killDino(d, wp, hit.head); else cry(d.sp.cry, 0.6);
}
function killDino(d, wp, head) {
  d.mode = 'dead'; d.setAnim('dead'); d.deadT = 0; d.speed = 0; cry(d.sp.cry, 0.9);
  if (!BLOOD()) setTimeout(() => sfx.sleepy(false), 500);
  star(wp, d.hpMax + (head ? 1 : 0)); meet(d.kind);
}
function meet(kind) { const k = SPECIES[kind].base || kind; S.seen[k] = (S.seen[k] || 0) + 1; save(); }

/* ================= AI ================= */
function turnTo(d, tx, tz, rate, dt) { const want = Math.atan2(tx - d.pos.x, tz - d.pos.z); let df = want - d.heading; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2; d.heading += clamp(df, -rate * dt, rate * dt); return Math.abs(df); }
function stepFwd(d, sp, dt) { d.speed = sp; d.pos.x += Math.sin(d.heading) * sp * dt; d.pos.z += Math.cos(d.heading) * sp * dt; }
function biteHit(d, big) {
  if (!ACT()) return;
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
  if (d.mode !== 'dead' && sp.type === 'quad' && dist < 22) { const stp = Math.floor(d.ph / Math.PI); if (stp !== d.lastStep) { d.lastStep = stp; sfx.step(clamp(0.9 / dist * d.size * 2, 0.02, 0.3)); } }
  d.pos.y = groundAt(d.pos);
}
function updFlyer(d, dt, dist, ahead) {
  const act = ACT();
  if (d.mode === 'dead') { d.vy = (d.vy || 0) - 9.8 * dt; d.pos.y += d.vy * dt; const gy = groundAt(d.pos); if (d.pos.y <= gy) { d.pos.y = gy; if (!d.thud) { d.thud = true; sfx.fall(false); fx.dust(d.pos, 10, 0.8); if (BLOOD()) fx.pool(d.pos.clone(), 0.8); } } if (ahead < -15) d.mode = 'gone'; return; }
  const gy = groundAt(d.pos);
  if (d.mode === 'swoop') {
    // dive along the road toward the jeep, then pass close overhead
    const tx = jeepPos.x + jeepR.x * d.lane, tz = jeepPos.z + jeepR.z * d.lane;
    turnTo(d, tx, tz, 1.4, dt); stepFwd(d, d.vmax * (d.stun > 0 ? 0.5 : 1), dt);
    const targetAlt = dist > 28 ? d.alt : (act ? lerp(3.2, d.alt, clamp((dist - 4) / 24, 0, 1)) : 7);
    d.pos.y += ((gy + targetAlt) - d.pos.y) * Math.min(1, dt * 1.5);
    d.bank = clamp((d.lastH != null ? (d.heading - d.lastH) / dt : 0) * -0.4, -0.6, 0.6); d.lastH = d.heading;
    d.setAnim(dist < 20 && dist > 6 ? 'glide' : 'fly');
    if (dist < 5) { d.mode = 'pass'; d.t = 0; cry('squawk'); if (act) { G.shake = Math.max(G.shake, 0.18); } }
  } else if (d.mode === 'pass') { stepFwd(d, d.vmax, dt); d.pos.y += dt * 4; d.setAnim('fly'); if (d.t > 5) d.mode = 'gone'; }
  if (ahead < -20 || dist > 110) d.mode = 'gone';
}

/* ================= boss ================= */
function spawnBoss() {
  const lv = L(), b = mkDino(lv.boss, lv.bossSize); b.boss = true; b.hp = lv.bossHp[D().hpIdx]; b.fed = 0; b.mode = 'walk'; b.sub = 'in'; b.subT = 0; b.fwd = 40; b.lat = 2.5;
  G.boss = b; G.vT = lv.bossRoll; G.phase = 'bossIn';
  for (const d of G.dinos) if (d.mode !== 'dead') { d.mode = 'leave'; d.t = 0; d.leaveSide = d.side || 1; }
  say(lv.bossSay);
}
function setSub(b, s) { b.sub = s; b.subT = 0; if (s === 'roar') { b.setAnim('roar'); cry(b.sp.cry); G.shake = Math.max(G.shake, ACT() ? 0.35 : 0.08); } }
function updBoss(b, dt) {
  b.subT += dt; const act = ACT();
  if (b.mode === 'walk') {
    switch (b.sub) {
      case 'in': b.fwd -= 7 * dt; b.setAnim('run'); b.speed = 7; if (b.fwd <= 15) { setSub(b, 'roar'); G.phase = 'boss'; } break;
      case 'roar': b.speed = 0; if (b.subT > 1.9) { setSub(b, 'stalk'); b.setAnim('walk'); } break;
      case 'stalk': { const want = act ? 11 : 14; b.fwd += (want - b.fwd) * dt * 0.6; b.lat = Math.sin(b.t * 0.55) * 3; b.speed = 2.2; b.setAnim('walk'); if (b.subT > (act ? 3.6 : 5.5)) setSub(b, act ? 'lunge' : 'roar'); break; }
      case 'lunge': b.fwd -= 9 * dt; b.lat += ((b.lat >= 0 ? 2.6 : -2.6) - b.lat) * dt * 2; b.speed = 8; b.setAnim('run'); if (b.fwd < 6.5 + b.size) { setSub(b, 'bite'); b.setAnim('attack'); } break;
      case 'bite': b.speed = 0; if (!b.bit && b.animT > 0.38) { b.bit = true; biteHit(b, true); cry(b.sp.cry, 0.5); } if (b.animT > 0.9) { b.bit = false; setSub(b, 'back'); } break;
      case 'back': b.fwd += 6 * dt; b.speed = 3; b.setAnim('walk'); if (b.fwd >= 13) setSub(b, 'roar'); break;
    }
    if (b.sub !== 'roar' && b.sub !== 'bite') { const stp = Math.floor(b.ph / Math.PI); if (stp !== b.lastStep) { b.lastStep = stp; sfx.step(clamp(2.6 / b.fwd, 0.08, 0.5)); if (b.fwd < 12) G.shake = Math.max(G.shake, 0.06); } }
  } else if (b.mode === 'dead') {
    b.deadT += dt;
    if (!b.thud && b.animT > 0.5) { b.thud = true; G.shake = 0.7; G.flash = 0.25; sfx.fall(true); fx.dust(b.pos.clone().setY(b.pos.y + 0.3), 26, 2.2); if (BLOOD()) fx.pool(b.pos.clone(), 3.2); }
    if (!BLOOD() && b.deadT > 1.3 && (b.zT = (b.zT || 0) - dt) <= 0) { b.zT = 1.1; fx.zzz(b.bodyWorld(tmp2).add(tmp.set(0, 1.4, 0)), 1.6); }
    b.fwd -= G.v * dt;
  }
  b.pos.copy(jeepPos).addScaledVector(jeepF, b.fwd).addScaledVector(jeepR, b.lat); b.pos.y = groundAt(b.pos);
  if (b.mode !== 'dead') b.heading = Math.atan2(jeepPos.x - b.pos.x, jeepPos.z - b.pos.z) + (b.sub === 'stalk' ? Math.cos(b.t * 0.55) * 0.55 : b.sub === 'roar' ? 0.6 * (b.lat >= 0 ? 1 : -1) : 0);
}
function bossDone() {
  const b = G.boss; b.mode = 'dead'; b.setAnim('dead'); b.deadT = 0; G.phase = 'done'; G.doneT = 0; G.vT = 0;
  cry(b.sp.cry, 1); if (!BLOOD()) setTimeout(() => sfx.sleepy(true), 600); setTimeout(() => sfx.fanfare(), 1700);
  star(b.bodyWorld(new THREE.Vector3()), 5); meet(b.kind);
  say((BLOOD() ? "It's down!" : "It's asleep!") + ' Great shot, ranger' + nameBit() + '!');
}
const nameBit = () => (S.name ? ', ' + S.name : '');

/* ================= stars & popups (HUD space) ================= */
function toScreen(p) { const v = p.clone().project(camera); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, ok: v.z < 1 }; }
function star(wp, n) { const s = toScreen(wp); for (let i = 0; i < n; i++) G.stars.push({ sx: s.x + rnd(-20, 20), sy: s.y + rnd(-20, 20), t: 0, dur: 0.7 + i * 0.09 }); }
function pop(wp, text) { const s = toScreen(wp); G.pops.push({ x: s.x, y: s.y - 30, t: 0, text }); }

/* ================= flow ================= */
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); $('bPause').classList.toggle('on', id === null && G.state === 'play'); }
function dots(el, cur) { el.innerHTML = ''; for (let i = 0; i < LEVELS.length; i++) { const d = document.createElement('i'); if (i < cur) d.className = 'done'; else if (i === cur) d.className = 'now'; el.appendChild(d); } }
function clearLevel() {
  for (const d of G.dinos) removeDino(d); G.dinos = []; if (G.boss) { removeDino(G.boss); G.boss = null; }
  for (const dt of G.darts) scene.remove(dt.m); G.darts = []; fx.clear(); G.stars = []; G.pops = [];
}
function buildLevel(i) { G.level = i; clearLevel(); world.build(i); spawnHerd(); G.s = 0; G.v = 0; G.vT = 0; placeJeep(0); }
function toTitle() {
  G.state = 'title'; musicStop(); buildLevel(0); G.s = 4; G.vT = 0.8; G.aim = { x: W / 2, y: H * 0.45 };
  for (const [k, sOff, lat] of [['raptor', 13, -4.5], ['trike', 19, 6], ['raptor', 15, -6.5], ['stego', 30, -9]]) { const d = mkDino(k); const b = world.posAt(G.s + sOff), R = world.dirAt(G.s + sOff).cross(UP).normalize(); d.pos.copy(b).addScaledVector(R, lat); d.pos.y = groundAt(d.pos); d.heading = Math.atan2(-R.x * Math.sign(lat), -R.z * Math.sign(lat)) + 0.6; d.mode = 'idle'; d.setAnim('idle'); G.dinos.push(d); }
  show('title');
}
function startRide() {
  const lim = +S.ridesPerDay;
  if (lim > 0 && ridesToday() >= lim) { G.state = 'rest'; show('rest'); say("The dinosaurs are sleeping. Let's go on a new mission tomorrow" + nameBit() + '!'); return; }
  ridesToday(); S.rides++; save(); G.score = 0; startLevel(0);
}
function startLevel(i) {
  const lv = LEVELS[i];
  $('iEmoji').textContent = lv.emoji; $('iName').textContent = lv.name; dots($('iDots'), i);
  G.state = 'intro'; show('intro'); say(lv.say);
  setTimeout(() => { // build after the card is painted
    buildLevel(i); G.pointers.clear(); G.phase = 'ride'; G.spawnT = 2.5; G.levelScore = 0; G.aim = { x: W / 2, y: H * 0.45 }; G.introT = 2.4;
  }, 60);
}
function beginPlay() { G.state = 'play'; G.vT = RIDE; show(null); musicStart(); }
function levelClear() {
  S.totalStars += G.levelScore; save(); musicStop();
  if (G.level >= LEVELS.length - 1) { G.state = 'end'; $('eStars').textContent = G.score; show('end'); setTimeout(() => say((BLOOD() ? 'Mission complete! You stopped every dinosaur. Great job, ranger' : 'Mission complete! All the dinosaurs are safe and sleeping. Great job, ranger') + nameBit() + '!'), 400); return; }
  G.state = 'clear'; $('cStars').textContent = G.levelScore; dots($('cDots'), G.level + 1); show('clear');
}
function pauseGame() { if (G.state !== 'play') return; G.state = 'paused'; G.pointers.clear(); musicStop(); show('pause'); }
function resumeGame() { G.state = 'play'; show(null); musicStart(); }

/* ================= jeep + camera ================= */
function placeJeep(dt) {
  world.posAt(G.s, jeepPos); world.dirAt(G.s, jeepF); jeepR.crossVectors(jeepF, UP).normalize();
  const k = clamp(G.v / RIDE, 0, 1), t = G.t;
  // bump spring
  G.bumpV.addScaledVector(G.bump, -40 * dt); G.bumpV.multiplyScalar(Math.max(0, 1 - 7 * dt)); G.bump.addScaledVector(G.bumpV, dt);
  const eye = tmp.copy(jeepPos).addScaledVector(UP, 1.85 + Math.sin(t * 9) * 0.012 * k + Math.sin(t * 3.7) * 0.02 * k).add(G.bump);
  camera.position.copy(eye);
  const look = world.posAt(G.s + 12, tmp2); look.y += 1.25; look.addScaledVector(jeepR, Math.sin(t * 0.37) * 0.25);
  camera.lookAt(look);
  camera.rotateZ(clamp(-world.curvature(G.s + 6) * 9, -0.07, 0.07) + Math.sin(t * 1.9) * 0.006 * k + G.bump.x * 0.05);
  if (G.shake > 0) { const s = G.shake * G.shake; camera.position.x += rnd(-1, 1) * s * 0.18; camera.position.y += rnd(-1, 1) * s * 0.14; camera.rotateX(rnd(-1, 1) * s * 0.05); camera.rotateZ(rnd(-1, 1) * s * 0.05); }
}

/* ================= update ================= */
let engT = 0;
function update(dt) {
  G.t += dt;
  const live = ['title', 'intro', 'play', 'clear', 'end', 'rest'].includes(G.state);
  if (AC && (engT -= dt) <= 0) { engT = 0.1; audioTick(S.sound && live && !['title', 'end', 'rest'].includes(G.state), G.v / RIDE, S.sound && live); }
  if (!live && G.state !== 'guide' && G.state !== 'parent') return;
  if (!live) { world.update(dt, camera); return; }
  if ((G.birdT -= dt) <= 0) { G.birdT = rnd(2, 5); if (G.level !== 2) sfx.bird(); }
  G.v += (G.vT - G.v) * Math.min(1, dt * 1.4); G.s += G.v * dt;
  if (G.state === 'title' && G.s > 30) G.s = 4;
  placeJeep(dt);
  if (G.state === 'intro') { G.introT -= dt; if (G.introT <= 0) beginPlay(); }
  if (G.state === 'play') {
    const env = world.env;
    if (G.phase === 'ride') {
      G.spawnT -= dt;
      const active = G.dinos.filter(d => d.mode !== 'dead' && d.mode !== 'leave').length;
      if (G.spawnT <= 0 && G.s < env.len - 30) { if (active < D().max) spawnDino(); G.spawnT = D().interval * rnd(0.7, 1.3); }
      if (G.s >= env.len) spawnBoss();
    }
    for (const p of G.pointers.values()) { p.hold += dt; if (p.hold >= 0.3) { p.hold = 0; fire(p.x, p.y); } }
    if (G.phase === 'done') { G.doneT += dt; if (G.doneT > 4.5) levelClear(); }
  }
  for (const d of G.dinos) { if (d.mode !== 'idle') updDino(d, dt); else d.pos.y = groundAt(d.pos); d.update(dt); }
  G.dinos = G.dinos.filter(d => { if (d.mode === 'gone') { removeDino(d); return false; } return true; });
  for (const d of G.bg) { d.pos.x += Math.sin(d.heading) * d.speed * dt; d.pos.z += Math.cos(d.heading) * d.speed * dt; d.pos.y = groundAt(d.pos); d.update(dt); }
  if (G.boss) { G.boss.t += 0; updBoss(G.boss, dt); G.boss.update(dt); }
  // darts in flight
  for (const dt2 of G.darts) { dt2.t += dt; const u = clamp(dt2.t / dt2.dur, 0, 1); if (dt2.hit.d && dt2.hit.obj) dt2.to = dt2.hit.obj.localToWorld(dt2.hit.local.clone()); dt2.m.position.lerpVectors(dt2.from, dt2.to, u); aimDart(dt2.m, dt2.from, dt2.to); if (u >= 1) { dt2.done = true; scene.remove(dt2.m); dartArrive(dt2); } }
  G.darts = G.darts.filter(d => !d.done);
  // aim the rifle at the finger (or the last tap)
  ndc.set(G.aim.x / W * 2 - 1, -(G.aim.y / H) * 2 + 1); ray.setFromCamera(ndc, camera);
  const dc = ray.ray.direction.clone().applyQuaternion(camera.quaternion.clone().invert());
  cockpit.aimAt(dc, dt); cockpit.update(dt);
  fx.update(dt); world.update(dt, camera);
  for (const s of G.stars) { s.t += dt; if (s.t >= s.dur && !s.done) { s.done = true; G.score++; G.levelScore++; G.hudBump = 1; sfx.ding(); } }
  G.stars = G.stars.filter(s => !s.done); for (const p of G.pops) p.t += dt; G.pops = G.pops.filter(p => p.t < 0.9);
  G.shake = Math.max(0, G.shake - dt); G.flash = Math.max(0, G.flash - dt * 2); G.red = Math.max(0, G.red - dt * 1.5); G.hudBump = Math.max(0, G.hudBump - dt * 3);
}

/* ================= HUD (2D overlay) ================= */
function rr(x, y, w, h, r) { hx.beginPath(); hx.moveTo(x + r, y); hx.arcTo(x + w, y, x + w, y + h, r); hx.arcTo(x + w, y + h, x, y + h, r); hx.arcTo(x, y + h, x, y, r); hx.arcTo(x, y, x + w, y, r); hx.closePath(); }
function starShape(x, y, r, fill, stroke) { hx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.48 : r; hx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } hx.closePath(); hx.fillStyle = fill; hx.fill(); if (stroke) { hx.strokeStyle = stroke; hx.lineWidth = Math.max(2, r * 0.14); hx.lineJoin = 'round'; hx.stroke(); } }
function drawHUD() {
  hx.clearRect(0, 0, W, H);
  if (G.red > 0) { hx.fillStyle = 'rgba(150,10,10,' + (G.red * 0.35) + ')'; hx.fillRect(0, 0, W, H); }
  if (G.flash > 0) { hx.fillStyle = 'rgba(255,255,240,' + (G.flash * 0.45) + ')'; hx.fillRect(0, 0, W, H); }
  const vg = hx.createRadialGradient(W / 2, H * 0.45, H * 0.5, W / 2, H * 0.45, H * 1.0); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.3)'); hx.fillStyle = vg; hx.fillRect(0, 0, W, H);
  for (const p of G.pointers.values()) {
    hx.lineWidth = 4; hx.strokeStyle = 'rgba(255,255,255,0.95)'; hx.beginPath(); hx.arc(p.x, p.y, 30, 0, 7); hx.stroke();
    hx.strokeStyle = 'rgba(120,230,120,0.95)'; hx.lineWidth = 3; hx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { hx.moveTo(p.x + dx * 18, p.y + dy * 18); hx.lineTo(p.x + dx * 40, p.y + dy * 40); } hx.stroke();
    hx.fillStyle = 'rgba(255,80,60,0.95)'; hx.beginPath(); hx.arc(p.x, p.y, 3.5, 0, 7); hx.fill();
  }
  for (const p of G.pops) { const a = clamp(1 - p.t / 0.9, 0, 1); hx.globalAlpha = a; hx.font = '900 34px system-ui, sans-serif'; hx.textAlign = 'center'; hx.lineWidth = 6; hx.strokeStyle = '#2E2A1E'; hx.strokeText(p.text, p.x, p.y - p.t * 50); hx.fillStyle = '#F2C14E'; hx.fillText(p.text, p.x, p.y - p.t * 50); hx.globalAlpha = 1; hx.textAlign = 'start'; }
  for (const s of G.stars) { const u = clamp(s.t / s.dur, 0, 1), e = u * u * (3 - 2 * u), tx = 60, ty = 52, cx = (s.sx + tx) / 2, cy = Math.min(s.sy, ty) - 120;
    starShape((1 - e) * (1 - e) * s.sx + 2 * (1 - e) * e * cx + e * e * tx, (1 - e) * (1 - e) * s.sy + 2 * (1 - e) * e * cy + e * e * ty, 22 - u * 6, '#F2C14E', '#2E2A1E'); }
  if (!['play', 'paused', 'clear', 'intro'].includes(G.state)) return;
  hx.fillStyle = 'rgba(243,235,211,0.92)'; rr(14, 14, 176, 78, 18); hx.fill(); hx.lineWidth = 4; hx.strokeStyle = '#2E2A1E'; hx.stroke();
  hx.save(); hx.translate(60, 53); const bb = 1 + G.hudBump * 0.35; hx.scale(bb, bb); starShape(0, 0, 26, '#F2C14E', '#2E2A1E'); hx.restore();
  hx.fillStyle = '#2E2A1E'; hx.font = '900 44px system-ui, sans-serif'; hx.textBaseline = 'middle'; hx.fillText(String(G.score), 98, 55);
  const cx = W / 2, y = 52;
  if (G.phase === 'ride' && world.env) {
    const w = Math.min(420, W * 0.36), u = clamp(G.s / world.env.len, 0, 1);
    hx.fillStyle = 'rgba(243,235,211,0.85)'; rr(cx - w / 2 - 12, y - 17, w + 24, 34, 10); hx.fill(); hx.lineWidth = 3; hx.strokeStyle = '#2E2A1E'; hx.stroke();
    hx.fillStyle = '#E8873A'; rr(cx - w / 2 - 5, y - 10, (w + 10) * u + 4, 20, 6); hx.fill();
    hx.fillStyle = '#F3EBD3'; hx.beginPath(); hx.arc(cx + w / 2 + 18, y, 28, 0, 7); hx.fill(); hx.stroke();
    hx.font = '32px system-ui, sans-serif'; hx.textAlign = 'center'; hx.fillText(L().boss === 'rex' || L().boss === 'spino' ? '🦖' : '🦕', cx + w / 2 + 18, y + 2); hx.textAlign = 'start';
    hx.fillStyle = '#4E5B30'; hx.strokeStyle = '#2E2A1E'; hx.lineWidth = 3; rr(cx - w / 2 + w * u - 16, y - 11, 32, 22, 6); hx.fill(); hx.stroke();
  } else if (G.boss) {
    const w = Math.min(460, W * 0.4), u = clamp(G.boss.fed / G.boss.hp, 0, 1);
    hx.fillStyle = 'rgba(243,235,211,0.9)'; rr(cx - w / 2 - 12, y - 20, w + 24, 40, 12); hx.fill(); hx.lineWidth = 3; hx.strokeStyle = '#2E2A1E'; hx.stroke();
    const bg = hx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); bg.addColorStop(0, '#7FD0FF'); bg.addColorStop(1, '#3A6FD6'); hx.fillStyle = bg; rr(cx - w / 2 - 4, y - 12, (w + 8) * u + 4, 24, 8); hx.fill();
    hx.font = '900 30px system-ui, sans-serif'; hx.fillStyle = '#2E2A1E'; hx.fillText('💤', cx + w / 2 + 20, y + 2);
  }
}

/* ================= loop & adaptive quality ================= */
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.hold) update(dt);
  if (G.state !== 'guide') renderer.render(scene, camera);
  drawHUD();
  // keep ~60 fps on the iPad: drop resolution step by step if frames are slow
  G.fpsT += dt; G.fpsN++;
  if (G.fpsT > 2) { G.fps = G.fpsN / G.fpsT; G.fpsT = 0; G.fpsN = 0; if (G.state === 'play' && G.fps < 48 && PR > 0.85) { PR = Math.max(0.85, PR - 0.2); resize(); } }
  requestAnimationFrame(loop);
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
document.addEventListener('touchmove', e => { if (!e.target.closest('#guide, #parent .card')) e.preventDefault(); }, { passive: false });
function tapBtn(id, fn) { $(id).addEventListener('click', e => { e.preventDefault(); audioInit(); sfx.ui(); fn(); }); }
tapBtn('bPlay', startRide); tapBtn('bPause', pauseGame); tapBtn('bResume', resumeGame);
tapBtn('bNext', () => startLevel(G.level + 1));
tapBtn('bHome1', toTitle); tapBtn('bHome2', toTitle); tapBtn('bHome3', toTitle);
tapBtn('bGuide', openGuide);
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
function openParent() {
  G.state = 'parent';
  $('pInt').value = S.intensity; $('pBlood').checked = S.blood !== false; $('pDiff').value = S.diff; $('pSound').checked = S.sound; $('pMusic').checked = S.music; $('pVoice').checked = S.voice; $('pRides').value = String(S.ridesPerDay); $('pName').value = S.name;
  const lim = +S.ridesPerDay;
  $('pStat').textContent = 'Missions today: ' + ridesToday() + (lim ? ' of ' + lim : '') + ' · Stars so far: ' + S.totalStars + ' · Species found: ' + GUIDE.filter(k => S.seen[k]).length + ' of ' + GUIDE.length;
  $('pVer').textContent = 'Dino Ranger: Jungle Run v' + VERSION + ' · 3D' + (Object.keys(PACK).length ? ' · models: ' + Object.keys(PACK).join(', ') : ' · built-in models') + ' · ' + Math.round(G.fps) + ' fps';
  show('parent');
}
$('pReset').addEventListener('click', () => { S.rides = 0; S.today = todayStr(); save(); openParent(); });
$('pDone').addEventListener('click', () => {
  S.intensity = $('pInt').value; S.blood = $('pBlood').checked; S.diff = $('pDiff').value; S.sound = $('pSound').checked; S.music = $('pMusic').checked; S.voice = $('pVoice').checked; S.ridesPerDay = +$('pRides').value; S.name = $('pName').value.trim().slice(0, 20);
  save(); G.state = 'title'; show('title');
});

/* ================= orientation, visibility, boot ================= */
function checkOrient() { const portraitMode = H > W * 1.05; $('rotate').classList.toggle('on', portraitMode); if (portraitMode) pauseGame(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); musicStop(); ambOff(); } else if (AC && AC.state !== 'running') AC.resume().catch(() => {}); });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

(async function boot() {
  resize();
  await loadPack(p => { $('loadBar').style.width = Math.round(p * 100) + '%'; });
  toTitle(); $('loading').classList.remove('on');
  requestAnimationFrame(loop);
})();

// test hooks for the grown-up/dev console (no effect on play)
window.__dino = { step(n, dt = 1 / 60) { for (let i = 0; i < n; i++) update(dt); renderer.render(scene, camera); drawHUD(); }, G, S, world, camera, spawnDino, spawnBoss, fire, toScreen, SPECIES, startLevel, beginPlay, mkDino, LEVELS, renderer };
