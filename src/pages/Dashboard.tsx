import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Gift,
  Heart,
  PiggyBank,
  Target,
  Trophy,
  Wallet,
} from 'lucide-react'
import { BusinessLogo } from '../components/BusinessLogo'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useMoney } from '../store/MoneyContext'
import {
  formatSignedUsd,
  formatUsd,
  fromCents,
  milestoneLabel,
  milestoneProgress,
  milestoneTreat,
  nextMilestone,
  weeksToMilestone,
} from '../lib/money'
import {
  allowanceTotalCents,
  businessEarningsCents,
  estimateGoalDate,
  printxEarningsCents,
} from '../lib/balances'
import { mondayOfISOWeek, weekStats } from '../lib/recurring'
import { addDaysISO, zonedDateISO } from '../lib/timezone'
import { StatCard } from '../components/StatCard'
import { goalName, goalTargetCents } from '../types'
import { normalizeAllocationCents } from '../lib/money'

export function Dashboard() {
  const { state, balances, logWeeklyAllowance } = useMoney()
  const location = useLocation()
  const [allowMsg, setAllowMsg] = useState('')
  const [weekFlash, setWeekFlash] = useState(false)

  const active = state.settings.activeGoal
  const name = goalName(state.settings)
  const goal = goalTargetCents(state.settings)
  const saved = balances.iphone
  const remaining = Math.max(0, goal - saved)
  const pct = goal > 0 ? Math.min(100, Math.round((saved / goal) * 1000) / 10) : 0
  const eta = estimateGoalDate({
    remainingCents: remaining,
    weeklyAllowanceCents: state.settings.weeklyAllowanceCents,
    expectedPrintxWeeklyCents: state.settings.expectedPrintxWeeklyCents,
    iphonePct: state.settings.allocation.iphone,
  })

  const nextMs = goal > 0 ? nextMilestone(saved, goal) : null
  const nextTitle =
    nextMs != null
      ? milestoneLabel(nextMs, {
          targetCents: goal,
          goalName: name,
          milestoneMeta: active?.milestoneMeta,
        })
      : null
  const nextTreat = nextMs != null ? milestoneTreat(nextMs, active?.milestoneMeta) : undefined
  const nextRemain = nextMs != null ? Math.max(0, nextMs - saved) : 0
  const nextPct =
    nextMs != null ? Math.round(milestoneProgress(saved, nextMs, goal) * 1000) / 10 : 0
  const weeklyGoalIn =
    Math.floor(
      ((state.settings.weeklyAllowanceCents + state.settings.expectedPrintxWeeklyCents) *
        state.settings.allocation.iphone) /
        100,
    )
  const weeksNext = nextMs != null ? weeksToMilestone(nextRemain, weeklyGoalIn) : null

  const apple = state.settings.appleCashConfirmedCents
  const appleDiff = apple == null ? null : balances.combined - apple
  const appleStatus =
    apple == null
      ? 'Set balance'
      : appleDiff === 0
        ? 'Matched'
        : appleDiff! > 0
          ? 'Over Wallet'
          : 'Under Wallet'
  const appleProblem = apple == null || appleDiff !== 0

  const tz = state.settings.timezone || 'America/Chicago'
  const today = zonedDateISO(tz)
  const weekStart = mondayOfISOWeek(today)
  const weekEnd = addDaysISO(weekStart, 6)
  const week = weekStats(state.transactions, weekStart, weekEnd)

  const goalChart = useMemo(() => {
    const txs = [...state.transactions].sort(
      (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    )
    let running = 0
    const points: { date: string; goal: number; target: number }[] = []
    for (const tx of txs) {
      if (tx.settledAt === null) continue
      if (tx.allocation) {
        const a = normalizeAllocationCents(tx.allocation)
        running += a.iphone
      }
      if (points.length === 0 || points[points.length - 1]!.date !== tx.date) {
        points.push({ date: tx.date, goal: fromCents(running), target: fromCents(goal) })
      } else {
        points[points.length - 1]!.goal = fromCents(running)
      }
    }
    if (points.length === 0) {
      points.push({ date: today, goal: fromCents(saved), target: fromCents(goal) })
    }
    return points.slice(-40)
  }, [state.transactions, goal, saved, today])

  useEffect(() => {
    if (location.hash === '#this-week' || new URLSearchParams(location.search).get('focus') === 'week') {
      setWeekFlash(true)
      document.getElementById('this-week')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const t = window.setTimeout(() => setWeekFlash(false), 2500)
      return () => window.clearTimeout(t)
    }
  }, [location.hash, location.search])

  const onLogAllowance = () => {
    setAllowMsg('')
    const res = logWeeklyAllowance()
    if (!res.ok) {
      setAllowMsg(res.error)
      return
    }
    setAllowMsg('Allowance logged and split into your pots.')
  }

  return (
    <div className="space-y-6">
      <header className="animate-in">
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Dashboard</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--muted)]">
          {active ? `Working toward ${name}.` : 'Set a goal in Settings to track progress.'}
        </p>
      </header>

      {appleProblem ? (
        <Link
          to="/apple-cash"
          className="card flex items-start gap-3 border-[var(--orange)]/50 bg-[var(--orange)]/10 p-4"
        >
          <AlertTriangle className="mt-0.5 shrink-0 text-[var(--orange)]" size={22} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[var(--orange)]">
              {apple == null ? 'Apple Cash not confirmed' : `Apple Cash ${appleStatus}`}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {apple == null
                ? 'Confirm your Wallet balance so Fundly matches real money.'
                : `Wallet ${formatUsd(apple)} · Fundly ${formatUsd(balances.combined)} · diff ${formatUsd(Math.abs(appleDiff ?? 0))}. Tap to fix.`}
            </p>
          </div>
        </Link>
      ) : null}

      <section
        id="this-week"
        className={`card space-y-4 p-5 transition ${
          weekFlash ? 'ring-2 ring-[var(--green)]' : ''
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <CalendarDays size={18} className="text-[var(--green)]" aria-hidden />
              This week
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {weekStart} → {weekEnd}
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onLogAllowance}>
            Log allowance
          </button>
        </div>
        {allowMsg ? (
          <p
            className={`text-sm ${
              allowMsg.includes('already') || allowMsg.includes('Set')
                ? 'text-[var(--danger)]'
                : 'text-[var(--green)]'
            }`}
          >
            {allowMsg}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Income in</p>
            <p className="mt-1 text-xl font-extrabold text-[var(--green)]">
              {formatSignedUsd(week.incomeCents, 'in')}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Spent</p>
            <p className="mt-1 text-xl font-extrabold text-[var(--danger)]">
              {formatSignedUsd(week.spentCents, 'out')}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Spending left
            </p>
            <p className="mt-1 text-xl font-extrabold text-[var(--blue)]">
              {formatUsd(balances.spending)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Goal gained
            </p>
            <p className="mt-1 text-xl font-extrabold text-[var(--green)]">
              {formatSignedUsd(week.goalGainedCents, week.goalGainedCents >= 0 ? 'in' : 'out')}
            </p>
          </div>
        </div>
        {state.settings.lastRecurringSkip ? (
          <p className="text-sm text-[var(--orange)]">
            Subscription skipped: {state.settings.lastRecurringSkip.name} on{' '}
            {state.settings.lastRecurringSkip.dueDate} — not enough Spending.
          </p>
        ) : null}
      </section>

      {active && goal > 0 ? (
        <Link
          to="/savings"
          className="card block space-y-3 border-[var(--green)]/30 p-5 transition hover:border-[var(--green)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--green)]">
                <Trophy size={14} aria-hidden />
                {nextMs == null ? 'All milestones done' : 'Next milestone'}
              </p>
              <p className="mt-1 text-xl font-extrabold">
                {nextMs == null ? `${name} unlocked!` : nextTitle}
              </p>
              {nextMs != null ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatUsd(nextRemain)} to go · {formatUsd(nextMs)}
                  {weeksNext != null ? ` · ~${weeksNext} wk` : ''}
                </p>
              ) : (
                <p className="mt-1 text-sm text-[var(--muted)]">You hit every checkpoint for this goal.</p>
              )}
            </div>
            {nextTreat ? (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--orange)]/15 px-3 py-1 text-xs font-semibold text-[var(--orange)]">
                <Gift size={12} aria-hidden />
                Reward: {nextTreat}
              </p>
            ) : null}
          </div>
          {nextMs != null ? (
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${nextPct}%` }} />
            </div>
          ) : null}
        </Link>
      ) : null}

      <section className="card animate-in p-5 sm:p-7">
        {!active ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
                <Target size={16} aria-hidden />
                No goal yet
              </p>
              <p className="mt-2 text-[var(--muted)]">
                Create one goal in Settings — name it, set the target, then save toward it.
              </p>
            </div>
            <Link to="/settings" className="btn btn-primary">
              Create a goal
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
                  <Target size={16} aria-hidden />
                  {name}
                </p>
                <p className="mt-1 text-4xl font-extrabold tracking-tight text-[var(--green)] sm:text-5xl">
                  {formatUsd(saved)}
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Goal {formatUsd(goal)} · {formatUsd(remaining)} remaining · {pct}% complete
                </p>
                {active.note ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">{active.note}</p>
                ) : null}
              </div>
              <div className="text-right text-sm text-[var(--muted)]">
                <p className="inline-flex items-center gap-1.5">
                  <CalendarDays size={14} aria-hidden />
                  Estimated goal date
                </p>
                <p className="mt-1 text-lg font-bold text-[var(--text)]">
                  {eta
                    ? eta.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '-'}
                </p>
              </div>
            </div>
            <div className="progress-track mt-6">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            {goal > 0 ? (
              <div className="mt-6 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={goalChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} hide={goalChart.length > 12} />
                    <YAxis stroke="var(--muted)" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                      }}
                    />
                    <ReferenceLine y={fromCents(goal)} stroke="var(--green)" strokeDasharray="4 4" />
                    <Line
                      type="monotone"
                      dataKey="goal"
                      stroke="var(--green)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Combined total"
          value={formatUsd(balances.combined)}
          accent="green"
          icon={<PiggyBank size={16} aria-hidden />}
        />
        {state.settings.businesses.map((b) => (
          <StatCard
            key={b.id}
            label={b.name}
            value={formatUsd(
              b.id === 'printx'
                ? printxEarningsCents(state.transactions)
                : businessEarningsCents(state.transactions, b.id),
            )}
            accent={b.id === 'printx' ? 'blue' : 'orange'}
            icon={<BusinessLogo business={b} size={16} />}
          />
        ))}
        <StatCard
          label="Allowance received"
          value={formatUsd(allowanceTotalCents(state.transactions))}
          accent="orange"
          icon={<Wallet size={16} aria-hidden />}
        />
        <StatCard
          label="Spending available"
          value={formatUsd(balances.spending)}
          hint={`Extra ${formatUsd(balances.extra)} · Charity ${formatUsd(balances.charity)}`}
          icon={<Wallet size={16} aria-hidden />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <Target size={14} aria-hidden />
            {active ? `${name} fund` : 'Goal fund'}
          </p>
          <p className="mt-2 text-2xl font-extrabold">{formatUsd(balances.iphone)}</p>
          <div className="progress-track mt-3">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="card p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <Wallet size={14} aria-hidden />
            Spending Money
          </p>
          <p className="mt-2 text-2xl font-extrabold text-[var(--blue)]">
            {formatUsd(balances.spending)}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">Purchases come from here only</p>
        </div>
        <div className="card p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <PiggyBank size={14} aria-hidden />
            Extra Savings
          </p>
          <p className="mt-2 text-2xl font-extrabold text-[var(--orange)]">
            {formatUsd(balances.extra)}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">No fixed target</p>
        </div>
        <div className="card p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <Heart size={14} aria-hidden />
            Charity
          </p>
          <p className="mt-2 text-2xl font-extrabold text-[var(--pink)]">
            {formatUsd(balances.charity)}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">Give when you are ready</p>
        </div>
      </div>

      {!appleProblem ? (
        <Link
          to="/apple-cash"
          className="card flex items-center justify-between gap-4 p-4 transition hover:border-[var(--green)]"
        >
          <div className="flex items-start gap-3">
            <Wallet size={20} className="mt-0.5 text-[var(--blue)]" aria-hidden />
            <div>
              <p className="text-sm font-semibold">Apple Cash</p>
              <p className="text-sm text-[var(--muted)]">
                {formatUsd(apple!)} confirmed · virtual {formatUsd(balances.combined)}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--green)]/15 px-3 py-1 text-xs font-bold text-[var(--green)]">
            <CheckCircle2 size={14} aria-hidden />
            Matched
          </span>
        </Link>
      ) : null}

      <p className="text-xs text-[var(--muted)]">
        Expected weekly inflow about $
        {fromCents(
          state.settings.weeklyAllowanceCents + state.settings.expectedPrintxWeeklyCents,
        ).toFixed(2)}
      </p>
    </div>
  )
}
