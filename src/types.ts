import type { AccountId, AllocationCents, AllocationPct } from './lib/money'

export type TxType =
  | 'income'
  | 'spending'
  | 'transfer'
  | 'import'
  | 'refund'
  | 'opening'
  | 'reconcile'
  | 'apple_cash_purchase'

/** Built-ins plus any custom business id from Settings. */
export type IncomeSource = string

export const SYSTEM_INCOME_SOURCES = ['printx', 'allowance', 'other', 'opening'] as const

/** Manual business (NFC Bracelets, lemonade stand, …) — managed in Settings. */
export interface Business {
  id: string
  name: string
  note: string
  /** Optional monthly sales target (cents). */
  monthlyTargetCents?: number | null
  createdAt: string
  updatedAt?: string
}

export type TimezoneSource = 'auto' | 'manual' | 'unset'

export type RecurringCadence = 'weekly' | 'monthly' | 'yearly'

export type SpendCategory =
  | 'food'
  | 'games'
  | 'apps'
  | 'school'
  | 'transport'
  | 'apple_cash'
  | 'other'

/** Spending-only recurring bill (Netflix, apps, …). */
export interface Subscription {
  id: string
  name: string
  amountCents: number
  cadence: RecurringCadence
  /** YYYY-MM-DD series start / reference. */
  anchorDate: string
  /** YYYY-MM-DD next due (advanced after each apply). */
  nextDueDate: string
  enabled: boolean
  category?: SpendCategory | string
  createdAt: string
  updatedAt?: string
}

export interface AllowanceAuto {
  enabled: boolean
  /** 0=Sun … 6=Sat — day to post weekly allowance. */
  weekday: number
}

export interface ReminderSettings {
  webPushEnabled: boolean
  notifyAllowance: boolean
  notifySubscriptionFail: boolean
  notifyAppleMismatch: boolean
  notifyWeeklyReview: boolean
  /** 0=Sun … 6=Sat — “See this week!” day. */
  weeklyReviewWeekday: number
}

/** Browser PushSubscription.toJSON() shape (no DOM dependency). */
export type PushSubscriptionJSON = {
  endpoint: string
  expirationTime?: number | null
  keys?: { p256dh?: string; auth?: string }
}

export interface RecurringSkipNotice {
  subscriptionId: string
  name: string
  amountCents: number
  dueDate: string
  at: string
}

export const DEFAULT_BUSINESSES: Business[] = [
  {
    id: 'nfc_bracelets',
    name: 'NFC Bracelets',
    note: 'Enter sales by hand (no automatic sync).',
    createdAt: '1970-01-01T00:00:00.000Z',
  },
]

export function slugifyBusinessId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return base || 'business'
}

export function isReservedBusinessId(id: string): boolean {
  return (SYSTEM_INCOME_SOURCES as readonly string[]).includes(id) || id === 'nfc' || !id
}

export function normalizeBusinesses(raw: unknown): Business[] {
  if (!Array.isArray(raw)) return DEFAULT_BUSINESSES.map((b) => ({ ...b }))
  const out: Business[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    let id = String(o.id || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
    const name = String(o.name || '').trim()
    if (!name) continue
    if (!id) id = slugifyBusinessId(name)
    if (isReservedBusinessId(id) && id !== 'nfc_bracelets') continue
    if (seen.has(id)) continue
    seen.add(id)
    const monthlyRaw = o.monthlyTargetCents
    const monthlyTargetCents =
      monthlyRaw == null || monthlyRaw === ''
        ? null
        : Math.max(0, Math.trunc(Number(monthlyRaw) || 0))
    out.push({
      id,
      name,
      note: String(o.note || ''),
      monthlyTargetCents,
      createdAt: String(o.createdAt || new Date().toISOString()),
      updatedAt: o.updatedAt ? String(o.updatedAt) : undefined,
    })
  }
  return out
}

export function normalizeSubscriptions(raw: unknown): Subscription[] {
  if (!Array.isArray(raw)) return []
  const out: Subscription[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = String(o.id || '').trim()
    const name = String(o.name || '').trim()
    if (!id || !name || seen.has(id)) continue
    const cadence = o.cadence
    if (cadence !== 'weekly' && cadence !== 'monthly' && cadence !== 'yearly') continue
    const amountCents = Math.max(0, Math.trunc(Number(o.amountCents) || 0))
    if (amountCents <= 0) continue
    const anchorDate = String(o.anchorDate || '').slice(0, 10)
    const nextDueDate = String(o.nextDueDate || anchorDate).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate) || !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) continue
    seen.add(id)
    out.push({
      id,
      name,
      amountCents,
      cadence,
      anchorDate,
      nextDueDate,
      enabled: o.enabled !== false,
      category: o.category ? String(o.category) : undefined,
      createdAt: String(o.createdAt || new Date().toISOString()),
      updatedAt: o.updatedAt ? String(o.updatedAt) : undefined,
    })
  }
  return out
}

