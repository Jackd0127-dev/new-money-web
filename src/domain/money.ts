import type {
  CreditCard,
  CreditCardPot,
  CreditCardRepayment,
  CustomPayment,
  Debt,
  DebtPayment,
  DebtReserve,
  PayFrequency,
  PayPeriod,
  Pot,
  PotAllocation,
  RecurringPayment,
  Settings,
  Transaction,
  TransactionType,
} from '../types/models.js'

const dayMs = 24 * 60 * 60 * 1000

interface PaycheckInput {
  hoursWorked: number
  hourlyRatePence: number
  actualAmountPence?: number | null
}

interface AllocationBalanceInput {
  incomePence: number
  reservedPence: number
  allocationPence: number
}

export interface AllocationBalance {
  availableAfterReservedPence: number
  remainingPence: number
  isOverAllocated: boolean
}

export interface NextPayPeriod {
  startDate: string
  endDate: string
  nextPayday: string
}

export interface RecurringPaymentOccurrence {
  payment: RecurringPayment
  dueDate: string
  amountPence: number
}

export interface DebtSummary {
  activeDebtCount: number
  overdueDebtCount: number
  totalCurrentBalancePence: number
  totalOriginalAmountPence: number
  totalPaidPence: number
  debtDueThisPayPeriodPence: number
  progressPercent: number
}

interface PayPeriodMoneySummaryInput {
  incomePence: number
  duePayments: RecurringPayment[]
  allocations: Array<Pick<PotAllocation, 'potId' | 'amountPence' | 'recurringPaymentId'>>
}

interface PayPeriodCostSummaryInput {
  payPeriod: PayPeriod | null
  creditCards?: CreditCard[]
  recurringPayments: RecurringPayment[]
  customPayments: CustomPayment[]
  transactions: Transaction[]
  debts: Debt[]
  creditCardRepayments: CreditCardRepayment[]
  creditCardPots?: CreditCardPot[]
  debtReserves?: DebtReserve[]
  pots?: Pot[]
  potAllocations?: PotAllocation[]
  asOfDate?: string
}

interface LinkedCreditCardPotCostItemParts {
  type: 'base' | 'additional'
  creditCardId: string
  batchKey: string | null
}

export interface PayPeriodMoneySummary {
  payReceivedPence: number
  allocatedPence: number
  uncoveredRecurringPence: number
  totalPaymentsDuePence: number
  moneyLeftPence: number
  isOverCommitted: boolean
}

export type PeriodCostItemSource =
  | 'recurring'
  | 'saved_payment'
  | 'manual_spend'
  | 'pot_allocation'
  | 'debt_minimum'
  | 'debt_reserve'
  | 'credit_card_pot'
  | 'linked_credit_card_pot'
  | 'credit_card_repayment'

export interface PeriodCostItem {
  id: string
  label: string
  amountPence: number
  date: string
  source: PeriodCostItemSource
  creditCardId?: string | null
  potId?: string | null
  fundingPotId?: string | null
  createdAt?: string | null
  coverBreakdown?: LinkedCreditCardPotCoverBreakdownItem[]
}

export interface PayPeriodCostSummary {
  payReceivedPence: number
  directRecurringPence: number
  savedPaymentsPence: number
  manualSpendingPence: number
  potAllocationsPence: number
  debtMinimumsPence: number
  debtReservesPence: number
  creditCardPotsPence: number
  creditCardChargesPence: number
  creditCardRepaymentsPence: number
  creditCardNetPence: number
  totalCostsPence: number
  moneyLeftPence: number
  isOverCommitted: boolean
  items: PeriodCostItem[]
}

export function getDebtDueAmountPence(
  debt: Pick<Debt, 'currentBalancePence'>,
): number {
  return Math.max(0, debt.currentBalancePence)
}

export function getPlannedDebtReservePence(
  reserves: DebtReserve[],
  debtId?: string,
): number {
  return reserves
    .filter((reserve) => reserve.status === 'planned' && (!debtId || reserve.debtId === debtId))
    .reduce((total, reserve) => total + reserve.amountPence, 0)
}

export function getDebtDueAmountAfterReservesPence(
  debt: Pick<Debt, 'id' | 'currentBalancePence'>,
  reserves: DebtReserve[],
): number {
  return Math.max(0, getDebtDueAmountPence(debt) - getPlannedDebtReservePence(reserves, debt.id))
}

export function getLinkedCreditCardPotPence(
  pots: Pot[],
  creditCardId?: string | null,
): number {
  if (!creditCardId) {
    return 0
  }

  return pots
    .filter((pot) => !pot.archived && pot.linkedCreditCardId === creditCardId)
    .reduce((total, pot) => total + Math.max(0, pot.balancePence), 0)
}

export function getLinkedDebtPotPence(
  pots: Pot[],
  debtId?: string | null,
): number {
  if (!debtId) {
    return 0
  }

  return pots
    .filter((pot) => !pot.archived && pot.linkedDebtId === debtId)
    .reduce((total, pot) => total + Math.max(0, pot.balancePence), 0)
}

export function getDebtDueAmountAfterReservesAndLinkedPotsPence(
  debt: Pick<Debt, 'id' | 'currentBalancePence'>,
  reserves: DebtReserve[],
  pots: Pot[] = [],
): number {
  return Math.max(
    0,
    getDebtDueAmountAfterReservesPence(debt, reserves) - getLinkedDebtPotPence(pots, debt.id),
  )
}

interface CreditCardAllocationInput {
  creditCards: CreditCard[]
  recurringPayments: RecurringPayment[]
  customPayments: CustomPayment[]
  transactions: Transaction[]
  repayments: CreditCardRepayment[]
  creditCardPots?: CreditCardPot[]
  pots?: Pot[]
  payPeriod: PayPeriod | null
  asOfDate?: string
}

export interface CreditCardAllocationItem {
  id: string
  creditCardId: string | null
  potId?: string | null
  label: string
  amountPence: number
  date: string
  source: 'recurring' | 'custom' | 'spending' | 'repayment'
}

export interface CreditCardAllocationCardSummary {
  card: CreditCard
  openingBalancePence: number
  openingStatementBalancePence: number
  statementDate: string | null
  nextStatementDate: string | null
  nextDirectDebitDate: string | null
  statementSetupNeeded: boolean
  actualOwedPence: number
  actualAvailableCreditPence: number
  actualUncoveredPence: number
  forecastOwedPence: number
  forecastAvailableCreditPence: number
  forecastUtilisationPercent: number
  plannedChargesPence: number
  plannedRepaymentsPence: number
  plannedTopUpNeededPence: number
  owedPence: number
  creditPotPence: number
  paycheckCreditPotPence: number
  externalCreditPotPence: number
  linkedPotPence: number
  remainingAfterCreditPotsPence: number
  availableCreditPence: number
  utilisationPercent: number
  dueLabel: string
  items: CreditCardAllocationItem[]
  balanceItems: CreditCardAllocationItem[]
}

export interface CreditCardAllocationSummary {
  cards: CreditCardAllocationCardSummary[]
  unlinkedItems: CreditCardAllocationItem[]
  totalActualOwedPence: number
  totalActualAvailableCreditPence: number
  totalForecastOwedPence: number
  totalForecastAvailableCreditPence: number
  totalActualUncoveredPence: number
  totalPlannedTopUpNeededPence: number
  totalOwedPence: number
  totalCreditPotsPence: number
  totalPaycheckCreditPotsPence: number
  totalExternalCreditPotsPence: number
  totalLinkedPotPence: number
  totalRemainingAfterCreditPotsPence: number
  payReceivedPence: number
  paycheckRemainingAfterCardsPence: number
}

export interface CreditCardStatementBreakdownItem {
  id: string
  label: string
  detail: string
  amountPence: number
  date: string
  source: 'opening_statement' | 'spending' | 'recurring' | 'custom' | 'repayment'
}

export interface CreditCardStatementPayment {
  statementDate: string
  previousStatementDate: string | null
  nextStatementDate: string
  directDebitDate: string
  actualDuePence: number
  forecastDuePence: number
  breakdown: CreditCardStatementBreakdownItem[]
}

interface CreditCardStatementPaymentInput {
  card: CreditCard
  recurringPayments: RecurringPayment[]
  customPayments: CustomPayment[]
  transactions: Transaction[]
  repayments: CreditCardRepayment[]
  startDate: string
  endDate: string
  asOfDate?: string
}

interface LinkedCreditCardPotCoverBreakdownInput {
  creditCards: CreditCard[]
  recurringPayments: RecurringPayment[]
  customPayments: CustomPayment[]
  transactions: Transaction[]
  repayments: CreditCardRepayment[]
  creditCardPots?: CreditCardPot[]
  pots: Pot[]
  payPeriod: PayPeriod
  creditCardId: string
  linkedPotId?: string | null
  amountPence: number
  excludedLinkedPotAllocationPence?: number
  asOfDate?: string
}

export interface LinkedCreditCardPotCoverBreakdownItem {
  id: string
  label: string
  detail: string
  amountPence: number
  date: string
  source: 'current_shortfall' | CreditCardAllocationItem['source'] | 'adjustment'
}

export function calculatePaycheckAmount({
  hoursWorked,
  hourlyRatePence,
  actualAmountPence,
}: PaycheckInput): number {
  if (typeof actualAmountPence === 'number') {
    return Math.round(actualAmountPence)
  }

  return Math.round(hoursWorked * hourlyRatePence)
}

