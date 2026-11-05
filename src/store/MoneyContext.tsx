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
  ACCOUNT_LABELS,
  allocateCents,
  effectiveAllocation,
  formatUsd,
  fromCents,
  isValidAllocationPct,
  localDateISO,
  normalizeAllocationPct,
  planSpendAcrossPots,
  sumAllocation,
  toCents,
  type AccountId,
  type AllocationCents,
  type AllocationPct,
  type SpendSlice,
} from '../lib/money'
import { computeBalances } from '../lib/balances'
import {
  activityStreakWeeks,
  habitWeekXpIfDue,
  isGenuineActivityTx,
  levelFromXp,
  normalizeXpHistory,
  streakNudgeIfDue,
  streakThresholdXpIfDue,
  tryAwardXp,
  weeklyReviewXpIfDue,
  XP,
} from '../lib/gamification'
import { applyGoalUnlocks, type CelebrationPayload } from '../lib/milestones'
import { applyDueRecurring, logWeeklyAllowanceTx } from '../lib/recurring'
import { clearState, loadState, newId, saveState } from '../lib/storage'
import { detectDeviceTimeZone, isValidTimeZone, zonedDateISO } from '../lib/timezone'
import { fetchCloudState, fetchPrintxSync, logoutFundly, saveCloudState } from '../lib/fundlyApi'
import { maybeNotify } from '../lib/notify'
import {
  createEmptyState,
  migrateAchievementState,
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

/** Drop invented multi-week auto-allowance posts (old catch-up backfilled ~12 weeks). */
function isPhantomAutoAllowance(tx: Transaction): boolean {
  if (tx.source !== 'allowance') return false
  if ((tx.description || '').includes('(auto)')) return true
  return Boolean(
    tx.tags?.includes('recurring') &&
      tx.tags?.includes('allowance') &&
      String(tx.externalId || '').startsWith('recurring:allowance:') &&
      (tx.description || '') === 'Weekly allowance (auto)',
  )
}

function stripPhantomAutoAllowances(state: AppState): AppState {
  if (state.settings.allowanceBackfillClearedV1) return state
  const txs = state.transactions.filter((tx) => !isPhantomAutoAllowance(tx))
  if (txs.length === state.transactions.length) {
    return {
      ...state,
      settings: { ...state.settings, allowanceBackfillClearedV1: true },
    }
  }
  return {
    ...state,
    transactions: txs,
    settings: { ...state.settings, allowanceBackfillClearedV1: true },
  }
}

/** One-time: remove manual Fundly "Mark resolved" txs — pots come from PrintX settle:* only. */
function stripLegacyPrintxResolves(state: AppState): AppState {
  const afterAllow = stripPhantomAutoAllowances(state)
  if (afterAllow.settings.printxAutoSettleV2) return afterAllow
  const hadLegacy = afterAllow.transactions.some(isLegacyPrintxResolveTx)
  const txs = afterAllow.transactions.filter((tx) => !isLegacyPrintxResolveTx(tx))
  const lastSettle = [...txs]
    .filter((tx) => isPrintxSettleEventId(tx.externalId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return {
    ...afterAllow,
    transactions: txs,
    settings: {
      ...afterAllow.settings,
      printxAutoSettleV2: true,
      printxOpenResolvedCents: 0,
      printxResolveUndo: null,
      printxLastResolvedCents: lastSettle?.amountCents ?? (hadLegacy ? 0 : afterAllow.settings.printxLastResolvedCents),
      printxLastResolvedAt: lastSettle?.settledAt ?? lastSettle?.createdAt ?? (hadLegacy ? null : afterAllow.settings.printxLastResolvedAt),
      printxIgnoredEventIds: Array.isArray(afterAllow.settings.printxIgnoredEventIds)
        ? afterAllow.settings.printxIgnoredEventIds
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
  /** Which pot pays first — defaults to Spending Money. */
  fromAccount?: AccountId
  /** Extra pots to pull from when the primary pot is short (combine). */
  combineFrom?: AccountId[]
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
  addSpending: (
    input: AddSpendInput,
  ) =>
    | { ok: true; slices: SpendSlice[] }
    | {
        ok: false
        error: string
        shortfallCents?: number
        availableCents?: number
        fromAccount?: AccountId
      }
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
  /** Pull PrintX feed and apply settlements (also runs once after each login). */
  syncPrintxNow: () => Promise<
    | { ok: true; imported: number; openOwedUsd?: number }
    | { ok: false; error: string; configured?: boolean }
  >
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
  celebration: CelebrationPayload | null
  dismissCelebration: () => void
  /** Award weekly-review XP once when This Week is viewed. */
  markWeeklyReviewSeen: () => void
  /** True when timezone is unset / detection failed — show picker. */
  needsTimezonePrompt: boolean
  setTimezoneManual: (tz: string) => { ok: true } | { ok: false; error: string }
  applyRecurringNow: () => { applied: number; events: string[] }
  logWeeklyAllowance: () => { ok: true } | { ok: false; error: string }
  upsertSubscription: (sub: Subscription) => { ok: true } | { ok: false; error: string }
  removeSubscription: (id: string) => void
  /** Travel Mode: merge Extra into Spending until turned off. */
  setTravelMode: (enabled: boolean) => { ok: true } | { ok: false; error: string }
  cloud: {
    ready: boolean
    empty: boolean
    lastError: string | null
    uploadLocalToCloud: () => Promise<{ ok: true } | { ok: false; error: string }>
    lockNow: () => Promise<void>
  }
}

function normalizeLoadedSettings(settings: Settings, goalBalanceCents = 0): Settings {
  const empty = createEmptyState().settings
  const activeGoal = normalizeActiveGoal(settings)
  const tzRaw = String(settings.timezone || '').trim()
  const base: Settings = {
    ...empty,
    ...settings,
    allocation: normalizeAllocationPct(settings.allocation),
    travelMode: Boolean(settings.travelMode),
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
    xpTotal: Math.max(0, Math.trunc(Number(settings.xpTotal) || 0)),
    xpHistory: normalizeXpHistory(settings.xpHistory),
    lastStreakXpWeekKey: settings.lastStreakXpWeekKey
      ? String(settings.lastStreakXpWeekKey)
      : null,
    lastHabitWeekXpKey: settings.lastHabitWeekXpKey
      ? String(settings.lastHabitWeekXpKey)
      : settings.lastStreakXpWeekKey
        ? String(settings.lastStreakXpWeekKey)
        : null,
    lastWeeklyReviewXpKey: settings.lastWeeklyReviewXpKey
      ? String(settings.lastWeeklyReviewXpKey)
      : null,
    lastStreak7XpKey: settings.lastStreak7XpKey ? String(settings.lastStreak7XpKey) : null,
    lastStreak30XpKey: settings.lastStreak30XpKey ? String(settings.lastStreak30XpKey) : null,
    lastStreakNudgeKey: settings.lastStreakNudgeKey ? String(settings.lastStreakNudgeKey) : null,
  }
  const migrated = migrateAchievementState(base, goalBalanceCents)
  return { ...base, ...migrated }
}

function preferCelebration(
  milestone: CelebrationPayload | null,
  levelUp: CelebrationPayload | null,
): CelebrationPayload | null {
  if (milestone?.type === 'milestone' && milestone.isFinal) return milestone
  if (levelUp) return levelUp
  return milestone
}

function applyGamification(
  settings: Settings,
  transactions: Transaction[],
  prevIphone: number,
  nextIphone: number,
  opts?: { awardTxs?: Transaction[] },
): { settings: Settings; celebration: CelebrationPayload | null } {
  const beforeLevel = levelFromXp(settings.xpTotal || 0).level
  let next: Settings = { ...settings }

  for (const tx of opts?.awardTxs || []) {
    if (!isGenuineActivityTx(tx) && !(tx.source === 'printx' && tx.settledAt !== null)) continue
    if (tx.source === 'printx' || (tx.type === 'import' && String(tx.externalId || '').startsWith('settle:'))) {
      if (tx.settledAt === null) continue
      const r = tryAwardXp(next, {
        id: `printx:${tx.id}`,
        kind: 'printx',
        amount: XP.printxPayment,
        label: 'PrintX payment recorded',
        refId: tx.id,
      })
      next = r.settings
      continue
    }
    if (tx.type === 'income') {
      const r = tryAwardXp(next, {
        id: `income:${tx.id}`,
        kind: 'income',
        amount: XP.genuineIncome,
        label: 'Income logged',
        refId: tx.id,
      })
      next = r.settings
      continue
    }
    if (tx.type === 'spending' || tx.type === 'apple_cash_purchase') {
      const r = tryAwardXp(next, {
        id: `spend:${tx.id}`,
        kind: 'spend',
        amount: XP.purchase,
        label: 'Purchase recorded',
        refId: tx.id,
      })
      next = r.settings
    }
  }

  const unlock = applyGoalUnlocks(next, prevIphone, nextIphone)
  next = { ...next, ...unlock.settingsPatch }

  const tz = next.timezone || 'America/Chicago'
  const pushOn = Boolean(next.reminders?.webPushEnabled)
  const streakNotify = next.reminders?.notifyStreak !== false

  const habit = habitWeekXpIfDue(next, transactions, tz)
  if (habit) {
    const r = tryAwardXp(next, {
      id: habit.id,
      kind: 'habit_week',
      amount: XP.weeklySavingsHabit,
      label: 'Weekly savings habit',
      refId: habit.weekKey,
    })
    next = {
      ...r.settings,
      lastHabitWeekXpKey: habit.weekKey,
      lastStreakXpWeekKey: habit.weekKey,
    }
    if (r.awarded && pushOn && streakNotify) {
      queueMicrotask(() =>
        maybeNotify(
          'Weekly savings habit!',
          `+${XP.weeklySavingsHabit} XP — your Goal pot grew this week. Keep marking income in Fundly.`,
          { tag: habit.id, url: '/savings' },
        ),
      )
    }
  }

  const weeks = activityStreakWeeks(transactions, tz)
  for (const s of streakThresholdXpIfDue(next, weeks, tz)) {
    const r = tryAwardXp(next, {
      id: s.id,
      kind: s.kind,
      amount: s.amount,
      label: s.label,
      refId: s.day,
    })
    next = { ...r.settings, [s.keyField]: s.day }
    if (r.awarded && pushOn && streakNotify) {
      queueMicrotask(() =>
        maybeNotify(
          s.kind === 'streak30' ? '12-week streak!' : '4-week streak!',
          `+${s.amount} XP — keep earning and mark it in Fundly each week.`,
          { tag: s.id, url: '/savings' },
        ),
      )
    }
  }

  const after = levelFromXp(next.xpTotal || 0)
  let levelUp: CelebrationPayload | null = null
  if (after.level > beforeLevel) {
    levelUp = {
      type: 'levelUp',
      level: after.level,
      name: after.name,
      xpTotal: next.xpTotal || 0,
    }
  }

  return {
    settings: next,
    celebration: preferCelebration(unlock.celebration, levelUp),
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
  const [celebration, setCelebration] = useState<CelebrationPayload | null>(null)
  const [cloudReady, setCloudReady] = useState(!cloudEnabled)
  const [cloudEmpty, setCloudEmpty] = useState(false)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [cloudHydrated, setCloudHydrated] = useState(!cloudEnabled)
  const printxLoginSyncRef = useRef(false)

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
          settings: normalizeLoadedSettings(
            remote.state.settings as Settings,
            computeBalances((remote.state.transactions as Transaction[]) || []).iphone,
          ),
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
    document.documentElement.classList.toggle('travel', Boolean(state.settings.travelMode))
  }, [state.settings.theme, state.settings.travelMode])

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
      let settings = next.settings
      const pushOn = settings.reminders.webPushEnabled

      for (const ev of events) {
        if (pushOn && ev.kind === 'allowance' && settings.reminders.notifyAllowance) {
          maybeNotify('Allowance added', `+$${(ev.amountCents / 100).toFixed(2)} split into your pots.`, {
            tag: ev.externalId,
            url: '/',
          })
        }
        if (pushOn && ev.kind === 'subscription_skip' && settings.reminders.notifySubscriptionFail) {
          const pot =
            ev.fromAccount === 'iphone'
              ? 'Goal'
              : ev.fromAccount === 'extra'
                ? 'Extra'
                : ev.fromAccount === 'charity'
                  ? 'Charity'
                  : 'Spending'
          maybeNotify(
            `${ev.name} can’t pay from ${pot}`,
            `Not enough in ${pot}. Open Fundly to pick another pot or combine with a second pot.`,
            { tag: `skip-${ev.subscriptionId}-${ev.date}`, url: '/recurring' },
          )
        }
        if (pushOn && ev.kind === 'weekly_review' && settings.reminders.notifyWeeklyReview) {
          maybeNotify('See this week!', 'Open Fundly to see how you did.', {
            tag: ev.weekKey,
            url: '/#this-week',
          })
        }
      }

      // Keep-your-streak nudge: earn money and mark it in Fundly this week
      if (pushOn && settings.reminders.notifyStreak !== false) {
        const nudge = streakNudgeIfDue(settings, next.transactions, settings.timezone)
        if (nudge) {
          maybeNotify(
            `Keep your ${nudge.streakWeeks}-week streak!`,
            'Earn more money and mark it in Fundly this week so your streak doesn’t break.',
            { tag: `streak-nudge-${nudge.today}`, url: '/income' },
          )
          settings = { ...settings, lastStreakNudgeKey: nudge.today }
        }
      }

      if (events.length === 0 && settings === next.settings) return prev
      return { ...next, settings }
    })
  }, [cloudHydrated, state.settings.timezone])

  const balances = useMemo(() => computeBalances(state.transactions), [state.transactions])
  const needsTimezonePrompt =
    state.settings.timezoneSource === 'unset' || !isValidTimeZone(state.settings.timezone)
  /** Open on PrintX Money — Sync updates this; Mark settled on PrintX lowers it. */
  const printxOpenRemainingCents = Math.max(0, Number(state.settings.printxOpenOwedCents) || 0)
  const canUndoResolvePrintx = state.transactions.some(isUndoablePrintxPayout)

  const pushTxs = useCallback((txs: Transaction[], celebrateFrom?: number) => {
    if (txs.length === 0) return
    setState((prev) => {
      const nextTxs = [...prev.transactions, ...txs]
      const nextBalances = computeBalances(nextTxs)
      const prevIphone = celebrateFrom ?? computeBalances(prev.transactions).iphone
      const { settings, celebration: cele } = applyGamification(
        prev.settings,
        nextTxs,
        prevIphone,
        nextBalances.iphone,
        { awardTxs: txs },
      )
      if (cele) queueMicrotask(() => setCelebration(cele))
      return { ...prev, transactions: nextTxs, settings }
    })
  }, [])

  const pushTx = useCallback(
    (tx: Transaction, celebrateFrom?: number) => {
      pushTxs([tx], celebrateFrom)
    },
    [pushTxs],
  )

  const addIncome = useCallback(
    (input: AddIncomeInput) => {
      const cents = toCents(input.amountUsd)
      if (!(cents > 0)) return { ok: false as const, error: 'Enter an amount greater than $0.' }
      if (!input.date) return { ok: false as const, error: 'Choose a date.' }
      const allocation = allocateCents(cents, effectiveAllocation(state.settings))
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
    [pushTx, state.settings],
  )

  const addSpending = useCallback(
    (input: AddSpendInput) => {
      const cents = toCents(input.amountUsd)
      if (!(cents > 0)) return { ok: false as const, error: 'Enter an amount greater than $0.' }
      const from = input.fromAccount ?? 'spending'
      const bal = computeBalances(state.transactions)
      const helpers = (input.combineFrom || []).filter((a) => a !== from)
      const plan = planSpendAcrossPots(bal, cents, from, helpers)
      if (!plan.ok) {
        const potLabel = ACCOUNT_LABELS[from]
        if (helpers.length === 0) {
          return {
            ok: false as const,
            error: `Not enough in ${potLabel}. Available: $${fromCents(bal[from]).toFixed(2)}.`,
            shortfallCents: plan.shortfallCents,
            availableCents: bal[from],
            fromAccount: from,
          }
        }
        return {
          ok: false as const,
          error: `Still short $${fromCents(plan.shortfallCents).toFixed(2)} after combining pots.`,
          shortfallCents: plan.shortfallCents,
          availableCents: bal[from],
          fromAccount: from,
        }
      }

      const combineId = plan.slices.length > 1 ? newId() : undefined
      const now = new Date().toISOString()
      const date = input.date || localDateISO()
      const description = input.description?.trim() || undefined
      const category = input.appleCash ? 'apple_cash' : input.category || 'other'
      const type = input.appleCash ? 'apple_cash_purchase' : 'spending'
      const txs: Transaction[] = plan.slices.map((slice, i) => ({
        id: newId(),
        type,
        amountCents: slice.cents,
        date,
        description:
          plan.slices.length > 1
            ? `${description || 'Purchase'} (${ACCOUNT_LABELS[slice.account]} part)`
            : description,
        category,
        fromAccount: slice.account === 'spending' ? undefined : slice.account,
        tags: combineId
          ? ['combine', `combine:${combineId}`, i === 0 ? 'combine-primary' : 'combine-part']
          : undefined,
        createdAt: now,
      }))
      pushTxs(txs)
      return { ok: true as const, slices: plan.slices }
    },
    [pushTxs, state.transactions],
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
          next.allocation = allocateCents(
            Math.abs(next.amountCents),
            effectiveAllocation(prev.settings),
          )
        }

        if (next.type === 'spending' || next.type === 'apple_cash_purchase') {
          const others = prev.transactions.filter((t) => t.id !== id)
          const bal = computeBalances(others)
          const from = next.fromAccount ?? 'spending'
          if (Math.abs(next.amountCents) > bal[from]) {
            error = `Not enough in that pot. Available: $${fromCents(bal[from]).toFixed(2)}.`
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

  const setTravelMode = useCallback((enabled: boolean) => {
    setState((prev) => {
      if (Boolean(prev.settings.travelMode) === enabled) return prev
      if (!enabled) {
        return {
          ...prev,
          settings: { ...prev.settings, travelMode: false },
        }
      }
      const bal = computeBalances(prev.transactions)
      const txs = [...prev.transactions]
      if (bal.extra > 0) {
        txs.push({
          id: newId(),
          type: 'transfer',
          amountCents: bal.extra,
          date: localDateISO(),
          description: 'Travel Mode — Extra into Spending',
          fromAccount: 'extra',
          toAccount: 'spending',
          tags: ['travel-mode'],
          createdAt: new Date().toISOString(),
        })
      }
      return {
        ...prev,
        transactions: txs,
        settings: { ...prev.settings, travelMode: true },
      }
    })
    return { ok: true as const }
  }, [])

  const completeOnboarding = useCallback((input: OnboardingInput) => {
    const apple = toCents(input.appleCashUsd)
    if (apple < 0) return { ok: false as const, error: 'Apple Cash balance cannot be negative.' }

    const today = localDateISO()

    // Virtual pots are calculated from how much you have right now (Apple Cash).
    setState((prev) => {
      const txs: Transaction[] = []
      const allocationPct = effectiveAllocation(prev.settings)
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
      const unlocked = applyGamification(prev.settings, txs, 0, iphoneBal).settings
      return {
        ...prev,
        transactions: txs,
        settings: {
          ...unlocked,
          onboardingComplete: true,
          appleCashConfirmedCents: apple,
          appleCashConfirmedAt: new Date().toISOString(),
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
        const allocation = allocateCents(amountCents, effectiveAllocation(base.settings))
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

      let settingsOut: Settings = {
        ...base.settings,
        importedEventIds: ids,
        syncCursor: cursor,
        lastSyncedAt: new Date().toISOString(),
        printxOpenResolvedCents: 0,
        printxLastResolvedCents: lastResolvedCents,
        printxLastResolvedAt: lastResolvedAt,
        printxResolveUndo: undo,
        printxAutoSettleV2: true,
      }
      if (imported > 0) {
        const iphoneAfter = computeBalances(txs).iphone
        const newPrintx = txs.filter((t) => !base.transactions.some((o) => o.id === t.id))
        const { settings: unlocked, celebration: cele } = applyGamification(
          settingsOut,
          txs,
          iphoneBefore,
          iphoneAfter,
          { awardTxs: newPrintx },
        )
        settingsOut = unlocked
        if (cele?.type === 'milestone') {
          newMilestoneCents.push(cele.cents)
          queueMicrotask(() => setCelebration(cele))
        } else if (cele) {
          queueMicrotask(() => setCelebration(cele))
        }
      }

      return {
        ...base,
        transactions: txs,
        settings: settingsOut,
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

  const syncPrintxNow = useCallback(async () => {
    const pulled = await fetchPrintxSync()
    if (!pulled.ok) {
      return {
        ok: false as const,
        error: pulled.error,
        configured: pulled.configured,
      }
    }
    const result = importPrintxEvents(pulled.data.events)
    if (typeof pulled.data.openOwedUsd === 'number') {
      setPrintxOpenOwed(pulled.data.openOwedUsd)
    } else {
      setState((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          lastSyncedAt: new Date().toISOString(),
        },
      }))
    }
    return {
      ok: true as const,
      imported: result.imported,
      openOwedUsd: pulled.data.openOwedUsd,
    }
  }, [importPrintxEvents, setPrintxOpenOwed])

  // After each unlock/login (MoneyProvider mount), pull PrintX once cloud is ready.
  useEffect(() => {
    if (!cloudReady || !cloudHydrated) return
    if (!state.settings.onboardingComplete) return
    if (printxLoginSyncRef.current) return
    printxLoginSyncRef.current = true
    void syncPrintxNow()
  }, [
    cloudReady,
    cloudHydrated,
    state.settings.onboardingComplete,
    syncPrintxNow,
  ])

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
      const { settings, celebration: cele } = applyGamification(
        prev.settings,
        copy,
        iphoneBefore,
        iphoneAfter,
        { awardTxs: [{ ...nextTx, settledAt: nextTx.settledAt }] },
      )
      if (cele) queueMicrotask(() => setCelebration(cele))
      return { ...prev, transactions: copy, settings }
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
      const settledTxs = copy.filter((t) => pendingIds.has(t.id))
      const { settings, celebration: cele } = applyGamification(
        prev.settings,
        copy,
        iphoneBefore,
        iphoneAfter,
        { awardTxs: settledTxs },
      )
      if (cele) queueMicrotask(() => setCelebration(cele))
      return { ...prev, transactions: copy, settings }
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
          const allocation = allocateCents(cents, effectiveAllocation(snapshot.settings))
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

      // Statement imports are not genuine live activity — milestones only, no income/spend XP.
      const { settings, celebration: cele } = applyGamification(
        snapshot.settings,
        txs,
        iphoneBefore,
        running.iphone,
      )
      if (cele) queueMicrotask(() => setCelebration(cele))

      setState({
        ...snapshot,
        transactions: txs,
        settings,
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
      const pct = effectiveAllocation(prev.settings)
      const target = allocateCents(bal.combined, pct)
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
          allocation: allocateCents(signed, pct),
          updatedAt: new Date().toISOString(),
        }
      })
      txs.push({
        id: newId(),
        type: 'reconcile',
        amountCents: Math.floor(movedCents / 2),
        date: localDateISO(),
        description: prev.settings.travelMode
          ? `Rebalanced pots to ${pct.iphone}/${pct.spending}/${pct.extra}/${pct.charity} (Travel Mode)`
          : `Rebalanced pots to ${pct.iphone}/${pct.spending}/${pct.extra}/${pct.charity}`,
        allocation: delta,
        tags: ['rebalance'],
        createdAt: new Date().toISOString(),
      })
      return { ...prev, transactions: txs }
    })
    if (error) return { ok: false as const, error }
    return { ok: true as const, movedCents }
  }, [])

  const markWeeklyReviewSeen = useCallback(() => {
    setState((prev) => {
      const tz = prev.settings.timezone || 'America/Chicago'
      const due = weeklyReviewXpIfDue(prev.settings, tz)
      if (!due) return prev
      const beforeLevel = levelFromXp(prev.settings.xpTotal || 0).level
      const awarded = tryAwardXp(prev.settings, {
        id: due.id,
        kind: 'review',
        amount: XP.weeklyReview,
        label: 'Weekly money review',
        refId: due.weekKey,
      })
      if (!awarded.awarded) {
        return {
          ...prev,
          settings: { ...prev.settings, lastWeeklyReviewXpKey: due.weekKey },
        }
      }
      const next = {
        ...awarded.settings,
        lastWeeklyReviewXpKey: due.weekKey,
      }
      const after = levelFromXp(next.xpTotal || 0)
      if (after.level > beforeLevel) {
        queueMicrotask(() =>
          setCelebration({
            type: 'levelUp',
            level: after.level,
            name: after.name,
            xpTotal: next.xpTotal || 0,
          }),
        )
      }
      return { ...prev, settings: next }
    })
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
    syncPrintxNow,
    resolvePrintxNow,
    undoResolvePrintx,
    importStatementRows,
    resetAllData,
    celebration,
    dismissCelebration: () => setCelebration(null),
    markWeeklyReviewSeen,
    needsTimezonePrompt,
    setTimezoneManual,
    applyRecurringNow,
    logWeeklyAllowance,
    upsertSubscription,
    removeSubscription,
    setTravelMode,
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
