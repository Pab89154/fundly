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

/** Business kind — PrintX is synced; others are manual sales. */
export type BusinessKind = 'manual' | 'printx'

/** Businesses (PrintX + NFC Bracelets, lemonade stand, …) — managed in Settings. */
export interface Business {
  id: string
  name: string
  note: string
  kind?: BusinessKind
  /** data:image… or data:image/svg+xml… logo (upload / paste). */
  logoDataUrl?: string | null
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

/** Recurring bill (Netflix, apps, …) charged from a chosen pot. */
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
  /** Which pot pays first — defaults to Spending. */
  fromAccount: AccountId
  /** Optional second pot to top up if the primary is short. */
  combineWith?: AccountId
  category?: SpendCategory | string
  createdAt: string
  updatedAt?: string
}

export interface AllowanceAuto {
  enabled: boolean
  /** 0=Sun … 6=Sat — day to post weekly allowance (week itself is Mon–Sun). */
  weekday: number
}

export interface ReminderSettings {
  webPushEnabled: boolean
  notifyAllowance: boolean
  notifySubscriptionFail: boolean
  notifyAppleMismatch: boolean
  notifyWeeklyReview: boolean
  /** Browser notification when a Goal milestone (or full goal) unlocks. */
  notifyMilestone: boolean
  /** Browser notification on XP level-up. */
  notifyLevelUp: boolean
  /** Streak wins + “keep your streak” nudges. */
  notifyStreak: boolean
  /** Soft celebration chime (off by default). */
  celebrationSound: boolean
  /** 0=Sun … 6=Sat — “See this week!” day (default Monday; weeks are Mon–Sun). */
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

export const PRINTX_BUSINESS: Business = {
  id: 'printx',
  name: 'PrintX',
  note: 'Synced from PrintX — Mark settled there, then Sync here.',
  kind: 'printx',
  logoDataUrl: null,
  createdAt: '1970-01-01T00:00:00.000Z',
}

export const DEFAULT_BUSINESSES: Business[] = [
  { ...PRINTX_BUSINESS },
  {
    id: 'nfc_bracelets',
    name: 'NFC Bracelets',
    note: 'Enter sales by hand (no automatic sync).',
    kind: 'manual',
    createdAt: '1970-01-01T00:00:00.000Z',
  },
]

export function isSystemBusinessId(id: string): boolean {
  return id === 'printx'
}

export function businessHref(id: string): string {
  return id === 'printx' ? '/printx' : `/business/${id}`
}

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

const MAX_LOGO_CHARS = 180_000

function normalizeLogoDataUrl(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const s = String(raw)
  if (!s.startsWith('data:image/') || s.length > MAX_LOGO_CHARS) return null
  return s
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
    if (isReservedBusinessId(id) && id !== 'nfc_bracelets' && id !== 'printx') continue
    if (seen.has(id)) continue
    seen.add(id)
    const monthlyRaw = o.monthlyTargetCents
    const monthlyTargetCents =
      monthlyRaw == null || monthlyRaw === ''
        ? null
        : Math.max(0, Math.trunc(Number(monthlyRaw) || 0))
    const kind: BusinessKind =
      id === 'printx' || o.kind === 'printx' ? 'printx' : 'manual'
    out.push({
      id,
      name: id === 'printx' ? String(o.name || 'PrintX').trim() || 'PrintX' : name,
      note: String(o.note || (id === 'printx' ? PRINTX_BUSINESS.note : '')),
      kind,
      logoDataUrl: normalizeLogoDataUrl(o.logoDataUrl),
      monthlyTargetCents,
      createdAt: String(o.createdAt || new Date().toISOString()),
      updatedAt: o.updatedAt ? String(o.updatedAt) : undefined,
    })
  }
  // Always keep PrintX as a first-class business
  if (!seen.has('printx')) {
    out.unshift({ ...PRINTX_BUSINESS })
  } else {
    const idx = out.findIndex((b) => b.id === 'printx')
    if (idx > 0) {
      const [px] = out.splice(idx, 1)
      out.unshift(px!)
    }
    out[0] = { ...out[0]!, kind: 'printx' }
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
    const parsePot = (raw: unknown): AccountId | undefined => {
      const v = String(raw || '')
      if (v === 'iphone' || v === 'extra' || v === 'charity' || v === 'spending') return v
      return undefined
    }
    const fromAccount = parsePot(o.fromAccount) || 'spending'
    const combineRaw = parsePot(o.combineWith)
    const combineWith =
      combineRaw && combineRaw !== fromAccount ? combineRaw : undefined
    seen.add(id)
    out.push({
      id,
      name,
      amountCents,
      cadence,
      anchorDate,
      nextDueDate,
      enabled: o.enabled !== false,
      fromAccount,
      ...(combineWith ? { combineWith } : {}),
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
    notifyMilestone: o.notifyMilestone !== false,
    notifyLevelUp: o.notifyLevelUp !== false,
    notifyStreak: o.notifyStreak !== false,
    celebrationSound: Boolean(o.celebrationSound),
    weeklyReviewWeekday: wd >= 0 && wd <= 6 ? wd : 1,
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

/** Optional title + treat for a milestone checkpoint (keyed by cents string). */
export type MilestoneMetaEntry = {
  title: string
  treat?: string
}

export type MilestoneIconKey = 'spark' | 'rocket' | 'flag' | 'medal' | 'flame' | 'crown'

/** Ordered checkpoint with stable id (amount edits must not orphan achievements). */
export type GoalMilestone = {
  id: string
  cents: number
  title: string
  treat?: string
  icon?: MilestoneIconKey
}

export type AchievementRecord = {
  milestoneId: string
  titleAtUnlock: string
  centsAtUnlock: number
  unlockedAt: string
  balanceAtUnlock: number
}

export type XpKind =
  | 'income'
  | 'spend'
  | 'milestone'
  | 'review'
  | 'habit_week'
  | 'printx'
  | 'streak7'
  | 'streak30'
  | 'other'

export type XpHistoryEntry = {
  id: string
  kind: XpKind
  amount: number
  at: string
  label: string
  refId?: string
}

/** One active savings goal at a time (null = no goal yet). */
export interface ActiveGoal {
  name: string
  targetCents: number
  note: string
  /** Stable ordered checkpoints (preferred over milestoneMeta). */
  milestones?: GoalMilestone[]
  /**
   * @deprecated Prefer milestones[] — kept for older cloud saves / migration.
   * Per-checkpoint labels/treats keyed by milestone cents string.
   */
  milestoneMeta?: Record<string, MilestoneMetaEntry>
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
  /**
   * Travel Mode: Extra merges into Spending for new income.
   * Enabling moves current Extra → Spending; turning off leaves it in Spending.
   */
  travelMode: boolean
  weeklyAllowanceCents: number
  expectedPrintxWeeklyCents: number
  theme: 'dark' | 'light'
  onboardingComplete: boolean
  appleCashConfirmedCents: number | null
  appleCashConfirmedAt: string | null
  lastSyncedAt: string | null
  syncCursor: string | null
  importedEventIds: string[]
  /** Legacy: celebrated checkpoint amounts (cents). Never wipe. */
  celebratedMilestones: number[]
  /** Celebrated checkpoint ids (preferred; survives amount edits). */
  celebratedMilestoneIds: string[]
  /** Unlock history for the achievement gallery. */
  achievementHistory: AchievementRecord[]
  /** Running XP score (never decreases). */
  xpTotal: number
  /** Persistent XP award ledger (dedupe by entry.id). */
  xpHistory: XpHistoryEntry[]
  /**
   * @deprecated Prefer habit_week keys in xpHistory — Monday ISO of last weekly habit XP.
   */
  lastStreakXpWeekKey: string | null
  /** Monday ISO of last weekly Goal-pot habit XP. */
  lastHabitWeekXpKey: string | null
  /** ISO week key (2026-W45) of last weekly-review XP. */
  lastWeeklyReviewXpKey: string | null
  /** Local day ISO when 7-day streak XP was awarded. */
  lastStreak7XpKey: string | null
  /** Local day ISO when 30-day streak XP was awarded. */
  lastStreak30XpKey: string | null
  /** Monday ISO (or legacy day ISO) of last “keep your streak” nudge. */
  lastStreakNudgeKey: string | null
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
  /** Set after stripping invented multi-week auto-allowance backfill. */
  allowanceBackfillClearedV1?: boolean
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
  travelMode: false,
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
  celebratedMilestoneIds: [],
  achievementHistory: [],
  xpTotal: 0,
  xpHistory: [],
  lastStreakXpWeekKey: null,
  lastHabitWeekXpKey: null,
  lastWeeklyReviewXpKey: null,
  lastStreak7XpKey: null,
  lastStreak30XpKey: null,
  lastStreakNudgeKey: null,
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
    notifyMilestone: true,
    notifyLevelUp: true,
    notifyStreak: true,
    celebrationSound: false,
    weeklyReviewWeekday: 1,
  },
  pushSubscription: null,
  lastWeeklyReviewNotifiedKey: null,
  lastRecurringSkip: null,
}

export function normalizeMilestoneMeta(raw: unknown): Record<string, MilestoneMetaEntry> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, MilestoneMetaEntry> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(k) || !v || typeof v !== 'object') continue
    const o = v as Record<string, unknown>
    const title = String(o.title || '').trim()
    if (!title) continue
    const treat = String(o.treat || '').trim()
    out[k] = treat ? { title, treat } : { title }
  }
  return Object.keys(out).length ? out : undefined
}