export function getAllocationBalance({
  incomePence,
  reservedPence,
  allocationPence,
}: AllocationBalanceInput): AllocationBalance {
  const availableAfterReservedPence = incomePence - reservedPence
  const remainingPence = availableAfterReservedPence - allocationPence

  return {
    availableAfterReservedPence,
    remainingPence,
    isOverAllocated: remainingPence < 0,
  }
}

export function applyTransactionToPot(
  pot: Pot,
  amountPence: number,
  type: TransactionType,
): Pot {
  const delta = type === 'spending' ? -Math.abs(amountPence) : amountPence

  return {
    ...pot,
    balancePence: pot.balancePence + delta,
    updatedAt: new Date().toISOString(),
  }
}

export function getPotBalanceAfterTransactionRemoval(
  pot: Pot,
  transaction: Pick<Transaction, 'amountPence' | 'type'>,
): number {
  if (transaction.type === 'spending') {
    return pot.balancePence + Math.abs(transaction.amountPence)
  }

  if (transaction.type === 'allocation') {
    return pot.balancePence - Math.abs(transaction.amountPence)
  }

  return pot.balancePence
}

export function getAppTodayIso(
  settings?: Pick<Settings, 'appDateMode' | 'manualTodayIso'> | null,
): string {
  if (settings?.appDateMode === 'manual' && settings.manualTodayIso && isIsoDate(settings.manualTodayIso)) {
    return settings.manualTodayIso
  }

  return toIsoDate(new Date())
}

export function createNextPayPeriod(payday: string, frequency: PayFrequency): NextPayPeriod {
  const start = parseDate(payday)
  const days = frequencyToDays(frequency)
  const nextPayday = addDays(start, days)
  const end = addDays(nextPayday, -1)

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    nextPayday: toIsoDate(nextPayday),
  }
}

export function getRecurringPaymentsDue(
  payments: RecurringPayment[],
  startDate: string,
  endDate: string,
): RecurringPayment[] {
  return getRecurringPaymentOccurrences(payments, startDate, endDate)
    .map((occurrence) => ({
      ...occurrence.payment,
      amountPence: occurrence.amountPence,
    }))
    .sort((a, b) => getPriorityRank(a.priority) - getPriorityRank(b.priority))
}

export function getRecurringPaymentOccurrences(
  payments: RecurringPayment[],
  startDate: string,
  endDate: string,
): RecurringPaymentOccurrence[] {
  const start = parseDate(startDate)
  const end = parseDate(endDate)

  return payments
    .filter((payment) => payment.active)
    .flatMap((payment) =>
      getRecurringPaymentDueDates(payment, start, end).map((dueDate) => ({
        payment,
        dueDate: toIsoDate(dueDate),
        amountPence: payment.amountPence,
      })),
    )
    .sort((a, b) => {
      const dateSort = a.dueDate.localeCompare(b.dueDate)

      if (dateSort !== 0) {
        return dateSort
      }

      return getPriorityRank(a.payment.priority) - getPriorityRank(b.payment.priority)
    })
}

export function getTotalPence(items: Array<{ amountPence: number }>): number {
  return items.reduce((total, item) => total + item.amountPence, 0)
}

export function getSpendablePence(pots: Pot[]): number {
  return pots
    .filter((pot) => !pot.archived && ['spending', 'buffer'].includes(pot.type))
    .reduce((total, pot) => total + pot.balancePence, 0)
}

export function getUncoveredRecurringPence(
  payments: RecurringPayment[],
  allocations: Array<Pick<PotAllocation, 'potId' | 'amountPence' | 'recurringPaymentId'>>,
): number {
  const directAllocationByPayment = new Map<string, number>()
  const remainingAllocationByPot = new Map<string, number>()

  for (const allocation of allocations) {
    if (allocation.recurringPaymentId) {
      directAllocationByPayment.set(
        allocation.recurringPaymentId,
        (directAllocationByPayment.get(allocation.recurringPaymentId) ?? 0) + allocation.amountPence,
      )
      continue
    }

    remainingAllocationByPot.set(
      allocation.potId,
      (remainingAllocationByPot.get(allocation.potId) ?? 0) + allocation.amountPence,
    )
  }

  return payments.reduce((total, payment) => {
    const directAvailablePence = directAllocationByPayment.get(payment.id) ?? 0
    const directCoveredPence = Math.min(
      payment.amountPence,
      directAvailablePence,
    )
    directAllocationByPayment.set(payment.id, directAvailablePence - directCoveredPence)
    const remainingPaymentPence = payment.amountPence - directCoveredPence

    if (remainingPaymentPence <= 0) {
      return total
    }

    if (!payment.potId) {
      return total + remainingPaymentPence
    }

    const availableInPot = remainingAllocationByPot.get(payment.potId) ?? 0
    const coveredPence = Math.min(remainingPaymentPence, availableInPot)
    remainingAllocationByPot.set(payment.potId, availableInPot - coveredPence)

    return total + remainingPaymentPence - coveredPence
  }, 0)
}

export function getPayPeriodMoneySummary({
  incomePence,
  duePayments,
  allocations,
}: PayPeriodMoneySummaryInput): PayPeriodMoneySummary {
  const allocatedPence = getTotalPence(allocations)
  const uncoveredRecurringPence = getUncoveredRecurringPence(duePayments, allocations)
  const totalPaymentsDuePence = allocatedPence + uncoveredRecurringPence
  const moneyLeftPence = incomePence - totalPaymentsDuePence

  return {
    payReceivedPence: incomePence,
    allocatedPence,
    uncoveredRecurringPence,
    totalPaymentsDuePence,
    moneyLeftPence,
    isOverCommitted: moneyLeftPence < 0,
  }
}

