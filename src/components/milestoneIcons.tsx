import type { CSSProperties, ComponentType } from 'react'
import { Crown, Flag, Flame, Medal, Rocket, Sparkles, type LucideProps } from 'lucide-react'
import type { MilestoneIconKey } from '../lib/milestones'

const sizeMap = { sm: 16, md: 22, lg: 36 } as const

const ICONS: Record<MilestoneIconKey, ComponentType<LucideProps>> = {
  spark: Sparkles,
  rocket: Rocket,
  flag: Flag,
  medal: Medal,
  flame: Flame,
  crown: Crown,
}

export function MilestoneIcon({
  name = 'spark',
  size = 'md',
  className = '',
  style,
}: {
  name?: MilestoneIconKey | string | null
  size?: keyof typeof sizeMap | number
  className?: string
  style?: CSSProperties
}) {
  const px = typeof size === 'number' ? size : sizeMap[size]
  const key = (name && name in ICONS ? name : 'spark') as MilestoneIconKey
  const Icon = ICONS[key]
  return <Icon size={px} className={className} style={style} aria-hidden strokeWidth={1.8} />
}

export const MILESTONE_ICON_OPTIONS: { key: MilestoneIconKey; label: string }[] = [
  { key: 'spark', label: 'Spark' },
  { key: 'rocket', label: 'Rocket' },
  { key: 'flag', label: 'Flag' },
  { key: 'medal', label: 'Medal' },
  { key: 'flame', label: 'Flame' },
  { key: 'crown', label: 'Crown' },
]