/** Normalize legacy goalCents-only saves into activeGoal. */
export function normalizeActiveGoal(
  settings: Partial<Settings> & { goalCents?: number; activeGoal?: ActiveGoal | null },
): ActiveGoal | null {
  if (settings.activeGoal === null) return null
  if (settings.activeGoal && typeof settings.activeGoal === 'object') {
    const name = String(settings.activeGoal.name || '').trim() || 'My goal'
    const targetCents = Math.max(0, Math.trunc(Number(settings.activeGoal.targetCents) || 0))
    let milestoneMeta = normalizeMilestoneMeta(settings.activeGoal.milestoneMeta)
    if (milestoneMeta && targetCents > 0) {
      const unlockTitle = `${name} unlocked!`
      const next = { ...milestoneMeta }
      let changed = false
      for (const [key, entry] of Object.entries(next)) {
        if (!entry?.title) continue
        if (/^.+\s+unlocked!$/i.test(entry.title.trim()) && entry.title.trim() !== unlockTitle) {
          next[key] = entry.treat?.trim()
            ? { title: unlockTitle, treat: entry.treat.trim() }
            : { title: unlockTitle }
          changed = true
        }
      }
      if (changed) milestoneMeta = next
    }
    const rawMilestones = settings.activeGoal.milestones
    let milestones: GoalMilestone[] | undefined
    if (Array.isArray(rawMilestones) && rawMilestones.length > 0) {
      milestones = normalizeGoalMilestoneList(rawMilestones, targetCents, name)
    } else if (targetCents > 0) {
      milestones = seedMilestonesFromMeta(targetCents, name, milestoneMeta)
    }
    return {
      name,
      targetCents,
      note: String(settings.activeGoal.note || ''),
      ...(milestones?.length ? { milestones } : {}),
      ...(milestoneMeta ? { milestoneMeta } : {}),
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
      milestones: seedMilestonesFromMeta(legacy, 'iPhone Duo', undefined),
      createdAt: new Date(0).toISOString(),
    }
  }
  return null
}