export function normalizeAllowanceAuto(raw: unknown): AllowanceAuto {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const weekday = Math.trunc(Number(o.weekday))
  return {
    enabled: Boolean(o.enabled),
    weekday: weekday >= 0 && weekday <= 6 ? weekday : 1,
  }
}

export function normalizeReminders(raw: unknown): ReminderSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const wd = Math.trunc(Number(o.weeklyReviewWeekday))
  return {
    webPushEnabled: Boolean(o.webPushEnabled),
    notifyAllowance: o.notifyAllowance !== false,
    notifySubscriptionFail: o.notifySubscriptionFail !== false,
    notifyAppleMismatch: o.notifyAppleMismatch !== false,
    notifyWeeklyReview: o.notifyWeeklyReview !== false,
    weeklyReviewWeekday: wd >= 0 && wd <= 6 ? wd : 0,
  }
}

export function normalizeTimezoneSource(raw: unknown): TimezoneSource {
  if (raw === 'auto' || raw === 'manual' || raw === 'unset') return raw
  return 'unset'
}

export type PrintxPaySource = 'stripe' | 'cash'

export interface Transaction {
  id: string
  type: TxType
  /** Absolute amount in cents for most types; reconcile may use signed allocation. */
  amountCents: number
  date: string
  description?: string
  source?: IncomeSource
  printxSource?: PrintxPaySource
  category?: SpendCategory | string
  allocation?: AllocationCents
  fromAccount?: AccountId
  toAccount?: AccountId
  /** PrintX event_id for dedupe */
  externalId?: string
  tags?: string[]
  /**
   * PrintX payouts stay out of balances until you Mark settled in Savings
   * (money is yours in PrintX first, then counted here when it is in your pocket).
   */
  settledAt?: string | null
  createdAt: string
  updatedAt?: string
}

/** One active savings goal at a time (null = no goal yet). */
export interface ActiveGoal {
  name: string
  targetCents: number
  note: string
  createdAt: string
  updatedAt?: string
}

export interface Settings {
  /**
   * @deprecated Prefer activeGoal.targetCents — kept in sync for older code paths.
   */
  goalCents: number
  /** Single current goal; create/edit/delete in Settings. */
  activeGoal: ActiveGoal | null
  /** Manual businesses (not PrintX) — create/edit/delete in Settings. */
  businesses: Business[]
  allocation: AllocationPct
  weeklyAllowanceCents: number
  expectedPrintxWeeklyCents: number
  theme: 'dark' | 'light'
  onboardingComplete: boolean
  appleCashConfirmedCents: number | null
  appleCashConfirmedAt: string | null
  lastSyncedAt: string | null
  syncCursor: string | null
  importedEventIds: string[]
  celebratedMilestones: number[]
  /** Last PrintX "Owed to me" amount synced (cents). */
  printxOpenOwedCents: number
  /**
   * @deprecated Manual Fundly resolve credit — open is now PrintX openOwed only.
   * Kept so old cloud saves still load.
   */
  printxOpenResolvedCents: number
  /** Last settlement amount imported into pots (cents). */
  printxLastResolvedCents: number
  printxLastResolvedAt: string | null
  /** Snapshot so the last PrintX settlement import can be undone once. */
  printxResolveUndo: {
    at: string
    prevOpenResolvedCents: number
    prevLastResolvedCents: number
    prevLastResolvedAt: string | null
    resolveExternalId: string | null
    reSettledTxIds: string[]
  } | null
  /** Settle event ids undone in Fundly — Sync will not re-import them. */
  printxIgnoredEventIds: string[]
  /** Migration: strip manual printx-resolve txs; pots come from PrintX settle:* only. */
  printxAutoSettleV2?: boolean
  /** IANA timezone id (e.g. America/Chicago). */
  timezone: string
  timezoneSource: TimezoneSource
  allowanceAuto: AllowanceAuto
  subscriptions: Subscription[]
  reminders: ReminderSettings
  /** Browser PushSubscription JSON for Worker web push. */
  pushSubscription: PushSubscriptionJSON | null
  /** e.g. 2026-W44 — last weekly-review notification key. */
  lastWeeklyReviewNotifiedKey: string | null
  /** Last subscription skipped for insufficient Spending. */
  lastRecurringSkip: RecurringSkipNotice | null
}

