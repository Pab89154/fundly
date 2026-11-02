import { useEffect, useState } from 'react'
import { CalendarClock, Plus, RefreshCw } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { formatUsd, fromCents, toCents } from '../lib/money'
import { NativeSelect } from '../components/NativeSelect'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { newId } from '../lib/storage'
import { zonedDateISO } from '../lib/timezone'
import type { RecurringCadence, Subscription } from '../types'

const WEEKDAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

export function Recurring() {
  const {
    state,
    updateSettings,
    upsertSubscription,
    removeSubscription,
    applyRecurringNow,
    logWeeklyAllowance,
  } = useMoney()

  const [allowance, setAllowance] = useState(
    fromCents(state.settings.weeklyAllowanceCents).toFixed(2),
  )
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [confirmDeleteSubId, setConfirmDeleteSubId] = useState<string | null>(null)
  const [subEditingId, setSubEditingId] = useState<string | null>(null)
  const [subCreating, setSubCreating] = useState(false)
  const [subName, setSubName] = useState('')
  const [subAmount, setSubAmount] = useState('')
  const [subCadence, setSubCadence] = useState<RecurringCadence>('monthly')
  const [subNext, setSubNext] = useState(() =>
    zonedDateISO(state.settings.timezone || 'America/Chicago'),
  )

  useEffect(() => {
    setAllowance(fromCents(state.settings.weeklyAllowanceCents).toFixed(2))
  }, [state.settings.weeklyAllowanceCents])

  const saveAllowanceAmount = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    const cents = toCents(Number(allowance))
    if (cents < 0 || Number.isNaN(Number(allowance))) {
      setErr('Enter a valid weekly allowance amount.')
      return
    }
    const res = updateSettings({ weeklyAllowanceCents: cents })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setMsg('Weekly allowance saved.')
  }

  return (
    <div className="space-y-6 animate-in">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Money rhythm
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <CalendarClock size={28} className="text-[var(--green)]" aria-hidden />
          Allowance & subscriptions
        </h2>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Set your weekly allowance, auto-post it on a day you choose, and manage subscriptions that
          spend from Spending only.
        </p>
      </header>

      {err ? <p className="text-sm text-[var(--danger)]">{err}</p> : null}
      {msg ? <p className="text-sm text-[var(--green)]">{msg}</p> : null}

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <RefreshCw size={18} className="text-[var(--green)]" aria-hidden />
              Weekly allowance
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Split into your pots using your Settings allocation when it posts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setErr('')
                const res = logWeeklyAllowance()
                if (!res.ok) {
                  setErr(res.error)
                  return
                }
                setMsg('Allowance logged and split into your pots.')
              }}
            >
              Log allowance now
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setErr('')
                const r = applyRecurringNow()
                setMsg(
                  r.applied
                    ? `Applied ${r.applied} due item(s).`
                    : 'Nothing due right now.',
                )
              }}
            >
              Apply due now
            </button>
          </div>
        </div>

        <form className="space-y-3" onSubmit={saveAllowanceAmount}>
          <div>
            <label className="label">Amount (USD)</label>
            <input
              className="field max-w-xs"
              type="number"
              min="0"
              step="0.01"
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Save amount
          </button>
        </form>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={state.settings.allowanceAuto.enabled}
              onChange={(e) =>
                updateSettings({
                  allowanceAuto: {
                    ...state.settings.allowanceAuto,
                    enabled: e.target.checked,
                  },
                })
              }
            />
            Auto weekly allowance
          </label>
          <div>
            <label className="label">Allowance day</label>
            <NativeSelect
              aria-label="Allowance weekday"
              value={String(state.settings.allowanceAuto.weekday)}
              onChange={(v) =>
                updateSettings({
                  allowanceAuto: {
                    ...state.settings.allowanceAuto,
                    weekday: Number(v),
                  },
                })
              }
              options={WEEKDAYS}
            />
          </div>
          <p className="text-xs text-[var(--muted)]">
            Weeks run Monday–Sunday. Posts {formatUsd(state.settings.weeklyAllowanceCents)} on the
            day you pick only (no past-week catch-up). Server + when you open Fundly.
          </p>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold">Subscriptions</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Charged from Spending. Skipped (with a notice) if there isn’t enough.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSubCreating(true)
              setSubEditingId(null)
              setSubName('')
              setSubAmount('')
              setSubCadence('monthly')
              setSubNext(zonedDateISO(state.settings.timezone || 'America/Chicago'))
            }}
          >
            <Plus size={16} aria-hidden />
            Add
          </button>
        </div>

        {state.settings.subscriptions.length === 0 && !subCreating ? (
          <p className="text-sm text-[var(--muted)]">No subscriptions yet — e.g. apps, Netflix.</p>
        ) : (
          <ul className="space-y-2">
            {state.settings.subscriptions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2"
              >
                <div>
                  <p className="font-semibold">
                    {s.name}{' '}
                    <span className="text-sm font-normal text-[var(--muted)]">
                      · {fromCents(s.amountCents).toFixed(2)} / {s.cadence}
                      {!s.enabled ? ' · paused' : ''}
                    </span>
                  </p>
                  <p className="text-xs text-[var(--muted)]">Next {s.nextDueDate}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => {
                      setSubCreating(false)
                      setSubEditingId(s.id)
                      setSubName(s.name)
                      setSubAmount(fromCents(s.amountCents).toFixed(2))
                      setSubCadence(s.cadence)
                      setSubNext(s.nextDueDate)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger px-3 py-1.5 text-xs"
                    onClick={() => setConfirmDeleteSubId(s.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {subCreating || subEditingId ? (
          <form
            className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-4"
            onSubmit={(e) => {
              e.preventDefault()
              setErr('')
              const amountCents = toCents(Number(subAmount))
              const name = subName.trim()
              if (!name || amountCents <= 0) {
                setErr('Subscription needs a name and amount.')
                return
              }
              const id = subEditingId || newId()
              const existing = state.settings.subscriptions.find((s) => s.id === id)
              const sub: Subscription = {
                id,
                name,
                amountCents,
                cadence: subCadence,
                anchorDate: existing?.anchorDate || subNext,
                nextDueDate: subNext,
                enabled: existing?.enabled ?? true,
                createdAt: existing?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
              const res = upsertSubscription(sub)
              if (!res.ok) {
                setErr(res.error)
                return
              }
              setSubCreating(false)
              setSubEditingId(null)
              setMsg(subEditingId ? 'Subscription updated.' : 'Subscription added.')
            }}
          >
            <p className="text-sm font-semibold">
              {subEditingId ? 'Edit subscription' : 'New subscription'}
            </p>
            <div>
              <label className="label">Name</label>
              <input
                className="field"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Amount (USD)</label>
              <input
                className="field"
                type="number"
                min="0.01"
                step="0.01"
                value={subAmount}
                onChange={(e) => setSubAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Cadence</label>
              <NativeSelect
                aria-label="Cadence"
                value={subCadence}
                onChange={(v) => setSubCadence(v as RecurringCadence)}
                options={[
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'yearly', label: 'Yearly' },
                ]}
              />
            </div>
            <div>
              <label className="label">Next due</label>
              <input
                className="field"
                type="date"
                value={subNext}
                onChange={(e) => setSubNext(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary">
                Save
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSubCreating(false)
                  setSubEditingId(null)
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <ConfirmDialog
        open={Boolean(confirmDeleteSubId)}
        title="Remove this subscription?"
        message="Future auto-charges stop. Past spending stays in Transactions."
        confirmLabel="Remove subscription"
        danger
        onCancel={() => setConfirmDeleteSubId(null)}
        onConfirm={() => {
          if (confirmDeleteSubId) removeSubscription(confirmDeleteSubId)
          setConfirmDeleteSubId(null)
          setMsg('Subscription removed.')
        }}
      />
    </div>
  )
}
