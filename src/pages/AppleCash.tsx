import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShoppingBag,
  Wallet,
} from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { formatUsd, fromCents } from '../lib/money'

export function AppleCash() {
  const { state, balances, confirmAppleCash, reconcileAppleCash, addSpending } = useMoney()
  const confirmed = state.settings.appleCashConfirmedCents
  const diff = confirmed == null ? null : balances.combined - confirmed
  const status =
    confirmed == null
      ? 'Not set'
      : diff === 0
        ? 'Matched'
        : (diff ?? 0) > 0
          ? 'Virtual is higher'
          : 'Apple Cash is higher'

  const [wallet, setWallet] = useState(
    confirmed == null ? '' : fromCents(confirmed).toFixed(2),
  )
  const [purchase, setPurchase] = useState('')
  const [purchaseDesc, setPurchaseDesc] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [applyAdj, setApplyAdj] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const saveConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    const n = Number(wallet)
    if (Number.isNaN(n) || n < 0) {
      setErr('Enter a valid Apple Cash balance.')
      return
    }
    confirmAppleCash(n)
    setMsg('Apple Cash balance confirmed (manual — no Apple API).')
  }

  const doReconcile = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    const res = reconcileAppleCash({
      confirmedUsd: Number(wallet),
      note,
      applyAdjustment: applyAdj,
    })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setMsg(
      applyAdj
        ? 'Reconciled. Any difference was recorded as an explicit adjustment on Spending.'
        : 'Confirmed Wallet balance updated without changing virtual balances.',
    )
  }

  const recordPurchase = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    const res = addSpending({
      amountUsd: Number(purchase),
      date: purchaseDate,
      description: purchaseDesc || 'Apple Cash purchase',
      appleCash: true,
    })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setMsg('Apple Cash purchase deducted from Spending Money only.')
    setPurchase('')
    setPurchaseDesc('')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <Wallet size={28} className="text-[var(--blue)]" aria-hidden />
          Apple Cash
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Your real-world wallet. There is no Apple Cash API - confirm and reconcile manually.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <Wallet size={14} aria-hidden />
            Confirmed Apple Cash
          </p>
          <p className="mt-2 text-3xl font-extrabold">
            {confirmed == null ? '-' : formatUsd(confirmed)}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {state.settings.appleCashConfirmedAt
              ? `Updated ${new Date(state.settings.appleCashConfirmedAt).toLocaleString()}`
              : 'Not confirmed yet'}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Virtual combined
          </p>
          <p className="mt-2 text-3xl font-extrabold text-[var(--green)]">
            {formatUsd(balances.combined)}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--orange)]">
            {status === 'Matched' ? (
              <CheckCircle2 size={16} className="text-[var(--green)]" aria-hidden />
            ) : (
              <AlertTriangle size={16} aria-hidden />
            )}
            {status}
          </p>
          {diff != null ? (
            <p className="mt-1 text-sm text-[var(--muted)]">Difference {formatUsd(diff)}</p>
          ) : null}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-bold">Allocated in the tracker</h3>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex justify-between">
            <span>iPhone Duo</span>
            <span className="font-semibold text-[var(--green)]">{formatUsd(balances.iphone)}</span>
          </li>
          <li className="flex justify-between">
            <span>Spending</span>
            <span className="font-semibold text-[var(--blue)]">{formatUsd(balances.spending)}</span>
          </li>
          <li className="flex justify-between">
            <span>Extra</span>
            <span className="font-semibold text-[var(--orange)]">{formatUsd(balances.extra)}</span>
          </li>
        </ul>
      </div>

      <form className="card space-y-4 p-5" onSubmit={saveConfirm}>
        <h3 className="font-bold">Confirm Wallet balance</h3>
        <div>
          <label className="label">What Apple Cash shows now</label>
          <input
            className="field"
            type="number"
            min="0"
            step="0.01"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-secondary">
          Save confirmed balance
        </button>
      </form>

      <form className="card space-y-4 p-5" onSubmit={doReconcile}>
        <h3 className="flex items-center gap-2 font-bold">
          <RefreshCw size={18} aria-hidden />
          Reconcile
        </h3>
        <p className="text-sm text-[var(--muted)]">
          If virtual totals and Apple Cash disagree, record an explicit adjustment (never a silent
          edit).
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={applyAdj} onChange={(e) => setApplyAdj(e.target.checked)} />
          Apply difference to Spending Money
        </label>
        <div>
          <label className="label">Note (optional)</label>
          <input
            className="field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Gift received / cash withdrawn"
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Reconcile now
        </button>
      </form>

      <form className="card space-y-4 p-5" onSubmit={recordPurchase}>
        <h3 className="flex items-center gap-2 font-bold">
          <ShoppingBag size={18} aria-hidden />
          Record Apple Cash purchase
        </h3>
        <div>
          <label className="label">Amount</label>
          <input
            className="field"
            type="number"
            min="0.01"
            step="0.01"
            value={purchase}
            onChange={(e) => setPurchase(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Description</label>
          <input
            className="field"
            value={purchaseDesc}
            onChange={(e) => setPurchaseDesc(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Date</label>
          <input
            className="field"
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-secondary">
          Deduct from Spending
        </button>
      </form>

      {err ? <p className="text-sm text-[var(--danger)]">{err}</p> : null}
      {msg ? <p className="text-sm text-[var(--green)]">{msg}</p> : null}
    </div>
  )
}
