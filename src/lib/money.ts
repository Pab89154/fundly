/** Cent-accurate money helpers. All balances use integer cents. */

export type AccountId = 'iphone' | 'spending' | 'extra' | 'charity'

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

/** Milestone checkpoints for a goal target (5% … 100%). */
export function milestonesForTarget(targetCents: number): number[] {
  const target = Math.trunc(Number(targetCents) || 0)
  if (target <= 0) return []
  const fracs = [0.05, 0.125, 0.25, 0.5, 0.75, 1]
  const set = new Set<number>()
  for (const f of fracs) {
    set.add(Math.max(1, Math.round(target * f)))
  }
  set.add(target)
  return [...set].filter((c) => c > 0 && c <= target).sort((a, b) => a - b)
}

export function milestoneLabel(
  cents: number,
  opts?: { targetCents?: number; goalName?: string },
): string {
  const target = opts?.targetCents ?? 0
  const name = opts?.goalName?.trim() || 'Goal'
  if (target > 0 && cents >= target) return `${name} completed!`
  return `First ${formatUsd(cents)} saved`
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
