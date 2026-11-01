import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, History, Upload, Wallet } from 'lucide-react'
import { FundlyLogo } from '../components/FundlyLogo'
import { useMoney } from '../store/MoneyContext'
import { allocateCents, formatUsd, fromCents, toCents } from '../lib/money'
import { parseTransactionStatement } from '../lib/statementParse'
import { readStatementFile, STATEMENT_FILE_ACCEPT } from '../lib/readStatementFile'
import { NativeSelect } from '../components/NativeSelect'
import type { IncomeSource } from '../types'

type PastRow = {
  type: 'income' | 'spending'
  amount: string
  date: string
  description: string
  source: IncomeSource
}

export function Onboarding() {
  const { completeOnboarding, state } = useMoney()
  const navigate = useNavigate()
  const [apple, setApple] = useState('')
  const [rows, setRows] = useState<PastRow[]>([])
  const [statementText, setStatementText] = useState('')
  const [err, setErr] = useState('')
  const [step, setStep] = useState(1)
  const fileRef = useRef<HTMLInputElement>(null)

  const appendParsed = (raw: string) => {
    const { rows: parsed, errors } = parseTransactionStatement(raw)
    if (!parsed.length) {
      setErr(errors[0] || 'Could not parse statement.')
      return
    }
    setErr('')
    setRows((prev) => [
      ...prev,
      ...parsed.map((p) => ({
        type: p.type,
        amount: String(p.amountUsd),
        date: p.date,
        description: p.description,
        source: p.source,
      })),
    ])
  }

  const [uploadProgress, setUploadProgress] = useState('')

  const onUploadStatement = async (file: File | null) => {
    if (!file) return
    setUploadProgress('Reading file…')
    try {
      const { text } = await readStatementFile(file, { onProgress: setUploadProgress })
      appendParsed(text)
      setStatementText('')
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setUploadProgress('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const appleCents = toCents(Number(apple) || 0)
  const preview = useMemo(
    () => allocateCents(appleCents, state.settings.allocation),
    [appleCents, state.settings.allocation],
  )

  const addRow = () => {
    setRows((r) => [
      ...r,
      {
        type: 'income',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        description: '',
        source: 'other',
      },
    ])
  }

  const finish = () => {
    setErr('')
    const res = completeOnboarding({
      appleCashUsd: Number(apple) || 0,
      pastTransactions: rows
        .filter((r) => Number(r.amount) > 0)
        .map((r) => ({
          type: r.type,
          amountUsd: Number(r.amount),
          date: r.date,
          description: r.description,
          source: r.source,
        })),
    })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    navigate('/')
  }

  return (
    <div className="app-bg min-h-screen px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="animate-in">
          <FundlyLogo size={88} useRaster className="mb-4" />
          <p className="text-sm font-semibold text-[var(--green)]">Welcome to Fundly</p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">Fundly</h1>
          <p className="mt-2 text-[var(--muted)]">
            Enter how much you have in Apple Cash right now. Fundly splits it into Goal, Spending,
            Extra, and Charity automatically.
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">Step {step} of 2</p>
        </header>

        {step === 1 ? (
          <div className="card space-y-4 p-5 animate-in">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Wallet size={20} className="text-[var(--blue)]" aria-hidden />
              Apple Cash right now
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Look at Wallet and type what you see. There is no Apple API connection.
            </p>
            <input
              className="field"
              type="number"
              min="0"
              step="0.01"
              value={apple}
              onChange={(e) => setApple(e.target.value)}
              placeholder="0.00"
            />

            {appleCents > 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-4 text-sm">
                <p className="font-semibold">Auto-split preview</p>
                <p className="mt-1 text-[var(--muted)]">
                  Based on {state.settings.allocation.iphone}/
                  {state.settings.allocation.spending}/{state.settings.allocation.extra}/
                  {state.settings.allocation.charity}
                </p>
                <ul className="mt-2 space-y-1 text-[var(--muted)]">
                  <li>Goal: {formatUsd(preview.iphone)}</li>
                  <li>Spending: {formatUsd(preview.spending)}</li>
                  <li>Extra: {formatUsd(preview.extra)}</li>
                  <li>Charity: {formatUsd(preview.charity)}</li>
                </ul>
              </div>
            ) : null}

            <button type="button" className="btn btn-primary w-full" onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="card space-y-4 p-5 animate-in">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <History size={20} className="text-[var(--orange)]" aria-hidden />
              Past transactions (optional)
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Your pots already start from Apple Cash ({fromCents(appleCents).toFixed(2)}). Add
              history only if you want statement rows in the log — or skip.
            </p>

            <div className="space-y-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card-2)] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Upload size={16} aria-hidden />
                Upload statement file
              </p>
              <p className="text-xs text-[var(--muted)]">
                CSV, TXT, OFX/QFX, or PDF (text or scanned)
              </p>
              <input
                ref={fileRef}
                type="file"
                accept={STATEMENT_FILE_ACCEPT}
                className="hidden"
                onChange={(e) => void onUploadStatement(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={Boolean(uploadProgress)}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={16} aria-hidden />
                {uploadProgress || 'Choose statement file'}
              </button>
              <p className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
                <FileText size={14} aria-hidden />
                Or paste text
              </p>
              <textarea
                className="field min-h-20 font-mono text-xs"
                value={statementText}
                onChange={(e) => setStatementText(e.target.value)}
                placeholder={`date,amount,description\n2026-01-08,50.00,PrintX cash`}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  appendParsed(statementText)
                  setStatementText('')
                }}
              >
                Add from pasted text
              </button>
            </div>

            {rows.map((r, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                <NativeSelect
                  aria-label="Type"
                  value={r.type}
                  onChange={(v) => {
                    const next = v as 'income' | 'spending'
                    setRows((all) => all.map((x, idx) => (idx === i ? { ...x, type: next } : x)))
                  }}
                  options={[
                    { value: 'income', label: 'Income' },
                    { value: 'spending', label: 'Spending' },
                  ]}
                />
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={r.amount}
                  onChange={(e) =>
                    setRows((all) => all.map((x, idx) => (idx === i ? { ...x, amount: e.target.value } : x)))
                  }
                />
                <input
                  className="field"
                  type="date"
                  value={r.date}
                  onChange={(e) =>
                    setRows((all) => all.map((x, idx) => (idx === i ? { ...x, date: e.target.value } : x)))
                  }
                />
                <input
                  className="field"
                  placeholder="Description"
                  value={r.description}
                  onChange={(e) =>
                    setRows((all) =>
                      all.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)),
                    )
                  }
                />
              </div>
            ))}
            <button type="button" className="btn btn-secondary" onClick={addRow}>
              Add past transaction
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary flex-1" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="btn btn-primary flex-1" onClick={finish}>
                Save & open dashboard
              </button>
            </div>
          </div>
        ) : null}

        {err ? <p className="text-sm text-[var(--danger)]">{err}</p> : null}
      </div>
    </div>
  )
}