export interface AppState {
  version: 1
  settings: Settings
  transactions: Transaction[]
}

export interface Balances {
  iphone: number
  spending: number
  extra: number
  charity: number
  combined: number
}

export interface PrintxFeedEvent {
  eventId: string
  source: PrintxPaySource
  kind: 'earned' | 'refund' | 'reversal'
  amountNetUsd: number
  occurredAt: string
  description?: string
  orderId?: string
  stripePaymentIntent?: string
}

export const STORAGE_KEY = 'my-money-tracker:v2'

export const DEFAULT_SETTINGS: Settings = {
  goalCents: 200_000,
  activeGoal: {
    name: 'iPhone Duo',
    targetCents: 200_000,
    note: '',
    createdAt: new Date(0).toISOString(),
  },
  allocation: { iphone: 60, spending: 20, extra: 10, charity: 10 },
  weeklyAllowanceCents: 1_000,
  expectedPrintxWeeklyCents: 5_000,
  theme: 'dark',
  onboardingComplete: false,
  appleCashConfirmedCents: null,
  appleCashConfirmedAt: null,
  lastSyncedAt: null,
  syncCursor: null,
  importedEventIds: [],
  celebratedMilestones: [],
  businesses: DEFAULT_BUSINESSES.map((b) => ({ ...b })),
  printxOpenOwedCents: 0,
  printxOpenResolvedCents: 0,
  printxLastResolvedCents: 0,
  printxLastResolvedAt: null,
  printxResolveUndo: null,
  printxIgnoredEventIds: [],
  printxAutoSettleV2: true,
  timezone: '',
  timezoneSource: 'unset',
  allowanceAuto: { enabled: false, weekday: 1 },
  subscriptions: [],
  reminders: {
    webPushEnabled: false,
    notifyAllowance: true,
    notifySubscriptionFail: true,
    notifyAppleMismatch: true,
    notifyWeeklyReview: true,
    weeklyReviewWeekday: 0,
  },
  pushSubscription: null,
  lastWeeklyReviewNotifiedKey: null,
  lastRecurringSkip: null,
}

/** Normalize legacy goalCents-only saves into activeGoal. */
export function normalizeActiveGoal(
  settings: Partial<Settings> & { goalCents?: number; activeGoal?: ActiveGoal | null },
): ActiveGoal | null {
  if (settings.activeGoal === null) return null
  if (settings.activeGoal && typeof settings.activeGoal === 'object') {
    const name = String(settings.activeGoal.name || '').trim() || 'My goal'
    const targetCents = Math.max(0, Math.trunc(Number(settings.activeGoal.targetCents) || 0))
    return {
      name,
      targetCents,
      note: String(settings.activeGoal.note || ''),
      createdAt: settings.activeGoal.createdAt || new Date().toISOString(),
      updatedAt: settings.activeGoal.updatedAt,
    }
  }
  const legacy = Math.trunc(Number(settings.goalCents) || 0)
  if (legacy > 0) {
    return {
      name: 'iPhone Duo',
      targetCents: legacy,
      note: '',
      createdAt: new Date(0).toISOString(),
    }
  }
  return null
}

export function goalTargetCents(settings: Settings): number {
  return settings.activeGoal?.targetCents ?? settings.goalCents ?? 0
}

export function goalName(settings: Settings): string {
  return settings.activeGoal?.name?.trim() || 'Goal'
}

export function createEmptyState(): AppState {
  const activeGoal = DEFAULT_SETTINGS.activeGoal
    ? { ...DEFAULT_SETTINGS.activeGoal }
    : null
  return {
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      allocation: { ...DEFAULT_SETTINGS.allocation },
      activeGoal,
      goalCents: activeGoal?.targetCents ?? 0,
      businesses: DEFAULT_BUSINESSES.map((b) => ({ ...b })),
      importedEventIds: [],
      celebratedMilestones: [],
      printxIgnoredEventIds: [],
      allowanceAuto: { ...DEFAULT_SETTINGS.allowanceAuto },
      subscriptions: [],
      reminders: { ...DEFAULT_SETTINGS.reminders },
      pushSubscription: null,
      lastWeeklyReviewNotifiedKey: null,
      lastRecurringSkip: null,
    },
    transactions: [],
  }
}
