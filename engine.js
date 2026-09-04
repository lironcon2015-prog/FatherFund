/* ===========================================================================
   engine.js — כל החישובים של §2. פונקציות טהורות: אין DOM, אין Drive,
   אין קריאה ל-state גלובלי. מקבלות מה שהן צריכות ומחזירות אובייקט.
   זה הקובץ היחיד שהטסטים בודקים ישירות.
   =========================================================================== */

/* ===== 2.1 שיעור רווח ומכירה בברוטו =====
   החישוב המרכזי באפליקציה. כל משיכה בכל מסך עוברת דרך grossSaleFor.
   אין חישוב ברוטו שני במקום אחר בקוד — אם נדרש כזה, הוא באג. */

function gainFraction(asset) {
  const mv = asset.marketValue
  if (!(mv > 0)) return 0
  return Math.max(0, (mv - asset.costBasis) / mv)
}

/* §1.1 — ללא clamp בכוונה: פוזיציה בהפסד מייצרת חבות שלילית, וזה הפסד
   שניתן לקיזוז. הצגה שמעגלת אותו ל-0 מסתירה נכס שכדאי למכור. */
function deferredTax(asset, taxRate) {
  return (asset.marketValue - asset.costBasis) * taxRate
}

/**
 * כמה ברוטו למכור מנכס אחד כדי לספק `net` שקלים נטו.
 * מוגבל בשווי הנכס — נכס שאינו מספיק מחזיר netDelivered קטן מ-net.
 */
function grossSaleFor(net, asset, taxRate) {
  const mv = asset.marketValue
  const g = gainFraction(asset)
  const factor = 1 - taxRate * g          // כמה נטו מתקבל על כל שקל ברוטו
  const wanted = factor > 0 ? net / factor : Infinity
  const grossSale = Math.min(Math.max(0, wanted), Math.max(0, mv))
  const share = mv > 0 ? grossSale / mv : 0
  const basisConsumed = asset.costBasis * share
  const realizedGain = grossSale - basisConsumed
  return {
    assetId:       asset.id,
    name:          asset.name,
    gainFraction:  g,
    grossSale,
    netDelivered:  grossSale * factor,
    basisConsumed,
    realizedGain,
    taxAccrued:    realizedGain * taxRate,
  }
}

/* ===== 2.2 סדר המשיכה ===== */

const TIE_BAND = 0.03   // "בטווח של 3 נקודות אחוז"

/** האם מכירת הנכס מקרבת את התיק לתמהיל היעד. +1 מקרב, -1 מרחיק, 0 ניטרלי. */
function mixPreference(asset, assets, israelTarget) {
  if (asset.class !== 'equity') return 0
  const eq = assets.filter(a => a.class === 'equity')
  const totalEq = eq.reduce((s, a) => s + a.marketValue, 0)
  if (!(totalEq > 0)) return 0
  const israelMV = eq.filter(a => a.region === 'israel').reduce((s, a) => s + a.marketValue, 0)
  const share = israelMV / totalEq
  const over = share - israelTarget
  if (Math.abs(over) < 0.005) return 0
  const isIsrael = asset.region === 'israel'
  return (over > 0) === isIsrael ? 1 : -1
}

/**
 * סדר המשיכה המלא. רובד הנזילות (cash) תמיד ראשון, אחריו מנייתי בסדר עולה
 * לפי שיעור רווח.
 *
 * כלל השובר-שוויון של 3 נקודות אחוז אינו יחס סדר טרנזיטיבי, ולכן אי אפשר
 * להעביר אותו כ-comparator ל-Array.sort. במקום זה: מיון יציב לפי שיעור רווח,
 * ואז מעברי החלפה על זוגות סמוכים בלבד. חסום במספר המעברים, דטרמיניסטי.
 *
 * isLegacy אינו חוסם — הוא רק מסומן, ובפועל נדחק לסוף התור בזכות שיעור
 * הרווח הגבוה שלו. אין כאן כלל נפרד (§2.2).
 */
