import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  allocateCents,
  crossedMilestones,
  fromCents,
  isValidAllocationPct,
  toCents,
  type AccountId,
  type AllocationPct,
} from '../lib/money'
import { computeBalances } from '../lib/balances'
import { clearState, loadState, newId, saveState } from '../lib/storage'
import {
  createEmptyState,
  type AppState,
  type IncomeSource,
  type PrintxFeedEvent,
  type PrintxPaySource,
  type Settings,
  type SpendCategory,
  type Transaction,
} from '../types'

type AddIncomeInput = {
  amountUsd: number
  source: IncomeSource
  date: string
  description?: string
  printxSource?: PrintxPaySource
}

type AddSpendInput = {
  amountUsd: number
  date: string
  description?: string
  category?: SpendCategory | string
  appleCash?: boolean
}

type TransferInput = {
  amountUsd: number
  from: AccountId
  to: AccountId
  date: string
  description?: string
}

type OnboardingInput = {
  /** Current Apple Cash / wallet total — split automatically 70/20/10 (or settings %). */
  appleCashUsd: number
  pastTransactions?: Array<{
    type: 'income' | 'spending' | 'transfer'
    amountUsd: number
    date: string
    description?: string
    source?: IncomeSource
    category?: string
    from?: AccountId
    to?: AccountId
  }>
}

type MoneyContextValue = {
  state: AppState
  balances: ReturnType<typeof computeBalances>
  addIncome: (input: AddIncomeInput) => { ok: true } | { ok: false; error: string }
  addSpending: (input: AddSpendInput) => { ok: true } | { ok: false; error: string }
  addTransfer: (input: TransferInput) => { ok: true } | { ok: false; error: string }
  updateTransaction: (id: string, patch: Partial<Transaction>) => { ok: true } | { ok: false; error: string }
  deleteTransaction: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => { ok: true } | { ok: false; error: string }
  completeOnboarding: (input: OnboardingInput) => { ok: true } | { ok: false; error: string }
  confirmAppleCash: (usd: number) => void
  reconcileAppleCash: (opts: {
    confirmedUsd: number
    note?: string
    /** If virtual != apple cash, adjust spending by difference (signed: virtual - apple) */
    applyAdjustment: boolean
  }) => { ok: true } | { ok: false; error: string }
  importPrintxEvents: (events: PrintxFeedEvent[]) => {
    imported: number
    skipped: number
    newMilestoneCents: number[]
  }
  /** Import past funds from a parsed transaction statement. */
  importStatementRows: (
    rows: Array<{
      type: 'income' | 'spending'
      amountUsd: number
      date: string
      description?: string
      source?: IncomeSource
      category?: string
    }>,
  ) => { ok: true; imported: number; skipped: number } | { ok: false; error: string }
  resetAllData: () => void
  celebration: number | null
  dismissCelebration: () => void
}

const MoneyContext = createContext<MoneyContextValue | null>(null)

