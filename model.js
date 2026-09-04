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

/* ===========================================================================
   נקודת פתיחה (seed) — §10.3 בפועל.

   קובץ הרבה יותר פשוט מ-fund-state.json: אין בו מזהים, אין snapshots, וכל
   שדה למעט הנכסים הוא רשות. נועד להיות מופק בידי אדם או מודל מתוך מה שכבר
   ידוע, ולהיטען פעם אחת לפני שמתחילים לעבוד.

   הוא **לא** מוולד ברפיון. הכשל המסוכן כאן אינו קובץ שנדחה — הוא קובץ
   שמתקבל ושגוי: שיעור מס שנכתב 25 במקום 0.25 עובר כל בדיקת טיפוס, מייצר
   יחס כיסוי שנראה סביר, ומתגלה בעוד שנתיים. לכן כל שדה שיעור נבדק גם
   בטווח, וכל מפתח שאינו מוכר מדווח ולא נבלע.
   =========================================================================== */

const SEED_SCHEMA = 'fund-seed/1'

/* שדות שהם שבר ולא אחוז. 0.055, לא 5.5. */
const SEED_RATE_FIELDS = new Set([
  'inflation', 'fees', 'realGrossCash', 'sdEquity', 'taxRate', 'discountRate',
  'pess', 'base', 'opt', 'israelTargetShareOfEquity',
])
const SEED_ASSUMPTION_KEYS = new Set(Object.keys(DEFAULT_ASSUMPTIONS))
const SEED_CONFIG_KEYS = new Set(Object.keys(DEFAULT_CONFIG))
const SEED_PAYMENT_SOURCES = new Set(['fund', 'brothers_direct'])
const SEED_FLAG_DOMAINS = new Set(['tax', 'social_security', 'legal', 'model'])

function _isISODate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) }
function _isNum(v) { return typeof v === 'number' && Number.isFinite(v) }

/**
 * קורא קובץ נקודת פתיחה ומחזיר { ok, errors, warnings, seed, summary }.
 * טהורה. לא נוגעת ב-FUND ולא באחסון.
 */
