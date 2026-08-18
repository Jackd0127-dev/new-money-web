import { useState, type ReactNode } from 'react'
import {
  CalendarDays,
  ChevronDown,
  CreditCard,
  PenLine,
  ReceiptText,
  Trash2,
  WalletCards,
} from 'lucide-react'

import { findPayPeriodForDate, formatPence, getAppTodayIso, parsePoundsToPence } from '../domain/money'
import type {
  PlannerActions,
  PlannerSnapshot,
  TransactionInput,
  TransactionUpdateInput,
} from '../hooks/usePlannerData'
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Panel,
  Pill,
  ProgressBar,
  SectionGrid,
  SelectInput,
  TextInput,
  TransactionRow,
} from '../components/ui'
import type { PaymentMethod, PayPeriod } from '../types/models'

const quickAmounts = ['3.00', '5.00', '10.00', '20.00', '50.00']
type QuickSpendLinkMethod = PaymentMethod | 'unlinked'

export function SpendingPage({
  snapshot,
  actions,
  selectedPayPeriod,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
  selectedPayPeriod?: PayPeriod | null
}) {
  const today = getAppTodayIso(snapshot.settings)
  const activePots = snapshot.pots.filter((pot) => !pot.archived)
  const activeCards = snapshot.creditCards.filter((card) => !card.archived)
  const [potId, setPotId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<QuickSpendLinkMethod>('unlinked')
  const [creditCardId, setCreditCardId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
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
  const canSubmitSpend = parsedAmountPence > 0 && Boolean(date)
  const groupedTransactions = groupTransactionsByPeriod(snapshot.transactions, snapshot, selectedPayPeriod ?? null)
  const selectedTransactionGroup = selectedPayPeriod
    ? groupedTransactions.find((group) => group.id === selectedPayPeriod.id) ?? null
    : groupedTransactions[0] ?? null
  const selectedPeriodTransactions = selectedTransactionGroup?.transactions ?? []
  const selectedPeriodSpendPence = selectedTransactionGroup?.totalPence ?? 0
  const selectedPeriodEntryCount = selectedPeriodTransactions.length
  const linkedCardSpendPence = selectedPeriodTransactions
    .filter((transaction) => transaction.paymentMethod === 'credit_card' || transaction.creditCardId)
    .reduce((totalPence, transaction) => totalPence + transaction.amountPence, 0)
  const potLinkedSpendPence = selectedPeriodTransactions
    .filter((transaction) => transaction.potId && transaction.paymentMethod !== 'credit_card' && !transaction.creditCardId)
    .reduce((totalPence, transaction) => totalPence + transaction.amountPence, 0)
  const unlinkedSpendPence = selectedPeriodTransactions
    .filter((transaction) => !transaction.potId && !transaction.creditCardId && transaction.paymentMethod !== 'credit_card')
    .reduce((totalPence, transaction) => totalPence + transaction.amountPence, 0)
  const recentTransactions = [...snapshot.transactions]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 3)

  async function submitTransaction() {
    const amountPence = parsedAmountPence

    if (amountPence <= 0 || !date) {
      return
    }

    const linkFields = getQuickSpendLinkFields(paymentMethod, potId, creditCardId, activePots)

    if (editingTransactionId) {
      const updateInput: TransactionUpdateInput = {
        amountPence,
        date,
        note: note.trim() || 'Manual spend',
        ...linkFields,
      }

      await actions.updateTransaction(editingTransactionId, updateInput)
      resetForm()
      return
    }

    const addInput: TransactionInput = {
      amountPence,
      type: 'spending',
      date,
      note: note.trim() || 'Manual spend',
      payPeriodId: findPayPeriodForDate(snapshot.payPeriods, date)?.id ?? null,
      ...linkFields,
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
    setPotId(transaction.potId ?? '')
    setPaymentMethod(getTransactionLinkMethod(transaction))
    setCreditCardId(transaction.creditCardId ?? '')
    setAmount((transaction.amountPence / 100).toFixed(2))
    setDate(transaction.date)
    setNote(transaction.note)
  }

  function resetForm() {
    setEditingTransactionId(null)
    setPotId('')
    setPaymentMethod('unlinked')
    setCreditCardId('')
    setAmount('')
    setDate(today)
    setNote('')
  }

  function changePaymentMethod(nextMethod: QuickSpendLinkMethod) {
    setPaymentMethod(nextMethod)

    if (nextMethod === 'pot' && !potId) {
      setPotId(activePots[0]?.id ?? '')
    }

    if (nextMethod === 'credit_card' && !creditCardId) {
      setCreditCardId(activeCards[0]?.id ?? '')
    }
  }

  return (
    <div className="space-y-6">
      <SectionGrid variant="wideLeft" className="gap-5 lg:items-start">
        <SpendingHero
          selectedPayPeriod={selectedPayPeriod ?? null}
          selectedPeriodSpendPence={selectedPeriodSpendPence}
          selectedPeriodEntryCount={selectedPeriodEntryCount}
          linkedCardSpendPence={linkedCardSpendPence}
          potLinkedSpendPence={potLinkedSpendPence}
          unlinkedSpendPence={unlinkedSpendPence}
          recentTransactions={recentTransactions}
          snapshot={snapshot}
        />

        <Panel
          title={editingTransactionId ? 'Edit spending entry' : 'Quick spend'}
          description="Log money quickly, with an optional pot or credit card link."
          accent="blue"
          density="compact"
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
                  className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-text-secondary)] transition hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-soft)]"
                >
                  {formatPence(parsePoundsToPence(quickAmount))}
                </button>
              ))}
            </div>
            <Field label="Link spend to">
              <SelectInput value={paymentMethod} onChange={(event) => changePaymentMethod(event.target.value as QuickSpendLinkMethod)}>
                <option value="unlinked">Unlinked</option>
                <option value="pot">Pot</option>
                <option value="credit_card" disabled={activeCards.length === 0}>
                  Credit card
                </option>
              </SelectInput>
            </Field>
            {paymentMethod === 'pot' && (
              <Field
                label="Pot"
                hint={
                  selectedPot?.linkedCreditCardId
                    ? 'This logs card spend and adds the cover to the linked card pot checklist.'
                    : 'Spending from a normal pot deducts its balance now.'
                }
              >
                <SelectInput aria-label="Pot" value={potId} onChange={(event) => setPotId(event.target.value)}>
                  <option value="">No pot linked</option>
                  {activePots.map((pot) => (
                    <option key={pot.id} value={pot.id}>
                      {pot.name} · {formatPence(pot.balancePence)}
                      {pot.linkedCreditCardId ? ' · card cover' : ''}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            )}
            {paymentMethod === 'credit_card' && (
              <Field label="Credit card" hint="Optional. Choose no card to keep this spend unlinked.">
                <SelectInput aria-label="Credit card" value={creditCardId} onChange={(event) => setCreditCardId(event.target.value)}>
                  <option value="">No credit card linked</option>
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
                <Button variant="secondary" onClick={() => setDate(today)}>
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
                    className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-soft)]"
                  >
                    {recentNote}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Button onClick={submitTransaction} disabled={!canSubmitSpend}>
                {editingTransactionId ? 'Save spending' : 'Log spend'}
              </Button>
              {editingTransactionId && (
                <Button variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
            <div className="sticky bottom-3 z-10 rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-[0_18px_45px_rgba(15,23,42,0.13)] backdrop-blur xl:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {parsedAmountPence > 0 ? formatPence(parsedAmountPence) : 'No amount'} · {getSelectedSpendLinkLabel(paymentMethod, selectedPot?.name, selectedCard?.name)}
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
      </SectionGrid>

      <Panel
        title="Spending by pay period"
        description="Manual spending is grouped into the pay period containing its date."
        accent="slate"
        density="compact"
      >
        <div className="space-y-3 xl:max-h-[720px] xl:overflow-y-auto xl:pr-1">
          {groupedTransactions.length > 0 ? (
            groupedTransactions.map((group, index) => (
              <details
                key={group.id}
                open={group.isSelected || (!selectedPayPeriod && index === 0)}
                className={
                  group.isSelected
                    ? 'group rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-none'
                    : 'group rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-none'
                }
              >
                <summary className="cursor-pointer list-none px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{group.label}</p>
                        {group.isSelected && (
                          <Pill tone="neutral">Viewing</Pill>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {formatTransactionCount(group.transactions.length)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--color-danger)]">{formatSpendTotal(group.totalPence)}</p>
                      <ChevronDown size={17} className="shrink-0 text-[var(--color-text-muted)] transition group-open:rotate-180" />
                    </div>
                  </div>
                </summary>
                <div className="border-t border-[var(--color-border)] p-3">
                  {group.transactions.length > 0 ? (
                    <ul className="space-y-2">
                      {group.transactions.map((transaction) => (
                        <li key={transaction.id}>
                          <TransactionRow
                            title={transaction.note}
                            description={getTransactionLinkLabel(transaction, snapshot)}
                            date={transaction.date}
                            amount={formatSpendTotal(transaction.amountPence)}
                            tone="danger"
                            action={
                              <div className="flex items-center gap-1">
                                <IconButton
                                  label={`Edit ${transaction.note}`}
                                  size="sm"
                                  variant="subtle"
                                  onClick={() => startEditingTransaction(transaction.id)}
                                  title={`Edit ${transaction.note}`}
                                >
                                  <PenLine size={15} aria-hidden="true" />
                                </IconButton>
                                <IconButton
                                  label={`Delete ${transaction.note}`}
                                  size="sm"
                                  variant="subtle"
                                  className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
                                  onClick={() => {
                                    if (window.confirm(`Delete ${transaction.note}?`)) {
                                      void actions.deleteTransaction(transaction.id)
                                    }
                                  }}
                                  title={`Delete ${transaction.note}`}
                                >
                                  <Trash2 size={15} aria-hidden="true" />
                                </IconButton>
                              </div>
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="No spending yet."
                      description="Log your first payment to see it grouped by paycheck."
                      icon={<ReceiptText size={18} aria-hidden="true" />}
                      className="p-4"
                    />
                  )}
                </div>
              </details>
            ))
          ) : (
            <EmptyState
              title="No spending yet."
              description="Log your first payment to see it grouped by paycheck."
              icon={<ReceiptText size={18} aria-hidden="true" />}
              className="p-4"
            />
          )}
        </div>
      </Panel>
    </div>
  )
}

function SpendingHero({
  selectedPayPeriod,
  selectedPeriodSpendPence,
  selectedPeriodEntryCount,
  linkedCardSpendPence,
  potLinkedSpendPence,
  unlinkedSpendPence,
  recentTransactions,
  snapshot,
}: {
  selectedPayPeriod: PayPeriod | null
  selectedPeriodSpendPence: number
  selectedPeriodEntryCount: number
  linkedCardSpendPence: number
  potLinkedSpendPence: number
  unlinkedSpendPence: number
  recentTransactions: PlannerSnapshot['transactions']
  snapshot: PlannerSnapshot
}) {
  const routedSpendPence = linkedCardSpendPence + potLinkedSpendPence
  const allSpendPence = routedSpendPence + unlinkedSpendPence
  const routedPercent = allSpendPence > 0 ? Math.round((routedSpendPence / allSpendPence) * 100) : 0
  const periodLabel = selectedPayPeriod
    ? `${selectedPayPeriod.startDate} to ${selectedPayPeriod.endDate}`
    : 'Latest spending period'

  return (
    <section
      aria-label="Spending hero"
      className="fintech-surface relative max-w-full min-w-0 overflow-hidden rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[var(--color-deep-navy)]" aria-hidden="true" />
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <ReceiptText size={15} className="text-[var(--color-emerald)]" />
                Spent this pay period
              </div>
              <p className="mt-3 text-4xl font-semibold leading-tight text-[var(--color-text-primary)]">
                {formatSpendTotal(selectedPeriodSpendPence)}
              </p>
              <p className="mt-2 text-sm leading-5 text-[var(--color-text-muted)]">{periodLabel}</p>
            </div>
            <Pill tone={selectedPeriodEntryCount > 0 ? 'warning' : 'neutral'} icon={<CalendarDays size={14} />}>
              {formatTransactionCount(selectedPeriodEntryCount)}
            </Pill>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <SpendingHeroStat
              icon={<WalletCards size={16} />}
              label="Routed"
              value={formatPence(routedSpendPence)}
              detail={`${routedPercent}% linked to pots or cards`}
            />
            <SpendingHeroStat
              icon={<CreditCard size={16} />}
              label="Unlinked"
              value={formatPence(unlinkedSpendPence)}
              detail={unlinkedSpendPence > 0 ? 'Can be routed later if needed' : 'Every transaction in view is linked'}
            />
          </div>

          <ProgressBar
            label="Spending routing"
            percent={routedPercent}
            className="mt-5"
            color="var(--color-emerald)"
            trackClassName="bg-[rgba(11,61,46,0.08)]"
          />
        </div>

        <div className="min-w-0 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 xl:w-[300px]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Recent payments</p>
            <Pill tone="neutral">{recentTransactions.length}</Pill>
          </div>
          <div className="mt-4 space-y-2">
            {recentTransactions.length > 0 ? (
              recentTransactions.map((transaction) => (
                <div key={transaction.id} className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{transaction.note}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {transaction.date} · {getTransactionLinkLabel(transaction, snapshot)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[var(--color-danger)]">{formatSpendTotal(transaction.amountPence)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
                Log spend to build recent payments.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function SpendingHeroStat({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{value}</p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-soft)] text-[var(--color-emerald)]">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{detail}</p>
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

function formatSpendTotal(amountPence: number): string {
  return amountPence > 0 ? `-${formatPence(amountPence)}` : formatPence(0)
}

function formatTransactionCount(count: number): string {
  return `${count} transaction${count === 1 ? '' : 's'}`
}

function getQuickSpendLinkFields(
  paymentMethod: QuickSpendLinkMethod,
  potId: string,
  creditCardId: string,
  activePots: PlannerSnapshot['pots'],
): Pick<TransactionInput, 'potId' | 'paymentMethod' | 'creditCardId'> {
  if (paymentMethod === 'pot' && potId) {
    const selectedPot = activePots.find((pot) => pot.id === potId)

    if (selectedPot?.linkedCreditCardId) {
      return {
        potId: null,
        paymentMethod: 'credit_card',
        creditCardId: selectedPot.linkedCreditCardId,
      }
    }

    return {
      potId,
      paymentMethod: 'pot',
      creditCardId: null,
    }
  }

  if (paymentMethod === 'credit_card' && creditCardId) {
    return {
      potId: null,
      paymentMethod: 'credit_card',
      creditCardId,
    }
  }

  return {
    potId: null,
    creditCardId: null,
  }
}

function getTransactionLinkMethod(transaction: TransactionInput): QuickSpendLinkMethod {
  if (transaction.paymentMethod === 'credit_card' || transaction.creditCardId) {
    return 'credit_card'
  }

  if (transaction.paymentMethod === 'pot' || transaction.potId) {
    return transaction.potId ? 'pot' : 'unlinked'
  }

  return 'unlinked'
}

function getSelectedSpendLinkLabel(
  paymentMethod: QuickSpendLinkMethod,
  potName?: string,
  cardName?: string,
): string {
  if (paymentMethod === 'pot') {
    return potName ?? 'No pot linked'
  }

  if (paymentMethod === 'credit_card') {
    return cardName ?? 'No credit card linked'
  }

  return 'Unlinked'
}

function getTransactionLinkLabel(transaction: TransactionInput, snapshot: PlannerSnapshot): string {
  if (transaction.paymentMethod === 'credit_card' || transaction.creditCardId) {
    if (!transaction.creditCardId) {
      return 'No credit card linked'
    }

    return snapshot.creditCards.find((candidate) => candidate.id === transaction.creditCardId)?.name ?? 'Archived card'
  }

  if (transaction.potId) {
    return snapshot.pots.find((candidate) => candidate.id === transaction.potId)?.name ?? 'Archived pot'
  }

  if (transaction.paymentMethod === 'pot') {
    return 'No pot linked'
  }

  return 'Unlinked'
}
