import { getDebtReservePlans } from './debtPlanner.js'
import {
  findPayPeriodForDate,
  getCreditCardAllocationSummary,
  getDebtSummary,
  getPayPeriodCostSummary,
} from './money.js'
import type { PlannerSnapshot } from '../storage/repository.js'
import type { PayPeriod } from '../types/models.js'
import type { ViewKey } from '../types/navigation.js'

export interface AssistantContextInput {
  snapshot: PlannerSnapshot
  activeView?: string | null
  selectedPayPeriodId?: string | null
  todayIso: string
}

export interface AssistantScreenContext {
  todayIso: string
  activeView: ViewKey
  activeViewLabel: string
  selectedPayPeriodId: string | null
  selectedPayPeriod: PayPeriod | null
  selectedPayPeriodLabel: string
}

export interface AssistantAppContext {
  screen: AssistantScreenContext
  overview: {
    counts: Record<string, number>
    totalsPence: Record<string, number>
    settings: {
      payFrequency: PlannerSnapshot['settings']['payFrequency']
      defaultPayPeriodDays: number
      hourlyRatePence: number
      defaultHoursWorked: number
      aiProvider: PlannerSnapshot['settings']['aiProvider']
    }
  }
  summaries: {
    dashboard: ReturnType<typeof getPayPeriodCostSummary>
    debts: ReturnType<typeof getDebtSummary>
    creditCards: ReturnType<typeof getCreditCardAllocationSummary>
    debtPlans: ReturnType<typeof getDebtReservePlans>
    focusedTab: unknown
  }
  snapshot: PlannerSnapshot
}

const viewLabels: Record<ViewKey, string> = {
  dashboard: 'Dashboard',
  aiPlan: 'AI Plan',
  payday: 'Payday',
  pots: 'Pots',
  spending: 'Spending',
  allocatingPayments: 'Allocating Payments',
  debts: 'Debts',
  recurring: 'Recurring',
  calendar: 'Calendar',
  history: 'History',
  settings: 'Settings',
}

export function buildAssistantAppContext({
  snapshot,
  activeView,
  selectedPayPeriodId,
  todayIso,
}: AssistantContextInput): AssistantAppContext {
  const view = normalizeViewKey(activeView)
  const selectedPayPeriod =
    (selectedPayPeriodId
      ? snapshot.payPeriods.find((period) => period.id === selectedPayPeriodId)
      : null) ??
    findPayPeriodForDate(snapshot.payPeriods, todayIso)
  const dashboard = getPayPeriodCostSummary({
    payPeriod: selectedPayPeriod,
    recurringPayments: snapshot.recurringPayments,
    customPayments: snapshot.customPayments,
    transactions: snapshot.transactions,
    debts: snapshot.debts,
    creditCardRepayments: snapshot.creditCardRepayments,
    debtReserves: snapshot.debtReserves,
  })
  const creditCards = getCreditCardAllocationSummary({
    creditCards: snapshot.creditCards,
    recurringPayments: snapshot.recurringPayments,
    customPayments: snapshot.customPayments,
    transactions: snapshot.transactions,
    repayments: snapshot.creditCardRepayments,
    payPeriod: selectedPayPeriod,
  })
  const debts = getDebtSummary(
    snapshot.debts,
    snapshot.debtPayments,
    todayIso,
    selectedPayPeriod,
    snapshot.debtReserves,
  )
  const debtPlans = getDebtReservePlans({
    allDebts: snapshot.debts,
    selectedPayPeriod,
    settings: snapshot.settings,
    payPeriods: snapshot.payPeriods,
    recurringPayments: snapshot.recurringPayments,
    customPayments: snapshot.customPayments,
    transactions: snapshot.transactions,
    creditCardRepayments: snapshot.creditCardRepayments,
    debtReserves: snapshot.debtReserves,
  })

  return {
    screen: {
      todayIso,
      activeView: view,
      activeViewLabel: getViewLabel(view),
      selectedPayPeriodId: selectedPayPeriod?.id ?? null,
      selectedPayPeriod,
      selectedPayPeriodLabel: selectedPayPeriod
        ? `${selectedPayPeriod.startDate} to ${selectedPayPeriod.endDate}`
        : 'No selected pay period',
    },
    overview: {
      counts: {
        pots: snapshot.pots.length,
        activePots: snapshot.pots.filter((pot) => !pot.archived).length,
        recurringPayments: snapshot.recurringPayments.length,
        activeRecurringPayments: snapshot.recurringPayments.filter((payment) => payment.active).length,
        payPeriods: snapshot.payPeriods.length,
        transactions: snapshot.transactions.length,
        debts: snapshot.debts.length,
        activeDebts: snapshot.debts.filter((debt) => debt.status === 'active').length,
        debtPayments: snapshot.debtPayments.length,
        debtReserves: snapshot.debtReserves.length,
        plannedDebtReserves: snapshot.debtReserves.filter((reserve) => reserve.status === 'planned').length,
        creditCards: snapshot.creditCards.length,
        activeCreditCards: snapshot.creditCards.filter((card) => !card.archived).length,
        customPayments: snapshot.customPayments.length,
        dailyBriefs: snapshot.dailyBriefs.length,
      },
      totalsPence: {
        totalPotBalancePence: snapshot.pots.reduce((total, pot) => total + pot.balancePence, 0),
        activeDebtBalancePence: snapshot.debts
          .filter((debt) => debt.status === 'active')
          .reduce((total, debt) => total + debt.currentBalancePence, 0),
        plannedDebtReservePence: snapshot.debtReserves
          .filter((reserve) => reserve.status === 'planned')
          .reduce((total, reserve) => total + reserve.amountPence, 0),
        selectedPayPence: dashboard.payReceivedPence,
        selectedTotalCostsPence: dashboard.totalCostsPence,
        selectedMoneyLeftPence: dashboard.moneyLeftPence,
        selectedCreditCardOwedPence: creditCards.totalOwedPence,
      },
      settings: {
        payFrequency: snapshot.settings.payFrequency,
        defaultPayPeriodDays: snapshot.settings.defaultPayPeriodDays,
        hourlyRatePence: snapshot.settings.hourlyRatePence,
        defaultHoursWorked: snapshot.settings.defaultHoursWorked,
        aiProvider: snapshot.settings.aiProvider,
      },
    },
    summaries: {
      dashboard,
      debts,
      creditCards,
      debtPlans,
      focusedTab: getFocusedTabContext(snapshot, view, selectedPayPeriod, dashboard, debts, creditCards, debtPlans),
    },
    snapshot,
  }
}

