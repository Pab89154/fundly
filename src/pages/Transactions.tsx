import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, History } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { formatUsd } from '../lib/money'
import { NativeSelect } from '../components/NativeSelect'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { TxType } from '../types'

const types: Array<TxType | 'all'> = [
  'all',
  'income',
  'spending',
  'transfer',
  'import',
  'refund',
  'opening',
  'reconcile',
  'apple_cash_purchase',
]

export function Transactions() {
  const { state, deleteTransaction, updateTransaction } = useMoney()
  const [q, setQ] = useState('')
  const [type, setType] = useState<(typeof types)[number]>('all')
  const [editId, setEditId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [msg, setMsg] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return state.transactions
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .filter((t) => (type === 'all' ? true : t.type === type))
      .filter((t) => {
        if (!qq) return true
        return (
          t.description?.toLowerCase().includes(qq) ||
          t.category?.toLowerCase().includes(qq) ||
          t.source?.toLowerCase().includes(qq) ||
          t.type.includes(qq) ||
          t.externalId?.toLowerCase().includes(qq)
        )
      })
  }, [state.transactions, q, type])

  const startEdit = (id: string) => {
    const t = state.transactions.find((x) => x.id === id)
    if (!t) return
    setEditId(id)
    setEditAmount((Math.abs(t.amountCents) / 100).toFixed(2))
    setEditDesc(t.description || '')
  }

  const saveEdit = () => {
    if (!editId) return
    const cents = Math.round(Number(editAmount) * 100)
    if (!(cents > 0)) {
      setMsg('Amount must be greater than 0.')
      return
    }
    updateTransaction(editId, {
      amountCents: cents,
      description: editDesc.trim() || undefined,
    })
    setEditId(null)
    setMsg('Transaction updated. Balances recalculated.')
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <History size={28} className="text-[var(--muted)]" aria-hidden />
            Transactions
          </h2>
          <p className="mt-2 text-[var(--muted)]">
            Search, filter, edit, or delete. Balances stay accurate.
          </p>
        </div>
        <Link to="/import" className="btn btn-secondary">
          <FileText size={16} aria-hidden />
          Import statement
        </Link>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className="field"
          placeholder="Search description, category, id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <NativeSelect
          className="sm:max-w-xs"
          aria-label="Transaction type"
          value={type}
          onChange={(v) => setType(v as typeof type)}
          options={types.map((t) => ({ value: t, label: t }))}
        />
      </div>

      {msg ? <p className="text-sm text-[var(--green)]">{msg}</p> : null}

      <div className="card overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">
          {rows.length === 0 ? (
            <li className="p-5 text-sm text-[var(--muted)]">No transactions yet.</li>
          ) : (
            rows.map((t) => (
              <li key={t.id} className="p-4">
                {editId === t.id ? (
                  <div className="space-y-3">
                    <input
                      className="field"
                      type="number"
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                    />
                    <input
                      className="field"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-primary" onClick={saveEdit}>
                        Save
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{t.description || t.type}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {t.date} · {t.type}
                        {t.source ? ` · ${t.source}` : ''}
                        {t.category ? ` · ${t.category}` : ''}
                        {t.printxSource ? ` · ${t.printxSource}` : ''}
                      </p>
                      {t.allocation ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Goal {formatUsd(t.allocation.iphone)} · Spending{' '}
                          {formatUsd(t.allocation.spending)} · Extra {formatUsd(t.allocation.extra)}{' '}
                          · Charity {formatUsd(t.allocation.charity ?? 0)}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-extrabold">{formatUsd(t.amountCents)}</p>
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className="btn btn-secondary px-3 py-1 text-xs" onClick={() => startEdit(t.id)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger px-3 py-1 text-xs"
                          onClick={() => setDeleteId(t.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      </div>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete this transaction?"
        message="Balances will update right away. This cannot be undone."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            deleteTransaction(deleteId)
            setMsg('Deleted.')
          }
          setDeleteId(null)
        }}
      />
    </div>
  )
}
