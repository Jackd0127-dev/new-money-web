import { useState } from 'react'
import { AlertTriangle, CalendarDays } from 'lucide-react'

import {
  addIsoDays,
  formatPence,
  getAppTodayIso,
  getRecurringPaymentOccurrences,
} from '../domain/money'
import type { PlannerSnapshot } from '../hooks/usePlannerData'
import type { PayPeriod } from '../types/models'
import { MoneyMetric, Panel, ProgressRail, SelectInput } from './ui'

const recurringRangeOptions = [14, 30, 60, 90, 365] as const
type RecurringRangeDays = (typeof recurringRangeOptions)[number]

export function RecurringCalendar({
  snapshot,
  payPeriod,
  horizonDays = 60,
}: {
  snapshot: PlannerSnapshot
  payPeriod?: PayPeriod | null
  horizonDays?: number
}) {
  const [selectedRangeDays, setSelectedRangeDays] = useState<RecurringRangeDays>(
    isRecurringRangeDays(horizonDays) ? horizonDays : 30,
  )
  const today = getAppTodayIso(snapshot.settings)
  const viewedPeriod = payPeriod ?? null
  const upcomingEndDate = addIsoDays(today, selectedRangeDays)
  const paidRecurringOccurrenceKeys = new Set(
    snapshot.transactions
      .filter((transaction) => transaction.recurringPaymentId && transaction.type === 'spending')
      .map((transaction) => `${transaction.recurringPaymentId}:${transaction.date}`),
  )
  const upcomingOccurrences = getRecurringPaymentOccurrences(
    snapshot.recurringPayments,
    today,
    upcomingEndDate,
  )
  const dueBeforeNextPayday = viewedPeriod
    ? upcomingOccurrences.filter(
        (occurrence) =>
          occurrence.dueDate >= viewedPeriod.startDate &&
          occurrence.dueDate <= viewedPeriod.endDate &&
          !paidRecurringOccurrenceKeys.has(`${occurrence.payment.id}:${occurrence.dueDate}`),
      )
    : []
  const dueBeforeNextPaydayPence = dueBeforeNextPayday.reduce(
    (total, occurrence) => total + occurrence.amountPence,
    0,
  )
  const upcomingTotalPence = upcomingOccurrences.reduce((total, occurrence) => total + occurrence.amountPence, 0)
  const paydayPressurePercent = upcomingTotalPence > 0
    ? Math.round((dueBeforeNextPaydayPence / upcomingTotalPence) * 100)
    : 0

  return (
    <Panel
      title="Recurring calendar"
      description={`Next ${selectedRangeDays} days of bills, subscriptions, insurance, debt payments, and investment commitments.`}
      action={
        <div className="flex items-center gap-2">
          <CalendarDays className="hidden text-slate-500 sm:block" size={20} />
          <label className="sr-only" htmlFor="recurring-calendar-range">Recurring calendar range</label>
          <SelectInput
            id="recurring-calendar-range"
            aria-label="Recurring calendar range"
            value={selectedRangeDays}
            onChange={(event) => setSelectedRangeDays(Number(event.target.value) as RecurringRangeDays)}
          >
            {recurringRangeOptions.map((days) => (
              <option key={days} value={days}>
                Next {days} days
              </option>
            ))}
          </SelectInput>
        </div>
      }
      accent="cyan"
      density="compact"
    >
      <div className="space-y-4">
        <div className="space-y-3 xl:max-h-[620px] xl:overflow-y-auto xl:pr-1">
          <MoneyMetric
            label="Before next payday"
            value={formatPence(dueBeforeNextPaydayPence)}
            tone={dueBeforeNextPaydayPence > 0 ? 'warning' : 'neutral'}
            breakdown={{
              formula: viewedPeriod
                ? `Before next payday = active recurring occurrences due from ${viewedPeriod.startDate} to ${viewedPeriod.endDate}.`
                : 'Select a paycheck plan to compare recurring payments with a pay period.',
              lines:
                dueBeforeNextPayday.length > 0
                  ? [
                      ...dueBeforeNextPayday.map((occurrence) => ({
                        label: occurrence.payment.name,
                        value: formatPence(occurrence.amountPence),
                        detail: `${occurrence.dueDate} · ${occurrence.payment.frequency}`,
                        tone: 'add' as const,
                      })),
                      {
                        label: 'Before next payday',
                        value: formatPence(dueBeforeNextPaydayPence),
                        tone: 'result' as const,
                      },
                    ]
                  : [{ label: 'No recurring due before payday', value: formatPence(0), tone: 'result' }],
              note: viewedPeriod ? `Due by ${viewedPeriod.endDate}.` : 'Select a pay period to unlock period warnings.',
            }}
          />

          <div className="rounded-2xl border border-cyan-200/80 bg-cyan-50 p-4 shadow-[0_14px_35px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Payday pressure</p>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  {formatPence(dueBeforeNextPaydayPence)} before payday out of {formatPence(upcomingTotalPence)} in this range.
                </p>
              </div>
              <span className="shrink-0 rounded-xl border border-cyan-200 bg-white/90 px-3 py-2 text-sm font-semibold text-cyan-900 shadow-sm shadow-cyan-100/70">
                {paydayPressurePercent}%
              </span>
            </div>
            <ProgressRail percent={paydayPressurePercent} className="mt-3" trackClassName="bg-cyan-100/80 shadow-cyan-200/50" />
          </div>

          {dueBeforeNextPaydayPence > 0 && (
            <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 shadow-sm shadow-amber-100/70">
              <AlertTriangle className="mt-0.5 shrink-0" size={18} />
              <p>Reserve these payments before treating pot balances as spendable.</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {upcomingOccurrences.length > 0 ? (
            upcomingOccurrences.map((occurrence) => {
              const pot = snapshot.pots.find((candidate) => candidate.id === occurrence.payment.potId)
              const isBeforeNextPayday = viewedPeriod
                ? occurrence.dueDate >= viewedPeriod.startDate && occurrence.dueDate <= viewedPeriod.endDate
                : false
              const isPaid = paidRecurringOccurrenceKeys.has(`${occurrence.payment.id}:${occurrence.dueDate}`)

              return (
                <div
                  key={`${occurrence.payment.id}-${occurrence.dueDate}`}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-[0_16px_38px_rgba(15,23,42,0.08)] sm:flex sm:items-center sm:justify-between sm:gap-3"
                >
                  <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-cyan-400/80" aria-hidden="true" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">{occurrence.payment.name}</p>
                      {isBeforeNextPayday && (
                        <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                          Before payday
                        </span>
                      )}
                      {isPaid && (
                        <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                          Paid from pot
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatCalendarDate(occurrence.dueDate)} · {occurrence.payment.frequency} ·{' '}
                      {occurrence.payment.potId ? pot?.name ?? 'Archived pot' : 'No pot linked'}
                    </p>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-950 sm:mt-0">{formatPence(occurrence.amountPence)}</p>
                </div>
              )
            })
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200/90 bg-slate-50/80 p-4 text-sm text-slate-500">
              No active recurring payments are due in this window.
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}

function isRecurringRangeDays(value: number): value is RecurringRangeDays {
  return recurringRangeOptions.includes(value as RecurringRangeDays)
}

function formatCalendarDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${value}T00:00:00.000Z`))
}