function parseFundSeed(raw) {
  const errors = [], warnings = []
  const seed = { assets: [], assumptions: {}, config: {}, payments: [], decisions: [], flags: [] }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['הקובץ אינו אובייקט JSON.'], warnings, seed, summary: null }
  }
  if (raw.schema && raw.schema !== SEED_SCHEMA) {
    warnings.push(`הקובץ מצהיר על סכמה "${raw.schema}" ולא "${SEED_SCHEMA}". נקרא בכל זאת.`)
  }

  /* ===== נכסים — החלק היחיד שהוא חובה ===== */
  if (!Array.isArray(raw.assets) || !raw.assets.length) {
    errors.push('חסרה רשימת נכסים. בלעדיה אין נקודת פתיחה.')
  } else {
    raw.assets.forEach((a, i) => {
      const at = `נכס ${i + 1}${a && a.name ? ` ("${a.name}")` : ''}`
      if (!a || typeof a !== 'object') { errors.push(`${at}: אינו אובייקט.`); return }
      if (!a.name || !String(a.name).trim()) errors.push(`${at}: חסר שם.`)
      if (!ASSET_CLASSES.includes(a.class)) errors.push(`${at}: class חייב להיות equity או cash. התקבל: ${JSON.stringify(a.class)}`)
      if (!_isNum(a.marketValue) || a.marketValue < 0) errors.push(`${at}: marketValue חייב להיות מספר אי-שלילי.`)
      if (!_isNum(a.costBasis) || a.costBasis < 0) errors.push(`${at}: costBasis חייב להיות מספר אי-שלילי.`)
      const region = a.region == null ? (a.class === 'cash' ? 'n/a' : 'global') : a.region
      if (!ASSET_REGIONS.includes(region)) errors.push(`${at}: region חייב להיות global, israel או n/a.`)
      if (a.class === 'cash' && _isNum(a.marketValue) && _isNum(a.costBasis) && a.costBasis !== a.marketValue) {
        warnings.push(`${at}: רובד נזילות שבו בסיס העלות שונה משווי השוק. ייתכן שזה נכון, אבל בדרך כלל הם זהים.`)
      }
      if (_isNum(a.marketValue) && _isNum(a.costBasis) && a.costBasis > a.marketValue) {
        warnings.push(`${at}: הנכס בהפסד (בסיס גבוה משווי). נקלט כפי שהוא.`)
      }
      if (a.lastUpdated != null && !_isISODate(a.lastUpdated)) errors.push(`${at}: lastUpdated חייב להיות YYYY-MM-DD.`)
      seed.assets.push(makeAsset(Object.assign({}, a, { region })))
    })
  }

  /* ===== הנחות ותצורה — כולן רשות, ומיזוג חלקי מעל ברירות המחדל ===== */
  const readGroup = (src, allowed, target, label) => {
    if (src == null) return
    if (typeof src !== 'object' || Array.isArray(src)) { errors.push(`${label}: חייב להיות אובייקט.`); return }
    for (const [k, v] of Object.entries(src)) {
      if (!allowed.has(k)) { warnings.push(`${label}: המפתח "${k}" אינו מוכר ונשמט.`); continue }
      if (k === 'realGrossEquity') {
        if (typeof v !== 'object' || v == null) { errors.push(`${label}.realGrossEquity: חייב להיות אובייקט עם pess/base/opt.`); continue }
        const out = {}
        for (const [sk, sv] of Object.entries(v)) {
          if (!['pess', 'base', 'opt'].includes(sk)) { warnings.push(`${label}.realGrossEquity: המפתח "${sk}" אינו מוכר ונשמט.`); continue }
          if (!_checkRate(`${label}.realGrossEquity.${sk}`, sk, sv, errors)) continue
          out[sk] = sv
        }
        target.realGrossEquity = out
        continue
      }
      if (!_isNum(v)) { errors.push(`${label}.${k}: חייב להיות מספר. התקבל: ${JSON.stringify(v)}`); continue }
      if (!_checkRate(`${label}.${k}`, k, v, errors)) continue
      target[k] = v
    }
  }
  readGroup(raw.assumptions, SEED_ASSUMPTION_KEYS, seed.assumptions, 'assumptions')
  readGroup(raw.config, SEED_CONFIG_KEYS, seed.config, 'config')

  if (seed.config.bulletMonth != null && (seed.config.bulletMonth < 1 || seed.config.bulletMonth > 12)) {
    errors.push('config.bulletMonth חייב להיות בין 1 ל-12.')
  }
  if (seed.assumptions.fatherBirthYear != null &&
      (seed.assumptions.fatherBirthYear < 1900 || seed.assumptions.fatherBirthYear > 2100)) {
    errors.push('assumptions.fatherBirthYear נראה שגוי.')
  }

  /* ===== רשימות ===== */
  if (raw.payments != null) {
    if (!Array.isArray(raw.payments)) errors.push('payments: חייב להיות מערך.')
    else raw.payments.forEach((p, i) => {
      const at = `תשלום ${i + 1}`
      if (!_isISODate(p && p.date)) { errors.push(`${at}: date חייב להיות YYYY-MM-DD.`); return }
      if (!_isNum(p.amount) || p.amount <= 0) { errors.push(`${at}: amount חייב להיות מספר חיובי.`); return }
      if (!SEED_PAYMENT_SOURCES.has(p.source)) { errors.push(`${at}: source חייב להיות fund או brothers_direct.`); return }
      seed.payments.push({ id: fundId('pay'), date: p.date, amount: round2(p.amount), source: p.source, note: String(p.note || '').trim() })
    })
  }

  if (raw.decisions != null) {
    if (!Array.isArray(raw.decisions)) errors.push('decisions: חייב להיות מערך.')
    else raw.decisions.forEach((d, i) => {
      if (!d || !String(d.title || '').trim()) { errors.push(`החלטה ${i + 1}: חסרה כותרת.`); return }
      const status = d.status === 'closed' ? 'closed' : 'open'
      if (status === 'closed' && !String(d.rationale || '').trim()) {
        errors.push(`החלטה ${i + 1}: החלטה סגורה חייבת נימוק. זו כל הסיבה שהיא נשמרת.`)
        return
      }
      seed.decisions.push({
        id: fundId('dec'), title: String(d.title).trim(), status,
        closedAt: status === 'closed' ? (_isISODate(d.closedAt) ? d.closedAt : todayISO()) : null,
        rationale: String(d.rationale || '').trim(), openedAt: nowISO(),
      })
    })
  }

  if (raw.flags != null) {
    if (!Array.isArray(raw.flags)) errors.push('flags: חייב להיות מערך.')
    else raw.flags.forEach((f, i) => {
      if (!f || !String(f.text || '').trim()) { errors.push(`דגל ${i + 1}: חסר טקסט.`); return }
      if (!SEED_FLAG_DOMAINS.has(f.domain)) { errors.push(`דגל ${i + 1}: domain חייב להיות tax, social_security, legal או model.`); return }
      seed.flags.push({ id: fundId('flg'), text: String(f.text).trim(), domain: f.domain, status: f.status === 'closed' ? 'closed' : 'open', at: nowISO() })
    })
  }

  /* ===== נקודת אפס ולוח תמותה ===== */
  if (raw.zeroPoint != null) {
    const z = raw.zeroPoint
    if (typeof z !== 'object' || !_isISODate(z.date)) errors.push('zeroPoint.date חייב להיות YYYY-MM-DD.')
    else if (!String(z.rationale || '').trim()) errors.push('zeroPoint: נדרש נימוק. נקודת אפס בלי נימוק אינה ניתנת לקריאה בעוד שלוש שנים.')
    else seed.zeroPoint = { date: z.date, rationale: String(z.rationale).trim() }
  }

  if (raw.mortality != null) {
    const m = raw.mortality
    if (typeof m !== 'object' || !Array.isArray(m.qx) || !m.qx.length) {
      errors.push('mortality: נדרש מערך qx.')
    } else if (!_isNum(m.startAge)) {
      errors.push('mortality.startAge חייב להיות מספר.')
    } else if (!m.qx.every(q => _isNum(q) && q >= 0 && q <= 1)) {
      errors.push('mortality.qx: כל ערך חייב להיות בין 0 ל-1. אם הוזן כאחוזים — חלק ב-100.')
    } else if (!String(m.source || '').trim()) {
      errors.push('mortality.source: חובה לציין מקור. לוח בלי מקור אינו לוח למ״ס.')
    } else {
      seed.mortality = { source: String(m.source).trim(), startAge: m.startAge, qx: m.qx.slice(), loadedAt: nowISO() }
    }
  }

  if (raw.note != null && typeof raw.note !== 'string') warnings.push('note: מתעלמים — אינו מחרוזת.')

  const KNOWN_TOP = new Set(['schema', 'generatedAt', 'note', 'assets', 'assumptions', 'config',
    'payments', 'decisions', 'flags', 'zeroPoint', 'mortality'])
  for (const k of Object.keys(raw)) if (!KNOWN_TOP.has(k)) warnings.push(`המפתח "${k}" ברמה העליונה אינו מוכר ונשמט.`)

  const mv = seed.assets.reduce((s, a) => s + a.marketValue, 0)
  const cb = seed.assets.reduce((s, a) => s + a.costBasis, 0)
  return {
    ok: errors.length === 0,
    errors, warnings, seed,
    summary: {
      assets: seed.assets.length, marketValue: mv, costBasis: cb,
      payments: seed.payments.length, decisions: seed.decisions.length, flags: seed.flags.length,
      assumptions: Object.keys(seed.assumptions).length, config: Object.keys(seed.config).length,
      zeroPoint: !!seed.zeroPoint, mortality: !!seed.mortality,
      note: typeof raw.note === 'string' ? raw.note : '',
      generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : '',
    },
  }
}

