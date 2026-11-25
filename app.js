(() => {
  'use strict';

  // Register Service Worker only on HTTP(S)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  // DOM Elements
  const screenPicker = document.getElementById('screen-picker');
  const screenStage = document.getElementById('screen-stage');
  const pickDrumsBtn = document.getElementById('pick-drums');
  const soonCards = document.querySelectorAll('.inst-soon');
  const btnBack = document.getElementById('btn-back');
  const btnSettings = document.getElementById('btn-settings');
  const settingsPanel = document.getElementById('settings-panel');
  const sensitivitySlider = document.getElementById('sensitivity-slider');
  const sensitivityVal = document.getElementById('sensitivity-val');

  const statusPill = document.getElementById('status-pill');
  const statusText = document.getElementById('status-text');
  const hitPill = document.getElementById('hit-pill');
  const hitCounterEl = document.getElementById('hit-counter');

  const btnDemo = document.getElementById('btn-demo');
  const fileInput = document.getElementById('file-input');
  const btnMic = document.getElementById('btn-mic');
  const micBtnLabel = document.getElementById('mic-btn-label');

  const playerBar = document.getElementById('player-bar');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnStop = document.getElementById('btn-stop');
  const trackTitle = document.getElementById('track-title');
  const trackTime = document.getElementById('track-time');
  const seekSlider = document.getElementById('seek-slider');

  const meterKick = document.getElementById('meter-kick');
  const meterSnare = document.getElementById('meter-snare');
  const meterHat = document.getElementById('meter-hat');
  const toastEl = document.getElementById('toast');

  // SVG Drum Pieces
  const svgPieces = {
    kick: document.getElementById('drum-kick'),
    kickBeater: document.getElementById('kick-beater'),
    snare: document.getElementById('drum-snare'),
    hihat: document.getElementById('drum-hihat'),
    hihatTop: document.getElementById('hihat-top'),
    crash: document.getElementById('drum-crash'),
    tom1: document.getElementById('drum-tom1'),
    tom2: document.getElementById('drum-tom2'),
    drummer: document.getElementById('drummer-body'),
    fxLayer: document.getElementById('fx-layer'),
  };

  const stickEls = {
    left: {
      forearm: document.getElementById('left-forearm'),
      stick: document.getElementById('left-stick'),
      hand: document.getElementById('left-hand'),
      tip: document.getElementById('left-tip'),
      shoulder: { x: 168, y: 98 },
      home: { x: 108, y: 152 },
    },
    right: {
      forearm: document.getElementById('right-forearm'),
      stick: document.getElementById('right-stick'),
      hand: document.getElementById('right-hand'),
      tip: document.getElementById('right-tip'),
      shoulder: { x: 242, y: 98 },
      home: { x: 322, y: 82 },
    },
  };

  const DRUM_META = {
    kick: { label: 'בס', color: '#ff6b4a', x: 205, y: 212, stick: null },
    snare: { label: 'סנר', color: '#ffd166', x: 104, y: 176, stick: 'left' },
    hihat: { label: 'היי־האט', color: '#4ecdc4', x: 330, y: 99, stick: 'right' },
    crash: { label: 'קראש', color: '#ffe58f', x: 74, y: 72, stick: 'left' },
    tom1: { label: 'טם־טם', color: '#4ecdc4', x: 158, y: 118, stick: 'left' },
    tom2: { label: 'פלור טם', color: '#6a93ff', x: 294, y: 172, stick: 'right' },
  };

  // App State
  let audioCtx = null;
  let analyser = null;
  let gainNode = null;
  let mode = 'idle'; // 'idle' | 'demo' | 'file' | 'mic'
  let sensitivity = 1.0;

  // Buffer playback state (demo / file)
  let currentBuffer = null;
  let bufferSource = null;
  let isPlaying = false;
  let isLooping = false;
  let startCtxTime = 0;
  let pauseOffset = 0;
  let activeTitle = '';

  // Mic state
  let micStream = null;
  let micSource = null;

  // Animation & Hit state
  const drumState = {
    kick: 0,
    snare: 0,
    hihat: 0,
    crash: 0,
    tom1: 0,
    tom2: 0,
  };
  const stickAnim = {
    left: { x: 108, y: 152, targetX: 104, targetY: 176, timer: 0 },
    right: { x: 322, y: 82, targetX: 330, targetY: 99, timer: 0 },
  };
  let tomToggle = false;
  let hitCount = 0;
  let lastHudPop = 0;
  let toastTimer = null;
  let rafId = null;
  let lastFrameMs = performance.now();

  // Debug / Verification log
  const hitLog = [];
  window.__DRUM_DEBUG__ = {
    getHitLog: () => hitLog,
    getHitCount: () => hitCount,
    getMode: () => mode,
    isPlaying: () => isPlaying,
    triggerTestHit: (d) => triggerDrum(d, 1.0),
  };

  // DSP Buffers
  let freqBytes = null;
  let mag = null;
  let prevMag = null;
  const HISTORY_LEN = 24;
  const fluxHist = {
    kick: new Float32Array(HISTORY_LEN),
    snare: new Float32Array(HISTORY_LEN),
    tom: new Float32Array(HISTORY_LEN),
    hat: new Float32Array(HISTORY_LEN),
  };
  let histIdx = 0;
  let histFilled = 0;
  const prevBandFlux = { kick: 0, snare: 0, tom: 0, hat: 0 };
  const lastHitAt = { kick: -1e9, snare: -1e9, tom: -1e9, hihat: -1e9, crash: -1e9 };

  function showToast(msg, ms = 3200) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, ms);
  }

  function setStatus(text, live = false) {
    statusText.textContent = text;
    statusPill.classList.toggle('is-live', live);
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Navigation
  pickDrumsBtn.addEventListener('click', () => {
    clearTimeout(toastTimer);
    toastEl.hidden = true;
    screenPicker.hidden = true;
    screenPicker.classList.remove('screen-active');
    screenStage.hidden = false;
    screenStage.classList.add('screen-active');
    startLoop();
  });

  soonCards.forEach((card) => {
    card.addEventListener('click', () => {
      const name = card.dataset.soon || 'הכלי הזה';
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      showToast(`${name} יגיע בקרוב! בינתיים בואו ננסה תופים 🥁`);
    });
  });

  btnBack.addEventListener('click', () => {
    stopAllAudio();
    screenStage.hidden = true;
    screenStage.classList.remove('screen-active');
    screenPicker.hidden = false;
    screenPicker.classList.add('screen-active');
  });

  btnSettings.addEventListener('click', () => {
    const open = settingsPanel.hidden;
    settingsPanel.hidden = !open;
    btnSettings.setAttribute('aria-expanded', String(open));
  });

  sensitivitySlider.addEventListener('input', () => {
    sensitivity = parseFloat(sensitivitySlider.value) || 1.0;
    sensitivityVal.textContent = `${sensitivity.toFixed(1)}×`;
  });

  // AudioContext setup (must be called inside user gesture for iOS Safari)
  function ensureAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.0;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -10;

      gainNode = audioCtx.createGain();
      gainNode.gain.value = 1.0;
      gainNode.connect(analyser);
      analyser.connect(audioCtx.destination);

      const bins = analyser.frequencyBinCount;
      freqBytes = new Uint8Array(bins);
      mag = new Float32Array(bins);
      prevMag = new Float32Array(bins);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function decodeAudioPromise(ctx, arrayBuf) {
    return new Promise((resolve, reject) => {
      const res = ctx.decodeAudioData(arrayBuf, resolve, reject);
      if (res && typeof res.then === 'function') {
        res.then(resolve, reject);
      }
    });
  }

  function resetDSP() {
    if (prevMag) prevMag.fill(0);
    Object.values(fluxHist).forEach((arr) => arr.fill(0));
    histIdx = 0;
    histFilled = 0;
    prevBandFlux.kick = 0;
    prevBandFlux.snare = 0;
    prevBandFlux.tom = 0;
    prevBandFlux.hat = 0;
  }

  function stopBufferPlayback() {
    if (bufferSource) {
      bufferSource.onended = null;
      try {
        bufferSource.stop();
      } catch (_) {}
      try {
        bufferSource.disconnect();
      } catch (_) {}
      bufferSource = null;
    }
    isPlaying = false;
  }

  function stopMic() {
    if (micSource) {
      try {
        micSource.disconnect();
      } catch (_) {}
      micSource = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    btnMic.classList.remove('is-active');
    micBtnLabel.textContent = 'האזן למיקרופון';
  }

  function stopAllAudio() {
    stopBufferPlayback();
    stopMic();
    currentBuffer = null;
    pauseOffset = 0;
    mode = 'idle';
    playerBar.hidden = true;
    meterKick.style.width = '0%';
    meterSnare.style.width = '0%';
    meterHat.style.width = '0%';
    setStatus('מוכן — בחר מקור שמע', false);
  }

  function startBufferFrom(offsetSec) {
    if (!currentBuffer || !audioCtx) return;
    stopBufferPlayback();

    const src = audioCtx.createBufferSource();
    src.buffer = currentBuffer;
    src.loop = isLooping;
    src.connect(gainNode);

    const dur = currentBuffer.duration || 1;
    const clamped = Math.max(0, Math.min(offsetSec, dur - 0.01));
    pauseOffset = clamped;
    startCtxTime = audioCtx.currentTime - clamped;

    src.onended = () => {
      if (bufferSource === src && !isLooping) {
        isPlaying = false;
        pauseOffset = 0;
        btnPlayPause.textContent = '▶';
        setStatus('השיר הסתיים — לחץ נגן שוב', false);
      }
    };

    src.start(0, clamped);
    bufferSource = src;
    isPlaying = true;
    btnPlayPause.textContent = '⏸';
    playerBar.hidden = false;
    trackTitle.textContent = activeTitle;
    seekSlider.max = dur.toFixed(2);
    setStatus(mode === 'demo' ? 'מנגן מקצב דמו' : `מנגן: ${activeTitle}`, true);
  }

  // 1. Built-in Demo Beat
  btnDemo.addEventListener('click', async () => {
    const ctx = ensureAudioCtx();
    stopMic();
    stopBufferPlayback();
    resetDSP();

    if (mode === 'demo' && currentBuffer && !isPlaying) {
      startBufferFrom(pauseOffset);
      return;
    }

    setStatus('טוען מקצב דמו…', false);
    try {
      const resp = await fetch('./demo-beat.wav');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const ab = await resp.arrayBuffer();
      currentBuffer = await decodeAudioPromise(ctx, ab);
      mode = 'demo';
      isLooping = true;
      activeTitle = 'מקצב דמו (115 BPM)';
      hitCount = 0;
      hitCounterEl.textContent = 'מכות: 0';
      hitLog.length = 0;
      startBufferFrom(0);
      startLoop();
    } catch (err) {
      console.error(err);
      showToast('לא הצלחתי לטעון את קובץ הדמו');
      setStatus('שגיאה בטעינת דמו', false);
    }
  });

  // 2. Pick Audio File from Phone
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const ctx = ensureAudioCtx();
    stopMic();
    stopBufferPlayback();
    resetDSP();
    setStatus('מפענח קובץ שמע…', false);

    try {
      const ab = await file.arrayBuffer();
      currentBuffer = await decodeAudioPromise(ctx, ab);
      mode = 'file';
      isLooping = false;
      activeTitle = file.name.replace(/\.[^/.]+$/, '');
      hitCount = 0;
      hitCounterEl.textContent = 'מכות: 0';
      hitLog.length = 0;
      startBufferFrom(0);
      startLoop();
    } catch (err) {
      console.error(err);
      showToast('הפורמט לא נתמך בדפדפן. נסה קובץ MP3, M4A או WAV.');
      setStatus('שגיאה בפענוח הקובץ', false);
    } finally {
      fileInput.value = '';
    }
  });

  // 3. Listen via Microphone
  btnMic.addEventListener('click', async () => {
    if (mode === 'mic') {
      stopAllAudio();
      return;
    }

    const ctx = ensureAudioCtx();
    stopBufferPlayback();
    currentBuffer = null;
    playerBar.hidden = true;
    resetDSP();

    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('האזנה למיקרופון באייפון דורשת חיבור מאובטח (HTTPS). אפשר לנסות בינתיים בדמו או בקובץ שמע.');
      setStatus('מיקרופון דורש HTTPS', false);
      return;
    }

    setStatus('מבקש גישה למיקרופון…', false);
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      micStream = stream;
      micSource = ctx.createMediaStreamSource(stream);
      // Connect mic ONLY to analyser (never to destination to avoid feedback)
      micSource.connect(analyser);

      mode = 'mic';
      hitCount = 0;
      hitCounterEl.textContent = 'מכות: 0';
      hitLog.length = 0;
      btnMic.classList.add('is-active');
      micBtnLabel.textContent = 'עצור מיקרופון';
      setStatus('מאזין למוזיקה מהסביבה', true);
      startLoop();
    } catch (err) {
      console.error(err);
      showToast('אין הרשאה למיקרופון. אפשר לאשר בהגדרות הדפדפן או לטעון שיר.');
      setStatus('הגישה למיקרופון נדחתה', false);
    }
  });

  // Player Controls
  btnPlayPause.addEventListener('click', () => {
    if (!currentBuffer || !audioCtx) return;
    ensureAudioCtx();
    if (isPlaying) {
      const dur = currentBuffer.duration || 1;
      pauseOffset = ((audioCtx.currentTime - startCtxTime) % dur + dur) % dur;
      stopBufferPlayback();
      btnPlayPause.textContent = '▶';
      setStatus('מושהה', false);
    } else {
      startBufferFrom(pauseOffset);
    }
  });

  btnStop.addEventListener('click', () => {
    stopAllAudio();
  });

  seekSlider.addEventListener('input', () => {
    if (!currentBuffer) return;
    const target = parseFloat(seekSlider.value) || 0;
    if (isPlaying) {
      startBufferFrom(target);
    } else {
      pauseOffset = target;
      trackTime.textContent = `${formatTime(target)} / ${formatTime(currentBuffer.duration)}`;
    }
  });

  // --- DSP: Spectral Flux + Adaptive Threshold ---
  function hzToBin(hz) {
    if (!audioCtx || !analyser) return 1;
    const nyquist = audioCtx.sampleRate / 2;
    const clamped = Math.max(0, Math.min(nyquist, hz));
    return Math.max(1, Math.min(analyser.frequencyBinCount - 1, Math.round((clamped / nyquist) * analyser.frequencyBinCount)));
  }

  function bandStats(binStart, binEnd) {
    let flux = 0;
    let energy = 0;
    const count = Math.max(1, binEnd - binStart + 1);
    for (let i = binStart; i <= binEnd; i++) {
      const m = mag[i];
      energy += m;
      const diff = m - prevMag[i];
      if (diff > 0) flux += diff;
    }
    return { flux: flux / count, energy: energy / count };
  }

  function medianAndMad(arr, len) {
    if (len <= 0) return { med: 0, mad: 0 };
    const tmp = [];
    for (let i = 0; i < len; i++) tmp.push(arr[i]);
    tmp.sort((a, b) => a - b);
    const med = tmp[Math.floor(len / 2)];
    let devSum = 0;
    for (let i = 0; i < len; i++) devSum += Math.abs(tmp[i] - med);
    return { med, mad: devSum / len };
  }

  function analyzeAudio(nowMs) {
    if (!analyser || !freqBytes) return;
    const active = mode === 'mic' || ((mode === 'demo' || mode === 'file') && isPlaying);
    if (!active) return;

    analyser.getByteFrequencyData(freqBytes);
    const n = freqBytes.length;
    for (let i = 0; i < n; i++) {
      const v = freqBytes[i] / 255;
      mag[i] = v * Math.sqrt(v); // ^1.5 emphasis on transients
    }

    const kick = bandStats(hzToBin(38), hzToBin(125));
    const tom = bandStats(hzToBin(130), hzToBin(250));
    const snareBody = bandStats(hzToBin(170), hzToBin(380));
    const snareWire = bandStats(hzToBin(1400), hzToBin(4600));
    const shimmer = bandStats(hzToBin(3400), hzToBin(6400));
    const hihat = bandStats(hzToBin(6200), hzToBin(13500));

    const snareFlux = snareBody.flux * 0.42 + snareWire.flux * 0.78;

    // Update live meters (visual feedback even between hits)
    meterKick.style.width = `${Math.min(100, Math.round(kick.energy * 165))}%`;
    meterSnare.style.width = `${Math.min(100, Math.round((snareWire.energy * 1.4 + tom.energy * 0.6) * 145))}%`;
    meterHat.style.width = `${Math.min(100, Math.round(hihat.energy * 230))}%`;

    const len = histFilled;
    const s = sensitivity;

    const kStats = medianAndMad(fluxHist.kick, len);
    const sStats = medianAndMad(fluxHist.snare, len);
    const tStats = medianAndMad(fluxHist.tom, len);
    const hStats = medianAndMad(fluxHist.hat, len);

    const kThresh = Math.max(0.028 / s, kStats.med * 1.85 + kStats.mad * (2.1 / s) + 0.016 / s);
    const sThresh = Math.max(0.020 / s, sStats.med * 1.85 + sStats.mad * (2.1 / s) + 0.014 / s);
    const tThresh = Math.max(0.026 / s, tStats.med * 1.95 + tStats.mad * (2.2 / s) + 0.016 / s);
    const hThresh = Math.max(0.011 / s, hStats.med * 1.65 + hStats.mad * (1.85 / s) + 0.006 / s);

    let kickFired = false;
    let snareFired = false;

    // KICK
    if (
      kick.flux > kThresh &&
      kick.energy > 0.14 / s &&
      kick.flux >= prevBandFlux.kick * 0.85 &&
      nowMs - lastHitAt.kick > 95
    ) {
      lastHitAt.kick = nowMs;
      kickFired = true;
      triggerDrum('kick', Math.min(1, kick.flux / (kThresh * 1.8)));
    }

    // SNARE
    if (
      snareFlux > sThresh &&
      snareWire.energy > 0.038 / s &&
      snareFlux >= prevBandFlux.snare * 0.85 &&
      nowMs - lastHitAt.snare > 95 &&
      (!kickFired || snareWire.flux > kick.flux * 0.28)
    ) {
      lastHitAt.snare = nowMs;
      snareFired = true;
      triggerDrum('snare', Math.min(1, snareFlux / (sThresh * 1.8)));
    }

    // TOM (only when not dominated by kick or snare wires)
    if (
      !kickFired &&
      !snareFired &&
      nowMs - lastHitAt.kick > 55 &&
      nowMs - lastHitAt.snare > 55 &&
      tom.flux > tThresh &&
      tom.energy > 0.13 / s &&
      tom.flux > kick.flux * 1.1 &&
      snareWire.flux < tom.flux * 0.55 &&
      nowMs - lastHitAt.tom > 110
    ) {
      lastHitAt.tom = nowMs;
      tomToggle = !tomToggle;
      triggerDrum(tomToggle ? 'tom1' : 'tom2', Math.min(1, tom.flux / (tThresh * 1.8)));
    }

    // HI-HAT vs CRASH
    if (
      hihat.flux > hThresh &&
      hihat.energy > 0.022 / s &&
      hihat.flux >= prevBandFlux.hat * 0.85 &&
      nowMs - lastHitAt.hihat > 68
    ) {
      const isCrash =
        !snareFired &&
        shimmer.flux > 0.055 / s &&
        hihat.energy > 0.13 / s &&
        hihat.flux > hThresh * 1.45 &&
        hihat.flux > snareWire.flux * 0.85 &&
        nowMs - lastHitAt.crash > 360;

      if (isCrash) {
        lastHitAt.crash = nowMs;
        lastHitAt.hihat = nowMs;
        triggerDrum('crash', 1.0);
      } else {
        lastHitAt.hihat = nowMs;
        triggerDrum('hihat', Math.min(1, hihat.flux / (hThresh * 1.8)));
      }
    }

    // Push current flux into adaptive ring buffers
    fluxHist.kick[histIdx] = kick.flux;
    fluxHist.snare[histIdx] = snareFlux;
    fluxHist.tom[histIdx] = tom.flux;
    fluxHist.hat[histIdx] = hihat.flux;
    histIdx = (histIdx + 1) % HISTORY_LEN;
    if (histFilled < HISTORY_LEN) histFilled++;

    prevBandFlux.kick = kick.flux;
    prevBandFlux.snare = snareFlux;
    prevBandFlux.tom = tom.flux;
    prevBandFlux.hat = hihat.flux;

    prevMag.set(mag);
  }

  // --- Visual Hit Trigger & Cartoon Animation ---
  function triggerDrum(drum, strength = 0.9) {
    const meta = DRUM_META[drum];
    if (!meta) return;

    drumState[drum] = Math.max(drumState[drum], 0.65 + 0.35 * strength);
    hitCount += 1;
    hitCounterEl.textContent = `מכות: ${hitCount}`;

    const nowMs = performance.now();
    hitLog.push({ drum, timeMs: Math.round(nowMs), strength: Number(strength.toFixed(2)) });
    if (hitLog.length > 250) hitLog.shift();

    // Update HUD badge
    hitPill.textContent = meta.label;
    if (nowMs - lastHudPop > 50) {
      hitPill.classList.remove('pop');
      void hitPill.offsetWidth;
      hitPill.classList.add('pop');
      lastHudPop = nowMs;
    }

    // Move corresponding drumstick
    if (meta.stick) {
      const st = stickAnim[meta.stick];
      st.targetX = meta.x;
      st.targetY = meta.y;
      st.timer = 1.0;
    }

    spawnImpactFX(meta.x, meta.y, meta.color, drum === 'kick' || drum === 'crash' ? 1.2 : 0.9);
  }

  function spawnImpactFX(x, y, color, scale = 1.0) {
    const fx = svgPieces.fxLayer;
    if (fx.childElementCount > 18) {
      while (fx.childElementCount > 10) fx.removeChild(fx.firstChild);
    }

    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');

    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('cx', x);
    ring.setAttribute('cy', y);
    ring.setAttribute('r', String(10 * scale));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', color);
    ring.setAttribute('stroke-width', '3.5');
    ring.setAttribute('opacity', '0.95');

    const star = document.createElementNS(ns, 'path');
    const rOuter = 14 * scale;
    const rInner = 5 * scale;
    star.setAttribute(
      'd',
      `M ${x} ${y - rOuter} L ${x + rInner} ${y - rInner} L ${x + rOuter} ${y} L ${x + rInner} ${y + rInner} L ${x} ${y + rOuter} L ${x - rInner} ${y + rInner} L ${x - rOuter} ${y} L ${x - rInner} ${y - rInner} Z`
    );
    star.setAttribute('fill', '#ffffff');
    star.setAttribute('opacity', '0.9');

    g.appendChild(ring);
    g.appendChild(star);
    fx.appendChild(g);

    const start = performance.now();
    const dur = 220;
    function stepFX(t) {
      const p = Math.min(1, (t - start) / dur);
      const ease = 1 - Math.pow(1 - p, 2);
      ring.setAttribute('r', String((10 + 28 * ease) * scale));
      ring.setAttribute('opacity', String((1 - p) * 0.95));
      star.setAttribute('opacity', String(Math.max(0, 1 - p * 1.4)));
      if (p < 1) {
        requestAnimationFrame(stepFX);
      } else if (g.parentNode === fx) {
        fx.removeChild(g);
      }
    }
    requestAnimationFrame(stepFX);
  }

  function updateStick(side, dt) {
    const st = stickAnim[side];
    const el = stickEls[side];
    if (st.timer > 0) {
      st.timer = Math.max(0, st.timer - dt / 175);
    }

    // Strike curve: quick snap down onto drumhead, then lift 24px above target
    const lift = st.timer > 0.72 ? 0 : (1 - st.timer) * 24;
    const goalX = st.timer > 0 ? st.targetX : el.home.x;
    const goalY = (st.timer > 0 ? st.targetY : el.home.y) - lift;

    const lerp = Math.min(1, dt / 24);
    st.x += (goalX - st.x) * lerp;
    st.y += (goalY - st.y) * lerp;

    // Hand sits partway between shoulder and tip, slightly lifted
    const handX = el.shoulder.x + (st.x - el.shoulder.x) * 0.44;
    const handY = el.shoulder.y + (st.y - el.shoulder.y) * 0.44 - 6;

    el.forearm.setAttribute('x2', handX.toFixed(1));
    el.forearm.setAttribute('y2', handY.toFixed(1));
    el.hand.setAttribute('cx', handX.toFixed(1));
    el.hand.setAttribute('cy', handY.toFixed(1));
    el.stick.setAttribute('x1', handX.toFixed(1));
    el.stick.setAttribute('y1', handY.toFixed(1));
    el.stick.setAttribute('x2', st.x.toFixed(1));
    el.stick.setAttribute('y2', st.y.toFixed(1));
    el.tip.setAttribute('cx', st.x.toFixed(1));
    el.tip.setAttribute('cy', st.y.toFixed(1));
  }

  function renderVisuals(nowMs, dt) {
    // Decay drum hit intensities
    drumState.kick *= Math.exp(-dt / 105);
    drumState.snare *= Math.exp(-dt / 95);
    drumState.hihat *= Math.exp(-dt / 75);
    drumState.crash *= Math.exp(-dt / 260);
    drumState.tom1 *= Math.exp(-dt / 105);
    drumState.tom2 *= Math.exp(-dt / 105);

    const k = drumState.kick;
    const s = drumState.snare;
    const h = drumState.hihat;
    const c = drumState.crash;
    const t1 = drumState.tom1;
    const t2 = drumState.tom2;

    svgPieces.kick.style.transform = `scale(${(1 + k * 0.085).toFixed(4)})`;
    svgPieces.kick.style.filter = k > 0.08 ? `drop-shadow(0 0 ${(k * 16).toFixed(1)}px rgba(255,107,74,0.8))` : '';
    svgPieces.kickBeater.style.transform = `translateY(${(-k * 9).toFixed(2)}px) scale(${(1 + k * 0.14).toFixed(3)})`;

    svgPieces.snare.style.transform = `translateY(${(s * 5).toFixed(2)}px) scale(${(1 + s * 0.07).toFixed(4)}, ${(1 - s * 0.06).toFixed(4)})`;
    svgPieces.snare.style.filter = s > 0.08 ? `drop-shadow(0 0 ${(s * 14).toFixed(1)}px rgba(255,209,102,0.85))` : '';

    const hatWobble = Math.sin(nowMs * 0.05) * h * 5;
    svgPieces.hihatTop.style.transform = `translateY(${(-h * 5).toFixed(2)}px) rotate(${hatWobble.toFixed(2)}deg)`;
    svgPieces.hihat.style.filter = h > 0.08 ? `drop-shadow(0 0 ${(h * 12).toFixed(1)}px rgba(78,205,196,0.85))` : '';

    const crashWobble = Math.sin(nowMs * 0.036) * c * 11;
    svgPieces.crash.style.transform = `rotate(${crashWobble.toFixed(2)}deg) scale(${(1 + c * 0.05).toFixed(4)})`;
    svgPieces.crash.style.filter = c > 0.08 ? `drop-shadow(0 0 ${(c * 18).toFixed(1)}px rgba(255,229,143,0.9))` : '';

    svgPieces.tom1.style.transform = `translateY(${(t1 * 5).toFixed(2)}px) scale(${(1 + t1 * 0.06).toFixed(4)})`;
    svgPieces.tom1.style.filter = t1 > 0.08 ? `drop-shadow(0 0 ${(t1 * 12).toFixed(1)}px rgba(78,205,196,0.8))` : '';

    svgPieces.tom2.style.transform = `translateY(${(t2 * 5).toFixed(2)}px) scale(${(1 + t2 * 0.06).toFixed(4)})`;
    svgPieces.tom2.style.filter = t2 > 0.08 ? `drop-shadow(0 0 ${(t2 * 12).toFixed(1)}px rgba(106,147,255,0.8))` : '';

    // Drummer head bob
    const bob = Math.max(k, s) * 4;
    svgPieces.drummer.style.transform = `translateY(${bob.toFixed(2)}px)`;

    updateStick('left', dt);
    updateStick('right', dt);

    // Update playback progress bar
    if ((mode === 'demo' || mode === 'file') && currentBuffer && isPlaying && audioCtx) {
      const dur = currentBuffer.duration || 1;
      const elapsed = isLooping
        ? ((audioCtx.currentTime - startCtxTime) % dur + dur) % dur
        : Math.min(dur, Math.max(0, audioCtx.currentTime - startCtxTime));
      seekSlider.value = elapsed.toFixed(2);
      trackTime.textContent = `${formatTime(elapsed)} / ${formatTime(dur)}`;
    }
  }

  function frame(nowMs) {
    const dt = Math.min(50, Math.max(4, nowMs - lastFrameMs));
    lastFrameMs = nowMs;

    analyzeAudio(nowMs);
    renderVisuals(nowMs, dt);

    if (!screenStage.hidden) {
      rafId = requestAnimationFrame(frame);
    } else {
      rafId = null;
    }
  }

  function startLoop() {
    if (!rafId) {
      lastFrameMs = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }
})();
