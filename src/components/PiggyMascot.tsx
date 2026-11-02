import type { CSSProperties } from 'react'
import { CircleDollarSign, Crown, Glasses, Ribbon, Shirt } from 'lucide-react'
import { FundlyLogo } from './FundlyLogo'

export type PiggyExpression = 'sleepy' | 'happy' | 'excited' | 'crowned'
export type PiggyAccessory = 'bandana' | 'glasses' | 'coin' | 'cape' | 'crown'

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

/** Brand piggy from Fundly logo + Lucide accessories (no hand-drawn SVG paths). */
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
  const badge = Math.max(14, Math.round(size * 0.28))

  const moodScale =
    expression === 'sleepy' ? 0.94 : expression === 'excited' || celebrating || finale ? 1.04 : 1

  const pig = (
    <div
      className={`relative inline-flex items-center justify-center ${finale ? '' : className}`}
      style={{
        width: size,
        height: size,
        ...(finale
          ? undefined
          : {
              ...style,
              transform: `translateY(${celebrating ? -2 : 0}px) scale(${moodScale})`,
              opacity: expression === 'sleepy' ? 0.88 : 1,
              transition: 'transform 0.35s ease, opacity 0.35s ease',
            }),
      }}
      aria-hidden
    >
      <FundlyLogo size={size} useRaster className="rounded-[22%]" title="Fundly piggy" />
      {has('bandana') ? (
        <Ribbon
          size={badge}
          className="absolute -left-0.5 top-[18%] text-[var(--green)] drop-shadow"
          aria-hidden
          strokeWidth={2.2}
        />
      ) : null}
      {has('glasses') ? (
        <Glasses
          size={badge}
          className="absolute left-1/2 top-[32%] -translate-x-1/2 text-white drop-shadow"
          aria-hidden
          strokeWidth={2.2}
        />
      ) : null}
      {has('coin') ? (
        <CircleDollarSign
          size={badge}
          className="absolute -right-1 bottom-[18%] text-[var(--green)] drop-shadow"
          aria-hidden
          strokeWidth={2.2}
        />
      ) : null}
      {has('cape') ? (
        <Shirt
          size={badge}
          className="absolute -left-1 bottom-[12%] text-[var(--green)]/80 drop-shadow"
          aria-hidden
          strokeWidth={2.2}
        />
      ) : null}
      {has('crown') || expression === 'crowned' ? (
        <Crown
          size={badge + 2}
          className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4 text-[var(--green)] drop-shadow"
          aria-hidden
          strokeWidth={2.2}
        />
      ) : null}
    </div>
  )

  if (!finale) return pig

  return (
    <div
      className={`piggy-finale-stage ${className}`}
      style={{ width: size * 1.55, height: size * 1.55, ...style }}
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
