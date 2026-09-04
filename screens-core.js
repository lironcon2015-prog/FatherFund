/* ===========================================================================
   screens-core.js — מסכים 1–4: מצב, עדכון תיק, משיכה, תשלומים.
   =========================================================================== */

/* ===================== מסך 1 — מצב ===================== */
/* המספר הראשי הוא יחס הכיסוי. אין כאן גרף מהשיא, אין תשואה יומית, ואין
   השוואה למדד — לא כי לא הספקנו, אלא כי המסגור היחיד המותר הוא מול הנדרש
   לכיסוי (עיקרון-על 2). */
function renderStatus() {
  const el = document.getElementById('statusBody')
  if (!FUND.assets.length) {
    el.innerHTML = emptyHTML('אין נכסים בתיק. הזן את נקודת האפס במסך עדכון התיק.', 'עדכון תיק', "navigate('portfolio')")
    return
  }
  const A = FUND.assumptions, C = FUND.config
  const cov = coverage(FUND.assets, A, C)
  const t = cov.totals
  const months = rungMonthsLeft(FUND.assets, C)
  const st = staleness(FUND, STALE_DAYS)
  const w = reviewWindow(FUND)

  const gross = plannedGrossBreakdown()

  el.innerHTML = `
    ${staleBannerHTML()}
    <div class="hero card band-${cov.band || 'muted'}">
      <div class="hero-main">
        <div class="hero-label">יחס כיסוי</div>
        <div class="hero-num">${ratio(cov.coverageRatio)}</div>
        ${bandChipHTML(cov.band)}
      </div>
      <div class="hero-side">
        <div class="hero-line"><span>שווי שוק</span><strong>${ils(t.marketValue)}</strong></div>
        <div class="hero-line"><span>נדרש לכיסוי (ברוטו)</span><strong>${ils(cov.requiredGross)}</strong></div>
        <div class="hero-line ${cov.gap >= 0 ? 'pos' : 'neg'}"><span>פער</span><strong>${ils(cov.gap)}</strong></div>
        <div class="hero-note">${cov.years} שנות קצבה עד גיל ${A.horizonAge}, בהיוון ${pct(A.discountRate, 2)}.</div>
      </div>
    </div>

    <div class="rail">
      ${tile('שווי שוק', ils(t.marketValue))}
      ${tile('בסיס עלות', ils(t.costBasis))}
      ${tile('רווח צבור', ils(t.accruedGain))}
      ${tile('חבות מס גלומה', ils(t.deferredTax), t.deferredTax < 0 ? 'הפסד לקיזוז' : `${pct(A.taxRate, 0)} על הרווח`)}
    </div>

    <div class="two-col">
      <div class="card">
        <div class="card-title">רובד הנזילות</div>
        <div class="big ${months < 4 ? 'neg' : ''}">${months.toFixed(1)} חודשי משיכה</div>
        <div class="muted">${ils(t.cash)} מתוך יעד ${ils(C.rungTarget)}.
          המשיכה החודשית ${ils(C.pensionFromFund)} ובחודש ${C.bulletMonth} גם ${ils(C.bulletAmount)}.</div>
        ${months < 4 ? '<div class="banner banner-err">מתחת ל-4 חודשים. זו התראה שמופיעה גם באמצע שנה.</div>' : ''}
      </div>
      <div class="card">
        <div class="card-title">הפעולה הבאה</div>
        ${nextActionHTML(w)}
      </div>
    </div>

    <div class="card banner-inline">
      <div class="card-title">${uiIcon('alert', 18)} המשיכה בברוטו גדלה עם השנים</div>
      <p>כרגע שיעור הרווח בתיק הוא <strong>${pct(t.gainFraction)}</strong>, ולכן כדי לספק
      ${ils(C.pensionFromFund)} נטו יש למכור <strong>${ils(gross.portfolio)}</strong> ברוטו.
      תקצב בהתאם.</p>
      <p class="muted">כל עוד רובד הנזילות מכסה את המשיכה, המכירה בפועל היא
      ${ils(gross.actual)} — הרובד אינו נושא רווח ולכן אין בו מס. המספר שלמעלה הוא
      מה שיקרה כשהמשיכות יגיעו מהמנייתי, וזה מה שצריך לתקצב.</p>
    </div>

    ${refillCardHTML()}

    <div class="card">
      <div class="card-title">דוחות</div>
      <div class="btn-row">
        <button class="btn-ghost" onclick="buildReportA()">A · רבעוני לאחים</button>
        <button class="btn-ghost" onclick="buildReportC()">C · בסיס עלות ומס</button>
        <button class="btn-ghost" onclick="buildReportD()">D · ייצוא לפרויקט</button>
        <button class="btn-ghost" onclick="buildReportE()">E · חבילת חירום</button>
      </div>
      <p class="muted">דוח B מופק בסיום הבקרה התלת-שנתית ולא כאן — הוא מתעד החלטה, לא מצב.</p>
    </div>

    <div class="card">
      <div class="card-title">עדכון אחרון</div>
      <div class="kv"><span>תאריך</span><strong>${dtLabel(FUND.meta.lastPortfolioUpdate)}</strong></div>
      <div class="kv"><span>גיל הנתונים</span><strong class="${st.stale ? 'neg' : ''}">${st.never ? 'מעולם לא עודכן' : st.days + ' ימים'}</strong></div>
      <div class="kv"><span>Snapshots שנשמרו</span><strong>${FUND.snapshots.length}</strong></div>
    </div>`
}

