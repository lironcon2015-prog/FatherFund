import { test } from 'node:test'
import assert from 'node:assert/strict'
import { E, M, fixture, REF, close } from './helpers.mjs'

/* ===== 2.1 ===== */
test('gainFraction מתאפס בהפסד ולא יוצא שלילי', () => {
  assert.equal(E.gainFraction({ marketValue: 100, costBasis: 140 }), 0)
  assert.equal(E.gainFraction({ marketValue: 0, costBasis: 50 }), 0)
  assert.ok(close(E.gainFraction({ marketValue: 100000, costBasis: 60000 }), 0.4))
})

test('grossSaleFor — נטו מבוקש מתקבל במלואו, והמס מסתדר', () => {
  const a = { id: 'x', name: 'x', marketValue: 100000, costBasis: 60000 }
  const r = E.grossSaleFor(1300, a, 0.25)
  assert.ok(close(r.netDelivered, 1300, 1e-9))
  assert.ok(close(r.grossSale, 1300 / 0.9, 1e-9))
  assert.ok(close(r.basisConsumed, 60000 * (r.grossSale / 100000), 1e-9))
  assert.ok(close(r.realizedGain, r.grossSale - r.basisConsumed, 1e-9))
  assert.ok(close(r.taxAccrued, r.realizedGain * 0.25, 1e-9))
  // האינווריאנטה שמחזיקה את כל המסך: ברוטו פחות מס = נטו.
  assert.ok(close(r.grossSale - r.taxAccrued, r.netDelivered, 1e-9))
})

test('grossSaleFor חסום בשווי הנכס — מחזיר נטו קטן מהמבוקש', () => {
  const a = { id: 'x', name: 'x', marketValue: 1000, costBasis: 500 }
  const r = E.grossSaleFor(5000, a, 0.25)
  assert.equal(r.grossSale, 1000)
  assert.ok(r.netDelivered < 5000)
})

test('בסיס העלות נצרך יחסית — שיעור הרווח נשמר אחרי מכירה חלקית', () => {
  const assets = [M.makeAsset({ id: 'a', name: 'a', class: 'equity', marketValue: 100000, costBasis: 60000 })]
  const plan = E.planWithdrawal(assets, 5000, { taxRate: 0.25, israelTargetShareOfEquity: 0.22 })
  const after = E.applyPlan(assets, plan)
  assert.ok(close(E.gainFraction(after[0]), 0.4, 1e-9))
})

/* ===== 2.2 ===== */
test('סדר המשיכה — רובד הנזילות ראשון, אחר כך שיעור רווח עולה', () => {
  const s = fixture()
  const order = E.withdrawalOrder(s.assets, { israelTargetShareOfEquity: 0.22 })
  assert.equal(order[0].asset.id, 'cash1')
  assert.equal(order[1].asset.id, 'isr')   // 20.3% רווח
  assert.equal(order[2].asset.id, 'glob')  // 25.0% רווח
})

test('שובר שוויון של 3 נקודות אחוז מעדיף את מה שמקרב לתמהיל היעד', () => {
  const assets = [
    M.makeAsset({ id: 'g', name: 'גלובלי', class: 'equity', region: 'global', marketValue: 50000, costBasis: 40000 }), // 20%
    M.makeAsset({ id: 'i', name: 'ישראל',  class: 'equity', region: 'israel', marketValue: 50000, costBasis: 39000 }), // 22%
  ]
  // ישראל היא 50% מהמנייתי מול יעד 22% — מכירה שלה מקרבת ליעד,
  // ולכן היא עוקפת למרות שיעור רווח גבוה יותר בתוך הטווח של 3 נק'.
  const order = E.withdrawalOrder(assets, { israelTargetShareOfEquity: 0.22 })
  assert.equal(order[0].asset.id, 'i')
})

test('מעבר ל-3 נקודות אחוז שיעור הרווח מנצח את התמהיל', () => {
  const assets = [
    M.makeAsset({ id: 'g', name: 'גלובלי', class: 'equity', region: 'global', marketValue: 50000, costBasis: 45000 }), // 10%
    M.makeAsset({ id: 'i', name: 'ישראל',  class: 'equity', region: 'israel', marketValue: 50000, costBasis: 25000 }), // 50%
  ]
  const order = E.withdrawalOrder(assets, { israelTargetShareOfEquity: 0.22 })
  assert.equal(order[0].asset.id, 'g')
})

test('planWithdrawal מדווח shortfall כשהתיק לא מספיק', () => {
  const s = fixture()
  const plan = E.planWithdrawal(s.assets, 999999999, { taxRate: 0.25, israelTargetShareOfEquity: 0.22 })
  assert.ok(plan.shortfall > 0)
})

