import type { CSSProperties } from 'react'
import type { MilestoneIconKey } from '../lib/milestones'

const sizeMap = { sm: 16, md: 22, lg: 36 } as const

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
  const key = (name || 'spark') as MilestoneIconKey
  const common = {
    width: px,
    height: px,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
    'aria-hidden': true as const,
  }

  switch (key) {
    case 'rocket':
      return (
        <svg {...common}>
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      )
    case 'flag':
      return (
        <svg {...common}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" x2="4" y1="22" y2="15" />
        </svg>
      )
    case 'medal':
      return (
        <svg {...common}>
          <circle cx="12" cy="14" r="5" />
          <path d="M8.5 9.5 7 2l3.5 2L12 2l1.5 2L17 2l-1.5 7.5" />
        </svg>
      )
    case 'flame':
      return (
        <svg {...common}>
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 2 7.5a4.5 4.5 0 1 1-9 0 2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      )
    case 'crown':
      return (
        <svg {...common}>
          <path d="m2 8 4.5 4L12 4l5.5 8L22 8v10H2z" />
          <path d="M2 18h20" />
        </svg>
      )
    case 'spark':
    default:
      return (
        <svg {...common}>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      )
  }
}

export const MILESTONE_ICON_OPTIONS: { key: MilestoneIconKey; label: string }[] = [
  { key: 'spark', label: 'Spark' },
  { key: 'rocket', label: 'Rocket' },
  { key: 'flag', label: 'Flag' },
  { key: 'medal', label: 'Medal' },
  { key: 'flame', label: 'Flame' },
  { key: 'crown', label: 'Crown' },
]
