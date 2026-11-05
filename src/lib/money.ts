/** Cent-accurate money helpers. All balances use integer cents. */

export type AccountId = 'iphone' | 'spending' | 'extra' | 'charity'

export const ACCOUNT_LABELS: Record<AccountId, string> = {
  iphone: 'Goal',
  spending: 'Spending',
  extra: 'Extra',
  charity: 'Charity',
}

export type SpendSlice = { account: AccountId; cents: number }

/** Drain `primary` first, then `helpers` in order, until `amountCents` is covered. */
export function planSpendAcrossPots(
  balances: Record<AccountId, number>,
  amountCents: number,
  primary: AccountId,
  helpers: AccountId[],
):
  | { ok: true; slices: SpendSlice[] }
  | { ok: false; shortfallCents: number; slices: SpendSlice[] } {
  const amount = Math.trunc(amountCents)
  if (!(amount > 0)) return { ok: false, shortfallCents: 0, slices: [] }

  const remainingBal: Record<AccountId, number> = {
    iphone: Math.max(0, Math.trunc(balances.iphone || 0)),
    spending: Math.max(0, Math.trunc(balances.spending || 0)),
    extra: Math.max(0, Math.trunc(balances.extra || 0)),
    charity: Math.max(0, Math.trunc(balances.charity || 0)),
  }

  const order = [primary, ...helpers.filter((a) => a !== primary)]
  const slices: SpendSlice[] = []
  let left = amount

  for (const account of order) {
    if (left <= 0) break
    const take = Math.min(left, remainingBal[account])
    if (take <= 0) continue
    slices.push({ account, cents: take })
    remainingBal[account] -= take
    left -= take
  }

  if (left > 0) return { ok: false, shortfallCents: left, slices }
  return { ok: true, slices }
}

export type AllocationPct = {
  iphone: number
  spending: number
  extra: number
  charity: number
}

export type AllocationCents = {
  iphone: number
  spending: number
  extra: number
  charity: number
}

export const ZERO_ALLOCATION: AllocationCents = {
  iphone: 0,
  spending: 0,
  extra: 0,
  charity: 0,
}

export const DEFAULT_ALLOCATION_PCT: AllocationPct = {
  iphone: 60,
  spending: 20,
  extra: 10,
  charity: 10,
}

