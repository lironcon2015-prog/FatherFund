import { test } from 'node:test'
import assert from 'node:assert/strict'
import { M, E } from './helpers.mjs'

const MIN = () => ({
  schema: 'fund-seed/1',
  assets: [
    { name: 'רובד נזילות', class: 'cash', region: 'n/a', marketValue: 25600, costBasis: 25600 },
    { name: 'מנייתי גלובלי', class: 'equity', region: 'global', marketValue: 336000, costBasis: 252000 },
  ],
})

test('קובץ מינימלי תקין — נכסים בלבד', () => {
  const r = M.parseFundSeed(MIN())
  assert.equal(r.ok, true, r.errors.join(' | '))
  assert.equal(r.summary.assets, 2)
  assert.equal(r.summary.marketValue, 361600)
})

test('בלי נכסים הקובץ נדחה', () => {
  const r = M.parseFundSeed({ schema: 'fund-seed/1' })
  assert.equal(r.ok, false)
  assert.match(r.errors.join(' '), /חסרה רשימת נכסים/)
})

/* זו הבדיקה שכל השאר קיים בשבילה. 25 במקום 0.25 עובר כל בדיקת טיפוס,
   מייצר יחס כיסוי שנראה סביר, ומתגלה בעוד שנתיים. */
test('שיעור שנכתב באחוזים במקום כשבר נדחה, עם ההצעה הנכונה', () => {
  const raw = MIN(); raw.assumptions = { taxRate: 25 }
  const r = M.parseFundSeed(raw)
  assert.equal(r.ok, false)
  assert.match(r.errors[0], /0\.25/)
})

test('הבדיקה חלה גם על תשואות מקוננות', () => {
  const raw = MIN(); raw.assumptions = { realGrossEquity: { base: 5.5 } }
  assert.equal(M.parseFundSeed(raw).ok, false)
  raw.assumptions = { realGrossEquity: { base: 0.055 } }
  assert.equal(M.parseFundSeed(raw).ok, true)
})

test('שדה שאינו שיעור לא נבדק בטווח', () => {
  const raw = MIN(); raw.config = { pensionFromFund: 1300, rungTarget: 25600 }
  raw.assumptions = { horizonAge: 95, fatherBirthYear: 1957 }
  assert.equal(M.parseFundSeed(raw).ok, true)
})

test('מפתח לא מוכר מדווח כאזהרה ולא נבלע בשקט', () => {
  const raw = MIN()
  raw.assumptions = { taxRate: 0.25, expectedAlpha: 0.02 }
  raw.somethingElse = 1
  const r = M.parseFundSeed(raw)
  assert.equal(r.ok, true)
  assert.match(r.warnings.join(' '), /expectedAlpha/)
  assert.match(r.warnings.join(' '), /somethingElse/)
})

test('class שגוי נדחה עם הערך שהתקבל', () => {
  const raw = MIN(); raw.assets[1].class = 'stocks'
  const r = M.parseFundSeed(raw)
  assert.equal(r.ok, false)
  assert.match(r.errors.join(' '), /stocks/)
})

test('נכס בהפסד נקלט, עם אזהרה', () => {
  const raw = MIN(); raw.assets[1].costBasis = 400000
  const r = M.parseFundSeed(raw)
  assert.equal(r.ok, true)
  assert.match(r.warnings.join(' '), /בהפסד/)
})

test('תשלומים — תאריך, סכום ומקור נאכפים', () => {
  const raw = MIN()
  raw.payments = [{ date: '2026-08-01', amount: 1300, source: 'fund' }]
  assert.equal(M.parseFundSeed(raw).ok, true)
  raw.payments = [{ date: '01/08/2026', amount: 1300, source: 'fund' }]
  assert.equal(M.parseFundSeed(raw).ok, false)
  raw.payments = [{ date: '2026-08-01', amount: 1300, source: 'bank' }]
  assert.equal(M.parseFundSeed(raw).ok, false)
})

test('החלטה סגורה בלי נימוק נדחית', () => {
  const raw = MIN()
  raw.decisions = [{ title: 'הרשאות חירום', status: 'closed' }]
  assert.equal(M.parseFundSeed(raw).ok, false)
  raw.decisions = [{ title: 'הרשאות חירום', status: 'closed', rationale: 'הוסדר מול עו״ד', closedAt: '2026-03-01' }]
  assert.equal(M.parseFundSeed(raw).ok, true)
})

test('לוח תמותה בלי מקור נדחה, ו-qx באחוזים נדחה', () => {
  const raw = MIN()
  raw.mortality = { startAge: 69, qx: [0.012, 0.013] }
  assert.equal(M.parseFundSeed(raw).ok, false)
  raw.mortality = { source: 'למ״ס 2024', startAge: 69, qx: [1.2, 1.3] }
  assert.equal(M.parseFundSeed(raw).ok, false)
  raw.mortality = { source: 'למ״ס 2024', startAge: 69, qx: [0.012, 0.013] }
  assert.equal(M.parseFundSeed(raw).ok, true)
})

test('נקודת אפס בלי נימוק נדחית', () => {
  const raw = MIN()
  raw.zeroPoint = { date: '2026-09-01' }
  assert.equal(M.parseFundSeed(raw).ok, false)
  raw.zeroPoint = { date: '2026-09-01', rationale: 'סכום הירושה התברר' }
  assert.equal(M.parseFundSeed(raw).ok, true)
})

