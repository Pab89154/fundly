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

export type IncomeSource = 'printx' | 'nfc_bracelets' | 'allowance' | 'other' | 'opening'

export type PrintxPaySource = 'stripe' | 'cash'

export type SpendCategory =
  | 'food'
  | 'games'
  | 'apps'
  | 'school'
  | 'transport'
  | 'apple_cash'
  | 'other'

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
  /** How much of that open window was already Mark resolved in Fundly (cents). */
  printxOpenResolvedCents: number
  /** Last Resolve button amount (cents) — for the Resolved card. */
  printxLastResolvedCents: number
  printxLastResolvedAt: string | null
  /** Snapshot so Mark resolved can be undone once. */
  printxResolveUndo: {
    at: string
    prevOpenResolvedCents: number
    prevLastResolvedCents: number
    prevLastResolvedAt: string | null
    resolveExternalId: string | null
    reSettledTxIds: string[]
  } | null
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
  printxOpenOwedCents: 0,
  printxOpenResolvedCents: 0,
  printxLastResolvedCents: 0,
  printxLastResolvedAt: null,
  printxResolveUndo: null,
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
      importedEventIds: [],
      celebratedMilestones: [],
    },
    transactions: [],
  }
}
