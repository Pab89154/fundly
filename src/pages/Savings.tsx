import { useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  CheckCircle2,
  Heart,
  Lock,
  Smartphone,
  Store,
  Wallet,
  PiggyBank,
} from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import {
  formatUsd,
  milestonesForTarget,
  milestoneLabel,
  type AccountId,
} from '../lib/money'
import { printxUnsettledCents } from '../lib/balances'
import { NativeSelect } from '../components/NativeSelect'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { goalName, goalTargetCents } from '../types'

export function Savings() {
  const {
    balances,
    state,
    addTransfer,
    settlePrintxTransaction,
    settleAllPrintxPending,
    rebalanceToAllocation,
  } = useMoney()
  const [from, setFrom] = useState<AccountId>('extra')
  const [to, setTo] = useState<AccountId>('iphone')
  const [amount, setAmount] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [confirmRebalance, setConfirmRebalance] = useState(false)

  const pendingPrintx = useMemo(
    () =>
      state.transactions
        .filter((tx) => tx.settledAt === null)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [state.transactions],
  )
  const pendingTotal = printxUnsettledCents(state.transactions)

  const historyByAccount = useMemo(() => {
    const map: Record<AccountId, typeof state.transactions> = {
      iphone: [],
      spending: [],
      extra: [],
      charity: [],
    }
    for (const tx of state.transactions) {
      if (tx.allocation) {
        if (tx.allocation.iphone) map.iphone.push(tx)
        if (tx.allocation.spending) map.spending.push(tx)
        if (tx.allocation.extra) map.extra.push(tx)
        if (tx.allocation.charity) map.charity.push(tx)
      }
      if (tx.type === 'spending' || tx.type === 'apple_cash_purchase') map.spending.push(tx)
      if (tx.type === 'transfer') {
        if (tx.fromAccount) map[tx.fromAccount].push(tx)
        if (tx.toAccount) map[tx.toAccount].push(tx)
      }
    }
    return map
  }, [state.transactions])

  const gName = goalName(state.settings)
  const gTarget = goalTargetCents(state.settings)
  const milestoneList = milestonesForTarget(gTarget)
  const accounts: {
    id: AccountId
    title: string
    blurb: string
    accent: string
    icon: typeof Smartphone
  }[] = [
    {
      id: 'iphone',
      title: state.settings.activeGoal ? `${gName} fund` : 'Goal fund',
      blurb: gTarget > 0 ? `${formatUsd(gTarget)} target` : 'Set a goal in Settings',
      accent: 'text-[var(--green)]',
      icon: Smartphone,
    },
    {
      id: 'spending',
      title: 'Spending Money',
      blurb: 'Available whenever you want',
      accent: 'text-[var(--blue)]',
      icon: Wallet,
    },
    {
      id: 'extra',
      title: 'Extra Savings',
      blurb: 'No fixed target',
      accent: 'text-[var(--orange)]',
      icon: PiggyBank,
    },
    {
      id: 'charity',
      title: 'Charity',
      blurb: 'Give when you are ready',
      accent: 'text-[var(--pink)]',
      icon: Heart,
    },
  ]
  const goalPct = Math.min(
    100,
    gTarget > 0 ? Math.round((balances.iphone / gTarget) * 1000) / 10 : 0,
  )

  const onTransfer = (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    setErr('')
    const res = addTransfer({
      amountUsd: Number(amount),
      from,
      to,
      date: new Date().toISOString().slice(0, 10),
      description: 'Transfer between savings',
    })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setMsg('Transfer recorded.')
    setAmount('')
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <PiggyBank size={28} className="text-[var(--green)]" aria-hidden />
          Savings
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Four pots · combined {formatUsd(balances.combined)}. Purchases never drain Goal / Extra /
          Charity — use Transfer below to move money yourself.
        </p>
        <button
          type="button"
          className="btn btn-secondary mt-3"
          onClick={() => {
            setErr('')
            setMsg('')
            setConfirmRebalance(true)
          }}
        >
          Redistribute all pots to {state.settings.allocation.iphone}/
          {state.settings.allocation.spending}/{state.settings.allocation.extra}/
          {state.settings.allocation.charity}
        </button>
        <p className="mt-2 max-w-xl text-xs text-[var(--muted)]">
          Redistribute reshuffles your total across every pot to match Settings %. It is not a
          purchase — confirm before using.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {accounts.map((a) => {
          const bal = balances[a.id]
          const pct =
            a.id === 'iphone'
              ? goalPct
              : balances.combined > 0
                ? Math.round((bal / balances.combined) * 1000) / 10
                : 0
          const Icon = a.icon
          return (
            <div key={a.id} className="card p-5">
              <div className="flex items-center gap-2">
                <Icon size={18} className={a.accent} aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {a.title}
                </p>
              </div>
              <p className={`mt-2 text-3xl font-extrabold ${a.accent}`}>{formatUsd(bal)}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{a.blurb}</p>
              <div className="progress-track mt-4">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                {historyByAccount[a.id].length} related rows (includes share of split income)
              </p>
            </div>
          )
        })}
      </div>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Store size={18} className="text-[var(--green)]" aria-hidden />
              Waiting to settle
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Prefer PrintX → Sync: Mark settled on printx.pw/money and Fundly imports it. Leftover
              rows below are older imports you can clear here.
            </p>
          </div>
          {pendingPrintx.length > 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setErr('')
                const res = settleAllPrintxPending()
                if (!res.ok) {
                  setErr(res.error)
                  return
                }
                setMsg(`Settled ${res.settled} PrintX payout(s) into your pots.`)
              }}
            >
              Mark all settled · {formatUsd(pendingTotal)}
            </button>
          ) : null}
        </div>
        {pendingPrintx.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Nothing waiting. New settlements land via PrintX → Sync.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {pendingPrintx.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{t.description || 'PrintX payout'}</p>
                  <p className="text-[var(--muted)]">
                    {t.date} · not in your pots yet
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-extrabold text-[var(--orange)]">{formatUsd(t.amountCents)}</p>
                  <button
                    type="button"
                    className="btn btn-secondary px-3 py-1 text-xs"
                    onClick={() => {
                      setErr('')
                      const res = settlePrintxTransaction(t.id)
                      if (!res.ok) {
                        setErr(res.error)
                        return
                      }
                      setMsg('PrintX payout settled into your pots.')
                    }}
                  >
                    Mark settled
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h3 className="text-lg font-bold">Milestones</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {milestoneList.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Create a goal in Settings to unlock milestones.
            </p>
          ) : (
            milestoneList.map((m) => {
              const hit = balances.iphone >= m
              return (
                <div
                  key={m}
                  className={`rounded-xl border p-4 ${
                    hit
                      ? 'border-[var(--green)]/40 bg-[var(--green)]/10'
                      : 'border-[var(--border)] bg-[var(--card-2)]'
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    {hit ? (
                      <CheckCircle2 size={18} className="text-[var(--green)]" aria-hidden />
                    ) : (
                      <Lock size={18} className="text-[var(--muted)]" aria-hidden />
                    )}
                    <p className="font-semibold">
                      {milestoneLabel(m, { targetCents: gTarget, goalName: gName })}
                    </p>
                  </div>
                  <p className="text-sm text-[var(--muted)]">{hit ? 'Unlocked' : 'Locked'}</p>
                </div>
              )
            })
          )}
        </div>
      </section>

      <form className="card space-y-4 p-5" onSubmit={onTransfer}>
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <ArrowRightLeft size={18} aria-hidden />
          Transfer between pots
        </h3>
        <p className="text-sm text-[var(--muted)]">
          Move money from the pot you select to another — only those two balances change.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">From</label>
            <NativeSelect
              aria-label="From"
              value={from}
              onChange={(v) => setFrom(v as AccountId)}
              options={[
                { value: 'iphone', label: 'Goal' },
                { value: 'spending', label: 'Spending' },
                { value: 'extra', label: 'Extra' },
                { value: 'charity', label: 'Charity' },
              ]}
            />
          </div>
          <div>
            <label className="label">To</label>
            <NativeSelect
              aria-label="To"
              value={to}
              onChange={(v) => setTo(v as AccountId)}
              options={[
                { value: 'iphone', label: 'Goal' },
                { value: 'spending', label: 'Spending' },
                { value: 'extra', label: 'Extra' },
                { value: 'charity', label: 'Charity' },
              ]}
            />
          </div>
          <div>
            <label className="label">Amount</label>
            <input
              className="field"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
        </div>
        {err ? <p className="text-sm text-[var(--danger)]">{err}</p> : null}
        {msg ? <p className="text-sm text-[var(--green)]">{msg}</p> : null}
        <button type="submit" className="btn btn-secondary">
          Record transfer
        </button>
      </form>

      <ConfirmDialog
        open={confirmRebalance}
        title="Redistribute all pots?"
        message={`This moves money between Goal, Spending, Extra, and Charity so totals match your ${state.settings.allocation.iphone}/${state.settings.allocation.spending}/${state.settings.allocation.extra}/${state.settings.allocation.charity} split. Combined stays the same. Purchases do not do this.`}
        confirmLabel="Redistribute"
        cancelLabel="Cancel"
        onCancel={() => setConfirmRebalance(false)}
        onConfirm={() => {
          setConfirmRebalance(false)
          setErr('')
          const res = rebalanceToAllocation()
          if (!res.ok) {
            setErr(res.error)
            return
          }
          const a = state.settings.allocation
          setMsg(`Pots redistributed to ${a.iphone}/${a.spending}/${a.extra}/${a.charity}.`)
        }}
      />
    </div>
  )
}
