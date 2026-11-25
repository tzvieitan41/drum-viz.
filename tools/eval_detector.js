#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SR = 44100;
const context = {
  console,
  Math,
  Float32Array,
  Array,
  Object,
  self: null
};
context.globalThis = context;
context.self = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'analyzer.js'), 'utf8'), context);
const DrumAnalyzer = context.DrumAnalyzer;

function env(n, decay, attack) {
  const e = new Float32Array(n);
  const aN = Math.max(1, (attack || 0.001) * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    e[i] = Math.exp(-t / decay) * Math.min(1, i / aN);
  }
  return e;
}

function mix(buf, t, sig, gain) {
  let i0 = Math.round(t * SR);
  if (i0 < 0) i0 = 0;
  const n = Math.min(sig.length, buf.length - i0);
  for (let i = 0; i < n; i++) buf[i0 + i] += sig[i] * gain;
}

let noiseSeed = 7;
function noise(n) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    noiseSeed = (noiseSeed * 16807 + 11) % 2147483647;
    x[i] = (noiseSeed / 2147483647) * 2 - 1;
  }
  return x;
}

function lowpass(x, cutoff) {
  const dt = 1 / SR;
  const rc = 1 / (2 * Math.PI * cutoff);
  const a = dt / (rc + dt);
  const y = new Float32Array(x.length);
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    p += a * (x[i] - p);
    y[i] = p;
  }
  return y;
}

function highpass(x, cutoff, stages) {
  const dt = 1 / SR;
  const rc = 1 / (2 * Math.PI * cutoff);
  const a = rc / (rc + dt);
  let y = x;
  for (let s = 0; s < (stages || 2); s++) {
    const o = new Float32Array(y.length);
    let py = 0;
    let px = 0;
    for (let i = 0; i < y.length; i++) {
      py = a * (py + y[i] - px);
      px = y[i];
      o[i] = py;
    }
    y = o;
  }
  return y;
}

function norm(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  if (p < 1e-8) return x;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] / p;
  return y;
}

function synthKick() {
  const n = Math.floor(0.28 * SR);
  const y = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 48 + 110 * Math.exp(-t / 0.04);
    phase += 2 * Math.PI * f / SR;
    y[i] = Math.sin(phase) * Math.exp(-t / 0.07);
  }
  const click = lowpass(noise(n), 500);
  const e = env(n, 0.004, 0.0004);
  for (let i = 0; i < n; i++) y[i] = y[i] * 0.95 + click[i] * e[i] * 0.2;
  return y;
}

function synthSnare() {
  const n = Math.floor(0.22 * SR);
  let nz = highpass(noise(n), 1000, 2);
  nz = lowpass(nz, 4800);
  nz = norm(nz);
  const eN = env(n, 0.045, 0.001);
  const eT = env(n, 0.1, 0.002);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y[i] = nz[i] * eN[i] * 0.85 + Math.sin(2 * Math.PI * 190 * t) * eT[i] * 0.62;
  }
  return y;
}

function synthHat(open) {
  const dur = open ? 0.28 : 0.06;
  const n = Math.floor(dur * SR);
  let nz = highpass(noise(n), open ? 5600 : 7600, 3);
  nz = norm(nz);
  const e = env(n, open ? 0.11 : 0.016, 0.0006);
  for (let i = 0; i < n; i++) nz[i] *= e[i];
  return nz;
}

function synthTom(f0, f1, decay) {
  const n = Math.floor(0.42 * SR);
  const y = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t / 0.09);
    phase += 2 * Math.PI * f / SR;
    y[i] = Math.sin(phase) * Math.exp(-t / decay);
  }
  return y;
}

function synthRide() {
  const n = Math.floor(0.32 * SR);
  const y = new Float32Array(n);
  const e = env(n, 0.16, 0.001);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ping = Math.sin(2 * Math.PI * 3400 * t) * 0.45
      + Math.sin(2 * Math.PI * 5100 * t) * 0.3
      + Math.sin(2 * Math.PI * 6900 * t) * 0.18;
    y[i] = ping * e[i];
  }
  return y;
}

