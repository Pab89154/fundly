/** XP ledger, levels, streaks, and habit awards. */

import type { Settings, Transaction, XpHistoryEntry, XpKind } from '../types'
import { mondayOfISOWeek, weekStats } from './recurring'
import { addDaysISO, zonedDateISO, zonedIsoWeekKey } from './timezone'

export const XP = {
  genuineIncome: 15,
  purchase: 5,
  milestoneUnlock: 100,
  weeklyReview: 30,
  weeklySavingsHabit: 50,
  printxPayment: 10,
  streak7: 75,
  streak30: 200,
} as const

export type LevelDef = {
  level: number
  name: string
  minXp: number
}

export const LEVELS: LevelDef[] = [
  { level: 1, name: 'Starter', minXp: 0 },
  { level: 2, name: 'Saver', minXp: 250 },
  { level: 3, name: 'Builder', minXp: 600 },
  { level: 4, name: 'Money Master', minXp: 1_200 },
  { level: 5, name: 'Elite Saver', minXp: 2_000 },
  { level: 6, name: 'Fundly Legend', minXp: 3_500 },
]

export function awardXp(current: number, delta: number): number {
  return Math.max(0, Math.trunc(current || 0) + Math.max(0, Math.trunc(delta)))
}

export function levelFromXp(xp: number): LevelDef {
  const total = Math.max(0, Math.trunc(xp || 0))
  let current = LEVELS[0]!
  for (const L of LEVELS) {
    if (total >= L.minXp) current = L
  }
  return current
}

export function nextLevelProgress(xp: number): {
  current: LevelDef
  next: LevelDef | null
  xpIntoLevel: number
  xpForNext: number
  ratio: number
  xpToNext: number
} {
  const total = Math.max(0, Math.trunc(xp || 0))
  const current = levelFromXp(total)
  const idx = LEVELS.findIndex((L) => L.level === current.level)
  const next = idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1]! : null
  if (!next) {
    return {
      current,
      next: null,
      xpIntoLevel: Math.max(0, total - current.minXp),
      xpForNext: 0,
      ratio: 1,
      xpToNext: 0,
    }
  }
  const span = Math.max(1, next.minXp - current.minXp)
  const into = Math.max(0, total - current.minXp)
  return {
    current,
    next,
    xpIntoLevel: into,
    xpForNext: span,
    ratio: Math.min(1, into / span),
    xpToNext: Math.max(0, next.minXp - total),
  }
}

export function normalizeXpHistory(raw: unknown): XpHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const out: XpHistoryEntry[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = String(o.id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const amount = Math.max(0, Math.trunc(Number(o.amount) || 0))
    if (!(amount > 0)) continue
    const kind = String(o.kind || 'other') as XpKind
    out.push({
      id,
      kind,
      amount,
      at: String(o.at || new Date().toISOString()),
      label: String(o.label || kind).trim() || kind,
      ...(o.refId ? { refId: String(o.refId) } : {}),
    })
  }
  return out
}

export function hasXpAward(settings: Settings, id: string): boolean {
  return (settings.xpHistory || []).some((e) => e.id === id)
}

/** Append XP once by stable id. Never deducts. */
export function tryAwardXp(
  settings: Settings,
  entry: {
    id: string
    kind: XpKind
    amount: number
    label: string
    refId?: string
    at?: string
  },
): { settings: Settings; awarded: boolean; amount: number } {
  const id = String(entry.id || '').trim()
  const amount = Math.max(0, Math.trunc(entry.amount || 0))
  if (!id || !(amount > 0)) return { settings, awarded: false, amount: 0 }
  if (hasXpAward(settings, id)) return { settings, awarded: false, amount: 0 }

  const row: XpHistoryEntry = {
    id,
    kind: entry.kind,
    amount,
    at: entry.at || new Date().toISOString(),
    label: entry.label.trim() || entry.kind,
    ...(entry.refId ? { refId: entry.refId } : {}),
  }
  const xpHistory = [...(settings.xpHistory || []), row]
  const xpTotal = awardXp(settings.xpTotal || 0, amount)
  return {
    settings: { ...settings, xpHistory, xpTotal },
    awarded: true,
    amount,
  }
}

function shiftMondayISO(mondayISO: string, weeksBack: number): string {
  return addDaysISO(mondayISO, -7 * weeksBack)
}

/** Consecutive Mon–Sun weeks with goalGainedCents > 0 (display + habit). */
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
    if (i === 0) {
      monday = shiftMondayISO(monday, 1)
      continue
    }
    break
  }
  return streak
}

/** True if tx counts toward activity streak / genuine XP. */
export function isGenuineActivityTx(tx: Transaction): boolean {
  if (tx.settledAt === null) return false
  if (tx.type === 'opening' || tx.type === 'reconcile' || tx.type === 'transfer') return false
  const tags = tx.tags || []
  if (tags.includes('opening') || tags.includes('statement') || tags.includes('past')) return false
  if (tags.includes('rebalance')) return false
  if (tx.type === 'income' || tx.type === 'import') {
    if (tx.source === 'opening') return false
    return true
  }
  if (tx.type === 'spending' || tx.type === 'apple_cash_purchase') return true
  return false
}

function activityDates(
  transactions: Transaction[],
  timeZone: string,
): Set<string> {
  const days = new Set<string>()
  for (const tx of transactions) {
    if (!isGenuineActivityTx(tx)) continue
    if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) continue
    // tx.date is already local calendar date in Fundly
    void timeZone
    days.add(tx.date)
  }
  return days
}

