import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CloudUpload,
  Download,
  Lock,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  Target,
  Trash2,
} from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { fromCents, isValidAllocationPct, toCents } from '../lib/money'
import { downloadCsv, transactionsToCsv } from '../lib/csv'
import { NativeSelect } from '../components/NativeSelect'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { ActiveGoal } from '../types'

export function Settings() {
  const { state, updateSettings, resetAllData, cloud } = useMoney()
  const navigate = useNavigate()
  const goal = state.settings.activeGoal

  const [goalName, setGoalName] = useState(goal?.name ?? '')
  const [goalTarget, setGoalTarget] = useState(
    goal ? fromCents(goal.targetCents).toFixed(2) : '',
  )
  const [goalNote, setGoalNote] = useState(goal?.note ?? '')
  const [editingGoal, setEditingGoal] = useState(!goal)

  const [iphone, setIphone] = useState(String(state.settings.allocation.iphone))
  const [spending, setSpending] = useState(String(state.settings.allocation.spending))
  const [extra, setExtra] = useState(String(state.settings.allocation.extra))
  const [charity, setCharity] = useState(String(state.settings.allocation.charity))
  const [allowance, setAllowance] = useState(fromCents(state.settings.weeklyAllowanceCents).toFixed(2))
  const [printx, setPrintx] = useState(fromCents(state.settings.expectedPrintxWeeklyCents).toFixed(2))
  const [resetText, setResetText] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState(false)

  useEffect(() => {
    const g = state.settings.activeGoal
    setGoalName(g?.name ?? '')
    setGoalTarget(g ? fromCents(g.targetCents).toFixed(2) : '')
    setGoalNote(g?.note ?? '')
    if (!g) setEditingGoal(true)
  }, [state.settings.activeGoal])

  const saveGoal = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    const name = goalName.trim()
    const targetCents = toCents(Number(goalTarget))
    if (!name) {
      setErr('Give your goal a name.')
      return
    }
    if (!(targetCents > 0)) {
      setErr('Goal amount must be greater than $0.')
      return
    }
    const now = new Date().toISOString()
    const next: ActiveGoal = {
      name,
      targetCents,
      note: goalNote.trim(),
      createdAt: goal?.createdAt || now,
      updatedAt: now,
    }
    const res = updateSettings({ activeGoal: next, goalCents: targetCents })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setEditingGoal(false)
    setMsg(goal ? 'Goal updated.' : 'Goal created.')
  }

  const deleteGoal = () => {
    setConfirmDeleteGoal(false)
    const res = updateSettings({ activeGoal: null, goalCents: 0 })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setGoalName('')
    setGoalTarget('')
    setGoalNote('')
    setEditingGoal(true)
    setMsg('Goal deleted. You can create a new one anytime.')
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    const allocation = {
      iphone: Number(iphone),
      spending: Number(spending),
      extra: Number(extra),
      charity: Number(charity),
    }
    if (!isValidAllocationPct(allocation)) {
      setErr('Percentages must be 0 or more and add up to 100.')
      return
    }
    const res = updateSettings({
      allocation,
      weeklyAllowanceCents: toCents(Number(allowance)),
      expectedPrintxWeeklyCents: toCents(Number(printx)),
    })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setMsg('Settings saved.')
  }

  const reset = () => {
    if (resetText.trim().toUpperCase() !== 'RESET') {
      setErr('Type RESET to confirm.')
      return
    }
    setConfirmReset(true)
  }

  const doReset = () => {
    setConfirmReset(false)
    resetAllData()
    setMsg('All data cleared.')
    navigate('/onboarding')
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <SettingsIcon size={28} className="text-[var(--muted)]" aria-hidden />
          Settings
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          One goal at a time · split, theme, export, and reset.
        </p>
      </header>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Target size={18} className="text-[var(--green)]" aria-hidden />
              Current goal
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Only one goal is active. Delete it to start a new one.
            </p>
          </div>
          {goal && !editingGoal ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingGoal(true)}>
                <Pencil size={16} aria-hidden />
                Edit
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirmDeleteGoal(true)}
              >
                <Trash2 size={16} aria-hidden />
                Delete
              </button>
            </div>
          ) : null}
        </div>

        {goal && !editingGoal ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-4">
            <p className="text-2xl font-extrabold tracking-tight">{goal.name}</p>
            <p className="mt-1 text-lg font-semibold text-[var(--green)]">
              {fromCents(goal.targetCents).toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
              })}
            </p>
            {goal.note ? <p className="mt-2 text-sm text-[var(--muted)]">{goal.note}</p> : null}
          </div>
        ) : (
          <form className="space-y-4" onSubmit={saveGoal}>
            {!goal ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--orange)]">
                <Plus size={16} aria-hidden />
                No goal yet — create one
              </p>
            ) : null}
            <div>
              <label className="label">Goal name</label>
              <input
                className="field"
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                placeholder="iPhone Duo, bike, trip…"
                required
              />
            </div>
            <div>
              <label className="label">Target amount (USD)</label>
              <input
                className="field"
                type="number"
                min="0.01"
                step="0.01"
                value={goalTarget}
                onChange={(e) => setGoalTarget(e.target.value)}
                placeholder="2000.00"
                required
              />
            </div>
            <div>
              <label className="label">Note (optional)</label>
              <input
                className="field"
                value={goalNote}
                onChange={(e) => setGoalNote(e.target.value)}
                placeholder="Why this goal matters"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary">
                {goal ? 'Save goal' : 'Create goal'}
              </button>
              {goal ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingGoal(false)
                    setGoalName(goal.name)
                    setGoalTarget(fromCents(goal.targetCents).toFixed(2))
                    setGoalNote(goal.note)
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        )}
      </section>

      <form className="card space-y-4 p-5" onSubmit={save}>
        <h3 className="font-bold">Money split & estimates</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="label">Goal %</label>
            <input
              className="field"
              type="number"
              min="0"
              max="100"
              step="1"
              value={iphone}
              onChange={(e) => setIphone(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Spending %</label>
            <input
              className="field"
              type="number"
              min="0"
              max="100"
              step="1"
              value={spending}
              onChange={(e) => setSpending(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Extra %</label>
            <input
              className="field"
              type="number"
              min="0"
              max="100"
              step="1"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Charity %</label>
            <input
              className="field"
              type="number"
              min="0"
              max="100"
              step="1"
              value={charity}
              onChange={(e) => setCharity(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Weekly allowance (USD)</label>
          <input
            className="field"
            type="number"
            min="0"
            step="0.01"
            value={allowance}
            onChange={(e) => setAllowance(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Expected weekly PrintX (USD)</label>
          <input
            className="field"
            type="number"
            min="0"
            step="0.01"
            value={printx}
            onChange={(e) => setPrintx(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Theme</label>
          <NativeSelect
            aria-label="Theme"
            value={state.settings.theme}
            onChange={(v) => updateSettings({ theme: v as 'dark' | 'light' })}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </div>
        <button type="submit" className="btn btn-primary w-full">
          Save settings
        </button>
      </form>

      <div className="card space-y-3 p-5">
        <h3 className="font-bold">Cloud & lock</h3>
        <p className="text-sm text-[var(--muted)]">
          Saves to your private Supabase project while unlocked. Lock when you walk away.
        </p>
        {cloud.lastError ? (
          <p className="text-sm text-[var(--danger)]">{cloud.lastError}</p>
        ) : (
          <p className="text-sm text-[var(--green)]">
            {cloud.empty ? 'Cloud is empty — upload this device once.' : 'Cloud sync is on.'}
          </p>
        )}
        {cloud.empty ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={cloudBusy}
            onClick={() => {
              setCloudBusy(true)
              void cloud.uploadLocalToCloud().then((res) => {
                setCloudBusy(false)
                if (!res.ok) setErr(res.error)
                else setMsg('Uploaded this device to the cloud.')
              })
            }}
          >
            <CloudUpload size={16} aria-hidden />
            {cloudBusy ? 'Uploading…' : 'Upload this device to cloud'}
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={() => void cloud.lockNow()}>
          <Lock size={16} aria-hidden />
          Lock Fundly now
        </button>
      </div>

      <div className="card space-y-3 p-5">
        <h3 className="font-bold">Export</h3>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            downloadCsv(
              `fundly-${new Date().toISOString().slice(0, 10)}.csv`,
              transactionsToCsv(state.transactions),
            )
          }
        >
          <Download size={16} aria-hidden />
          Export transactions CSV
        </button>
      </div>

      <div className="card space-y-3 p-5">
        <h3 className="font-bold">Set starting point again</h3>
        <p className="text-sm text-[var(--muted)]">
          Re-open onboarding without deleting data first (you can also reset below).
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/onboarding')}>
          Open setup
        </button>
      </div>

      <div className="card space-y-3 p-5">
        <h3 className="flex items-center gap-2 font-bold text-[var(--danger)]">
          <Trash2 size={18} aria-hidden />
          Reset all data
        </h3>
        <p className="text-sm text-[var(--muted)]">Type RESET to confirm. This cannot be undone.</p>
        <input
          className="field"
          value={resetText}
          onChange={(e) => setResetText(e.target.value)}
          placeholder="RESET"
        />
        <button type="button" className="btn btn-danger" onClick={reset}>
          <Trash2 size={16} aria-hidden />
          Reset everything
        </button>
      </div>

      {err ? <p className="text-sm text-[var(--danger)]">{err}</p> : null}
      {msg ? <p className="text-sm text-[var(--green)]">{msg}</p> : null}

      <ConfirmDialog
        open={confirmReset}
        title="Reset everything?"
        message="This deletes all Fundly data on this device. Type RESET was already checked — this cannot be undone."
        confirmLabel="Reset everything"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={doReset}
      />
      <ConfirmDialog
        open={confirmDeleteGoal}
        title="Delete this goal?"
        message="Your savings pots stay the same. You can create a new goal after this."
        confirmLabel="Delete goal"
        danger
        onCancel={() => setConfirmDeleteGoal(false)}
        onConfirm={deleteGoal}
      />
    </div>
  )
}