function synthCrash(kind) {
  const dur = kind === 2 ? 0.55 : 0.9;
  const n = Math.floor(dur * SR);
  const cut = kind === 2 ? 2200 : 3600;
  let nz = highpass(noise(n), cut, 2);
  nz = norm(nz);
  const e = env(n, kind === 2 ? 0.22 : 0.42, 0.002);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const partial = kind === 2
      ? Math.sin(2 * Math.PI * 2400 * t) * 0.25 + Math.sin(2 * Math.PI * 4100 * t) * 0.15
      : Math.sin(2 * Math.PI * 5200 * t) * 0.12 + Math.sin(2 * Math.PI * 8100 * t) * 0.08;
    y[i] = (nz[i] * 0.75 + partial) * e[i];
  }
  return y;
}

function synthBassNote(freq, dur) {
  const n = Math.floor(dur * SR);
  const y = new Float32Array(n);
  const e = env(n, dur * 0.55, 0.03);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y[i] = (Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(2 * Math.PI * freq * 2 * t)) * e[i];
  }
  return y;
}

function synthChord(freqs, dur) {
  const n = Math.floor(dur * SR);
  const y = new Float32Array(n);
  const e = env(n, dur * 0.6, 0.02);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (let k = 0; k < freqs.length; k++) s += Math.sin(2 * Math.PI * freqs[k] * t);
    y[i] = (s / freqs.length) * e[i];
  }
  // quiet pick transient in the low-mid, the trap for false snare/tom hits
  const pickN = Math.floor(0.03 * SR);
  let pick = lowpass(highpass(noise(pickN), 180, 1), 900);
  pick = norm(pick);
  for (let i = 0; i < pickN; i++) y[i] += pick[i] * Math.exp(-i / SR / 0.008) * 0.35;
  return y;
}

