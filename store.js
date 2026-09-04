/* ===========================================================================
   store.js — ניהול המצב, ה-cache המקומי, והסנכרון (§8, S1–S6).

   S1: IndexedDB הוא cache בלבד. Drive הוא מקור האמת.
   S5: כישלון כתיבה חוסם המשך עבודה. עבודה מקומית שלא נשמרה היא הכשל
       הגרוע ביותר במערכת שאמורה לחיות 26 שנה.
   =========================================================================== */

let FUND = null              // המצב החי
let _driveBase = null        // חותמת הזמן שקיבלנו בטעינה — הבסיס לבדיקת התנגשות
let _writeBlocked = false    // S5
let _syncState = 'init'

/* ===== IndexedDB ===== */
const IDB_NAME = 'fund-cache', IDB_STORE = 'kv'
function _idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE) }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function idbGet(key) {
  try {
    const db = await _idb()
    return await new Promise((res, rej) => {
      const t = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key)
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error)
    })
  } catch { return undefined }
}
async function idbSet(key, val) {
  try {
    const db = await _idb()
    await new Promise((res, rej) => {
      const t = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(val, key)
      t.onsuccess = () => res(); t.onerror = () => rej(t.error)
    })
    return true
  } catch { return false }
}

/* ===== מחוון סנכרון ===== */
const SYNC_LABEL = {
  init:      { txt: '',                cls: '' },
  local:     { txt: 'מקומי בלבד',      cls: 'sync-warn' },
  syncing:   { txt: 'מסנכרן',          cls: 'sync-syncing' },
  idle:      { txt: 'מסונכרן',         cls: 'sync-ok' },
  conflict:  { txt: 'התנגשות',         cls: 'sync-err' },
  error:     { txt: 'שגיאת אחסון',     cls: 'sync-err' },
  blocked:   { txt: 'כתיבה חסומה',     cls: 'sync-err' },
}
function setSync(s) {
  _syncState = s
  const m = SYNC_LABEL[s] || SYNC_LABEL.init
  document.querySelectorAll('.sync-status').forEach(el => {
    el.className = 'sync-status ' + m.cls
    el.textContent = m.txt
    el.style.display = m.txt ? 'inline-flex' : 'none'
  })
  renderWriteBlock()
}

/* ===== טעינה ===== */
async function loadFund() {
  // 1. cache מקומי — כדי שהמסך יעלה מיד גם ברשת איטית.
  const cached = await idbGet('state')
  if (cached && validateFundState(cached)) FUND = migrateFundState(cached)
  else FUND = fundEmptyState()

  if (!FundDrive.configured()) { setSync('local'); return { source: 'local' } }

  setSync('syncing')
  try {
    const r = await FundDrive.getState()
    _driveBase = r.modified
    if (r.state) {
      if (!validateFundState(r.state)) throw new Error('המצב שבדרייב אינו תקין — לא נטען.')
      FUND = migrateFundState(r.state)
      await idbSet('state', FUND)
    } else if (cached) {
      // דרייב ריק אבל יש cache — העלאה ראשונה, כדי שלא נאבד את מה שנוצר לוקאלית.
      await saveFund('אתחול הדרייב מהעותק המקומי')
    }
    setSync('idle')
    return { source: 'drive' }
  } catch (e) {
    setSync('error')
    toast(e.message, { type: 'error', duration: 8000 })
    return { source: 'local', error: e.message }
  }
}

/* ===== שמירה =====
   S2 — כתיבה בכל אירוע משמעותי, לא רק ביציאה. */
async function saveFund(reason, opts) {
  const o = opts || {}
  FUND.meta.savedAt = nowISO()
  await idbSet('state', FUND)

  if (!FundDrive.configured()) { setSync('local'); return { ok: true, local: true } }

  setSync('syncing')
  try {
    const r = await FundDrive.putState(FUND, _driveBase, o.force)
    if (r.conflict) {
      setSync('conflict')
      await showConflict(r)
      return { ok: false, conflict: true }
    }
    _driveBase = r.modified
    _writeBlocked = false
    setSync('idle')
    if (reason) journal('sync', reason)
    return { ok: true }
  } catch (e) {
    _writeBlocked = true
    setSync('blocked')
    toast('הכתיבה ל-Drive נכשלה: ' + e.message, { type: 'error', duration: 0 })
    return { ok: false, error: e.message }
  }
}

/**
 * S3 — אין מיזוג אוטומטי. מציגים את הפער ונותנים למשתמש להכריע.
 * זה לא תסריט תיאורטי: שתי לשוניות פתוחות מספיקות.
 */
