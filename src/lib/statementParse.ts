import { toCents } from './money'
import type { IncomeSource } from '../types'

export type ParsedStatementRow = {
  id: string
  date: string
  amountUsd: number
  type: 'income' | 'spending'
  description: string
  source: IncomeSource
  raw: string
  included: boolean
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim()
  // YYYY/MM/DD or YYYY-MM-DD
  const iso = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) {
    const y = iso[1]!
    const m = iso[2]!.padStart(2, '0')
    const d = iso[3]!.padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = trimmed.replace(/[.]/g, '/').replace(/-/g, '/')
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (us) {
    let y = Number(us[3])
    if (y < 100) y += 2000
    const m = us[1]!.padStart(2, '0')
    const d = us[2]!.padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  // "Oct 15, 2024" / "15 Oct 2024"
  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed)
    if (dt.getFullYear() >= 2000 && dt.getFullYear() <= 2100) {
      return dt.toISOString().slice(0, 10)
    }
  }
  return null
}

function parseAmountToken(raw: string): number | null {
  let t = raw.trim()
  if (!t) return null
  const parenNeg = /^\(.*\)$/.test(t)
  t = t.replace(/[$,]/g, '').replace(/\s/g, '')
  if (!t || t === '-' || t === '+') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return parenNeg ? -Math.abs(n) : n
}

const DATE_IN_LINE =
  /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})/i

const AMOUNT_IN_LINE = /([+-]?\$?\s?\(?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?|[+-]?\d+\.\d{2})/

/** Pull date + amount + leftover description from a freeform PDF/OCR line. */
function freeformCells(line: string): string[] | null {
  const dateMatch = line.match(DATE_IN_LINE)
  if (!dateMatch || dateMatch.index == null) return null
  const withoutDate =
    line.slice(0, dateMatch.index) + line.slice(dateMatch.index + dateMatch[0].length)
  const amountMatch = withoutDate.match(AMOUNT_IN_LINE)
  if (!amountMatch || amountMatch.index == null) return null
  const amountToken = amountMatch[0]!.replace(/\s/g, '')
  // Prefer amounts that look like money (have $ or decimals), skip lone years/ids
  if (!/[.$]/.test(amountToken) && !amountToken.includes(',')) {
    // try next amount on the line
    const rest = withoutDate.slice(amountMatch.index + amountMatch[0].length)
    const second = rest.match(AMOUNT_IN_LINE)
    if (second) {
      const desc = (
        withoutDate.slice(0, amountMatch.index) +
        withoutDate.slice(0, second.index!) +
        rest.slice(second.index! + second[0].length)
      )
        .replace(/\s+/g, ' ')
        .trim()
      return [dateMatch[0]!, second[0]!.replace(/\s/g, ''), desc || 'Statement import']
    }
  }
  const desc = (
    withoutDate.slice(0, amountMatch.index) +
    withoutDate.slice(amountMatch.index + amountMatch[0].length)
  )
    .replace(/\s+/g, ' ')
    .trim()
  return [dateMatch[0]!, amountToken, desc || 'Statement import']
}

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim())
  // CSV with quotes
  const cells: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      inQ = !inQ
      continue
    }
    if (ch === ',' && !inQ) {
      cells.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur.trim())
  if (cells.length >= 3) return cells
  // spaced: date  amount  description
  const spaced = line.trim().match(
    /^(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})\s+([+-]?\$?\(?[\d,]+\.?\d*\)?)\s+(.+)$/i,
  )
  if (spaced) return [spaced[1]!, spaced[2]!, spaced[3]!]
  const free = freeformCells(line)
  if (free) return free
  return cells
}

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase()
  return (
    (joined.includes('date') && joined.includes('amount')) ||
    joined.includes('description') && joined.includes('amount') ||
    joined.includes('transaction')
  )
}

