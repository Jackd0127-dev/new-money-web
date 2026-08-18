import { describe, expect, it } from 'vitest'

import {
  applyTransactionToPot,
  calculatePaycheckAmount,
  createNextPayPeriod,
  getPotBalanceAfterTransactionRemoval,
  getAllocationBalance,
  getDebtSummary,
  getPayPeriodCostSummary,
  getPayPeriodMoneySummary,
  getCreditCardAllocationSummary,
  getRecurringPaymentOccurrences,
  getRecurringPaymentsDue,
  getUncoveredRecurringPence,
} from './money'
import type {
  CreditCard,
  CreditCardRepayment,
  CustomPayment,
  Debt,
  DebtPayment,
  PayPeriod,
  Pot,
  PotAllocation,
  RecurringPayment,
  Transaction,
} from '../types/models'

describe('paycheck calculations', () => {
  it('calculates income from hours worked and hourly rate in pence', () => {
    expect(calculatePaycheckAmount({ hoursWorked: 72.5, hourlyRatePence: 1250 })).toBe(90625)
  })

  it('uses actual received amount when it is provided', () => {
    expect(
      calculatePaycheckAmount({
        hoursWorked: 72.5,
        hourlyRatePence: 1250,
        actualAmountPence: 88000,
      }),
    ).toBe(88000)
  })
})