/** While Travel Mode is on, Extra % is folded into Spending (Extra gets 0). */
export function effectiveAllocation(settings: {
  allocation: AllocationPct
  travelMode?: boolean
}): AllocationPct {
  const pct = settings.allocation
  if (!settings.travelMode) return pct
  return {
    iphone: pct.iphone,
    spending: pct.spending + pct.extra,
    extra: 0,
    charity: pct.charity,
  }
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function toCents(usd: number): number {
  return Math.round((Number(usd) || 0) * 100)
}

export function fromCents(cents: number): number {
  return (Number(cents) || 0) / 100
}

export function formatUsd(cents: number): string {
  const n = fromCents(cents)
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export type MoneyDirection = 'in' | 'out' | 'neutral'

/** Money in (+), money out (−), or plain for transfers/reconcile. */
export function txMoneyDirection(type: string): MoneyDirection {
  switch (type) {
    case 'income':
    case 'import':
    case 'opening':
    case 'refund':
      return 'in'
    case 'spending':
    case 'apple_cash_purchase':
      return 'out'
    default:
      return 'neutral'
  }
}

/** Always shows a leading + or − for in/out; balances stay unsigned via formatUsd. */
export function formatSignedUsd(cents: number, direction: MoneyDirection): string {
  const abs = formatUsd(Math.abs(cents))
  if (direction === 'in') return `+${abs}`
  if (direction === 'out') return `−${abs}`
  return abs
}

export function formatTxUsd(tx: { type: string; amountCents: number }): string {
  return formatSignedUsd(tx.amountCents, txMoneyDirection(tx.type))
}

/** YYYY-MM-DD in the user's local timezone (avoid UTC off-by-one from toISOString). */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a stored YYYY-MM-DD as local midnight (not UTC). */
export function parseLocalDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

export function allocationPctSum(pct: AllocationPct): number {
  return Math.round((pct.iphone + pct.spending + pct.extra + pct.charity) * 1000) / 1000
}

export function isValidAllocationPct(pct: AllocationPct): boolean {
  return (
    pct.iphone >= 0 &&
    pct.spending >= 0 &&
    pct.extra >= 0 &&
    pct.charity >= 0 &&
    Math.abs(allocationPctSum(pct) - 100) < 0.001
  )
}

/** Ensure charity exists; migrate legacy 3-pot splits → 60/20/10/10. */
export function normalizeAllocationPct(raw: Partial<AllocationPct> | null | undefined): AllocationPct {
  const hasCharity = raw != null && 'charity' in raw && raw.charity != null
  // Any pre-charity allocation becomes the new default split
  if (!hasCharity) return { ...DEFAULT_ALLOCATION_PCT }

  const next: AllocationPct = {
    iphone: Number(raw.iphone),
    spending: Number(raw.spending),
    extra: Number(raw.extra),
    charity: Number(raw.charity),
  }

  if (
    !Number.isFinite(next.iphone) ||
    !Number.isFinite(next.spending) ||
    !Number.isFinite(next.extra) ||
    !Number.isFinite(next.charity) ||
    !isValidAllocationPct(next)
  ) {
    return { ...DEFAULT_ALLOCATION_PCT }
  }
  return next
}

export function normalizeAllocationCents(
  raw: Partial<AllocationCents> | null | undefined,
): AllocationCents {
  return {
    iphone: Math.trunc(Number(raw?.iphone) || 0),
    spending: Math.trunc(Number(raw?.spending) || 0),
    extra: Math.trunc(Number(raw?.extra) || 0),
    charity: Math.trunc(Number(raw?.charity) || 0),
  }
}

/** Split total cents by percentages; remainder cents go to largest remainder so parts sum exactly. */
export function allocateCents(totalCents: number, pct: AllocationPct): AllocationCents {
  const total = Math.trunc(Number(totalCents) || 0)
  if (total === 0) return { ...ZERO_ALLOCATION }

  const sign = total < 0 ? -1 : 1
  const abs = Math.abs(total)

  const raw = [
    { key: 'iphone' as const, exact: (abs * pct.iphone) / 100 },
    { key: 'spending' as const, exact: (abs * pct.spending) / 100 },
    { key: 'extra' as const, exact: (abs * pct.extra) / 100 },
    { key: 'charity' as const, exact: (abs * pct.charity) / 100 },
  ]

  const floors = raw.map((r) => ({
    key: r.key,
    floor: Math.floor(r.exact),
    frac: r.exact - Math.floor(r.exact),
  }))

  let used = floors.reduce((s, f) => s + f.floor, 0)
  let rem = abs - used
  floors.sort((a, b) => b.frac - a.frac || a.key.localeCompare(b.key))
  for (const f of floors) {
    if (rem <= 0) break
    f.floor += 1
    rem -= 1
  }

  const out: AllocationCents = { ...ZERO_ALLOCATION }
  for (const f of floors) out[f.key] = sign * f.floor
  return out
}

export function sumAllocation(a: AllocationCents): number {
  return a.iphone + a.spending + a.extra + a.charity
}

/** Legacy fixed milestones (used only if no active goal target). */
export const MILESTONES_CENTS = [10000, 25000, 50000, 100000, 150000, 200000] as const

export const MILESTONE_FRACS = [0.05, 0.125, 0.25, 0.5, 0.75, 1] as const

/** Milestone checkpoints for a goal target (5% … 100%). */
export function milestonesForTarget(targetCents: number): number[] {
  const target = Math.trunc(Number(targetCents) || 0)
  if (target <= 0) return []
  const set = new Set<number>()
  for (const f of MILESTONE_FRACS) {
    set.add(Math.max(1, Math.round(target * f)))
  }
  set.add(target)
  return [...set].filter((c) => c > 0 && c <= target).sort((a, b) => a - b)
}

export type MilestoneMetaMap = Record<string, { title: string; treat?: string }>

/** Default titles by closest fraction of target. */
export function defaultMilestoneTitle(
  cents: number,
  targetCents: number,
  goalName = 'Goal',
): string {
  const target = Math.trunc(targetCents) || 0
  const name = goalName.trim() || 'Goal'
  if (target <= 0) return `First ${formatUsd(cents)} saved`
  if (cents >= target) return `${name} unlocked!`
  const ratio = cents / target
  if (ratio <= 0.08) return 'First spark'
  if (ratio <= 0.18) return 'Getting started'
  if (ratio <= 0.35) return 'Quarter way'
  if (ratio <= 0.6) return 'Halfway hero'
  if (ratio <= 0.85) return 'Almost there'
  return 'Final stretch'
}

export function milestoneMetaFor(
  cents: number,
  meta?: MilestoneMetaMap | null,
): { title?: string; treat?: string } {
  const entry = meta?.[String(cents)]
  if (!entry) return {}
  return { title: entry.title, treat: entry.treat }
}

/** True for auto unlock titles like "iPhone Duo unlocked!" (follow current goal name). */
export function isAutoUnlockMilestoneTitle(title: string | undefined | null): boolean {
  return Boolean(title && /^.+\s+unlocked!$/i.test(title.trim()))
}

/**
 * Keep 100% milestone title in sync with the current goal name.
 * Preserves treats and fully custom unlock titles that don't match the auto pattern.
 */
export function syncMilestoneMetaGoalName(
  meta: MilestoneMetaMap | null | undefined,
  targetCents: number,
  goalName: string,
): MilestoneMetaMap | undefined {
  if (!meta || targetCents <= 0) return meta || undefined
  const name = goalName.trim() || 'Goal'
  const unlockKey = String(targetCents)
  const next: MilestoneMetaMap = { ...meta }
  let changed = false
  for (const c of milestonesForTarget(targetCents)) {
    const key = String(c)
    const entry = next[key]
    if (!entry) continue
    if (c >= targetCents || key === unlockKey) {
      if (!entry.title?.trim() || isAutoUnlockMilestoneTitle(entry.title)) {
        const title = `${name} unlocked!`
        if (entry.title !== title) {
          next[key] = entry.treat?.trim()
            ? { title, treat: entry.treat.trim() }
            : { title }
          changed = true
        }
      }
    }
  }
  // Also fix stale keys that were the old target amount if target unchanged but title stale
  for (const [key, entry] of Object.entries(next)) {
    if (!entry) continue
    if (isAutoUnlockMilestoneTitle(entry.title) && !entry.title.startsWith(`${name} `)) {
      const title = `${name} unlocked!`
      next[key] = entry.treat?.trim() ? { title, treat: entry.treat.trim() } : { title }
      changed = true
    }
  }
  return changed ? next : meta
}

export function milestoneLabel(
  cents: number,
  opts?: {
    targetCents?: number
    goalName?: string
    milestoneMeta?: MilestoneMetaMap | null
  },
): string {
  const target = opts?.targetCents ?? 0
  const name = opts?.goalName?.trim() || 'Goal'
  const custom = milestoneMetaFor(cents, opts?.milestoneMeta).title?.trim()
  // 100% / unlock titles always follow the live goal name unless fully custom.
  if (target > 0 && cents >= target) {
    if (!custom || isAutoUnlockMilestoneTitle(custom)) return `${name} unlocked!`
    return custom
  }
  if (custom) return custom
  if (target > 0) return defaultMilestoneTitle(cents, target, name)
  return `First ${formatUsd(cents)} saved`
}

export function milestoneTreat(
  cents: number,
  meta?: MilestoneMetaMap | null,
): string | undefined {
  const t = milestoneMetaFor(cents, meta).treat?.trim()
  return t || undefined
}

/** Next unpaid milestone above current Goal balance, or null if complete. */
export function nextMilestone(
  currentCents: number,
  targetCents: number,
): number | null {
  const list = milestonesForTarget(targetCents)
  for (const m of list) {
    if (currentCents < m) return m
  }
  return null
}

/** Progress 0–1 from previous milestone (or 0) toward `next`. */
export function milestoneProgress(currentCents: number, nextCents: number, targetCents: number): number {
  const list = milestonesForTarget(targetCents)
  const prev = [...list].reverse().find((m) => m < nextCents) ?? 0
  const span = Math.max(1, nextCents - prev)
  return Math.min(1, Math.max(0, (currentCents - prev) / span))
}

export function weeksToMilestone(
  remainingCents: number,
  weeklyGoalInflowCents: number,
): number | null {
  if (remainingCents <= 0) return 0
  if (weeklyGoalInflowCents <= 0) return null
  return Math.ceil(remainingCents / weeklyGoalInflowCents)
}

export function crossedMilestones(
  prevCents: number,
  nextCents: number,
  targetCents?: number,
): number[] {
  const list =
    targetCents && targetCents > 0 ? milestonesForTarget(targetCents) : [...MILESTONES_CENTS]
  return list.filter((m) => prevCents < m && nextCents >= m)
}

/** Build default meta map for a target (for Settings editor). */
export function defaultMilestoneMeta(
  targetCents: number,
  goalName: string,
): MilestoneMetaMap {
  const out: MilestoneMetaMap = {}
  for (const c of milestonesForTarget(targetCents)) {
    out[String(c)] = { title: defaultMilestoneTitle(c, targetCents, goalName) }
  }
  return out
}
