/* ===========================================================================
   reports.js — דוחות A–E (§5).

   הפורמט הוא HTML: הוא נשמר בדרייב כקובץ קריא שגם בעוד 26 שנה ייפתח בכל
   דפדפן, ואותו קובץ מודפס ל-PDF בלחיצה אחת. PDF שנוצר בקוד היה דורש ספריית
   צד-שלישי שתקפא בגרסה שלה, ולא היה ניתן לתיקון כשמשהו בו יוצא שבור.
   =========================================================================== */

const REPORT_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Heebo, Arial, sans-serif; direction: rtl; color: #111; background: #fff; font-size: 11pt; line-height: 1.55; }
  h1 { font-size: 19pt; margin: 0 0 .2em; }
  h2 { font-size: 13pt; margin: 1.4em 0 .4em; border-bottom: 1px solid #ddd; padding-bottom: .2em; }
  .sub { color: #555; margin: 0 0 1.4em; }
  table { width: 100%; border-collapse: collapse; margin: .6em 0 1em; font-size: 10pt; }
  th, td { border: 1px solid #ccd; padding: .38em .5em; text-align: right; }
  th { background: #eef2f7; font-weight: 700; }
  tfoot th { background: #e6ecf5; }
  .band { display: inline-block; padding: .12em .7em; border-radius: 999px; font-weight: 700; font-size: 10pt; }
  .band-green { background: #d8f5e6; color: #05603a; }
  .band-yellow { background: #fdf1d6; color: #7a4c05; }
  .band-red { background: #fde2e6; color: #8c1027; }
  .callout { border-inline-start: 4px solid #334; background: #f4f6fa; padding: .7em .9em; margin: 1em 0; }
  .quote { border-inline-start: 3px solid #bbb; padding: .2em .8em; color: #333; margin: .4em 0; }
  .muted { color: #666; }
  /* כותרת מקטע לא נשארת בתחתית עמוד — צמד הכללים, כי כל אחד לבד לא מספיק ב-Chrome. */
  .block { break-inside: auto; }
  .block h2 { break-after: avoid; }
  .block h2 + * { break-before: avoid; }
  thead { display: table-header-group; }
`

function reportShell(title, subtitle, bodyHtml) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>${escHtml(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;800&display=swap">
<style>${REPORT_CSS}</style></head><body>
<h1>${escHtml(title)}</h1><p class="sub">${escHtml(subtitle)}</p>
${bodyHtml}
</body></html>`
}

function bandSpan(band) {
  if (!band) return '<span class="band">מעבר לגיל האופק</span>'
  return `<span class="band band-${band}">${BAND_LABEL[band]}</span>`
}

/** מציג את הדוח, שומר אותו בדרייב, ומאפשר הדפסה או הורדה. */
async function deliverReport(filename, title, html, folder) {
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
  let saved = ''
  if (FundDrive.configured()) {
    try {
      await FundDrive.putFile(folder == null ? 'reports' : folder, filename, html, 'text/html')
      saved = 'נשמר בדרייב.'
    } catch (e) { saved = 'לא נשמר בדרייב: ' + e.message }
  }
  journal('report', 'הופק ' + filename)
  await saveFund()
  toast('הדוח הופק. ' + saved, { type: 'success', duration: 7000,
    action: { label: 'הורד', onClick: () => downloadBlob(new Blob([html], { type: 'text/html' }), filename) } })
}

/* ===================== Report A — רבעוני לאחים ===================== */
/* קהל: שלושה אחים שאינם עוסקים בשוק ההון. המסגור הוא הפיצ'ר.
   אסור כאן: תשואה רבעונית, אחוז מהשיא, גרף תנודתי, שמות ניירות, וכל ניסוח
   שמזמין דיון על השוק. אל תוסיף אותם "כי זה מעניין" — זה בדיוק מה שהדוח
   נועד למנוע. */
async function buildReportA() {
  const A = FUND.assumptions, C = FUND.config
  const cov = coverage(FUND.assets, A, C)
  const q = quarterOf(todayISO())
  const from = quarterStart(q), to = todayISO()
  const pays = FUND.payments.filter(p => p.date >= from && p.date <= to)
  const fund = pays.filter(p => p.source === 'fund').reduce((s, p) => s + p.amount, 0)
  const bros = pays.filter(p => p.source !== 'fund').reduce((s, p) => s + p.amount, 0)
  const acts = FUND.journal.filter(j => j.at.slice(0, 10) >= from && ['withdraw', 'refill', 'review'].includes(j.kind))
  const w = reviewWindow(FUND)

  const html = reportShell(
    `קרן הקצבה — דוח רבעוני`,
    `${q.label} · נכון ל-${dmy(to)}`,
    `
    <div class="block"><h2>המצב במשפט אחד</h2>
      <div class="callout">
        <p>הקרן מכסה כיום <strong>${ratio(cov.coverageRatio)}</strong> מהסכום הנדרש כדי לשלם
        את הקצבה עד גיל ${A.horizonAge}. הרצועה: ${bandSpan(cov.band)}.</p>
        <p class="muted">${coverageSentence(cov)}</p>
      </div>
    </div>

    <div class="block"><h2>שווי מול הנדרש</h2>
      <table>
        <tr><th>שווי הקרן היום</th><td>${ils(cov.marketValue)}</td></tr>
        <tr><th>הסכום הנדרש לכיסוי מלא</th><td>${ils(cov.requiredGross)}</td></tr>
        <tr><th>הפרש</th><td>${ils(cov.gap)}</td></tr>
      </table>
      <p class="muted">ההשוואה היא מול הנדרש לכיסוי — לא מול הרבעון הקודם ולא מול שיא.</p>
    </div>

    <div class="block"><h2>תשלומים לאב ברבעון</h2>
      <table>
        <thead><tr><th>מקור</th><th>סכום</th></tr></thead>
        <tbody>
          <tr><td>מהקרן</td><td>${ils(fund)}</td></tr>
          <tr><td>ישירות מהאחים</td><td>${ils(bros)}</td></tr>
        </tbody>
        <tfoot><tr><th>סה"כ</th><th>${ils(fund + bros)}</th></tr></tfoot>
      </table>
    </div>

    <div class="block"><h2>פעולות</h2>
      ${acts.length
        ? `<ul>${acts.map(a => `<li>${escHtml(dmy(a.at))} — ${escHtml(a.text)}</li>`).join('')}</ul>`
        : '<p>לא נדרשה פעולה.</p>'}
    </div>

    <div class="block"><h2>המועד הבא לבקרה</h2>
      <p>${dmy(w.next)}${w.daysAway != null && w.daysAway > 0 ? ` — בעוד ${w.daysAway} ימים.` : '.'}</p>
      <div class="callout"><strong>החלטות מתקבלות רק בבקרה התלת-שנתית.
      ירידה או עלייה בשוק אינן מחייבות פעולה.</strong></div>
    </div>`)

  await deliverReport(`${q.key}-אחים.html`, 'דוח רבעוני', html)
}

function coverageSentence(cov) {
  if (cov.band === 'green') return 'הקרן מכסה את מלוא ההתחייבות לפי ההנחות הנוכחיות. לא נדרשת פעולה.'
  if (cov.band === 'yellow') return 'הכיסוי חלקי. הפער נבחן בבקרה התלת-שנתית ולא בתגובה לתנועות שוק.'
  if (cov.band === 'red') return 'הכיסוי מתחת לסף. הבקרה הקרובה תבחן את המנופים הזמינים.'
  return 'מעבר לגיל האופק שהוגדר — היחס אינו מוגדר.'
}

function quarterOf(iso) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7)
  const q = Math.floor((m - 1) / 3) + 1
  return { y, q, key: `${y}-Q${q}`, label: `רבעון ${q} ${y}` }
}
function quarterStart(q) { return `${q.y}-${String((q.q - 1) * 3 + 1).padStart(2, '0')}-01` }

/* ===================== Report B — בקרה תלת-שנתית ===================== */
async function buildReportB(review) {
  const A = FUND.assumptions, C = FUND.config
  const cov = coverage(FUND.assets, A, C)
  const path = medianPath(FUND, { untilAge: 100 })
  const drift = mixDrift(FUND.assets, C)
  const mc = _mcResult

  const html = reportShell('קרן הקצבה — דוח בקרה תלת-שנתית', `נכון ל-${dmy(review.date)} · גיל ${review.age}`, `
    <div class="block"><h2>יחס כיסוי</h2>
      <table>
        <tr><th>יחס כיסוי</th><td>${ratio(cov.coverageRatio)} ${bandSpan(cov.band)}</td></tr>
        <tr><th>שווי שוק</th><td>${ils(cov.marketValue)}</td></tr>
        <tr><th>נדרש לכיסוי — נטו</th><td>${ils(cov.requiredNet)}</td></tr>
        <tr><th>נדרש לכיסוי — ברוטו</th><td>${ils(cov.requiredGross)}</td></tr>
        <tr><th>שיעור רווח בתיק</th><td>${pct(cov.totals.gainFraction)}</td></tr>
        <tr><th>חבות מס גלומה</th><td>${ils(cov.totals.deferredTax)}</td></tr>
      </table>
    </div>

    <div class="block"><h2>מסלול חציוני</h2>
      <p class="muted">דטרמיניסטי, תשואה קבועה. מחמיא למניות — להערכת סיכון ראו מונטה קרלו.</p>
      <table><thead><tr><th>גיל</th><th>שווי שוק</th><th>בסיס</th><th>חבות מס גלומה</th><th>יחס כיסוי</th></tr></thead>
        <tbody>${path.rows.filter((_, i) => i % 5 === 0).map(r => `<tr><td>${r.age}</td>
          <td>${ils(r.marketValue)}</td><td>${ils(r.costBasis)}</td><td>${ils(r.deferredTax)}</td>
          <td>${ratio(r.coverageRatio)}</td></tr>`).join('')}</tbody></table>
      ${path.depletionAge ? `<p><strong>התיק מתדלדל בגיל ${path.depletionAge.toFixed(1)}</strong> בתרחיש הבסיס.</p>` : ''}
    </div>

    <div class="block"><h2>מונטה קרלו</h2>
      ${mc ? `<table>
        <tr><th>הסתברות הידלדלות עד גיל ${A.horizonAge}</th><td>${pct(mc.pDepletionByHorizon)}</td></tr>
        <tr><th>הסתברות הידלדלות בחיי האב</th><td>${mc.pDepletionInLifetime === null ? 'לא זמין — לוח תמותה לא הוזן' : pct(mc.pDepletionInLifetime)}</td></tr>
        <tr><th>ירידה מקסימלית — חציון</th><td>${pct(mc.drawdown.median)}</td></tr>
        <tr><th>ירידה מקסימלית — אחוזון 5</th><td>${pct(mc.drawdown.worst5)}</td></tr>
      </table>
      <p class="muted">ההנחה של תשואות בלתי-תלויות מפולגות נורמלית מזלזלת בתקופות שחיקה
      ריאלית ארוכות. הסתברות הכשל היא הערכת חסר.</p>`
      : '<p class="muted">לא הורץ בבקרה הזו. מסך האקטואריה מריץ אותו.</p>'}
    </div>

    <div class="block"><h2>סטייה מהתמהיל</h2>
      <table><thead><tr><th>מדד</th><th>בפועל</th><th>יעד</th><th>הפעולה</th></tr></thead>
        <tbody>${drift.map(d => `<tr><td>${escHtml(d.label)}</td><td>${pct(d.share)}</td>
          <td>${pct(d.target)}</td><td>${escHtml(d.action)}</td></tr>`).join('')}</tbody></table>
      <p class="muted">התיקון מוצג תמיד כרכישה. אין rebalance במכירת אחזקות עם שיעור רווח מעל 30% (R3).</p>
    </div>

    <div class="block"><h2>ההחלטה</h2>
      <table><tr><th>הפעולה</th><td>${escHtml(review.actionTaken)}</td></tr>
        <tr><th>במועד</th><td>${review.offSchedule ? 'לא — הפעולה בוצעה מחוץ למועד' : 'כן'}</td></tr></table>
      <div class="quote">${escHtml(review.rationale)}</div>
    </div>

    <div class="block"><h2>ההנחות בעת ההחלטה</h2>
      <table><tbody>${ASSUMPTION_FIELDS.map(f => `<tr><td>${escHtml(f.label)}</td>
        <td>${escHtml(fmtAssumption(getPath({ assumptions: review.assumptionsSnapshot, config: review.configSnapshot }, f.path), f.kind))}</td></tr>`).join('')}
      </tbody></table>
    </div>`)

  await deliverReport(`${review.date}-בקרה.html`, 'דוח בקרה', html)
}

/* ===================== Report C — שנתי, בסיס עלות ומס ===================== */
async function buildReportC(year) {
  const y = year || new Date().getFullYear()
  const txs = FUND.transactions.filter(t => t.date.slice(0, 4) === String(y))
  const gain = txs.reduce((s, t) => s + (t.realizedGain || 0), 0)
  const tax = txs.reduce((s, t) => s + (t.taxAccrued || 0), 0)
  const gross = txs.reduce((s, t) => s + (t.grossAmount || 0), 0)
  const nameOf = id => (FUND.assets.find(a => a.id === id) || {}).name || id

  const html = reportShell(`קרן הקצבה — דוח בסיס עלות ומס ${y}`, `לצורכי דיווח ובקרה פנימית`, `
    <div class="callout">אומדן פנימי בלבד. האפליקציה אינה מחשבת מס לצורכי דיווח לרשות המסים.</div>

    <div class="block"><h2>סיכום השנה</h2>
      <table>
        <tr><th>ברוטו שנמכר</th><td>${ils(gross)}</td></tr>
        <tr><th>רווח ממומש</th><td>${ils(gain)}</td></tr>
        <tr><th>מס שנצבר (${pct(FUND.assumptions.taxRate, 0)})</th><td>${ils(tax)}</td></tr>
      </table>
    </div>

    <div class="block"><h2>תנועות</h2>
      ${txs.length ? `<table><thead><tr><th>תאריך</th><th>נכס</th><th>סוג</th><th>ברוטו</th><th>בסיס שנצרך</th><th>רווח ממומש</th><th>מס</th></tr></thead>
        <tbody>${txs.map(t => `<tr><td>${dmy(t.date)}</td><td>${escHtml(nameOf(t.assetId))}</td>
          <td>${escHtml(t.type)}</td><td>${ils(t.grossAmount)}</td><td>${ils(t.basisConsumed)}</td>
          <td>${ils(t.realizedGain)}</td><td>${ils(t.taxAccrued)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th colspan="3">סה"כ</th><th>${ils(gross)}</th><th></th><th>${ils(gain)}</th><th>${ils(tax)}</th></tr></tfoot>
        </table>` : '<p>לא בוצעו תנועות בשנה זו.</p>'}
    </div>

    <div class="block"><h2>בסיס עלות פר נכס בסוף השנה</h2>
      <table><thead><tr><th>נכס</th><th>שווי שוק</th><th>בסיס עלות</th><th>שיעור רווח</th><th>חבות מס גלומה</th></tr></thead>
        <tbody>${FUND.assets.map(a => `<tr><td>${escHtml(a.name)}</td><td>${ils(a.marketValue)}</td>
          <td>${ils(a.costBasis)}</td><td>${pct(gainFraction(a))}</td>
          <td>${ils(deferredTax(a, FUND.assumptions.taxRate))}</td></tr>`).join('')}</tbody></table>
    </div>`)

  await deliverReport(`${y}-בסיס-עלות.html`, 'דוח שנתי', html)
}

/* ===================== Report D — ייצוא לפרויקט ===================== */
/* כיוון האמת: האפליקציה היא מקור האמת למספרים. הקובץ בפרויקט הוא פלט.
   אין סנכרון דו-כיווני — הוא ייצור סתירות. */
async function buildReportD() {
  const A = FUND.assumptions, C = FUND.config
  const cov = coverage(FUND.assets, A, C)
  const path = medianPath(FUND, { untilAge: 100 })
  const drift = mixDrift(FUND.assets, C)
  const t = cov.totals
  const w = reviewWindow(FUND)
  const nameOf = id => (FUND.assets.find(a => a.id === id) || {}).name || id

  const md = `# מצב הקרן
נוצר אוטומטית מהאפליקציה ב-${dmy(todayISO())}. **קובץ פלט — אין לערוך ידנית.**
מקור האמת למספרים הוא האפליקציה; החלטות שנסגרות בשיחה מוזנות שם וחוזרות לכאן.

## נקודת אפס
${FUND.zeroPoints.length
  ? FUND.zeroPoints.map(z => `- ${dmy(z.date)} · ${ils(z.marketValue)} · ${z.rationale}`).join('\n')
  : `- ${dmy((FUND.meta.createdAt || '').slice(0, 10))} · פתיחת הקרן`}

## מצב נוכחי
| מדד | ערך |
|---|---|
| יחס כיסוי | **${ratio(cov.coverageRatio)}** (${BAND_LABEL[cov.band] || 'לא מוגדר'}) |
| שווי שוק | ${ils(t.marketValue)} |
| בסיס עלות | ${ils(t.costBasis)} |
| רווח צבור | ${ils(t.accruedGain)} |
| שיעור רווח בתיק | ${pct(t.gainFraction)} |
| חבות מס גלומה | ${ils(t.deferredTax)} |
| נדרש לכיסוי (ברוטו) | ${ils(cov.requiredGross)} |
| פער | ${ils(cov.gap)} |
| רובד נזילות | ${ils(t.cash)} · ${rungMonthsLeft(FUND.assets, C).toFixed(1)} חודשי משיכה |
| גיל · אופק | ${cov.age} · ${A.horizonAge} |
| עדכון אחרון | ${dmy((FUND.meta.lastPortfolioUpdate || '').slice(0, 10))} |

**כדי לספק ${ils(C.pensionFromFund)} נטו יש למכור ${ils(grossSaleForPlanned())} ברוטו** בשיעור הרווח הנוכחי.

## הנחות
| פרמטר | ערך |
|---|---|
${ASSUMPTION_FIELDS.map(f => `| ${f.label} | ${fmtAssumption(getPath(FUND, f.path), f.kind)} |`).join('\n')}

## תמהיל
| מדד | בפועל | יעד | פעולה |
|---|---|---|---|
${drift.map(d => `| ${d.label} | ${pct(d.share)} | ${pct(d.target)} | ${d.action} |`).join('\n')}

### נכסים
| נכס | סוג | אזור | שווי שוק | בסיס | שיעור רווח | אחזקה ישנה |
|---|---|---|---|---|---|---|
${FUND.assets.map(a => `| ${a.name} | ${a.class === 'cash' ? 'נזילות' : 'מנייתי'} | ${a.region} | ${ils(a.marketValue)} | ${ils(a.costBasis)} | ${pct(gainFraction(a))} | ${a.isLegacy ? 'כן' : 'לא'} |`).join('\n')}

## מסלול חציוני
| גיל | שווי שוק | בסיס | רווח צבור | חבות מס גלומה | יחס כיסוי |
|---|---|---|---|---|---|
${path.rows.filter((_, i) => i % 5 === 0).map(r => `| ${r.age} | ${ils(r.marketValue)} | ${ils(r.costBasis)} | ${ils(r.accruedGain)} | ${ils(r.deferredTax)} | ${ratio(r.coverageRatio)} |`).join('\n')}
${path.depletionAge ? `\n**התיק מתדלדל בגיל ${path.depletionAge.toFixed(1)}** בתרחיש הבסיס.\n` : ''}
> המסלול הדטרמיניסטי מניח תשואה קבועה ומחמיא למניות. להערכת סיכון — מונטה קרלו.

## ספי יחס הכיסוי
מחושבים מההנחות הנוכחיות, לא קשיחים (R6).

| רצועה | יחס | שווי שוק שנדרש |
|---|---|---|
| ירוק | ≥ 1.00 | ${ils(cov.requiredGross * 1.00)} |
| צהוב | 0.85–1.00 | ${ils(cov.requiredGross * 0.85)} – ${ils(cov.requiredGross)} |
| אדום | < 0.85 | מתחת ל-${ils(cov.requiredGross * 0.85)} |

## החלטות
### סגורות
${FUND.decisions.filter(d => d.status === 'closed').map(d => `- **${d.title}** (${dmy(d.closedAt)}) — ${d.rationale}`).join('\n') || '- אין'}

### פתוחות
${FUND.decisions.filter(d => d.status === 'open').map(d => `- **${d.title}** — ${d.rationale || ''}`).join('\n') || '- אין'}

## דגלים
${FUND.flags.map(f => `- [${f.status === 'closed' ? 'x' : ' '}] (${f.domain}) ${f.text}`).join('\n') || '- אין'}

## בקרות
| תאריך | גיל | יחס | רצועה | פעולה | נימוק |
|---|---|---|---|---|---|
${FUND.reviews.map(r => `| ${dmy(r.date)} | ${r.age} | ${ratio(r.coverageRatio)} | ${BAND_LABEL[r.band] || ''} | ${r.actionTaken} | ${String(r.rationale || '').replace(/\|/g, '/').replace(/\n/g, ' ')} |`).join('\n') || '| — | | | | | |'}

**הבקרה הבאה:** ${dmy(w.next)}${w.overdue ? ' — באיחור' : ''}

## תנועות
| תאריך | נכס | סוג | ברוטו | בסיס שנצרך | רווח ממומש | מס נצבר |
|---|---|---|---|---|---|---|
${FUND.transactions.slice(-60).map(x => `| ${dmy(x.date)} | ${nameOf(x.assetId)} | ${x.type} | ${ils(x.grossAmount)} | ${ils(x.basisConsumed)} | ${ils(x.realizedGain)} | ${ils(x.taxAccrued)} |`).join('\n') || '| — | | | | | | |'}

## יומן שינויי הנחות
${FUND.assumptionsHistory.slice(-40).map(h => `- ${dmy(h.at)} · ${h.label}: ${h.from} → ${h.to} — ${h.rationale}`).join('\n') || '- אין'}
`

  if (FundDrive.configured()) {
    try { await FundDrive.putFile('', 'מצב-הקרן.md', md, 'text/markdown') }
    catch (e) { toast('לא נשמר בדרייב: ' + e.message, { type: 'error' }) }
  }
  downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), 'מצב-הקרן.md')
  journal('report', 'הופק Report D')
  await saveFund()
  toast('מצב-הקרן.md הופק. זהו הפלט לפרויקט — הכיוון חד-סטרי.', { type: 'success', duration: 7000 })
}

/* ===================== Report E — חבילת חירום ===================== */
/* מיועד למי שאינו לירון. אין כאן יחסי כיסוי ואין אקטואריה: מי שקורא את
   הקובץ הזה צריך לדעת איפה הכסף, מה ההסדר, ומה מותר. */
async function buildReportE() {
  const C = FUND.config, A = FUND.assumptions
  const t = portfolioTotals(FUND.assets, A.taxRate)
  const openDec = FUND.decisions.filter(d => d.status === 'open')

  const html = reportShell('קרן הקצבה — חבילת חירום', `נכון ל-${dmy(todayISO())}. מיועד למקרה שבו לירון אינו זמין.`, `
    <div class="callout">המסמך הזה אינו מסמך משפטי. הוא מתאר את ההסדר כפי שהוא מתנהל בפועל,
    כדי ש"אף אחד לא יודע איפה הכסף ומה הכללים" לא יהיה מצב אפשרי.</div>

    <div class="block"><h2>מה זה</h2>
      <p>קרן שממנה משולמת לאב קצבה חודשית. שני זרמים:</p>
      <table>
        <tr><th>מהקרן</th><td>${ils(C.pensionFromFund)} לחודש (ריאלי — צמוד לרמת המחירים)</td></tr>
        <tr><th>ישירות מהאחים</th><td>${ils(C.pensionFromBrothers)} לחודש (נומינלי)</td></tr>
        <tr><th>משיכה חריגה</th><td>${ils(C.bulletAmount)} פעם בשנה, בחודש ${C.bulletMonth}</td></tr>
      </table>
    </div>

    <div class="block"><h2>איפה הכסף</h2>
      <table><thead><tr><th>נכס</th><th>סוג</th><th>שווי שוק</th></tr></thead>
        <tbody>${FUND.assets.map(a => `<tr><td>${escHtml(a.name)}</td>
          <td>${a.class === 'cash' ? 'רובד נזילות' : 'מנייתי'}</td><td>${ils(a.marketValue)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th colspan="2">סה"כ</th><th>${ils(t.marketValue)}</th></tr></tfoot></table>
      <p class="muted">פרטי החשבון והברוקר אינם נשמרים באפליקציה. הם צריכים להיות רשומים
      בנפרד, ומקומם מצוין בהחלטה הפתוחה שלמטה.</p>
    </div>

    <div class="block"><h2>הכללים — מה מותר ומה לא</h2>
      <table><tbody>${FUND_RULES.map(r => `<tr><th>${r.id}</th><td>${escHtml(r.text)}</td></tr>`).join('')}</tbody></table>
    </div>

    <div class="block"><h2>מה עושים כל חודש</h2>
      <ol>
        <li>מעבירים ${ils(C.pensionFromFund)} לאב מרובד הנזילות. אין צורך למכור מניות בשביל זה.</li>
        <li>${ils(C.pensionFromBrothers)} מגיעים ישירות מהאחים — מקור נפרד, נרשם בנפרד.</li>
        <li>בחודש ${C.bulletMonth} מוסיפים ${ils(C.bulletAmount)}, גם הם מהרובד.</li>
        <li>אחת לרבעון: מעדכנים את שווי התיק באפליקציה ומפיקים דוח לאחים.</li>
        <li>בסוף שנה: אם השנה המנייתית הייתה חיובית — ממלאים את הרובד חזרה
            ל-${ils(C.rungTarget)}. אם שלילית — <strong>לא ממלאים.</strong></li>
      </ol>
    </div>

    <div class="block"><h2>הדבר החשוב ביותר</h2>
      <div class="callout"><strong>ירידה בשוק אינה סיבה למכור.</strong>
      התוכנית בנויה כך שהרובד מכסה כשנה של תשלומים, ולכן אפשר לחכות. החלטות
      מתקבלות בבקרה שמתקיימת אחת ל-${C.reviewIntervalYears} שנים, לא בתגובה לחדשות.</div>
    </div>

    <div class="block"><h2>איפה הנתונים</h2>
      <p>Google Drive, בתיקייה <code>קרן-הקצבה</code>:</p>
      <ul>
        <li><code>fund-state.json</code> — המצב המלא. קובץ טקסט קריא.</li>
        <li><code>snapshots/</code> — היסטוריה שלא נדרסת.</li>
        <li><code>reports/</code> — הדוחות שהופקו.</li>
        <li><code>מצב-הקרן.md</code> — סיכום קריא של המצב.</li>
      </ul>
      <p class="muted">גם אם האפליקציה תפסיק לעבוד, הקבצים האלה נשארים ואפשר לקרוא אותם בכל עורך טקסט.</p>
    </div>

    <div class="block"><h2>החלטות שעדיין פתוחות</h2>
      ${openDec.length ? `<ul>${openDec.map(d => `<li><strong>${escHtml(d.title)}</strong> — ${escHtml(d.rationale || '')}</li>`).join('')}</ul>`
        : '<p class="muted">אין. אם אין כאן החלטה על הרשאות חירום — זו עצמה בעיה שצריך לסגור.</p>'}
    </div>`)

  await deliverReport('חבילת-חירום.html', 'חבילת חירום', html, '')
}