export function getPayPeriodCostSummary({
  payPeriod,
  creditCards = [],
  recurringPayments,
  customPayments,
  transactions,
  debts,
  creditCardRepayments,
  creditCardPots = [],
  debtReserves = [],
  pots = [],
  potAllocations = [],
  asOfDate,
}: PayPeriodCostSummaryInput): PayPeriodCostSummary {
  if (!payPeriod) {
    return createEmptyPayPeriodCostSummary()
  }

  const recurringItems = getRecurringPaymentOccurrences(
    recurringPayments,
    payPeriod.startDate,
    payPeriod.endDate,
  )
    .map((occurrence) => ({
      id: `recurring-${occurrence.payment.id}-${occurrence.dueDate}`,
      label: occurrence.payment.name,
      amountPence: occurrence.amountPence,
      date: occurrence.dueDate,
      source: 'recurring' as const,
      creditCardId: occurrence.payment.creditCardId ?? null,
      potId: occurrence.payment.potId,
    }))
  const directRecurringItems = applyLinkedPotBalancesToRecurringItems(
    recurringItems.filter((item) => !item.creditCardId),
    pots,
  )
  const creditCardRecurringItems = recurringItems.filter((item) => item.creditCardId)
  const savedPaymentItems = customPayments
    .filter(
      (payment) =>
        payment.status !== 'archived' &&
        isIsoDateBetweenInclusive(payment.dueDate, payPeriod.startDate, payPeriod.endDate),
    )
    .map((payment) => ({
      id: `custom-${payment.id}`,
      label: payment.name,
      amountPence: payment.amountPence,
      date: payment.dueDate,
      source: 'saved_payment' as const,
      creditCardId: payment.creditCardId ?? null,
      potId: null,
    }))
  const manualSpendItems = transactions
    .filter(
      (transaction) =>
        transaction.type === 'spending' &&
        !transaction.recurringPaymentId &&
        isIsoDateBetweenInclusive(transaction.date, payPeriod.startDate, payPeriod.endDate),
    )
    .map((transaction) => ({
      id: `transaction-${transaction.id}`,
      label: transaction.note,
      amountPence: transaction.amountPence,
      date: transaction.date,
      source: 'manual_spend' as const,
      creditCardId: transaction.paymentMethod === 'credit_card' ? transaction.creditCardId ?? null : null,
      potId: transaction.potId ?? null,
    }))
  const potLookup = new Map(pots.map((pot) => [pot.id, pot]))
  const potAllocationItems = potAllocations
    .filter(
      (allocation) =>
        allocation.payPeriodId === payPeriod.id &&
        allocation.amountPence > 0 &&
        allocation.source !== 'recurring' &&
        !allocation.recurringPaymentId,
    )
    .map((allocation) => {
      const pot = potLookup.get(allocation.potId)
      const label = pot
        ? allocation.source === 'pot_auto'
          ? `${pot.name} payday top-up`
          : `${pot.name} allocation`
        : 'Pot allocation'

      return {
        id: `pot-allocation-${allocation.id}`,
        label,
        amountPence: allocation.amountPence,
        date: payPeriod.payday,
        source: 'pot_allocation' as const,
        creditCardId: null,
        potId: allocation.potId,
        fundingPotId: allocation.fundingPotId ?? null,
        createdAt: allocation.createdAt,
      }
    })
  const debtReserveItems = debtReserves
    .filter(
      (reserve) =>
        reserve.status === 'planned' &&
        reserve.amountPence > 0 &&
        isDebtReserveInPayPeriod(reserve, payPeriod),
    )
    .map((reserve) => {
      const debt = debts.find((candidate) => candidate.id === reserve.debtId)

      return {
        id: `debt-reserve-${reserve.id}`,
        label: debt ? `${debt.name} reserve` : 'Debt reserve',
        amountPence: reserve.amountPence,
        date: reserve.payday,
        source: 'debt_reserve' as const,
        creditCardId: null,
        potId: null,
      }
    })
  const debtMinimumItems = debts
    .filter(
      (debt) =>
        debt.status === 'active' &&
        debt.currentBalancePence > 0 &&
        debt.dueDate <= payPeriod.endDate,
    )
    .map((debt) => ({
      id: `debt-${debt.id}`,
      label: debt.name,
      amountPence: getDebtDueAmountAfterReservesAndLinkedPotsPence(debt, debtReserves, pots),
      date: debt.dueDate,
      source: 'debt_minimum' as const,
      creditCardId: null,
      potId: null,
    }))
    .filter((item) => item.amountPence > 0)
  const creditCardPotItems = creditCardPots
    .filter(
      (creditCardPot) =>
        creditCardPot.status === 'active' &&
        creditCardPot.source === 'paycheck' &&
        creditCardPot.amountPence > 0 &&
        isCreditCardPotInPayPeriod(creditCardPot, payPeriod),
    )
    .map((creditCardPot) => ({
      id: `credit-card-pot-${creditCardPot.id}`,
      label: creditCardPot.name,
      amountPence: creditCardPot.amountPence,
      date: creditCardPot.payday ?? payPeriod.payday,
      source: 'credit_card_pot' as const,
      creditCardId: creditCardPot.creditCardId,
      potId: null,
    }))
  const repaymentItems = creditCardRepayments
    .filter((repayment) => isIsoDateBetweenInclusive(repayment.date, payPeriod.startDate, payPeriod.endDate))
    .map((repayment) => ({
      id: `repayment-${repayment.id}`,
      label: repayment.note || 'Card repayment',
      amountPence: -repayment.amountPence,
      date: repayment.date,
      source: 'credit_card_repayment' as const,
      creditCardId: repayment.creditCardId,
      potId: null,
    }))
  const activeCreditCardIds = new Set(creditCards.filter((card) => !card.archived).map((card) => card.id))
  const linkedCreditCardPots = activeCreditCardIds.size > 0
    ? pots.filter((pot) => !pot.archived && pot.linkedCreditCardId)
    : []
  const linkedCreditCardIds = new Set(
    linkedCreditCardPots
      .map((pot) => pot.linkedCreditCardId)
      .filter((cardId): cardId is string => typeof cardId === 'string' && activeCreditCardIds.has(cardId)),
  )
  const completedLinkedCardAllocationByCardId = new Map(
    [...linkedCreditCardIds]
      .map((creditCardId) => [
        creditCardId,
        getLatestCompletedLinkedCreditCardPotAllocation(potAllocations, payPeriod.id, creditCardId),
      ] as const)
      .filter((entry): entry is readonly [string, PotAllocation] => Boolean(entry[1])),
  )
  const linkedCreditCardPotItems = linkedCreditCardIds.size > 0
    ? getCreditCardAllocationSummary({
        creditCards,
        recurringPayments,
        customPayments,
        transactions,
        repayments: creditCardRepayments,
        creditCardPots,
        pots,
        payPeriod,
        asOfDate,
      }).cards.flatMap((cardSummary) => {
        if (!linkedCreditCardIds.has(cardSummary.card.id) || cardSummary.plannedTopUpNeededPence <= 0) {
          return []
        }

        const linkedPot = linkedCreditCardPots.find((pot) => pot.linkedCreditCardId === cardSummary.card.id)

        if (!linkedPot) {
          return []
        }

        const completedAllocation = completedLinkedCardAllocationByCardId.get(cardSummary.card.id) ?? null
        const isAdditionalCover = Boolean(completedAllocation)
        const coverBreakdown = completedAllocation
          ? getAdditionalLinkedCreditCardPotCoverBreakdown({
              recurringPayments,
              customPayments,
              transactions,
              payPeriod,
              creditCardId: cardSummary.card.id,
              amountPence: cardSummary.plannedTopUpNeededPence,
              completedAllocation,
            })
          : undefined
        const itemId = isAdditionalCover
          ? getAdditionalLinkedCreditCardPotCostItemId(
              cardSummary.card.id,
              getAdditionalLinkedCreditCardPotBatchKey(coverBreakdown ?? [], completedAllocation),
            )
          : getLinkedCreditCardPotCostItemId(cardSummary.card.id)

        return [
          {
            id: itemId,
            label: `${cardSummary.card.name} planned card cover`,
            amountPence: cardSummary.plannedTopUpNeededPence,
            date: payPeriod.payday,
            source: 'linked_credit_card_pot' as const,
            creditCardId: cardSummary.card.id,
            potId: linkedPot.id,
            coverBreakdown,
          },
        ]
      })
    : []
  const allItems = [
    ...directRecurringItems,
    ...creditCardRecurringItems.filter((item) => !linkedCreditCardIds.has(item.creditCardId ?? '')),
    ...savedPaymentItems.filter((item) => !linkedCreditCardIds.has(item.creditCardId ?? '')),
    ...manualSpendItems.filter((item) => !linkedCreditCardIds.has(item.creditCardId ?? '')),
    ...potAllocationItems,
    ...debtReserveItems,
    ...debtMinimumItems,
    ...creditCardPotItems,
    ...linkedCreditCardPotItems,
    ...repaymentItems.filter((item) => !linkedCreditCardIds.has(item.creditCardId ?? '')),
  ].sort(sortPeriodCostItems)

  return createPayPeriodCostSummaryFromItems(payPeriod.incomePence, allItems)
}

function applyLinkedPotBalancesToRecurringItems(
  items: PeriodCostItem[],
  pots: Pot[],
): PeriodCostItem[] {
  const availableBalanceByPot = new Map(
    pots
      .filter((pot) => !pot.archived)
      .map((pot) => [pot.id, Math.max(0, pot.balancePence)]),
  )

  return items.map((item) => {
    if (!item.potId || item.amountPence <= 0) {
      return item
    }

    const availablePence = availableBalanceByPot.get(item.potId) ?? 0

    if (availablePence <= 0) {
      return item
    }

    const coveredPence = Math.min(item.amountPence, availablePence)
    availableBalanceByPot.set(item.potId, availablePence - coveredPence)

    return {
      ...item,
      amountPence: item.amountPence - coveredPence,
    }
  })
}

export function filterPayPeriodCostSummary(
  summary: PayPeriodCostSummary,
  ignoredItemIds: Iterable<string>,
): PayPeriodCostSummary {
  const ignoredIds = new Set(ignoredItemIds)

  if (ignoredIds.size === 0) {
    return summary
  }

  return createPayPeriodCostSummaryFromItems(
    summary.payReceivedPence,
    summary.items.filter((item) => !ignoredIds.has(item.id)),
  )
}

function createPayPeriodCostSummaryFromItems(
  payReceivedPence: number,
  items: PeriodCostItem[],
): PayPeriodCostSummary {
  const directRecurringPence = sumPositive(
    items.filter((item) => item.source === 'recurring' && !item.creditCardId),
  )
  const savedPaymentsPence = sumPositive(
    items.filter((item) => item.source === 'saved_payment' && !item.creditCardId),
  )
  const manualSpendingPence = sumPositive(
    items.filter((item) => item.source === 'manual_spend' && !item.creditCardId),
  )
  const potAllocationsPence = sumPositive(
    items.filter((item) => item.source === 'pot_allocation' && !item.fundingPotId),
  )
  const debtReservesPence = sumPositive(items.filter((item) => item.source === 'debt_reserve'))
  const debtMinimumsPence = sumPositive(items.filter((item) => item.source === 'debt_minimum'))
  const creditCardPotsPence = sumPositive(
    items.filter((item) => item.source === 'credit_card_pot' || item.source === 'linked_credit_card_pot'),
  )
  const creditCardChargesPence = sumPositive(
    items.filter(
      (item) =>
        item.creditCardId &&
        ['recurring', 'saved_payment', 'manual_spend'].includes(item.source),
    ),
  )
  const creditCardRepaymentsPence = Math.abs(
    items
      .filter((item) => item.source === 'credit_card_repayment')
      .reduce((total, item) => total + item.amountPence, 0),
  )
  const creditCardNetPence = Math.max(0, creditCardChargesPence - creditCardRepaymentsPence)
  const totalCostsPence =
    directRecurringPence +
    savedPaymentsPence +
    manualSpendingPence +
    potAllocationsPence +
    debtReservesPence +
    debtMinimumsPence +
    creditCardPotsPence +
    creditCardNetPence
  const moneyLeftPence = payReceivedPence - totalCostsPence

  return {
    payReceivedPence,
    directRecurringPence,
    savedPaymentsPence,
    manualSpendingPence,
    potAllocationsPence,
    debtMinimumsPence,
    debtReservesPence,
    creditCardPotsPence,
    creditCardChargesPence,
    creditCardRepaymentsPence,
    creditCardNetPence,
    totalCostsPence,
    moneyLeftPence,
    isOverCommitted: moneyLeftPence < 0,
    items,
  }
}

