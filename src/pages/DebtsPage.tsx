import { useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowDownRight, BadgePoundSterling, PenLine, Plus, ShieldCheck, Trash2 } from 'lucide-react'

import {
  findPayPeriodForDate,
  formatPence,
  getAppTodayIso,
  getDebtDueAmountAfterReservesAndLinkedPotsPence,
  getLinkedDebtPotPence,
  getDebtSummary,
  parsePoundsToPence,
} from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import {
  Button,
  type CalculationBreakdown,
  CalculationDetails,
  Field,
  FormDrawer,
  Panel,
  ProgressRail,
  SelectInput,
  TextInput,
} from '../components/ui'
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

const emptyDebtForm = (today: string): DebtFormState => ({
  name: '',
  lender: '',
  currentBalance: '',
  minimumPayment: '',
  dueDate: today,
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
  const today = getAppTodayIso(snapshot.settings)
  const [debtForm, setDebtForm] = useState<DebtFormState>(() => emptyDebtForm(today))
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null)
  const [isDebtDrawerOpen, setIsDebtDrawerOpen] = useState(false)
  const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false)
  const activeDebts = snapshot.debts.filter((debt) => debt.status === 'active' && debt.currentBalancePence > 0)
  const visibleDebts = snapshot.debts.filter((debt) => debt.status !== 'archived')
  const [paymentDebtId, setPaymentDebtId] = useState(activeDebts[0]?.id ?? '')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(today)
  const [paymentNote, setPaymentNote] = useState('')
  const selectedPaymentDebt =
    activeDebts.find((debt) => debt.id === paymentDebtId) ?? activeDebts[0] ?? null
  const selectedPaymentDebtId = selectedPaymentDebt?.id ?? ''
  const currentPayPeriod = selectedPayPeriod ?? findPayPeriodForDate(snapshot.payPeriods, today)
  const nextPayPeriod = snapshot.payPeriods
    .filter((period) => period.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  const summary = getDebtSummary(snapshot.debts, snapshot.debtPayments, today, currentPayPeriod, snapshot.debtReserves, snapshot.pots)
  const payPeriodEndDate = currentPayPeriod?.endDate ?? null
  const activeDebtIds = new Set(activeDebts.map((debt) => debt.id))
  const recordedDebtPaymentPence = snapshot.debtPayments
    .filter((payment) => activeDebtIds.has(payment.debtId))
    .reduce((total, payment) => total + payment.amountPence, 0)
  const balanceReductionPence = Math.max(0, summary.totalOriginalAmountPence - summary.totalCurrentBalancePence)
  const payoffPercent = summary.totalOriginalAmountPence > 0
    ? Math.round((summary.totalPaidPence / summary.totalOriginalAmountPence) * 100)
    : 0
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

    closeDebtDrawer()
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
    closePaymentDrawer()
  }

  function openAddDebtDrawer() {
    resetDebtForm()
    setIsDebtDrawerOpen(true)
  }

  function closeDebtDrawer() {
    resetDebtForm()
    setIsDebtDrawerOpen(false)
  }

  function closePaymentDrawer() {
    setPaymentDebtId(activeDebts[0]?.id ?? '')
    setPaymentAmount('')
    setPaymentDate(today)
    setPaymentNote('')
    setIsPaymentDrawerOpen(false)
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
    setIsDebtDrawerOpen(true)
  }

  function resetDebtForm() {
    setEditingDebtId(null)
    setDebtForm(emptyDebtForm(today))
  }

  return (
    <div className="min-w-0 space-y-4">
      <DebtsHero
        totalCurrentBalancePence={summary.totalCurrentBalancePence}
        totalPaidPence={summary.totalPaidPence}
        totalOriginalAmountPence={summary.totalOriginalAmountPence}
        debtDueThisPayPeriodPence={debtDueThisPayPeriodPence}
        overdueDebtCount={summary.overdueDebtCount}
        payoffPercent={payoffPercent}
        currentPayPeriod={currentPayPeriod}
        totalDebtBreakdown={getTotalDebtBreakdown(activeDebts, summary.totalCurrentBalancePence)}
        paidOffBreakdown={getPaidOffBreakdown(recordedDebtPaymentPence, balanceReductionPence, summary.totalPaidPence)}
        dueBreakdown={getDebtDueThisPayPeriodBreakdown({
          currentPayPeriod,
          nextPayPeriod,
          today,
          dueThisPayPeriod,
          debtDueThisPayPeriodPence,
          debtReserves: snapshot.debtReserves,
          pots: snapshot.pots,
        })}
        overdueBreakdown={getOverdueDebtsBreakdown(overdueDebts, summary.overdueDebtCount, today)}
      />

      <FormDrawer
        open={isDebtDrawerOpen}
        title={editingDebtId ? 'Edit debt' : 'Add debt'}
        description="Track what is owed, when the next payment is due, and the running balance."
        closeLabel={editingDebtId ? 'Close edit debt' : 'Close add debt'}
        onClose={closeDebtDrawer}
        footer={
          <>
            <Button variant="secondary" onClick={closeDebtDrawer}>
              Cancel
            </Button>
            <Button onClick={submitDebt} disabled={!canSaveDebt}>
              {editingDebtId ? 'Save debt' : 'Add debt'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
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
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Current balance">
              <TextInput
                inputMode="decimal"
                value={debtForm.currentBalance}
                onChange={(event) => setDebtForm({ ...debtForm, currentBalance: event.target.value })}
                placeholder="850.00"
              />
            </Field>
            <Field label="Minimum payment">
              <TextInput
                inputMode="decimal"
                value={debtForm.minimumPayment}
                onChange={(event) => setDebtForm({ ...debtForm, minimumPayment: event.target.value })}
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
                onChange={(event) => setDebtForm({ ...debtForm, interestRateApr: event.target.value })}
                placeholder="19.9"
              />
            </Field>
          </div>
          {editingDebtId && (
            <Field label="Status">
              <SelectInput
                value={debtForm.status}
                onChange={(event) => setDebtForm({ ...debtForm, status: event.target.value as DebtStatus })}
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
        </div>
      </FormDrawer>

      <FormDrawer
        open={isPaymentDrawerOpen}
        title="Record debt payment"
        description="Payments reduce the selected debt balance immediately."
        closeLabel="Close record debt payment"
        onClose={closePaymentDrawer}
        footer={
          <>
            <Button variant="secondary" onClick={closePaymentDrawer}>
              Cancel
            </Button>
            <Button onClick={submitPayment} disabled={!canRecordPayment}>
              Record payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
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
          {selectedPaymentDebt && (
            <details className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">
              <summary className="cursor-pointer list-none text-sm text-[var(--color-text-muted)]">
                Balance after payment:{' '}
                <span className="font-semibold text-[var(--color-text-primary)]">
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
      </FormDrawer>

      <Panel
        title="Debt list"
        description="Use this to keep payoff progress visible without mixing debts into pots."
        accent="slate"
        density="compact"
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button onClick={openAddDebtDrawer}>
              <Plus size={18} aria-hidden="true" />
              Add debt
            </Button>
            <Button variant="secondary" onClick={() => setIsPaymentDrawerOpen(true)} disabled={activeDebts.length === 0}>
              <BadgePoundSterling size={18} aria-hidden="true" />
              Record payment
            </Button>
          </div>
        }
      >
        <div className="space-y-3 xl:max-h-[820px] xl:overflow-y-auto xl:pr-1">
          {visibleDebts.length > 0 ? (
            visibleDebts.map((debt) => {
              const paidPence = Math.max(0, debt.originalAmountPence - debt.currentBalancePence)
              const linkedPotPence = getLinkedDebtPotPence(snapshot.pots, debt.id)
              const isPaidOff = debt.status === 'paid' || debt.currentBalancePence <= 0
              const coveredPence = isPaidOff
                ? debt.originalAmountPence
                : Math.min(debt.originalAmountPence, paidPence + linkedPotPence)
              const progressPercent =
                debt.originalAmountPence > 0
                  ? Math.round((coveredPence / debt.originalAmountPence) * 100)
                  : 100
              const isOverdue = debt.status === 'active' && debt.dueDate < today
              const isDueThisPayPeriod = Boolean(
                currentPayPeriod && debt.status === 'active' && debt.dueDate >= today && debt.dueDate <= currentPayPeriod.endDate,
              )
              const debtDueAmountPence = getDebtDueAmountAfterReservesAndLinkedPotsPence(debt, snapshot.debtReserves, snapshot.pots)
              const progressLabel =
                linkedPotPence > 0 ? `${formatPence(coveredPence)} covered` : `${formatPence(paidPence)} paid`

              return (
                <DebtListCard
                  key={debt.id}
                  debt={debt}
                  paidPence={paidPence}
                  linkedPotPence={linkedPotPence}
                  coveredPence={coveredPence}
                  progressPercent={progressPercent}
                  progressLabel={progressLabel}
                  isOverdue={isOverdue}
                  isDueThisPayPeriod={isDueThisPayPeriod}
                  debtDueAmountPence={debtDueAmountPence}
                  onEdit={() => startEditingDebt(debt)}
                  onDelete={() => {
                    if (window.confirm(`Delete ${debt.name} and its payment history?`)) {
                      void actions.deleteDebt(debt.id)
                    }
                  }}
                />
              )
            })
          ) : (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] p-6 text-center">
              <p className="text-base font-semibold text-[var(--color-text-primary)]">No debts yet.</p>
              <p className="mt-1 text-sm leading-5 text-[var(--color-text-muted)]">Add a debt to start tracking balances and due dates.</p>
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="Payment history"
        description="Delete a mistaken payment to restore it to the debt balance."
        accent="blue"
        density="compact"
      >
        <div className="space-y-3 xl:max-h-[420px] xl:overflow-y-auto xl:pr-1">
          {snapshot.debtPayments.length > 0 ? (
            <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              {snapshot.debtPayments.slice(0, 12).map((payment) => {
                const debt = snapshot.debts.find((candidate) => candidate.id === payment.debtId)
                const debtName = debt?.name ?? 'Deleted debt'

                return (
                  <div
                    key={payment.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2.5 transition hover:bg-[var(--color-surface-soft)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{debtName}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
                        {payment.date} · {payment.note || 'Payment'}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[var(--color-success)]">
                      -{formatPence(payment.amountPence)}
                    </p>
                    <DebtIconButton
                      tone="danger"
                      onClick={() => {
                        if (window.confirm('Delete this debt payment?')) {
                          void actions.deleteDebtPayment(payment.id)
                        }
                      }}
                      ariaLabel={`Delete payment for ${debtName}`}
                      title={`Delete payment for ${debtName}`}
                    >
                      <Trash2 size={15} />
                    </DebtIconButton>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-text-muted)]">No debt payments yet.</p>
          )}
        </div>
      </Panel>
    </div>
  )
}

function getTotalDebtBreakdown(activeDebts: Debt[], totalCurrentBalancePence: number): CalculationBreakdown {
  return {
    formula: 'Total debt = current balances for active debts above zero.',
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
              label: 'Total debt',
              value: formatPence(totalCurrentBalancePence),
              tone: 'result' as const,
            },
          ]
        : [{ label: 'No active debts', value: formatPence(0), tone: 'result' }],
  }
}

function getPaidOffBreakdown(
  recordedDebtPaymentPence: number,
  balanceReductionPence: number,
  totalPaidPence: number,
): CalculationBreakdown {
  return {
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
        value: formatPence(totalPaidPence),
        detail: 'The app shows whichever is higher so imported balance edits still count.',
        tone: 'result',
      },
    ],
  }
}

function getDebtDueThisPayPeriodBreakdown({
  currentPayPeriod,
  nextPayPeriod,
  today,
  dueThisPayPeriod,
  debtDueThisPayPeriodPence,
  debtReserves,
  pots,
}: {
  currentPayPeriod: PayPeriod | null
  nextPayPeriod: PayPeriod | null
  today: string
  dueThisPayPeriod: Debt[]
  debtDueThisPayPeriodPence: number
  debtReserves: PlannerSnapshot['debtReserves']
  pots: PlannerSnapshot['pots']
}): CalculationBreakdown {
  return {
    formula: currentPayPeriod
      ? `Debt due this pay period = full outstanding balance for active debts due by ${currentPayPeriod.endDate}.`
      : `Debt due this pay period needs a saved pay period that includes ${today}.`,
    lines:
      dueThisPayPeriod.length > 0
        ? [
            ...dueThisPayPeriod.map((debt) => ({
              label: debt.name,
              value: formatPence(getDebtDueAmountAfterReservesAndLinkedPotsPence(debt, debtReserves, pots)),
              detail: getDebtDueDetail(debt, pots, today),
              tone: 'add' as const,
            })),
            {
              label: 'Debt due this pay period',
              value: formatPence(debtDueThisPayPeriodPence),
              detail: currentPayPeriod ? `${currentPayPeriod.startDate} to ${currentPayPeriod.endDate}` : undefined,
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
  }
}

function getOverdueDebtsBreakdown(
  overdueDebts: Debt[],
  overdueDebtCount: number,
  today: string,
): CalculationBreakdown {
  return {
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
              value: String(overdueDebtCount),
              tone: 'result' as const,
            },
          ]
        : [{ label: 'No overdue debts', value: '0', tone: 'result' }],
  }
}

function DebtsHero({
  totalCurrentBalancePence,
  totalPaidPence,
  totalOriginalAmountPence,
  debtDueThisPayPeriodPence,
  overdueDebtCount,
  payoffPercent,
  currentPayPeriod,
  totalDebtBreakdown,
  paidOffBreakdown,
  dueBreakdown,
  overdueBreakdown,
}: {
  totalCurrentBalancePence: number
  totalPaidPence: number
  totalOriginalAmountPence: number
  debtDueThisPayPeriodPence: number
  overdueDebtCount: number
  payoffPercent: number
  currentPayPeriod: PayPeriod | null
  totalDebtBreakdown: CalculationBreakdown
  paidOffBreakdown: CalculationBreakdown
  dueBreakdown: CalculationBreakdown
  overdueBreakdown: CalculationBreakdown
}) {
  const remainingPercent = Math.max(0, 100 - Math.min(100, Math.max(0, payoffPercent)))

  return (
    <section
      aria-label="Debts hero"
      className="fintech-surface relative max-w-full min-w-0 overflow-hidden rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[var(--color-deep-navy)]" aria-hidden="true" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)] lg:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--color-emerald)]">
            <BadgePoundSterling size={18} aria-hidden="true" />
            <h1 className="text-2xl font-semibold leading-8 text-[var(--color-text-primary)] md:text-3xl md:leading-10">Debts</h1>
          </div>
          <p className="mt-4 text-4xl font-semibold leading-10 text-[var(--color-text-primary)]">{formatPence(totalCurrentBalancePence)}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
            {formatPence(totalPaidPence)} cleared from {formatPence(totalOriginalAmountPence)} tracked original debt.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <DebtHeroMetric
            icon={<BadgePoundSterling size={16} />}
            label="Total debt"
            value={formatPence(totalCurrentBalancePence)}
            tone={totalCurrentBalancePence > 0 ? 'warning' : 'muted'}
            breakdown={totalDebtBreakdown}
          />
          <DebtHeroMetric icon={<ShieldCheck size={16} />} label="Paid off" value={`${payoffPercent}%`} tone="good" breakdown={paidOffBreakdown} />
          <DebtHeroMetric
            icon={<ArrowDownRight size={16} />}
            label="Debt due this pay period"
            value={formatPence(debtDueThisPayPeriodPence)}
            tone={debtDueThisPayPeriodPence > 0 ? 'warning' : 'muted'}
            breakdown={dueBreakdown}
          />
          <DebtHeroMetric
            icon={<AlertTriangle size={16} />}
            label="Overdue"
            value={String(overdueDebtCount)}
            tone={overdueDebtCount > 0 ? 'bad' : 'muted'}
            breakdown={overdueBreakdown}
          />
        </div>
      </div>
      <div className="mt-5 border-t border-[var(--color-border)] pt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          <span>{currentPayPeriod ? `${currentPayPeriod.startDate} to ${currentPayPeriod.endDate}` : 'No active pay period'}</span>
          <span>{remainingPercent}% left</span>
        </div>
        <ProgressRail percent={payoffPercent} color="var(--color-emerald)" fillClassName="bg-[var(--color-emerald)]" />
      </div>
    </section>
  )
}

function DebtHeroMetric({
  icon,
  label,
  value,
  tone,
  breakdown,
}: {
  icon: ReactNode
  label: string
  value: string
  tone: 'good' | 'warning' | 'bad' | 'muted'
  breakdown: CalculationBreakdown
}) {
  const toneClassName =
    tone === 'good'
      ? 'border-[color:rgba(20,122,85,0.24)] bg-[rgba(20,122,85,0.06)] text-[var(--color-success)]'
      : tone === 'warning'
        ? 'border-[color:rgba(183,121,31,0.24)] bg-[rgba(183,121,31,0.07)] text-[var(--color-warning)]'
        : tone === 'bad'
          ? 'border-[color:rgba(177,58,50,0.24)] bg-[rgba(177,58,50,0.07)] text-[var(--color-danger)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text-muted)]'

  return (
    <details className={`rounded-[var(--radius-card)] border p-3 ${toneClassName}`}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
          {icon}
          <span>{label}</span>
        </div>
        <p className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">{value}</p>
      </summary>
      <CalculationDetails breakdown={breakdown} />
    </details>
  )
}

function DebtListCard({
  debt,
  paidPence,
  linkedPotPence,
  coveredPence,
  progressPercent,
  progressLabel,
  isOverdue,
  isDueThisPayPeriod,
  debtDueAmountPence,
  onEdit,
  onDelete,
}: {
  debt: Debt
  paidPence: number
  linkedPotPence: number
  coveredPence: number
  progressPercent: number
  progressLabel: string
  isOverdue: boolean
  isDueThisPayPeriod: boolean
  debtDueAmountPence: number
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <article
      role="article"
      aria-label={`${debt.name} debt row`}
      className={`
        rounded-[var(--radius-card)] border bg-[var(--color-surface)] p-3 shadow-none transition hover:bg-[var(--color-surface-soft)]
        ${isOverdue ? 'border-[color:rgba(177,58,50,0.28)]' : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'}
      `}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--color-text-primary)]">{debt.name}</h3>
            <DebtChip label={formatDebtStatusLabel(debt.status)} />
            {isDueThisPayPeriod && <DebtChip label="Due this pay" tone="warning" />}
            {isOverdue && <DebtChip label="Overdue" tone="danger" />}
          </div>
          <p className="mt-1 truncate text-sm text-[var(--color-text-muted)]">{debt.lender}</p>
          {debt.note && <p className="mt-1 truncate text-xs text-[var(--color-text-secondary)]">{debt.note}</p>}
        </div>

        <div className="flex items-center gap-1">
          <DebtIconButton onClick={onEdit} ariaLabel={`Edit ${debt.name}`} title={`Edit ${debt.name}`}>
            <PenLine size={14} />
          </DebtIconButton>
          <DebtIconButton onClick={onDelete} ariaLabel={`Delete ${debt.name}`} title={`Delete ${debt.name}`} tone="danger">
            <Trash2 size={14} />
          </DebtIconButton>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <DebtStat label="Balance" value={formatPence(debt.currentBalancePence)} />
        <DebtStat label="Minimum" value={debt.minimumPaymentPence > 0 ? formatPence(debt.minimumPaymentPence) : 'Optional'} />
        <DebtStat label="Due date" value={formatShortDate(debt.dueDate)} tone={isOverdue ? 'bad' : 'neutral'} />
        <DebtStat label="Due amount" value={formatPence(debtDueAmountPence)} />
        <DebtStat label="In linked pots" value={formatPence(linkedPotPence)} />
        <DebtStat label="Original" value={formatPence(debt.originalAmountPence)} />
      </div>

      <div className="mt-3">
        <details>
          <summary className="cursor-pointer list-none">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-[var(--color-text-muted)]">
              <span>{progressLabel}</span>
              <span>{progressPercent}%</span>
            </div>
            <ProgressRail percent={progressPercent} color="#10b981" fillClassName="bg-emerald-500" />
          </summary>
          <CalculationDetails breakdown={getDebtProgressBreakdown(debt, paidPence, linkedPotPence, coveredPence, progressPercent)} />
        </details>
        {debt.interestRateApr !== null && (
          <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">{`${debt.interestRateApr}% APR`}</p>
        )}
      </div>
    </article>
  )
}

