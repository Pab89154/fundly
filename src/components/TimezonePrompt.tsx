import { useEffect, useMemo, useState } from 'react'
import { Globe } from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import { listTimeZones } from '../lib/timezone'
import { NativeSelect } from './NativeSelect'

export function openTimezonePicker() {
  window.dispatchEvent(new CustomEvent('fundly:open-timezone'))
}

export function TimezonePrompt() {
  const { needsTimezonePrompt, setTimezoneManual, updateSettings, state } = useMoney()
  const [forceOpen, setForceOpen] = useState(false)
  const zones = useMemo(() => listTimeZones(), [])
  const [pick, setPick] = useState(
    () => state.settings.timezone || 'America/Chicago',
  )
  const [err, setErr] = useState('')

  useEffect(() => {
    const on = () => setForceOpen(true)
    window.addEventListener('fundly:open-timezone', on)
    return () => window.removeEventListener('fundly:open-timezone', on)
  }, [])

  useEffect(() => {
    if (state.settings.timezone) setPick(state.settings.timezone)
  }, [state.settings.timezone])

  const show = needsTimezonePrompt || forceOpen
  if (!show) return null

  const onSave = () => {
    setErr('')
    const res = setTimezoneManual(pick)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setForceOpen(false)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-4 sm:items-center">
      <div className="card w-full max-w-md space-y-4 p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <Globe className="mt-0.5 shrink-0 text-[var(--green)]" size={22} aria-hidden />
          <div>
            <h2 className="text-lg font-extrabold">
              {needsTimezonePrompt ? 'We couldn’t detect your timezone' : 'Change timezone'}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Allowance, subscriptions, and “See this week!” use this calendar day.
            </p>
          </div>
        </div>
        <div>
          <label className="label">Timezone</label>
          <NativeSelect
            aria-label="Timezone"
            value={pick}
            onChange={setPick}
            options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))}
          />
        </div>
        {err ? <p className="text-sm text-[var(--danger)]">{err}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={onSave}>
            Save timezone
          </button>
          {forceOpen && !needsTimezonePrompt ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
                updateSettings({ timezone: detected, timezoneSource: 'auto' })
                setForceOpen(false)
              }}
            >
              Use device
            </button>
          ) : null}
          {forceOpen && !needsTimezonePrompt ? (
            <button type="button" className="btn btn-secondary" onClick={() => setForceOpen(false)}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