describe('pay period planning', () => {
  const payments: RecurringPayment[] = [
    {
      id: 'rent',
      name: 'Rent',
      amountPence: 70000,
      dueDay: 1,
      frequency: 'monthly',
      potId: 'bills',
      priority: 'essential',
      active: true,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'phone',
      name: 'Phone',
      amountPence: 2200,
      dueDay: 23,
      frequency: 'monthly',
      potId: 'subs',
      priority: 'important',
      active: true,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'archived',
      name: 'Old subscription',
      amountPence: 999,
      dueDay: 21,
      frequency: 'monthly',
      potId: 'subs',
      priority: 'optional',
      active: false,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ]

  it('finds recurring payments due inside the current pay period only', () => {
    const due = getRecurringPaymentsDue(payments, '2026-05-16', '2026-05-30')

    expect(due.map((payment) => payment.id)).toEqual(['phone'])
  })

  it('builds dated recurring payment occurrences for calendar views', () => {
    const due = getRecurringPaymentOccurrences(payments, '2026-05-16', '2026-06-02')

    expect(due.map((occurrence) => `${occurrence.payment.id}:${occurrence.dueDate}`)).toEqual([
      'phone:2026-05-23',
      'rent:2026-06-01',
    ])
  })

  it('supports weekly recurring payments in calendar views', () => {
    const due = getRecurringPaymentOccurrences(
      [
        {
          id: 'travel-card',
          name: 'Travel card',
          amountPence: 1200,
          dueDay: 18,
          frequency: 'weekly',
          potId: 'transport',
          priority: 'important',
          active: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      '2026-05-16',
      '2026-05-30',
    )

    expect(due.map((occurrence) => occurrence.dueDate)).toEqual([
      '2026-05-18',
      '2026-05-25',
    ])
  })

  it('anchors yearly recurring payments to their creation month', () => {
    const due = getRecurringPaymentOccurrences(
      [
        {
          id: 'insurance',
          name: 'Insurance',
          amountPence: 12000,
          dueDay: 23,
          frequency: 'yearly',
          potId: 'bills',
          priority: 'essential',
          active: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      '2026-05-16',
      '2026-07-30',
    )

    expect(due.map((occurrence) => occurrence.dueDate)).toEqual(['2026-05-23'])
  })

  it('creates weekly, biweekly, and monthly pay periods from a payday', () => {
    expect(createNextPayPeriod('2026-05-16', 'weekly')).toMatchObject({
      startDate: '2026-05-16',
      endDate: '2026-05-22',
      nextPayday: '2026-05-23',
    })
    expect(createNextPayPeriod('2026-05-16', 'biweekly')).toMatchObject({
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      nextPayday: '2026-05-30',
    })
    expect(createNextPayPeriod('2026-05-16', 'monthly')).toMatchObject({
      startDate: '2026-05-16',
      endDate: '2026-06-15',
      nextPayday: '2026-06-16',
    })
  })
})

describe('pot balances', () => {
  const pot: Pot = {
    id: 'food',
    name: 'Food',
    type: 'spending',
    balancePence: 2200,
    targetPence: null,
    color: '#16a34a',
    archived: false,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  }

  it('carries over pot balance when allocation is added', () => {
    expect(applyTransactionToPot(pot, 16000, 'allocation').balancePence).toBe(18200)
  })

  it('allows spending to reduce a pot below zero so overspending is visible', () => {
    expect(applyTransactionToPot(pot, 4000, 'spending').balancePence).toBe(-1800)
  })

  it('restores a pot balance when a manual spending transaction is deleted', () => {
    const transaction: Transaction = {
      id: 'spend',
      potId: 'food',
      amountPence: 4820,
      type: 'spending',
      date: '2026-05-16',
      note: 'Groceries',
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    }

    expect(getPotBalanceAfterTransactionRemoval({ ...pot, balancePence: 11180 }, transaction)).toBe(16000)
  })

  it('subtracts reserved money when an allocation transaction is deleted', () => {
    const transaction: Transaction = {
      id: 'allocation',
      potId: 'food',
      amountPence: 5600,
      type: 'allocation',
      date: '2026-05-16',
      note: 'Insurance reserve',
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    }

    expect(getPotBalanceAfterTransactionRemoval({ ...pot, balancePence: 15600 }, transaction)).toBe(10000)
  })

  it('calculates remaining allocation money and warns when allocations exceed income', () => {
    expect(
      getAllocationBalance({
        incomePence: 95000,
        reservedPence: 31000,
        allocationPence: 72000,
      }),
    ).toEqual({
      availableAfterReservedPence: 64000,
      remainingPence: -8000,
      isOverAllocated: true,
    })
  })

  it('detects recurring bills that were added after the active paycheck plan', () => {
    const duePayments: RecurringPayment[] = [
      {
        id: 'insurance',
        name: 'Insurance',
        amountPence: 5600,
        dueDay: 20,
        frequency: 'monthly',
        potId: 'bills',
        priority: 'essential',
        active: true,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'phone',
        name: 'Phone',
        amountPence: 2200,
        dueDay: 23,
        frequency: 'monthly',
        potId: 'bills',
        priority: 'essential',
        active: true,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ]
    const allocations: PotAllocation[] = [
      {
        id: 'allocation-phone',
        payPeriodId: 'period',
        potId: 'bills',
        amountPence: 2200,
        source: 'recurring',
        recurringPaymentId: 'phone',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
    ]

    expect(getUncoveredRecurringPence(duePayments, allocations)).toBe(5600)
  })

  it('counts repeated recurring payment occurrences that are not fully reserved', () => {
    const weeklyPayment: RecurringPayment = {
      id: 'travel',
      name: 'Travel card',
      amountPence: 1200,
      dueDay: 18,
      frequency: 'weekly',
      potId: 'transport',
      priority: 'important',
      active: true,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    }
    const allocations: PotAllocation[] = [
      {
        id: 'allocation-travel',
        payPeriodId: 'period',
        potId: 'transport',
        amountPence: 1200,
        source: 'recurring',
        recurringPaymentId: 'travel',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
    ]

    expect(getUncoveredRecurringPence([weeklyPayment, weeklyPayment], allocations)).toBe(1200)
  })

  it('summarises pay, payments due, and money left without double-counting reserved bills', () => {
    const duePayments: RecurringPayment[] = [
      {
        id: 'applecare',
        name: 'AppleCare',
        amountPence: 1000,
        dueDay: 19,
        frequency: 'monthly',
        potId: 'bills',
        priority: 'important',
        active: true,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'insurance',
        name: 'Car Insurance',
        amountPence: 8500,
        dueDay: 1,
        frequency: 'monthly',
        potId: 'bills',
        priority: 'essential',
        active: true,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ]
    const allocations: PotAllocation[] = [
      {
        id: 'allocation-applecare',
        payPeriodId: 'period',
        potId: 'bills',
        amountPence: 1000,
        source: 'recurring',
        recurringPaymentId: 'applecare',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
      {
        id: 'allocation-food',
        payPeriodId: 'period',
        potId: 'food',
        amountPence: 15000,
        source: 'manual',
        recurringPaymentId: null,
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
    ]

    expect(
      getPayPeriodMoneySummary({
        incomePence: 79800,
        duePayments,
        allocations,
      }),
    ).toEqual({
      payReceivedPence: 79800,
      allocatedPence: 16000,
      uncoveredRecurringPence: 8500,
      totalPaymentsDuePence: 24500,
      moneyLeftPence: 55300,
      isOverCommitted: false,
    })
  })
})

describe('debt tracking', () => {
  const debts: Debt[] = [
    {
      id: 'debt-card',
      name: 'Credit card',
      lender: 'Bank',
      originalAmountPence: 120000,
      currentBalancePence: 85000,
      minimumPaymentPence: 5000,
      dueDate: '2026-05-20',
      interestRateApr: 19.9,
      note: 'Main card',
      status: 'active',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'debt-loan',
      name: 'Old loan',
      lender: 'Finance Co',
      originalAmountPence: 50000,
      currentBalancePence: 0,
      minimumPaymentPence: 0,
      dueDate: '2026-05-10',
      interestRateApr: null,
      note: '',
      status: 'paid',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ]
  const payments: DebtPayment[] = [
    {
      id: 'payment-1',
      debtId: 'debt-card',
      amountPence: 35000,
      date: '2026-05-12',
      note: 'First chunk',
      createdAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z',
    },
  ]
  const payPeriod: Pick<PayPeriod, 'endDate'> = {
    endDate: '2026-05-29',
  }

  it('summarises active debt balances, progress, and balances due this pay period', () => {
    expect(getDebtSummary(debts, payments, '2026-05-18', payPeriod)).toEqual({
      activeDebtCount: 1,
      overdueDebtCount: 0,
      totalCurrentBalancePence: 85000,
      totalOriginalAmountPence: 120000,
      totalPaidPence: 35000,
      debtDueThisPayPeriodPence: 85000,
      progressPercent: 29,
    })
  })

  it('keeps overdue active debt balances in the due total until the debt is paid', () => {
    expect(getDebtSummary(debts, payments, '2026-05-21', payPeriod)).toMatchObject({
      overdueDebtCount: 1,
      debtDueThisPayPeriodPence: 85000,
    })
  })

  it('uses the full active debt balance as due even when the optional minimum is zero', () => {
    expect(
      getDebtSummary(
        [
          {
            id: 'debt-zero-minimum',
            name: 'Store card',
            lender: 'Retail Bank',
            originalAmountPence: 30000,
            currentBalancePence: 30000,
            minimumPaymentPence: 0,
            dueDate: '2026-05-23',
            interestRateApr: null,
            note: '',
            status: 'active',
            createdAt: '2026-05-20T00:00:00.000Z',
            updatedAt: '2026-05-20T00:00:00.000Z',
          },
        ],
        [],
        '2026-05-20',
        payPeriod,
      ),
    ).toMatchObject({
      debtDueThisPayPeriodPence: 30000,
    })
  })

  it('excludes active debts due after the current pay period', () => {
    expect(
      getDebtSummary(
        [
          {
            id: 'debt-current-period',
            name: 'Store card',
            lender: 'Retail Bank',
            originalAmountPence: 30000,
            currentBalancePence: 30000,
            minimumPaymentPence: 0,
            dueDate: '2026-05-23',
            interestRateApr: null,
            note: '',
            status: 'active',
            createdAt: '2026-05-20T00:00:00.000Z',
            updatedAt: '2026-05-20T00:00:00.000Z',
          },
          {
            id: 'debt-next-period',
            name: 'Next period',
            lender: 'Retail Bank',
            originalAmountPence: 50000,
            currentBalancePence: 50000,
            minimumPaymentPence: 0,
            dueDate: '2026-06-02',
            interestRateApr: null,
            note: '',
            status: 'active',
            createdAt: '2026-05-20T00:00:00.000Z',
            updatedAt: '2026-05-20T00:00:00.000Z',
          },
        ],
        [],
        '2026-05-20',
        payPeriod,
      ),
    ).toMatchObject({
      debtDueThisPayPeriodPence: 30000,
    })
  })
})

describe('credit card allocation', () => {
  const cards: CreditCard[] = [
    {
      id: 'card-amex',
      name: 'Everyday Amex',
      provider: 'Amex',
      limitPence: 100000,
      dueDay: 12,
      dueDate: null,
      color: '#2563eb',
      archived: false,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ]
  const payPeriod: PayPeriod = {
    id: 'period-current',
    startDate: '2026-05-16',
    endDate: '2026-05-29',
    payday: '2026-05-16',
    nextPayday: '2026-05-30',
    incomePence: 90000,
    status: 'active',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  }

  it('calculates card owed from linked due payments, spending, custom payments, and repayments', () => {
    const recurringPayments: RecurringPayment[] = [
      {
        id: 'phone',
        name: 'Phone',
        amountPence: 2200,
        dueDay: 23,
        frequency: 'monthly',
        potId: 'bills',
        priority: 'important',
        active: true,
        creditCardId: 'card-amex',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'travel',
        name: 'Travel card',
        amountPence: 1200,
        dueDay: 18,
        frequency: 'weekly',
        potId: 'transport',
        priority: 'important',
        active: true,
        creditCardId: 'card-amex',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'future',
        name: 'Future bill',
        amountPence: 9900,
        dueDay: 30,
        frequency: 'monthly',
        potId: 'bills',
        priority: 'optional',
        active: true,
        creditCardId: 'card-amex',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ]
    const customPayments: CustomPayment[] = [
      {
        id: 'custom-car',
        name: 'Tyres',
        amountPence: 3000,
        dueDate: '2026-05-20',
        creditCardId: 'card-amex',
        status: 'unpaid',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
    ]
    const transactions: Transaction[] = [
      {
        id: 'txn-food',
        potId: 'food',
        amountPence: 5000,
        type: 'spending',
        paymentMethod: 'credit_card',
        creditCardId: 'card-amex',
        date: '2026-05-18',
        note: 'Groceries',
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
      },
      {
        id: 'txn-future',
        potId: 'food',
        amountPence: 7000,
        type: 'spending',
        paymentMethod: 'credit_card',
        creditCardId: 'card-amex',
        date: '2026-06-01',
        note: 'Future shop',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]
    const repayments: CreditCardRepayment[] = [
      {
        id: 'repayment-1',
        creditCardId: 'card-amex',
        amountPence: 2000,
        date: '2026-05-24',
        note: 'Part payment',
        createdAt: '2026-05-24T00:00:00.000Z',
        updatedAt: '2026-05-24T00:00:00.000Z',
      },
    ]

    const summary = getCreditCardAllocationSummary({
      creditCards: cards,
      recurringPayments,
      customPayments,
      transactions,
      repayments,
      payPeriod,
    })

    expect(summary.totalOwedPence).toBe(10600)
    expect(summary.paycheckRemainingAfterCardsPence).toBe(79400)
    expect(summary.cards[0]).toMatchObject({
      owedPence: 10600,
      availableCreditPence: 89400,
      utilisationPercent: 11,
      dueLabel: 'Day 12',
    })
    expect(summary.cards[0].items.map((item) => item.label)).toEqual([
      'Groceries',
      'Travel card',
      'Tyres',
      'Phone',
      'Part payment',
      'Travel card',
    ])
  })

  it('lists unlinked payments separately from card balances', () => {
    const summary = getCreditCardAllocationSummary({
      creditCards: cards,
      recurringPayments: [
        {
          id: 'netflix',
          name: 'Netflix',
          amountPence: 999,
          dueDay: 20,
          frequency: 'monthly',
          potId: 'subs',
          priority: 'optional',
          active: true,
          creditCardId: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      customPayments: [],
      transactions: [],
      repayments: [],
      payPeriod,
    })

    expect(summary.cards[0].owedPence).toBe(0)
    expect(summary.unlinkedItems).toEqual([
      expect.objectContaining({
        label: 'Netflix',
        amountPence: 999,
        source: 'recurring',
      }),
    ])
  })
})

describe('pay period cost summary', () => {
  it('calculates dashboard costs from due payments, saved payments, manual spending, debts, and net card costs', () => {
    const payPeriod: PayPeriod = {
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
      status: 'active',
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    }
    const summary = getPayPeriodCostSummary({
      payPeriod,
      recurringPayments: [
        {
          id: 'rent',
          name: 'Rent',
          amountPence: 25000,
          dueDay: 20,
          frequency: 'monthly',
          potId: 'bills',
          priority: 'essential',
          active: true,
          creditCardId: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'phone',
          name: 'Phone',
          amountPence: 2200,
          dueDay: 23,
          frequency: 'monthly',
          potId: 'bills',
          priority: 'important',
          active: true,
          creditCardId: 'card-amex',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      customPayments: [
        {
          id: 'custom-tyres',
          name: 'Tyres',
          amountPence: 3000,
          dueDate: '2026-05-20',
          creditCardId: null,
          status: 'unpaid',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'txn-food',
          potId: 'food',
          payPeriodId: 'period-current',
          amountPence: 1250,
          type: 'spending',
          paymentMethod: 'pot',
          creditCardId: null,
          date: '2026-05-18',
          note: 'Lunch',
          createdAt: '2026-05-18T00:00:00.000Z',
          updatedAt: '2026-05-18T00:00:00.000Z',
        },
        {
          id: 'txn-card',
          potId: null,
          payPeriodId: 'period-current',
          amountPence: 5000,
          type: 'spending',
          paymentMethod: 'credit_card',
          creditCardId: 'card-amex',
          date: '2026-05-19',
          note: 'Groceries',
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
        },
      ],
      debts: [
        {
          id: 'debt-card',
          name: 'Old card',
          lender: 'Bank',
          originalAmountPence: 100000,
          currentBalancePence: 50000,
          minimumPaymentPence: 4000,
          dueDate: '2026-05-22',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'debt-overdue',
          name: 'Overdue loan',
          lender: 'Finance Co',
          originalAmountPence: 30000,
          currentBalancePence: 25000,
          minimumPaymentPence: 2500,
          dueDate: '2026-05-10',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      creditCardRepayments: [
        {
          id: 'repayment-1',
          creditCardId: 'card-amex',
          amountPence: 2000,
          date: '2026-05-24',
          note: 'Part payment',
          createdAt: '2026-05-24T00:00:00.000Z',
          updatedAt: '2026-05-24T00:00:00.000Z',
        },
      ],
    })

    expect(summary).toMatchObject({
      payReceivedPence: 90000,
      directRecurringPence: 25000,
      savedPaymentsPence: 3000,
      manualSpendingPence: 1250,
      debtReservesPence: 0,
      debtMinimumsPence: 75000,
      creditCardChargesPence: 7200,
      creditCardRepaymentsPence: 2000,
      creditCardNetPence: 5200,
      totalCostsPence: 109450,
      moneyLeftPence: -19450,
      isOverCommitted: true,
    })
  })
})