function getDebtProgressBreakdown(
  debt: Debt,
  paidPence: number,
  linkedPotPence: number,
  coveredPence: number,
  progressPercent: number,
): CalculationBreakdown {
  return {
    formula: linkedPotPence > 0
      ? 'Progress = paid amount plus linked pot balance ÷ original debt amount.'
      : 'Progress = paid amount ÷ original debt amount.',
    lines: [
      { label: 'Original debt', value: formatPence(debt.originalAmountPence), tone: 'add' },
      { label: 'Current balance', value: `-${formatPence(debt.currentBalancePence)}`, tone: 'subtract' },
      { label: 'Paid amount', value: formatPence(paidPence), tone: 'result' },
      ...(linkedPotPence > 0
        ? [
            { label: 'In linked pots', value: formatPence(linkedPotPence), tone: 'add' as const },
            { label: 'Covered amount', value: formatPence(coveredPence), tone: 'result' as const },
          ]
        : []),
      { label: 'Progress', value: `${progressPercent}%`, tone: 'result' },
    ],
  }
}

function DebtChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'warning' | 'danger' }) {
  return (
    <span
      className={
        tone === 'danger'
          ? 'shrink-0 rounded-[var(--radius-control)] border border-[color:rgba(177,58,50,0.24)] bg-[rgba(177,58,50,0.08)] px-2 py-1 text-[11px] font-semibold text-[var(--color-danger)]'
          : tone === 'warning'
            ? 'shrink-0 rounded-[var(--radius-control)] border border-[color:rgba(183,121,31,0.24)] bg-[rgba(183,121,31,0.08)] px-2 py-1 text-[11px] font-semibold text-[var(--color-warning)]'
            : 'shrink-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)]'
      }
    >
      {label}
    </span>
  )
}

