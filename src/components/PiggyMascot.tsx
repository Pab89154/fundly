import type { CSSProperties, ComponentType } from 'react'
import {
  CircleDollarSign,
  Crown,
  Glasses,
  Shield,
  Sparkles,
  type LucideProps,
} from 'lucide-react'
import { FundlyLogo } from './FundlyLogo'

export type PiggyExpression = 'sleepy' | 'happy' | 'excited' | 'crowned'
export type PiggyAccessory = 'bandana' | 'glasses' | 'coin' | 'cape' | 'crown'

const ACCESSORY_META: Record<
  PiggyAccessory,
  { Icon: ComponentType<LucideProps>; label: string }
> = {
  bandana: { Icon: Sparkles, label: 'First unlock' },
  glasses: { Icon: Glasses, label: 'Sharp eyes' },
  coin: { Icon: CircleDollarSign, label: 'Coin sense' },
  cape: { Icon: Shield, label: 'Saver shield' },
  crown: { Icon: Crown, label: 'Goal crown' },
}

export function piggyStageFromProgress(ratio: number, unlockedCount: number, total: number): {
  expression: PiggyExpression
  accessories: PiggyAccessory[]
} {
  const r = Math.min(1, Math.max(0, ratio))
  const accessories: PiggyAccessory[] = []
  const order: PiggyAccessory[] = ['bandana', 'glasses', 'coin', 'cape', 'crown']
  for (let i = 0; i < Math.min(unlockedCount, order.length); i++) {
    accessories.push(order[i]!)
  }
  if (total > 0 && unlockedCount >= total) {
    if (!accessories.includes('crown')) accessories.push('crown')
    return { expression: 'crowned', accessories }
  }
  if (r >= 0.75) return { expression: 'excited', accessories }
  if (r >= 0.25) return { expression: 'happy', accessories }
  return { expression: 'sleepy', accessories }
}

/** Brand piggy (Fundly logo) + Lucide badge chips — never overlay the logo art. */
export function PiggyMascot({
  expression = 'happy',
  accessories = [],
  celebrating = false,
  finale = false,
  size = 72,
  className = '',
  style,
}: {
  expression?: PiggyExpression
  accessories?: PiggyAccessory[]
  celebrating?: boolean
  finale?: boolean
  size?: number
  className?: string
  style?: CSSProperties
}) {
  const has = (a: PiggyAccessory) => accessories.includes(a) || (expression === 'crowned' && a === 'crown')
  const shown = (Object.keys(ACCESSORY_META) as PiggyAccessory[]).filter((a) => has(a))
  const chip = Math.max(12, Math.round(size * 0.22))

  const moodScale =
    expression === 'sleepy' ? 0.94 : expression === 'excited' || celebrating || finale ? 1.04 : 1

  const pig = (
    <div
      className={`inline-flex flex-col items-center gap-1.5 ${finale ? '' : className}`}
      style={
        finale
          ? undefined
          : {
              ...style,
              transform: `translateY(${celebrating ? -2 : 0}px) scale(${moodScale})`,
              opacity: expression === 'sleepy' ? 0.88 : 1,
              transition: 'transform 0.35s ease, opacity 0.35s ease',
            }
      }
      aria-hidden
    >
      <div className="relative" style={{ width: size, height: size }}>
        <FundlyLogo size={size} useRaster className="rounded-[22%]" title="Fundly piggy" />
        {has('crown') ? (
          <span className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--green)]/40 bg-[var(--card)] p-0.5 text-[var(--green)] shadow">
            <Crown size={chip + 2} strokeWidth={2.2} aria-hidden />
          </span>
        ) : null}
      </div>
      {shown.length > 0 ? (
        <ul className="flex max-w-[min(100%,11rem)] flex-wrap items-center justify-center gap-1">
          {shown.map((key) => {
            const { Icon, label } = ACCESSORY_META[key]
            return (
              <li
                key={key}
                title={label}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--green)]/35 bg-[var(--card-2)] text-[var(--green)]"
              >
                <Icon size={chip} strokeWidth={2.2} aria-hidden />
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )

  if (!finale) return pig

  return (
    <div
      className={`piggy-finale-stage ${className}`}
      style={{ width: size * 1.7, height: size * 1.85, ...style }}
      aria-hidden
    >
      <span className="piggy-finale-ring" />
      <span className="piggy-finale-ring piggy-finale-ring--delay" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`piggy-finale-orbit-coin piggy-finale-orbit-coin--${i}`}>
          <CircleDollarSign size={14} className="text-[var(--green)]" aria-hidden strokeWidth={2.4} />
        </span>
      ))}
      <div className="piggy-finale-bounce">{pig}</div>
    </div>
  )
}
