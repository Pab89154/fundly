import { allocateCents, toCents } from './money'
import { applyDueRecurring, advanceDueDate, logWeeklyAllowanceTx, mondayOfISOWeek } from './recurring'
import { createEmptyState, type AppState } from '../types'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function baseState(): AppState {
  const s = createEmptyState()
  s.settings.onboardingComplete = true
  s.settings.timezone = 'America/Chicago'
  s.settings.timezoneSource = 'auto'
  s.settings.weeklyAllowanceCents = toCents(10)
  s.settings.allocation = { iphone: 60, spending: 20, extra: 10, charity: 10 }
  s.settings.allowanceAuto = { enabled: true, weekday: 1 } // Monday
  s.settings.reminders = {
    ...s.settings.reminders,
    notifyWeeklyReview: false,
  }
  s.transactions = []
  return s
}

{
  assert(advanceDueDate('2026-11-02', 'weekly') === '2026-11-09', 'weekly advance')
  assert(advanceDueDate('2026-01-31', 'monthly') === '2026-02-28', 'monthly end clamp')
  assert(mondayOfISOWeek('2026-11-01') === '2026-10-26', 'monday of week')
}

{
  const state = baseState()
  // Monday Nov 2 2026
  const { state: next, events } = applyDueRecurring(state, {
    todayISO: '2026-11-02',
    now: new Date('2026-11-02T18:00:00Z'),
  })
  const allowances = events.filter((e) => e.kind === 'allowance')
  assert(allowances.length === 1, 'only the current due week (no 12-week backfill)')
  const last = allowances[0]!
  assert(last.date === '2026-11-02', 'due on Monday')
  const again = applyDueRecurring(next, { todayISO: '2026-11-02' })
  assert(again.events.filter((e) => e.kind === 'allowance').length === 0, 'no double allowance')
  const midweek = applyDueRecurring(baseState(), {
    todayISO: '2026-11-04', // Wed — most recent Monday is Nov 2
    now: new Date('2026-11-04T18:00:00Z'),
  })
  const midAllow = midweek.events.filter((e) => e.kind === 'allowance')
  assert(midAllow.length === 1 && midAllow[0]!.date === '2026-11-02', 'mid-week posts this week’s Monday')
  assert(last.externalId === 'recurring:allowance:week:2026-11-02', 'week-keyed id')
  const split = allocateCents(toCents(10), state.settings.allocation)
  const tx = next.transactions.find((t) => t.externalId === last.externalId)
  assert(tx?.allocation?.iphone === split.iphone, '60% goal')
  assert(tx?.allocation?.spending === split.spending, '20% spending')
  // Sunday still in Mon–Sun week that already has legacy day-keyed allowance
  const sundayState = baseState()
  sundayState.transactions.push({
    id: 'legacy',
    type: 'income',
    amountCents: toCents(10),
    date: '2026-11-01',
    source: 'allowance',
    allocation: split,
    externalId: 'recurring:allowance:2026-11-01',
    createdAt: new Date().toISOString(),
  })
  const sun = applyDueRecurring(sundayState, {
    todayISO: '2026-11-01',
    now: new Date('2026-11-01T18:00:00Z'),
  })
  assert(sun.events.filter((e) => e.kind === 'allowance').length === 0, 'legacy week blocks re-post')
}

{
  const state = baseState()
  state.settings.allowanceAuto.enabled = false
  state.settings.subscriptions = [
    {
      id: 'sub1',
      name: 'Apps',
      amountCents: toCents(5),
      cadence: 'monthly',
      anchorDate: '2026-11-01',
      nextDueDate: '2026-11-01',
      enabled: true,
      fromAccount: 'spending',
      createdAt: new Date().toISOString(),
    },
  ]
  // No spending money — should skip
  const { events } = applyDueRecurring(state, { todayISO: '2026-11-01' })
  const skip = events.find((e) => e.kind === 'subscription_skip')
  assert(skip && skip.kind === 'subscription_skip', 'skip when broke')
  assert(skip.fromAccount === 'spending', 'skip names the pot')
}

{
  const state = baseState()
  state.settings.allowanceAuto.enabled = false
  // Seed spending pot via income
  const alloc = allocateCents(toCents(100), state.settings.allocation)
  state.transactions.push({
    id: 'seed',
    type: 'income',
    amountCents: toCents(100),
    date: '2026-10-01',
    allocation: alloc,
    source: 'other',
    createdAt: new Date().toISOString(),
  })
  state.settings.subscriptions = [
    {
      id: 'sub2',
      name: 'Netflix',
      amountCents: toCents(5),
      cadence: 'monthly',
      anchorDate: '2026-11-01',
      nextDueDate: '2026-11-01',
      enabled: true,
      fromAccount: 'spending',
      createdAt: new Date().toISOString(),
    },
  ]
  const { state: next, events } = applyDueRecurring(state, { todayISO: '2026-11-01' })
  assert(events.some((e) => e.kind === 'subscription'), 'subscription applied')
  const sub = next.settings.subscriptions[0]!
  assert(sub.nextDueDate === '2026-12-01', 'next due advanced')
}

