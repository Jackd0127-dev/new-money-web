import type {
  CreditCard,
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
  recurringPayments: RecurringPayment[]
  customPayments: CustomPayment[]
  transactions: Transaction[]
  debts: Debt[]
  creditCardRepayments: CreditCardRepayment[]
  debtReserves?: DebtReserve[]
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
  | 'debt_minimum'
  | 'debt_reserve'
  | 'credit_card_repayment'

export interface PeriodCostItem {
  id: string
  label: string
  amountPence: number
  date: string
  source: PeriodCostItemSource
  creditCardId?: string | null
  potId?: string | null
}

export interface PayPeriodCostSummary {
  payReceivedPence: number
  directRecurringPence: number
  savedPaymentsPence: number
  manualSpendingPence: number
  debtMinimumsPence: number
  debtReservesPence: number
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

interface CreditCardAllocationInput {
  creditCards: CreditCard[]
  recurringPayments: RecurringPayment[]
  customPayments: CustomPayment[]
  transactions: Transaction[]
  repayments: CreditCardRepayment[]
  payPeriod: PayPeriod | null
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
  owedPence: number
  availableCreditPence: number
  utilisationPercent: number
  dueLabel: string
  items: CreditCardAllocationItem[]
}

export interface CreditCardAllocationSummary {
  cards: CreditCardAllocationCardSummary[]
  unlinkedItems: CreditCardAllocationItem[]
  totalOwedPence: number
  payReceivedPence: number
  paycheckRemainingAfterCardsPence: number
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
  const seenPaymentIds = new Set<string>()

  return getRecurringPaymentOccurrences(payments, startDate, endDate)
    .filter((occurrence) => {
      if (seenPaymentIds.has(occurrence.payment.id)) {
        return false
      }

      seenPaymentIds.add(occurrence.payment.id)
      return true
    })
    .map((occurrence) => occurrence.payment)
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
  recurringPayments,
  customPayments,
  transactions,
  debts,
  creditCardRepayments,
  debtReserves = [],
}: PayPeriodCostSummaryInput): PayPeriodCostSummary {
  if (!payPeriod) {
    return createEmptyPayPeriodCostSummary()
  }

  const recurringItems = getRecurringPaymentOccurrences(
    recurringPayments,
    payPeriod.startDate,
    payPeriod.endDate,
  ).map((occurrence) => ({
    id: `recurring-${occurrence.payment.id}-${occurrence.dueDate}`,
    label: occurrence.payment.name,
    amountPence: occurrence.amountPence,
    date: occurrence.dueDate,
    source: 'recurring' as const,
    creditCardId: occurrence.payment.creditCardId ?? null,
    potId: occurrence.payment.potId,
  }))
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
      amountPence: getDebtDueAmountAfterReservesPence(debt, debtReserves),
      date: debt.dueDate,
      source: 'debt_minimum' as const,
      creditCardId: null,
      potId: null,
    }))
    .filter((item) => item.amountPence > 0)
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
  const allItems = [
    ...recurringItems,
    ...savedPaymentItems,
    ...manualSpendItems,
    ...debtReserveItems,
    ...debtMinimumItems,
    ...repaymentItems,
  ].sort(sortPeriodCostItems)
  const directRecurringPence = sumPositive(
    recurringItems.filter((item) => !item.creditCardId),
  )
  const savedPaymentsPence = sumPositive(
    savedPaymentItems.filter((item) => !item.creditCardId),
  )
  const manualSpendingPence = sumPositive(
    manualSpendItems.filter((item) => !item.creditCardId),
  )
  const debtReservesPence = sumPositive(debtReserveItems)
  const debtMinimumsPence = sumPositive(debtMinimumItems)
  const creditCardChargesPence = sumPositive(
    [...recurringItems, ...savedPaymentItems, ...manualSpendItems].filter((item) => item.creditCardId),
  )
  const creditCardRepaymentsPence = Math.abs(
    repaymentItems.reduce((total, item) => total + item.amountPence, 0),
  )
  const creditCardNetPence = Math.max(0, creditCardChargesPence - creditCardRepaymentsPence)
  const totalCostsPence =
    directRecurringPence +
    savedPaymentsPence +
    manualSpendingPence +
    debtReservesPence +
    debtMinimumsPence +
    creditCardNetPence
  const moneyLeftPence = payPeriod.incomePence - totalCostsPence

  return {
    payReceivedPence: payPeriod.incomePence,
    directRecurringPence,
    savedPaymentsPence,
    manualSpendingPence,
    debtMinimumsPence,
    debtReservesPence,
    creditCardChargesPence,
    creditCardRepaymentsPence,
    creditCardNetPence,
    totalCostsPence,
    moneyLeftPence,
    isOverCommitted: moneyLeftPence < 0,
    items: allItems,
  }
}