/* 0.055 ולא 5.5. הטעות הזו עוברת כל בדיקת טיפוס ומתגלה רק בעוד שנתיים. */
function _checkRate(path, key, v, errors) {
  if (!_isNum(v)) { errors.push(`${path}: חייב להיות מספר.`); return false }
  if (!SEED_RATE_FIELDS.has(key)) return true
  if (v > 1) { errors.push(`${path}: ${v} — שדה שיעור נכתב כשבר ולא באחוזים. התכוונת ל-${v / 100}?`); return false }
  if (v < -1) { errors.push(`${path}: ${v} מחוץ לטווח סביר.`); return false }
  return true
}

/**
 * בונה מצב מלא מנקודת פתיחה. יוצר גם את ה-snapshot הראשון: היסטוריית בסיס
 * העלות חייבת להתחיל מנקודה מתועדת, ולא מהעדכון הידני הראשון שיבוא אחריה.
 */
function applyFundSeed(parsed, opts) {
  const o = opts || {}
  const date = o.date || todayISO()
  const st = fundEmptyState()
  const seed = parsed.seed

  st.assets = seed.assets.map(makeAsset)
  st.assumptions = Object.assign({}, st.assumptions, seed.assumptions)
  if (seed.assumptions.realGrossEquity) {
    st.assumptions.realGrossEquity = Object.assign({}, DEFAULT_ASSUMPTIONS.realGrossEquity, seed.assumptions.realGrossEquity)
  }
  st.config = Object.assign({}, st.config, seed.config)
  st.payments = seed.payments.slice()
  st.decisions = seed.decisions.slice()
  st.flags = seed.flags.slice()
  if (seed.mortality) st.mortality = seed.mortality

  st.snapshots = [{
    date, source: 'manual',
    note: 'נקודת פתיחה — ייבוא מקובץ' + (parsed.summary.note ? ': ' + parsed.summary.note : ''),
    assets: st.assets.map(a => ({ assetId: a.id, marketValue: a.marketValue, costBasis: a.costBasis })),
  }]
  st.meta.lastPortfolioUpdate = o.now || nowISO()

  const mv = st.assets.reduce((s, a) => s + a.marketValue, 0)
  const cb = st.assets.reduce((s, a) => s + a.costBasis, 0)
  st.zeroPoints = [{
    date: seed.zeroPoint ? seed.zeroPoint.date : date,
    marketValue: round2(mv), costBasis: round2(cb),
    rationale: seed.zeroPoint ? seed.zeroPoint.rationale : 'נקודת פתיחה מקובץ ייבוא.',
  }]
  st.journal = [{ at: o.now || nowISO(), kind: 'zero', text: `נקודת פתיחה יובאה — ${st.assets.length} נכסים`, meta: null }]
  return st
}

if (typeof module !== 'undefined') {
  module.exports = {
    SEED_SCHEMA, parseFundSeed, applyFundSeed,
    FUND_STATE_VERSION, DEFAULT_ASSUMPTIONS, DEFAULT_CONFIG, STALE_DAYS,
    BAND_GREEN, BAND_YELLOW, ASSET_CLASSES, ASSET_REGIONS,
    fundEmptyState, makeAsset, num, round2, validateFundState, migrateFundState,
    fundId, todayISO, nowISO,
  }
}
