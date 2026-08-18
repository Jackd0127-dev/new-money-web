import { useState } from 'react'
import { PenLine, Trash2 } from 'lucide-react'

import {
  findPayPeriodForDate,
  formatPence,
  getDebtDueAmountAfterReservesPence,
  getDebtSummary,
  parsePoundsToPence,
  toIsoDate,
} from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import { Button, CalculationDetails, Field, MoneyMetric, Panel, SelectInput, TextInput } from '../components/ui'
import type { Debt, DebtStatus, PayPeriod } from '../types/models'

interface DebtFormState {
  name: string
  lender: string
  currentBalance: string
  minimumPayment: string
  dueDate: string
  interestRateApr: string
  note: string
  status: DebtStatus
}

const emptyDebtForm = (): DebtFormState => ({
  name: '',
  lender: '',
  currentBalance: '',
  minimumPayment: '',
  dueDate: toIsoDate(new Date()),
  interestRateApr: '',
  note: '',
  status: 'active',
})

export function DebtsPage({
  snapshot,
  actions,
  selectedPayPeriod,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
  selectedPayPeriod?: PayPeriod | null
}) {
  const [debtForm, setDebtForm] = useState<DebtFormState>(emptyDebtForm)
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null)
  const activeDebts = snapshot.debts.filter((debt) => debt.status === 'active' && debt.currentBalancePence > 0)
  const visibleDebts = snapshot.debts.filter((debt) => debt.status !== 'archived')
  const [paymentDebtId, setPaymentDebtId] = useState(activeDebts[0]?.id ?? '')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(toIsoDate(new Date()))
  const [paymentNote, setPaymentNote] = useState('')
  const selectedPaymentDebt =
    activeDebts.find((debt) => debt.id === paymentDebtId) ?? activeDebts[0] ?? null
  const selectedPaymentDebtId = selectedPaymentDebt?.id ?? ''
  const today = toIsoDate(new Date())
  const currentPayPeriod = selectedPayPeriod ?? findPayPeriodForDate(snapshot.payPeriods, today)
  const nextPayPeriod = snapshot.payPeriods
    .filter((period) => period.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  const summary = getDebtSummary(snapshot.debts, snapshot.debtPayments, today, currentPayPeriod, snapshot.debtReserves)
  const payPeriodEndDate = currentPayPeriod?.endDate ?? null
  const activeDebtIds = new Set(activeDebts.map((debt) => debt.id))
  const recordedDebtPaymentPence = snapshot.debtPayments
    .filter((payment) => activeDebtIds.has(payment.debtId))
    .reduce((total, payment) => total + payment.amountPence, 0)
  const balanceReductionPence = Math.max(0, summary.totalOriginalAmountPence - summary.totalCurrentBalancePence)
  const dueThisPayPeriod = payPeriodEndDate
    ? activeDebts.filter((debt) => debt.dueDate <= payPeriodEndDate)
    : []
  const debtDueThisPayPeriodPence = summary.debtDueThisPayPeriodPence
  const overdueDebts = activeDebts.filter((debt) => debt.dueDate < today)
  const parsedDebtBalancePence = parsePoundsToPence(debtForm.currentBalance)
  const parsedMinimumPence = parsePoundsToPence(debtForm.minimumPayment)
  const parsedPaymentPence = parsePoundsToPence(paymentAmount)
  const canSaveDebt =
    debtForm.name.trim().length > 0 &&
    debtForm.lender.trim().length > 0 &&
    debtForm.dueDate.length > 0 &&
    parsedDebtBalancePence >= 0
  const canRecordPayment = Boolean(selectedPaymentDebtId) && parsedPaymentPence > 0

  async function submitDebt() {
    if (!canSaveDebt) {
      return
    }

    const interestRateApr = debtForm.interestRateApr.trim()
      ? Number.parseFloat(debtForm.interestRateApr)
      : null
    const payload = {
      name: debtForm.name.trim(),
      lender: debtForm.lender.trim(),
      currentBalancePence: parsedDebtBalancePence,
      minimumPaymentPence: Math.max(0, parsedMinimumPence),
      dueDate: debtForm.dueDate,
      interestRateApr: Number.isFinite(interestRateApr) ? interestRateApr : null,
      note: debtForm.note.trim(),
    }

    if (editingDebtId) {
      await actions.updateDebt(editingDebtId, {
        ...payload,
        status: parsedDebtBalancePence > 0 ? debtForm.status : 'paid',
      })
    } else {
      await actions.addDebt(payload)
    }

    resetDebtForm()
  }

  async function submitPayment() {
    if (!canRecordPayment || !selectedPaymentDebtId) {
      return
    }

    await actions.addDebtPayment({
      debtId: selectedPaymentDebtId,
      amountPence: parsedPaymentPence,
      date: paymentDate,
      note: paymentNote.trim(),
    })
    setPaymentAmount('')
    setPaymentDate(toIsoDate(new Date()))
    setPaymentNote('')
  }

  function startEditingDebt(debt: Debt) {
    setEditingDebtId(debt.id)
    setDebtForm({
      name: debt.name,
      lender: debt.lender,
      currentBalance: (debt.currentBalancePence / 100).toFixed(2),
      minimumPayment: (debt.minimumPaymentPence / 100).toFixed(2),
      dueDate: debt.dueDate,
      interestRateApr: debt.interestRateApr === null ? '' : String(debt.interestRateApr),
      note: debt.note,
      status: debt.status,
    })
  }

  function resetDebtForm() {
    setEditingDebtId(null)
    setDebtForm(emptyDebtForm())
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MoneyMetric
          label="Active debt"
          value={formatPence(summary.totalCurrentBalancePence)}
          tone={summary.totalCurrentBalancePence > 0 ? 'warning' : 'good'}
          breakdown={{
            formula: 'Active debt = current balances for active debts above zero.',
            lines:
              activeDebts.length > 0
                ? [
                    ...activeDebts.map((debt) => ({
                      label: debt.name,
                      value: formatPence(debt.currentBalancePence),
                      detail: debt.lender,
                      tone: 'add' as const,
                    })),
                    {
                      label: 'Active debt',
                      value: formatPence(summary.totalCurrentBalancePence),
                      tone: 'result' as const,
                    },
                  ]
                : [{ label: 'No active debts', value: formatPence(0), tone: 'result' }],
          }}
        />
        <MoneyMetric
          label="Paid off"
          value={formatPence(summary.totalPaidPence)}
          tone="good"
          breakdown={{
            formula: 'Paid off uses the larger of recorded payments or balance reduction.',
            lines: [
              {
                label: 'Recorded payments',
                value: formatPence(recordedDebtPaymentPence),
                detail: 'Debt payment entries linked to currently active debts.',
                tone: 'add',
              },
              {
                label: 'Balance reduction',
                value: formatPence(balanceReductionPence),
                detail: 'Original active debt total minus current active balance.',
                tone: 'add',
              },
              {
                label: 'Paid off shown',
                value: formatPence(summary.totalPaidPence),
                detail: 'The app shows whichever is higher so imported balance edits still count.',
                tone: 'result',
              },
            ],
          }}
        />
        <MoneyMetric
          label="Debt due this pay period"
          value={formatPence(debtDueThisPayPeriodPence)}
          tone={debtDueThisPayPeriodPence > 0 ? 'warning' : 'neutral'}
          breakdown={{
            formula: currentPayPeriod
              ? `Debt due this pay period = full outstanding balance for active debts due by ${currentPayPeriod.endDate}.`
              : `Debt due this pay period needs a saved pay period that includes ${today}.`,
            lines:
              dueThisPayPeriod.length > 0
                ? [
                    ...dueThisPayPeriod.map((debt) => ({
                      label: debt.name,
                      value: formatPence(getDebtDueAmountAfterReservesPence(debt, snapshot.debtReserves)),
                      detail: debt.dueDate < today ? `Overdue since ${debt.dueDate}` : `Due ${debt.dueDate}`,
                      tone: 'add' as const,
                    })),
                    {
                      label: 'Debt due this pay period',
                      value: formatPence(debtDueThisPayPeriodPence),
                      detail: currentPayPeriod
                        ? `${currentPayPeriod.startDate} to ${currentPayPeriod.endDate}`
                        : undefined,
                      tone: 'result' as const,
                    },
                  ]
                : [
                    {
                      label: currentPayPeriod ? 'No debts due this pay period' : 'No active pay period today',
                      value: formatPence(0),
                      detail: currentPayPeriod
                        ? `${currentPayPeriod.startDate} to ${currentPayPeriod.endDate}`
                        : nextPayPeriod
                          ? `Next saved period starts ${nextPayPeriod.startDate}; next payday is ${nextPayPeriod.nextPayday}.`
                          : 'Create a paycheck plan to set the pay-period window.',
                      tone: 'result',
                    },
                  ],
          }}
        />
        <MoneyMetric
          label="Overdue debts"
          value={String(summary.overdueDebtCount)}
          tone={summary.overdueDebtCount > 0 ? 'bad' : 'neutral'}
          breakdown={{
            formula: `Overdue debts = active debts with a due date before ${today}.`,
            lines:
              overdueDebts.length > 0
                ? [
                    ...overdueDebts.map((debt) => ({
                      label: debt.name,
                      value: debt.dueDate,
                      detail: `${debt.lender} · ${formatPence(debt.currentBalancePence)} balance`,
                      tone: 'subtract' as const,
                    })),
                    {
                      label: 'Overdue debts',
                      value: String(summary.overdueDebtCount),
                      tone: 'result' as const,
                    },
                  ]
                : [{ label: 'No overdue debts', value: '0', tone: 'result' }],
          }}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel
          title={editingDebtId ? 'Edit debt' : 'Add debt'}
          description="Track what is owed, when the next payment is due, and the running balance."
        >
          <div className="space-y-4">
            <Field label="Debt name">
              <TextInput
                value={debtForm.name}
                onChange={(event) => setDebtForm({ ...debtForm, name: event.target.value })}
                placeholder="Credit card"
              />
            </Field>
            <Field label="Lender">
              <TextInput
                value={debtForm.lender}
                onChange={(event) => setDebtForm({ ...debtForm, lender: event.target.value })}
                placeholder="Bank or provider"
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Current balance">
                <TextInput
                  inputMode="decimal"
                  value={debtForm.currentBalance}
                  onChange={(event) =>
                    setDebtForm({ ...debtForm, currentBalance: event.target.value })
                  }
                  placeholder="850.00"
                />
              </Field>
              <Field label="Minimum payment">
                <TextInput
                  inputMode="decimal"
                  value={debtForm.minimumPayment}
                  onChange={(event) =>
                    setDebtForm({ ...debtForm, minimumPayment: event.target.value })
                  }
                  placeholder="Optional"
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Due date">
                <TextInput
                  type="date"
                  value={debtForm.dueDate}
                  onChange={(event) => setDebtForm({ ...debtForm, dueDate: event.target.value })}
                />
              </Field>
              <Field label="APR %">
                <TextInput
                  inputMode="decimal"
                  value={debtForm.interestRateApr}
                  onChange={(event) =>
                    setDebtForm({ ...debtForm, interestRateApr: event.target.value })
                  }
                  placeholder="19.9"
                />
              </Field>
            </div>
            {editingDebtId && (
              <Field label="Status">
                <SelectInput
                  value={debtForm.status}
                  onChange={(event) =>
                    setDebtForm({ ...debtForm, status: event.target.value as DebtStatus })
                  }
                >
                  <option value="active">Active</option>
                  <option value="paid">Paid</option>
                  <option value="archived">Archived</option>
                </SelectInput>
              </Field>
            )}
            <Field label="Note">
              <TextInput
                value={debtForm.note}
                onChange={(event) => setDebtForm({ ...debtForm, note: event.target.value })}
                placeholder="Balance transfer, account note"
              />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button onClick={submitDebt} disabled={!canSaveDebt}>
                {editingDebtId ? 'Save debt' : 'Add debt'}
              </Button>
              {editingDebtId && (
                <Button variant="secondary" onClick={resetDebtForm}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Record debt payment" description="Payments reduce the selected debt balance immediately.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Debt">
              <SelectInput
                value={selectedPaymentDebtId}
                onChange={(event) => setPaymentDebtId(event.target.value)}
                disabled={activeDebts.length === 0}
              >
                {activeDebts.length > 0 ? (
                  activeDebts.map((debt) => (
                    <option key={debt.id} value={debt.id}>
                      {debt.name} · {formatPence(debt.currentBalancePence)}
                    </option>
                  ))
                ) : (
                  <option value="">No active debts</option>
                )}
              </SelectInput>
            </Field>
            <Field label="Payment amount">
              <TextInput
                inputMode="decimal"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                placeholder="25.00"
              />
            </Field>
            <Field label="Payment date">
              <TextInput
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </Field>
            <Field label="Payment note">
              <TextInput
                value={paymentNote}
                onChange={(event) => setPaymentNote(event.target.value)}
                placeholder="Extra payment"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={submitPayment} disabled={!canRecordPayment}>
              Record payment
            </Button>
            {selectedPaymentDebt && (
              <details className="rounded-md bg-slate-50 px-3 py-2">
                <summary className="cursor-pointer list-none text-sm text-slate-500">
                  Balance after payment:{' '}
                  <span className="font-semibold text-slate-950">
                    {formatPence(Math.max(0, selectedPaymentDebt.currentBalancePence - parsedPaymentPence))}
                  </span>
                </summary>
                <CalculationDetails
                  breakdown={{
                    formula: 'Balance after payment = current balance - typed payment amount, floored at zero.',
                    lines: [
                      { label: 'Current balance', value: formatPence(selectedPaymentDebt.currentBalancePence), tone: 'add' },
                      { label: 'Typed payment', value: `-${formatPence(parsedPaymentPence)}`, tone: 'subtract' },
                      {
                        label: 'Balance after payment',
                        value: formatPence(Math.max(0, selectedPaymentDebt.currentBalancePence - parsedPaymentPence)),
                        tone: 'result',
                      },
                    ],
                  }}
                />
              </details>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Debt list" description="Use this to keep payoff progress visible without mixing debts into pots.">
        <div className="space-y-4">
          {visibleDebts.length > 0 ? (
            visibleDebts.map((debt) => {
              const paidPence = Math.max(0, debt.originalAmountPence - debt.currentBalancePence)
              const progressPercent =
                debt.originalAmountPence > 0
                  ? Math.round((paidPence / debt.originalAmountPence) * 100)
                  : 100
              const isOverdue = debt.status === 'active' && debt.dueDate < today
              const debtDueAmountPence = getDebtDueAmountAfterReservesPence(debt, snapshot.debtReserves)

              return (
                <div key={debt.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-950">{debt.name}</h3>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-600">
                          {debt.status}
                        </span>
                        {isOverdue && (
                          <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                            Overdue
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{debt.lender}</p>
                      {debt.note && <p className="mt-2 text-sm text-slate-600">{debt.note}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="secondary" onClick={() => startEditingDebt(debt)} aria-label={`Edit ${debt.name}`}>
                        <PenLine size={16} />
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => {
                          if (window.confirm(`Delete ${debt.name} and its payment history?`)) {
                            void actions.deleteDebt(debt.id)
                          }
                        }}
                        aria-label={`Delete ${debt.name}`}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-5">
                    <DebtStat label="Balance" value={formatPence(debt.currentBalancePence)} />
                    <DebtStat label="Original" value={formatPence(debt.originalAmountPence)} />
                    <DebtStat label="Due amount" value={formatPence(debtDueAmountPence)} />
                    <DebtStat label="Minimum" value={debt.minimumPaymentPence > 0 ? formatPence(debt.minimumPaymentPence) : 'Optional'} />
                    <DebtStat
                      label="Due"
                      value={formatShortDate(debt.dueDate)}
                      tone={isOverdue ? 'bad' : 'neutral'}
                    />
                  </div>

                  <div className="mt-4">
                    <details>
                      <summary className="cursor-pointer list-none">
                        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                          <span>{formatPence(paidPence)} paid</span>
                          <span>{progressPercent}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                          />
                        </div>
                      </summary>
                      <CalculationDetails
                        breakdown={{
                          formula: 'Progress = paid amount ÷ original debt amount.',
                          lines: [
                            { label: 'Original debt', value: formatPence(debt.originalAmountPence), tone: 'add' },
                            { label: 'Current balance', value: `-${formatPence(debt.currentBalancePence)}`, tone: 'subtract' },
                            { label: 'Paid amount', value: formatPence(paidPence), tone: 'result' },
                            { label: 'Progress', value: `${progressPercent}%`, tone: 'result' },
                          ],
                        }}
                      />
                    </details>
                    {debt.interestRateApr !== null && (
                      <p className="mt-2 text-xs text-slate-500">{debt.interestRateApr}% APR</p>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No debts tracked yet.</p>
          )}
        </div>
      </Panel>

      <Panel title="Payment history" description="Delete a mistaken payment to restore it to the debt balance.">
        <div className="space-y-3">
          {snapshot.debtPayments.length > 0 ? (
            snapshot.debtPayments.slice(0, 12).map((payment) => {
              const debt = snapshot.debts.find((candidate) => candidate.id === payment.debtId)

              return (
                <div
                  key={payment.id}
                  className="flex flex-col gap-3 rounded-lg bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {debt?.name ?? 'Deleted debt'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {payment.date} · {payment.note || 'Payment'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-emerald-700">
                      -{formatPence(payment.amountPence)}
                    </p>
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (window.confirm('Delete this debt payment?')) {
                          void actions.deleteDebtPayment(payment.id)
                        }
                      }}
                      aria-label={`Delete payment for ${debt?.name ?? 'debt'}`}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              )
            })
          ) : (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No debt payments yet.</p>
          )}
        </div>
      </Panel>
    </div>
  )
}

function DebtStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'bad'
}) {
  return (
    <div className={tone === 'bad' ? 'rounded-lg bg-red-50 p-3' : 'rounded-lg bg-slate-50 p-3'}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={tone === 'bad' ? 'mt-1 text-sm font-semibold text-red-700' : 'mt-1 text-sm font-semibold text-slate-950'}>
        {value}
      </p>
    </div>
  )
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00.000Z`))
}
