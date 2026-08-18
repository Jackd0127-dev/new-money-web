import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

import {
  calculatePaycheckAmount,
  createNextPayPeriod,
  formatPence,
  parsePoundsToPence,
  toIsoDate,
} from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import {
  Button,
  Field,
  MoneyMetric,
  Panel,
  SelectInput,
  TextInput,
  type CalculationBreakdown,
  type CalculationLine,
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
    selectedPayPeriod?.payday ?? snapshot.payPeriods[0]?.payday ?? toIsoDate(new Date()),
  )
  const [payday, setPayday] = useState(initialDraft.payday)
  const [hoursWorked, setHoursWorked] = useState(initialDraft.hoursWorked)
  const [hourlyRate, setHourlyRate] = useState(initialDraft.hourlyRate)
  const [payFrequency, setPayFrequency] = useState<PayFrequency>(initialDraft.payFrequency)
  const [actualReceived, setActualReceived] = useState(initialDraft.actualReceived)
  const [saved, setSaved] = useState(false)

  const existingPeriod = snapshot.payPeriods.find((candidate) => candidate.payday === payday) ?? null
  const period = createNextPayPeriod(payday, payFrequency)
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
  const canSubmit = incomePence > 0

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
    <div className="max-w-3xl">
      <Panel title="Payday wizard" description="Enter pay details for this payday.">
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
          <Field label="Actual received" hint="Optional. If payroll differs, this overrides the estimate.">
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
            <TextInput value={`${period.startDate} to ${period.endDate}`} disabled />
          </Field>
        </div>

        <div className="mt-5">
          <MoneyMetric
            label="Pay to plan"
            value={formatPence(incomePence)}
            tone="primary"
            breakdown={getPayToPlanBreakdown({
              actualAmountPence,
              calculatedPence,
              hourlyRatePence,
              hours,
              incomePence,
            })}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button disabled={!canSubmit || saved} onClick={submitPlan}>
            {existingPeriod ? 'Update paycheck plan' : 'Confirm paycheck plan'}
          </Button>
          <span className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium capitalize text-slate-700">
            {payFrequency} plan
          </span>
          {saved && (
            <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 size={18} />
              Saved locally
            </span>
          )}
        </div>
      </Panel>
    </div>
  )
}

function getPayToPlanBreakdown({
  actualAmountPence,
  calculatedPence,
  hourlyRatePence,
  hours,
  incomePence,
}: {
  actualAmountPence: number | null
  calculatedPence: number
  hourlyRatePence: number
  hours: number
  incomePence: number
}): CalculationBreakdown {
  const lines: CalculationLine[] = [
    {
      label: 'Hours worked',
      value: String(hours),
      tone: 'muted' as const,
    },
    {
      label: 'Hourly rate',
      value: formatPence(hourlyRatePence),
      tone: 'muted' as const,
    },
    {
      label: 'Hours estimate',
      value: formatPence(calculatedPence),
      detail: `${hours} hours × ${formatPence(hourlyRatePence)} per hour.`,
      tone: 'add' as const,
    },
  ]

  if (actualAmountPence !== null) {
    lines.push({
      label: 'Actual received override',
      value: formatPence(actualAmountPence),
      detail: 'Because actual received is filled in, this replaces the hours estimate.',
      tone: 'result' as const,
    })
  }

  lines.push({
    label: 'Pay to plan',
    value: formatPence(incomePence),
    tone: 'result' as const,
  })

  return {
    formula: actualAmountPence === null ? 'Pay to plan = hours worked × hourly rate.' : 'Pay to plan = actual received.',
    lines,
    note: 'This is the income saved to the paycheck plan when you confirm or update it.',
  }
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
