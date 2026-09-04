/* ===========================================================================
   model.js — סכמות, ברירות מחדל, ומיגרציות של מצב הקרן.
   ללא DOM וללא Drive. נטען ראשון.
   =========================================================================== */

const FUND_STATE_VERSION = 1

/* ברירות המחדל של §1.5. כל ערך כאן ניתן לעריכה במסך ההנחות, וכל שינוי נרשם
   בהיסטוריה עם נימוק. R6: אין מספר קשיח בקוד — כל נגזרת נקראת מכאן. */
const DEFAULT_ASSUMPTIONS = {
  inflation:        0.025,
  realGrossEquity:  { pess: 0.030, base: 0.055, opt: 0.075 },
  fees:             0.004,
  realGrossCash:    0.016,
  sdEquity:         0.15,
  taxRate:          0.25,
  discountRate:     0.0345,
  horizonAge:       95,
  fatherBirthYear:  1957,
}

/* §1.6 */
const DEFAULT_CONFIG = {
  pensionFromFund:          1300,   // ריאלי
  pensionFromBrothers:      1000,   // נומינלי
  bulletAmount:             10000,
  bulletMonth:              6,
  rungTarget:               25600,
  israelTargetShareOfEquity: 0.22,
  reviewIntervalYears:      3,
}

/* R8 — מעבר לסף הזה כל פלט מסומן "טעון עדכון". */
const STALE_DAYS = 120

/* §2.4 — גבולות הרצועות. נגזרות ולא קשיחות: הן משווֹת יחס, והיחס עצמו זז
   כשההנחות זזות. */
const BAND_GREEN  = 1.00
const BAND_YELLOW = 0.85

const ASSET_CLASSES = ['equity', 'cash']
const ASSET_REGIONS = ['global', 'israel', 'n/a']

function fundEmptyState() {
  return {
    version:            FUND_STATE_VERSION,
    assets:             [],
    snapshots:          [],
    transactions:       [],
    payments:           [],
    reviews:            [],
    decisions:          [],
    flags:              [],
    refills:            [],   // {year, filled, equityReturnYTD, amount, note, at}
    journal:            [],   // {at, kind, text, meta}
    zeroPoints:         [],   // §10.3 — קיבוע נקודת אפס בלי למחוק היסטוריה
    assumptions:        structuredCloneSafe(DEFAULT_ASSUMPTIONS),
    assumptionsHistory: [],   // {at, field, from, to, rationale}
    config:             structuredCloneSafe(DEFAULT_CONFIG),
    configHistory:      [],
    mortality:          null, // §2.6 — לוח למ"ס. null = לא הוזן.
    meta:               { createdAt: nowISO(), lastPortfolioUpdate: null },
  }
}

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)) }
function nowISO() { return new Date().toISOString() }
function todayISO() { return new Date().toISOString().slice(0, 10) }
function fundId(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/* ===== נכס ===== */
function makeAsset(o) {
  return {
    id:          o.id || fundId('as'),
    name:        String(o.name || '').trim(),
    class:       ASSET_CLASSES.includes(o.class) ? o.class : 'equity',
    region:      ASSET_REGIONS.includes(o.region) ? o.region : (o.class === 'cash' ? 'n/a' : 'global'),
    marketValue: num(o.marketValue),
    costBasis:   num(o.costBasis),
    isLegacy:    !!o.isLegacy,
    lastUpdated: o.lastUpdated || todayISO(),
  }
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/* עיגול לאגורות. יתרה שנסכמת ממאות שורות נוחתת על 4999.900000000001,
   ושדה number מדפיס את כל הספרות. */
function round2(n) { return Math.round((num(n) + Number.EPSILON) * 100) / 100 }

/* ===== ולידציה של מצב שנטען מבחוץ =====
   נקרא לפני כל החלפת state בנתונים מהדרייב. מצב פגום שנכנס פנימה הורס את
   היסטוריית בסיס העלות, וזו ההיסטוריה שלא ניתנת לשחזור. */
function validateFundState(s) {
  if (!s || typeof s !== 'object') return false
  if (!Array.isArray(s.assets)) return false
  if (!Array.isArray(s.snapshots)) return false
  if (!s.assumptions || typeof s.assumptions !== 'object') return false
  if (!s.config || typeof s.config !== 'object') return false
  if (typeof s.assumptions.taxRate !== 'number') return false
  return true
}

/* מילוי שדות שנוספו אחרי שהמצב נשמר. משאיר את מה שקיים. */
function migrateFundState(s) {
  const base = fundEmptyState()
  const out = Object.assign({}, base, s)
  out.assumptions = Object.assign({}, base.assumptions, s.assumptions || {})
  out.assumptions.realGrossEquity = Object.assign(
    {}, base.assumptions.realGrossEquity, (s.assumptions || {}).realGrossEquity || {}
  )
  out.config = Object.assign({}, base.config, s.config || {})
  out.meta = Object.assign({}, base.meta, s.meta || {})
  for (const k of ['assets','snapshots','transactions','payments','reviews','decisions','flags','refills','journal','zeroPoints','assumptionsHistory','configHistory']) {
    if (!Array.isArray(out[k])) out[k] = []
  }
  out.assets = out.assets.map(makeAsset)
  out.version = FUND_STATE_VERSION
  return out
}

if (typeof module !== 'undefined') {
  module.exports = {
    FUND_STATE_VERSION, DEFAULT_ASSUMPTIONS, DEFAULT_CONFIG, STALE_DAYS,
    BAND_GREEN, BAND_YELLOW, ASSET_CLASSES, ASSET_REGIONS,
    fundEmptyState, makeAsset, num, round2, validateFundState, migrateFundState,
    fundId, todayISO, nowISO,
  }
}
