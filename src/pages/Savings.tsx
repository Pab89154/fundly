import { useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  CheckCircle2,
  Flame,
  Gift,
  Heart,
  Lock,
  Smartphone,
  Store,
  Trophy,
  Wallet,
  PiggyBank,
  Zap,
} from 'lucide-react'
import { useMoney } from '../store/MoneyContext'
import {
  formatTxUsd,
  formatUsd,
  localDateISO,
  weeksToMilestone,
  type AccountId,
} from '../lib/money'
import {
  milestonesForGoal,
  milestoneProgressToward,
  nextGoalMilestone,
} from '../lib/milestones'
import {
  activityStreakDays,
  LEVELS,
  nextLevelProgress,
  printxPersonalBestWeeklyCents,
} from '../lib/gamification'
import { printxUnsettledCents } from '../lib/balances'
import { NativeSelect } from '../components/NativeSelect'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MilestoneIcon } from '../components/milestoneIcons'
import { PiggyMascot, piggyStageFromProgress } from '../components/PiggyMascot'
import { goalName, goalTargetCents } from '../types'

export function Savings() {
  const {
    balances,
    state,
    addTransfer,
    settlePrintxTransaction,
    settleAllPrintxPending,
    rebalanceToAllocation,
    celebration,
  } = useMoney()
  const [from, setFrom] = useState<AccountId>('extra')
  const [to, setTo] = useState<AccountId>('iphone')
  const [amount, setAmount] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [confirmRebalance, setConfirmRebalance] = useState(false)

  const pendingPrintx = useMemo(
    () =>
      state.transactions
        .filter((tx) => tx.settledAt === null)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [state.transactions],
  )
  const pendingTotal = printxUnsettledCents(state.transactions)

  const historyByAccount = useMemo(() => {
    const map: Record<AccountId, typeof state.transactions> = {
      iphone: [],
      spending: [],
      extra: [],
      charity: [],
    }
    for (const tx of state.transactions) {
      if (tx.allocation) {
        if (tx.allocation.iphone) map.iphone.push(tx)
        if (tx.allocation.spending) map.spending.push(tx)
        if (tx.allocation.extra) map.extra.push(tx)
        if (tx.allocation.charity) map.charity.push(tx)
      }
      if (tx.type === 'spending' || tx.type === 'apple_cash_purchase') map.spending.push(tx)
      if (tx.type === 'transfer') {
        if (tx.fromAccount) map[tx.fromAccount].push(tx)
        if (tx.toAccount) map[tx.toAccount].push(tx)
      }
    }
    return map
  }, [state.transactions])

  const gName = goalName(state.settings)
  const gTarget = goalTargetCents(state.settings)
  const milestoneList = milestonesForGoal(state.settings.activeGoal)
  const nextMs = nextGoalMilestone(balances.iphone, milestoneList)
  const unlockedCount = milestoneList.filter((m) => balances.iphone >= m.cents).length
  const piggy = piggyStageFromProgress(
    gTarget > 0 ? balances.iphone / gTarget : 0,
    unlockedCount,
    milestoneList.length,
  )
  const celebrating = celebration != null
  const tz = state.settings.timezone || 'America/Chicago'
  const dayStreak = activityStreakDays(state.transactions, tz)
  const printxPb = printxPersonalBestWeeklyCents(state.transactions, tz)
  const xpTotal = Math.max(0, Math.trunc(state.settings.xpTotal || 0))
  const levelProg = nextLevelProgress(xpTotal)
  const recentXp = [...(state.settings.xpHistory || [])].slice(-8).reverse()
  const historyById = new Map(
    (state.settings.achievementHistory || []).map((h) => [h.milestoneId, h]),
  )
  const weeklyGoalIn = Math.floor(
    ((state.settings.weeklyAllowanceCents + state.settings.expectedPrintxWeeklyCents) *
      state.settings.allocation.iphone) /
      100,
  )
  const accounts: {
    id: AccountId
    title: string
    blurb: string
    accent: string
    icon: typeof Smartphone
  }[] = [
    {
      id: 'iphone',
      title: state.settings.activeGoal ? `${gName} fund` : 'Goal fund',
      blurb: gTarget > 0 ? `${formatUsd(gTarget)} target` : 'Set a goal in Settings',
      accent: 'text-[var(--green)]',
      icon: Smartphone,
    },
    {
      id: 'spending',
      title: 'Spending Money',
      blurb: 'Available whenever you want',
      accent: 'text-[var(--blue)]',
      icon: Wallet,
    },
    {
      id: 'extra',
      title: 'Extra Savings',
      blurb: 'No fixed target',
      accent: 'text-[var(--orange)]',
      icon: PiggyBank,
    },
    {
      id: 'charity',
      title: 'Charity',
      blurb: 'Give when you are ready',
      accent: 'text-[var(--pink)]',
      icon: Heart,
    },
  ]
  const goalPct = Math.min(
    100,
    gTarget > 0 ? Math.round((balances.iphone / gTarget) * 1000) / 10 : 0,
  )

  const onTransfer = (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    setErr('')
    const res = addTransfer({
      amountUsd: Number(amount),
      from,
      to,
      date: localDateISO(),
      description: 'Transfer between savings',
    })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setMsg('Transfer recorded.')
    setAmount('')
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <PiggyBank size={28} className="text-[var(--green)]" aria-hidden />
          Savings
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Four pots · combined {formatUsd(balances.combined)}. Purchases never drain Goal / Extra /
          Charity — use Transfer below to move money yourself.
        </p>
        <button
          type="button"
          className="btn btn-secondary mt-3"
          onClick={() => {
            setErr('')
            setMsg('')
            setConfirmRebalance(true)
          }}
        >
          Redistribute all pots to {state.settings.allocation.iphone}/
          {state.settings.allocation.spending}/{state.settings.allocation.extra}/
          {state.settings.allocation.charity}
        </button>
        <p className="mt-2 max-w-xl text-xs text-[var(--muted)]">
          Redistribute reshuffles your total across every pot to match Settings %. It is not a
          purchase — confirm before using.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {accounts.map((a) => {
          const bal = balances[a.id]
          const pct =
            a.id === 'iphone'
              ? goalPct
              : balances.combined > 0
                ? Math.round((bal / balances.combined) * 1000) / 10
                : 0
          const Icon = a.icon
          return (
            <div key={a.id} className="card p-5">
              <div className="flex items-center gap-2">
                <Icon size={18} className={a.accent} aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {a.title}
                </p>
              </div>
              <p className={`mt-2 text-3xl font-extrabold ${a.accent}`}>{formatUsd(bal)}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{a.blurb}</p>
              <div className="progress-track mt-4">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                {historyByAccount[a.id].length} related rows (includes share of split income)
              </p>
            </div>
          )
        })}
      </div>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Store size={18} className="text-[var(--green)]" aria-hidden />
              Waiting to settle
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Prefer PrintX → Sync: Mark settled on printx.pw/money and Fundly imports it. Leftover
              rows below are older imports you can clear here.
            </p>
          </div>
          {pendingPrintx.length > 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setErr('')
                const res = settleAllPrintxPending()
                if (!res.ok) {
                  setErr(res.error)
                  return
                }
                setMsg(`Settled ${res.settled} PrintX payout(s) into your pots.`)
              }}
            >
              Mark all settled · {formatUsd(pendingTotal)}
            </button>
          ) : null}
        </div>
        {pendingPrintx.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Nothing waiting. New settlements land via PrintX → Sync.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {pendingPrintx.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{t.description || 'PrintX payout'}</p>
                  <p className="text-[var(--muted)]">
                    {t.date} · not in your pots yet
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-extrabold text-[var(--orange)]">{formatTxUsd(t)}</p>
                  <button
                    type="button"
                    className="btn btn-secondary px-3 py-1 text-xs"
                    onClick={() => {
                      setErr('')
                      const res = settlePrintxTransaction(t.id)
                      if (!res.ok) {
                        setErr(res.error)
                        return
                      }
                      setMsg('PrintX payout settled into your pots.')
                    }}
                  >
                    Mark settled
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Milestone roadmap</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Checkpoints on the way to {gName}. Edit titles, amounts, and icons in Settings.
            </p>
          </div>
          {milestoneList.length > 0 ? (
            <PiggyMascot
              expression={piggy.expression}
              accessories={piggy.accessories}
              celebrating={celebrating}
              size={64}
            />
          ) : null}
        </div>
        {milestoneList.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Create a goal in Settings to unlock milestones.
          </p>
        ) : (
          <ol className="relative mt-6 space-y-0 border-l-2 border-[var(--green)]/35 pl-5">
            {milestoneList.map((m) => {
              const hit = balances.iphone >= m.cents
              const isNext = nextMs?.id === m.id
              const treat = m.treat
              const toGo = Math.max(0, m.cents - balances.iphone)
              const pct = isNext
                ? Math.round(milestoneProgressToward(balances.iphone, m, milestoneList) * 1000) / 10
                : hit
                  ? 100
                  : 0
              return (
                <li key={m.id} className="relative pb-6 last:pb-0">
                  <span
                    className={`absolute -left-[1.6rem] top-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                      hit
                        ? 'border-[var(--green)] bg-[var(--green)]/20 text-[var(--green)]'
                        : isNext
                          ? 'milestone-next-glow border-[var(--green)] bg-[var(--card)] text-[var(--green)]'
                          : 'border-[var(--border)] bg-[var(--card-2)] text-[var(--muted)]'
                    }`}
                  >
                    {hit ? (
                      <CheckCircle2 size={14} aria-hidden />
                    ) : (
                      <MilestoneIcon
                        name={m.icon}
                        size="sm"
                        className={isNext ? 'text-[var(--green)]' : 'text-[var(--muted)]'}
                      />
                    )}
                  </span>
                  <div
                    className={`rounded-xl border p-4 ${
                      isNext
                        ? 'border-[var(--green)]/60 bg-[var(--green)]/10 shadow-[0_0_20px_rgba(48,209,88,0.18)]'
                        : hit
                          ? 'border-[var(--green)]/25 bg-[var(--green)]/5'
                          : 'border-[var(--border)] bg-[var(--card-2)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <MilestoneIcon
                          name={m.icon}
                          size="md"
                          className={
                            hit
                              ? 'text-[var(--green)]'
                              : isNext
                                ? 'text-[var(--green)]'
                                : 'text-[var(--muted)]'
                          }
                        />
                        <div>
                          <p className="font-semibold">{m.title}</p>
                          <p className="mt-0.5 text-sm text-[var(--muted)]">{formatUsd(m.cents)}</p>
                        </div>
                      </div>
                      {isNext ? (
                        <span className="rounded-full bg-[var(--green)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--green)]">
                          Next
                        </span>
                      ) : hit ? (
                        <span className="text-xs font-semibold text-[var(--green)]">Unlocked</span>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">Upcoming</span>
                      )}
                    </div>
                    {treat ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--orange)]">
                        <Gift size={12} aria-hidden />
                        {treat}
                      </p>
                    ) : null}
                    {isNext ? (
                      <>
                        <p className="mt-3 text-sm text-[var(--muted)]">
                          {formatUsd(toGo)} to go
                          {(() => {
                            const w = weeksToMilestone(toGo, weeklyGoalIn)
                            return w != null ? ` · ~${w} wk` : ''
                          })()}
                        </p>
                        <div className="progress-track mt-2 overflow-hidden">
                          <div
                            className="progress-fill milestone-progress-anim"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {milestoneList.length > 0 ? (
        <section className="card space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Trophy size={18} className="text-[var(--orange)]" aria-hidden />
              Achievement gallery
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Badges unlock with your Goal pot — history stays even if you edit amounts.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {milestoneList.map((m) => {
              const rec = historyById.get(m.id)
              const unlocked = Boolean(rec) || balances.iphone >= m.cents
              return (
                <li
                  key={m.id}
                  className={`rounded-xl border p-3 ${
                    unlocked
                      ? 'border-[var(--green)]/35 bg-[var(--green)]/10'
                      : 'border-[var(--border)] bg-[var(--card-2)] opacity-60 grayscale'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[var(--green)]">
                    <MilestoneIcon name={m.icon} size="md" />
                    {unlocked ? <CheckCircle2 size={14} /> : <Lock size={14} className="text-[var(--muted)]" />}
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-snug">
                    {rec?.titleAtUnlock || m.title}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {formatUsd(rec?.centsAtUnlock ?? m.cents)}
                    {rec?.unlockedAt && rec.unlockedAt !== new Date(0).toISOString()
                      ? ` · ${rec.unlockedAt.slice(0, 10)}`
                      : unlocked
                        ? ' · unlocked'
                        : ' · locked'}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className="card space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Zap size={18} className="text-[var(--green)]" aria-hidden />
              XP &amp; Level
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Earn XP from real income, purchases, milestones, and habits — never deducted.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Level {levelProg.current.level}
            </p>
            <p className="text-xl font-extrabold text-[var(--green)]">{levelProg.current.name}</p>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-end justify-between gap-2 text-sm">
            <p className="font-semibold">{xpTotal.toLocaleString()} XP</p>
            <p className="text-[var(--muted)]">
              {levelProg.next
                ? `${levelProg.xpToNext.toLocaleString()} to ${levelProg.next.name}`
                : 'Max level'}
            </p>
          </div>
          <div className="progress-track mt-2">
            <div
              className="progress-fill milestone-progress-anim"
              style={{ width: `${Math.round(levelProg.ratio * 1000) / 10}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-3 text-center">
            <Flame size={16} className="mx-auto text-[var(--orange)]" aria-hidden />
            <p className="mt-2 text-xl font-extrabold">{dayStreak}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Day streak
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-3 text-center">
            <Store size={16} className="mx-auto text-[var(--blue)]" aria-hidden />
            <p className="mt-2 text-xl font-extrabold">{formatUsd(printxPb)}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              PrintX best week
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-3 text-center">
            <Trophy size={16} className="mx-auto text-[var(--green)]" aria-hidden />
            <p className="mt-2 text-xl font-extrabold">{levelProg.current.level}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Level
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Level badges
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {LEVELS.map((L) => {
              const unlocked = xpTotal >= L.minXp
              return (
                <li
                  key={L.level}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                    unlocked
                      ? 'border-[var(--green)]/40 bg-[var(--green)]/10 text-[var(--green)]'
                      : 'border-[var(--border)] bg-[var(--card-2)] text-[var(--muted)] opacity-60 grayscale'
                  }`}
                >
                  {L.name}
                </li>
              )
            })}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Recent XP
          </p>
          {recentXp.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Log genuine income or a purchase to start earning.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--border)]">
              {recentXp.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{e.label}</p>
                    <p className="text-xs text-[var(--muted)]">{e.at.slice(0, 10)}</p>
                  </div>
                  <p className="shrink-0 font-extrabold text-[var(--green)]">+{e.amount}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <form className="card space-y-4 p-5" onSubmit={onTransfer}>
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <ArrowRightLeft size={18} aria-hidden />
          Transfer between pots
        </h3>
        <p className="text-sm text-[var(--muted)]">
          Move money from the pot you select to another — only those two balances change.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">From</label>
            <NativeSelect
              aria-label="From"
              value={from}
              onChange={(v) => setFrom(v as AccountId)}
              options={[
                { value: 'iphone', label: 'Goal' },
                { value: 'spending', label: 'Spending' },
                { value: 'extra', label: 'Extra' },
                { value: 'charity', label: 'Charity' },
              ]}
            />
          </div>
          <div>
            <label className="label">To</label>
            <NativeSelect
              aria-label="To"
              value={to}
              onChange={(v) => setTo(v as AccountId)}
              options={[
                { value: 'iphone', label: 'Goal' },
                { value: 'spending', label: 'Spending' },
                { value: 'extra', label: 'Extra' },
                { value: 'charity', label: 'Charity' },
              ]}
            />
          </div>
          <div>
            <label className="label">Amount</label>
            <input
              className="field"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
        </div>
        {err ? <p className="text-sm text-[var(--danger)]">{err}</p> : null}
        {msg ? <p className="text-sm text-[var(--green)]">{msg}</p> : null}
        <button type="submit" className="btn btn-secondary">
          Record transfer
        </button>
      </form>

      <ConfirmDialog
        open={confirmRebalance}
        title="Redistribute all pots?"
        message={`This moves money between Goal, Spending, Extra, and Charity so totals match your ${state.settings.allocation.iphone}/${state.settings.allocation.spending}/${state.settings.allocation.extra}/${state.settings.allocation.charity} split. Combined stays the same. Purchases do not do this.`}
        confirmLabel="Redistribute"
        cancelLabel="Cancel"
        onCancel={() => setConfirmRebalance(false)}
        onConfirm={() => {
          setConfirmRebalance(false)
          setErr('')
          const res = rebalanceToAllocation()
          if (!res.ok) {
            setErr(res.error)
            return
          }
          const a = state.settings.allocation
          setMsg(`Pots redistributed to ${a.iphone}/${a.spending}/${a.extra}/${a.charity}.`)
        }}
      />
    </div>
  )
}
