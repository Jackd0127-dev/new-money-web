import { useState, type ReactNode } from 'react'
import { AlertTriangle, Banknote, CalendarDays, CheckCircle2, Clock3, ReceiptText, WalletCards } from 'lucide-react'

import {
  calculatePaycheckAmount,
  createNextPayPeriod,
  formatPence,
  getAppTodayIso,
  parsePoundsToPence,
} from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import { PayPeriodHistoryPanel } from './HistoryPage'
import {
  ActionButton,
  Field,
  MetricCard,
  Panel,
  Pill,
  SectionGrid,
  SelectInput,
  TextInput,
} from '../components/ui'
import type { PayFrequency, PayPeriod } from '../types/models'

export function PaydayWizardPage({
  snapshot,
  actions,
  selectedPayPeriod,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
  selectedPayPeriod?: PayPeriod | null
}) {
  const initialDraft = getPaydayDraft(
    snapshot,
    selectedPayPeriod?.payday ?? snapshot.payPeriods[0]?.payday ?? getAppTodayIso(snapshot.settings),
  )
  const [payday, setPayday] = useState(initialDraft.payday)
  const [hoursWorked, setHoursWorked] = useState(initialDraft.hoursWorked)
  const [hourlyRate, setHourlyRate] = useState(initialDraft.hourlyRate)
  const [payFrequency, setPayFrequency] = useState<PayFrequency>(initialDraft.payFrequency)
  const [actualReceived, setActualReceived] = useState(initialDraft.actualReceived)
  const [saved, setSaved] = useState(false)

  const hasValidPayday = isValidIsoDateInput(payday)
  const existingPeriod = snapshot.payPeriods.find((candidate) => candidate.payday === payday) ?? null
  const period = hasValidPayday ? createNextPayPeriod(payday, payFrequency) : null
  const hours = Number.parseFloat(hoursWorked) || 0
  const hourlyRatePence = parsePoundsToPence(hourlyRate)
  const actualAmountPence = actualReceived ? parsePoundsToPence(actualReceived) : null
  const incomePence = calculatePaycheckAmount({
    hoursWorked: hours,
    hourlyRatePence,
    actualAmountPence,
  })
  const calculatedPence = calculatePaycheckAmount({
    hoursWorked: hours,
    hourlyRatePence,
  })
  const canSubmit = hasValidPayday && incomePence > 0
  const allocationSummary = getPaydayAllocationSummary(snapshot, existingPeriod, incomePence)
  const periodDisplay = period ? `${period.startDate} to ${period.endDate}` : 'Choose a valid payday'
  const payToPlanDescription =
    actualAmountPence === null
      ? `${hours || 0} hours at ${formatPence(hourlyRatePence)}`
      : `Actual received replaces the ${formatPence(calculatedPence)} hours estimate.`

  function loadPayday(nextPayday: string) {
    const draft = getPaydayDraft(snapshot, nextPayday)

    setPayday(draft.payday)
    setHoursWorked(draft.hoursWorked)
    setHourlyRate(draft.hourlyRate)
    setPayFrequency(draft.payFrequency)
    setActualReceived(draft.actualReceived)
    setSaved(false)
  }

  async function submitPlan() {
    if (!canSubmit || saved) {
      return
    }

    await actions.createPaycheckPlan({
      payday,
      payFrequency,
      hoursWorked: hours,
      hourlyRatePence,
      actualAmountPence,
      allocations: [],
    })
    setSaved(true)
  }

  return (
    <div className="min-w-0 space-y-6">
      <SectionGrid variant="wideLeft" className="gap-5 lg:items-start">
        <Panel title="Pay planning" description="Build the paycheque plan from payroll details." accent="emerald" density="compact">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Payday">
              <TextInput
                type="date"
                value={payday}
                onChange={(event) => {
                  loadPayday(event.target.value)
                }}
              />
            </Field>
            <Field label="Pay frequency">
              <SelectInput
                value={payFrequency}
                onChange={(event) => {
                  setPayFrequency(event.target.value as PayFrequency)
                  setSaved(false)
                }}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </SelectInput>
            </Field>
            <Field label="Hours worked">
              <TextInput
                inputMode="decimal"
                value={hoursWorked}
                onChange={(event) => {
                  setHoursWorked(event.target.value)
                  setSaved(false)
                }}
              />
            </Field>
            <Field label="Hourly rate">
              <TextInput
                inputMode="decimal"
                value={hourlyRate}
                onChange={(event) => {
                  setHourlyRate(event.target.value)
                  setSaved(false)
                }}
              />
            </Field>
            <Field label="Actual received">
              <TextInput
                inputMode="decimal"
                placeholder="Leave blank"
                value={actualReceived}
                onChange={(event) => {
                  setActualReceived(event.target.value)
                  setSaved(false)
                }}
              />
            </Field>
            <Field label="Pay period">
              <TextInput value={periodDisplay} disabled />
            </Field>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <PaydayInfoTile
              icon={<CalendarDays size={16} />}
              label="Payday"
              value={hasValidPayday ? payday : 'Invalid'}
            />
            <PaydayInfoTile
              icon={<Clock3 size={16} />}
              label="Frequency"
              value={payFrequency}
              capitalize
            />
            <PaydayInfoTile
              icon={<CheckCircle2 size={16} />}
              label="Save mode"
              value={existingPeriod ? 'Update saved plan' : 'New plan'}
            />
          </div>
        </Panel>

        <Panel
          title="Pay plan summary"
          description={period ? periodDisplay : 'Choose a valid payday.'}
          accent={allocationSummary.isOverallocated ? 'amber' : 'blue'}
          density="compact"
          className="lg:sticky lg:top-24"
        >
          <div className="space-y-4">
            <MetricCard
              label="Pay to plan"
              value={formatPence(incomePence)}
              tone="primary"
              detail={payToPlanDescription}
            />

            <div className="grid gap-3">
              <PaydaySummaryRow
                icon={<ReceiptText size={16} />}
                label="Reserved bills"
                value={formatPence(allocationSummary.reservedBillsPence)}
                detail={existingPeriod ? 'Saved recurring reserves for this payday.' : 'No saved bills yet.'}
              />
              <PaydaySummaryRow
                icon={<WalletCards size={16} />}
                label="Manual allocations"
                value={formatPence(allocationSummary.manualAllocationsPence)}
                detail={existingPeriod ? 'Saved pot top-ups and manual allocations.' : 'No manual allocations yet.'}
              />
              <PaydaySummaryRow
                icon={<Banknote size={16} />}
                label="Left unassigned"
                value={formatPence(allocationSummary.leftUnassignedPence)}
                detail={`${formatPence(allocationSummary.allocatedPence)} allocated from this paycheque.`}
                tone={allocationSummary.isOverallocated ? 'warning' : 'success'}
              />
            </div>

            {allocationSummary.isOverallocated && (
              <div className="flex gap-3 rounded-[var(--radius-control)] border border-[color:rgba(183,121,31,0.28)] bg-[color:rgba(183,121,31,0.08)] p-3 text-sm text-[var(--color-warning)]" role="alert">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p className="font-medium">
                  This paycheque is overallocated by {formatPence(allocationSummary.overallocatedPence)}.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <ActionButton disabled={!canSubmit || saved} onClick={submitPlan}>
                {existingPeriod ? 'Update paycheque plan' : 'Confirm paycheque plan'}
              </ActionButton>
              <Pill tone={canSubmit ? 'success' : 'warning'} icon={<WalletCards size={14} />} className="capitalize">
                {payFrequency} plan
              </Pill>
              {saved && (
                <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-success)]">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  Saved locally
                </span>
              )}
            </div>
          </div>
        </Panel>
      </SectionGrid>

      <PayPeriodHistoryPanel snapshot={snapshot} actions={actions} />
    </div>
  )
}

