import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import {
  Banknote,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  PiggyBank,
  ReceiptText,
  Repeat2,
  WalletCards,
} from 'lucide-react'

import {
  addIsoDays,
  findPayPeriodForDate,
  formatPence,
  getAppTodayIso,
  getDashboardTodoAllocationId,
  getCostItemIdFromDashboardTodoAllocationId,
  getAdditionalLinkedCreditCardPotAllocationPence,
  getAdditionalLinkedCreditCardPotCoverBreakdown,
  getCompletedLinkedCreditCardPotAllocation,
  getCoveredAdditionalLinkedCardManualSpendTransactionIds,
  getCreditCardIdFromLinkedCreditCardPotCostItemId,
  getCreditCardStatementPayments,
  getDebtDueAmountAfterReservesAndLinkedPotsPence,
  getDebtDueAmountPence,
  getLinkedCreditCardPotAllocationExclusionPence,
  getLinkedCreditCardPotCoverBreakdown,
  getPreviousCompletedLinkedCreditCardPotAllocation,
  getPayPeriodCostSummary,
  getRecurringPaymentOccurrences,
  isAdditionalLinkedCreditCardPotCostItemId,
  type PeriodCostItem,
  toIsoDate,
} from '../domain/money'
import type { PlannerSnapshot } from '../hooks/usePlannerData'
import type { PayPeriod, Transaction } from '../types/models'
import { Button, Panel, SectionGrid } from '../components/ui'

type CalendarEventType =
  | 'payday'
  | 'recurring'
  | 'subscription'
  | 'insurance'
  | 'saved'
  | 'card'
  | 'debt'
  | 'debtReserve'
  | 'debtPayment'
  | 'cardRepayment'
  | 'creditCardPot'
  | 'allocation'
  | 'spending'

type CalendarEventDirection = 'in' | 'out' | 'info'
type CalendarEventCompletionStatus = 'completed' | 'not_completed'
type CalendarDisplayCategory = 'income' | 'bills' | 'cards' | 'debts' | 'savings' | 'spending'

interface CalendarEvent {
  id: string
  date: string
  title: string
  amountPence: number
  type: CalendarEventType
  direction: CalendarEventDirection
  description: string
  completionStatus?: CalendarEventCompletionStatus
  breakdown?: CalendarEventBreakdownItem[]
  breakdownTotalLabel?: string
}

interface CalendarEventBreakdownItem {
  id: string
  label: string
  amountPence: number
  date: string
  source: string
}

const displayCategoryStyles: Record<CalendarDisplayCategory, { label: string; className: string; icon: typeof CalendarDays }> = {
  income: {
    label: 'Income',
    className: 'border-lime-200 bg-lime-50 text-lime-800',
    icon: Banknote,
  },
  bills: {
    label: 'Bills',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
    icon: Repeat2,
  },
  cards: {
    label: 'Cards',
    className: 'border-blue-200 bg-blue-50 text-blue-800',
    icon: CreditCard,
  },
  debts: {
    label: 'Debts',
    className: 'border-red-200 bg-red-50 text-red-800',
    icon: ReceiptText,
  },
  savings: {
    label: 'Savings',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: PiggyBank,
  },
  spending: {
    label: 'Spending',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: WalletCards,
  },
}

const completionStatusStyles: Record<CalendarEventCompletionStatus, string> = {
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  not_completed: 'border-amber-200 bg-amber-50 text-amber-800',
}

function getEventDisplayStyle(type: CalendarEventType) {
  return displayCategoryStyles[getEventDisplayCategory(type)]
}

function getEventDisplayCategory(type: CalendarEventType): CalendarDisplayCategory {
  switch (type) {
    case 'payday':
      return 'income'
    case 'recurring':
    case 'subscription':
    case 'insurance':
    case 'saved':
      return 'bills'
    case 'card':
    case 'cardRepayment':
    case 'creditCardPot':
      return 'cards'
    case 'debt':
    case 'debtReserve':
    case 'debtPayment':
      return 'debts'
    case 'allocation':
      return 'savings'
    case 'spending':
      return 'spending'
  }
}

