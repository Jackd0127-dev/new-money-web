import { describe, expect, it } from 'vitest'

import {
  getSnapshotSignature,
  hasMeaningfulPlannerData,
} from './cloudPlanner'
import type { PlannerSnapshot } from '../storage/repository'

describe('cloud planner helpers', () => {
  it('removes undefined optional fields from the cloud snapshot signature', () => {
    const signature = getSnapshotSignature({
      ...createSnapshot(),
      recurringPayments: [
        {
          id: 'rec-phone',
          name: 'Phone',
          amountPence: 2200,
          dueDay: 23,
          dueDate: undefined,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'important',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    expect(signature).not.toContain('dueDate')
  })

  it('detects whether a local starter snapshot has user data', () => {
    expect(hasMeaningfulPlannerData(createSnapshot())).toBe(false)

    expect(
      hasMeaningfulPlannerData({
        ...createSnapshot(),
        transactions: [
          {
            id: 'txn-food',
            potId: 'pot-food',
            amountPence: 900,
            type: 'spending',
            date: '2026-05-18',
            note: 'Lunch',
            createdAt: '2026-05-18T00:00:00.000Z',
            updatedAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      }),
    ).toBe(true)
  })
})

function createSnapshot(): PlannerSnapshot {
  const timestamp = '2026-05-16T00:00:00.000Z'

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
        balancePence: 0,
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
        balancePence: 0,
        targetPence: null,
        color: '#16a34a',
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    recurringPayments: [],
    payPeriods: [],
    paychecks: [],
    potAllocations: [],
    transactions: [],
    debts: [],
    debtPayments: [],
    debtReserves: [],
    creditCards: [],
    creditCardPots: [],
    customPayments: [],
    creditCardRepayments: [],
    dailyBriefs: [],
  }
}
