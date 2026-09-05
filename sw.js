/* Service Worker — network-first ל-HTML ול-version.json, cache-first לשאר.
   הנתונים לא עוברים כאן: הם ב-IndexedDB וב-Drive. */
const CACHE_VERSION = 'fund-v1.1.6'
const ASSETS = [
  './', './index.html', './style.css',
  './model.js', './engine.js', './rules.js', './ui.js', './drive.js', './store.js',
  './reports.js', './screens-core.js', './screens-review.js', './actuary.js', './app.js',
  './mc.worker.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
]

/* קאשינג פר-קובץ ולא addAll: ב-addAll מספיק שקובץ אחד יחזיר 404 כדי
   שההתקנה כולה תיכשל, ואז ה-SW הישן ממשיך להגיש **לנצח** ובשקט. זה בדיוק
   המצב שבו המשתמש רואה גרסה ישנה בלי שום סימן לכך שמשהו נכשל. */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_VERSION)
    await Promise.all(ASSETS.map(u => c.add(u).catch(err => console.warn('SW: לא נשמר', u, err))))
    await self.skipWaiting()
  })())
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
