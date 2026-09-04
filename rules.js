/* ===========================================================================
   rules.js — R1–R8 של §6, כשכבת אכיפה אחת.
   המערכת לא ממליצה. היא מיישמת כללים שנקבעו מראש ומציגה את הפער בין המצב
   לכלל. כל מסך שנוגע בפעולה קורא לכאן — אין שכפול של כלל בקוד המסך.
   =========================================================================== */

const FUND_RULES = [
  { id: 'R1', text: 'אין מכירת רכיב מנייתי בתגובה לירידת שוק. משיכה מעבר לתוכנית בחודש שבו התיק ירד — אזהרה, נימוק חובה, ורישום.' },
  { id: 'R2', text: 'החלטות על קצבה, הפקדה או תמהיל — רק במסך הבקרה ורק במועד. מחוץ למועד הפעולה נרשמת לבקרה הבאה.' },
  { id: 'R3', text: 'אין rebalance במכירת אחזקות עם שיעור רווח מעל 30%. התיקון מוצג כרכישה בלבד.' },
  { id: 'R4', text: 'אין העלאת קצבה לפני גיל 78. המרווח ביחס הכיסוי דק ביותר בשנים הראשונות.' },
  { id: 'R5', text: 'מילוי מחדש של הרובד מותנה בשנה מנייתית חיובית.' },
  { id: 'R6', text: 'כל שינוי בהנחות מריץ מחדש את הספים. אין מספרים קשיחים בקוד.' },
  { id: 'R7', text: 'משיכה תמיד מהנכס בעל שיעור הרווח הנמוך ביותר.' },
  { id: 'R8', text: 'נתונים בני יותר מ-120 יום — כל הפלטים מסומנים "טעון עדכון". האפליקציה לא משערכת לבד.' },
]

const R3_MAX_GAIN_FOR_REBALANCE = 0.30
const R4_MIN_AGE_FOR_INCREASE   = 78

/* ===== R1 ===== */

/** הסכום המתוכנן לחודש נתון: הקצבה, ובחודש הבולט גם המשיכה החריגה. */
function plannedAmountFor(config, dateISO) {
  const month = parseInt(String(dateISO).slice(5, 7), 10)
  return config.pensionFromFund + (month === config.bulletMonth ? config.bulletAmount : 0)
}

/** כיוון התיק בין שני ה-snapshots האחרונים. null אם אין מספיק נתונים. */
function portfolioDirection(state) {
  const snaps = [...state.snapshots].sort((a, b) => a.date < b.date ? -1 : 1)
  if (snaps.length < 2) return null
  const mv = s => (s.assets || []).reduce((sum, x) => sum + (x.marketValue || 0), 0)
  const prev = mv(snaps[snaps.length - 2]), cur = mv(snaps[snaps.length - 1])
  if (!(prev > 0)) return null
  return { change: (cur - prev) / prev, from: snaps[snaps.length - 2].date, to: snaps[snaps.length - 1].date }
}

/**
 * בדיקת משיכה. לא חוסמת — מייצרת חיכוך: אזהרה שדורשת נימוק בכתב.
 * זה עיקרון התכן 3, ולא פשרה בין חסימה לכלום.
 */
function checkWithdrawal(state, req) {
  const out = []
  const planned = plannedAmountFor(state.config, req.date)
  const dir = portfolioDirection(state)

  if (req.netAmount > planned + 0.5) {
    const excess = req.netAmount - planned
    if (dir && dir.change < 0) {
      out.push({
        rule: 'R1', severity: 'high', requiresRationale: true,
        message: `משיכה של ${Math.round(excess).toLocaleString('he-IL')} ₪ מעבר לתוכנית, בתקופה שבה התיק ירד ב-${(Math.abs(dir.change) * 100).toFixed(1)}%. זו בדיוק הפעולה שהכלל נועד למנוע. הנימוק יוצג בבקרה הבאה.`,
      })
    } else {
      out.push({
        rule: 'R1', severity: 'medium', requiresRationale: true,
        message: `משיכה של ${Math.round(excess).toLocaleString('he-IL')} ₪ מעבר לתוכנית החודשית. נדרש נימוק בכתב, והוא יוצג בבקרה הבאה.`,
      })
    }
  }
  return out
}

