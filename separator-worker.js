/* Drum-stem separator. Open-Unmix UMX-HQ drums (MIT) via onnxruntime-web.
   STFT in, magnitude estimate out, mixture phase back. Chunked so a phone
   can run a whole song without holding the full spectrogram. */
importScripts('./vendor/ort.wasm.min.js');

const NFFT = 4096;
const HOP = 1024;
const BINS = NFFT / 2 + 1;
const SR = 44100;

function hannPeriodic(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}
const WINDOW = hannPeriodic(NFFT);

function fftRadix2(re, im, inverse) {
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
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = sign * 2 * Math.PI / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i0 = 0; i0 < n; i0 += len) {
      let wRe = 1, wIm = 0;
      const half = len >> 1;
      for (let j0 = 0; j0 < half; j0++) {
        const uRe = re[i0 + j0], uIm = im[i0 + j0];
        const pRe = re[i0 + j0 + half], pIm = im[i0 + j0 + half];
        const vRe = pRe * wRe - pIm * wIm;
        const vIm = pRe * wIm + pIm * wRe;
        re[i0 + j0] = uRe + vRe;
        im[i0 + j0] = uIm + vIm;
        re[i0 + j0 + half] = uRe - vRe;
        im[i0 + j0 + half] = uIm - vIm;
        const nw = wRe * wr - wIm * wi;
        wIm = wRe * wi + wIm * wr;
        wRe = nw;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

function stftChannel(samples) {
  const pad = NFFT / 2;
  const padded = new Float32Array(samples.length + NFFT);
  for (let i = 0; i < pad; i++) {
    padded[i] = samples[Math.min(samples.length - 1, pad - i)] || 0;
    padded[pad + samples.length + i] = samples[Math.max(0, samples.length - 2 - i)] || 0;
  }
  padded.set(samples, pad);
  const frames = 1 + Math.floor((padded.length - NFFT) / HOP);
  const re = new Float32Array(frames * BINS);
  const im = new Float32Array(frames * BINS);
  const fre = new Float32Array(NFFT);
  const fim = new Float32Array(NFFT);
  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let n = 0; n < NFFT; n++) { fre[n] = padded[off + n] * WINDOW[n]; fim[n] = 0; }
    fftRadix2(fre, fim, false);
    const base = f * BINS;
    for (let b = 0; b < BINS; b++) { re[base + b] = fre[b]; im[base + b] = fim[b]; }
  }
  return { re, im, frames };
}

function istftChannel(reSpec, imSpec, frames, outLen) {
  const out = new Float32Array(outLen + NFFT);
  const norm = new Float32Array(outLen + NFFT);
  const fre = new Float32Array(NFFT);
  const fim = new Float32Array(NFFT);
  for (let f = 0; f < frames; f++) {
    fre.fill(0); fim.fill(0);
    const base = f * BINS;
    for (let b = 0; b < BINS; b++) { fre[b] = reSpec[base + b]; fim[b] = imSpec[base + b]; }
    for (let b = 1; b < BINS - 1; b++) { fre[NFFT - b] = fre[b]; fim[NFFT - b] = -fim[b]; }
    fftRadix2(fre, fim, true);
    const pos0 = f * HOP;
    for (let n = 0; n < NFFT; n++) {
      const idx = pos0 + n;
      out[idx] += fre[n] * WINDOW[n];
      norm[idx] += WINDOW[n] * WINDOW[n];
    }
  }
  const y = new Float32Array(outLen);
  const pad = NFFT / 2;
  for (let i = 0; i < outLen; i++) {
    const nrm = norm[i + pad];
    y[i] = nrm > 1e-8 ? out[i + pad] / nrm : 0;
  }
  return y;
}

async function loadCached(url) {
  const cache = await caches.open('drum-models-v1');
  const abs = new URL(url, self.location.href).href;
  let res = await cache.match(abs);
  if (!res) {
    res = await fetch(url);
    if (!res.ok) throw new Error('fetch ' + url + ' ' + res.status);
    await cache.put(abs, res.clone());
  }
  return res.arrayBuffer();
}

