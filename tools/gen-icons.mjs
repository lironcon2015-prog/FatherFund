/* מפיק את כל הנגזרות של סימן האפליקציה מהסימן הפעיל ב-ui.js:
   icons/*.png, וגם ה-favicon הסטטי ותג המותג ב-index.html.

     node tools/gen-icons.mjs

   הרץ אחרי כל שינוי של FUND_MARK. דורש playwright-core.

   הסימן נקרא מ-ui.js ולא מועתק לכאן, וה-HTML נכתב מחדש ולא מתוחזק ביד:
   כל שכפול של הגדרת הסימן מייצר גרסה שבה הלשונית מראה דבר אחד והאפליקציה
   דבר אחר, וזה בדיוק סוג הפער שאיש לא בודק. */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const exe = ['/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
  .find(p => fs.existsSync(p))

const ui = fs.readFileSync(path.join(root, 'ui.js'), 'utf8')
const mark = ui.match(/const FUND_MARK = '(\w+)'/)[1]
const body = new Function(
  ui.slice(ui.indexOf('const FUND_MARKS'), ui.indexOf('/* ← ההחלפה')) + `return FUND_MARKS['${mark}']`
)()

const page = (px, scale, radius) => `<meta charset="utf-8"><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#4f8bff"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
  <rect width="100" height="100" rx="${radius}" fill="url(#g)"/>
  <g transform="translate(${50 - scale * 12} ${50 - scale * 12}) scale(${scale})" color="#ffffff">${body}</g>
</svg></body>`

/* ===== ה-HTML הסטטי =====
   הוא רק מה שנראה לפני ש-applyFundMark() רץ, אבל בלעדיו יש הבזק של הסימן
   הישן בכל טעינה — ובלשונית, שנשמרת ב-bookmark, גם אחריו. */
const between = (src, tag, body) =>
  src.replace(new RegExp(`(<!--MARK:${tag}-->)[\\s\\S]*?(<!--/MARK:${tag}-->)`), `$1${body}$2`)

const faviconURI = () => {
  const inked = body.replace(/currentColor/g, '#e8edff')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">`
    + `<rect width="32" height="32" rx="8" fill="#0d1024"/>`
    + `<g transform="translate(4 4)">${inked}</g></svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

const htmlPath = path.join(root, 'index.html')
let html = fs.readFileSync(htmlPath, 'utf8')
html = between(html, 'favicon',
  `<link rel="icon" type="image/svg+xml" href="${faviconURI()}">`)
html = between(html, 'brand',
  `<svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`)
fs.writeFileSync(htmlPath, html)
console.log(`index.html  (favicon + brand)`)

const b = await chromium.launch(exe ? { executablePath: exe } : {})
/* maskable הוא full-bleed: הסימן קטן יותר כדי להישאר בתוך אזור הבטיחות
   של 80% שמערכות ההפעלה חותכות אליו. */
for (const [file, px, scale, radius] of [
  ['icons/icon-192.png', 192, 2.1, 22],
  ['icons/icon-512.png', 512, 2.1, 22],
  ['icons/icon-maskable-512.png', 512, 1.9, 0],
]) {
  const p = await b.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 })
  await p.setContent(page(px, scale, radius))
  await p.waitForTimeout(120)
  await p.screenshot({ path: path.join(root, file), omitBackground: true })
  await p.close()
  console.log(`${file}  (${mark})`)
}
await b.close()