export function getCreditCardAllocationSummary({
  creditCards,
  recurringPayments,
  customPayments,
  transactions,
  repayments,
  creditCardPots = [],
  pots = [],
  payPeriod,
  asOfDate,
}: CreditCardAllocationInput): CreditCardAllocationSummary {
  const todayIso = asOfDate ?? toIsoDate(new Date())
  const rangeStart = payPeriod?.startDate ?? todayIso
  const rangeEnd = payPeriod?.endDate ?? todayIso
  const activeCards = creditCards.filter((card) => !card.archived)
  const items = [
    ...getRecurringPaymentOccurrences(recurringPayments, rangeStart, rangeEnd).map((occurrence) => ({
      id: `recurring-${occurrence.payment.id}-${occurrence.dueDate}`,
      creditCardId: occurrence.payment.creditCardId ?? null,
      potId: occurrence.payment.potId,
      label: occurrence.payment.name,
      amountPence: occurrence.amountPence,
      date: occurrence.dueDate,
      source: 'recurring' as const,
    })),
    ...customPayments
      .filter(
        (payment) =>
          payment.status === 'unpaid' &&
          payment.dueDate >= rangeStart &&
          payment.dueDate <= rangeEnd,
      )
      .map((payment) => ({
        id: `custom-${payment.id}`,
        creditCardId: payment.creditCardId ?? null,
        potId: null,
        label: payment.name,
        amountPence: payment.amountPence,
        date: payment.dueDate,
        source: 'custom' as const,
      })),
    ...transactions
      .filter(
        (transaction) =>
          transaction.type === 'spending' &&
          transaction.paymentMethod === 'credit_card' &&
          transaction.date >= rangeStart &&
          transaction.date <= rangeEnd,
      )
      .map((transaction) => ({
        id: `transaction-${transaction.id}`,
        creditCardId: transaction.creditCardId ?? null,
        potId: transaction.potId ?? null,
        label: transaction.note,
        amountPence: transaction.amountPence,
        date: transaction.date,
        source: 'spending' as const,
      })),
    ...repayments
      .filter((repayment) => repayment.date >= rangeStart && repayment.date <= rangeEnd)
      .map((repayment) => ({
        id: `repayment-${repayment.id}`,
        creditCardId: repayment.creditCardId,
        potId: null,
        label: repayment.note || 'Card repayment',
        amountPence: -repayment.amountPence,
        date: repayment.date,
        source: 'repayment' as const,
      })),
  ].sort((a, b) => {
    const dateSort = a.date.localeCompare(b.date)

    if (dateSort !== 0) {
      return dateSort
    }

    return a.label.localeCompare(b.label)
  })
  const cards = activeCards.map((card) => {
    const openingBalancePence = getCreditCardOpeningBalancePence(card)
    const openingStatementBalancePence = getCreditCardOpeningStatementBalancePence(card)
    const statementDate = getCreditCardStatementDate(card)
    const nextStatementDate = getNextCreditCardStatementDate(card, todayIso)
    const nextDirectDebitDate = getNextCreditCardDirectDebitDate(card, todayIso)
    const statementSetupNeeded = !statementDate
    const cardItems = items.filter((item) => item.creditCardId === card.id)
    const actualBalanceItems = getActualCreditCardBalanceItems({
      card,
      transactions,
      repayments,
      asOfDate: todayIso,
    })
    const actualOwedPence = Math.max(
      0,
      openingBalancePence + actualBalanceItems.reduce((total, item) => total + item.amountPence, 0),
    )
    const forecastItems = getForecastCreditCardItems(cardItems, todayIso)
    const forecastDeltaPence = forecastItems.reduce((total, item) => total + item.amountPence, 0)
    const forecastOwedPence = Math.max(0, actualOwedPence + forecastDeltaPence)
    const plannedChargesPence = forecastItems
      .filter((item) => item.amountPence > 0)
      .reduce((total, item) => total + item.amountPence, 0)
    const plannedRepaymentsPence = Math.abs(
      forecastItems
        .filter((item) => item.amountPence < 0)
        .reduce((total, item) => total + item.amountPence, 0),
    )
    const activeCreditPots = creditCardPots.filter(
      (creditCardPot) =>
        creditCardPot.creditCardId === card.id &&
        creditCardPot.status === 'active' &&
        creditCardPot.amountPence > 0 &&
        (!payPeriod || creditCardPot.source === 'external' || isCreditCardPotInPayPeriod(creditCardPot, payPeriod)),
    )
    const storedCreditPotPence = sumCreditCardPots(activeCreditPots)
    const paycheckCreditPotPence = sumCreditCardPots(activeCreditPots.filter((creditCardPot) => creditCardPot.source === 'paycheck'))
    const externalCreditPotPence = sumCreditCardPots(activeCreditPots.filter((creditCardPot) => creditCardPot.source === 'external'))
    const linkedPotPence = getLinkedCreditCardPotPence(pots, card.id)
    const creditPotPence = storedCreditPotPence + linkedPotPence
    const actualAvailableCreditPence = Math.max(0, card.limitPence - actualOwedPence)
    const forecastAvailableCreditPence = Math.max(0, card.limitPence - forecastOwedPence)
    const actualUncoveredPence = Math.max(0, actualOwedPence - creditPotPence)
    const plannedTopUpNeededPence = Math.max(0, forecastOwedPence - creditPotPence)

    return {
      card,
      openingBalancePence,
      openingStatementBalancePence,
      statementDate,
      nextStatementDate,
      nextDirectDebitDate,
      statementSetupNeeded,
      actualOwedPence,
      actualAvailableCreditPence,
      actualUncoveredPence,
      forecastOwedPence,
      forecastAvailableCreditPence,
      forecastUtilisationPercent: card.limitPence > 0 ? Math.round((forecastOwedPence / card.limitPence) * 100) : 0,
      plannedChargesPence,
      plannedRepaymentsPence,
      plannedTopUpNeededPence,
      owedPence: forecastOwedPence,
      creditPotPence,
      paycheckCreditPotPence,
      externalCreditPotPence,
      linkedPotPence,
      remainingAfterCreditPotsPence: plannedTopUpNeededPence,
      availableCreditPence: actualAvailableCreditPence,
      utilisationPercent: card.limitPence > 0 ? Math.round((actualOwedPence / card.limitPence) * 100) : 0,
      dueLabel: getCreditCardDueLabel(card),
      items: cardItems,
      balanceItems: actualBalanceItems,
    }
  })
  const totalActualOwedPence = cards.reduce((total, card) => total + card.actualOwedPence, 0)
  const totalActualAvailableCreditPence = cards.reduce((total, card) => total + card.actualAvailableCreditPence, 0)
  const totalForecastOwedPence = cards.reduce((total, card) => total + card.forecastOwedPence, 0)
  const totalForecastAvailableCreditPence = cards.reduce((total, card) => total + card.forecastAvailableCreditPence, 0)
  const totalActualUncoveredPence = cards.reduce((total, card) => total + card.actualUncoveredPence, 0)
  const totalPlannedTopUpNeededPence = cards.reduce((total, card) => total + card.plannedTopUpNeededPence, 0)
  const totalOwedPence = totalForecastOwedPence
  const totalCreditPotsPence = cards.reduce((total, card) => total + card.creditPotPence, 0)
  const totalPaycheckCreditPotsPence = cards.reduce((total, card) => total + card.paycheckCreditPotPence, 0)
  const totalExternalCreditPotsPence = cards.reduce((total, card) => total + card.externalCreditPotPence, 0)
  const totalLinkedPotPence = cards.reduce((total, card) => total + card.linkedPotPence, 0)
  const totalRemainingAfterCreditPotsPence = cards.reduce(
    (total, card) => total + card.remainingAfterCreditPotsPence,
    0,
  )

  return {
    cards,
    unlinkedItems: items.filter((item) => !item.creditCardId),
    totalActualOwedPence,
    totalActualAvailableCreditPence,
    totalForecastOwedPence,
    totalForecastAvailableCreditPence,
    totalActualUncoveredPence,
    totalPlannedTopUpNeededPence,
    totalOwedPence,
    totalCreditPotsPence,
    totalPaycheckCreditPotsPence,
    totalExternalCreditPotsPence,
    totalLinkedPotPence,
    totalRemainingAfterCreditPotsPence,
    payReceivedPence: payPeriod?.incomePence ?? 0,
    paycheckRemainingAfterCardsPence: (payPeriod?.incomePence ?? 0) - totalPlannedTopUpNeededPence - totalPaycheckCreditPotsPence,
  }
}

export function getCreditCardStatementPayments({
  card,
  recurringPayments,
  customPayments,
  transactions,
  repayments,
  startDate,
  endDate,
  asOfDate,
}: CreditCardStatementPaymentInput): CreditCardStatementPayment[] {
  const statementDate = getCreditCardStatementDate(card)
  const dueDay = card.dueDay ?? null

  if (!statementDate || !dueDay) {
    return []
  }

  const todayIso = asOfDate ?? toIsoDate(new Date())
  const payments: CreditCardStatementPayment[] = []
  let previousStatementDate: string | null = null
  let currentStatementDate = statementDate

  for (let guard = 0; guard < 240; guard += 1) {
    const directDebitDate = getCreditCardDirectDebitDateForStatement(currentStatementDate, dueDay)

    if (directDebitDate > endDate) {
      break
    }

    if (directDebitDate >= startDate) {
      const nextStatementDate = addIsoMonthsClamped(currentStatementDate, 1)
      const breakdown = getCreditCardStatementBreakdown({
        card,
        recurringPayments,
        customPayments,
        transactions,
        repayments,
        statementDate: currentStatementDate,
        previousStatementDate,
        nextStatementDate,
        directDebitDate,
        asOfDate: todayIso,
      })
      const actualDuePence = Math.max(
        0,
        breakdown
          .filter((line) => line.source === 'opening_statement' || line.source === 'spending' || line.source === 'repayment')
          .reduce((total, line) => total + line.amountPence, 0),
      )
      const forecastDuePence = Math.max(0, breakdown.reduce((total, line) => total + line.amountPence, 0))

      payments.push({
        statementDate: currentStatementDate,
        previousStatementDate,
        nextStatementDate,
        directDebitDate,
        actualDuePence,
        forecastDuePence,
        breakdown,
      })
    }

    previousStatementDate = currentStatementDate
    currentStatementDate = addIsoMonthsClamped(currentStatementDate, 1)
  }

  return payments
}

