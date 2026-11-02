/** Streak, PrintX personal best, and XP helpers for Savings habit stats. */

import type { Transaction } from '../types'
import { localDateISO, parseLocalDate } from './money'
import { mondayOfISOWeek, weekStats } from './recurring'
import { addDaysISO, zonedDateISO } from './timezone'

export const XP = {
  incomeLogged: 5,
  milestoneUnlock: 50,
  milestoneFinalBonus: 100,
  streakWeek: 10,
} as const

export function xpForMilestoneUnlock(isFinal: boolean): number {
  return XP.milestoneUnlock + (isFinal ? XP.milestoneFinalBonus : 0)
}

function shiftMondayISO(mondayISO: string, weeksBack: number): string {
  return addDaysISO(mondayISO, -7 * weeksBack)
}

/** Consecutive Mon–Sun weeks with goalGainedCents > 0, counting back from current week. */
export function savingsStreakWeeks(
  transactions: Transaction[],
  timeZone = 'America/Chicago',
  now = new Date(),
): number {
  const today = zonedDateISO(timeZone, now)
  let monday = mondayOfISOWeek(today)
  let streak = 0

  for (let i = 0; i < 520; i++) {
    const end = addDaysISO(monday, 6)
    const { goalGainedCents } = weekStats(transactions, monday, end)
    if (goalGainedCents > 0) {
      streak += 1
      monday = shiftMondayISO(monday, 1)
      continue
    }
    // Current week can be empty mid-week without breaking prior streak
    if (i === 0) {
      monday = shiftMondayISO(monday, 1)
      continue
    }
    break
  }
  return streak
}

/** PrintX settled earnings for a Monday week (same bucketing as PrintX chart). */
export function printxSettledCentsInWeek(
  transactions: Transaction[],
  weekMondayISO: string,
): number {
  const end = addDaysISO(weekMondayISO, 6)
  let sum = 0
  for (const tx of transactions) {
    if (tx.source !== 'printx' && tx.type !== 'import') continue
    if (tx.type !== 'income' && tx.type !== 'import' && tx.type !== 'refund') continue
    if (tx.settledAt === null) continue
    if (tx.date < weekMondayISO || tx.date > end) continue
    const delta = tx.allocation
      ? tx.allocation.iphone +
        tx.allocation.spending +
        tx.allocation.extra +
        (tx.allocation.charity ?? 0)
      : Math.abs(tx.amountCents)
    sum += tx.type === 'refund' ? -delta : delta
  }
  return Math.max(0, sum)
}

/** Max weekly PrintX settled earnings across history (+ current week). */
export function printxPersonalBestWeeklyCents(
  transactions: Transaction[],
  timeZone = 'America/Chicago',
  now = new Date(),
): number {
  const weeks = new Set<string>()
  weeks.add(mondayOfISOWeek(zonedDateISO(timeZone, now)))
  for (const tx of transactions) {
    if (tx.source !== 'printx' && tx.type !== 'import') continue
    if (!tx.date) continue
    weeks.add(mondayOfISOWeek(tx.date))
  }
  let best = 0
  for (const wk of weeks) {
    best = Math.max(best, printxSettledCentsInWeek(transactions, wk))
  }
  return best
}

export function awardXp(current: number, delta: number): number {
  return Math.max(0, Math.trunc(current || 0) + Math.max(0, Math.trunc(delta)))
}

/** Award streak XP once per Mon–Sun week when that week has Goal pot gains. */
export function streakXpIfDue(
  lastWeekKey: string | null | undefined,
  transactions: Transaction[],
  timeZone = 'America/Chicago',
  now = new Date(),
): { xp: number; weekKey: string } | null {
  const today = zonedDateISO(timeZone, now)
  const weekKey = mondayOfISOWeek(today)
  if (lastWeekKey === weekKey) return null
  const end = addDaysISO(weekKey, 6)
  const { goalGainedCents } = weekStats(transactions, weekKey, end)
  if (goalGainedCents <= 0) return null
  if (savingsStreakWeeks(transactions, timeZone, now) < 1) return null
  return { xp: XP.streakWeek, weekKey }
}

/** Local Monday ISO for a Date (PrintX-chart style). */
export function localMondayISO(d: Date): string {
  const weekStart = new Date(d)
  weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return localDateISO(weekStart)
}

export function mondayFromTxDate(dateISO: string): string {
  return mondayOfISOWeek(dateISO)
}

export { parseLocalDate }
