/* ===========================================================================
   ui.js — פרימיטיבים משותפים: טוסט, אישור, שיטס, אייקונים.
   הועברו מ-Homebudget ונשמרה אותה קונבנציה: modal פועל לפי .open, ואין
   אימוג'י בשום פלט שהמשתמש רואה — אייקון משמעותי עובר דרך uiIcon().
   =========================================================================== */

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function escAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/* ===== אייקונים ===== */
const UI_ICONS = {
  gauge:      '<circle cx="12" cy="12" r="9"/><path d="M12 12l4-4"/>',
  wallet:     '<path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M16 12h3"/>',
  arrowdown:  '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>',
  calendar:   '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clipboard:  '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/>',
  chart:      '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  flag:       '<path d="M4 21V4h12l-2 4 2 4H4"/>',
  sliders:    '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
  book:       '<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M8 3v18"/>',
  alert:      '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  check:      '<path d="M5 12l4.5 4.5L19 7"/>',
  refresh:    '<path d="M21 4v6h-6"/><path d="M3 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L21 9"/><path d="M20.5 15A9 9 0 0 1 5.6 18.4L3 15"/>',
  download:   '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 21h16"/>',
  file:       '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  lock:       '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  trash:      '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  plus:       '<path d="M12 5v14M5 12h14"/>',
}
function uiIcon(id, size, color) {
  const p = UI_ICONS[id] || UI_ICONS.file
  return `<span class="ui-ic" style="${color ? 'color:' + color : ''}"><svg width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg></span>`
}

/* ===== טוסט ===== */
function _toastStack() {
  let el = document.getElementById('toastStack')
  if (!el) { el = document.createElement('div'); el.id = 'toastStack'; el.className = 'toast-stack'; document.body.appendChild(el) }
  return el
}
function toast(msg, opts = {}) {
  const { type = 'info', duration = 3200, action = null } = opts
  const el = document.createElement('div')
  el.className = `toast toast-${type}`
  el.setAttribute('role', type === 'error' ? 'alert' : 'status')
  const span = document.createElement('span')
  span.className = 'toast-msg'; span.textContent = msg
  el.appendChild(span)
  let timer
  const dismiss = () => { clearTimeout(timer); el.classList.remove('open'); setTimeout(() => el.remove(), 220) }
  const btn = document.createElement('button')
  btn.className = 'toast-action'
  btn.textContent = action && action.label ? action.label : 'סגור'
  btn.onclick = () => { try { if (action && action.onClick) action.onClick() } finally { dismiss() } }
  el.appendChild(btn)
  _toastStack().appendChild(el)
  requestAnimationFrame(() => el.classList.add('open'))
  if (duration > 0) timer = setTimeout(dismiss, duration)
  return { dismiss }
}

/* ===== מלכודת פוקוס ===== */
function _trapFocus(e, box) {
  const f = box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')
  if (!f.length) return
  const first = f[0], last = f[f.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

/* ===== שיטס ===== */
function UK_sheet(opts = {}) {
  const { title = '', content = '', actions = [], width = 'min(480px,95vw)', onClose = null, dismissible = true } = opts
  const lastFocused = document.activeElement
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay open'
  const box = document.createElement('div')
  box.className = 'modal-box'
  box.style.width = width
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true')

  if (title) {
    const h = document.createElement('div')
    h.className = 'modal-header'
    h.innerHTML = '<h3></h3>' + (dismissible ? '<button class="modal-close" aria-label="סגור">✕</button>' : '')
    h.querySelector('h3').textContent = title
    if (dismissible) h.querySelector('.modal-close').onclick = () => close()
    box.appendChild(h)
  }
  const body = document.createElement('div')
  body.className = 'sheet-body'
  if (typeof content === 'string') body.innerHTML = content
  else if (content instanceof Node) body.appendChild(content)
  box.appendChild(body)

  if (actions.length) {
    const row = document.createElement('div')
    row.className = 'sheet-actions'
    actions.forEach(a => {
      const b = document.createElement('button')
      b.className = a.className || (a.primary ? 'btn-primary' : 'btn-ghost')
      b.textContent = a.label
      b.onclick = () => { const keep = a.onClick && a.onClick(); if (!keep) close() }
      row.appendChild(b)
    })
    box.appendChild(row)
  }
  overlay.appendChild(box)
  const close = () => {
    document.removeEventListener('keydown', onKey)
    overlay.remove()
    if (lastFocused && lastFocused.focus) lastFocused.focus()
    if (onClose) onClose()
  }
  const onKey = e => {
    if (e.key === 'Escape' && dismissible) close()
    else if (e.key === 'Tab') _trapFocus(e, box)
  }
  if (dismissible) overlay.addEventListener('click', e => { if (e.target === overlay) close() })
  document.addEventListener('keydown', onKey)
  document.body.appendChild(overlay)
  const first = box.querySelector('input,select,textarea,button:not(.modal-close)')
  if (first) first.focus()
  return { close, box, body }
}

/* ===== אישור ===== */
function confirmDialog(message, opts = {}) {
  const { danger = false, confirmText = 'אישור', cancelText = 'ביטול', title = '' } = opts
  return new Promise(resolve => {
    let done = false
    const finish = v => { if (!done) { done = true; resolve(v) } }
    const lines = String(message || '').split('\n')
    const sheet = UK_sheet({
      title: title || lines[0] || 'אישור',
      content: `<div class="confirm-body">${escHtml(title ? message : lines.slice(1).join('\n'))}</div>`,
      actions: [
        { label: confirmText, className: danger ? 'btn-danger' : 'btn-primary', onClick: () => finish(true) },
        { label: cancelText, onClick: () => finish(false) },
      ],
      onClose: () => finish(false),
    })
    return sheet
  })
}

/**
 * §3 עיקרון 3 — פעולה מחוץ למועד דורשת חיכוך. לא חסימה: נימוק בכתב.
 * מחזיר את הנימוק, או null אם בוטל. אישור בלי טקסט אינו אפשרי.
 */
function requireRationale(opts) {
  const { title, warnings = [], minLength = 12, confirmText = 'אשר ורשום' } = opts
  return new Promise(resolve => {
    let done = false
    const finish = v => { if (!done) { done = true; resolve(v) } }
    const warnHtml = warnings.map(w =>
      `<div class="rule-hit sev-${escAttr(w.severity || 'medium')}">
         <span class="rule-tag">${escHtml(w.rule || '')}</span>
         <span>${escHtml(w.message)}</span>
       </div>`).join('')
    const sheet = UK_sheet({
      title,
      width: 'min(560px,95vw)',
      content: `${warnHtml}
        <label class="fld">
          <span>נימוק (חובה) — ייקרא בבקרה הבאה</span>
          <textarea id="rationaleInput" rows="4" placeholder="מדוע הפעולה נדרשת עכשיו"></textarea>
        </label>
        <div class="muted" id="rationaleHint">לפחות ${minLength} תווים.</div>`,
      actions: [
        { label: confirmText, primary: true, onClick: () => {
            const v = (document.getElementById('rationaleInput').value || '').trim()
            if (v.length < minLength) {
              document.getElementById('rationaleHint').classList.add('err')
              document.getElementById('rationaleHint').textContent = `נדרש נימוק של לפחות ${minLength} תווים. זו הנקודה של הכלל.`
              return true   // משאיר את השיטס פתוח
            }
            finish(v)
          } },
        { label: 'בטל', onClick: () => finish(null) },
      ],
      onClose: () => finish(null),
    })
    return sheet
  })
}
