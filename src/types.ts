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

export type IncomeSource = 'printx' | 'allowance' | 'other' | 'opening'

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
  createdAt: string
  updatedAt?: string
}

export interface Settings {
  goalCents: number
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

export const STORAGE_KEY = 'my-money-tracker:v1'

export const DEFAULT_SETTINGS: Settings = {
  goalCents: 200_000,
  allocation: { iphone: 70, spending: 20, extra: 10 },
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
}

export function createEmptyState(): AppState {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, allocation: { ...DEFAULT_SETTINGS.allocation }, importedEventIds: [], celebratedMilestones: [] },
    transactions: [],
  }
}