function buildMix() {
  const bpm = 110;
  const beat = 60 / bpm;
  const eighth = beat / 2;
  const bars = 8;
  const dur = bars * 4 * beat + 1.2;
  const buf = new Float32Array(Math.floor(dur * SR));
  const gt = [];
  const kick = synthKick();
  const snare = synthSnare();
  const hatC = synthHat(false);
  const hatO = synthHat(true);
  const tomH = synthTom(340, 260, 0.16);
  const tomM = synthTom(200, 155, 0.2);
  const tomF = synthTom(118, 92, 0.26);
  const ride = synthRide();
  const crash = synthCrash(1);
  const crash2 = synthCrash(2);

  function hit(piece, bar, eighthIdx, sig, gain) {
    const t = (bar * 8 + eighthIdx) * eighth;
    mix(buf, t, sig, gain);
    gt.push({ time: t, piece });
  }

  // Bars 0-2: rock groove, hats, bass, guitar. Open hat on the & of 4.
  for (let bar = 0; bar < 3; bar++) {
    hit('kick', bar, 0, kick, 1);
    hit('kick', bar, 4, kick, 0.95);
    hit('snare', bar, 2, snare, 0.85);
    hit('snare', bar, 6, snare, 0.82);
    for (let e = 0; e < 8; e++) {
      if (e === 7) hit('hatOpen', bar, e, hatO, 0.55);
      else hit('hatClosed', bar, e, hatC, e % 2 === 0 ? 0.42 : 0.32);
    }
    // bass on 1 and 3, guitar chord on the & of 1 and beat 4
    mix(buf, (bar * 8) * eighth, synthBassNote(bar % 2 ? 82 : 55, beat * 1.4), 0.55);
    mix(buf, (bar * 8 + 4) * eighth, synthBassNote(98, beat), 0.4);
    mix(buf, (bar * 8 + 1) * eighth, synthChord([196, 247, 294], beat * 0.9), 0.32);
    if (bar === 1) mix(buf, (bar * 8 + 5) * eighth, synthBassNote(110, beat * 0.8), 0.5);
    mix(buf, (bar * 8 + 6) * eighth, synthChord([220, 277, 330], beat * 0.7), 0.28);
  }
  // a couple of 8th kick pickups
  hit('kick', 0, 3, kick, 0.7);
  hit('kick', 2, 3, kick, 0.66);

  // Bar 3: ride pattern instead of hats, with kick and snare, bass continues
  for (let e = 0; e < 8; e++) {
    if (e % 2 === 0 || e === 3 || e === 5) hit('ride', 3, e, ride, e % 2 === 0 ? 0.5 : 0.36);
  }
  hit('kick', 3, 0, kick, 1);
  hit('kick', 3, 4, kick, 0.9);
  hit('snare', 3, 2, snare, 0.84);
  hit('snare', 3, 6, snare, 0.8);
  mix(buf, (3 * 8) * eighth, synthBassNote(55, beat * 3), 0.5);
  mix(buf, (3 * 8 + 4) * eighth, synthChord([165, 208, 247], beat * 1.5), 0.3);

  // Bar 4: crashes and a short hat return
  hit('crash', 4, 0, crash, 0.7);
  hit('kick', 4, 0, kick, 1);
  hit('snare', 4, 2, snare, 0.8);
  hit('hatClosed', 4, 2, hatC, 0.34);
  hit('hatClosed', 4, 4, hatC, 0.36);
  hit('crash2', 4, 4, crash2, 0.68);
  hit('kick', 4, 4, kick, 0.9);
  hit('snare', 4, 6, snare, 0.8);
  mix(buf, (4 * 8) * eighth, synthBassNote(73, beat * 2), 0.48);
  mix(buf, (4 * 8 + 2) * eighth, synthChord([196, 247, 311], beat), 0.3);

  // Bar 5: tom fill, high then mid then floor, plus a bass slide under it
  hit('kick', 5, 0, kick, 0.85);
  hit('snare', 5, 1, snare, 0.55);
  hit('tomHigh', 5, 2, tomH, 0.9);
  hit('tomHigh', 5, 3, tomH, 0.75);
  hit('tomMid', 5, 4, tomM, 0.9);
  hit('tomMid', 5, 5, tomM, 0.78);
  hit('tomFloor', 5, 6, tomF, 0.95);
  hit('tomFloor', 5, 7, tomF, 0.85);
  mix(buf, (5 * 8) * eighth, synthBassNote(49, beat * 2), 0.42);
  mix(buf, (5 * 8 + 4) * eighth, synthChord([146, 185, 220], beat * 1.2), 0.26);

  // Bar 6: another groove with open hat and a china at the end, guitar throughout
  hit('crash', 6, 0, crash, 0.62);
  for (let e = 0; e < 8; e++) {
    if (e === 7) hit('hatOpen', 6, e, hatO, 0.5);
    else if (e !== 0) hit('hatClosed', 6, e, hatC, 0.34);
  }
  hit('kick', 6, 0, kick, 1);
  hit('kick', 6, 3, kick, 0.6);
  hit('kick', 6, 4, kick, 0.92);
  hit('snare', 6, 2, snare, 0.84);
  hit('snare', 6, 6, snare, 0.8);
  mix(buf, (6 * 8) * eighth, synthBassNote(65, beat * 3.2), 0.5);
  mix(buf, (6 * 8 + 1) * eighth, synthChord([174, 220, 261], beat), 0.3);

  // Bar 7: isolated-ish ride + floor + crash2 so each class has a clean example too
  hit('ride', 7, 0, ride, 0.55);
  hit('ride', 7, 2, ride, 0.48);
  hit('ride', 7, 4, ride, 0.5);
  hit('tomHigh', 7, 1, tomH, 0.8);
  hit('tomMid', 7, 3, tomM, 0.82);
  hit('tomFloor', 7, 5, tomF, 0.9);
  hit('crash2', 7, 6, crash2, 0.66);
  hit('hatOpen', 7, 7, hatO, 0.5);
  hit('kick', 7, 0, kick, 0.9);
  hit('snare', 7, 4, snare, 0.8);
  mix(buf, (7 * 8) * eighth, synthBassNote(87, beat * 2), 0.45);
  mix(buf, (7 * 8 + 2) * eighth, synthChord([220, 277, 349], beat * 1.4), 0.28);

  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const g = 0.9 / (peak || 1);
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  gt.sort((a, b) => a.time - b.time);
  return { audio: buf, gt, dur };
}

function fftRadix2(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }
}

