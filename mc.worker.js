/* מונטה קרלו ב-Worker. 20,000 מסלולים חוסמים את ה-UI אם רצים בתהליך הראשי,
   ומסך שנתקע בזמן חישוב מעודד את המשתמש לא להריץ אותו. */
importScripts('model.js', 'engine.js')
self.onmessage = e => {
  try {
    self.postMessage({ ok: true, result: monteCarlo(e.data.state, e.data.opts) })
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) })
  }
}
