// "Ranger Two": a second jeep with two rangers driving ahead on the same track.
// The standing ranger turns and fires darts at nearby dinosaurs; some raptors attack this jeep instead of the player.
import * as THREE from 'three';
import { clamp, lerp, rnd, radialTex } from './util.js';
import { makeDart } from './rifle.js';

const UP = new THREE.Vector3(0, 1, 0);

function ranger(shirt, standing) {
  const khaki = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x5a5236, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89a78, roughness: 0.7 });
  const hatM = new THREE.MeshStandardMaterial({ color: 0xb9a070, roughness: 0.85 });
  const g = new THREE.Group(), add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  if (standing) { add(new THREE.CylinderGeometry(0.09, 0.08, 0.8, 8), pants, -0.1, 0.4, 0); add(new THREE.CylinderGeometry(0.09, 0.08, 0.8, 8), pants, 0.1, 0.4, 0); }
  else { const l1 = add(new THREE.CylinderGeometry(0.09, 0.08, 0.5, 8), pants, -0.1, 0.12, -0.2); l1.rotation.x = Math.PI / 2; const l2 = add(new THREE.CylinderGeometry(0.09, 0.08, 0.5, 8), pants, 0.1, 0.12, -0.2); l2.rotation.x = Math.PI / 2; }
  const torso = new THREE.Group(); torso.position.y = standing ? 0.8 : 0.1; g.add(torso);
  add(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), khaki, 0, 0.35, 0, torso);
  add(new THREE.SphereGeometry(0.13, 14, 10), skin, 0, 0.82, 0, torso);
  add(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 16), hatM, 0, 0.92, 0, torso);
  add(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 14), hatM, 0, 0.99, 0, torso);
  // arms holding a rifle (standing) or a wheel (driver)
  for (const s of [-1, 1]) { const a = add(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8), khaki, s * 0.22, 0.45, -0.18, torso); a.rotation.x = Math.PI / 2 - 0.3; }
  if (standing) {
    const rm = new THREE.MeshStandardMaterial({ color: 0x2a2d30, metalness: 0.7, roughness: 0.4 }), wood = new THREE.MeshStandardMaterial({ color: 0x7a4e2a, roughness: 0.6 });
    const gun = new THREE.Group(); gun.position.set(0.05, 0.55, -0.25); torso.add(gun);
    add(new THREE.BoxGeometry(0.06, 0.08, 0.35), wood, 0, 0, 0.1, gun);
    const b = add(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 8), rm, 0, 0.02, -0.35, gun); b.rotation.x = Math.PI / 2;
    const mz = new THREE.Object3D(); mz.position.set(0, 0.02, -0.68); gun.add(mz);
    g.userData.muzzle = mz;
  }
  g.userData.torso = torso;
  return g;
}

export function jeepModel() {
  const olive = new THREE.MeshStandardMaterial({ color: 0x5f6b3c, roughness: 0.55, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x232622, roughness: 0.6, metalness: 0.3 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.95 });
  const hub = new THREE.MeshStandardMaterial({ color: 0x8a8f86, roughness: 0.4, metalness: 0.6 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0x665a30, roughness: 0.2 });
  const g = new THREE.Group(), add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(1.7, 0.55, 3.7), olive, 0, 0.85, 0);                     // tub
  add(new THREE.BoxGeometry(1.55, 0.35, 1.3), olive, 0, 1.25, -1.15);                // hood
  add(new THREE.BoxGeometry(1.75, 0.1, 3.75), dark, 0, 0.58, 0);                     // skirt
  for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.3, 0.12, 1.0), olive, s * 0.95, 1.13, -1.25); add(new THREE.BoxGeometry(0.3, 0.12, 1.0), olive, s * 0.95, 1.13, 1.2); }   // fenders
  for (const s of [-1, 1]) { add(new THREE.CircleGeometry(0.11, 14), lamp, s * 0.55, 1.22, -1.81).rotation.y = Math.PI; }
  add(new THREE.BoxGeometry(1.6, 0.06, 0.06), dark, 0, 1.95, -0.45);                 // windshield top
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.6, 0.06), dark, s * 0.78, 1.65, -0.45);
  // roll bar
  const rb = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.8, 1.1, 0.6), new THREE.Vector3(-0.8, 2.05, 0.6), new THREE.Vector3(0.8, 2.05, 0.6), new THREE.Vector3(0.8, 1.1, 0.6)], false, 'catmullrom', 0.01), 20, 0.045, 8);
  add(rb, dark, 0, 0, 0);
  add(new THREE.BoxGeometry(1.3, 0.12, 0.5), seat, 0, 1.15, -0.05); add(new THREE.BoxGeometry(1.3, 0.5, 0.1), seat, 0, 1.4, 0.2);
  // wheels
  const wheels = [];
  for (const [x, z] of [[-0.88, -1.25], [0.88, -1.25], [-0.88, 1.2], [0.88, 1.2]]) {
    const w = new THREE.Group(); w.position.set(x, 0.42, z); g.add(w);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 18), tire); t.rotation.z = Math.PI / 2; t.castShadow = true; w.add(t);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 10), hub); h.rotation.z = Math.PI / 2; w.add(h);
    wheels.push(w);
  }
  const sp = add(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 18), tire, 0, 1.15, 1.95); sp.rotation.x = Math.PI / 2;
  g.userData.wheels = wheels;
  return g;
}

