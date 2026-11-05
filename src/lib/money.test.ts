/**
 * Run with: npm run test:money
 * Imports money.ts only (Node ESM needs .ts extensions; balances.ts uses bare paths for Vite).
 */
import {
  allocateCents,
  effectiveAllocation,
  isValidAllocationPct,
  planSpendAcrossPots,
  toCents,
  validateExactSlices,
  type AllocationCents,
} from './money.ts'
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
      const amt = Math.abs(tx.amountCents)
      const from = tx.fromAccount ?? 'spending'
      if (from === 'iphone') iphone -= amt
      else if (from === 'extra') extra -= amt
      else if (from === 'charity') charity -= amt
      else spending -= amt
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

// Travel Mode folds Extra % into Spending
{
  const off = effectiveAllocation({ allocation: SPLIT, travelMode: false })
  assert(off.extra === 10 && off.spending === 20, 'travel off keeps Extra')
  const on = effectiveAllocation({ allocation: SPLIT, travelMode: true })
  assert(on.extra === 0, 'travel on Extra 0')
  assert(on.spending === 30, 'travel on Spending gets Extra share')
  assert(on.iphone === 60 && on.charity === 10, 'travel keeps Goal/Charity')
  const a = allocateCents(toCents(100), on)
  assert(a.extra === 0, 'travel allocate Extra 0')
  assert(a.spending === 3000, 'travel allocate Spending 30%')
}

// Exact multi-pot slices
{
  const bal = { iphone: 5000, spending: 2000, extra: 1500, charity: 500 }
  const ok = validateExactSlices(bal, 2500, [
    { account: 'spending', cents: 1500 },
    { account: 'extra', cents: 1000 },
  ])
  assert(ok.ok, 'exact slices ok')
  const badSum = validateExactSlices(bal, 2500, [{ account: 'spending', cents: 1000 }])
  assert(!badSum.ok, 'exact sum mismatch')
  const over = validateExactSlices(bal, 3000, [
    { account: 'spending', cents: 2000 },
    { account: 'extra', cents: 1000 },
  ])
  assert(over.ok, 'exact within balances')
  const tooMuch = validateExactSlices(bal, 4000, [
    { account: 'spending', cents: 3000 },
    { account: 'extra', cents: 1000 },
  ])
  assert(!tooMuch.ok, 'exact over balance')
}

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

// spend from Goal pot — Spending balance unchanged
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
      amountCents: toCents(10),
      date: '2026-01-04',
      fromAccount: 'iphone',
      createdAt: '',
    },
  ]
  const b = balancesOf(txs)
  assert(b.iphone === 6000 - 1000, 'spend-from-goal: goal -10')
  assert(b.spending === 2000, 'spend-from-goal: spending unchanged')
  assert(b.extra === 1000, 'spend-from-goal: extra untouched')
  assert(b.charity === 1000, 'spend-from-goal: charity untouched')
}

// combine spend across pots
{
  const bal = { iphone: 6000, spending: 500, extra: 1000, charity: 1000 }
  const plan = planSpendAcrossPots(bal, 2000, 'spending', ['extra', 'iphone'])
  assert(plan.ok, 'combine plan ok')
  if (plan.ok) {
    assert(plan.slices[0]?.account === 'spending' && plan.slices[0]?.cents === 500, 'primary 5')
    assert(plan.slices[1]?.account === 'extra' && plan.slices[1]?.cents === 1000, 'extra 10')
    assert(plan.slices[2]?.account === 'iphone' && plan.slices[2]?.cents === 500, 'goal 5')
  }
  const short = planSpendAcrossPots(bal, 9000, 'spending', ['extra'])
  assert(!short.ok, 'combine still short')
}

console.log('money.test.ts: all assertions passed')
