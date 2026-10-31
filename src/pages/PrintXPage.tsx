import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw, Store } from 'lucide-react'
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
import { formatUsd, fromCents } from '../lib/money'
import { printxEarningsCents, startOfMonth, startOfWeek } from '../lib/balances'
import type { PrintxFeedEvent } from '../types'

type SyncStatus = {
  configured: boolean
  base?: string
}

export function PrintXPage() {
  const { state, importPrintxEvents } = useMoney()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/printx/status')
      .then((r) => r.json())
      .then((d: SyncStatus) => setStatus(d))
      .catch(() => setStatus({ configured: false }))
  }, [])

  const week = printxEarningsCents(state.transactions, { since: startOfWeek() })
  const month = printxEarningsCents(state.transactions, { since: startOfMonth() })
  const life = printxEarningsCents(state.transactions)
  const stripe = printxEarningsCents(state.transactions, { printxSource: 'stripe' })
  const cash = printxEarningsCents(state.transactions, { printxSource: 'cash' })

  const weeklyChart = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of state.transactions) {
      if (tx.source !== 'printx' && tx.type !== 'import') continue
      if (tx.type !== 'income' && tx.type !== 'import' && tx.type !== 'refund') continue
      const d = new Date(tx.date)
      const key = `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}-${d.getMonth() + 1}`
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const wk = weekStart.toISOString().slice(0, 10)
      const delta = tx.allocation
        ? tx.allocation.iphone + tx.allocation.spending + tx.allocation.extra
        : Math.abs(tx.amountCents)
      map.set(wk, (map.get(wk) || 0) + delta)
      void key
      void label
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([weekStart, cents]) => ({
        week: weekStart.slice(5),
        usd: fromCents(cents),
      }))
  }, [state.transactions])

  const imported = state.transactions
    .filter((t) => t.externalId || t.type === 'import')
    .slice()
    .reverse()
    .slice(0, 20)

  const sync = async () => {
    setSyncing(true)
    setErr('')
    setMsg('')
    try {
      const res = await fetch('/api/printx/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: state.settings.syncCursor || undefined }),
      })
      const data = (await res.json()) as {
        error?: string
        configured?: boolean
        events?: PrintxFeedEvent[]
        serverTime?: string
      }
      if (!res.ok) {
        setErr(data.error || `Sync failed (${res.status})`)
        setStatus({ configured: Boolean(data.configured) })
        return
      }
      const events = data.events || []
      const result = importPrintxEvents(events)
      setMsg(
        `Synced ${result.imported} new · skipped ${result.skipped} duplicates · ${events.length} returned`,
      )
      setStatus({ configured: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // Auto-sync once when configured and onboarding done
  useEffect(() => {
    if (!state.settings.onboardingComplete) return
    if (!status?.configured) return
    // soft auto-sync on first visit to page only if never synced
    if (state.settings.lastSyncedAt) return
    void sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.configured, state.settings.onboardingComplete])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <Store size={28} className="text-[var(--green)]" aria-hidden />
            PrintX
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-1 text-[var(--muted)]">
            Business earnings for Pablo only ·{' '}
            <a
              className="inline-flex items-center gap-1 text-[var(--blue)] underline"
              href="https://printx.pw"
              target="_blank"
              rel="noreferrer"
            >
              printx.pw
              <ExternalLink size={14} aria-hidden />
            </a>
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={sync} disabled={syncing}>
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} aria-hidden />
          {syncing ? 'Syncing...' : 'Sync from PrintX'}
        </button>
      </header>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <div>
          <p className="font-semibold">Connection</p>
          <p className="text-[var(--muted)]">
            {status == null
              ? 'Checking…'
              : status.configured
                ? 'Server sync configured (API key stays on server)'
                : 'Not configured — set PRINTX_MONEY_TRACKER_API_KEY in server .env'}
          </p>
        </div>
        <div className="text-right text-[var(--muted)]">
          <p>Last sync</p>
          <p className="font-semibold text-[var(--text)]">
            {state.settings.lastSyncedAt
              ? new Date(state.settings.lastSyncedAt).toLocaleString()
              : 'Never'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">This week</p>
          <p className="mt-2 text-2xl font-extrabold">{formatUsd(week)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">This month</p>
          <p className="mt-2 text-2xl font-extrabold">{formatUsd(month)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Lifetime</p>
          <p className="mt-2 text-2xl font-extrabold text-[var(--green)]">{formatUsd(life)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Stripe earnings</p>
          <p className="mt-2 text-2xl font-extrabold text-[var(--blue)]">{formatUsd(stripe)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Cash earnings</p>
          <p className="mt-2 text-2xl font-extrabold text-[var(--orange)]">{formatUsd(cash)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Imported events</p>
          <p className="mt-2 text-2xl font-extrabold">{state.settings.importedEventIds.length}</p>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-bold">Weekly earnings</h3>
        <div className="mt-4 h-64">
          {weeklyChart.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No PrintX earnings yet — sync or add income.</p>
          ) : (
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
                <Bar dataKey="usd" fill="#30D158" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-bold">Imported transactions</h3>
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {imported.length === 0 ? (
            <li className="py-3 text-sm text-[var(--muted)]">None yet</li>
          ) : (
            imported.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-semibold">{t.description || t.type}</p>
                  <p className="text-[var(--muted)]">
                    {t.date} · {t.printxSource || 'printx'} · {t.externalId?.slice(0, 24)}
                  </p>
                </div>
                <p className="font-bold">{formatUsd(t.amountCents)}</p>
              </li>
            ))
          )}
        </ul>
      </div>

      {err ? <p className="text-sm text-[var(--danger)]">{err}</p> : null}
      {msg ? <p className="text-sm text-[var(--green)]">{msg}</p> : null}
    </div>
  )
}
