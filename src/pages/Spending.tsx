import { useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { formatUsd, localDateISO, type AccountId } from '../lib/money'
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
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const fromBal = balances[fromAccount]
  const fromLabel = POTS.find((p) => p.id === fromAccount)?.label ?? 'selected pot'

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk('')
    const res = addSpending({
      amountUsd: Number(amount),
      date,
      description,
      category,
      fromAccount,
    })
    if (!res.ok) {
      setError(res.error)
      return
    }
    setOk(`Purchase recorded from ${fromLabel}.`)
    setAmount('')
    setDescription('')
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <ShoppingBag size={28} className="text-[var(--blue)]" aria-hidden />
          Spending
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Record a purchase and choose which pot pays. Spending Money left stays visible so you know
          your everyday balance.
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
            onChange={(v) => setFromAccount(v as AccountId)}
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
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
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
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {ok ? <p className="text-sm text-[var(--green)]">{ok}</p> : null}
        <button type="submit" className="btn btn-primary w-full">
          Record purchase
        </button>
      </form>
    </div>
  )
}
