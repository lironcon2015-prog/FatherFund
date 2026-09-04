/* ===========================================================================
   actuary.js — מסך 6. צפייה בלבד: אין מכאן שום פעולה.
   ההפרדה בין ניתוח לביצוע מכוונת — מסך שמראה תרחיש גרוע ומציע כפתור פעולה
   באותו רגע הוא בדיוק המנגנון שהאפליקציה נועדה למנוע.
   =========================================================================== */

let _mcResult = null
let _mcRunning = false

function renderActuary() {
  const el = document.getElementById('actuaryBody')
  if (!FUND.assets.length) { el.innerHTML = emptyHTML('אין נכסים בתיק.', 'עדכון תיק', "navigate('portfolio')"); return }
  const A = FUND.assumptions
  const path = medianPath(FUND, { untilAge: 100 })

  el.innerHTML = `
    ${staleBannerHTML()}
    <div class="banner banner-warn">${uiIcon('alert', 18)}<div>
      <strong>המסלול הדטרמיניסטי מניח תשואה קבועה ומחמיא למניות.</strong>
      <div>להערכת סיכון — ראו מונטה קרלו למטה.</div></div></div>

    <div class="card">
      <div class="card-title"><span>מסלול חציוני</span>
        <select id="mpScenario" onchange="renderActuary()">
          <option value="pess">פסימי ${pct(netRealEquity(A, 'pess'))}</option>
          <option value="base" selected>בסיס ${pct(netRealEquity(A, 'base'))}</option>
          <option value="opt">אופטימי ${pct(netRealEquity(A, 'opt'))}</option>
        </select></div>
      ${path.depletionAge ? `<div class="banner banner-err">${uiIcon('alert', 18)}<div>
        התיק מתדלדל בגיל ${path.depletionAge.toFixed(1)} בתרחיש הזה.</div></div>` : ''}
      <div class="tbl-wrap"><table class="data-table">
        <thead><tr><th>גיל</th><th>שווי שוק</th><th>בסיס</th><th>רווח צבור</th><th>חבות מס גלומה</th><th>יחס כיסוי</th></tr></thead>
        <tbody>${path.rows.map(r => `<tr>
          <td>${r.age}</td><td>${ils(r.marketValue)}</td><td>${ils(r.costBasis)}</td>
          <td>${ils(r.accruedGain)}</td><td>${ils(r.deferredTax)}</td>
          <td>${ratio(r.coverageRatio)} ${r.band ? bandChipHTML(r.band) : ''}</td></tr>`).join('')}
        </tbody></table></div>
    </div>

    <div class="card">
      <div class="card-title"><span>מונטה קרלו</span>
        <button class="btn-primary" onclick="runMonteCarlo()" ${_mcRunning ? 'disabled' : ''}>
          ${_mcRunning ? 'מריץ…' : 'הרץ 20,000 מסלולים'}</button></div>
      <div id="mcOut">${_mcResult ? mcHTML(_mcResult) : '<p class="muted">טרם הורץ.</p>'}</div>
      <div class="banner banner-warn">${uiIcon('alert', 18)}<div>
        <strong>מגבלות המודל.</strong>
        <div>ההנחה של תשואות בלתי-תלויות מפולגות נורמלית מזלזלת בתקופות שחיקה ריאלית
        ארוכות. הסתברות הכשל שמוצגת כאן היא <strong>הערכת חסר</strong>.</div></div></div>
    </div>

    <div class="card">
      <div class="card-title">ניתוח רגישות</div>
      ${sensitivityHTML()}
    </div>

    <div class="card">
      <div class="card-title">לוח תמותה</div>
      ${FUND.mortality
        ? `<p>נטען: ${escHtml(FUND.mortality.source || 'ללא מקור')} · ${FUND.mortality.qx.length} גילאים מגיל ${FUND.mortality.startAge}.</p>`
        : `<div class="banner banner-warn">${uiIcon('flag', 18)}<div>
            <strong>לא הוזן.</strong>
            <div>"הסתברות הידלדלות בחיי האב" דורשת לוח תמותה מלוחות הלמ"ס. עד שיוזן,
            המספר מוצג כלא זמין — ולא מוחלף באומדן.</div></div></div>`}
      <div class="sheet-actions"><button class="btn-ghost" onclick="importMortality()">הזן לוח</button></div>
    </div>

    <div class="card">
      <div class="card-title">מחשבון מודל ההעסקה <span class="chip chip-muted">לא פעיל</span></div>
      <p class="muted">מודול רזרבה. מוצג לצד "הורדת קצבה" כשתי חלופות שקולות
      רק כשההערכה מגיעה לרצועה האדומה.</p>
      <div class="row-form">
        <label class="fld"><span>שכר חודשי</span><input type="number" id="emSalary" value="0" oninput="renderEmployment()"></label>
        <label class="fld"><span>בונוס שנתי</span><input type="number" id="emBonus" value="0" oninput="renderEmployment()"></label>
        <label class="fld"><span>מס שולי</span><input type="number" id="emRate" step="1" value="31" oninput="renderEmployment()"></label>
        <label class="fld"><span>עלויות מעסיק (שנתי)</span><input type="number" id="emCosts" value="0" oninput="renderEmployment()"></label>
      </div>
      <div id="emOut"></div>
    </div>`
  renderEmployment()
}

