import type { Transaction } from '../types'
import { fromCents } from './money'

function esc(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function transactionsToCsv(transactions: Transaction[]): string {
  const header = [
    'id',
    'type',
    'date',
    'amount_usd',
    'description',
    'source',
    'printx_source',
    'category',
    'iphone_usd',
    'spending_usd',
    'extra_usd',
    'from',
    'to',
    'external_id',
  ]
  const rows = transactions.map((t) =>
    [
      t.id,
      t.type,
      t.date,
      fromCents(t.amountCents).toFixed(2),
      t.description ?? '',
      t.source ?? '',
      t.printxSource ?? '',
      t.category ?? '',
      t.allocation ? fromCents(t.allocation.iphone).toFixed(2) : '',
      t.allocation ? fromCents(t.allocation.spending).toFixed(2) : '',
      t.allocation ? fromCents(t.allocation.extra).toFixed(2) : '',
      t.fromAccount ?? '',
      t.toAccount ?? '',
      t.externalId ?? '',
    ]
      .map((c) => esc(String(c)))
      .join(','),
  )
  return [header.join(','), ...rows].join('\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
