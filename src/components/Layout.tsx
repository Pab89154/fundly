import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  PlusCircle,
  ShoppingBag,
  PiggyBank,
  Wallet,
  Briefcase,
  History,
  FileText,
  Settings,
  LogOut,
  MoreHorizontal,
  X,
} from 'lucide-react'
import { CelebrationModal } from './CelebrationModal'
import { FundlyLogo } from './FundlyLogo'
import { TimezonePrompt } from './TimezonePrompt'
import { BusinessLogo } from './BusinessLogo'
import { useMoney } from '../store/MoneyContext'
import { businessHref, type Business } from '../types'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  business?: Business
}

const coreNavBeforeBiz: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/income', label: 'Add Income', icon: PlusCircle },
  { to: '/spending', label: 'Spending', icon: ShoppingBag },
  { to: '/savings', label: 'Savings', icon: PiggyBank },
  { to: '/apple-cash', label: 'Apple Cash', icon: Wallet },
]

const coreNavAfterBiz: NavItem[] = [
  { to: '/transactions', label: 'Transactions', icon: History },
  { to: '/import', label: 'Import', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const mobilePrimaryPaths = new Set(['/', '/income', '/spending', '/savings', '/printx'])

export function Layout() {
  const { cloud, state } = useMoney()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const goal = state.settings.activeGoal
  const goalLine = goal
    ? `${goal.name} · ${(goal.targetCents / 100).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      })}`
    : 'Set a goal in Settings'

  const nav = useMemo(() => {
    const businessNav: NavItem[] = state.settings.businesses.map((b) => ({
      to: businessHref(b.id),
      label: b.name,
      icon: Briefcase,
      business: b,
    }))
    return [...coreNavBeforeBiz, ...businessNav, ...coreNavAfterBiz]
  }, [state.settings.businesses])

  const mobilePrimary = nav.filter((item) => mobilePrimaryPaths.has(item.to))
  const mobileMore = nav.filter((item) => !mobilePrimaryPaths.has(item.to))

  const moreActive = mobileMore.some(
    (item) =>
      location.pathname === item.to ||
      (item.to !== '/' && location.pathname.startsWith(item.to)),
  )

  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])

  return (
    <div className="app-bg flex min-h-dvh w-full flex-col">
      <CelebrationModal />
      <TimezonePrompt />
      <div className="flex min-h-dvh w-full flex-1">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)]/40 p-4 lg:flex">
          <div className="mb-8 px-2">
            <FundlyLogo size={56} useRaster className="mb-3" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Personal
            </p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight">Fundly</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">{goalLine}</p>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {nav.map(({ to, label, icon: Icon, business }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `press-pop flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-[var(--green)]/15 text-[var(--green)]'
                      : 'text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--text)]'
                  }`
                }
              >
                {business ? <BusinessLogo business={business} size={18} /> : <Icon size={18} />}
                {label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="press-pop mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--card)] hover:text-[var(--text)]"
            onClick={() => void cloud.lockNow()}
          >
            <LogOut size={18} aria-hidden />
            Log out
          </button>
          <p className="mt-2 px-3 text-[10px] leading-snug text-[var(--muted)]">
            Sign-in required once each day.
          </p>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+2.75rem)] sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--card)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-stretch gap-0.5 px-1 py-1.5">
          {mobilePrimary.map(({ to, label, icon: Icon, business }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `press-pop flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold ${
                  isActive ? 'text-[var(--green)]' : 'text-[var(--muted)]'
                }`
              }
            >
              {business ? <BusinessLogo business={business} size={18} /> : <Icon size={18} />}
              <span className="truncate">{label.split(' ')[0]}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className={`press-pop flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold ${
              moreOpen || moreActive ? 'text-[var(--green)]' : 'text-[var(--muted)]'
            }`}
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-label="More"
          >
            <MoreHorizontal size={18} aria-hidden />
            <span>More</span>
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-[var(--border)] bg-[var(--card)] pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between px-4">
              <p className="text-sm font-bold">More</p>
              <button
                type="button"
                className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--card-2)] hover:text-[var(--text)]"
                onClick={() => setMoreOpen(false)}
                aria-label="Close more menu"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 px-3 pb-2">
              {mobileMore.map(({ to, label, icon: Icon, business }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `press-pop flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] px-2 py-3 text-center text-xs font-semibold ${
                      isActive ? 'text-[var(--green)]' : 'text-[var(--text)]'
                    }`
                  }
                >
                  {business ? <BusinessLogo business={business} size={20} /> : <Icon size={20} />}
                  <span>{label}</span>
                </NavLink>
              ))}
              <button
                type="button"
                className="press-pop flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] px-2 py-3 text-center text-xs font-semibold text-[var(--text)]"
                onClick={() => void cloud.lockNow()}
              >
                <LogOut size={20} aria-hidden />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
