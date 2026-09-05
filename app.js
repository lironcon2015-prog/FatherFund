/* ===========================================================================
   app.js — עיצוב מספרים, ניווט, אתחול.
   =========================================================================== */

const APP_VERSION = '1.1.6'

/* ===== פורמט ===== */
function ils(n, digits) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat('he-IL', {
    style: 'currency', currency: 'ILS',
    minimumFractionDigits: digits == null ? 0 : digits,
    maximumFractionDigits: digits == null ? 0 : digits,
  }).format(v)
}
function pct(n, digits) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return (n * 100).toFixed(digits == null ? 1 : digits) + '%'
}
function ratio(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toFixed(2)
}
function dmy(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
function dtLabel(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

/* ===== ניווט ===== */
const SCREENS = ['status', 'portfolio', 'withdraw', 'payments', 'review', 'actuary', 'decisions', 'assumptions', 'journal', 'storage']
let _currentScreen = null

const RENDERERS = {
  status: () => renderStatus(),
  portfolio: () => renderPortfolio(),
  withdraw: () => renderWithdraw(),
  payments: () => renderPayments(),
  review: () => renderReview(),
  actuary: () => renderActuary(),
  decisions: () => renderDecisions(),
  assumptions: () => renderAssumptions(),
  journal: () => renderJournal(),
  storage: () => renderStorage(),
}

function navigate(screen, fromHash) {
  if (!SCREENS.includes(screen)) screen = 'status'
  if (fromHash && screen === _currentScreen) return
  _currentScreen = screen
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.querySelectorAll('.nav-link,.bnav-item').forEach(l => l.classList.remove('active'))
  const el = document.getElementById('screen-' + screen)
  if (el) el.classList.add('active')
  document.querySelectorAll(`[data-screen="${screen}"]`).forEach(l => l.classList.add('active'))
  closeMenu()
  if (RENDERERS[screen]) RENDERERS[screen]()
  if (location.hash.slice(1) !== screen) location.hash = screen
  window.scrollTo(0, 0)
}
function renderCurrent() { if (RENDERERS[_currentScreen]) RENDERERS[_currentScreen]() }

function toggleMenu() {
  document.getElementById('sidebar').classList.toggle('open')
  document.getElementById('sidebarOverlay').classList.toggle('open')
}
function closeMenu() {
  document.getElementById('sidebar').classList.remove('open')
  document.getElementById('sidebarOverlay').classList.remove('open')
}

/* ===== רכיבים משותפים ===== */

/* R8 — כל מסך שמציג פלט מחושב מחויב לשאת את הסימון הזה. */
function staleBannerHTML() {
  const hits = checkStale(FUND, STALE_DAYS)
  if (!hits.length) return ''
  return `<div class="banner banner-warn">${uiIcon('alert', 18)}<div>
    <strong>טעון עדכון</strong>
    <div>${escHtml(hits[0].message)}</div>
  </div><button class="btn-ghost" onclick="navigate('portfolio')">עדכן תיק</button></div>`
}

function bandChipHTML(band) {
  if (!band) return '<span class="chip chip-muted">מעבר לגיל האופק</span>'
  return `<span class="chip chip-${band}">${BAND_LABEL[band]}</span>`
}

function emptyHTML(text, actionLabel, actionFn) {
  return `<div class="empty-state">
    <span class="empty-state-icon">${uiIcon('file', 30)}</span>
    <p class="empty-state-text">${escHtml(text)}</p>
    ${actionLabel ? `<div class="empty-state-actions">
      <button class="btn-primary" onclick="${actionFn}">${escHtml(actionLabel)}</button></div>` : ''}
  </div>`
}

/* ===== אתחול ===== */
async function boot() {
  applyFundMark()
  document.getElementById('appVersion').textContent = 'גרסה ' + APP_VERSION
  await loadFund()
  const s = location.hash.slice(1)
  navigate(SCREENS.includes(s) ? s : 'status')
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1)
    navigate(SCREENS.includes(h) ? h : 'status', true)
  })
  scheduleCheck()
  initUpdates()
}

