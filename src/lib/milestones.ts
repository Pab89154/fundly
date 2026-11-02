/** Stable goal milestones, unlock history, and migration from legacy fraction meta. */

import type { GoalMilestone as GoalMilestoneT, Settings } from '../types'
import {
  defaultMilestoneTitle,
  isAutoUnlockMilestoneTitle,
  milestonesForTarget,
  MILESTONE_FRACS,
  type MilestoneMetaMap,
} from './money'
import { awardXp, xpForMilestoneUnlock } from './gamification'

export type MilestoneIconKey = 'spark' | 'rocket' | 'flag' | 'medal' | 'flame' | 'crown'

export const MILESTONE_ICON_KEYS: MilestoneIconKey[] = [
  'spark',
  'rocket',
  'flag',
  'medal',
  'flame',
  'crown',
]

export type GoalMilestone = GoalMilestoneT

export type CelebrationPayload = {
  id: string
  cents: number
  title: string
  treat?: string
  icon?: MilestoneIconKey
  isFinal: boolean
}

const DEFAULT_IDS = [
  'm_first_spark',
  'm_getting_started',
  'm_quarter_way',
  'm_halfway_hero',
  'm_almost_there',
  'm_goal_unlocked',
] as const

const DEFAULT_ICONS: MilestoneIconKey[] = [
  'spark',
  'rocket',
  'flag',
  'medal',
  'flame',
  'crown',
]

export function newMilestoneId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `m_${crypto.randomUUID().slice(0, 8)}`
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** Default ordered checkpoints for a goal target (5%…100% with friendly titles). */
export function defaultGoalMilestones(targetCents: number, goalName: string): GoalMilestone[] {
  const target = Math.trunc(targetCents) || 0
  const name = goalName.trim() || 'Goal'
  if (target <= 0) return []
  const centsList = milestonesForTarget(target)
  return centsList.map((cents, i) => {
    const isFinal = cents >= target
    const title = isFinal
      ? `${name} unlocked!`
      : defaultMilestoneTitle(cents, target, name)
    return {
      id: DEFAULT_IDS[i] ?? newMilestoneId(),
      cents,
      title,
      icon: DEFAULT_ICONS[Math.min(i, DEFAULT_ICONS.length - 1)] ?? 'spark',
    }
  })
}

/** Prefer stored list; otherwise build from fractions + legacy meta. */
export function milestonesForGoal(goal: {
  name: string
  targetCents: number
  milestones?: GoalMilestone[] | null
  milestoneMeta?: MilestoneMetaMap | null
} | null | undefined): GoalMilestone[] {
  if (!goal || !(goal.targetCents > 0)) return []
  const name = goal.name.trim() || 'Goal'
  const target = Math.trunc(goal.targetCents)

  if (Array.isArray(goal.milestones) && goal.milestones.length > 0) {
    return normalizeGoalMilestones(goal.milestones, target, name)
  }

  const defaults = defaultGoalMilestones(target, name)
  const meta = goal.milestoneMeta
  if (!meta) return defaults

  return defaults.map((d) => {
    const entry = meta[String(d.cents)]
    if (!entry?.title?.trim()) return d
    let title = entry.title.trim()
    if (d.cents >= target && isAutoUnlockMilestoneTitle(title)) title = `${name} unlocked!`
    return {
      ...d,
      title,
      ...(entry.treat?.trim() ? { treat: entry.treat.trim() } : {}),
    }
  })
}

export function normalizeGoalMilestones(
  raw: unknown,
  targetCents: number,
  goalName: string,
): GoalMilestone[] {
  if (!Array.isArray(raw)) return defaultGoalMilestones(targetCents, goalName)
  const name = goalName.trim() || 'Goal'
  const target = Math.trunc(targetCents) || 0
  const out: GoalMilestone[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i]
    if (!o || typeof o !== 'object') continue
    const r = o as Record<string, unknown>
    let id = String(r.id || '').trim() || newMilestoneId()
    if (seen.has(id)) id = newMilestoneId()
    seen.add(id)
    const cents = Math.max(1, Math.trunc(Number(r.cents) || 0))
    if (!(cents > 0)) continue
    let title = String(r.title || '').trim()
    if (!title) title = defaultMilestoneTitle(cents, target || cents, name)
    if (target > 0 && cents >= target && isAutoUnlockMilestoneTitle(title)) {
      title = `${name} unlocked!`
    }
    const treat = String(r.treat || '').trim()
    const iconRaw = String(r.icon || '').trim() as MilestoneIconKey
    const icon = MILESTONE_ICON_KEYS.includes(iconRaw) ? iconRaw : DEFAULT_ICONS[Math.min(i, 5)]
    out.push(treat ? { id, cents, title, treat, icon } : { id, cents, title, icon })
  }
  out.sort((a, b) => a.cents - b.cents || a.id.localeCompare(b.id))
  return out.length ? out : defaultGoalMilestones(targetCents, goalName)
}

/** Sync auto unlock titles when goal is renamed. */
export function syncGoalMilestonesName(list: GoalMilestone[], goalName: string): GoalMilestone[] {
  const name = goalName.trim() || 'Goal'
  const unlock = `${name} unlocked!`
  if (!list.length) return list
  const maxCents = Math.max(...list.map((m) => m.cents))
  return list.map((m) => {
    const isFinal = m.cents >= maxCents
    if (isFinal) {
      if (!m.title?.trim() || isAutoUnlockMilestoneTitle(m.title)) {
        return m.title === unlock ? m : { ...m, title: unlock }
      }
      return m
    }
    if (isAutoUnlockMilestoneTitle(m.title) && m.title !== unlock) {
      return { ...m, title: unlock }
    }
    return m
  })
}

