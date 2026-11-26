(() => {
  'use strict';

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  const screenPicker = document.getElementById('screen-picker');
  const screenStage = document.getElementById('screen-stage');
  const pickDrums = document.getElementById('pick-drums');
  const soonCards = document.querySelectorAll('.inst-soon');
  const btnBack = document.getElementById('btn-back');
  const btnSettings = document.getElementById('btn-settings');
  const settingsPanel = document.getElementById('settings-panel');
  const sensitivitySlider = document.getElementById('sensitivity-slider');
  const sensitivityVal = document.getElementById('sensitivity-val');
  const syncSlider = document.getElementById('sync-slider');
  const syncVal = document.getElementById('sync-val');
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
  const fallbackMedia = document.getElementById('fallback-media');

  const PIECES = {
    kick: { x: 485, y: 430, label: 'בס', color: '#ff6b4a', el: 'piece-kick', cymbal: false },
    snare: { x: 315, y: 500, label: 'סנר', color: '#ffd166', el: 'piece-snare', cymbal: false },
    hatClosed: { x: 145, y: 395, label: 'היי-האט סגור', color: '#e7c56a', el: 'piece-hat', cymbal: true },
    hatOpen: { x: 145, y: 395, label: 'היי-האט פתוח', color: '#fff1c2', el: 'piece-hat', cymbal: true },
    tomHigh: { x: 400, y: 250, label: 'טום גבוה', color: '#d7dbe4', el: 'piece-tom-high', cymbal: false },
    tomMid: { x: 545, y: 242, label: 'טום אמצעי', color: '#d7dbe4', el: 'piece-tom-mid', cymbal: false },
    tomFloor: { x: 770, y: 455, label: 'טום רצפה', color: '#d7dbe4', el: 'piece-floor', cymbal: false },
    ride: { x: 690, y: 165, label: 'רייד', color: '#f0d078', el: 'piece-ride', cymbal: true },
    crash: { x: 175, y: 145, label: 'קראש', color: '#f0d078', el: 'piece-crash', cymbal: true },
    crash2: { x: 865, y: 195, label: 'קראש 2', color: '#e2b15a', el: 'piece-crash2', cymbal: true }
  };

  const handHome = {
    left: { x: 280, y: 620, aim: { x: 315, y: 500 } },
    right: { x: 560, y: 610, aim: { x: 690, y: 165 } }
  };
  const handEl = { left: document.getElementById('hand-left'), right: document.getElementById('hand-right') };
  const progressWrap = document.getElementById('progress-wrap');
  const progressLabel = document.getElementById('progress-label');
  const progressBar = document.getElementById('progress-bar');
  const drumsOnlyInput = document.getElementById('drums-only');
  const quickModeInput = document.getElementById('quick-mode');
  const footRight = document.getElementById('foot-right');
  const footLeft = document.getElementById('foot-left');
  const hatTop = document.getElementById('hat-top');
  const fxLayer = document.getElementById('fx-layer');
  const meters = {
    kick: document.getElementById('meter-kick'),
    snare: document.getElementById('meter-snare'),
    hat: document.getElementById('meter-hat'),
    tom: document.getElementById('meter-tom'),
    cym: document.getElementById('meter-cym')
  };

  let audioCtx = null;
  let analyser = null;
  let gainNode = null;
  let mediaSource = null;
  let mode = 'idle';
  let sensitivity = 1;
  let userSyncSec = 0;
  let currentBuffer = null;
  let fullBuffer = null;
  let drumBuffer = null;
  let bufferSource = null;
  let isPlaying = false;
  let isLooping = false;
  let startCtxTime = 0;
  let pauseOffset = 0;
  let activeTitle = '';
  let mediaMode = false;
  let micStream = null;
  let micSource = null;
  let analysisToken = 0;
  let candidates = [];
  let activeHits = [];
  let hitCursor = 0;
  let lastPlayhead = 0;
  let useTimeline = false;
  let hatOpen = 0;
  let hitCount = 0;
  let rafId = null;
  let lastFrame = performance.now();
  let toastTimer = null;
  const flash = {};
  Object.keys(PIECES).forEach((k) => { flash[k] = 0; });
  const meterLevel = { kick: 0, snare: 0, hat: 0, tom: 0, cym: 0 };
  const hitLog = [];

  window.__DRUM_DEBUG__ = {
    getHitLog: () => hitLog.slice(),
    getActiveHits: () => activeHits.slice(),
    getHitCount: () => hitCount,
    isPlaying: () => isPlaying
  };

  let freqBytes = null;
  let mag = null;
  let prevMag = null;
  const HIST = 24;
  const liveFlux = { kick: [], snare: [], hat: [], ride: [] };
  let histCount = 0;
  const lastHitAt = {};

  function setStatus(text, live) {
    statusText.textContent = text;
    statusPill.classList.toggle('is-live', !!live);
  }
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }
  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  pickDrums.addEventListener('click', () => {
    screenPicker.hidden = true;
    screenPicker.classList.remove('screen-active');
    screenStage.hidden = false;
    screenStage.classList.add('screen-active');
    startLoop();
  });
  soonCards.forEach((card) => {
    card.addEventListener('click', () => {
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      showToast((card.dataset.soon || 'הכלי') + ' יגיע בקרוב! בינתיים בואו ננסה תופים 🥁');
    });
  });
  btnBack.addEventListener('click', () => {
    stopAll();
    screenStage.hidden = true;
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
    sensitivityVal.textContent = sensitivity.toFixed(1) + '×';
    if (useTimeline && window.DrumAnalyzer) {
      activeHits = assignHands(window.DrumAnalyzer.selectHits(candidates, sensitivity));
      syncCursor(visualSongTime());
    }
  });
  syncSlider.addEventListener('input', () => {
    userSyncSec = (parseFloat(syncSlider.value) || 0) / 1000;
    const n = Math.round(userSyncSec * 1000);
    syncVal.textContent = (n > 0 ? '+' : '') + n + ' ms';
  });
  if (drumsOnlyInput) {
    drumsOnlyInput.addEventListener('change', () => {
      if (!fullBuffer) return;
      const at = isPlaying && audioCtx ? Math.max(0, audioCtx.currentTime - startCtxTime) : pauseOffset;
      currentBuffer = drumsOnlyInput.checked && drumBuffer ? drumBuffer : fullBuffer;
      if (isPlaying) startBufferFrom(at);
    });
  }

  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      gainNode = audioCtx.createGain();
      gainNode.connect(analyser);
      analyser.connect(audioCtx.destination);
      freqBytes = new Uint8Array(analyser.frequencyBinCount);
      mag = new Float32Array(analyser.frequencyBinCount);
      prevMag = new Float32Array(analyser.frequencyBinCount);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function decodeAudio(ctx, bytes) {
    return new Promise((resolve, reject) => {
      const copy = bytes.slice(0);
      const res = ctx.decodeAudioData(copy, resolve, reject);
      if (res && typeof res.then === 'function') res.then(resolve).catch(reject);
    });
  }

  function resampleChannel(buffer, channel, targetRate) {
    const src = buffer.getChannelData(channel);
    const srcRate = buffer.sampleRate;
    if (srcRate === targetRate) return new Float32Array(src);
    const outLen = Math.max(1, Math.floor(src.length * targetRate / srcRate));
    const out = new Float32Array(outLen);
    const ratio = srcRate / targetRate;
    const last = src.length - 1;
    for (let i = 0; i < outLen; i++) {
      const x = i * ratio;
      const i0 = x | 0;
      if (i0 >= last) { out[i] = src[last]; continue; }
      const f = x - i0;
      out[i] = src[i0] * (1 - f) + src[i0 + 1] * f;
    }
    return out;
  }

  function songKey(buffer) {
    const ch = buffer.getChannelData(0);
    let h = buffer.length >>> 0;
    const step = Math.max(1, Math.floor(ch.length / 48));
    for (let i = 0; i < ch.length; i += step) h = Math.imul(h ^ (Math.round(ch[i] * 1e6) | 0), 16777619);
    return 'umxhq-v1-' + buffer.sampleRate + '-' + buffer.numberOfChannels + '-' + (h >>> 0);
  }

  function idbStore() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('drumviz', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('stems'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function showProgress(text, frac) {
    if (!progressWrap) return;
    progressWrap.hidden = false;
    progressLabel.textContent = text;
    progressBar.style.width = Math.max(0, Math.min(100, Math.round(frac * 100))) + '%';
  }
  function hideProgress() {
    if (progressWrap) progressWrap.hidden = true;
  }

  function bufferFromStereo(left, right, sampleRate) {
    const ctx = ensureAudio();
    const audio = ctx.createBuffer(2, left.length, sampleRate);
    audio.copyToChannel(left, 0);
    audio.copyToChannel(right, 1);
    return audio;
  }

  function separateDrums(audioBuffer) {
    const token = analysisToken;
    return new Promise(async (resolve) => {
      try {
        const db = await idbStore();
        const key = songKey(audioBuffer);
        const cached = await new Promise((res) => {
          const tx = db.transaction('stems', 'readonly');
          const req = tx.objectStore('stems').get(key);
          req.onsuccess = () => res(req.result || null);
          req.onerror = () => res(null);
        });
        if (cached && cached.left && cached.right) {
          showProgress('מפריד את התופים… 100%', 1);
          resolve(bufferFromStereo(cached.left, cached.right, cached.sampleRate || 44100));
          return;
        }
        const left = resampleChannel(audioBuffer, 0, 44100);
        const right = audioBuffer.numberOfChannels > 1 ? resampleChannel(audioBuffer, 1, 44100) : left.slice();
        const worker = new Worker('./separator-worker.js');
        const timer = setTimeout(() => { try { worker.terminate(); } catch (_) {} resolve(null); }, 180000);
        worker.onmessage = async (event) => {
          const data = event.data || {};
          if (data.type === 'progress') {
            showProgress('מפריד את התופים… ' + Math.round((data.progress || 0) * 100) + '%', data.progress || 0);
            return;
          }
          clearTimeout(timer);
          try { worker.terminate(); } catch (_) {}
          if (data.type !== 'done' || token !== analysisToken) { resolve(null); return; }
          try {
            const tx = db.transaction('stems', 'readwrite');
            tx.objectStore('stems').put({ left: data.left, right: data.right, sampleRate: data.sampleRate }, key);
          } catch (_) {}
          resolve(bufferFromStereo(data.left, data.right, data.sampleRate));
        };
        worker.onerror = () => { clearTimeout(timer); try { worker.terminate(); } catch (_) {} resolve(null); };
        worker.postMessage({ id: token, left, right }, [left.buffer, right.buffer]);
      } catch (err) {
        console.error(err);
        resolve(null);
      }
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
    const inv = 1 / ch;
    for (let i = 0; i < n; i++) out[i] *= inv;
    return out;
  }

  function audibleContextTime() {
    const now = audioCtx.currentTime;
    const latency = Math.min(0.5, (audioCtx.outputLatency || 0) + (audioCtx.baseLatency || 0));
    if (audioCtx.getOutputTimestamp) {
      const ts = audioCtx.getOutputTimestamp();
      if (ts && Number.isFinite(ts.contextTime) && Number.isFinite(ts.performanceTime) && ts.performanceTime > 0) {
        const derived = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
        if (Math.abs(derived - now) < 1.5) return derived;
      }
    }
    return now - latency;
  }

  function visualSongTime() {
    if (mediaMode && fallbackMedia.src) {
      return Math.max(0, (fallbackMedia.currentTime || 0) + userSyncSec);
    }
    if (!audioCtx || !currentBuffer) return Math.max(0, (pauseOffset || 0) + userSyncSec);
    const dur = currentBuffer.duration || 1;
    if (!isPlaying) return Math.max(0, Math.min(dur, (pauseOffset || 0) + userSyncSec));
    let pos = audibleContextTime() - startCtxTime + userSyncSec;
    if (isLooping) pos = ((pos % dur) + dur) % dur;
    else pos = Math.max(0, Math.min(dur, pos));
    return pos;
  }

  function sideFor(piece, prev) {
    if (piece === 'snare' || piece === 'tomHigh' || piece === 'crash') return 'left';
    if (piece === 'hatClosed' || piece === 'hatOpen' || piece === 'ride' || piece === 'crash2' || piece === 'tomMid') return 'right';
    if (piece === 'tomFloor') return prev === 'right' ? 'left' : 'right';
    return null;
  }

  function assignHands(hits) {
    let prev = 'left';
    return hits.map((h) => {
      const hand = sideFor(h.piece, prev);
      if (hand) prev = hand;
      return { time: h.time, piece: h.piece, strength: h.strength, hand: hand };
    });
  }

  function syncCursor(time) {
    hitCursor = 0;
    while (hitCursor < activeHits.length && activeHits[hitCursor].time < time - 0.03) hitCursor += 1;
    lastPlayhead = time;
  }

  function stopBuffer() {
    if (bufferSource) {
      bufferSource.onended = null;
      try { bufferSource.stop(); } catch (_) {}
      try { bufferSource.disconnect(); } catch (_) {}
      bufferSource = null;
    }
    isPlaying = false;
  }

  function stopMic() {
    if (micSource) { try { micSource.disconnect(); } catch (_) {} micSource = null; }
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
    btnMic.classList.remove('is-active');
    micBtnLabel.textContent = 'האזן למיקרופון';
  }

  function stopMedia() {
    try { fallbackMedia.pause(); } catch (_) {}
    fallbackMedia.removeAttribute('src');
    try { fallbackMedia.load(); } catch (_) {}
    mediaMode = false;
  }

  function stopAll() {
    analysisToken += 1;
    stopBuffer();
    stopMic();
    stopMedia();
    currentBuffer = null;
    useTimeline = false;
    candidates = [];
    activeHits = [];
    pauseOffset = 0;
    mode = 'idle';
    playerBar.hidden = true;
    Object.keys(meterLevel).forEach((k) => { meterLevel[k] = 0; if (meters[k]) meters[k].style.width = '0%'; });
    setStatus('מוכן — בחר מקור שמע', false);
  }

  function startBufferFrom(offset) {
    if (!currentBuffer || !audioCtx) return;
    stopBuffer();
    const src = audioCtx.createBufferSource();
    src.buffer = currentBuffer;
    src.loop = isLooping;
    src.connect(gainNode);
    const dur = currentBuffer.duration || 1;
    const clamped = Math.max(0, Math.min(offset, Math.max(0.01, dur - 0.05)));
    pauseOffset = clamped;
    startCtxTime = audioCtx.currentTime - clamped;
    syncCursor(clamped + userSyncSec);
    src.onended = () => {
      if (bufferSource === src && !isLooping) {
        isPlaying = false;
        btnPlayPause.textContent = '▶';
        setStatus('השיר הסתיים', false);
      }
    };
    src.start(0, clamped);
    bufferSource = src;
    isPlaying = true;
    btnPlayPause.textContent = '⏸';
    playerBar.hidden = false;
    trackTitle.textContent = activeTitle;
    seekSlider.max = String(dur);
    setStatus(mode === 'demo' ? 'מנגן מקצב דמו' : 'מנגן: ' + activeTitle, true);
  }

  function runAnalysis(samples, sampleRate) {
    const token = ++analysisToken;
    setStatus('מנתח את השיר…', false);
    return new Promise((resolve) => {
      const finish = (list) => { if (token === analysisToken) resolve(list || []); };
      const fallback = () => {
        try {
          finish(window.DrumAnalyzer.analyze(samples, sampleRate, (p) => {
            if (token === analysisToken) setStatus('מנתח את השיר… ' + Math.round(p * 100) + '%', false);
          }));
        } catch (err) {
          console.error(err);
          finish([]);
        }
      };
      let worker;
      try { worker = new Worker('./analyzer-worker.js'); } catch (_) { fallback(); return; }
      const copy = new Float32Array(samples);
      const timer = setTimeout(() => { try { worker.terminate(); } catch (_) {} fallback(); }, 30000);
      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.id !== token) return;
        if (data.type === 'progress') setStatus('מנתח את השיר… ' + Math.round((data.progress || 0) * 100) + '%', false);
        else if (data.type === 'done') { clearTimeout(timer); try { worker.terminate(); } catch (_) {} finish(data.candidates || []); }
        else { clearTimeout(timer); try { worker.terminate(); } catch (_) {} fallback(); }
      };
      worker.onerror = () => { clearTimeout(timer); try { worker.terminate(); } catch (_) {} fallback(); };
      try { worker.postMessage({ id: token, samples: copy, sampleRate: sampleRate }, [copy.buffer]); }
      catch (_) { clearTimeout(timer); try { worker.terminate(); } catch (__) {} fallback(); }
    });
  }

  async function beginTimeline(buffer, title, looping, quick) {
    fullBuffer = buffer;
    drumBuffer = null;
    currentBuffer = buffer;
    mode = looping ? 'demo' : 'file';
    isLooping = looping;
    activeTitle = title;
    mediaMode = false;
    hitCount = 0;
    hitCounterEl.textContent = 'מכות: 0';
    hitLog.length = 0;
    useTimeline = true;
    let detectFrom = buffer;
    const wantModel = !quick && !(quickModeInput && quickModeInput.checked);
    if (wantModel) {
      showProgress('מפריד את התופים… 0%', 0);
      const stem = await separateDrums(buffer);
      hideProgress();
      if (fullBuffer !== buffer) return;
      if (stem) {
        drumBuffer = stem;
        detectFrom = stem;
        if (drumsOnlyInput && drumsOnlyInput.checked) currentBuffer = stem;
      } else {
        showToast('ההפרדה לא עלתה. ממשיכים במצב מהיר.');
      }
    }
    const mono = mixdown(detectFrom);
    candidates = await runAnalysis(mono, detectFrom.sampleRate);
    if (fullBuffer !== buffer) return;
    activeHits = assignHands(window.DrumAnalyzer.selectHits(candidates, sensitivity));
    startBufferFrom(0);
    startLoop();
    hideProgress();
  }

  btnDemo.addEventListener('click', async () => {
    const ctx = ensureAudio();
    stopMic();
    stopMedia();
    if (mode === 'demo' && currentBuffer && !isPlaying) { startBufferFrom(pauseOffset); return; }
    stopBuffer();
    setStatus('טוען מקצב דמו…', false);
    try {
      const resp = await fetch('./demo-beat.wav');
      const audio = await decodeAudio(ctx, await resp.arrayBuffer());
      await beginTimeline(audio, 'מקצב דמו (115 BPM)', true, true);
    } catch (err) {
      console.error(err);
      showToast('לא הצלחתי לטעון את קובץ הדמו');
      setStatus('שגיאה בטעינת דמו', false);
    }
  });

  async function playViaElement(file) {
    const ctx = ensureAudio();
    const url = URL.createObjectURL(file);
    fallbackMedia.src = url;
    if (!mediaSource) {
      mediaSource = ctx.createMediaElementSource(fallbackMedia);
      mediaSource.connect(gainNode);
    }
    mediaMode = true;
    useTimeline = false;
    mode = 'file';
    activeTitle = file.name.replace(/\.[^/.]+$/, '');
    await fallbackMedia.play();
    isPlaying = true;
    playerBar.hidden = false;
    trackTitle.textContent = activeTitle;
    btnPlayPause.textContent = '⏸';
    setStatus('מנגן בזמן אמת: ' + activeTitle, true);
    startLoop();
  }

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    fileInput.value = '';
    if (!file) return;
    const ctx = ensureAudio();
    stopMic();
    stopBuffer();
    stopMedia();
    setStatus('מפענח קובץ שמע…', false);
    try {
      const bytes = await file.arrayBuffer();
      let decoded = null;
      try { decoded = await decodeAudio(ctx, bytes); } catch (_) { decoded = null; }
      if (decoded && decoded.duration > 0.15 && decoded.length > 2000) {
        await beginTimeline(decoded, file.name.replace(/\.[^/.]+$/, ''), false);
        return;
      }
      await playViaElement(file);
    } catch (err) {
      console.error(err);
      showToast('לא הצלחתי לקרוא את הקובץ. נסה MP3, M4A, WAV או MP4.');
      setStatus('שגיאה בפענוח הקובץ', false);
    }
  });

  btnMic.addEventListener('click', async () => {
    if (mode === 'mic') { stopAll(); return; }
    const ctx = ensureAudio();
    stopBuffer();
    stopMedia();
    currentBuffer = null;
    useTimeline = false;
    playerBar.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('המיקרופון באייפון דורש HTTPS.');
      return;
    }
    setStatus('מבקש גישה למיקרופון…', false);
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micSource = ctx.createMediaStreamSource(micStream);
      micSource.connect(analyser);
      mode = 'mic';
      hitCount = 0;
      hitCounterEl.textContent = 'מכות: 0';
      btnMic.classList.add('is-active');
      micBtnLabel.textContent = 'עצור מיקרופון';
      setStatus('מאזין למוזיקה מהסביבה', true);
      startLoop();
    } catch (err) {
      console.error(err);
      showToast('אין הרשאה למיקרופון.');
      setStatus('הגישה למיקרופון נדחתה', false);
    }
  });

  btnPlayPause.addEventListener('click', () => {
    ensureAudio();
    if (mediaMode) {
      if (fallbackMedia.paused) { fallbackMedia.play(); isPlaying = true; btnPlayPause.textContent = '⏸'; setStatus('מנגן: ' + activeTitle, true); }
      else { fallbackMedia.pause(); isPlaying = false; btnPlayPause.textContent = '▶'; setStatus('מושהה', false); }
      return;
    }
    if (!currentBuffer) return;
    if (isPlaying) {
      const dur = currentBuffer.duration || 1;
      pauseOffset = ((audioCtx.currentTime - startCtxTime) % dur + dur) % dur;
      stopBuffer();
      btnPlayPause.textContent = '▶';
      setStatus('מושהה', false);
    } else startBufferFrom(pauseOffset);
  });
  btnStop.addEventListener('click', () => stopAll());
  seekSlider.addEventListener('input', () => {
    const target = parseFloat(seekSlider.value) || 0;
    if (mediaMode) { fallbackMedia.currentTime = target; return; }
    if (!currentBuffer) return;
    if (isPlaying) startBufferFrom(target);
    else { pauseOffset = target; syncCursor(target + userSyncSec); trackTime.textContent = formatTime(target) + ' / ' + formatTime(currentBuffer.duration); }
  });

  function triggerDrum(piece, strength, when) {
    const meta = PIECES[piece];
    if (!meta) return;
    flash[piece] = Math.max(flash[piece] || 0, 0.55 + 0.45 * strength);
    if (piece === 'kick') meterLevel.kick = Math.max(meterLevel.kick, strength);
    else if (piece === 'snare') meterLevel.snare = Math.max(meterLevel.snare, strength);
    else if (piece === 'hatClosed' || piece === 'hatOpen') meterLevel.hat = Math.max(meterLevel.hat, strength);
    else if (piece.indexOf('tom') === 0) meterLevel.tom = Math.max(meterLevel.tom, strength);
    else meterLevel.cym = Math.max(meterLevel.cym, strength);
    if (piece === 'hatOpen') hatOpen = 1;
    if (piece === 'hatClosed') hatOpen = 0;
    hitCount += 1;
    hitCounterEl.textContent = 'מכות: ' + hitCount;
    hitLog.push({ drum: piece, timeMs: when == null ? Math.round(performance.now()) : Math.round(when * 1000), strength: Number(strength.toFixed(2)) });
    if (hitLog.length > 500) hitLog.shift();
    hitPill.textContent = meta.label;
    hitPill.classList.remove('pop');
    void hitPill.offsetWidth;
    hitPill.classList.add('pop');
    spawnRipple(meta.x, meta.y, meta.color, 0.8 + strength * 0.6);
  }

  function spawnRipple(x, y, color, scale) {
    const ns = 'http://www.w3.org/2000/svg';
    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('cx', x);
    ring.setAttribute('cy', y);
    ring.setAttribute('r', String(8 * scale));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', color);
    ring.setAttribute('stroke-width', '3');
    fxLayer.appendChild(ring);
    const start = performance.now();
    function step(t) {
      const p = Math.min(1, (t - start) / 220);
      ring.setAttribute('r', String((8 + 28 * p) * scale));
      ring.setAttribute('opacity', String(1 - p));
      if (p < 1) requestAnimationFrame(step);
      else ring.remove();
    }
    requestAnimationFrame(step);
  }

  function fireDue(time) {
    if (!useTimeline) return;
    if (isLooping && time + 0.3 < lastPlayhead) hitCursor = 0;
    lastPlayhead = time;
    while (hitCursor < activeHits.length && activeHits[hitCursor].time <= time + 0.012) {
      const hit = activeHits[hitCursor++];
      if (time - hit.time > 0.08) continue;
      triggerDrum(hit.piece, Math.max(0.4, Math.min(1, hit.strength / 2.2)), hit.time);
    }
  }

  function placeHand(side, time) {
    const home = handHome[side];
    let hit = null;
    for (let i = 0; i < activeHits.length; i++) {
      const h = activeHits[i];
      if (h.hand !== side) continue;
      if (h.time >= time - 0.06 && h.time <= time + 0.16) { hit = h; break; }
    }
    if (!hit) return { x: home.x, y: home.y, aim: { x: 485, y: 360 } };
    const target = PIECES[hit.piece];
    const lead = 0.14;
    const dt = hit.time - time;
    if (dt > lead) return { x: home.x, y: home.y, aim: { x: 485, y: 360 } };
    if (dt > 0.01) {
      const p = (lead - dt) / (lead - 0.01);
      const e = p * p * (3 - 2 * p);
      return { x: home.x + (target.x - home.x) * e, y: home.y + (target.y - home.y) * e, aim: target };
    }
    const rebound = Math.min(1, Math.max(0, -dt) / 0.06);
    return { x: target.x, y: target.y - rebound * 12, aim: target };
  }

  function render(dt) {
    Object.keys(flash).forEach((k) => { flash[k] *= Math.exp(-dt / 110); });
    Object.keys(meterLevel).forEach((k) => {
      meterLevel[k] *= Math.exp(-dt / 200);
      if (meters[k]) meters[k].style.width = Math.min(100, Math.round(meterLevel[k] * 100)) + '%';
    });
    Object.keys(PIECES).forEach((name) => {
      const meta = PIECES[name];
      const el = document.getElementById(meta.el);
      if (!el || name === 'hatOpen') return;
      const amount = name === 'hatClosed' ? Math.max(flash.hatClosed || 0, flash.hatOpen || 0) : (flash[name] || 0);
      const s = 1 + amount * 0.045;
      const wob = meta.cymbal ? Math.sin(performance.now() / 70 + meta.x) * amount * 7 : 0;
      el.setAttribute('transform', 'translate(' + meta.x + ' ' + meta.y + ') rotate(' + wob.toFixed(2) + ') scale(' + s.toFixed(3) + ') translate(' + (-meta.x) + ' ' + (-meta.y) + ')');
      el.style.filter = amount > 0.08 ? 'drop-shadow(0 0 ' + (amount * 10).toFixed(1) + 'px ' + meta.color + ')' : '';
    });
    if (hatTop) {
      const lift = hatOpen * 8;
      hatTop.setAttribute('transform', 'translate(0 ' + (-lift).toFixed(1) + ')');
    }
    const t = (mode === 'demo' || mode === 'file') ? visualSongTime() : 0;
    if (useTimeline && isPlaying) fireDue(t);
    const left = useTimeline ? placeHand('left', t) : handHome.left;
    const right = useTimeline ? placeHand('right', t) : handHome.right;
    function aim(hand) {
      return Math.atan2(hand.aim.y - hand.y, hand.aim.x - hand.x) * 180 / Math.PI;
    }
    if (handEl.left) handEl.left.setAttribute('transform', 'translate(' + left.x.toFixed(1) + ' ' + left.y.toFixed(1) + ') rotate(' + aim(left).toFixed(1) + ')');
    if (handEl.right) handEl.right.setAttribute('transform', 'translate(' + right.x.toFixed(1) + ' ' + right.y.toFixed(1) + ') rotate(' + aim(right).toFixed(1) + ')');

    let kickSoon = 0;
    let hatPress = 1 - hatOpen;
    if (useTimeline) {
      for (let i = 0; i < activeHits.length; i++) {
        const h = activeHits[i];
        const dtHit = h.time - t;
        if (h.piece === 'kick' && dtHit < 0.09 && dtHit > -0.08) kickSoon = Math.max(kickSoon, 1 - Math.abs(dtHit) / 0.09);
        if ((h.piece === 'hatClosed' || h.piece === 'hatOpen') && dtHit < 0.12 && dtHit > -0.05) {
          hatPress = h.piece === 'hatOpen' ? 0.15 : 1;
        }
      }
    }
    if (footRight) footRight.setAttribute('transform', 'translate(485 545) rotate(' + (kickSoon * 16).toFixed(1) + ') translate(-485 -545)');
    if (footLeft) {
      const lift = (1 - hatPress) * -10;
      footLeft.setAttribute('transform', 'translate(0 ' + lift.toFixed(1) + ')');
    }

    if (mediaMode && fallbackMedia.duration) {
      seekSlider.max = String(fallbackMedia.duration);
      if (!fallbackMedia.paused) seekSlider.value = String(fallbackMedia.currentTime);
      trackTime.textContent = formatTime(fallbackMedia.currentTime) + ' / ' + formatTime(fallbackMedia.duration);
    } else if (currentBuffer) {
      const dur = currentBuffer.duration || 1;
      const shown = mediaMode ? 0 : (isPlaying ? visualSongTime() : pauseOffset);
      if (isPlaying) seekSlider.value = String(Math.max(0, shown - userSyncSec));
      trackTime.textContent = formatTime(Math.max(0, shown - userSyncSec)) + ' / ' + formatTime(dur);
    }
  }

  function analyzeMic(nowMs) {
    if (mode !== 'mic' && !(mediaMode && isPlaying)) return;
    if (!analyser) return;
    analyser.getByteFrequencyData(freqBytes);
    for (let i = 0; i < freqBytes.length; i++) {
      const v = freqBytes[i] / 255;
      mag[i] = v * Math.sqrt(v);
    }
    function band(aHz, bHz) {
      const nyq = audioCtx.sampleRate / 2;
      const a = Math.max(1, Math.round(aHz / nyq * mag.length));
      const b = Math.min(mag.length - 1, Math.round(bHz / nyq * mag.length));
      let flux = 0, energy = 0;
      for (let i = a; i <= b; i++) {
        energy += mag[i];
        const d = mag[i] - prevMag[i];
        if (d > 0) flux += d;
      }
      const n = Math.max(1, b - a + 1);
      return { flux: flux / n, energy: energy / n };
    }
    const kick = band(40, 140);
    const snare = band(180, 4000);
    const hat = band(6000, 12000);
    const ride = band(3000, 8000);
    function hot(key, value, floor) {
      const arr = liveFlux[key];
      const sorted = arr.slice().sort((a, b) => a - b);
      const med = sorted.length ? sorted[sorted.length >> 1] : 0;
      return value > Math.max(floor / sensitivity, med * 1.8 + 0.01);
    }
    const labels = window.DrumAnalyzer.classifyLive({
      low: kick.energy, wire: snare.energy, hatE: hat.energy, rideE: ride.energy,
      midE: snare.energy * 0.4, dHat: ride.energy > hat.energy ? 0.4 : 0.12,
      strength: 1, peakBands: {
        kick: hot('kick', kick.flux, 0.02),
        snare: hot('snare', snare.flux, 0.015),
        hat: hot('hat', hat.flux, 0.01),
        ride: hot('ride', ride.flux, 0.012)
      }
    });
    labels.forEach((lab) => {
      if (nowMs - (lastHitAt[lab.piece] || 0) < 70) return;
      lastHitAt[lab.piece] = nowMs;
      triggerDrum(lab.piece, 0.75);
    });
    liveFlux.kick.push(kick.flux); liveFlux.snare.push(snare.flux); liveFlux.hat.push(hat.flux); liveFlux.ride.push(ride.flux);
    ['kick', 'snare', 'hat', 'ride'].forEach((k) => { if (liveFlux[k].length > HIST) liveFlux[k].shift(); });
    histCount += 1;
    prevMag.set(mag);
  }

  function frame(now) {
    const dt = Math.min(40, Math.max(8, now - lastFrame));
    lastFrame = now;
    try {
      if (mode === 'mic' || mediaMode) analyzeMic(now);
      render(dt);
    } catch (err) {
      console.error(err);
    }
    if (!screenStage.hidden) rafId = requestAnimationFrame(frame);
    else rafId = null;
  }
  function startLoop() {
    if (!rafId) { lastFrame = performance.now(); rafId = requestAnimationFrame(frame); }
  }
})();