function withdrawalOrder(assets, opts) {
  const israelTarget = opts.israelTargetShareOfEquity
  const live = assets.filter(a => a.marketValue > 0)
  const cash = live.filter(a => a.class === 'cash').sort((a, b) => gainFraction(a) - gainFraction(b))
  const eq = live.filter(a => a.class !== 'cash').sort((a, b) => gainFraction(a) - gainFraction(b))

  for (let pass = 0; pass < eq.length; pass++) {
    let swapped = false
    for (let i = 0; i < eq.length - 1; i++) {
      const a = eq[i], b = eq[i + 1]
      if (Math.abs(gainFraction(a) - gainFraction(b)) > TIE_BAND) continue
      if (mixPreference(b, live, israelTarget) > mixPreference(a, live, israelTarget)) {
        eq[i] = b; eq[i + 1] = a; swapped = true
      }
    }
    if (!swapped) break
  }

  return [...cash, ...eq].map((a, i) => ({
    asset: a,
    rank: i + 1,
    reason: a.class === 'cash'
      ? 'רובד הנזילות — תמיד ראשון'
      : `שיעור רווח ${(gainFraction(a) * 100).toFixed(1)}%` +
        (mixPreference(a, live, israelTarget) > 0 ? ' · מקרב לתמהיל היעד' : '') +
        (a.isLegacy ? ' · אחזקה ישנה' : ''),
  }))
}

/**
 * תוכנית משיכה מלאה עבור `netNeeded` שקלים נטו.
 * `only` מגביל את המקורות ('equity' לשימוש של כלל המילוי מחדש).
 */
function planWithdrawal(assets, netNeeded, opts) {
  const taxRate = opts.taxRate
  const pool = opts.only ? assets.filter(a => a.class === opts.only) : assets
  const order = withdrawalOrder(pool, opts)
  const legs = []
  let remaining = Math.max(0, netNeeded)

  for (const step of order) {
    if (remaining <= 0.005) break
    const leg = grossSaleFor(remaining, step.asset, taxRate)
    if (leg.grossSale <= 0.005) continue
    legs.push(Object.assign(leg, { rank: step.rank, reason: step.reason }))
    remaining -= leg.netDelivered
  }

  const sum = k => legs.reduce((s, l) => s + l[k], 0)
  return {
    legs,
    netRequested:  netNeeded,
    totalGross:    sum('grossSale'),
    totalNet:      sum('netDelivered'),
    totalBasis:    sum('basisConsumed'),
    realizedGain:  sum('realizedGain'),
    taxAccrued:    sum('taxAccrued'),
    shortfall:     Math.max(0, remaining),
  }
}

/** מחיל תוכנית משיכה על עותק של הנכסים ומחזיר נכסים מעודכנים. */
function applyPlan(assets, plan) {
  const byId = new Map(plan.legs.map(l => [l.assetId, l]))
  return assets.map(a => {
    const l = byId.get(a.id)
    if (!l) return a
    return Object.assign({}, a, {
      marketValue: a.marketValue - l.grossSale,
      costBasis:   a.costBasis - l.basisConsumed,
    })
  })
}

/* ===== מצרפים ===== */
function portfolioTotals(assets, taxRate) {
  const mv = assets.reduce((s, a) => s + a.marketValue, 0)
  const basis = assets.reduce((s, a) => s + a.costBasis, 0)
  const cash = assets.filter(a => a.class === 'cash').reduce((s, a) => s + a.marketValue, 0)
  const equity = mv - cash
  const israel = assets.filter(a => a.class === 'equity' && a.region === 'israel')
    .reduce((s, a) => s + a.marketValue, 0)
  return {
    marketValue: mv,
    costBasis:   basis,
    accruedGain: mv - basis,
    /* clamp ל-0 באותה סיבה של §2.1: תיק בהפסד לא מקטין את הברוטו הנדרש,
       הוא רק לא מגדיל אותו. בלי ה-clamp יחס הכיסוי היה יוצא אופטימי. */
    gainFraction: mv > 0 ? Math.max(0, (mv - basis) / mv) : 0,
    deferredTax:  (mv - basis) * taxRate,
    cash, equity, israel,
  }
}

