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
  getCreditCardStatementPayments,
  getRecurringPaymentOccurrences,
  getRecurringPaymentsDue,
  getUncoveredRecurringPence,
} from './money'
import type {
  CreditCard,
  CreditCardPot,
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

  it('anchors biweekly recurring payments to dueDate instead of also using monthly due day logic', () => {
    const due = getRecurringPaymentOccurrences(
      [
        {
          id: 'fuel',
          name: 'Fuel',
          amountPence: 7000,
          dueDay: 1,
          dueDate: '2026-05-29',
          frequency: 'biweekly',
          potId: null,
          creditCardId: 'card-barclays',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
        {
          id: 'personal',
          name: 'Personal',
          amountPence: 5000,
          dueDay: 1,
          dueDate: '2026-05-29',
          frequency: 'biweekly',
          potId: null,
          creditCardId: 'card-capital-one',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      '2026-05-22',
      '2026-06-12',
    )

    expect(due.map((occurrence) => `${occurrence.payment.id}:${occurrence.dueDate}`)).toEqual([
      'fuel:2026-05-29',
      'personal:2026-05-29',
      'fuel:2026-06-12',
      'personal:2026-06-12',
    ])
    expect(due.some((occurrence) => occurrence.dueDate === '2026-06-01')).toBe(false)
  })

  it('does not backfill interval payments before their first due date', () => {
    const due = getRecurringPaymentOccurrences(
      [
        {
          id: 'fuel',
          name: 'Fuel',
          amountPence: 7000,
          dueDate: '2026-05-29',
          frequency: 'biweekly',
          potId: null,
          creditCardId: 'card-barclays',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
        {
          id: 'personal',
          name: 'Personal',
          amountPence: 5000,
          dueDate: '2026-05-29',
          frequency: 'biweekly',
          potId: null,
          creditCardId: 'card-capital-one',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      '2026-05-01',
      '2026-05-31',
    )

    expect(due.map((occurrence) => `${occurrence.payment.id}:${occurrence.dueDate}`)).toEqual([
      'fuel:2026-05-29',
      'personal:2026-05-29',
    ])
  })

  it('uses monthly dueDate as the first monthly occurrence when present', () => {
    const due = getRecurringPaymentOccurrences(
      [
        {
          id: 'gym',
          name: 'Gym',
          amountPence: 2500,
          dueDay: 1,
          dueDate: '2026-06-01',
          frequency: 'monthly',
          potId: null,
          creditCardId: 'card-barclays',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      '2026-05-01',
      '2026-07-31',
    )

    expect(due.map((occurrence) => occurrence.dueDate)).toEqual([
      '2026-06-01',
      '2026-07-01',
    ])
  })

  it('keeps monthly recurring payments on their monthly due day', () => {
    const due = getRecurringPaymentOccurrences(
      [
        {
          id: 'gym',
          name: 'Gym',
          amountPence: 2500,
          dueDay: 1,
          frequency: 'monthly',
          potId: null,
          creditCardId: 'card-barclays',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      '2026-06-01',
      '2026-07-31',
    )

    expect(due.map((occurrence) => occurrence.dueDate)).toEqual([
      '2026-06-01',
      '2026-07-01',
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

  it('uses linked pot balances to reduce debt due without changing the current balance', () => {
    expect(
      getDebtSummary(debts, payments, '2026-05-18', payPeriod, [], [
        {
          id: 'pot-debt-reserve',
          name: 'Debt reserve',
          type: 'reserved',
          balancePence: 30000,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          linkedCreditCardId: null,
          linkedDebtId: 'debt-card',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ]),
    ).toMatchObject({
      totalCurrentBalancePence: 85000,
      debtDueThisPayPeriodPence: 55000,
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
    const creditCardPots: CreditCardPot[] = [
      {
        id: 'credit-pot-paycheck',
        creditCardId: 'card-amex',
        payPeriodId: 'period-current',
        payday: '2026-05-16',
        periodStartDate: '2026-05-16',
        periodEndDate: '2026-05-29',
        name: 'Amex payoff',
        amountPence: 4000,
        source: 'paycheck',
        status: 'active',
        note: '',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
      {
        id: 'credit-pot-external',
        creditCardId: 'card-amex',
        payPeriodId: null,
        payday: null,
        periodStartDate: null,
        periodEndDate: null,
        name: 'Sold item',
        amountPence: 3000,
        source: 'external',
        status: 'active',
        note: '',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
    ]

    const summary = getCreditCardAllocationSummary({
      creditCards: cards,
      recurringPayments,
      customPayments,
      transactions,
      repayments,
      creditCardPots,
      payPeriod,
      asOfDate: '2026-05-24',
    })

    expect(summary.totalActualOwedPence).toBe(3000)
    expect(summary.totalForecastOwedPence).toBe(10600)
    expect(summary.totalOwedPence).toBe(10600)
    expect(summary.totalCreditPotsPence).toBe(7000)
    expect(summary.totalPaycheckCreditPotsPence).toBe(4000)
    expect(summary.totalExternalCreditPotsPence).toBe(3000)
    expect(summary.paycheckRemainingAfterCardsPence).toBe(82400)
    expect(summary.cards[0]).toMatchObject({
      openingBalancePence: 0,
      actualOwedPence: 3000,
      forecastOwedPence: 10600,
      owedPence: 10600,
      creditPotPence: 7000,
      paycheckCreditPotPence: 4000,
      externalCreditPotPence: 3000,
      remainingAfterCreditPotsPence: 3600,
      availableCreditPence: 97000,
      actualAvailableCreditPence: 97000,
      forecastAvailableCreditPence: 89400,
      utilisationPercent: 3,
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

  it('starts card owed from an existing opening balance', () => {
    const summary = getCreditCardAllocationSummary({
      creditCards: [
        {
          ...cards[0],
          openingBalancePence: 60000,
        },
      ],
      recurringPayments: [],
      customPayments: [],
      transactions: [],
      repayments: [],
      payPeriod,
    })

    expect(summary.totalOwedPence).toBe(60000)
    expect(summary.cards[0]).toMatchObject({
      openingBalancePence: 60000,
      owedPence: 60000,
      availableCreditPence: 40000,
      utilisationPercent: 60,
    })
  })

  it('uses linked pot balances to reduce the card amount still to cover without changing availability', () => {
    const summary = getCreditCardAllocationSummary({
      creditCards: [
        {
          ...cards[0],
          limitPence: 80000,
          openingBalancePence: 60000,
        },
      ],
      recurringPayments: [],
      customPayments: [],
      transactions: [],
      repayments: [],
      pots: [
        {
          id: 'pot-card-reserve',
          name: 'Card reserve',
          type: 'reserved',
          balancePence: 40000,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          linkedCreditCardId: 'card-amex',
          linkedDebtId: null,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      payPeriod,
    })

    expect(summary.totalOwedPence).toBe(60000)
    expect(summary.totalCreditPotsPence).toBe(40000)
    expect(summary.totalLinkedPotPence).toBe(40000)
    expect(summary.totalRemainingAfterCreditPotsPence).toBe(20000)
    expect(summary.cards[0]).toMatchObject({
      owedPence: 60000,
      linkedPotPence: 40000,
      creditPotPence: 40000,
      remainingAfterCreditPotsPence: 20000,
      availableCreditPence: 20000,
    })
  })

  it('caps the card amount still to cover at zero when linked pots cover the actual balance', () => {
    const summary = getCreditCardAllocationSummary({
      creditCards: [
        {
          ...cards[0],
          limitPence: 80000,
          openingBalancePence: 60000,
        },
      ],
      recurringPayments: [],
      customPayments: [],
      transactions: [],
      repayments: [],
      pots: [
        {
          id: 'pot-card-reserve',
          name: 'Card reserve',
          type: 'reserved',
          balancePence: 60000,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          linkedCreditCardId: 'card-amex',
          linkedDebtId: null,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      payPeriod,
    })

    expect(summary.cards[0].owedPence).toBe(60000)
    expect(summary.cards[0].remainingAfterCreditPotsPence).toBe(0)
    expect(summary.cards[0].availableCreditPence).toBe(20000)
  })

  it('keeps Barclays actual card balance separate from linked pot balance and forecast charges', () => {
    const barclaysCard: CreditCard = {
      id: 'card-barclays',
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      openingBalancePence: 68005,
      dueDay: 11,
      dueDate: null,
      color: '#2563eb',
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }
    const barclaysPot: Pot = {
      id: 'pot-barclays',
      name: 'Barclays',
      type: 'reserved',
      balancePence: 59648,
      targetPence: null,
      color: '#2563eb',
      linkedCreditCardId: 'card-barclays',
      linkedDebtId: null,
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }
    const periodToNextPayday: PayPeriod = {
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      payFrequency: 'biweekly',
      incomePence: 78850,
      status: 'active',
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }
    const recurringPayments: RecurringPayment[] = [
      {
        id: 'fuel',
        name: 'Fuel',
        amountPence: 7000,
        dueDate: '2026-05-29',
        frequency: 'biweekly',
        potId: null,
        creditCardId: 'card-barclays',
        priority: 'important',
        active: true,
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      },
      {
        id: 'gym',
        name: 'Gym',
        amountPence: 2500,
        dueDay: 1,
        frequency: 'monthly',
        potId: null,
        creditCardId: 'card-barclays',
        priority: 'important',
        active: true,
        createdAt: '2026-05-22T00:00:00.000Z',
        updatedAt: '2026-05-22T00:00:00.000Z',
      },
    ]

    const summary = getCreditCardAllocationSummary({
      creditCards: [barclaysCard],
      recurringPayments,
      customPayments: [],
      transactions: [],
      repayments: [],
      pots: [barclaysPot],
      payPeriod: periodToNextPayday,
    })

    expect(summary.cards[0]).toMatchObject({
      actualOwedPence: 68005,
      actualAvailableCreditPence: 11995,
      linkedPotPence: 59648,
      actualUncoveredPence: 8357,
      forecastOwedPence: 77505,
      forecastAvailableCreditPence: 2495,
      plannedTopUpNeededPence: 17857,
    })
    expect(summary.totalActualOwedPence).toBe(68005)
    expect(summary.totalForecastOwedPence).toBe(77505)
    expect(summary.totalPlannedTopUpNeededPence).toBe(17857)
  })

  it('keeps actual Barclays card values unchanged when the linked pot is topped up', () => {
    const summary = getCreditCardAllocationSummary({
      creditCards: [
        {
          id: 'card-barclays',
          name: 'Barclays',
          provider: 'Barclays',
          limitPence: 80000,
          openingBalancePence: 68005,
          dueDay: 11,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      recurringPayments: [],
      customPayments: [],
      transactions: [],
      repayments: [],
      pots: [
        {
          id: 'pot-barclays',
          name: 'Barclays',
          type: 'reserved',
          balancePence: 77505,
          targetPence: null,
          color: '#2563eb',
          linkedCreditCardId: 'card-barclays',
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      payPeriod: null,
    })

    expect(summary.cards[0]).toMatchObject({
      actualOwedPence: 68005,
      actualAvailableCreditPence: 11995,
      linkedPotPence: 77505,
      actualUncoveredPence: 0,
    })
    expect(summary.cards[0].linkedPotPence - summary.cards[0].actualOwedPence).toBe(9500)
  })

  it('uses leftover linked pot money to reduce the next paycheck card cover', () => {
    const summary = getCreditCardAllocationSummary({
      creditCards: [
        {
          id: 'card-barclays',
          name: 'Barclays',
          provider: 'Barclays',
          limitPence: 80000,
          openingBalancePence: 68005,
          dueDay: 11,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'fuel',
          name: 'Fuel',
          amountPence: 7000,
          dueDate: '2026-05-29',
          frequency: 'biweekly',
          potId: null,
          creditCardId: 'card-barclays',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      customPayments: [],
      transactions: [
        {
          id: 'actual-fuel',
          potId: null,
          payPeriodId: 'period-current',
          amountPence: 6700,
          type: 'spending',
          paymentMethod: 'credit_card',
          creditCardId: 'card-barclays',
          recurringPaymentId: null,
          date: '2026-05-29',
          note: 'Fuel',
          createdAt: '2026-05-29T00:00:00.000Z',
          updatedAt: '2026-05-29T00:00:00.000Z',
        },
      ],
      repayments: [
        {
          id: 'repayment-june',
          creditCardId: 'card-barclays',
          amountPence: 74705,
          date: '2026-06-11',
          note: 'Automatic Barclays payment from Barclays pot',
          createdAt: '2026-06-11T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
        },
      ],
      pots: [
        {
          id: 'pot-barclays',
          name: 'Barclays',
          type: 'reserved',
          balancePence: 300,
          targetPence: null,
          color: '#2563eb',
          linkedCreditCardId: 'card-barclays',
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
        },
      ],
      payPeriod: {
        id: 'period-next',
        startDate: '2026-06-05',
        endDate: '2026-06-18',
        payday: '2026-06-05',
        nextPayday: '2026-06-19',
        payFrequency: 'biweekly',
        incomePence: 78850,
        status: 'active',
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
      asOfDate: '2026-06-12',
    })

    expect(summary.cards[0]).toMatchObject({
      actualOwedPence: 0,
      linkedPotPence: 300,
      forecastOwedPence: 7000,
      plannedTopUpNeededPence: 6700,
    })
  })

  it('carries an overspent linked-card amount into the next paycheck cover', () => {
    const summary = getCreditCardAllocationSummary({
      creditCards: [
        {
          id: 'card-barclays',
          name: 'Barclays',
          provider: 'Barclays',
          limitPence: 80000,
          openingBalancePence: 68005,
          dueDay: 11,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'fuel',
          name: 'Fuel',
          amountPence: 7000,
          dueDate: '2026-05-29',
          frequency: 'biweekly',
          potId: null,
          creditCardId: 'card-barclays',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      customPayments: [],
      transactions: [
        {
          id: 'actual-fuel',
          potId: null,
          payPeriodId: 'period-current',
          amountPence: 7300,
          type: 'spending',
          paymentMethod: 'credit_card',
          creditCardId: 'card-barclays',
          recurringPaymentId: null,
          date: '2026-05-29',
          note: 'Fuel',
          createdAt: '2026-05-29T00:00:00.000Z',
          updatedAt: '2026-05-29T00:00:00.000Z',
        },
      ],
      repayments: [
        {
          id: 'repayment-june',
          creditCardId: 'card-barclays',
          amountPence: 75005,
          date: '2026-06-11',
          note: 'Automatic Barclays payment from Barclays pot',
          createdAt: '2026-06-11T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
        },
      ],
      pots: [
        {
          id: 'pot-barclays',
          name: 'Barclays',
          type: 'reserved',
          balancePence: 0,
          targetPence: null,
          color: '#2563eb',
          linkedCreditCardId: 'card-barclays',
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
        },
      ],
      payPeriod: {
        id: 'period-next',
        startDate: '2026-06-05',
        endDate: '2026-06-18',
        payday: '2026-06-05',
        nextPayday: '2026-06-19',
        payFrequency: 'biweekly',
        incomePence: 78850,
        status: 'active',
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
      asOfDate: '2026-06-12',
    })

    expect(summary.cards[0]).toMatchObject({
      actualOwedPence: 300,
      actualUncoveredPence: 300,
      linkedPotPence: 0,
      forecastOwedPence: 7300,
      plannedTopUpNeededPence: 7300,
    })
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

describe('credit card statement direct debits', () => {
  const card: CreditCard = {
    id: 'card-barclays',
    name: 'Barclays',
    provider: 'Barclays',
    limitPence: 100000,
    openingBalancePence: 68005,
    openingStatementBalancePence: 60000,
    statementDate: '2026-05-14',
    dueDay: 1,
    dueDate: null,
    color: '#2563eb',
    archived: false,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  }

  it('uses an existing issued statement for the first direct debit after setup', () => {
    const payments = getCreditCardStatementPayments({
      card,
      recurringPayments: [],
      customPayments: [],
      transactions: [],
      repayments: [],
      startDate: '2026-06-01',
      endDate: '2026-06-01',
      asOfDate: '2026-06-01',
    })

    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({
      statementDate: '2026-05-14',
      directDebitDate: '2026-06-01',
      actualDuePence: 60000,
      forecastDuePence: 60000,
    })
    expect(payments[0].breakdown.map((line) => `${line.label}:${line.amountPence}:${line.date}`)).toEqual([
      'Existing statement due:60000:2026-05-14',
    ])
  })

  it('caps overlarge statement repayments so a statement breakdown never goes negative', () => {
    const payments = getCreditCardStatementPayments({
      card: {
        ...card,
        id: 'card-capital-one',
        name: 'Capital One',
        provider: 'Capital One',
        openingStatementBalancePence: 22271,
        statementDate: '2026-05-09',
        dueDay: 5,
      },
      recurringPayments: [],
      customPayments: [],
      transactions: [],
      repayments: [
        {
          id: 'linked-card-pot-repayment-card-capital-one-2026-05-09-2026-06-05',
          creditCardId: 'card-capital-one',
          amountPence: 37238,
          date: '2026-06-05',
          note: 'Automatic Capital One payment from Capital One pot',
          createdAt: '2026-06-05T09:00:00.000Z',
          updatedAt: '2026-06-05T09:00:00.000Z',
        },
      ],
      startDate: '2026-06-05',
      endDate: '2026-06-05',
      asOfDate: '2026-06-05',
    })

    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({
      actualDuePence: 0,
      forecastDuePence: 0,
    })
    expect(payments[0].breakdown.map((line) => `${line.label}:${line.amountPence}`)).toEqual([
      'Existing statement due:22271',
      'Automatic Capital One payment from Capital One pot:-22271',
    ])
    expect(payments[0].breakdown[1].detail).toContain('£149.67 extra was already recorded')
    expect(payments[0].breakdown.reduce((total, line) => total + line.amountPence, 0)).toBe(0)
  })

  it('assigns spend on the statement date to the new cycle and excludes the next statement date', () => {
    const payments = getCreditCardStatementPayments({
      card,
      recurringPayments: [],
      customPayments: [],
      transactions: [
        {
          id: 'txn-statement-day',
          amountPence: 1000,
          type: 'spending',
          paymentMethod: 'credit_card',
          creditCardId: 'card-barclays',
          date: '2026-05-14',
          note: 'Statement day spend',
          createdAt: '2026-05-14T10:00:00.000Z',
          updatedAt: '2026-05-14T10:00:00.000Z',
        },
        {
          id: 'txn-middle',
          amountPence: 2000,
          type: 'spending',
          paymentMethod: 'credit_card',
          creditCardId: 'card-barclays',
          date: '2026-05-20',
          note: 'Middle spend',
          createdAt: '2026-05-20T10:00:00.000Z',
          updatedAt: '2026-05-20T10:00:00.000Z',
        },
        {
          id: 'txn-next-statement',
          amountPence: 3000,
          type: 'spending',
          paymentMethod: 'credit_card',
          creditCardId: 'card-barclays',
          date: '2026-06-14',
          note: 'Next statement spend',
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        },
      ],
      repayments: [],
      startDate: '2026-07-01',
      endDate: '2026-07-01',
      asOfDate: '2026-07-01',
    })

    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({
      statementDate: '2026-06-14',
      directDebitDate: '2026-07-01',
      actualDuePence: 3000,
      forecastDuePence: 3000,
    })
    expect(payments[0].breakdown.map((line) => line.label)).toEqual([
      'Statement day spend',
      'Middle spend',
    ])
  })

  it('uses logged recurring spend instead of also counting the planned forecast charge', () => {
    const payments = getCreditCardStatementPayments({
      card,
      recurringPayments: [
        {
          id: 'fuel',
          name: 'Fuel',
          amountPence: 7000,
          dueDay: 29,
          dueDate: '2026-05-29',
          frequency: 'monthly',
          potId: null,
          creditCardId: 'card-barclays',
          priority: 'important',
          active: true,
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
      customPayments: [],
      transactions: [
        {
          id: 'txn-fuel',
          amountPence: 6700,
          type: 'spending',
          paymentMethod: 'credit_card',
          creditCardId: 'card-barclays',
          recurringPaymentId: 'fuel',
          date: '2026-05-29',
          note: 'Fuel',
          createdAt: '2026-05-29T10:00:00.000Z',
          updatedAt: '2026-05-29T10:00:00.000Z',
        },
      ],
      repayments: [],
      startDate: '2026-07-01',
      endDate: '2026-07-01',
      asOfDate: '2026-05-30',
    })

    expect(payments[0]).toMatchObject({
      actualDuePence: 6700,
      forecastDuePence: 6700,
    })
    expect(payments[0].breakdown.map((line) => `${line.label}:${line.amountPence}`)).toEqual([
      'Fuel:6700',
    ])
  })
})

describe('pay period cost summary', () => {
  it('adds linked credit card amounts still owed to dashboard costs', () => {
    const payPeriod: PayPeriod = {
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 100000,
      status: 'active',
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    }

    const summary = getPayPeriodCostSummary({
      payPeriod,
      creditCards: [
        {
          id: 'card-amex',
          name: 'Everyday Amex',
          provider: 'Amex',
          limitPence: 100000,
          openingBalancePence: 60000,
          dueDay: 12,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      recurringPayments: [],
      customPayments: [],
      transactions: [],
      debts: [],
      creditCardRepayments: [],
      pots: [
        {
          id: 'pot-card-reserve',
          name: 'Card Reserve',
          type: 'reserved',
          balancePence: 40000,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          linkedCreditCardId: 'card-amex',
          linkedDebtId: null,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    expect(summary.creditCardPotsPence).toBe(20000)
    expect(summary.creditCardChargesPence).toBe(0)
    expect(summary.totalCostsPence).toBe(20000)
    expect(summary.moneyLeftPence).toBe(80000)
    expect(summary.items).toEqual([
      expect.objectContaining({
        id: 'linked-credit-card-pot-card-amex',
        label: 'Everyday Amex planned card cover',
        amountPence: 20000,
        source: 'linked_credit_card_pot',
        creditCardId: 'card-amex',
        potId: 'pot-card-reserve',
      }),
    ])
  })

  it('uses current card shortfall plus upcoming linked-card charges for linked pot top-ups', () => {
    const payPeriod: PayPeriod = {
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      payFrequency: 'biweekly',
      incomePence: 78850,
      status: 'active',
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }

    const summary = getPayPeriodCostSummary({
      payPeriod,
      creditCards: [
        {
          id: 'card-barclays',
          name: 'Barclays',
          provider: 'Barclays',
          limitPence: 80000,
          openingBalancePence: 68005,
          dueDay: 11,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'fuel',
          name: 'Fuel',
          amountPence: 7000,
          dueDate: '2026-05-29',
          frequency: 'biweekly',
          potId: null,
          creditCardId: 'card-barclays',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
        {
          id: 'gym',
          name: 'Gym',
          amountPence: 2500,
          dueDay: 1,
          frequency: 'monthly',
          potId: null,
          creditCardId: 'card-barclays',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      customPayments: [],
      transactions: [],
      debts: [],
      creditCardRepayments: [],
      pots: [
        {
          id: 'pot-barclays',
          name: 'Barclays',
          type: 'reserved',
          balancePence: 59648,
          targetPence: null,
          color: '#2563eb',
          linkedCreditCardId: 'card-barclays',
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
    })

    expect(summary.items).toContainEqual(
      expect.objectContaining({
        id: 'linked-credit-card-pot-card-barclays',
        label: 'Barclays planned card cover',
        amountPence: 17857,
        source: 'linked_credit_card_pot',
        creditCardId: 'card-barclays',
        potId: 'pot-barclays',
      }),
    )
    expect(summary.creditCardPotsPence).toBe(17857)
  })

  it('carries unchecked linked-card spend into the next paycheck pot cover', () => {
    const card: CreditCard = {
      id: 'card-barclays',
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      openingBalancePence: 68005,
      dueDay: 11,
      dueDate: null,
      color: '#2563eb',
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }
    const linkedPot: Pot = {
      id: 'pot-barclays',
      name: 'Barclays',
      type: 'reserved',
      balancePence: 68005,
      targetPence: null,
      color: '#2563eb',
      linkedCreditCardId: 'card-barclays',
      linkedDebtId: null,
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }
    const loggedSpend: Transaction = {
      id: 'txn-barclays-coffee',
      potId: null,
      payPeriodId: 'period-current',
      amountPence: 2000,
      type: 'spending',
      paymentMethod: 'credit_card',
      creditCardId: 'card-barclays',
      recurringPaymentId: null,
      date: '2026-05-25',
      note: 'Coffee',
      createdAt: '2026-05-25T10:00:00.000Z',
      updatedAt: '2026-05-25T10:00:00.000Z',
    }
    const currentPeriod: PayPeriod = {
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      payFrequency: 'biweekly',
      incomePence: 78850,
      status: 'active',
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }
    const nextPeriod: PayPeriod = {
      id: 'period-next',
      startDate: '2026-06-05',
      endDate: '2026-06-18',
      payday: '2026-06-05',
      nextPayday: '2026-06-19',
      payFrequency: 'biweekly',
      incomePence: 78850,
      status: 'planned',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    }
    const input = {
      creditCards: [card],
      recurringPayments: [],
      customPayments: [],
      transactions: [loggedSpend],
      debts: [],
      creditCardRepayments: [],
      pots: [linkedPot],
      potAllocations: [],
      asOfDate: '2026-06-05',
    }

    const currentSummary = getPayPeriodCostSummary({ ...input, payPeriod: currentPeriod })
    const nextSummary = getPayPeriodCostSummary({ ...input, payPeriod: nextPeriod })

    expect(currentSummary.items).toContainEqual(
      expect.objectContaining({
        id: 'linked-credit-card-pot-card-barclays',
        amountPence: 2000,
        source: 'linked_credit_card_pot',
        creditCardId: 'card-barclays',
        potId: 'pot-barclays',
      }),
    )
    expect(nextSummary.items).toContainEqual(
      expect.objectContaining({
        id: 'linked-credit-card-pot-card-barclays',
        amountPence: 2000,
        source: 'linked_credit_card_pot',
        creditCardId: 'card-barclays',
        potId: 'pot-barclays',
      }),
    )
  })

  it('creates a new linked-card cover batch after a completed additional top-up', () => {
    const payPeriod: PayPeriod = {
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      payFrequency: 'biweekly',
      incomePence: 78850,
      status: 'active',
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }
    const card: CreditCard = {
      id: 'card-barclays',
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      openingBalancePence: 68005,
      dueDay: 11,
      dueDate: null,
      color: '#2563eb',
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }
    const pot: Pot = {
      id: 'pot-barclays',
      name: 'Barclays',
      type: 'reserved',
      balancePence: 79505,
      targetPence: null,
      color: '#2563eb',
      linkedCreditCardId: 'card-barclays',
      linkedDebtId: null,
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-24T11:00:00.000Z',
    }
    const allocations: PotAllocation[] = [
      {
        id: 'dashboard-todo-period-current-linked-credit-card-pot-card-barclays',
        payPeriodId: 'period-current',
        potId: 'pot-barclays',
        amountPence: 17857,
        source: 'manual',
        recurringPaymentId: null,
        createdAt: '2026-05-22T12:00:00.000Z',
        updatedAt: '2026-05-22T12:00:00.000Z',
      },
      {
        id: 'dashboard-todo-period-current-linked-credit-card-pot-additional-card-barclays',
        payPeriodId: 'period-current',
        potId: 'pot-barclays',
        amountPence: 2000,
        source: 'manual',
        recurringPaymentId: null,
        createdAt: '2026-05-24T11:00:00.000Z',
        updatedAt: '2026-05-24T11:00:00.000Z',
      },
    ]
    const transactions: Transaction[] = [
      {
        id: 'txn-barclays-coffee',
        potId: null,
        payPeriodId: 'period-current',
        amountPence: 2000,
        type: 'spending',
        paymentMethod: 'credit_card',
        creditCardId: 'card-barclays',
        recurringPaymentId: null,
        date: '2026-05-24',
        note: 'Coffee',
        createdAt: '2026-05-24T10:00:00.000Z',
        updatedAt: '2026-05-24T10:00:00.000Z',
      },
      {
        id: 'txn-barclays-snack',
        potId: null,
        payPeriodId: 'period-current',
        amountPence: 295,
        type: 'spending',
        paymentMethod: 'credit_card',
        creditCardId: 'card-barclays',
        recurringPaymentId: null,
        date: '2026-05-25',
        note: 'Snack',
        createdAt: '2026-05-25T10:00:00.000Z',
        updatedAt: '2026-05-25T10:00:00.000Z',
      },
    ]

    const summary = getPayPeriodCostSummary({
      payPeriod,
      creditCards: [card],
      recurringPayments: [
        {
          id: 'fuel',
          name: 'Fuel',
          amountPence: 7000,
          dueDate: '2026-05-29',
          frequency: 'biweekly',
          potId: null,
          creditCardId: 'card-barclays',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
        {
          id: 'gym',
          name: 'Gym',
          amountPence: 2500,
          dueDay: 1,
          frequency: 'monthly',
          potId: null,
          creditCardId: 'card-barclays',
          priority: 'important',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      customPayments: [],
      transactions,
      debts: [],
      creditCardRepayments: [],
      pots: [pot],
      potAllocations: allocations,
      asOfDate: '2026-05-27',
    })

    const openCover = summary.items.find((item) => item.source === 'linked_credit_card_pot')

    expect(openCover).toEqual(
      expect.objectContaining({
        id: 'linked-credit-card-pot-additional-card-barclays--transaction-txn-barclays-snack',
        amountPence: 295,
        source: 'linked_credit_card_pot',
        creditCardId: 'card-barclays',
        potId: 'pot-barclays',
      }),
    )
    expect(openCover?.coverBreakdown).toEqual([
      expect.objectContaining({
        id: 'transaction-txn-barclays-snack',
        label: 'Snack',
        amountPence: 295,
      }),
    ])
  })

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
      creditCardPots: [
        {
          id: 'credit-pot-paycheck',
          creditCardId: 'card-amex',
          payPeriodId: 'period-current',
          payday: '2026-05-16',
          periodStartDate: '2026-05-16',
          periodEndDate: '2026-05-29',
          name: 'Amex payoff pot',
          amountPence: 10000,
          source: 'paycheck',
          status: 'active',
          note: '',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'credit-pot-external',
          creditCardId: 'card-amex',
          payPeriodId: null,
          payday: null,
          periodStartDate: null,
          periodEndDate: null,
          name: 'External card money',
          amountPence: 3000,
          source: 'external',
          status: 'active',
          note: '',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      pots: [
        {
          id: 'food',
          name: 'Food',
          type: 'spending',
          balancePence: 5000,
          targetPence: 5000,
          color: '#16a34a',
          archived: false,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      potAllocations: [
        {
          id: 'allocation-food',
          payPeriodId: 'period-current',
          potId: 'food',
          amountPence: 5000,
          source: 'pot_auto',
          recurringPaymentId: null,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    expect(summary).toMatchObject({
      payReceivedPence: 90000,
      directRecurringPence: 25000,
      savedPaymentsPence: 3000,
      manualSpendingPence: 1250,
      potAllocationsPence: 5000,
      debtReservesPence: 0,
      debtMinimumsPence: 75000,
      creditCardPotsPence: 10000,
      creditCardChargesPence: 7200,
      creditCardRepaymentsPence: 2000,
      creditCardNetPence: 5200,
      totalCostsPence: 124450,
      moneyLeftPence: -34450,
      isOverCommitted: true,
    })
  })

  it('keeps a savings-funded linked-card pot allocation out of paycheck costs while leaving it visible', () => {
    const payPeriod: PayPeriod = {
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 20200,
      status: 'active',
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }
    const summary = getPayPeriodCostSummary({
      payPeriod,
      creditCards: [
        {
          id: 'card-barclays',
          name: 'Barclays',
          provider: 'Barclays',
          limitPence: 80000,
          openingBalancePence: 1000,
          dueDay: 11,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      recurringPayments: [],
      customPayments: [],
      transactions: [],
      debts: [],
      creditCardRepayments: [],
      pots: [
        {
          id: 'pot-barclays',
          name: 'Barclays',
          type: 'reserved',
          balancePence: 1000,
          targetPence: null,
          color: '#2563eb',
          linkedCreditCardId: 'card-barclays',
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
        {
          id: 'pot-savings',
          name: 'Emergency savings',
          type: 'saving',
          balancePence: 19200,
          targetPence: null,
          color: '#10b981',
          linkedCreditCardId: null,
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      potAllocations: [
        {
          id: 'dashboard-todo-period-current-linked-credit-card-pot-card-barclays',
          payPeriodId: 'period-current',
          potId: 'pot-barclays',
          fundingPotId: 'pot-savings',
          amountPence: 500,
          source: 'manual',
          recurringPaymentId: null,
          createdAt: '2026-05-22T12:00:00.000Z',
          updatedAt: '2026-05-22T12:00:00.000Z',
        },
      ],
    })

    expect(summary.potAllocationsPence).toBe(0)
    expect(summary.totalCostsPence).toBe(0)
    expect(summary.moneyLeftPence).toBe(20200)
    expect(summary.items).toContainEqual(
      expect.objectContaining({
        id: 'pot-allocation-dashboard-todo-period-current-linked-credit-card-pot-card-barclays',
        amountPence: 500,
        source: 'pot_allocation',
        potId: 'pot-barclays',
        fundingPotId: 'pot-savings',
      }),
    )
  })

  it('uses linked pot balances to reduce recurring set-asides due this pay period', () => {
    const payPeriod: PayPeriod = {
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 100000,
      status: 'active',
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }
    const summary = getPayPeriodCostSummary({
      payPeriod,
      recurringPayments: [
        {
          id: 'car-insurance',
          name: 'Car Insurance',
          amountPence: 8711,
          dueDay: 1,
          frequency: 'monthly',
          potId: 'pot-car-insurance',
          priority: 'essential',
          active: true,
          creditCardId: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      customPayments: [],
      transactions: [],
      debts: [],
      creditCardRepayments: [],
      pots: [
        {
          id: 'pot-car-insurance',
          name: 'Car Insurance',
          type: 'reserved',
          balancePence: 8711,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      potAllocations: [],
    })

    expect(summary.directRecurringPence).toBe(0)
    expect(summary.totalCostsPence).toBe(0)
    expect(summary.moneyLeftPence).toBe(100000)
    expect(summary.items).toContainEqual(
      expect.objectContaining({
        id: 'recurring-car-insurance-2026-06-01',
        amountPence: 0,
      }),
    )
  })
})
