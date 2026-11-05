import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw, Undo2 } from 'lucide-react'
import { BusinessLogo } from '../components/BusinessLogo'
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
import { formatTxUsd, formatUsd, fromCents, localDateISO, parseLocalDate } from '../lib/money'
import {
  printxEarningsCents,
  startOfMonth,
  startOfWeek,
} from '../lib/balances'
type SyncStatus = {
  configured: boolean
  base?: string
}

export function PrintXPage() {
  const {
    state,
    syncPrintxNow,
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

  const printxBiz = state.settings.businesses.find((b) => b.id === 'printx')
  const week = printxEarningsCents(state.transactions, { since: startOfWeek() })
  const month = printxEarningsCents(state.transactions, { since: startOfMonth() })
  const life = printxEarningsCents(state.transactions)
  const ifRedeemed = life + printxOpenRemainingCents
  const lastResolved = Number(state.settings.printxLastResolvedCents) || 0

  const weeklyChart = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of state.transactions) {
      if (tx.source !== 'printx' && tx.type !== 'import') continue
      if (tx.type !== 'income' && tx.type !== 'import' && tx.type !== 'refund') continue
      if (tx.settledAt === null) continue
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
      const result = await syncPrintxNow()
      if (!result.ok) {
        setErr(result.error)
        setStatus({ configured: Boolean(result.configured) })
        return
      }
      const openLabel =
        typeof result.openOwedUsd === 'number'
          ? ` · open $${result.openOwedUsd.toFixed(2)}`
          : ''
      if (result.imported > 0) {
        setMsg(
          `Synced ${result.imported} PrintX settlement${result.imported === 1 ? '' : 's'} into your pots${openLabel}`,
        )
      } else {
        setMsg(`Synced — already up to date${openLabel}`)
      }
      setStatus({ configured: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const onUndoResolve = () => {
    setErr('')
    const res = undoResolvePrintx()
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setMsg(`Undid last settlement · ${formatUsd(res.undoneCents)} removed from pots.`)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
            <BusinessLogo
              business={printxBiz ?? { id: 'printx', logoDataUrl: null }}
              size={36}
            />
            <span className="min-w-0 break-words">{printxBiz?.name || 'PrintX'}</span>
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-1 text-[var(--muted)]">
            {printxBiz?.note?.trim() ||
              'Mark settled on PrintX Money, then Sync — Fundly pulls it into your pots'}{' '}
            ·{' '}
            <a
              className="inline-flex items-center gap-1 text-[var(--blue)] underline"
              href="https://portal.printx.pw/money"
              target="_blank"
              rel="noreferrer"
            >
              portal.printx.pw/money
              <ExternalLink size={14} aria-hidden />
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={sync} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} aria-hidden />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onUndoResolve}
            disabled={!canUndoResolvePrintx}
          >
            <Undo2 size={16} aria-hidden />
            Undo last settlement
          </button>
        </div>
      </header>

      {msg ? <p className="text-sm font-semibold text-[var(--green)]">{msg}</p> : null}
      {err ? <p className="text-sm font-semibold text-[var(--danger)]">{err}</p> : null}

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
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Open on PrintX</p>
          <p className="mt-2 text-2xl font-extrabold text-[var(--orange)]">
            {formatUsd(printxOpenRemainingCents)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Still owed on portal.printx.pw/money — Mark settled there, then Sync
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Last settlement</p>
          <p className="mt-2 text-2xl font-extrabold text-[var(--green)]">
            {formatUsd(lastResolved)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {state.settings.printxLastResolvedAt
              ? `Imported ${new Date(state.settings.printxLastResolvedAt).toLocaleString()}`
              : 'Nothing imported yet'}
          </p>
          {canUndoResolvePrintx ? (
            <button type="button" className="btn btn-secondary mt-3 w-full" onClick={onUndoResolve}>
              <Undo2 size={16} aria-hidden />
              Undo last settlement
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
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">If you redeem</p>
          <p className="mt-2 text-2xl font-extrabold">{formatUsd(ifRedeemed)}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            In pots + open on PrintX — total after Mark settled & Sync
          </p>
        </div>
      </div>

      {weeklyChart.length > 0 ? (
        <div className="card p-5">
          <h3 className="font-bold">Weekly PrintX (in pots)</h3>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyChart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="week" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="usd" fill="var(--green)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <section className="card p-5">
        <h3 className="font-bold">Recent PrintX</h3>
        {imported.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            No PrintX settlements in Fundly yet. Mark settled on PrintX, then Sync.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {imported.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-semibold">{t.description || 'PrintX'}</p>
                  <p className="text-[var(--muted)]">
                    {t.date} · {t.settledAt === null ? 'waiting' : 'in pots'}
                  </p>
                </div>
                <p className="font-extrabold text-[var(--green)]">{formatTxUsd(t)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
