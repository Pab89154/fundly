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
  assert(midAllow.length === 1 && midAllow[0]!.date === '2026-11-02', 'mid-week posts only last due day')
  const split = allocateCents(toCents(10), state.settings.allocation)
  const tx = next.transactions.find((t) => t.externalId === last.externalId)
  assert(tx?.allocation?.iphone === split.iphone, '60% goal')
  assert(tx?.allocation?.spending === split.spending, '20% spending')
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
      createdAt: new Date().toISOString(),
    },
  ]
  // No spending money — should skip
  const { events } = applyDueRecurring(state, { todayISO: '2026-11-01' })
  assert(events.some((e) => e.kind === 'subscription_skip'), 'skip when broke')
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
      createdAt: new Date().toISOString(),
    },
  ]
  const { state: next, events } = applyDueRecurring(state, { todayISO: '2026-11-01' })
  assert(events.some((e) => e.kind === 'subscription'), 'subscription applied')
  const sub = next.settings.subscriptions[0]!
  assert(sub.nextDueDate === '2026-12-01', 'next due advanced')
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
