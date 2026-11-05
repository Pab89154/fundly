import type { SVGProps } from 'react'

/**
 * Coach cap — IconPark Outline “baseball-cap”
 * https://icon-park.github.io/ (Apache-2.0) via Iconify `icon-park-outline:baseball-cap`
 */
export function CoachCapIcon({
  size = 24,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      className={className}
      aria-hidden={props['aria-hidden'] ?? true}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 30c0-8.837 7.163-16 16-16v0c8.837 0 16 7.163 16 16v6H12z"
      />
      <path d="M22 36c-1-3.5-1-22 6-22s6.5 18 6 22" />
      <rect
        width="30"
        height="6"
        x="4"
        y="36"
        strokeLinecap="round"
        strokeLinejoin="round"
        rx="3"
      />
      <circle cx="28" cy="10" r="4" />
    </svg>
  )
}
