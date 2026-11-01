import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  allocateCents,
  crossedMilestones,
  formatUsd,
  fromCents,
  isValidAllocationPct,
  localDateISO,
  normalizeAllocationPct,
  sumAllocation,
  toCents,
  type AccountId,
  type AllocationCents,
  type AllocationPct,
} from '../lib/money'
import { computeBalances } from '../lib/balances'
import { applyDueRecurring, logWeeklyAllowanceTx } from '../lib/recurring'
import { clearState, loadState, newId, saveState } from '../lib/storage'
import { detectDeviceTimeZone, isValidTimeZone, zonedDateISO } from '../lib/timezone'
import { fetchCloudState, logoutFundly, saveCloudState } from '../lib/fundlyApi'
import { maybeNotify } from '../lib/notify'
import {
  createEmptyState,
  goalTargetCents,
  normalizeActiveGoal,
  normalizeAllowanceAuto,
  normalizeBusinesses,
  normalizeReminders,
  normalizeSubscriptions,
  normalizeTimezoneSource,
  type AppState,
  type IncomeSource,
  type PrintxFeedEvent,
  type PrintxPaySource,
  type Settings,
  type SpendCategory,
  type Subscription,
  type Transaction,
} from '../types'

function isPrintxSettleEventId(id: string | undefined | null): boolean {
  return Boolean(id && String(id).startsWith('settle:'))
}

function isLegacyPrintxResolveTx(tx: Transaction): boolean {
  return (
    Boolean(tx.tags?.includes('resolve')) &&
    String(tx.externalId || '').startsWith('printx-resolve:')
  )
}

function isUndoablePrintxPayout(tx: Transaction): boolean {
  return isLegacyPrintxResolveTx(tx) || isPrintxSettleEventId(tx.externalId)
}