export function getCreditCardDirectDebitDateForStatement(statementDate: string, dueDay: number): string {
  const statement = parseDate(statementDate)
  let candidate = getMonthlyDateIso(
    statement.getUTCFullYear(),
    statement.getUTCMonth(),
    dueDay,
  )

  if (candidate <= statementDate) {
    const nextMonth = new Date(Date.UTC(statement.getUTCFullYear(), statement.getUTCMonth() + 1, 1))
    candidate = getMonthlyDateIso(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), dueDay)
  }

  return candidate
}

function getCreditCardStatementBreakdown({
  card,
  recurringPayments,
  customPayments,
  transactions,
  repayments,
  statementDate,
  previousStatementDate,
  directDebitDate,
  asOfDate,
}: {
  card: CreditCard
  recurringPayments: RecurringPayment[]
  customPayments: CustomPayment[]
  transactions: Transaction[]
  repayments: CreditCardRepayment[]
  statementDate: string
  previousStatementDate: string | null
  nextStatementDate: string
  directDebitDate: string
  asOfDate: string
}): CreditCardStatementBreakdownItem[] {
  const cycleStart = previousStatementDate
  const actualLines: CreditCardStatementBreakdownItem[] = cycleStart
    ? transactions
        .filter(
          (transaction) =>
            transaction.type === 'spending' &&
            transaction.paymentMethod === 'credit_card' &&
            transaction.creditCardId === card.id &&
            transaction.date >= cycleStart &&
            transaction.date < statementDate &&
            transaction.date <= asOfDate,
        )
        .map((transaction) => ({
          id: `statement-spending-${transaction.id}`,
          label: transaction.note || 'Manual spend',
          detail: transaction.recurringPaymentId ? `Logged recurring card spend on ${transaction.date}` : `Logged card spend on ${transaction.date}`,
          amountPence: transaction.amountPence,
          date: transaction.date,
          source: 'spending' as const,
        }))
    : getCreditCardOpeningStatementBalancePence(card) > 0
      ? [
          {
            id: `opening-statement-${card.id}-${statementDate}`,
            label: 'Existing statement due',
            detail: `Statement issued ${statementDate}`,
            amountPence: getCreditCardOpeningStatementBalancePence(card),
            date: statementDate,
            source: 'opening_statement' as const,
          },
        ]
      : []
  const actualRecurringKeys = cycleStart
    ? new Set(
        transactions
          .filter(
            (transaction) =>
              transaction.type === 'spending' &&
              transaction.paymentMethod === 'credit_card' &&
              transaction.creditCardId === card.id &&
              Boolean(transaction.recurringPaymentId) &&
              transaction.date >= cycleStart &&
              transaction.date < statementDate,
          )
          .map((transaction) => `${transaction.recurringPaymentId}:${transaction.date}`),
      )
    : new Set<string>()
  const recurringLines: CreditCardStatementBreakdownItem[] = cycleStart
    ? getRecurringPaymentOccurrences(recurringPayments, cycleStart, addIsoDays(statementDate, -1))
        .filter(
          (occurrence) =>
            occurrence.payment.creditCardId === card.id &&
            !actualRecurringKeys.has(`${occurrence.payment.id}:${occurrence.dueDate}`),
        )
        .map((occurrence) => ({
          id: `statement-recurring-${occurrence.payment.id}-${occurrence.dueDate}`,
          label: occurrence.payment.name,
          detail: `Forecast card charge due ${occurrence.dueDate}`,
          amountPence: occurrence.amountPence,
          date: occurrence.dueDate,
          source: 'recurring' as const,
        }))
    : []
  const customLines: CreditCardStatementBreakdownItem[] = cycleStart
    ? customPayments
        .filter(
          (payment) =>
            payment.status !== 'archived' &&
            payment.creditCardId === card.id &&
            payment.dueDate >= cycleStart &&
            payment.dueDate < statementDate,
        )
        .map((payment) => ({
          id: `statement-custom-${payment.id}`,
          label: payment.name,
          detail: payment.status === 'paid' ? `Saved card payment paid ${payment.dueDate}` : `Forecast saved card payment due ${payment.dueDate}`,
          amountPence: payment.amountPence,
          date: payment.dueDate,
          source: 'custom' as const,
        }))
    : []
  const repaymentLines: CreditCardStatementBreakdownItem[] = repayments
    .filter(
      (repayment) =>
        repayment.creditCardId === card.id &&
        repayment.date > statementDate &&
        repayment.date <= directDebitDate,
    )
    .map((repayment) => ({
      id: `statement-repayment-${repayment.id}`,
      label: repayment.note || 'Card repayment',
      detail: `Statement repayment on ${repayment.date}`,
      amountPence: -repayment.amountPence,
      date: repayment.date,
      source: 'repayment' as const,
    }))

  return capStatementRepaymentsToStatementDue([...actualLines, ...recurringLines, ...customLines, ...repaymentLines])
}

function capStatementRepaymentsToStatementDue(
  lines: CreditCardStatementBreakdownItem[],
): CreditCardStatementBreakdownItem[] {
  const sortedLines = [...lines].sort(sortCreditCardStatementBreakdownItems)
  let remainingStatementDuePence = sortedLines
    .filter((line) => line.source !== 'repayment' && line.amountPence > 0)
    .reduce((total, line) => total + line.amountPence, 0)

  return sortedLines.map((line) => {
    if (line.source !== 'repayment' || line.amountPence >= 0) {
      return line
    }

    const paidPence = Math.abs(line.amountPence)
    const appliedPence = Math.min(paidPence, remainingStatementDuePence)
    const extraPence = paidPence - appliedPence
    remainingStatementDuePence -= appliedPence

    if (extraPence <= 0) {
      return line
    }

    return {
      ...line,
      amountPence: -appliedPence,
      detail: `${line.detail} · ${formatPence(extraPence)} extra was already recorded and is not counted against this statement.`,
    }
  })
}

function sortCreditCardStatementBreakdownItems(
  a: CreditCardStatementBreakdownItem,
  b: CreditCardStatementBreakdownItem,
): number {
  const dateSort = a.date.localeCompare(b.date)

  if (dateSort !== 0) {
    return dateSort
  }

  return a.label.localeCompare(b.label)
}

export function getLinkedCreditCardPotCoverBreakdown({
  creditCards,
  recurringPayments,
  customPayments,
  transactions,
  repayments,
  creditCardPots = [],
  pots,
  payPeriod,
  creditCardId,
  linkedPotId,
  amountPence,
  excludedLinkedPotAllocationPence = 0,
  asOfDate,
}: LinkedCreditCardPotCoverBreakdownInput): LinkedCreditCardPotCoverBreakdownItem[] {
  const todayIso = asOfDate ?? toIsoDate(new Date())
  const adjustedPots =
    linkedPotId && excludedLinkedPotAllocationPence > 0
      ? pots.map((pot) =>
          pot.id === linkedPotId
            ? { ...pot, balancePence: Math.max(0, pot.balancePence - excludedLinkedPotAllocationPence) }
            : pot,
        )
      : pots
  const cardSummary = getCreditCardAllocationSummary({
    creditCards,
    recurringPayments,
    customPayments,
    transactions,
    repayments,
    creditCardPots,
    pots: adjustedPots,
    payPeriod,
    asOfDate: todayIso,
  }).cards.find((candidate) => candidate.card.id === creditCardId)

  if (!cardSummary) {
    return [
      {
        id: 'planned-card-cover',
        label: 'Planned card cover',
        detail: 'Linked credit card cover',
        amountPence,
        date: payPeriod.payday,
        source: 'adjustment',
      },
    ]
  }

  const lines: LinkedCreditCardPotCoverBreakdownItem[] = []
  const currentShortfallLabel = cardSummary.statementDate ? 'Existing statement due' : 'Owed from last statement'

  if (cardSummary.actualUncoveredPence > 0) {
    let remainingActualUncoveredPence = cardSummary.actualUncoveredPence
    const postedSpendItems = cardSummary.balanceItems.filter(
      (cardItem) =>
        cardItem.source === 'spending' &&
        cardItem.amountPence > 0 &&
        cardItem.date >= payPeriod.startDate &&
        cardItem.date <= todayIso,
    )
    const postedSpendPence = postedSpendItems.reduce((total, cardItem) => total + cardItem.amountPence, 0)
    const existingShortfallPence = Math.max(0, remainingActualUncoveredPence - postedSpendPence)

    if (existingShortfallPence > 0) {
      lines.push({
        id: 'current-shortfall',
        label: currentShortfallLabel,
        detail: `${formatPence(cardSummary.actualOwedPence)} owed minus ${formatPence(cardSummary.creditPotPence)} already set aside`,
        amountPence: existingShortfallPence,
        date: payPeriod.payday,
        source: 'current_shortfall',
      })
      remainingActualUncoveredPence -= existingShortfallPence
    }

    for (const cardItem of postedSpendItems) {
      if (remainingActualUncoveredPence <= 0) {
        break
      }

      const uncoveredSpendPence = Math.min(cardItem.amountPence, remainingActualUncoveredPence)

      if (uncoveredSpendPence > 0) {
        lines.push({
          id: cardItem.id,
          label: cardItem.label,
          detail: getCreditCardCoverBreakdownDetail(cardItem),
          amountPence: uncoveredSpendPence,
          date: cardItem.date,
          source: cardItem.source,
        })
        remainingActualUncoveredPence -= uncoveredSpendPence
      }
    }

    if (remainingActualUncoveredPence > 0) {
      lines.push({
        id: 'current-shortfall',
        label: currentShortfallLabel,
        detail: `${formatPence(cardSummary.actualOwedPence)} owed minus ${formatPence(cardSummary.creditPotPence)} already set aside`,
        amountPence: remainingActualUncoveredPence,
        date: payPeriod.payday,
        source: 'current_shortfall',
      })
    }
  }

  for (const cardItem of getForecastCreditCardItems(cardSummary.items, todayIso)) {
    lines.push({
      id: cardItem.id,
      label: cardItem.label,
      detail: getCreditCardCoverBreakdownDetail(cardItem),
      amountPence: cardItem.amountPence,
      date: cardItem.date,
      source: cardItem.source,
    })
  }

  const lineTotalPence = lines.reduce((total, line) => total + line.amountPence, 0)
  const adjustmentPence = amountPence - lineTotalPence

  if (adjustmentPence !== 0) {
    lines.push({
      id: 'cover-adjustment',
      label: adjustmentPence < 0 ? 'Existing card cover already set aside' : 'Additional forecast cover',
      detail: 'Linked pot balance and active card reserves are applied before this paycheck top-up',
      amountPence: adjustmentPence,
      date: payPeriod.payday,
      source: 'adjustment',
    })
  }

  return lines.length > 0
    ? lines
    : [
        {
          id: 'planned-card-cover',
          label: 'Planned card cover',
          detail: 'Linked credit card cover',
          amountPence,
          date: payPeriod.payday,
          source: 'adjustment',
        },
      ]
}

