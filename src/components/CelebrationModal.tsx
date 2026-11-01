import { useEffect } from 'react'
import { Trophy, Sparkles, X, Gift } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { formatUsd, milestoneLabel, milestoneTreat } from '../lib/money'
import { goalName, goalTargetCents } from '../types'
import { ConfettiBurst } from './ConfettiBurst'
import { maybeNotify } from '../lib/notify'

export function CelebrationModal() {
  const { celebration, dismissCelebration, state } = useMoney()
  if (celebration == null) return null

  const name = goalName(state.settings)
  const target = goalTargetCents(state.settings)
  const meta = state.settings.activeGoal?.milestoneMeta
  const title = milestoneLabel(celebration, {
    targetCents: target,
    goalName: name,
    milestoneMeta: meta,
  })
  const treat = milestoneTreat(celebration, meta)
  const complete = target > 0 && celebration >= target

  return (
    <CelebrationBody
      celebration={celebration}
      title={title}
      treat={treat}
      complete={complete}
      name={name}
      notifyEnabled={state.settings.reminders?.notifyWeeklyReview !== false}
      onDismiss={dismissCelebration}
    />
  )
}

function CelebrationBody({
  celebration,
  title,
  treat,
  complete,
  name,
  notifyEnabled,
  onDismiss,
}: {
  celebration: number
  title: string
  treat?: string
  complete: boolean
  name: string
  notifyEnabled: boolean
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!notifyEnabled) return
    maybeNotify(
      complete ? 'Goal complete!' : 'Milestone unlocked',
      complete ? `${name} fund hit the target.` : `${title} · ${formatUsd(celebration)}`,
      { tag: `milestone-${celebration}` },
    )
  }, [celebration, complete, name, notifyEnabled, title])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card relative w-full max-w-md overflow-hidden p-8 text-center animate-in">
        <ConfettiBurst fireKey={celebration} intense={complete} />
        <button
          type="button"
          className="absolute right-3 top-3 z-10 rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--card-2)]"
          onClick={onDismiss}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className="relative z-[1]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--green)]/15 text-[var(--green)]">
            <Trophy size={32} strokeWidth={2} />
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-[var(--green)]">
            <Sparkles size={16} />
            <p className="text-sm font-semibold uppercase tracking-widest">
              {complete ? 'Goal complete' : 'Milestone unlocked'}
            </p>
            <Sparkles size={16} />
          </div>
          <h2 className="mt-3 text-3xl font-extrabold">{title}</h2>
          <p className="mt-2 text-[var(--muted)]">
            {complete
              ? `You fully funded ${name} at ${formatUsd(celebration)}. Amazing!`
              : `Your ${name} fund hit ${formatUsd(celebration)}. Keep going!`}
          </p>
          {treat ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--orange)]/35 bg-[var(--orange)]/10 px-3 py-2 text-sm font-semibold text-[var(--orange)]">
              <Gift size={16} aria-hidden />
              You earned: {treat}
            </p>
          ) : null}
          <button type="button" className="btn btn-primary mt-6 w-full" onClick={onDismiss}>
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
