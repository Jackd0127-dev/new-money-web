import { useMemo, useState } from 'react'
import {
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Repeat2,
  ShieldCheck,
  WalletCards,
} from 'lucide-react'

import {
  formatPence,
  getDebtDueAmountPence,
  getRecurringPaymentOccurrences,
  toIsoDate,
} from '../domain/money'
import type { PlannerSnapshot } from '../hooks/usePlannerData'
import type { PayPeriod } from '../types/models'
import { Button, MoneyMetric, Panel } from '../components/ui'

type CalendarEventType =
  | 'payday'
  | 'recurring'
  | 'subscription'
  | 'insurance'
  | 'saved'
  | 'card'
  | 'debt'
  | 'spending'

interface CalendarEvent {
  id: string
  date: string
  title: string
  amountPence: number
  type: CalendarEventType
}

const eventStyles: Record<CalendarEventType, { label: string; className: string; icon: typeof CalendarDays }> = {
  payday: {
    label: 'Pay due',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: Banknote,
  },
  recurring: {
    label: 'Recurring due',
    className: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    icon: Repeat2,
  },
  subscription: {
    label: 'Subscription due',
    className: 'border-violet-200 bg-violet-50 text-violet-800',
    icon: Repeat2,
  },
  insurance: {
    label: 'Insurance due',
    className: 'border-sky-200 bg-sky-50 text-sky-800',
    icon: ShieldCheck,
  },
  saved: {
    label: 'Saved payment',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: CalendarDays,
  },
  card: {
    label: 'Card due',
    className: 'border-blue-200 bg-blue-50 text-blue-800',
    icon: CreditCard,
  },
  debt: {
    label: 'Debt due',
    className: 'border-red-200 bg-red-50 text-red-800',
    icon: CreditCard,
  },
  spending: {
    label: 'Manual spend',
    className: 'border-rose-200 bg-rose-50 text-rose-800',
    icon: WalletCards,
  },
}

