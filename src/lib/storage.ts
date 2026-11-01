import { normalizeAllocationPct } from './money'
import {
  createEmptyState,
  normalizeActiveGoal,
  normalizeBusinesses,
  STORAGE_KEY,
  type AppState,
} from '../types'

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createEmptyState()
    const parsed = JSON.parse(raw) as AppState
    if (!parsed || parsed.version !== 1 || !parsed.settings || !Array.isArray(parsed.transactions)) {
      return createEmptyState()
    }
    const activeGoal = normalizeActiveGoal(parsed.settings)
    return {
      version: 1,
      settings: {
        ...createEmptyState().settings,
        ...parsed.settings,
        allocation: normalizeAllocationPct(parsed.settings.allocation),
        activeGoal,
        goalCents: activeGoal?.targetCents ?? 0,
        businesses: normalizeBusinesses(parsed.settings.businesses),
        importedEventIds: parsed.settings.importedEventIds ?? [],
        celebratedMilestones: parsed.settings.celebratedMilestones ?? [],
        printxOpenOwedCents: Number(parsed.settings.printxOpenOwedCents) || 0,
        printxOpenResolvedCents: Number(parsed.settings.printxOpenResolvedCents) || 0,
        printxLastResolvedCents: Number(parsed.settings.printxLastResolvedCents) || 0,
        printxLastResolvedAt: parsed.settings.printxLastResolvedAt ?? null,
        printxResolveUndo: parsed.settings.printxResolveUndo ?? null,
        printxIgnoredEventIds: Array.isArray(parsed.settings.printxIgnoredEventIds)
          ? parsed.settings.printxIgnoredEventIds
          : [],
        printxAutoSettleV2: Boolean(parsed.settings.printxAutoSettleV2),
      },

      transactions: parsed.transactions,
    }
  } catch {
    return createEmptyState()
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
