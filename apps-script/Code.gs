/**
 * קרן הקצבה — שכבת האחסון ב-Google Drive
 *
 * Apps Script Web App. פרוס אותו פעם אחת (ראה README.md בתיקייה הזו) והאפליקציה
 * מדברת איתו ב-fetch רגיל. אין OAuth בצד הלקוח ואין מסך התחברות: הסקריפט רץ
 * בהרשאות של הבעלים, ולכן הוא זה שנוגע ב-Drive.
 *
 * המחיר: מי שמחזיק את כתובת ה-Web App ואת TOKEN יכול לקרוא ולכתוב. הטוקן הוא
 * שכבת הסתרה, לא הצפנה. אל תפרסם את הכתובת.
 */

// ===== הגדרות =====
// החלף במחרוזת אקראית ארוכה, והדבק את אותה מחרוזת ב-FUND_DRIVE_TOKEN שב-drive.js.
var TOKEN = 'CHANGE-ME-TO-A-LONG-RANDOM-STRING';

var ROOT_FOLDER   = 'קרן-הקצבה';
var STATE_FILE    = 'fund-state.json';
var SNAPSHOT_DIR  = 'snapshots';
var REPORT_DIR    = 'reports';
// תיקיות שמותר לכתוב אליהן דרך file.put. כל שם אחר נדחה.
var WRITABLE_DIRS = { 'reports': true, '': true };

// ===== נקודות כניסה =====
function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return _out({ ok: false, error: 'bad-json' });
  }
  return _handle(req);
}

// GET נתמך רק לקריאה, כדי שאפשר יהיה לבדוק חיבור מהדפדפן.
function doGet(e) {
  return _handle({
    token:  e.parameter.token,
    action: e.parameter.action || 'ping',
    folder: e.parameter.folder,
  });
}

function _handle(req) {
  if (req.token !== TOKEN) return _out({ ok: false, error: 'unauthorized' });
  try {
    switch (req.action) {
      case 'ping':         return _out({ ok: true, at: new Date().toISOString() });
      case 'state.get':    return _out(_stateGet());
      case 'state.put':    return _out(_statePut(req));
      case 'snapshot.put': return _out(_snapshotPut(req));
      case 'file.put':     return _out(_filePut(req));
      case 'file.list':    return _out(_fileList(req));
      case 'file.get':     return _out(_fileGet(req));
      default:             return _out({ ok: false, error: 'unknown-action' });
    }
  } catch (err) {
    return _out({ ok: false, error: String(err && err.message || err) });
  }
}

function _out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== תיקיות =====
function _folder(name, parent) {
  var scope = parent || DriveApp.getRootFolder();
  var it = scope.getFoldersByName(name);
  return it.hasNext() ? it.next() : scope.createFolder(name);
}
function _root()      { return _folder(ROOT_FOLDER); }
function _snapDir()   { return _folder(SNAPSHOT_DIR, _root()); }
function _reportDir() { return _folder(REPORT_DIR, _root()); }

function _findFile(folder, name) {
  var it = folder.getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

// ===== מצב הקרן =====
function _stateGet() {
  var f = _findFile(_root(), STATE_FILE);
  if (!f) return { ok: true, exists: false, modified: null, data: null };
  return {
    ok: true,
    exists: true,
    modified: f.getLastUpdated().toISOString(),
    data: f.getBlob().getDataAsString('UTF-8'),
  };
}

/**
 * כתיבה עם בדיקת התנגשות (S3). הלקוח שולח את חותמת הזמן שקיבל בטעינה; אם
 * הקובץ בדרייב זז מאז — לא כותבים, ומחזירים את המצב המרוחק כדי שהמשתמש יראה
 * את הפער. אין מיזוג אוטומטי.
 */
function _statePut(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var root = _root();
    var f = _findFile(root, STATE_FILE);
    if (f) {
      var cur = f.getLastUpdated().toISOString();
      if (req.base && req.base !== cur && !req.force) {
        return { ok: false, conflict: true, modified: cur, data: f.getBlob().getDataAsString('UTF-8') };
      }
      f.setContent(req.state);
    } else {
      f = root.createFile(STATE_FILE, req.state, 'application/json');
    }
    return { ok: true, modified: f.getLastUpdated().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Snapshots הם append-only (S4). שם שכבר תפוס לא נדרס — מקבל סיומת רצה.
 * זו הסיבה שיש כאן פעולה נפרדת ולא file.put רגיל.
 */
function _snapshotPut(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var dir = _snapDir();
    var base = String(req.name || '').replace(/[\/\\]/g, '-');
    if (!base) return { ok: false, error: 'missing-name' };
    var name = base, i = 2;
    while (_findFile(dir, name)) {
      name = base.replace(/\.json$/, '') + '-' + i + '.json';
      i++;
      if (i > 200) return { ok: false, error: 'too-many-collisions' };
    }
    var f = dir.createFile(name, req.content, 'application/json');
    return { ok: true, name: name, id: f.getId() };
  } finally {
    lock.releaseLock();
  }
}

// ===== קבצים כלליים (דוחות, ייצוא Markdown) =====
function _dirFor(key) {
  if (key === 'reports') return _reportDir();
  return _root();
}

function _filePut(req) {
  var key = req.folder || '';
  if (!WRITABLE_DIRS[key]) return { ok: false, error: 'folder-not-writable' };
  var dir = _dirFor(key);
  var name = String(req.name || '').replace(/[\/\\]/g, '-');
  if (!name) return { ok: false, error: 'missing-name' };
  var mime = req.mime || 'text/plain';
  var f = _findFile(dir, name);
  if (f) f.setContent(req.content);
  else f = dir.createFile(name, req.content, mime);
  return { ok: true, name: name, id: f.getId(), url: f.getUrl() };
}

function _fileList(req) {
  var key = req.folder || '';
  var dir = key === 'snapshots' ? _snapDir() : _dirFor(key);
  var it = dir.getFiles(), out = [];
  while (it.hasNext() && out.length < 500) {
    var f = it.next();
    out.push({ name: f.getName(), id: f.getId(), size: f.getSize(), modified: f.getLastUpdated().toISOString() });
  }
  out.sort(function (a, b) { return a.name < b.name ? 1 : -1; });
  return { ok: true, files: out };
}

function _fileGet(req) {
  var key = req.folder || '';
  var dir = key === 'snapshots' ? _snapDir() : _dirFor(key);
  var f = _findFile(dir, String(req.name || ''));
  if (!f) return { ok: false, error: 'not-found' };
  return { ok: true, name: f.getName(), data: f.getBlob().getDataAsString('UTF-8') };
}
