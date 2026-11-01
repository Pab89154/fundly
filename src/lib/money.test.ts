/**
 * Run with: npm run test:money
 * Imports money.ts only (Node ESM needs .ts extensions; balances.ts uses bare paths for Vite).
 */
import { allocateCents, isValidAllocationPct, toCents, type AllocationCents } from './money.ts'
import type { Transaction } from '../types.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

/** Mirror of computeBalances for Node test runner (keeps Vite import style elsewhere). */
function balancesOf(transactions: Transaction[]) {
  let iphone = 0
  let spending = 0
  let extra = 0
  let charity = 0
  for (const tx of transactions) {
    if (tx.settledAt === null) continue
    if (
      tx.type === 'income' ||
      tx.type === 'import' ||
      tx.type === 'opening' ||
      tx.type === 'refund' ||
      tx.type === 'reconcile'
    ) {
      const a = tx.allocation as AllocationCents | undefined
      if (a) {
        iphone += a.iphone
        spending += a.spending
        extra += a.extra
        charity += a.charity ?? 0
      }
    } else if (tx.type === 'spending' || tx.type === 'apple_cash_purchase') {
      spending -= Math.abs(tx.amountCents)
    } else if (tx.type === 'transfer') {
      const amt = Math.abs(tx.amountCents)
      if (tx.fromAccount === 'iphone') iphone -= amt
      else if (tx.fromAccount === 'spending') spending -= amt
      else if (tx.fromAccount === 'extra') extra -= amt
      else if (tx.fromAccount === 'charity') charity -= amt
      if (tx.toAccount === 'iphone') iphone += amt
      else if (tx.toAccount === 'spending') spending += amt
      else if (tx.toAccount === 'extra') extra += amt
      else if (tx.toAccount === 'charity') charity += amt
    }
  }
  return { iphone, spending, extra, charity, combined: iphone + spending + extra + charity }
}

const SPLIT = { iphone: 60, spending: 20, extra: 10, charity: 10 }

// $100 → 60/20/10/10 exactly
{
  const a = allocateCents(toCents(100), SPLIT)
  assert(a.iphone === 6000, `$100 goal ${a.iphone}`)
  assert(a.spending === 2000, `$100 spending ${a.spending}`)
  assert(a.extra === 1000, `$100 extra ${a.extra}`)
  assert(a.charity === 1000, `$100 charity ${a.charity}`)
  assert(a.iphone + a.spending + a.extra + a.charity === 10_000, '$100 sum')
}

// $50 → 60/20/10/10
{
  const a = allocateCents(toCents(50), SPLIT)
  assert(a.iphone === 3000, `iphone ${a.iphone}`)
  assert(a.spending === 1000, `spending ${a.spending}`)
  assert(a.extra === 500, `extra ${a.extra}`)
  assert(a.charity === 500, `charity ${a.charity}`)
}

// remainder cents sum exactly
{
  const a = allocateCents(100, SPLIT)
  assert(a.iphone + a.spending + a.extra + a.charity === 100, 'sum 100')
}

assert(isValidAllocationPct(SPLIT), 'valid pct')
assert(!isValidAllocationPct({ iphone: 60, spending: 20, extra: 10, charity: 11 }), 'invalid pct')

// spend only hits spending — Goal/Extra/Charity untouched
{
  const incomeAlloc = allocateCents(toCents(100), SPLIT)
  const txs: Transaction[] = [
    {
      id: '1',
      type: 'income',
      amountCents: 10_000,
      date: '2026-01-01',
      source: 'allowance',
      allocation: incomeAlloc,
      createdAt: '',
    },
    {
      id: '2',
      type: 'spending',
      amountCents: toCents(15),
      date: '2026-01-02',
      createdAt: '',
    },
  ]
  const b = balancesOf(txs)
  assert(b.iphone === 6000, 'spend: goal untouched')
  assert(b.extra === 1000, 'spend: extra untouched')
  assert(b.charity === 1000, 'spend: charity untouched')
  assert(b.spending === 2000 - 1500, 'spend: spending 20-15')
  assert(b.combined === 10_000 - 1500, 'spend: combined drops only by spend')
}

// transfer Extra → Goal: only those two change; combined unchanged
{
  const incomeAlloc = allocateCents(toCents(100), SPLIT)
  const txs: Transaction[] = [
    {
      id: '1',
      type: 'income',
      amountCents: 10_000,
      date: '2026-01-01',
      source: 'allowance',
      allocation: incomeAlloc,
      createdAt: '',
    },
    {
      id: '2',
      type: 'transfer',
      amountCents: toCents(5),
      date: '2026-01-03',
      fromAccount: 'extra',
      toAccount: 'iphone',
      createdAt: '',
    },
  ]
  const before = balancesOf([txs[0]!])
  const after = balancesOf(txs)
  assert(after.iphone === before.iphone + 500, 'transfer: goal +5')
  assert(after.extra === before.extra - 500, 'transfer: extra -5')
  assert(after.spending === before.spending, 'transfer: spending unchanged')
  assert(after.charity === before.charity, 'transfer: charity unchanged')
  assert(after.combined === before.combined, 'transfer: combined unchanged')
}

console.log('money.test.ts: all assertions passed')
