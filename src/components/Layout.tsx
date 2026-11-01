import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  PlusCircle,
  ShoppingBag,
  PiggyBank,
  Wallet,
  Store,
  Watch,
  History,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react'
import { CelebrationModal } from './CelebrationModal'
import { FundlyLogo } from './FundlyLogo'
import { useMoney } from '../store/MoneyContext'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/income', label: 'Add Income', icon: PlusCircle },
  { to: '/spending', label: 'Spending', icon: ShoppingBag },
  { to: '/savings', label: 'Savings', icon: PiggyBank },
  { to: '/apple-cash', label: 'Apple Cash', icon: Wallet },
  { to: '/printx', label: 'PrintX', icon: Store },
  { to: '/nfc-bracelets', label: 'NFC Bracelets', icon: Watch },
  { to: '/transactions', label: 'Transactions', icon: History },
  { to: '/import', label: 'Import', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Layout() {
  const { cloud, state } = useMoney()
  const goal = state.settings.activeGoal
  const goalLine = goal
    ? `${goal.name} · ${(goal.targetCents / 100).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      })}`
    : 'Set a goal in Settings'

  return (
    <div className="app-bg min-h-screen">
      <CelebrationModal />
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[var(--border)] p-4 lg:flex">
          <div className="mb-8 px-2">
            <FundlyLogo size={56} useRaster className="mb-3" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Personal
            </p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight">Fundly</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">{goalLine}</p>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-[var(--green)]/15 text-[var(--green)]'
                      : 'text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--text)]'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--card)] hover:text-[var(--text)]"
            onClick={() => void cloud.lockNow()}
          >
            <LogOut size={18} aria-hidden />
            Log out
          </button>
          <p className="mt-2 px-3 text-[10px] leading-snug text-[var(--muted)]">
            Sign-in required once each day.
          </p>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-8 lg:pt-8">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--card)]/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2 py-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold ${
                  isActive ? 'text-[var(--green)]' : 'text-[var(--muted)]'
                }`
              }
            >
              <Icon size={18} />
              <span className="truncate">{label.split(' ')[0]}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className="flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold text-[var(--muted)]"
            onClick={() => void cloud.lockNow()}
          >
            <LogOut size={18} aria-hidden />
            <span>Logout</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
