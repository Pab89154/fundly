import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Upload } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { formatUsd, toCents } from '../lib/money'
import {
  parseTransactionStatement,
  statementRowsToImportInput,
  type ParsedStatementRow,
} from '../lib/statementParse'
import { readStatementFile, STATEMENT_FILE_ACCEPT } from '../lib/readStatementFile'
import { NativeSelect } from '../components/NativeSelect'
import type { IncomeSource } from '../types'

export function ImportStatement() {
  const { importStatementRows, balances, state } = useMoney()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedStatementRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [autoImport, setAutoImport] = useState(true)

  const selected = useMemo(() => rows.filter((r) => r.included), [rows])
  const incomeTotal = selected
    .filter((r) => r.type === 'income')
    .reduce((s, r) => s + toCents(r.amountUsd), 0)
  const spendTotal = selected
    .filter((r) => r.type === 'spending')
    .reduce((s, r) => s + toCents(r.amountUsd), 0)

  const applyImport = (parsedRows: ParsedStatementRow[], fromName?: string) => {
    const payload = statementRowsToImportInput(parsedRows)
    const res = importStatementRows(payload)
    if (!res.ok) {
      setErr(res.error)
      return false
    }
    setMsg(
      `Imported ${res.imported} from ${fromName || fileName || 'statement'}` +
        (res.skipped ? ` · skipped ${res.skipped}` : '') +
        '.',
    )
    setTimeout(() => navigate('/transactions'), 600)
    return true
  }

  const ingestFile = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    setProgress('Opening file…')
    setErr('')
    setMsg('')
    setParseErrors([])
    setRows([])
    try {
      const { fileName: name, text, kind } = await readStatementFile(file, {
        onProgress: setProgress,
      })
      setProgress('Parsing transactions…')
      setFileName(name)
      const result = parseTransactionStatement(text)
      setParseErrors(result.errors)
      setRows(result.rows)
      if (!result.rows.length) {
        setErr(
          result.errors[0] ||
            `No transactions found in ${name}. Try a CSV export from your bank or Apple Cash.`,
        )
        return
      }
      if (autoImport) {
        setMsg(`Read ${result.rows.length} from ${name} (${kind}). Importing…`)
        applyImport(result.rows, name)
      } else {
        setMsg(`Read ${result.rows.length} transaction(s) from ${name} (${kind}). Review, then import.`)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setBusy(false)
      setProgress('')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const updateRow = (id: string, patch: Partial<ParsedStatementRow>) => {
    setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const doImport = () => {
    setErr('')
    setMsg('')
    applyImport(rows)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <FileText size={28} className="text-[var(--green)]" aria-hidden />
          Import statement
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Upload a statement file and Fundly reads the transactions from it. Income splits{' '}
          {state.settings.allocation.iphone}/{state.settings.allocation.spending}/
          {state.settings.allocation.extra}/{state.settings.allocation.charity}. Spending uses
          Spending Money only.
        </p>
      </header>

      <div
        className={`card border-2 border-dashed p-8 text-center transition ${
          dragOver ? 'border-[var(--green)] bg-[var(--green)]/10' : 'border-[var(--border)]'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void ingestFile(e.dataTransfer.files?.[0] ?? null)
        }}
      >
        <Upload size={36} className="mx-auto text-[var(--green)]" aria-hidden />
        <p className="mt-3 text-lg font-bold">Drop your statement here</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          CSV, TSV, TXT, OFX/QFX, or PDF (text or scanned)
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={STATEMENT_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => void ingestFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn btn-primary mt-5"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? progress || 'Reading file…' : 'Choose statement file'}
        </button>
        {busy && progress ? (
          <p className="mt-2 text-sm text-[var(--muted)]">{progress}</p>
        ) : null}
        {fileName ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Loaded: {fileName}</p>
        ) : null}
        <label className="mt-4 flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={autoImport}
            onChange={(e) => setAutoImport(e.target.checked)}
          />
          Import automatically after reading the file
        </label>
      </div>

      {parseErrors.length > 0 ? (
        <ul className="space-y-1 text-sm text-[var(--orange)]">
          {parseErrors.slice(0, 8).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      {rows.length > 0 && !autoImport ? (
        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-bold">From file preview</h3>
              <p className="text-sm text-[var(--muted)]">
                {selected.length} selected · income {formatUsd(incomeTotal)} · spending{' '}
                {formatUsd(spendTotal)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Spending available: {formatUsd(balances.spending)}
              </p>
            </div>
          </div>

          <ul className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <label className="flex items-center gap-2 sm:w-8">
                  <input
                    type="checkbox"
                    checked={r.included}
                    onChange={(e) => updateRow(r.id, { included: e.target.checked })}
                  />
                </label>
                <input
                  className="field sm:max-w-[9rem]"
                  type="date"
                  value={r.date}
                  onChange={(e) => updateRow(r.id, { date: e.target.value })}
                />
                <input
                  className="field sm:max-w-[7rem]"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={r.amountUsd}
                  onChange={(e) => updateRow(r.id, { amountUsd: Number(e.target.value) || 0 })}
                />
                <NativeSelect
                  className="sm:max-w-[8rem]"
                  aria-label="Type"
                  value={r.type}
                  onChange={(v) => updateRow(r.id, { type: v as 'income' | 'spending' })}
                  options={[
                    { value: 'income', label: 'Income' },
                    { value: 'spending', label: 'Spending' },
                  ]}
                />
                {r.type === 'income' ? (
                  <NativeSelect
                    className="sm:max-w-[8rem]"
                    aria-label="Source"
                    value={r.source}
                    onChange={(v) => updateRow(r.id, { source: v as IncomeSource })}
                    options={[
                      { value: 'printx', label: 'PrintX' },
                      ...state.settings.businesses.map((b) => ({
                        value: b.id,
                        label: b.name,
                      })),
                      { value: 'allowance', label: 'Allowance' },
                      { value: 'other', label: 'Other' },
                    ]}
                  />
                ) : null}
                <input
                  className="field flex-1"
                  value={r.description}
                  onChange={(e) => updateRow(r.id, { description: e.target.value })}
                />
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={doImport}
            disabled={selected.length === 0}
          >
            Import {selected.length} from file
          </button>
        </div>
      ) : null}

      {err ? <p className="text-sm text-[var(--danger)]">{err}</p> : null}
      {msg ? <p className="text-sm text-[var(--green)]">{msg}</p> : null}
    </div>
  )
}
