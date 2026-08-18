import {
  createNextPayPeriod,
  getDebtDueAmountAfterReservesAndLinkedPotsPence,
  getLinkedDebtPotPence,
  getPayPeriodCostSummary,
} from './money.js'
import type {
  CreditCardRepayment,
  CreditCardPot,
  CustomPayment,
  Debt,
  DebtReserve,
  PayPeriod,
  Pot,
  PotAllocation,
  RecurringPayment,
  Settings,
  Transaction,
} from '../types/models.js'

export interface DebtReservePlanInput {
  debt: Debt
  allDebts: Debt[]
  selectedPayPeriod: PayPeriod | null
  settings: Settings
  payPeriods: PayPeriod[]
  recurringPayments: RecurringPayment[]
  customPayments: CustomPayment[]
  transactions: Transaction[]
  creditCardPots?: CreditCardPot[]
  creditCardRepayments: CreditCardRepayment[]
  debtReserves: DebtReserve[]
  pots?: Pot[]
  potAllocations?: PotAllocation[]
}

export interface DebtReservePlanPeriod {
  payPeriodId: string | null
  payday: string
  periodStartDate: string
  periodEndDate: string
  incomePence: number
  baseCostsPence: number
  availablePence: number
  projected: boolean
}

export interface DebtReserveScheduleItem extends DebtReservePlanPeriod {
  amountPence: number
  shortfallPence: number
}

export interface DebtReservePlan {
  debt: Debt
  selectedPayPeriod: PayPeriod | null
  remainingDebtPence: number
  plannedReservePence: number
  recommendedAmountPence: number
  currentPeriodAvailablePence: number
  shortfallPence: number
  canCoverRecommendedAmount: boolean
  currentPeriodSkipped: boolean
  schedule: DebtReserveScheduleItem[]
  periods: DebtReservePlanPeriod[]
}

export function getDebtReservePlan(input: DebtReservePlanInput): DebtReservePlan {
  const selectedPayPeriod = input.selectedPayPeriod
  const plannedReservePence = input.debtReserves
    .filter((reserve) => reserve.debtId === input.debt.id && reserve.status === 'planned')
    .reduce((total, reserve) => total + reserve.amountPence, 0)
  const linkedPotPence = getLinkedDebtPotPence(input.pots ?? [], input.debt.id)
  const remainingDebtPence = getDebtDueAmountAfterReservesAndLinkedPotsPence(
    input.debt,
    input.debtReserves,
    input.pots ?? [],
  )
  const periods = selectedPayPeriod ? getPlanPeriods(input, selectedPayPeriod) : []
  const skippedPeriods = input.debtReserves.filter(
    (reserve) => reserve.debtId === input.debt.id && reserve.status === 'skipped',
  )
  const plannedPeriods = input.debtReserves.filter(
    (reserve) => reserve.debtId === input.debt.id && reserve.status === 'planned',
  )
  const candidatePeriods = periods.filter(
    (period) =>
      !skippedPeriods.some((reserve) => reserveMatchesPeriod(reserve, period)) &&
      !plannedPeriods.some((reserve) => reserveMatchesPeriod(reserve, period)),
  )
  const schedule = splitDebtAcrossPeriods(remainingDebtPence, candidatePeriods)
  const currentScheduleItem = selectedPayPeriod
    ? schedule.find((item) => item.payday === selectedPayPeriod.payday)
    : null
  const currentPeriod = selectedPayPeriod
    ? periods.find((period) => period.payday === selectedPayPeriod.payday)
    : null
  const currentPeriodSkipped = selectedPayPeriod
    ? skippedPeriods.some((reserve) =>
        reserveMatchesPeriod(reserve, toPlanPeriod(input, selectedPayPeriod, false)),
      )
    : false
  const recommendedAmountPence = currentScheduleItem?.amountPence ?? 0
  const currentPeriodAvailablePence = currentPeriod?.availablePence ?? 0
  const shortfallPence =
    currentScheduleItem?.shortfallPence ??
    (schedule.length === 0 && remainingDebtPence > 0 ? remainingDebtPence : 0)

  return {
    debt: input.debt,
    selectedPayPeriod,
    remainingDebtPence,
    plannedReservePence: plannedReservePence + linkedPotPence,
    recommendedAmountPence,
    currentPeriodAvailablePence,
    shortfallPence,
    canCoverRecommendedAmount: recommendedAmountPence <= currentPeriodAvailablePence,
    currentPeriodSkipped,
    schedule,
    periods,
  }
}