/* ===== תשואות ריאליות נטו =====
   השדות בהנחות הם ברוטו; דמי הניהול יורדים משני הרכיבים. */
function netRealEquity(a, scenario) { return a.realGrossEquity[scenario || 'base'] - a.fees }
function netRealCash(a)             { return a.realGrossCash - a.fees }
function monthlyRate(annual)        { return Math.pow(1 + annual, 1 / 12) - 1 }

/* ===== 2.4 יחס כיסוי ===== */

function currentAge(assumptions, refDate) {
  const y = (refDate ? new Date(refDate) : new Date()).getFullYear()
  return y - assumptions.fatherBirthYear
}

function annualWithdrawal(config) {
  return config.pensionFromFund * 12 + config.bulletAmount
}

/** ערך נוכחי של ההתחייבות עד גיל האופק. */
function requiredNet(assumptions, config, age) {
  const n = Math.max(0, assumptions.horizonAge - age)
  const aw = annualWithdrawal(config)
  const d = assumptions.discountRate
  let sum = 0
  for (let k = 0; k < n; k++) sum += aw / Math.pow(1 + d, k)
  return sum
}

function coverage(assets, assumptions, config, refDate) {
  const age = currentAge(assumptions, refDate)
  const t = portfolioTotals(assets, assumptions.taxRate)
  const rNet = requiredNet(assumptions, config, age)
  const denom = 1 - assumptions.taxRate * t.gainFraction
  const rGross = denom > 0 ? rNet / denom : Infinity
  const beyondHorizon = age >= assumptions.horizonAge
  const ratio = beyondHorizon ? null : (rGross > 0 ? t.marketValue / rGross : 0)
  return {
    age,
    years:         Math.max(0, assumptions.horizonAge - age),
    requiredNet:   rNet,
    requiredGross: rGross,
    marketValue:   t.marketValue,
    gap:           t.marketValue - rGross,
    coverageRatio: ratio,
    band:          ratio === null ? null : bandFor(ratio),
    beyondHorizon,
    totals:        t,
  }
}

function bandFor(ratio) {
  if (ratio >= 1.00) return 'green'
  if (ratio >= 0.85) return 'yellow'
  return 'red'
}

const BAND_LABEL = { green: 'ירוק', yellow: 'צהוב', red: 'אדום' }

/* ===== 2.7 סטייה מהתמהיל =====
   יעד הנזילות נגזר מ-rungTarget ומשווי התיק, ולא מקובע כ-5.6% (R6):
   ברגע שהקצבה או הרובד משתנים, ה-5.6% חדל להיות נכון. */
function mixDrift(assets, config) {
  const t = portfolioTotals(assets, 0)
  const liqShare = t.marketValue > 0 ? t.cash / t.marketValue : 0
  const liqTarget = t.marketValue > 0 ? config.rungTarget / t.marketValue : 0
  const ilShare = t.equity > 0 ? t.israel / t.equity : 0
  const ilTarget = config.israelTargetShareOfEquity

  const rows = [
    { key: 'liquidity', label: 'רובד נזילות מתוך התיק', share: liqShare, target: liqTarget,
      gapAmount: config.rungTarget - t.cash },
    { key: 'israel', label: 'ישראל מתוך הרכיב המנייתי', share: ilShare, target: ilTarget,
      gapAmount: (ilTarget * t.equity) - t.israel },
  ]
  /* §2.7 + R3 — התיקון מוצג תמיד כרכישה. סטייה שדורשת מכירה מסומנת
     "אין פעולה אפשרית" ולא מציעה למכור. */
  for (const r of rows) {
    r.drift = r.share - r.target
    r.fixable = r.gapAmount > 0
    r.action = r.fixable
      ? `רכישה של ${Math.round(r.gapAmount).toLocaleString('he-IL')} ₪ בכסף חדש`
      : 'אין פעולה אפשרית — תיקון היה דורש מכירה'
  }
  return rows
}

/* ===== רובד הנזילות ===== */

