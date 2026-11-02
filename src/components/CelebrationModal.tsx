import { useEffect } from 'react'
import { Gift, Sparkles, Trophy, X } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { formatUsd } from '../lib/money'
import { goalName } from '../types'
import { ConfettiBurst } from './ConfettiBurst'
import { MilestoneIcon } from './milestoneIcons'
import { PiggyMascot } from './PiggyMascot'
import { maybeNotify } from '../lib/notify'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function playCelebrationChime(finale: boolean) {
  try {
    if (prefersReducedMotion()) return
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    const notes = finale
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [523.25, 659.25, 783.99]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(finale ? 0.1 : 0.08, now + 0.02 + i * 0.09)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4 + i * 0.09)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.09)
      osc.stop(now + 0.5 + i * 0.09)
    })
    window.setTimeout(() => void ctx.close(), finale ? 1400 : 800)
  } catch {
    /* ignore */
  }
}

export function CelebrationModal() {
  const { celebration, dismissCelebration, state } = useMoney()
  if (celebration == null) return null

  const soundOn = Boolean(state.settings.reminders?.celebrationSound)
  const name = goalName(state.settings)

  if (celebration.type === 'levelUp') {
    return (
      <LevelUpBody
        level={celebration.level}
        levelName={celebration.name}
        xpTotal={celebration.xpTotal}
        soundOn={soundOn}
        notifyEnabled={
          Boolean(state.settings.reminders?.webPushEnabled) &&
          state.settings.reminders?.notifyLevelUp !== false
        }
        onDismiss={dismissCelebration}
      />
    )
  }

  return (
    <MilestoneBody
      celebrationCents={celebration.cents}
      celebrationId={celebration.id}
      title={celebration.title}
      treat={celebration.treat}
      icon={celebration.icon}
      complete={celebration.isFinal}
      name={name}
      soundOn={soundOn}
      notifyEnabled={
        Boolean(state.settings.reminders?.webPushEnabled) &&
        state.settings.reminders?.notifyMilestone !== false
      }
      onDismiss={dismissCelebration}
    />
  )
}

function LevelUpBody({
  level,
  levelName,
  xpTotal,
  soundOn,
  notifyEnabled,
  onDismiss,
}: {
  level: number
  levelName: string
  xpTotal: number
  soundOn: boolean
  notifyEnabled: boolean
  onDismiss: () => void
}) {
  useEffect(() => {
    if (soundOn) playCelebrationChime(true)
  }, [level, soundOn])

  useEffect(() => {
    if (!notifyEnabled) return
    maybeNotify(
      `Level ${level} — ${levelName}!`,
      `You’re at ${xpTotal.toLocaleString()} XP. Keep logging income in Fundly.`,
      { tag: `level-${level}`, url: '/savings' },
    )
  }, [level, levelName, notifyEnabled, xpTotal])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      className="celebration-finale celebration-levelup fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="levelup-title"
    >
      <ConfettiBurst fireKey={`level-${level}`} intense finale />
      <button
        type="button"
        className="absolute right-4 top-4 z-20 rounded-xl bg-black/35 p-2.5 text-white/80 backdrop-blur hover:bg-black/50"
        onClick={onDismiss}
        aria-label="Close"
      >
        <X size={20} />
      </button>
      <div className="celebration-finale-content relative z-[1] flex max-w-lg flex-col items-center text-center">
        <p className="celebration-finale-eyebrow flex items-center gap-2 text-sm font-bold uppercase tracking-[0.22em] text-[var(--green)]">
          <Trophy size={16} aria-hidden />
          Level up
          <Sparkles size={16} aria-hidden />
        </p>
        <div className="celebration-finale-pig mt-6">
          <PiggyMascot
            expression="crowned"
            accessories={['bandana', 'glasses', 'coin', 'cape', 'crown']}
            celebrating
            finale
            size={140}
          />
        </div>
        <h2 id="levelup-title" className="celebration-finale-title mt-8 text-4xl font-extrabold text-white sm:text-5xl">
          Level {level}
        </h2>
        <p className="celebration-finale-amount mt-3 text-2xl font-extrabold text-[var(--green)] sm:text-3xl">
          {levelName}
        </p>
        <p className="mt-4 text-base text-white/75 sm:text-lg">{xpTotal.toLocaleString()} XP total</p>
        <button
          type="button"
          className="btn btn-primary celebration-finale-cta mt-8 min-w-[220px] px-8 py-3 text-base"
          onClick={onDismiss}
        >
          Keep going
        </button>
      </div>
    </div>
  )
}

