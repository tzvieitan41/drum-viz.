/* Offline drum-kit transcription for uploaded audio.
   Pure JS, no dependencies. Used by the page and by analyzer-worker.js. */
(function (root) {
  'use strict';

  var TARGET_SR = 22050;
  var NFFT = 1024;
  var HOP = 512;
  var TIME_MED = 5;
  var FREQ_MED = 15;
  var STORE_FLOOR = 0.55;

  var GAPS = {
    kick: 0.14,
    snare: 0.075,
    hatClosed: 0.048,
    hatOpen: 0.09,
    tomHigh: 0.075,
    tomMid: 0.075,
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

  function fftRadix2(re, im) {
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
      var wlenRe = Math.cos(ang);
      var wlenIm = Math.sin(ang);
      for (var i0 = 0; i0 < n; i0 += len) {
        var wRe = 1;
        var wIm = 0;
        var half = len >> 1;
        for (var j0 = 0; j0 < half; j0++) {
          var uRe = re[i0 + j0];
          var uIm = im[i0 + j0];
          var pRe = re[i0 + j0 + half];
          var pIm = im[i0 + j0 + half];
          var vRe = pRe * wRe - pIm * wIm;
          var vIm = pRe * wIm + pIm * wRe;
          re[i0 + j0] = uRe + vRe;
          im[i0 + j0] = uIm + vIm;
          re[i0 + j0 + half] = uRe - vRe;
          im[i0 + j0 + half] = uIm - vIm;
          var nwRe = wRe * wlenRe - wIm * wlenIm;
          wIm = wRe * wlenIm + wIm * wlenRe;
          wRe = nwRe;
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
      if (i0 >= last) {
        out[i] = input[last];
        continue;
      }
      var f = x - i0;
      out[i] = input[i0] * (1 - f) + input[i0 + 1] * f;
    }
    return out;
  }

  function peakNormalize(x) {
    var peak = 0;
    for (var i = 0; i < x.length; i++) {
      var a = x[i] < 0 ? -x[i] : x[i];
      if (a > peak) peak = a;
    }
    if (peak < 1e-6) return x;
    var g = 0.98 / peak;
    var y = new Float32Array(x.length);
    for (var j = 0; j < x.length; j++) y[j] = x[j] * g;
    return y;
  }

  function medianInto(src, n) {
    for (var i = 1; i < n; i++) {
      var v = src[i];
      var j = i - 1;
      while (j >= 0 && src[j] > v) {
        src[j + 1] = src[j];
        j--;
      }
      src[j + 1] = v;
    }
    return src[n >> 1];
  }

  function binHz(sr, hz) {
    return Math.max(1, Math.min((NFFT >> 1) - 1, Math.round(hz * NFFT / sr)));
  }

  function bandMean(spec, frame, nBins, b0, b1) {
    if (b1 < b0) return 0;
    var s = 0;
    var base = frame * nBins;
    for (var b = b0; b <= b1; b++) s += spec[base + b];
    return s / (b1 - b0 + 1);
  }

function analyze(samples, sampleRate, onProgress, hooks) {
  var progress = onProgress || function () {};
  hooks = hooks || null;
    var srIn = sampleRate || TARGET_SR;
    var mono = peakNormalize(resample(samples, srIn, TARGET_SR));
    var sr = TARGET_SR;
    if (mono.length < NFFT + HOP) {
      progress(1);
      return [];
    }

    var nBins = NFFT >> 1;
    var nFrames = Math.floor((mono.length - NFFT) / HOP);
    var spec = new Float32Array(nFrames * nBins);
    var win = hann(NFFT);
    var re = new Float32Array(NFFT);
    var im = new Float32Array(NFFT);

    for (var f = 0; f < nFrames; f++) {
      var off = f * HOP;
      re.fill(0);
      im.fill(0);
      for (var i = 0; i < NFFT; i++) re[i] = mono[off + i] * win[i];
      fftRadix2(re, im);
      var base = f * nBins;
      for (var b = 0; b < nBins; b++) {
        var mr = re[b];
        var mi = im[b];
        spec[base + b] = Math.sqrt(mr * mr + mi * mi);
      }
      if ((f & 255) === 0) progress(0.05 + 0.45 * (f / nFrames));
    }
    progress(0.52);

    var perc = hpss(spec, nFrames, nBins, binHz(sr, 700));
    progress(0.72);

    var bands = buildBands(sr);
    var fluxes = {};
    var names = ['kick', 'snare', 'hat', 'ride', 'tomLow', 'tomMid', 'tomHigh', 'broad'];
    for (var ni = 0; ni < names.length; ni++) fluxes[names[ni]] = new Float32Array(nFrames);

    for (var frame = 1; frame < nFrames; frame++) {
      // Tonal drums (kick, toms) are sines, so a median HPSS treats them as harmonic.
      // Their onsets are read from the raw spectrogram and kept only if the note
      // actually decays (bass and guitar sustain fail that test).
      // Noise drums use the raw high bands, where bass and guitar do not live.
      fluxes.kick[frame] = logFlux(spec, frame, nBins, bands.kick[0], bands.kick[1], 4);
      fluxes.tomLow[frame] = logFlux(spec, frame, nBins, bands.tomLow[0], bands.tomLow[1], 4);
      fluxes.tomMid[frame] = logFlux(spec, frame, nBins, bands.tomMid[0], bands.tomMid[1], 4);
      fluxes.tomHigh[frame] = logFlux(spec, frame, nBins, bands.tomHigh[0], bands.tomHigh[1], 4);
      fluxes.snare[frame] = logFlux(spec, frame, nBins, bands.wire[0], bands.wire[1]);
      fluxes.hat[frame] = logFlux(spec, frame, nBins, bands.hat[0], bands.hat[1]);
      fluxes.ride[frame] = logFlux(spec, frame, nBins, bands.ride[0], bands.ride[1]);
      fluxes.broad[frame] = logFlux(perc, frame, nBins, bands.broad[0], bands.broad[1]);
    }
    progress(0.8);

    var hopSec = HOP / sr;
    var look = Math.max(4, Math.round(0.32 / hopSec));
    var events = [];
    collectPeaks(events, fluxes.kick, 'kick', hopSec, look, 0.14);
    collectPeaks(events, fluxes.snare, 'snare', hopSec, look, 0.07);
    collectPeaks(events, fluxes.hat, 'hat', hopSec, look, 0.045);
    collectPeaks(events, fluxes.ride, 'ride', hopSec, look, 0.05);
    collectPeaks(events, fluxes.tomLow, 'tomLow', hopSec, look, 0.07);
    collectPeaks(events, fluxes.tomMid, 'tomMid', hopSec, look, 0.07);
    collectPeaks(events, fluxes.tomHigh, 'tomHigh', hopSec, look, 0.07);
    events.sort(function (a, b) { return a.time - b.time; });

    var candidates = [];
    var i = 0;
    while (i < events.length) {
      var j = i + 1;
      while (j < events.length && events[j].time - events[i].time < 0.035) j++;
      var cluster = events.slice(i, j);
      var bandSet = {};
      for (var c0 = 0; c0 < cluster.length; c0++) bandSet[cluster[c0].band] = true;
      for (var c = 0; c < cluster.length; c++) {
        var feat = featuresAt(spec, perc, nFrames, nBins, sr, cluster[c].frame);
        feat.peakBands = bandSet;
        feat.clusterStrength = cluster[c].strength;
        var labels = classifyFeatures(feat);
        for (var L = 0; L < labels.length; L++) {
          var piece = labels[L];
          if (!labelMatchesBand(piece, cluster[c].band)) continue;
          var str = cluster[c].strength;
          if (str < STORE_FLOOR) continue;
          var t = cluster[c].time - 0.012;
          if (t < 0) t = 0;
          pushGap(candidates, piece, t, str);
        }
      }
      i = j;
    }

    candidates.sort(function (a, b) { return a.time - b.time || (a.piece < b.piece ? -1 : 1); });
    if (hooks && hooks.times) {
      hooks.features = [];
      for (var ti = 0; ti < hooks.times.length; ti++) {
        var fr = Math.round(hooks.times[ti].time / hopSec);
        var bandName = hooks.times[ti].piece === 'snare' ? 'snare'
          : hooks.times[ti].piece === 'hatClosed' || hooks.times[ti].piece === 'hatOpen' ? 'hat'
          : hooks.times[ti].piece === 'ride' ? 'ride'
          : hooks.times[ti].piece === 'crash' || hooks.times[ti].piece === 'crash2' ? 'ride'
          : hooks.times[ti].piece === 'tomHigh' ? 'tomHigh'
          : hooks.times[ti].piece === 'tomMid' ? 'tomMid'
          : hooks.times[ti].piece === 'tomFloor' ? 'tomLow'
          : 'kick';
        var bestF = fr;
        var bestV = -1;
        for (var df = -2; df <= 6; df++) {
          var ff = fr + df;
          if (ff < 1 || ff >= nFrames) continue;
          if (fluxes[bandName][ff] > bestV) { bestV = fluxes[bandName][ff]; bestF = ff; }
        }
        fr = bestF;
        if (fr < 1) fr = 1;
        if (fr >= nFrames - 16) fr = nFrames - 17;
        var ft = featuresAt(spec, perc, nFrames, nBins, sr, fr);
        ft.piece = hooks.times[ti].piece;
        ft.time = hooks.times[ti].time;
        ft.flux = {
          kick: fluxes.kick[fr],
          snare: fluxes.snare[fr],
          hat: fluxes.hat[fr],
          ride: fluxes.ride[fr],
          tomLow: fluxes.tomLow[fr],
          tomMid: fluxes.tomMid[fr],
          tomHigh: fluxes.tomHigh[fr],
          highPeak: ft.highPeak,
          highHz: ft.highHz
        };
        hooks.features.push(ft);
      }
    }
    progress(1);
    return candidates;
  }

  function logFlux(spec, frame, nBins, b0, b1, lag) {
    var s = 0;
    var prevF = frame - (lag || 1);
    if (prevF < 0) prevF = 0;
    var base = frame * nBins;
    var prev = prevF * nBins;
    for (var b = b0; b <= b1; b++) {
      var d = Math.log(1 + spec[base + b]) - Math.log(1 + spec[prev + b]);
      if (d > 0) s += d;
    }
    return s;
  }

  function safeRatio(later, now) {
    if (!(now > 1e-4)) return 0;
    return later / now;
  }

  function labelMatchesBand(piece, band) {
    if (band === 'kick') return piece === 'kick';
    if (band === 'tomLow') return piece === 'tomFloor';
    if (band === 'tomMid') return piece === 'tomMid';
    if (band === 'tomHigh') return piece === 'tomHigh';
    if (band === 'snare') return piece === 'snare';
    if (band === 'hat') return piece === 'hatClosed' || piece === 'hatOpen' || piece === 'crash' || piece === 'crash2';
    if (band === 'ride') return piece === 'ride' || piece === 'crash' || piece === 'crash2';
    return false;
  }

  function strengthFor(cluster, piece) {
    var want = {
      kick: ['kick'],
      tomFloor: ['tomLow', 'kick'],
      tomMid: ['tomMid'],
      tomHigh: ['tomHigh'],
      snare: ['snare'],
      hatClosed: ['hat'],
      hatOpen: ['hat'],
      ride: ['ride'],
      crash: ['hat', 'ride'],
      crash2: ['ride', 'hat', 'snare']
    }[piece] || [];
    var best = 0;
    for (var i = 0; i < cluster.length; i++) {
      if (want.indexOf(cluster[i].band) >= 0 && cluster[i].strength > best) best = cluster[i].strength;
    }
    if (best === 0) {
      for (var j = 0; j < cluster.length; j++) if (cluster[j].strength > best) best = cluster[j].strength;
    }
    return best;
  }

  function hpss(spec, nFrames, nBins, maxBin) {
    var harm = new Float32Array(spec.length);
    var scratch = new Float32Array(Math.max(TIME_MED, FREQ_MED) + 2);
    var halfT = TIME_MED >> 1;
    var limit = maxBin || nBins;
    if (limit > nBins) limit = nBins;
    for (var b = 0; b < limit; b++) {
      for (var t = 0; t < nFrames; t++) {
        var n = 0;
        var a = t - halfT;
        if (a < 0) a = 0;
        var c = t + halfT;
        if (c >= nFrames) c = nFrames - 1;
        for (var k = a; k <= c; k++) scratch[n++] = spec[k * nBins + b];
        harm[t * nBins + b] = medianInto(scratch, n);
      }
    }
    var percMaskSrc = new Float32Array(spec.length);
    var halfF = FREQ_MED >> 1;
    for (var t2 = 0; t2 < nFrames; t2++) {
      for (var b2 = 0; b2 < limit; b2++) {
        var n2 = 0;
        var a2 = b2 - halfF;
        if (a2 < 1) a2 = 1;
        var c2 = b2 + halfF;
        if (c2 >= nBins) c2 = nBins - 1;
        var base = t2 * nBins;
        for (var k2 = a2; k2 <= c2; k2++) scratch[n2++] = spec[base + k2];
        var pMed = medianInto(scratch, n2);
        var h = harm[base + b2];
        var pp = pMed * pMed;
        var hh = h * h;
        var mask = pp / (pp + hh + 1e-8);
        percMaskSrc[base + b2] = spec[base + b2] * mask;
      }
    }
    return percMaskSrc;
  }

  function buildBands(sr) {
    return {
      kick: [binHz(sr, 32), binHz(sr, 115)],
      tomLow: [binHz(sr, 85), binHz(sr, 155)],
      tomMid: [binHz(sr, 150), binHz(sr, 245)],
      tomHigh: [binHz(sr, 230), binHz(sr, 460)],
      wire: [binHz(sr, 1300), binHz(sr, 5200)],
      ride: [binHz(sr, 2800), binHz(sr, 7600)],
      hat: [binHz(sr, 6800), binHz(sr, 10800)],
      broad: [binHz(sr, 40), binHz(sr, 10000)]
    };
  }

  function collectPeaks(out, flux, band, hopSec, look, minGap) {
    var lastT = -9;
    var lastIdx = -1;
    for (var i = 2; i < flux.length - 2; i++) {
      if (flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
      if (flux[i] <= flux[i - 2] && flux[i] <= flux[i + 2]) continue;
      var a = i - look;
      if (a < 0) a = 0;
      var b = i + look;
      if (b >= flux.length) b = flux.length - 1;
      var med = percentile(flux, a, b, 0.5);
      var dev = 0;
      var count = b - a + 1;
      for (var k = a; k <= b; k++) dev += Math.abs(flux[k] - med);
      var mad = dev / count;
      var thresh = med * 2.05 + mad * 2.4 + 1e-9;
      var strength = flux[i] / thresh;
      if (strength < STORE_FLOOR) continue;
      var time = i * hopSec;
      if (time - lastT < minGap) {
        if (lastIdx >= 0 && strength > out[lastIdx].strength && out[lastIdx].band === band) {
          out[lastIdx].time = time;
          out[lastIdx].frame = i;
          out[lastIdx].strength = strength;
          lastT = time;
        }
        continue;
      }
      out.push({ time: time, frame: i, band: band, strength: strength });
      lastIdx = out.length - 1;
      lastT = time;
    }
  }

  function percentile(arr, a, b, p) {
    var n = b - a + 1;
    var tmp = new Float32Array(n);
    for (var i = 0; i < n; i++) tmp[i] = arr[a + i];
    // partial insertion is fine for ~30 samples
    for (var i2 = 1; i2 < n; i2++) {
      var v = tmp[i2];
      var j = i2 - 1;
      while (j >= 0 && tmp[j] > v) {
        tmp[j + 1] = tmp[j];
        j--;
      }
      tmp[j + 1] = v;
    }
    var idx = Math.max(0, Math.min(n - 1, Math.round(p * (n - 1))));
    return tmp[idx];
  }

  function featuresAt(spec, perc, nFrames, nBins, sr, frame) {
    function raw(f0, f1, fr) {
      var f = fr == null ? frame : fr;
      if (f < 0) f = 0;
      if (f >= nFrames) f = nFrames - 1;
      return bandMean(spec, f, nBins, binHz(sr, f0), binHz(sr, f1));
    }
    function pr(f0, f1) {
      return bandMean(perc, frame, nBins, binHz(sr, f0), binHz(sr, f1));
    }
    function peakinessBetween(f0, f1) {
      var lo = binHz(sr, f0);
      var hi = binHz(sr, f1);
      var maxV = 0;
      var maxB = lo;
      var sum = 0;
      var cnt = 0;
      var base = frame * nBins;
      for (var b = lo; b <= hi; b++) {
        var v = spec[base + b];
        sum += v;
        cnt++;
        if (v > maxV) { maxV = v; maxB = b; }
      }
      return {
        hz: maxB * sr / NFFT,
        peakiness: maxV / ((sum / (cnt || 1)) + 1e-9)
      };
    }
    var body = peakinessBetween(120, 280);
    var lowPeak = peakinessBetween(40, 170);
    var highBand = peakinessBetween(230, 520);
    var cymPeak = peakinessBetween(2800, 8000);
    function sumAt(which, f0, f1, fr) {
      var src = which === 'perc' ? perc : spec;
      var f = fr == null ? frame : fr;
      if (f < 0) f = 0;
      if (f >= nFrames) f = nFrames - 1;
      var b0s = binHz(sr, f0);
      var b1s = binHz(sr, f1);
      var s = 0;
      var baseS = f * nBins;
      for (var b = b0s; b <= b1s; b++) s += src[baseS + b];
      return s;
    }
    var hat = sumAt('raw', 7000, 10800);
    var ride = sumAt('raw', 3000, 7600);
    var wire = sumAt('raw', 1400, 5200);
    var at93 = Math.min(nFrames - 1, frame + 4);
    var at186 = Math.min(nFrames - 1, frame + 8);
    var hatLater = sumAt('raw', 7000, 10800, at93);
    var cymNow = ride + hat + 1e-9;
    var cymLater = sumAt('raw', 2800, 10800, at186);
    var lowNow = sumAt('raw', 35, 140);
    var low186 = sumAt('raw', 35, 140, at186);
    var percLow = sumAt('perc', 32, 115);
    return {
      low: sumAt('raw', 32, 115),
      sub: sumAt('raw', 30, 75),
      floorE: sumAt('raw', 90, 155),
      midE: sumAt('raw', 155, 245),
      highE: sumAt('raw', 235, 470),
      wire: wire,
      wireSum: wire,
      presence: sumAt('raw', 500, 1400),
      rideE: ride,
      hatE: hat,
      rideSum: ride,
      hatSum: hat,
      percSub: sumAt('perc', 30, 80),
      percLow: percLow,
      percFloor: sumAt('perc', 90, 155),
      percMid: sumAt('perc', 155, 245),
      percHigh: sumAt('perc', 235, 470),
      percWire: sumAt('perc', 1400, 5200),
      percHat: sumAt('perc', 7000, 10800),
      percTom: sumAt('perc', 90, 460),
      peakHz: lowPeak.hz,
      peakiness: lowPeak.peakiness,
      bodyHz: body.hz,
      bodyPeak: body.peakiness,
      highHz: highBand.hz,
      highPeak: highBand.peakiness,
      cymPeak: cymPeak.peakiness,
      dHat: safeRatio(hatLater, hat),
      dLong: safeRatio(cymLater, cymNow),
      dLow: safeRatio(low186, lowNow),
      dLowP: safeRatio(low186, lowNow),
      lowNow: lowNow,
      percRatioLow: percLow / (lowNow + 1e-9)
    };
  }

  function classifyFeatures(f) {
    var peaks = f.peakBands || {};
    var out = [];
    var seen = {};
    function add(piece) {
      if (!seen[piece]) {
        seen[piece] = true;
        out.push(piece);
      }
    }

    var wire = f.wireSum || f.wire || 0;
    var hat = f.hatSum || f.hatE || 0;
    var ride = f.rideSum || f.rideE || 0;
    var lowNow = f.lowNow || f.low || 0;

    // Decayed by ~186ms: kick is gone, a tom is fading, a bass note is still there.
    // A kick smears across low bins (pitch sweep), so peakiness stays modest.
    // A bass note is one stable bin and much peakier. Bass also barely decays.
    var floorLike = !!(peaks.tomLow || peaks.kick) && f.peakHz >= 100 && f.peakHz < 168 && f.peakiness >= 2.1 && f.peakiness < 6 && f.dLow > 0.25 && f.dLow < 0.8 && !peaks.snare;
    // percRatioLow is the HPSS percussive share. A pure bass note is almost fully harmonic.
    var kickLike = !!peaks.kick && !floorLike && f.peakiness >= 1.45 && f.peakiness < 5.2 && f.dLow < 0.8 && f.peakHz < 120 && lowNow > hat * 0.15;
    if (kickLike) add('kick');
    if (floorLike && f.peakiness >= 2.3) add('tomFloor');

    var snareLike = !!peaks.snare && f.bodyPeak > 2.2 && f.bodyHz >= 150 && f.bodyHz <= 250 && f.dLong < 0.45 && wire > hat * 0.8 && wire > ride * 0.55;
    if (snareLike) add('snare');

    var midLike = !!peaks.tomMid && !snareLike && f.bodyPeak > 1.7 && f.bodyHz >= 160 && f.bodyHz < 240 && (f.midE || 0) > (f.wire || 0) * 3 && (f.midE || 0) > (f.highE || 0);
    var highLike = !!peaks.tomHigh && !snareLike && f.highPeak > 1.7 && f.highHz >= 250 && f.highHz < 500 && (f.highE || 0) > (f.wire || 0) * 3 && (f.highE || 0) > (f.hatE || 1) * 2 && (f.highE || 0) > (f.midE || 0);
    if (midLike) add('tomMid');
    if (highLike) add('tomHigh');

    if (peaks.hat || peaks.ride) {
      var tonalCym = f.cymPeak || 1;
      if (f.dLong > 0.55 && tonalCym < 8 && (peaks.hat || peaks.ride)) add('crash');
      else if (f.dLong > 0.34 && f.dLong <= 0.58 && tonalCym < 8 && tonalCym >= 3.2 && wire + ride > hat) add('crash2');
      else if (peaks.ride && tonalCym >= 6 && f.dLong < 0.5 && f.dLong > 0.05) add('ride');
      else if (peaks.hat && tonalCym < 3.6) {
        if (f.dHat > 0.28 && f.dLong >= 0.12 && f.dLong < 0.5) add('hatOpen');
        else if (f.dLong < 0.28) add('hatClosed');
      }
    }
    return out;
  }

  function pushGap(list, piece, time, strength) {
    var gap = GAPS[piece] || 0.07;
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].piece !== piece) continue;
      if (time - list[i].time < gap) {
        if (strength > list[i].strength) {
          list[i].time = time;
          list[i].strength = strength;
        }
        return;
      }
      break;
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
      var gap = GAPS[h.piece] || 0.07;
      if (prev == null || h.time - prev >= gap) {
        out.push(h);
        last[h.piece] = h.time;
      }
    }
    return out;
  }

  // Causal snapshot classifier for the microphone path.
  // bands: { low, floorE, midE, highE, wire, rideE, hatE, peakHz, peakiness, dHat }
  function classifyLive(bands) {
    var f = {
      low: bands.low || 0,
      sub: bands.sub || bands.low || 0,
      floorE: bands.floorE || 0,
      midE: bands.midE || 0,
      highE: bands.highE || 0,
      wire: bands.wire || 0,
      wireSum: bands.wire || 0,
      presence: bands.presence || 0,
      rideE: bands.rideE || 0,
      hatE: bands.hatE || 0,
      rideSum: bands.rideE || 0,
      hatSum: bands.hatE || 0,
      percSub: bands.sub || bands.low || 0,
      percLow: bands.low || 0,
      percFloor: bands.floorE || 0,
      percMid: bands.midE || 0,
      percHigh: bands.highE || 0,
      percWire: bands.wire || 0,
      percHat: bands.hatE || 0,
      percTom: (bands.floorE || 0) + (bands.midE || 0) + (bands.highE || 0),
      peakHz: bands.peakHz || 80,
      peakiness: bands.peakiness || 1.2,
      dHat: bands.dHat == null ? 0.15 : bands.dHat,
      dLong: bands.dLong == null ? 0.05 : bands.dLong,
      dLow: bands.dLow == null ? 0.3 : bands.dLow,
      dLowP: bands.dLowP == null ? 0.28 : bands.dLowP,
      percRatioLow: 0.8,
      clusterStrength: bands.strength || 1,
      peakBands: bands.peakBands || {}
    };
    var names = classifyFeatures(f);
    var out = [];
    for (var i = 0; i < names.length; i++) out.push({ piece: names[i], strength: bands.strength || 1 });
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
