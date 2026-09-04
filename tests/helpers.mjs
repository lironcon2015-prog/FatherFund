import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export const E = require(path.join(root, 'engine.js'))
export const M = require(path.join(root, 'model.js'))
export const R = require(path.join(root, 'rules.js'))

/** מצב בדיקה: תיק של 457,000 ₪ — רובד נזילות 25,600 ומנייתי מפוצל. */
export function fixture(over = {}) {
  const s = M.fundEmptyState()
  s.assets = [
    M.makeAsset({ id: 'cash1', name: 'רובד נזילות', class: 'cash', region: 'n/a', marketValue: 25600, costBasis: 25600 }),
    M.makeAsset({ id: 'glob',  name: 'מנייתי גלובלי', class: 'equity', region: 'global', marketValue: 336000, costBasis: 252000 }),
    M.makeAsset({ id: 'isr',   name: 'מנייתי ישראל',  class: 'equity', region: 'israel', marketValue: 95400,  costBasis: 76000 }),
  ]
  s.meta.lastPortfolioUpdate = '2026-09-01T00:00:00.000Z'
  return Object.assign(s, over)
}

export const REF = '2026-09-04T00:00:00.000Z'
export function close(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps }
