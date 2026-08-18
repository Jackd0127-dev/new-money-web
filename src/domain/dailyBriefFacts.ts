import {
  addIsoDays,
  getCreditCardAllocationSummary,
  getDebtDueAmountAfterReservesAndLinkedPotsPence,
  getRecurringPaymentOccurrences,
} from './money.js'
import type {
  CreditCard,
  CreditCardPot,
  CreditCardRepayment,
  CustomPayment,
  Debt,
  DebtReserve,
  DebtPayment,
  PayPeriod,
  Paycheck,
  Pot,
  PotAllocation,
  RecurringPayment,
  Settings,
  Transaction,
} from '../types/models.js'

export type BriefRiskSeverity = 'critical' | 'high' | 'medium' | 'low'

export type BriefRiskType =
  | 'overdue_payment'
  | 'due_today'
  | 'insufficient_funds'
  | 'credit_card_due'
  | 'overspent_pot'
  | 'low_pot'
  | 'unlinked_card_spend'
  | 'missing_data'

export interface DailyBriefSnapshotInput {
  settings?: Settings
  pots?: Pot[]
  recurringPayments?: RecurringPayment[]
  payPeriods?: PayPeriod[]
  paychecks?: Paycheck[]
  potAllocations?: PotAllocation[]
  transactions?: Transaction[]
  debts?: Debt[]
  debtPayments?: DebtPayment[]
  debtReserves?: DebtReserve[]
  creditCards?: CreditCard[]
  creditCardPots?: CreditCardPot[]
  customPayments?: CustomPayment[]
  creditCardRepayments?: CreditCardRepayment[]
  dailyBriefs?: unknown[]
}

export interface BriefPayment {
  id: string
  name: string
  amountPence: number
  dueIso: string
  source: 'recurring' | 'custom'
  sourceId: string
  creditCardId: string | null
}

export interface BriefCreditCard {
  id: string
  name: string
  provider: string
  owedPence: number
  availableCreditPence: number
  utilisationPercent: number
  dueIso: string | null
  statementDate: string | null
  statementSetupNeeded: boolean
}

export interface BriefPot {
  id: string
  name: string
  type: Pot['type']
  balancePence: number
}

export interface BriefDebtPayment {
  id: string
  name: string
  lender: string
  minimumPaymentPence: number
  amountDuePence: number
  dueIso: string
}

export interface BriefRisk {
  severity: BriefRiskSeverity
  type: BriefRiskType
  title: string
  amountPence?: number
  dueIso?: string
  sourceId?: string
  recommendedAction: string
}

export interface DailyBriefFacts {
  todayIso: string
  currency: 'GBP'
  payPeriod: {
    startIso: string | null
    nextPaydayIso: string | null
    daysUntilNextPayday: number | null
    payReceivedPence: number
    expectedPayPence: number | null
  }
  balances: {
    currentAvailablePence: number
    committedBeforeNextPaydayPence: number
    projectedAvailableBeforeNextPaydayPence: number
    safeToSpendPence: number | null
  }
  payments: {
    dueToday: BriefPayment[]
    overdue: BriefPayment[]
    dueBeforeNextPayday: BriefPayment[]
    unpaidCustomPayments: BriefPayment[]
  }
  creditCards: {
    cards: BriefCreditCard[]
    totalOwedPence: number
    minimumsDueBeforeNextPaydayPence: number
    unlinkedCardSpendingPence: number
    cardLinkedPaymentsPence: number
  }
  pots: {
    overspent: BriefPot[]
    low: BriefPot[]
  }
  debts: {
    minimumPaymentsDue: BriefDebtPayment[]
  }
  risks: BriefRisk[]
  missingData: string[]
}

const lowPotThresholdPence = 2000
const lowBufferThresholdPence = 5000
const severityRank: Record<BriefRiskSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export function getDailyBriefFacts(
  snapshot: DailyBriefSnapshotInput,
  todayIso: string,
): DailyBriefFacts {
  const pots = snapshot.pots ?? []
  const recurringPayments = snapshot.recurringPayments ?? []
  const payPeriods = snapshot.payPeriods ?? []
  const customPayments = snapshot.customPayments ?? []
  const debts = snapshot.debts ?? []
  const debtReserves = snapshot.debtReserves ?? []
  const creditCards = snapshot.creditCards ?? []
  const creditCardPots = snapshot.creditCardPots ?? []
  const transactions = snapshot.transactions ?? []
  const creditCardRepayments = snapshot.creditCardRepayments ?? []
  const payPeriod = getCurrentPayPeriod(payPeriods, todayIso)
  const rangeStart = payPeriod?.startDate ?? addIsoDays(todayIso, -30)
  const rangeEnd = payPeriod?.endDate ?? todayIso
  const nextPaydayIso = payPeriod?.nextPayday ?? null
  const daysUntilNextPayday = nextPaydayIso ? Math.max(0, getDayDifference(todayIso, nextPaydayIso)) : null
  const expectedPayPence = payPeriod
    ? (snapshot.paychecks ?? []).find((paycheck) => paycheck.payPeriodId === payPeriod.id)?.calculatedAmountPence ?? null
    : null
  const paidRecurringOccurrenceKeys = new Set(
    transactions
      .filter((transaction) => transaction.recurringPaymentId && transaction.type === 'spending')
      .map((transaction) => `${transaction.recurringPaymentId}:${transaction.date}`),
  )
  const recurringDue = getRecurringPaymentOccurrences(recurringPayments, rangeStart, rangeEnd)
    .filter((occurrence) => !paidRecurringOccurrenceKeys.has(`${occurrence.payment.id}:${occurrence.dueDate}`))
    .map((occurrence) => ({
      id: `recurring-${occurrence.payment.id}-${occurrence.dueDate}`,
      name: occurrence.payment.name,
      amountPence: occurrence.amountPence,
      dueIso: occurrence.dueDate,
      source: 'recurring' as const,
      sourceId: occurrence.payment.id,
      creditCardId: occurrence.payment.creditCardId ?? null,
    }))
  const unpaidCustomPayments = customPayments
    .filter((payment) => payment.status === 'unpaid' && payment.dueDate <= rangeEnd)
    .map((payment) => ({
      id: payment.id,
      name: payment.name,
      amountPence: payment.amountPence,
      dueIso: payment.dueDate,
      source: 'custom' as const,
      sourceId: payment.id,
      creditCardId: payment.creditCardId ?? null,
    }))
    .sort(sortBriefPayments)
  const duePayments = [...recurringDue, ...unpaidCustomPayments].sort(sortBriefPayments)
  const overdue = duePayments.filter((payment) => payment.dueIso < todayIso)
  const dueToday = duePayments.filter((payment) => payment.dueIso === todayIso)
  const dueBeforeNextPayday = duePayments.filter((payment) => payment.dueIso > todayIso && payment.dueIso <= rangeEnd)
  const debtMinimumPaymentsDue = debts
    .filter((debt) => debt.status === 'active' && debt.currentBalancePence > 0 && debt.dueDate <= rangeEnd)
    .map((debt) => ({
      id: debt.id,
      name: debt.name,
      lender: debt.lender,
      minimumPaymentPence: debt.minimumPaymentPence,
      amountDuePence: getDebtDueAmountAfterReservesAndLinkedPotsPence(debt, debtReserves, pots),
      dueIso: debt.dueDate,
    }))
    .sort((a, b) => a.dueIso.localeCompare(b.dueIso) || a.name.localeCompare(b.name))
  const currentAvailablePence = pots
    .filter((pot) => !pot.archived && !['saving', 'investment'].includes(pot.type))
    .reduce((total, pot) => total + pot.balancePence, 0)
  const committedBeforeNextPaydayPence =
    duePayments.reduce((total, payment) => total + payment.amountPence, 0) +
    debtMinimumPaymentsDue.reduce((total, debt) => total + debt.amountDuePence, 0)
  const projectedAvailableBeforeNextPaydayPence = currentAvailablePence - committedBeforeNextPaydayPence
  const safeToSpendPence =
    daysUntilNextPayday && daysUntilNextPayday > 0
      ? Math.floor(projectedAvailableBeforeNextPaydayPence / daysUntilNextPayday)
      : null
  const cardSummary = getCreditCardAllocationSummary({
    creditCards,
    recurringPayments,
    customPayments,
    transactions,
    repayments: creditCardRepayments,
    creditCardPots,
    pots,
    payPeriod,
    asOfDate: todayIso,
  })
  const cardLinkedPaymentsPence = duePayments
    .filter((payment) => payment.creditCardId)
    .reduce((total, payment) => total + payment.amountPence, 0)
  const unlinkedCardSpendingPence = transactions
    .filter(
      (transaction) =>
        transaction.type === 'spending' &&
        transaction.paymentMethod === 'credit_card' &&
        !transaction.creditCardId &&
        transaction.date >= rangeStart &&
        transaction.date <= rangeEnd,
    )
    .reduce((total, transaction) => total + transaction.amountPence, 0)
  const creditCardBriefs = cardSummary.cards.map((cardSummaryItem) => ({
    id: cardSummaryItem.card.id,
    name: cardSummaryItem.card.name,
    provider: cardSummaryItem.card.provider,
    owedPence: cardSummaryItem.actualOwedPence,
    availableCreditPence: cardSummaryItem.actualAvailableCreditPence,
    utilisationPercent: cardSummaryItem.utilisationPercent,
    dueIso: getCreditCardDueIso(cardSummaryItem.card, todayIso),
    statementDate: cardSummaryItem.statementDate,
    statementSetupNeeded: cardSummaryItem.statementSetupNeeded,
  }))
  const overspentPots = pots
    .filter((pot) => !pot.archived && pot.balancePence < 0)
    .map(toBriefPot)
    .sort((a, b) => a.balancePence - b.balancePence)
  const lowPots = pots
    .filter((pot) => !pot.archived && pot.balancePence > 0 && pot.balancePence <= lowPotThresholdPence)
    .map(toBriefPot)
    .sort((a, b) => a.balancePence - b.balancePence)
  const missingData = getMissingData({
    payPeriod,
    creditCardBriefs,
  })
  const risks = buildRisks({
    overdue,
    dueToday,
    creditCards: creditCardBriefs,
    overspentPots,
    lowPots,
    unlinkedCardSpendingPence,
    projectedAvailableBeforeNextPaydayPence,
    missingData,
    todayIso,
  })

  return {
    todayIso,
    currency: 'GBP',
    payPeriod: {
      startIso: payPeriod?.startDate ?? null,
      nextPaydayIso,
      daysUntilNextPayday,
      payReceivedPence: payPeriod?.incomePence ?? 0,
      expectedPayPence,
    },
    balances: {
      currentAvailablePence,
      committedBeforeNextPaydayPence,
      projectedAvailableBeforeNextPaydayPence,
      safeToSpendPence,
    },
    payments: {
      dueToday,
      overdue,
      dueBeforeNextPayday,
      unpaidCustomPayments,
    },
    creditCards: {
      cards: creditCardBriefs,
      totalOwedPence: cardSummary.totalActualOwedPence,
      minimumsDueBeforeNextPaydayPence: 0,
      unlinkedCardSpendingPence,
      cardLinkedPaymentsPence,
    },
    pots: {
      overspent: overspentPots,
      low: lowPots,
    },
    debts: {
      minimumPaymentsDue: debtMinimumPaymentsDue,
    },
    risks,
    missingData,
  }
}