const DEFAULT_MILESTONE_IDS = [
  'm_first_spark',
  'm_getting_started',
  'm_quarter_way',
  'm_halfway_hero',
  'm_almost_there',
  'm_goal_unlocked',
] as const

const DEFAULT_MILESTONE_ICONS: MilestoneIconKey[] = [
  'spark',
  'rocket',
  'flag',
  'medal',
  'flame',
  'crown',
]

function defaultTitleForRatio(cents: number, target: number, goalName: string): string {
  const name = goalName.trim() || 'Goal'
  if (target <= 0) return `First checkpoint`
  if (cents >= target) return `${name} unlocked!`
  const ratio = cents / target
  if (ratio <= 0.08) return 'First spark'
  if (ratio <= 0.18) return 'Getting started'
  if (ratio <= 0.35) return 'Quarter way'
  if (ratio <= 0.6) return 'Halfway hero'
  if (ratio <= 0.85) return 'Almost there'
  return 'Final stretch'
}

function fracMilestones(targetCents: number): number[] {
  const target = Math.trunc(targetCents) || 0
  if (target <= 0) return []
  const fracs = [0.05, 0.125, 0.25, 0.5, 0.75, 1]
  const set = new Set<number>()
  for (const f of fracs) set.add(Math.max(1, Math.round(target * f)))
  set.add(target)
  return [...set].filter((c) => c > 0 && c <= target).sort((a, b) => a - b)
}

function seedMilestonesFromMeta(
  targetCents: number,
  goalName: string,
  meta?: Record<string, MilestoneMetaEntry>,
): GoalMilestone[] {
  const name = goalName.trim() || 'Goal'
  const centsList = fracMilestones(targetCents)
  return centsList.map((cents, i) => {
    const entry = meta?.[String(cents)]
    let title = entry?.title?.trim() || defaultTitleForRatio(cents, targetCents, name)
    if (cents >= targetCents && /^.+\s+unlocked!$/i.test(title)) title = `${name} unlocked!`
    const treat = entry?.treat?.trim()
    return {
      id: DEFAULT_MILESTONE_IDS[i] ?? `m_${i}_${cents}`,
      cents,
      title,
      ...(treat ? { treat } : {}),
      icon: DEFAULT_MILESTONE_ICONS[Math.min(i, 5)] ?? 'spark',
    }
  })
}

