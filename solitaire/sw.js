// BUMP THIS on every change to any file listed in ASSETS, in the same commit.
// A cache-first worker will otherwise keep serving the old build forever.
const CACHE_VERSION = 'solitaire-v10';

const ASSETS = [
  './',
  './index.html',
  './app.css',
  './game.js',
  './storage.js',
  './ui.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// GitHub Pages serves these files with `cache-control: max-age=600`, so a
// plain cache.addAll can be answered from the browser's HTTP cache -- which
// means a NEW worker happily precaches the OLD files under a new cache name.
// The version looks bumped and nothing actually changed. `cache: 'reload'`
// forces each asset to come from the network.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('solitaire-') && k !== CACHE_VERSION)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
});