/** כמה חודשי משיכה נותרו ברובד. כולל את המשיכה החריגה, שגם היא יוצאת מהרובד. */
function rungMonthsLeft(assets, config) {
  const cash = assets.filter(a => a.class === 'cash').reduce((s, a) => s + a.marketValue, 0)
  const monthlyBurn = config.pensionFromFund + config.bulletAmount / 12
  return monthlyBurn > 0 ? cash / monthlyBurn : Infinity
}

/* ===== 2.3 תשואת הרכיב המנייתי (TWR) =====
   שרשור תת-תקופות בין snapshots, עם נטרול תזרימים. תזרים חיובי = כסף שנכנס
   לרכיב המנייתי (קנייה); שלילי = מכירה. */
function equityReturnYTD(state, year) {
  const equityIds = new Set(state.assets.filter(a => a.class === 'equity').map(a => a.id))
  const snapMV = s => (s.assets || [])
    .filter(x => equityIds.has(x.assetId))
    .reduce((sum, x) => sum + (x.marketValue || 0), 0)

  const all = [...state.snapshots].sort((a, b) => a.date < b.date ? -1 : 1)
  const yStart = `${year}-01-01`, yEnd = `${year}-12-31`
  const opening = [...all].reverse().find(s => s.date <= yStart)
  const inYear = all.filter(s => s.date > yStart && s.date <= yEnd)
  const chain = opening ? [opening, ...inYear] : inYear
  if (chain.length < 2) return null

  const flowsBetween = (from, to) => (state.transactions || [])
    .filter(t => t.date > from && t.date <= to && equityIds.has(t.assetId))
    .reduce((s, t) => s + (t.type === 'buy' ? t.grossAmount : -t.grossAmount), 0)

  let linked = 1
  for (let i = 1; i < chain.length; i++) {
    const mv0 = snapMV(chain[i - 1])
    const mv1 = snapMV(chain[i])
    if (!(mv0 > 0)) return null
    const f = flowsBetween(chain[i - 1].date, chain[i].date)
    linked *= (mv1 - f) / mv0
  }
  return linked - 1
}

/**
 * §2.3 — החלטת מילוי מחדש. מופעלת בסוף שנת כספים.
 * שנה מנייתית שלילית → לא ממלאים (R5). זה לא "המלצה" אלא כלל.
 */
function refillDecision(state, year) {
  const { assets, config, assumptions } = state
  const cash = assets.filter(a => a.class === 'cash').reduce((s, a) => s + a.marketValue, 0)
  const gap = config.rungTarget - cash
  const r = equityReturnYTD(state, year)

  if (r === null) {
    return { year, status: 'unknown', equityReturnYTD: null, gap,
      message: 'אין מספיק snapshots בשנה הזו כדי לחשב את תשואת הרכיב המנייתי. ההחלטה דורשת עדכון תיק.' }
  }
  if (r <= 0) {
    return { year, status: 'skip', equityReturnYTD: r, gap,
      message: 'הרובד לא מולא. משיכות יגיעו ישירות מהמנייתי עד השנה החיובית הבאה.' }
  }
  if (gap <= 0) {
    return { year, status: 'full', equityReturnYTD: r, gap,
      message: 'הרובד מלא. אין צורך במכירה.' }
  }
  return {
    year, status: 'fill', equityReturnYTD: r, gap,
    plan: planWithdrawal(assets, gap, {
      taxRate: assumptions.taxRate,
      israelTargetShareOfEquity: config.israelTargetShareOfEquity,
      only: 'equity',
    }),
    message: `מכירה מהמנייתי כדי להחזיר את הרובד ל-${config.rungTarget.toLocaleString('he-IL')} ₪.`,
  }
}

/* ===== 2.5 מסלול חציוני =====
   דטרמיניסטי, צעד חודשי, מעקב בסיס עלות מלא — אותה מכניקה של §2.1.
   מחמיא למניות בכוונה, ולכן המסך שמציג אותו חייב לשאת את האזהרה. */
