import type { ReactNode } from 'react'
import { CalendarDays, CircleDollarSign, Trash2, WalletCards } from 'lucide-react'

import { formatPence } from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import { Button, CalculationDetails, Panel, ProgressRail, type CalculationBreakdown } from '../components/ui'

export function HistoryPage({
  snapshot,
  actions,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
}) {
  return <PayPeriodHistoryPanel snapshot={snapshot} actions={actions} />
}

export function PayPeriodHistoryPanel({
  snapshot,
  actions,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
}) {
  const totalIncomePence = snapshot.payPeriods.reduce((total, period) => total + period.incomePence, 0)
  const totalAllocatedPence = snapshot.payPeriods.reduce((total, period) => {
    const allocated = snapshot.potAllocations
      .filter((allocation) => allocation.payPeriodId === period.id)
      .reduce((allocationTotal, allocation) => allocationTotal + allocation.amountPence, 0)

    return total + allocated
  }, 0)

  async function deletePeriod(periodId: string, payday: string) {
    if (window.confirm(`Delete paycheck plan for ${payday}?`)) {
      await actions.deletePayPeriod(periodId)
    }
  }

  return (
    <Panel title="Pay period history" description="Previous paycheck plans and their allocations." accent="blue" className="min-w-0">
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <HistoryStat icon={<CalendarDays size={17} />} label="Paychecks" value={String(snapshot.payPeriods.length)} tone="blue" />
        <HistoryStat icon={<CircleDollarSign size={17} />} label="Total income" value={formatPence(totalIncomePence)} tone="emerald" />
        <HistoryStat icon={<WalletCards size={17} />} label="Total allocated" value={formatPence(totalAllocatedPence)} tone="violet" />
      </div>

      <div className="w-full max-w-full min-w-0 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.065)]">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-slate-50/90 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Payday</th>
              <th className="px-4 py-3 font-semibold">Period</th>
              <th className="px-4 py-3 font-semibold">Income</th>
              <th className="px-4 py-3 font-semibold">Allocated</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80 bg-white/95">
            {snapshot.payPeriods.length > 0 ? (
              snapshot.payPeriods.map((period) => {
                const allocated = snapshot.potAllocations
                  .filter((allocation) => allocation.payPeriodId === period.id)
                  .reduce((total, allocation) => total + allocation.amountPence, 0)
                const rowAllocationPercent = period.incomePence > 0 ? Math.round((allocated / period.incomePence) * 100) : 0

                return (
                  <tr key={period.id} className="transition hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-950">{period.payday}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {period.startDate} to {period.endDate}
                    </td>
                    <td className="px-4 py-3 text-slate-950">{formatPence(period.incomePence)}</td>
                    <td className="px-4 py-3 text-slate-950">
                      <details>
                        <summary className="cursor-pointer list-none font-semibold text-slate-950">
                          {formatPence(allocated)}
                          <span className="ml-2 text-xs font-semibold text-slate-500">{rowAllocationPercent}%</span>
                        </summary>
                        <ProgressRail
                          percent={rowAllocationPercent}
                          className="mt-2"
                          trackClassName="h-1.5 bg-slate-100 shadow-slate-200/80"
                        />
                        <CalculationDetails
                          breakdown={getHistoryAllocationBreakdown(
                            snapshot.potAllocations.filter((allocation) => allocation.payPeriodId === period.id),
                            snapshot,
                          )}
                        />
                      </details>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-xl border border-slate-200/80 bg-white/80 px-2 py-1 text-xs font-semibold capitalize text-slate-600 shadow-sm shadow-slate-200/50">
                        {period.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="danger"
                        onClick={() => void deletePeriod(period.id, period.payday)}
                        aria-label={`Delete paycheck plan for ${period.payday}`}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No paycheck history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function HistoryStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  tone: 'blue' | 'emerald' | 'violet'
}) {
  const toneClassName =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'violet'
        ? 'border-violet-200 bg-violet-50 text-violet-700'
        : 'border-blue-200 bg-blue-50 text-blue-700'

  return (
    <div className={`min-w-0 rounded-2xl border p-4 shadow-[0_14px_35px_rgba(15,23,42,0.05)] ${toneClassName}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">{value}</p>
    </div>
  )
}

function getHistoryAllocationBreakdown(
  allocations: PlannerSnapshot['potAllocations'],
  snapshot: PlannerSnapshot,
): CalculationBreakdown {
  const allocatedPence = allocations.reduce((total, allocation) => total + allocation.amountPence, 0)

  return {
    formula: 'Allocated = recurring reserves plus any manual allocations saved on that paycheck plan.',
    lines:
      allocations.length > 0
        ? [
            ...allocations.map((allocation) => {
              const pot = snapshot.pots.find((candidate) => candidate.id === allocation.potId)
              const payment = allocation.recurringPaymentId
                ? snapshot.recurringPayments.find((candidate) => candidate.id === allocation.recurringPaymentId)
                : null

              return {
                label: payment?.name ?? pot?.name ?? 'Deleted pot',
                value: formatPence(allocation.amountPence),
                detail: allocation.source === 'recurring' ? 'Recurring reserve' : 'Manual allocation',
                tone: 'add' as const,
              }
            }),
            {
              label: 'Allocated',
              value: formatPence(allocatedPence),
              tone: 'result' as const,
            },
          ]
        : [{ label: 'No allocations', value: formatPence(0), tone: 'result' }],
  }
}
