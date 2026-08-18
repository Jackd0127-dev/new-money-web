import { useState, type ReactNode } from 'react'

import { AppAssistant } from './components/AppAssistant'
import { AppShell } from './components/AppShell'
import { AiPlanPage } from './pages/AiPlanPage'
import { AllocatingPaymentsPage } from './pages/AllocatingPaymentsPage'
import { CalendarPage } from './pages/CalendarPage'
import { DashboardPage } from './pages/DashboardPage'
import { DebtsPage } from './pages/DebtsPage'
import { HistoryPage } from './pages/HistoryPage'
import { PaydayWizardPage } from './pages/PaydayWizardPage'
import { PotsPage } from './pages/PotsPage'
import { RecurringPage } from './pages/RecurringPage'
import { SettingsPage } from './pages/SettingsPage'
import { SpendingPage } from './pages/SpendingPage'
import { findPayPeriodForDate, toIsoDate } from './domain/money'
import { useCloudSync } from './hooks/useCloudSync'
import { useFirebaseAuth } from './hooks/useFirebaseAuth'
import { usePlannerData } from './hooks/usePlannerData'
import type { ViewKey } from './types/navigation'

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [selectedPayPeriodId, setSelectedPayPeriodId] = useState<string | null>(null)
  const { snapshot, isLoading, error, actions } = usePlannerData()
  const auth = useFirebaseAuth()
  const sync = useCloudSync({
    user: auth.user,
    snapshot,
    refresh: actions.refresh,
  })
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-950">Loading local planner</p>
          <p className="mt-1 text-sm text-slate-500">Opening your private IndexedDB store.</p>
        </div>
      </div>
    )
  }

  if (error || !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-red-700">Unable to load planner</p>
          <p className="mt-2 text-sm text-slate-600">{error ?? 'Unknown storage error'}</p>
        </div>
      </div>
    )
  }

  const today = toIsoDate(new Date())
  const selectedPayPeriod =
    (selectedPayPeriodId
      ? snapshot.payPeriods.find((period) => period.id === selectedPayPeriodId)
      : null) ??
    findPayPeriodForDate(snapshot.payPeriods, today)

  const pages: Record<ViewKey, ReactNode> = {
    dashboard: (
      <DashboardPage
        snapshot={snapshot}
        selectedPayPeriod={selectedPayPeriod}
        onPayPeriodChange={setSelectedPayPeriodId}
        onViewChange={setActiveView}
      />
    ),
    aiPlan: <AiPlanPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} user={auth.user} />,
    payday: <PaydayWizardPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />,
    pots: <PotsPage snapshot={snapshot} actions={actions} />,
    spending: <SpendingPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />,
    allocatingPayments: (
      <AllocatingPaymentsPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />
    ),
    debts: <DebtsPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />,
    recurring: <RecurringPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />,
    calendar: <CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />,
    history: <HistoryPage snapshot={snapshot} actions={actions} />,
    settings: <SettingsPage snapshot={snapshot} actions={actions} auth={auth} sync={sync} />,
  }

  return (
    <>
      <AppShell activeView={activeView} onViewChange={setActiveView} selectedPayPeriod={selectedPayPeriod}>
        {pages[activeView]}
      </AppShell>
      <AppAssistant
        snapshot={snapshot}
        activeView={activeView}
        selectedPayPeriod={selectedPayPeriod}
        user={auth.user}
      />
    </>
  )
}

export default App
