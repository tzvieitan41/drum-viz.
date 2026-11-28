// Offline cache for the drum app. Network first (so updates arrive), cache as fallback.
// The 35 MB separation model is cached by separator-worker.js itself (cache "drum-models-v1"), not here.
const CACHE = 'drummer-v9';
const ASSETS = ['./', './index.html', './app.js', './kit.jpg', './separator-worker.js',
  './vendor/ort.wasm.min.js', './manifest.webmanifest',
  './sounds/kick.wav', './sounds/snare.wav', './sounds/hh.wav', './sounds/t1.wav', './sounds/t2.wav', './sounds/ft.wav',
  './sounds/ride.wav', './sounds/c1.wav', './sounds/c2.wav', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE && k !== 'drum-models-v1').map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.includes('/models/')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
