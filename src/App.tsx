import { useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'

import { AppAssistant } from './components/AppAssistant'
import { AuthScreen } from './components/AuthScreen'
import { AppShell } from './components/AppShell'
import { Button } from './components/ui'
import { AiPlanPage } from './pages/AiPlanPage'
import { AllocatingPaymentsPage } from './pages/AllocatingPaymentsPage'
import { CalendarPage } from './pages/CalendarPage'
import { DashboardPage } from './pages/DashboardPage'
import { DebtsPage } from './pages/DebtsPage'
import { HistoryPage } from './pages/HistoryPage'
import { PaydayWizardPage } from './pages/PaydayWizardPage'
import { PotsPage } from './pages/PotsPage'
import { RecurringPage } from './pages/RecurringPage'
import { SavingsInvestmentsPage } from './pages/SavingsInvestmentsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SpendingPage } from './pages/SpendingPage'
import { findPayPeriodForDate, getAppTodayIso } from './domain/money'
import { useCloudSync } from './hooks/useCloudSync'
import { useFirebaseAuth } from './hooks/useFirebaseAuth'
import { usePlannerData } from './hooks/usePlannerData'
import type { ViewKey } from './types/navigation'

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [selectedPayPeriodId, setSelectedPayPeriodId] = useState<string | null>(null)
  const [isCreatePotModalOpen, setIsCreatePotModalOpen] = useState(false)
  const [isCreateRecurringOpen, setIsCreateRecurringOpen] = useState(false)
  const { snapshot, isLoading, error, actions } = usePlannerData()
  const auth = useFirebaseAuth()
  const cloudSync = useCloudSync({
    user: auth.user,
    snapshot,
    refresh: actions.refresh,
  })

  if (auth.isLoading || !auth.isConfigured || !auth.user) {
    return <AuthScreen auth={auth} />
  }

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

  const today = getAppTodayIso(snapshot.settings)
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
        actions={actions}
        onPayPeriodChange={setSelectedPayPeriodId}
        onViewChange={setActiveView}
      />
    ),
    aiPlan: <AiPlanPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} user={auth.user} actions={actions} />,
    payday: <PaydayWizardPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />,
    pots: (
      <PotsPage
        snapshot={snapshot}
        actions={actions}
        selectedPayPeriod={selectedPayPeriod}
        isCreateModalOpen={isCreatePotModalOpen}
        onCreateModalOpenChange={setIsCreatePotModalOpen}
      />
    ),
    savingsInvestments: (
      <SavingsInvestmentsPage
        snapshot={snapshot}
        actions={actions}
        selectedPayPeriod={selectedPayPeriod}
      />
    ),
    spending: <SpendingPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />,
    allocatingPayments: (
      <AllocatingPaymentsPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />
    ),
    debts: <DebtsPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />,
    recurring: (
      <RecurringPage
        snapshot={snapshot}
        actions={actions}
        selectedPayPeriod={selectedPayPeriod}
        isCreateOpen={isCreateRecurringOpen}
        onCreateOpenChange={setIsCreateRecurringOpen}
      />
    ),
    calendar: <CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />,
    history: <HistoryPage snapshot={snapshot} actions={actions} />,
    settings: <SettingsPage snapshot={snapshot} actions={actions} auth={auth} cloudSync={cloudSync} />,
  }

  return (
    <>
      <AppShell
        activeView={activeView}
        onViewChange={(view) => {
          setActiveView(view)
          if (view !== 'pots') {
            setIsCreatePotModalOpen(false)
          }
          if (view !== 'recurring') {
            setIsCreateRecurringOpen(false)
          }
        }}
        selectedPayPeriod={selectedPayPeriod}
        headerAction={
          activeView === 'pots' ? (
            <Button onClick={() => setIsCreatePotModalOpen(true)}>
              <Plus size={18} />
              Create pot
            </Button>
          ) : activeView === 'recurring' ? (
            <Button onClick={() => setIsCreateRecurringOpen(true)}>
              <Plus size={18} />
              New payment
            </Button>
          ) : undefined
        }
      >
        {pages[activeView]}
      </AppShell>
      <AppAssistant
        snapshot={snapshot}
        activeView={activeView}
        selectedPayPeriod={selectedPayPeriod}
        actions={actions}
        user={auth.user}
      />
    </>
  )
}

export default App
