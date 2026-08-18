import {
  Banknote,
  CalendarClock,
  CreditCard,
  Clock3,
  Gauge,
  ListChecks,
  PiggyBank,
  Settings,
  Sparkles,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import { clsx } from 'clsx'

import type { ViewKey } from '../types/navigation'
import type { PayPeriod } from '../types/models'
import { Button, PageHeader, Pill } from './ui'

const navItems: Array<{
  key: ViewKey
  label: string
  icon: typeof Gauge
}> = [
  { key: 'dashboard', label: 'Overview', icon: Gauge },
  { key: 'payday', label: 'Payday', icon: Banknote },
  { key: 'spending', label: 'Spending', icon: WalletCards },
  { key: 'allocatingPayments', label: 'Cards', icon: ListChecks },
  { key: 'recurring', label: 'Bills', icon: CalendarClock },
  { key: 'pots', label: 'Pots', icon: PiggyBank },
  { key: 'savingsInvestments', label: 'Savings', icon: TrendingUp },
  { key: 'debts', label: 'Debts', icon: CreditCard },
  { key: 'calendar', label: 'Calendar', icon: CalendarClock },
  { key: 'aiPlan', label: 'Jimbo', icon: Sparkles },
  { key: 'settings', label: 'Settings', icon: Settings },
]

export function AppShell({
  activeView,
  onViewChange,
  selectedPayPeriod,
  headerAction,
  children,
}: {
  activeView: ViewKey
  onViewChange: (view: ViewKey) => void
  selectedPayPeriod?: PayPeriod | null
  headerAction?: React.ReactNode
  children: React.ReactNode
}) {
  const activeItem = navItems.find((item) => item.key === activeView) ?? navItems[0]
  const ActiveIcon = activeItem.icon

  return (
    <div className="min-h-screen bg-[var(--color-app-bg)] text-[var(--color-text-primary)]">
      <aside
        aria-label="Application sidebar"
        className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col overflow-hidden border-r border-white/10 bg-[var(--color-emerald)] px-4 py-5 text-white shadow-[14px_0_34px_rgba(7,20,38,0.12)] lg:flex"
      >
        <div className="flex shrink-0 items-center gap-3 px-2">
          <div className="flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-white p-2 text-[var(--color-emerald)] shadow-sm">
            <img src="/favicon.svg" alt="" className="size-full" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Money Manager</p>
            <p className="text-xs font-medium text-white/62">Private paycheck planning</p>
          </div>
        </div>

        <div className="mt-6 shrink-0 rounded-[var(--radius-card)] border border-white/10 bg-white/[0.08] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase text-white/48">Active workspace</p>
              <p className="mt-1 text-sm font-semibold text-white">{activeItem.label}</p>
            </div>
            <span className="flex size-9 items-center justify-center rounded-[var(--radius-control)] border border-white/10 bg-black/12 text-[var(--color-accent)]">
              <ActiveIcon size={17} />
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ShellTinyStat label="Pay window" value={selectedPayPeriod ? 'Live' : 'Setup'} />
            <ShellTinyStat label="Mode" value="Private" />
          </div>
        </div>

        <nav aria-label="Primary navigation" className="mt-5 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeView === item.key

            return (
              <button
                key={item.key}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onViewChange(item.key)}
                className={clsx(
                  'group flex w-full items-center gap-3 rounded-full border px-3 py-2.5 text-left text-sm font-medium transition duration-200',
                  isActive
                    ? 'border-[color:rgba(167,241,91,0.35)] bg-[var(--color-accent)] text-[var(--color-emerald)]'
                    : 'border-transparent text-white/68 hover:border-white/10 hover:bg-white/[0.07] hover:text-white',
                )}
              >
                <span
                  className={clsx(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border transition',
                    isActive
                      ? 'border-[color:rgba(11,61,46,0.18)] bg-white/60 text-[var(--color-emerald)]'
                      : 'border-transparent bg-white/[0.04] text-white/52 group-hover:border-white/10 group-hover:text-white',
                  )}
                >
                  <Icon size={16} />
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="min-w-0 overflow-hidden lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-white/84 px-4 py-3 shadow-sm shadow-slate-200/50 backdrop-blur-xl md:px-8">
          <PageHeader
            title={activeItem.label}
            description={
              selectedPayPeriod
                ? `Viewing ${formatShellDate(selectedPayPeriod.startDate)} to ${formatShellDate(selectedPayPeriod.endDate)}`
                : 'Plan pay, track costs, and keep cloud sync running.'
            }
            eyebrow={
              <>
                <Pill tone="emerald" icon={<Clock3 size={13} />}>Planner live</Pill>
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">Paycheck control panel</span>
              </>
            }
            action={
              <>
              {selectedPayPeriod && (
                <div className="hidden rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm shadow-sm shadow-slate-200/50 md:block">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">Current window</p>
                  <p className="mt-0.5 font-semibold text-slate-950">
                    {formatShellDate(selectedPayPeriod.startDate)} to {formatShellDate(selectedPayPeriod.endDate)}
                  </p>
                </div>
              )}
              <Button className="w-full lg:w-auto" variant="secondary" onClick={() => onViewChange('spending')} aria-label="Log spend">
                <WalletCards size={18} />
                <span className="hidden sm:inline">Log spend</span>
                <span className="sm:hidden">Spend</span>
              </Button>
              {headerAction}
              </>
            }
          />
        </header>
        <main className="mx-auto min-w-0 max-w-[1320px] px-4 pb-28 pt-6 md:px-8 lg:pb-6">{children}</main>
        <nav
          aria-label="Mobile tab navigation"
          className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-[var(--color-border)] bg-white/94 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-14px_34px_rgba(17,24,20,0.12)] backdrop-blur-xl lg:hidden"
        >
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeView === item.key

            return (
              <button
                key={item.key}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onViewChange(item.key)}
                className={clsx(
                  'inline-flex min-h-11 min-w-[4.75rem] shrink-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border px-2 py-1.5 text-[11px] font-semibold transition',
                  isActive
                    ? 'border-[color:rgba(11,61,46,0.18)] bg-[var(--color-accent)] text-[var(--color-emerald)]'
                    : 'border-transparent bg-white/70 text-[var(--color-text-secondary)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface-soft)]',
                )}
              >
                <Icon size={16} aria-hidden="true" />
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

function ShellTinyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-white/10 bg-black/12 px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase text-white/48">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-white">{value}</p>
    </div>
  )
}

function formatShellDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  }).format(new Date(`${value}T00:00:00.000Z`))
}
