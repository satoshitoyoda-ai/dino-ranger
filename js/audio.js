// Synthesized Web Audio (ported from v2.1): deep roars with reverb, footsteps, engine, music loop, ranger radio.
import { rnd, clamp } from './util.js';

let S = null, ACTf = () => true, rootf = () => 45;
export function audioBind(settings, act, root) { S = settings; ACTf = act; rootf = root; }

export let AC = null;
let master, sfxG, musG, ambG, revIn, NB = null, eng = null, rainG = null;
function impulse(sec) { const n = Math.floor(AC.sampleRate * sec), b = AC.createBuffer(2, n, AC.sampleRate); for (let c = 0; c < 2; c++) { const a = b.getChannelData(c); for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); } return b; }
function noiseBuf() { if (!NB) { NB = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const a = NB.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; } return NB; }
export function audioInit() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  if (AC) { if (AC.state !== 'running') AC.resume().catch(() => {}); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  AC = new C();
  master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination);
  const eq = AC.createBiquadFilter(); eq.type = 'lowshelf'; eq.frequency.value = 170; eq.gain.value = 8;
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.25;
  eq.connect(comp); comp.connect(master);
  sfxG = AC.createGain(); sfxG.gain.value = 0.6; sfxG.connect(eq);
  musG = AC.createGain(); musG.gain.value = 0.0001; musG.connect(eq);
  revIn = AC.createGain(); const conv = AC.createConvolver(); conv.buffer = impulse(2.6); const revOut = AC.createGain(); revOut.gain.value = 0.3; revIn.connect(conv); conv.connect(revOut); revOut.connect(comp);
  ambG = AC.createGain(); ambG.gain.value = 0.0001; ambG.connect(master);
  const b = AC.createBuffer(1, 1, 22050), s = AC.createBufferSource(); s.buffer = b; s.connect(AC.destination); s.start(0);
  const o1 = AC.createOscillator(), o2 = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
  o1.type = 'sawtooth'; o1.frequency.value = 28; o2.type = 'square'; o2.frequency.value = 42; f.type = 'lowpass'; f.frequency.value = 200; g.gain.value = 0.0001;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(sfxG); o1.start(); o2.start(); eng = { o1, o2, g };
  const n = AC.createBufferSource(); n.buffer = noiseBuf(); n.loop = true; const nf = AC.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3200; nf.Q.value = 0.6;
  const ng = AC.createGain(); ng.gain.value = 0.02; n.connect(nf); nf.connect(ng); ng.connect(ambG); n.start();
  // rain hiss (volume follows the weather)
  const rn = AC.createBufferSource(); rn.buffer = noiseBuf(); rn.loop = true; const rf = AC.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 2600; const rh = AC.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 300;
  rainG = AC.createGain(); rainG.gain.value = 0.0001; rn.connect(rf); rf.connect(rh); rh.connect(rainG); rainG.connect(master); rn.start(AC.currentTime + 0.37);
}
export function setRain(v) { if (rainG) rainG.gain.setTargetAtTime(S.sound ? 0.0001 + v * 0.16 : 0.0001, AC.currentTime, 0.5); }
export function tone(f, dur, type = 'sine', vol = 0.3, f2 = null, delay = 0, dest) {
  if (!AC || !S.sound) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || sfxG); o.start(t); o.stop(t + dur + 0.05);
}
export function noise(dur, vol = 0.2, freq = 1000, delay = 0, type = 'bandpass', q = 1.2) {
  if (!AC || !S.sound) return;
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxG); s.start(t); s.stop(t + dur + 0.05);
}
function filtered(type, f1, f2, dur, vol, ff, q, vib, vibAmt, delay = 0) {
  if (!AC || !S.sound) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), fl = AC.createBiquadFilter(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  if (vib) { const l = AC.createOscillator(), lg = AC.createGain(); l.frequency.value = vib; lg.gain.value = vibAmt; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
  fl.type = 'bandpass'; fl.frequency.value = ff; fl.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.06); g.gain.setValueAtTime(vol, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); fl.connect(g); g.connect(sfxG); g.connect(revIn); o.start(t); o.stop(t + dur + 0.1);
}
function roar(sz, vol) {
  if (!AC || !S.sound) return;
  const t = AC.currentTime, dur = 1.7 * sz;
  const s = AC.createBufferSource(); s.buffer = noiseBuf(); s.loop = true; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 5;
  f.frequency.setValueAtTime(600 / sz, t); f.frequency.linearRampToValueAtTime(850 / sz, t + dur * 0.25); f.frequency.exponentialRampToValueAtTime(130 / sz, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.18); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxG); g.connect(revIn); s.start(t); s.stop(t + dur + 0.1);
  filtered('sawtooth', 92 / sz, 34 / sz, dur, vol * 0.9, 240, 0.7, 22, 14 / sz);
  filtered('square', 60 / sz, 29 / sz, dur, vol * 0.45, 160, 0.7, 11, 6);
  tone(46 / sz, dur, 'sine', vol * 0.9, 28 / sz);
}
let lastDing = 0;
export const sfx = {
  rapid() { tone(220, 0.07, 'square', 0.12, 80); noise(0.05, 0.16, 2600, 0, 'highpass', 0.7); },
  spread() { tone(110, 0.25, 'sine', 0.55, 35); noise(0.22, 0.4, 900, 0, 'lowpass', 0.7); noise(0.12, 0.2, 3000, 0.01, 'highpass', 0.5); },
  launch() { tone(90, 0.3, 'sine', 0.45, 40); noise(0.35, 0.3, 500, 0, 'bandpass', 0.8); },
  boom() { tone(48, 1.1, 'sine', 0.8, 22); noise(1.2, 0.55, 220, 0, 'lowpass', 0.7); noise(0.25, 0.3, 1800, 0, 'bandpass', 0.6); },
  thunder() { const d = 0.3 + Math.random() * 0.6; noise(2.6, 0.5, 140, d, 'lowpass', 0.6); tone(38, 2.2, 'sine', 0.35, 26, d); noise(0.4, 0.25, 900, d, 'bandpass', 0.5); },
  hurt() { tone(55, 0.5, 'sine', 0.7, 28); noise(0.25, 0.45, 600, 0, 'bandpass', 0.8); noise(0.12, 0.3, 2500, 0.02, 'bandpass', 1.2); tone(220, 0.18, 'sawtooth', 0.06, 110, 0.03); },
  heart() { tone(48, 0.16, 'sine', 0.35, 36); tone(44, 0.16, 'sine', 0.28, 34, 0.22); },
  mg() { tone(95, 0.06, 'square', 0.18, 50); noise(0.05, 0.3, 1200, 0, 'bandpass', 0.7); noise(0.03, 0.12, 4000, 0, 'highpass', 0.5); },
  npc() { tone(170, 0.1, 'sine', 0.1, 60); noise(0.06, 0.05, 2200, 0, 'highpass', 0.7); },
  dart() { tone(150, 0.14, 'sine', 0.4, 45); noise(0.09, 0.22, 2000, 0, 'highpass', 0.7); noise(0.3, 0.05, 5000, 0.04, 'highpass', 0.5); },
  thunk(head) { tone(head ? 140 : 105, 0.18, 'sine', 0.45, 40); noise(0.08, 0.22, 450, 0, 'lowpass', 1); if (S.blood !== false) noise(0.14, 0.12, 800, 0.02, 'bandpass', 2.5); if (head) tone(880, 0.08, 'triangle', 0.06, null, 0.03); },
  miss() { tone(90, 0.1, 'sine', 0.15, 50); noise(0.14, 0.12, 400, 0, 'lowpass', 0.7); },
  bump() { tone(58, 0.55, 'sine', 0.6, 26); noise(0.45, 0.4, 170, 0, 'lowpass', 0.7); },
  bite() { noise(0.12, 0.35, 900, 0, 'bandpass', 1.5); tone(70, 0.3, 'sine', 0.5, 35); },
  step(v) { tone(52, 0.2, 'sine', v, 30); noise(0.1, v * 0.4, 120, 0, 'lowpass', 0.7); },
  fall(big) { tone(big ? 44 : 62, big ? 1.0 : 0.55, 'sine', 0.65, 24); noise(big ? 1.4 : 0.7, big ? 0.45 : 0.28, 130, 0.02, 'lowpass', 0.8); },
  ding() { if (!AC || AC.currentTime - lastDing < 0.07) return; lastDing = AC.currentTime; tone(1568, 0.1, 'triangle', 0.05); tone(2093, 0.12, 'triangle', 0.04, null, 0.05); },
  sleepy(big) { filtered('sawtooth', big ? 120 : 260, big ? 55 : 120, big ? 1.4 : 0.8, 0.12, big ? 300 : 600, 1, 5, 6); },
  fanfare() { const n = [392, 523, 659, 784]; n.forEach((f, i) => filtered('sawtooth', f, f, 0.3, 0.09, 1400, 0.7, 5, 3, i * 0.14)); filtered('sawtooth', 1047, 1047, 0.8, 0.09, 1600, 0.7, 5, 4, 0.58); filtered('sawtooth', 784, 784, 0.8, 0.07, 1400, 0.7, 5, 3, 0.58); },
  ui() { tone(520, 0.06, 'square', 0.05); },
  bird() { const b = rnd(2200, 3200); for (let i = 0; i < 3; i++) tone(b + rnd(-200, 300), 0.08, 'sine', 0.025, b * rnd(1.1, 1.3), i * 0.11, ambG); },
};
export function cry(kind, mul = 1) {
  const g = (ACTf() ? 1 : 0.45) * mul;
  switch (kind) {
    case 'screech': filtered('sawtooth', 620, 1150, 0.18, 0.09 * g, 1100, 4); filtered('sawtooth', 1150, 480, 0.3, 0.08 * g, 900, 4, 0, 0, 0.16); filtered('sawtooth', 170, 110, 0.4, 0.12 * g, 260, 1, 30, 10); break;
    case 'bellow': filtered('sawtooth', 78, 46, 0.9, 0.2 * g, 230, 1.0, 7, 4); tone(44, 0.8, 'sine', 0.25 * g, 30); break;
    case 'bellowBig': filtered('sawtooth', 60, 33, 1.5, 0.24 * g, 190, 1.0, 6, 4); tone(38, 1.4, 'sine', 0.35 * g, 25); noise(1.2, 0.1 * g, 150, 0, 'lowpass', 1); break;
    case 'squawk': filtered('square', 650, 430, 0.22, 0.06 * g, 900, 3); filtered('square', 600, 420, 0.2, 0.05 * g, 900, 3, 0, 0, 0.25); break;
    case 'hoot': filtered('sawtooth', 50, 38, 2.2, 0.08 * g, 160, 1, 3, 2); break;
    case 'roar': roar(1.45, 0.32 * g); break;
  }
}
// engine + ambience follow the jeep speed
export function audioTick(on, speedK, amb) {
  if (!AC) return;
  eng.g.gain.setTargetAtTime(on ? 0.045 + 0.04 * clamp(speedK, 0, 1) : 0.0001, AC.currentTime, 0.2);
  eng.o1.frequency.setTargetAtTime(26 + speedK * 10, AC.currentTime, 0.3); eng.o2.frequency.setTargetAtTime(39 + speedK * 15, AC.currentTime, 0.3);
  ambG.gain.setTargetAtTime(amb ? 1 : 0.0001, AC.currentTime, 0.4);
}
export function ambOff() { if (AC) ambG.gain.setTargetAtTime(0.0001, AC.currentTime, 0.05); }

