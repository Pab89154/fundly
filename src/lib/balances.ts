import type { Balances, Transaction } from '../types'
import type { AccountId } from './money'

export function computeBalances(transactions: Transaction[]): Balances {
  let iphone = 0
  let spending = 0
  let extra = 0

  const add = (account: AccountId, cents: number) => {
    if (account === 'iphone') iphone += cents
    else if (account === 'spending') spending += cents
    else extra += cents
  }

  for (const tx of transactions) {
    switch (tx.type) {
      case 'income':
      case 'import':
      case 'opening':
      case 'refund':
      case 'reconcile': {
        const a = tx.allocation
        if (a) {
          iphone += a.iphone
          spending += a.spending
          extra += a.extra
        }
        break
      }
      case 'spending':
      case 'apple_cash_purchase': {
        spending -= Math.abs(tx.amountCents)
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
    combined: iphone + spending + extra,
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

/** PrintX earnings: income/import add allocation sum; refunds use signed allocation. */
export function printxEarningsCents(
  transactions: Transaction[],
  opts?: { since?: Date; printxSource?: 'stripe' | 'cash' },
): number {
  let sum = 0
  for (const tx of transactions) {
    if (!isPrintxTx(tx)) continue
    if (tx.type !== 'income' && tx.type !== 'import' && tx.type !== 'refund') continue
    if (opts?.printxSource && tx.printxSource !== opts.printxSource) continue
    if (opts?.since && new Date(tx.date) < opts.since) continue
    if (tx.allocation) {
      sum += tx.allocation.iphone + tx.allocation.spending + tx.allocation.extra
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

export function printxManualOrImportTotal(transactions: Transaction[]): number {
  return printxEarningsCents(transactions)
}