export function getAdditionalLinkedCreditCardPotCoverBreakdown({
  recurringPayments,
  customPayments,
  transactions,
  payPeriod,
  creditCardId,
  amountPence,
  completedAllocation,
}: {
  recurringPayments: RecurringPayment[]
  customPayments: CustomPayment[]
  transactions: Transaction[]
  payPeriod: PayPeriod
  creditCardId: string
  amountPence: number
  completedAllocation: PotAllocation
}): LinkedCreditCardPotCoverBreakdownItem[] {
  const cutoffTimestamp = completedAllocation.updatedAt || completedAllocation.createdAt
  const recurringLines = getRecurringPaymentOccurrences(
    recurringPayments.filter(
      (payment) =>
        payment.creditCardId === creditCardId &&
        isCreatedAfter(payment, cutoffTimestamp),
    ),
    payPeriod.startDate,
    payPeriod.endDate,
  ).map((occurrence) => ({
    id: `recurring-${occurrence.payment.id}-${occurrence.dueDate}`,
    label: occurrence.payment.name,
    detail: `Recurring card charge due ${occurrence.dueDate}`,
    amountPence: occurrence.amountPence,
    date: occurrence.dueDate,
    source: 'recurring' as const,
  }))
  const savedLines = customPayments
    .filter(
      (payment) =>
        payment.status === 'unpaid' &&
        payment.creditCardId === creditCardId &&
        payment.dueDate >= payPeriod.startDate &&
        payment.dueDate <= payPeriod.endDate &&
        isCreatedAfter(payment, cutoffTimestamp),
    )
    .map((payment) => ({
      id: `custom-${payment.id}`,
      label: payment.name,
      detail: `Saved card payment due ${payment.dueDate}`,
      amountPence: payment.amountPence,
      date: payment.dueDate,
      source: 'custom' as const,
    }))
  const spendingLines = transactions
    .filter(
      (transaction) =>
        transaction.type === 'spending' &&
        transaction.paymentMethod === 'credit_card' &&
        transaction.creditCardId === creditCardId &&
        !transaction.recurringPaymentId &&
        transaction.date >= payPeriod.startDate &&
        transaction.date <= payPeriod.endDate &&
        isCreatedAfter(transaction, cutoffTimestamp),
    )
    .map((transaction) => ({
      id: `transaction-${transaction.id}`,
      label: transaction.note || 'Manual spend',
      detail: `Logged card spend on ${transaction.date}`,
      amountPence: transaction.amountPence,
      date: transaction.date,
      source: 'spending' as const,
    }))
  const lines = [...recurringLines, ...savedLines, ...spendingLines].sort(sortCoverBreakdownItems)
  const cappedLines = capCoverBreakdownLinesToAmount(lines, amountPence)
  const cappedTotalPence = cappedLines.reduce((total, line) => total + line.amountPence, 0)
  const adjustmentPence = amountPence - cappedTotalPence

  if (adjustmentPence > 0) {
    cappedLines.push({
      id: 'additional-card-cover',
      label: 'Additional card cover',
      detail: 'New card costs after the previous checklist cover was completed',
      amountPence: adjustmentPence,
      date: payPeriod.payday,
      source: 'adjustment',
    })
  }

  return cappedLines.length > 0
    ? cappedLines
    : [
        {
          id: 'additional-card-cover',
          label: 'Additional card cover',
          detail: 'New card costs after the previous checklist cover was completed',
          amountPence,
          date: payPeriod.payday,
          source: 'adjustment',
        },
      ]
}

function capCoverBreakdownLinesToAmount(
  lines: LinkedCreditCardPotCoverBreakdownItem[],
  amountPence: number,
): LinkedCreditCardPotCoverBreakdownItem[] {
  let remainingPence = amountPence
  const cappedLines: LinkedCreditCardPotCoverBreakdownItem[] = []

  for (const line of lines) {
    if (remainingPence <= 0) {
      break
    }

    const lineAmountPence = Math.min(line.amountPence, remainingPence)

    if (lineAmountPence > 0) {
      cappedLines.push({
        ...line,
        amountPence: lineAmountPence,
      })
      remainingPence -= lineAmountPence
    }
  }

  return cappedLines
}

function sortCoverBreakdownItems(
  a: LinkedCreditCardPotCoverBreakdownItem,
  b: LinkedCreditCardPotCoverBreakdownItem,
): number {
  const dateSort = a.date.localeCompare(b.date)

  if (dateSort !== 0) {
    return dateSort
  }

  return a.label.localeCompare(b.label)
}

function getAdditionalLinkedCreditCardPotBatchKey(
  lines: LinkedCreditCardPotCoverBreakdownItem[],
  completedAllocation: PotAllocation | null,
): string {
  const firstLine = lines.find((line) => line.amountPence > 0)
  const rawKey = firstLine?.id
    ?? (completedAllocation ? `after-${completedAllocation.updatedAt || completedAllocation.createdAt}` : 'open')

  return rawKey.replace(/--+/g, '-').replace(/[^a-zA-Z0-9._:-]+/g, '-')
}

function isCreatedAfter(
  record: Pick<RecurringPayment | CustomPayment | Transaction, 'createdAt' | 'updatedAt'>,
  cutoffTimestamp: string,
): boolean {
  return (record.createdAt || record.updatedAt) > cutoffTimestamp
}

function getLinkedCreditCardPotCostItemId(creditCardId: string): string {
  return `linked-credit-card-pot-${creditCardId}`
}

function getAdditionalLinkedCreditCardPotCostItemId(creditCardId: string, batchKey?: string | null): string {
  const baseId = `linked-credit-card-pot-additional-${creditCardId}`

  return batchKey ? `${baseId}--${batchKey}` : baseId
}

export function isAdditionalLinkedCreditCardPotCostItemId(costItemId: string): boolean {
  return getLinkedCreditCardPotCostItemParts(costItemId)?.type === 'additional'
}

export function getLinkedCreditCardPotAllocationExclusionPence(
  potAllocations: PotAllocation[],
  payPeriodId: string,
  potId: string | null | undefined,
  allocationCreatedAt: string | null | undefined,
): number {
  if (!potId || !allocationCreatedAt) {
    return 0
  }

  return potAllocations
    .filter((allocation) => {
      const costItemId = getCostItemIdFromDashboardTodoAllocationId(allocation.id, payPeriodId)

      return (
        allocation.payPeriodId === payPeriodId &&
        allocation.potId === potId &&
        allocation.amountPence > 0 &&
        allocation.createdAt >= allocationCreatedAt &&
        Boolean(costItemId && getCreditCardIdFromLinkedCreditCardPotCostItemId(costItemId))
      )
    })
    .reduce((total, allocation) => total + allocation.amountPence, 0)
}

export function getAdditionalLinkedCreditCardPotAllocationPence(
  potAllocations: PotAllocation[],
  payPeriodId: string,
  potId: string | null | undefined,
  creditCardId: string,
): number {
  if (!potId) {
    return 0
  }

  return potAllocations
    .filter((allocation) => {
      const costItemId = getCostItemIdFromDashboardTodoAllocationId(allocation.id, payPeriodId)

      return (
        allocation.payPeriodId === payPeriodId &&
        allocation.potId === potId &&
        allocation.amountPence > 0 &&
        Boolean(costItemId && isAdditionalLinkedCreditCardPotCostItemId(costItemId)) &&
        getCreditCardIdFromLinkedCreditCardPotCostItemId(costItemId ?? '') === creditCardId
      )
    })
    .reduce((total, allocation) => total + allocation.amountPence, 0)
}