function medianPath(state, opts) {
  const o = opts || {}
  const scenario = o.scenario || 'base'
  const untilAge = o.untilAge || 100
  const { assumptions: A, config: C } = state
  const mEq = monthlyRate(netRealEquity(A, scenario))
  const mCash = monthlyRate(netRealCash(A))

  let assets = state.assets.map(a => Object.assign({}, a))
  let age = currentAge(A, o.refDate)
  const startMonth = (o.refDate ? new Date(o.refDate) : new Date()).getMonth() + 1

  const rows = []
  const pushRow = (atAge) => {
    const t = portfolioTotals(assets, A.taxRate)
    const cov = coverageAtAge(t, A, C, atAge)
    rows.push({
      age: atAge, marketValue: t.marketValue, costBasis: t.costBasis,
      accruedGain: t.accruedGain, deferredTax: t.deferredTax,
      cash: t.cash, coverageRatio: cov, band: cov === null ? null : bandFor(cov),
    })
  }
  pushRow(age)

  let depletionAge = null

  for (let y = 0; y < untilAge - age && !depletionAge; y++) {
    const thisAge = age + y
    for (let m = 0; m < 12; m++) {
      const calMonth = ((startMonth - 1 + m) % 12) + 1
      assets = assets.map(a => Object.assign({}, a, {
        marketValue: a.marketValue * (1 + (a.class === 'cash' ? mCash : mEq)),
      }))
      let need = C.pensionFromFund
      if (calMonth === C.bulletMonth) need += C.bulletAmount
      const plan = planWithdrawal(assets, need, {
        taxRate: A.taxRate, israelTargetShareOfEquity: C.israelTargetShareOfEquity,
      })
      assets = applyPlan(assets, plan)
      if (plan.shortfall > 1) { depletionAge = thisAge + (m + 1) / 12; break }
    }
    if (depletionAge) break

    // סוף שנה — כלל המילוי מחדש (§2.3 / R5) על התשואה המסולולת.
    const eqNow = assets.filter(a => a.class === 'equity').reduce((s, a) => s + a.marketValue, 0)
    if (netRealEquity(A, scenario) > 0 && eqNow > 0) {
      const cashNow = assets.filter(a => a.class === 'cash').reduce((s, a) => s + a.marketValue, 0)
      const gap = C.rungTarget - cashNow
      if (gap > 0) {
        const fill = planWithdrawal(assets, gap, {
          taxRate: A.taxRate, israelTargetShareOfEquity: C.israelTargetShareOfEquity, only: 'equity',
        })
        assets = applyPlan(assets, fill)
        const cashAsset = assets.find(a => a.class === 'cash')
        if (cashAsset) {
          cashAsset.marketValue += fill.totalNet
          cashAsset.costBasis += fill.totalNet
        }
      }
    }
    pushRow(thisAge + 1)
  }

  return { rows, depletionAge, scenario, finalAssets: assets }
}

/** יחס כיסוי מתוך מצרפים שכבר חושבו — לשימוש בתוך לולאות הקרנה.
    מעבר לגיל האופק ההתחייבות היא אפס, ולכן היחס אינו מוגדר — מחזיר null
    ולא Infinity. מספר אינסופי בטבלה נקרא כ"מכוסה לחלוטין", וזו לא האמת:
    פשוט אין יותר מה למדוד מולו. */
function coverageAtAge(totals, A, C, age) {
  if (age >= A.horizonAge) return null
  const rNet = requiredNet(A, C, age)
  const denom = 1 - A.taxRate * totals.gainFraction
  if (!(denom > 0) || !(rNet > 0)) return null
  return totals.marketValue / (rNet / denom)
}

/* ===== 2.6 מונטה קרלו ===== */

/* PRNG עם seed. אותם קלטים מחזירים אותם מספרים — באפליקציה שאמורה לשמש
   לקבלת החלטות, פלט שמשתנה בין הרצות הוא פלט שאי אפשר לצטט בבקרה. */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function normalPair(rand) {
  let u = 0, v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  const r = Math.sqrt(-2 * Math.log(u))
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)]
}

/**
 * תיקון גרירת התנודתיות. היעד בהנחות הוא תשואה **גיאומטרית**; הגרלה מהתפלגות
 * נורמלית דורשת את הממוצע ה**אריתמטי**, והוא גבוה ב-σ²/2. בלי התיקון הזה
 * הסימולציה מייצרת תשואה חציונית נמוכה מהיעד ומגזימה בהסתברות הכשל.
 * ב-σ=0.15 מדובר ב-1.125 נקודת אחוז — לא זניח.
 */