/* §2.3 — כלל המילוי מחדש. מוצג כשיש פער ברובד, ולא רק בסוף שנה: משיכות
   שירדו מהרובד לאורך השנה הן בדיוק מה שהכלל מנהל. */
function refillCardHTML() {
  const cash = FUND.assets.filter(a => a.class === 'cash').reduce((s, a) => s + a.marketValue, 0)
  const gap = FUND.config.rungTarget - cash
  if (gap <= 0) return ''
  const year = new Date().getFullYear()
  const d = refillDecision(FUND, year)
  const cls = d.status === 'fill' ? 'ok' : (d.status === 'skip' ? 'warn' : 'muted')
  return `<div class="card">
    <div class="card-title">מילוי מחדש של הרובד — ${year}</div>
    <div class="kv"><span>הפער</span><strong>${ils(gap)}</strong></div>
    <div class="kv"><span>תשואת הרכיב המנייתי השנה</span><strong>${d.equityReturnYTD === null ? 'לא ניתן לחשב' : pct(d.equityReturnYTD)}</strong></div>
    <div class="banner banner-${cls}">${uiIcon(d.status === 'fill' ? 'check' : 'alert', 18)}<div>${escHtml(d.message)}</div></div>
    ${d.status === 'fill' ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>נכס</th><th>ברוטו</th><th>נטו לרובד</th><th>מס</th></tr></thead>
        <tbody>${d.plan.legs.map(l => `<tr><td>${escHtml(l.name)}</td><td>${ils(l.grossSale)}</td>
          <td>${ils(l.netDelivered)}</td><td>${ils(l.taxAccrued)}</td></tr>`).join('')}</tbody></table></div>
      <div class="sheet-actions"><button class="btn-primary" onclick="commitRefill(${year})">בצע מילוי מחדש</button></div>` : ''}
  </div>`
}

async function commitRefill(year) {
  if (!assertWritable()) return
  const d = refillDecision(FUND, year)
  if (d.status !== 'fill') { toast('הכלל אינו מאפשר מילוי כעת.', { type: 'error' }); return }
  if (!await confirmDialog(`מילוי מחדש של הרובד\nמכירה של ${ils(d.plan.totalGross)} ברוטו מהמנייתי, ${ils(d.plan.totalNet)} נטו לרובד. מס נצבר ${ils(d.plan.taxAccrued)}.`, { confirmText: 'בצע' })) return

  const date = todayISO()
  d.plan.legs.forEach(l => FUND.transactions.push({
    id: fundId('tx'), date, assetId: l.assetId, type: 'refill',
    grossAmount: round2(l.grossSale), basisConsumed: round2(l.basisConsumed),
    realizedGain: round2(l.realizedGain), taxAccrued: round2(l.taxAccrued),
    note: `מילוי מחדש ${year} · תשואה מנייתית ${pct(d.equityReturnYTD)}`,
  }))
  FUND.assets = applyPlan(FUND.assets, d.plan).map(makeAsset)
  const cashAsset = FUND.assets.find(a => a.class === 'cash')
  if (cashAsset) {
    cashAsset.marketValue = round2(cashAsset.marketValue + d.plan.totalNet)
    cashAsset.costBasis = round2(cashAsset.costBasis + d.plan.totalNet)
  }
  FUND.refills.push({ year, filled: true, equityReturnYTD: d.equityReturnYTD, amount: round2(d.plan.totalNet), at: nowISO() })
  journal('refill', `מילוי מחדש ${year} — ${ils(d.plan.totalNet)} לרובד`)
  await saveFund('מילוי מחדש')
  toast('הרובד מולא.', { type: 'success' })
  navigate('status')
}

function tile(label, value, note) {
  return `<div class="tile"><div class="tile-label">${escHtml(label)}</div>
    <div class="tile-value">${value}</div>${note ? `<div class="tile-note">${escHtml(note)}</div>` : ''}</div>`
}

/**
 * שני מספרי ברוטו, ובכוונה.
 * `actual` — מה שיימכר היום לפי סדר המשיכה: כל עוד הרובד מכסה, זה 1:1.
 * `portfolio` — הברוטו לפי שיעור הרווח בתיק כולו. זה המספר שההתראה של §3
 * מדברת עליו, כי הוא מה שיקרה כשהמשיכות יגיעו מהמנייתי. הצגת ה-actual לבדו
 * הייתה מסתירה בדיוק את מה שההתראה נועדה להקדים.
 */
function plannedGrossBreakdown() {
  const opts = {
    taxRate: FUND.assumptions.taxRate,
    israelTargetShareOfEquity: FUND.config.israelTargetShareOfEquity,
  }
  const net = FUND.config.pensionFromFund
  const t = portfolioTotals(FUND.assets, FUND.assumptions.taxRate)
  const denom = 1 - FUND.assumptions.taxRate * t.gainFraction
  return {
    actual: planWithdrawal(FUND.assets, net, opts).totalGross,
    portfolio: denom > 0 ? net / denom : net,
  }
}
function grossSaleForPlanned() { return plannedGrossBreakdown().portfolio }

function nextActionHTML(w) {
  const items = []
  const today = todayISO()
  const month = parseInt(today.slice(5, 7), 10)
  items.push({ when: 'החודש', what: `תשלום ${ils(FUND.config.pensionFromFund)} מהקרן ו-${ils(FUND.config.pensionFromBrothers)} ישירות מהאחים`, go: "navigate('payments')" })
  if (month === FUND.config.bulletMonth) {
    items.push({ when: 'החודש', what: `המשיכה החריגה ${ils(FUND.config.bulletAmount)} — מפדיון הבולט ברובד`, go: "navigate('withdraw')" })
  }
  items.push({ when: 'רבעוני', what: 'עדכון תיק ידני והפקת דוח לאחים', go: "navigate('portfolio')" })
  items.push({ when: 'סוף שנה', what: 'החלטת מילוי מחדש של הרובד ודוח בסיס עלות', go: "navigate('review')" })
  items.push({
    when: w.overdue ? 'באיחור' : `בעוד ${w.daysAway} ימים`,
    what: `בקרה תלת-שנתית — ${dmy(w.next)}`, go: "navigate('review')",
    urgent: w.overdue || w.inWindow,
  })
  return items.map(i => `<div class="next-row ${i.urgent ? 'urgent' : ''}">
      <span class="next-when">${escHtml(i.when)}</span>
      <span class="next-what">${escHtml(i.what)}</span>
      <button class="btn-link" onclick="${i.go}">פתח</button>
    </div>`).join('')
}

/* ===================== מסך 2 — עדכון תיק ===================== */

const BIG_CHANGE = 0.25   // §מסך 2 — מעל ±25% דורש אישור מפורש. לא חסימה.

function renderPortfolio() {
  const el = document.getElementById('portfolioBody')
  const prev = FUND.snapshots.length ? FUND.snapshots[FUND.snapshots.length - 1] : null
  const prevMV = id => {
    if (!prev) return null
    const r = (prev.assets || []).find(a => a.assetId === id)
    return r ? r.marketValue : null
  }
  const rows = FUND.assets.map(a => {
    const p = prevMV(a.id)
    return `<tr>
      <td>
        <strong>${escHtml(a.name)}</strong>
        <div class="muted">${a.class === 'cash' ? 'רובד נזילות' : 'מנייתי'}${a.region !== 'n/a' ? ' · ' + (a.region === 'israel' ? 'ישראל' : 'גלובלי') : ''}${a.isLegacy ? ' · אחזקה ישנה' : ''}</div>
      </td>
      <td><input class="num" type="number" step="0.01" id="mv_${a.id}" value="${a.marketValue}"></td>
      <td><input class="num" type="number" step="0.01" id="cb_${a.id}" value="${a.costBasis}"></td>
      <td class="muted">${p === null ? '—' : pct((a.marketValue - p) / (p || 1))}</td>
      <td><button class="btn-icon" title="ערוך" onclick="editAsset('${a.id}')">${uiIcon('sliders', 16)}</button></td>
    </tr>`
  }).join('')

  el.innerHTML = `
    <div class="card">
      <div class="card-title">
        <span>הזנה ידנית לפי נכס</span>
        <button class="btn-ghost" onclick="editAsset(null)">${uiIcon('plus', 15)} נכס חדש</button>
      </div>
      <p class="muted">אין מחירים בזמן אמת ואין חיבור לברוקר. העדכון ידני ותקופתי, בכוונה —
      תדירות בדיקה נמוכה היא פיצ'ר ולא מגבלה.</p>
      ${FUND.assets.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>נכס</th><th>שווי שוק</th><th>בסיס עלות</th><th>שינוי מהעדכון הקודם</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : emptyHTML('אין נכסים.', 'הוסף נכס ראשון', 'editAsset(null)')}
      ${FUND.assets.length ? `<div class="sheet-actions">
        <button class="btn-primary" onclick="reviewPortfolioUpdate()">בדוק ושמור</button>
      </div>` : ''}
    </div>
    <div class="card">
      <div class="card-title">Snapshots</div>
      <p class="muted">כל שמירה יוצרת תמונת מצב בלתי ניתנת לעריכה. תיקון אינו עריכה —
      הוא snapshot חדש עם נימוק (S4).</p>
      ${FUND.snapshots.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>תאריך</th><th>שווי שוק</th><th>מקור</th><th>הערה</th></tr></thead><tbody>
        ${[...FUND.snapshots].reverse().slice(0, 40).map(s => `<tr>
          <td>${dmy(s.date)}</td>
          <td>${ils((s.assets || []).reduce((x, a) => x + a.marketValue, 0))}</td>
          <td>${s.source === 'correction' ? 'תיקון' : 'ידני'}</td>
          <td class="muted">${escHtml(s.note || '')}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">עדיין אין.</p>'}
    </div>`
}

function editAsset(id) {
  const a = id ? FUND.assets.find(x => x.id === id) : null
  UK_sheet({
    title: a ? 'עריכת נכס' : 'נכס חדש',
    content: `
      <label class="fld"><span>שם</span><input id="asName" value="${escAttr(a ? a.name : '')}"></label>
      <label class="fld"><span>סוג</span><select id="asClass">
        <option value="equity" ${a && a.class === 'equity' ? 'selected' : ''}>מנייתי</option>
        <option value="cash" ${a && a.class === 'cash' ? 'selected' : ''}>רובד נזילות</option>
      </select></label>
      <label class="fld"><span>אזור</span><select id="asRegion">
        <option value="global" ${a && a.region === 'global' ? 'selected' : ''}>גלובלי</option>
        <option value="israel" ${a && a.region === 'israel' ? 'selected' : ''}>ישראל</option>
        <option value="n/a" ${a && a.region === 'n/a' ? 'selected' : ''}>לא רלוונטי</option>
      </select></label>
      <label class="fld"><span>שווי שוק</span><input id="asMV" type="number" step="0.01" value="${a ? a.marketValue : 0}"></label>
      <label class="fld"><span>בסיס עלות</span><input id="asCB" type="number" step="0.01" value="${a ? a.costBasis : 0}"></label>
      <label class="fld fld-check"><input type="checkbox" id="asLegacy" ${a && a.isLegacy ? 'checked' : ''}>
        <span>אחזקה ישנה. מסומנת בלבד — היא אינה חוסמת מכירה, ובפועל נדחקת לסוף תור המשיכה
        בזכות שיעור הרווח הגבוה שלה (§2.2).</span></label>`,
    actions: [
      { label: 'שמור', primary: true, onClick: async () => {
          if (!assertWritable()) return
          const o = {
            id: a ? a.id : undefined,
            name: document.getElementById('asName').value,
            class: document.getElementById('asClass').value,
            region: document.getElementById('asRegion').value,
            marketValue: document.getElementById('asMV').value,
            costBasis: document.getElementById('asCB').value,
            isLegacy: document.getElementById('asLegacy').checked,
          }
          if (!String(o.name).trim()) { toast('נדרש שם.', { type: 'error' }); return true }
          if (a) Object.assign(a, makeAsset(o))
          else FUND.assets.push(makeAsset(o))
          journal('asset', (a ? 'עריכת נכס: ' : 'הוספת נכס: ') + o.name)
          await saveFund()
          renderPortfolio()
        } },
      ...(a ? [{ label: 'מחק', className: 'btn-danger', onClick: async () => {
          if (!assertWritable()) return
          if (!await confirmDialog('מחיקת נכס\nההיסטוריה ב-snapshots ובתנועות נשמרת, אבל הנכס לא ייכלל יותר בחישובים.', { danger: true, confirmText: 'מחק' })) return
          FUND.assets = FUND.assets.filter(x => x.id !== a.id)
          journal('asset', 'מחיקת נכס: ' + a.name)
          await saveFund(); renderPortfolio()
        } }] : []),
      { label: 'בטל' },
    ],
  })
}

/** בדיקה לפני שמירה: delta, ולידציה של שינוי חריג, ואישור מפורש. */
function reviewPortfolioUpdate() {
  if (!assertWritable()) return
  const changes = FUND.assets.map(a => {
    const mv = num(document.getElementById('mv_' + a.id).value)
    const cb = num(document.getElementById('cb_' + a.id).value)
    const d = a.marketValue > 0 ? (mv - a.marketValue) / a.marketValue : 0
    return { asset: a, mv, cb, delta: mv - a.marketValue, deltaPct: d, big: Math.abs(d) > BIG_CHANGE }
  })
  const anyBig = changes.some(c => c.big)
  const totalBefore = FUND.assets.reduce((s, a) => s + a.marketValue, 0)
  const totalAfter = changes.reduce((s, c) => s + c.mv, 0)

  UK_sheet({
    title: 'אישור עדכון תיק',
    width: 'min(640px,95vw)',
    content: `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>נכס</th><th>מ־</th><th>ל־</th><th>שינוי</th></tr></thead>
        <tbody>${changes.map(c => `<tr class="${c.big ? 'row-warn' : ''}">
          <td>${escHtml(c.asset.name)}</td><td>${ils(c.asset.marketValue)}</td><td>${ils(c.mv)}</td>
          <td class="${c.delta >= 0 ? 'pos' : 'neg'}">${ils(c.delta)} (${pct(c.deltaPct)})</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><th>סה"כ</th><th>${ils(totalBefore)}</th><th>${ils(totalAfter)}</th>
          <th class="${totalAfter >= totalBefore ? 'pos' : 'neg'}">${ils(totalAfter - totalBefore)}</th></tr></tfoot>
      </table></div>
      ${anyBig ? `<div class="banner banner-warn">${uiIcon('alert', 18)}<div>
        שינוי של יותר מ-${pct(BIG_CHANGE, 0)} בשורה מסומנת. זו אינה חסימה — רק דרישת אישור מפורש,
        כי טעות הקלדה בשווי שוק מרעילה את כל הנגזרות ואת ה-snapshot שלא ניתן לערוך.</div></div>` : ''}
      <label class="fld"><span>הערה ל-snapshot</span><input id="snapNote" placeholder="למשל: עדכון רבעוני Q3"></label>`,
    actions: [
      { label: anyBig ? 'מאשר את השינוי החריג ושומר' : 'שמור', primary: true, onClick: async () => {
          await commitPortfolioUpdate(changes, document.getElementById('snapNote').value, 'manual')
        } },
      { label: 'בטל' },
    ],
  })
}

async function commitPortfolioUpdate(changes, note, source) {
  const date = todayISO()
  changes.forEach(c => {
    c.asset.marketValue = round2(c.mv)
    c.asset.costBasis = round2(c.cb)
    c.asset.lastUpdated = date
  })
  const snap = {
    date, source: source || 'manual', note: String(note || '').trim(),
    assets: FUND.assets.map(a => ({ assetId: a.id, marketValue: a.marketValue, costBasis: a.costBasis })),
  }
  FUND.snapshots.push(snap)
  FUND.meta.lastPortfolioUpdate = nowISO()
  journal('snapshot', `עדכון תיק — ${ils(snap.assets.reduce((s, a) => s + a.marketValue, 0))}`, { date })

  const r = await saveFund('עדכון תיק')
  if (r.ok && FundDrive.configured()) {
    // S4 — עותק append-only נפרד. גם אם fund-state.json ייהרס, ההיסטוריה שרדה.
    try { await FundDrive.putSnapshot(`${date}.json`, snap) }
    catch (e) { toast('ה-snapshot הנפרד לא נכתב: ' + e.message, { type: 'error', duration: 8000 }) }
  }
  toast('נשמר. ה-snapshot אינו ניתן לעריכה.', { type: 'success' })
  navigate('status')
}

/* ===================== מסך 3 — משיכה ===================== */

function renderWithdraw() {
  const el = document.getElementById('withdrawBody')
  const C = FUND.config
  const planned = plannedAmountFor(C, todayISO())
  el.innerHTML = `
    ${staleBannerHTML()}
    <div class="card">
      <div class="card-title">סכום נטו נדרש</div>
      <div class="withdraw-input">
        <input id="wdAmount" type="number" step="1" value="${planned}" oninput="previewWithdraw()">
        <div class="chips">
          <button class="chip-btn" onclick="setWithdraw(${C.pensionFromFund})">קצבה ${ils(C.pensionFromFund)}</button>
          <button class="chip-btn" onclick="setWithdraw(${C.bulletAmount})">משיכה חריגה ${ils(C.bulletAmount)}</button>
          <button class="chip-btn" onclick="setWithdraw(${C.pensionFromFund + C.bulletAmount})">שניהם</button>
        </div>
      </div>
      <div class="muted">המתוכנן לחודש הזה: ${ils(planned)}.</div>
    </div>
    <div id="wdPreview"></div>`
  previewWithdraw()
}

function setWithdraw(v) { document.getElementById('wdAmount').value = v; previewWithdraw() }

function previewWithdraw() {
  const box = document.getElementById('wdPreview')
  const net = num(document.getElementById('wdAmount').value)
  if (!(net > 0)) { box.innerHTML = ''; return }
  if (!FUND.assets.length) { box.innerHTML = emptyHTML('אין נכסים בתיק.'); return }

  const plan = planWithdrawal(FUND.assets, net, {
    taxRate: FUND.assumptions.taxRate,
    israelTargetShareOfEquity: FUND.config.israelTargetShareOfEquity,
  })
  const hits = checkWithdrawal(FUND, { netAmount: net, date: todayISO() })

  box.innerHTML = `
    ${hits.map(h => `<div class="banner banner-${h.severity === 'high' ? 'err' : 'warn'}">
        ${uiIcon('alert', 18)}<div><strong>${escHtml(h.rule)}</strong><div>${escHtml(h.message)}</div></div></div>`).join('')}
    <div class="card">
      <div class="card-title">מאיזה נכס, כמה, ולמה</div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>#</th><th>נכס</th><th>ברוטו למכירה</th><th>נטו שיתקבל</th><th>רווח ממומש</th><th>מס נצבר</th><th>הסיבה לבחירה</th></tr></thead>
        <tbody>${plan.legs.map(l => `<tr>
          <td>${l.rank}</td>
          <td><strong>${escHtml(l.name)}</strong></td>
          <td>${ils(l.grossSale)}</td>
          <td>${ils(l.netDelivered)}</td>
          <td>${ils(l.realizedGain)}</td>
          <td>${ils(l.taxAccrued)}</td>
          <td class="muted">${escHtml(l.reason)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><th></th><th>סה"כ</th><th>${ils(plan.totalGross)}</th><th>${ils(plan.totalNet)}</th>
          <th>${ils(plan.realizedGain)}</th><th>${ils(plan.taxAccrued)}</th><th></th></tr></tfoot>
      </table></div>
      ${plan.shortfall > 0.5 ? `<div class="banner banner-err">${uiIcon('alert', 18)}<div>
        התיק אינו מספיק. חסרים ${ils(plan.shortfall)} נטו.</div></div>` : ''}
      <p class="muted">כלל המשיכה: רובד הנזילות ראשון, אחר כך הנכס בעל שיעור הרווח הנמוך ביותר (R7).
      אחזקה ישנה אינה חסומה למכירה — היא פשוט בסוף התור.</p>
      <div class="sheet-actions">
        <button class="btn-primary" onclick='confirmWithdraw(${JSON.stringify(net)})' ${plan.shortfall > 0.5 ? 'disabled' : ''}>אשר משיכה</button>
      </div>
    </div>`
}

async function confirmWithdraw(net) {
  if (!assertWritable()) return
  const plan = planWithdrawal(FUND.assets, net, {
    taxRate: FUND.assumptions.taxRate,
    israelTargetShareOfEquity: FUND.config.israelTargetShareOfEquity,
  })
  const hits = checkWithdrawal(FUND, { netAmount: net, date: todayISO() })

  let rationale = ''
  if (hits.some(h => h.requiresRationale)) {
    rationale = await requireRationale({ title: 'משיכה מחוץ לתוכנית', warnings: hits })
    if (rationale === null) return
  } else {
    if (!await confirmDialog(`אישור משיכה\nלמכור ${ils(plan.totalGross)} ברוטו כדי לספק ${ils(plan.totalNet)} נטו. מס נצבר ${ils(plan.taxAccrued)}.`, { confirmText: 'אשר' })) return
  }

  const date = todayISO()
  plan.legs.forEach(l => {
    FUND.transactions.push({
      id: fundId('tx'), date, assetId: l.assetId, type: 'sell',
      grossAmount: round2(l.grossSale), basisConsumed: round2(l.basisConsumed),
      realizedGain: round2(l.realizedGain), taxAccrued: round2(l.taxAccrued),
      note: rationale || '',
    })
  })
  FUND.assets = applyPlan(FUND.assets, plan).map(makeAsset)
  journal('withdraw', `משיכה ${ils(plan.totalNet)} נטו · ברוטו ${ils(plan.totalGross)} · מס ${ils(plan.taxAccrued)}`,
    { rationale: rationale || null, offPlan: hits.length > 0 })
  await saveFund('משיכה')
  toast('המשיכה נרשמה ובסיס העלות עודכן.', { type: 'success' })
  navigate('status')
}

/* ===================== מסך 4 — תשלומים ===================== */
/* §1.4 — שני הזרמים נרשמים בנפרד גם כשהכול עובר דרך חשבון אחד. זה לא
   בזבוז: דגל מבחני הכנסה מחייב לדעת מה הגיע מהקרן ומה ישירות מהאחים. */
function renderPayments() {
  const el = document.getElementById('paymentsBody')
  const C = FUND.config
  const byMonth = {}
  FUND.payments.forEach(p => {
    const m = p.date.slice(0, 7)
    byMonth[m] = byMonth[m] || { fund: 0, brothers: 0, rows: [] }
    byMonth[m][p.source === 'fund' ? 'fund' : 'brothers'] += p.amount
    byMonth[m].rows.push(p)
  })
  const months = Object.keys(byMonth).sort().reverse()
  const thisMonth = todayISO().slice(0, 7)
  const cur = byMonth[thisMonth] || { fund: 0, brothers: 0 }

  el.innerHTML = `
    <div class="two-col">
      <div class="card">
        <div class="card-title">החודש — מהקרן</div>
        <div class="big">${ils(cur.fund)}</div>
        <div class="muted">מתוכנן ${ils(C.pensionFromFund)}${parseInt(thisMonth.slice(5), 10) === C.bulletMonth ? ` + משיכה חריגה ${ils(C.bulletAmount)}` : ''}</div>
      </div>
      <div class="card">
        <div class="card-title">החודש — ישירות מהאחים</div>
        <div class="big">${ils(cur.brothers)}</div>
        <div class="muted">מתוכנן ${ils(C.pensionFromBrothers)} (נומינלי)</div>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><span>רישום תשלום</span></div>
      <div class="row-form">
        <label class="fld"><span>תאריך</span><input type="date" id="payDate" value="${todayISO()}"></label>
        <label class="fld"><span>סכום</span><input type="number" id="payAmount" step="1" value="${C.pensionFromFund}"></label>
        <label class="fld"><span>מקור</span><select id="paySource">
          <option value="fund">מהקרן</option><option value="brothers_direct">ישירות מהאחים</option>
        </select></label>
        <label class="fld"><span>הערה</span><input id="payNote"></label>
        <button class="btn-primary" onclick="addPayment()">רשום</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">יומן התשלומים</div>
      ${months.length ? months.map(m => `
        <div class="month-block">
          <div class="month-head"><strong>${m}</strong>
            <span class="muted">קרן ${ils(byMonth[m].fund)} · אחים ${ils(byMonth[m].brothers)}</span></div>
          <table class="tbl"><tbody>${byMonth[m].rows.sort((a, b) => a.date < b.date ? 1 : -1).map(p => `<tr>
            <td>${dmy(p.date)}</td>
            <td><span class="chip chip-${p.source === 'fund' ? 'accent' : 'muted'}">${p.source === 'fund' ? 'קרן' : 'אחים'}</span></td>
            <td>${ils(p.amount)}</td>
            <td class="muted">${escHtml(p.note || '')}</td>
            <td><button class="btn-icon" onclick="deletePayment('${p.id}')">${uiIcon('trash', 15)}</button></td>
          </tr>`).join('')}</tbody></table>
        </div>`).join('') : '<p class="muted">עדיין לא נרשמו תשלומים.</p>'}
    </div>`
}

async function addPayment() {
  if (!assertWritable()) return
  const p = {
    id: fundId('pay'),
    date: document.getElementById('payDate').value || todayISO(),
    amount: round2(num(document.getElementById('payAmount').value)),
    source: document.getElementById('paySource').value,
    note: document.getElementById('payNote').value.trim(),
  }
  if (!(p.amount > 0)) { toast('סכום לא תקין.', { type: 'error' }); return }
  FUND.payments.push(p)
  journal('payment', `תשלום ${ils(p.amount)} · ${p.source === 'fund' ? 'מהקרן' : 'מהאחים'}`)
  await saveFund('תשלום')
  renderPayments()
}

async function deletePayment(id) {
  if (!assertWritable()) return
  if (!await confirmDialog('מחיקת תשלום\nהרישום יימחק מהיומן.', { danger: true, confirmText: 'מחק' })) return
  FUND.payments = FUND.payments.filter(p => p.id !== id)
  journal('payment', 'מחיקת רישום תשלום')
  await saveFund(); renderPayments()
}