{
  // Goal pot short → skip with fromAccount iphone even if Spending has cash
  const state = baseState()
  state.settings.allowanceAuto.enabled = false
  state.transactions.push({
    id: 'seed-spend',
    type: 'income',
    amountCents: toCents(50),
    date: '2026-10-01',
    allocation: { iphone: 0, spending: toCents(50), extra: 0, charity: 0 },
    source: 'other',
    createdAt: new Date().toISOString(),
  })
  state.settings.subscriptions = [
    {
      id: 'sub3',
      name: 'Cloud',
      amountCents: toCents(10),
      cadence: 'monthly',
      anchorDate: '2026-11-01',
      nextDueDate: '2026-11-01',
      enabled: true,
      fromAccount: 'iphone',
      createdAt: new Date().toISOString(),
    },
  ]
  const { events } = applyDueRecurring(state, { todayISO: '2026-11-01' })
  const skip = events.find((e) => e.kind === 'subscription_skip')
  assert(skip && skip.kind === 'subscription_skip', 'skip when goal pot short')
  assert(skip.fromAccount === 'iphone', 'skip reports Goal pot')
}

{
  // Charge from Extra when that pot has enough
  const state = baseState()
  state.settings.allowanceAuto.enabled = false
  state.transactions.push({
    id: 'seed-extra',
    type: 'income',
    amountCents: toCents(20),
    date: '2026-10-01',
    allocation: { iphone: 0, spending: 0, extra: toCents(20), charity: 0 },
    source: 'other',
    createdAt: new Date().toISOString(),
  })
  state.settings.subscriptions = [
    {
      id: 'sub4',
      name: 'Music',
      amountCents: toCents(8),
      cadence: 'monthly',
      anchorDate: '2026-11-01',
      nextDueDate: '2026-11-01',
      enabled: true,
      fromAccount: 'extra',
      createdAt: new Date().toISOString(),
    },
  ]
  const { state: next, events } = applyDueRecurring(state, { todayISO: '2026-11-01' })
  const charged = events.find((e) => e.kind === 'subscription')
  assert(charged && charged.kind === 'subscription', 'charged from Extra')
  assert(charged.fromAccount === 'extra', 'event fromAccount')
  const tx = next.transactions.find((t) => t.tags?.includes('subscription'))
  assert(tx?.fromAccount === 'extra', 'tx debits Extra')
}

{
  // Primary short + combineWith covers → two slices, advances due
  const state = baseState()
  state.settings.allowanceAuto.enabled = false
  state.transactions.push({
    id: 'seed-split',
    type: 'income',
    amountCents: toCents(15),
    date: '2026-10-01',
    allocation: { iphone: 0, spending: toCents(5), extra: toCents(10), charity: 0 },
    source: 'other',
    createdAt: new Date().toISOString(),
  })
  state.settings.subscriptions = [
    {
      id: 'sub5',
      name: 'Combo',
      amountCents: toCents(12),
      cadence: 'monthly',
      anchorDate: '2026-11-01',
      nextDueDate: '2026-11-01',
      enabled: true,
      fromAccount: 'spending',
      combineWith: 'extra',
      createdAt: new Date().toISOString(),
    },
  ]
  const { state: next, events } = applyDueRecurring(state, { todayISO: '2026-11-01' })
  assert(events.some((e) => e.kind === 'subscription'), 'combine subscription charged')
  const parts = next.transactions.filter((t) => t.tags?.includes('subscription'))
  assert(parts.length === 2, 'two combine slices')
  assert(parts.some((t) => !t.fromAccount && t.amountCents === toCents(5)), 'spending drained')
  assert(parts.some((t) => t.fromAccount === 'extra' && t.amountCents === toCents(7)), 'extra tops up')
  assert(next.settings.subscriptions[0]!.nextDueDate === '2026-12-01', 'combine advances due')
}

{
  // Combine still short → skip
  const state = baseState()
  state.settings.allowanceAuto.enabled = false
  state.transactions.push({
    id: 'seed-tiny',
    type: 'income',
    amountCents: toCents(6),
    date: '2026-10-01',
    allocation: { iphone: 0, spending: toCents(3), extra: toCents(3), charity: 0 },
    source: 'other',
    createdAt: new Date().toISOString(),
  })
  state.settings.subscriptions = [
    {
      id: 'sub6',
      name: 'TooBig',
      amountCents: toCents(10),
      cadence: 'monthly',
      anchorDate: '2026-11-01',
      nextDueDate: '2026-11-01',
      enabled: true,
      fromAccount: 'spending',
      combineWith: 'extra',
      createdAt: new Date().toISOString(),
    },
  ]
  const { events } = applyDueRecurring(state, { todayISO: '2026-11-01' })
  assert(events.some((e) => e.kind === 'subscription_skip'), 'combine still skips when short')
}

{
  const state = baseState()
  state.settings.allowanceAuto.enabled = false
  const res = logWeeklyAllowanceTx(state, { todayISO: '2026-11-03' }) // Tue → week Mon Nov 2
  assert(res.ok, 'manual allowance ok')
  const res2 = logWeeklyAllowanceTx(res.state, { todayISO: '2026-11-03' })
  assert(!res2.ok, 'manual allowance deduped')
}

console.log('recurring.test.ts: all assertions passed')