function guessType(
  amount: number,
  desc: string,
  typeHint?: string,
): 'income' | 'spending' {
  const hint = (typeHint || '').toLowerCase()
  if (/spend|debit|purchase|payment|withdrawal|bought/.test(hint)) return 'spending'
  if (/income|credit|deposit|received|payroll|allowance|printx/.test(hint)) return 'income'
  const d = desc.toLowerCase()
  if (/refund|deposit|allowance|printx|paycheck|received|cash in|transfer in/.test(d)) {
    return amount < 0 ? 'spending' : 'income'
  }
  if (/purchase|uber|food|game|app store|spent|bought/.test(d)) return 'spending'
  return amount < 0 ? 'spending' : 'income'
}

function guessSource(desc: string): IncomeSource {
  const d = desc.toLowerCase()
  if (d.includes('printx')) return 'printx'
  if (d.includes('allowance')) return 'allowance'
  return 'other'
}

function rowId(seed: string, i: number): string {
  return `stmt_${i}_${seed.length}_${seed.slice(0, 12).replace(/\W/g, '')}`
}

/**
 * Parse a pasted bank / Apple Cash / CSV transaction statement into rows.
 * Supports CSV/TSV with headers, or loose lines: date, amount, description.
 */
export function parseTransactionStatement(text: string): {
  rows: ParsedStatementRow[]
  errors: string[]
} {
  const errors: string[] = []
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) return { rows: [], errors: ['Paste or upload a statement first.'] }

  let start = 0
  let dateIdx = 0
  let amountIdx = 1
  let descIdx = 2
  let typeIdx = -1

  const firstCells = splitLine(lines[0]!)
  if (looksLikeHeader(firstCells)) {
    start = 1
    firstCells.forEach((c, i) => {
      const k = c.toLowerCase()
      if (/^date|posted|time/.test(k)) dateIdx = i
      else if (/amount|usd|value|sum/.test(k)) amountIdx = i
      else if (/desc|memo|detail|merchant|name|note/.test(k)) descIdx = i
      else if (/type|debit|credit|category|direction/.test(k)) typeIdx = i
    })
  }

  const rows: ParsedStatementRow[] = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!
    const cells = splitLine(line)
    if (cells.length < 2) {
      errors.push(`Skipped line ${i + 1}: need date and amount`)
      continue
    }

    // Find date + amount among cells if layout is messy
    let dateRaw = cells[dateIdx] ?? cells[0] ?? ''
    let amountRaw = cells[amountIdx] ?? cells[1] ?? ''
    let desc = (cells[descIdx] ?? cells.slice(2).join(' ')) || 'Statement import'
    const typeHint = typeIdx >= 0 ? cells[typeIdx] : undefined

    let date = normalizeDate(dateRaw)
    let amount = parseAmountToken(amountRaw)

    if (!date || amount == null) {
      // Try all cells for date/amount
      for (const c of cells) {
        if (!date && normalizeDate(c)) date = normalizeDate(c)
        if (amount == null && parseAmountToken(c) != null && /[\d$]/.test(c)) {
          amount = parseAmountToken(c)
        }
      }
    }

    if (!date || amount == null || amount === 0) {
      errors.push(`Skipped line ${i + 1}: could not read date/amount (${line.slice(0, 60)})`)
      continue
    }

    // If description still looks like the amount/date, rebuild from leftover cells
    if (!desc || desc === dateRaw || desc === amountRaw) {
      desc =
        cells
          .filter((c) => c !== dateRaw && c !== amountRaw && normalizeDate(c) == null)
          .join(' ')
          .trim() || 'Statement import'
    }

    const type = guessType(amount, desc, typeHint)
    const abs = Math.abs(amount)
    rows.push({
      id: rowId(line, i),
      date,
      amountUsd: abs,
      type,
      description: desc,
      source: guessSource(desc),
      raw: line,
      included: true,
    })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No transactions found in that text.')
  }

  return { rows, errors }
}

export function statementRowsToImportInput(rows: ParsedStatementRow[]) {
  return rows
    .filter((r) => r.included && toCents(r.amountUsd) > 0)
    .map((r) => ({
      type: r.type,
      amountUsd: r.amountUsd,
      date: r.date,
      description: r.description,
      source: r.source,
      category: r.type === 'spending' ? 'other' : undefined,
    }))
}
