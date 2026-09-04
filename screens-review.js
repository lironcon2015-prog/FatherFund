/* ===========================================================================
   screens-review.js — מסכים 5, 7, 8, 9 והאחסון.
   =========================================================================== */

/* ===================== מסך 5 — בקרה תלת-שנתית ===================== */

let _reviewStep = 1

function renderReview() {
  const el = document.getElementById('reviewBody')
  if (!FUND.assets.length) { el.innerHTML = emptyHTML('אין נכסים בתיק.', 'עדכון תיק', "navigate('portfolio')"); return }
  const w = reviewWindow(FUND)
  const offSchedule = !w.inWindow
  el.innerHTML = `
    ${staleBannerHTML()}
    ${offSchedule ? `<div class="banner banner-warn">${uiIcon('alert', 18)}<div>
      <strong>מחוץ למועד</strong>
      <div>הבקרה הבאה ב-${dmy(w.next)}${w.daysAway != null ? `, בעוד ${w.daysAway} ימים` : ''}.
      המסך זמין, אבל כל פעולה שתתקבל כאן תסומן כפעולה מחוץ למועד ותוצג בבקרה הבאה (R2).</div></div></div>`
      : `<div class="banner banner-ok">${uiIcon('check', 18)}<div><strong>במועד</strong>
        <div>${w.overdue ? 'הבקרה עברה את מועדה — ' : ''}מועד הבקרה: ${dmy(w.next)}.</div></div></div>`}
    <div class="steps">${[1, 2, 3, 4, 5].map(n =>
      `<button class="step ${_reviewStep === n ? 'active' : ''} ${_reviewStep > n ? 'done' : ''}" onclick="gotoReviewStep(${n})">${n}</button>`).join('')}</div>
    <div id="reviewStep"></div>`
  renderReviewStep()
}

function gotoReviewStep(n) { _reviewStep = n; renderReview() }