function mcHTML(mc) {
  const life = mc.pDepletionInLifetime
  return `
    <div class="bento-rail">
      ${tile('הידלדלות עד גיל ' + FUND.assumptions.horizonAge, pct(mc.pDepletionByHorizon), '', 'alert')}
      ${tile('הידלדלות בחיי האב', life === null ? 'לא זמין' : pct(life), life === null ? 'דורש לוח תמותה' : '', 'flag')}
      ${tile('ירידה מקסימלית — חציון', pct(mc.drawdown.median), '', 'chart')}
      ${tile('ירידה מקסימלית — אחוזון 5', pct(mc.drawdown.worst5), 'הגרוע ב-5% מהמסלולים', 'arrowdown')}
    </div>
    <p class="muted">ממוצע אריתמטי בשימוש: ${pct(mc.arithmeticMean, 2)} — היעד הגיאומטרי
    ${pct(mc.geometricTarget, 2)} בתוספת σ²/2. בלי התיקון הזה החציון היה יוצא נמוך מהיעד.</p>
    <div class="tbl-wrap"><table class="data-table">
      <thead><tr><th>גיל</th><th>אחוזון 10</th><th>25</th><th>חציון</th><th>75</th><th>90</th></tr></thead>
      <tbody>${mc.bands.filter((_, i) => i % 5 === 0 || i === mc.bands.length - 1).map(b => `<tr>
        <td>${b.age}</td><td>${ils(b.p10)}</td><td>${ils(b.p25)}</td>
        <td><strong>${ils(b.p50)}</strong></td><td>${ils(b.p75)}</td><td>${ils(b.p90)}</td></tr>`).join('')}
      </tbody></table></div>`
}

function runMonteCarlo() {
  _mcRunning = true
  document.getElementById('mcOut').innerHTML = '<p class="muted">מריץ 20,000 מסלולים…</p>'
  const done = res => {
    _mcRunning = false; _mcResult = res
    document.getElementById('mcOut').innerHTML = mcHTML(res)
    renderActuary()
  }
  const opts = { paths: 20000, seed: 20260904, untilAge: 100 }
  try {
    const w = new Worker('mc.worker.js')
    w.onmessage = e => {
      w.terminate()
      if (e.data.ok) done(e.data.result)
      else { _mcRunning = false; toast('החישוב נכשל: ' + e.data.error, { type: 'error' }); renderActuary() }
    }
    w.onerror = () => { w.terminate(); done(monteCarlo(FUND, opts)) }  // file:// או CSP — נופלים לתהליך הראשי
    w.postMessage({ state: JSON.parse(JSON.stringify(FUND)), opts })
  } catch {
    done(monteCarlo(FUND, opts))
  }
}

/** רגישות: קצבה, תשואה, וסכום הבסיס. שלושת הצירים שבאמת זזים. */
function sensitivityHTML() {
  const A = FUND.assumptions, C = FUND.config
  const t = portfolioTotals(FUND.assets, A.taxRate)

  const covWith = (over) => {
    const s = { assets: FUND.assets, assumptions: Object.assign({}, A, over.assumptions),
      config: Object.assign({}, C, over.config) }
    let assets = FUND.assets
    if (over.mvScale) {
      assets = FUND.assets.map(a => Object.assign({}, a, {
        marketValue: a.marketValue * over.mvScale, costBasis: a.costBasis * over.mvScale,
      }))
    }
    return coverage(assets, s.assumptions, s.config)
  }
  const depWith = (over) => {
    const st = Object.assign({}, FUND, {
      assumptions: Object.assign({}, A, over.assumptions),
      config: Object.assign({}, C, over.config),
      assets: over.mvScale ? FUND.assets.map(a => Object.assign({}, a, {
        marketValue: a.marketValue * over.mvScale, costBasis: a.costBasis * over.mvScale })) : FUND.assets,
    })
    const p = medianPath(st, { untilAge: 100 })
    return p.depletionAge ? p.depletionAge.toFixed(0) : 'לא מתדלדל'
  }

  const axes = [
    { title: 'קצבה חודשית', vals: [-400, -200, 0, 200, 400].map(d => ({
        label: ils(C.pensionFromFund + d), over: { config: { pensionFromFund: C.pensionFromFund + d } } })) },
    { title: 'תשואה ריאלית ברוטו', vals: [-0.02, -0.01, 0, 0.01, 0.02].map(d => ({
        label: pct(A.realGrossEquity.base + d, 1),
        over: { assumptions: { realGrossEquity: Object.assign({}, A.realGrossEquity, { base: A.realGrossEquity.base + d }) } } })) },
    { title: 'סכום הבסיס', vals: [0.7, 0.85, 1, 1.15, 1.3].map(m => ({
        label: ils(t.marketValue * m), over: { mvScale: m } })) },
  ]

  return axes.map(ax => `
    <div class="month-block">
      <div class="month-head"><strong>${escHtml(ax.title)}</strong></div>
      <table class="data-table">
        <thead><tr><th>ערך</th><th>יחס כיסוי</th><th>רצועה</th><th>גיל הידלדלות (חציוני)</th></tr></thead>
        <tbody>${ax.vals.map(v => {
          const c = covWith(v.over)
          return `<tr><td>${escHtml(v.label)}</td><td>${ratio(c.coverageRatio)}</td>
            <td>${bandChipHTML(c.band)}</td><td>${escHtml(depWith(v.over))}</td></tr>`
        }).join('')}</tbody>
      </table>
    </div>`).join('')
}

