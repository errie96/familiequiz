#!/usr/bin/env node
// Maakt de standaardgeluiden in public/media/muziek/ opnieuw aan (zonder internet, zonder extra pakketten):
//   opening.wav      korte jingle bij de start van de quiz (tromgeroffel + fanfare)
//   achtergrond.wav  rustige muziek die blijft herhalen (vóór de start en in de pauze)
// Eigen muziek? Zet gewoon een opening.mp3 / achtergrond.mp3 in die map: een mp3 gaat altijd voor de wav.
// Gebruik: npm run standaard-muziek   (overschrijft alleen de twee .wav-bestanden)
'use strict';
const fs = require('fs');
const path = require('path');

const RATE = 22050;
const OUT = path.join(__dirname, '..', 'public', 'media', 'muziek');
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const N = { C3: 48, E3: 52, F3: 53, G3: 55, A3: 57, C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84 };

// Pseudo-willekeur met vast zaadje: elke keer exact hetzelfde bestand
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

function wav(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 0.89 / peak : 1; // ongeveer -1 dB
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * gain * 32767))), 44 + i * 2));
  return buf;
}
function add(out, start, len, fn) {
  const a = Math.max(0, Math.floor(start * RATE)), b = Math.min(out.length, Math.floor((start + len) * RATE));
  for (let i = a; i < b; i++) out[i] += fn((i - a) / RATE);
}
// Koperachtige toon: boventonen 1..8 met 1/n, snelle aanzet, licht vibrato
function brass(f, dur, vol) {
  return (t) => {
    const env = Math.min(1, t / 0.03) * (t > dur - 0.25 ? Math.max(0, (dur - t) / 0.25) : 1) * (0.75 + 0.25 * Math.exp(-t * 3));
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.4);
    let s = 0;
    for (let h = 1; h <= 8; h++) s += Math.sin(2 * Math.PI * f * h * vib * t) / h * (h > 4 ? Math.min(1, t * 6) : 1);
    return s * env * vol;
  };
}
const bell = (f, vol, decay = 2.2) => (t) => (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 4) + 0.15 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 8)) * Math.exp(-t * decay) * Math.min(1, t / 0.004) * vol;
const noiseHit = (vol, decay) => (t) => (rnd() * 2 - 1) * Math.exp(-t * decay) * vol;

function opening() {
  const len = 5.2, out = new Float64Array(Math.ceil(len * RATE));
  // tromgeroffel dat aanzwelt (0 – 1,6 s)
  for (let t = 0; t < 1.6; t += 0.045 - t * 0.012) add(out, t, 0.12, noiseHit(0.08 + t * 0.12, 38));
  add(out, 1.6, 0.4, noiseHit(0.45, 14)); // klap
  add(out, 1.6, 0.5, (t) => Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t * 9) * 0.6); // grote trom
  // fanfare-loopje
  [[N.G4, 1.62], [N.C5, 1.80], [N.E5, 1.98], [N.G5, 2.16]].forEach(([n, t]) => add(out, t, 0.2, brass(midi(n), 0.2, 0.22)));
  // slotakkoord + bekken
  [N.C4, N.E4, N.G4, N.C5, N.E5, N.G5].forEach((n) => add(out, 2.36, 2.8, brass(midi(n), 2.8, 0.16)));
  add(out, 2.36, 2.8, (t) => (rnd() * 2 - 1) * Math.exp(-t * 1.6) * 0.18);
  add(out, 2.36, 0.6, (t) => Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 6) * 0.7);
  [N.C5, N.E5, N.G5, N.C6].forEach((n, i) => add(out, 2.4 + i * 0.09, 2.4, bell(midi(n), 0.12, 1.6))); // glinstering
  return out;
}

function background() {
  // Rustig kerstachtig loopje: C – Am – F – G, 96 bpm, 20 s, naadloos te herhalen
  const beat = 60 / 96, bar = beat * 4, chords = [[N.C4, N.E4, N.G4], [N.A3, N.C4, N.E4], [N.F3, N.A3, N.C4], [N.G3, N.B4 - 12, N.D4]];
  const roots = [N.C3, N.A3 - 12, N.F3 - 12, N.G3 - 12];
  const loop = bar * 2 * chords.length, tail = 3;
  const out = new Float64Array(Math.ceil((loop + tail) * RATE));
  chords.forEach((ch, ci) => {
    const t0 = ci * bar * 2;
    // zachte ondergrond (pad)
    ch.forEach((n) => add(out, t0, bar * 2 + 1.5, (t) => {
      const f = midi(n), env = Math.min(1, t / 0.8) * (t > bar * 2 ? Math.max(0, 1 - (t - bar * 2) / 1.5) : 1);
      return (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t) + 0.12 * Math.sin(2 * Math.PI * f * 3 * t)) * env * 0.07 * (1 + 0.15 * Math.sin(2 * Math.PI * 0.25 * t));
    }));
    // bas op tel 1 en 3
    for (let b = 0; b < 8; b += 2) add(out, t0 + b * beat, beat * 1.8, (t) => Math.sin(2 * Math.PI * midi(roots[ci]) * t) * Math.exp(-t * 1.8) * Math.min(1, t / 0.01) * 0.22);
    // klokjes: achtste noten door het akkoord, een octaaf hoger
    const up = [...ch.map((n) => n + 12), ch[0] + 24, ch[1] + 12];
    const pattern = [0, 1, 2, 3, 2, 1, 4, 2];
    for (let i = 0; i < 16; i++) {
      if (ci === 3 && i >= 14) continue; // even ademhalen vóór het herhalen
      const n = up[pattern[i % 8] % up.length];
      add(out, t0 + i * beat / 2, 1.6, bell(midi(n), i % 4 === 0 ? 0.075 : 0.05, 2.6));
    }
    // sleebelletjes heel zacht op de tweede en vierde tel
    for (let b = 1; b < 8; b += 2) add(out, t0 + b * beat, 0.25, (t) => (rnd() * 2 - 1) * Math.exp(-t * 30) * 0.035 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 7000 * t)));
  });
  // naadloos: wat na het einde uitklinkt, gaat terug naar het begin
  const L = Math.floor(loop * RATE), res = out.slice(0, L);
  for (let i = L; i < out.length; i++) res[i - L] += out[i];
  return res;
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'opening.wav'), wav(opening()));
fs.writeFileSync(path.join(OUT, 'achtergrond.wav'), wav(background()));
console.log('✔ public/media/muziek/opening.wav en achtergrond.wav gemaakt');
