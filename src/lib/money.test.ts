import { allocateCents, isValidAllocationPct, toCents } from './money.ts'
import { computeBalances } from './balances.ts'
import type { Transaction } from '../types.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// $50 → 70/20/10
{
  const a = allocateCents(toCents(50), { iphone: 70, spending: 20, extra: 10 })
  assert(a.iphone === 3500, `iphone ${a.iphone}`)
  assert(a.spending === 1000, `spending ${a.spending}`)
  assert(a.extra === 500, `extra ${a.extra}`)
}

// remainder cents sum exactly
{
  const a = allocateCents(100, { iphone: 70, spending: 20, extra: 10 })
  assert(a.iphone + a.spending + a.extra === 100, 'sum 100')
}

assert(isValidAllocationPct({ iphone: 70, spending: 20, extra: 10 }), 'valid pct')
assert(!isValidAllocationPct({ iphone: 70, spending: 20, extra: 11 }), 'invalid pct')

// spend only hits spending
{
  const txs: Transaction[] = [
    {
      id: '1',
      type: 'income',
      amountCents: 5000,
      date: '2026-01-01',
      source: 'printx',
      allocation: { iphone: 3500, spending: 1000, extra: 500 },
      createdAt: '',
    },
    {
      id: '2',
      type: 'spending',
      amountCents: 400,
      date: '2026-01-02',
      createdAt: '',
    },
  ]
  const b = computeBalances(txs)
  assert(b.iphone === 3500, 'iphone untouched')
  assert(b.extra === 500, 'extra untouched')
  assert(b.spending === 600, 'spending 1000-400')
}

console.log('money.test.ts: all assertions passed')
