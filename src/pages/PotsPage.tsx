import { useState } from 'react'
import { ChevronDown, PenLine, Trash2 } from 'lucide-react'

import { formatPence, parsePoundsToPence } from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import { Button, CalculationDetails, Field, Panel, SelectInput, TextInput, type CalculationBreakdown } from '../components/ui'
import type { PotAllocation, PotType, RecurringPayment, Transaction } from '../types/models'

const colors = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#0f766e', '#4338ca', '#475569']

export function PotsPage({
  snapshot,
  actions,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<PotType>('spending')
  const [amount, setAmount] = useState('')
  const [color, setColor] = useState(colors[0])
  const [openPotId, setOpenPotId] = useState<string | null>(null)
  const [editingPotId, setEditingPotId] = useState<string | null>(null)
  const activePots = snapshot.pots.filter((pot) => !pot.archived)
  const editingPot = editingPotId
    ? snapshot.pots.find((candidate) => candidate.id === editingPotId) ?? null
    : null

  async function submitPot() {
    if (!name.trim()) {
      return
    }

    const payload = {
      name: name.trim(),
      type,
      balancePence: amount ? parsePoundsToPence(amount) : 0,
      color,
    }

    if (editingPot) {
      await actions.updatePot(editingPot.id, payload)
      resetForm()
      return
    }

    await actions.addPot(payload)
    resetForm()
  }

  function startEditingPot(potId: string) {
    const pot = snapshot.pots.find((candidate) => candidate.id === potId)

    if (!pot) {
      return
    }

    setEditingPotId(pot.id)
    setName(pot.name)
    setType(pot.type)
    setAmount((pot.balancePence / 100).toFixed(2))
    setColor(pot.color)
  }

  function resetForm() {
    setEditingPotId(null)
    setName('')
    setAmount('')
    setType('spending')
    setColor(colors[0])
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
      <Panel
        title={editingPot ? 'Edit pot' : 'Create pot'}
        description="Pots carry balances forward until you spend or move the money."
      >
        <div className="space-y-4">
          <Field label="Pot name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Car insurance" />
          </Field>
          <Field label="Type">
            <SelectInput value={type} onChange={(event) => setType(event.target.value as PotType)}>
              <option value="spending">Spending</option>
              <option value="reserved">Reserved</option>
              <option value="saving">Saving</option>
              <option value="investment">Investment</option>
              <option value="buffer">Buffer</option>
            </SelectInput>
          </Field>
          <Field label="Amount" hint="Optional starting balance for this pot.">
            <TextInput inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {colors.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`Use colour ${option}`}
                  onClick={() => setColor(option)}
                  className="size-8 rounded-full border-2"
                  style={{
                    backgroundColor: option,
                    borderColor: option === color ? '#0f172a' : 'white',
                    boxShadow: option === color ? '0 0 0 2px #cbd5e1' : '0 0 0 1px #e2e8f0',
                  }}
                />
              ))}
            </div>
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={submitPot}>{editingPot ? 'Save pot' : 'Add pot'}</Button>
            {editingPot && (
              <Button variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Pots" description="Click a pot to see spending, recurring payments, and allocations tied to it.">
        <div className="grid gap-4 md:grid-cols-2">
          {activePots.map((pot) => {
            const isOpen = openPotId === pot.id
            const activityItems = getPotActivityItems(pot.id, snapshot)

            return (
              <div key={pot.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setOpenPotId(isOpen ? null : pot.id)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Hide' : 'View'} ${pot.name} activity`}
                    className="min-w-0 flex-1 rounded-md text-left outline-none transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-slate-100"
                  >
                    <div className="flex items-start justify-between gap-3 p-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="size-3 rounded-full" style={{ backgroundColor: pot.color }} />
                          <h3 className="truncate text-sm font-semibold text-slate-950">{pot.name}</h3>
                        </div>
                        <p className="mt-1 text-xs capitalize text-slate-500">{pot.type}</p>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`mt-0.5 shrink-0 text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </div>
                    <p className="px-1 pb-1 pt-3 text-2xl font-semibold text-slate-950">{formatPence(pot.balancePence)}</p>
                    {pot.targetPence && (
                      <p className="px-1 pb-1 text-sm text-slate-500">Amount {formatPence(pot.targetPence)}</p>
                    )}
                  </button>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => startEditingPot(pot.id)}
                      aria-label={`Edit ${pot.name}`}
                    >
                      <PenLine size={16} />
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (window.confirm(`Delete ${pot.name}?`)) {
                          void actions.deletePot(pot.id)
                        }
                      }}
                      aria-label={`Delete ${pot.name}`}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div role="region" aria-label={`${pot.name} activity`} className="mt-4 border-t border-slate-100 pt-4">
                    <CalculationDetails breakdown={getPotBalanceBreakdown(pot.id, pot.balancePence, activityItems)} />
                    {activityItems.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {activityItems.map((item) => (
                          <div
                            key={item.id}
                            className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-slate-50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
                              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                            </div>
                            <p
                              className={`text-sm font-semibold ${
                                item.amountPence < 0 ? 'text-red-700' : 'text-emerald-700'
                              }`}
                            >
                              {formatSignedPence(item.amountPence)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                        No activity recorded for this pot yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}

interface PotActivityItem {
  id: string
  title: string
  detail: string
  amountPence: number
}

function getPotBalanceBreakdown(
  potId: string,
  balancePence: number,
  activityItems: PotActivityItem[],
): CalculationBreakdown {
  const activityNetPence = activityItems.reduce((total, item) => total + item.amountPence, 0)
  const startingOrImportedPence = balancePence - activityNetPence

  return {
    formula: 'Pot balance = starting/imported balance + recorded activity shown below.',
    lines: [
      {
        label: 'Starting or imported balance',
        value: formatPence(startingOrImportedPence),
        detail: `Balance not represented by the visible activity for this pot (${potId}).`,
        tone: startingOrImportedPence >= 0 ? 'add' : 'subtract',
      },
      ...activityItems.map((item) => ({
        label: item.title,
        value: formatSignedPence(item.amountPence),
        detail: item.detail,
        tone: item.amountPence >= 0 ? ('add' as const) : ('subtract' as const),
      })),
      {
        label: 'Current pot balance',
        value: formatPence(balancePence),
        tone: 'result',
      },
    ],
    note: 'This explains the displayed balance using the pot record plus the activity currently stored for it.',
  }
}

function getPotActivityItems(potId: string, snapshot: PlannerSnapshot): PotActivityItem[] {
  const transactions = snapshot.transactions
    .filter((transaction) => transaction.potId === potId)
    .map((transaction) => transactionToActivityItem(transaction))
  const allocations = snapshot.potAllocations
    .filter((allocation) => allocation.potId === potId)
    .map((allocation) => allocationToActivityItem(allocation, snapshot))
  const recurringPayments = snapshot.recurringPayments
    .filter((payment) => payment.potId === potId)
    .map((payment) => recurringPaymentToActivityItem(payment))

  return [...transactions, ...allocations, ...recurringPayments]
}

function transactionToActivityItem(transaction: Transaction): PotActivityItem {
  const isSpending = transaction.type === 'spending'

  return {
    id: `transaction-${transaction.id}`,
    title: transaction.note,
    detail: `${formatTransactionType(transaction.type)} · ${transaction.date}`,
    amountPence: isSpending ? -transaction.amountPence : transaction.amountPence,
  }
}

function allocationToActivityItem(allocation: PotAllocation, snapshot: PlannerSnapshot): PotActivityItem {
  const period = snapshot.payPeriods.find((candidate) => candidate.id === allocation.payPeriodId)
  const payment = allocation.recurringPaymentId
    ? snapshot.recurringPayments.find((candidate) => candidate.id === allocation.recurringPaymentId)
    : null

  return {
    id: `allocation-${allocation.id}`,
    title: payment ? `Reserved for ${payment.name}` : 'Paycheck allocation',
    detail: `Allocation · ${period?.payday ?? allocation.createdAt.slice(0, 10)}`,
    amountPence: allocation.amountPence,
  }
}

function recurringPaymentToActivityItem(payment: RecurringPayment): PotActivityItem {
  return {
    id: `recurring-${payment.id}`,
    title: payment.name,
    detail: `Recurring · ${payment.frequency} · day ${payment.dueDay ?? 'set date'}`,
    amountPence: -payment.amountPence,
  }
}

function formatTransactionType(type: Transaction['type']): string {
  if (type === 'spending') {
    return 'Spending'
  }

  return type.charAt(0).toUpperCase() + type.slice(1)
}

function formatSignedPence(amountPence: number): string {
  if (amountPence > 0) {
    return `+${formatPence(amountPence)}`
  }

  return formatPence(amountPence)
}
