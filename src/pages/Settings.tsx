import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Briefcase,
  CloudUpload,
  Download,
  Globe,
  Lock,
  Gift,
  Pencil,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Target,
  Trash2,
} from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import {
  defaultMilestoneMeta,
  defaultMilestoneTitle,
  formatUsd,
  fromCents,
  isValidAllocationPct,
  localDateISO,
  milestonesForTarget,
  toCents,
} from '../lib/money'
import { downloadCsv, transactionsToCsv } from '../lib/csv'
import { ensureNotificationPermission } from '../lib/notify'
import { openTimezonePicker } from '../components/TimezonePrompt'
import { NativeSelect } from '../components/NativeSelect'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  isReservedBusinessId,
  isSystemBusinessId,
  slugifyBusinessId,
  type ActiveGoal,
  type Business,
  type RecurringCadence,
  type Subscription,
} from '../types'
import { newId } from '../lib/storage'
import { defaultPrintxLogoUrl } from '../lib/businessLogo'
import { zonedDateISO } from '../lib/timezone'
import { LogoUploadPaste } from '../components/LogoUploadPaste'
import { BusinessLogo } from '../components/BusinessLogo'

const WEEKDAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

export function Settings() {
  const {
    state,
    updateSettings,
    resetAllData,
    cloud,
    upsertSubscription,
    removeSubscription,
    applyRecurringNow,
  } = useMoney()
  const navigate = useNavigate()
  const goal = state.settings.activeGoal

  const [goalName, setGoalName] = useState(goal?.name ?? '')
  const [goalTarget, setGoalTarget] = useState(
    goal ? fromCents(goal.targetCents).toFixed(2) : '',
  )
  const [goalNote, setGoalNote] = useState(goal?.note ?? '')
  const [milestoneMeta, setMilestoneMeta] = useState<Record<string, { title: string; treat?: string }>>(
    () => goal?.milestoneMeta ?? {},
  )
  const [milestonesOpen, setMilestonesOpen] = useState(false)
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
  const [confirmDeleteBusinessId, setConfirmDeleteBusinessId] = useState<string | null>(null)
  const [confirmDeleteSubId, setConfirmDeleteSubId] = useState<string | null>(null)
  const [bizEditingId, setBizEditingId] = useState<string | null>(null)
  const [bizCreating, setBizCreating] = useState(false)
  const [bizName, setBizName] = useState('')
  const [bizNote, setBizNote] = useState('')
  const [bizMonthly, setBizMonthly] = useState('')
  const [bizLogo, setBizLogo] = useState<string | null>(null)
  const [subEditingId, setSubEditingId] = useState<string | null>(null)
  const [subCreating, setSubCreating] = useState(false)
  const [subName, setSubName] = useState('')
  const [subAmount, setSubAmount] = useState('')
  const [subCadence, setSubCadence] = useState<RecurringCadence>('monthly')
  const [subNext, setSubNext] = useState(() => zonedDateISO(state.settings.timezone || 'America/Chicago'))

  useEffect(() => {
    const g = state.settings.activeGoal
    setGoalName(g?.name ?? '')
    setGoalTarget(g ? fromCents(g.targetCents).toFixed(2) : '')
    setGoalNote(g?.note ?? '')
    setMilestoneMeta(g?.milestoneMeta ?? {})
    if (!g) setEditingGoal(true)
  }, [state.settings.activeGoal])

  const draftTargetCents = toCents(Number(goalTarget)) || 0
  const draftMilestoneCents =
    draftTargetCents > 0 ? milestonesForTarget(draftTargetCents) : []

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
    const defaults = defaultMilestoneMeta(targetCents, name)
    const cleaned: Record<string, { title: string; treat?: string }> = {}
    for (const c of milestonesForTarget(targetCents)) {
      const key = String(c)
      const raw = milestoneMeta[key]
      const title = (raw?.title ?? defaults[key]?.title ?? defaultMilestoneTitle(c, targetCents, name)).trim()
      const treat = raw?.treat?.trim()
      cleaned[key] = treat ? { title, treat } : { title }
    }
    const now = new Date().toISOString()
    const next: ActiveGoal = {
      name,
      targetCents,
      note: goalNote.trim(),
      milestoneMeta: cleaned,
      createdAt: goal?.createdAt || now,
      updatedAt: now,
    }
    const res = updateSettings({ activeGoal: next, goalCents: targetCents })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setMilestoneMeta(cleaned)
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
    setMilestoneMeta({})
    setMilestonesOpen(false)
    setEditingGoal(true)
    setMsg('Goal deleted. You can create a new one anytime.')
  }

  const updateMilestoneField = (
    cents: number,
    field: 'title' | 'treat',
    value: string,
  ) => {
    const key = String(cents)
    setMilestoneMeta((prev) => {
      const cur = prev[key] ?? {
        title: defaultMilestoneTitle(cents, draftTargetCents, goalName.trim() || 'Goal'),
      }
      if (field === 'treat') {
        const treat = value.trim() ? value : undefined
        return { ...prev, [key]: { title: cur.title, ...(treat ? { treat } : {}) } }
      }
      return { ...prev, [key]: { ...cur, title: value } }
    })
  }

  const startCreateBusiness = () => {
    setBizCreating(true)
    setBizEditingId(null)
    setBizName('')
    setBizNote('')
    setBizMonthly('')
    setBizLogo(null)
    setErr('')
    setMsg('')
  }

  const startEditBusiness = (b: Business) => {
    setBizCreating(false)
    setBizEditingId(b.id)
    setBizName(b.name)
    setBizNote(b.note)
    setBizMonthly(
      b.monthlyTargetCents != null && b.monthlyTargetCents > 0
        ? fromCents(b.monthlyTargetCents).toFixed(2)
        : '',
    )
    setBizLogo(b.logoDataUrl ?? null)
    setErr('')
    setMsg('')
  }

  const cancelBusinessForm = () => {
    setBizCreating(false)
    setBizEditingId(null)
    setBizName('')
    setBizNote('')
    setBizMonthly('')
    setBizLogo(null)
  }

  const saveBusiness = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    const name = bizName.trim()
    if (!name) {
      setErr('Give the business a name.')
      return
    }
    const list = [...state.settings.businesses]
    const now = new Date().toISOString()

    if (bizEditingId) {
      const idx = list.findIndex((b) => b.id === bizEditingId)
      if (idx < 0) {
        setErr('Business not found.')
        return
      }
      const monthlyCents = bizMonthly.trim() ? toCents(Number(bizMonthly)) : null
      const prev = list[idx]!
      list[idx] = {
        ...prev,
        name: isSystemBusinessId(prev.id) ? prev.name : name,
        note: bizNote.trim(),
        logoDataUrl: bizLogo,
        monthlyTargetCents: monthlyCents && monthlyCents > 0 ? monthlyCents : null,
        kind: prev.id === 'printx' ? 'printx' : 'manual',
        updatedAt: now,
      }
      const res = updateSettings({ businesses: list })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      cancelBusinessForm()
      setMsg('Business updated.')
      return
    }

    let id = slugifyBusinessId(name)
    if (isReservedBusinessId(id) && id !== 'nfc_bracelets') {
      setErr('That name conflicts with a built-in source. Pick another.')
      return
    }
    if (list.some((b) => b.id === id)) {
      id = `${id}_${Date.now().toString(36).slice(-4)}`
    }
    const monthlyCents = bizMonthly.trim() ? toCents(Number(bizMonthly)) : null
    list.push({
      id,
      name,
      note: bizNote.trim(),
      kind: 'manual',
      logoDataUrl: bizLogo,
      monthlyTargetCents: monthlyCents && monthlyCents > 0 ? monthlyCents : null,
      createdAt: now,
    })
    const res = updateSettings({ businesses: list })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    cancelBusinessForm()
    setMsg(`Business “${name}” created.`)
  }

  const deleteBusiness = () => {
    const id = confirmDeleteBusinessId
    setConfirmDeleteBusinessId(null)
    if (!id) return
    if (isSystemBusinessId(id)) {
      setErr('PrintX can’t be removed — it’s a built-in business.')
      return
    }
    const list = state.settings.businesses.filter((b) => b.id !== id)
    const res = updateSettings({ businesses: list })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    if (bizEditingId === id) cancelBusinessForm()
    setMsg('Business removed. Past sales stay in Transactions.')
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
          Goal, businesses, split, theme, export, and reset.
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
            {goal.milestoneMeta && Object.keys(goal.milestoneMeta).length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm text-[var(--muted)]">
                {milestonesForTarget(goal.targetCents).map((c) => {
                  const entry = goal.milestoneMeta?.[String(c)]
                  const title =
                    entry?.title?.trim() ||
                    defaultMilestoneTitle(c, goal.targetCents, goal.name)
                  return (
                    <li key={c} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium text-[var(--text)]">{title}</span>
                      <span>· {formatUsd(c)}</span>
                      {entry?.treat ? (
                        <span className="inline-flex items-center gap-1 text-[var(--orange)]">
                          <Gift size={12} aria-hidden />
                          {entry.treat}
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}
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
            {draftMilestoneCents.length > 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)]">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                  onClick={() => setMilestonesOpen((o) => !o)}
                  aria-expanded={milestonesOpen}
                >
                  <span className="font-semibold">Milestones</span>
                  <span className="text-sm text-[var(--muted)]">
                    {milestonesOpen ? 'Hide' : 'Edit titles & treats'}
                  </span>
                </button>
                {milestonesOpen ? (
                  <ul className="space-y-4 border-t border-[var(--border)] px-4 py-4">
                    {draftMilestoneCents.map((c) => {
                      const key = String(c)
                      const entry = milestoneMeta[key]
                      const title =
                        entry?.title ??
                        defaultMilestoneTitle(c, draftTargetCents, goalName.trim() || 'Goal')
                      return (
                        <li key={c} className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                            {formatUsd(c)}
                          </p>
                          <div>
                            <label className="label">Title</label>
                            <input
                              className="field"
                              value={title}
                              onChange={(e) => updateMilestoneField(c, 'title', e.target.value)}
                              placeholder={defaultMilestoneTitle(
                                c,
                                draftTargetCents,
                                goalName.trim() || 'Goal',
                              )}
                            />
                          </div>
                          <div>
                            <label className="label">Treat (optional)</label>
                            <input
                              className="field"
                              value={entry?.treat ?? ''}
                              onChange={(e) => updateMilestoneField(c, 'treat', e.target.value)}
                              placeholder="Get ice cream"
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>
            ) : null}
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
                    setMilestoneMeta(goal.milestoneMeta ?? {})
                    setMilestonesOpen(false)
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Briefcase size={18} className="text-[var(--orange)]" aria-hidden />
              Businesses
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              PrintX (synced) plus manual shops. Upload or paste a logo (PNG/JPEG/SVG) for each.
            </p>
          </div>
          {!bizCreating && !bizEditingId ? (
            <button type="button" className="btn btn-secondary" onClick={startCreateBusiness}>
              <Plus size={16} aria-hidden />
              Add business
            </button>
          ) : null}
        </div>

        {state.settings.businesses.length === 0 && !bizCreating ? (
          <p className="text-sm text-[var(--muted)]">No businesses yet — add one to track sales.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {state.settings.businesses.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <BusinessLogo business={b} size={36} />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {b.name}
                      {b.kind === 'printx' || b.id === 'printx' ? (
                        <span className="ml-2 text-xs font-semibold text-[var(--blue)]">Synced</span>
                      ) : null}
                    </p>
                    {b.note ? <p className="text-sm text-[var(--muted)]">{b.note}</p> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => startEditBusiness(b)}
                  >
                    <Pencil size={14} aria-hidden />
                    Edit
                  </button>
                  {!isSystemBusinessId(b.id) ? (
                    <button
                      type="button"
                      className="btn btn-danger px-3 py-1.5 text-xs"
                      onClick={() => setConfirmDeleteBusinessId(b.id)}
                    >
                      <Trash2 size={14} aria-hidden />
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {bizCreating || bizEditingId ? (
          <form className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-4" onSubmit={saveBusiness}>
            <p className="text-sm font-semibold">
              {bizEditingId
                ? isSystemBusinessId(bizEditingId)
                  ? 'Edit PrintX business'
                  : 'Edit business'
                : 'New business'}
            </p>
            <LogoUploadPaste
              value={bizLogo}
              onChange={setBizLogo}
              previewFallback={bizEditingId === 'printx' ? defaultPrintxLogoUrl() : null}
            />
            <div>
              <label className="label">Name</label>
              <input
                className="field"
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                placeholder="NFC Bracelets, lemonade stand…"
                required
                disabled={Boolean(bizEditingId && isSystemBusinessId(bizEditingId))}
              />
            </div>
            <div>
              <label className="label">Note (optional)</label>
              <input
                className="field"
                value={bizNote}
                onChange={(e) => setBizNote(e.target.value)}
                placeholder="How you track this business"
              />
            </div>
            <div>
              <label className="label">Monthly sales target (optional)</label>
              <input
                className="field"
                type="number"
                min="0"
                step="0.01"
                value={bizMonthly}
                onChange={(e) => setBizMonthly(e.target.value)}
                placeholder="200.00"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary">
                {bizEditingId ? 'Save business' : 'Create business'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={cancelBusinessForm}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="card space-y-4 p-5">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Globe size={18} className="text-[var(--blue)]" aria-hidden />
          Timezone
        </h3>
        <p className="text-sm text-[var(--muted)]">
          {state.settings.timezone
            ? `${state.settings.timezone.replace(/_/g, ' ')} · ${
                state.settings.timezoneSource === 'manual' ? 'chosen by you' : 'from this device'
              }`
            : 'Not set yet'}
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => openTimezonePicker()}>
          Change…
        </button>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <RefreshCw size={18} className="text-[var(--green)]" aria-hidden />
              Recurring
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Auto weekly allowance and spending-only subscriptions. Applied by the server and when
              you open Fundly.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
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
            Amount comes from Weekly allowance below (${allowance}).
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">Subscriptions</h4>
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
            <p className="text-sm font-semibold">{subEditingId ? 'Edit subscription' : 'New subscription'}</p>
            <div>
              <label className="label">Name</label>
              <input className="field" value={subName} onChange={(e) => setSubName(e.target.value)} required />
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

      <section className="card space-y-4 p-5">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Bell size={18} className="text-[var(--orange)]" aria-hidden />
          Reminders
        </h3>
        <p className="text-sm text-[var(--muted)]">
          Browser notifications for allowance, failed subscriptions, Apple Cash mismatch, and weekly
          review (“See this week!”).
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            void ensureNotificationPermission().then((p) => {
              if (p === 'granted') {
                updateSettings({
                  reminders: { ...state.settings.reminders, webPushEnabled: true },
                })
                setMsg('Notifications allowed.')
              } else if (p === 'denied') {
                setErr('Notifications blocked in browser settings.')
              } else {
                setMsg(`Notification permission: ${p}`)
              }
            })
          }}
        >
          Enable notifications
        </button>
        {(
          [
            ['notifyAllowance', 'When allowance is added'],
            ['notifySubscriptionFail', 'When a subscription can’t be paid'],
            ['notifyAppleMismatch', 'When Apple Cash doesn’t match'],
            ['notifyWeeklyReview', 'Weekly review — “See this week!”'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={Boolean(state.settings.reminders[key])}
              onChange={(e) =>
                updateSettings({
                  reminders: { ...state.settings.reminders, [key]: e.target.checked },
                })
              }
            />
            {label}
          </label>
        ))}
        <div>
          <label className="label">Weekly review day</label>
          <NativeSelect
            aria-label="Weekly review weekday"
            value={String(state.settings.reminders.weeklyReviewWeekday)}
            onChange={(v) =>
              updateSettings({
                reminders: {
                  ...state.settings.reminders,
                  weeklyReviewWeekday: Number(v),
                },
              })
            }
            options={WEEKDAYS}
          />
        </div>
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
              `fundly-${localDateISO()}.csv`,
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
      <ConfirmDialog
        open={Boolean(confirmDeleteBusinessId)}
        title="Remove this business?"
        message="It leaves the nav and income list. Past sales stay in Transactions under the old name."
        confirmLabel="Remove business"
        danger
        onCancel={() => setConfirmDeleteBusinessId(null)}
        onConfirm={deleteBusiness}
      />
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