// music: original adventure loop (A minor, drums + bass + horn)
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const BASSP = [0, 0, 12, 0, 3, 0, 7, 5], CHORD = [0, 0, -4, -2], HORN = [12, null, 15, 17, 19, null, 17, 15, 12, null, 10, 12, 15, null, null, null];
const mus = { on: false, step: 0, next: 0, iv: null };
function mnote(f, dur, type, vol, t, cut) { const o = AC.createOscillator(), g = AC.createGain(), fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cut || 2000; o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (type === 'sawtooth' ? 0.05 : 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(fl); fl.connect(g); g.connect(musG); o.start(t); o.stop(t + dur + 0.05); }
function drum(t, f1, f2, vol, dur) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(musG); o.start(t); o.stop(t + dur + 0.02); }
function hat(t, vol) { const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = noiseBuf(); f.type = 'highpass'; f.frequency.value = 6000; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); s.connect(f); f.connect(g); g.connect(musG); s.start(t); s.stop(t + 0.06); }
function musicTick() {
  if (!AC) return; const spb = 60 / 126 / 2, root = rootf();
  if (mus.next < AC.currentTime) mus.next = AC.currentTime + 0.05;
  while (mus.next < AC.currentTime + 0.3) {
    const i = mus.step, t = mus.next, bar = Math.floor(i / 8) % 4, ch = CHORD[bar];
    mnote(midi(root - 12 + ch + BASSP[i % 8]), spb * 0.9, 'sawtooth', 0.26, t, 320);
    if (i % 4 === 0) drum(t, 105, 36, 0.6, 0.35);
    if (i % 8 === 4) { drum(t, 220, 120, 0.25, 0.12); hat(t, 0.12); }
    hat(t, i % 2 ? 0.025 : 0.05);
    if (Math.floor(i / 32) % 2 === 1) { const h = HORN[i % 16]; if (h !== null) mnote(midi(root + 12 + h + ch), spb * 1.8, 'sawtooth', 0.09, t, 1500); }
    mus.step++; mus.next += spb;
  }
}
export function musicStart() { if (!AC || !S.music || mus.on) return; mus.on = true; mus.next = AC.currentTime + 0.1; musG.gain.cancelScheduledValues(AC.currentTime); musG.gain.setTargetAtTime(0.26, AC.currentTime, 0.4); mus.iv = setInterval(musicTick, 60); }
export function musicStop() { if (!mus.on) return; mus.on = false; clearInterval(mus.iv); if (AC) musG.gain.setTargetAtTime(0.0001, AC.currentTime, 0.15); }

// ranger radio (device voice)
let voiceCache = null;
function pickVoice() {
  if (voiceCache) return voiceCache;
  const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  voiceCache = vs.find(v => /en[-_]US/i.test(v.lang) && /Samantha|Ava|Allison|Susan|Alex|Daniel/i.test(v.name)) || vs.find(v => /en[-_]US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
  return voiceCache;
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { voiceCache = null; };
export function say(text, interrupt = true) {
  if (!S.voice || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  try { if (!interrupt && speechSynthesis.speaking) return; if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 1.0; u.pitch = 1.0; const v = pickVoice(); if (v) u.voice = v; speechSynthesis.speak(u); } catch (e) {}
}
