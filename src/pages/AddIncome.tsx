import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { allocateCents, formatUsd, toCents } from '../lib/money'
import type { IncomeSource, PrintxPaySource } from '../types'

export function AddIncome() {
  const { addIncome, state } = useMoney()
  const navigate = useNavigate()
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState<IncomeSource>('printx')
  const [printxSource, setPrintxSource] = useState<PrintxPaySource>('cash')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const cents = toCents(Number(amount) || 0)
  const preview = allocateCents(cents, state.settings.allocation)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk('')
    const res = addIncome({
      amountUsd: Number(amount),
      source,
      date,
      description,
      printxSource: source === 'printx' ? printxSource : undefined,
    })
    if (!res.ok) {
      setError(res.error)
      return
    }
    setOk('Income saved and split across all three balances.')
    setAmount('')
    setDescription('')
    setTimeout(() => navigate('/'), 600)
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <PlusCircle size={28} className="text-[var(--green)]" aria-hidden />
          Add Income
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Automatically splits {state.settings.allocation.iphone}/
          {state.settings.allocation.spending}/{state.settings.allocation.extra} across iPhone,
          Spending, and Extra.
        </p>
      </header>

      <form className="card space-y-4 p-5" onSubmit={onSubmit}>
        <div>
          <label className="label" htmlFor="amount">
            Amount (USD)
          </label>
          <input
            id="amount"
            className="field"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50.00"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="source">
            Source
          </label>
          <select
            id="source"
            className="field"
            value={source}
            onChange={(e) => setSource(e.target.value as IncomeSource)}
          >
            <option value="printx">PrintX</option>
            <option value="allowance">Allowance</option>
            <option value="other">Other</option>
          </select>
        </div>
        {source === 'printx' ? (
          <div>
            <label className="label" htmlFor="px">
              PrintX payment type
            </label>
            <select
              id="px"
              className="field"
              value={printxSource}
              onChange={(e) => setPrintxSource(e.target.value as PrintxPaySource)}
            >
              <option value="cash">Cash</option>
              <option value="stripe">Stripe</option>
            </select>
          </div>
        ) : null}
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
        <div>
          <label className="label" htmlFor="desc">
            Description (optional)
          </label>
          <input
            id="desc"
            className="field"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Weekly PrintX sales"
          />
        </div>

        {cents > 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-4 text-sm">
            <p className="font-semibold">Split preview</p>
            <ul className="mt-2 space-y-1 text-[var(--muted)]">
              <li>iPhone: {formatUsd(preview.iphone)}</li>
              <li>Spending: {formatUsd(preview.spending)}</li>
              <li>Extra: {formatUsd(preview.extra)}</li>
            </ul>
          </div>
        ) : null}

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {ok ? <p className="text-sm text-[var(--green)]">{ok}</p> : null}

        <button type="submit" className="btn btn-primary w-full">
          Save income
        </button>
      </form>
    </div>
  )
}
