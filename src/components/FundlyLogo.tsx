/** Fundly brand mark — piggy bank + neon green coin. */

type Props = {
  size?: number
  className?: string
  /** Prefer PNG for exact brand art; SVG used as vector fallback */
  useRaster?: boolean
  title?: string
}

export function FundlyLogo({
  size = 48,
  className = '',
  useRaster = true,
  title = 'Fundly',
}: Props) {
  if (useRaster) {
    return (
      <img
        src="/fundly-logo.png?v=2"
        width={size}
        height={size}
        alt={title}
        className={`block shrink-0 object-contain ${className}`}
        draggable={false}
      />
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`block shrink-0 ${className}`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect width="512" height="512" rx="112" fill="#0A0A0A" />

      {/* Spark lines */}
      <g stroke="#39FF14" strokeWidth="16" strokeLinecap="round">
        <line x1="168" y1="118" x2="138" y2="82" />
        <line x1="214" y1="92" x2="200" y2="52" />
        <line x1="298" y1="92" x2="312" y2="52" />
        <line x1="344" y1="118" x2="374" y2="82" />
      </g>

      {/* Pig body */}
      <ellipse cx="250" cy="312" rx="148" ry="112" fill="#FFFFFF" />
      {/* Snout */}
      <ellipse cx="378" cy="300" rx="62" ry="52" fill="#FFFFFF" />
      <ellipse cx="422" cy="306" rx="28" ry="24" fill="#FFFFFF" />
      {/* Ear */}
      <path d="M292 190 L328 128 L360 196 Z" fill="#FFFFFF" />
      {/* Legs */}
      <rect x="178" y="398" width="48" height="58" rx="12" fill="#FFFFFF" />
      <rect x="268" y="398" width="48" height="58" rx="12" fill="#FFFFFF" />

      {/* Tail */}
      <path
        d="M108 308 C76 298, 66 268, 88 248"
        stroke="#FFFFFF"
        strokeWidth="24"
        strokeLinecap="round"
        fill="none"
      />

      {/* Eye + nostrils */}
      <circle cx="354" cy="274" r="14" fill="#0A0A0A" />
      <circle cx="412" cy="302" r="5" fill="#0A0A0A" />
      <circle cx="428" cy="302" r="5" fill="#0A0A0A" />

      {/* Slot */}
      <path
        d="M198 214 L220 198 L292 198 L314 214 L292 230 L220 230 Z"
        fill="#0A0A0A"
      />

      {/* Coin */}
      <circle cx="256" cy="168" r="58" fill="#39FF14" />
      <text
        x="256"
        y="190"
        textAnchor="middle"
        fontFamily="ui-rounded, system-ui, sans-serif"
        fontSize="72"
        fontWeight="800"
        fill="#0A0A0A"
      >
        $
      </text>
    </svg>
  )
}