function arithmeticMean(geoMean, sd) { return geoMean + (sd * sd) / 2 }

function monteCarlo(state, opts) {
  const o = opts || {}
  const N = o.paths || 20000
  const A = state.assumptions, C = state.config
  const rand = mulberry32(o.seed == null ? 20260904 : o.seed)

  const age0 = currentAge(A, o.refDate)
  const maxAge = o.untilAge || 100
  const years = Math.max(1, maxAge - age0)

  const geo = netRealEquity(A, o.scenario || 'base')
  const mu = arithmeticMean(geo, A.sdEquity)
  const cashR = netRealCash(A)
  const aw = annualWithdrawal(C)
  const tau = A.taxRate

  const mvByYear = Array.from({ length: years + 1 }, () => new Float64Array(N))
  const depletion = new Float64Array(N)     // גיל ההידלדלות, או 0 אם לא התדלדל
  const drawdowns = new Float64Array(N)
  const eq0 = state.assets.filter(a => a.class === 'equity')
  const cash0 = state.assets.filter(a => a.class === 'cash')
  const sum = (arr, k) => arr.reduce((s, a) => s + a[k], 0)
  const EQ_MV = sum(eq0, 'marketValue'), EQ_BS = sum(eq0, 'costBasis')
  const CH_MV = sum(cash0, 'marketValue'), CH_BS = sum(cash0, 'costBasis')

  let spare = null
  const gauss = () => {
    if (spare !== null) { const s = spare; spare = null; return s }
    const [a, b] = normalPair(rand); spare = b; return a
  }

  for (let p = 0; p < N; p++) {
    let eMV = EQ_MV, eBS = EQ_BS, cMV = CH_MV, cBS = CH_BS
    let peak = eMV + cMV, maxDD = 0, dead = 0
    mvByYear[0][p] = eMV + cMV

    for (let y = 1; y <= years; y++) {
      if (dead) { mvByYear[y][p] = 0; continue }

      /* משיכה בתחילת השנה — הנחה שמרנית: הכסף יוצא לפני שהוא מספיק לצמוח.
         רובד הנזילות ראשון, אחר כך מנייתי בברוטו (§2.1–2.2). */
      let need = aw
      const fromCash = Math.min(need, cMV)
      if (fromCash > 0) {
        const share = cMV > 0 ? fromCash / cMV : 0
        cBS -= cBS * share; cMV -= fromCash; need -= fromCash
      }
      if (need > 0.01) {
        const g = eMV > 0 ? Math.max(0, (eMV - eBS) / eMV) : 0
        const factor = 1 - tau * g
        const gross = factor > 0 ? Math.min(need / factor, eMV) : eMV
        const share = eMV > 0 ? gross / eMV : 0
        const delivered = gross * factor
        eBS -= eBS * share; eMV -= gross; need -= delivered
        if (need > 1) { dead = 1; depletion[p] = age0 + y; mvByYear[y][p] = 0; continue }
      }

      const r = mu + A.sdEquity * gauss()
      eMV *= (1 + r)
      cMV *= (1 + cashR)

      /* R5 — מילוי מחדש רק בשנה מנייתית חיובית. */
      if (r > 0) {
        const gap = C.rungTarget - cMV
        if (gap > 0 && eMV > 0) {
          const g = Math.max(0, (eMV - eBS) / eMV)
          const factor = 1 - tau * g
          const gross = factor > 0 ? Math.min(gap / factor, eMV) : eMV
          const share = eMV > 0 ? gross / eMV : 0
          const delivered = gross * factor
          eBS -= eBS * share; eMV -= gross
          cMV += delivered; cBS += delivered
        }
      }

      const tot = eMV + cMV
      if (tot > peak) peak = tot
      if (peak > 0) maxDD = Math.max(maxDD, (peak - tot) / peak)
      mvByYear[y][p] = tot
      if (tot <= 0) { dead = 1; depletion[p] = age0 + y }
    }
    drawdowns[p] = maxDD
  }

  const pct = (arr, q) => {
    const s = Float64Array.from(arr).sort()
    const i = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))
    return s[i]
  }
  const bands = []
  for (let y = 0; y <= years; y++) {
    const col = mvByYear[y]
    bands.push({
      age: age0 + y,
      p10: pct(col, 0.10), p25: pct(col, 0.25), p50: pct(col, 0.50),
      p75: pct(col, 0.75), p90: pct(col, 0.90),
    })
  }

  let depletedByHorizon = 0
  for (let p = 0; p < N; p++) {
    if (depletion[p] && depletion[p] <= A.horizonAge) depletedByHorizon++
  }

  return {
    paths: N,
    ageStart: age0,
    arithmeticMean: mu,
    geometricTarget: geo,
    pDepletionByHorizon: depletedByHorizon / N,
    pDepletionInLifetime: lifetimeDepletion(depletion, state.mortality, age0),
    bands,
    drawdown: { median: pct(drawdowns, 0.50), worst5: pct(drawdowns, 0.95) },
  }
}

