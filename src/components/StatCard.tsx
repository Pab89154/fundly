import type { ReactNode } from 'react'

export function StatCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string
  value: ReactNode
  hint?: string
  accent?: 'green' | 'blue' | 'orange'
  icon?: ReactNode
}) {
  const color =
    accent === 'blue'
      ? 'text-[var(--blue)]'
      : accent === 'orange'
        ? 'text-[var(--orange)]'
        : accent === 'green'
          ? 'text-[var(--green)]'
          : 'text-[var(--text)]'

  return (
    <div className="card animate-in p-4 sm:p-5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {icon}
        {label}
      </p>
      <p className={`mt-2 text-2xl font-extrabold tracking-tight ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-sm text-[var(--muted)]">{hint}</p> : null}
    </div>
  )
}