let session = null;
async function getSession(onProgress) {
  if (session) return session;
  onProgress(0.02);
  self.ort.env.wasm.wasmPaths = new URL('./vendor/', self.location.href).href;
  self.ort.env.wasm.numThreads = 1;
  self.ort.env.wasm.simd = true;
  const model = await loadCached('./models/umxhq-drums.onnx');
  onProgress(0.12);
  session = await self.ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  onProgress(0.18);
  return session;
}

function applyMask(re, im, frames, drumMag) {
  const outRe = new Float32Array(re.length);
  const outIm = new Float32Array(im.length);
  for (let i = 0; i < re.length; i++) {
    const m = Math.hypot(re[i], im[i]) + 1e-8;
    let s = drumMag[i] / m;
    if (s < 0) s = 0;
    if (s > 4) s = 4;
    outRe[i] = re[i] * s;
    outIm[i] = im[i] * s;
  }
  return { re: outRe, im: outIm };
}

self.onmessage = async (event) => {
  const data = event.data || {};
  const id = data.id;
  const post = (progress) => self.postMessage({ type: 'progress', id, progress });
  try {
    const sess = await getSession(post);
    const leftIn = data.left;
    const rightIn = data.right || data.left;
    const length = leftIn.length;
    const chunkSamples = HOP * 280;
    const overlap = HOP * 40;
    const outL = new Float32Array(length);
    const outR = new Float32Array(length);
    const weight = new Float32Array(length);
    let start = 0;
    let done = 0;
    const total = Math.max(1, Math.ceil(length / Math.max(1, chunkSamples - overlap)));
    while (start < length) {
      const a = start;
      const b = Math.min(length, start + chunkSamples);
      const n = b - a;
      const l = leftIn.subarray(a, b);
      const r = rightIn.subarray(a, b);
      const stL = stftChannel(l);
      const stR = stftChannel(r);
      const frames = stL.frames;
      const mag = new Float32Array(2 * BINS * frames);
      for (let ch = 0; ch < 2; ch++) {
        const srcRe = ch === 0 ? stL.re : stR.re;
        const srcIm = ch === 0 ? stL.im : stR.im;
        const base = ch * BINS * frames;
        for (let bin = 0; bin < BINS; bin++) {
          for (let f = 0; f < frames; f++) {
            const s = f * BINS + bin;
            mag[base + bin * frames + f] = Math.hypot(srcRe[s], srcIm[s]);
          }
        }
      }
      const inputName = sess.inputNames[0];
      const output = await sess.run({ [inputName]: new self.ort.Tensor('float32', mag, [1, 2, BINS, frames]) });
      const drum = output[sess.outputNames[0]].data;
      function channelMag(ch) {
        const src = new Float32Array(frames * BINS);
        const base = ch * BINS * frames;
        for (let bin = 0; bin < BINS; bin++) {
          for (let f = 0; f < frames; f++) src[f * BINS + bin] = drum[base + bin * frames + f];
        }
        return src;
      }
      const maskedL = applyMask(stL.re, stL.im, frames, channelMag(0));
      const maskedR = applyMask(stR.re, stR.im, frames, channelMag(1));
      const yL = istftChannel(maskedL.re, maskedL.im, frames, n);
      const yR = istftChannel(maskedR.re, maskedR.im, frames, n);
      const keepFrom = start === 0 ? 0 : overlap;
      const keepTo = n;
      for (let i = keepFrom; i < keepTo; i++) {
        const dest = a + i;
        if (dest >= length) break;
        const fade = i < keepFrom + overlap && start !== 0 ? (i - keepFrom) / overlap : 1;
        outL[dest] += yL[i] * fade;
        outR[dest] += yR[i] * fade;
        weight[dest] += fade;
      }
      done += 1;
      post(0.18 + 0.8 * (done / total));
      start = b - overlap;
      if (b >= length) break;
    }
    for (let i = 0; i < length; i++) {
      if (weight[i] > 1e-6) { outL[i] /= weight[i]; outR[i] /= weight[i]; }
    }
    post(1);
    self.postMessage({ type: 'done', id, sampleRate: SR, left: outL, right: outR }, [outL.buffer, outR.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err && err.message ? err.message : err) });
  }
};