/* §3 — התראה קבועה שהמערכת מייצרת מעצמה, לא בתגובה לפעולה. */
function scheduleCheck() {
  if (!FUND.assets.length) return
  const t = portfolioTotals(FUND.assets, FUND.assumptions.taxRate)
  const months = rungMonthsLeft(FUND.assets, FUND.config)
  if (months < 4) {
    toast(`ברובד הנזילות נותרו ${months.toFixed(1)} חודשי משיכה.`, { type: 'error', duration: 9000,
      action: { label: 'למסך המצב', onClick: () => navigate('status') } })
  }
  const w = reviewWindow(FUND)
  if (w.overdue) {
    toast(`הבקרה התלת-שנתית עברה את מועדה (${dmy(w.next)}).`, { type: 'warn', duration: 9000,
      action: { label: 'פתח בקרה', onClick: () => navigate('review') } })
  }
}

/* ===========================================================================
   עדכוני גרסה (PWA)

   בלי המנגנון הזה משתמש שמריץ את האפליקציה כאפליקציה מותקנת נשאר על גרסה
   ישנה בלי שום סימן: אין לו רענון, ה-Service Worker מגיש מה שיש לו, והמסך
   נראה תקין לחלוטין. באפליקציה שאמורה לחיות 26 שנה זה הכשל השקט הגרוע ביותר.
   =========================================================================== */

let _swReg = null

function initUpdates() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('./sw.js?v=' + APP_VERSION, { updateViaCache: 'none' })
    .then(reg => {
      _swReg = reg
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateToast()
      watchWorker(reg.installing)
      reg.addEventListener('updatefound', () => watchWorker(reg.installing))
      reg.update().catch(() => {})
    })
    .catch(() => {})

  /* אפליקציה מותקנת נשארת בזיכרון ולא נטענת מחדש בחזרה אליה. הבדיקה
     בחזרה למסך היא הרגע היחיד שבו יש הזדמנות לזהות גרסה חדשה. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (_swReg) _swReg.update().catch(() => {})
      checkForUpdate({ silent: true })
    }
  })
}

function watchWorker(w) {
  if (!w) return
  w.addEventListener('statechange', () => {
    if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateToast()
  })
}

let _updateToastShown = false
function showUpdateToast() {
  if (_updateToastShown) return
  _updateToastShown = true
  toast('גרסה חדשה זמינה.', { type: 'info', duration: 0,
    action: { label: 'עדכן עכשיו', onClick: () => hardResetAndReload() } })
}

/**
 * משווה את הגרסה שרצה לזו שבשרת.
 * `silent` — לא מציג כלום כששום דבר לא השתנה (הבדיקה האוטומטית).
 */
async function checkForUpdate(opts) {
  const o = opts || {}
  const el = document.getElementById('updateMsg')
  if (el && !o.silent) { el.textContent = 'בודק…'; el.className = 'muted' }
  try {
    const r = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const info = await r.json()
    if (info.version && info.version !== APP_VERSION) {
      if (el) { el.textContent = `בשרת יש ${info.version}, כאן רצה ${APP_VERSION}.`; el.className = 'neg' }
      if (o.silent) showUpdateToast()
      else if (await confirmDialog(`נמצאה גרסה ${info.version}\nכאן רצה ${APP_VERSION}. לעדכן ולרענן עכשיו?`, { confirmText: 'עדכן' })) {
        await hardResetAndReload()
      }
      return { current: APP_VERSION, remote: info.version, stale: true }
    }
    if (el && !o.silent) { el.textContent = `מעודכן — גרסה ${APP_VERSION}.`; el.className = 'pos' }
    return { current: APP_VERSION, remote: info.version, stale: false }
  } catch (e) {
    if (el && !o.silent) { el.textContent = 'לא ניתן לבדוק: ' + e.message; el.className = 'neg' }
    return { error: e.message }
  }
}

/**
 * המסלול היחיד שעובד באמת ב-iOS. הנתיב הרך (skipWaiting + postMessage)
 * נתקע שם: מוחקים כל cache, מבטלים רישום של כל Service Worker, וטוענים
 * מחדש עם פרמטר שובר-cache כדי שגם ה-HTTP cache של הדפדפן לא יגיש ישן.
 *
 * הנתונים אינם ב-cache — הם ב-IndexedDB וב-Drive — ולכן איפוס כאן אינו
 * מוחק דבר שלא ניתן לשחזור.
 */
async function hardResetAndReload() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister()))
    }
  } catch (e) {
    console.warn('איפוס cache נכשל', e)
  }
  const u = new URL(location.href)
  u.searchParams.set('r', Date.now().toString(36))
  location.replace(u.toString())
}

document.addEventListener('DOMContentLoaded', boot)
