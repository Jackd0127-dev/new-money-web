import { useState } from 'react'
import { PenLine, Trash2 } from 'lucide-react'

import { findPayPeriodForDate, formatPence, parsePoundsToPence, toIsoDate } from '../domain/money'
import type {
  PlannerActions,
  PlannerSnapshot,
  TransactionInput,
  TransactionUpdateInput,
} from '../hooks/usePlannerData'
import { Button, CalculationDetails, Field, Panel, SelectInput, TextInput, type CalculationBreakdown } from '../components/ui'
import type { PaymentMethod, PayPeriod } from '../types/models'

const quickAmounts = ['3.00', '5.00', '10.00', '20.00', '50.00']

export function SpendingPage({
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
  const [potId, setPotId] = useState(activePots[0]?.id ?? '')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pot')
  const [creditCardId, setCreditCardId] = useState(activeCards[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(toIsoDate(new Date()))
  const [note, setNote] = useState('')
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
  const selectedPot = activePots.find((pot) => pot.id === potId)
  const selectedCard = activeCards.find((card) => card.id === creditCardId)
  const recentNotes = Array.from(
    new Set(
      snapshot.transactions
        .map((transaction) => transaction.note.trim())
        .filter((candidate) => candidate && candidate !== 'Manual spend'),
    ),
  ).slice(0, 4)
  const parsedAmountPence = parsePoundsToPence(amount)
  const canSubmitSpend =
    parsedAmountPence > 0 && (paymentMethod === 'pot' ? Boolean(potId) : Boolean(creditCardId))
  const groupedTransactions = groupTransactionsByPeriod(snapshot.transactions, snapshot, selectedPayPeriod ?? null)

  async function submitTransaction() {
    const amountPence = parsedAmountPence

    if (amountPence <= 0 || (paymentMethod === 'pot' && !potId) || (paymentMethod === 'credit_card' && !creditCardId)) {
      return
    }

    if (editingTransactionId) {
      const updateInput: TransactionUpdateInput = {
        potId: paymentMethod === 'pot' ? potId : null,
        amountPence,
        date,
        note: note.trim() || 'Manual spend',
        paymentMethod,
        creditCardId: paymentMethod === 'credit_card' ? creditCardId : null,
      }

      await actions.updateTransaction(editingTransactionId, updateInput)
      resetForm()
      return
    }

    const addInput: TransactionInput = {
      potId: paymentMethod === 'pot' ? potId : null,
      amountPence,
      type: 'spending',
      date,
      note: note.trim() || 'Manual spend',
      payPeriodId: findPayPeriodForDate(snapshot.payPeriods, date)?.id ?? null,
      paymentMethod,
      creditCardId: paymentMethod === 'credit_card' ? creditCardId : null,
    }

    await actions.addTransaction(addInput)
    resetForm()
  }

  function startEditingTransaction(transactionId: string) {
    const transaction = snapshot.transactions.find((candidate) => candidate.id === transactionId)

    if (!transaction) {
      return
    }

    setEditingTransactionId(transaction.id)
    setPotId(transaction.potId ?? activePots[0]?.id ?? '')
    setPaymentMethod(transaction.paymentMethod ?? 'pot')
    setCreditCardId(transaction.creditCardId ?? activeCards[0]?.id ?? '')
    setAmount((transaction.amountPence / 100).toFixed(2))
    setDate(transaction.date)
    setNote(transaction.note)
  }

  function resetForm() {
    setEditingTransactionId(null)
    setPotId(activePots[0]?.id ?? '')
    setPaymentMethod('pot')
    setCreditCardId(activeCards[0]?.id ?? '')
    setAmount('')
    setDate(toIsoDate(new Date()))
    setNote('')
  }

  function changePaymentMethod(nextMethod: PaymentMethod) {
    setPaymentMethod(nextMethod)

    if (nextMethod === 'credit_card' && !creditCardId) {
      setCreditCardId(activeCards[0]?.id ?? '')
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
      <Panel
        title={editingTransactionId ? 'Edit spending entry' : 'Quick spend'}
        description="Choose whether the money came from a pot or a credit card."
      >
        <div className="space-y-4">
          <Field label="Amount">
            <TextInput inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="12.50" />
          </Field>
          <div className="flex flex-wrap gap-2" aria-label="Quick amounts">
            {quickAmounts.map((quickAmount) => (
              <button
                key={quickAmount}
                type="button"
                onClick={() => setAmount(quickAmount)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {formatPence(parsePoundsToPence(quickAmount))}
              </button>
            ))}
          </div>
          <Field label="Payment method">
            <SelectInput value={paymentMethod} onChange={(event) => changePaymentMethod(event.target.value as PaymentMethod)}>
              <option value="pot">Pot</option>
              <option value="credit_card" disabled={activeCards.length === 0}>
                Credit card
              </option>
            </SelectInput>
          </Field>
          {paymentMethod === 'pot' && (
            <Field label="Pot">
              <SelectInput value={potId} onChange={(event) => setPotId(event.target.value)}>
                {activePots.map((pot) => (
                  <option key={pot.id} value={pot.id}>
                    {pot.name} · {formatPence(pot.balancePence)}
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}
          {paymentMethod === 'credit_card' && (
            <Field label="Credit card">
              <SelectInput value={creditCardId} onChange={(event) => setCreditCardId(event.target.value)}>
                {activeCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name} ({card.provider})
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}
          <Field label="Date">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              <Button variant="secondary" onClick={() => setDate(toIsoDate(new Date()))}>
                Today
              </Button>
            </div>
          </Field>
          <Field label="Note">
            <TextInput value={note} onChange={(event) => setNote(event.target.value)} placeholder="Groceries" />
          </Field>
          {recentNotes.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Recent spending suggestions">
              {recentNotes.map((recentNote) => (
                <button
                  key={recentNote}
                  type="button"
                  onClick={() => setNote(recentNote)}
                  className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                >
                  {recentNote}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button onClick={submitTransaction} disabled={!canSubmitSpend}>
              {editingTransactionId ? 'Save spending' : 'Log spending'}
            </Button>
            {editingTransactionId && (
              <Button variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
          <div className="sticky bottom-3 z-10 rounded-lg border border-slate-200 bg-white p-3 shadow-lg xl:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">
                  {parsedAmountPence > 0 ? formatPence(parsedAmountPence) : 'No amount'} ·{' '}
                  {paymentMethod === 'credit_card'
                    ? selectedCard?.name ?? 'Choose card'
                    : selectedPot?.name ?? 'Choose pot'}
                </p>
                <p className="text-xs text-slate-500">{date}</p>
              </div>
              <Button onClick={submitTransaction} disabled={!canSubmitSpend}>
                {editingTransactionId ? 'Save' : 'Add'}
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Spending by pay period" description="Manual spending is grouped into the pay period containing its date.">
        <div className="space-y-3">
          {groupedTransactions.length > 0 ? (
            groupedTransactions.map((group, index) => (
              <details
                key={group.id}
                open={group.isSelected || (!selectedPayPeriod && index === 0)}
                className={
                  group.isSelected
                    ? 'rounded-lg border border-slate-950 bg-white shadow-sm'
                    : 'rounded-lg border border-slate-200 bg-white'
                }
              >
                <summary className="cursor-pointer list-none px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-950">{group.label}</p>
                        {group.isSelected && (
                          <span className="rounded-md bg-slate-950 px-2 py-1 text-xs font-semibold text-white">
                            Viewing
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{group.transactions.length} entries</p>
                    </div>
                    <p className="text-sm font-semibold text-red-700">-{formatPence(group.totalPence)}</p>
                  </div>
                </summary>
                <div className="border-t border-slate-100 p-3">
                  <CalculationDetails breakdown={getSpendingGroupBreakdown(group)} />
                </div>
                <div className="divide-y divide-slate-100">
                  {group.transactions.map((transaction) => {
                    const pot = snapshot.pots.find((candidate) => candidate.id === transaction.potId)
                    const card = snapshot.creditCards.find((candidate) => candidate.id === transaction.creditCardId)

                    return (
                      <div key={transaction.id} className="flex items-center justify-between gap-4 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{transaction.note}</p>
                          <p className="text-xs text-slate-500">
                            {transaction.date} ·{' '}
                            {(transaction.paymentMethod ?? 'pot') === 'credit_card'
                              ? card?.name ?? 'Archived card'
                              : pot?.name ?? 'Archived pot'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-semibold text-red-700">-{formatPence(transaction.amountPence)}</p>
                          <Button
                            variant="secondary"
                            onClick={() => startEditingTransaction(transaction.id)}
                            aria-label={`Edit ${transaction.note}`}
                          >
                            <PenLine size={16} />
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => {
                              if (window.confirm(`Delete ${transaction.note}?`)) {
                                void actions.deleteTransaction(transaction.id)
                              }
                            }}
                            aria-label={`Delete ${transaction.note}`}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </details>
            ))
          ) : (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No spending entries yet.</p>
          )}
        </div>
      </Panel>
    </div>
  )
}

interface TransactionGroup {
  id: string
  label: string
  transactions: PlannerSnapshot['transactions']
  totalPence: number
  isSelected: boolean
  sortDate: string
}

function getSpendingGroupBreakdown(group: TransactionGroup): CalculationBreakdown {
  return {
    formula: 'Period spending total = every manual spending entry in this dropdown.',
    lines:
      group.transactions.length > 0
        ? [
            ...group.transactions.map((transaction) => ({
              label: transaction.note,
              value: formatPence(transaction.amountPence),
              detail: transaction.date,
              tone: 'add' as const,
            })),
            {
              label: 'Period spending total',
              value: formatPence(group.totalPence),
              tone: 'result' as const,
            },
          ]
        : [{ label: 'No spending entries', value: formatPence(0), tone: 'result' }],
  }
}

function groupTransactionsByPeriod(
  transactions: PlannerSnapshot['transactions'],
  snapshot: PlannerSnapshot,
  selectedPayPeriod: PayPeriod | null,
): TransactionGroup[] {
  const groups = new Map<string, TransactionGroup>()
  const periodsById = new Map(snapshot.payPeriods.map((period) => [period.id, period]))

  if (selectedPayPeriod) {
    groups.set(selectedPayPeriod.id, {
      id: selectedPayPeriod.id,
      label: `${selectedPayPeriod.payday} pay period · ${selectedPayPeriod.startDate} to ${selectedPayPeriod.endDate}`,
      transactions: [],
      totalPence: 0,
      isSelected: true,
      sortDate: selectedPayPeriod.startDate,
    })
  }

  for (const transaction of transactions) {
    const period =
      (transaction.payPeriodId ? periodsById.get(transaction.payPeriodId) : null) ??
      findPayPeriodForDate(snapshot.payPeriods, transaction.date)
    const id = period?.id ?? 'outside-periods'
    const label = period
      ? `${period.payday} pay period · ${period.startDate} to ${period.endDate}`
      : 'Outside saved pay periods'
    const existingGroup =
      groups.get(id) ??
      {
        id,
        label,
        transactions: [],
        totalPence: 0,
        isSelected: period?.id === selectedPayPeriod?.id,
        sortDate: period?.startDate ?? transaction.date,
      }

    existingGroup.transactions.push(transaction)
    existingGroup.totalPence += transaction.amountPence
    groups.set(id, existingGroup)
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      transactions: group.transactions.sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort((a, b) => {
      if (a.isSelected !== b.isSelected) {
        return a.isSelected ? -1 : 1
      }

      return b.sortDate.localeCompare(a.sortDate)
    })
}