export function MoneyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState())
  const [celebration, setCelebration] = useState<number | null>(null)

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme
    document.documentElement.classList.toggle('light', state.settings.theme === 'light')
  }, [state.settings.theme])

  const balances = useMemo(() => computeBalances(state.transactions), [state.transactions])

  const pushTx = useCallback((tx: Transaction, celebrateFrom?: number) => {
    setState((prev) => {
      const nextTxs = [...prev.transactions, tx]
      const nextBalances = computeBalances(nextTxs)
      const prevIphone = celebrateFrom ?? computeBalances(prev.transactions).iphone
      const crossed = crossedMilestones(prevIphone, nextBalances.iphone).filter(
        (m) => !prev.settings.celebratedMilestones.includes(m),
      )
      if (crossed.length) {
        queueMicrotask(() => setCelebration(crossed[crossed.length - 1]!))
      }
      return {
        ...prev,
        transactions: nextTxs,
        settings: {
          ...prev.settings,
          celebratedMilestones: [
            ...prev.settings.celebratedMilestones,
            ...crossed.filter((m) => !prev.settings.celebratedMilestones.includes(m)),
          ],
        },
      }
    })
  }, [])

  const addIncome = useCallback(
    (input: AddIncomeInput) => {
      const cents = toCents(input.amountUsd)
      if (!(cents > 0)) return { ok: false as const, error: 'Enter an amount greater than $0.' }
      if (!input.date) return { ok: false as const, error: 'Choose a date.' }
      const allocation = allocateCents(cents, state.settings.allocation)
      const tx: Transaction = {
        id: newId(),
        type: 'income',
        amountCents: cents,
        date: input.date,
        description: input.description?.trim() || undefined,
        source: input.source,
        printxSource: input.source === 'printx' ? input.printxSource : undefined,
        allocation,
        createdAt: new Date().toISOString(),
      }
      pushTx(tx)
      return { ok: true as const }
    },
    [pushTx, state.settings.allocation],
  )

  const addSpending = useCallback(
    (input: AddSpendInput) => {
      const cents = toCents(input.amountUsd)
      if (!(cents > 0)) return { ok: false as const, error: 'Enter an amount greater than $0.' }
      const bal = computeBalances(state.transactions)
      if (cents > bal.spending) {
        return {
          ok: false as const,
          error: `Not enough spending money. Available: $${fromCents(bal.spending).toFixed(2)}.`,
        }
      }
      const tx: Transaction = {
        id: newId(),
        type: input.appleCash ? 'apple_cash_purchase' : 'spending',
        amountCents: cents,
        date: input.date || new Date().toISOString().slice(0, 10),
        description: input.description?.trim() || undefined,
        category: input.appleCash ? 'apple_cash' : input.category || 'other',
        createdAt: new Date().toISOString(),
      }
      pushTx(tx)
      return { ok: true as const }
    },
    [pushTx, state.transactions],
  )

  const addTransfer = useCallback(
    (input: TransferInput) => {
      const cents = toCents(input.amountUsd)
      if (!(cents > 0)) return { ok: false as const, error: 'Enter an amount greater than $0.' }
      if (input.from === input.to) return { ok: false as const, error: 'Pick two different accounts.' }
      const bal = computeBalances(state.transactions)
      const fromBal = bal[input.from]
      if (cents > fromBal) {
        return { ok: false as const, error: 'Not enough in the source account.' }
      }
      const tx: Transaction = {
        id: newId(),
        type: 'transfer',
        amountCents: cents,
        date: input.date || new Date().toISOString().slice(0, 10),
        description: input.description?.trim() || undefined,
        fromAccount: input.from,
        toAccount: input.to,
        createdAt: new Date().toISOString(),
      }
      pushTx(tx)
      return { ok: true as const }
    },
    [pushTx, state.transactions],
  )

  const deleteTransaction = useCallback((id: string) => {
    setState((prev) => {
      const removed = prev.transactions.find((t) => t.id === id)
      const importedEventIds = removed?.externalId
        ? prev.settings.importedEventIds.filter((e) => e !== removed.externalId)
        : prev.settings.importedEventIds
      return {
        ...prev,
        transactions: prev.transactions.filter((t) => t.id !== id),
        settings: { ...prev.settings, importedEventIds },
      }
    })
  }, [])

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Transaction>) => {
      setState((prev) => {
        const idx = prev.transactions.findIndex((t) => t.id === id)
        if (idx < 0) return prev
        const current = prev.transactions[idx]!
        const next = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() }

        if (
          (next.type === 'income' || next.type === 'import' || next.type === 'opening') &&
          next.amountCents != null &&
          !patch.allocation
        ) {
          next.allocation = allocateCents(Math.abs(next.amountCents), prev.settings.allocation)
        }

        if (next.type === 'spending' || next.type === 'apple_cash_purchase') {
          const others = prev.transactions.filter((t) => t.id !== id)
          const bal = computeBalances(others)
          if (Math.abs(next.amountCents) > bal.spending) {
            return prev
          }
        }

        const copy = [...prev.transactions]
        copy[idx] = next
        return { ...prev, transactions: copy }
      })
      return { ok: true as const }
    },
    [],
  )

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    if (patch.allocation && !isValidAllocationPct(patch.allocation)) {
      return { ok: false as const, error: 'Allocation percentages must add up to 100%.' }
    }
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }))
    return { ok: true as const }
  }, [])

  const completeOnboarding = useCallback((input: OnboardingInput) => {
    const apple = toCents(input.appleCashUsd)
    if (apple < 0) return { ok: false as const, error: 'Apple Cash balance cannot be negative.' }

    const today = new Date().toISOString().slice(0, 10)

    // Virtual pots are calculated from how much you have right now (Apple Cash).
    setState((prev) => {
      const txs: Transaction[] = []
      const allocationPct = prev.settings.allocation
      const split = allocateCents(apple, allocationPct)
      if (apple > 0) {
        txs.push({
          id: newId(),
          type: 'opening',
          amountCents: apple,
          date: today,
          description: 'Current Apple Cash (auto-split)',
          source: 'opening',
          allocation: split,
          tags: ['opening'],
          createdAt: new Date().toISOString(),
        })
      }

      let spendingAvail = split.spending
      for (const p of input.pastTransactions ?? []) {
        const cents = toCents(p.amountUsd)
        if (!(cents > 0)) continue
        if (p.type === 'income') {
          const allocation = allocateCents(cents, allocationPct)
          txs.push({
            id: newId(),
            type: 'income',
            amountCents: cents,
            date: p.date || today,
            description: p.description,
            source: p.source || 'other',
            allocation,
            tags: ['opening', 'statement'],
            createdAt: new Date().toISOString(),
          })
          spendingAvail += allocation.spending
        } else if (p.type === 'spending') {
          if (cents > spendingAvail) continue
          txs.push({
            id: newId(),
            type: 'spending',
            amountCents: cents,
            date: p.date || today,
            description: p.description,
            category: p.category || 'other',
            tags: ['opening', 'statement'],
            createdAt: new Date().toISOString(),
          })
          spendingAvail -= cents
        } else if (p.type === 'transfer' && p.from && p.to) {
          txs.push({
            id: newId(),
            type: 'transfer',
            amountCents: cents,
            date: p.date || today,
            description: p.description,
            fromAccount: p.from,
            toAccount: p.to,
            tags: ['opening'],
            createdAt: new Date().toISOString(),
          })
        }
      }

      const iphoneBal = computeBalances(txs).iphone
      return {
        ...prev,
        transactions: txs,
        settings: {
          ...prev.settings,
          onboardingComplete: true,
          appleCashConfirmedCents: apple,
          appleCashConfirmedAt: new Date().toISOString(),
          celebratedMilestones: crossedMilestones(0, iphoneBal),
        },
      }
    })
    return { ok: true as const }
  }, [])

  const confirmAppleCash = useCallback((usd: number) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        appleCashConfirmedCents: toCents(usd),
        appleCashConfirmedAt: new Date().toISOString(),
      },
    }))
  }, [])

  const reconcileAppleCash = useCallback(
    (opts: { confirmedUsd: number; note?: string; applyAdjustment: boolean }) => {
      const confirmed = toCents(opts.confirmedUsd)
      if (confirmed < 0) return { ok: false as const, error: 'Balance cannot be negative.' }
      setState((prev) => {
        const bal = computeBalances(prev.transactions)
        const diff = confirmed - bal.combined
        const txs = [...prev.transactions]
        if (opts.applyAdjustment && diff !== 0) {
          // Put adjustment on spending so iPhone/extra savings stay intentional
          txs.push({
            id: newId(),
            type: 'reconcile',
            amountCents: Math.abs(diff),
            date: new Date().toISOString().slice(0, 10),
            description: opts.note?.trim() || 'Apple Cash reconciliation adjustment',
            allocation: { iphone: 0, spending: diff, extra: 0 },
            tags: ['apple_cash', 'reconcile'],
            createdAt: new Date().toISOString(),
          })
        }
        return {
          ...prev,
          transactions: txs,
          settings: {
            ...prev.settings,
            appleCashConfirmedCents: confirmed,
            appleCashConfirmedAt: new Date().toISOString(),
          },
        }
      })
      return { ok: true as const }
    },
    [],
  )

  const importPrintxEvents = useCallback(
    (events: PrintxFeedEvent[]) => {
      let imported = 0
      let skipped = 0
      const newMilestones: number[] = []

      setState((prev) => {
        const known = new Set(prev.settings.importedEventIds)
        const txs = [...prev.transactions]
        const ids = [...prev.settings.importedEventIds]
        let cursor = prev.settings.syncCursor
        let iphoneBefore = computeBalances(prev.transactions).iphone

        for (const ev of events) {
          if (!ev.eventId || known.has(ev.eventId)) {
            skipped += 1
            continue
          }
          const cents = toCents(ev.amountNetUsd)
          if (cents === 0) {
            skipped += 1
            continue
          }
          const isNegative = cents < 0 || ev.kind === 'refund' || ev.kind === 'reversal'
          const abs = Math.abs(cents)
          const allocation = allocateCents(isNegative ? -abs : abs, prev.settings.allocation)
          txs.push({
            id: newId(),
            type: isNegative ? 'refund' : 'import',
            amountCents: abs,
            date: (ev.occurredAt || new Date().toISOString()).slice(0, 10),
            description: ev.description || `PrintX ${ev.source} ${ev.kind}`,
            source: 'printx',
            printxSource: ev.source,
            allocation,
            externalId: ev.eventId,
            tags: ['printx', ev.source, ev.kind],
            createdAt: new Date().toISOString(),
          })
          known.add(ev.eventId)
          ids.push(ev.eventId)
          imported += 1
          if (ev.occurredAt && (!cursor || ev.occurredAt > cursor)) cursor = ev.occurredAt
        }

        const iphoneAfter = computeBalances(txs).iphone
        const crossed = crossedMilestones(iphoneBefore, iphoneAfter).filter(
          (m) => !prev.settings.celebratedMilestones.includes(m),
        )
        newMilestones.push(...crossed)
        if (crossed.length) {
          queueMicrotask(() => setCelebration(crossed[crossed.length - 1]!))
        }

        return {
          ...prev,
          transactions: txs,
          settings: {
            ...prev.settings,
            importedEventIds: ids,
            syncCursor: cursor,
            lastSyncedAt: new Date().toISOString(),
            celebratedMilestones: [...prev.settings.celebratedMilestones, ...crossed],
          },
        }
      })

      return { imported, skipped, newMilestoneCents: newMilestones }
    },
    [],
  )

  const importStatementRows = useCallback(
    (
      rows: Array<{
        type: 'income' | 'spending'
        amountUsd: number
        date: string
        description?: string
        source?: IncomeSource
        category?: string
      }>,
    ) => {
      if (!rows.length) return { ok: false as const, error: 'No rows to import.' }

      const snapshot = state
      const txs = [...snapshot.transactions]
      let running = computeBalances(txs)
      const iphoneBefore = running.iphone
      let imported = 0
      let skipped = 0
      const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date))

      for (const row of ordered) {
        const cents = toCents(row.amountUsd)
        if (!(cents > 0)) {
          skipped += 1
          continue
        }
        if (row.type === 'income') {
          const allocation = allocateCents(cents, snapshot.settings.allocation)
          txs.push({
            id: newId(),
            type: 'income',
            amountCents: cents,
            date: row.date,
            description: row.description?.trim() || 'Statement import',
            source: row.source || 'other',
            allocation,
            tags: ['statement', 'past'],
            createdAt: new Date().toISOString(),
          })
          running.iphone += allocation.iphone
          running.spending += allocation.spending
          running.extra += allocation.extra
          running.combined = running.iphone + running.spending + running.extra
          imported += 1
        } else if (cents > running.spending) {
          skipped += 1
        } else {
          txs.push({
            id: newId(),
            type: 'spending',
            amountCents: cents,
            date: row.date,
            description: row.description?.trim() || 'Statement purchase',
            category: row.category || 'other',
            tags: ['statement', 'past'],
            createdAt: new Date().toISOString(),
          })
          running.spending -= cents
          running.combined = running.iphone + running.spending + running.extra
          imported += 1
        }
      }

      if (imported === 0) {
        return {
          ok: false as const,
          error:
            skipped > 0
              ? `Nothing imported. ${skipped} row(s) skipped (often spends without enough Spending Money — import income first or raise spending balance).`
              : 'Nothing imported.',
        }
      }

      const crossed = crossedMilestones(iphoneBefore, running.iphone).filter(
        (m) => !snapshot.settings.celebratedMilestones.includes(m),
      )
      if (crossed.length) {
        queueMicrotask(() => setCelebration(crossed[crossed.length - 1]!))
      }

      setState({
        ...snapshot,
        transactions: txs,
        settings: {
          ...snapshot.settings,
          celebratedMilestones: [...snapshot.settings.celebratedMilestones, ...crossed],
        },
      })

      return { ok: true as const, imported, skipped }
    },
    [state],
  )

  const resetAllData = useCallback(() => {
    clearState()
    setState(createEmptyState())
    setCelebration(null)
  }, [])

  const value: MoneyContextValue = {
    state,
    balances,
    addIncome,
    addSpending,
    addTransfer,
    updateTransaction,
    deleteTransaction,
    updateSettings,
    completeOnboarding,
    confirmAppleCash,
    reconcileAppleCash,
    importPrintxEvents,
    importStatementRows,
    resetAllData,
    celebration,
    dismissCelebration: () => setCelebration(null),
  }

  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>
}

export function useMoney(): MoneyContextValue {
  const ctx = useContext(MoneyContext)
  if (!ctx) throw new Error('useMoney must be used within MoneyProvider')
  return ctx
}

export type { AllocationPct }