/* ===== 2.4 ===== */
test('יחס כיסוי מול נוסחת סדרה הנדסית מחושבת בנפרד', () => {
  const s = fixture()
  const cov = E.coverage(s.assets, s.assumptions, s.config, REF)
  assert.equal(cov.age, 69)
  assert.equal(cov.years, 26)

  const aw = 1300 * 12 + 10000
  const v = 1 / (1 + s.assumptions.discountRate)
  const expectedNet = aw * (1 - Math.pow(v, 26)) / (1 - v)
  assert.ok(close(cov.requiredNet, expectedNet, 1e-6))

  const t = E.portfolioTotals(s.assets, 0.25)
  assert.ok(close(cov.requiredGross, expectedNet / (1 - 0.25 * t.gainFraction), 1e-6))
  assert.ok(close(cov.coverageRatio, t.marketValue / cov.requiredGross, 1e-9))
})

test('רצועות — 1.00 ירוק, 0.85 צהוב, מתחת אדום', () => {
  assert.equal(E.bandFor(1.00), 'green')
  assert.equal(E.bandFor(0.999), 'yellow')
  assert.equal(E.bandFor(0.85), 'yellow')
  assert.equal(E.bandFor(0.8499), 'red')
})

test('R6 — שינוי בהנחה מזיז את הסף, אין מספר קשיח', () => {
  const s = fixture()
  const a = E.coverage(s.assets, s.assumptions, s.config, REF)
  s.config.pensionFromFund = 1600
  const b = E.coverage(s.assets, s.assumptions, s.config, REF)
  assert.ok(b.requiredGross > a.requiredGross)
  assert.ok(b.coverageRatio < a.coverageRatio)
})

/* ===== 2.7 ===== */
test('יעד הנזילות נגזר מ-rungTarget ולא מ-5.6% קשיח', () => {
  const s = fixture()
  const rows = E.mixDrift(s.assets, s.config)
  const liq = rows.find(r => r.key === 'liquidity')
  const total = E.portfolioTotals(s.assets, 0).marketValue
  assert.ok(close(liq.target, s.config.rungTarget / total, 1e-12))
  s.config.rungTarget = 51200
  const rows2 = E.mixDrift(s.assets, s.config)
  assert.ok(rows2.find(r => r.key === 'liquidity').target > liq.target)
})

test('סטייה שדורשת מכירה מסומנת "אין פעולה אפשרית"', () => {
  const s = fixture()
  s.assets.find(a => a.id === 'isr').marketValue = 300000   // ישראל בעודף חד
  const il = E.mixDrift(s.assets, s.config).find(r => r.key === 'israel')
  assert.equal(il.fixable, false)
  assert.match(il.action, /אין פעולה אפשרית/)
})

/* ===== 2.3 ===== */
test('TWR מנטרל תזרימים בין snapshots', () => {
  const s = fixture()
  s.snapshots = [
    { date: '2025-12-31', assets: [{ assetId: 'glob', marketValue: 100000, costBasis: 80000 }] },
    { date: '2026-06-30', assets: [{ assetId: 'glob', marketValue: 120000, costBasis: 90000 }] },
  ]
  // בלי תזרים: 20%
  assert.ok(close(E.equityReturnYTD(s, 2026), 0.2, 1e-9))
  // עם רכישה של 10,000 באמצע — התשואה האמיתית 10%, לא 20%
  s.transactions = [{ date: '2026-03-01', assetId: 'glob', type: 'buy', grossAmount: 10000 }]
  assert.ok(close(E.equityReturnYTD(s, 2026), 0.1, 1e-9))
})

test('R5 — שנה מנייתית שלילית לא ממלאת את הרובד', () => {
  const s = fixture()
  s.assets.find(a => a.id === 'cash1').marketValue = 8000
  s.snapshots = [
    { date: '2025-12-31', assets: [{ assetId: 'glob', marketValue: 100000 }] },
    { date: '2026-06-30', assets: [{ assetId: 'glob', marketValue: 90000 }] },
  ]
  const d = E.refillDecision(s, 2026)
  assert.equal(d.status, 'skip')
  assert.match(d.message, /לא מולא/)
})

test('שנה חיובית ממלאת את הרובד דרך §2.1', () => {
  const s = fixture()
  s.assets.find(a => a.id === 'cash1').marketValue = 8000
  s.snapshots = [
    { date: '2025-12-31', assets: [{ assetId: 'glob', marketValue: 100000 }] },
    { date: '2026-06-30', assets: [{ assetId: 'glob', marketValue: 112000 }] },
  ]
  const d = E.refillDecision(s, 2026)
  assert.equal(d.status, 'fill')
  assert.ok(close(d.gap, 17600, 1e-9))
  assert.ok(close(d.plan.totalNet, 17600, 1e-6))
  assert.ok(d.plan.totalGross > d.plan.totalNet)   // הברוטו תמיד גדול מהנטו
  assert.ok(d.plan.legs.every(l => l.assetId !== 'cash1'))  // רק מהמנייתי
})