export function nextGoalMilestone(
  currentCents: number,
  list: GoalMilestone[],
): GoalMilestone | null {
  for (const m of list) {
    if (currentCents < m.cents) return m
  }
  return null
}

export function milestoneProgressToward(
  currentCents: number,
  next: GoalMilestone,
  list: GoalMilestone[],
): number {
  const prev = [...list].reverse().find((m) => m.cents < next.cents)?.cents ?? 0
  const span = Math.max(1, next.cents - prev)
  return Math.min(1, Math.max(0, (currentCents - prev) / span))
}

export type CrossedMilestone = GoalMilestone & { crossed: true }

/** Newly reached checkpoints (by id / cents), Goal pot only. */
export function crossedGoalMilestones(
  prevCents: number,
  nextCents: number,
  list: GoalMilestone[],
  alreadyCelebratedIds: Set<string>,
  alreadyCelebratedCents: Set<number>,
): GoalMilestone[] {
  return list.filter((m) => {
    if (!(prevCents < m.cents && nextCents >= m.cents)) return false
    if (alreadyCelebratedIds.has(m.id)) return false
    if (alreadyCelebratedCents.has(m.cents)) return false
    return true
  })
}

/** Rebuild legacy milestoneMeta map from list (for older readers). */
export function milestonesToMetaMap(list: GoalMilestone[]): MilestoneMetaMap {
  const out: MilestoneMetaMap = {}
  for (const m of list) {
    out[String(m.cents)] = m.treat?.trim()
      ? { title: m.title, treat: m.treat.trim() }
      : { title: m.title }
  }
  return out
}

/** Reset amounts to % of target, keep titles/treats/ids when possible by index. */
export function resetMilestonesToFractions(
  targetCents: number,
  goalName: string,
  existing?: GoalMilestone[] | null,
): GoalMilestone[] {
  const fresh = defaultGoalMilestones(targetCents, goalName)
  if (!existing?.length) return fresh
  return fresh.map((f, i) => {
    const prev = existing[i]
    if (!prev) return f
    return {
      ...f,
      id: prev.id || f.id,
      title:
        f.cents >= targetCents && isAutoUnlockMilestoneTitle(prev.title)
          ? f.title
          : prev.title?.trim() || f.title,
      ...(prev.treat?.trim() ? { treat: prev.treat.trim() } : {}),
      icon: prev.icon || f.icon,
    }
  })
}

/**
 * Apply newly crossed Goal-pot checkpoints: history, ids, cents, XP.
 * Never removes prior celebrated data.
 */
export function applyGoalUnlocks(
  settings: Settings,
  prevCents: number,
  nextCents: number,
): {
  settingsPatch: Partial<Settings>
  celebration: CelebrationPayload | null
  crossed: GoalMilestone[]
} {
  const list = milestonesForGoal(settings.activeGoal)
  if (!list.length) {
    return { settingsPatch: {}, celebration: null, crossed: [] }
  }
  const idSet = new Set(
    (settings.celebratedMilestoneIds || []).map(String).filter(Boolean),
  )
  const histIds = new Set((settings.achievementHistory || []).map((h) => h.milestoneId))
  for (const id of histIds) idSet.add(id)
  const centSet = new Set(
    (settings.celebratedMilestones || []).map((c) => Math.trunc(Number(c) || 0)),
  )
  const crossed = crossedGoalMilestones(prevCents, nextCents, list, idSet, centSet)
  if (!crossed.length) {
    return { settingsPatch: {}, celebration: null, crossed: [] }
  }

  const now = new Date().toISOString()
  const maxCents = Math.max(...list.map((m) => m.cents))
  const history = [...(settings.achievementHistory || [])]
  const newIds = [...(settings.celebratedMilestoneIds || [])]
  const newCents = [...(settings.celebratedMilestones || [])]
  let xp = Math.max(0, Math.trunc(settings.xpTotal || 0))

  for (const m of crossed) {
    if (!histIds.has(m.id)) {
      history.push({
        milestoneId: m.id,
        titleAtUnlock: m.title,
        centsAtUnlock: m.cents,
        unlockedAt: now,
        balanceAtUnlock: nextCents,
      })
      histIds.add(m.id)
    }
    if (!newIds.includes(m.id)) newIds.push(m.id)
    if (!newCents.includes(m.cents)) newCents.push(m.cents)
    xp = awardXp(xp, xpForMilestoneUnlock(m.cents >= maxCents))
  }

  const last = crossed[crossed.length - 1]!
  const celebration: CelebrationPayload = {
    id: last.id,
    cents: last.cents,
    title: last.title,
    treat: last.treat,
    icon: last.icon as MilestoneIconKey | undefined,
    isFinal: last.cents >= maxCents,
  }

  return {
    settingsPatch: {
      achievementHistory: history,
      celebratedMilestoneIds: newIds,
      celebratedMilestones: newCents,
      xpTotal: xp,
    },
    celebration,
    crossed,
  }
}

export { MILESTONE_FRACS }
