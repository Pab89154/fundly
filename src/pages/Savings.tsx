import { useMemo, useState } from 'react'
import { ArrowRightLeft, CheckCircle2, Lock, Smartphone, Wallet, PiggyBank } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { formatUsd, MILESTONES_CENTS, milestoneLabel, type AccountId } from '../lib/money'

const accounts: {
  id: AccountId
  title: string
  blurb: string
  accent: string
  icon: typeof Smartphone
}[] = [
  {
    id: 'iphone',
    title: 'iPhone Duo Fund',
    blurb: '$2,000 target',
    accent: 'text-[var(--green)]',
    icon: Smartphone,
  },
  {
    id: 'extra',
    title: 'Extra Savings',
    blurb: 'No fixed target',
    accent: 'text-[var(--orange)]',
    icon: PiggyBank,
  },
  {
    id: 'spending',
    title: 'Spending Money',
    blurb: 'Available whenever you want',
    accent: 'text-[var(--blue)]',
    icon: Wallet,
  },
]

export function Savings() {
  const { balances, state, addTransfer } = useMoney()
  const [from, setFrom] = useState<AccountId>('extra')
  const [to, setTo] = useState<AccountId>('iphone')
  const [amount, setAmount] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const historyByAccount = useMemo(() => {
    const map: Record<AccountId, typeof state.transactions> = {
      iphone: [],
      spending: [],
      extra: [],
    }
    for (const tx of state.transactions) {
      if (tx.allocation) {
        if (tx.allocation.iphone) map.iphone.push(tx)
        if (tx.allocation.spending) map.spending.push(tx)
        if (tx.allocation.extra) map.extra.push(tx)
      }
      if (tx.type === 'spending' || tx.type === 'apple_cash_purchase') map.spending.push(tx)
      if (tx.type === 'transfer') {
        if (tx.fromAccount) map[tx.fromAccount].push(tx)
        if (tx.toAccount) map[tx.toAccount].push(tx)
      }
    }
    return map
  }, [state.transactions])

  const goalPct = Math.min(
    100,
    state.settings.goalCents > 0
      ? Math.round((balances.iphone / state.settings.goalCents) * 1000) / 10
      : 0,
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
          Three accounts · combined {formatUsd(balances.combined)}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
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
                {historyByAccount[a.id].length} related transactions
              </p>
            </div>
          )
        })}
      </div>

      <section className="card p-5">
        <h3 className="text-lg font-bold">Milestones</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MILESTONES_CENTS.map((m) => {
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
                  <p className="font-semibold">{milestoneLabel(m)}</p>
                </div>
                <p className="text-sm text-[var(--muted)]">{hit ? 'Unlocked' : 'Locked'}</p>
              </div>
            )
          })}
        </div>
      </section>

      <form className="card space-y-4 p-5" onSubmit={onTransfer}>
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <ArrowRightLeft size={18} aria-hidden />
          Transfer between categories
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">From</label>
            <select className="field" value={from} onChange={(e) => setFrom(e.target.value as AccountId)}>
              <option value="iphone">iPhone</option>
              <option value="spending">Spending</option>
              <option value="extra">Extra</option>
            </select>
          </div>
          <div>
            <label className="label">To</label>
            <select className="field" value={to} onChange={(e) => setTo(e.target.value as AccountId)}>
              <option value="iphone">iPhone</option>
              <option value="spending">Spending</option>
              <option value="extra">Extra</option>
            </select>
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
    </div>
  )
}
