/**
 * sw.js
 * -----------------------------------------------------------------------
 * Basic offline support for the Group Project Contribution Dashboard.
 *
 *   - install:  precache the app shell (HTML, CSS, JS, manifest, icons)
 *   - activate: delete caches from older versions
 *   - fetch:
 *       same-origin GET  -> network first, fall back to cache when offline
 *                           (so edits show up immediately during dev, and
 *                           the app still loads with no connection)
 *       Google Fonts     -> stale-while-revalidate in its own cache
 *       navigations      -> if offline and not cached, serve the cached
 *                           app shell
 *
 * WebSocket traffic is not touched by service workers; the chat's own
 * reconnect/queue logic in js/chat.js handles offline.
 *
 * When you ship changes to any file below, bump CACHE_VERSION.
 * ----------------------------------------------------------------------- */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `gp-shell-${CACHE_VERSION}`;
const FONT_CACHE = `gp-fonts-${CACHE_VERSION}`;

// './' (not 'index.html') so it works with servers that redirect
// /index.html to / (e.g. `npx serve`).
const APP_SHELL = [
  './',
  'manifest.json',
  'css/variables.css',
  'css/layout.css',
  'js/charts.js',
  'js/app.js',
  'js/ui.js',
  'js/chat.js',
  'js/scheduler.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, FONT_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith('gp-') && !keep.includes(key)).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  }
});

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      // Don't cache errors or redirects (a cached redirect can't be used
      // to answer a navigation).
      if (response.ok && !response.redirected) {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() =>
      caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('./');
        return Response.error();
      })
    );
}

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || refresh;
    })
  );
}