export function getCreditCardAllocationSummary({
  creditCards,
  recurringPayments,
  customPayments,
  transactions,
  repayments,
  payPeriod,
}: CreditCardAllocationInput): CreditCardAllocationSummary {
  const rangeStart = payPeriod?.startDate ?? '0000-01-01'
  const rangeEnd = payPeriod?.endDate ?? toIsoDate(new Date())
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
    const cardItems = items.filter((item) => item.creditCardId === card.id)
    const owedPence = Math.max(0, cardItems.reduce((total, item) => total + item.amountPence, 0))
    const availableCreditPence = Math.max(0, card.limitPence - owedPence)

    return {
      card,
      owedPence,
      availableCreditPence,
      utilisationPercent: card.limitPence > 0 ? Math.round((owedPence / card.limitPence) * 100) : 0,
      dueLabel: getCreditCardDueLabel(card),
      items: cardItems,
    }
  })
  const totalOwedPence = cards.reduce((total, card) => total + card.owedPence, 0)

  return {
    cards,
    unlinkedItems: items.filter((item) => !item.creditCardId),
    totalOwedPence,
    payReceivedPence: payPeriod?.incomePence ?? 0,
    paycheckRemainingAfterCardsPence: (payPeriod?.incomePence ?? 0) - totalOwedPence,
  }
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
          .reduce((total, debt) => total + getDebtDueAmountAfterReservesPence(debt, debtReserves), 0)
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
    debtMinimumsPence: 0,
    debtReservesPence: 0,
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

function sumPositive(items: Array<{ amountPence: number }>): number {
  return items.reduce((total, item) => total + Math.max(0, item.amountPence), 0)
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
  if (payment.dueDate) {
    return getAnchoredRecurringDates(payment, start, end)
  }

  if (!payment.dueDay) {
    return []
  }

  if (payment.frequency === 'weekly') {
    return getIntervalDueDates(payment.dueDay, start, end, 7)
  }

  if (payment.frequency === 'biweekly') {
    return getIntervalDueDates(payment.dueDay, start, end, 14)
  }

  if (payment.frequency === 'yearly') {
    return getYearlyDueDates(payment, start, end)
  }

  return getMonthlyDueDates(payment.dueDay, start, end)
}

function getMonthlyDueDates(dueDay: number, start: Date, end: Date): Date[] {
  const dueDates: Date[] = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))

  while (cursor <= end) {
    const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
    const date = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(dueDay, lastDay)))

    if (isBetweenInclusive(date, start, end)) {
      dueDates.push(date)
    }

    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return dueDates
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

function getIntervalDueDates(dueDay: number, start: Date, end: Date, intervalDays: number): Date[] {
  const dueDates: Date[] = []
  const boundedDueDay = Math.min(Math.max(1, dueDay), 28)
  const anchor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), boundedDueDay))
  let cursor = anchor

  while (cursor > start) {
    cursor = addDays(cursor, -intervalDays)
  }

  while (cursor <= end) {
    if (isBetweenInclusive(cursor, start, end)) {
      dueDates.push(cursor)
    }

    cursor = addDays(cursor, intervalDays)
  }

  return dueDates
}

function getAnchoredRecurringDates(payment: RecurringPayment, start: Date, end: Date): Date[] {
  const anchor = parseDate(payment.dueDate!)
  const dueDates: Date[] = []
  let cursor = anchor

  while (cursor < start) {
    cursor = getNextRecurringDate(cursor, payment.frequency)
  }

  while (cursor <= end) {
    dueDates.push(cursor)
    cursor = getNextRecurringDate(cursor, payment.frequency)
  }

  return dueDates
}

function getNextRecurringDate(date: Date, frequency: RecurringPayment['frequency']): Date {
  if (frequency === 'weekly') {
    return addDays(date, 7)
  }

  if (frequency === 'biweekly') {
    return addDays(date, 14)
  }

  if (frequency === 'yearly') {
    return new Date(Date.UTC(date.getUTCFullYear() + 1, date.getUTCMonth(), date.getUTCDate()))
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()))
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * dayMs)
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
