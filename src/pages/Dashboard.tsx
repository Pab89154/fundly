import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Heart,
  PiggyBank,
  Target,
  Store,
  Watch,
  Wallet,
} from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { formatUsd, fromCents } from '../lib/money'
import {
  allowanceTotalCents,
  businessEarningsCents,
  estimateGoalDate,
  printxEarningsCents,
  weekNumber,
} from '../lib/balances'
import { StatCard } from '../components/StatCard'
import { goalName, goalTargetCents } from '../types'

export function Dashboard() {
  const { state, balances } = useMoney()
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

  return (
    <div className="space-y-6">
      <header className="animate-in">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Dashboard</h2>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--green)]">
            <CalendarDays size={14} aria-hidden />
            Week {weekNumber()}
          </p>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--muted)]">
          {active
            ? `Working toward ${name}.`
            : 'Set a goal in Settings to track progress.'}
        </p>
      </header>

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
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-[var(--green)]/15 px-3 py-1 text-[var(--green)]">
            {state.settings.allocation.iphone}% Goal
          </span>
          <span className="rounded-full bg-[var(--blue)]/15 px-3 py-1 text-[var(--blue)]">
            {state.settings.allocation.spending}% Spending
          </span>
          <span className="rounded-full bg-[var(--orange)]/15 px-3 py-1 text-[var(--orange)]">
            {state.settings.allocation.extra}% Extra
          </span>
          <span className="rounded-full bg-[var(--pink)]/15 px-3 py-1 text-[var(--pink)]">
            {state.settings.allocation.charity}% Charity
          </span>
        </div>
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
        <StatCard
          label="PrintX earned"
          value={formatUsd(printxEarningsCents(state.transactions))}
          accent="blue"
          icon={<Store size={16} aria-hidden />}
        />
        {state.settings.businesses.map((b) => (
          <StatCard
            key={b.id}
            label={b.name}
            value={formatUsd(businessEarningsCents(state.transactions, b.id))}
            accent="orange"
            icon={<Watch size={16} aria-hidden />}
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

      <Link
        to="/apple-cash"
        className="card flex items-center justify-between gap-4 p-4 transition hover:border-[var(--green)]"
      >
        <div className="flex items-start gap-3">
          <Wallet size={20} className="mt-0.5 text-[var(--blue)]" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Apple Cash</p>
            <p className="text-sm text-[var(--muted)]">
              {apple == null
                ? 'Confirm your Wallet balance'
                : `${formatUsd(apple)} confirmed · virtual ${formatUsd(balances.combined)}`}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
            appleStatus === 'Matched'
              ? 'bg-[var(--green)]/15 text-[var(--green)]'
              : 'bg-[var(--orange)]/15 text-[var(--orange)]'
          }`}
        >
          {appleStatus === 'Matched' ? (
            <CheckCircle2 size={14} aria-hidden />
          ) : (
            <AlertTriangle size={14} aria-hidden />
          )}
          {appleStatus}
        </span>
      </Link>

      <p className="text-xs text-[var(--muted)]">
        Expected weekly inflow about $
        {fromCents(
          state.settings.weeklyAllowanceCents + state.settings.expectedPrintxWeeklyCents,
        ).toFixed(2)}
      </p>
    </div>
  )
}
