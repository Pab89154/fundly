import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PlusCircle } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { allocateCents, formatUsd, toCents } from '../lib/money'
import { NativeSelect } from '../components/NativeSelect'
import type { IncomeSource, PrintxPaySource } from '../types'

const INCOME_SOURCES: Array<{ value: IncomeSource; label: string }> = [
  { value: 'printx', label: 'PrintX' },
  { value: 'nfc_bracelets', label: 'NFC Bracelets' },
  { value: 'allowance', label: 'Allowance' },
  { value: 'other', label: 'Other' },
]

function parseSourceParam(raw: string | null): IncomeSource {
  if (raw === 'nfc_bracelets' || raw === 'printx' || raw === 'allowance' || raw === 'other') return raw
  return 'printx'
}

export function AddIncome() {
  const { addIncome, state } = useMoney()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialSource = useMemo(() => parseSourceParam(params.get('source')), [params])
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState<IncomeSource>(initialSource)
  const [printxSource, setPrintxSource] = useState<PrintxPaySource>('cash')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState(
    initialSource === 'nfc_bracelets' ? 'NFC Bracelet sale' : '',
  )
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
    setOk('Income saved and split across all four balances.')
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
          Money in splits by your Settings % — example at{' '}
          {state.settings.allocation.iphone}/{state.settings.allocation.spending}/
          {state.settings.allocation.extra}/{state.settings.allocation.charity}: $100 → Goal $
          {((100 * state.settings.allocation.iphone) / 100).toFixed(0)}, Spending $
          {((100 * state.settings.allocation.spending) / 100).toFixed(0)}, Extra $
          {((100 * state.settings.allocation.extra) / 100).toFixed(0)}, Charity $
          {((100 * state.settings.allocation.charity) / 100).toFixed(0)}.
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
          <NativeSelect
            aria-label="Source"
            value={source}
            onChange={(v) => {
              const next = v as IncomeSource
              setSource(next)
              if (next === 'nfc_bracelets' && !description.trim()) {
                setDescription('NFC Bracelet sale')
              }
            }}
            options={INCOME_SOURCES}
          />
        </div>
        {source === 'printx' ? (
          <div>
            <label className="label" htmlFor="px">
              PrintX payment type
            </label>
            <NativeSelect
              aria-label="PrintX payment type"
              value={printxSource}
              onChange={(v) => setPrintxSource(v as PrintxPaySource)}
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'stripe', label: 'Stripe' },
              ]}
            />
          </div>
        ) : null}
        {source === 'nfc_bracelets' ? (
          <p className="text-sm text-[var(--muted)]">
            Manual only — enter each NFC Bracelet sale yourself (no API sync).
          </p>
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
            placeholder={
              source === 'nfc_bracelets'
                ? 'NFC Bracelet sale'
                : source === 'printx'
                  ? 'Weekly PrintX sales'
                  : 'What was this for?'
            }
          />
        </div>

        {cents > 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-4 text-sm">
            <p className="font-semibold">Split preview</p>
            <ul className="mt-2 space-y-1 text-[var(--muted)]">
              <li>Goal: {formatUsd(preview.iphone)}</li>
              <li>Spending: {formatUsd(preview.spending)}</li>
              <li>Extra: {formatUsd(preview.extra)}</li>
              <li>Charity: {formatUsd(preview.charity)}</li>
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