function normalizeGoalMilestoneList(
  raw: unknown[],
  targetCents: number,
  goalName: string,
): GoalMilestone[] {
  const name = goalName.trim() || 'Goal'
  const out: GoalMilestone[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    let id = String(o.id || '').trim() || `m_${i}_${Date.now()}`
    if (seen.has(id)) id = `${id}_${i}`
    seen.add(id)
    const cents = Math.max(1, Math.trunc(Number(o.cents) || 0))
    let title = String(o.title || '').trim()
    if (!title) title = defaultTitleForRatio(cents, targetCents, name)
    if (targetCents > 0 && cents >= targetCents && /^.+\s+unlocked!$/i.test(title)) {
      title = `${name} unlocked!`
    }
    const treat = String(o.treat || '').trim()
    const iconRaw = String(o.icon || '').trim() as MilestoneIconKey
    const icon = DEFAULT_MILESTONE_ICONS.includes(iconRaw)
      ? iconRaw
      : (DEFAULT_MILESTONE_ICONS[Math.min(i, 5)] ?? 'spark')
    out.push(treat ? { id, cents, title, treat, icon } : { id, cents, title, icon })
  }
  out.sort((a, b) => a.cents - b.cents || a.id.localeCompare(b.id))
  return out.length ? out : seedMilestonesFromMeta(targetCents, name, undefined)
}

export function goalTargetCents(settings: Settings): number {
  return settings.activeGoal?.targetCents ?? settings.goalCents ?? 0
}

export function goalName(settings: Settings): string {
  return settings.activeGoal?.name?.trim() || 'Goal'
}

export function createEmptyState(): AppState {
  const activeGoal = normalizeActiveGoal(DEFAULT_SETTINGS)
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
      celebratedMilestoneIds: [],
      achievementHistory: [],
      xpTotal: 0,
      xpHistory: [],
      lastStreakXpWeekKey: null,
      lastHabitWeekXpKey: null,
      lastWeeklyReviewXpKey: null,
      lastStreak7XpKey: null,
      lastStreak30XpKey: null,
      lastStreakNudgeKey: null,
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

export function normalizeAchievementHistory(raw: unknown): AchievementRecord[] {
  if (!Array.isArray(raw)) return []
  const out: AchievementRecord[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const milestoneId = String(o.milestoneId || '').trim()
    if (!milestoneId || seen.has(milestoneId)) continue
    seen.add(milestoneId)
    out.push({
      milestoneId,
      titleAtUnlock: String(o.titleAtUnlock || '').trim() || 'Milestone',
      centsAtUnlock: Math.max(0, Math.trunc(Number(o.centsAtUnlock) || 0)),
      unlockedAt: String(o.unlockedAt || new Date().toISOString()),
      balanceAtUnlock: Math.max(0, Math.trunc(Number(o.balanceAtUnlock) || 0)),
    })
  }
  return out
}

/** Migrate legacy celebrated cents → history + ids when history is empty. */
export function migrateAchievementState(
  settings: Settings,
  goalBalanceCents = 0,
): Pick<Settings, 'achievementHistory' | 'celebratedMilestoneIds' | 'celebratedMilestones'> {
  const history = normalizeAchievementHistory(settings.achievementHistory)
  const celebratedCents = Array.isArray(settings.celebratedMilestones)
    ? settings.celebratedMilestones.map((c) => Math.trunc(Number(c) || 0)).filter((c) => c > 0)
    : []
  let ids = Array.isArray(settings.celebratedMilestoneIds)
    ? settings.celebratedMilestoneIds.map(String).filter(Boolean)
    : []

  if (history.length === 0 && celebratedCents.length > 0 && settings.activeGoal) {
    const list = settings.activeGoal.milestones?.length
      ? settings.activeGoal.milestones
      : seedMilestonesFromMeta(
          settings.activeGoal.targetCents,
          settings.activeGoal.name,
          settings.activeGoal.milestoneMeta,
        )
    const celebrated = new Set(celebratedCents)
    const seeded: AchievementRecord[] = []
    for (const m of list) {
      if (!celebrated.has(m.cents)) continue
      seeded.push({
        milestoneId: m.id,
        titleAtUnlock: m.title,
        centsAtUnlock: m.cents,
        unlockedAt: new Date(0).toISOString(),
        balanceAtUnlock: Math.max(goalBalanceCents, m.cents),
      })
      if (!ids.includes(m.id)) ids = [...ids, m.id]
    }
    return {
      achievementHistory: seeded,
      celebratedMilestoneIds: ids,
      celebratedMilestones: celebratedCents,
    }
  }

  if (ids.length === 0 && history.length > 0) {
    ids = history.map((h) => h.milestoneId)
  }

  return {
    achievementHistory: history,
    celebratedMilestoneIds: ids,
    celebratedMilestones: celebratedCents,
  }
}
