/* Service Worker — network-first ל-HTML ול-version.json, cache-first לשאר.
   הנתונים לא עוברים כאן: הם ב-IndexedDB וב-Drive. */
const CACHE_VERSION = 'fund-v1.1.4'
const ASSETS = [
  './', './index.html', './style.css',
  './model.js', './engine.js', './rules.js', './ui.js', './drive.js', './store.js',
  './reports.js', './screens-core.js', './screens-review.js', './actuary.js', './app.js',
  './mc.worker.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
]

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return          // Apps Script לעולם לא מה-cache
  const netFirst = e.request.mode === 'navigate' || url.pathname.endsWith('version.json')
  if (netFirst) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))))
    return
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)))
})