test('אין מספיק snapshots — ההחלטה לא מנוחשת', () => {
  const s = fixture()
  assert.equal(E.refillDecision(s, 2026).status, 'unknown')
})

/* ===== רובד ===== */
test('חודשי משיכה ברובד כוללים את המשיכה החריגה', () => {
  const s = fixture()
  const m = E.rungMonthsLeft(s.assets, s.config)
  assert.ok(close(m, 25600 / (1300 + 10000 / 12), 1e-9))
  assert.ok(m > 11 && m < 13)   // הרובד בדיוק שנה
})

/* ===== 2.5 ===== */
test('מסלול חציוני — שורה לכל שנה, בסיס עלות נשמר עקבי', () => {
  const s = fixture()
  const p = E.medianPath(s, { refDate: REF, untilAge: 100 })
  assert.equal(p.rows[0].age, 69)
  assert.ok(p.rows.length > 1)
  for (const r of p.rows) {
    assert.ok(r.costBasis <= r.marketValue + 1e-6 || r.marketValue === 0)
    assert.ok(r.coverageRatio === null || Number.isFinite(r.coverageRatio))
  }
})

test('קצבה מנופחת מדלדלת את התיק', () => {
  const s = fixture()
  s.config.pensionFromFund = 9000
  const p = E.medianPath(s, { refDate: REF, untilAge: 100 })
  assert.ok(p.depletionAge !== null)
  assert.ok(p.depletionAge < 100)
})

/* ===== 2.6 ===== */
test('תיקון גרירת התנודתיות — μ אריתמטי = μ גיאומטרי + σ²/2', () => {
  assert.ok(close(E.arithmeticMean(0.051, 0.15), 0.051 + 0.01125, 1e-12))
  // רגרסיה: בלי התיקון הסימולציה מפיקה חציון נמוך מהיעד ומגזימה בסיכון.
  assert.ok(E.arithmeticMean(0.051, 0.15) > 0.051)
})

test('מונטה קרלו דטרמיניסטי מול אותו seed', () => {
  const s = fixture()
  const o = { paths: 400, seed: 7, refDate: REF, untilAge: 85 }
  const a = E.monteCarlo(s, o), b = E.monteCarlo(s, o)
  assert.equal(a.pDepletionByHorizon, b.pDepletionByHorizon)
  assert.deepEqual(a.bands.map(x => x.p50), b.bands.map(x => x.p50))
  const c = E.monteCarlo(s, Object.assign({}, o, { seed: 8 }))
  assert.notDeepEqual(a.bands.map(x => x.p50), c.bands.map(x => x.p50))
})

test('רצועות אחוזונים מסודרות, והסתברות בטווח חוקי', () => {
  const s = fixture()
  const mc = E.monteCarlo(s, { paths: 800, seed: 3, refDate: REF, untilAge: 95 })
  for (const b of mc.bands) {
    assert.ok(b.p10 <= b.p25 && b.p25 <= b.p50 && b.p50 <= b.p75 && b.p75 <= b.p90)
  }
  assert.ok(mc.pDepletionByHorizon >= 0 && mc.pDepletionByHorizon <= 1)
  assert.ok(mc.drawdown.worst5 >= mc.drawdown.median)
})

test('הסתברות הידלדלות בחיי האב לא מנוחשת בלי לוח תמותה', () => {
  const s = fixture()
  const mc = E.monteCarlo(s, { paths: 200, seed: 1, refDate: REF, untilAge: 90 })
  assert.equal(mc.pDepletionInLifetime, null)
  s.mortality = { source: 'בדיקה', startAge: 69, qx: Array.from({ length: 40 }, () => 0.05) }
  const mc2 = E.monteCarlo(s, { paths: 200, seed: 1, refDate: REF, untilAge: 90 })
  assert.ok(mc2.pDepletionInLifetime !== null)
  assert.ok(mc2.pDepletionInLifetime >= 0 && mc2.pDepletionInLifetime <= 1)
  // תוחלת חיים קצרה יותר מגיל האופק — הסיכון בחיי האב נמוך מהסיכון עד 95.
  assert.ok(mc2.pDepletionInLifetime <= mc2.pDepletionByHorizon + 1e-9)
})

/* ===== R8 ===== */
test('טריות הנתונים נמדדת מהעדכון האחרון של התיק', () => {
  const s = fixture()
  assert.equal(E.staleness(s, 120, REF).stale, false)
  assert.equal(E.staleness(s, 120, '2027-06-01T00:00:00Z').stale, true)
  s.meta.lastPortfolioUpdate = null
  assert.equal(E.staleness(s, 120, REF).never, true)
})
