import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Briefcase, PlusCircle } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useMoney } from '../store/MoneyContext'
import { formatTxUsd, formatUsd, fromCents, localDateISO, parseLocalDate } from '../lib/money'
import { businessEarningsCents, startOfMonth, startOfWeek } from '../lib/balances'

export function BusinessPage() {
  const { businessId = '' } = useParams()
  const { state } = useMoney()
  const business = state.settings.businesses.find((b) => b.id === businessId)

  const week = businessEarningsCents(state.transactions, businessId, { since: startOfWeek() })
  const month = businessEarningsCents(state.transactions, businessId, { since: startOfMonth() })
  const life = businessEarningsCents(state.transactions, businessId)

  const weeklyChart = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of state.transactions) {
      if (tx.source !== businessId) continue
      if (tx.type !== 'income' && tx.type !== 'import' && tx.type !== 'refund') continue
      const d = parseLocalDate(tx.date)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const wk = localDateISO(weekStart)
      const delta = tx.allocation
        ? tx.allocation.iphone +
          tx.allocation.spending +
          tx.allocation.extra +
          (tx.allocation.charity ?? 0)
        : Math.abs(tx.amountCents)
      map.set(wk, (map.get(wk) || 0) + delta)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([weekStart, cents]) => ({
        week: weekStart.slice(5),
        usd: fromCents(cents),
        cents,
      }))
  }, [state.transactions, businessId])

  const bestWeek = useMemo(() => {
    if (weeklyChart.length === 0) return null
    return weeklyChart.reduce((a, b) => (b.cents > a.cents ? b : a))
  }, [weeklyChart])

  const monthTarget = business?.monthlyTargetCents ?? null
  const monthPct =
    monthTarget && monthTarget > 0
      ? Math.min(100, Math.round((month / monthTarget) * 1000) / 10)
      : null

  const recent = state.transactions
    .filter((t) => t.source === businessId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)

  if (!business) {
    return <Navigate to="/settings" replace />
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <Briefcase size={28} className="text-[var(--orange)]" aria-hidden />
            {business.name}
          </h2>
          <p className="mt-2 text-[var(--muted)]">
            {business.note?.trim() || 'Enter sales by hand — money splits across your pots.'}
          </p>
        </div>
        <Link to={`/income?source=${encodeURIComponent(business.id)}`} className="btn btn-primary">
          <PlusCircle size={16} aria-hidden />
          Add sale
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">This week</p>
          <p className="mt-2 text-2xl font-extrabold">{formatUsd(week)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">This month</p>
          <p className="mt-2 text-2xl font-extrabold">{formatUsd(month)}</p>
          {monthTarget && monthTarget > 0 ? (
            <>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Target {formatUsd(monthTarget)} · {monthPct}%
              </p>
              <div className="progress-track mt-2">
                <div className="progress-fill" style={{ width: `${monthPct}%` }} />
              </div>
            </>
          ) : null}
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Best week</p>
          <p className="mt-2 text-2xl font-extrabold">
            {bestWeek ? formatUsd(bestWeek.cents) : formatUsd(0)}
          </p>
          {bestWeek ? (
            <p className="mt-2 text-xs text-[var(--muted)]">Week of {bestWeek.week}</p>
          ) : null}
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">All time</p>
          <p className="mt-2 text-2xl font-extrabold">{formatUsd(life)}</p>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-4 font-bold">Weekly sales</h3>
        {weeklyChart.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No sales yet — tap Add sale.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" stroke="var(--muted)" fontSize={12} />
                <YAxis stroke="var(--muted)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="usd" fill="var(--orange)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h3 className="font-bold">Recent {business.name} income</h3>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {recent.length === 0 ? (
            <li className="p-5 text-sm text-[var(--muted)]">Nothing recorded yet.</li>
          ) : (
            recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="font-semibold">{t.description || `${business.name} sale`}</p>
                  <p className="text-sm text-[var(--muted)]">{t.date}</p>
                </div>
                <p className="font-extrabold text-[var(--green)]">{formatTxUsd(t)}</p>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