function PaydayInfoTile({
  icon,
  label,
  value,
  capitalize = false,
}: {
  icon: ReactNode
  label: string
  value: string
  capitalize?: boolean
}) {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        <span className="text-[var(--color-emerald)]">{icon}</span>
        {label}
      </div>
      <p className={['mt-1 truncate text-sm font-semibold text-[var(--color-text-primary)]', capitalize ? 'capitalize' : ''].join(' ')}>
        {value}
      </p>
    </div>
  )
}

function PaydaySummaryRow({
  icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  tone?: 'neutral' | 'success' | 'warning'
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex min-w-0 gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-soft)] text-[var(--color-emerald)]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{label}</p>
          <p className="mt-0.5 text-xs leading-5 text-[var(--color-text-muted)]">{detail}</p>
        </div>
      </div>
      <p
        className={[
          'shrink-0 text-sm font-semibold',
          tone === 'warning' ? 'text-[var(--color-warning)]' : '',
          tone === 'success' ? 'text-[var(--color-success)]' : '',
          tone === 'neutral' ? 'text-[var(--color-text-primary)]' : '',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  )
}

function getPaydayDraft(snapshot: PlannerSnapshot, payday: string) {
  const period = snapshot.payPeriods.find((candidate) => candidate.payday === payday)

  if (!period) {
    return {
      payday,
      hoursWorked: String(snapshot.settings.defaultHoursWorked),
      hourlyRate: (snapshot.settings.hourlyRatePence / 100).toFixed(2),
      payFrequency: snapshot.settings.payFrequency,
      actualReceived: '',
    }
  }

  const paycheck = snapshot.paychecks.find((candidate) => candidate.payPeriodId === period.id)

  return {
    payday,
    hoursWorked: paycheck ? String(paycheck.hoursWorked) : String(snapshot.settings.defaultHoursWorked),
    hourlyRate: ((paycheck?.hourlyRatePence ?? snapshot.settings.hourlyRatePence) / 100).toFixed(2),
    payFrequency: period.payFrequency ?? inferPayFrequency(period),
    actualReceived:
      paycheck?.actualAmountPence === null || paycheck?.actualAmountPence === undefined
        ? ''
        : (paycheck.actualAmountPence / 100).toFixed(2),
  }
}

