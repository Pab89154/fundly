import type { CSSProperties } from 'react'

export type PiggyExpression = 'sleepy' | 'happy' | 'excited' | 'crowned'
export type PiggyAccessory = 'bandana' | 'glasses' | 'coin' | 'cape' | 'crown'

/** Match FundlyLogo pig palette. */
const PIG = '#FFFFFF'
const PIG_SOFT = '#E8E8E8'
const INK = '#0A0A0A'
const NEON = '#39FF14'

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

export function PiggyMascot({
  expression = 'happy',
  accessories = [],
  celebrating = false,
  /** Full goal unlock — bounce, glow, coin fountain orbit. */
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
  const eyes =
    expression === 'sleepy'
      ? { left: 'M8.2 11.2h2.2', right: 'M13.6 11.2h2.2' }
      : expression === 'excited' || celebrating || finale
        ? { left: 'M8.5 10.6l1.2 1.2 1.2-1.2', right: 'M13.1 10.6l1.2 1.2 1.2-1.2' }
        : { left: null, right: null }

  const pig = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={finale ? undefined : className}
      style={
        finale
          ? undefined
          : {
              ...style,
              transform: celebrating ? 'translateY(-2px) scale(1.05)' : undefined,
              transition: 'transform 0.35s ease',
            }
      }
      aria-hidden
    >
      {has('cape') ? (
        <path d="M7 14c-2.5 1.2-3.5 4-3.2 6.2 2.2-.4 4.2-1.6 5.2-3.4" fill={NEON} opacity={0.35} />
      ) : null}
      {/* body */}
      <ellipse cx="12" cy="14" rx="7.2" ry="6.2" fill={PIG} />
      {/* snout */}
      <ellipse cx="12" cy="15.2" rx="2.6" ry="1.9" fill={PIG_SOFT} />
      <circle cx="11.1" cy="15.1" r="0.45" fill={INK} />
      <circle cx="12.9" cy="15.1" r="0.45" fill={INK} />
      {/* ears */}
      <ellipse cx="6.8" cy="9.2" rx="1.6" ry="2" fill={PIG} />
      <ellipse cx="17.2" cy="9.2" rx="1.6" ry="2" fill={PIG} />
      <ellipse cx="6.8" cy="9.4" rx="0.7" ry="1" fill={PIG_SOFT} />
      <ellipse cx="17.2" cy="9.4" rx="0.7" ry="1" fill={PIG_SOFT} />
      {/* eyes */}
      {eyes.left ? (
        <>
          <path d={eyes.left} stroke={INK} strokeWidth={0.7} strokeLinecap="round" fill="none" />
          <path d={eyes.right!} stroke={INK} strokeWidth={0.7} strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx="9.3" cy="11.4" r="0.85" fill={INK} />
          <circle cx="14.7" cy="11.4" r="0.85" fill={INK} />
          <circle cx="9.55" cy="11.15" r="0.25" fill={PIG} />
          <circle cx="14.95" cy="11.15" r="0.25" fill={PIG} />
        </>
      )}
      {has('bandana') ? (
        <path d="M5.5 10.2c2.2-.8 5-.8 7.2 0l.6 1.1c-2.4.5-5.6.5-8 0z" fill={NEON} />
      ) : null}
      {has('glasses') ? (
        <>
          <circle cx="9.3" cy="11.4" r="1.55" fill="none" stroke={INK} strokeWidth={0.55} />
          <circle cx="14.7" cy="11.4" r="1.55" fill="none" stroke={INK} strokeWidth={0.55} />
          <path d="M10.85 11.4h2.3" stroke={INK} strokeWidth={0.45} />
        </>
      ) : null}
      {has('coin') ? (
        <g transform="translate(16.2 16.4)">
          <circle r="1.7" fill={NEON} stroke={INK} strokeWidth={0.25} />
          <line x1="0" y1="-0.95" x2="0" y2="0.95" stroke={INK} strokeWidth={0.28} strokeLinecap="round" />
          <path
            d="M0.65-0.45c0-.35-.35-.55-.7-.55s-.7.2-.7.5c0 .35.3.45.7.6.4.15.7.3.7.65 0 .35-.35.55-.75.55s-.75-.2-.75-.55"
            fill="none"
            stroke={INK}
            strokeWidth={0.28}
            strokeLinecap="round"
          />
        </g>
      ) : null}
      {(has('crown') || expression === 'crowned') ? (
        <path
          d="M8.2 6.8 9.6 8.6 12 6.2l2.4 2.4 1.4-1.8v3.4H8.2z"
          fill={NEON}
          stroke={INK}
          strokeWidth={0.3}
        />
      ) : null}
      {/* coin slot */}
      <rect x="10.2" y="8.6" width="3.6" height="0.7" rx="0.35" fill={INK} />
    </svg>
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
        <span key={i} className={`piggy-finale-orbit-coin piggy-finale-orbit-coin--${i}`} />
      ))}
      <div className="piggy-finale-bounce">{pig}</div>
    </div>
  )
}