function renderReviewStep() {
  const box = document.getElementById('reviewStep')
  const A = FUND.assumptions, C = FUND.config
  const cov = coverage(FUND.assets, A, C)

  if (_reviewStep === 1) {
    box.innerHTML = `<div class="card">
      <div class="card-title">שלב 1 — יחס הכיסוי</div>
      <div class="bento-hero-amount">${ratio(cov.coverageRatio)} ${bandChipHTML(cov.band)}</div>
      <div class="kv"><span>שווי שוק</span><strong>${ils(cov.marketValue)}</strong></div>
      <div class="kv"><span>נדרש לכיסוי (ברוטו)</span><strong>${ils(cov.requiredGross)}</strong></div>
      <div class="kv"><span>נדרש לכיסוי (נטו)</span><strong>${ils(cov.requiredNet)}</strong></div>
      <div class="kv"><span>פער</span><strong class="${cov.gap >= 0 ? 'pos' : 'neg'}">${ils(cov.gap)}</strong></div>
      <div class="kv"><span>גיל · אופק</span><strong>${cov.age} · ${A.horizonAge}</strong></div>
      <div class="sheet-actions"><button class="btn-primary" onclick="gotoReviewStep(2)">הבא</button></div>
    </div>`
    return
  }

  if (_reviewStep === 2) {
    const prev = [...FUND.reviews].sort((a, b) => a.date < b.date ? -1 : 1).slice(-1)[0]
    box.innerHTML = `<div class="card">
      <div class="card-title">שלב 2 — ההחלטה בבקרה הקודמת</div>
      ${prev ? `
        <div class="kv"><span>תאריך</span><strong>${dmy(prev.date)}</strong></div>
        <div class="kv"><span>יחס כיסוי אז</span><strong>${ratio(prev.coverageRatio)} ${bandChipHTML(prev.band)}</strong></div>
        <div class="kv"><span>הפעולה</span><strong>${escHtml(prev.actionTaken || 'ללא פעולה')}</strong></div>
        <div class="quote">${escHtml(prev.rationale || '')}</div>`
        : '<p class="muted">זו הבקרה הראשונה. אין החלטה קודמת להציג.</p>'}
      <div class="sheet-actions"><button class="btn-ghost" onclick="gotoReviewStep(1)">הקודם</button>
        <button class="btn-primary" onclick="gotoReviewStep(3)">הבא</button></div>
    </div>`
    return
  }

  if (_reviewStep === 3) {
    const since = (FUND.reviews.slice(-1)[0] || {}).date || '1900-01-01'
    const offs = FUND.journal.filter(j => j.at.slice(0, 10) > since && j.meta && (j.meta.offPlan || j.meta.offSchedule))
    box.innerHTML = `<div class="card">
      <div class="card-title">שלב 3 — פעולות מחוץ למועד מאז הבקרה הקודמת</div>
      <p class="muted">זו הסיבה שהחיכוך קיים. נימוק שנכתב לפני שלוש שנים נקרא אחרת היום.</p>
      ${offs.length ? `<div class="tbl-wrap"><table class="data-table">
        <thead><tr><th>תאריך</th><th>פעולה</th><th>הנימוק שנכתב אז</th></tr></thead>
        <tbody>${offs.map(o => `<tr><td>${dmy(o.at)}</td><td>${escHtml(o.text)}</td>
          <td class="quote-cell">${escHtml((o.meta && o.meta.rationale) || '—')}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="muted">לא בוצעו פעולות מחוץ למועד. זו התוצאה שהכללים נועדו לייצר.</p>'}
      <div class="sheet-actions"><button class="btn-ghost" onclick="gotoReviewStep(2)">הקודם</button>
        <button class="btn-primary" onclick="gotoReviewStep(4)">הבא</button></div>
    </div>`
    return
  }

  if (_reviewStep === 4) {
    box.innerHTML = `<div class="card">
      <div class="card-title">שלב 4 — המנופים, עם המספרים</div>
      <p class="muted">המערכת לא ממליצה. היא מחשבת מה כל מנוף עושה ליחס הכיסוי, ומציגה את הפער.</p>
      ${leversHTML(cov)}
      <div class="sheet-actions"><button class="btn-ghost" onclick="gotoReviewStep(3)">הקודם</button>
        <button class="btn-primary" onclick="gotoReviewStep(5)">הבא</button></div>
    </div>`
    return
  }

  // שלב 5
  box.innerHTML = `<div class="card">
    <div class="card-title">שלב 5 — הפעולה והנימוק</div>
    <label class="fld"><span>הפעולה שנבחרה</span>
      <select id="revAction">
        <option value="">ללא פעולה — התוכנית נמשכת כפי שהיא</option>
        <option value="pension-down">הורדת קצבה</option>
        <option value="pension-up">העלאת קצבה</option>
        <option value="bullet">שינוי המשיכה החריגה</option>
        <option value="mix">שינוי תמהיל</option>
        <option value="employment">הפעלת מודל ההעסקה</option>
        <option value="assumptions">עדכון הנחות</option>
        <option value="other">אחר</option>
      </select></label>
    <label class="fld"><span>נימוק (חובה) — זה מה שייקרא בבקרה הבאה</span>
      <textarea id="revRationale" rows="5" placeholder="מה הוחלט, ולמה דווקא עכשיו"></textarea></label>
    <div class="muted" id="revHint">לפחות 20 תווים.</div>
    <div class="sheet-actions">
      <button class="btn-ghost" onclick="gotoReviewStep(4)">הקודם</button>
      <button class="btn-primary" onclick="commitReview()">סגור בקרה והפק דוח B</button>
    </div>
  </div>`
}

/**
 * המנופים הרלוונטיים לרצועה, עם המספר המחושב לכל אחד.
 * הקצבה שמביאה ליחס 1.00 נפתרת אנליטית ולא בחיפוש: requiredGross = MV.
 */
function leversHTML(cov) {
  const A = FUND.assumptions, C = FUND.config
  const t = cov.totals
  const v = 1 / (1 + A.discountRate)
  const n = cov.years
  const annuityFactor = n > 0 ? (1 - Math.pow(v, n)) / (1 - v) : 0
  const affordableNet = t.marketValue * (1 - A.taxRate * t.gainFraction)
  const affordableAnnual = annuityFactor > 0 ? affordableNet / annuityFactor : 0
  const pensionAt1 = (affordableAnnual - C.bulletAmount) / 12
  const pensionNoBullet = affordableAnnual / 12

  const rows = []
  rows.push({
    name: 'הורדת קצבה', num: ils(Math.max(0, pensionAt1)) + ' לחודש',
    note: `הקצבה שמביאה את יחס הכיסוי ל-1.00 בדיוק, עם המשיכה החריגה כפי שהיא. הקצבה כיום ${ils(C.pensionFromFund)}.`,
    show: true,
  })
  rows.push({
    name: 'ביטול המשיכה החריגה', num: ils(Math.max(0, pensionNoBullet)) + ' לחודש',
    note: `הקצבה שהתיק נושא אם ${ils(C.bulletAmount)} השנתיים יורדים מהתוכנית.`,
    show: true,
  })
  const inc = checkPensionIncrease(FUND, C.pensionFromFund + 1, cov.age)
  rows.push({
    name: 'העלאת קצבה',
    num: inc.length ? 'חסום' : ils(Math.max(0, pensionAt1)) + ' לחודש',
    note: inc.length ? inc[0].message : 'מותר מגיל 78 ומעלה. המספר הוא התקרה ביחס כיסוי 1.00.',
    /* מוצג גם כשהוא חסום. R4 חוסם **ומסביר** — מנוף שנעלם מהטבלה נקרא כאילו
       איש לא שקל אותו, ושלוש שנים אחר כך הוא נשאל שוב מאפס. */
    show: true, blocked: !!inc.length,
  })
  const drift = mixDrift(FUND.assets, C)
  rows.push({
    name: 'תיקון תמהיל',
    num: drift.filter(d => d.fixable).length ? drift.filter(d => d.fixable).map(d => ils(d.gapAmount)).join(' · ') : 'אין',
    note: drift.map(d => `${d.label}: ${pct(d.share)} מול יעד ${pct(d.target)} — ${d.action}`).join(' | '),
    show: true,
  })
  if (cov.band === 'red') {
    rows.push({
      name: 'מודל ההעסקה (רזרבה)', num: 'לא פעיל',
      note: 'ברצועה האדומה המודול הזה מוצג לצד הורדת קצבה כשתי חלופות שקולות. מסך האקטואריה מחשב את הערך שלו.',
      show: true,
    })
  }
  return `<div class="tbl-wrap"><table class="data-table">
    <thead><tr><th>מנוף</th><th>המספר</th><th>מה זה אומר</th></tr></thead>
    <tbody>${rows.filter(r => r.show).map(r => `<tr class="${r.blocked ? 'row-blocked' : ''}">
      <td><strong>${escHtml(r.name)}</strong></td><td>${escHtml(r.num)}</td>
      <td class="muted">${escHtml(r.note)}</td></tr>`).join('')}</tbody></table></div>`
}

async function commitReview() {
  if (!assertWritable()) return
  const action = document.getElementById('revAction').value
  const rationale = document.getElementById('revRationale').value.trim()
  if (rationale.length < 20) {
    const h = document.getElementById('revHint')
    h.classList.add('err'); h.textContent = 'נדרש נימוק של לפחות 20 תווים. הבקרה כולה בנויה סביבו.'
    return
  }
  const w = reviewWindow(FUND)
  const cov = coverage(FUND.assets, FUND.assumptions, FUND.config)
  const rec = {
    id: fundId('rev'), date: todayISO(), age: cov.age,
    marketValue: round2(cov.marketValue), requiredGross: round2(cov.requiredGross),
    coverageRatio: cov.coverageRatio, band: cov.band,
    actionTaken: action || 'ללא פעולה', rationale,
    offSchedule: !w.inWindow,
    assumptionsSnapshot: structuredCloneSafe(FUND.assumptions),
    configSnapshot: structuredCloneSafe(FUND.config),
  }
  FUND.reviews.push(rec)
  journal('review', `בקרה — יחס ${ratio(cov.coverageRatio)} · ${rec.actionTaken}`,
    { rationale, offSchedule: rec.offSchedule })
  await saveFund('בקרה')
  _reviewStep = 1
  await buildReportB(rec)
  toast('הבקרה נסגרה ודוח B הופק. מומלץ לבצע ייצוא ידני מלא (S6).', { type: 'success', duration: 8000,
    action: { label: 'ייצוא', onClick: () => exportFundZip() } })
  navigate('status')
}

/* ===================== מסך 7 — החלטות ודגלים ===================== */

function renderDecisions() {
  const el = document.getElementById('decisionsBody')
  const open = FUND.decisions.filter(d => d.status === 'open')
  const closed = FUND.decisions.filter(d => d.status === 'closed')
  const flags = FUND.flags
  const FLAG_DOMAIN = { tax: 'מס', social_security: 'ביטוח לאומי', legal: 'משפטי', model: 'מודל' }

  el.innerHTML = `
    <div class="card">
      <div class="card-title"><span>החלטות פתוחות</span>
        <button class="btn-ghost" onclick="editDecision(null)">${uiIcon('plus', 15)} החלטה</button></div>
      ${open.length ? open.map(d => `<div class="list-row">
          <div><strong>${escHtml(d.title)}</strong>
            <div class="muted">${escHtml(d.rationale || '')}</div></div>
          <button class="btn-ghost" onclick="closeDecision('${d.id}')">סגור</button>
        </div>`).join('') : '<p class="muted">אין החלטות פתוחות.</p>'}
    </div>

    <div class="card">
      <div class="card-title">החלטות סגורות</div>
      <p class="muted">לקריאה. פתיחה מחדש דורשת נימוק ונרשמת ביומן.</p>
      ${closed.length ? closed.map(d => `<div class="list-row">
          <div><strong>${escHtml(d.title)}</strong>
            <div class="muted">נסגרה ${dmy(d.closedAt)}</div>
            <div class="quote">${escHtml(d.rationale || '')}</div></div>
          <button class="btn-ghost" onclick="reopenDecision('${d.id}')">פתח מחדש</button>
        </div>`).join('') : '<p class="muted">אין.</p>'}
    </div>

    <div class="card">
      <div class="card-title"><span>דגלים לבדיקה</span>
        <button class="btn-ghost" onclick="editFlag()">${uiIcon('plus', 15)} דגל</button></div>
      <p class="muted">האפליקציה לא מנתחת ביטוח לאומי ולא מחשבת מס לצורכי דיווח. דגלים בלבד.</p>
      ${flags.length ? `<div class="tbl-wrap"><table class="data-table">
        <thead><tr><th>תחום</th><th>הדגל</th><th>סטטוס</th><th></th></tr></thead>
        <tbody>${flags.map(f => `<tr>
          <td><span class="chip chip-muted">${escHtml(FLAG_DOMAIN[f.domain] || f.domain)}</span></td>
          <td>${escHtml(f.text)}</td>
          <td>${f.status === 'closed' ? 'טופל' : 'פתוח'}</td>
          <td><button class="btn-icon" onclick="toggleFlag('${f.id}')">${uiIcon(f.status === 'closed' ? 'refresh' : 'check', 15)}</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="muted">אין דגלים.</p>'}
    </div>`
}

function editDecision() {
  UK_sheet({
    title: 'החלטה חדשה',
    content: `<label class="fld"><span>כותרת</span><input id="decTitle"></label>
      <label class="fld"><span>רקע</span><textarea id="decNote" rows="3"></textarea></label>`,
    actions: [{ label: 'שמור', primary: true, onClick: async () => {
        if (!assertWritable()) return
        const title = document.getElementById('decTitle').value.trim()
        if (!title) { toast('נדרשת כותרת.', { type: 'error' }); return true }
        FUND.decisions.push({ id: fundId('dec'), title, status: 'open', closedAt: null,
          rationale: document.getElementById('decNote').value.trim(), openedAt: nowISO() })
        journal('decision', 'החלטה נפתחה: ' + title)
        await saveFund(); renderDecisions()
      } }, { label: 'בטל' }],
  })
}

async function closeDecision(id) {
  const d = FUND.decisions.find(x => x.id === id)
  const r = await requireRationale({ title: 'סגירת החלטה: ' + d.title, minLength: 10, confirmText: 'סגור' })
  if (r === null) return
  d.status = 'closed'; d.closedAt = todayISO(); d.rationale = r
  journal('decision', 'החלטה נסגרה: ' + d.title, { rationale: r })
  await saveFund('סגירת החלטה'); renderDecisions()
}

async function reopenDecision(id) {
  const d = FUND.decisions.find(x => x.id === id)
  const r = await requireRationale({ title: 'פתיחה מחדש: ' + d.title, minLength: 10, confirmText: 'פתח מחדש',
    warnings: [{ rule: '', severity: 'medium', message: 'החלטה סגורה נפתחת מחדש. הפתיחה והנימוק נרשמים ביומן ויוצגו בבקרה הבאה.' }] })
  if (r === null) return
  d.status = 'open'; d.closedAt = null
  journal('decision', 'החלטה נפתחה מחדש: ' + d.title, { rationale: r, offSchedule: true })
  await saveFund('פתיחת החלטה'); renderDecisions()
}

function editFlag() {
  UK_sheet({
    title: 'דגל חדש',
    content: `<label class="fld"><span>תחום</span><select id="flagDomain">
        <option value="tax">מס</option><option value="social_security">ביטוח לאומי</option>
        <option value="legal">משפטי</option><option value="model">מודל</option></select></label>
      <label class="fld"><span>הדגל</span><textarea id="flagText" rows="3"></textarea></label>`,
    actions: [{ label: 'שמור', primary: true, onClick: async () => {
        if (!assertWritable()) return
        const text = document.getElementById('flagText').value.trim()
        if (!text) { toast('נדרש טקסט.', { type: 'error' }); return true }
        FUND.flags.push({ id: fundId('flg'), text, domain: document.getElementById('flagDomain').value, status: 'open', at: nowISO() })
        journal('flag', 'דגל: ' + text)
        await saveFund(); renderDecisions()
      } }, { label: 'בטל' }],
  })
}

async function toggleFlag(id) {
  const f = FUND.flags.find(x => x.id === id)
  f.status = f.status === 'closed' ? 'open' : 'closed'
  await saveFund(); renderDecisions()
}

/* ===================== מסך 8 — הנחות ===================== */
/* R6 — כל שינוי כאן מריץ מחדש את כל הנגזרות. אין סף שכתוב בקוד. */

const ASSUMPTION_FIELDS = [
  { path: 'assumptions.inflation',                  label: 'אינפלציה',                     kind: 'pct' },
  { path: 'assumptions.realGrossEquity.pess',       label: 'תשואה ריאלית ברוטו — פסימי',   kind: 'pct' },
  { path: 'assumptions.realGrossEquity.base',       label: 'תשואה ריאלית ברוטו — בסיס',    kind: 'pct' },
  { path: 'assumptions.realGrossEquity.opt',        label: 'תשואה ריאלית ברוטו — אופטימי', kind: 'pct' },
  { path: 'assumptions.fees',                       label: 'דמי ניהול',                    kind: 'pct' },
  { path: 'assumptions.realGrossCash',              label: 'תשואה ריאלית — רובד נזילות',   kind: 'pct' },
  { path: 'assumptions.sdEquity',                   label: 'סטיית תקן מנייתי',             kind: 'pct' },
  { path: 'assumptions.taxRate',                    label: 'שיעור מס רווח הון',            kind: 'pct' },
  { path: 'assumptions.discountRate',               label: 'שיעור היוון ההתחייבות',        kind: 'pct' },
  { path: 'assumptions.horizonAge',                 label: 'גיל האופק',                    kind: 'int' },
  { path: 'assumptions.fatherBirthYear',            label: 'שנת לידה',                     kind: 'int' },
  { path: 'config.pensionFromFund',                 label: 'קצבה מהקרן (ריאלי)',           kind: 'money' },
  { path: 'config.pensionFromBrothers',             label: 'קצבה מהאחים (נומינלי)',        kind: 'money' },
  { path: 'config.bulletAmount',                    label: 'משיכה חריגה',                  kind: 'money' },
  { path: 'config.bulletMonth',                     label: 'חודש המשיכה החריגה',           kind: 'int' },
  { path: 'config.rungTarget',                      label: 'יעד רובד הנזילות',             kind: 'money' },
  { path: 'config.israelTargetShareOfEquity',       label: 'יעד ישראל מתוך המנייתי',       kind: 'pct' },
  { path: 'config.reviewIntervalYears',             label: 'מרווח הבקרה (שנים)',           kind: 'int' },
]

function getPath(obj, path) { return path.split('.').reduce((o, k) => o && o[k], obj) }
function setPath(obj, path, val) {
  const parts = path.split('.'), last = parts.pop()
  parts.reduce((o, k) => o[k], obj)[last] = val
}
function fmtAssumption(v, kind) {
  if (kind === 'pct') return (v * 100).toFixed(2) + '%'
  if (kind === 'money') return ils(v)
  return String(v)
}

function renderAssumptions() {
  const el = document.getElementById('assumptionsBody')
  const cov = FUND.assets.length ? coverage(FUND.assets, FUND.assumptions, FUND.config) : null
  el.innerHTML = `
    ${cov ? `<div class="banner banner-ok">${uiIcon('gauge', 18)}<div>
      יחס הכיסוי הנוכחי <strong>${ratio(cov.coverageRatio)}</strong> ${BAND_LABEL[cov.band] || ''}.
      כל שינוי כאן מריץ אותו מחדש — הספים אינם כתובים בקוד (R6).</div></div>` : ''}
    <div class="card">
      <div class="card-title">פרמטרים</div>
      <div class="tbl-wrap"><table class="data-table">
        <thead><tr><th>פרמטר</th><th>ערך</th><th></th></tr></thead>
        <tbody>${ASSUMPTION_FIELDS.map(f => `<tr>
          <td>${escHtml(f.label)}</td>
          <td><strong>${escHtml(fmtAssumption(getPath(FUND, f.path), f.kind))}</strong></td>
          <td><button class="btn-ghost" onclick="editAssumption('${f.path}')">שנה</button></td>
        </tr>`).join('')}</tbody></table></div>
    </div>
    <div class="card">
      <div class="card-title">היסטוריית שינויים</div>
      ${FUND.assumptionsHistory.length ? `<div class="tbl-wrap"><table class="data-table">
        <thead><tr><th>מתי</th><th>מה</th><th>מ־</th><th>ל־</th><th>נימוק</th></tr></thead>
        <tbody>${[...FUND.assumptionsHistory].reverse().map(h => `<tr>
          <td>${dtLabel(h.at)}</td><td>${escHtml(h.label)}</td>
          <td>${escHtml(String(h.from))}</td><td>${escHtml(String(h.to))}</td>
          <td class="quote-cell">${escHtml(h.rationale)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">אין שינויים.</p>'}
    </div>`
}

function editAssumption(path) {
  const f = ASSUMPTION_FIELDS.find(x => x.path === path)
  const cur = getPath(FUND, path)
  const asInput = f.kind === 'pct' ? (cur * 100) : cur
  UK_sheet({
    title: f.label,
    content: `
      <label class="fld"><span>ערך חדש${f.kind === 'pct' ? ' (באחוזים)' : ''}</span>
        <input id="asmVal" type="number" step="${f.kind === 'pct' ? '0.01' : '1'}" value="${asInput}"></label>
      <label class="fld"><span>נימוק (חובה)</span><textarea id="asmWhy" rows="3"></textarea></label>
      <div class="muted">השינוי מריץ מחדש את יחס הכיסוי, המסלול החציוני, מונטה קרלו והרצועות.</div>`,
    actions: [
      { label: 'שמור', primary: true, onClick: async () => {
          if (!assertWritable()) return
          const raw = num(document.getElementById('asmVal').value)
          const why = document.getElementById('asmWhy').value.trim()
          if (why.length < 8) { toast('נדרש נימוק.', { type: 'error' }); return true }
          const val = f.kind === 'pct' ? raw / 100 : (f.kind === 'int' ? Math.round(raw) : round2(raw))

          // R4 — העלאת קצבה נבדקת כאן, לא רק במסך הבקרה.
          if (path === 'config.pensionFromFund') {
            const hits = checkPensionIncrease(FUND, val, currentAge(FUND.assumptions))
            if (hits.length) { toast(hits[0].message, { type: 'error', duration: 9000 }); return true }
          }
          FUND.assumptionsHistory.push({ at: nowISO(), field: path, label: f.label, from: cur, to: val, rationale: why })
          setPath(FUND, path, val)
          journal('assumption', `${f.label}: ${cur} → ${val}`, { rationale: why })
          await saveFund('שינוי הנחה')
          renderAssumptions()
        } },
      { label: 'בטל' },
    ],
  })
}

/* ===================== מסך 9 — יומן ===================== */

function renderJournal() {
  const el = document.getElementById('journalBody')
  el.innerHTML = `
    <div class="card">
      <div class="card-title"><span>יומן</span>
        <button class="btn-ghost" onclick="exportJournalCsv()">${uiIcon('download', 15)} ייצוא CSV</button></div>
      <input id="journalSearch" class="search" placeholder="חיפוש" oninput="filterJournal()">
      <div class="tbl-wrap"><table class="data-table">
        <thead><tr><th>תאריך</th><th>סוג</th><th>מה</th><th>פירוט</th></tr></thead>
        <tbody id="journalRows"></tbody>
      </table></div>
      <p class="muted" id="journalCount"></p>
    </div>`
  filterJournal()
}

/* ההקלדה לא עוברת ב-renderJournal(): רינדור מלא היה מחליף את ה-input באמצע
   הקלדה והסמן היה קופץ להתחלה. נכתבות רק השורות והמונה. */
function filterJournal() {
  const q = ((document.getElementById('journalSearch') || {}).value || '').trim().toLowerCase()
  const rows = collectJournalRows()
  const filtered = q ? rows.filter(r => (r.what + ' ' + r.detail).toLowerCase().includes(q)) : rows
  document.getElementById('journalRows').innerHTML = filtered.slice(0, 500).map(r => `<tr>
      <td>${dtLabel(r.at)}</td>
      <td><span class="chip chip-muted">${escHtml(r.kind)}</span></td>
      <td>${escHtml(r.what)}</td>
      <td class="muted quote-cell">${escHtml(r.detail)}</td></tr>`).join('')
  document.getElementById('journalCount').textContent = filtered.length > 500
    ? `מוצגות 500 מתוך ${filtered.length}. השתמש בייצוא לרשימה המלאה.`
    : `${filtered.length} רשומות.`
}

const JOURNAL_KIND = {
  snapshot: 'תיק', withdraw: 'משיכה', payment: 'תשלום', review: 'בקרה',
  assumption: 'הנחה', decision: 'החלטה', flag: 'דגל', asset: 'נכס',
  refill: 'מילוי רובד', sync: 'אחסון', report: 'דוח', zero: 'נקודת אפס',
}

function collectJournalRows() {
  const rows = []
  FUND.journal.forEach(j => rows.push({
    at: j.at, kind: JOURNAL_KIND[j.kind] || j.kind, what: j.text,
    detail: (j.meta && j.meta.rationale) || '',
  }))
  FUND.snapshots.forEach(s => rows.push({
    at: s.date, kind: 'Snapshot', what: `${s.source === 'correction' ? 'תיקון' : 'עדכון'} · ${ils((s.assets || []).reduce((x, a) => x + a.marketValue, 0))}`,
    detail: s.note || '',
  }))
  FUND.transactions.forEach(t => rows.push({
    at: t.date, kind: 'תנועה', what: `${t.type} · ברוטו ${ils(t.grossAmount)} · מס ${ils(t.taxAccrued)}`,
    detail: t.note || '',
  }))
  FUND.payments.forEach(p => rows.push({
    at: p.date, kind: 'תשלום', what: `${ils(p.amount)} · ${p.source === 'fund' ? 'מהקרן' : 'מהאחים'}`, detail: p.note || '',
  }))
  FUND.reviews.forEach(r => rows.push({
    at: r.date, kind: 'בקרה', what: `יחס ${ratio(r.coverageRatio)} · ${r.actionTaken}`, detail: r.rationale || '',
  }))
  return rows.sort((a, b) => a.at < b.at ? 1 : -1)
}

function exportJournalCsv() {
  const rows = collectJournalRows()
  const esc = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'
  const csv = '﻿' + ['תאריך,סוג,מה,פירוט']
    .concat(rows.map(r => [r.at, r.kind, r.what, r.detail].map(esc).join(',')))
    .join('\n')
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `יומן-${todayISO()}.csv`)
}

/* ===================== אחסון ===================== */

function renderStorage() {
  const el = document.getElementById('storageBody')
  el.innerHTML = `
    <div class="card">
      <div class="card-title">שכבת האחסון</div>
      <p class="muted">Apps Script Web App שרץ בחשבון שלך. אין OAuth ואין מסך התחברות —
      הסקריפט הוא זה שנוגע ב-Drive. הוראות הפריסה ב-<code>apps-script/README.md</code>.</p>
      <label class="fld"><span>כתובת ה-Web App</span>
        <input id="drvUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${escAttr(FundDrive.url())}"></label>
      <label class="fld"><span>טוקן</span>
        <input id="drvToken" type="password" value="${escAttr(FundDrive.token())}"></label>
      <div class="sheet-actions">
        <button class="btn-primary" onclick="saveDriveConfig()">שמור ובדוק חיבור</button>
        <button class="btn-ghost" onclick="listDriveFiles()">הצג קבצים</button>
      </div>
      <div id="drvStatus" class="muted"></div>
      <div class="banner banner-warn">${uiIcon('lock', 18)}<div>
        מי שמחזיק את הכתובת ואת הטוקן קורא וכותב. אין כאן זהות משתמש — זו ההחלטה
        שהתקבלה כדי להימנע ממסך התחברות. אל תפרסם את הכתובת.</div></div>
    </div>

    <div class="card">
      <div class="card-title">נקודת פתיחה מקובץ</div>
      <p class="muted">קובץ JSON פשוט שמכיל את מה שכבר ידוע — נכסים, בסיס עלות, הנחות,
      תשלומים, החלטות ודגלים. נטען פעם אחת במקום הזנה ידנית, ויוצר את ה-snapshot הראשון.
      ההנחיה להכנת הקובץ נמצאת ב-<code>docs/הנחיה-ליועץ.md</code>.</p>
      <div class="sheet-actions">
        <button class="btn-primary" onclick="importFundSeed()">${uiIcon('download', 15)} טען נקודת פתיחה</button>
        <button class="btn-ghost" onclick="downloadSeedTemplate()">הורד תבנית ריקה</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">ייצוא ושחזור מלא</div>
      <p class="muted">S6 — ZIP של המצב וכל ה-snapshots. זמין תמיד, ומומלץ בסוף כל בקרה.
      ה-JSON קריא גם אם האפליקציה הזו תפסיק לעבוד בעוד שמונה שנים.</p>
      <div class="sheet-actions">
        <button class="btn-primary" onclick="exportFundZip()">${uiIcon('download', 15)} ייצא ZIP</button>
        <button class="btn-ghost" onclick="importFundJson()">שחזר מ-fund-state.json</button>
      </div>
      <p class="muted">השחזור מצפה למצב מלא שיצא מהאפליקציה. לקובץ שהוכן ביד או
      במודל — השתמש ב"נקודת פתיחה" למעלה.</p>
    </div>

    <div class="card">
      <div class="card-title">נקודת אפס</div>
      <p class="muted">§10.3 — כשסכום הירושה יתברר, כל הספים משתנים. קיבוע נקודת אפס
      חדשה מסמן את המעבר ביומן <strong>בלי למחוק היסטוריה</strong>: ה-snapshots והתנועות
      נשארים, ומועד הבקרה נספר מחדש מהתאריך הזה.</p>
      ${FUND.zeroPoints.length ? `<div class="tbl-wrap"><table class="data-table">
        <thead><tr><th>תאריך</th><th>שווי אז</th><th>נימוק</th></tr></thead>
        <tbody>${FUND.zeroPoints.map(z => `<tr><td>${dmy(z.date)}</td><td>${ils(z.marketValue)}</td>
          <td class="quote-cell">${escHtml(z.rationale)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="sheet-actions"><button class="btn-ghost" onclick="addZeroPoint()">קבע נקודת אפס חדשה</button></div>
    </div>

    <div class="card">
      <div class="card-title">קבצים בדרייב</div>
      <div id="drvFiles" class="muted">לחץ "הצג קבצים".</div>
    </div>`
}

async function saveDriveConfig() {
  FundDrive.setConfig(document.getElementById('drvUrl').value, document.getElementById('drvToken').value)
  const st = document.getElementById('drvStatus')
  st.textContent = 'בודק…'
  try {
    await FundDrive.ping()
    st.textContent = 'החיבור תקין.'
    st.className = 'pos'
    const r = await loadFund()
    toast(r.source === 'drive' ? 'המצב נטען מהדרייב.' : 'מחובר.', { type: 'success' })
    renderStorage()
  } catch (e) {
    st.textContent = e.message
    st.className = 'neg'
  }
}

async function listDriveFiles() {
  const box = document.getElementById('drvFiles')
  box.textContent = 'טוען…'
  try {
    const [root, snaps, reps] = await Promise.all([
      FundDrive.listFiles(''), FundDrive.listFiles('snapshots'), FundDrive.listFiles('reports'),
    ])
    const sec = (title, r) => `<div class="month-block"><div class="month-head"><strong>${title}</strong>
      <span class="muted">${r.files.length}</span></div>
      ${r.files.length ? `<table class="data-table"><tbody>${r.files.slice(0, 60).map(f =>
        `<tr><td>${escHtml(f.name)}</td><td class="muted">${dtLabel(f.modified)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">ריק.</p>'}</div>`
    box.innerHTML = sec('קרן-הקצבה', root) + sec('snapshots', snaps) + sec('reports', reps)
  } catch (e) {
    box.textContent = e.message
  }
}

/* ===== נקודת פתיחה =====
   מסלול נפרד מהשחזור בכוונה. שחזור מקבל מצב מלא שהאפליקציה עצמה כתבה;
   נקודת פתיחה מקבלת קובץ שאדם או מודל הרכיבו, ולכן היא בודקת אותו לעומק
   ומציגה את מה שנמצא **לפני** שהוא נוגע במשהו. */
function importFundSeed() {
  const inp = document.createElement('input')
  inp.type = 'file'; inp.accept = '.json,application/json'
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return
    let raw
    try { raw = JSON.parse(await f.text()) }
    catch (e) { toast('הקובץ אינו JSON תקין: ' + e.message, { type: 'error', duration: 8000 }); return }
    showSeedPreview(parseFundSeed(raw), f.name)
  }
  inp.click()
}

function showSeedPreview(parsed, filename) {
  const s = parsed.summary
  const list = (items, cls) => items.length
    ? `<ul class="seed-list ${cls}">${items.map(x => `<li>${escHtml(x)}</li>`).join('')}</ul>` : ''

  const body = parsed.ok ? `
    <div class="banner banner-ok">${uiIcon('check', 18)}<div>
      <strong>הקובץ תקין.</strong>
      <div>${escHtml(filename)}${s.generatedAt ? ` · נוצר ${escHtml(s.generatedAt)}` : ''}</div></div></div>
    ${s.note ? `<div class="quote">${escHtml(s.note)}</div>` : ''}
    <table class="data-table"><tbody>
      <tr><td>נכסים</td><td><strong>${s.assets}</strong></td></tr>
      <tr><td>שווי שוק</td><td><strong>${ils(s.marketValue)}</strong></td></tr>
      <tr><td>בסיס עלות</td><td><strong>${ils(s.costBasis)}</strong></td></tr>
      <tr><td>רווח צבור</td><td><strong>${ils(s.marketValue - s.costBasis)}</strong></td></tr>
      <tr><td>הנחות שהוזנו</td><td>${s.assumptions} (השאר — ברירת מחדל)</td></tr>
      <tr><td>פרמטרי תצורה</td><td>${s.config} (השאר — ברירת מחדל)</td></tr>
      <tr><td>תשלומים · החלטות · דגלים</td><td>${s.payments} · ${s.decisions} · ${s.flags}</td></tr>
      <tr><td>נקודת אפס · לוח תמותה</td><td>${s.zeroPoint ? 'כן' : 'לא'} · ${s.mortality ? 'כן' : 'לא'}</td></tr>
    </tbody></table>` : `
    <div class="banner banner-err">${uiIcon('alert', 18)}<div>
      <strong>הקובץ נדחה. לא בוצע שינוי.</strong>
      <div>${parsed.errors.length} בעיות. שלח את הרשימה בחזרה למי שהכין את הקובץ.</div></div></div>
    ${list(parsed.errors, 'seed-err')}`

  const warn = parsed.warnings.length
    ? `<div class="banner banner-warn">${uiIcon('alert', 18)}<div><strong>שים לב</strong>
         <div>מה שלא נקלט מוצג כאן במפורש, ולא נבלע בשקט.</div></div></div>${list(parsed.warnings, 'seed-warn')}`
    : ''

  const hasState = FUND.assets.length || FUND.snapshots.length
  UK_sheet({
    title: 'נקודת פתיחה',
    width: 'min(660px,95vw)',
    content: body + warn + (parsed.ok && hasState ? `
      <div class="banner banner-err">${uiIcon('alert', 18)}<div>
        <strong>כבר קיימים נתונים.</strong>
        <div>בקרן יש ${FUND.assets.length} נכסים ו-${FUND.snapshots.length} snapshots.
        טעינת נקודת פתיחה מחליפה אותם. ה-snapshots שכבר נכתבו לדרייב אינם נמחקים —
        הם append-only — אבל המצב החי יוחלף.</div></div></div>` : ''),
    actions: parsed.ok
      ? [{ label: hasState ? 'החלף את המצב הקיים' : 'טען', primary: !hasState,
           className: hasState ? 'btn-danger' : 'btn-primary',
           onClick: () => commitSeed(parsed) },
         { label: 'בטל' }]
      : [{ label: 'העתק את השגיאות', onClick: () => {
            navigator.clipboard.writeText(parsed.errors.join('\n')).then(
              () => toast('הועתק.', { type: 'success' }),
              () => toast('ההעתקה נכשלה.', { type: 'error' }))
            return true
          } },
         { label: 'סגור' }],
  })
}

async function commitSeed(parsed) {
  if (!assertWritable()) return
  FUND = applyFundSeed(parsed)
  journal('sync', `נקודת פתיחה נטענה — ${parsed.summary.assets} נכסים · ${ils(parsed.summary.marketValue)}`,
    { rationale: parsed.summary.note || null })
  const r = await saveFund('נקודת פתיחה')
  if (r.ok && FundDrive.configured()) {
    const snap = FUND.snapshots[0]
    try { await FundDrive.putSnapshot(`${snap.date}.json`, snap) } catch (e) {
      toast('ה-snapshot הנפרד לא נכתב: ' + e.message, { type: 'error', duration: 8000 })
    }
  }
  toast('נקודת הפתיחה נטענה.', { type: 'success' })
  navigate('status')
}

function downloadSeedTemplate() {
  const tpl = {
    schema: SEED_SCHEMA,
    generatedAt: todayISO(),
    note: 'תיאור קצר של מקור הנתונים ותאריך התוקף שלהם.',
    assets: [
      { name: 'רובד נזילות', class: 'cash', region: 'n/a', marketValue: 0, costBasis: 0 },
      { name: 'מנייתי גלובלי', class: 'equity', region: 'global', marketValue: 0, costBasis: 0, isLegacy: false },
    ],
    assumptions: { taxRate: 0.25, discountRate: 0.0345, horizonAge: 95, fatherBirthYear: 1957 },
    config: { pensionFromFund: 1300, pensionFromBrothers: 1000, bulletAmount: 10000, bulletMonth: 6, rungTarget: 25600 },
    payments: [], decisions: [], flags: [],
  }
  downloadBlob(new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' }), 'fund-seed-template.json')
}

function importFundJson() {
  const inp = document.createElement('input')
  inp.type = 'file'; inp.accept = '.json'
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return
    let data
    try { data = JSON.parse(await f.text()) } catch { toast('הקובץ אינו JSON תקין.', { type: 'error' }); return }
    if (!validateFundState(data)) { toast('הקובץ אינו מצב קרן תקין. לא בוצע ייבוא.', { type: 'error' }); return }
    if (!await confirmDialog('ייבוא מצב\nהמצב הנוכחי יוחלף. ה-snapshots שבדרייב לא נמחקים.', { danger: true, confirmText: 'ייבא' })) return
    FUND = migrateFundState(data)
    journal('sync', 'ייבוא מצב מקובץ')
    await saveFund('ייבוא מצב')
    renderCurrent()
  }
  inp.click()
}

async function addZeroPoint() {
  const r = await requireRationale({
    title: 'קיבוע נקודת אפס',
    minLength: 15, confirmText: 'קבע',
    warnings: [{ rule: '', severity: 'medium', message: 'ההיסטוריה נשמרת במלואה. מה שמשתנה: מועד הבקרה נספר מהתאריך הזה, וכל הספים מחושבים מחדש מול התיק הנוכחי.' }],
  })
  if (r === null) return
  const t = portfolioTotals(FUND.assets, FUND.assumptions.taxRate)
  FUND.zeroPoints.push({ date: todayISO(), marketValue: round2(t.marketValue), costBasis: round2(t.costBasis), rationale: r })
  journal('zero', `נקודת אפס חדשה — ${ils(t.marketValue)}`, { rationale: r })
  await saveFund('נקודת אפס')
  renderStorage()
}
