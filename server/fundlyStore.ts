import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { OWNER_EMAIL, type FundlyEnv } from './fundlyAuth.ts'

/** Opaque Fundly AppState JSON (kept loose so server stays out of the React src graph). */
export type AppStateJson = {
  version: 1
  settings: Record<string, unknown>
  transactions: unknown[]
}

function emptyState(): AppStateJson {
  return {
    version: 1,
    settings: {
      goalCents: 200_000,
      activeGoal: {
        name: 'iPhone Duo',
        targetCents: 200_000,
        note: '',
        createdAt: '1970-01-01T00:00:00.000Z',
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
      businesses: [
        {
          id: 'printx',
          name: 'PrintX',
          note: 'Synced from PrintX — Mark settled there, then Sync here.',
          kind: 'printx',
          logoDataUrl: null,
          createdAt: '1970-01-01T00:00:00.000Z',
        },
        {
          id: 'nfc_bracelets',
          name: 'NFC Bracelets',
          note: 'Enter sales by hand (no automatic sync).',
          kind: 'manual',
          createdAt: '1970-01-01T00:00:00.000Z',
        },
      ],
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
        weeklyReviewWeekday: 1,
      },
      pushSubscription: null,
      lastWeeklyReviewNotifiedKey: null,
      lastRecurringSkip: null,
    },
    transactions: [],
  }
}

function supabaseConfigured(env: FundlyEnv): boolean {
  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

function client(env: FundlyEnv): SupabaseClient | null {
  if (!supabaseConfigured(env)) return null
  return createClient(env.SUPABASE_URL!.trim(), env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function isAppState(value: unknown): value is AppStateJson {
  if (!value || typeof value !== 'object') return false
  const v = value as AppStateJson
  return v.version === 1 && Boolean(v.settings) && Array.isArray(v.transactions)
}

function normalizeAllocation(raw: unknown): {
  iphone: number
  spending: number
  extra: number
  charity: number
} {
  const def = { iphone: 60, spending: 20, extra: 10, charity: 10 }
  if (!raw || typeof raw !== 'object') return def
  const o = raw as Record<string, unknown>
  const hasCharity = 'charity' in o && o.charity != null
  // Any pre-charity allocation becomes the new default split
  if (!hasCharity) return def

  const next = {
    iphone: Number(o.iphone),
    spending: Number(o.spending),
    extra: Number(o.extra),
    charity: Number(o.charity),
  }
  if (
    !Number.isFinite(next.iphone) ||
    !Number.isFinite(next.spending) ||
    !Number.isFinite(next.extra) ||
    !Number.isFinite(next.charity)
  ) {
    return def
  }
  const sum = next.iphone + next.spending + next.extra + next.charity
  if (Math.abs(sum - 100) > 0.001) return def
  return next
}

function normalizeGoal(settings: Record<string, unknown>): {
  name: string
  targetCents: number
  note: string
  createdAt: string
  updatedAt?: string
} | null {
  if (settings.activeGoal === null) return null
  const g = settings.activeGoal
  if (g && typeof g === 'object') {
    const o = g as Record<string, unknown>
    const name = String(o.name || '').trim() || 'My goal'
    const targetCents = Math.max(0, Math.trunc(Number(o.targetCents) || 0))
    return {
      name,
      targetCents,
      note: String(o.note || ''),
      createdAt: String(o.createdAt || new Date().toISOString()),
      updatedAt: o.updatedAt ? String(o.updatedAt) : undefined,
    }
  }
  const legacy = Math.trunc(Number(settings.goalCents) || 0)
  if (legacy > 0) {
    return {
      name: 'iPhone Duo',
      targetCents: legacy,
      note: '',
      createdAt: '1970-01-01T00:00:00.000Z',
    }
  }
  return null
}

export function normalizeState(raw: unknown): AppStateJson {
  if (!isAppState(raw)) return emptyState()
  const empty = emptyState()
  const activeGoal = normalizeGoal(raw.settings as Record<string, unknown>)
  return {
    version: 1,
    settings: {
      ...empty.settings,
      ...raw.settings,
      allocation: normalizeAllocation(raw.settings.allocation),
      activeGoal,
      goalCents: activeGoal?.targetCents ?? 0,
      importedEventIds: (raw.settings.importedEventIds as unknown[]) ?? [],
      celebratedMilestones: (raw.settings.celebratedMilestones as unknown[]) ?? [],
    },
    transactions: raw.transactions,
  }
}

export async function loadAppState(
  env: FundlyEnv,
): Promise<{ ok: true; state: AppStateJson; empty: boolean } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return { ok: false, error: 'Supabase is not configured (SUPABASE_URL / SERVICE_ROLE_KEY).' }

  const { data, error } = await sb
    .from('fundly_app_state')
    .select('state')
    .eq('owner_email', OWNER_EMAIL)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data?.state) return { ok: true, state: emptyState(), empty: true }
  return { ok: true, state: normalizeState(data.state), empty: false }
}

export async function saveAppState(
  env: FundlyEnv,
  state: AppStateJson,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = client(env)
  if (!sb) return { ok: false, error: 'Supabase is not configured (SUPABASE_URL / SERVICE_ROLE_KEY).' }

  const payload = normalizeState(state)
  const { error } = await sb.from('fundly_app_state').upsert(
    {
      owner_email: OWNER_EMAIL,
      state: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'owner_email' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