/**
 * הסתברות הידלדלות בחיי האב. דורשת לוח תמותה אמיתי (§2.6) — בלעדיו מחזירה
 * null, והמסך מציג "לא זמין" במקום מספר שנשען על אומדן.
 */
function lifetimeDepletion(depletionByPath, mortality, age0) {
  if (!mortality || !Array.isArray(mortality.qx) || !mortality.qx.length) return null
  const start = mortality.startAge == null ? 0 : mortality.startAge
  const qxAt = age => {
    const i = age - start
    return i >= 0 && i < mortality.qx.length ? mortality.qx[i] : 1
  }
  // התפלגות שנת הפטירה מהגיל הנוכחי
  const deathAt = []
  let alive = 1
  for (let a = age0; a < start + mortality.qx.length + 1; a++) {
    const q = Math.min(1, Math.max(0, qxAt(a)))
    deathAt.push({ age: a + 1, p: alive * q })
    alive *= (1 - q)
    if (alive <= 1e-9) break
  }
  const N = depletionByPath.length
  let acc = 0
  for (const d of deathAt) {
    let depletedBefore = 0
    for (let p = 0; p < N; p++) if (depletionByPath[p] && depletionByPath[p] <= d.age) depletedBefore++
    acc += d.p * (depletedBefore / N)
  }
  return acc
}

/* ===== 2.8 מחשבון מודל ההעסקה (רזרבה) ===== */
function employmentModel(input, state) {
  const monthlySalary = input.monthlySalary || 0
  const bonus = input.bonus || 0
  const marginalRate = input.marginalRate || 0
  const employerCosts = input.employerCosts || 0   // ב"ל + פנסיה, שנתי
  const gross = monthlySalary * 12 + bonus
  const taxSaving = gross * marginalRate - employerCosts
  return {
    annualGross: gross,
    employerCosts,
    annualNetTaxSaving: taxSaving,
    note: 'מודול רזרבה. לא פעיל. מוצג רק כשההערכה מגיעה לרצועה האדומה, לצד הורדת קצבה.',
  }
}

/* ===== R8 — טריות הנתונים ===== */
function staleness(state, stalDays, refDate) {
  const last = state.meta && state.meta.lastPortfolioUpdate
  if (!last) return { days: null, stale: true, never: true }
  const now = refDate ? new Date(refDate) : new Date()
  const days = Math.floor((now - new Date(last)) / 86400000)
  return { days, stale: days > stalDays, never: false }
}

if (typeof module !== 'undefined') {
  module.exports = {
    gainFraction, deferredTax, grossSaleFor, withdrawalOrder, planWithdrawal, applyPlan,
    portfolioTotals, netRealEquity, netRealCash, monthlyRate,
    currentAge, annualWithdrawal, requiredNet, coverage, bandFor, BAND_LABEL,
    mixDrift, rungMonthsLeft, equityReturnYTD, refillDecision,
    medianPath, coverageAtAge, monteCarlo, arithmeticMean, mulberry32,
    employmentModel, staleness, mixPreference, TIE_BAND,
  }
}
