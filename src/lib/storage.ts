import { createEmptyState, STORAGE_KEY, type AppState } from '../types'

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createEmptyState()
    const parsed = JSON.parse(raw) as AppState
    if (!parsed || parsed.version !== 1 || !parsed.settings || !Array.isArray(parsed.transactions)) {
      return createEmptyState()
    }
    return {
      version: 1,
      settings: {
        ...createEmptyState().settings,
        ...parsed.settings,
        allocation: {
          ...createEmptyState().settings.allocation,
          ...parsed.settings.allocation,
        },
        importedEventIds: parsed.settings.importedEventIds ?? [],
        celebratedMilestones: parsed.settings.celebratedMilestones ?? [],
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