function DebtIconButton({
  children,
  onClick,
  ariaLabel,
  title,
  tone = 'neutral',
}: {
  children: ReactNode
  onClick: () => void
  ariaLabel: string
  title: string
  tone?: 'neutral' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={
        tone === 'danger'
          ? 'inline-flex size-7 items-center justify-center rounded-md border border-[color:rgba(177,58,50,0.22)] bg-[rgba(177,58,50,0.06)] text-[var(--color-danger)] transition hover:-translate-y-0.5 hover:bg-[rgba(177,58,50,0.1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]'
          : 'inline-flex size-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-emerald)]'
      }
    >
      {children}
    </button>
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
    <div className={tone === 'bad' ? 'rounded-[var(--radius-card)] border border-[color:rgba(177,58,50,0.22)] bg-[rgba(177,58,50,0.06)] p-2.5' : 'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-2.5'}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className={tone === 'bad' ? 'mt-1 text-sm font-semibold text-[var(--color-danger)]' : 'mt-1 text-sm font-semibold text-[var(--color-text-primary)]'}>
        {value}
      </p>
    </div>
  )
}

function formatDebtStatusLabel(status: DebtStatus): string {
  if (status === 'paid') {
    return 'Paid'
  }

  if (status === 'archived') {
    return 'Archived'
  }

  return 'Active'
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function getDebtDueDetail(debt: Debt, pots: PlannerSnapshot['pots'], today: string): string {
  const linkedPotPence = getLinkedDebtPotPence(pots, debt.id)
  const dateDetail = debt.dueDate < today ? `Overdue since ${debt.dueDate}` : `Due ${debt.dueDate}`

  if (linkedPotPence <= 0) {
    return dateDetail
  }

  return `${dateDetail} · ${formatPence(linkedPotPence)} already in linked pots`
}
