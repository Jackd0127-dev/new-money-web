import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  CreditCard,
  ReceiptText,
  Trash2,
  PenLine,
  PlusCircle,
  X,
} from 'lucide-react'

import {
  creditCardDesigns,
  defaultCreditCardDesignId,
  getCreditCardDesign,
  normalizeCreditCardDesignId,
  type CreditCardDesign,
} from '../domain/creditCardDesigns'
import {
  findPayPeriodForDate,
  formatPence,
  getAppTodayIso,
  getCreditCardAllocationSummary,
  parsePoundsToPence,
  type CreditCardAllocationCardSummary,
  type CreditCardAllocationItem,
  type CreditCardAllocationSummary,
} from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import {
  Button,
  EmptyState,
  Field,
  FormDrawer,
  HeroMoneyCard,
  IconButton,
  MetricCard,
  Panel,
  PaymentRow as PaymentListRow,
  Pill,
  SectionGrid,
  SelectInput,
  TextInput,
  type CalculationBreakdown,
} from '../components/ui'
import type { PayPeriod, RecurringPayment, Transaction } from '../types/models'

const cardColors = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#0f766e', '#4338ca', '#475569']

export function AllocatingPaymentsPage({
  snapshot,
  actions,
  selectedPayPeriod,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
  selectedPayPeriod?: PayPeriod | null
}) {
  const today = getAppTodayIso(snapshot.settings)
  const activeCards = snapshot.creditCards.filter((card) => !card.archived)
  const viewedPeriod = selectedPayPeriod ?? null
  const summary = getCreditCardAllocationSummary({
    creditCards: snapshot.creditCards,
    recurringPayments: snapshot.recurringPayments,
    customPayments: snapshot.customPayments,
    transactions: snapshot.transactions,
    repayments: snapshot.creditCardRepayments,
    creditCardPots: snapshot.creditCardPots,
    pots: snapshot.pots,
    payPeriod: viewedPeriod,
    asOfDate: today,
  })
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [openSummaryMetric, setOpenSummaryMetric] = useState<string | null>(null)
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [cardName, setCardName] = useState('')
  const [cardProvider, setCardProvider] = useState('')
  const [cardLimit, setCardLimit] = useState('')
  const [cardOpeningBalance, setCardOpeningBalance] = useState('')
  const [cardOpeningStatementBalance, setCardOpeningStatementBalance] = useState('')
  const [cardStatementDate, setCardStatementDate] = useState('')
  const [cardDueDay, setCardDueDay] = useState('1')
  const [cardColor, setCardColor] = useState(cardColors[0])
  const [cardDesignId, setCardDesignId] = useState(defaultCreditCardDesignId)
  const [isCardDesignModalOpen, setIsCardDesignModalOpen] = useState(false)
  const [editingRepaymentId, setEditingRepaymentId] = useState<string | null>(null)
  const [repaymentCardId, setRepaymentCardId] = useState(activeCards[0]?.id ?? '')
  const [repaymentAmount, setRepaymentAmount] = useState('')
  const [repaymentDate, setRepaymentDate] = useState(today)
  const [repaymentNote, setRepaymentNote] = useState('')
  const paymentRows = useMemo(() => getPaymentRows(snapshot), [snapshot])
  const paymentGroups = useMemo(
    () => groupPaymentRowsByPeriod(paymentRows, snapshot, viewedPeriod),
    [paymentRows, snapshot, viewedPeriod],
  )
  const selectedCardSummary = selectedCardId
    ? summary.cards.find((cardSummary) => cardSummary.card.id === selectedCardId) ?? null
    : null
  const [isCardFormOpen, setIsCardFormOpen] = useState(false)
  const [isRepaymentFormOpen, setIsRepaymentFormOpen] = useState(false)
  const [isCustomPaymentFormOpen, setIsCustomPaymentFormOpen] = useState(false)
  const [customPaymentName, setCustomPaymentName] = useState('')
  const [customPaymentAmount, setCustomPaymentAmount] = useState('')
  const [customPaymentDueDate, setCustomPaymentDueDate] = useState(viewedPeriod?.endDate ?? today)
  const [customPaymentCardId, setCustomPaymentCardId] = useState(activeCards[0]?.id ?? '')

  async function submitCard() {
    const limitPence = parsePoundsToPence(cardLimit)
    const openingBalancePence = parsePoundsToPence(cardOpeningBalance)
    const openingStatementBalancePence = parsePoundsToPence(cardOpeningStatementBalance)
    const dueDay = Number.parseInt(cardDueDay, 10)

    if (!cardName.trim() || !cardProvider.trim() || limitPence <= 0 || openingBalancePence < 0 || openingStatementBalancePence < 0 || dueDay < 1 || dueDay > 31) {
      return
    }

    const payload = {
      name: cardName.trim(),
      provider: cardProvider.trim(),
      limitPence,
      openingBalancePence,
      openingStatementBalancePence,
      statementDate: cardStatementDate || null,
      designId: cardDesignId,
      dueDay,
      dueDate: null,
      color: cardColor,
    }

    if (editingCardId) {
      await actions.updateCreditCard(editingCardId, payload)
      resetCardForm()
      return
    }

    await actions.addCreditCard(payload)
    resetCardForm()
  }

  async function submitRepayment() {
    const amountPence = parsePoundsToPence(repaymentAmount)

    if (!repaymentCardId || amountPence <= 0) {
      return
    }

    const payload = {
      creditCardId: repaymentCardId,
      amountPence,
      date: repaymentDate,
      note: repaymentNote.trim(),
    }

    if (editingRepaymentId) {
      await actions.updateCreditCardRepayment(editingRepaymentId, payload)
      resetRepaymentForm()
      return
    }

    await actions.addCreditCardRepayment(payload)
    resetRepaymentForm()
  }

  async function submitCustomPayment() {
    const amountPence = parsePoundsToPence(customPaymentAmount)
    const name = customPaymentName.trim()

    if (!name || amountPence <= 0 || !customPaymentDueDate) {
      return
    }

    await actions.addCustomPayment({
      name,
      amountPence,
      dueDate: customPaymentDueDate,
      creditCardId: customPaymentCardId || null,
    })
    resetCustomPaymentForm()
  }

  async function linkPayment(row: PaymentRow, creditCardId: string) {
    const nextCardId = creditCardId || null

    if (row.source === 'recurring') {
      const payment = snapshot.recurringPayments.find((candidate) => candidate.id === row.entityId)

      if (!payment) {
        return
      }

      await actions.updateRecurringPayment(payment.id, {
        name: payment.name,
        amountPence: payment.amountPence,
        dueDay: payment.dueDay ?? null,
        dueDate: payment.dueDate ?? null,
        frequency: payment.frequency,
        potId: payment.potId,
        creditCardId: nextCardId,
        priority: payment.priority,
      })
      return
    }

    if (row.source === 'custom') {
      const payment = snapshot.customPayments.find((candidate) => candidate.id === row.entityId)

      if (!payment) {
        return
      }

      await actions.updateCustomPayment(payment.id, {
        name: payment.name,
        amountPence: payment.amountPence,
        dueDate: payment.dueDate,
        creditCardId: nextCardId,
        status: payment.status,
      })
      return
    }

    const transaction = snapshot.transactions.find((candidate) => candidate.id === row.entityId)

    if (!transaction) {
      return
    }

    await actions.updateTransaction(transaction.id, {
      potId: nextCardId ? null : transaction.potId ?? null,
      amountPence: transaction.amountPence,
      date: transaction.date,
      note: transaction.note,
      paymentMethod: nextCardId ? 'credit_card' : transaction.potId ? 'pot' : undefined,
      creditCardId: nextCardId,
    })
  }

  function startEditingCard(cardId: string) {
    const card = snapshot.creditCards.find((candidate) => candidate.id === cardId)

    if (!card) {
      return
    }

    setEditingCardId(card.id)
    setCardName(card.name)
    setCardProvider(card.provider)
    setCardLimit((card.limitPence / 100).toFixed(2))
    setCardOpeningBalance(((card.openingBalancePence ?? 0) / 100).toFixed(2))
    setCardOpeningStatementBalance(((card.openingStatementBalancePence ?? card.openingBalancePence ?? 0) / 100).toFixed(2))
    setCardStatementDate(card.statementDate ?? '')
    setCardDueDay(String(card.dueDay ?? 1))
    setCardColor(card.color)
    setCardDesignId(normalizeCreditCardDesignId(card.designId))
    setIsCardFormOpen(true)
  }

  function startEditingRepayment(repaymentId: string) {
    const repayment = snapshot.creditCardRepayments.find((candidate) => candidate.id === repaymentId)

    if (!repayment) {
      return
    }

    setSelectedCardId(null)
    setEditingRepaymentId(repayment.id)
    setRepaymentCardId(repayment.creditCardId)
    setRepaymentAmount((repayment.amountPence / 100).toFixed(2))
    setRepaymentDate(repayment.date)
    setRepaymentNote(repayment.note)
    setIsRepaymentFormOpen(true)
  }

  function resetCardForm() {
    setEditingCardId(null)
    setCardName('')
    setCardProvider('')
    setCardLimit('')
    setCardOpeningBalance('')
    setCardOpeningStatementBalance('')
    setCardStatementDate('')
    setCardDueDay('1')
    setCardColor(cardColors[0])
    setCardDesignId(defaultCreditCardDesignId)
    setIsCardDesignModalOpen(false)
    setIsCardFormOpen(false)
  }

  function resetRepaymentForm() {
    setEditingRepaymentId(null)
    setRepaymentAmount('')
    setRepaymentNote('')
    setRepaymentDate(today)
    setRepaymentCardId(activeCards[0]?.id ?? '')
    setIsRepaymentFormOpen(false)
  }

  function resetCustomPaymentForm() {
    setCustomPaymentName('')
    setCustomPaymentAmount('')
    setCustomPaymentDueDate(viewedPeriod?.endDate ?? today)
    setCustomPaymentCardId(activeCards[0]?.id ?? '')
    setIsCustomPaymentFormOpen(false)
  }

  function openNewCardForm() {
    resetCardForm()
    setIsCardFormOpen(true)
  }

  function openNewRepaymentForm() {
    resetRepaymentForm()
    setIsRepaymentFormOpen(true)
  }

  function openNewCustomPaymentForm(creditCardId = activeCards[0]?.id ?? '') {
    setCustomPaymentName('')
    setCustomPaymentAmount('')
    setCustomPaymentDueDate(viewedPeriod?.endDate ?? today)
    setCustomPaymentCardId(creditCardId)
    setIsCustomPaymentFormOpen(true)
  }

  function renderCardForm(submitLabel: string, showCancel = false) {
    const selectedDesign = getCreditCardDesign(cardDesignId)

    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Card name">
            <TextInput className="h-9" value={cardName} onChange={(event) => setCardName(event.target.value)} placeholder="Everyday Amex" />
          </Field>
          <Field label="Provider">
            <TextInput className="h-9" value={cardProvider} onChange={(event) => setCardProvider(event.target.value)} placeholder="Amex" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Limit">
            <TextInput className="h-9" inputMode="decimal" value={cardLimit} onChange={(event) => setCardLimit(event.target.value)} placeholder="1000.00" />
          </Field>
          <Field label="Existing balance" hint="What you already owe on this card before tracking new payments.">
            <TextInput
              aria-label="Existing balance"
              className="h-9"
              inputMode="decimal"
              value={cardOpeningBalance}
              onChange={(event) => setCardOpeningBalance(event.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Existing statement due" hint="Already-issued statement amount that will be taken by direct debit.">
            <TextInput
              aria-label="Existing statement due"
              className="h-9"
              inputMode="decimal"
              value={cardOpeningStatementBalance}
              onChange={(event) => setCardOpeningStatementBalance(event.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Statement date" hint="Latest statement date. Spend on this date starts the next cycle.">
            <TextInput
              aria-label="Statement date"
              className="h-9"
              type="date"
              value={cardStatementDate}
              onChange={(event) => setCardStatementDate(event.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Direct debit day" hint="Day of the month the card provider takes payment.">
            <TextInput
              aria-label="Direct debit day"
              className="h-9"
              inputMode="numeric"
              value={cardDueDay}
              onChange={(event) => setCardDueDay(event.target.value)}
            />
          </Field>
          <Field label="Card design">
            <div className="flex min-h-9 items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/60">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`figma-credit-card credit-card-design-summary__art figma-credit-card--${selectedDesign.id}`} aria-hidden="true">
                  <CreditCardArtwork design={selectedDesign} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{selectedDesign.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Selected</p>
                </div>
              </div>
              <Button className="min-h-8 px-3" variant="secondary" aria-label="Card design" onClick={() => setIsCardDesignModalOpen(true)}>
                Card design
              </Button>
            </div>
          </Field>
        </div>
        {isCardDesignModalOpen && (
          <CreditCardDesignModal
            selectedDesignId={cardDesignId}
            onClose={() => setIsCardDesignModalOpen(false)}
            onSelect={(designId) => {
              setCardDesignId(designId)
              setIsCardDesignModalOpen(false)
            }}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-9 px-3" onClick={submitCard}>
            <PlusCircle size={16} />
            {submitLabel}
          </Button>
          {showCancel && (
            <Button className="min-h-9 px-3" variant="secondary" onClick={resetCardForm}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    )
  }

  function renderCustomPaymentForm() {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Payment name">
            <TextInput
              className="h-9"
              value={customPaymentName}
              onChange={(event) => setCustomPaymentName(event.target.value)}
              placeholder="MOT"
            />
          </Field>
          <Field label="Amount">
            <TextInput
              className="h-9"
              inputMode="decimal"
              value={customPaymentAmount}
              onChange={(event) => setCustomPaymentAmount(event.target.value)}
              placeholder="149.50"
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Due date">
            <TextInput
              className="h-9"
              type="date"
              value={customPaymentDueDate}
              onChange={(event) => setCustomPaymentDueDate(event.target.value)}
            />
          </Field>
          <Field label="Linked card">
            <SelectInput className="h-9" value={customPaymentCardId} onChange={(event) => setCustomPaymentCardId(event.target.value)}>
              <option value="">No linked card</option>
              {activeCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} ({card.provider})
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-9 px-3" onClick={submitCustomPayment}>
            <ReceiptText size={16} aria-hidden="true" />
            Add one-off payment
          </Button>
          <Button className="min-h-9 px-3" variant="secondary" onClick={resetCustomPaymentForm}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  const repaymentsPanel = (
    <Panel title="Card repayments" description="Edit or delete repayments already recorded." accent="amber" density="compact">
      <div className="space-y-2 xl:max-h-[420px] xl:overflow-y-auto xl:pr-1">
        {snapshot.creditCardRepayments.length > 0 ? (
          snapshot.creditCardRepayments.map((repayment) => {
            const card = snapshot.creditCards.find((candidate) => candidate.id === repayment.creditCardId)

            return (
              <div
                key={repayment.id}
                className="grid gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{repayment.note || 'Card repayment'}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {repayment.date} · {card?.name ?? 'Archived card'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-emerald-700">-{formatPence(repayment.amountPence)}</p>
                  <Button
                    className="min-h-8 px-2"
                    variant="secondary"
                    onClick={() => startEditingRepayment(repayment.id)}
                    aria-label={`Edit repayment ${repayment.note || repayment.date}`}
                  >
                    <PenLine size={15} />
                  </Button>
                  <IconButton
                    label={`Delete repayment ${repayment.note || repayment.date}`}
                    size="sm"
                    variant="subtle"
                    className="text-[var(--color-danger)] hover:bg-[rgba(177,58,50,0.08)]"
                    onClick={() => {
                      if (window.confirm('Delete this card repayment?')) {
                        void actions.deleteCreditCardRepayment(repayment.id)
                      }
                    }}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </IconButton>
                </div>
              </div>
            )
          })
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/80 p-3 text-sm text-slate-500">No repayments recorded yet.</p>
        )}
      </div>
    </Panel>
  )

  if (selectedCardSummary) {
    return (
      <>
        <CreditCardOverview
          cardSummary={selectedCardSummary}
          snapshot={snapshot}
          onBack={() => {
            resetCardForm()
            setSelectedCardId(null)
          }}
          onDeleteCard={(cardId, cardNameToDelete) => {
            if (window.confirm(`Delete ${cardNameToDelete}?`)) {
              void actions.archiveCreditCard(cardId)
            }
          }}
          onDeleteCustomPayment={(paymentId, paymentName) => {
            if (window.confirm(`Delete ${paymentName}?`)) {
              void actions.deleteCustomPayment(paymentId)
            }
          }}
          onDeleteRepayment={(repaymentId) => {
            if (window.confirm('Delete this card repayment?')) {
              void actions.deleteCreditCardRepayment(repaymentId)
            }
          }}
          onEditCard={startEditingCard}
          onEditRepayment={startEditingRepayment}
        />
        <FormDrawer
          open={editingCardId !== null}
          title="Edit credit card"
          description="Update the card details without leaving this overview."
          closeLabel="Close edit card"
          onClose={resetCardForm}
        >
          {renderCardForm('Save card', true)}
        </FormDrawer>
      </>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      <CardsHero
        summary={summary}
        viewedPeriod={viewedPeriod}
        openSummaryMetric={openSummaryMetric}
        onOpenSummaryMetricChange={setOpenSummaryMetric}
        onNewCard={openNewCardForm}
        onAddOneOffPayment={() => openNewCustomPaymentForm()}
        onNewRepayment={openNewRepaymentForm}
        canRecordRepayment={activeCards.length > 0}
      />

      <FormDrawer
        open={isCardFormOpen}
        title={editingCardId ? 'Edit credit card' : 'Add credit card'}
        description="Cards group linked payments, spending, and repayments."
        closeLabel={editingCardId ? 'Close edit card' : 'Close add credit card'}
        onClose={resetCardForm}
      >
        {renderCardForm(editingCardId ? 'Save card' : 'Add card', true)}
      </FormDrawer>

      <FormDrawer
        open={isCustomPaymentFormOpen}
        title="Add one-off payment"
        description="Create a saved payment and optionally link it to a card."
        closeLabel="Close one-off payment"
        onClose={resetCustomPaymentForm}
      >
        {renderCustomPaymentForm()}
      </FormDrawer>

      <FormDrawer
        open={isRepaymentFormOpen}
        title={editingRepaymentId ? 'Edit card repayment' : 'Record card repayment'}
        description="Repayments reduce the amount shown as owed."
        closeLabel={editingRepaymentId ? 'Close edit repayment' : 'Close record repayment'}
        onClose={resetRepaymentForm}
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Credit card">
              <SelectInput className="h-9" value={repaymentCardId} onChange={(event) => setRepaymentCardId(event.target.value)}>
                {activeCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name} ({card.provider})
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Amount">
              <TextInput className="h-9" inputMode="decimal" value={repaymentAmount} onChange={(event) => setRepaymentAmount(event.target.value)} placeholder="100.00" />
            </Field>
          </div>
          <Field label="Date">
            <TextInput className="h-9" type="date" value={repaymentDate} onChange={(event) => setRepaymentDate(event.target.value)} />
          </Field>
          <Field label="Note">
            <TextInput className="h-9" value={repaymentNote} onChange={(event) => setRepaymentNote(event.target.value)} placeholder="Statement payment" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-9 px-3" onClick={submitRepayment} disabled={activeCards.length === 0}>
              {editingRepaymentId ? 'Save repayment' : 'Record repayment'}
            </Button>
            <Button className="min-h-9 px-3" variant="secondary" onClick={resetRepaymentForm}>
              Cancel
            </Button>
          </div>
        </div>
      </FormDrawer>

      <SectionGrid variant="compactLeft" className="gap-4">
        <Panel title="Credit card stack" description="Tap a card for the full editable overview." accent="cyan" density="compact">
          <div className="grid justify-items-center gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {summary.cards.length > 0 ? (
              summary.cards.map((cardSummary) => (
                <CreditCardPreviewButton
                  key={cardSummary.card.id}
                  cardSummary={cardSummary}
                  onClick={() => setSelectedCardId(cardSummary.card.id)}
                />
              ))
            ) : (
              <p className="w-full rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/80 p-3 text-sm text-slate-500 sm:col-span-2 xl:col-span-1">
                No credit cards yet.
              </p>
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel
            title="Payment allocation list"
            description="Link payments and card spending into cards by pay period."
            accent="slate"
            density="compact"
          >
            <div className="space-y-2 xl:max-h-[760px] xl:overflow-y-auto xl:pr-1">
              {paymentGroups.length > 0 ? (
                paymentGroups.map((group, index) => (
                  <details
                    key={group.id}
                    open={group.isSelected || (!viewedPeriod && index === 0)}
                    className={
                      group.isSelected
                        ? 'rounded-[var(--radius-card)] border border-[var(--color-deep-navy)] bg-[var(--color-surface)] shadow-none'
                        : 'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-none'
                    }
                  >
                    <summary className="cursor-pointer list-none px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[var(--color-text-primary)]">{group.label}</p>
                            {group.isSelected && (
                              <Pill tone="emerald">Viewing</Pill>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                            {group.rows.length} payment{group.rows.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <p className="text-right text-sm font-semibold text-[var(--color-text-primary)]">{formatPence(group.totalPence)}</p>
                      </div>
                    </summary>
                    <div className="border-t border-[var(--color-border)] p-2.5">
                      {group.rows.length > 0 ? (
                        <ul className="space-y-2">
                          {group.rows.map((row) => (
                            <li key={row.id}>
                              <PaymentAllocationRow
                                activeCards={activeCards}
                                row={row}
                                onDeleteCustomPayment={(paymentId, paymentName) => {
                                  if (window.confirm(`Delete ${paymentName}?`)) {
                                    void actions.deleteCustomPayment(paymentId)
                                  }
                                }}
                                onLinkPayment={linkPayment}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <EmptyState
                          title="No payment rows in this paycheck."
                          description="Payments and card spending will appear here when they fall inside this pay period."
                          className="p-4"
                        />
                      )}
                    </div>
                  </details>
                ))
              ) : (
                <EmptyState
                  title="No payments to allocate."
                  description="Payments and card spending will appear here when they are available for card linking."
                  icon={<CreditCard size={18} aria-hidden="true" />}
                />
              )}
            </div>
          </Panel>
          {repaymentsPanel}
        </div>
      </SectionGrid>
    </div>
  )
}

function CardsHero({
  summary,
  viewedPeriod,
  openSummaryMetric,
  onOpenSummaryMetricChange,
  onNewCard,
  onAddOneOffPayment,
  onNewRepayment,
  canRecordRepayment,
}: {
  summary: CreditCardAllocationSummary
  viewedPeriod: PayPeriod | null
  openSummaryMetric: string | null
  onOpenSummaryMetricChange: (nextMetric: string | null | ((current: string | null) => string | null)) => void
  onNewCard: () => void
  onAddOneOffPayment: () => void
  onNewRepayment: () => void
  canRecordRepayment: boolean
}) {
  const activeCardLabel = `${summary.cards.length} active card${summary.cards.length === 1 ? '' : 's'}`

  return (
    <section
      aria-label="Cards hero"
      className="fintech-surface relative max-w-full min-w-0 overflow-hidden rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[var(--color-deep-navy)]" aria-hidden="true" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--color-emerald)]">
            <CreditCard size={18} aria-hidden="true" />
            <h1 className="text-2xl font-semibold leading-8 text-[var(--color-text-primary)] md:text-3xl md:leading-10">Cards</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--color-text-muted)]">
            {activeCardLabel}. Card cover is calculated from the selected pay period and existing card balances.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button className="min-h-9 px-3" onClick={onNewCard}>
            <PlusCircle size={16} />
            New card
          </Button>
          <Button className="min-h-9 px-3" variant="secondary" onClick={onAddOneOffPayment}>
            <ReceiptText size={16} />
            Add one-off payment
          </Button>
          <Button className="min-h-9 px-3" variant="secondary" onClick={onNewRepayment} disabled={!canRecordRepayment}>
            <PenLine size={16} />
            Record repayment
          </Button>
        </div>
      </div>

      <div className="mt-5 grid items-start gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <HeroMoneyCard
          label="Card cover needed"
          value={formatPence(summary.totalPlannedTopUpNeededPence)}
          description="Forecast owed balance after money already reserved for cards."
          breakdown={getCardCoverNeededBreakdown(summary.cards)}
          open={openSummaryMetric === 'card-cover-needed'}
          onOpenChange={(isOpen) =>
            onOpenSummaryMetricChange((current) => isOpen ? 'card-cover-needed' : current === 'card-cover-needed' ? null : current)
          }
          className="min-h-[14.5rem]"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Total owed"
            value={formatPence(summary.totalOwedPence)}
            tone={summary.totalOwedPence > 0 ? 'warning' : 'neutral'}
            detail="Forecast balance across active cards."
            breakdown={getTotalOwedBreakdown(summary.cards)}
            open={openSummaryMetric === 'total-owed'}
            onOpenChange={(isOpen) =>
              onOpenSummaryMetricChange((current) => isOpen ? 'total-owed' : current === 'total-owed' ? null : current)
            }
          />
          <MetricCard
            label="Available after card cover"
            value={formatPence(summary.paycheckRemainingAfterCardsPence)}
            tone={summary.paycheckRemainingAfterCardsPence < 0 ? 'bad' : 'good'}
            detail="Selected pay left after card cover."
            breakdown={getAvailableAfterCardCoverBreakdown(summary, viewedPeriod)}
            open={openSummaryMetric === 'available-after-card-cover'}
            onOpenChange={(isOpen) =>
              onOpenSummaryMetricChange((current) =>
                isOpen ? 'available-after-card-cover' : current === 'available-after-card-cover' ? null : current,
              )
            }
          />
        </div>
      </div>
    </section>
  )
}

type CreditCardVisualDetails = {
  limit: string
  owed: string
  available: string
  name: string
  provider: string
  directDebit: string
  utilization: string
  utilizationUnavailable: boolean
}

function CreditCardDesignModal({
  selectedDesignId,
  onSelect,
  onClose,
}: {
  selectedDesignId: string
  onSelect: (designId: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Card design"
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200/90 bg-white/[0.96] p-5 shadow-[0_26px_80px_rgba(15,23,42,0.22)] backdrop-blur"
      >
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Card design</h2>
            <p className="mt-1 text-sm text-slate-500">Choose the design shown on this card.</p>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close card design">
            <X size={18} />
          </Button>
        </div>
        <div className="credit-card-design-picker">
          {creditCardDesigns.map((design) => {
            const isSelected = normalizeCreditCardDesignId(selectedDesignId) === design.id

            return (
              <button
                key={design.id}
                type="button"
                aria-pressed={isSelected}
                className="credit-card-design-picker__option"
                onClick={() => onSelect(design.id)}
              >
                <div className={`figma-credit-card credit-card-design-picker__art figma-credit-card--${design.id}`} aria-hidden="true">
                  <CreditCardArtwork design={design} />
                </div>
                <span>{design.label}</span>
                {isSelected && <Check size={16} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CreditCardPreviewButton({
  cardSummary,
  onClick,
}: {
  cardSummary: CreditCardAllocationCardSummary
  onClick: () => void
}) {
  const design = getCreditCardDesign(cardSummary.card.designId)
  const visualDetails = getCreditCardVisualDetails(cardSummary)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${cardSummary.card.name} card details`}
      className="figma-card-button figma-card-button--compact"
    >
      <FigmaCreditCard details={visualDetails} design={design} />
      <div className="figma-card-button__summary">
        <div className="figma-card-button__header">
          <p className="figma-card-button__name">{cardSummary.card.name}</p>
          <span>{cardSummary.card.provider}</span>
        </div>
        <p className="figma-card-button__meta">
          <span><strong>{visualDetails.owed}</strong> owed</span>
          <span><strong>{visualDetails.available}</strong> available</span>
          <span><strong>{formatPence(cardSummary.forecastAvailableCreditPence)}</strong> forecast available</span>
          <span>{visualDetails.directDebit}</span>
          <span>{visualDetails.utilizationUnavailable ? 'Utilization unavailable' : `${visualDetails.utilization} used`}</span>
        </p>
      </div>
    </button>
  )
}

function FigmaCreditCard({ details, design }: { details: CreditCardVisualDetails; design: CreditCardDesign }) {
  return (
    <div
      className={`figma-credit-card figma-credit-card--${design.id}`}
      aria-label={`${details.name} credit card`}
      data-figma-file="IM8pUThhZaULAtixfqj42D"
      data-figma-design={design.id}
      data-node-id={design.nodeId}
    >
      <CreditCardArtwork design={design} />
      <div className="figma-credit-card__content">
        <div className="figma-credit-card__identity">
          <span>{details.provider}</span>
          <strong>{details.name}</strong>
        </div>
        <div className="figma-credit-card__due">
          <span>Due date</span>
          <strong>{details.directDebit}</strong>
        </div>
        <dl className="figma-credit-card__metrics">
          <div>
            <dt>Limit</dt>
            <dd>{details.limit}</dd>
          </div>
          <div>
            <dt>Owed</dt>
            <dd>{details.owed}</dd>
          </div>
          <div>
            <dt>Available</dt>
            <dd>{details.available}</dd>
          </div>
          <div>
            <dt>Utilization</dt>
            <dd>{details.utilizationUnavailable ? 'N/A' : details.utilization}</dd>
          </div>
        </dl>
      </div>
      <span className="sr-only">
        {details.name}, due date {details.directDebit}, {details.limit} limit, {details.owed} actual balance, {details.available} actual available, {details.utilizationUnavailable ? 'utilization unavailable' : `${details.utilization} utilization`}.
      </span>
    </div>
  )
}

function CreditCardArtwork({ design }: { design: CreditCardDesign }) {
  const assetPath = design.assetPath

  if (design.id === 'cart-minimal-11') {
    return (
      <div className="figma-credit-card__art" aria-hidden="true">
        <img className="figma-credit-card__layer figma-credit-card__layer--full" src={`${assetPath}/mask-vector.svg`} alt="" />
        <div className="figma-credit-card__stripe" />
        <img className="figma-credit-card__layer figma-credit-card__noise" src="/figma-assets/noise.png" alt="" />
        <img className="figma-credit-card__logo figma-credit-card__logo--contactless" src={`${assetPath}/contactless-logo.svg`} alt="" />
        <img className="figma-credit-card__logo figma-credit-card__logo--visa" src={`${assetPath}/visa-logo.svg`} alt="" />
        <img className="figma-credit-card__chip" src={`${assetPath}/chip.svg`} alt="" />
      </div>
    )
  }

  if (design.id === 'cart-minimal-13') {
    return (
      <div className="figma-credit-card__art" aria-hidden="true">
        <img className="figma-credit-card__layer figma-credit-card__layer--full" src={`${assetPath}/card-mask.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__layer--full" src={`${assetPath}/contour-lines.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__layer--bottom" src={`${assetPath}/bottom-panel.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__noise" src="/figma-assets/noise.png" alt="" />
        <img className="figma-credit-card__logo figma-credit-card__logo--mastercard" src={`${assetPath}/mastercard-logo.svg`} alt="" />
        <img className="figma-credit-card__chip" src={`${assetPath}/chip.svg`} alt="" />
      </div>
    )
  }

  if (design.id === 'cart-gradient-11' || design.id === 'cart-gradient-12') {
    return (
      <div className="figma-credit-card__art" aria-hidden="true">
        <img className="figma-credit-card__layer figma-credit-card__layer--full" src={`${assetPath}/mask-vector.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__layer--oversized" src={`${assetPath}/background-vector.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__noise" src="/figma-assets/noise.png" alt="" />
        <img className="figma-credit-card__logo figma-credit-card__logo--visa" src={`${assetPath}/visa-logo.svg`} alt="" />
        <img className="figma-credit-card__chip" src={`${assetPath}/chip.svg`} alt="" />
      </div>
    )
  }

  if (design.id === 'cart-geometric-11') {
    return (
      <div className="figma-credit-card__art" aria-hidden="true">
        <img className="figma-credit-card__layer figma-credit-card__layer--full" src={`${assetPath}/mask-vector.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__layer--circle" src={`${assetPath}/circle.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__noise" src="/figma-assets/noise.png" alt="" />
        <img className="figma-credit-card__logo figma-credit-card__logo--visa" src={`${assetPath}/visa-logo.svg`} alt="" />
        <img className="figma-credit-card__chip" src={`${assetPath}/chip.svg`} alt="" />
      </div>
    )
  }

  if (design.id === 'cart-geometric-1') {
    return (
      <div className="figma-credit-card__art" aria-hidden="true">
        <img className="figma-credit-card__layer figma-credit-card__layer--full" src={`${assetPath}/mask-vector.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__layer--geometric-1-circle" src={`${assetPath}/circle.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__noise" src="/figma-assets/noise.png" alt="" />
        <img className="figma-credit-card__logo figma-credit-card__logo--split" src={`${assetPath}/visa-logo.svg`} alt="" />
        <img className="figma-credit-card__chip" src={`${assetPath}/chip.svg`} alt="" />
      </div>
    )
  }

  if (isCartGeometric4Design(design.id)) {
    return (
      <div className="figma-credit-card__art" aria-hidden="true">
        <img className="figma-credit-card__layer figma-credit-card__layer--full" src={`${assetPath}/card-mask.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__layer--geometric-4-circle" src={`${assetPath}/circle.svg`} alt="" />
        {design.id === 'cart-geometric-4' && (
          <img className="figma-credit-card__layer figma-credit-card__layer--geometric-4-bottom" src={`${assetPath}/bottom-panel.svg`} alt="" />
        )}
        <img className="figma-credit-card__layer figma-credit-card__noise" src="/figma-assets/noise.png" alt="" />
        <img className="figma-credit-card__logo figma-credit-card__logo--mastercard" src={`${assetPath}/mastercard-logo.svg`} alt="" />
        <img className="figma-credit-card__chip" src={`${assetPath}/chip.svg`} alt="" />
      </div>
    )
  }

  if (design.id === 'cart-geometric-15') {
    return (
      <div className="figma-credit-card__art" aria-hidden="true">
        <img className="figma-credit-card__layer figma-credit-card__layer--full" src={`${assetPath}/mask-rectangle.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__layer--left-panel" src={`${assetPath}/green-panel.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__layer--right-panel" src={`${assetPath}/right-panel.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__layer--geometric" src={`${assetPath}/geometric-vector.svg`} alt="" />
        <img className="figma-credit-card__layer figma-credit-card__noise" src="/figma-assets/noise.png" alt="" />
        <img className="figma-credit-card__logo figma-credit-card__logo--visa" src={`${assetPath}/visa-logo.svg`} alt="" />
        <img className="figma-credit-card__chip" src={`${assetPath}/chip.svg`} alt="" />
      </div>
    )
  }

  return (
    <div className="figma-credit-card__art" aria-hidden="true">
      <img className="figma-credit-card__layer figma-credit-card__layer--full" src={`${assetPath}/background-panel.svg`} alt="" />
      <img className="figma-credit-card__layer figma-credit-card__layer--corner-circle" src={`${assetPath}/corner-circle.svg`} alt="" />
      <img className="figma-credit-card__layer figma-credit-card__layer--chevron-back" src={`${assetPath}/chevron-back.svg`} alt="" />
      <img className="figma-credit-card__layer figma-credit-card__layer--chevron-front" src={`${assetPath}/chevron-front.svg`} alt="" />
      <img className="figma-credit-card__layer figma-credit-card__layer--right-panel" src={`${assetPath}/right-panel.svg`} alt="" />
      <img className="figma-credit-card__layer figma-credit-card__noise" src="/figma-assets/noise.png" alt="" />
      <img className="figma-credit-card__logo figma-credit-card__logo--visa" src={`${assetPath}/visa-logo.svg`} alt="" />
      <img className="figma-credit-card__chip" src={`${assetPath}/chip.svg`} alt="" />
    </div>
  )
}

function isCartGeometric4Design(designId: string): boolean {
  return designId === 'cart-geometric-4' || designId.startsWith('cart-geometric-4-')
}

function getCreditCardVisualDetails(cardSummary: CreditCardAllocationCardSummary): CreditCardVisualDetails {
  const hasUtilization = cardSummary.card.limitPence > 0

  return {
    limit: formatPence(cardSummary.card.limitPence),
    owed: formatPence(cardSummary.actualOwedPence),
    available: formatPence(cardSummary.actualAvailableCreditPence),
    name: cardSummary.card.name,
    provider: cardSummary.card.provider,
    directDebit: cardSummary.nextDirectDebitDate ?? cardSummary.dueLabel,
    utilization: `${cardSummary.utilisationPercent}%`,
    utilizationUnavailable: !hasUtilization,
  }
}

type PaymentRowSource = 'recurring' | 'custom' | 'transaction'

interface PaymentRow {
  id: string
  entityId: string
  source: PaymentRowSource
  sourceLabel: string
  label: string
  amountPence: number
  date: string
  creditCardId: string | null
}

interface PaymentGroup {
  id: string
  label: string
  rows: PaymentRow[]
  totalPence: number
  isSelected: boolean
  sortDate: string
}

function PaymentAllocationRow({
  activeCards,
  row,
  onDeleteCustomPayment,
  onLinkPayment,
}: {
  activeCards: PlannerSnapshot['creditCards']
  row: PaymentRow
  onDeleteCustomPayment: (paymentId: string, paymentName: string) => void
  onLinkPayment: (row: PaymentRow, creditCardId: string) => Promise<void>
}) {
  const missingCardLabel = getMissingCardLabel(row.creditCardId, activeCards)
  const linkedCard = row.creditCardId ? activeCards.find((card) => card.id === row.creditCardId) ?? null : null
  const cardStatus = missingCardLabel ? (
    <Pill tone="danger">{missingCardLabel}</Pill>
  ) : linkedCard ? (
    <Pill tone="success">{linkedCard.name}</Pill>
  ) : (
    <Pill tone="warning">Unlinked</Pill>
  )

  return (
    <PaymentListRow
      title={row.label}
      source={row.sourceLabel}
      sourceTone={paymentSourceTone(row.source)}
      date={row.date}
      amount={formatPence(row.amountPence)}
      status={cardStatus}
      control={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[13rem] sm:flex-row sm:items-center">
          <SelectInput
            aria-label={`Linked card for ${row.label}`}
            className="h-9 sm:min-w-[11rem]"
            value={row.creditCardId ?? ''}
            onChange={(event) => void onLinkPayment(row, event.target.value)}
          >
            <option value="">No linked card</option>
            {missingCardLabel && (
              <option value={row.creditCardId ?? ''}>Missing selected card</option>
            )}
            {activeCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name} ({card.provider})
              </option>
            ))}
          </SelectInput>
          {row.source === 'custom' && (
            <IconButton
              label={`Delete ${row.label}`}
              size="sm"
              variant="subtle"
              className="text-[var(--color-danger)] hover:bg-[rgba(177,58,50,0.08)]"
              onClick={() => onDeleteCustomPayment(row.entityId, row.label)}
            >
              <Trash2 size={15} aria-hidden="true" />
            </IconButton>
          )}
        </div>
      }
    />
  )
}

function paymentSourceTone(source: PaymentRowSource): 'success' | 'warning' | 'danger' {
  if (source === 'recurring') {
    return 'success'
  }

  if (source === 'custom') {
    return 'warning'
  }

  return 'danger'
}

function getMissingCardLabel(
  creditCardId: string | null,
  activeCards: PlannerSnapshot['creditCards'],
): string | null {
  if (!creditCardId || activeCards.some((card) => card.id === creditCardId)) {
    return null
  }

  return `missing card ${creditCardId}`
}

function CreditCardOverview({
  cardSummary,
  snapshot,
  onBack,
  onDeleteCard,
  onDeleteCustomPayment,
  onDeleteRepayment,
  onEditCard,
  onEditRepayment,
}: {
  cardSummary: CreditCardAllocationCardSummary
  snapshot: PlannerSnapshot
  onBack: () => void
  onDeleteCard: (cardId: string, cardName: string) => void
  onDeleteCustomPayment: (paymentId: string, paymentName: string) => void
  onDeleteRepayment: (repaymentId: string) => void
  onEditCard: (cardId: string) => void
  onEditRepayment: (repaymentId: string) => void
}) {
  const design = getCreditCardDesign(cardSummary.card.designId)
  const chargedPence = cardSummary.items
    .filter((item) => item.source !== 'repayment')
    .reduce((total, item) => total + item.amountPence, 0)
  const repaidPence = Math.abs(
    cardSummary.items
      .filter((item) => item.source === 'repayment')
      .reduce((total, item) => total + item.amountPence, 0),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={18} />
          Back
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onEditCard(cardSummary.card.id)}>
            <PenLine size={16} />
            Edit card
          </Button>
          <IconButton
            label={`Delete ${cardSummary.card.name}`}
            size="sm"
            variant="subtle"
            className="text-[var(--color-danger)] hover:bg-[rgba(177,58,50,0.08)]"
            onClick={() => onDeleteCard(cardSummary.card.id, cardSummary.card.name)}
          >
            <Trash2 size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <div className="max-w-[561px]">
            <FigmaCreditCard details={getCreditCardVisualDetails(cardSummary)} design={design} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <CreditCardStat
              label="Actual balance"
              value={formatPence(cardSummary.actualOwedPence)}
              tone={cardSummary.actualOwedPence > 0 ? 'warning' : 'good'}
            />
            <CreditCardStat
              label="Actual available"
              value={formatPence(cardSummary.actualAvailableCreditPence)}
              tone="good"
            />
            <CreditCardStat
              label="Forecast balance"
              value={formatPence(cardSummary.forecastOwedPence)}
              detail={`${formatPence(cardSummary.plannedChargesPence)} planned charges · ${formatPence(cardSummary.plannedRepaymentsPence)} planned repayments`}
              tone={cardSummary.forecastOwedPence > cardSummary.actualOwedPence ? 'warning' : 'neutral'}
            />
            <CreditCardStat
              label="Forecast available"
              value={formatPence(cardSummary.forecastAvailableCreditPence)}
              tone={cardSummary.forecastAvailableCreditPence > 0 ? 'good' : 'bad'}
            />
            <CreditCardStat label="Reserved" value={formatPence(cardSummary.creditPotPence)} tone={cardSummary.creditPotPence > 0 ? 'good' : 'neutral'} />
            <CreditCardStat label="Statement date" value={cardSummary.statementDate ?? 'Setup needed'} tone={cardSummary.statementSetupNeeded ? 'warning' : 'neutral'} />
            <CreditCardStat label="Next statement" value={cardSummary.nextStatementDate ?? 'Setup needed'} tone={cardSummary.statementSetupNeeded ? 'warning' : 'neutral'} />
            <CreditCardStat label="Direct debit" value={cardSummary.nextDirectDebitDate ?? cardSummary.dueLabel} tone={cardSummary.statementSetupNeeded ? 'warning' : 'neutral'} />
            <CreditCardStat
              label="Actual used"
              value={`${cardSummary.utilisationPercent}%`}
              detail={`${formatPence(cardSummary.card.limitPence)} limit`}
              tone={cardSummary.utilisationPercent >= 80 ? 'bad' : cardSummary.utilisationPercent >= 50 ? 'warning' : 'neutral'}
            />
          </div>
        </div>

        <Panel
          title="Card activity"
          description="Charges and repayments in the selected pay period."
          accent="violet"
          density="compact"
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <CreditCardStat label="Charged" value={formatPence(chargedPence)} tone={chargedPence > 0 ? 'bad' : 'neutral'} />
            <CreditCardStat label="Repaid" value={formatPence(repaidPence)} tone={repaidPence > 0 ? 'good' : 'neutral'} />
          </div>
          <div className="space-y-3 xl:max-h-[620px] xl:overflow-y-auto xl:pr-1">
            {cardSummary.items.length > 0 ? (
              cardSummary.items.map((item) => (
                <CreditCardActivityRow
                  key={item.id}
                  item={item}
                  snapshot={snapshot}
                  onDeleteCustomPayment={onDeleteCustomPayment}
                  onDeleteRepayment={onDeleteRepayment}
                  onEditRepayment={onEditRepayment}
                />
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/80 p-4 text-sm text-slate-500">No card activity in this pay period.</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function CreditCardStat({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string
  value: string
  detail?: string
  tone?: 'neutral' | 'good' | 'warning' | 'bad'
}) {
  return (
    <div className={creditCardStatClass(tone)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  )
}

function creditCardStatClass(tone: 'neutral' | 'good' | 'warning' | 'bad'): string {
  if (tone === 'good') {
    return 'rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]'
  }

  if (tone === 'warning') {
    return 'rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]'
  }

  if (tone === 'bad') {
    return 'rounded-2xl border border-red-200 bg-red-50 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]'
  }

  return 'rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]'
}

function CreditCardActivityRow({
  item,
  snapshot,
  onDeleteCustomPayment,
  onDeleteRepayment,
  onEditRepayment,
}: {
  item: CreditCardAllocationItem
  snapshot: PlannerSnapshot
  onDeleteCustomPayment: (paymentId: string, paymentName: string) => void
  onDeleteRepayment: (repaymentId: string) => void
  onEditRepayment: (repaymentId: string) => void
}) {
  const isRepayment = item.source === 'repayment'
  const repaymentId = isRepayment ? item.id.replace('repayment-', '') : null
  const customPaymentId = item.source === 'custom' ? item.id.replace('custom-', '') : null
  const amountClassName = item.amountPence < 0 ? 'text-emerald-700' : 'text-red-700'

  return (
    <div className={`grid gap-3 rounded-2xl border bg-white/95 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 sm:grid-cols-[1fr_auto] ${overviewBorderClass(item.source)}`}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-950">{item.label}</p>
          <span className={overviewBadgeClass(item.source)}>{overviewSourceLabel(item.source)}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {item.date} · {whereFromLabel(item, snapshot)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <p className={`text-sm font-semibold ${amountClassName}`}>
          {item.amountPence < 0 ? '-' : ''}
          {formatPence(Math.abs(item.amountPence))}
        </p>
        {customPaymentId && (
          <IconButton
            label={`Delete ${item.label}`}
            size="sm"
            variant="subtle"
            className="text-[var(--color-danger)] hover:bg-[rgba(177,58,50,0.08)]"
            onClick={() => onDeleteCustomPayment(customPaymentId, item.label)}
          >
            <Trash2 size={16} aria-hidden="true" />
          </IconButton>
        )}
        {repaymentId && (
          <>
            <IconButton label={`Edit ${item.label}`} size="sm" variant="subtle" onClick={() => onEditRepayment(repaymentId)}>
              <PenLine size={16} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`Delete ${item.label}`}
              size="sm"
              variant="subtle"
              className="text-[var(--color-danger)] hover:bg-[rgba(177,58,50,0.08)]"
              onClick={() => onDeleteRepayment(repaymentId)}
            >
              <Trash2 size={16} aria-hidden="true" />
            </IconButton>
          </>
        )}
      </div>
    </div>
  )
}

function getCardCoverNeededBreakdown(cards: CreditCardAllocationCardSummary[]): CalculationBreakdown {
  const totalCoverNeededPence = cards.reduce((total, cardSummary) => total + cardSummary.plannedTopUpNeededPence, 0)

  return {
    formula: 'Card cover needed = forecast card balance minus money already reserved in credit pots and linked pots.',
    lines:
      cards.length > 0
        ? [
            ...cards.map((cardSummary) => ({
              label: cardSummary.card.name,
              value: formatPence(cardSummary.plannedTopUpNeededPence),
              detail: `${formatPence(cardSummary.forecastOwedPence)} forecast balance · ${formatPence(cardSummary.creditPotPence)} reserved.`,
              tone: cardSummary.plannedTopUpNeededPence > 0 ? ('add' as const) : ('muted' as const),
            })),
            {
              label: 'Card cover needed',
              value: formatPence(totalCoverNeededPence),
              tone: 'result' as const,
            },
          ]
        : [{ label: 'No active cards', value: formatPence(0), tone: 'result' }],
    note: 'Actual available credit is calculated from actual card balance only. Forecast availability includes planned charges.',
  }
}

function getTotalOwedBreakdown(cards: CreditCardAllocationCardSummary[]): CalculationBreakdown {
  const totalOwedPence = cards.reduce((total, cardSummary) => total + cardSummary.forecastOwedPence, 0)

  return {
    formula: 'Total owed = forecast balance across all active cards in the selected pay period.',
    lines:
      cards.length > 0
        ? [
            ...cards.map((cardSummary) => ({
              label: cardSummary.card.name,
              value: formatPence(cardSummary.forecastOwedPence),
              detail: `${formatPence(cardSummary.actualOwedPence)} actual balance · ${formatPence(cardSummary.plannedChargesPence)} planned charges.`,
              tone: cardSummary.forecastOwedPence > 0 ? ('add' as const) : ('muted' as const),
            })),
            {
              label: 'Total owed',
              value: formatPence(totalOwedPence),
              tone: 'result' as const,
            },
          ]
        : [{ label: 'No active cards', value: formatPence(0), tone: 'result' }],
  }
}

function getAvailableAfterCardCoverBreakdown(
  summary: CreditCardAllocationSummary,
  viewedPeriod: PayPeriod | null,
): CalculationBreakdown {
  const lines: CalculationBreakdown['lines'] = [
    {
      label: viewedPeriod ? 'Current pay period' : 'No selected pay period',
      value: formatPence(summary.payReceivedPence),
      detail: viewedPeriod ? `${viewedPeriod.startDate} to ${viewedPeriod.endDate}` : undefined,
      tone: 'add' as const,
    },
    {
      label: 'Card cover needed',
      value: `-${formatPence(summary.totalPlannedTopUpNeededPence)}`,
      detail: 'Forecast card balance after reserved card money.',
      tone: summary.totalPlannedTopUpNeededPence > 0 ? ('subtract' as const) : ('muted' as const),
    },
  ]

  if (summary.totalPaycheckCreditPotsPence > 0) {
    lines.push({
      label: 'Paycheck credit pots',
      value: `-${formatPence(summary.totalPaycheckCreditPotsPence)}`,
      detail: 'Paycheck-funded card reserves already set aside.',
      tone: 'subtract' as const,
    })
  }

  lines.push({
    label: 'Available after card cover',
    value: formatPence(summary.paycheckRemainingAfterCardsPence),
    tone: 'result' as const,
  })

  return {
    formula: 'Available after card cover = selected pay minus card cover needed and paycheck-funded card reserves.',
    lines,
  }
}

function getPaymentRows(snapshot: PlannerSnapshot): PaymentRow[] {
  return [
    ...snapshot.recurringPayments.map((payment) => recurringPaymentToRow(payment)),
    ...snapshot.customPayments
      .filter((payment) => payment.status !== 'archived')
      .map((payment) => ({
        id: `custom-${payment.id}`,
        entityId: payment.id,
        source: 'custom' as const,
        sourceLabel: 'Custom',
        label: payment.name,
        amountPence: payment.amountPence,
        date: payment.dueDate,
        creditCardId: payment.creditCardId ?? null,
      })),
    ...snapshot.transactions
      .filter((transaction) => transaction.type === 'spending')
      .map((transaction) => transactionToRow(transaction)),
  ].sort((a, b) => b.date.localeCompare(a.date))
}

function groupPaymentRowsByPeriod(
  rows: PaymentRow[],
  snapshot: PlannerSnapshot,
  selectedPayPeriod: PayPeriod | null,
): PaymentGroup[] {
  const groups = new Map<string, PaymentGroup>()

  if (selectedPayPeriod) {
    groups.set(selectedPayPeriod.id, {
      id: selectedPayPeriod.id,
      label: `${selectedPayPeriod.payday} pay period · ${selectedPayPeriod.startDate} to ${selectedPayPeriod.endDate}`,
      rows: [],
      totalPence: 0,
      isSelected: true,
      sortDate: selectedPayPeriod.startDate,
    })
  }

  for (const row of rows) {
    const period = isIsoDate(row.date) ? findPayPeriodForDate(snapshot.payPeriods, row.date) : null
    const id = period?.id ?? (isIsoDate(row.date) ? 'outside-periods' : 'recurring-templates')
    const label = period
      ? `${period.payday} pay period · ${period.startDate} to ${period.endDate}`
      : isIsoDate(row.date)
        ? 'Outside saved pay periods'
        : 'Recurring templates'
    const existingGroup =
      groups.get(id) ??
      {
        id,
        label,
        rows: [],
        totalPence: 0,
        isSelected: period?.id === selectedPayPeriod?.id,
        sortDate: period?.startDate ?? (isIsoDate(row.date) ? row.date : '9999-12-31'),
      }

    existingGroup.rows.push(row)
    existingGroup.totalPence += row.amountPence
    groups.set(id, existingGroup)
  }

  return [...groups.values()].sort((a, b) => {
    if (a.isSelected !== b.isSelected) {
      return a.isSelected ? -1 : 1
    }

    return b.sortDate.localeCompare(a.sortDate)
  })
}

function recurringPaymentToRow(payment: RecurringPayment): PaymentRow {
  const isInterval = payment.frequency === 'weekly' || payment.frequency === 'biweekly'

  return {
    id: `recurring-${payment.id}`,
    entityId: payment.id,
    source: 'recurring',
    sourceLabel: 'Bill',
    label: payment.name,
    amountPence: payment.amountPence,
    date: payment.dueDate ?? (isInterval ? 'First due date missing' : `Day ${payment.dueDay ?? 1}`),
    creditCardId: payment.creditCardId ?? null,
  }
}

function transactionToRow(transaction: Transaction): PaymentRow {
  return {
    id: `transaction-${transaction.id}`,
    entityId: transaction.id,
    source: 'transaction',
    sourceLabel: 'Spending',
    label: transaction.note,
    amountPence: transaction.amountPence,
    date: transaction.date,
    creditCardId: transaction.creditCardId ?? null,
  }
}

function whereFromLabel(item: CreditCardAllocationItem, snapshot: PlannerSnapshot): string {
  if (item.source === 'repayment') {
    return 'Card repayment'
  }

  if (item.potId) {
    return snapshot.pots.find((pot) => pot.id === item.potId)?.name ?? 'Archived pot'
  }

  if (item.creditCardId) {
    return snapshot.creditCards.find((card) => card.id === item.creditCardId)?.name ?? `missing card ${item.creditCardId}`
  }

  return 'Unlinked'
}

function overviewBadgeClass(source: CreditCardAllocationItem['source']): string {
  if (source === 'recurring') {
    return 'rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700'
  }

  if (source === 'custom') {
    return 'rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700'
  }

  if (source === 'repayment') {
    return 'rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700'
  }

  return 'rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700'
}

function overviewBorderClass(source: CreditCardAllocationItem['source']): string {
  if (source === 'recurring') {
    return 'border-indigo-200 border-l-indigo-500 border-l-4'
  }

  if (source === 'custom') {
    return 'border-amber-200 border-l-amber-500 border-l-4'
  }

  if (source === 'repayment') {
    return 'border-emerald-200 border-l-emerald-500 border-l-4'
  }

  return 'border-rose-200 border-l-rose-500 border-l-4'
}

function overviewSourceLabel(source: CreditCardAllocationItem['source']): string {
  if (source === 'recurring') {
    return 'Recurring'
  }

  if (source === 'custom') {
    return 'Saved payment'
  }

  if (source === 'repayment') {
    return 'Repayment'
  }

  return 'Spending'
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}
