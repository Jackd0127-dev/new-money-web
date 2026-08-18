import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  addCreditCard,
  addCreditCardRepayment,
  addCustomPayment,
  addDailyBrief,
  addDebt,
  addDebtReserve,
  applyDebtReserve,
  cancelDebtReserve,
  createPaycheckPlan,
  deletePot,
  deletePayPeriod,
  getPlannerSnapshot,
  resetPlannerData,
  skipDebtReserve,
  updateDebtReserve,
} from './repository'
import { db } from './db'

describe('paycheck plan storage', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await resetPlannerData()
  })

  it('updates an existing payday plan instead of creating duplicate history or double-counting pots', async () => {
    await createPaycheckPlan({
      payday: '2026-05-16',
      payFrequency: 'biweekly',
      hoursWorked: 72,
      hourlyRatePence: 1250,
      actualAmountPence: null,
      allocations: [{ potId: 'pot-food', amountPence: 10000 }],
    })

    await createPaycheckPlan({
      payday: '2026-05-16',
      payFrequency: 'biweekly',
      hoursWorked: 80,
      hourlyRatePence: 1300,
      actualAmountPence: 100000,
      allocations: [{ potId: 'pot-food', amountPence: 20000 }],
    })

    const snapshot = await getPlannerSnapshot()
    const foodPot = snapshot.pots.find((pot) => pot.id === 'pot-food')

    expect(snapshot.payPeriods).toHaveLength(1)
    expect(snapshot.paychecks).toHaveLength(1)
    expect(snapshot.potAllocations).toHaveLength(1)
    expect(snapshot.payPeriods[0]).toMatchObject({
      payday: '2026-05-16',
      incomePence: 100000,
    })
    expect(snapshot.paychecks[0]).toMatchObject({
      hoursWorked: 80,
      hourlyRatePence: 1300,
      actualAmountPence: 100000,
    })
    expect(foodPot?.balancePence).toBe(20000)
    expect(snapshot.settings.hourlyRatePence).toBe(1300)
    expect((snapshot.settings as { defaultHoursWorked?: number }).defaultHoursWorked).toBe(80)
  })

  it('deletes a payday plan and reverses its allocations from pot balances', async () => {
    await createPaycheckPlan({
      payday: '2026-05-16',
      payFrequency: 'biweekly',
      hoursWorked: 72,
      hourlyRatePence: 1250,
      actualAmountPence: null,
      allocations: [{ potId: 'pot-food', amountPence: 10000 }],
    })

    const savedSnapshot = await getPlannerSnapshot()
    await deletePayPeriod(savedSnapshot.payPeriods[0].id)

    const snapshot = await getPlannerSnapshot()
    const foodPot = snapshot.pots.find((pot) => pot.id === 'pot-food')

    expect(snapshot.payPeriods).toHaveLength(0)
    expect(snapshot.paychecks).toHaveLength(0)
    expect(snapshot.potAllocations).toHaveLength(0)
    expect(foodPot?.balancePence).toBe(0)
  })

  it('does not recreate default pots after every pot is deleted', async () => {
    let snapshot = await getPlannerSnapshot()

    for (const pot of snapshot.pots) {
      await deletePot(pot.id)
    }

    snapshot = await getPlannerSnapshot()

    expect(snapshot.pots).toHaveLength(0)
  })

  it('repairs duplicate recurring allocations and reverses duplicated pot balance', async () => {
    const timestamp = '2026-05-22T00:00:00.000Z'

    await db.payPeriods.add({
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      payFrequency: 'biweekly',
      incomePence: 90000,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.recurringPayments.add({
      id: 'rec-fuel',
      name: 'Fuel',
      amountPence: 14000,
      dueDay: 1,
      frequency: 'monthly',
      potId: 'pot-food',
      priority: 'important',
      active: true,
      creditCardId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.pots.update('pot-food', {
      balancePence: 42000,
      updatedAt: timestamp,
    })
    await db.potAllocations.bulkAdd([
      {
        id: 'allocation-fuel-1',
        payPeriodId: 'period-current',
        potId: 'pot-food',
        amountPence: 14000,
        source: 'recurring',
        recurringPaymentId: 'rec-fuel',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'allocation-fuel-2',
        payPeriodId: 'period-current',
        potId: 'pot-food',
        amountPence: 14000,
        source: 'recurring',
        recurringPaymentId: 'rec-fuel',
        createdAt: '2026-05-22T00:01:00.000Z',
        updatedAt: '2026-05-22T00:01:00.000Z',
      },
      {
        id: 'allocation-fuel-3',
        payPeriodId: 'period-current',
        potId: 'pot-food',
        amountPence: 14000,
        source: 'recurring',
        recurringPaymentId: 'rec-fuel',
        createdAt: '2026-05-22T00:02:00.000Z',
        updatedAt: '2026-05-22T00:02:00.000Z',
      },
    ])

    const snapshot = await getPlannerSnapshot()
    const foodPot = snapshot.pots.find((pot) => pot.id === 'pot-food')
    const rawAllocations = await db.potAllocations.toArray()
    const rawFoodPot = await db.pots.get('pot-food')

    expect(snapshot.potAllocations).toEqual([
      expect.objectContaining({
        id: 'allocation-fuel-3',
        recurringPaymentId: 'rec-fuel',
        amountPence: 14000,
      }),
    ])
    expect(foodPot?.balancePence).toBe(14000)
    expect(rawAllocations).toHaveLength(1)
    expect(rawFoodPot?.balancePence).toBe(14000)
  })

  it('persists credit cards, custom payments, repayments, and daily briefs in the planner snapshot', async () => {
    await addCreditCard({
      name: 'Everyday Amex',
      provider: 'Amex',
      limitPence: 100000,
      dueDay: 12,
      dueDate: null,
      color: '#2563eb',
    })

    const withCard = await getPlannerSnapshot()
    const card = withCard.creditCards[0]

    await addCustomPayment({
      name: 'Tyres',
      amountPence: 3000,
      dueDate: '2026-05-20',
      creditCardId: card.id,
    })
    await addCreditCardRepayment({
      creditCardId: card.id,
      amountPence: 1250,
      date: '2026-05-24',
      note: 'Part payment',
    })
    await addDailyBrief({
      date: '2026-05-19',
      snapshotSignature: 'snapshot-signature',
      content: 'Today: check your card balances.',
    })

    const snapshot = await getPlannerSnapshot()

    expect(snapshot.creditCards[0]).toMatchObject({
      name: 'Everyday Amex',
      provider: 'Amex',
      limitPence: 100000,
      dueDay: 12,
      dueDate: null,
      archived: false,
    })
    expect(snapshot.customPayments[0]).toMatchObject({
      name: 'Tyres',
      amountPence: 3000,
      creditCardId: card.id,
      status: 'unpaid',
    })
    expect(snapshot.creditCardRepayments[0]).toMatchObject({
      creditCardId: card.id,
      amountPence: 1250,
      note: 'Part payment',
    })
    expect(snapshot.dailyBriefs[0]).toMatchObject({
      date: '2026-05-19',
      snapshotSignature: 'snapshot-signature',
      content: 'Today: check your card balances.',
    })
  })

  it('stores, updates, skips, cancels, and applies debt reserves without paying until applied', async () => {
    await createPaycheckPlan({
      payday: '2026-01-02',
      payFrequency: 'biweekly',
      hoursWorked: 80,
      hourlyRatePence: 1000,
      actualAmountPence: 80000,
      allocations: [],
    })
    await addDebt({
      name: 'Card balance',
      lender: 'Card Provider',
      currentBalancePence: 200000,
      minimumPaymentPence: 0,
      dueDate: '2026-02-01',
      interestRateApr: null,
      note: '',
    })

    let snapshot = await getPlannerSnapshot()
    const debt = snapshot.debts[0]
    const period = snapshot.payPeriods[0]

    await addDebtReserve({
      debtId: debt.id,
      payPeriodId: period.id,
      payday: period.payday,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      amountPence: 66666,
      source: 'assistant',
      note: 'First assistant reserve',
    })

    snapshot = await getPlannerSnapshot()
    const plannedReserve = snapshot.debtReserves[0]

    expect(plannedReserve).toMatchObject({
      debtId: debt.id,
      amountPence: 66666,
      status: 'planned',
      source: 'assistant',
    })
    expect(snapshot.debts[0].currentBalancePence).toBe(200000)

    await updateDebtReserve(plannedReserve.id, {
      amountPence: 70000,
      note: 'Adjusted assistant reserve',
    })
    await cancelDebtReserve(plannedReserve.id)
    await skipDebtReserve({
      debtId: debt.id,
      payPeriodId: period.id,
      payday: period.payday,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      source: 'assistant',
      note: 'Move this paycheck to later',
    })
    await addDebtReserve({
      debtId: debt.id,
      payPeriodId: period.id,
      payday: period.payday,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      amountPence: 50000,
      source: 'assistant',
      note: 'Ready to apply',
    })

    snapshot = await getPlannerSnapshot()
    const activeReserve = snapshot.debtReserves.find((reserve) => reserve.status === 'planned')
    expect(activeReserve?.amountPence).toBe(50000)
    expect(snapshot.debtReserves.some((reserve) => reserve.status === 'cancelled')).toBe(true)
    expect(snapshot.debtReserves.some((reserve) => reserve.status === 'skipped')).toBe(true)

    await applyDebtReserve(activeReserve!.id, {
      date: '2026-01-02',
      note: 'Paid from reserved money',
    })

    snapshot = await getPlannerSnapshot()

    expect(snapshot.debtReserves.find((reserve) => reserve.id === activeReserve!.id)?.status).toBe('applied')
    expect(snapshot.debtPayments[0]).toMatchObject({
      debtId: debt.id,
      amountPence: 50000,
      note: 'Paid from reserved money',
    })
    expect(snapshot.debts[0].currentBalancePence).toBe(150000)
  })
})