function getCurrentPayPeriod(payPeriods: PayPeriod[], todayIso: string): PayPeriod | null {
  const containingToday = payPeriods.find((period) => period.startDate <= todayIso && period.endDate >= todayIso)

  if (containingToday) {
    return containingToday
  }

  return [...payPeriods].sort((a, b) => b.payday.localeCompare(a.payday))[0] ?? null
}

function getMissingData({
  payPeriod,
  creditCardBriefs,
}: {
  payPeriod: PayPeriod | null
  creditCardBriefs: BriefCreditCard[]
}): string[] {
  const missingData: string[] = []

  if (!payPeriod) {
    missingData.push('Current pay period is missing.')
  }

  if (creditCardBriefs.some((card) => card.owedPence > 0)) {
    missingData.push('Credit card minimum payment amounts are not tracked.')
  }

  for (const card of creditCardBriefs) {
    if (card.owedPence > 0 && !card.dueIso) {
      missingData.push(`${card.name} credit card due date is missing.`)
    }

    if (card.owedPence > 0 && card.statementSetupNeeded) {
      missingData.push(`${card.name} credit card statement date is missing.`)
    }
  }

  return missingData
}

function buildRisks({
  overdue,
  dueToday,
  creditCards,
  overspentPots,
  lowPots,
  unlinkedCardSpendingPence,
  projectedAvailableBeforeNextPaydayPence,
  missingData,
  todayIso,
}: {
  overdue: BriefPayment[]
  dueToday: BriefPayment[]
  creditCards: BriefCreditCard[]
  overspentPots: BriefPot[]
  lowPots: BriefPot[]
  unlinkedCardSpendingPence: number
  projectedAvailableBeforeNextPaydayPence: number
  missingData: string[]
  todayIso: string
}): BriefRisk[] {
  const risks: BriefRisk[] = [
    ...overdue.map((payment) => ({
      severity: 'critical' as const,
      type: 'overdue_payment' as const,
      title: `${payment.name} is overdue`,
      amountPence: payment.amountPence,
      dueIso: payment.dueIso,
      sourceId: payment.id,
      recommendedAction: `Pay or mark ${payment.name} as paid today.`,
    })),
    ...dueToday.map((payment) => ({
      severity: 'critical' as const,
      type: 'due_today' as const,
      title: `${payment.name} is due today`,
      amountPence: payment.amountPence,
      dueIso: payment.dueIso,
      sourceId: payment.id,
      recommendedAction: `Pay or mark ${payment.name} as paid today.`,
    })),
  ]

  if (projectedAvailableBeforeNextPaydayPence < 0) {
    risks.push({
      severity: 'critical',
      type: 'insufficient_funds',
      title: 'Projected money before payday is below £0',
      amountPence: Math.abs(projectedAvailableBeforeNextPaydayPence),
      recommendedAction: 'Review bills, card payments, and pot balances before spending more.',
    })
  } else if (projectedAvailableBeforeNextPaydayPence < lowBufferThresholdPence) {
    risks.push({
      severity: 'medium',
      type: 'insufficient_funds',
      title: 'Projected money before payday leaves a low buffer',
      amountPence: projectedAvailableBeforeNextPaydayPence,
      recommendedAction: 'Keep discretionary spending tight until the next payday.',
    })
  }

  for (const card of creditCards) {
    const daysUntilDue = card.dueIso ? getDayDifference(todayIso, card.dueIso) : null

    if (card.owedPence > 0 && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3) {
      risks.push({
        severity: 'high',
        type: 'credit_card_due',
        title: `${card.name} payment is due soon`,
        amountPence: card.owedPence,
        dueIso: card.dueIso ?? undefined,
        sourceId: card.id,
        recommendedAction: `Check the ${card.name} balance and payment before the due date.`,
      })
    }
  }

  risks.push(
    ...overspentPots.map((pot) => ({
      severity: 'high' as const,
      type: 'overspent_pot' as const,
      title: `${pot.name} pot is overspent`,
      amountPence: Math.abs(pot.balancePence),
      sourceId: pot.id,
      recommendedAction: `Top up ${pot.name} or reduce planned spending from that pot.`,
    })),
    ...lowPots.map((pot) => ({
      severity: 'medium' as const,
      type: 'low_pot' as const,
      title: `${pot.name} pot is low`,
      amountPence: pot.balancePence,
      sourceId: pot.id,
      recommendedAction: `Check whether ${pot.name} needs topping up before the next payment.`,
    })),
  )

  if (unlinkedCardSpendingPence > 0) {
    risks.push({
      severity: 'medium',
      type: 'unlinked_card_spend',
      title: 'Unlinked credit card spending needs review',
      amountPence: unlinkedCardSpendingPence,
      recommendedAction: 'Link the card spending to the right credit card or review it manually.',
    })
  }

  risks.push(
    ...missingData.map((missing) => ({
      severity: 'low' as const,
      type: 'missing_data' as const,
      title: missing,
      recommendedAction: 'Add the missing planner data to improve the daily brief.',
    })),
  )

  return risks.sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
}

function getCreditCardDueIso(card: CreditCard, todayIso: string): string | null {
  if (card.dueDate) {
    return card.dueDate
  }

  if (!card.dueDay) {
    return null
  }

  const today = parseIsoDate(todayIso)
  const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), getClampedMonthDay(today, card.dueDay)))
  const dueDate = candidate < today
    ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, getClampedMonthDay(
        new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)),
        card.dueDay,
      )))
    : candidate

  return dueDate.toISOString().slice(0, 10)
}

function getClampedMonthDay(date: Date, dueDay: number): number {
  return Math.min(dueDay, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate())
}

function getDayDifference(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86_400_000)
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function sortBriefPayments(a: BriefPayment, b: BriefPayment): number {
  return a.dueIso.localeCompare(b.dueIso) || a.name.localeCompare(b.name)
}

function toBriefPot(pot: Pot): BriefPot {
  return {
    id: pot.id,
    name: pot.name,
    type: pot.type,
    balancePence: pot.balancePence,
  }
}
