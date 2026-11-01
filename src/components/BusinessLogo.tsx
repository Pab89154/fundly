import { Briefcase } from 'lucide-react'
import { resolveBusinessLogoUrl } from '../lib/businessLogo'

type Props = {
  business: { id: string; name?: string; logoDataUrl?: string | null }
  size?: number
  className?: string
}

export function BusinessLogo({ business, size = 20, className = '' }: Props) {
  const src = resolveBusinessLogoUrl(business)
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-md object-cover ${className}`}
        draggable={false}
      />
    )
  }
  return <Briefcase size={size} className={`shrink-0 ${className}`} aria-hidden />
}
