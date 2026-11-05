import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MoneyProvider, useMoney } from './store/MoneyContext'
import { Layout } from './components/Layout'
import { LockScreen } from './components/LockScreen'
import { fetchAuthStatus } from './lib/fundlyApi'
import { Dashboard } from './pages/Dashboard'
import { AddIncome } from './pages/AddIncome'
import { Spending } from './pages/Spending'
import { Savings } from './pages/Savings'
import { AppleCash } from './pages/AppleCash'
import { PrintXPage } from './pages/PrintXPage'
import { BusinessPage } from './pages/BusinessPage'
import { Transactions } from './pages/Transactions'
import { ImportStatement } from './pages/ImportStatement'
import { Settings } from './pages/Settings'
import { Recurring } from './pages/Recurring'
import { Coach } from './pages/Coach'
import { Onboarding } from './pages/Onboarding'

function Guard({ children }: { children: React.ReactNode }) {
  const { state } = useMoney()
  if (!state.settings.onboardingComplete) return <Navigate to="/onboarding" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route
        element={
          <Guard>
            <Layout />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="income" element={<AddIncome />} />
        <Route path="spending" element={<Spending />} />
        <Route path="savings" element={<Savings />} />
        <Route path="apple-cash" element={<AppleCash />} />
        <Route path="printx" element={<PrintXPage />} />
        <Route path="business/:businessId" element={<BusinessPage />} />
        <Route path="nfc-bracelets" element={<Navigate to="/business/nfc_bracelets" replace />} />
        <Route path="recurring" element={<Recurring />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="import" element={<ImportStatement />} />
        <Route path="coach" element={<Coach />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  const [unlocked, setUnlocked] = useState(false)
  const onUnlocked = useCallback(() => setUnlocked(true), [])

  // If the daily session expires while the tab stays open, force lock again.
  useEffect(() => {
    if (!unlocked) return
    const check = () => {
      void fetchAuthStatus().then((s) => {
        if (!s.unlocked) window.location.reload()
      })
    }
    const id = window.setInterval(check, 60_000)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [unlocked])

  if (!unlocked) {
    return <LockScreen onUnlocked={onUnlocked} />
  }

  return (
    <MoneyProvider cloudEnabled>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
        <AppRoutes />
      </BrowserRouter>
    </MoneyProvider>
  )
}