function getPaydayAllocationSummary(snapshot: PlannerSnapshot, period: PayPeriod | null, incomePence: number) {
  const allocations = period
    ? snapshot.potAllocations.filter((allocation) => allocation.payPeriodId === period.id)
    : []
  const reservedBillsPence = allocations
    .filter((allocation) => allocation.source === 'recurring' || Boolean(allocation.recurringPaymentId))
    .reduce((total, allocation) => total + allocation.amountPence, 0)
  const manualAllocationsPence = allocations
    .filter((allocation) => allocation.source !== 'recurring' && !allocation.recurringPaymentId)
    .reduce((total, allocation) => total + allocation.amountPence, 0)
  const allocatedPence = reservedBillsPence + manualAllocationsPence
  const leftUnassignedPence = incomePence - allocatedPence
  const overallocatedPence = Math.max(0, -leftUnassignedPence)

  return {
    reservedBillsPence,
    manualAllocationsPence,
    allocatedPence,
    leftUnassignedPence,
    overallocatedPence,
    isOverallocated: overallocatedPence > 0,
  }
}

function isValidIsoDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function inferPayFrequency(period: PayPeriod): PayFrequency {
  const daysBetweenPaydays =
    Math.round(
      (new Date(`${period.nextPayday}T00:00:00.000Z`).getTime() -
        new Date(`${period.payday}T00:00:00.000Z`).getTime()) /
        (24 * 60 * 60 * 1000),
    ) || 14

  if (daysBetweenPaydays === 7) {
    return 'weekly'
  }

  if (daysBetweenPaydays >= 28) {
    return 'monthly'
  }

  return 'biweekly'
}
