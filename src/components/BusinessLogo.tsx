import { Briefcase } from 'lucide-react'
import { resolveBusinessLogoUrl } from '../lib/businessLogo'

type Props = {
  business: { id: string; name?: string; logoDataUrl?: string | null }
  size?: number
  className?: string
}

/** Fixed-size mark so SVG/PNG never spills into labels or neighboring nav items. */
export function BusinessLogo({ business, size = 20, className = '' }: Props) {
  const src = resolveBusinessLogoUrl(business)
  const box = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    maxWidth: size,
    maxHeight: size,
  } as const

  if (src) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md ${className}`}
        style={box}
        aria-hidden
      >
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="block h-full w-full object-contain"
          draggable={false}
        />
      </span>
    )
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={box}
      aria-hidden
    >
      <Briefcase size={Math.round(size * 0.85)} />
    </span>
  )
}
