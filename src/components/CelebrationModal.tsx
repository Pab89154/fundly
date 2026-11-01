import { Trophy, Sparkles, X } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { formatUsd, milestoneLabel } from '../lib/money'
import { goalName, goalTargetCents } from '../types'

export function CelebrationModal() {
  const { celebration, dismissCelebration, state } = useMoney()
  if (celebration == null) return null
  const name = goalName(state.settings)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card relative w-full max-w-md overflow-hidden p-8 text-center animate-in">
        <button
          type="button"
          className="absolute right-3 top-3 rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--card-2)]"
          onClick={dismissCelebration}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--green)]/15 text-[var(--green)]">
          <Trophy size={32} strokeWidth={2} />
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-[var(--green)]">
          <Sparkles size={16} />
          <p className="text-sm font-semibold uppercase tracking-widest">Milestone unlocked</p>
          <Sparkles size={16} />
        </div>
        <h2 className="mt-3 text-3xl font-extrabold">
          {milestoneLabel(celebration, {
            targetCents: goalTargetCents(state.settings),
            goalName: name,
          })}
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Your {name} fund hit {formatUsd(celebration)}. Keep going!
        </p>
        <button type="button" className="btn btn-primary mt-6 w-full" onClick={dismissCelebration}>
          Continue
        </button>
      </div>
    </div>
  )
}