function showConflict(r) {
  return new Promise(resolve => {
    let remote = null
    try { remote = JSON.parse(r.data) } catch {}
    const mine = FUND, theirs = remote
    const line = (label, s) => s ? `<tr><td>${label}</td><td>${(s.assets || []).length}</td><td>${(s.snapshots || []).length}</td><td>${(s.transactions || []).length}</td><td>${escHtml((s.meta && s.meta.savedAt || '').slice(0, 16).replace('T', ' '))}</td></tr>` : ''
    UK_sheet({
      title: 'התנגשות בשמירה',
      width: 'min(620px,95vw)',
      content: `
        <p>ה-Drive השתנה מאז שהמסך הזה נטען. אין מיזוג אוטומטי — מיזוג של שני
        מצבים שונים היה מייצר היסטוריית בסיס עלות שאינה נכונה באף אחד מהם.</p>
        <table class="tbl"><thead><tr><th>גרסה</th><th>נכסים</th><th>Snapshots</th><th>תנועות</th><th>נשמר</th></tr></thead>
        <tbody>${line('המקומית (המסך הזה)', mine)}${line('שבדרייב', theirs)}</tbody></table>
        <p class="muted">בחר גרסה אחת. השנייה לא תימחק מההיסטוריה של ה-snapshots.</p>`,
      actions: [
        { label: 'טען את הגרסה שבדרייב', primary: true, onClick: async () => {
            if (theirs && validateFundState(theirs)) {
              FUND = migrateFundState(theirs); _driveBase = r.modified
              await idbSet('state', FUND); setSync('idle'); renderCurrent()
            }
            resolve()
          } },
        { label: 'דרוס את הדרייב במקומית', className: 'btn-danger', onClick: async () => {
            await saveFund('דריסת הדרייב אחרי התנגשות', { force: true })
            renderCurrent(); resolve()
          } },
      ],
      onClose: () => resolve(),
    })
  })
}

/* ===== S5 — באנר חסימה ===== */
function renderWriteBlock() {
  const el = document.getElementById('writeBlock')
  if (!el) return
  el.style.display = _writeBlocked ? 'flex' : 'none'
}
function assertWritable() {
  if (!_writeBlocked) return true
  toast('הכתיבה האחרונה ל-Drive נכשלה. נסה שוב לפני שתמשיך — כדי שלא תיווצר עבודה שלא נשמרה.', { type: 'error', duration: 7000 })
  return false
}
async function retryWrite() {
  const r = await saveFund('ניסיון כתיבה חוזר')
  if (r.ok) toast('נשמר.', { type: 'success' })
}

/* ===== יומן =====
   §1.7/§9 — כל אירוע נרשם. היומן הוא מה שהופך את האפליקציה למנגנון משמעת
   ולא למחשבון: הוא זוכר מה הוחלט ולמה. */
function journal(kind, text, meta) {
  FUND.journal.push({ at: nowISO(), kind, text, meta: meta || null })
  if (FUND.journal.length > 5000) FUND.journal = FUND.journal.slice(-5000)
}

/* ===== S6 — ייצוא ידני מלא ===== */
function exportFundZip() {
  // ZIP בלי ספרייה חיצונית: STORE בלבד (בלי דחיסה), מספיק לקבצי JSON.
  const files = [
    ['fund-state.json', JSON.stringify(FUND, null, 2)],
    ...FUND.snapshots.map(s => [`snapshots/${s.date}.json`, JSON.stringify(s, null, 2)]),
  ]
  downloadBlob(zipStore(files), `קרן-הקצבה-${todayISO()}.zip`, 'application/zip')
}

function zipStore(files) {
  const enc = new TextEncoder()
  const chunks = [], central = []
  let offset = 0
  const u16 = n => [n & 255, (n >> 8) & 255]
  const u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]

  const table = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0 }
    return t
  })()
  const crc32 = buf => {
    let c = 0xFFFFFFFF
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 255] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }

  for (const [name, content] of files) {
    const nameB = enc.encode(name), data = enc.encode(content), crc = crc32(data)
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0)]
    chunks.push(new Uint8Array(local), nameB, data)
    central.push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)], nameB)
    offset += local.length + nameB.length + data.length
  }
  const cdStart = offset
  const cdChunks = []
  for (let i = 0; i < central.length; i += 2) {
    cdChunks.push(new Uint8Array(central[i]), central[i + 1])
    offset += central[i].length + central[i + 1].length
  }
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length), ...u32(offset - cdStart), ...u32(cdStart), ...u16(0)])
  return new Blob([...chunks, ...cdChunks, end], { type: 'application/zip' })
}

function downloadBlob(blob, filename, mime) {
  const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: mime || 'text/plain' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
