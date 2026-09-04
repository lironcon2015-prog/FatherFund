/* ===========================================================================
   drive.js — לקוח של שכבת האחסון (§8).

   אין OAuth ואין מסך התחברות. Apps Script Web App רץ בהרשאות הבעלים, ולכן
   מבחינת הדפדפן זו קריאת fetch רגילה. ראה apps-script/README.md.

   Content-Type הוא text/plain בכוונה: זו בקשה "פשוטה" מבחינת CORS ולכן היא
   לא מייצרת preflight — ל-Apps Script אין תשובת OPTIONS משלה.
   =========================================================================== */

/* אפשר לקבע כאן, או להזין במסך ההגדרות (נשמר מקומית לכל דפדפן). */
const FUND_DRIVE_URL_DEFAULT   = ''
const FUND_DRIVE_TOKEN_DEFAULT = ''

const FundDrive = {
  url()   { return localStorage.getItem('fundDriveUrl')   || FUND_DRIVE_URL_DEFAULT },
  token() { return localStorage.getItem('fundDriveToken') || FUND_DRIVE_TOKEN_DEFAULT },
  configured() { return !!(this.url() && this.token()) },

  setConfig(url, token) {
    localStorage.setItem('fundDriveUrl', (url || '').trim())
    localStorage.setItem('fundDriveToken', (token || '').trim())
  },

  async call(action, payload) {
    if (!this.configured()) throw new Error('שכבת האחסון לא הוגדרה. הגדרות › אחסון.')
    const body = JSON.stringify(Object.assign({ token: this.token(), action }, payload || {}))
    let resp
    try {
      resp = await fetch(this.url(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow',
      })
    } catch (e) {
      throw new Error('אין חיבור לשכבת האחסון: ' + e.message)
    }
    if (!resp.ok) throw new Error('שכבת האחסון החזירה ' + resp.status)
    let data
    try { data = await resp.json() } catch { throw new Error('תשובה לא תקינה מהסקריפט — בדוק שהפריסה עודכנה.') }
    if (data.ok === false && !data.conflict) throw new Error(_driveErr(data.error))
    return data
  },

  ping()  { return this.call('ping') },

  async getState() {
    const r = await this.call('state.get')
    let parsed = null
    if (r.data) { try { parsed = JSON.parse(r.data) } catch { throw new Error('fund-state.json בדרייב פגום — לא נטען.') } }
    return { exists: !!r.exists, modified: r.modified, state: parsed }
  },

  /**
   * S3 — כתיבה עם בדיקת חותמת זמן. אין מיזוג אוטומטי: אם הקובץ זז מאז
   * הטעינה, מוחזר conflict עם המצב המרוחק וההחלטה חוזרת למשתמש.
   */
  putState(state, base, force) {
    return this.call('state.put', { state: JSON.stringify(state, null, 2), base: base || null, force: !!force })
  },

  /** S4 — append-only. הסקריפט לא ידרוס שם קיים. */
  putSnapshot(name, obj) {
    return this.call('snapshot.put', { name, content: JSON.stringify(obj, null, 2) })
  },

  putFile(folder, name, content, mime) {
    return this.call('file.put', { folder, name, content, mime: mime || 'text/plain' })
  },
  listFiles(folder) { return this.call('file.list', { folder }) },
  getFile(folder, name) { return this.call('file.get', { folder, name }) },
}

function _driveErr(code) {
  const map = {
    'unauthorized':       'הטוקן שגוי. הגדרות › אחסון.',
    'bad-json':           'הבקשה לא נקראה בצד הסקריפט.',
    'unknown-action':     'הסקריפט בדרייב ישן מהאפליקציה — פרוס גרסה חדשה.',
    'folder-not-writable': 'ניסיון כתיבה לתיקייה שאינה מורשית.',
    'not-found':          'הקובץ לא נמצא.',
  }
  return map[code] || ('שגיאת אחסון: ' + code)
}