export function getViewLabel(view: ViewKey | string | null | undefined): string {
  return viewLabels[normalizeViewKey(view)]
}

function normalizeViewKey(value: ViewKey | string | null | undefined): ViewKey {
  if (value && value in viewLabels) {
    return value as ViewKey
  }

  return 'dashboard'
}

function getFocusedTabContext(
  snapshot: PlannerSnapshot,
  activeView: ViewKey,
  selectedPayPeriod: PayPeriod | null,
  dashboard: ReturnType<typeof getPayPeriodCostSummary>,
  debts: ReturnType<typeof getDebtSummary>,
  creditCards: ReturnType<typeof getCreditCardAllocationSummary>,
  debtPlans: ReturnType<typeof getDebtReservePlans>,
): unknown {
  switch (activeView) {
    case 'dashboard':
      return { selectedPayPeriod, dashboard }
    case 'aiPlan':
      return { selectedPayPeriod, debtPlans, debtReserves: snapshot.debtReserves }
    case 'payday':
      return {
        selectedPayPeriod,
        paychecks: selectedPayPeriod
          ? snapshot.paychecks.filter((paycheck) => paycheck.payPeriodId === selectedPayPeriod.id)
          : snapshot.paychecks,
      }
    case 'pots':
      return {
        pots: snapshot.pots,
        potAllocations: snapshot.potAllocations,
        potTransactions: snapshot.transactions.filter((transaction) => transaction.potId),
      }
    case 'spending':
      return {
        selectedPayPeriod,
        transactions: selectedPayPeriod
          ? snapshot.transactions.filter(
              (transaction) =>
                transaction.date >= selectedPayPeriod.startDate &&
                transaction.date <= selectedPayPeriod.endDate,
            )
          : snapshot.transactions,
        allTransactions: snapshot.transactions,
      }
    case 'allocatingPayments':
      return {
        selectedPayPeriod,
        creditCards,
        customPayments: snapshot.customPayments,
        creditCardRepayments: snapshot.creditCardRepayments,
      }
    case 'debts':
      return {
        selectedPayPeriod,
        debts,
        debtRecords: snapshot.debts,
        debtPayments: snapshot.debtPayments,
        debtReserves: snapshot.debtReserves,
      }
    case 'recurring':
      return {
        selectedPayPeriod,
        dashboard,
        recurringPayments: snapshot.recurringPayments,
        customPayments: snapshot.customPayments,
      }
    case 'calendar':
      return {
        selectedPayPeriod,
        payPeriods: snapshot.payPeriods,
        recurringPayments: snapshot.recurringPayments,
        customPayments: snapshot.customPayments,
        debts: snapshot.debts,
        debtReserves: snapshot.debtReserves,
      }
    case 'history':
      return {
        payPeriods: snapshot.payPeriods,
        paychecks: snapshot.paychecks,
        potAllocations: snapshot.potAllocations,
        debtPayments: snapshot.debtPayments,
      }
    case 'settings':
      return {
        settings: snapshot.settings,
        counts: {
          pots: snapshot.pots.length,
          recurringPayments: snapshot.recurringPayments.length,
          debts: snapshot.debts.length,
          creditCards: snapshot.creditCards.length,
        },
      }
  }
}
