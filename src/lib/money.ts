/** Cent-accurate money helpers. All balances use integer cents. */

export type AccountId = 'iphone' | 'spending' | 'extra'

export type AllocationPct = {
  iphone: number
  spending: number
  extra: number
}

export type AllocationCents = {
  iphone: number
  spending: number
  extra: number
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
  return Math.round((pct.iphone + pct.spending + pct.extra) * 1000) / 1000
}

export function isValidAllocationPct(pct: AllocationPct): boolean {
  return (
    pct.iphone >= 0 &&
    pct.spending >= 0 &&
    pct.extra >= 0 &&
    Math.abs(allocationPctSum(pct) - 100) < 0.001
  )
}

/** Split total cents by percentages; remainder cents go to largest remainder so parts sum exactly. */
export function allocateCents(totalCents: number, pct: AllocationPct): AllocationCents {
  const total = Math.trunc(Number(totalCents) || 0)
  if (total === 0) return { iphone: 0, spending: 0, extra: 0 }

  const sign = total < 0 ? -1 : 1
  const abs = Math.abs(total)

  const raw = [
    { key: 'iphone' as const, exact: (abs * pct.iphone) / 100 },
    { key: 'spending' as const, exact: (abs * pct.spending) / 100 },
    { key: 'extra' as const, exact: (abs * pct.extra) / 100 },
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

  const out: AllocationCents = { iphone: 0, spending: 0, extra: 0 }
  for (const f of floors) out[f.key] = sign * f.floor
  return out
}

export function sumAllocation(a: AllocationCents): number {
  return a.iphone + a.spending + a.extra
}

export const MILESTONES_CENTS = [10000, 25000, 50000, 100000, 150000, 200000] as const

export function milestoneLabel(cents: number): string {
  if (cents >= 200000) return '$2,000 goal completed!'
  return `First ${formatUsd(cents)} saved`
}

export function crossedMilestones(prevCents: number, nextCents: number): number[] {
  return MILESTONES_CENTS.filter((m) => prevCents < m && nextCents >= m)
}