export function CalendarPage({
  snapshot,
  selectedPayPeriod,
}: {
  snapshot: PlannerSnapshot
  selectedPayPeriod?: PayPeriod | null
}) {
  const today = getAppTodayIso(snapshot.settings)
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(selectedPayPeriod ? parseIsoDate(selectedPayPeriod.startDate) : parseIsoDate(today)),
  )
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const monthStart = toIsoDate(visibleMonth)
  const monthEnd = toIsoDate(new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 0)))
  const monthCells = useMemo(() => getMonthCells(visibleMonth), [visibleMonth])
  const gridStart = monthCells[0]?.date ?? monthStart
  const gridEnd = monthCells[monthCells.length - 1]?.date ?? monthEnd
  const events = useMemo(
    () => getCalendarEvents(snapshot, gridStart, gridEnd),
    [gridEnd, gridStart, snapshot],
  )
  const selectedDayEvents = useMemo(
    () => (selectedDate ? getCalendarEvents(snapshot, selectedDate, selectedDate) : []),
    [selectedDate, snapshot],
  )
  const eventsByDate = useMemo(() => groupEventsByDate(events), [events])
  const monthlyAgendaEvents = useMemo(
    () =>
      events
        .filter((event) => event.date >= monthStart && event.date <= monthEnd)
        .sort((a, b) => a.date.localeCompare(b.date) || getEventRank(a.type) - getEventRank(b.type) || a.title.localeCompare(b.title)),
    [events, monthEnd, monthStart],
  )
  const monthlyAgendaDays = useMemo(
    () =>
      Array.from(groupEventsByDate(monthlyAgendaEvents).entries()).map(([date, dayEvents]) => ({
        date,
        events: dayEvents.sort((a, b) => getEventRank(a.type) - getEventRank(b.type) || a.title.localeCompare(b.title)),
      })),
    [monthlyAgendaEvents],
  )
  const selectedDayPayPeriod = selectedDate ? findPayPeriodForDate(snapshot.payPeriods, selectedDate) : null
  useEffect(() => {
    if (!selectedDate || typeof window.scrollTo !== 'function') {
      return
    }

    if (window.navigator.userAgent.toLowerCase().includes('jsdom')) {
      return
    }

    try {
      window.scrollTo({ top: 0, behavior: 'auto' })
    } catch {
      window.scrollTo(0, 0)
    }
  }, [selectedDate])

  function changeMonth(delta: number) {
    setVisibleMonth(
      new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + delta, 1)),
    )
  }

  function selectDate(date: string) {
    setSelectedDate(date)
    setVisibleMonth(startOfMonth(parseIsoDate(date)))
  }

  if (selectedDate) {
    return (
      <CalendarDayDetails
        date={selectedDate}
        events={selectedDayEvents}
        payPeriod={selectedDayPayPeriod}
        snapshot={snapshot}
        onBack={() => setSelectedDate(null)}
        onSelectDate={selectDate}
      />
    )
  }

  return (
    <div className="min-w-0 space-y-6">
      <Panel
        title={formatMonth(visibleMonth)}
        description={
          selectedPayPeriod
            ? `Selected period ${selectedPayPeriod.startDate} to ${selectedPayPeriod.endDate}. Click any day for details.`
            : 'Pay, payments, cards, debts, reserves, and spending signals.'
        }
        accent="violet"
        density="compact"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => changeMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </Button>
            <Button variant="secondary" onClick={() => setVisibleMonth(startOfMonth(parseIsoDate(today)))}>
              Today
            </Button>
            <Button variant="secondary" onClick={() => changeMonth(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </Button>
          </div>
        }
      >
        <div role="list" aria-label="Calendar categories" className="mb-2 flex flex-nowrap gap-1.5 overflow-x-auto pb-1">
          {Object.entries(displayCategoryStyles).map(([category, style]) => {
            const Icon = style.icon

            return (
              <span key={category} role="listitem" className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${style.className}`}>
                <Icon size={12} />
                {style.label}
              </span>
            )
          })}
        </div>

        <section aria-label="Calendar agenda" className="md:hidden">
          {monthlyAgendaDays.length > 0 ? (
            <div className="space-y-3">
              {monthlyAgendaDays.map((day) => {
                const isToday = day.date === today
                const isSelectedPeriodDay = selectedPayPeriod
                  ? day.date >= selectedPayPeriod.startDate && day.date <= selectedPayPeriod.endDate
                  : false

                return (
                  <section
                    key={day.date}
                    aria-label={`Agenda for ${formatDateForAria(day.date)}`}
                    className={clsx(
                      'overflow-hidden rounded-[var(--radius-card)] border bg-[var(--color-surface)]',
                      isToday ? 'border-slate-900 shadow-[0_0_0_1px_rgba(15,23,42,0.08)]' : 'border-[var(--color-border)]',
                    )}
                  >
                    <div className={clsx(
                      'flex items-center justify-between gap-3 border-b px-3 py-2',
                      isToday ? 'border-slate-900 bg-slate-950 text-white' : 'border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text-primary)]',
                    )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-5">{formatDayHeading(day.date)}</p>
                        <p className={clsx('mt-0.5 text-xs', isToday ? 'text-slate-300' : 'text-[var(--color-text-muted)]')}>
                          {day.events.length} item{day.events.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isToday && (
                          <span className="rounded-md bg-lime-300 px-2 py-0.5 text-[11px] font-semibold text-slate-950">
                            Today
                          </span>
                        )}
                        {!isToday && isSelectedPeriodDay && (
                          <span className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-800">
                            Pay period
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="divide-y divide-[var(--color-border)]">
                      {day.events.map((event) => {
                        const style = getEventDisplayStyle(event.type)
                        const isDebtEvent = getEventDisplayCategory(event.type) === 'debts'
                        const Icon = style.icon

                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => selectDate(event.date)}
                            className="grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left transition hover:bg-[var(--color-surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-emerald)]"
                          >
                            <span className={`flex size-9 items-center justify-center rounded-md border ${style.className}`}>
                              <Icon size={16} aria-hidden="true" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold leading-5 text-[var(--color-text-primary)]">{event.title}</span>
                              <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">
                                {style.label}
                              </span>
                            </span>
                            <span
                              className={clsx(
                                'shrink-0 text-sm font-semibold',
                                event.direction === 'in' && 'text-[var(--color-success)]',
                                event.direction === 'out' && (isDebtEvent ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-primary)]'),
                                event.direction === 'info' && 'text-[var(--color-text-muted)]',
                              )}
                            >
                              {formatEventAmount(event)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          ) : (
            <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-text-muted)]">
              No calendar items this month.
            </p>
          )}
        </section>

        <div
          role="region"
          aria-label="Calendar month grid"
          className="hidden max-w-full overflow-x-auto rounded-2xl border border-slate-200/90 bg-white/[0.92] shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur md:block"
        >
          <div className="grid min-w-[680px] grid-cols-7">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="border-b border-slate-200/80 bg-slate-50/90 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {day}
              </div>
            ))}
            {monthCells.map((cell) => {
              const dayEvents = eventsByDate.get(cell.date) ?? []
              const isCurrentMonth = cell.date >= monthStart && cell.date <= monthEnd
              const isToday = cell.date === today
              const isPayday = dayEvents.some((event) => event.type === 'payday')
              const isSelectedPeriodDay = selectedPayPeriod
                ? cell.date >= selectedPayPeriod.startDate && cell.date <= selectedPayPeriod.endDate
                : false
              const dayCostPence = dayEvents
                .filter((event) => event.direction === 'out')
                .reduce((total, event) => total + event.amountPence, 0)

              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => selectDate(cell.date)}
                  aria-label={`Open ${formatDateForAria(cell.date)}`}
                  className={clsx(
                    'group min-h-[58px] border-b border-r p-1 text-left transition focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-950',
                    isPayday
                      ? 'border-lime-200 bg-lime-50/80 hover:bg-lime-50'
                      : isSelectedPeriodDay
                      ? 'border-cyan-100 bg-cyan-50/55 hover:bg-cyan-50'
                      : isCurrentMonth
                        ? 'border-slate-100 bg-white/95 hover:bg-slate-50/90'
                        : 'border-slate-100 bg-slate-50/80 text-slate-400 hover:bg-slate-100/80',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={
                        isToday
                          ? 'flex size-6 items-center justify-center rounded-full bg-slate-950 text-[11px] font-semibold text-white'
                          : isPayday
                            ? 'flex size-6 items-center justify-center rounded-full bg-lime-300 text-[11px] font-semibold text-slate-950'
                          : 'text-[11px] font-semibold text-slate-500'
                      }
                    >
                      {Number(cell.date.slice(-2))}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm shadow-slate-950/20">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>
                  {dayCostPence > 0 && (
                    <p className="mb-0.5 truncate text-[10px] font-semibold text-slate-600">{formatPence(dayCostPence)} out</p>
                  )}
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 1).map((event) => {
                      const style = getEventDisplayStyle(event.type)
                      const Icon = style.icon

                      return (
                        <div
                          key={event.id}
                          className={`rounded-md border px-1.5 py-0.5 shadow-sm ${style.className}`}
                          title={`${event.title} ${formatPence(event.amountPence)}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon className="shrink-0" size={11} />
                            <span className="min-w-0 truncate text-[10px] font-semibold">{event.title}</span>
                          </div>
                        </div>
                      )
                    })}
                    {dayEvents.length > 1 && (
                      <p className="rounded-md border border-slate-200/80 bg-white/[0.85] px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        +{dayEvents.length - 1} more
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </Panel>
    </div>
  )
}

function CalendarDayDetails({
  date,
  events,
  payPeriod,
  snapshot,
  onBack,
  onSelectDate,
}: {
  date: string
  events: CalendarEvent[]
  payPeriod: PayPeriod | null
  snapshot: PlannerSnapshot
  onBack: () => void
  onSelectDate: (date: string) => void
}) {
  const today = getAppTodayIso(snapshot.settings)
  const moneyInPence = events
    .filter((event) => event.direction === 'in')
    .reduce((total, event) => total + event.amountPence, 0)
  const moneyOutPence = events
    .filter((event) => event.direction === 'out')
    .reduce((total, event) => total + event.amountPence, 0)
  const infoCount = events.filter((event) => event.direction === 'info').length
  const netPence = moneyInPence - moneyOutPence
  const costSummary = payPeriod
    ? getPayPeriodCostSummary({
        payPeriod,
        recurringPayments: snapshot.recurringPayments,
        creditCards: snapshot.creditCards,
        customPayments: snapshot.customPayments,
        transactions: snapshot.transactions,
        debts: snapshot.debts,
        creditCardRepayments: snapshot.creditCardRepayments,
        creditCardPots: snapshot.creditCardPots,
        debtReserves: snapshot.debtReserves,
        pots: snapshot.pots,
        potAllocations: snapshot.potAllocations,
        asOfDate: today,
      })
    : null

  return (
    <div className="space-y-6" aria-label={`Calendar day ${date}`}>
      <section className="max-w-full overflow-hidden rounded-2xl border border-slate-900 bg-[var(--color-deep-navy)] shadow-[0_18px_55px_rgba(15,23,42,0.16)]">
        <div className="grid gap-6 p-5 text-white lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Day overview</p>
            <h2 className="mt-2 text-3xl font-semibold">{formatDayHeading(date)}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Everything tied to this day, including pay, due costs, debt reserves, repayments, pot allocations, and manual spending.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button variant="secondary" onClick={() => onSelectDate(addIsoDays(date, -1))}>
              <ChevronLeft size={18} />
              Previous day
            </Button>
            <Button variant="secondary" onClick={() => onSelectDate(addIsoDays(date, 1))}>
              Next day
              <ChevronRight size={18} />
            </Button>
            <Button variant="secondary" onClick={onBack}>Back to calendar</Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <DayMetric label="Money in" value={formatPence(moneyInPence)} tone="good" />
        <DayMetric label="Money out" value={formatPence(moneyOutPence)} tone={moneyOutPence > 0 ? 'warning' : 'neutral'} />
        <DayMetric label="Net day" value={formatSignedPence(netPence)} tone={netPence >= 0 ? 'good' : 'warning'} />
        <DayMetric label="Info items" value={String(infoCount)} tone="neutral" />
      </div>

      <SectionGrid variant="wideLeft">
        <Panel
          title="Timeline"
          description={events.length > 0 ? `${events.length} calendar item${events.length === 1 ? '' : 's'} on this day.` : 'No saved activity is attached to this date yet.'}
          accent="violet"
          density="compact"
        >
          {events.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200/90 bg-slate-50/80 p-6 text-center">
              <p className="text-sm font-semibold text-slate-950">Nothing scheduled</p>
              <p className="mt-1 text-sm text-slate-500">No paycheck, debt, saved payment, recurring payment, repayment, reserve, allocation, or spend is linked to this day.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <CalendarDayEventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Pay period context"
          description={payPeriod ? `${payPeriod.startDate} to ${payPeriod.endDate}` : 'No saved pay period covers this date.'}
          accent="blue"
          density="compact"
        >
          {payPeriod && costSummary ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-cyan-200/90 bg-cyan-50/70 p-4 shadow-sm shadow-cyan-100/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paycheck</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{formatPence(payPeriod.incomePence)}</p>
                <p className="mt-1 text-xs text-slate-500">Payday {payPeriod.payday}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <CompactMoneyLine label="Period costs" value={formatPence(costSummary.totalCostsPence)} />
                <CompactMoneyLine label="Money left" value={formatPence(costSummary.moneyLeftPence)} emphasized={costSummary.moneyLeftPence >= 0} />
                <CompactMoneyLine label="Debt reserves" value={formatPence(costSummary.debtReservesPence)} />
                <CompactMoneyLine label="Debt due" value={formatPence(costSummary.debtMinimumsPence)} />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200/90 bg-slate-50/80 p-4">
              <p className="text-sm font-semibold text-slate-950">No pay period found</p>
              <p className="mt-1 text-sm leading-5 text-slate-500">Create or select a paycheck period if you want this date included in dashboard calculations.</p>
            </div>
          )}
        </Panel>
      </SectionGrid>
    </div>
  )
}

function CalendarDayEventCard({ event }: { event: CalendarEvent }) {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false)
  const style = getEventDisplayStyle(event.type)
  const isDebtEvent = getEventDisplayCategory(event.type) === 'debts'
  const Icon = style.icon
  const hasBreakdown = Boolean(event.breakdown && event.breakdown.length > 0)
  const breakdownTotalPence = event.breakdown?.reduce((total, item) => total + item.amountPence, 0) ?? 0
  const breakdownId = `calendar-event-breakdown-${event.id}`
  const breakdownLabel = `${event.title} ${formatEventAmount(event)}`

  return (
    <article className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-violet-200">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center">
        <div className={`flex size-11 items-center justify-center rounded-lg border ${style.className}`}>
          <Icon size={19} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-950">{event.title}</h3>
            <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${style.className}`}>
              {style.label}
            </span>
            {event.completionStatus && (
              <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${completionStatusStyles[event.completionStatus]}`}>
                {formatCompletionStatus(event.completionStatus)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-500">{event.description}</p>
        </div>
        <p className={clsx(
          'text-lg font-semibold',
          event.direction === 'in' && 'text-emerald-700',
          event.direction === 'out' && (isDebtEvent ? 'text-red-700' : 'text-slate-950'),
          event.direction === 'info' && 'text-slate-500',
        )}
        >
          {formatEventAmount(event)}
        </p>
        {hasBreakdown && (
          <button
            type="button"
            aria-label={`${isBreakdownOpen ? 'Hide' : 'Show'} breakdown for ${breakdownLabel}`}
            aria-expanded={isBreakdownOpen}
            aria-controls={breakdownId}
            onClick={() => setIsBreakdownOpen((current) => !current)}
            className="inline-flex min-h-9 w-9 items-center justify-center rounded-lg border border-slate-200/90 bg-white/90 text-slate-600 shadow-sm shadow-slate-200/60 transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          >
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={isBreakdownOpen ? 'rotate-180 transition' : 'transition'}
            />
          </button>
        )}
      </div>

      {hasBreakdown && isBreakdownOpen && event.breakdown && (
        <div id={breakdownId} role="region" aria-label={`Breakdown for ${breakdownLabel}`} className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Breakdown</p>
          <div className="mt-2 space-y-2">
            {event.breakdown.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{item.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.source} · {formatShortDate(item.date)}</p>
                </div>
                <p className={clsx('shrink-0 text-sm font-semibold', item.amountPence < 0 ? 'text-emerald-700' : 'text-slate-950')}>
                  {formatPence(item.amountPence)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/60">
            <p className="text-sm font-semibold text-slate-700">{event.breakdownTotalLabel ?? 'Total'}</p>
            <p className="text-sm font-semibold text-slate-950">{formatPence(breakdownTotalPence)}</p>
          </div>
        </div>
      )}
    </article>
  )
}

function DayMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'neutral' | 'good' | 'warning' | 'bad'
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl border p-4 shadow-[0_14px_35px_rgba(15,23,42,0.05)]',
        tone === 'neutral' && 'border-slate-200/90 bg-white/95',
        tone === 'good' && 'border-emerald-200 bg-emerald-50',
        tone === 'warning' && 'border-amber-200 bg-amber-50',
        tone === 'bad' && 'border-amber-200 bg-amber-50',
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950">{value}</p>
    </div>
  )
}

function CompactMoneyLine({
  label,
  value,
  emphasized = false,
}: {
  label: string
  value: string
  emphasized?: boolean
}) {
  return (
    <div className={clsx('flex items-center justify-between gap-3 rounded-lg border p-3 shadow-sm', emphasized ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200/90 bg-white/95')}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function getCalendarEvents(snapshot: PlannerSnapshot, startDate: string, endDate: string): CalendarEvent[] {
  const potById = new Map(snapshot.pots.map((pot) => [pot.id, pot]))
  const debtById = new Map(snapshot.debts.map((debt) => [debt.id, debt]))
  const cardById = new Map(snapshot.creditCards.map((card) => [card.id, card]))
  const activeCardIds = new Set(snapshot.creditCards.filter((card) => !card.archived).map((card) => card.id))
  const periodById = new Map(snapshot.payPeriods.map((period) => [period.id, period]))
  const savedPaydays = new Set(snapshot.payPeriods.map((period) => period.payday))
  const recurringEvents: CalendarEvent[] = getRecurringPaymentOccurrences(snapshot.recurringPayments, startDate, endDate)
    .filter((occurrence) => !isLinkedToActiveCard(occurrence.payment.creditCardId, activeCardIds))
    .map((occurrence) => {
      const card = occurrence.payment.creditCardId ? cardById.get(occurrence.payment.creditCardId) : null

      return {
        id: `recurring-${occurrence.payment.id}-${occurrence.dueDate}`,
        date: occurrence.dueDate,
        title: occurrence.payment.name,
        amountPence: occurrence.amountPence,
        type: getRecurringCalendarType(occurrence.payment.name),
        direction: 'out',
        description: `${occurrence.payment.frequency} payment${card ? ` charged to ${card.name}` : ''}.`,
      }
    })
  const savedEvents: CalendarEvent[] = snapshot.customPayments
    .filter(
      (payment) =>
        payment.status !== 'archived' &&
        !isLinkedToActiveCard(payment.creditCardId, activeCardIds) &&
        payment.dueDate >= startDate &&
        payment.dueDate <= endDate,
    )
    .map((payment) => {
      const card = payment.creditCardId ? cardById.get(payment.creditCardId) : null

      return {
        id: `saved-${payment.id}`,
        date: payment.dueDate,
        title: payment.name,
        amountPence: payment.amountPence,
        type: 'saved',
        direction: 'out',
        description: `${payment.status === 'paid' ? 'Paid' : 'Unpaid'} saved payment${card ? ` linked to ${card.name}` : ''}.`,
      }
    })
  const paydayEvents: CalendarEvent[] = snapshot.payPeriods.flatMap((period) => {
    const eventsForPeriod: CalendarEvent[] = []

    if (period.payday >= startDate && period.payday <= endDate) {
      eventsForPeriod.push({
        id: `payday-${period.id}-${period.payday}`,
        date: period.payday,
        title: 'Paycheck received',
        amountPence: period.incomePence,
        type: 'payday',
        direction: 'in',
        description: `Pay period ${period.startDate} to ${period.endDate}.`,
      })
    }

    if (period.nextPayday >= startDate && period.nextPayday <= endDate && !savedPaydays.has(period.nextPayday)) {
      eventsForPeriod.push({
        id: `next-payday-${period.id}-${period.nextPayday}`,
        date: period.nextPayday,
        title: 'Next payday starts',
        amountPence: 0,
        type: 'payday',
        direction: 'info',
        description: `Next paycheck date after the ${period.startDate} to ${period.endDate} period.`,
      })
    }

    return eventsForPeriod
  })
  const cardEvents: CalendarEvent[] = snapshot.creditCards
    .filter((card) => !card.archived)
    .flatMap((card) => {
      if (card.statementDate) {
        return getCreditCardStatementPayments({
          card,
          recurringPayments: snapshot.recurringPayments,
          customPayments: snapshot.customPayments,
          transactions: snapshot.transactions,
          repayments: snapshot.creditCardRepayments,
          startDate,
          endDate,
          asOfDate: getAppTodayIso(snapshot.settings),
        }).map((statementPayment): CalendarEvent => ({
          id: `card-statement-${card.id}-${statementPayment.statementDate}-${statementPayment.directDebitDate}`,
          date: statementPayment.directDebitDate,
          title: statementPayment.forecastDuePence > 0 ? `${card.name} statement payment` : `${card.name} statement covered`,
          amountPence: statementPayment.forecastDuePence,
          type: 'card',
          direction: statementPayment.forecastDuePence > 0 ? 'out' : 'info',
          description: statementPayment.forecastDuePence > 0
            ? `${card.provider || 'Credit card'} direct debit for statement ${statementPayment.statementDate}.`
            : `${card.provider || 'Credit card'} statement ${statementPayment.statementDate} is fully covered. No more is due on this date.`,
          breakdown: statementPayment.breakdown.length > 0
            ? statementPayment.breakdown.map((line) => ({
                id: line.id,
                label: line.label,
                amountPence: line.amountPence,
                date: line.date,
                source: line.detail,
              }))
            : undefined,
          breakdownTotalLabel: 'Still due',
        }))
      }

      return getCardDueDates(card.dueDay ?? null, card.dueDate ?? null, startDate, endDate).map((date) => {
        const breakdown = getCardPaymentBreakdown(snapshot, card.id, date)
        const amountPence = breakdown.reduce((total, item) => total + item.amountPence, 0)
        const hasBreakdown = amountPence > 0

        return {
          id: `card-${card.id}-${date}`,
          date,
          title: hasBreakdown ? `${card.name} card payment` : `${card.name} statement setup needed`,
          amountPence,
          type: 'card' as const,
          direction: hasBreakdown ? 'out' as const : 'info' as const,
          description: hasBreakdown
            ? `${card.provider || 'Credit card'} statement date missing. Planned card-linked charges are grouped here until setup is completed.`
            : `${card.provider || 'Credit card'} needs a statement date before linked-pot direct debits can run.`,
          breakdown: hasBreakdown ? breakdown : undefined,
        }
      })
    })
  const debtEvents: CalendarEvent[] = snapshot.debts
    .filter((debt) => debt.status === 'active' && debt.dueDate >= startDate && debt.dueDate <= endDate)
    .map((debt) => {
      const amountDuePence = getDebtDueAmountPence(debt)
      const stillToCoverPence = getDebtDueAmountAfterReservesAndLinkedPotsPence(debt, snapshot.debtReserves, snapshot.pots)

      return {
        id: `debt-${debt.id}`,
        date: debt.dueDate,
        title: debt.name,
        amountPence: amountDuePence,
        type: 'debt' as const,
        direction: amountDuePence > 0 ? 'out' as const : 'info' as const,
        description: `${debt.lender || 'Debt'} due date. ${formatPence(stillToCoverPence)} still to cover after linked pots and planned reserves.`,
      }
    })
  const reserveEvents: CalendarEvent[] = snapshot.debtReserves
    .filter((reserve) => reserve.status !== 'cancelled' && reserve.payday >= startDate && reserve.payday <= endDate)
    .map((reserve) => {
      const debt = debtById.get(reserve.debtId)
      const isPlanned = reserve.status === 'planned'

      return {
        id: `debt-reserve-${reserve.id}`,
        date: reserve.payday,
        title: debt ? `${debt.name} reserve` : 'Debt reserve',
        amountPence: reserve.amountPence,
        type: 'debtReserve' as const,
        direction: isPlanned ? 'out' as const : 'info' as const,
        description: `${reserve.status} reserve for ${reserve.periodStartDate} to ${reserve.periodEndDate}${reserve.note ? ` · ${reserve.note}` : ''}.`,
      }
    })
  const debtPaymentEvents: CalendarEvent[] = snapshot.debtPayments
    .filter((payment) => payment.date >= startDate && payment.date <= endDate)
    .map((payment) => {
      const debt = debtById.get(payment.debtId)

      return {
        id: `debt-payment-${payment.id}`,
        date: payment.date,
        title: debt ? `${debt.name} payment` : 'Debt payment',
        amountPence: payment.amountPence,
        type: 'debtPayment' as const,
        direction: 'out' as const,
        description: payment.note || 'Recorded debt payment.',
      }
    })
  const cardRepaymentEvents: CalendarEvent[] = snapshot.creditCardRepayments
    .filter(
      (repayment) =>
        repayment.date >= startDate &&
        repayment.date <= endDate &&
        !repayment.id.startsWith('linked-card-pot-repayment-'),
    )
    .map((repayment) => {
      const card = cardById.get(repayment.creditCardId)

      return {
        id: `card-repayment-${repayment.id}`,
        date: repayment.date,
        title: card ? `${card.name} repayment` : 'Card repayment',
        amountPence: repayment.amountPence,
        type: 'cardRepayment' as const,
        direction: 'out' as const,
        description: repayment.note || 'Recorded credit card repayment.',
      }
    })
  const creditCardPotEvents: CalendarEvent[] = snapshot.creditCardPots
    .filter((creditCardPot) => {
      const date = creditCardPot.payday ?? creditCardPot.createdAt.slice(0, 10)

      return creditCardPot.status === 'active' && date >= startDate && date <= endDate
    })
    .map((creditCardPot) => {
      const card = cardById.get(creditCardPot.creditCardId)
      const date = creditCardPot.payday ?? creditCardPot.createdAt.slice(0, 10)

      return {
        id: `credit-card-pot-${creditCardPot.id}`,
        date,
        title: creditCardPot.name,
        amountPence: creditCardPot.amountPence,
        type: 'creditCardPot' as const,
        direction: creditCardPot.source === 'paycheck' ? 'out' as const : 'info' as const,
        description: `${creditCardPot.source === 'paycheck' ? 'Paycheck-funded' : 'External'} set-aside for ${card?.name ?? 'credit card'}${creditCardPot.note ? ` · ${creditCardPot.note}` : ''}.`,
      }
    })
  const plannedChecklistAllocationEvents: CalendarEvent[] = snapshot.payPeriods.flatMap((period) => {
    if (period.payday < startDate || period.payday > endDate) {
      return []
    }

    const summary = getPayPeriodCostSummary({
      payPeriod: period,
      creditCards: snapshot.creditCards,
      recurringPayments: snapshot.recurringPayments,
      customPayments: snapshot.customPayments,
      transactions: snapshot.transactions,
      debts: snapshot.debts,
      creditCardRepayments: snapshot.creditCardRepayments,
      creditCardPots: snapshot.creditCardPots,
      debtReserves: snapshot.debtReserves,
      pots: snapshot.pots,
      potAllocations: snapshot.potAllocations,
      asOfDate: getAppTodayIso(snapshot.settings),
    })

    return summary.items
      .filter((item) => item.source === 'linked_credit_card_pot' && item.amountPence > 0 && item.potId)
      .filter((item) => !snapshot.potAllocations.some((allocation) => allocation.id === getDashboardTodoAllocationId(period.id, item.id)))
      .map((item): CalendarEvent => {
        const pot = item.potId ? potById.get(item.potId) : null

        return {
          id: `planned-allocation-${period.id}-${item.id}`,
          date: period.payday,
          title: pot ? `${pot.name} allocation` : item.label,
          amountPence: item.amountPence,
          type: 'allocation',
          direction: 'out',
          description: `Not completed dashboard checklist item for ${period.startDate} to ${period.endDate}.`,
          completionStatus: 'not_completed',
          breakdown: getPlannedChecklistAllocationBreakdown(snapshot, item, period),
        }
      })
  })
  const allocationEvents: CalendarEvent[] = snapshot.potAllocations
    .flatMap((allocation): CalendarEvent[] => {
      const period = periodById.get(allocation.payPeriodId)
      const pot = potById.get(allocation.potId)

      if (!period || period.payday < startDate || period.payday > endDate) {
        return []
      }

      const breakdown = getPotAllocationEventBreakdown(snapshot, allocation, period)
      const sourceCostItemId = getCostItemIdFromDashboardTodoAllocationId(allocation.id, period.id)

      return [{
        id: `allocation-${allocation.id}`,
        date: period.payday,
        title: pot
          ? allocation.source === 'pot_auto'
            ? `${pot.name} payday top-up`
            : `${pot.name} allocation`
          : 'Pot allocation',
        amountPence: allocation.amountPence,
        type: 'allocation' as const,
        direction: allocation.source === 'recurring' ? 'info' as const : 'out' as const,
        description: `${sourceCostItemId ? 'Completed dashboard checklist item' : allocation.source === 'recurring' ? 'Bill reserve' : allocation.source === 'pot_auto' ? 'Completed automatic payday top-up' : 'Completed manual allocation'} for ${period.startDate} to ${period.endDate}.`,
        completionStatus: 'completed',
        breakdown,
      }]
    })
  const spendingEvents: CalendarEvent[] = snapshot.transactions
    .filter(
      (transaction) =>
        transaction.type === 'spending' &&
        !transaction.recurringPaymentId &&
        (
          !(transaction.paymentMethod === 'credit_card' && isLinkedToActiveCard(transaction.creditCardId, activeCardIds)) ||
          isLinkedCardSpendAfterCompletedCover(snapshot, transaction, periodById)
        ) &&
        transaction.date >= startDate &&
        transaction.date <= endDate,
    )
    .map((transaction) => {
      const card = transaction.creditCardId ? cardById.get(transaction.creditCardId) : null
      const pot = transaction.potId ? potById.get(transaction.potId) : null

      return {
        id: `spending-${transaction.id}`,
        date: transaction.date,
        title: transaction.note || 'Manual spend',
        amountPence: transaction.amountPence,
        type: 'spending' as const,
        direction: 'out' as const,
        description: card ? `Manual spend on ${card.name}.` : `Manual spend${pot ? ` from ${pot.name}` : ''}.`,
      }
    })

  return [
    ...paydayEvents,
    ...recurringEvents,
    ...savedEvents,
    ...cardEvents,
    ...debtEvents,
    ...reserveEvents,
    ...debtPaymentEvents,
    ...cardRepaymentEvents,
    ...creditCardPotEvents,
    ...plannedChecklistAllocationEvents,
    ...allocationEvents,
    ...spendingEvents,
  ].sort((a, b) => {
    const dateSort = a.date.localeCompare(b.date)

    if (dateSort !== 0) {
      return dateSort
    }

    return getEventRank(a.type) - getEventRank(b.type)
  })
}

function getPotAllocationEventBreakdown(
  snapshot: PlannerSnapshot,
  allocation: PlannerSnapshot['potAllocations'][number],
  payPeriod: PayPeriod,
): CalendarEventBreakdownItem[] | undefined {
  const today = getAppTodayIso(snapshot.settings)
  const sourceCostItemId = getCostItemIdFromDashboardTodoAllocationId(allocation.id, allocation.payPeriodId)
  const linkedCreditCardId = sourceCostItemId
    ? getCreditCardIdFromLinkedCreditCardPotCostItemId(sourceCostItemId)
    : null

  if (!sourceCostItemId || !linkedCreditCardId) {
    return undefined
  }

  const lines = isAdditionalLinkedCreditCardPotCostItemId(sourceCostItemId)
    ? getAdditionalLinkedCreditCardPotAllocationBreakdown(snapshot, allocation, payPeriod, linkedCreditCardId, today)
    : getHistoricalLinkedCreditCardPotAllocationBreakdown(snapshot, allocation, payPeriod, linkedCreditCardId, today)

  return lines.map((line) => ({
    id: `allocation-${allocation.id}-${line.id}`,
    label: line.label,
    amountPence: line.amountPence,
    date: line.date,
    source: line.detail,
  }))
}

function getPlannedChecklistAllocationBreakdown(
  snapshot: PlannerSnapshot,
  item: PeriodCostItem,
  payPeriod: PayPeriod,
): CalendarEventBreakdownItem[] | undefined {
  if (item.source !== 'linked_credit_card_pot' || !item.creditCardId) {
    return item.coverBreakdown?.map((line) => ({
      id: `planned-${item.id}-${line.id}`,
      label: line.label,
      amountPence: line.amountPence,
      date: line.date,
      source: line.detail,
    }))
  }

  const today = getAppTodayIso(snapshot.settings)
  const lines = item.coverBreakdown ?? getLinkedCreditCardPotCoverBreakdown({
    creditCards: snapshot.creditCards,
    recurringPayments: snapshot.recurringPayments,
    customPayments: snapshot.customPayments,
    transactions: snapshot.transactions,
    repayments: snapshot.creditCardRepayments,
    creditCardPots: snapshot.creditCardPots,
    pots: snapshot.pots,
    payPeriod,
    creditCardId: item.creditCardId,
    linkedPotId: item.potId,
    amountPence: item.amountPence,
    asOfDate: today,
  })

  return lines.map((line) => ({
    id: `planned-${item.id}-${line.id}`,
    label: line.label,
    amountPence: line.amountPence,
    date: line.date,
    source: line.detail,
  }))
}

function getHistoricalLinkedCreditCardPotAllocationBreakdown(
  snapshot: PlannerSnapshot,
  allocation: PlannerSnapshot['potAllocations'][number],
  payPeriod: PayPeriod,
  linkedCreditCardId: string,
  today: string,
) {
  const additionalCoverPence = getAdditionalLinkedCreditCardPotAllocationPence(
    snapshot.potAllocations,
    payPeriod.id,
    allocation.potId,
    linkedCreditCardId,
  )
  const coveredManualSpendIds = getCoveredAdditionalLinkedCardManualSpendTransactionIds(
    snapshot.transactions,
    payPeriod,
    linkedCreditCardId,
    additionalCoverPence,
  )
  const breakdownSnapshot = filterSnapshotForHistoricalAllocation(
    snapshot,
    allocation.createdAt,
    coveredManualSpendIds,
  )
  const excludedLinkedPotAllocationPence = Math.max(
    getLinkedCreditCardPotAllocationExclusionPence(
      snapshot.potAllocations,
      payPeriod.id,
      allocation.potId,
      allocation.createdAt,
    ) || 0,
    allocation.amountPence + additionalCoverPence,
  )

  return getLinkedCreditCardPotCoverBreakdown({
    creditCards: breakdownSnapshot.creditCards,
    recurringPayments: breakdownSnapshot.recurringPayments,
    customPayments: breakdownSnapshot.customPayments,
    transactions: breakdownSnapshot.transactions,
    repayments: breakdownSnapshot.creditCardRepayments,
    creditCardPots: breakdownSnapshot.creditCardPots,
    pots: breakdownSnapshot.pots,
    payPeriod,
    creditCardId: linkedCreditCardId,
    linkedPotId: allocation.potId,
    amountPence: allocation.amountPence,
    excludedLinkedPotAllocationPence,
    asOfDate: today,
  })
}

function getAdditionalLinkedCreditCardPotAllocationBreakdown(
  snapshot: PlannerSnapshot,
  allocation: PlannerSnapshot['potAllocations'][number],
  payPeriod: PayPeriod,
  linkedCreditCardId: string,
  today: string,
) {
  const completedAllocation =
    getPreviousCompletedLinkedCreditCardPotAllocation(
      snapshot.potAllocations,
      payPeriod.id,
      linkedCreditCardId,
      allocation,
    ) ?? getCompletedLinkedCreditCardPotAllocation(
      snapshot.potAllocations,
      payPeriod.id,
      linkedCreditCardId,
    )

  if (!completedAllocation) {
    return getHistoricalLinkedCreditCardPotAllocationBreakdown(snapshot, allocation, payPeriod, linkedCreditCardId, today)
  }

  return getAdditionalLinkedCreditCardPotCoverBreakdown({
    recurringPayments: snapshot.recurringPayments,
    customPayments: snapshot.customPayments,
    transactions: snapshot.transactions,
    payPeriod,
    creditCardId: linkedCreditCardId,
    amountPence: allocation.amountPence,
    completedAllocation,
  })
}

function filterSnapshotForHistoricalAllocation(
  snapshot: PlannerSnapshot,
  cutoffTimestamp: string,
  excludedTransactionIds: Set<string>,
): PlannerSnapshot {
  return {
    ...snapshot,
    recurringPayments: snapshot.recurringPayments.filter((payment) => payment.createdAt <= cutoffTimestamp),
    customPayments: snapshot.customPayments.filter((payment) => payment.createdAt <= cutoffTimestamp),
    transactions: snapshot.transactions.filter(
      (transaction) => transaction.createdAt <= cutoffTimestamp && !excludedTransactionIds.has(transaction.id),
    ),
    creditCardRepayments: snapshot.creditCardRepayments.filter((repayment) => repayment.createdAt <= cutoffTimestamp),
  }
}

function isLinkedToActiveCard(creditCardId: string | null | undefined, activeCardIds: Set<string>): boolean {
  return Boolean(creditCardId && activeCardIds.has(creditCardId))
}

function isLinkedCardSpendAfterCompletedCover(
  snapshot: PlannerSnapshot,
  transaction: Transaction,
  periodById: Map<string, PayPeriod>,
): boolean {
  if (transaction.paymentMethod !== 'credit_card' || !transaction.creditCardId) {
    return false
  }

  const period = transaction.payPeriodId
    ? periodById.get(transaction.payPeriodId) ?? findPayPeriodForDate(snapshot.payPeriods, transaction.date)
    : findPayPeriodForDate(snapshot.payPeriods, transaction.date)
  const completedAllocation = period
    ? getCompletedLinkedCreditCardPotAllocation(snapshot.potAllocations, period.id, transaction.creditCardId)
    : null

  return Boolean(completedAllocation && transaction.createdAt > completedAllocation.createdAt)
}

function getCardPaymentBreakdown(
  snapshot: PlannerSnapshot,
  creditCardId: string,
  dueDate: string,
): CalendarEventBreakdownItem[] {
  const window = getCardPaymentWindow(snapshot, creditCardId, dueDate)
  const recurringItems: CalendarEventBreakdownItem[] = getRecurringPaymentOccurrences(
    snapshot.recurringPayments,
    window.startDate,
    window.endDate,
  )
    .filter((occurrence) => occurrence.payment.creditCardId === creditCardId)
    .map((occurrence) => ({
      id: `card-recurring-${occurrence.payment.id}-${occurrence.dueDate}`,
      label: occurrence.payment.name,
      amountPence: occurrence.amountPence,
      date: occurrence.dueDate,
      source: 'Recurring payment',
    }))
  const savedItems: CalendarEventBreakdownItem[] = snapshot.customPayments
    .filter(
      (payment) =>
        payment.status !== 'archived' &&
        payment.creditCardId === creditCardId &&
        payment.dueDate >= window.startDate &&
        payment.dueDate <= window.endDate,
    )
    .map((payment) => ({
      id: `card-saved-${payment.id}`,
      label: payment.name,
      amountPence: payment.amountPence,
      date: payment.dueDate,
      source: payment.status === 'paid' ? 'Saved payment paid' : 'Saved payment',
    }))
  const spendingItems: CalendarEventBreakdownItem[] = snapshot.transactions
    .filter(
      (transaction) =>
        transaction.type === 'spending' &&
        transaction.paymentMethod === 'credit_card' &&
        transaction.creditCardId === creditCardId &&
        !transaction.recurringPaymentId &&
        transaction.date >= window.startDate &&
        transaction.date <= window.endDate,
    )
    .map((transaction) => ({
      id: `card-spending-${transaction.id}`,
      label: transaction.note || 'Manual spend',
      amountPence: transaction.amountPence,
      date: transaction.date,
      source: 'Manual card spend',
    }))

  return [...recurringItems, ...savedItems, ...spendingItems].sort((a, b) => {
    const dateSort = a.date.localeCompare(b.date)

    if (dateSort !== 0) {
      return dateSort
    }

    return a.label.localeCompare(b.label)
  })
}

function getCardPaymentWindow(
  snapshot: PlannerSnapshot,
  creditCardId: string,
  dueDate: string,
): { startDate: string; endDate: string } {
  const card = snapshot.creditCards.find((candidate) => candidate.id === creditCardId)

  if (card?.dueDay) {
    return {
      startDate: addIsoDays(getPreviousMonthlyDueDate(card.dueDay, dueDate), 1),
      endDate: dueDate,
    }
  }

  const payPeriod =
    findPayPeriodForDate(snapshot.payPeriods, dueDate) ??
    snapshot.payPeriods.find((period) => period.nextPayday === dueDate) ??
    null

  if (payPeriod) {
    return {
      startDate: payPeriod.startDate,
      endDate: payPeriod.endDate,
    }
  }

  return {
    startDate: dueDate,
    endDate: dueDate,
  }
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
  const end = new Date(`${endDate}T00:00:00.000Z`)
  const dueDates: string[] = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))

  while (cursor <= end) {
    const due = getMonthlyDueDate(dueDay, cursor.getUTCFullYear(), cursor.getUTCMonth())

    if (due >= startDate && due <= endDate) {
      dueDates.push(due)
    }

    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return dueDates
}

function getMonthlyDueDate(dueDay: number, year: number, monthIndex: number): string {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

  return toIsoDate(new Date(Date.UTC(year, monthIndex, Math.min(Math.max(1, dueDay), lastDay))))
}

function getPreviousMonthlyDueDate(dueDay: number, dueDate: string): string {
  const current = parseIsoDate(dueDate)
  const previousMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1))

  return getMonthlyDueDate(dueDay, previousMonth.getUTCFullYear(), previousMonth.getUTCMonth())
}

function getEventRank(type: CalendarEventType): number {
  const ranks: Record<CalendarEventType, number> = {
    payday: 0,
    insurance: 1,
    recurring: 2,
    subscription: 3,
    saved: 4,
    debtReserve: 5,
    card: 6,
    debt: 7,
    debtPayment: 8,
    cardRepayment: 9,
    creditCardPot: 10,
    allocation: 11,
    spending: 12,
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

function formatDayHeading(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseIsoDate(date))
}

function formatDateForAria(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseIsoDate(date))
}

function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(parseIsoDate(date))
}

function formatSignedPence(amountPence: number): string {
  if (amountPence > 0) {
    return `+${formatPence(amountPence)}`
  }

  if (amountPence < 0) {
    return `-${formatPence(Math.abs(amountPence))}`
  }

  return formatPence(0)
}

function formatCompletionStatus(status: CalendarEventCompletionStatus): string {
  return status === 'completed' ? 'Completed' : 'Not completed'
}

function formatEventAmount(event: CalendarEvent): string {
  if (event.amountPence <= 0) {
    return event.direction === 'info' ? 'Info' : formatPence(0)
  }

  if (event.direction === 'in') {
    return `+${formatPence(event.amountPence)}`
  }

  if (event.direction === 'out') {
    return `-${formatPence(event.amountPence)}`
  }

  return formatPence(event.amountPence)
}