export function getDebtReservePlans(
  input: Omit<DebtReservePlanInput, 'debt'>,
): DebtReservePlan[] {
  return input.allDebts
    .filter((debt) => debt.status === 'active' && debt.currentBalancePence > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name))
    .map((debt) => getDebtReservePlan({ ...input, debt }))
}

function getPlanPeriods(
  input: DebtReservePlanInput,
  selectedPayPeriod: PayPeriod,
): DebtReservePlanPeriod[] {
  const periods: DebtReservePlanPeriod[] = []
  const frequency = selectedPayPeriod.payFrequency ?? input.settings.payFrequency
  const savedByPayday = new Map(input.payPeriods.map((period) => [period.payday, period]))
  let payday = selectedPayPeriod.payday
  let guard = 0

  while ((payday <= input.debt.dueDate || periods.length === 0) && guard < 32) {
    const savedPeriod = savedByPayday.get(payday)
    const period =
      savedPeriod ??
      ({
        id: null,
        payday,
        incomePence: selectedPayPeriod.incomePence,
        payFrequency: frequency,
        status: 'planned',
        createdAt: selectedPayPeriod.createdAt,
        updatedAt: selectedPayPeriod.updatedAt,
        ...createNextPayPeriod(payday, frequency),
      } satisfies Omit<PayPeriod, 'id'> & { id: null })

    periods.push(toPlanPeriod(input, period, !savedPeriod))
    payday = period.nextPayday
    guard += 1
  }

  return periods
}

function toPlanPeriod(
  input: DebtReservePlanInput,
  period: PayPeriod | (Omit<PayPeriod, 'id'> & { id: null }),
  projected: boolean,
): DebtReservePlanPeriod {
  const summary = getPayPeriodCostSummary({
    payPeriod: {
      ...period,
      id: period.id ?? `projected-${period.payday}`,
    },
    recurringPayments: input.recurringPayments,
    customPayments: input.customPayments,
    transactions: input.transactions,
    debts: input.allDebts.filter((debt) => debt.id !== input.debt.id),
    creditCardRepayments: input.creditCardRepayments,
    creditCardPots: input.creditCardPots ?? [],
    debtReserves: input.debtReserves,
    pots: input.pots ?? [],
    potAllocations: [
      ...(input.potAllocations ?? []),
      ...(projected ? buildProjectedPotAllocations(input.pots ?? [], period.id ?? `projected-${period.payday}`) : []),
    ],
  })

  return {
    payPeriodId: period.id,
    payday: period.payday,
    periodStartDate: period.startDate,
    periodEndDate: period.endDate,
    incomePence: period.incomePence,
    baseCostsPence: summary.totalCostsPence,
    availablePence: period.incomePence - summary.totalCostsPence,
    projected,
  }
}

function buildProjectedPotAllocations(pots: Pot[], payPeriodId: string): PotAllocation[] {
  const timestamp = 'projected'

  return pots
    .filter((pot) => !pot.archived && (pot.targetPence ?? 0) > 0)
    .map((pot) => ({
      id: `projected-auto-pot-${payPeriodId}-${pot.id}`,
      payPeriodId,
      potId: pot.id,
      amountPence: pot.targetPence ?? 0,
      source: 'pot_auto' as const,
      recurringPaymentId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
}

function splitDebtAcrossPeriods(
  remainingDebtPence: number,
  periods: DebtReservePlanPeriod[],
): DebtReserveScheduleItem[] {
  if (remainingDebtPence <= 0 || periods.length === 0) {
    return []
  }

  const baseAmount = Math.floor(remainingDebtPence / periods.length)
  let allocatedPence = 0

  return periods.map((period, index) => {
    const isLast = index === periods.length - 1
    const amountPence = isLast ? remainingDebtPence - allocatedPence : baseAmount
    allocatedPence += amountPence

    return {
      ...period,
      amountPence,
      shortfallPence: Math.max(0, amountPence - period.availablePence),
    }
  })
}

function reserveMatchesPeriod(
  reserve: Pick<DebtReserve, 'payPeriodId' | 'payday' | 'periodStartDate' | 'periodEndDate'>,
  period: DebtReservePlanPeriod,
): boolean {
  if (reserve.payPeriodId && period.payPeriodId) {
    return reserve.payPeriodId === period.payPeriodId
  }

  return (
    reserve.payday === period.payday ||
    (reserve.periodStartDate === period.periodStartDate &&
      reserve.periodEndDate === period.periodEndDate)
  )
}
