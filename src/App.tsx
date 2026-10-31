import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MoneyProvider, useMoney } from './store/MoneyContext'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { AddIncome } from './pages/AddIncome'
import { Spending } from './pages/Spending'
import { Savings } from './pages/Savings'
import { AppleCash } from './pages/AppleCash'
import { PrintXPage } from './pages/PrintXPage'
import { Transactions } from './pages/Transactions'
import { ImportStatement } from './pages/ImportStatement'
import { Settings } from './pages/Settings'
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
        <Route path="transactions" element={<Transactions />} />
        <Route path="import" element={<ImportStatement />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <MoneyProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </MoneyProvider>
  )
}