// Previous in-app detector: causal spectral flux on analyser-like bands, no HPSS.
function runLegacy(audio) {
  const nfft = 2048;
  const hop = Math.round(SR / 60);
  const win = new Float32Array(nfft);
  for (let i = 0; i < nfft; i++) win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (nfft - 1)));
  const re = new Float32Array(nfft);
  const im = new Float32Array(nfft);
  const nBins = nfft >> 1;
  const nyquist = SR / 2;
  function hzToBin(hz) {
    return Math.max(1, Math.min(nBins - 1, Math.round((hz / nyquist) * nBins)));
  }
  const ranges = {
    kick: [hzToBin(38), hzToBin(125)],
    tom: [hzToBin(130), hzToBin(250)],
    snareBody: [hzToBin(170), hzToBin(380)],
    snareWire: [hzToBin(1400), hzToBin(4600)],
    shimmer: [hzToBin(3400), hzToBin(6400)],
    hihat: [hzToBin(6200), hzToBin(13500)]
  };
  const histLen = 24;
  const hist = { kick: [], snare: [], tom: [], hat: [] };
  const prevFlux = { kick: 0, snare: 0, tom: 0, hat: 0 };
  const last = { kick: -9, snare: -9, tom: -9, hihat: -9, crash: -9 };
  let tomToggle = false;
  const hits = [];
  let prevMag = new Float32Array(nBins);
  const sensitivity = 1;

  function bandStats(mag, a, b) {
    let flux = 0, energy = 0;
    const count = Math.max(1, b - a + 1);
    for (let i = a; i <= b; i++) {
      const m = mag[i];
      energy += m;
      const d = m - prevMag[i];
      if (d > 0) flux += d;
    }
    return { flux: flux / count, energy: energy / count };
  }
  function medMad(arr) {
    if (!arr.length) return { med: 0, mad: 0 };
    const tmp = arr.slice().sort((a, b) => a - b);
    const med = tmp[tmp.length >> 1];
    let d = 0;
    for (let i = 0; i < tmp.length; i++) d += Math.abs(tmp[i] - med);
    return { med, mad: d / tmp.length };
  }

  const frames = Math.floor((audio.length - nfft) / hop);
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    re.fill(0); im.fill(0);
    for (let i = 0; i < nfft; i++) re[i] = audio[off + i] * win[i];
    fftRadix2(re, im);
    const mag = new Float32Array(nBins);
    for (let b = 0; b < nBins; b++) {
      const m = Math.sqrt(re[b] * re[b] + im[b] * im[b]) + 1e-12;
      const db = 20 * Math.log10(m);
      let byte = (db - (-85)) / ((-10) - (-85));
      if (byte < 0) byte = 0;
      if (byte > 1) byte = 1;
      const v = byte;
      mag[b] = v * Math.sqrt(v);
    }
    const now = off / SR;
    const kick = bandStats(mag, ranges.kick[0], ranges.kick[1]);
    const tom = bandStats(mag, ranges.tom[0], ranges.tom[1]);
    const snareBody = bandStats(mag, ranges.snareBody[0], ranges.snareBody[1]);
    const snareWire = bandStats(mag, ranges.snareWire[0], ranges.snareWire[1]);
    const shimmer = bandStats(mag, ranges.shimmer[0], ranges.shimmer[1]);
    const hihat = bandStats(mag, ranges.hihat[0], ranges.hihat[1]);
    const snareFlux = snareBody.flux * 0.42 + snareWire.flux * 0.78;
    const s = sensitivity;
    const kS = medMad(hist.kick);
    const sS = medMad(hist.snare);
    const tS = medMad(hist.tom);
    const hS = medMad(hist.hat);
    const kThresh = Math.max(0.028 / s, kS.med * 1.85 + kS.mad * (2.1 / s) + 0.016 / s);
    const sThresh = Math.max(0.020 / s, sS.med * 1.85 + sS.mad * (2.1 / s) + 0.014 / s);
    const tThresh = Math.max(0.026 / s, tS.med * 1.95 + tS.mad * (2.2 / s) + 0.016 / s);
    const hThresh = Math.max(0.011 / s, hS.med * 1.65 + hS.mad * (1.85 / s) + 0.006 / s);
    let kickFired = false;
    let snareFired = false;
    if (kick.flux > kThresh && kick.energy > 0.14 / s && kick.flux >= prevFlux.kick * 0.85 && now - last.kick > 0.095) {
      last.kick = now; kickFired = true;
      hits.push({ time: now, piece: 'kick', strength: 1 });
    }
    if (snareFlux > sThresh && snareWire.energy > 0.038 / s && snareFlux >= prevFlux.snare * 0.85 && now - last.snare > 0.095 && (!kickFired || snareWire.flux > kick.flux * 0.28)) {
      last.snare = now; snareFired = true;
      hits.push({ time: now, piece: 'snare', strength: 1 });
    }
    if (!kickFired && !snareFired && now - last.kick > 0.055 && now - last.snare > 0.055 && tom.flux > tThresh && tom.energy > 0.13 / s && tom.flux > kick.flux * 1.1 && snareWire.flux < tom.flux * 0.55 && now - last.tom > 0.11) {
      last.tom = now;
      tomToggle = !tomToggle;
      hits.push({ time: now, piece: tomToggle ? 'tomHigh' : 'tomFloor', strength: 1 });
    }
    if (hihat.flux > hThresh && hihat.energy > 0.022 / s && hihat.flux >= prevFlux.hat * 0.85 && now - last.hihat > 0.068) {
      const isCrash = !snareFired && shimmer.flux > 0.055 / s && hihat.energy > 0.13 / s && hihat.flux > hThresh * 1.45 && hihat.flux > snareWire.flux * 0.85 && now - last.crash > 0.36;
      if (isCrash) {
        last.crash = now; last.hihat = now;
        hits.push({ time: now, piece: 'crash', strength: 1 });
      } else {
        last.hihat = now;
        hits.push({ time: now, piece: 'hatClosed', strength: 1 });
      }
    }
    hist.kick.push(kick.flux); hist.snare.push(snareFlux); hist.tom.push(tom.flux); hist.hat.push(hihat.flux);
    if (hist.kick.length > histLen) {
      hist.kick.shift(); hist.snare.shift(); hist.tom.shift(); hist.hat.shift();
    }
    prevFlux.kick = kick.flux; prevFlux.snare = snareFlux; prevFlux.tom = tom.flux; prevFlux.hat = hihat.flux;
    prevMag = mag;
  }
  return hits;
}

