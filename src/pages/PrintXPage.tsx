import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, RefreshCw, Store, Undo2 } from 'lucide-react'
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
import { apiUrl } from '../lib/apiBase'
import { formatUsd, fromCents } from '../lib/money'
import {
  printxEarningsCents,
  printxUnsettledCents,
  startOfMonth,
  startOfWeek,
} from '../lib/balances'
import type { PrintxFeedEvent } from '../types'

type SyncStatus = {
  configured: boolean
  base?: string
}

export function PrintXPage() {
  const {
    state,
    importPrintxEvents,
    setPrintxOpenOwed,
    resolvePrintxNow,
    undoResolvePrintx,
    canUndoResolvePrintx,
    printxOpenRemainingCents,
  } = useMoney()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(apiUrl('/api/printx/status'))
      .then((r) => r.json())
      .then((d: SyncStatus) => setStatus(d))
      .catch(() => setStatus({ configured: false }))
  }, [])

  const week = printxEarningsCents(state.transactions, { since: startOfWeek() })
  const month = printxEarningsCents(state.transactions, { since: startOfMonth() })
  const life = printxEarningsCents(state.transactions)
  const stripe = printxEarningsCents(state.transactions, { printxSource: 'stripe' })
  const cash = printxEarningsCents(state.transactions, { printxSource: 'cash' })
  const waitingLeftover = printxUnsettledCents(state.transactions)
  const lastResolved = Number(state.settings.printxLastResolvedCents) || 0

  const weeklyChart = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of state.transactions) {
      if (tx.source !== 'printx' && tx.type !== 'import') continue
      if (tx.type !== 'income' && tx.type !== 'import' && tx.type !== 'refund') continue
      if (tx.settledAt === null) continue
      const d = new Date(tx.date)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const wk = weekStart.toISOString().slice(0, 10)
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
      }))
  }, [state.transactions])

  const imported = state.transactions
    .filter((t) => t.source === 'printx' || t.type === 'import')
    .slice()
    .reverse()
    .slice(0, 20)

  const sync = async () => {
    setSyncing(true)
    setErr('')
    setMsg('')
    try {
      const res = await fetch(apiUrl('/api/printx/sync'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: state.settings.syncCursor || undefined }),
      })
      const data = (await res.json()) as {
        error?: string
        configured?: boolean
        events?: PrintxFeedEvent[]
        openOwedUsd?: number
      }
      if (!res.ok) {
        setErr(data.error || `Sync failed (${res.status})`)
        setStatus({ configured: Boolean(data.configured) })
        return
      }
      importPrintxEvents(data.events || [])
      if (typeof data.openOwedUsd === 'number') {
        setPrintxOpenOwed(data.openOwedUsd)
        setMsg(`Synced · open on PrintX $${data.openOwedUsd.toFixed(2)}`)
      } else {
        setMsg('Synced')
      }
      setStatus({ configured: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const onResolve = () => {
    setErr('')
    const res = resolvePrintxNow()
    if (!res.ok) {
      setErr(res.error)
      return
    }
    const openPart = formatUsd(res.openCents)
    setMsg(
      res.waitingCents > 0
        ? `Resolved ${openPart} into your pots (also cleared ${formatUsd(res.waitingCents)} leftover). Open is $0.`
        : `Resolved ${openPart} into your pots. Open is $0. You can Undo if that was a mistake.`,
    )
  }

  const onUndoResolve = () => {
    setErr('')
    const res = undoResolvePrintx()
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setMsg('Undid Mark resolved — open is back.')
  }

  useEffect(() => {
    if (!state.settings.onboardingComplete) return
    if (!status?.configured) return
    if (state.settings.lastSyncedAt) return
    void sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.configured, state.settings.onboardingComplete])

  const canResolve = printxOpenRemainingCents > 0 || waitingLeftover > 0

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <Store size={28} className="text-[var(--green)]" aria-hidden />
            PrintX
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-1 text-[var(--muted)]">
            Sync the open balance, then Mark resolved anytime to put it in your pots ·{' '}
            <a
              className="inline-flex items-center gap-1 text-[var(--blue)] underline"
              href="https://printx.pw/money"
              target="_blank"
              rel="noreferrer"
            >
              printx.pw/money
              <ExternalLink size={14} aria-hidden />
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={sync} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} aria-hidden />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onResolve}
            disabled={!canResolve}
          >
            <CheckCircle2 size={16} aria-hidden />
            Mark resolved
            {printxOpenRemainingCents > 0 ? ` · ${formatUsd(printxOpenRemainingCents)}` : ''}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onUndoResolve}
            disabled={!canUndoResolvePrintx}
          >
            <Undo2 size={16} aria-hidden />
            Undo resolve
          </button>
        </div>
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
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Open</p>
          <p className="mt-2 text-2xl font-extrabold text-[var(--orange)]">
            {formatUsd(printxOpenRemainingCents)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Owed on PrintX — press Mark resolved to put it in pots and reset to $0
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Last resolved</p>
          <p className="mt-2 text-2xl font-extrabold text-[var(--green)]">
            {formatUsd(lastResolved)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {state.settings.printxLastResolvedAt
              ? `Resolved ${new Date(state.settings.printxLastResolvedAt).toLocaleString()}`
              : 'Nothing resolved yet'}
          </p>
          {canUndoResolvePrintx ? (
            <button type="button" className="btn btn-secondary mt-3 w-full" onClick={onUndoResolve}>
              <Undo2 size={16} aria-hidden />
              Undo mark resolved
            </button>
          ) : null}
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">In your pots</p>
          <p className="mt-2 text-2xl font-extrabold">{formatUsd(life)}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">PrintX money already counted in Fundly</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">This week</p>
          <p className="mt-2 text-2xl font-extrabold">{formatUsd(week)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">This month</p>
          <p className="mt-2 text-2xl font-extrabold">{formatUsd(month)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Stripe / cash</p>
          <p className="mt-2 text-2xl font-extrabold">
            {formatUsd(stripe)} · {formatUsd(cash)}
          </p>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-bold">Weekly earnings</h3>
        <div className="mt-4 h-64">
          {weeklyChart.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No resolved PrintX earnings yet.</p>
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
        <h3 className="font-bold">PrintX transactions</h3>
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {imported.length === 0 ? (
            <li className="py-3 text-sm text-[var(--muted)]">None yet</li>
          ) : (
            imported.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-semibold">{t.description || t.type}</p>
                  <p className="text-[var(--muted)]">
                    {t.date} · {t.settledAt === null ? 'leftover' : 'in pots'}
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
