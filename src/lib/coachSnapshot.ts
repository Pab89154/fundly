/** Compact Fundly snapshot for the AI coach (client → Worker). */

import {
  ACCOUNT_LABELS,
  effectiveAllocation,
  fromCents,
  type AccountId,
} from './money'
import type { AppState, Balances } from '../types'

export function buildCoachSnapshot(state: AppState, balances: Balances) {
  const s = state.settings
  const alloc = effectiveAllocation(s)
  const recent = [...state.transactions]
    .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`))
    .slice(0, 25)
    .map((t) => ({
      type: t.type,
      amountUsd: fromCents(Math.abs(t.amountCents)),
      date: t.date,
      description: t.description || undefined,
      source: t.source,
      from: t.fromAccount,
      to: t.toAccount,
      category: t.category,
    }))

  return {
    pots: {
      goal: fromCents(balances.iphone),
      spending: fromCents(balances.spending),
      extra: fromCents(balances.extra),
      charity: fromCents(balances.charity),
      combined: fromCents(balances.combined),
    },
    potIds: ACCOUNT_LABELS as Record<AccountId, string>,
    allocationPct: s.allocation,
    effectiveAllocationPct: alloc,
    travelMode: Boolean(s.travelMode),
    weeklyAllowanceUsd: fromCents(s.weeklyAllowanceCents),
    totalWeeklyEstimateUsd: fromCents(s.weeklyAllowanceCents + s.expectedPrintxWeeklyCents),
    goal: s.activeGoal
      ? {
          name: s.activeGoal.name,
          targetUsd: fromCents(s.activeGoal.targetCents),
          savedUsd: fromCents(balances.iphone),
          remainingUsd: fromCents(Math.max(0, s.activeGoal.targetCents - balances.iphone)),
        }
      : null,
    subscriptions: (s.subscriptions || []).map((sub) => ({
      id: sub.id,
      name: sub.name,
      amountUsd: fromCents(sub.amountCents),
      cadence: sub.cadence,
      nextDueDate: sub.nextDueDate,
      enabled: sub.enabled,
      fromAccount: sub.fromAccount || 'spending',
      combineWith: sub.combineWith,
    })),
    printx: {
      openOwedUsd: fromCents(s.printxOpenOwedCents || 0),
      lastSettledUsd: fromCents(s.printxLastResolvedCents || 0),
      lastSyncedAt: s.lastSyncedAt,
    },
    xpTotal: s.xpTotal || 0,
    recentTransactions: recent,
  }
}