function score(gt, pred, tol) {
  const pieces = Array.from(new Set(gt.map((g) => g.piece).concat(pred.map((p) => p.piece)))).sort();
  const rows = {};
  for (const piece of pieces) {
    const G = gt.filter((g) => g.piece === piece);
    const P = pred.filter((p) => p.piece === piece);
    const used = new Array(P.length).fill(false);
    let tp = 0;
    for (const g of G) {
      let best = -1;
      let bestDt = tol;
      for (let i = 0; i < P.length; i++) {
        if (used[i]) continue;
        const dt = Math.abs(P[i].time - g.time);
        if (dt <= bestDt) { bestDt = dt; best = i; }
      }
      if (best >= 0) { used[best] = true; tp++; }
    }
    const fp = P.length - tp;
    const fn = G.length - tp;
    rows[piece] = {
      tp, fp, fn,
      nGt: G.length,
      nPred: P.length,
      prec: P.length ? tp / P.length : 0,
      rec: G.length ? tp / G.length : 0
    };
  }
  return rows;
}

function fmt(rows, order) {
  console.log('piece         gt  pred   tp   fp   fn   prec   recall');
  for (const p of order) {
    const r = rows[p] || { nGt: 0, nPred: 0, tp: 0, fp: 0, fn: 0, prec: 0, rec: 0 };
    console.log(
      p.padEnd(12),
      String(r.nGt).padStart(4),
      String(r.nPred).padStart(5),
      String(r.tp).padStart(5),
      String(r.fp).padStart(5),
      String(r.fn).padStart(5),
      r.prec.toFixed(2).padStart(7),
      r.rec.toFixed(2).padStart(8)
    );
  }
}

function macro(rows, pieces) {
  let ps = 0, rs = 0, n = 0;
  for (const p of pieces) {
    if (!rows[p] || !rows[p].nGt) continue;
    ps += rows[p].prec;
    rs += rows[p].rec;
    n++;
  }
  return { prec: n ? ps / n : 0, rec: n ? rs / n : 0, n };
}

const order = ['kick', 'snare', 'hatClosed', 'hatOpen', 'tomHigh', 'tomMid', 'tomFloor', 'ride', 'crash', 'crash2'];
const focus = ['kick', 'snare', 'hatClosed'];

