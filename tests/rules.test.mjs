import { test } from 'node:test'
import assert from 'node:assert/strict'
import { E, R, fixture, REF } from './helpers.mjs'

test('הסכום המתוכנן כולל את המשיכה החריגה רק בחודש שלה', () => {
  const c = fixture().config
  assert.equal(R.plannedAmountFor(c, '2026-05-14'), 1300)
  assert.equal(R.plannedAmountFor(c, '2026-06-14'), 11300)
})

test('R1 — משיכה כתוכנית לא מייצרת חיכוך', () => {
  const s = fixture()
  assert.deepEqual(R.checkWithdrawal(s, { netAmount: 1300, date: '2026-05-10' }), [])
})

test('R1 — משיכה מעבר לתוכנית דורשת נימוק, ומחמירה כשהתיק ירד', () => {
  const s = fixture()
  s.snapshots = [
    { date: '2026-06-30', assets: [{ assetId: 'glob', marketValue: 400000 }] },
    { date: '2026-09-01', assets: [{ assetId: 'glob', marketValue: 340000 }] },
  ]
  const hits = R.checkWithdrawal(s, { netAmount: 25000, date: '2026-09-04' })
  assert.equal(hits.length, 1)
  assert.equal(hits[0].rule, 'R1')
  assert.equal(hits[0].severity, 'high')
  assert.equal(hits[0].requiresRationale, true)

  // אותה משיכה בתיק שעלה — עדיין נימוק חובה, אבל לא באותה חומרה.
  s.snapshots[1].assets[0].marketValue = 440000
  assert.equal(R.checkWithdrawal(s, { netAmount: 25000, date: '2026-09-04' })[0].severity, 'medium')
})

test('R1 לא נופל כשאין מספיק snapshots לקבוע כיוון', () => {
  const s = fixture()
  const hits = R.checkWithdrawal(s, { netAmount: 25000, date: '2026-09-04' })
  assert.equal(hits[0].severity, 'medium')
})

test('R2 — מועד הבקרה נגזר מהבקרה הקודמת ומ-reviewIntervalYears', () => {
  const s = fixture()
  s.reviews = [{ date: '2026-01-01' }]
  assert.equal(R.nextReviewDate(s), '2029-01-01')
  assert.equal(R.reviewWindow(s, '2026-09-04').inWindow, false)
  assert.equal(R.reviewWindow(s, '2028-12-01').inWindow, true)
  assert.equal(R.reviewWindow(s, '2029-06-01').overdue, true)

  s.config.reviewIntervalYears = 5
  assert.equal(R.nextReviewDate(s), '2031-01-01')
})

test('R2 — פעולה מבנית מחוץ למועד נרשמת ולא נחסמת', () => {
  const s = fixture()
  s.reviews = [{ date: '2026-01-01' }]
  const hits = R.checkStructuralAction(s, '2026-09-04')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].offSchedule, true)
  assert.notEqual(hits[0].severity, 'block')
  assert.equal(R.checkStructuralAction(s, '2028-12-01').length, 0)
})

test('R3 — אחזקה עם רווח מעל 30% חסומה ל-rebalance', () => {
  const hi = { name: 'ותיק', marketValue: 100000, costBasis: 50000 }   // 50%
  const lo = { name: 'חדש',  marketValue: 100000, costBasis: 80000 }   // 20%
  assert.equal(R.checkRebalanceSale(hi, E.gainFraction)[0].blocked, true)
  assert.deepEqual(R.checkRebalanceSale(lo, E.gainFraction), [])
})

test('R4 — העלאת קצבה חסומה לפני 78 ומותרת אחריה', () => {
  const s = fixture()
  assert.equal(R.checkPensionIncrease(s, 1600, 69)[0].blocked, true)
  assert.deepEqual(R.checkPensionIncrease(s, 1600, 78), [])
  // הורדת קצבה אף פעם לא חסומה — הכלל הוא על העלאה בלבד.
  assert.deepEqual(R.checkPensionIncrease(s, 1000, 69), [])
})

test('R8 — מעל 120 יום כל הפלטים מסומנים', () => {
  const s = fixture()
  assert.deepEqual(R.checkStale(s, 120, REF), [])
  const hit = R.checkStale(s, 120, '2027-06-01T00:00:00Z')
  assert.equal(hit[0].stale, true)
  assert.ok(hit[0].days > 120)
})