export class Convoy {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group(); scene.add(this.root);
    this.body = new THREE.Group(); this.root.add(this.body);
    this.jeep = jeepModel(); this.body.add(this.jeep);
    this.driver = ranger(0xa8956a, false); this.driver.position.set(-0.35, 1.15, -0.05); this.body.add(this.driver);
    this.gunner = ranger(0x9a8a5e, true); this.gunner.position.set(0.3, 0.95, 1.0); this.body.add(this.gunner);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, 'rgba(255,255,235,1)'], [0.3, 'rgba(255,200,110,0.9)'], [1, 'rgba(255,140,40,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.flash.scale.set(0.6, 0.6, 1); this.gunner.userData.muzzle.add(this.flash);
    this.s = 20; this.lat = 0; this.v = 0; this.t = 0; this.cool = 1.5; this.shots = []; this.bump = 0; this.flashT = 0; this.sayT = 12;
    this.pos = new THREE.Vector3(); this.fwd = new THREE.Vector3(); this.right = new THREE.Vector3();
  }
  reset(s) { this.s = s + 22; this.lat = 0; this.v = 0; for (const sh of this.shots) this.scene.remove(sh.m); this.shots = []; this.cool = 2; this.root.visible = true; }
  hitBy() { this.bump = 1; }
  update(dt, c) {
    const { world } = c; this.t += dt; if (!world.env) return;
    // drive: keep ~22 m ahead on the road; at a boss pull over to the right edge
    const boss = c.phase !== 'ride';
    const wantGap = boss ? 7 : 22 + Math.sin(this.t * 0.21) * 4, gap = this.s - c.s;
    const wantV = boss ? 0 : c.v + clamp((wantGap - gap) * 0.5, -2, 2);
    this.v += (wantV - this.v) * Math.min(1, dt * 1.2); this.s += this.v * dt;
    const wantLat = boss ? 4.6 : Math.sin(this.t * 0.37) * 0.7;
    this.lat += (wantLat - this.lat) * Math.min(1, dt * 0.8);
    world.posAt(this.s, this.pos); world.dirAt(this.s, this.fwd); this.right.crossVectors(this.fwd, UP).normalize();
    this.pos.addScaledVector(this.right, this.lat);
    const yF = world.ground(this.pos.x + this.fwd.x * 1.6, this.pos.z + this.fwd.z * 1.6), yB = world.ground(this.pos.x - this.fwd.x * 1.6, this.pos.z - this.fwd.z * 1.6);
    this.root.position.set(this.pos.x, (yF + yB) / 2, this.pos.z);
    this.root.rotation.set(0, Math.atan2(-this.fwd.x, -this.fwd.z), 0);
    this.bump = Math.max(0, this.bump - dt * 2.5);
    this.body.rotation.set(Math.atan2(yF - yB, 3.2) + Math.sin(this.t * 9) * 0.006 * Math.min(1, this.v / 4), 0, Math.sin(this.t * 31) * 0.08 * this.bump + Math.sin(this.t * 2.3) * 0.01);
    this.body.position.y = Math.abs(Math.sin(this.t * 7)) * 0.03 * Math.min(1, this.v / 4) + this.bump * 0.15;
    for (const w of this.jeep.userData.wheels) w.rotation.x -= this.v * dt / 0.42;
    // gunner: pick the nearest live dinosaur in range, turn, fire
    const mz = this.gunner.userData.muzzle, torso = this.gunner.userData.torso;
    let tgt = null, best = 32;
    for (const d of c.targets) { if (d.mode === 'dead') continue; const dd = d.pos.distanceTo(this.root.position) - (d.attackingConvoy ? 20 : 0); if (dd < best) { best = dd; tgt = d; } }
    if (tgt) {
      const local = this.body.worldToLocal(tgt.bodyWorld(new THREE.Vector3())), yaw = Math.atan2(-(local.x - 0.3), -(local.z - 1.0));
      torso.rotation.y += (clamp(yaw, -2.6, 2.6) - torso.rotation.y) * Math.min(1, dt * 6);
      if ((this.cool -= dt) <= 0 && c.state === 'play') { this.cool = rnd(0.9, 1.6); this.fire(tgt, c); }
    } else torso.rotation.y *= 1 - Math.min(1, dt * 2);
    this.flashT = Math.max(0, this.flashT - dt); this.flash.material.opacity = this.flashT > 0 ? 1 : 0;
    // darts in flight
    for (const sh of this.shots) {
      sh.t += dt; const u = Math.min(1, sh.t / sh.dur); if (sh.d.root.parent) sh.to.copy(sh.d.bodyWorld(new THREE.Vector3()));
      sh.m.position.lerpVectors(sh.from, sh.to, u); sh.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), sh.to.clone().sub(sh.from).normalize());
      if (u >= 1) { sh.done = true; this.scene.remove(sh.m); if (sh.hit && sh.d.mode !== 'dead' && sh.d.root.parent) c.onHit(sh.d, sh.to.clone(), sh.to.clone().sub(sh.from).normalize()); }
    }
    this.shots = this.shots.filter(s => !s.done);
    // radio chatter
    if ((this.sayT -= dt) <= 0 && c.state === 'play') { this.sayT = rnd(16, 26); if (tgt && c.say) c.say(tgt); }
  }
  fire(d, c) {
    const mz = this.gunner.userData.muzzle; mz.updateWorldMatrix(true, false);
    const from = new THREE.Vector3().setFromMatrixPosition(mz.matrixWorld), to = d.bodyWorld(new THREE.Vector3());
    const hit = Math.random() < (d.attackingConvoy ? 0.8 : 0.55);
    if (!hit) to.add(new THREE.Vector3(rnd(-1.5, 1.5), rnd(0.5, 1.5), rnd(-1.5, 1.5)));
    const m = makeDart(); m.scale.setScalar(1.3); this.scene.add(m);
    this.shots.push({ m, from, to, d, hit, t: 0, dur: clamp(from.distanceTo(to) / 90, 0.08, 0.35) });
    this.flashT = 0.07; this.flash.material.rotation = Math.random() * 6; if (c.sfx) c.sfx(from);
  }
}