/** Consecutive calendar days (back from today) with genuine income or purchase. */
export function activityStreakDays(
  transactions: Transaction[],
  timeZone = 'America/Chicago',
  now = new Date(),
): number {
  const today = zonedDateISO(timeZone, now)
  const days = activityDates(transactions, timeZone)
  let streak = 0
  let cursor = today
  for (let i = 0; i < 800; i++) {
    if (days.has(cursor)) {
      streak += 1
      cursor = addDaysISO(cursor, -1)
      continue
    }
    // Allow today empty mid-day without breaking
    if (i === 0) {
      cursor = addDaysISO(cursor, -1)
      continue
    }
    break
  }
  return streak
}

function weekHasActivity(days: Set<string>, mondayISO: string): boolean {
  for (let d = 0; d < 7; d++) {
    if (days.has(addDaysISO(mondayISO, d))) return true
  }
  return false
}

/** Consecutive Mon–Sun weeks (back from this week) with genuine income or purchase. */
export function activityStreakWeeks(
  transactions: Transaction[],
  timeZone = 'America/Chicago',
  now = new Date(),
): number {
  const today = zonedDateISO(timeZone, now)
  const days = activityDates(transactions, timeZone)
  let monday = mondayOfISOWeek(today)
  let streak = 0
  for (let i = 0; i < 520; i++) {
    if (weekHasActivity(days, monday)) {
      streak += 1
      monday = shiftMondayISO(monday, 1)
      continue
    }
    // Allow current week empty mid-week without breaking
    if (i === 0) {
      monday = shiftMondayISO(monday, 1)
      continue
    }
    break
  }
  return streak
}

/** Weekly Goal-pot habit XP once per Monday week. */
export function habitWeekXpIfDue(
  settings: Settings,
  transactions: Transaction[],
  timeZone = 'America/Chicago',
  now = new Date(),
): { id: string; weekKey: string } | null {
  const today = zonedDateISO(timeZone, now)
  const weekKey = mondayOfISOWeek(today)
  const id = `habit_week:${weekKey}`
  if (hasXpAward(settings, id)) return null
  if (settings.lastHabitWeekXpKey === weekKey || settings.lastStreakXpWeekKey === weekKey) {
    return null
  }
  const end = addDaysISO(weekKey, 6)
  const { goalGainedCents } = weekStats(transactions, weekKey, end)
  if (goalGainedCents <= 0) return null
  return { id, weekKey }
}

export function streakThresholdXpIfDue(
  settings: Settings,
  streakWeeks: number,
  timeZone = 'America/Chicago',
  now = new Date(),
): Array<{
  id: string
  kind: XpKind
  amount: number
  label: string
  keyField: 'lastStreak7XpKey' | 'lastStreak30XpKey'
  day: string
}> {
  const today = zonedDateISO(timeZone, now)
  const weekKey = mondayOfISOWeek(today)
  const out: Array<{
    id: string
    kind: XpKind
    amount: number
    label: string
    keyField: 'lastStreak7XpKey' | 'lastStreak30XpKey'
    day: string
  }> = []
  // streak7 / streak30 kinds kept for XP ledger compatibility (4-week / 12-week)
  if (streakWeeks >= 4) {
    const id = `streak7:${weekKey}`
    if (!hasXpAward(settings, id) && !settings.lastStreak7XpKey) {
      out.push({
        id,
        kind: 'streak7',
        amount: XP.streak7,
        label: '4-week activity streak',
        keyField: 'lastStreak7XpKey',
        day: weekKey,
      })
    }
  }
  if (streakWeeks >= 12) {
    const id = `streak30:${weekKey}`
    if (!hasXpAward(settings, id) && !settings.lastStreak30XpKey) {
      out.push({
        id,
        kind: 'streak30',
        amount: XP.streak30,
        label: '12-week activity streak',
        keyField: 'lastStreak30XpKey',
        day: weekKey,
      })
    }
  }
  return out
}

export function weeklyReviewXpIfDue(
  settings: Settings,
  timeZone = 'America/Chicago',
  now = new Date(),
): { id: string; weekKey: string } | null {
  const weekKey = zonedIsoWeekKey(timeZone, now)
  const id = `review:${weekKey}`
  if (hasXpAward(settings, id)) return null
  if (settings.lastWeeklyReviewXpKey === weekKey) return null
  return { id, weekKey }
}

/**
 * Weekly nudge when the user has an activity streak but has not logged
 * genuine income/spend yet this Mon–Sun week — keep the streak in Fundly.
 */
export function streakNudgeIfDue(
  settings: Settings,
  transactions: Transaction[],
  timeZone = 'America/Chicago',
  now = new Date(),
): { today: string; streakWeeks: number } | null {
  const today = zonedDateISO(timeZone, now)
  const weekKey = mondayOfISOWeek(today)
  if (settings.lastStreakNudgeKey === weekKey || settings.lastStreakNudgeKey === today) {
    return null
  }
  const streakWeeks = activityStreakWeeks(transactions, timeZone, now)
  if (streakWeeks < 1) return null
  // Already active this week → no nudge
  if (weekHasActivity(activityDates(transactions, timeZone), weekKey)) return null
  return { today: weekKey, streakWeeks }
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

/** @deprecated use XP.milestoneUnlock */
export function xpForMilestoneUnlock(_isFinal?: boolean): number {
  return XP.milestoneUnlock
}