export function getCoveredAdditionalLinkedCardManualSpendTransactionIds(
  transactions: Transaction[],
  payPeriod: PayPeriod,
  creditCardId: string,
  coveredAmountPence: number,
): Set<string> {
  let remainingPence = coveredAmountPence
  const coveredIds = new Set<string>()
  const candidates = transactions
    .filter(
      (transaction) =>
        transaction.type === 'spending' &&
        transaction.paymentMethod === 'credit_card' &&
        transaction.creditCardId === creditCardId &&
        !transaction.recurringPaymentId &&
        transaction.amountPence > 0 &&
        transaction.date >= payPeriod.startDate &&
        transaction.date <= payPeriod.endDate,
    )
    .sort((a, b) => {
      const createdSort = (b.createdAt || '').localeCompare(a.createdAt || '')

      if (createdSort !== 0) {
        return createdSort
      }

      return b.date.localeCompare(a.date)
    })

  for (const transaction of candidates) {
    if (remainingPence <= 0) {
      break
    }

    if (transaction.amountPence <= remainingPence) {
      coveredIds.add(transaction.id)
      remainingPence -= transaction.amountPence
    }
  }

  return coveredIds
}

export function getCompletedLinkedCreditCardPotAllocation(
  potAllocations: PotAllocation[],
  payPeriodId: string,
  creditCardId: string,
): PotAllocation | null {
  const allocationId = getDashboardTodoAllocationId(payPeriodId, getLinkedCreditCardPotCostItemId(creditCardId))

  return potAllocations.find((allocation) => allocation.id === allocationId && allocation.amountPence > 0) ?? null
}

export function getLatestCompletedLinkedCreditCardPotAllocation(
  potAllocations: PotAllocation[],
  payPeriodId: string,
  creditCardId: string,
): PotAllocation | null {
  return getCompletedLinkedCreditCardPotAllocations(potAllocations, payPeriodId, creditCardId)[0] ?? null
}

export function getPreviousCompletedLinkedCreditCardPotAllocation(
  potAllocations: PotAllocation[],
  payPeriodId: string,
  creditCardId: string,
  allocation: PotAllocation,
): PotAllocation | null {
  const allocationTimestamp = allocation.updatedAt || allocation.createdAt

  return getCompletedLinkedCreditCardPotAllocations(potAllocations, payPeriodId, creditCardId)
    .filter((candidate) => {
      if (candidate.id === allocation.id) {
        return false
      }

      const candidateTimestamp = candidate.updatedAt || candidate.createdAt

      return candidateTimestamp < allocationTimestamp
    })[0] ?? null
}

function getCompletedLinkedCreditCardPotAllocations(
  potAllocations: PotAllocation[],
  payPeriodId: string,
  creditCardId: string,
): PotAllocation[] {
  return potAllocations
    .filter((allocation) => {
      const costItemId = getCostItemIdFromDashboardTodoAllocationId(allocation.id, payPeriodId)
      const parts = costItemId ? getLinkedCreditCardPotCostItemParts(costItemId) : null

      return (
        allocation.payPeriodId === payPeriodId &&
        allocation.amountPence > 0 &&
        parts?.creditCardId === creditCardId
      )
    })
    .sort(sortPotAllocationsNewestFirst)
}

function sortPotAllocationsNewestFirst(a: PotAllocation, b: PotAllocation): number {
  const timestampSort = (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)

  if (timestampSort !== 0) {
    return timestampSort
  }

  return b.id.localeCompare(a.id)
}

export function getDashboardTodoAllocationId(payPeriodId: string, costItemId: string): string {
  return `dashboard-todo-${payPeriodId}-${costItemId}`
}

export function getCostItemIdFromDashboardTodoAllocationId(allocationId: string, payPeriodId: string): string | null {
  const allocationPrefix = `dashboard-todo-${payPeriodId}-`

  if (!allocationId.startsWith(allocationPrefix)) {
    return null
  }

  return allocationId.slice(allocationPrefix.length) || null
}

export function getCostItemIdFromDashboardTodoPeriodCostItemId(itemId: string, payPeriodId: string): string | null {
  const potAllocationPrefix = 'pot-allocation-'
  const allocationId = itemId.startsWith(potAllocationPrefix)
    ? itemId.slice(potAllocationPrefix.length)
    : itemId

  return getCostItemIdFromDashboardTodoAllocationId(allocationId, payPeriodId)
}

export function getCreditCardIdFromLinkedCreditCardPotCostItemId(costItemId: string): string | null {
  return getLinkedCreditCardPotCostItemParts(costItemId)?.creditCardId ?? null
}

function getLinkedCreditCardPotCostItemParts(costItemId: string): LinkedCreditCardPotCostItemParts | null {
  const additionalLinkedCardPotPrefix = 'linked-credit-card-pot-additional-'
  const linkedCardPotPrefix = 'linked-credit-card-pot-'
  const additionalBatchSeparator = '--'

  if (costItemId.startsWith(additionalLinkedCardPotPrefix)) {
    const rest = costItemId.slice(additionalLinkedCardPotPrefix.length)
    const separatorIndex = rest.indexOf(additionalBatchSeparator)
    const creditCardId = separatorIndex >= 0 ? rest.slice(0, separatorIndex) : rest
    const batchKey = separatorIndex >= 0 ? rest.slice(separatorIndex + additionalBatchSeparator.length) || null : null

    return creditCardId
      ? {
          type: 'additional',
          creditCardId,
          batchKey,
        }
      : null
  }

  if (!costItemId.startsWith(linkedCardPotPrefix)) {
    return null
  }

  const creditCardId = costItemId.slice(linkedCardPotPrefix.length)

  return creditCardId
    ? {
        type: 'base',
        creditCardId,
        batchKey: null,
      }
    : null
}

function getActualCreditCardBalanceItems({
  card,
  transactions,
  repayments,
  asOfDate,
}: {
  card: CreditCard
  transactions: Transaction[]
  repayments: CreditCardRepayment[]
  asOfDate: string
}): CreditCardAllocationItem[] {
  return [
    ...transactions
      .filter(
        (transaction) =>
          transaction.type === 'spending' &&
          transaction.paymentMethod === 'credit_card' &&
          transaction.creditCardId === card.id &&
          transaction.date <= asOfDate,
      )
      .map((transaction) => ({
        id: `transaction-${transaction.id}`,
        creditCardId: card.id,
        potId: transaction.potId ?? null,
        label: transaction.note,
        amountPence: transaction.amountPence,
        date: transaction.date,
        source: 'spending' as const,
      })),
    ...repayments
      .filter(
        (repayment) =>
          repayment.creditCardId === card.id &&
          repayment.date <= asOfDate,
      )
      .map((repayment) => ({
        id: `repayment-${repayment.id}`,
        creditCardId: card.id,
        potId: null,
        label: repayment.note || 'Card repayment',
        amountPence: -repayment.amountPence,
        date: repayment.date,
        source: 'repayment' as const,
      })),
  ].sort(sortCreditCardItems)
}

function getForecastCreditCardItems(
  cardItems: CreditCardAllocationItem[],
  asOfDate: string,
): CreditCardAllocationItem[] {
  return cardItems.filter((item) => {
    if (item.source === 'recurring' || item.source === 'custom') {
      return true
    }

    return item.date > asOfDate
  })
}

function getCreditCardCoverBreakdownDetail(item: CreditCardAllocationItem): string {
  if (item.source === 'recurring') {
    return `Forecast card charge due ${item.date}`
  }

  if (item.source === 'custom') {
    return `Saved card payment due ${item.date}`
  }

  if (item.source === 'repayment') {
    return `Planned card repayment on ${item.date}`
  }

  return `Logged card spend on ${item.date}`
}

function getCreditCardOpeningBalancePence(card: CreditCard): number {
  return Math.max(0, card.openingBalancePence ?? 0)
}

function getCreditCardOpeningStatementBalancePence(card: CreditCard): number {
  return Math.max(0, card.openingStatementBalancePence ?? card.openingBalancePence ?? 0)
}

function getCreditCardStatementDate(card: CreditCard): string | null {
  return card.statementDate && isIsoDate(card.statementDate) ? card.statementDate : null
}

function getNextCreditCardStatementDate(card: CreditCard, asOfDate: string): string | null {
  let statementDate = getCreditCardStatementDate(card)

  if (!statementDate) {
    return null
  }

  for (let guard = 0; guard < 240 && statementDate < asOfDate; guard += 1) {
    statementDate = addIsoMonthsClamped(statementDate, 1)
  }

  return statementDate
}

function getNextCreditCardDirectDebitDate(card: CreditCard, asOfDate: string): string | null {
  const dueDay = card.dueDay ?? null
  let statementDate = getCreditCardStatementDate(card)

  if (!statementDate || !dueDay) {
    return null
  }

  for (let guard = 0; guard < 240; guard += 1) {
    const directDebitDate = getCreditCardDirectDebitDateForStatement(statementDate, dueDay)

    if (directDebitDate >= asOfDate) {
      return directDebitDate
    }

    statementDate = addIsoMonthsClamped(statementDate, 1)
  }

  return null
}

function sortCreditCardItems(a: CreditCardAllocationItem, b: CreditCardAllocationItem): number {
  const dateSort = a.date.localeCompare(b.date)

  if (dateSort !== 0) {
    return dateSort
  }

  return a.label.localeCompare(b.label)
}

export function getDaysInclusive(startDate: string, endDate: string): number {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / dayMs) + 1)
}

export function getDailySafeToSpendPence(spendablePence: number, today: string, endDate: string): number {
  return Math.floor(spendablePence / getDaysInclusive(today, endDate))
}

export function parsePoundsToPence(value: string): number {
  const normalized = value.trim().replace(/[£,\s]/g, '')

  if (!normalized) {
    return 0
  }

  const isNegative = normalized.startsWith('-')
  const unsigned = isNegative ? normalized.slice(1) : normalized
  const [pounds = '0', pence = ''] = unsigned.split('.')
  const wholePence = Number.parseInt(pounds || '0', 10) * 100
  const fractionPence = Number.parseInt(pence.padEnd(2, '0').slice(0, 2) || '0', 10)
  const result = wholePence + fractionPence

  return isNegative ? -result : result
}

