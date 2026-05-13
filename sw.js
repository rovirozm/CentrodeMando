/* ================================================================
   SERVICE WORKER — Cache simple para que la app funcione offline.
   ================================================================ */

const CACHE = 'centrodemando-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './styles/themes.css',
  './js/storage.js',
  './js/audio.js',
  './js/notifications.js',
  './js/recurring.js',
  './js/tasks.js',
  './js/timer.js',
  './js/voice.js',
  './js/stats.js',
  './js/ui.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Estrategia: red primero, cache de respaldo
  event.respondWith(
    fetch(req)
      .then(res => {
        // Solo cachear respuestas locales correctas
        if (res && res.status === 200 && (req.url.startsWith(self.location.origin))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
  );
});
