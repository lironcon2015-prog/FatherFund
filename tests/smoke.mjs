/* smoke דפדפני: טוען את האפליקציה, מזריע מצב, ועובר על כל המסכים.
   דורש playwright-core ושרת מקומי:  python3 -m http.server 8000  */
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:8000'
const exe = ['/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
  .find(p => fs.existsSync(p))

const browser = await chromium.launch(exe ? { executablePath: exe } : {})
const page = await browser.newPage()
const errors = []
/* שגיאות טעינה של משאבים חיצוניים (Google Fonts, favicon) אינן כשל של
   האפליקציה — smoke שנכשל תמיד הוא smoke שאיש לא מריץ. סופרים רק שגיאות
   ריצה ומשאבים מאותו origin. */
page.on('console', m => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/Failed to load resource/.test(t)) return
  errors.push('console: ' + t)
})
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('response', r => {
  if (r.status() < 400) return
  const u = new URL(r.url())
  if (u.origin !== new URL(BASE).origin) return
  if (/favicon/.test(u.pathname)) return
  errors.push(`${r.status()} ${u.pathname}`)
})

await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' })

// מצב בדיקה — אותו תיק של טסטי היחידה.
await page.evaluate(async () => {
  FUND = fundEmptyState()
  FUND.assets = [
    makeAsset({ id: 'cash1', name: 'רובד נזילות', class: 'cash', region: 'n/a', marketValue: 25600, costBasis: 25600 }),
    makeAsset({ id: 'glob', name: 'מנייתי גלובלי', class: 'equity', region: 'global', marketValue: 336000, costBasis: 252000 }),
    makeAsset({ id: 'isr', name: 'מנייתי ישראל', class: 'equity', region: 'israel', marketValue: 95400, costBasis: 76000 }),
  ]
  FUND.meta.lastPortfolioUpdate = new Date().toISOString()
  FUND.snapshots = [
    { date: '2025-12-31', source: 'manual', note: '', assets: [{ assetId: 'glob', marketValue: 300000, costBasis: 252000 }] },
    { date: '2026-06-30', source: 'manual', note: '', assets: [{ assetId: 'glob', marketValue: 336000, costBasis: 252000 }] },
  ]
  FUND.payments = [{ id: 'p1', date: new Date().toISOString().slice(0, 10), amount: 1300, source: 'fund', note: '' }]
  FUND.decisions = [{ id: 'd1', title: 'הרשאות חירום', status: 'open', rationale: 'מי מקבל גישה' }]
  FUND.flags = [{ id: 'f1', text: 'מבחני הכנסה', domain: 'social_security', status: 'open' }]
})

const screens = ['status', 'portfolio', 'withdraw', 'payments', 'review', 'actuary', 'decisions', 'assumptions', 'journal', 'storage']
for (const s of screens) {
  await page.evaluate(n => navigate(n), s)
  await page.waitForTimeout(120)
  const txt = await page.locator('#screen-' + s).innerText()
  if (!txt.trim()) errors.push(`מסך ${s} ריק`)
  process.stdout.write(`  ${s} ✓\n`)
}

// אשף הבקרה — כל חמשת השלבים
await page.evaluate(() => navigate('review'))
for (let i = 1; i <= 5; i++) {
  await page.evaluate(n => gotoReviewStep(n), i)
  await page.waitForTimeout(80)
}
process.stdout.write('  אשף הבקרה ✓\n')

// מונטה קרלו דרך ה-Worker
await page.evaluate(() => { navigate('actuary'); runMonteCarlo() })
await page.waitForFunction(() => document.querySelector('#mcOut') && /%/.test(document.querySelector('#mcOut').innerText), null, { timeout: 30000 })
process.stdout.write('  מונטה קרלו ✓\n')

// תצוגת משיכה
await page.evaluate(() => { navigate('withdraw'); setWithdraw(11300) })
await page.waitForTimeout(150)
const wd = await page.locator('#wdPreview').innerText()
if (!/רובד נזילות/.test(wd)) errors.push('סדר המשיכה לא הציג את רובד הנזילות ראשון')
process.stdout.write('  משיכה ✓\n')

// נקודת פתיחה: קובץ תקין, קובץ שגוי, והטעינה בפועל
const seedOk = {
  schema: 'fund-seed/1', generatedAt: '2026-09-05', note: 'בדיקה',
  assets: [
    { name: 'רובד נזילות', class: 'cash', region: 'n/a', marketValue: 25600, costBasis: 25600 },
    { name: 'מנייתי גלובלי', class: 'equity', region: 'global', marketValue: 336000, costBasis: 252000 },
  ],
  assumptions: { taxRate: 0.25 },
  config: { pensionFromFund: 1300 },
  decisions: [{ title: 'הרשאות חירום', status: 'open', rationale: 'מי מקבל גישה' }],
}
await page.evaluate(o => { navigate('storage'); showSeedPreview(parseFundSeed(o), 'seed.json') }, seedOk)
await page.waitForTimeout(150)
const okSheet = await page.locator('.modal-box').innerText()
if (!/הקובץ תקין/.test(okSheet)) errors.push('תצוגה מקדימה של קובץ תקין לא הופיעה')
await page.evaluate(() => document.querySelector('.modal-close').click())

const seedBad = JSON.parse(JSON.stringify(seedOk))
seedBad.assumptions.taxRate = 25
await page.evaluate(o => showSeedPreview(parseFundSeed(o), 'bad.json'), seedBad)
await page.waitForTimeout(150)
const badSheet = await page.locator('.modal-box').innerText()
if (!/נדחה/.test(badSheet) || !/0\.25/.test(badSheet)) errors.push('קובץ עם שיעור באחוזים לא נדחה כראוי')
await page.evaluate(() => document.querySelector('.modal-close').click())

await page.evaluate(o => commitSeed(parseFundSeed(o)), seedOk)
await page.waitForTimeout(400)
const after = await page.evaluate(() => ({ assets: FUND.assets.length, snaps: FUND.snapshots.length, zero: FUND.zeroPoints.length, tax: FUND.assumptions.taxRate }))
if (after.assets !== 2 || after.snaps !== 1 || after.zero !== 1 || after.tax !== 0.25) {
  errors.push('טעינת נקודת פתיחה לא יצרה מצב תקין: ' + JSON.stringify(after))
}
const statusTxt = await page.locator('#screen-status').innerText()
if (!/יחס כיסוי/.test(statusTxt)) errors.push('מסך המצב לא התרנדר אחרי הטעינה')
process.stdout.write('  נקודת פתיחה ✓\n')

await browser.close()
if (errors.length) { console.error('\nכשלים:\n' + errors.join('\n')); process.exit(1) }
console.log('\nsmoke עבר.')
