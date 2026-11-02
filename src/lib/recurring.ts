import {
  ACCOUNT_LABELS,
  allocateCents,
  normalizeAllocationCents,
  planSpendAcrossPots,
  sumAllocation,
  type AccountId,
} from './money'
import { computeBalances } from './balances'
import {
  addDaysISO,
  addMonthsISO,
  compareISODate,
  zonedDateISO,
  zonedIsoWeekKey,
  zonedWeekday,
} from './timezone'
import type {
  AppState,
  RecurringSkipNotice,
  Settings,
  Subscription,
  Transaction,
} from '../types'

export type RecurringApplyEvent =
  | { kind: 'allowance'; date: string; amountCents: number; externalId: string }
  | {
      kind: 'subscription'
      date: string
      amountCents: number
      externalId: string
      subscriptionId: string
      name: string
      fromAccount: AccountId
    }
  | {
      kind: 'subscription_skip'
      date: string
      amountCents: number
      subscriptionId: string
      name: string
      fromAccount: AccountId
    }
  | { kind: 'weekly_review'; weekKey: string }

export type RecurringApplyResult = {
  state: AppState
  events: RecurringApplyEvent[]
}

function newTxId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function hasExternalId(transactions: Transaction[], externalId: string): boolean {
  return transactions.some((t) => t.externalId === externalId)
}

/** Next due after applying for `due` on this cadence. */
export function advanceDueDate(due: string, cadence: Subscription['cadence']): string {
  if (cadence === 'weekly') return addDaysISO(due, 7)
  if (cadence === 'monthly') return addMonthsISO(due, 1)
  return addMonthsISO(due, 12)
}

/** One allowance per Mon–Sun week — keyed by that week’s Monday. */
export function allowanceWeekExternalId(anyDayInWeek: string): string {
  return `recurring:allowance:week:${mondayOfISOWeek(anyDayInWeek)}`
}

function subscriptionExternalId(id: string, dueDate: string): string {
  return `recurring:sub:${id}:${dueDate}`
}

/** True if this Mon–Sun week already has an allowance (new or legacy externalId). */
export function hasAllowanceForWeek(transactions: Transaction[], anyDayInWeek: string): boolean {
  const monday = mondayOfISOWeek(anyDayInWeek)
  const weekExt = allowanceWeekExternalId(monday)
  for (const t of transactions) {
    const ext = String(t.externalId || '')
    if (ext === weekExt) return true
    // Legacy: recurring:allowance:YYYY-MM-DD (day-keyed)
    if (ext.startsWith('recurring:allowance:') && !ext.startsWith('recurring:allowance:week:')) {
      const day = ext.slice('recurring:allowance:'.length)
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && mondayOfISOWeek(day) === monday) return true
    }
  }
  return false
}

