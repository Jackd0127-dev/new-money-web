import { describe, expect, it } from 'vitest'

import { getDailyBriefFacts } from './dailyBriefFacts'
import type { DailyBriefSnapshotInput } from './dailyBriefFacts'

const timestamp = '2026-05-19T00:00:00.000Z'

describe('getDailyBriefFacts', () => {
  it('pre-calculates daily brief money facts and orders urgent risks first', () => {
    const facts = getDailyBriefFacts(createSnapshot(), '2026-05-19')

    expect(facts.payPeriod).toMatchObject({
      startIso: '2026-05-15',
      nextPaydayIso: '2026-05-29',
      daysUntilNextPayday: 10,
      payReceivedPence: 100000,
      expectedPayPence: 110000,
    })
    expect(facts.balances).toMatchObject({
      currentAvailablePence: 13600,
      committedBeforeNextPaydayPence: 147500,
      projectedAvailableBeforeNextPaydayPence: -133900,
      safeToSpendPence: -13390,
    })
    expect(facts.payments.dueToday).toEqual([
      expect.objectContaining({
        id: 'recurring-phone-2026-05-19',
        name: 'Phone',
        amountPence: 4500,
        dueIso: '2026-05-19',
      }),
    ])
    expect(facts.payments.overdue).toEqual([
      expect.objectContaining({
        id: 'custom-tyres',
        name: 'Tyres',
        amountPence: 8600,
        dueIso: '2026-05-18',
      }),
    ])
    expect(facts.creditCards).toMatchObject({
      totalOwedPence: 0,
      minimumsDueBeforeNextPaydayPence: 0,
      unlinkedCardSpendingPence: 3210,
      cardLinkedPaymentsPence: 11800,
    })
    expect(facts.pots.overspent).toEqual([
      expect.objectContaining({
        id: 'pot-food',
        name: 'Food',
        balancePence: -1400,
      }),
    ])
    expect(facts.debts.minimumPaymentsDue).toEqual([
      expect.objectContaining({
        id: 'debt-car',
        name: 'Car finance',
        minimumPaymentPence: 10000,
        amountDuePence: 50000,
        dueIso: '2026-05-22',
      }),
    ])
    expect(facts.risks.slice(0, 3)).toEqual([
      expect.objectContaining({
        severity: 'critical',
        type: 'overdue_payment',
        title: 'Tyres is overdue',
      }),
      expect.objectContaining({
        severity: 'critical',
        type: 'due_today',
        title: 'Phone is due today',
      }),
      expect.objectContaining({
        severity: 'critical',
        type: 'insufficient_funds',
      }),
    ])
  })

  it('reports missing data when there is no current pay period', () => {
    const facts = getDailyBriefFacts(createSnapshot({ payPeriods: [], paychecks: [] }), '2026-05-19')

    expect(facts.payPeriod).toMatchObject({
      startIso: null,
      nextPaydayIso: null,
      daysUntilNextPayday: null,
      payReceivedPence: 0,
      expectedPayPence: null,
    })
    expect(facts.balances.safeToSpendPence).toBeNull()
    expect(facts.missingData).toContain('Current pay period is missing.')
    expect(facts.risks).toContainEqual(
      expect.objectContaining({
        severity: 'low',
        type: 'missing_data',
        title: 'Current pay period is missing.',
      }),
    )
  })
})

function createSnapshot(overrides: Partial<DailyBriefSnapshotInput> = {}): DailyBriefSnapshotInput {
  return {
    settings: {
      id: 'default',
      currency: 'GBP',
      payFrequency: 'biweekly',
      defaultPayPeriodDays: 14,
      hourlyRatePence: 1250,
      defaultHoursWorked: 72,
      appDateMode: 'automatic',
      manualTodayIso: null,
      aiInstructions: '',
      aiProvider: 'gemini',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    pots: [
      {
        id: 'pot-bills',
        name: 'Bills',
        type: 'reserved',
        balancePence: 10000,
        targetPence: null,
        color: '#2563eb',
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'pot-food',
        name: 'Food',
        type: 'spending',
        balancePence: -1400,
        targetPence: null,
        color: '#16a34a',
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'pot-buffer',
        name: 'Buffer',
        type: 'buffer',
        balancePence: 5000,
        targetPence: null,
        color: '#475569',
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'pot-savings',
        name: 'Savings',
        type: 'saving',
        balancePence: 500000,
        targetPence: null,
        color: '#0f766e',
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    recurringPayments: [
      {
        id: 'phone',
        name: 'Phone',
        amountPence: 4500,
        dueDay: 19,
        frequency: 'monthly',
        potId: 'pot-bills',
        priority: 'essential',
        active: true,
        creditCardId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'rent',
        name: 'Rent',
        amountPence: 80000,
        dueDay: 20,
        frequency: 'monthly',
        potId: 'pot-bills',
        priority: 'essential',
        active: true,
        creditCardId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'travel-card',
        name: 'Travel card',
        amountPence: 3200,
        dueDay: 21,
        frequency: 'monthly',
        potId: 'pot-bills',
        priority: 'important',
        active: true,
        creditCardId: 'card-main',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    payPeriods: [
      {
        id: 'period-current',
        startDate: '2026-05-15',
        endDate: '2026-05-28',
        payday: '2026-05-15',
        nextPayday: '2026-05-29',
        payFrequency: 'biweekly',
        incomePence: 100000,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    paychecks: [
      {
        id: 'paycheck-current',
        payPeriodId: 'period-current',
        hoursWorked: 80,
        hourlyRatePence: 1375,
        calculatedAmountPence: 110000,
        actualAmountPence: 100000,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    potAllocations: [],
    transactions: [
      {
        id: 'txn-unlinked-card',
        potId: 'pot-food',
        amountPence: 3210,
        type: 'spending',
        paymentMethod: 'credit_card',
        creditCardId: null,
        date: '2026-05-18',
        note: 'Fuel',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    debts: [
      {
        id: 'debt-car',
        name: 'Car finance',
        lender: 'Finance Co',
        originalAmountPence: 100000,
        currentBalancePence: 50000,
        minimumPaymentPence: 10000,
        dueDate: '2026-05-22',
        interestRateApr: null,
        note: '',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    debtPayments: [],
    creditCards: [
      {
        id: 'card-main',
        name: 'Everyday card',
        provider: 'Card Co',
        limitPence: 100000,
        dueDate: '2026-05-21',
        dueDay: null,
        color: '#2563eb',
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    creditCardPots: [],
    customPayments: [
      {
        id: 'custom-tyres',
        name: 'Tyres',
        amountPence: 8600,
        dueDate: '2026-05-18',
        creditCardId: 'card-main',
        status: 'unpaid',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'custom-gift',
        name: 'Gift',
        amountPence: 1200,
        dueDate: '2026-05-26',
        creditCardId: null,
        status: 'unpaid',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    creditCardRepayments: [],
    dailyBriefs: [],
    ...overrides,
  }
}
