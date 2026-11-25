(() => {
  'use strict';

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

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
  const toastEl = document.getElementById('toast');

  const svgPieces = {
    kick: document.getElementById('drum-kick'),
    kickBeater: document.getElementById('kick-beater'),
    snare: document.getElementById('drum-snare'),
    hihat: document.getElementById('drum-hihat'),
    hihatTop: document.getElementById('hihat-top'),
    hihatFoot: document.getElementById('hihat-foot'),
    crash: document.getElementById('drum-crash'),
    crash2: document.getElementById('drum-crash2'),
    ride: document.getElementById('drum-ride'),
    rideBell: document.getElementById('ride-bell'),
    tomHigh: document.getElementById('drum-tom-high'),
    tomMid: document.getElementById('drum-tom-mid'),
    tomFloor: document.getElementById('drum-tom-floor'),
    drummer: document.getElementById('drummer-body'),
    fxLayer: document.getElementById('fx-layer')
  };

  const stickEls = {
    left: {
      forearm: document.getElementById('left-forearm'),
      stick: document.getElementById('left-stick'),
      hand: document.getElementById('left-hand'),
      tip: document.getElementById('left-tip'),
      shoulder: { x: 164, y: 78 },
      home: { x: 96, y: 160 }
    },
    right: {
      forearm: document.getElementById('right-forearm'),
      stick: document.getElementById('right-stick'),
      hand: document.getElementById('right-hand'),
      tip: document.getElementById('right-tip'),
      shoulder: { x: 236, y: 78 },
      home: { x: 340, y: 96 }
    }
  };

  const DRUM_META = {
    kick: { label: 'בס', color: '#ff6b4a', x: 188, y: 214, stick: null, vis: 'kick', meter: 'meter-kick' },
    snare: { label: 'סנר', color: '#ffd166', x: 92, y: 170, stick: 'left', vis: 'snare', meter: 'meter-snare' },
    hatClosed: { label: 'היי-האט סגור', color: '#4ecdc4', x: 358, y: 112, stick: 'right', vis: 'hihat', meter: 'meter-hat-closed', hat: 'closed' },
    hatOpen: { label: 'היי-האט פתוח', color: '#9af7ef', x: 358, y: 100, stick: 'right', vis: 'hihat', meter: 'meter-hat-open', hat: 'open' },
    tomHigh: { label: 'טום גבוה', color: '#4ecdc4', x: 164, y: 104, stick: 'left', vis: 'tomHigh', meter: 'meter-tom-high' },
    tomMid: { label: 'טום אמצעי', color: '#ffb15e', x: 222, y: 118, stick: 'right', vis: 'tomMid', meter: 'meter-tom-mid' },
    tomFloor: { label: 'טום רצפה', color: '#6a93ff', x: 300, y: 170, stick: 'right', vis: 'tomFloor', meter: 'meter-tom-floor' },
    ride: { label: 'רייד', color: '#ffe58f', x: 274, y: 50, stick: 'right', vis: 'ride', meter: 'meter-ride' },
    crash: { label: 'קראש', color: '#ffd166', x: 50, y: 74, stick: 'left', vis: 'crash', meter: 'meter-crash' },
    crash2: { label: 'קראש 2', color: '#ff9f6b', x: 118, y: 54, stick: 'left', vis: 'crash2', meter: 'meter-crash2' }
  };

  const meterEls = {};
  Object.keys(DRUM_META).forEach((name) => {
    meterEls[name] = document.getElementById(DRUM_META[name].meter);
  });

  let audioCtx = null;
  let analyser = null;
  let gainNode = null;
  let mode = 'idle';
  let sensitivity = 1.0;

  let currentBuffer = null;
  let bufferSource = null;
  let isPlaying = false;
  let isLooping = false;
  let startCtxTime = 0;
  let pauseOffset = 0;
  let activeTitle = '';

  let micStream = null;
  let micSource = null;

  const drumState = {
    kick: 0, snare: 0, hihat: 0, crash: 0, crash2: 0, ride: 0, tomHigh: 0, tomMid: 0, tomFloor: 0
  };
  const meterLevel = {};
  Object.keys(DRUM_META).forEach((name) => { meterLevel[name] = 0; });
  const stickAnim = {
    left: { x: 96, y: 160, targetX: 92, targetY: 170, timer: 0 },
    right: { x: 340, y: 96, targetX: 358, targetY: 112, timer: 0 }
  };
  let hatOpenAmount = 0;
  let hatOpenTarget = 0;
  let hitCount = 0;
  let lastHudPop = 0;
  let toastTimer = null;
  let rafId = null;
  let lastFrameMs = performance.now();

  const LEAD = 0.04;
  let analysisToken = 0;
  let candidates = [];
  let activeHits = [];
  let hitCursor = 0;
  let lastPlayhead = 0;
  let useTimeline = false;

  const hitLog = [];
  window.__DRUM_DEBUG__ = {
    getHitLog: () => hitLog.slice(),
    getHitCount: () => hitCount,
    getMode: () => mode,
    isPlaying: () => isPlaying,
    getCandidates: () => candidates.slice(),
    getActiveHits: () => activeHits.slice(),
    triggerTestHit: (d) => triggerDrum(d, 1)
  };

  let freqBytes = null;
  let mag = null;
  let prevMag = null;
  const HISTORY_LEN = 28;
  const liveFlux = {
    kick: new Float32Array(HISTORY_LEN),
    snare: new Float32Array(HISTORY_LEN),
    tom: new Float32Array(HISTORY_LEN),
    hat: new Float32Array(HISTORY_LEN),
    ride: new Float32Array(HISTORY_LEN)
  };
  let histIdx = 0;
  let histFilled = 0;
  const prevBandFlux = { kick: 0, snare: 0, tom: 0, hat: 0, ride: 0 };
  const lastHitAt = {};
  Object.keys(DRUM_META).forEach((name) => { lastHitAt[name] = -1e9; });

  function showToast(msg, ms = 3200) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
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
    sensitivity = parseFloat(sensitivitySlider.value) || 1;
    sensitivityVal.textContent = `${sensitivity.toFixed(1)}×`;
    if (useTimeline && window.DrumAnalyzer) {
      activeHits = window.DrumAnalyzer.selectHits(candidates, sensitivity);
      syncCursor(playbackTime());
    }
  });

  function ensureAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -10;
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 1;
      gainNode.connect(analyser);
      analyser.connect(audioCtx.destination);
      const bins = analyser.frequencyBinCount;
      freqBytes = new Uint8Array(bins);
      mag = new Float32Array(bins);
      prevMag = new Float32Array(bins);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function decodeAudioPromise(ctx, arrayBuf) {
    return new Promise((resolve, reject) => {
      const res = ctx.decodeAudioData(arrayBuf.slice(0), resolve, reject);
      if (res && typeof res.then === 'function') res.then(resolve, reject);
    });
  }

  function mixdown(buffer) {
    const n = buffer.length;
    const ch = buffer.numberOfChannels;
    const out = new Float32Array(n);
    for (let c = 0; c < ch; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += data[i];
    }
    const inv = 1 / Math.max(1, ch);
    for (let i = 0; i < n; i++) out[i] *= inv;
    return out;
  }

  function resetDSP() {
    if (prevMag) prevMag.fill(0);
    Object.keys(liveFlux).forEach((k) => liveFlux[k].fill(0));
    histIdx = 0;
    histFilled = 0;
    Object.keys(prevBandFlux).forEach((k) => { prevBandFlux[k] = 0; });
    Object.keys(lastHitAt).forEach((k) => { lastHitAt[k] = -1e9; });
  }

  function resetMeters() {
    Object.keys(meterEls).forEach((name) => {
      meterLevel[name] = 0;
      if (meterEls[name]) meterEls[name].style.width = '0%';
    });
  }

  function stopBufferPlayback() {
    if (bufferSource) {
      bufferSource.onended = null;
      try { bufferSource.stop(); } catch (_) {}
      try { bufferSource.disconnect(); } catch (_) {}
      bufferSource = null;
    }
    isPlaying = false;
  }

  function stopMic() {
    if (micSource) {
      try { micSource.disconnect(); } catch (_) {}
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
    analysisToken += 1;
    stopBufferPlayback();
    stopMic();
    currentBuffer = null;
    pauseOffset = 0;
    mode = 'idle';
    useTimeline = false;
    candidates = [];
    activeHits = [];
    hitCursor = 0;
    playerBar.hidden = true;
    resetMeters();
    setStatus('מוכן — בחר מקור שמע', false);
  }

  function playbackTime() {
    if (!currentBuffer || !audioCtx) return pauseOffset || 0;
    const dur = currentBuffer.duration || 1;
    if (!isPlaying) return Math.max(0, Math.min(dur, pauseOffset || 0));
    let elapsed = audioCtx.currentTime - startCtxTime;
    if (isLooping) elapsed = ((elapsed % dur) + dur) % dur;
    else elapsed = Math.max(0, Math.min(dur, elapsed));
    return elapsed;
  }

  function syncCursor(time) {
    const limit = time + LEAD;
    hitCursor = 0;
    while (hitCursor < activeHits.length && activeHits[hitCursor].time < limit - 0.06) hitCursor += 1;
    lastPlayhead = time;
  }

  function fireDueHits(playhead) {
    if (!useTimeline) return;
    if (isLooping && playhead + 0.25 < lastPlayhead) {
      hitCursor = 0;
    }
    lastPlayhead = playhead;
    const limit = playhead + LEAD;
    while (hitCursor < activeHits.length && activeHits[hitCursor].time <= limit) {
      const hit = activeHits[hitCursor];
      hitCursor += 1;
      if (limit - hit.time > 0.09) continue;
      const shown = Math.max(0.4, Math.min(1, hit.strength / 2.4));
      triggerDrum(hit.piece, shown, hit.time);
    }
  }

  function startBufferFrom(offsetSec) {
    if (!currentBuffer || !audioCtx) return;
    stopBufferPlayback();
    const src = audioCtx.createBufferSource();
    src.buffer = currentBuffer;
    src.loop = isLooping;
    src.connect(gainNode);
    const dur = currentBuffer.duration || 1;
    const clamped = Math.max(0, Math.min(offsetSec, Math.max(0, dur - 0.01)));
    pauseOffset = clamped;
    startCtxTime = audioCtx.currentTime - clamped;
    syncCursor(clamped);
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

  function runAnalysis(samples, sampleRate) {
    const token = ++analysisToken;
    setStatus('מנתח את השיר…', false);
    return new Promise((resolve) => {
      const finish = (list) => {
        if (token !== analysisToken) return;
        resolve(list || []);
      };
      const fallback = () => {
        try {
          const list = window.DrumAnalyzer.analyze(samples, sampleRate, (progress) => {
            if (token === analysisToken) {
              setStatus(`מנתח את השיר… ${Math.round(progress * 100)}%`, false);
            }
          });
          finish(list);
        } catch (err) {
          console.error(err);
          finish([]);
        }
      };
      let worker;
      try {
        worker = new Worker('./analyzer-worker.js');
      } catch (_) {
        fallback();
        return;
      }
      const copy = new Float32Array(samples);
      const timer = setTimeout(() => {
        try { worker.terminate(); } catch (_) {}
        fallback();
      }, 25000);
      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.id !== token) return;
        if (data.type === 'progress') {
          setStatus(`מנתח את השיר… ${Math.round((data.progress || 0) * 100)}%`, false);
        } else if (data.type === 'done') {
          clearTimeout(timer);
          try { worker.terminate(); } catch (_) {}
          finish(data.candidates || []);
        } else if (data.type === 'error') {
          clearTimeout(timer);
          try { worker.terminate(); } catch (_) {}
          fallback();
        }
      };
      worker.onerror = () => {
        clearTimeout(timer);
        try { worker.terminate(); } catch (_) {}
        fallback();
      };
      try {
        worker.postMessage({ id: token, samples: copy, sampleRate: sampleRate }, [copy.buffer]);
      } catch (_) {
        clearTimeout(timer);
        try { worker.terminate(); } catch (__) {}
        fallback();
      }
    });
  }

  async function beginTimeline(buffer, title, looping) {
    currentBuffer = buffer;
    mode = looping ? 'demo' : 'file';
    isLooping = looping;
    activeTitle = title;
    hitCount = 0;
    hitCounterEl.textContent = 'מכות: 0';
    hitLog.length = 0;
    useTimeline = true;
    const mono = mixdown(buffer);
    candidates = await runAnalysis(mono, buffer.sampleRate);
    if (!currentBuffer || currentBuffer !== buffer) return;
    activeHits = window.DrumAnalyzer.selectHits(candidates, sensitivity);
    useTimeline = activeHits.length > 0 || candidates.length > 0;
    startBufferFrom(0);
    startLoop();
  }

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
      const audioBuffer = await decodeAudioPromise(ctx, await resp.arrayBuffer());
      await beginTimeline(audioBuffer, 'מקצב דמו (115 BPM)', true);
    } catch (err) {
      console.error(err);
      showToast('לא הצלחתי לטעון את קובץ הדמו');
      setStatus('שגיאה בטעינת דמו', false);
    }
  });

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const ctx = ensureAudioCtx();
    stopMic();
    stopBufferPlayback();
    resetDSP();
    setStatus('מפענח קובץ שמע…', false);
    try {
      const audioBuffer = await decodeAudioPromise(ctx, await file.arrayBuffer());
      const title = file.name.replace(/\.[^/.]+$/, '');
      await beginTimeline(audioBuffer, title, false);
    } catch (err) {
      console.error(err);
      showToast('הפורמט לא נתמך בדפדפן. נסה קובץ MP3, M4A או WAV.');
      setStatus('שגיאה בפענוח הקובץ', false);
    } finally {
      fileInput.value = '';
    }
  });

  btnMic.addEventListener('click', async () => {
    if (mode === 'mic') {
      stopAllAudio();
      return;
    }
    const ctx = ensureAudioCtx();
    stopBufferPlayback();
    currentBuffer = null;
    useTimeline = false;
    candidates = [];
    activeHits = [];
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
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      micStream = stream;
      micSource = ctx.createMediaStreamSource(stream);
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

  btnStop.addEventListener('click', () => stopAllAudio());

  seekSlider.addEventListener('input', () => {
    if (!currentBuffer) return;
    const target = parseFloat(seekSlider.value) || 0;
    if (isPlaying) startBufferFrom(target);
    else {
      pauseOffset = target;
      syncCursor(target);
      trackTime.textContent = `${formatTime(target)} / ${formatTime(currentBuffer.duration)}`;
    }
  });

  function hzToBin(hz) {
    if (!audioCtx || !analyser) return 1;
    const nyquist = audioCtx.sampleRate / 2;
    const clamped = Math.max(0, Math.min(nyquist, hz));
    return Math.max(1, Math.min(analyser.frequencyBinCount - 1, Math.round((clamped / nyquist) * analyser.frequencyBinCount)));
  }

  function bandStats(binStart, binEnd) {
    let flux = 0;
    let energy = 0;
    let peak = 0;
    let peakBin = binStart;
    const count = Math.max(1, binEnd - binStart + 1);
    for (let i = binStart; i <= binEnd; i++) {
      const m = mag[i];
      energy += m;
      if (m > peak) { peak = m; peakBin = i; }
      const diff = m - prevMag[i];
      if (diff > 0) flux += diff;
    }
    return { flux: flux / count, energy: energy / count, peak, peakBin };
  }

  function medianAndMad(arr, len) {
    if (len <= 0) return { med: 0, mad: 0 };
    const tmp = [];
    for (let i = 0; i < len; i++) tmp.push(arr[i]);
    tmp.sort((a, b) => a - b);
    const med = tmp[Math.floor(len / 2)];
    let devSum = 0;
    for (let i = 0; i < tmp.length; i++) devSum += Math.abs(tmp[i] - med);
    return { med, mad: devSum / tmp.length };
  }

  function analyzeMic(nowMs) {
    if (!analyser || !freqBytes || mode !== 'mic') return;
    analyser.getByteFrequencyData(freqBytes);
    const n = freqBytes.length;
    for (let i = 0; i < n; i++) {
      const v = freqBytes[i] / 255;
      mag[i] = v * Math.sqrt(v);
    }
    const kick = bandStats(hzToBin(35), hzToBin(120));
    const floor = bandStats(hzToBin(90), hzToBin(155));
    const mid = bandStats(hzToBin(155), hzToBin(245));
    const high = bandStats(hzToBin(235), hzToBin(470));
    const wire = bandStats(hzToBin(1400), hzToBin(5200));
    const ride = bandStats(hzToBin(3000), hzToBin(7600));
    const hat = bandStats(hzToBin(6800), hzToBin(12000));
    const nyquist = audioCtx.sampleRate / 2;
    const peakHz = (high.peak > mid.peak && high.peak > floor.peak ? high.peakBin : (mid.peak > floor.peak ? mid.peakBin : floor.peakBin)) / mag.length * nyquist;

    meterLevel.kick = Math.max(meterLevel.kick * 0.8, Math.min(1, kick.energy * 2.2));
    meterLevel.snare = Math.max(meterLevel.snare * 0.8, Math.min(1, wire.energy * 2.4));
    meterLevel.hatClosed = Math.max(meterLevel.hatClosed * 0.75, Math.min(1, hat.energy * 2.6));
    meterLevel.ride = Math.max(meterLevel.ride * 0.8, Math.min(1, ride.energy * 2.2));
    meterLevel.tomHigh = Math.max(meterLevel.tomHigh * 0.8, Math.min(1, high.energy * 2.2));
    meterLevel.tomMid = Math.max(meterLevel.tomMid * 0.8, Math.min(1, mid.energy * 2.2));
    meterLevel.tomFloor = Math.max(meterLevel.tomFloor * 0.8, Math.min(1, floor.energy * 2.2));

    const s = sensitivity;
    const len = histFilled;
    function thresh(arr, floorValue) {
      const stats = medianAndMad(arr, len);
      return Math.max(floorValue / s, stats.med * 1.8 + stats.mad * (2 / s) + floorValue * 0.5 / s);
    }
    const peaks = {
      kick: kick.flux > thresh(liveFlux.kick, 0.02) && kick.flux >= prevBandFlux.kick * 0.85,
      snare: wire.flux > thresh(liveFlux.snare, 0.016) && wire.flux >= prevBandFlux.snare * 0.85,
      hat: hat.flux > thresh(liveFlux.hat, 0.01) && hat.flux >= prevBandFlux.hat * 0.85,
      ride: ride.flux > thresh(liveFlux.ride, 0.012) && ride.flux >= prevBandFlux.ride * 0.85,
      tomLow: floor.flux > thresh(liveFlux.tom, 0.018),
      tomMid: mid.flux > thresh(liveFlux.tom, 0.018),
      tomHigh: high.flux > thresh(liveFlux.tom, 0.018)
    };
    const labels = window.DrumAnalyzer.classifyLive({
      low: kick.energy,
      sub: kick.energy * 0.7,
      floorE: floor.energy,
      midE: mid.energy,
      highE: high.energy,
      wire: wire.energy,
      rideE: ride.energy,
      hatE: hat.energy,
      presence: mid.energy,
      peakHz: peakHz || 80,
      peakiness: (high.peak + mid.peak + floor.peak) / (high.energy + mid.energy + floor.energy + 1e-6),
      bodyHz: peakHz,
      bodyPeak: mid.peak / (mid.energy + 1e-6),
      highHz: high.peakBin / mag.length * nyquist,
      highPeak: high.peak / (high.energy + 1e-6),
      cymPeak: ride.peak / (ride.energy + 1e-6),
      dHat: ride.energy > hat.energy * 0.85 ? 0.42 : 0.12,
      dLong: (hat.energy + ride.energy) > wire.energy * 1.6 && hat.energy > 0.08 ? 0.62 : 0.12,
      dLow: 0.35,
      dLowP: 0.35,
      lowNow: kick.energy,
      percRatioLow: 0.2,
      strength: 1.2,
      peakBands: peaks
    });
    labels.forEach((lab) => {
      const gap = lab.piece === 'hatClosed' ? 60 : lab.piece === 'crash' || lab.piece === 'crash2' ? 280 : 90;
      if (nowMs - (lastHitAt[lab.piece] || -1e9) < gap) return;
      lastHitAt[lab.piece] = nowMs;
      triggerDrum(lab.piece, Math.max(0.45, Math.min(1, lab.strength || 0.8)));
    });

    liveFlux.kick[histIdx] = kick.flux;
    liveFlux.snare[histIdx] = wire.flux;
    liveFlux.tom[histIdx] = Math.max(floor.flux, mid.flux, high.flux);
    liveFlux.hat[histIdx] = hat.flux;
    liveFlux.ride[histIdx] = ride.flux;
    histIdx = (histIdx + 1) % HISTORY_LEN;
    if (histFilled < HISTORY_LEN) histFilled += 1;
    prevBandFlux.kick = kick.flux;
    prevBandFlux.snare = wire.flux;
    prevBandFlux.tom = Math.max(floor.flux, mid.flux, high.flux);
    prevBandFlux.hat = hat.flux;
    prevBandFlux.ride = ride.flux;
    prevMag.set(mag);
  }

  function triggerDrum(drum, strength = 0.9, audioTime) {
    const meta = DRUM_META[drum];
    if (!meta) return;
    const vis = meta.vis;
    drumState[vis] = Math.max(drumState[vis] || 0, 0.55 + 0.45 * strength);
    meterLevel[drum] = Math.max(meterLevel[drum] || 0, 0.4 + 0.6 * strength);
    if (meta.hat === 'open') hatOpenTarget = 1;
    if (meta.hat === 'closed') hatOpenTarget = 0;
    hitCount += 1;
    hitCounterEl.textContent = `מכות: ${hitCount}`;
    const nowMs = performance.now();
    hitLog.push({
      drum,
      timeMs: audioTime == null ? Math.round(nowMs) : Math.round(audioTime * 1000),
      strength: Number(strength.toFixed(2))
    });
    if (hitLog.length > 400) hitLog.shift();
    hitPill.textContent = meta.label;
    if (nowMs - lastHudPop > 45) {
      hitPill.classList.remove('pop');
      void hitPill.offsetWidth;
      hitPill.classList.add('pop');
      lastHudPop = nowMs;
    }
    if (meta.stick) {
      const st = stickAnim[meta.stick];
      st.targetX = meta.x;
      st.targetY = meta.y;
      st.timer = 1;
    }
    spawnImpactFX(meta.x, meta.y, meta.color, drum === 'kick' || drum === 'crash' || drum === 'crash2' ? 1.15 : 0.85);
  }

  function spawnImpactFX(x, y, color, scale = 1) {
    const fx = svgPieces.fxLayer;
    if (!fx) return;
    if (fx.childElementCount > 18) {
      while (fx.childElementCount > 10) fx.removeChild(fx.firstChild);
    }
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('cx', x);
    ring.setAttribute('cy', y);
    ring.setAttribute('r', String(8 * scale));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', color);
    ring.setAttribute('stroke-width', '3');
    ring.setAttribute('opacity', '0.95');
    g.appendChild(ring);
    fx.appendChild(g);
    const start = performance.now();
    function stepFX(t) {
      const p = Math.min(1, (t - start) / 220);
      ring.setAttribute('r', String((8 + 26 * p) * scale));
      ring.setAttribute('opacity', String((1 - p) * 0.95));
      if (p < 1) requestAnimationFrame(stepFX);
      else if (g.parentNode === fx) fx.removeChild(g);
    }
    requestAnimationFrame(stepFX);
  }

  function updateStick(side, dt) {
    const st = stickAnim[side];
    const el = stickEls[side];
    if (!el.forearm) return;
    if (st.timer > 0) st.timer = Math.max(0, st.timer - dt / 160);
    const lift = st.timer > 0.72 ? 0 : (1 - st.timer) * 18;
    const goalX = st.timer > 0 ? st.targetX : el.home.x;
    const goalY = (st.timer > 0 ? st.targetY : el.home.y) - lift;
    const lerp = Math.min(1, dt / 22);
    st.x += (goalX - st.x) * lerp;
    st.y += (goalY - st.y) * lerp;
    const handX = el.shoulder.x + (st.x - el.shoulder.x) * 0.46;
    const handY = el.shoulder.y + (st.y - el.shoulder.y) * 0.46 - 4;
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

  function paintPiece(el, amount, dx, dy, glow) {
    if (!el) return;
    const sx = 1 + amount * 0.06;
    const sy = 1 - amount * 0.04;
    el.style.transform = `translate(${(dx || 0).toFixed(2)}px, ${(dy || 0).toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    el.style.filter = amount > 0.08 ? `drop-shadow(0 0 ${(amount * 14).toFixed(1)}px ${glow})` : '';
  }

  function renderVisuals(nowMs, dt) {
    Object.keys(drumState).forEach((key) => {
      const decay = key === 'crash' || key === 'crash2' || key === 'ride' ? 240 : key === 'hihat' ? 70 : 100;
      drumState[key] *= Math.exp(-dt / decay);
    });
    Object.keys(meterLevel).forEach((key) => {
      meterLevel[key] *= Math.exp(-dt / 180);
      if (meterEls[key]) meterEls[key].style.width = `${Math.min(100, Math.round(meterLevel[key] * 100))}%`;
    });

    const k = drumState.kick;
    paintPiece(svgPieces.kick, k, 0, 0, 'rgba(255,107,74,0.85)');
    if (svgPieces.kickBeater) {
      svgPieces.kickBeater.style.transform = `translateY(${(-k * 10).toFixed(2)}px)`;
    }
    paintPiece(svgPieces.snare, drumState.snare, 0, drumState.snare * 4, 'rgba(255,209,102,0.85)');
    paintPiece(svgPieces.tomHigh, drumState.tomHigh, 0, drumState.tomHigh * 4, 'rgba(78,205,196,0.85)');
    paintPiece(svgPieces.tomMid, drumState.tomMid, 0, drumState.tomMid * 4, 'rgba(255,177,94,0.85)');
    paintPiece(svgPieces.tomFloor, drumState.tomFloor, 0, drumState.tomFloor * 4, 'rgba(106,147,255,0.85)');

    hatOpenAmount += (hatOpenTarget - hatOpenAmount) * Math.min(1, dt / 90);
    const h = drumState.hihat;
    if (svgPieces.hihatTop) {
      const lift = hatOpenAmount * 7 + h * 3;
      const wobble = Math.sin(nowMs * 0.05) * h * 4;
      svgPieces.hihatTop.style.transform = `translateY(${(-lift).toFixed(2)}px) rotate(${wobble.toFixed(2)}deg)`;
    }
    if (svgPieces.hihat) {
      svgPieces.hihat.style.filter = h > 0.08 ? `drop-shadow(0 0 ${(h * 12).toFixed(1)}px rgba(78,205,196,0.85))` : '';
    }
    if (svgPieces.hihatFoot) {
      const press = (1 - hatOpenAmount) * 4 - h * 2;
      svgPieces.hihatFoot.style.transform = `translateY(${press.toFixed(2)}px)`;
    }

    const c = drumState.crash;
    if (svgPieces.crash) {
      const wobble = Math.sin(nowMs * 0.04) * c * 10;
      svgPieces.crash.style.transform = `rotate(${wobble.toFixed(2)}deg) scale(${(1 + c * 0.05).toFixed(3)})`;
      svgPieces.crash.style.filter = c > 0.08 ? `drop-shadow(0 0 ${(c * 16).toFixed(1)}px rgba(255,229,143,0.9))` : '';
    }
    const c2 = drumState.crash2;
    if (svgPieces.crash2) {
      const wobble2 = Math.sin(nowMs * 0.045 + 1) * c2 * 9;
      svgPieces.crash2.style.transform = `rotate(${wobble2.toFixed(2)}deg) scale(${(1 + c2 * 0.05).toFixed(3)})`;
      svgPieces.crash2.style.filter = c2 > 0.08 ? `drop-shadow(0 0 ${(c2 * 14).toFixed(1)}px rgba(255,159,107,0.9))` : '';
    }
    const r = drumState.ride;
    if (svgPieces.ride) {
      svgPieces.ride.style.transform = `scale(${(1 + r * 0.04).toFixed(3)})`;
      svgPieces.ride.style.filter = r > 0.08 ? `drop-shadow(0 0 ${(r * 14).toFixed(1)}px rgba(255,229,143,0.9))` : '';
    }
    if (svgPieces.rideBell) {
      svgPieces.rideBell.setAttribute('r', (6.5 + r * 2.2).toFixed(2));
    }

    if (svgPieces.drummer) {
      const bob = Math.max(k, drumState.snare) * 3.5;
      svgPieces.drummer.style.transform = `translateY(${bob.toFixed(2)}px)`;
    }
    updateStick('left', dt);
    updateStick('right', dt);

    if ((mode === 'demo' || mode === 'file') && currentBuffer && audioCtx) {
      const dur = currentBuffer.duration || 1;
      const elapsed = playbackTime();
      if (isPlaying) {
        fireDueHits(elapsed);
        seekSlider.value = elapsed.toFixed(2);
      }
      trackTime.textContent = `${formatTime(elapsed)} / ${formatTime(dur)}`;
    }
  }

  function frame(nowMs) {
    const dt = Math.min(50, Math.max(4, nowMs - lastFrameMs));
    lastFrameMs = nowMs;
    if (mode === 'mic') analyzeMic(nowMs);
    renderVisuals(nowMs, dt);
    if (!screenStage.hidden) rafId = requestAnimationFrame(frame);
    else rafId = null;
  }

  function startLoop() {
    if (!rafId) {
      lastFrameMs = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }
})();
