import { describe, expect, it } from 'vitest'

import { getDebtReservePlan } from './debtPlanner'
import type {
  Debt,
  DebtReserve,
  PayPeriod,
  RecurringPayment,
  Settings,
} from '../types/models'

const timestamp = '2026-01-01T00:00:00.000Z'

describe('debt reserve planner', () => {
  it('splits a future debt across every paycheck before the due date', () => {
    const debt = createDebt({ currentBalancePence: 200000, dueDate: '2026-02-01' })
    const selectedPayPeriod = createPayPeriod({
      id: 'period-jan-02',
      payday: '2026-01-02',
      startDate: '2026-01-02',
      endDate: '2026-01-15',
      nextPayday: '2026-01-16',
      incomePence: 80000,
    })

    const plan = getDebtReservePlan({
      debt,
      allDebts: [debt],
      selectedPayPeriod,
      settings: createSettings(),
      payPeriods: [selectedPayPeriod],
      recurringPayments: [],
      customPayments: [],
      transactions: [],
      creditCardRepayments: [],
      debtReserves: [],
    })

    expect(plan.schedule.map((item) => `${item.payday}:${item.amountPence}`)).toEqual([
      '2026-01-02:66666',
      '2026-01-16:66666',
      '2026-01-30:66668',
    ])
    expect(plan.recommendedAmountPence).toBe(66666)
    expect(plan.shortfallPence).toBe(0)
  })

  it('recalculates across remaining paychecks when the current one is skipped', () => {
    const debt = createDebt({ currentBalancePence: 200000, dueDate: '2026-02-01' })
    const selectedPayPeriod = createPayPeriod({
      id: 'period-jan-02',
      payday: '2026-01-02',
      startDate: '2026-01-02',
      endDate: '2026-01-15',
      nextPayday: '2026-01-16',
      incomePence: 80000,
    })
    const skippedReserve = createDebtReserve({
      debtId: debt.id,
      payPeriodId: selectedPayPeriod.id,
      payday: selectedPayPeriod.payday,
      periodStartDate: selectedPayPeriod.startDate,
      periodEndDate: selectedPayPeriod.endDate,
      status: 'skipped',
      amountPence: 0,
    })

    const plan = getDebtReservePlan({
      debt,
      allDebts: [debt],
      selectedPayPeriod,
      settings: createSettings(),
      payPeriods: [selectedPayPeriod],
      recurringPayments: [],
      customPayments: [],
      transactions: [],
      creditCardRepayments: [],
      debtReserves: [skippedReserve],
    })

    expect(plan.schedule.map((item) => `${item.payday}:${item.amountPence}`)).toEqual([
      '2026-01-16:100000',
      '2026-01-30:100000',
    ])
    expect(plan.recommendedAmountPence).toBe(0)
    expect(plan.currentPeriodSkipped).toBe(true)
  })

  it('warns when the final paycheck cannot cover the remaining debt', () => {
    const debt = createDebt({ currentBalancePence: 200000, dueDate: '2026-02-01' })
    const selectedPayPeriod = createPayPeriod({
      id: 'period-jan-30',
      payday: '2026-01-30',
      startDate: '2026-01-30',
      endDate: '2026-02-12',
      nextPayday: '2026-02-13',
      incomePence: 80000,
    })

    const plan = getDebtReservePlan({
      debt,
      allDebts: [debt],
      selectedPayPeriod,
      settings: createSettings(),
      payPeriods: [selectedPayPeriod],
      recurringPayments: [],
      customPayments: [],
      transactions: [],
      creditCardRepayments: [],
      debtReserves: [],
    })

    expect(plan.schedule).toHaveLength(1)
    expect(plan.recommendedAmountPence).toBe(200000)
    expect(plan.shortfallPence).toBe(120000)
    expect(plan.canCoverRecommendedAmount).toBe(false)
  })

  it('accounts for existing pay period costs before checking affordability', () => {
    const debt = createDebt({ currentBalancePence: 100000, dueDate: '2026-01-20' })
    const selectedPayPeriod = createPayPeriod({
      id: 'period-jan-02',
      payday: '2026-01-02',
      startDate: '2026-01-02',
      endDate: '2026-01-15',
      nextPayday: '2026-01-16',
      incomePence: 80000,
    })
    const bill: RecurringPayment = {
      id: 'rent',
      name: 'Rent',
      amountPence: 60000,
      dueDay: 5,
      frequency: 'monthly',
      potId: 'pot-bills',
      creditCardId: null,
      priority: 'essential',
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const plan = getDebtReservePlan({
      debt,
      allDebts: [debt],
      selectedPayPeriod,
      settings: createSettings(),
      payPeriods: [selectedPayPeriod],
      recurringPayments: [bill],
      customPayments: [],
      transactions: [],
      creditCardRepayments: [],
      debtReserves: [],
    })

    expect(plan.recommendedAmountPence).toBe(50000)
    expect(plan.currentPeriodAvailablePence).toBe(20000)
    expect(plan.shortfallPence).toBe(30000)
  })
})

function createSettings(): Settings {
  return {
    id: 'default',
    currency: 'GBP',
    payFrequency: 'biweekly',
    defaultPayPeriodDays: 14,
    hourlyRatePence: 1000,
    defaultHoursWorked: 80,
    aiInstructions: '',
    aiProvider: 'gemini',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function createPayPeriod(overrides: Partial<PayPeriod>): PayPeriod {
  return {
    id: 'period',
    payday: '2026-01-02',
    startDate: '2026-01-02',
    endDate: '2026-01-15',
    nextPayday: '2026-01-16',
    payFrequency: 'biweekly',
    incomePence: 80000,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

function createDebt(overrides: Partial<Debt>): Debt {
  return {
    id: 'debt-main',
    name: 'Card balance',
    lender: 'Card Provider',
    originalAmountPence: overrides.currentBalancePence ?? 200000,
    currentBalancePence: 200000,
    minimumPaymentPence: 0,
    dueDate: '2026-02-01',
    interestRateApr: null,
    note: '',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

function createDebtReserve(overrides: Partial<DebtReserve>): DebtReserve {
  return {
    id: 'reserve',
    debtId: 'debt-main',
    payPeriodId: null,
    payday: '2026-01-02',
    periodStartDate: '2026-01-02',
    periodEndDate: '2026-01-15',
    amountPence: 0,
    status: 'planned',
    source: 'assistant',
    note: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}
