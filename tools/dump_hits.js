#!/usr/bin/env node
'use strict';
const fs = require('fs');
const vm = require('vm');

function readWav(path) {
  const buf = fs.readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not wav');
  let off = 12;
  let rate = 44100;
  let channels = 1;
  let bits = 16;
  let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(start + 2);
      rate = buf.readUInt32LE(start + 4);
      bits = buf.readUInt16LE(start + 14);
    } else if (id === 'data') {
      data = buf.subarray(start, start + size);
      break;
    }
    off = start + size + (size % 2);
  }
  const samples = bits === 16 ? data.length / 2 / channels : data.length / 4 / channels;
  const out = new Float32Array(samples);
  if (bits === 16) {
    for (let i = 0; i < samples; i++) {
      let s = 0;
      for (let c = 0; c < channels; c++) s += data.readInt16LE((i * channels + c) * 2);
      out[i] = s / channels / 32768;
    }
  } else {
    for (let i = 0; i < samples; i++) {
      let s = 0;
      for (let c = 0; c < channels; c++) s += data.readFloatLE((i * channels + c) * 4);
      out[i] = s / channels;
    }
  }
  return { samples: out, sampleRate: rate };
}

function loadAnalyzer(path) {
  const context = { console, Math, Float32Array, Array, Object };
  context.globalThis = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path, 'utf8'), context);
  return context.DrumAnalyzer;
}

const wavPath = process.argv[2];
const which = process.argv[3] || 'new';
const audio = readWav(wavPath);
const analyzer = loadAnalyzer(which === 'old' ? '/tmp/analyzer-before.js' : '/workspace/analyzer.js');
const t0 = Date.now();
const candidates = analyzer.analyze(audio.samples, audio.sampleRate, () => {});
const hits = analyzer.selectHits(candidates, 1);
const ms = Date.now() - t0;
process.stdout.write(JSON.stringify({
  ms: ms,
  duration: audio.samples.length / audio.sampleRate,
  hits: hits.map((h) => ({ time: Math.round(h.time * 1000) / 1000, piece: h.piece, strength: Math.round(h.strength * 100) / 100 }))
}));
