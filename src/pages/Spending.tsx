import { useMemo, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import {
  ACCOUNT_LABELS,
  formatUsd,
  localDateISO,
  planSpendAcrossPots,
  toCents,
  type AccountId,
} from '../lib/money'
import { NativeSelect } from '../components/NativeSelect'
import type { SpendCategory } from '../types'

const categories: SpendCategory[] = ['food', 'games', 'apps', 'school', 'transport', 'other']

const POTS: { id: AccountId; label: string }[] = [
  { id: 'spending', label: 'Spending Money' },
  { id: 'iphone', label: 'Goal' },
  { id: 'extra', label: 'Extra Savings' },
  { id: 'charity', label: 'Charity' },
]

export function Spending() {
  const { addSpending, balances } = useMoney()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<SpendCategory>('other')
  const [fromAccount, setFromAccount] = useState<AccountId>('spending')
  const [date, setDate] = useState(localDateISO)
  const [combineFrom, setCombineFrom] = useState<AccountId[]>([])
  const [showCombine, setShowCombine] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const fromBal = balances[fromAccount]
  const fromLabel = POTS.find((p) => p.id === fromAccount)?.label ?? 'selected pot'
  const amountCents = toCents(Number(amount))
  const shortfallCents = Math.max(0, amountCents - Math.max(0, fromBal))

  const helperPots = useMemo(
    () => POTS.filter((p) => p.id !== fromAccount && balances[p.id] > 0),
    [fromAccount, balances],
  )

  const preview = useMemo(() => {
    if (!(amountCents > 0) || !showCombine) return null
    return planSpendAcrossPots(balances, amountCents, fromAccount, combineFrom)
  }, [amountCents, balances, combineFrom, fromAccount, showCombine])

  const toggleHelper = (id: AccountId) => {
    setCombineFrom((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const resetForm = () => {
    setAmount('')
    setDescription('')
    setCombineFrom([])
    setShowCombine(false)
  }

  const record = (helpers: AccountId[]) => {
    setError('')
    setOk('')
    const res = addSpending({
      amountUsd: Number(amount),
      date,
      description,
      category,
      fromAccount,
      combineFrom: helpers,
    })
    if (!res.ok) {
      setError(res.error)
      if (res.shortfallCents != null && helpers.length === 0 && helperPots.length > 0) {
        setShowCombine(true)
        // Pre-select helpers in Extra → Goal → Charity / remaining order that have cash
        const preferred = (['extra', 'iphone', 'charity', 'spending'] as AccountId[]).filter(
          (id) => id !== fromAccount && balances[id] > 0,
        )
        setCombineFrom(preferred)
      }
      return
    }
    const parts = res.slices
      .map((s) => `${ACCOUNT_LABELS[s.account]} ${formatUsd(s.cents)}`)
      .join(' + ')
    setOk(
      res.slices.length > 1
        ? `Combined purchase: ${parts}.`
        : `Purchase recorded from ${fromLabel}.`,
    )
    resetForm()
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    record(showCombine ? combineFrom : [])
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <ShoppingBag size={28} className="text-[var(--blue)]" aria-hidden />
          Spending
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Record a purchase and choose which pot pays. If that pot is short, combine from others.
        </p>
      </header>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Spending money left
        </p>
        <p className="mt-2 text-3xl font-extrabold text-[var(--blue)]">
          {formatUsd(balances.spending)}
        </p>
        {fromAccount !== 'spending' ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Paying from {fromLabel}: {formatUsd(fromBal)} available
          </p>
        ) : null}
      </div>

      <form className="card space-y-4 p-5" onSubmit={onSubmit}>
        <div>
          <label className="label" htmlFor="from">
            Pay from
          </label>
          <NativeSelect
            aria-label="Pay from"
            value={fromAccount}
            onChange={(v) => {
              setFromAccount(v as AccountId)
              setCombineFrom([])
              setShowCombine(false)
              setError('')
            }}
            options={POTS.map((p) => ({
              value: p.id,
              label: `${p.label} (${formatUsd(balances[p.id])})`,
            }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="amount">
            Amount
          </label>
          <div className="field-signed">
            <span className="field-signed__sign text-[var(--danger)]" aria-hidden>
              −
            </span>
            <input
              id="amount"
              className="field-signed__input"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setShowCombine(false)
                setError('')
              }}
              required
            />
          </div>
          {amountCents > fromBal && fromBal >= 0 ? (
            <p className="mt-2 text-sm text-[var(--orange)]">
              {fromLabel} only has {formatUsd(fromBal)} — need {formatUsd(shortfallCents)} more.
            </p>
          ) : null}
        </div>
        <div>
          <label className="label" htmlFor="cat">
            Category
          </label>
          <NativeSelect
            aria-label="Category"
            value={category}
            onChange={(v) => setCategory(v as SpendCategory)}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="desc">
            {category === 'other' ? 'Specify (optional)' : 'Description'}
          </label>
          <input
            id="desc"
            className="field"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={category === 'other' ? 'What was this for?' : 'Snack after school'}
          />
        </div>
        <div>
          <label className="label" htmlFor="date">
            Date
          </label>
          <input
            id="date"
            className="field"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        {showCombine && helperPots.length > 0 ? (
          <div className="space-y-3 rounded-xl border border-[var(--orange)]/40 bg-[var(--orange)]/10 p-4">
            <p className="text-sm font-semibold text-[var(--orange)]">Combine from other pots</p>
            <p className="text-sm text-[var(--muted)]">
              Use {formatUsd(Math.max(0, fromBal))} from {fromLabel}, then cover the rest from:
            </p>
            <ul className="space-y-2">
              {helperPots.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={combineFrom.includes(p.id)}
                      onChange={() => toggleHelper(p.id)}
                    />
                    {p.label} ({formatUsd(balances[p.id])})
                  </label>
                </li>
              ))}
            </ul>
            {preview?.ok ? (
              <p className="text-sm text-[var(--green)]">
                Split:{' '}
                {preview.slices
                  .map((s) => `${ACCOUNT_LABELS[s.account]} ${formatUsd(s.cents)}`)
                  .join(' + ')}
              </p>
            ) : preview && !preview.ok ? (
              <p className="text-sm text-[var(--danger)]">
                Still short {formatUsd(preview.shortfallCents)} — pick more pots or lower the amount.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {ok ? <p className="text-sm text-[var(--green)]">{ok}</p> : null}

        {showCombine ? (
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary flex-1">
              Combine & record
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowCombine(false)
                setCombineFrom([])
                setError('')
              }}
            >
              Cancel
            </button>
          </div>
        ) : amountCents > fromBal && helperPots.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => {
                setShowCombine(true)
                setError('')
                const preferred = (['extra', 'iphone', 'charity', 'spending'] as AccountId[]).filter(
                  (id) => id !== fromAccount && balances[id] > 0,
                )
                setCombineFrom(preferred)
              }}
            >
              Combine pots…
            </button>
            <button type="submit" className="btn btn-secondary">
              Try anyway
            </button>
          </div>
        ) : (
          <button type="submit" className="btn btn-primary w-full">
            Record purchase
          </button>
        )}
      </form>
    </div>
  )
}
