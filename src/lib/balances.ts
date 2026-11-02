import type { Balances, Transaction } from '../types'
import type { AccountId } from './money'
import { normalizeAllocationCents, parseLocalDate, sumAllocation } from './money'

export function computeBalances(transactions: Transaction[]): Balances {
  let iphone = 0
  let spending = 0
  let extra = 0
  let charity = 0

  const add = (account: AccountId, cents: number) => {
    if (account === 'iphone') iphone += cents
    else if (account === 'spending') spending += cents
    else if (account === 'charity') charity += cents
    else extra += cents
  }

  for (const tx of transactions) {
    // Synced PrintX payouts with settledAt: null wait for Mark settled in Savings.
    // Legacy rows without settledAt still count; manual PrintX income counts immediately.
    if (tx.settledAt === null) continue

    switch (tx.type) {
      case 'income':
      case 'import':
      case 'opening':
      case 'refund':
      case 'reconcile': {
        const a = tx.allocation ? normalizeAllocationCents(tx.allocation) : null
        if (a) {
          iphone += a.iphone
          spending += a.spending
          extra += a.extra
          charity += a.charity
        }
        break
      }
      case 'spending':
      case 'apple_cash_purchase': {
        // Default pot is Spending; optional fromAccount lets a purchase pull Goal/Extra/Charity.
        const from = tx.fromAccount ?? 'spending'
        add(from, -Math.abs(tx.amountCents))
        break
      }
      case 'transfer': {
        const amt = Math.abs(tx.amountCents)
        if (tx.fromAccount) add(tx.fromAccount, -amt)
        if (tx.toAccount) add(tx.toAccount, amt)
        break
      }
      default:
        break
    }
  }

  return {
    iphone,
    spending,
    extra,
    charity,
    combined: iphone + spending + extra + charity,
  }
}

export function weekNumber(d = new Date()): number {
  const start = new Date(Date.UTC(d.getFullYear(), 0, 1))
  const diff = d.getTime() - start.getTime()
  return Math.ceil((diff / 86400000 + start.getUTCDay() + 1) / 7)
}

export function startOfWeek(d = new Date()): Date {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() + diff)
  return x
}

export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function estimateGoalDate(opts: {
  remainingCents: number
  weeklyAllowanceCents: number
  expectedPrintxWeeklyCents: number
  iphonePct: number
}): Date | null {
  const weeklyIn = opts.weeklyAllowanceCents + opts.expectedPrintxWeeklyCents
  const weeklyToIphone = Math.floor((weeklyIn * opts.iphonePct) / 100)
  if (weeklyToIphone <= 0 || opts.remainingCents <= 0) {
    return opts.remainingCents <= 0 ? new Date() : null
  }
  const weeks = Math.ceil(opts.remainingCents / weeklyToIphone)
  const d = new Date()
  d.setDate(d.getDate() + weeks * 7)
  return d
}

function isPrintxTx(tx: Transaction): boolean {
  if (tx.externalId) return tx.type === 'import' || tx.type === 'refund' || tx.type === 'income'
  return tx.source === 'printx'
}

/** PrintX earnings that count in pots (settled only). */
export function printxEarningsCents(
  transactions: Transaction[],
  opts?: { since?: Date; printxSource?: 'stripe' | 'cash'; includeUnsettled?: boolean },
): number {
  let sum = 0
  for (const tx of transactions) {
    if (!isPrintxTx(tx)) continue
    if (tx.type !== 'income' && tx.type !== 'import' && tx.type !== 'refund') continue
    if (!opts?.includeUnsettled && tx.settledAt === null) continue
    if (opts?.printxSource && tx.printxSource !== opts.printxSource) continue
    if (opts?.since && parseLocalDate(tx.date) < opts.since) continue
    if (tx.allocation) {
      sum += sumAllocation(normalizeAllocationCents(tx.allocation))
    } else {
      sum += tx.type === 'refund' ? -Math.abs(tx.amountCents) : Math.abs(tx.amountCents)
    }
  }
  return sum
}

export function printxUnsettledCents(transactions: Transaction[]): number {
  let sum = 0
  for (const tx of transactions) {
    if (!isPrintxTx(tx)) continue
    if (tx.type !== 'income' && tx.type !== 'import' && tx.type !== 'refund') continue
    if (tx.settledAt !== null) continue
    if (tx.allocation) {
      sum += sumAllocation(normalizeAllocationCents(tx.allocation))
    } else {
      sum += tx.type === 'refund' ? -Math.abs(tx.amountCents) : Math.abs(tx.amountCents)
    }
  }
  return sum
}

export function allowanceTotalCents(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === 'income' && t.source === 'allowance')
    .reduce((s, t) => s + Math.abs(t.amountCents), 0)
}

/** Manual business income — allocation sum when present. */
export function businessEarningsCents(
  transactions: Transaction[],
  source: string,
  opts?: { since?: Date },
): number {
  let sum = 0
  for (const tx of transactions) {
    if (tx.source !== source) continue
    if (tx.type !== 'income' && tx.type !== 'import' && tx.type !== 'refund') continue
    if (opts?.since && parseLocalDate(tx.date) < opts.since) continue
    if (tx.allocation) {
      sum += sumAllocation(normalizeAllocationCents(tx.allocation))
    } else {
      sum += tx.type === 'refund' ? -Math.abs(tx.amountCents) : Math.abs(tx.amountCents)
    }
  }
  return sum
}

export function printxManualOrImportTotal(transactions: Transaction[]): number {
  return printxEarningsCents(transactions)
}