const t0 = Date.now();
const song = buildMix();
console.log('mix', song.dur.toFixed(2), 's  gt', song.gt.length);
const tA = Date.now();
const seen = {};
const sampleTimes = [];
for (const g of song.gt) {
  if (!seen[g.piece]) { seen[g.piece] = true; sampleTimes.push(g); }
}
const hooks = { times: sampleTimes };
const candidates = DrumAnalyzer.analyze(song.audio, SR, () => {}, hooks);
for (const ft of hooks.features) {
  const t = ft.low + ft.floorE + ft.midE + ft.highE + ft.wire + ft.presence + ft.rideE + ft.hatE + 1e-9;
  console.log(
    ft.piece.padEnd(10),
    't', ft.time.toFixed(2),
    'low', (ft.low / t).toFixed(2),
    'fl', (ft.floorE / t).toFixed(2),
    'mid', (ft.midE / t).toFixed(2),
    'hiT', (ft.highE / t).toFixed(2),
    'wire', (ft.wire / t).toFixed(2),
    'ride', (ft.rideE / t).toFixed(2),
    'hat', (ft.hatE / t).toFixed(2),
    'pk', ft.peakHz.toFixed(0),
    'pkness', ft.peakiness.toFixed(2),
    'body', (ft.bodyHz || 0).toFixed(0) + '/' + (ft.bodyPeak || 0).toFixed(1),
    'cymPk', (ft.cymPeak || 0).toFixed(2),
    'dHat', ft.dHat.toFixed(2),
    'dLong', ft.dLong.toFixed(2),
    'dLow', ft.dLow.toFixed(2),
    'pLow', ft.percRatioLow.toFixed(2),
    'fluxK', ft.flux.kick.toFixed(3),
    'fluxS', ft.flux.snare.toFixed(3),
    'fluxH', ft.flux.hat.toFixed(3),
    'fluxR', ft.flux.ride.toFixed(3),
    'fluxTL', ft.flux.tomLow.toFixed(3),
    'fluxTH', (ft.flux.tomHigh || 0).toFixed(2),
    'hiPk', ((ft.flux.highPeak) || 0).toFixed(1),
    (ft.flux.highHz || 0).toFixed(0)
  );
}
const pred = DrumAnalyzer.selectHits(candidates, 1);
const tB = Date.now();
console.log('analyze', ((tB - tA) / 1000).toFixed(2), 's  candidates', candidates.length, 'selected', pred.length);
const legacy = runLegacy(song.audio);
console.log('legacy hits', legacy.length, 'total script', ((Date.now() - t0) / 1000).toFixed(2), 's');

console.log('\n=== OLD (previous realtime rules) ±50ms ===');
const oldRows = score(song.gt, legacy, 0.05);
fmt(oldRows, order);
const oldM = macro(oldRows, order);
const oldF = macro(oldRows, focus);
console.log('macro all', oldM.prec.toFixed(2), oldM.rec.toFixed(2), ' kick/snare/hat', oldF.prec.toFixed(2), oldF.rec.toFixed(2));

console.log('\n=== NEW (offline) ±50ms ===');
const newRows = score(song.gt, pred, 0.05);
fmt(newRows, order);
const newM = macro(newRows, order);
const newF = macro(newRows, focus);
console.log('macro all', newM.prec.toFixed(2), newM.rec.toFixed(2), ' kick/snare/hat', newF.prec.toFixed(2), newF.rec.toFixed(2));

const wavArg = process.argv.indexOf('--wav');
if (wavArg >= 0) {
  const outPath = process.argv[wavArg + 1] || '/tmp/kit-mix.wav';
  const pcm = song.audio;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length * 2, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length * 2, 40);
  const body = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) {
    let v = Math.max(-1, Math.min(1, pcm[i]));
    body.writeInt16LE((v * 32767) | 0, i * 2);
  }
  fs.writeFileSync(outPath, Buffer.concat([header, body]));
  console.log('wrote', outPath);
}

// Show a few false positives for tuning
const tol = 0.05;
for (const p of order) {
  const G = song.gt.filter((g) => g.piece === p);
  const P = pred.filter((x) => x.piece === p);
  const fps = P.filter((hit) => !G.some((g) => Math.abs(g.time - hit.time) <= tol));
  if (fps.length) {
    console.log('FP', p, fps.slice(0, 6).map((h) => h.time.toFixed(2) + '@' + h.strength.toFixed(2)).join(' '));
  }
}
