/* Offline drum transcription.
   Times are backtracked to the start of each attack, then lightly snapped
   to a beat grid when the tempo is clear. No network, no dependencies. */
(function (root) {
  'use strict';

  var TARGET_SR = 22050;
  var NFFT = 1024;
  var HOP = 256;

  var GAPS = {
    kick: 0.09,
    snare: 0.08,
    hatClosed: 0.045,
    hatOpen: 0.08,
    tomHigh: 0.07,
    tomMid: 0.07,
    tomFloor: 0.08,
    ride: 0.055,
    crash: 0.28,
    crash2: 0.28
  };

  var PIECES = ['kick', 'snare', 'hatClosed', 'hatOpen', 'tomHigh', 'tomMid', 'tomFloor', 'ride', 'crash', 'crash2'];

  function hann(n) {
    var w = new Float32Array(n);
    for (var i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    return w;
  }

  function fft(re, im) {
    var n = re.length;
    for (var i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var tr = re[i]; re[i] = re[j]; re[j] = tr;
        var ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = (-2 * Math.PI) / len;
      var wr = Math.cos(ang);
      var wi = Math.sin(ang);
      for (var i0 = 0; i0 < n; i0 += len) {
        var wRe = 1, wIm = 0;
        var half = len >> 1;
        for (var j0 = 0; j0 < half; j0++) {
          var uRe = re[i0 + j0], uIm = im[i0 + j0];
          var pRe = re[i0 + j0 + half], pIm = im[i0 + j0 + half];
          var vRe = pRe * wRe - pIm * wIm;
          var vIm = pRe * wIm + pIm * wRe;
          re[i0 + j0] = uRe + vRe;
          im[i0 + j0] = uIm + vIm;
          re[i0 + j0 + half] = uRe - vRe;
          im[i0 + j0 + half] = uIm - vIm;
          var nw = wRe * wr - wIm * wi;
          wIm = wRe * wi + wIm * wr;
          wRe = nw;
        }
      }
    }
  }

  function resample(input, fromSr, toSr) {
    if (fromSr === toSr) return input;
    var outLen = Math.max(1, Math.floor(input.length * toSr / fromSr));
    var out = new Float32Array(outLen);
    var ratio = fromSr / toSr;
    var last = input.length - 1;
    for (var i = 0; i < outLen; i++) {
      var x = i * ratio;
      var i0 = x | 0;
      if (i0 >= last) { out[i] = input[last]; continue; }
      var f = x - i0;
      out[i] = input[i0] * (1 - f) + input[i0 + 1] * f;
    }
    return out;
  }

  function normalize(x) {
    var peak = 0;
    for (var i = 0; i < x.length; i++) {
      var a = x[i] < 0 ? -x[i] : x[i];
      if (a > peak) peak = a;
    }
    if (peak < 1e-6) return x;
    var y = new Float32Array(x.length);
    var g = 0.98 / peak;
    for (var j = 0; j < x.length; j++) y[j] = x[j] * g;
    return y;
  }

  function binOf(sr, hz) {
    var b = Math.round(hz * NFFT / sr);
    if (b < 1) b = 1;
    if (b > (NFFT >> 1) - 1) b = (NFFT >> 1) - 1;
    return b;
  }

  function superflux(spec, frame, nBins, b0, b1) {
    var prev = frame - 1;
    if (prev < 0) return 0;
    var s = 0;
    var base = frame * nBins;
    var pbase = prev * nBins;
    for (var b = b0; b <= b1; b++) {
      var cur = Math.log(1 + spec[base + b]);
      var mx = Math.log(1 + spec[pbase + b]);
      if (b > b0) {
        var left = Math.log(1 + spec[pbase + b - 1]);
        if (left > mx) mx = left;
      }
      if (b < b1) {
        var right = Math.log(1 + spec[pbase + b + 1]);
        if (right > mx) mx = right;
      }
      var d = cur - mx;
      if (d > 0) s += d;
    }
    return s;
  }

  function median(arr, a, b) {
    var n = b - a + 1;
    var tmp = new Float32Array(n);
    for (var i = 0; i < n; i++) tmp[i] = arr[a + i];
    for (var i2 = 1; i2 < n; i2++) {
      var v = tmp[i2];
      var j = i2 - 1;
      while (j >= 0 && tmp[j] > v) { tmp[j + 1] = tmp[j]; j--; }
      tmp[j + 1] = v;
    }
    return tmp[n >> 1];
  }

  function backtrack(env, peak) {
    var hopSec = HOP / TARGET_SR;
    // Walk back only to the start of the rise, and never more than ~35 ms.
    // A longer walk lands before the attack librosa reports.
    var limit = peak - Math.round(0.02 / hopSec);
    if (limit < 1) limit = 1;
    var i = peak;
    while (i > limit && env[i - 1] <= env[i]) i--;
    return i;
  }

  function pickPeaks(env, minGapSec) {
    var hopSec = HOP / TARGET_SR;
    var win = Math.max(4, Math.round(0.28 / hopSec));
    var minDist = Math.max(1, Math.round(minGapSec / hopSec));
    var peaks = [];
    var last = -999;
    for (var i = 2; i < env.length - 2; i++) {
      if (env[i] < env[i - 1] || env[i] <= env[i + 1]) continue;
      var a = i - win; if (a < 0) a = 0;
      var b = i + win; if (b >= env.length) b = env.length - 1;
      var med = median(env, a, b);
      var dev = 0;
      var count = b - a + 1;
      for (var k = a; k <= b; k++) dev += Math.abs(env[k] - med);
      var mad = dev / count;
      var thresh = med + mad * 3.4 + med * 0.55 + 1e-8;
      if (env[i] < thresh) continue;
      var bt = backtrack(env, i);
      if (bt - last < minDist && peaks.length) {
        if (env[i] / thresh > peaks[peaks.length - 1].strength) {
          peaks[peaks.length - 1] = { frame: bt, peak: i, time: (bt * HOP + NFFT / 2) / TARGET_SR, strength: env[i] / thresh };
          last = bt;
        }
        continue;
      }
      peaks.push({ frame: bt, peak: i, time: (bt * HOP + NFFT / 2) / TARGET_SR, strength: env[i] / thresh });
      last = bt;
    }
    return peaks;
  }

  function estimateGrid(env) {
    var hopSec = HOP / TARGET_SR;
    var minLag = Math.round(0.33 / hopSec);
    var maxLag = Math.round(0.9 / hopSec);
    if (maxLag >= env.length) return null;
    var bestLag = minLag;
    var best = 0;
    var second = 0;
    var step = 1;
    for (var lag = minLag; lag <= maxLag; lag += step) {
      var s = 0;
      var n = 0;
      for (var i = 0; i + lag < env.length; i += 2) {
        s += env[i] * env[i + lag];
        n++;
      }
      s /= n || 1;
      if (s > best) { second = best; best = s; bestLag = lag; }
      else if (s > second) second = s;
    }
    var bpm = 60 / (bestLag * hopSec);
    if (bpm < 70) { bpm *= 2; bestLag = Math.round(bestLag / 2); }
    if (bpm > 180) { bpm /= 2; bestLag *= 2; }
    var bestPhase = 0;
    var bestScore = -1;
    for (var phase = 0; phase < bestLag; phase += 1) {
      var sc = 0;
      var c = 0;
      for (var t = phase; t < env.length; t += bestLag) { sc += env[t]; c++; }
      sc /= c || 1;
      if (sc > bestScore) { bestScore = sc; bestPhase = phase; }
    }
    return {
      bpm: bpm,
      lag: bestLag,
      phase: bestPhase,
      hopSec: hopSec,
      confidence: best / (second + 1e-9)
    };
  }

  function snapTime(time, grid) {
    if (!grid || grid.confidence < 1.45) return time;
    var beat = 60 / grid.bpm;
    var step = beat / 4;
    var origin = grid.phase * grid.hopSec;
    var k = Math.round((time - origin) / step);
    var g = origin + k * step;
    var err = g - time;
    if (err < 0) err = -err;
    if (err <= 0.022) return g;
    return time;
  }

  function bandSum(spec, frame, nBins, b0, b1) {
    var s = 0;
    var base = frame * nBins;
    for (var b = b0; b <= b1; b++) s += spec[base + b];
    return s;
  }

  function peakHzIn(spec, frame, nBins, sr, f0, f1) {
    var b0 = binOf(sr, f0);
    var b1 = binOf(sr, f1);
    var maxV = 0;
    var maxB = b0;
    var sum = 0;
    var n = 0;
    var base = frame * nBins;
    for (var b = b0; b <= b1; b++) {
      var v = spec[base + b];
      sum += v;
      n++;
      if (v > maxV) { maxV = v; maxB = b; }
    }
    return { hz: maxB * sr / NFFT, peakiness: maxV / ((sum / (n || 1)) + 1e-9), sum: sum };
  }

  function classify(spec, nBins, sr, frame, nFrames, peaks) {
    if (frame < 1) frame = 1;
    if (frame > nFrames - 8) frame = nFrames - 8;
    var look = Math.min(nFrames - 1, frame + 3);
    var low = bandSum(spec, look, nBins, binOf(sr, 35), binOf(sr, 130));
    var body = bandSum(spec, look, nBins, binOf(sr, 160), binOf(sr, 420));
    var wire = bandSum(spec, look, nBins, binOf(sr, 1200), binOf(sr, 5000));
    var ride = bandSum(spec, look, nBins, binOf(sr, 2800), binOf(sr, 7500));
    var hat = bandSum(spec, look, nBins, binOf(sr, 6500), binOf(sr, 11000));
    var hatLater = bandSum(spec, Math.min(nFrames - 1, frame + 8), nBins, binOf(sr, 5000), binOf(sr, 11000));
    var cymNow = ride + hat + 1e-6;
    var dHat = hatLater / cymNow;
    var lowPeak = peakHzIn(spec, look, nBins, sr, 40, 180);
    var bodyPeak = peakHzIn(spec, look, nBins, sr, 140, 320);
    var highPeak = peakHzIn(spec, look, nBins, sr, 240, 520);
    var cymPeak = peakHzIn(spec, look, nBins, sr, 2500, 8000);
    var out = [];
    function add(piece) {
      if (out.indexOf(piece) < 0) out.push(piece);
    }
    if (peaks.kick && low > body * 0.8 && lowPeak.hz < 140 && lowPeak.peakiness < 8) add('kick');
    if (peaks.tomLow && !peaks.kick && lowPeak.hz >= 95 && lowPeak.hz < 170 && lowPeak.peakiness > 1.8 && wire < low) add('tomFloor');
    if (peaks.snare && wire > hat * 0.55 && bodyPeak.hz >= 150 && bodyPeak.hz <= 280 && dHat < 0.55) add('snare');
    if (peaks.tomMid && !peaks.snare && bodyPeak.peakiness > 1.8 && bodyPeak.hz >= 155 && bodyPeak.hz < 250 && body > wire * 0.35) add('tomMid');
    if (peaks.tomHigh && !peaks.snare && highPeak.peakiness > 1.7 && highPeak.hz >= 250 && highPeak.hz < 520 && highPeak.sum > wire * 0.4) add('tomHigh');
    if (peaks.hat || peaks.ride) {
      if (dHat > 0.55 && cymPeak.peakiness < 8) add(cymPeak.peakiness < 4.2 ? 'crash' : 'crash2');
      else if (peaks.ride && cymPeak.peakiness >= 5 && dHat < 0.5) add('ride');
      else if (peaks.hat) add(dHat > 0.22 ? 'hatOpen' : 'hatClosed');
    }
    return out;
  }

  function analyze(samples, sampleRate, onProgress) {
    var progress = onProgress || function () {};
    var mono = normalize(resample(samples, sampleRate || TARGET_SR, TARGET_SR));
    if (mono.length < NFFT + HOP * 4) { progress(1); return []; }
    var sr = TARGET_SR;
    var nBins = NFFT >> 1;
    var nFrames = Math.floor((mono.length - NFFT) / HOP);
    var spec = new Float32Array(nFrames * nBins);
    var win = hann(NFFT);
    var re = new Float32Array(NFFT);
    var im = new Float32Array(NFFT);
    for (var f = 0; f < nFrames; f++) {
      var off = f * HOP;
      for (var i = 0; i < NFFT; i++) { re[i] = mono[off + i] * win[i]; im[i] = 0; }
      fft(re, im);
      var base = f * nBins;
      for (var b = 0; b < nBins; b++) spec[base + b] = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      if ((f & 127) === 0) progress(0.05 + 0.55 * (f / nFrames));
    }

    var bands = {
      kick: [binOf(sr, 40), binOf(sr, 140)],
      snare: [binOf(sr, 180), binOf(sr, 4500)],
      hat: [binOf(sr, 6000), binOf(sr, 11000)],
      ride: [binOf(sr, 3000), binOf(sr, 8000)],
      tomLow: [binOf(sr, 80), binOf(sr, 160)],
      tomMid: [binOf(sr, 150), binOf(sr, 260)],
      tomHigh: [binOf(sr, 240), binOf(sr, 500)]
    };
    var names = Object.keys(bands);
    var flux = {};
    var combo = new Float32Array(nFrames);
    for (var ni = 0; ni < names.length; ni++) flux[names[ni]] = new Float32Array(nFrames);
    for (var frame = 1; frame < nFrames; frame++) {
      var acc = 0;
      for (var ni2 = 0; ni2 < names.length; ni2++) {
        var range = bands[names[ni2]];
        var v = superflux(spec, frame, nBins, range[0], range[1]);
        flux[names[ni2]][frame] = v;
        acc += v;
      }
      combo[frame] = acc;
    }
    progress(0.7);

    var hopSec = HOP / sr;
    var events = [];
    function collect(name, gap) {
      var peaks = pickPeaks(flux[name], gap);
      for (var i = 0; i < peaks.length; i++) {
        events.push({
          band: name,
          time: peaks[i].time,
          frame: peaks[i].frame,
          strength: peaks[i].strength
        });
      }
    }
    collect('kick', 0.09);
    collect('snare', 0.07);
    collect('hat', 0.042);
    collect('ride', 0.05);
    collect('tomLow', 0.08);
    collect('tomMid', 0.08);
    collect('tomHigh', 0.08);
    events.sort(function (a, b) { return a.time - b.time; });

    var grid = estimateGrid(combo);
    progress(0.84);

    var candidates = [];
    var i = 0;
    while (i < events.length) {
      var j = i + 1;
      while (j < events.length && events[j].time - events[i].time < 0.03) j++;
      var cluster = events.slice(i, j);
      var flags = {};
      for (var c = 0; c < cluster.length; c++) flags[cluster[c].band] = true;
      var frameIdx = cluster[0].frame;
      for (var c2 = 1; c2 < cluster.length; c2++) if (cluster[c2].frame < frameIdx) frameIdx = cluster[c2].frame;
      var labels = classify(spec, nBins, sr, frameIdx, nFrames, flags);
      for (var L = 0; L < labels.length; L++) {
        var piece = labels[L];
        var str = 0;
        var t = cluster[0].time;
        for (var c3 = 0; c3 < cluster.length; c3++) {
          if (cluster[c3].strength > str) {
            str = cluster[c3].strength;
            t = cluster[c3].time;
          }
        }
        t = snapTime(t, grid);
        if (t < 0) t = 0;
        pushGap(candidates, piece, t, str);
      }
      i = j;
    }
    candidates.sort(function (a, b) { return a.time - b.time; });
    progress(1);
    return candidates;
  }

  function pushGap(list, piece, time, strength) {
    var gap = GAPS[piece] || 0.07;
    for (var i = list.length - 1; i >= 0 && list[i].time > time - gap - 0.02; i--) {
      if (list[i].piece !== piece) continue;
      if (time - list[i].time < gap) {
        if (strength > list[i].strength) {
          list[i].time = time;
          list[i].strength = strength;
        }
        return;
      }
    }
    list.push({ time: time, piece: piece, strength: strength });
  }

  function selectHits(candidates, sensitivity) {
    var s = sensitivity || 1;
    if (s < 0.4) s = 0.4;
    if (s > 2.2) s = 2.2;
    var minStrength = 1 / s;
    var filtered = [];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].strength >= minStrength) filtered.push(candidates[i]);
    }
    filtered.sort(function (a, b) { return a.time - b.time; });
    var last = {};
    var out = [];
    for (var j = 0; j < filtered.length; j++) {
      var h = filtered[j];
      var prev = last[h.piece];
      if (prev == null || h.time - prev >= (GAPS[h.piece] || 0.07)) {
        out.push(h);
        last[h.piece] = h.time;
      }
    }
    return out;
  }

  function classifyLive(bands) {
    var peaks = bands.peakBands || {};
    var fake = {
      kick: !!peaks.kick,
      snare: !!peaks.snare,
      hat: !!peaks.hat,
      ride: !!peaks.ride,
      tomLow: !!peaks.tomLow,
      tomMid: !!peaks.tomMid,
      tomHigh: !!peaks.tomHigh
    };
    var labels = [];
    var low = bands.low || 0;
    var wire = bands.wire || 0;
    var hat = bands.hatE || 0;
    var ride = bands.rideE || 0;
    var dHat = bands.dHat == null ? 0.15 : bands.dHat;
    if (fake.kick && low >= (bands.midE || 0)) labels.push('kick');
    if (fake.snare && wire > hat * 0.5) labels.push('snare');
    if (fake.tomHigh) labels.push('tomHigh');
    if (fake.tomMid && labels.indexOf('snare') < 0) labels.push('tomMid');
    if (fake.tomLow && labels.indexOf('kick') < 0) labels.push('tomFloor');
    if (fake.hat || fake.ride) {
      if (dHat > 0.5) labels.push('crash');
      else if (fake.ride && ride > hat) labels.push('ride');
      else labels.push(dHat > 0.22 ? 'hatOpen' : 'hatClosed');
    }
    var out = [];
    for (var i = 0; i < labels.length; i++) out.push({ piece: labels[i], strength: bands.strength || 1 });
    return out;
  }

  root.DrumAnalyzer = {
    analyze: analyze,
    selectHits: selectHits,
    classifyLive: classifyLive,
    PIECES: PIECES,
    TARGET_SR: TARGET_SR
  };
})(typeof self !== 'undefined' ? self : globalThis);
