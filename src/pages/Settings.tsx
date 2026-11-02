import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  Settings as SettingsIcon,
  Target,
  Trash2,
} from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import {
  defaultMilestoneTitle,
  formatUsd,
  fromCents,
  isAutoUnlockMilestoneTitle,
  isValidAllocationPct,
  localDateISO,
  toCents,
} from '../lib/money'
import {
  milestonesForGoal,
  milestonesToMetaMap,
  newMilestoneId,
  resetMilestonesToFractions,
  syncGoalMilestonesName,
  type GoalMilestone,
  type MilestoneIconKey,
} from '../lib/milestones'
import { MilestoneIcon, MILESTONE_ICON_OPTIONS } from '../components/milestoneIcons'
import { downloadCsv, transactionsToCsv } from '../lib/csv'
import {
  enableNotifications,
  getNotifySetupState,
  isBraveBrowser,
  isIosDevice,
  sendTestNotification,
  type NotifySetupState,
} from '../lib/notify'
import { openTimezonePicker } from '../components/TimezonePrompt'
import { NativeSelect } from '../components/NativeSelect'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  isReservedBusinessId,
  isSystemBusinessId,
  slugifyBusinessId,
  type ActiveGoal,
  type Business,
  type ReminderSettings,
} from '../types'
import { defaultPrintxLogoUrl } from '../lib/businessLogo'
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
  } = useMoney()
  const navigate = useNavigate()
  const goal = state.settings.activeGoal

  const [goalName, setGoalName] = useState(goal?.name ?? '')
  const [goalTarget, setGoalTarget] = useState(
    goal ? fromCents(goal.targetCents).toFixed(2) : '',
  )
  const [goalNote, setGoalNote] = useState(goal?.note ?? '')
  const [draftMilestones, setDraftMilestones] = useState<GoalMilestone[]>(() =>
    milestonesForGoal(goal),
  )
  const [milestonesOpen, setMilestonesOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState(!goal)

  const [iphone, setIphone] = useState(String(state.settings.allocation.iphone))
  const [spending, setSpending] = useState(String(state.settings.allocation.spending))
  const [extra, setExtra] = useState(String(state.settings.allocation.extra))
  const [charity, setCharity] = useState(String(state.settings.allocation.charity))
  const [printx, setPrintx] = useState(fromCents(state.settings.expectedPrintxWeeklyCents).toFixed(2))
  const [resetText, setResetText] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [notifyState, setNotifyState] = useState<NotifySetupState>('loading')
  const [notifyBusy, setNotifyBusy] = useState(false)
  const [notifyMsg, setNotifyMsg] = useState('')
  const [notifyErr, setNotifyErr] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState(false)
  const [confirmDeleteBusinessId, setConfirmDeleteBusinessId] = useState<string | null>(null)
  const [bizEditingId, setBizEditingId] = useState<string | null>(null)
  const [bizCreating, setBizCreating] = useState(false)
  const [bizName, setBizName] = useState('')
  const [bizNote, setBizNote] = useState('')
  const [bizMonthly, setBizMonthly] = useState('')
  const [bizLogo, setBizLogo] = useState<string | null>(null)

  useEffect(() => {
    const g = state.settings.activeGoal
    setGoalName(g?.name ?? '')
    setGoalTarget(g ? fromCents(g.targetCents).toFixed(2) : '')
    setGoalNote(g?.note ?? '')
    setDraftMilestones(milestonesForGoal(g))
    if (!g) setEditingGoal(true)
  }, [state.settings.activeGoal])

  useEffect(() => {
    setNotifyState(getNotifySetupState())
  }, [])

  const draftTargetCents = toCents(Number(goalTarget)) || 0

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
    let list = draftMilestones.length
      ? draftMilestones.map((m) => ({ ...m }))
      : resetMilestonesToFractions(targetCents, name, goal?.milestones)
    // Ensure final unlock title follows current name; keep custom amounts.
    list = syncGoalMilestonesName(
      list.map((m) => {
        const cents = Math.max(1, Math.trunc(m.cents) || 0)
        let title = (m.title || '').trim() || defaultMilestoneTitle(cents, targetCents, name)
        if (isAutoUnlockMilestoneTitle(title)) title = `${name} unlocked!`
        const treat = m.treat?.trim()
        return {
          id: m.id || newMilestoneId(),
          cents,
          title,
          ...(treat ? { treat } : {}),
          icon: m.icon,
        }
      }),
      name,
    )
    // If target changed and no list, seed fractions
    if (!list.length) list = resetMilestonesToFractions(targetCents, name, null)
    const maxCents = Math.max(...list.map((m) => m.cents), 0)
    if (maxCents > 0 && targetCents > 0 && maxCents !== targetCents) {
      // Keep editable amounts; bump highest checkpoint toward new target if it was the old unlock
      list = list.map((m) =>
        m.cents >= maxCents
          ? {
              ...m,
              cents: targetCents,
              title: isAutoUnlockMilestoneTitle(m.title) || !m.title.trim()
                ? `${name} unlocked!`
                : m.title,
            }
          : m,
      )
    }
    const cleanedMeta = milestonesToMetaMap(list)
    const now = new Date().toISOString()
    const next: ActiveGoal = {
      name,
      targetCents,
      note: goalNote.trim(),
      milestones: list,
      milestoneMeta: cleanedMeta,
      createdAt: goal?.createdAt || now,
      updatedAt: now,
    }
    const res = updateSettings({ activeGoal: next, goalCents: targetCents })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setDraftMilestones(list)
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
    setDraftMilestones([])
    setMilestonesOpen(false)
    setEditingGoal(true)
    setMsg('Goal deleted. You can create a new one anytime.')
  }

  const updateDraftMilestone = (
    id: string,
    patch: Partial<Pick<GoalMilestone, 'title' | 'treat' | 'cents' | 'icon'>>,
  ) => {
    setDraftMilestones((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m
        const next = { ...m, ...patch }
        if ('cents' in patch && patch.cents != null) {
          next.cents = Math.max(1, Math.trunc(Number(patch.cents) || 0))
        }
        if ('treat' in patch) {
          const t = String(patch.treat || '').trim()
          if (t) next.treat = t
          else delete next.treat
        }
        return next
      }),
    )
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
            {milestonesForGoal(goal).length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm text-[var(--muted)]">
                {milestonesForGoal(goal).map((m) => (
                  <li key={m.id} className="flex flex-wrap items-baseline gap-x-2">
                    <MilestoneIcon name={m.icon} size="sm" className="inline text-[var(--green)]" />
                    <span className="font-medium text-[var(--text)]">{m.title}</span>
                    <span>· {formatUsd(m.cents)}</span>
                    {m.treat ? (
                      <span className="inline-flex items-center gap-1 text-[var(--orange)]">
                        <Gift size={12} aria-hidden />
                        {m.treat}
                      </span>
                    ) : null}
                  </li>
                ))}
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
            {(draftMilestones.length > 0 || draftTargetCents > 0) ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)]">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                  onClick={() => {
                    if (!draftMilestones.length && draftTargetCents > 0) {
                      setDraftMilestones(
                        resetMilestonesToFractions(
                          draftTargetCents,
                          goalName.trim() || 'Goal',
                          goal?.milestones,
                        ),
                      )
                    }
                    setMilestonesOpen((o) => !o)
                  }}
                  aria-expanded={milestonesOpen}
                >
                  <span className="font-semibold">Milestones</span>
                  <span className="text-sm text-[var(--muted)]">
                    {milestonesOpen ? 'Hide' : 'Edit title, treat, amount & icon'}
                  </span>
                </button>
                {milestonesOpen ? (
                  <div className="space-y-4 border-t border-[var(--border)] px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary text-xs"
                        onClick={() =>
                          setDraftMilestones(
                            resetMilestonesToFractions(
                              draftTargetCents || goal?.targetCents || 0,
                              goalName.trim() || 'Goal',
                              draftMilestones,
                            ),
                          )
                        }
                      >
                        Reset to % of goal
                      </button>
                    </div>
                    <ul className="space-y-4">
                      {draftMilestones.map((m) => (
                        <li key={m.id} className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                          <div className="flex items-center gap-2 text-[var(--green)]">
                            <MilestoneIcon name={m.icon} size="md" />
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                              Checkpoint
                            </p>
                          </div>
                          <div>
                            <label className="label">Title</label>
                            <input
                              className="field"
                              value={m.title}
                              onChange={(e) => updateDraftMilestone(m.id, { title: e.target.value })}
                              placeholder={defaultMilestoneTitle(
                                m.cents,
                                draftTargetCents,
                                goalName.trim() || 'Goal',
                              )}
                            />
                          </div>
                          <div>
                            <label className="label">Amount (USD)</label>
                            <input
                              className="field"
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={fromCents(m.cents).toFixed(2)}
                              onChange={(e) =>
                                updateDraftMilestone(m.id, {
                                  cents: toCents(Number(e.target.value)),
                                })
                              }
                            />
                          </div>
                          <div>
                            <label className="label">Treat (optional)</label>
                            <input
                              className="field"
                              value={m.treat ?? ''}
                              onChange={(e) => updateDraftMilestone(m.id, { treat: e.target.value })}
                              placeholder="Get ice cream"
                            />
                          </div>
                          <div>
                            <label className="label">Icon</label>
                            <div className="flex flex-wrap gap-2">
                              {MILESTONE_ICON_OPTIONS.map((opt) => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  className={`btn px-2.5 py-1.5 ${
                                    m.icon === opt.key ? 'btn-primary' : 'btn-secondary'
                                  }`}
                                  onClick={() =>
                                    updateDraftMilestone(m.id, {
                                      icon: opt.key as MilestoneIconKey,
                                    })
                                  }
                                  aria-label={opt.label}
                                  title={opt.label}
                                >
                                  <MilestoneIcon name={opt.key} size="sm" />
                                </button>
                              ))}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
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
                    setDraftMilestones(milestonesForGoal(goal))
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
        <h3 className="text-lg font-bold">Allowance & subscriptions</h3>
        <p className="text-sm text-[var(--muted)]">
          Weekly allowance amount, auto schedule, and subscriptions live on their own page.
        </p>
        <Link to="/recurring" className="btn btn-secondary inline-flex">
          Open Recurring
        </Link>
      </section>

      <section className="card space-y-4 p-5">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Bell size={18} className="text-[var(--orange)]" aria-hidden />
          Notifications
        </h3>
        <p className="text-sm text-[var(--muted)]">
          Alerts on this device for milestones, allowance, failed subscriptions, Apple Cash mismatch,
          and weekly review. Send test only pings this phone/browser.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--muted)]">
          {isBraveBrowser() ? (
            <>
              <li>Open brave://settings/privacy</li>
              <li>Turn on Use Google services for push messaging</li>
              <li>Site permissions → allow notifications for Fundly</li>
              <li>Tap Enable notifications below</li>
            </>
          ) : isIosDevice() ? (
            <>
              <li>Safari → Share → Add to Home Screen</li>
              <li>Open Fundly from the Home Screen icon (not a Safari tab)</li>
              <li>Tap Enable notifications below and allow</li>
            </>
          ) : (
            <>
              <li>Chrome menu → Install app / Add to Home screen (optional)</li>
              <li>Open Fundly</li>
              <li>Tap Enable notifications below and allow</li>
            </>
          )}
        </ol>

        {notifyState === 'needs_homescreen' ? (
          <p className="text-sm text-[var(--orange)]">
            Add Fundly to your Home Screen first, then open it from the icon.
          </p>
        ) : null}
        {notifyState === 'unsupported' ? (
          <p className="text-sm text-[var(--orange)]">This browser does not support notifications.</p>
        ) : null}
        {notifyState === 'needs_https' ? (
          <p className="text-sm text-[var(--orange)]">
            Notifications need a secure (HTTPS) connection.
          </p>
        ) : null}
        {notifyState === 'denied' ? (
          <p className="text-sm text-[var(--danger)]">
            Notifications are blocked for this site. Enable them in browser or phone Settings, then
            try again.
          </p>
        ) : null}
        {notifyState === 'enabled' ? (
          <p className="text-sm text-[var(--green)]">Notifications enabled on this device.</p>
        ) : null}
        {notifyErr ? <p className="text-sm text-[var(--danger)]">{notifyErr}</p> : null}
        {notifyMsg ? <p className="text-sm text-[var(--green)]">{notifyMsg}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              notifyBusy ||
              notifyState === 'loading' ||
              notifyState === 'unsupported' ||
              notifyState === 'needs_homescreen' ||
              notifyState === 'needs_https'
            }
            onClick={() => {
              setNotifyBusy(true)
              setNotifyErr('')
              setNotifyMsg('')
              void enableNotifications()
                .then((next) => {
                  setNotifyState(next)
                  if (next === 'enabled') {
                    updateSettings({
                      reminders: { ...state.settings.reminders, webPushEnabled: true },
                    })
                    setNotifyMsg('This device will get Fundly alerts.')
                  } else if (next === 'denied') {
                    setNotifyErr('Permission denied.')
                  } else if (next === 'needs_homescreen') {
                    setNotifyErr('Open Fundly from the Home Screen icon, then try again.')
                  } else if (next === 'unsupported') {
                    setNotifyErr('Notifications are not supported here.')
                  }
                })
                .catch((e) =>
                  setNotifyErr(e instanceof Error ? e.message : 'Could not enable notifications'),
                )
                .finally(() => setNotifyBusy(false))
            }}
          >
            {notifyBusy
              ? 'Working…'
              : notifyState === 'enabled'
                ? 'Re-enable'
                : 'Enable notifications'}
          </button>
          {notifyState === 'enabled' ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={notifyBusy}
              onClick={() => {
                setNotifyBusy(true)
                setNotifyErr('')
                setNotifyMsg('')
                const result = sendTestNotification()
                if (result.ok) {
                  setNotifyMsg('Test sent to this device. Check the notification shade.')
                } else {
                  setNotifyErr(result.error)
                }
                setNotifyBusy(false)
              }}
            >
              Send test
            </button>
          ) : null}
          {notifyState === 'enabled' ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={notifyBusy}
              onClick={() => {
                updateSettings({
                  reminders: { ...state.settings.reminders, webPushEnabled: false },
                })
                setNotifyMsg(
                  'Fundly alerts paused in settings. Browser permission may still be on — turn that off in site settings if you want none at all.',
                )
              }}
            >
              Pause in Fundly
            </button>
          ) : null}
        </div>

        {(
          [
            ['notifyMilestone', 'When you reach a milestone'],
            ['notifyLevelUp', 'When you level up'],
            ['notifyStreak', 'Streak wins + “keep your streak” reminders'],
            ['celebrationSound', 'Play a soft sound on unlock / level-up'],
            ['notifyAllowance', 'When allowance is added'],
            ['notifySubscriptionFail', 'When a subscription can’t be paid'],
            ['notifyAppleMismatch', 'When Apple Cash doesn’t match'],
            ['notifyWeeklyReview', 'Weekly review — “See this week!”'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={Boolean(state.settings.reminders[key as keyof ReminderSettings])}
              onChange={(e) =>
                updateSettings({
                  reminders: {
                    ...state.settings.reminders,
                    [key]: e.target.checked,
                  },
                })
              }
            />
            {label}
          </label>
        ))}
        <div>
          <label className="label">Weekly review day</label>
          <p className="mb-2 text-xs text-[var(--muted)]">Weeks run Monday–Sunday.</p>
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
        <p className="text-sm text-[var(--muted)]">
          Weekly allowance amount is set under{' '}
          <Link to="/recurring" className="font-semibold text-[var(--green)] underline-offset-2 hover:underline">
            Recurring
          </Link>
          .
        </p>
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
    </div>
  )
}