function renderEmployment() {
  const out = document.getElementById('emOut')
  if (!out) return
  const r = employmentModel({
    monthlySalary: num(document.getElementById('emSalary').value),
    bonus: num(document.getElementById('emBonus').value),
    marginalRate: num(document.getElementById('emRate').value) / 100,
    employerCosts: num(document.getElementById('emCosts').value),
  }, FUND)
  if (!r.annualGross) { out.innerHTML = '<p class="muted">הזן שכר כדי לראות את החישוב.</p>'; return }

  // יחס כיסוי עם ובלי — החיסכון השנתי כתוספת חד-פעמית לתיק לכל שנת הפעלה.
  const cov0 = coverage(FUND.assets, FUND.assumptions, FUND.config)
  const rows = [1, 3, 5].map(years => {
    const add = r.annualNetTaxSaving * years
    const scaled = FUND.assets.map(a => Object.assign({}, a))
    const cashA = scaled.find(a => a.class === 'cash') || scaled[0]
    if (cashA) { cashA.marketValue += add; cashA.costBasis += add }
    const c = coverage(scaled, FUND.assumptions, FUND.config)
    return { years, add, ratio: c.coverageRatio, band: c.band }
  })
  out.innerHTML = `
    <div class="kv"><span>ברוטו שנתי</span><strong>${ils(r.annualGross)}</strong></div>
    <div class="kv"><span>חיסכון מס שנתי נטו</span><strong class="${r.annualNetTaxSaving >= 0 ? 'pos' : 'neg'}">${ils(r.annualNetTaxSaving)}</strong></div>
    <table class="data-table"><thead><tr><th>שנות הפעלה</th><th>תוספת מצטברת</th><th>יחס כיסוי</th><th>מול ${ratio(cov0.coverageRatio)} היום</th></tr></thead>
      <tbody>${rows.map(x => `<tr><td>${x.years}</td><td>${ils(x.add)}</td>
        <td>${ratio(x.ratio)} ${bandChipHTML(x.band)}</td>
        <td class="${x.ratio >= cov0.coverageRatio ? 'pos' : 'neg'}">${(x.ratio - cov0.coverageRatio >= 0 ? '+' : '') + (x.ratio - cov0.coverageRatio).toFixed(3)}</td></tr>`).join('')}
      </tbody></table>
    <p class="muted">${escHtml(r.note)}</p>`
}

/** קלט לוח התמותה. הדבקה של שתי עמודות: גיל, qx. */
function importMortality() {
  UK_sheet({
    title: 'לוח תמותה',
    width: 'min(560px,95vw)',
    content: `<p class="muted">הדבק שתי עמודות מלוחות הלמ"ס: גיל, והסתברות פטירה שנתית (qx).
      מפריד: רווח, טאב או פסיק. שורה לגיל.</p>
      <label class="fld"><span>מקור</span><input id="mtSource" placeholder="למשל: למ״ס, לוחות תמותה 2022–2024, גברים"></label>
      <label class="fld"><span>הנתונים</span><textarea id="mtData" rows="8" placeholder="69 0.0121&#10;70 0.0134"></textarea></label>`,
    actions: [
      { label: 'שמור', primary: true, onClick: async () => {
          if (!assertWritable()) return
          const src = document.getElementById('mtSource').value.trim()
          const lines = document.getElementById('mtData').value.trim().split(/\r?\n/).filter(Boolean)
          const pairs = []
          for (const ln of lines) {
            const p = ln.trim().split(/[\s,\t]+/)
            const age = parseInt(p[0], 10), qx = parseFloat(p[1])
            if (!Number.isFinite(age) || !Number.isFinite(qx) || qx < 0 || qx > 1) continue
            pairs.push([age, qx])
          }
          if (pairs.length < 5) { toast('לא זוהה לוח תקין.', { type: 'error' }); return true }
          pairs.sort((a, b) => a[0] - b[0])
          const startAge = pairs[0][0]
          const qxArr = []
          for (let a = startAge; a <= pairs[pairs.length - 1][0]; a++) {
            const hit = pairs.find(p => p[0] === a)
            qxArr.push(hit ? hit[1] : (qxArr[qxArr.length - 1] || 0))
          }
          FUND.mortality = { source: src, startAge, qx: qxArr, loadedAt: nowISO() }
          journal('assumption', `לוח תמותה נטען: ${qxArr.length} גילאים מגיל ${startAge}`, { rationale: src })
          await saveFund('לוח תמותה')
          _mcResult = null
          renderActuary()
        } },
      { label: 'בטל' },
    ],
  })
}
