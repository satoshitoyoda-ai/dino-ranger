// First-person dart rifle (bottom centre) with recoil + muzzle flash, gloves, and the jeep hood.
// Everything here is parented to the camera.
import * as THREE from 'three';
import { canvasTex, radialTex, rng, clamp } from './util.js';

function woodTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rng(9); const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const grain = Math.sin((y + Math.sin(x * 0.03) * 12 + Math.sin(x * 0.11) * 3) * 0.35) * 0.5 + 0.5, n = r() * 0.08;
      const k = 0.62 + grain * 0.28 + n, i = (y * w + x) * 4;
      img.data[i] = 150 * k; img.data[i + 1] = 92 * k; img.data[i + 2] = 50 * k; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: true });
}
function paintTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#56653a'; g.fillRect(0, 0, w, h); const r = rng(4);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '30,35,20' : '200,190,150'},${r() * 0.08})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(120,90,60,0.25)'; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 6, 0, 7); g.fill(); }
  }, { repeat: true });
}

export class Cockpit {
  constructor(camera) {
    this.cam = camera; this.kick = 0; this.flashT = 0;
    this.aimDir = new THREE.Vector3(0, 0, -1);
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d30, metalness: 0.85, roughness: 0.32 });
    const metalL = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.9, roughness: 0.25 });
    const wood = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.5, metalness: 0 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xe8873a, roughness: 0.45 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x5e4630, roughness: 0.85 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0xa8956a, roughness: 0.95 });
    const lens = new THREE.MeshStandardMaterial({ color: 0x1a3a50, roughness: 0.05, metalness: 0.5, emissive: 0x0e2a3a });

    // gun pivot (rotates to aim). Points along -Z.
    const gun = this.gun = new THREE.Group(); gun.position.set(0.15, -0.29, -0.26); camera.add(gun);
    const body = this.gunBody = new THREE.Group(); gun.add(body); this.cant = -0.32;
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); body.add(m); return m; };
    // stock: extruded side profile
    const st = new THREE.Shape(); st.moveTo(0.02, 0.0); st.lineTo(0.30, -0.035); st.lineTo(0.34, -0.03); st.lineTo(0.35, -0.12); st.lineTo(0.30, -0.13); st.lineTo(0.12, -0.07); st.lineTo(0.06, -0.12); st.lineTo(0.02, -0.12); st.lineTo(0.04, -0.05); st.lineTo(0.0, -0.04); st.closePath();
    const sg = new THREE.ExtrudeGeometry(st, { depth: 0.05, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }); sg.translate(0, 0, -0.025); sg.rotateY(-Math.PI / 2);
    add(sg, wood, 0, 0.01, 0.0);
    add(new THREE.BoxGeometry(0.062, 0.075, 0.30), metal, 0, 0.015, -0.1);                                 // receiver
    add(new THREE.BoxGeometry(0.05, 0.05, 0.28), wood, 0, -0.02, -0.36);                                    // handguard
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 14), metalL, 0, 0.03, -0.52, Math.PI / 2);          // barrel
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.07, 14), metal, 0, 0.03, -0.84, Math.PI / 2);           // muzzle
    add(new THREE.CylinderGeometry(0.027, 0.027, 0.018, 14), orange, 0, 0.03, -0.872, Math.PI / 2);        // orange tip
    add(new THREE.CylinderGeometry(0.024, 0.024, 0.2, 14), orange, 0, -0.035, -0.18, Math.PI / 2);         // dart canister
    add(new THREE.CylinderGeometry(0.021, 0.021, 0.24, 14), metal, 0, 0.09, -0.12, Math.PI / 2);           // scope
    add(new THREE.CylinderGeometry(0.028, 0.021, 0.05, 14), metal, 0, 0.09, -0.255, Math.PI / 2);
    add(new THREE.CircleGeometry(0.024, 16), lens, 0, 0.09, -0.281);
    for (const z of [-0.06, -0.18]) add(new THREE.BoxGeometry(0.02, 0.04, 0.02), metal, 0, 0.06, z);
    add(new THREE.BoxGeometry(0.03, 0.09, 0.04), metal, 0, -0.06, -0.02, 0.25);                             // grip
    this.led = add(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b2f }), 0.033, 0.03, -0.04);
    // gloves + sleeves
    const g1 = add(new THREE.SphereGeometry(0.05, 14, 10), glove, 0.0, -0.075, -0.03); g1.scale.set(0.9, 0.8, 1.3);
    const g2 = add(new THREE.SphereGeometry(0.05, 14, 10), glove, -0.01, -0.05, -0.38); g2.scale.set(1.0, 0.75, 1.5);
    const s1 = add(new THREE.CylinderGeometry(0.055, 0.07, 0.4, 12), sleeve, 0.12, -0.2, 0.12, 0.9, 0, 0.6);
    const s2 = add(new THREE.CylinderGeometry(0.05, 0.065, 0.45, 12), sleeve, -0.16, -0.2, -0.18, 0.5, 0, -0.9);
    void s1; void s2;
    // muzzle flash
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, 'rgba(255,255,235,1)'], [0.25, 'rgba(255,215,120,0.9)'], [1, 'rgba(255,140,40,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.flash.position.set(0, 0.03, -0.95); this.flash.scale.set(0.25, 0.25, 1); body.add(this.flash);
    this.light = new THREE.PointLight(0xffc070, 0, 6, 2); this.light.position.set(0, 0.05, -1.0); body.add(this.light);
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.03, -0.9); body.add(this.muzzle);
    body.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

    // jeep hood + windshield posts + mirror
    const paint = new THREE.MeshStandardMaterial({ map: paintTex(), roughness: 0.55, metalness: 0.15 });
    const hood = this.hood = new THREE.Group(); hood.position.set(0, -0.78, -0.2); camera.add(hood);
    const hg = new THREE.BoxGeometry(2.0, 0.12, 1.9, 16, 1, 4); const hp = hg.attributes.position;
    for (let i = 0; i < hp.count; i++) { const x = hp.getX(i), z = hp.getZ(i); hp.setY(i, hp.getY(i) - x * x * 0.09 - Math.max(0, -z - 0.6) * 0.15); } hg.computeVertexNormals();
    const hm = new THREE.Mesh(hg, paint); hm.position.set(0, 0, -1.25); hood.add(hm);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 1.8), paint); ridge.position.set(0, 0.065, -1.25); hood.add(ridge);
    const post = new THREE.CylinderGeometry(0.035, 0.04, 1.3, 10);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(post, metal); p.position.set(s * 0.98, 0.62, -0.35); p.rotation.set(-0.2, 0, -s * 0.06); hood.add(p); }
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.03), metal); mirror.position.set(-0.84, 0.58, -0.37); hood.add(mirror);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.09), new THREE.MeshStandardMaterial({ color: 0x9fb8c0, metalness: 1, roughness: 0.05 })); glass.position.set(-0.84, 0.58, -0.354); hood.add(glass);
        hood.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  }
  // aim the rifle at a camera-space direction
  aimAt(dirCam, dt) {
    const d = dirCam.clone(); d.x = clamp(d.x, -0.75, 0.75); d.y = clamp(d.y, -0.15, 0.75); d.z = -Math.abs(d.z); d.normalize();
    this.aimDir.lerp(d, Math.min(1, dt * 18)).normalize();
    // gun pivot sits below the eye: point it at a spot ~25 m along the aim ray so the barrel lines up with the tap
    const target = this.aimDir.clone().multiplyScalar(25).sub(this.gun.position);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), target.normalize());
    this.gun.quaternion.slerp(q, Math.min(1, dt * 20));
  }
  fire() { this.kick = 1; this.flashT = 0.07; this.flash.material.rotation = Math.random() * 6; }
  update(dt) {
    this.kick = Math.max(0, this.kick - dt * 7); this.flashT = Math.max(0, this.flashT - dt);
    const k = this.kick * this.kick;
    this.gunBody.position.set(0, k * 0.012, k * 0.07); this.gunBody.rotation.set(k * 0.12, 0, this.cant);
    this.flash.material.opacity = this.flashT > 0 ? 1 : 0; const s = 0.2 + Math.random() * 0.15; this.flash.scale.set(s, s, 1);
    this.light.intensity = this.flashT > 0 ? 6 : 0;
  }
  muzzleWorld(out) { this.muzzle.updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.muzzle.matrixWorld); }
}

// a dart: steel body + orange tail fins
let dartGeo = null;
export function makeDart() {
  if (!dartGeo) {
    dartGeo = {
      body: new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8).rotateX(Math.PI / 2),
      tip: new THREE.ConeGeometry(0.012, 0.06, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.14),
      fin: new THREE.ConeGeometry(0.035, 0.08, 4).rotateX(Math.PI / 2).translate(0, 0, 0.12),
      mats: [new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.8, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: 0xe8873a, roughness: 0.5 })],
    };
    for (const k of ['body', 'tip', 'fin']) dartGeo[k].userData.keep = true;
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(dartGeo.body, dartGeo.mats[0]), new THREE.Mesh(dartGeo.tip, dartGeo.mats[0]), new THREE.Mesh(dartGeo.fin, dartGeo.mats[1]));
  return g;
}