/* ===== R2 — מועד הבקרה ===== */

function lastReviewDate(state) {
  if (state.reviews && state.reviews.length) {
    return [...state.reviews].sort((a, b) => a.date < b.date ? -1 : 1).slice(-1)[0].date
  }
  const zp = (state.zeroPoints || []).slice(-1)[0]
  if (zp) return zp.date
  return (state.meta && state.meta.createdAt || '').slice(0, 10) || null
}

function nextReviewDate(state) {
  const last = lastReviewDate(state)
  if (!last) return null
  const d = new Date(last)
  d.setFullYear(d.getFullYear() + state.config.reviewIntervalYears)
  return d.toISOString().slice(0, 10)
}

/** האם אנחנו במועד הבקרה. חלון של 90 יום לפני התאריך נחשב "במועד". */
function reviewWindow(state, refDate) {
  const next = nextReviewDate(state)
  const today = (refDate || new Date().toISOString()).slice(0, 10)
  if (!next) return { inWindow: true, next: null, daysAway: null }
  const days = Math.round((new Date(next) - new Date(today)) / 86400000)
  return { inWindow: days <= 90, next, daysAway: days, overdue: days < 0 }
}

/** R2 — פעולה מבנית מחוץ למועד. לא חסומה; נרשמת לבקרה הבאה. */
function checkStructuralAction(state, refDate) {
  const w = reviewWindow(state, refDate)
  if (w.inWindow) return []
  return [{
    rule: 'R2', severity: 'high', requiresRationale: true, offSchedule: true,
    message: `מחוץ למועד. הבקרה הבאה ב-${w.next} (בעוד ${w.daysAway} ימים). הפעולה תירשם ותוצג בבקרה, אבל היא אינה החלטה של המערכת.`,
  }]
}

/* ===== R3 ===== */
function checkRebalanceSale(asset, gainFractionFn) {
  const g = gainFractionFn(asset)
  if (g > R3_MAX_GAIN_FOR_REBALANCE) {
    return [{
      rule: 'R3', severity: 'block', blocked: true,
      message: `שיעור הרווח ב"${asset.name}" הוא ${(g * 100).toFixed(1)}% — מעל 30%. אין rebalance במכירה. התיקון מוצג כרכישה בלבד.`,
    }]
  }
  return []
}

/* ===== R4 ===== */
function checkPensionIncrease(state, newPension, age) {
  if (newPension <= state.config.pensionFromFund) return []
  if (age < R4_MIN_AGE_FOR_INCREASE) {
    return [{
      rule: 'R4', severity: 'block', blocked: true,
      message: `העלאת קצבה חסומה עד גיל ${R4_MIN_AGE_FOR_INCREASE} (הגיל כעת ${age}). המרווח ביחס הכיסוי דק ביותר בשנים הראשונות, ומשיכה מוגדלת מוקדם פוגעת בכל השנים שאחריה.`,
    }]
  }
  return []
}

/* ===== R8 ===== */
function checkStale(state, staleDays, refDate) {
  const last = state.meta && state.meta.lastPortfolioUpdate
  if (!last) {
    return [{ rule: 'R8', severity: 'high', stale: true,
      message: 'התיק מעולם לא עודכן. כל הפלטים ריקים או חסרי משמעות עד לעדכון ראשון.' }]
  }
  const days = Math.floor(((refDate ? new Date(refDate) : new Date()) - new Date(last)) / 86400000)
  if (days > staleDays) {
    return [{ rule: 'R8', severity: 'high', stale: true, days,
      message: `הנתונים בני ${days} ימים. כל הפלטים מסומנים "טעון עדכון" — המערכת לא משערכת לבד.` }]
  }
  return []
}

if (typeof module !== 'undefined') {
  module.exports = {
    FUND_RULES, R3_MAX_GAIN_FOR_REBALANCE, R4_MIN_AGE_FOR_INCREASE,
    plannedAmountFor, portfolioDirection, checkWithdrawal,
    lastReviewDate, nextReviewDate, reviewWindow, checkStructuralAction,
    checkRebalanceSale, checkPensionIncrease, checkStale,
  }
}
