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
  createdAt: string
  updatedAt?: string
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
    out.push({
      id,
      name,
      note: String(o.note || ''),
      createdAt: String(o.createdAt || new Date().toISOString()),
      updatedAt: o.updatedAt ? String(o.updatedAt) : undefined,
    })
  }
  return out
}

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
    },
    transactions: [],
  }
}
