import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  PiggyBank,
  Smartphone,
  Store,
  Wallet,
} from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { formatUsd, fromCents } from '../lib/money'
import {
  allowanceTotalCents,
  estimateGoalDate,
  printxEarningsCents,
  weekNumber,
} from '../lib/balances'
import { StatCard } from '../components/StatCard'

export function Dashboard() {
  const { state, balances } = useMoney()
  const goal = state.settings.goalCents
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
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--green)]">
          <CalendarDays size={16} aria-hidden />
          Week {weekNumber()}
        </p>
        <h2 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Dashboard</h2>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Save for your iPhone Duo while keeping spending money and extra savings in sync.
        </p>
      </header>

      <section className="card animate-in p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
              <Smartphone size={16} aria-hidden />
              iPhone Duo savings
            </p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-[var(--green)] sm:text-5xl">
              {formatUsd(saved)}
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Goal {formatUsd(goal)} · {formatUsd(remaining)} remaining · {pct}% complete
            </p>
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
            {state.settings.allocation.iphone}% iPhone
          </span>
          <span className="rounded-full bg-[var(--blue)]/15 px-3 py-1 text-[var(--blue)]">
            {state.settings.allocation.spending}% Spending
          </span>
          <span className="rounded-full bg-[var(--orange)]/15 px-3 py-1 text-[var(--orange)]">
            {state.settings.allocation.extra}% Extra
          </span>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <StatCard
          label="Allowance received"
          value={formatUsd(allowanceTotalCents(state.transactions))}
          accent="orange"
          icon={<Wallet size={16} aria-hidden />}
        />
        <StatCard
          label="Spending available"
          value={formatUsd(balances.spending)}
          hint={`Extra ${formatUsd(balances.extra)}`}
          icon={<Wallet size={16} aria-hidden />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <Smartphone size={14} aria-hidden />
            iPhone Duo Fund
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