function MilestoneBody({
  celebrationCents,
  celebrationId,
  title,
  treat,
  icon,
  complete,
  name,
  soundOn,
  notifyEnabled,
  onDismiss,
}: {
  celebrationCents: number
  celebrationId: string
  title: string
  treat?: string
  icon?: string
  complete: boolean
  name: string
  soundOn: boolean
  notifyEnabled: boolean
  onDismiss: () => void
}) {
  useEffect(() => {
    if (soundOn) playCelebrationChime(complete)
  }, [celebrationId, soundOn, complete])

  useEffect(() => {
    if (!notifyEnabled) return
    const treatBit = treat ? ` · You earned: ${treat}` : ''
    maybeNotify(
      complete ? 'Goal complete!' : 'Milestone unlocked',
      complete
        ? `${name} is fully funded at ${formatUsd(celebrationCents)}.${treatBit}`
        : `${title} · ${formatUsd(celebrationCents)}${treatBit}`,
      { tag: `milestone-${celebrationId}`, url: '/savings' },
    )
  }, [celebrationCents, celebrationId, complete, name, notifyEnabled, title, treat])

  useEffect(() => {
    if (!complete) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [complete])

  if (complete) {
    return (
      <div
        className="celebration-finale fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-finale-title"
      >
        <ConfettiBurst fireKey={`${celebrationId}-finale`} intense finale />
        <button
          type="button"
          className="absolute right-4 top-4 z-20 rounded-xl bg-black/35 p-2.5 text-white/80 backdrop-blur hover:bg-black/50"
          onClick={onDismiss}
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <div className="celebration-finale-content relative z-[1] flex max-w-lg flex-col items-center text-center">
          <p className="celebration-finale-eyebrow flex items-center gap-2 text-sm font-bold uppercase tracking-[0.22em] text-[var(--green)]">
            <Sparkles size={16} aria-hidden />
            Goal complete
            <Sparkles size={16} aria-hidden />
          </p>
          <div className="celebration-finale-pig mt-6">
            <PiggyMascot
              expression="crowned"
              accessories={['bandana', 'glasses', 'coin', 'cape', 'crown']}
              celebrating
              finale
              size={148}
            />
          </div>
          <h2
            id="celebration-finale-title"
            className="celebration-finale-title mt-8 text-4xl font-extrabold tracking-tight text-white sm:text-5xl"
          >
            {title}
          </h2>
          <p className="celebration-finale-amount mt-3 text-3xl font-extrabold text-[var(--green)] sm:text-4xl">
            {formatUsd(celebrationCents)}
          </p>
          <p className="mt-4 max-w-md text-base text-white/75 sm:text-lg">
            You fully funded {name}. This is the big one — piggy bank is overflowing.
          </p>
          {treat ? (
            <p className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-[var(--orange)]/40 bg-[var(--orange)]/15 px-4 py-2.5 text-sm font-semibold text-[var(--orange)]">
              <Gift size={16} aria-hidden />
              You earned: {treat}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary celebration-finale-cta mt-8 min-w-[220px] px-8 py-3 text-base"
            onClick={onDismiss}
          >
            Claim the win
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card relative w-full max-w-md overflow-hidden p-8 text-center animate-in">
        <ConfettiBurst fireKey={celebrationId} />
        <button
          type="button"
          className="absolute right-3 top-3 z-10 rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--card-2)]"
          onClick={onDismiss}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className="relative z-[1]">
          <div className="mx-auto flex items-center justify-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--green)]/15 text-[var(--green)]">
              <MilestoneIcon name={icon} size="lg" />
            </div>
            <PiggyMascot expression="excited" accessories={['bandana']} celebrating size={64} />
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-[var(--green)]">
            <Sparkles size={16} />
            <p className="text-sm font-semibold uppercase tracking-widest">Milestone unlocked</p>
            <Sparkles size={16} />
          </div>
          <h2 className="mt-3 text-3xl font-extrabold">{title}</h2>
          <p className="mt-1 text-lg font-semibold text-[var(--green)]">
            {formatUsd(celebrationCents)}
          </p>
          <p className="mt-2 text-[var(--muted)]">
            Your {name} fund hit {formatUsd(celebrationCents)}. Keep stacking!
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
