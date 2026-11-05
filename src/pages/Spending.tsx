import { useMemo, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import {
  ACCOUNT_LABELS,
  formatUsd,
  localDateISO,
  planSpendAcrossPots,
  toCents,
  validateExactSlices,
  type AccountId,
  type SpendSlice,
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

type PayMode = 'single' | 'exact' | 'combine'

export function Spending() {
  const { addSpending, balances, state } = useMoney()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<SpendCategory>('other')
  const [fromAccount, setFromAccount] = useState<AccountId>('spending')
  const [date, setDate] = useState(localDateISO)
  const [combineFrom, setCombineFrom] = useState<AccountId[]>([])
  const [showCombine, setShowCombine] = useState(false)
  const [payMode, setPayMode] = useState<PayMode>('single')
  const [exactUsd, setExactUsd] = useState<Partial<Record<AccountId, string>>>({})
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
    if (!(amountCents > 0) || !showCombine || payMode !== 'combine') return null
    return planSpendAcrossPots(balances, amountCents, fromAccount, combineFrom)
  }, [amountCents, balances, combineFrom, fromAccount, showCombine, payMode])

  const exactSlices: SpendSlice[] = useMemo(() => {
    const out: SpendSlice[] = []
    for (const p of POTS) {
      const raw = exactUsd[p.id]
      if (raw == null || raw === '') continue
      const cents = toCents(Number(raw))
      if (cents > 0) out.push({ account: p.id, cents })
    }
    return out
  }, [exactUsd])

  const exactSumCents = exactSlices.reduce((s, x) => s + x.cents, 0)
  const exactCheck =
    payMode === 'exact' && amountCents > 0
      ? validateExactSlices(balances, amountCents, exactSlices)
      : null

  const toggleHelper = (id: AccountId) => {
    setCombineFrom((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const resetForm = () => {
    setAmount('')
    setDescription('')
    setCombineFrom([])
    setShowCombine(false)
    setExactUsd({})
    setPayMode('single')
  }

  const record = (helpers: AccountId[], slices?: SpendSlice[]) => {
    setError('')
    setOk('')
    const res = addSpending({
      amountUsd: Number(amount),
      date,
      description,
      category,
      fromAccount,
      combineFrom: helpers,
      slices,
    })
    if (!res.ok) {
      setError(res.error)
      if (
        !slices &&
        res.shortfallCents != null &&
        helpers.length === 0 &&
        helperPots.length > 0 &&
        payMode === 'single'
      ) {
        setShowCombine(true)
        setPayMode('combine')
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
    if (payMode === 'exact') {
      if (!exactCheck?.ok) {
        setError(exactCheck && !exactCheck.ok ? exactCheck.error : 'Enter amounts from each pot.')
        return
      }
      record([], exactCheck.slices)
      return
    }
    record(showCombine || payMode === 'combine' ? combineFrom : [])
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <ShoppingBag size={28} className="text-[var(--blue)]" aria-hidden />
          Spending
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Record a purchase from one pot, type exact amounts from several, or auto-combine when short.
          {state.settings.travelMode
            ? ' Travel Mode is on — Extra is folded into Spending.'
            : ''}
        </p>
      </header>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Spending money left
          {state.settings.travelMode ? ' · Travel Mode' : ''}
        </p>
        <p className="mt-2 text-3xl font-extrabold text-[var(--blue)]">
          {formatUsd(balances.spending)}
        </p>
        {fromAccount !== 'spending' && payMode !== 'exact' ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Paying from {fromLabel}: {formatUsd(fromBal)} available
          </p>
        ) : null}
      </div>

      <form className="card space-y-4 p-5" onSubmit={onSubmit}>
        <div>
          <label className="label">How to pay</label>
          <NativeSelect
            aria-label="How to pay"
            value={payMode}
            onChange={(v) => {
              const mode = v as PayMode
              setPayMode(mode)
              setShowCombine(mode === 'combine')
              setCombineFrom([])
              setError('')
              if (mode === 'exact') {
                setExactUsd({ spending: amount || '' })
              }
            }}
            options={[
              { value: 'single', label: 'One pot' },
              { value: 'exact', label: 'Exact amounts from pots' },
              { value: 'combine', label: 'Auto-combine if short' },
            ]}
          />
        </div>

        {payMode !== 'exact' ? (
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
                setError('')
              }}
              options={POTS.map((p) => ({
                value: p.id,
                label: `${p.label} (${formatUsd(balances[p.id])})`,
              }))}
            />
          </div>
        ) : null}

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
                setError('')
              }}
              required
            />
          </div>
          {payMode === 'single' && amountCents > fromBal && fromBal >= 0 ? (
            <p className="mt-2 text-sm text-[var(--orange)]">
              {fromLabel} only has {formatUsd(fromBal)} — need {formatUsd(shortfallCents)} more. Switch
              to exact amounts or auto-combine.
            </p>
          ) : null}
        </div>

        {payMode === 'exact' ? (
          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-4">
            <p className="text-sm font-semibold">How much from each pot</p>
            <p className="text-xs text-[var(--muted)]">
              Enter dollars per pot. They must add up to {formatUsd(amountCents) || '$0.00'}.
            </p>
            <ul className="space-y-2">
              {POTS.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-sm font-semibold">{p.label}</span>
                  <input
                    className="field flex-1"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={exactUsd[p.id] ?? ''}
                    onChange={(e) =>
                      setExactUsd((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    aria-label={`Amount from ${p.label}`}
                  />
                  <span className="w-16 shrink-0 text-right text-xs text-[var(--muted)]">
                    {formatUsd(balances[p.id])}
                  </span>
                </li>
              ))}
            </ul>
            <p
              className={`text-sm font-semibold ${
                exactSumCents === amountCents && amountCents > 0
                  ? 'text-[var(--green)]'
                  : 'text-[var(--orange)]'
              }`}
            >
              Entered {formatUsd(exactSumCents)}
              {amountCents > 0 ? ` of ${formatUsd(amountCents)}` : ''}
            </p>
            {exactCheck && !exactCheck.ok ? (
              <p className="text-sm text-[var(--danger)]">{exactCheck.error}</p>
            ) : null}
          </div>
        ) : null}

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

        {(payMode === 'combine' || showCombine) && helperPots.length > 0 ? (
          <div className="space-y-3 rounded-xl border border-[var(--orange)]/40 bg-[var(--orange)]/10 p-4">
            <p className="text-sm font-semibold text-[var(--orange)]">Auto-combine from other pots</p>
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

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={payMode === 'exact' && !(exactCheck?.ok)}
        >
          {payMode === 'exact'
            ? 'Record with exact split'
            : payMode === 'combine' || showCombine
              ? 'Combine & record'
              : 'Record purchase'}
        </button>
      </form>
    </div>
  )
}