/** One-time: remove manual Fundly "Mark resolved" txs — pots come from PrintX settle:* only. */
function stripLegacyPrintxResolves(state: AppState): AppState {
  if (state.settings.printxAutoSettleV2) return state
  const hadLegacy = state.transactions.some(isLegacyPrintxResolveTx)
  const txs = state.transactions.filter((tx) => !isLegacyPrintxResolveTx(tx))
  const lastSettle = [...txs]
    .filter((tx) => isPrintxSettleEventId(tx.externalId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return {
    ...state,
    transactions: txs,
    settings: {
      ...state.settings,
      printxAutoSettleV2: true,
      printxOpenResolvedCents: 0,
      printxResolveUndo: null,
      printxLastResolvedCents: lastSettle?.amountCents ?? (hadLegacy ? 0 : state.settings.printxLastResolvedCents),
      printxLastResolvedAt: lastSettle?.settledAt ?? lastSettle?.createdAt ?? (hadLegacy ? null : state.settings.printxLastResolvedAt),
      printxIgnoredEventIds: Array.isArray(state.settings.printxIgnoredEventIds)
        ? state.settings.printxIgnoredEventIds
        : [],
    },
  }
}

type AddIncomeInput = {
  amountUsd: number
  source: IncomeSource
  date: string
  description?: string
  printxSource?: PrintxPaySource
}

type AddSpendInput = {
  amountUsd: number
  date: string
  description?: string
  category?: SpendCategory | string
  appleCash?: boolean
}

type TransferInput = {
  amountUsd: number
  from: AccountId
  to: AccountId
  date: string
  description?: string
}

type OnboardingInput = {
  /** Current Apple Cash / wallet total — split automatically 60/20/10/10 (or settings %). */
  appleCashUsd: number
  pastTransactions?: Array<{
    type: 'income' | 'spending' | 'transfer'
    amountUsd: number
    date: string
    description?: string
    source?: IncomeSource
    category?: string
    from?: AccountId
    to?: AccountId
  }>
}

type MoneyContextValue = {
  state: AppState
  balances: ReturnType<typeof computeBalances>
  addIncome: (input: AddIncomeInput) => { ok: true } | { ok: false; error: string }
  addSpending: (input: AddSpendInput) => { ok: true } | { ok: false; error: string }
  addTransfer: (input: TransferInput) => { ok: true } | { ok: false; error: string }
  updateTransaction: (id: string, patch: Partial<Transaction>) => { ok: true } | { ok: false; error: string }
  deleteTransaction: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => { ok: true } | { ok: false; error: string }
  completeOnboarding: (input: OnboardingInput) => { ok: true } | { ok: false; error: string }
  confirmAppleCash: (usd: number) => void
  reconcileAppleCash: (opts: {
    confirmedUsd: number
    note?: string
    /** If virtual != apple cash, adjust spending by difference (signed: virtual - apple) */
    applyAdjustment: boolean
  }) => { ok: true } | { ok: false; error: string }
  importPrintxEvents: (events: PrintxFeedEvent[]) => {
    imported: number
    skipped: number
    newMilestoneCents: number[]
  }
  /** Count a synced PrintX payout in your pots (after the money is actually yours). */
  settlePrintxTransaction: (id: string) => { ok: true } | { ok: false; error: string }
  settleAllPrintxPending: () => { ok: true; settled: number } | { ok: false; error: string }
  /** Redistribute current pot totals to match Settings split (e.g. fill Charity 10%). */
  rebalanceToAllocation: () =>
    | { ok: true; movedCents: number }
    | { ok: false; error: string }
  /** Update open "Owed to me" from PrintX sync. */
  setPrintxOpenOwed: (openOwedUsd: number) => void
  /**
   * @deprecated Manual resolve removed — Sync imports PrintX settlements.
   * Kept as a no-op for older UI builds.
   */
  resolvePrintxNow: () =>
    | { ok: true; resolvedCents: number; openCents: number; waitingCents: number }
    | { ok: false; error: string }
  /** Undo the last PrintX settlement import (or legacy Mark resolved). */
  undoResolvePrintx: () => { ok: true; undoneCents: number } | { ok: false; error: string }
  canUndoResolvePrintx: boolean
  /** Open "Owed to me" from PrintX (not yet Mark settled there). */
  printxOpenRemainingCents: number
  /** Import past funds from a parsed transaction statement. */
  importStatementRows: (
    rows: Array<{
      type: 'income' | 'spending'
      amountUsd: number
      date: string
      description?: string
      source?: IncomeSource
      category?: string
    }>,
  ) => { ok: true; imported: number; skipped: number } | { ok: false; error: string }
  resetAllData: () => void
  celebration: number | null
  dismissCelebration: () => void
  /** True when timezone is unset / detection failed — show picker. */
  needsTimezonePrompt: boolean
  setTimezoneManual: (tz: string) => { ok: true } | { ok: false; error: string }
  applyRecurringNow: () => { applied: number; events: string[] }
  logWeeklyAllowance: () => { ok: true } | { ok: false; error: string }
  upsertSubscription: (sub: Subscription) => { ok: true } | { ok: false; error: string }
  removeSubscription: (id: string) => void
  cloud: {
    ready: boolean
    empty: boolean
    lastError: string | null
    uploadLocalToCloud: () => Promise<{ ok: true } | { ok: false; error: string }>
    lockNow: () => Promise<void>
  }
}

function normalizeLoadedSettings(settings: Settings): Settings {
  const empty = createEmptyState().settings
  const activeGoal = normalizeActiveGoal(settings)
  const tzRaw = String(settings.timezone || '').trim()
  return {
    ...empty,
    ...settings,
    allocation: normalizeAllocationPct(settings.allocation),
    activeGoal,
    goalCents: activeGoal?.targetCents ?? 0,
    businesses: normalizeBusinesses(settings.businesses),
    timezone: isValidTimeZone(tzRaw) ? tzRaw : '',
    timezoneSource: normalizeTimezoneSource(settings.timezoneSource),
    allowanceAuto: normalizeAllowanceAuto(settings.allowanceAuto),
    subscriptions: normalizeSubscriptions(settings.subscriptions),
    reminders: normalizeReminders(settings.reminders),
    pushSubscription: settings.pushSubscription ?? null,
    lastWeeklyReviewNotifiedKey: settings.lastWeeklyReviewNotifiedKey ?? null,
    lastRecurringSkip: settings.lastRecurringSkip ?? null,
    printxIgnoredEventIds: Array.isArray(settings.printxIgnoredEventIds)
      ? settings.printxIgnoredEventIds
      : [],
  }
}

const MoneyContext = createContext<MoneyContextValue | null>(null)

export function MoneyProvider({
  children,
  cloudEnabled = false,
}: {
  children: ReactNode
  cloudEnabled?: boolean
}) {
  const [state, setState] = useState<AppState>(() => stripLegacyPrintxResolves(loadState()))
  const [celebration, setCelebration] = useState<number | null>(null)
  const [cloudReady, setCloudReady] = useState(!cloudEnabled)
  const [cloudEmpty, setCloudEmpty] = useState(false)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [cloudHydrated, setCloudHydrated] = useState(!cloudEnabled)

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    if (!cloudEnabled || !cloudHydrated) return
    const handle = window.setTimeout(() => {
      void saveCloudState(state).then((res) => {
        if (!res.ok) setCloudError(res.error)
        else {
          setCloudError(null)
          setCloudEmpty(false)
        }
      })
    }, 400)
    return () => window.clearTimeout(handle)
  }, [state, cloudEnabled, cloudHydrated])

  useEffect(() => {
    if (!cloudEnabled) return
    let cancelled = false
    void (async () => {
      const remote = await fetchCloudState()
      if (cancelled) return
      if (!remote.ok) {
        setCloudError(remote.error)
        setCloudReady(true)
        setCloudHydrated(true)
        return
      }
      setCloudEmpty(remote.empty)
      if (!remote.empty) {
        const next: AppState = {
          ...remote.state,
          settings: normalizeLoadedSettings(remote.state.settings as Settings),
        }
        const cleaned = stripLegacyPrintxResolves(next)
        setState(cleaned)
        saveState(cleaned)
      }
      setCloudReady(true)
      setCloudHydrated(true)
    })()
    return () => {
      cancelled = true
    }
  }, [cloudEnabled])

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme
    document.documentElement.classList.toggle('light', state.settings.theme === 'light')
  }, [state.settings.theme])

  // Auto-detect timezone; leave unset so UI can prompt if detection fails.
  useEffect(() => {
    if (!cloudHydrated) return
    setState((prev) => {
      const src = prev.settings.timezoneSource
      if (src === 'manual' && isValidTimeZone(prev.settings.timezone)) return prev
      const detected = detectDeviceTimeZone()
      if (detected) {
        if (prev.settings.timezone === detected && src === 'auto') return prev
        return {
          ...prev,
          settings: {
            ...prev.settings,
            timezone: detected,
            timezoneSource: 'auto',
          },
        }
      }
      if (src === 'unset' || !isValidTimeZone(prev.settings.timezone)) {
        return {
          ...prev,
          settings: { ...prev.settings, timezone: '', timezoneSource: 'unset' },
        }
      }
      return prev
    })
  }, [cloudHydrated])

  const recurringDayKey = useRef('')
  // Catch-up recurring once per local calendar day after hydrate / timezone ready
  useEffect(() => {
    if (!cloudHydrated) return
    if (!isValidTimeZone(state.settings.timezone)) return
    const dayKey = `${state.settings.timezone}:${zonedDateISO(state.settings.timezone)}`
    if (recurringDayKey.current === dayKey) return
    recurringDayKey.current = dayKey
    setState((prev) => {
      if (!isValidTimeZone(prev.settings.timezone)) return prev
      const { state: next, events } = applyDueRecurring(prev)
      if (events.length === 0) return prev
      for (const ev of events) {
        if (ev.kind === 'allowance' && next.settings.reminders.notifyAllowance) {
          maybeNotify('Allowance added', `+$${(ev.amountCents / 100).toFixed(2)} split into your pots.`, {
            tag: ev.externalId,
          })
        }
        if (ev.kind === 'subscription_skip' && next.settings.reminders.notifySubscriptionFail) {
          maybeNotify(
            'Subscription skipped',
            `${ev.name}: not enough Spending money.`,
            { tag: `skip-${ev.subscriptionId}-${ev.date}` },
          )
        }
        if (ev.kind === 'weekly_review' && next.settings.reminders.notifyWeeklyReview) {
          maybeNotify('See this week!', 'Open Fundly to see how you did.', {
            tag: ev.weekKey,
            url: '/#this-week',
          })
        }
      }
      return next
    })
  }, [cloudHydrated, state.settings.timezone])

  const balances = useMemo(() => computeBalances(state.transactions), [state.transactions])
  const needsTimezonePrompt =
    state.settings.timezoneSource === 'unset' || !isValidTimeZone(state.settings.timezone)
  /** Open on PrintX Money — Sync updates this; Mark settled on PrintX lowers it. */
  const printxOpenRemainingCents = Math.max(0, Number(state.settings.printxOpenOwedCents) || 0)
  const canUndoResolvePrintx = state.transactions.some(isUndoablePrintxPayout)

  const pushTx = useCallback((tx: Transaction, celebrateFrom?: number) => {
    setState((prev) => {
      const nextTxs = [...prev.transactions, tx]
      const nextBalances = computeBalances(nextTxs)
      const prevIphone = celebrateFrom ?? computeBalances(prev.transactions).iphone
      const crossed = crossedMilestones(prevIphone, nextBalances.iphone, goalTargetCents(prev.settings)).filter(
        (m) => !prev.settings.celebratedMilestones.includes(m),
      )
      if (crossed.length) {
        queueMicrotask(() => setCelebration(crossed[crossed.length - 1]!))
      }
      return {
        ...prev,
        transactions: nextTxs,
        settings: {
          ...prev.settings,
          celebratedMilestones: [
            ...prev.settings.celebratedMilestones,
            ...crossed.filter((m) => !prev.settings.celebratedMilestones.includes(m)),
          ],
        },
      }
    })
  }, [])

  const addIncome = useCallback(
    (input: AddIncomeInput) => {
      const cents = toCents(input.amountUsd)
      if (!(cents > 0)) return { ok: false as const, error: 'Enter an amount greater than $0.' }
      if (!input.date) return { ok: false as const, error: 'Choose a date.' }
      const allocation = allocateCents(cents, state.settings.allocation)
      const tx: Transaction = {
        id: newId(),
        type: 'income',
        amountCents: cents,
        date: input.date,
        description: input.description?.trim() || undefined,
        source: input.source,
        printxSource: input.source === 'printx' ? input.printxSource : undefined,
        allocation,
        createdAt: new Date().toISOString(),
      }
      pushTx(tx)
      return { ok: true as const }
    },
    [pushTx, state.settings.allocation],
  )

  const addSpending = useCallback(
    (input: AddSpendInput) => {
      const cents = toCents(input.amountUsd)
      if (!(cents > 0)) return { ok: false as const, error: 'Enter an amount greater than $0.' }
      const bal = computeBalances(state.transactions)
      if (cents > bal.spending) {
        return {
          ok: false as const,
          error: `Not enough spending money. Available: $${fromCents(bal.spending).toFixed(2)}.`,
        }
      }
      const tx: Transaction = {
        id: newId(),
        type: input.appleCash ? 'apple_cash_purchase' : 'spending',
        amountCents: cents,
        date: input.date || localDateISO(),
        description: input.description?.trim() || undefined,
        category: input.appleCash ? 'apple_cash' : input.category || 'other',
        createdAt: new Date().toISOString(),
      }
      pushTx(tx)
      return { ok: true as const }
    },
    [pushTx, state.transactions],
  )

  const addTransfer = useCallback(
    (input: TransferInput) => {
      const cents = toCents(input.amountUsd)
      if (!(cents > 0)) return { ok: false as const, error: 'Enter an amount greater than $0.' }
      if (input.from === input.to) return { ok: false as const, error: 'Pick two different accounts.' }
      const bal = computeBalances(state.transactions)
      const fromBal = bal[input.from]
      if (cents > fromBal) {
        return { ok: false as const, error: 'Not enough in the source account.' }
      }
      const tx: Transaction = {
        id: newId(),
        type: 'transfer',
        amountCents: cents,
        date: input.date || localDateISO(),
        description: input.description?.trim() || undefined,
        fromAccount: input.from,
        toAccount: input.to,
        createdAt: new Date().toISOString(),
      }
      pushTx(tx)
      return { ok: true as const }
    },
    [pushTx, state.transactions],
  )

  const deleteTransaction = useCallback((id: string) => {
    setState((prev) => {
      const removed = prev.transactions.find((t) => t.id === id)
      const importedEventIds = removed?.externalId
        ? prev.settings.importedEventIds.filter((e) => e !== removed.externalId)
        : prev.settings.importedEventIds
      return {
        ...prev,
        transactions: prev.transactions.filter((t) => t.id !== id),
        settings: { ...prev.settings, importedEventIds },
      }
    })
  }, [])

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Transaction>) => {
      let error: string | null = null
      setState((prev) => {
        const idx = prev.transactions.findIndex((t) => t.id === id)
        if (idx < 0) {
          error = 'Transaction not found.'
          return prev
        }
        const current = prev.transactions[idx]!
        const next = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() }

        if (
          (next.type === 'income' || next.type === 'import' || next.type === 'opening') &&
          next.amountCents != null &&
          !patch.allocation
        ) {
          next.allocation = allocateCents(Math.abs(next.amountCents), prev.settings.allocation)
        }

        if (next.type === 'spending' || next.type === 'apple_cash_purchase') {
          const others = prev.transactions.filter((t) => t.id !== id)
          const bal = computeBalances(others)
          if (Math.abs(next.amountCents) > bal.spending) {
            error = `Not enough spending money. Available: $${fromCents(bal.spending).toFixed(2)}.`
            return prev
          }
        }

        const copy = [...prev.transactions]
        copy[idx] = next
        return { ...prev, transactions: copy }
      })
      if (error) return { ok: false as const, error }
      return { ok: true as const }
    },
    [],
  )

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    if (patch.allocation && !isValidAllocationPct(patch.allocation)) {
      return { ok: false as const, error: 'Allocation percentages must add up to 100%.' }
    }
    setState((prev) => {
      const next = { ...prev.settings, ...patch }
      if ('activeGoal' in patch) {
        const g = normalizeActiveGoal({ ...next, activeGoal: patch.activeGoal ?? null })
        next.activeGoal = g
        next.goalCents = g?.targetCents ?? 0
      } else if (typeof patch.goalCents === 'number' && next.activeGoal) {
        next.activeGoal = {
          ...next.activeGoal,
          targetCents: Math.max(0, Math.trunc(patch.goalCents)),
          updatedAt: new Date().toISOString(),
        }
        next.goalCents = next.activeGoal.targetCents
      }
      if ('businesses' in patch) {
        next.businesses = normalizeBusinesses(patch.businesses ?? [])
      }
      if ('subscriptions' in patch) {
        next.subscriptions = normalizeSubscriptions(patch.subscriptions ?? [])
      }
      if ('allowanceAuto' in patch && patch.allowanceAuto) {
        next.allowanceAuto = normalizeAllowanceAuto(patch.allowanceAuto)
      }
      if ('reminders' in patch && patch.reminders) {
        next.reminders = normalizeReminders(patch.reminders)
      }
      if ('timezone' in patch && patch.timezone != null) {
        const tz = String(patch.timezone).trim()
        next.timezone = isValidTimeZone(tz) ? tz : next.timezone
      }
      if ('timezoneSource' in patch && patch.timezoneSource) {
        next.timezoneSource = normalizeTimezoneSource(patch.timezoneSource)
      }
      return { ...prev, settings: next }
    })
    return { ok: true as const }
  }, [])

  const setTimezoneManual = useCallback((tz: string) => {
    if (!isValidTimeZone(tz)) return { ok: false as const, error: 'Pick a valid timezone.' }
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, timezone: tz, timezoneSource: 'manual' },
    }))
    return { ok: true as const }
  }, [])

  const applyRecurringNow = useCallback(() => {
    let applied = 0
    const labels: string[] = []
    setState((prev) => {
      const { state: next, events } = applyDueRecurring(prev)
      applied = events.filter((e) => e.kind !== 'weekly_review').length
      for (const ev of events) {
        if (ev.kind === 'allowance') labels.push(`allowance ${ev.date}`)
        if (ev.kind === 'subscription') labels.push(`${ev.name} ${ev.date}`)
        if (ev.kind === 'subscription_skip') labels.push(`skipped ${ev.name}`)
        if (ev.kind === 'weekly_review') labels.push(`review ${ev.weekKey}`)
      }
      return events.length ? next : prev
    })
    return { applied, events: labels }
  }, [])

  const logWeeklyAllowance = useCallback(() => {
    let result: { ok: true } | { ok: false; error: string } = { ok: false, error: 'Unknown error' }
    setState((prev) => {
      const res = logWeeklyAllowanceTx(prev)
      if (!res.ok) {
        result = res
        return prev
      }
      result = { ok: true }
      return res.state
    })
    return result
  }, [])

  const upsertSubscription = useCallback((sub: Subscription) => {
    if (!sub.name.trim() || sub.amountCents <= 0) {
      return { ok: false as const, error: 'Name and amount are required.' }
    }
    setState((prev) => {
      const list = [...prev.settings.subscriptions]
      const idx = list.findIndex((s) => s.id === sub.id)
      if (idx >= 0) list[idx] = { ...sub, updatedAt: new Date().toISOString() }
      else list.push(sub)
      return {
        ...prev,
        settings: { ...prev.settings, subscriptions: normalizeSubscriptions(list) },
      }
    })
    return { ok: true as const }
  }, [])

  const removeSubscription = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        subscriptions: prev.settings.subscriptions.filter((s) => s.id !== id),
      },
    }))
  }, [])

  const completeOnboarding = useCallback((input: OnboardingInput) => {
    const apple = toCents(input.appleCashUsd)
    if (apple < 0) return { ok: false as const, error: 'Apple Cash balance cannot be negative.' }

    const today = localDateISO()

    // Virtual pots are calculated from how much you have right now (Apple Cash).
    setState((prev) => {
      const txs: Transaction[] = []
      const allocationPct = prev.settings.allocation
      const split = allocateCents(apple, allocationPct)
      if (apple > 0) {
        txs.push({
          id: newId(),
          type: 'opening',
          amountCents: apple,
          date: today,
          description: 'Current Apple Cash (auto-split)',
          source: 'opening',
          allocation: split,
          tags: ['opening'],
          createdAt: new Date().toISOString(),
        })
      }

      let spendingAvail = split.spending
      for (const p of input.pastTransactions ?? []) {
        const cents = toCents(p.amountUsd)
        if (!(cents > 0)) continue
        if (p.type === 'income') {
          const allocation = allocateCents(cents, allocationPct)
          txs.push({
            id: newId(),
            type: 'income',
            amountCents: cents,
            date: p.date || today,
            description: p.description,
            source: p.source || 'other',
            allocation,
            tags: ['opening', 'statement'],
            createdAt: new Date().toISOString(),
          })
          spendingAvail += allocation.spending
        } else if (p.type === 'spending') {
          if (cents > spendingAvail) continue
          txs.push({
            id: newId(),
            type: 'spending',
            amountCents: cents,
            date: p.date || today,
            description: p.description,
            category: p.category || 'other',
            tags: ['opening', 'statement'],
            createdAt: new Date().toISOString(),
          })
          spendingAvail -= cents
        } else if (p.type === 'transfer' && p.from && p.to) {
          txs.push({
            id: newId(),
            type: 'transfer',
            amountCents: cents,
            date: p.date || today,
            description: p.description,
            fromAccount: p.from,
            toAccount: p.to,
            tags: ['opening'],
            createdAt: new Date().toISOString(),
          })
        }
      }

      const iphoneBal = computeBalances(txs).iphone
      return {
        ...prev,
        transactions: txs,
        settings: {
          ...prev.settings,
          onboardingComplete: true,
          appleCashConfirmedCents: apple,
          appleCashConfirmedAt: new Date().toISOString(),
          celebratedMilestones: crossedMilestones(0, iphoneBal, goalTargetCents(prev.settings)),
        },
      }
    })
    return { ok: true as const }
  }, [])

  const confirmAppleCash = useCallback((usd: number) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        appleCashConfirmedCents: toCents(usd),
        appleCashConfirmedAt: new Date().toISOString(),
      },
    }))
  }, [])

  const reconcileAppleCash = useCallback(
    (opts: { confirmedUsd: number; note?: string; applyAdjustment: boolean }) => {
      const confirmed = toCents(opts.confirmedUsd)
      if (confirmed < 0) return { ok: false as const, error: 'Balance cannot be negative.' }
      setState((prev) => {
        const bal = computeBalances(prev.transactions)
        const diff = confirmed - bal.combined
        const txs = [...prev.transactions]
        if (opts.applyAdjustment && diff !== 0) {
          // Put adjustment on spending so iPhone/extra savings stay intentional
          txs.push({
            id: newId(),
            type: 'reconcile',
            amountCents: Math.abs(diff),
            date: localDateISO(),
            description: opts.note?.trim() || 'Apple Cash reconciliation adjustment',
            allocation: { iphone: 0, spending: diff, extra: 0, charity: 0 },
            tags: ['apple_cash', 'reconcile'],
            createdAt: new Date().toISOString(),
          })
        }
        return {
          ...prev,
          transactions: txs,
          settings: {
            ...prev.settings,
            appleCashConfirmedCents: confirmed,
            appleCashConfirmedAt: new Date().toISOString(),
          },
        }
      })
      return { ok: true as const }
    },
    [],
  )

  const importPrintxEvents = useCallback((events: PrintxFeedEvent[]) => {
    let imported = 0
    let skipped = 0
    const newMilestoneCents: number[] = []

    setState((prev) => {
      const base = stripLegacyPrintxResolves(prev)
      const ignored = new Set(base.settings.printxIgnoredEventIds || [])
      const byExternal = new Set(
        base.transactions.map((t) => t.externalId).filter(Boolean) as string[],
      )
      const ids = [...base.settings.importedEventIds]
      const knownIds = new Set(ids)
      let cursor = base.settings.syncCursor
      let txs = [...base.transactions]
      let lastResolvedCents = Number(base.settings.printxLastResolvedCents) || 0
      let lastResolvedAt = base.settings.printxLastResolvedAt
      let undo = base.settings.printxResolveUndo
      const iphoneBefore = computeBalances(base.transactions).iphone
      const celebrated = [...base.settings.celebratedMilestones]

      for (const ev of events) {
        if (!ev.eventId) {
          skipped += 1
          continue
        }
        if (ev.occurredAt && (!cursor || ev.occurredAt > cursor)) cursor = ev.occurredAt
        if (!isPrintxSettleEventId(ev.eventId)) {
          skipped += 1
          continue
        }
        if (ignored.has(ev.eventId) || byExternal.has(ev.eventId)) {
          if (!knownIds.has(ev.eventId)) {
            knownIds.add(ev.eventId)
            ids.push(ev.eventId)
          }
          skipped += 1
          continue
        }

        const amountCents = toCents(Math.abs(Number(ev.amountNetUsd) || 0))
        if (amountCents <= 0) {
          skipped += 1
          continue
        }

        const occurred = ev.occurredAt || new Date().toISOString()
        const allocation = allocateCents(amountCents, base.settings.allocation)
        const isRefund = ev.kind === 'refund' || ev.kind === 'reversal'
        const tx: Transaction = {
          id: newId(),
          type: isRefund ? 'refund' : 'income',
          amountCents,
          date: occurred.slice(0, 10),
          description: ev.description || `PrintX settled · ${formatUsd(amountCents)}`,
          source: 'printx',
          printxSource: ev.source === 'stripe' ? 'stripe' : 'cash',
          allocation: isRefund
            ? {
                iphone: -allocation.iphone,
                spending: -allocation.spending,
                extra: -allocation.extra,
                charity: -allocation.charity,
              }
            : allocation,
          externalId: ev.eventId,
          settledAt: occurred,
          tags: ['printx', 'settle', isRefund ? 'refund' : 'earned'],
          createdAt: new Date().toISOString(),
        }
        txs.push(tx)
        byExternal.add(ev.eventId)
        if (!knownIds.has(ev.eventId)) {
          knownIds.add(ev.eventId)
          ids.push(ev.eventId)
        }
        imported += 1
        if (!isRefund) {
          lastResolvedCents = amountCents
          lastResolvedAt = occurred
          undo = {
            at: occurred,
            prevOpenResolvedCents: 0,
            prevLastResolvedCents: Number(base.settings.printxLastResolvedCents) || 0,
            prevLastResolvedAt: base.settings.printxLastResolvedAt ?? null,
            resolveExternalId: ev.eventId,
            reSettledTxIds: [],
          }
        }
      }

      if (imported > 0) {
        const iphoneAfter = computeBalances(txs).iphone
        const crossed = crossedMilestones(iphoneBefore, iphoneAfter, goalTargetCents(base.settings)).filter(
          (m) => !celebrated.includes(m),
        )
        for (const m of crossed) {
          celebrated.push(m)
          newMilestoneCents.push(m)
        }
        if (crossed.length) {
          queueMicrotask(() => setCelebration(crossed[crossed.length - 1]!))
        }
      }

      return {
        ...base,
        transactions: txs,
        settings: {
          ...base.settings,
          importedEventIds: ids,
          syncCursor: cursor,
          lastSyncedAt: new Date().toISOString(),
          printxOpenResolvedCents: 0,
          printxLastResolvedCents: lastResolvedCents,
          printxLastResolvedAt: lastResolvedAt,
          printxResolveUndo: undo,
          celebratedMilestones: celebrated,
          printxAutoSettleV2: true,
        },
      }
    })

    return { imported, skipped, newMilestoneCents }
  }, [])

  const setPrintxOpenOwed = useCallback((openOwedUsd: number) => {
    const nextOpen = Math.max(0, toCents(openOwedUsd))
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        printxOpenOwedCents: nextOpen,
        printxOpenResolvedCents: 0,
        lastSyncedAt: new Date().toISOString(),
      },
    }))
  }, [])

  const resolvePrintxNow = useCallback(() => {
    return {
      ok: false as const,
      error: 'Mark resolved in Fundly is gone — Mark settled on PrintX, then Sync here.',
    }
  }, [])

  const undoResolvePrintx = useCallback(() => {
    let undoneCents = 0
    let error: string | null = null

    setState((prev) => {
      const last = [...prev.transactions]
        .filter(isUndoablePrintxPayout)
        .sort((a, b) => {
          const at = (t: Transaction) => t.settledAt || t.createdAt || t.date
          return at(b).localeCompare(at(a))
        })[0]

      if (!last) {
        error = 'Nothing to undo.'
        return prev
      }

      undoneCents = Math.abs(last.amountCents)
      const ignored = [...(prev.settings.printxIgnoredEventIds || [])]
      if (isPrintxSettleEventId(last.externalId) && last.externalId && !ignored.includes(last.externalId)) {
        ignored.push(last.externalId)
      }

      const txs = prev.transactions.filter((t) => t.id !== last.id)
      const nextLast = [...txs]
        .filter(isUndoablePrintxPayout)
        .sort((a, b) => (b.settledAt || b.createdAt).localeCompare(a.settledAt || a.createdAt))[0]

      return {
        ...prev,
        transactions: txs,
        settings: {
          ...prev.settings,
          printxOpenResolvedCents: 0,
          printxLastResolvedCents: nextLast ? Math.abs(nextLast.amountCents) : 0,
          printxLastResolvedAt: nextLast ? nextLast.settledAt || nextLast.createdAt : null,
          printxResolveUndo: null,
          printxIgnoredEventIds: ignored,
          importedEventIds: last.externalId
            ? prev.settings.importedEventIds.filter((id) => id !== last.externalId)
            : prev.settings.importedEventIds,
        },
      }
    })

    if (error) return { ok: false as const, error }
    return { ok: true as const, undoneCents }
  }, [])

  const settlePrintxTransaction = useCallback((id: string) => {
    let error: string | null = null
    setState((prev) => {
      const idx = prev.transactions.findIndex((t) => t.id === id)
      if (idx < 0) {
        error = 'Transaction not found.'
        return prev
      }
      const tx = prev.transactions[idx]!
      if (tx.settledAt !== null) {
        error = 'Already settled.'
        return prev
      }
      const iphoneBefore = computeBalances(prev.transactions).iphone
      const nextTx = {
        ...tx,
        settledAt: new Date().toISOString(),
        tags: [...(tx.tags || []).filter((t) => t !== 'unsettled'), 'settled'],
        updatedAt: new Date().toISOString(),
      }
      const copy = [...prev.transactions]
      copy[idx] = nextTx
      const iphoneAfter = computeBalances(copy).iphone
      const crossed = crossedMilestones(iphoneBefore, iphoneAfter, goalTargetCents(prev.settings)).filter(
        (m) => !prev.settings.celebratedMilestones.includes(m),
      )
      if (crossed.length) {
        queueMicrotask(() => setCelebration(crossed[crossed.length - 1]!))
      }
      return {
        ...prev,
        transactions: copy,
        settings: {
          ...prev.settings,
          celebratedMilestones: [...prev.settings.celebratedMilestones, ...crossed],
        },
      }
    })
    if (error) return { ok: false as const, error }
    return { ok: true as const }
  }, [])

  const settleAllPrintxPending = useCallback(() => {
    let settled = 0
    setState((prev) => {
      const pending = prev.transactions.filter((tx) => tx.settledAt === null)
      settled = pending.length
      if (!pending.length) return prev
      const iphoneBefore = computeBalances(prev.transactions).iphone
      const now = new Date().toISOString()
      const pendingIds = new Set(pending.map((t) => t.id))
      const copy = prev.transactions.map((tx) =>
        pendingIds.has(tx.id)
          ? {
              ...tx,
              settledAt: now,
              tags: [...(tx.tags || []).filter((t) => t !== 'unsettled'), 'settled'],
              updatedAt: now,
            }
          : tx,
      )
      const iphoneAfter = computeBalances(copy).iphone
      const crossed = crossedMilestones(iphoneBefore, iphoneAfter, goalTargetCents(prev.settings)).filter(
        (m) => !prev.settings.celebratedMilestones.includes(m),
      )
      if (crossed.length) {
        queueMicrotask(() => setCelebration(crossed[crossed.length - 1]!))
      }
      return {
        ...prev,
        transactions: copy,
        settings: {
          ...prev.settings,
          celebratedMilestones: [...prev.settings.celebratedMilestones, ...crossed],
        },
      }
    })
    if (!settled) return { ok: false as const, error: 'Nothing waiting to settle.' }
    return { ok: true as const, settled }
  }, [])

  const importStatementRows = useCallback(
    (
      rows: Array<{
        type: 'income' | 'spending'
        amountUsd: number
        date: string
        description?: string
        source?: IncomeSource
        category?: string
      }>,
    ) => {
      if (!rows.length) return { ok: false as const, error: 'No rows to import.' }

      const snapshot = state
      const txs = [...snapshot.transactions]
      let running = computeBalances(txs)
      const iphoneBefore = running.iphone
      let imported = 0
      let skipped = 0
      const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date))

      for (const row of ordered) {
        const cents = toCents(row.amountUsd)
        if (!(cents > 0)) {
          skipped += 1
          continue
        }
        if (row.type === 'income') {
          const allocation = allocateCents(cents, snapshot.settings.allocation)
          txs.push({
            id: newId(),
            type: 'income',
            amountCents: cents,
            date: row.date,
            description: row.description?.trim() || 'Statement import',
            source: row.source || 'other',
            allocation,
            tags: ['statement', 'past'],
            createdAt: new Date().toISOString(),
          })
          running.iphone += allocation.iphone
          running.spending += allocation.spending
          running.extra += allocation.extra
          running.charity += allocation.charity
          running.combined =
            running.iphone + running.spending + running.extra + running.charity
          imported += 1
        } else if (cents > running.spending) {
          skipped += 1
        } else {
          txs.push({
            id: newId(),
            type: 'spending',
            amountCents: cents,
            date: row.date,
            description: row.description?.trim() || 'Statement purchase',
            category: row.category || 'other',
            tags: ['statement', 'past'],
            createdAt: new Date().toISOString(),
          })
          running.spending -= cents
          running.combined =
            running.iphone + running.spending + running.extra + running.charity
          imported += 1
        }
      }

      if (imported === 0) {
        return {
          ok: false as const,
          error:
            skipped > 0
              ? `Nothing imported. ${skipped} row(s) skipped (often spends without enough Spending Money — import income first or raise spending balance).`
              : 'Nothing imported.',
        }
      }

      const crossed = crossedMilestones(iphoneBefore, running.iphone, goalTargetCents(snapshot.settings)).filter(
        (m) => !snapshot.settings.celebratedMilestones.includes(m),
      )
      if (crossed.length) {
        queueMicrotask(() => setCelebration(crossed[crossed.length - 1]!))
      }

      setState({
        ...snapshot,
        transactions: txs,
        settings: {
          ...snapshot.settings,
          celebratedMilestones: [...snapshot.settings.celebratedMilestones, ...crossed],
        },
      })

      return { ok: true as const, imported, skipped }
    },
    [state],
  )

  const rebalanceToAllocation = useCallback(() => {
    let movedCents = 0
    let error: string | null = null
    setState((prev) => {
      const bal = computeBalances(prev.transactions)
      if (bal.combined <= 0) {
        error = 'Nothing to rebalance yet.'
        return prev
      }
      if (!isValidAllocationPct(prev.settings.allocation)) {
        error = 'Fix allocation percentages in Settings first (must add to 100%).'
        return prev
      }
      const target = allocateCents(bal.combined, prev.settings.allocation)
      const delta: AllocationCents = {
        iphone: target.iphone - bal.iphone,
        spending: target.spending - bal.spending,
        extra: target.extra - bal.extra,
        charity: target.charity - bal.charity,
      }
      movedCents =
        Math.abs(delta.iphone) +
        Math.abs(delta.spending) +
        Math.abs(delta.extra) +
        Math.abs(delta.charity)
      if (movedCents === 0) {
        error = 'Pots already match your split.'
        return prev
      }
      if (sumAllocation(delta) !== 0) {
        error = 'Rebalance math failed — combined would change.'
        return prev
      }
      // Also refresh unsettled PrintX splits so charity is included when you settle them.
      const txs = prev.transactions.map((tx) => {
        if (tx.settledAt !== null || !tx.allocation) return tx
        const signed =
          tx.type === 'refund' ? -Math.abs(tx.amountCents) : Math.abs(tx.amountCents)
        return {
          ...tx,
          allocation: allocateCents(signed, prev.settings.allocation),
          updatedAt: new Date().toISOString(),
        }
      })
      const a = prev.settings.allocation
      txs.push({
        id: newId(),
        type: 'reconcile',
        amountCents: Math.floor(movedCents / 2),
        date: localDateISO(),
        description: `Rebalanced pots to ${a.iphone}/${a.spending}/${a.extra}/${a.charity}`,
        allocation: delta,
        tags: ['rebalance'],
        createdAt: new Date().toISOString(),
      })
      return { ...prev, transactions: txs }
    })
    if (error) return { ok: false as const, error }
    return { ok: true as const, movedCents }
  }, [])

  const resetAllData = useCallback(() => {
    clearState()
    setState(createEmptyState())
    setCelebration(null)
  }, [])

  const uploadLocalToCloud = useCallback(async () => {
    const res = await saveCloudState(state)
    if (!res.ok) {
      setCloudError(res.error)
      return res
    }
    setCloudEmpty(false)
    setCloudError(null)
    return res
  }, [state])

  const lockNow = useCallback(async () => {
    await logoutFundly()
    window.location.reload()
  }, [])

  const value: MoneyContextValue = {
    state,
    balances,
    printxOpenRemainingCents,
    canUndoResolvePrintx,
    addIncome,
    addSpending,
    addTransfer,
    updateTransaction,
    deleteTransaction,
    updateSettings,
    completeOnboarding,
    confirmAppleCash,
    reconcileAppleCash,
    importPrintxEvents,
    settlePrintxTransaction,
    settleAllPrintxPending,
    rebalanceToAllocation,
    setPrintxOpenOwed,
    resolvePrintxNow,
    undoResolvePrintx,
    importStatementRows,
    resetAllData,
    celebration,
    dismissCelebration: () => setCelebration(null),
    needsTimezonePrompt,
    setTimezoneManual,
    applyRecurringNow,
    logWeeklyAllowance,
    upsertSubscription,
    removeSubscription,
    cloud: {
      ready: cloudReady,
      empty: cloudEmpty,
      lastError: cloudError,
      uploadLocalToCloud,
      lockNow,
    },
  }

  if (cloudEnabled && !cloudReady) {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center">
        <p className="text-[var(--muted)]">Loading your Fundly cloud data…</p>
      </div>
    )
  }

  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>
}

export function useMoney(): MoneyContextValue {
  const ctx = useContext(MoneyContext)
  if (!ctx) throw new Error('useMoney must be used within MoneyProvider')
  return ctx
}

export type { AllocationPct }
