import { useState } from 'react'
import { PenLine, Trash2 } from 'lucide-react'

import {
  createNextPayPeriod,
  formatPence,
  getPayPeriodCostSummary,
  parsePoundsToPence,
  type PayPeriodCostSummary,
} from '../domain/money'
import { RecurringCalendar } from '../components/RecurringCalendar'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import { Button, Field, MoneyMetric, Panel, SelectInput, TextInput, type CalculationBreakdown } from '../components/ui'
import type { PayFrequency, PayPeriod, RecurringFrequency, RecurringPriority } from '../types/models'

export function RecurringPage({
  snapshot,
  actions,
  selectedPayPeriod,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
  selectedPayPeriod?: PayPeriod | null
}) {
  const activePots = snapshot.pots.filter((pot) => !pot.archived)
  const activeCards = snapshot.creditCards.filter((card) => !card.archived)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDay, setDueDay] = useState('1')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [priority, setPriority] = useState<RecurringPriority>('essential')
  const [potId, setPotId] = useState(activePots[0]?.id ?? '')
  const [creditCardId, setCreditCardId] = useState('')
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const viewedPeriod = selectedPayPeriod ?? null
  const nextPaydayPeriod = viewedPeriod
    ? getNextPaydayPeriod(viewedPeriod, viewedPeriod.payFrequency ?? snapshot.settings.payFrequency)
    : null
  const nextPaydaySummary = getPayPeriodCostSummary({
    payPeriod: nextPaydayPeriod,
    recurringPayments: snapshot.recurringPayments,
    customPayments: snapshot.customPayments,
    transactions: snapshot.transactions,
    debts: snapshot.debts,
    creditCardRepayments: snapshot.creditCardRepayments,
    debtReserves: snapshot.debtReserves,
  })

  async function submitPayment() {
    const amountPence = parsePoundsToPence(amount)
    const dueDayNumber = Number.parseInt(dueDay, 10)

    if (!name.trim() || !potId || amountPence <= 0 || dueDayNumber < 1 || dueDayNumber > 31) {
      return
    }

    if (editingPaymentId) {
      const currentPayment = snapshot.recurringPayments.find((candidate) => candidate.id === editingPaymentId)
      const updateInput = {
        name: name.trim(),
        amountPence,
        dueDay: dueDayNumber,
        frequency,
        potId,
        priority,
        ...(creditCardId || currentPayment?.creditCardId
          ? {
              creditCardId: creditCardId || null,
            }
          : {}),
      }

      await actions.updateRecurringPayment(editingPaymentId, updateInput)
      resetForm()
      return
    }

    const addInput = {
      name: name.trim(),
      amountPence,
      dueDay: dueDayNumber,
      frequency,
      potId,
      priority,
      ...(creditCardId
        ? {
            creditCardId,
          }
        : {}),
    }

    await actions.addRecurringPayment(addInput)
    resetForm()
  }

  function startEditingPayment(paymentId: string) {
    const payment = snapshot.recurringPayments.find((candidate) => candidate.id === paymentId)

    if (!payment) {
      return
    }

    setEditingPaymentId(payment.id)
    setName(payment.name)
    setAmount((payment.amountPence / 100).toFixed(2))
    setDueDay(String(payment.dueDay ?? 1))
    setFrequency(payment.frequency)
    setPriority(payment.priority)
    setPotId(payment.potId)
    setCreditCardId(payment.creditCardId ?? '')
  }

  function resetForm() {
    setEditingPaymentId(null)
    setName('')
    setAmount('')
    setDueDay('1')
    setFrequency('monthly')
    setPriority('essential')
    setPotId(activePots[0]?.id ?? '')
    setCreditCardId('')
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        <Panel
          title={editingPaymentId ? 'Edit recurring payment' : 'Add recurring payment'}
          description="Bills reserve during the pay period that contains their due day."
        >
        <div className="space-y-4">
          <Field label="Name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Phone bill" />
          </Field>
          <Field label="Amount">
            <TextInput inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="22.00" />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Due day">
              <TextInput inputMode="numeric" value={dueDay} onChange={(event) => setDueDay(event.target.value)} />
            </Field>
            <Field label="Frequency">
              <SelectInput value={frequency} onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </SelectInput>
            </Field>
          </div>
          <Field label="Reserve into pot">
            <SelectInput value={potId} onChange={(event) => setPotId(event.target.value)}>
              {activePots.map((pot) => (
                <option key={pot.id} value={pot.id}>
                  {pot.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Paid on credit card">
            <SelectInput value={creditCardId} onChange={(event) => setCreditCardId(event.target.value)}>
              <option value="">Unlinked</option>
              {activeCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} ({card.provider})
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Priority">
            <SelectInput value={priority} onChange={(event) => setPriority(event.target.value as RecurringPriority)}>
              <option value="essential">Essential</option>
              <option value="important">Important</option>
              <option value="optional">Optional</option>
            </SelectInput>
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={submitPayment}>
              {editingPaymentId ? 'Save recurring payment' : 'Add recurring payment'}
            </Button>
            {editingPaymentId && (
              <Button variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </div>
        </Panel>

        <Panel title="Recurring payments" description="Inactive payments are ignored by payday planning.">
        <div className="space-y-3">
          {snapshot.recurringPayments.length > 0 ? (
            snapshot.recurringPayments.map((payment) => {
              const pot = snapshot.pots.find((candidate) => candidate.id === payment.potId)
              const card = snapshot.creditCards.find((candidate) => candidate.id === payment.creditCardId)

              return (
                <div key={payment.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={payment.active ? 'size-2 rounded-full bg-emerald-500' : 'size-2 rounded-full bg-slate-300'} />
                      <h3 className="text-sm font-semibold text-slate-950">{payment.name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Due day {payment.dueDay} · {payment.frequency} · {pot?.name ?? 'Archived pot'}
                      {card ? ` · ${card.name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-slate-950">{formatPence(payment.amountPence)}</p>
                    <Button variant="secondary" onClick={() => actions.toggleRecurringPayment(payment)}>
                      {payment.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => startEditingPayment(payment.id)}
                      aria-label={`Edit ${payment.name}`}
                    >
                      <PenLine size={16} />
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (window.confirm(`Delete ${payment.name}?`)) {
                          void actions.deleteRecurringPayment(payment.id)
                        }
                      }}
                      aria-label={`Delete ${payment.name}`}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              )
            })
          ) : (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No recurring payments yet.</p>
          )}
        </div>
        </Panel>
      </div>

      <RecurringCalendar snapshot={snapshot} payPeriod={viewedPeriod} />
      <NextPaydayOwedPanel period={nextPaydayPeriod} summary={nextPaydaySummary} />
    </div>
  )
}

function NextPaydayOwedPanel({
  period,
  summary,
}: {
  period: PayPeriod | null
  summary: PayPeriodCostSummary
}) {
  return (
    <Panel
      title="What you owe next payday"
      description={
        period
          ? `${period.startDate} to ${period.endDate}`
          : 'Create a paycheck plan to preview the next payday period.'
      }
    >
      {period ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
            <MoneyMetric
              label="Total owed next payday"
              value={formatPence(summary.totalCostsPence)}
              tone={summary.totalCostsPence > 0 ? 'warning' : 'neutral'}
              breakdown={getNextPaydayOwedBreakdown(summary, period)}
            />
            <MoneyMetric
              label="Debt due"
              value={formatPence(summary.debtMinimumsPence)}
              tone={summary.debtMinimumsPence > 0 ? 'warning' : 'neutral'}
              breakdown={{
                formula: 'Debt due = outstanding balances due by the end of this next pay period after planned reserves.',
                lines: [
                  {
                    label: 'Debt due',
                    value: formatPence(summary.debtMinimumsPence),
                    detail: `Due by ${period.endDate}, after accepted debt reserves are subtracted.`,
                    tone: 'result',
                  },
                ],
              }}
            />
            <MoneyMetric
              label="Money left estimate"
              value={formatPence(summary.moneyLeftPence)}
              tone={summary.moneyLeftPence < 0 ? 'bad' : 'good'}
              breakdown={{
                formula: 'Money left estimate = last saved pay - next payday costs.',
                lines: [
                  { label: 'Last saved pay', value: formatPence(summary.payReceivedPence), tone: 'add' },
                  { label: 'Next payday costs', value: `-${formatPence(summary.totalCostsPence)}`, tone: 'subtract' },
                  { label: 'Money left estimate', value: formatPence(summary.moneyLeftPence), tone: 'result' },
                ],
                note: 'This preview uses the last paycheck amount until you save the next payday plan.',
              }}
            />
          </div>

          <details className="rounded-lg border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer list-none px-4 py-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-slate-950">Dated items in this preview</p>
                <p className="text-xs font-semibold text-slate-500">{summary.items.length} items</p>
              </div>
            </summary>
            <div className="space-y-2 border-t border-slate-200 p-3">
              {summary.items.length > 0 ? (
                summary.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 rounded-md bg-white px-3 py-2 text-sm sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{item.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.date} · {formatCostSource(item.source)}
                      </p>
                    </div>
                    <p className={item.amountPence < 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-950'}>
                      {item.amountPence < 0 ? '-' : ''}
                      {formatPence(Math.abs(item.amountPence))}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-md bg-white px-3 py-2 text-sm text-slate-500">
                  Nothing is dated inside the next payday period yet.
                </p>
              )}
            </div>
          </details>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
          No payday plan is available to build a next-period preview.
        </p>
      )}
    </Panel>
  )
}

function getNextPaydayOwedBreakdown(
  summary: PayPeriodCostSummary,
  period: PayPeriod,
): CalculationBreakdown {
  return {
    formula: 'Total owed next payday = recurring + saved payments + manual spending + debt reserves + debt due + credit-card net.',
    lines: [
      {
        label: 'Recurring not on cards',
        value: formatPence(summary.directRecurringPence),
        detail: `Due from ${period.startDate} to ${period.endDate}.`,
        tone: 'add',
      },
      {
        label: 'Saved payments not on cards',
        value: formatPence(summary.savedPaymentsPence),
        detail: 'One-off saved payments due in this next pay period.',
        tone: 'add',
      },
      {
        label: 'Manual spending not on cards',
        value: formatPence(summary.manualSpendingPence),
        detail: 'Manual spending already dated inside this next pay period.',
        tone: 'add',
      },
      {
        label: 'Debt reserves',
        value: formatPence(summary.debtReservesPence),
        detail: 'Accepted set-asides already planned for this next period.',
        tone: 'add',
      },
      {
        label: 'Debt due',
        value: formatPence(summary.debtMinimumsPence),
        detail: 'Remaining outstanding balances overdue or due by this next period end.',
        tone: 'add',
      },
      {
        label: 'Credit-card charges',
        value: formatPence(summary.creditCardChargesPence),
        detail: 'Recurring, saved, and manual spends linked to cards.',
        tone: 'add',
      },
      {
        label: 'Card repayments',
        value: `-${formatPence(summary.creditCardRepaymentsPence)}`,
        detail: 'Repayments dated inside this next pay period.',
        tone: 'subtract',
      },
      {
        label: 'Credit-card net used',
        value: formatPence(summary.creditCardNetPence),
        detail: 'Card charges minus repayments, never below zero.',
        tone: 'result',
      },
      {
        label: 'Total owed next payday',
        value: formatPence(summary.totalCostsPence),
        tone: 'result',
      },
    ],
    note: `${summary.items.length} dated items feed this next-payday preview.`,
  }
}

function getNextPaydayPeriod(currentPeriod: PayPeriod, frequency: PayFrequency): PayPeriod {
  const nextDates = createNextPayPeriod(currentPeriod.nextPayday, frequency)

  return {
    id: 'next-payday-preview',
    startDate: nextDates.startDate,
    endDate: nextDates.endDate,
    payday: currentPeriod.nextPayday,
    nextPayday: nextDates.nextPayday,
    payFrequency: frequency,
    incomePence: currentPeriod.incomePence,
    status: 'planned',
    createdAt: currentPeriod.updatedAt,
    updatedAt: currentPeriod.updatedAt,
  }
}

function formatCostSource(source: PayPeriodCostSummary['items'][number]['source']): string {
  if (source === 'recurring') {
    return 'Recurring'
  }

  if (source === 'saved_payment') {
    return 'Saved payment'
  }

  if (source === 'manual_spend') {
    return 'Manual spend'
  }

  if (source === 'debt_minimum') {
    return 'Debt due'
  }

  if (source === 'debt_reserve') {
    return 'Debt reserve'
  }

  return 'Card repayment'
}
