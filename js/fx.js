// World-space particles (blood, mist, dust, puffs) in one draw call, blood pools, sleepy Z's.
import * as THREE from 'three';
import { rnd, radialTex, canvasTex, clamp } from './util.js';

const MAX = 900;
export class FX {
  constructor(scene) {
    this.scene = scene; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3); this.alpha = new Float32Array(MAX); this.size = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.P = [];
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, vertexColors: true,
      uniforms: { scale: { value: 800 } },
      vertexShader: 'attribute float alpha; attribute float size; varying float vA; varying vec3 vC; uniform float scale; void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.25, r)); }',
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
    this.pools = []; this.zs = [];
    this.poolTex = radialTex([[0, 'rgba(80,4,4,0.92)'], [0.55, 'rgba(95,6,6,0.85)'], [0.8, 'rgba(110,10,10,0.4)'], [1, 'rgba(110,10,10,0)']]);
    this.zTex = canvasTex(64, 64, (g2) => { g2.font = '900 54px system-ui, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.lineWidth = 7; g2.strokeStyle = 'rgba(30,40,60,0.85)'; g2.strokeText('z', 32, 34); g2.fillStyle = '#fff'; g2.fillText('z', 32, 34); });
  }
  setScale(h) { this.points.material.uniforms.scale.value = h * 0.9; }
  add(p) { if (this.P.length >= MAX) this.P.shift(); this.P.push(p); }
  blood(at, dir, k = 1, n = 22) {
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3(rnd(-1, 1), rnd(0.2, 1.4), rnd(-1, 1)).multiplyScalar(rnd(1.2, 4.5) * k).addScaledVector(dir, -rnd(0.5, 2.5) * k);
      const c = [[0.43, 0.04, 0.04], [0.6, 0.06, 0.06], [0.72, 0.1, 0.1]][i % 3];
      this.add({ p: at.clone(), v, g: 9.8, life: rnd(0.5, 1.0), max: 1.0, s: rnd(0.07, 0.15) * k, c, a: 1, grow: 0 }); }
    for (let i = 0; i < 3; i++) this.add({ p: at.clone(), v: new THREE.Vector3(rnd(-0.5, 0.5), rnd(0, 0.6), rnd(-0.5, 0.5)).addScaledVector(dir, -0.6), g: 0, life: 0.45, max: 0.45, s: 0.5 * k, c: [0.55, 0.04, 0.04], a: 0.6, grow: 2.0 * k });
  }
  dust(at, n = 10, r = 1, col = [0.62, 0.55, 0.42]) {
    for (let i = 0; i < n; i++) this.add({ p: at.clone().add(new THREE.Vector3(rnd(-r, r), rnd(0, 0.3), rnd(-r, r))), v: new THREE.Vector3(rnd(-1, 1), rnd(0.3, 1.2), rnd(-1, 1)).multiplyScalar(r * 0.8), g: -0.2, life: rnd(0.8, 1.6), max: 1.6, s: rnd(0.5, 1.1) * r, c: col, a: 0.5, grow: 0.9 * r });
  }
  puff(at, s = 0.25) { this.add({ p: at.clone(), v: new THREE.Vector3(0, 0.3, 0), g: 0, life: 0.3, max: 0.3, s, c: [1, 0.96, 0.85], a: 0.6, grow: 1 }); }
  pool(at, k) { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ map: this.poolTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true }));
    m.rotation.x = -Math.PI / 2; m.position.copy(at); m.position.y += 0.06; m.scale.setScalar(0.01); m.userData = { t: 0, k }; this.scene.add(m); this.pools.push(m); }
  zzz(at, k = 1) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.zTex, transparent: true, depthWrite: false })); s.position.copy(at); s.scale.setScalar(0.5 * k); s.userData = { t: 0, k, x0: at.x }; this.scene.add(s); this.zs.push(s); }
  clear() { this.P.length = 0; for (const m of this.pools) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } this.pools = []; for (const s of this.zs) { this.scene.remove(s); s.material.dispose(); } this.zs = []; }
  update(dt) {
    let j = 0;
    for (const p of this.P) { p.life -= dt; if (p.life <= 0) continue; p.v.y -= p.g * dt; p.p.addScaledVector(p.v, dt); p.s += p.grow * dt;
      this.pos[j * 3] = p.p.x; this.pos[j * 3 + 1] = p.p.y; this.pos[j * 3 + 2] = p.p.z; this.col[j * 3] = p.c[0]; this.col[j * 3 + 1] = p.c[1]; this.col[j * 3 + 2] = p.c[2];
      this.alpha[j] = p.a * clamp(p.life / p.max * 1.6, 0, 1); this.size[j] = p.s; j++; }
    this.P = this.P.filter(p => p.life > 0); this.n = j;
    const g = this.points.geometry; g.setDrawRange(0, j); for (const k of ['position', 'color', 'alpha', 'size']) g.attributes[k].needsUpdate = true;
    for (const m of this.pools) { m.userData.t += dt; const s = m.userData.k * (1 - Math.pow(1 - clamp(m.userData.t / 3, 0, 1), 2)); m.scale.set(s, s * 0.75, s); }
    for (const s of this.zs) { const u = s.userData; u.t += dt; s.position.y += dt * 0.5; s.position.x = u.x0 + Math.sin(u.t * 2) * 0.2; s.material.opacity = clamp(2 - u.t, 0, 1); }
    this.zs = this.zs.filter(s => { if (s.userData.t > 2) { this.scene.remove(s); s.material.dispose(); return false; } return true; });
  }
}
