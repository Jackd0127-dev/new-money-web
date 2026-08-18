import {
  Banknote,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Gauge,
  ListChecks,
  PiggyBank,
  Settings,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { clsx } from 'clsx'

import type { ViewKey } from '../types/navigation'
import type { PayPeriod } from '../types/models'
import { Button } from './ui'

const navItems: Array<{
  key: ViewKey
  label: string
  icon: typeof Gauge
}> = [
  { key: 'dashboard', label: 'Dashboard', icon: Gauge },
  { key: 'aiPlan', label: 'AI Plan', icon: Sparkles },
  { key: 'payday', label: 'Payday', icon: Banknote },
  { key: 'pots', label: 'Pots', icon: PiggyBank },
  { key: 'spending', label: 'Spending', icon: WalletCards },
  { key: 'allocatingPayments', label: 'Allocating Payments', icon: ListChecks },
  { key: 'debts', label: 'Debts', icon: CreditCard },
  { key: 'recurring', label: 'Recurring', icon: CalendarClock },
  { key: 'calendar', label: 'Calendar', icon: CalendarClock },
  { key: 'history', label: 'History', icon: Clock3 },
  { key: 'settings', label: 'Settings', icon: Settings },
]

export function AppShell({
  activeView,
  onViewChange,
  selectedPayPeriod,
  children,
}: {
  activeView: ViewKey
  onViewChange: (view: ViewKey) => void
  selectedPayPeriod?: PayPeriod | null
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white px-4 py-5 lg:block">
        <div className="flex items-center gap-3 px-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <CircleDollarSign size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950">New Money</p>
            <p className="text-xs text-slate-500">Private paycheck planner</p>
          </div>
        </div>
        <nav className="mt-8 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onViewChange(item.key)}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition',
                  activeView === item.key
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                )}
              >
                <Icon size={18} />
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-950">Paycheck control panel</h1>
              <p className="hidden text-sm text-slate-500 sm:block">
                {selectedPayPeriod
                  ? `Viewing ${selectedPayPeriod.startDate} to ${selectedPayPeriod.endDate}`
                  : 'Plan pay, track costs, and keep cloud sync running.'}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" onClick={() => onViewChange('spending')}>
                <WalletCards size={18} />
                <span className="hidden sm:inline">Log spend</span>
                <span className="sm:hidden">Spend</span>
              </Button>
              <Button onClick={() => onViewChange('payday')}>New paycheck</Button>
            </div>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {navItems.map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onViewChange(item.key)}
                  className={clsx(
                    'inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                    activeView === item.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  )
}