/* ===== applyFundSeed ===== */
test('הייבוא יוצר snapshot ראשון ונקודת אפס', () => {
  const r = M.parseFundSeed(MIN())
  const st = M.applyFundSeed(r, { date: '2026-09-05' })
  assert.equal(st.snapshots.length, 1)
  assert.equal(st.snapshots[0].date, '2026-09-05')
  assert.equal(st.snapshots[0].assets.length, 2)
  assert.equal(st.zeroPoints.length, 1)
  assert.ok(st.meta.lastPortfolioUpdate)
  assert.equal(M.validateFundState(st), true)
})

test('הנחות חלקיות ממוזגות מעל ברירות המחדל', () => {
  const raw = MIN()
  raw.assumptions = { taxRate: 0.30, realGrossEquity: { base: 0.045 } }
  const st = M.applyFundSeed(M.parseFundSeed(raw))
  assert.equal(st.assumptions.taxRate, 0.30)
  assert.equal(st.assumptions.realGrossEquity.base, 0.045)
  // מה שלא הוזן נשאר ברירת מחדל, ולא נמחק
  assert.equal(st.assumptions.realGrossEquity.pess, M.DEFAULT_ASSUMPTIONS.realGrossEquity.pess)
  assert.equal(st.assumptions.discountRate, M.DEFAULT_ASSUMPTIONS.discountRate)
})

test('המצב שנוצר מזין את המנוע ומפיק יחס כיסוי', () => {
  const raw = MIN()
  raw.assets.push({ name: 'מנייתי ישראל', class: 'equity', region: 'israel', marketValue: 95400, costBasis: 76000 })
  const st = M.applyFundSeed(M.parseFundSeed(raw))
  const cov = E.coverage(st.assets, st.assumptions, st.config, '2026-09-04T00:00:00Z')
  assert.equal(cov.age, 69)
  assert.ok(cov.coverageRatio > 0.9 && cov.coverageRatio < 1.1)
  assert.equal(cov.band, 'yellow')
})

/* הדוגמה שבהנחיה ליועץ היא החוזה בפועל. אם הפרסר יזוז והמסמך לא — היועץ
   יפיק קובץ שנדחה, והכשל יתגלה רק מול המשתמש. */
test('הדוגמה שבמסמך ההנחיה עוברת את הפרסר נקי', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const url = await import('node:url')
  const root = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)))
  const doc = fs.readFileSync(path.join(root, 'docs', 'הנחיה-ליועץ.md'), 'utf8')
  const m = doc.match(/## דוגמה מלאה\n\n```json\n([\s\S]*?)\n```/)
  assert.ok(m, 'לא נמצא בלוק הדוגמה במסמך')
  const raw = JSON.parse(m[1])
  const r = M.parseFundSeed(raw)
  assert.equal(r.errors.length, 0, r.errors.join(' | '))
  assert.equal(r.warnings.length, 0, r.warnings.join(' | '))
  const st = M.applyFundSeed(r)
  assert.equal(M.validateFundState(st), true)
  const cov = E.coverage(st.assets, st.assumptions, st.config, '2026-09-05T00:00:00Z')
  assert.ok(cov.coverageRatio > 0 && Number.isFinite(cov.coverageRatio))
})

/* כל שדה שברירת המחדל שלו מצוטטת בטבלאות חייב להתאים לקוד. טבלה שמצטטת
   ערך שכבר לא נכון גורמת ליועץ למסור נתון שגוי בביטחון מלא. */
test('ברירות המחדל שבמסמך זהות לאלה שבקוד', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const url = await import('node:url')
  const root = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)))
  const doc = fs.readFileSync(path.join(root, 'docs', 'הנחיה-ליועץ.md'), 'utf8')
  const A = M.DEFAULT_ASSUMPTIONS, C = M.DEFAULT_CONFIG
  const pairs = [
    ['inflation', A.inflation], ['fees', A.fees], ['realGrossCash', A.realGrossCash],
    ['sdEquity', A.sdEquity], ['taxRate', A.taxRate], ['discountRate', A.discountRate],
    ['horizonAge', A.horizonAge], ['fatherBirthYear', A.fatherBirthYear],
    ['pensionFromFund', C.pensionFromFund], ['pensionFromBrothers', C.pensionFromBrothers],
    ['bulletAmount', C.bulletAmount], ['bulletMonth', C.bulletMonth],
    ['rungTarget', C.rungTarget], ['israelTargetShareOfEquity', C.israelTargetShareOfEquity],
    ['reviewIntervalYears', C.reviewIntervalYears],
  ]
  for (const [field, val] of pairs) {
    const row = doc.split('\n').find(l => l.includes('`' + field + '`') && l.startsWith('|'))
    assert.ok(row, `השדה ${field} אינו מופיע בטבלה במסמך`)
    assert.ok(row.includes('`' + val + '`'), `${field}: המסמך אינו מצטט את ברירת המחדל ${val} — ${row}`)
  }
  // המסמך כותב 0.030 לצורך יישור; JS מרנדר 0.03. משווים כמספרים.
  const eq = A.realGrossEquity
  const eqRow = doc.split('\n').find(l => l.includes('`realGrossEquity`') && l.startsWith('|'))
  assert.ok(eqRow, 'realGrossEquity אינו מופיע בטבלה')
  const nums = (eqRow.match(/0\.\d+/g) || []).map(Number)
  assert.deepEqual(nums, [eq.pess, eq.base, eq.opt],
    'ברירות המחדל של realGrossEquity אינן תואמות למסמך')
})
