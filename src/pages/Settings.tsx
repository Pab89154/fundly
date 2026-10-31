import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { fromCents, isValidAllocationPct, toCents } from '../lib/money'
import { downloadCsv, transactionsToCsv } from '../lib/csv'

export function Settings() {
  const { state, updateSettings, resetAllData } = useMoney()
  const navigate = useNavigate()
  const [goal, setGoal] = useState(fromCents(state.settings.goalCents).toFixed(2))
  const [iphone, setIphone] = useState(String(state.settings.allocation.iphone))
  const [spending, setSpending] = useState(String(state.settings.allocation.spending))
  const [extra, setExtra] = useState(String(state.settings.allocation.extra))
  const [allowance, setAllowance] = useState(fromCents(state.settings.weeklyAllowanceCents).toFixed(2))
  const [printx, setPrintx] = useState(fromCents(state.settings.expectedPrintxWeeklyCents).toFixed(2))
  const [resetText, setResetText] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    const allocation = {
      iphone: Number(iphone),
      spending: Number(spending),
      extra: Number(extra),
    }
    if (!isValidAllocationPct(allocation)) {
      setErr('Percentages must be 0 or more and add up to 100.')
      return
    }
    const res = updateSettings({
      goalCents: toCents(Number(goal)),
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
        <p className="mt-2 text-[var(--muted)]">Goals, allocation, theme, export, and reset.</p>
      </header>

      <form className="card space-y-4 p-5" onSubmit={save}>
        <div>
          <label className="label">iPhone savings goal (USD)</label>
          <input className="field" type="number" min="1" step="0.01" value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">iPhone %</label>
            <input className="field" type="number" min="0" max="100" step="1" value={iphone} onChange={(e) => setIphone(e.target.value)} />
          </div>
          <div>
            <label className="label">Spending %</label>
            <input className="field" type="number" min="0" max="100" step="1" value={spending} onChange={(e) => setSpending(e.target.value)} />
          </div>
          <div>
            <label className="label">Extra %</label>
            <input className="field" type="number" min="0" max="100" step="1" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Weekly allowance (USD)</label>
          <input className="field" type="number" min="0" step="0.01" value={allowance} onChange={(e) => setAllowance(e.target.value)} />
        </div>
        <div>
          <label className="label">Expected weekly PrintX (USD)</label>
          <input className="field" type="number" min="0" step="0.01" value={printx} onChange={(e) => setPrintx(e.target.value)} />
        </div>
        <div>
          <label className="label">Theme</label>
          <select
            className="field"
            value={state.settings.theme}
            onChange={(e) => updateSettings({ theme: e.target.value as 'dark' | 'light' })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary w-full">
          Save settings
        </button>
      </form>

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
    </div>
  )
}
