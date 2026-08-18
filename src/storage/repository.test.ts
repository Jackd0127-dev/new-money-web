import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addCreditCard,
  addCreditCardPot,
  addCreditCardRepayment,
  addCustomPayment,
  addDailyBrief,
  addDebt,
  addDebtReserve,
  addRecurringPayment,
  addTransaction,
  applyCreditCardPot,
  applyDebtReserve,
  cancelDebtReserve,
  createPaycheckPlan,
  deletePot,
  deleteCreditCardPot,
  deletePayPeriod,
  getPlannerSnapshot,
  resetPlannerData,
  skipDebtReserve,
  updatePlannerDataToLatest,
  updateCreditCardPot,
  updateDebtReserve,
  updatePot,
  updateRecurringPayment,
  updateSettings,
  updateTransaction,
  upsertPaycheckPotAllocation,
  deletePaycheckPotAllocation,
} from './repository'
import { db } from './db'

describe('paycheck plan storage', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await resetPlannerData()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('upserts paycheck checklist pot allocations into pot balances', async () => {
    await createPaycheckPlan({
      payday: '2026-05-16',
      payFrequency: 'biweekly',
      hoursWorked: 72,
      hourlyRatePence: 1250,
      actualAmountPence: null,
      allocations: [],
    })

    const savedSnapshot = await getPlannerSnapshot()
    const payPeriodId = savedSnapshot.payPeriods[0].id
    const allocationId = `dashboard-todo-${payPeriodId}-recurring-council-tax-2026-05-20`

    await upsertPaycheckPotAllocation({
      id: allocationId,
      payPeriodId,
      potId: 'pot-food',
      amountPence: 14800,
    })

    let snapshot = await getPlannerSnapshot()

    expect(snapshot.potAllocations).toContainEqual(
      expect.objectContaining({
        id: allocationId,
        payPeriodId,
        potId: 'pot-food',
        amountPence: 14800,
        source: 'manual',
        recurringPaymentId: null,
      }),
    )
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(14800)

    await upsertPaycheckPotAllocation({
      id: allocationId,
      payPeriodId,
      potId: 'pot-food',
      amountPence: 20000,
    })

    snapshot = await getPlannerSnapshot()
    expect(snapshot.potAllocations.find((allocation) => allocation.id === allocationId)?.amountPence).toBe(20000)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(20000)

    await deletePaycheckPotAllocation(allocationId)

    snapshot = await getPlannerSnapshot()
    expect(snapshot.potAllocations.some((allocation) => allocation.id === allocationId)).toBe(false)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(0)
  })

  it('transfers funded paycheck checklist allocations between pots and reverses them on update and delete', async () => {
    await db.pots.bulkAdd([
      {
        id: 'pot-emergency',
        name: 'Emergency savings',
        type: 'saving',
        balancePence: 20200,
        targetPence: null,
        color: '#10b981',
        linkedCreditCardId: null,
        linkedDebtId: null,
        archived: false,
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
      {
        id: 'pot-holiday',
        name: 'Holiday fund',
        type: 'investment',
        balancePence: 10000,
        targetPence: null,
        color: '#0ea5e9',
        linkedCreditCardId: null,
        linkedDebtId: null,
        archived: false,
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
    ])
    await createPaycheckPlan({
      payday: '2026-05-16',
      payFrequency: 'biweekly',
      hoursWorked: 72,
      hourlyRatePence: 1250,
      actualAmountPence: null,
      allocations: [],
    })

    const savedSnapshot = await getPlannerSnapshot()
    const payPeriodId = savedSnapshot.payPeriods[0].id
    const allocationId = `dashboard-todo-${payPeriodId}-linked-credit-card-pot-card-barclays`

    await upsertPaycheckPotAllocation({
      id: allocationId,
      payPeriodId,
      potId: 'pot-food',
      fundingPotId: 'pot-emergency',
      amountPence: 500,
    })

    let snapshot = await getPlannerSnapshot()
    expect(snapshot.potAllocations.find((allocation) => allocation.id === allocationId)).toMatchObject({
      potId: 'pot-food',
      fundingPotId: 'pot-emergency',
      amountPence: 500,
    })
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(500)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-emergency')?.balancePence).toBe(19700)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-holiday')?.balancePence).toBe(10000)

    await upsertPaycheckPotAllocation({
      id: allocationId,
      payPeriodId,
      potId: 'pot-food',
      fundingPotId: 'pot-holiday',
      amountPence: 700,
    })

    snapshot = await getPlannerSnapshot()
    expect(snapshot.potAllocations.find((allocation) => allocation.id === allocationId)).toMatchObject({
      potId: 'pot-food',
      fundingPotId: 'pot-holiday',
      amountPence: 700,
    })
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(700)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-emergency')?.balancePence).toBe(20200)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-holiday')?.balancePence).toBe(9300)

    await deletePaycheckPotAllocation(allocationId)

    snapshot = await getPlannerSnapshot()
    expect(snapshot.potAllocations.some((allocation) => allocation.id === allocationId)).toBe(false)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(0)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-emergency')?.balancePence).toBe(20200)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-holiday')?.balancePence).toBe(10000)
  })

  it('updates stale dashboard card-pot allocations to the latest card forecast maths', async () => {
    vi.setSystemTime(new Date('2026-05-25T12:00:00.000Z'))
    await db.pots.clear()
    await db.creditCards.clear()
    await db.recurringPayments.clear()
    await db.payPeriods.clear()
    await db.paychecks.clear()
    await db.potAllocations.clear()
    await db.creditCardPots.clear()

    await db.pots.add({
      id: 'pot-barclays',
      name: 'Barclays',
      type: 'reserved',
      balancePence: 77498,
      targetPence: null,
      color: '#2563eb',
      linkedCreditCardId: 'card-barclays',
      linkedDebtId: null,
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })
    await db.pots.add({
      id: 'pot-emergency',
      name: 'Emergency savings',
      type: 'saving',
      balancePence: 2150,
      targetPence: null,
      color: '#10b981',
      linkedCreditCardId: null,
      linkedDebtId: null,
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })
    await db.creditCards.add({
      id: 'card-barclays',
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      openingBalancePence: 68005,
      openingStatementBalancePence: 68005,
      statementDate: '2026-05-14',
      dueDay: 11,
      dueDate: null,
      color: '#2563eb',
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })
    await db.payPeriods.add({
      id: 'period-current',
      payday: '2026-05-22',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      nextPayday: '2026-06-05',
      payFrequency: 'biweekly',
      incomePence: 78850,
      status: 'active',
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })
    await db.paychecks.add({
      id: 'paycheck-current',
      payPeriodId: 'period-current',
      hoursWorked: 83,
      hourlyRatePence: 950,
      calculatedAmountPence: 78850,
      actualAmountPence: null,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })
    await db.recurringPayments.bulkAdd([
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
    ])
    await db.potAllocations.add({
      id: 'dashboard-todo-period-current-linked-credit-card-pot-card-barclays',
      payPeriodId: 'period-current',
      potId: 'pot-barclays',
      fundingPotId: 'pot-emergency',
      amountPence: 17850,
      source: 'manual',
      recurringPaymentId: null,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })

    await updatePlannerDataToLatest()

    const snapshot = await getPlannerSnapshot()
    const allocation = snapshot.potAllocations.find(
      (candidate) => candidate.id === 'dashboard-todo-period-current-linked-credit-card-pot-card-barclays',
    )

    expect(allocation?.amountPence).toBe(17857)
    expect(allocation?.fundingPotId).toBe('pot-emergency')
    expect(snapshot.pots.find((pot) => pot.id === 'pot-barclays')?.balancePence).toBe(77505)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-emergency')?.balancePence).toBe(2143)
    expect(snapshot.creditCards.find((card) => card.id === 'card-barclays')?.openingBalancePence).toBe(68005)
  })

  it('stores stable interval anchors for legacy weekly and biweekly payments', async () => {
    await db.recurringPayments.add({
      id: 'fuel',
      name: 'Fuel',
      amountPence: 7000,
      dueDay: 29,
      frequency: 'biweekly',
      potId: null,
      creditCardId: 'card-barclays',
      priority: 'important',
      active: true,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })

    await updatePlannerDataToLatest()

    const payment = await db.recurringPayments.get('fuel')

    expect(payment?.dueDate).toBe('2026-05-29')
    expect(payment?.dueDay).toBeUndefined()
  })

  it('automatically adds pot top-ups when a paycheck plan is confirmed', async () => {
    await updatePot('pot-food', {
      name: 'Food',
      type: 'spending',
      balancePence: 0,
      targetPence: 5000,
      color: '#16a34a',
    })

    await createPaycheckPlan({
      payday: '2026-05-16',
      payFrequency: 'biweekly',
      hoursWorked: 72,
      hourlyRatePence: 1250,
      actualAmountPence: null,
      allocations: [],
    })

    const snapshot = await getPlannerSnapshot()
    const foodPot = snapshot.pots.find((pot) => pot.id === 'pot-food')

    expect(snapshot.potAllocations).toEqual([
      expect.objectContaining({
        potId: 'pot-food',
        amountPence: 5000,
        source: 'pot_auto',
        recurringPaymentId: null,
      }),
    ])
    expect(foodPot).toMatchObject({
      balancePence: 5000,
      targetPence: 5000,
    })
  })

  it('uses existing pot balance before reserving money for a due recurring payment', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-24T12:00:00.000Z'))

    await updatePot('pot-food', {
      name: 'Food',
      type: 'spending',
      balancePence: 8711,
      targetPence: null,
      color: '#16a34a',
    })
    await addRecurringPayment({
      name: 'Car insurance',
      amountPence: 8711,
      dueDay: 1,
      frequency: 'monthly',
      potId: 'pot-food',
      priority: 'essential',
    })
    await createPaycheckPlan({
      payday: '2026-05-24',
      payFrequency: 'biweekly',
      hoursWorked: 72,
      hourlyRatePence: 1250,
      actualAmountPence: null,
      allocations: [],
    })

    const snapshot = await getPlannerSnapshot()
    const foodPot = snapshot.pots.find((pot) => pot.id === 'pot-food')

    expect(snapshot.potAllocations.some((allocation) => allocation.recurringPaymentId)).toBe(false)
    expect(foodPot?.balancePence).toBe(8711)
  })

  it('stores a card-linked recurring payment without a pot or pot reservation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-24T12:00:00.000Z'))

    await createPaycheckPlan({
      payday: '2026-05-24',
      payFrequency: 'biweekly',
      hoursWorked: 72,
      hourlyRatePence: 1250,
      actualAmountPence: null,
      allocations: [],
    })
    await addCreditCard({
      name: 'Aqua',
      provider: 'Aqua',
      limitPence: 80000,
      openingBalancePence: 0,
      dueDay: 5,
      color: '#2563eb',
      designId: null,
    })

    let snapshot = await getPlannerSnapshot()
    const card = snapshot.creditCards.find((candidate) => candidate.name === 'Aqua')

    await addRecurringPayment({
      name: 'Spotify',
      amountPence: 1199,
      dueDay: 26,
      frequency: 'monthly',
      potId: null,
      creditCardId: card?.id ?? null,
      priority: 'optional',
    })

    snapshot = await getPlannerSnapshot()
    const payment = snapshot.recurringPayments.find((candidate) => candidate.name === 'Spotify')

    expect(payment).toMatchObject({
      amountPence: 1199,
      creditCardId: card?.id,
      potId: null,
    })
    expect(snapshot.potAllocations.some((allocation) => allocation.recurringPaymentId === payment?.id)).toBe(false)
  })

  it('persists a biweekly recurring payment anchor date through create and update', async () => {
    await addRecurringPayment({
      name: 'Fuel',
      amountPence: 7000,
      dueDay: 1,
      dueDate: '2026-05-29',
      frequency: 'biweekly',
      potId: null,
      priority: 'important',
    })

    let snapshot = await getPlannerSnapshot()
    const payment = snapshot.recurringPayments.find((candidate) => candidate.name === 'Fuel')

    expect(payment).toMatchObject({
      dueDay: 1,
      dueDate: '2026-05-29',
      frequency: 'biweekly',
    })

    await updateRecurringPayment(payment?.id ?? '', {
      name: 'Fuel',
      amountPence: 7000,
      dueDay: 1,
      dueDate: '2026-06-12',
      frequency: 'biweekly',
      potId: null,
      priority: 'important',
    })

    snapshot = await getPlannerSnapshot()
    expect(snapshot.recurringPayments.find((candidate) => candidate.id === payment?.id)).toMatchObject({
      dueDate: '2026-06-12',
    })
  })

  it('reserves the total uncovered amount when an interval recurring payment occurs more than once in a pay period', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-16T12:00:00.000Z'))

    await updatePot('pot-food', {
      name: 'Food',
      type: 'spending',
      balancePence: 500,
      targetPence: null,
      color: '#16a34a',
    })
    await addRecurringPayment({
      name: 'Travel',
      amountPence: 1000,
      dueDate: '2026-05-16',
      frequency: 'weekly',
      potId: 'pot-food',
      priority: 'important',
    })
    await createPaycheckPlan({
      payday: '2026-05-16',
      payFrequency: 'biweekly',
      hoursWorked: 72,
      hourlyRatePence: 1250,
      actualAmountPence: null,
      allocations: [],
    })

    const snapshot = await getPlannerSnapshot()
    const payment = snapshot.recurringPayments.find((candidate) => candidate.name === 'Travel')

    expect(snapshot.potAllocations).toContainEqual(
      expect.objectContaining({
        potId: 'pot-food',
        amountPence: 1500,
        source: 'recurring',
        recurringPaymentId: payment?.id,
      }),
    )
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(1000)
  })

  it('moves a linked-card checklist top-up into the pot without changing the card balance seed', async () => {
    await addCreditCard({
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      openingBalancePence: 68005,
      openingStatementBalancePence: 68005,
      statementDate: '2026-05-14',
      dueDay: 11,
      color: '#2563eb',
      designId: null,
    })
    await updatePot('pot-food', {
      name: 'Barclays',
      type: 'reserved',
      balancePence: 59648,
      targetPence: null,
      color: '#2563eb',
    })
    const initialSnapshot = await getPlannerSnapshot()
    const card = initialSnapshot.creditCards.find((candidate) => candidate.name === 'Barclays')

    await updatePot('pot-food', {
      name: 'Barclays',
      type: 'reserved',
      balancePence: 59648,
      targetPence: null,
      color: '#2563eb',
      linkedCreditCardId: card?.id ?? null,
    })
    await createPaycheckPlan({
      payday: '2026-05-22',
      payFrequency: 'biweekly',
      hoursWorked: 83,
      hourlyRatePence: 950,
      actualAmountPence: null,
      allocations: [],
    })

    const plannedSnapshot = await getPlannerSnapshot()
    const payPeriodId = plannedSnapshot.payPeriods[0].id

    await upsertPaycheckPotAllocation({
      id: `dashboard-todo-${payPeriodId}-linked-credit-card-pot-${card?.id}`,
      payPeriodId,
      potId: 'pot-food',
      amountPence: 17857,
    })

    const snapshot = await getPlannerSnapshot()

    expect(snapshot.creditCards.find((candidate) => candidate.id === card?.id)?.openingBalancePence).toBe(68005)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(77505)
  })

  it('deducts direct recurring payments from the linked pot when the due date arrives', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))

    await updatePot('pot-food', {
      name: 'Food',
      type: 'spending',
      balancePence: 8711,
      targetPence: null,
      color: '#16a34a',
    })
    await addRecurringPayment({
      name: 'Car insurance',
      amountPence: 8711,
      dueDay: 1,
      frequency: 'monthly',
      potId: 'pot-food',
      priority: 'essential',
    })

    let snapshot = await getPlannerSnapshot()
    const payment = snapshot.recurringPayments.find((candidate) => candidate.name === 'Car insurance')
    const transaction = snapshot.transactions.find((candidate) => candidate.recurringPaymentId === payment?.id)

    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(0)
    expect(transaction).toMatchObject({
      id: `recurring-${payment?.id}-2026-06-01`,
      amountPence: 8711,
      date: '2026-06-01',
      note: 'Car insurance',
      paymentMethod: 'pot',
      potId: 'pot-food',
      recurringPaymentId: payment?.id,
      type: 'spending',
    })

    snapshot = await getPlannerSnapshot()

    expect(snapshot.transactions.filter((candidate) => candidate.recurringPaymentId === payment?.id)).toHaveLength(1)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(0)
  })

  it('deducts a linked pot recurring payment due on 5 June from the pot balance', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

    await updatePot('pot-food', {
      name: 'Car Insurance',
      type: 'spending',
      balancePence: 8711,
      targetPence: null,
      color: '#2563eb',
    })
    await addRecurringPayment({
      name: 'Car insurance',
      amountPence: 8711,
      dueDay: 5,
      frequency: 'monthly',
      potId: 'pot-food',
      priority: 'essential',
    })

    let snapshot = await getPlannerSnapshot()
    const payment = snapshot.recurringPayments.find((candidate) => candidate.name === 'Car insurance')
    const transaction = snapshot.transactions.find((candidate) => candidate.recurringPaymentId === payment?.id)

    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(0)
    expect(transaction).toMatchObject({
      id: `recurring-${payment?.id}-2026-06-05`,
      amountPence: 8711,
      date: '2026-06-05',
      note: 'Car insurance',
      paymentMethod: 'pot',
      potId: 'pot-food',
      recurringPaymentId: payment?.id,
      type: 'spending',
    })

    snapshot = await getPlannerSnapshot()

    expect(snapshot.transactions.filter((candidate) => candidate.recurringPaymentId === payment?.id)).toHaveLength(1)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(0)
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
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-24T12:00:00.000Z'))

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
      openingBalancePence: 12500,
      designId: 'cart-gradient-11',
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
      openingBalancePence: 12500,
      designId: 'cart-gradient-11',
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

  it('persists unlinked spending without changing pot balances', async () => {
    await addTransaction({
      amountPence: 1000,
      type: 'spending',
      date: '2026-05-20',
      note: 'Coffee',
      potId: null,
      creditCardId: null,
    })

    let snapshot = await getPlannerSnapshot()
    const transaction = snapshot.transactions[0]
    const foodPot = snapshot.pots.find((pot) => pot.id === 'pot-food')

    expect(transaction).toMatchObject({
      amountPence: 1000,
      creditCardId: null,
      note: 'Coffee',
      potId: null,
    })
    expect(transaction.paymentMethod).toBeUndefined()
    expect(foodPot?.balancePence).toBe(0)

    await updateTransaction(transaction.id, {
      amountPence: 1200,
      date: '2026-05-21',
      note: 'Coffee updated',
      potId: null,
      creditCardId: null,
    })

    snapshot = await getPlannerSnapshot()
    expect(snapshot.transactions[0]).toMatchObject({
      amountPence: 1200,
      date: '2026-05-21',
      note: 'Coffee updated',
      potId: null,
      creditCardId: null,
    })
    expect(snapshot.transactions[0].paymentMethod).toBeUndefined()
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(0)
  })

  it('logs spending against a linked credit card pot as card spend without deducting the pot', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-25T12:00:00.000Z'))

    await db.creditCards.add({
      id: 'card-barclays',
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      openingBalancePence: 68005,
      openingStatementBalancePence: 68005,
      statementDate: '2026-05-14',
      dueDay: 1,
      dueDate: null,
      color: '#2563eb',
      archived: false,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    })
    await db.pots.add({
      id: 'pot-barclays',
      name: 'Barclays',
      type: 'reserved',
      balancePence: 77505,
      targetPence: null,
      color: '#2563eb',
      linkedCreditCardId: 'card-barclays',
      linkedDebtId: null,
      archived: false,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    })

    await addTransaction({
      amountPence: 2000,
      type: 'spending',
      date: '2026-05-25',
      note: 'Fuel top-up',
      paymentMethod: 'pot',
      potId: 'pot-barclays',
      creditCardId: null,
    })

    const snapshot = await getPlannerSnapshot()

    expect(snapshot.transactions[0]).toMatchObject({
      amountPence: 2000,
      creditCardId: 'card-barclays',
      note: 'Fuel top-up',
      paymentMethod: 'credit_card',
      potId: null,
    })
    expect(snapshot.pots.find((pot) => pot.id === 'pot-barclays')?.balancePence).toBe(77505)
  })

  it('stores, updates, applies, and deletes credit card pots', async () => {
    await createPaycheckPlan({
      payday: '2026-05-22',
      payFrequency: 'biweekly',
      hoursWorked: 80,
      hourlyRatePence: 1000,
      actualAmountPence: null,
      allocations: [],
    })
    await addCreditCard({
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      dueDay: 12,
      dueDate: null,
      color: '#2563eb',
    })

    let snapshot = await getPlannerSnapshot()
    const card = snapshot.creditCards[0]
    const period = snapshot.payPeriods[0]

    await addCreditCardPot({
      creditCardId: card.id,
      payPeriodId: period.id,
      payday: period.payday,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      name: 'Barclays payoff',
      amountPence: 20000,
      source: 'paycheck',
      note: 'From wages',
    })

    snapshot = await getPlannerSnapshot()
    expect(snapshot.creditCardPots[0]).toMatchObject({
      creditCardId: card.id,
      payPeriodId: period.id,
      amountPence: 20000,
      source: 'paycheck',
      status: 'active',
    })

    await updateCreditCardPot(snapshot.creditCardPots[0].id, {
      creditCardId: card.id,
      payPeriodId: null,
      payday: null,
      periodStartDate: null,
      periodEndDate: null,
      name: 'External Barclays payoff',
      amountPence: 15000,
      source: 'external',
      note: 'Sold item',
    })

    snapshot = await getPlannerSnapshot()
    expect(snapshot.creditCardPots[0]).toMatchObject({
      payPeriodId: null,
      amountPence: 15000,
      source: 'external',
    })

    await applyCreditCardPot(snapshot.creditCardPots[0].id, {
      date: '2026-05-23',
      note: 'Paid card',
    })

    snapshot = await getPlannerSnapshot()
    expect(snapshot.creditCardPots[0]).toMatchObject({ status: 'applied' })
    expect(snapshot.creditCardRepayments[0]).toMatchObject({
      creditCardId: card.id,
      amountPence: 15000,
      date: '2026-05-23',
      note: 'Paid card',
    })

    await addCreditCardPot({
      creditCardId: card.id,
      payPeriodId: period.id,
      payday: period.payday,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      name: 'Delete me',
      amountPence: 5000,
      source: 'paycheck',
      note: '',
    })

    snapshot = await getPlannerSnapshot()
    const deletablePot = snapshot.creditCardPots.find((creditCardPot) => creditCardPot.name === 'Delete me')
    expect(deletablePot).toBeDefined()

    await deleteCreditCardPot(deletablePot?.id ?? '')
    snapshot = await getPlannerSnapshot()
    expect(snapshot.creditCardPots.some((creditCardPot) => creditCardPot.name === 'Delete me')).toBe(false)
  })

  it('pays an existing statement from its linked pot on the direct debit date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-11T12:00:00.000Z'))
    await db.pots.clear()
    await db.creditCards.clear()
    await db.transactions.clear()
    await db.creditCardRepayments.clear()

    await db.pots.add({
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
    })
    await db.creditCards.add({
      id: 'card-barclays',
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      openingBalancePence: 68005,
      openingStatementBalancePence: 68005,
      statementDate: '2026-05-14',
      dueDay: 11,
      dueDate: null,
      color: '#2563eb',
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })

    let snapshot = await getPlannerSnapshot()

    expect(snapshot.creditCardRepayments).toHaveLength(1)
    expect(snapshot.creditCardRepayments[0]).toMatchObject({
      id: 'linked-card-pot-repayment-card-barclays-2026-05-14-2026-06-11',
      creditCardId: 'card-barclays',
      amountPence: 68005,
      date: '2026-06-11',
      note: 'Automatic Barclays statement payment from Barclays pot',
    })
    expect(snapshot.pots.find((pot) => pot.id === 'pot-barclays')?.balancePence).toBe(9500)

    snapshot = await getPlannerSnapshot()
    expect(snapshot.creditCardRepayments).toHaveLength(1)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-barclays')?.balancePence).toBe(9500)
  })

  it('pays only the existing issued statement from a linked pot on the direct debit date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))
    await db.pots.clear()
    await db.creditCards.clear()
    await db.transactions.clear()
    await db.creditCardRepayments.clear()

    await db.pots.add({
      id: 'pot-barclays',
      name: 'Barclays',
      type: 'reserved',
      balancePence: 77505,
      targetPence: null,
      color: '#2563eb',
      linkedCreditCardId: 'card-barclays',
      linkedDebtId: null,
      archived: false,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    })
    await db.creditCards.add({
      id: 'card-barclays',
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      openingBalancePence: 68005,
      openingStatementBalancePence: 60000,
      statementDate: '2026-05-14',
      dueDay: 1,
      dueDate: null,
      color: '#2563eb',
      archived: false,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    })
    await db.transactions.add({
      id: 'txn-after-statement',
      potId: null,
      payPeriodId: null,
      amountPence: 8005,
      type: 'spending',
      paymentMethod: 'credit_card',
      creditCardId: 'card-barclays',
      recurringPaymentId: null,
      date: '2026-05-20',
      note: 'New statement spend',
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    })

    let snapshot = await getPlannerSnapshot()

    expect(snapshot.creditCardRepayments).toHaveLength(1)
    expect(snapshot.creditCardRepayments[0]).toMatchObject({
      id: 'linked-card-pot-repayment-card-barclays-2026-05-14-2026-06-01',
      creditCardId: 'card-barclays',
      amountPence: 60000,
      date: '2026-06-01',
      note: 'Automatic Barclays statement payment from Barclays pot',
    })
    expect(snapshot.pots.find((pot) => pot.id === 'pot-barclays')?.balancePence).toBe(17505)

    snapshot = await getPlannerSnapshot()
    expect(snapshot.creditCardRepayments).toHaveLength(1)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-barclays')?.balancePence).toBe(17505)
  })

  it('does not auto-deduct a linked credit card pot until a statement date is set', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))
    await db.pots.clear()
    await db.creditCards.clear()
    await db.creditCardRepayments.clear()

    await db.pots.add({
      id: 'pot-barclays',
      name: 'Barclays',
      type: 'reserved',
      balancePence: 77505,
      targetPence: null,
      color: '#2563eb',
      linkedCreditCardId: 'card-barclays',
      linkedDebtId: null,
      archived: false,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    })
    await db.creditCards.add({
      id: 'card-barclays',
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      openingBalancePence: 68005,
      openingStatementBalancePence: 68005,
      statementDate: null,
      dueDay: 1,
      dueDate: null,
      color: '#2563eb',
      archived: false,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    })

    const snapshot = await getPlannerSnapshot()

    expect(snapshot.creditCardRepayments).toHaveLength(0)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-barclays')?.balancePence).toBe(77505)
  })

  it('uses logged card spend instead of planned card spend when sweeping a linked pot', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-11T12:00:00.000Z'))
    await db.pots.clear()
    await db.creditCards.clear()
    await db.recurringPayments.clear()
    await db.transactions.clear()
    await db.creditCardRepayments.clear()

    await db.pots.add({
      id: 'pot-barclays',
      name: 'Barclays',
      type: 'reserved',
      balancePence: 75005,
      targetPence: null,
      color: '#2563eb',
      linkedCreditCardId: 'card-barclays',
      linkedDebtId: null,
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })
    await db.creditCards.add({
      id: 'card-barclays',
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      openingBalancePence: 68005,
      openingStatementBalancePence: 68005,
      statementDate: '2026-05-14',
      dueDay: 11,
      dueDate: null,
      color: '#2563eb',
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })
    await db.recurringPayments.add({
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
    })
    await db.transactions.add({
      id: 'txn-fuel',
      potId: null,
      payPeriodId: null,
      amountPence: 6700,
      type: 'spending',
      paymentMethod: 'credit_card',
      creditCardId: 'card-barclays',
      recurringPaymentId: null,
      date: '2026-05-29',
      note: 'Fuel',
      createdAt: '2026-05-29T00:00:00.000Z',
      updatedAt: '2026-05-29T00:00:00.000Z',
    })

    const snapshot = await getPlannerSnapshot()

    expect(snapshot.creditCardRepayments).toHaveLength(2)
    expect(snapshot.creditCardRepayments.find((repayment) => repayment.date === '2026-07-11')).toMatchObject({
      creditCardId: 'card-barclays',
      amountPence: 6700,
      date: '2026-07-11',
    })
    expect(snapshot.pots.find((pot) => pot.id === 'pot-barclays')?.balancePence).toBe(300)
  })

  it('uses a manual app date when applying linked credit card pot repayments', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-10T12:00:00.000Z'))
    await db.pots.clear()
    await db.creditCards.clear()
    await db.transactions.clear()
    await db.creditCardRepayments.clear()

    await db.creditCards.add({
      id: 'card-barclays',
      name: 'Barclays',
      provider: 'Barclays',
      limitPence: 80000,
      openingBalancePence: 68005,
      openingStatementBalancePence: 68005,
      statementDate: '2026-05-14',
      dueDay: 11,
      dueDate: null,
      color: '#2563eb',
      archived: false,
      designId: null,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })
    await db.pots.add({
      id: 'pot-barclays',
      name: 'Barclays',
      type: 'reserved',
      category: 'Cards',
      balancePence: 77505,
      targetPence: null,
      color: '#2563eb',
      linkedCreditCardId: 'card-barclays',
      linkedDebtId: null,
      icon: 'card',
      archived: false,
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    })
    await updateSettings({
      appDateMode: 'manual',
      manualTodayIso: '2026-06-11',
    })

    const snapshot = await getPlannerSnapshot()
    const repayment = snapshot.creditCardRepayments.find((candidate) => candidate.creditCardId === 'card-barclays')
    const barclaysPot = snapshot.pots.find((pot) => pot.name === 'Barclays')

    expect(repayment).toMatchObject({
      amountPence: 68005,
      date: '2026-06-11',
      note: 'Automatic Barclays statement payment from Barclays pot',
    })
    expect(barclaysPot?.balancePence).toBe(9500)
  })

  it('automatically pays a due debt from its linked pot on the debt due date', async () => {
    await addDebt({
      name: 'Personal loan',
      lender: 'Loan Provider',
      currentBalancePence: 50000,
      minimumPaymentPence: 0,
      dueDate: '2026-06-10',
      interestRateApr: null,
      note: '',
    })

    let snapshot = await getPlannerSnapshot()
    const debt = snapshot.debts.find((candidate) => candidate.name === 'Personal loan')

    expect(debt).toBeDefined()

    await updatePot('pot-food', {
      name: 'Loan pot',
      type: 'reserved',
      balancePence: 50000,
      targetPence: null,
      color: '#2563eb',
      linkedDebtId: debt!.id,
    })
    await updateSettings({
      appDateMode: 'manual',
      manualTodayIso: '2026-06-01',
    })

    snapshot = await getPlannerSnapshot()

    expect(snapshot.debtPayments).toHaveLength(0)
    expect(snapshot.debts.find((candidate) => candidate.id === debt!.id)?.currentBalancePence).toBe(50000)
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(50000)

    await updateSettings({
      appDateMode: 'manual',
      manualTodayIso: '2026-06-10',
    })

    snapshot = await getPlannerSnapshot()

    expect(snapshot.debtPayments).toEqual([
      expect.objectContaining({
        debtId: debt!.id,
        amountPence: 50000,
        date: '2026-06-10',
        note: 'Automatic Personal loan payment from Loan pot',
      }),
    ])
    expect(snapshot.debts.find((candidate) => candidate.id === debt!.id)).toMatchObject({
      currentBalancePence: 0,
      status: 'paid',
    })
    expect(snapshot.pots.find((pot) => pot.id === 'pot-food')?.balancePence).toBe(0)

    snapshot = await getPlannerSnapshot()
    expect(snapshot.debtPayments.filter((payment) => payment.debtId === debt!.id)).toHaveLength(1)
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