/** Monday of the Mon–Sun week containing `iso` (YYYY-MM-DD). */
export function mondayOfISOWeek(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  const day = dt.getDay()
  const diff = day === 0 ? -6 : 1 - day
  dt.setDate(dt.getDate() + diff)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Apply all due recurring items up through `todayISO` in settings.timezone.
 * Idempotent via externalId. Does not go negative on subscriptions.
 */
export function applyDueRecurring(
  state: AppState,
  opts?: { now?: Date; todayISO?: string },
): RecurringApplyResult {
  const tz =
    state.settings.timezone && state.settings.timezone.trim()
      ? state.settings.timezone
      : 'America/Chicago'
  const now = opts?.now ?? new Date()
  const today = opts?.todayISO ?? zonedDateISO(tz, now)
  const events: RecurringApplyEvent[] = []

  let transactions = [...state.transactions]
  let settings: Settings = {
    ...state.settings,
    subscriptions: state.settings.subscriptions.map((s) => ({ ...s })),
    allowanceAuto: { ...state.settings.allowanceAuto },
    reminders: { ...state.settings.reminders },
  }

  // --- Auto allowance (weekly on configured weekday; weeks are Mon–Sun) ---
  // Posts at most once per week after the chosen weekday has arrived — never prior weeks.
  if (settings.allowanceAuto.enabled && settings.weeklyAllowanceCents > 0) {
    const targetWd = settings.allowanceAuto.weekday
    const weekMonday = mondayOfISOWeek(today)
    const fromMonday = targetWd === 0 ? 6 : targetWd - 1
    const due = addDaysISO(weekMonday, fromMonday)
    if (compareISODate(due, today) <= 0 && !hasAllowanceForWeek(transactions, today)) {
      const cents = settings.weeklyAllowanceCents
      const allocation = allocateCents(cents, settings.allocation)
      const ext = allowanceWeekExternalId(today)
      const tx: Transaction = {
        id: newTxId('allow'),
        type: 'income',
        amountCents: cents,
        date: due,
        description: 'Weekly allowance (auto)',
        source: 'allowance',
        allocation,
        externalId: ext,
        tags: ['recurring', 'allowance'],
        createdAt: new Date().toISOString(),
      }
      transactions.push(tx)
      events.push({ kind: 'allowance', date: due, amountCents: cents, externalId: ext })
    }
  }

  // --- Subscriptions (primary pot, optional combine partner) ---
  const skips: RecurringSkipNotice[] = []
  settings.subscriptions = settings.subscriptions.map((sub) => {
    if (!sub.enabled || sub.amountCents <= 0) return sub
    const fromAccount: AccountId = sub.fromAccount || 'spending'
    const helpers: AccountId[] =
      sub.combineWith && sub.combineWith !== fromAccount ? [sub.combineWith] : []
    let next = sub.nextDueDate
    let updated = sub
    while (compareISODate(next, today) <= 0) {
      const ext = subscriptionExternalId(sub.id, next)
      if (hasExternalId(transactions, ext)) {
        next = advanceDueDate(next, sub.cadence)
        updated = { ...updated, nextDueDate: next, updatedAt: new Date().toISOString() }
        continue
      }
      const bal = computeBalances(transactions)
      const plan = planSpendAcrossPots(bal, sub.amountCents, fromAccount, helpers)
      if (!plan.ok) {
        events.push({
          kind: 'subscription_skip',
          date: next,
          amountCents: sub.amountCents,
          subscriptionId: sub.id,
          name: sub.name,
          fromAccount,
        })
        skips.push({
          subscriptionId: sub.id,
          name: sub.name,
          amountCents: sub.amountCents,
          dueDate: next,
          at: new Date().toISOString(),
        })
        // Do not advance past a failed due — retry next open/cron
        break
      }
      const nowIso = new Date().toISOString()
      const combineId = plan.slices.length > 1 ? newTxId('comb') : undefined
      for (let i = 0; i < plan.slices.length; i++) {
        const slice = plan.slices[i]!
        const multi = plan.slices.length > 1
        const tx: Transaction = {
          id: newTxId('sub'),
          type: 'spending',
          amountCents: slice.cents,
          date: next,
          description: multi
            ? `${sub.name} (subscription · ${ACCOUNT_LABELS[slice.account]} part)`
            : `${sub.name} (subscription · ${ACCOUNT_LABELS[slice.account]})`,
          category: sub.category || 'other',
          fromAccount: slice.account === 'spending' ? undefined : slice.account,
          // Idempotency key on the first slice only
          externalId: i === 0 ? ext : undefined,
          tags: [
            'subscription',
            sub.id,
            'recurring',
            `from:${slice.account}`,
            ...(combineId
              ? ['combine', `combine:${combineId}`, i === 0 ? 'combine-primary' : 'combine-part']
              : []),
          ],
          createdAt: nowIso,
        }
        transactions.push(tx)
      }
      events.push({
        kind: 'subscription',
        date: next,
        amountCents: sub.amountCents,
        externalId: ext,
        subscriptionId: sub.id,
        name: sub.name,
        fromAccount,
      })
      next = advanceDueDate(next, sub.cadence)
      updated = { ...updated, nextDueDate: next, updatedAt: nowIso }
    }
    return updated
  })

  if (skips.length > 0) {
    settings.lastRecurringSkip = skips[skips.length - 1]!
  }

  // --- Weekly review notify key (caller/push layer sends; we just mark readiness) ---
  const reminders = settings.reminders
  if (reminders.notifyWeeklyReview) {
    const wd = zonedWeekday(tz, now)
    if (wd === reminders.weeklyReviewWeekday) {
      const weekKey = zonedIsoWeekKey(tz, now)
      if (settings.lastWeeklyReviewNotifiedKey !== weekKey) {
        events.push({ kind: 'weekly_review', weekKey })
        // Marking happens after successful notify; caller may set. We set here for client catch-up UX.
        settings.lastWeeklyReviewNotifiedKey = weekKey
      }
    }
  }

  return {
    state: { ...state, settings, transactions },
    events,
  }
}

/** One-tap / manual allowance for the Mon–Sun week containing `today` (deduped). */
export function logWeeklyAllowanceTx(
  state: AppState,
  opts?: { todayISO?: string; now?: Date },
): { ok: true; state: AppState } | { ok: false; error: string } {
  const tz = state.settings.timezone || 'America/Chicago'
  const today = opts?.todayISO ?? zonedDateISO(tz, opts?.now ?? new Date())
  if (hasAllowanceForWeek(state.transactions, today)) {
    return { ok: false, error: 'Allowance for this week is already logged.' }
  }
  const cents = state.settings.weeklyAllowanceCents
  if (cents <= 0) return { ok: false, error: 'Set a weekly allowance amount in Settings first.' }
  const allocation = allocateCents(cents, state.settings.allocation)
  const ext = allowanceWeekExternalId(today)
  const tx: Transaction = {
    id: newTxId('allow'),
    type: 'income',
    amountCents: cents,
    date: today,
    description: 'Weekly allowance',
    source: 'allowance',
    allocation,
    externalId: ext,
    tags: ['allowance'],
    createdAt: new Date().toISOString(),
  }
  return {
    ok: true,
    state: { ...state, transactions: [...state.transactions, tx] },
  }
}

export function weekStats(
  transactions: Transaction[],
  weekStartISO: string,
  weekEndISO: string,
): { incomeCents: number; spentCents: number; goalGainedCents: number } {
  let incomeCents = 0
  let spentCents = 0
  let goalGainedCents = 0
  for (const tx of transactions) {
    if (compareISODate(tx.date, weekStartISO) < 0 || compareISODate(tx.date, weekEndISO) > 0) continue
    if (tx.settledAt === null) continue
    if (tx.type === 'income' || tx.type === 'import' || tx.type === 'opening' || tx.type === 'refund') {
      if (tx.allocation) {
        const a = normalizeAllocationCents(tx.allocation)
        const sum = sumAllocation(a)
        if (tx.type === 'refund') {
          incomeCents -= sum
          goalGainedCents -= a.iphone
        } else {
          incomeCents += sum
          goalGainedCents += a.iphone
        }
      } else {
        const amt = Math.abs(tx.amountCents)
        incomeCents += tx.type === 'refund' ? -amt : amt
      }
    } else if (tx.type === 'spending' || tx.type === 'apple_cash_purchase') {
      spentCents += Math.abs(tx.amountCents)
    }
  }
  return { incomeCents, spentCents, goalGainedCents }
}