export function formatPence(amountPence: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amountPence / 100)
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addIsoDays(date: string, days: number): string {
  return toIsoDate(addDays(parseDate(date), days))
}

export function addIsoMonthsClamped(date: string, months: number): string {
  const parsed = parseDate(date)
  const targetMonth = parsed.getUTCMonth() + months
  const target = new Date(Date.UTC(parsed.getUTCFullYear(), targetMonth, 1))

  return getMonthlyDateIso(target.getUTCFullYear(), target.getUTCMonth(), parsed.getUTCDate())
}

export function findPayPeriodForDate(payPeriods: PayPeriod[], date: string): PayPeriod | null {
  return (
    payPeriods.find((period) =>
      isIsoDateBetweenInclusive(date, period.startDate, period.endDate),
    ) ?? null
  )
}

export function getDebtSummary(
  debts: Debt[],
  payments: DebtPayment[],
  today: string,
  payPeriod: Pick<PayPeriod, 'endDate'> | null = null,
  debtReserves: DebtReserve[] = [],
  pots: Pot[] = [],
): DebtSummary {
  const activeDebts = debts.filter(
    (debt) => debt.status === 'active' && debt.currentBalancePence > 0,
  )
  const totalOriginalAmountPence = activeDebts.reduce(
    (total, debt) => total + debt.originalAmountPence,
    0,
  )
  const totalCurrentBalancePence = activeDebts.reduce(
    (total, debt) => total + debt.currentBalancePence,
    0,
  )
  const activeDebtIds = new Set(activeDebts.map((debt) => debt.id))
  const recordedPaymentPence = payments
    .filter((payment) => activeDebtIds.has(payment.debtId))
    .reduce((total, payment) => total + payment.amountPence, 0)
  const balanceReductionPence = Math.max(0, totalOriginalAmountPence - totalCurrentBalancePence)
  const totalPaidPence = Math.max(recordedPaymentPence, balanceReductionPence)

  return {
    activeDebtCount: activeDebts.length,
    overdueDebtCount: activeDebts.filter((debt) => debt.dueDate < today).length,
    totalCurrentBalancePence,
    totalOriginalAmountPence,
    totalPaidPence,
    debtDueThisPayPeriodPence: payPeriod
      ? activeDebts
          .filter((debt) => debt.dueDate <= payPeriod.endDate)
          .reduce(
            (total, debt) =>
              total + getDebtDueAmountAfterReservesAndLinkedPotsPence(debt, debtReserves, pots),
            0,
          )
      : 0,
    progressPercent:
      totalOriginalAmountPence > 0
        ? Math.round((totalPaidPence / totalOriginalAmountPence) * 100)
        : 0,
  }
}

function getCreditCardDueLabel(card: CreditCard): string {
  if (card.dueDate) {
    return card.dueDate
  }

  if (card.dueDay) {
    return `Day ${card.dueDay}`
  }

  return 'No due date'
}

function createEmptyPayPeriodCostSummary(): PayPeriodCostSummary {
  return {
    payReceivedPence: 0,
    directRecurringPence: 0,
    savedPaymentsPence: 0,
    manualSpendingPence: 0,
    potAllocationsPence: 0,
    debtMinimumsPence: 0,
    debtReservesPence: 0,
    creditCardPotsPence: 0,
    creditCardChargesPence: 0,
    creditCardRepaymentsPence: 0,
    creditCardNetPence: 0,
    totalCostsPence: 0,
    moneyLeftPence: 0,
    isOverCommitted: false,
    items: [],
  }
}

function isDebtReserveInPayPeriod(
  reserve: Pick<DebtReserve, 'payPeriodId' | 'periodStartDate' | 'periodEndDate'>,
  payPeriod: PayPeriod,
): boolean {
  if (reserve.payPeriodId) {
    return reserve.payPeriodId === payPeriod.id
  }

  return reserve.periodStartDate === payPeriod.startDate && reserve.periodEndDate === payPeriod.endDate
}

function isCreditCardPotInPayPeriod(
  creditCardPot: Pick<CreditCardPot, 'payPeriodId' | 'periodStartDate' | 'periodEndDate' | 'payday'>,
  payPeriod: PayPeriod,
): boolean {
  if (creditCardPot.payPeriodId) {
    return creditCardPot.payPeriodId === payPeriod.id
  }

  if (creditCardPot.periodStartDate && creditCardPot.periodEndDate) {
    return creditCardPot.periodStartDate === payPeriod.startDate && creditCardPot.periodEndDate === payPeriod.endDate
  }

  return Boolean(creditCardPot.payday && isIsoDateBetweenInclusive(creditCardPot.payday, payPeriod.startDate, payPeriod.endDate))
}

function sumPositive(items: Array<{ amountPence: number }>): number {
  return items.reduce((total, item) => total + Math.max(0, item.amountPence), 0)
}

function sumCreditCardPots(creditCardPots: CreditCardPot[]): number {
  return creditCardPots.reduce((total, creditCardPot) => total + Math.max(0, creditCardPot.amountPence), 0)
}

function sortPeriodCostItems(a: PeriodCostItem, b: PeriodCostItem): number {
  const dateSort = a.date.localeCompare(b.date)

  if (dateSort !== 0) {
    return dateSort
  }

  return a.label.localeCompare(b.label)
}

function isIsoDateBetweenInclusive(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate
}

function getRecurringPaymentDueDates(payment: RecurringPayment, start: Date, end: Date): Date[] {
  if (payment.frequency === 'weekly') {
    return getIntervalDueDates(payment, start, end, 7)
  }

  if (payment.frequency === 'biweekly') {
    return getIntervalDueDates(payment, start, end, 14)
  }

  if (payment.frequency === 'yearly') {
    return getYearlyDueDates(payment, start, end)
  }

  if (!payment.dueDay) {
    return []
  }

  return getMonthlyDueDates(payment, start, end)
}

function getMonthlyDueDates(payment: RecurringPayment, start: Date, end: Date): Date[] {
  if (!payment.dueDay) {
    return []
  }

  const firstEligibleDate = getRecurringStartDate(payment)
  const effectiveStart = firstEligibleDate && firstEligibleDate > start ? firstEligibleDate : start
  const dueDates: Date[] = []
  const cursor = new Date(Date.UTC(effectiveStart.getUTCFullYear(), effectiveStart.getUTCMonth(), 1))
  const dueDay = Math.min(31, Math.max(1, payment.dueDay))

  while (cursor <= end) {
    const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
    const date = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(dueDay, lastDay)))

    if (date >= effectiveStart && isBetweenInclusive(date, start, end)) {
      dueDates.push(date)
    }

    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return dueDates
}

function getRecurringStartDate(payment: RecurringPayment): Date | null {
  if (payment.dueDate && isIsoDate(payment.dueDate)) {
    return parseDate(payment.dueDate)
  }

  const createdDate = payment.createdAt.slice(0, 10)

  return isIsoDate(createdDate) ? parseDate(createdDate) : null
}

function getYearlyDueDates(payment: RecurringPayment, start: Date, end: Date): Date[] {
  const dueDates: Date[] = []
  const anchor = parseDate(payment.createdAt.slice(0, 10))

  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    const lastDay = new Date(Date.UTC(year, anchor.getUTCMonth() + 1, 0)).getUTCDate()
    const date = new Date(Date.UTC(year, anchor.getUTCMonth(), Math.min(payment.dueDay ?? 1, lastDay)))

    if (isBetweenInclusive(date, start, end)) {
      dueDates.push(date)
    }
  }

  return dueDates
}

function getIntervalDueDates(payment: RecurringPayment, start: Date, end: Date, intervalDays: number): Date[] {
  const anchor = getIntervalAnchorDate(payment)

  if (!anchor) {
    return []
  }

  const dueDates: Date[] = []
  let cursor = anchor

  while (cursor < start) {
    cursor = addDays(cursor, intervalDays)
  }

  while (cursor <= end) {
    if (isBetweenInclusive(cursor, start, end)) {
      dueDates.push(cursor)
    }

    cursor = addDays(cursor, intervalDays)
  }

  return dueDates
}

function getIntervalAnchorDate(payment: RecurringPayment): Date | null {
  if (payment.dueDate && isIsoDate(payment.dueDate)) {
    return parseDate(payment.dueDate)
  }

  if (!payment.dueDay) {
    return null
  }

  const createdDate = payment.createdAt.slice(0, 10)
  const created = isIsoDate(createdDate) ? parseDate(createdDate) : new Date()
  const lastDay = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth() + 1, 0)).getUTCDate()

  return new Date(Date.UTC(
    created.getUTCFullYear(),
    created.getUTCMonth(),
    Math.min(Math.max(1, payment.dueDay), lastDay),
  ))
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * dayMs)
}

function getMonthlyDateIso(year: number, monthIndex: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

  return toIsoDate(new Date(Date.UTC(year, monthIndex, Math.min(Math.max(1, day), lastDay))))
}

function frequencyToDays(frequency: PayFrequency): number {
  if (frequency === 'weekly') {
    return 7
  }

  if (frequency === 'monthly') {
    return 31
  }

  return 14
}

function isBetweenInclusive(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end
}

function getPriorityRank(priority: RecurringPayment['priority']): number {
  if (priority === 'essential') {
    return 0
  }

  if (priority === 'important') {
    return 1
  }

  return 2
}