export function CalendarPage({
  snapshot,
  selectedPayPeriod,
}: {
  snapshot: PlannerSnapshot
  selectedPayPeriod?: PayPeriod | null
}) {
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(selectedPayPeriod ? parseIsoDate(selectedPayPeriod.startDate) : new Date()),
  )
  const monthStart = toIsoDate(visibleMonth)
  const monthEnd = toIsoDate(new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 0)))
  const events = useMemo(
    () => getCalendarEvents(snapshot, monthStart, monthEnd),
    [monthEnd, monthStart, snapshot],
  )
  const eventsByDate = useMemo(() => groupEventsByDate(events), [events])
  const monthCells = useMemo(() => getMonthCells(visibleMonth), [visibleMonth])
  const duePence = events
    .filter((event) => event.type !== 'payday')
    .reduce((total, event) => total + Math.max(0, event.amountPence), 0)
  const payPence = events
    .filter((event) => event.type === 'payday')
    .reduce((total, event) => total + event.amountPence, 0)

  function changeMonth(delta: number) {
    setVisibleMonth(
      new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + delta, 1)),
    )
  }

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-slate-950 text-white">
                <CalendarDays size={20} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">{formatMonth(visibleMonth)}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedPayPeriod
                    ? `Showing selected period ${selectedPayPeriod.startDate} to ${selectedPayPeriod.endDate}.`
                    : 'Pay, due payments, cards, insurance, and spending signals.'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => changeMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </Button>
            <Button variant="secondary" onClick={() => setVisibleMonth(startOfMonth(new Date()))}>
              Today
            </Button>
            <Button variant="secondary" onClick={() => changeMonth(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        <MoneyMetric
          label="Pay shown"
          value={formatPence(payPence)}
          tone={payPence > 0 ? 'good' : 'neutral'}
          breakdown={{
            formula: 'Pay shown = payday income events visible in this month.',
            lines: getCalendarBreakdownLines(events.filter((event) => event.type === 'payday' && event.amountPence > 0), 'Pay shown'),
          }}
        />
        <MoneyMetric
          label="Costs shown"
          value={formatPence(duePence)}
          tone={duePence > 0 ? 'warning' : 'neutral'}
          breakdown={{
            formula: 'Costs shown = all non-payday calendar events with a positive amount.',
            lines: getCalendarBreakdownLines(events.filter((event) => event.type !== 'payday' && event.amountPence > 0), 'Costs shown'),
          }}
        />
        <MoneyMetric
          label="Calendar items"
          value={String(events.length)}
          breakdown={{
            formula: 'Calendar items = every sign rendered in the visible month.',
            lines: getCalendarItemCountLines(events),
          }}
        />
      </div>

      <Panel title="Calendar" description="Colour-coded signs show what is due on each day.">
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(eventStyles).map(([type, style]) => {
            const Icon = style.icon

            return (
              <span key={type} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${style.className}`}>
                <Icon size={13} />
                {style.label}
              </span>
            )
          })}
        </div>

        <div className="grid grid-cols-7 rounded-lg border border-slate-200 bg-white">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {day}
            </div>
          ))}
          {monthCells.map((cell) => {
            const dayEvents = eventsByDate.get(cell.date) ?? []
            const isCurrentMonth = cell.date >= monthStart && cell.date <= monthEnd
            const isToday = cell.date === toIsoDate(new Date())
            const isSelectedPeriodDay = selectedPayPeriod
              ? cell.date >= selectedPayPeriod.startDate && cell.date <= selectedPayPeriod.endDate
              : false

            return (
              <div
                key={cell.date}
                className={`min-h-[132px] border-b border-r p-2 ${
                  isSelectedPeriodDay
                    ? 'border-slate-200 bg-slate-50'
                    : isCurrentMonth
                      ? 'border-slate-100 bg-white'
                      : 'border-slate-100 bg-slate-50 text-slate-400'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={
                      isToday
                        ? 'flex size-7 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white'
                        : 'text-xs font-semibold text-slate-500'
                    }
                  >
                    {Number(cell.date.slice(-2))}
                  </span>
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 4).map((event) => {
                    const Icon = eventStyles[event.type].icon

                    return (
                      <div
                        key={event.id}
                        className={`rounded-md border px-2 py-1 ${eventStyles[event.type].className}`}
                        title={`${event.title} ${formatPence(event.amountPence)}`}
                      >
                        <div className="flex items-center gap-1">
                          <Icon className="shrink-0" size={13} />
                          <span className="min-w-0 truncate text-[11px] font-semibold">{event.title}</span>
                        </div>
                        {event.amountPence > 0 && (
                          <p className="mt-0.5 text-[11px] font-semibold">{formatPence(event.amountPence)}</p>
                        )}
                      </div>
                    )
                  })}
                  {dayEvents.length > 4 && (
                    <p className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                      +{dayEvents.length - 4} more
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}

function getCalendarBreakdownLines(events: CalendarEvent[], resultLabel: string) {
  const totalPence = events.reduce((total, event) => total + event.amountPence, 0)

  if (events.length === 0) {
    return [{ label: 'No matching events', value: formatPence(0), tone: 'result' as const }]
  }

  return [
    ...events.map((event) => ({
      label: event.title,
      value: formatPence(event.amountPence),
      detail: `${event.date} · ${eventStyles[event.type].label}`,
      tone: 'add' as const,
    })),
    {
      label: resultLabel,
      value: formatPence(totalPence),
      tone: 'result' as const,
    },
  ]
}

function getCalendarItemCountLines(events: CalendarEvent[]) {
  const counts = Object.entries(eventStyles)
    .map(([type, style]) => ({
      label: style.label,
      value: String(events.filter((event) => event.type === type).length),
      tone: 'neutral' as const,
    }))
    .filter((line) => line.value !== '0')

  return [
    ...(counts.length > 0 ? counts : [{ label: 'No items this month', value: '0', tone: 'muted' as const }]),
    {
      label: 'Calendar items',
      value: String(events.length),
      tone: 'result' as const,
    },
  ]
}

function getCalendarEvents(snapshot: PlannerSnapshot, startDate: string, endDate: string): CalendarEvent[] {
  const recurringEvents = getRecurringPaymentOccurrences(snapshot.recurringPayments, startDate, endDate).map(
    (occurrence) => ({
      id: `recurring-${occurrence.payment.id}-${occurrence.dueDate}`,
      date: occurrence.dueDate,
      title: occurrence.payment.name,
      amountPence: occurrence.amountPence,
      type: getRecurringCalendarType(occurrence.payment.name),
    }),
  )
  const savedEvents = snapshot.customPayments
    .filter((payment) => payment.status !== 'archived' && payment.dueDate >= startDate && payment.dueDate <= endDate)
    .map((payment) => ({
      id: `saved-${payment.id}`,
      date: payment.dueDate,
      title: payment.name,
      amountPence: payment.amountPence,
      type: 'saved' as const,
    }))
  const paydayEvents = snapshot.payPeriods.flatMap((period) =>
    [period.payday, period.nextPayday]
      .filter((date) => date >= startDate && date <= endDate)
      .map((date) => ({
        id: `payday-${period.id}-${date}`,
        date,
        title: 'Payday',
        amountPence: date === period.payday ? period.incomePence : 0,
        type: 'payday' as const,
      })),
  )
  const cardEvents = snapshot.creditCards
    .filter((card) => !card.archived)
    .flatMap((card) => getCardDueDates(card.dueDay ?? null, card.dueDate ?? null, startDate, endDate).map((date) => ({
      id: `card-${card.id}-${date}`,
      date,
      title: card.name,
      amountPence: 0,
      type: 'card' as const,
    })))
  const debtEvents = snapshot.debts
    .filter((debt) => debt.status === 'active' && debt.dueDate >= startDate && debt.dueDate <= endDate)
    .map((debt) => ({
      id: `debt-${debt.id}`,
      date: debt.dueDate,
      title: debt.name,
      amountPence: getDebtDueAmountPence(debt),
      type: 'debt' as const,
    }))
  const spendingEvents = snapshot.transactions
    .filter((transaction) => transaction.type === 'spending' && transaction.date >= startDate && transaction.date <= endDate)
    .map((transaction) => ({
      id: `spending-${transaction.id}`,
      date: transaction.date,
      title: transaction.note,
      amountPence: transaction.amountPence,
      type: 'spending' as const,
    }))

  return [
    ...paydayEvents,
    ...recurringEvents,
    ...savedEvents,
    ...cardEvents,
    ...debtEvents,
    ...spendingEvents,
  ].sort((a, b) => {
    const dateSort = a.date.localeCompare(b.date)

    if (dateSort !== 0) {
      return dateSort
    }

    return getEventRank(a.type) - getEventRank(b.type)
  })
}

function getMonthCells(month: Date): Array<{ date: string }> {
  const firstDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1))
  const firstWeekday = (firstDay.getUTCDay() + 6) % 7
  const start = new Date(firstDay.getTime() - firstWeekday * 24 * 60 * 60 * 1000)

  return Array.from({ length: 42 }, (_, index) => ({
    date: toIsoDate(new Date(start.getTime() + index * 24 * 60 * 60 * 1000)),
  }))
}

function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>()

  for (const event of events) {
    groups.set(event.date, [...(groups.get(event.date) ?? []), event])
  }

  return groups
}

function getRecurringCalendarType(name: string): CalendarEventType {
  const lowerName = name.toLowerCase()

  if (lowerName.includes('insurance') || lowerName.includes('insur')) {
    return 'insurance'
  }

  if (
    lowerName.includes('subscription') ||
    lowerName.includes('netflix') ||
    lowerName.includes('spotify') ||
    lowerName.includes('gym')
  ) {
    return 'subscription'
  }

  return 'recurring'
}

function getCardDueDates(
  dueDay: number | null,
  dueDate: string | null,
  startDate: string,
  endDate: string,
): string[] {
  if (dueDate) {
    return dueDate >= startDate && dueDate <= endDate ? [dueDate] : []
  }

  if (!dueDay) {
    return []
  }

  const start = new Date(`${startDate}T00:00:00.000Z`)
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
  const due = toIsoDate(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), Math.min(dueDay, lastDay))))

  return due >= startDate && due <= endDate ? [due] : []
}

function getEventRank(type: CalendarEventType): number {
  const ranks: Record<CalendarEventType, number> = {
    payday: 0,
    insurance: 1,
    recurring: 2,
    subscription: 3,
    saved: 4,
    card: 5,
    debt: 6,
    spending: 7,
  }

  return ranks[type]
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}
