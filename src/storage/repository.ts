import { defaultPots, defaultSettings } from '../data/defaults'
import {
  calculatePaycheckAmount,
  createNextPayPeriod,
  findPayPeriodForDate,
  getPotBalanceAfterTransactionRemoval,
  getRecurringPaymentsDue,
  getUncoveredRecurringPence,
} from '../domain/money'
import type {
  CreditCard,
  CreditCardRepayment,
  CustomPayment,
  DailyBrief,
  Debt,
  DebtPayment,
  DebtReserve,
  DebtReserveSource,
  DebtStatus,
  PayPeriod,
  Paycheck,
  Pot,
  PotAllocation,
  PotType,
  RecurringPayment,
  RecurringFrequency,
  RecurringPriority,
  Settings,
  Transaction,
  TransactionType,
} from '../types/models'
import { db } from './db'

export interface PlannerSnapshot {
  settings: Settings
  pots: Pot[]
  recurringPayments: RecurringPayment[]
  payPeriods: PayPeriod[]
  paychecks: Paycheck[]
  potAllocations: PotAllocation[]
  transactions: Transaction[]
  debts: Debt[]
  debtPayments: DebtPayment[]
  debtReserves: DebtReserve[]
  creditCards: CreditCard[]
  customPayments: CustomPayment[]
  creditCardRepayments: CreditCardRepayment[]
  dailyBriefs: DailyBrief[]
}

export interface PaycheckPlanInput {
  payday: string
  payFrequency?: Settings['payFrequency']
  hoursWorked: number
  hourlyRatePence: number
  actualAmountPence: number | null
  allocations: Array<{ potId: string; amountPence: number }>
}

export interface PotInput {
  name: string
  type: PotType
  balancePence: number
  color: string
}

export type PotUpdateInput = PotInput

export interface RecurringPaymentInput {
  name: string
  amountPence: number
  dueDay: number
  frequency: RecurringFrequency
  potId: string
  creditCardId?: string | null
  priority: RecurringPriority
}

export type RecurringPaymentUpdateInput = RecurringPaymentInput

export interface TransactionInput {
  potId?: string | null
  payPeriodId?: string | null
  amountPence: number
  type: TransactionType
  paymentMethod?: Transaction['paymentMethod']
  creditCardId?: string | null
  date: string
  note: string
}

export interface TransactionUpdateInput {
  potId?: string | null
  amountPence: number
  paymentMethod?: Transaction['paymentMethod']
  creditCardId?: string | null
  date: string
  note: string
}

export interface CreditCardInput {
  name: string
  provider: string
  limitPence: number
  dueDay?: number | null
  dueDate?: string | null
  color: string
}

export type CreditCardUpdateInput = CreditCardInput

export interface CustomPaymentInput {
  name: string
  amountPence: number
  dueDate: string
  creditCardId?: string | null
}

export type CustomPaymentUpdateInput = CustomPaymentInput & {
  status: CustomPayment['status']
}

export interface CreditCardRepaymentInput {
  creditCardId: string
  amountPence: number
  date: string
  note: string
}

export type CreditCardRepaymentUpdateInput = CreditCardRepaymentInput

export interface DailyBriefInput {
  date: string
  snapshotSignature: string
  content: string
}

export interface DebtInput {
  name: string
  lender: string
  currentBalancePence: number
  minimumPaymentPence: number
  dueDate: string
  interestRateApr: number | null
  note: string
}

export type DebtUpdateInput = DebtInput & {
  status: DebtStatus
}

export interface DebtPaymentInput {
  debtId: string
  amountPence: number
  date: string
  note: string
}

export interface DebtReserveInput {
  debtId: string
  payPeriodId: string | null
  payday: string
  periodStartDate: string
  periodEndDate: string
  amountPence: number
  source: DebtReserveSource
  note: string
}

export interface DebtReserveUpdateInput {
  amountPence: number
  note: string
}

export interface DebtReserveSkipInput {
  debtId: string
  payPeriodId: string | null
  payday: string
  periodStartDate: string
  periodEndDate: string
  source: DebtReserveSource
  note: string
}

export interface DebtReserveApplyInput {
  date: string
  note: string
}

export async function getPlannerSnapshot(): Promise<PlannerSnapshot> {
  await ensureSeedData()
  await repairDuplicateRecurringAllocations()

  const [
    settings,
    pots,
    recurringPayments,
    payPeriods,
    paychecks,
    potAllocations,
    transactions,
    debts,
    debtPayments,
    debtReserves,
    creditCards,
    customPayments,
    creditCardRepayments,
    dailyBriefs,
  ] =
    await Promise.all([
      db.settings.get('default'),
      db.pots.toArray(),
      db.recurringPayments.toArray(),
      db.payPeriods.orderBy('payday').reverse().toArray(),
      db.paychecks.toArray(),
      db.potAllocations.toArray(),
      db.transactions.orderBy('date').reverse().toArray(),
      db.debts.orderBy('dueDate').toArray(),
      db.debtPayments.orderBy('date').reverse().toArray(),
      db.debtReserves.orderBy('payday').toArray(),
      db.creditCards.toArray(),
      db.customPayments.orderBy('dueDate').toArray(),
      db.creditCardRepayments.orderBy('date').reverse().toArray(),
      db.dailyBriefs.orderBy('date').reverse().toArray(),
    ])

  return {
    settings: normalizeSettings(settings),
    pots: pots.sort((a, b) => a.name.localeCompare(b.name)),
    recurringPayments: recurringPayments.sort((a, b) => a.name.localeCompare(b.name)),
    payPeriods,
    paychecks,
    potAllocations,
    transactions,
    debts,
    debtPayments,
    debtReserves,
    creditCards: creditCards.sort((a, b) => a.name.localeCompare(b.name)),
    customPayments,
    creditCardRepayments,
    dailyBriefs,
  }
}

export async function updateSettings(
  updates: Partial<Pick<Settings, 'defaultHoursWorked' | 'hourlyRatePence' | 'payFrequency' | 'aiInstructions' | 'aiProvider'>>,
): Promise<void> {
  const current = normalizeSettings(await db.settings.get('default'))
  await db.settings.put({
    ...current,
    ...updates,
    updatedAt: nowIso(),
  })
}

export async function addPot(input: PotInput): Promise<void> {
  const timestamp = nowIso()

  await db.pots.add({
    id: crypto.randomUUID(),
    name: input.name,
    type: input.type,
    balancePence: input.balancePence,
    targetPence: null,
    color: input.color,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export async function updatePot(potId: string, input: PotUpdateInput): Promise<void> {
  await db.pots.update(potId, {
    name: input.name.trim(),
    type: input.type,
    balancePence: input.balancePence,
    color: input.color,
    updatedAt: nowIso(),
  })
}

export async function deletePot(potId: string): Promise<void> {
  const timestamp = nowIso()

  await db.transaction(
    'rw',
    [db.pots, db.recurringPayments, db.potAllocations, db.transactions],
    async () => {
      const [recurringCount, allocationCount, transactionCount] = await Promise.all([
        db.recurringPayments.where('potId').equals(potId).count(),
        db.potAllocations.where('potId').equals(potId).count(),
        db.transactions.where('potId').equals(potId).count(),
      ])

      if (recurringCount + allocationCount + transactionCount > 0) {
        await db.pots.update(potId, {
          archived: true,
          updatedAt: timestamp,
        })
        return
      }

      await db.pots.delete(potId)
    },
  )
}

export async function archivePot(potId: string): Promise<void> {
  await deletePot(potId)
}

export async function addCreditCard(input: CreditCardInput): Promise<void> {
  const timestamp = nowIso()

  await db.creditCards.add({
    id: crypto.randomUUID(),
    name: input.name.trim(),
    provider: input.provider.trim(),
    limitPence: Math.max(0, input.limitPence),
    dueDay: input.dueDay ?? null,
    dueDate: input.dueDate ?? null,
    color: input.color,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export async function updateCreditCard(cardId: string, input: CreditCardUpdateInput): Promise<void> {
  await db.creditCards.update(cardId, {
    name: input.name.trim(),
    provider: input.provider.trim(),
    limitPence: Math.max(0, input.limitPence),
    dueDay: input.dueDay ?? null,
    dueDate: input.dueDate ?? null,
    color: input.color,
    updatedAt: nowIso(),
  })
}

export async function archiveCreditCard(cardId: string): Promise<void> {
  await db.creditCards.update(cardId, {
    archived: true,
    updatedAt: nowIso(),
  })
}

export async function addCustomPayment(input: CustomPaymentInput): Promise<void> {
  const timestamp = nowIso()

  await db.customPayments.add({
    id: crypto.randomUUID(),
    name: input.name.trim(),
    amountPence: Math.max(0, input.amountPence),
    dueDate: input.dueDate,
    creditCardId: input.creditCardId ?? null,
    status: 'unpaid',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export async function updateCustomPayment(
  paymentId: string,
  input: CustomPaymentUpdateInput,
): Promise<void> {
  await db.customPayments.update(paymentId, {
    name: input.name.trim(),
    amountPence: Math.max(0, input.amountPence),
    dueDate: input.dueDate,
    creditCardId: input.creditCardId ?? null,
    status: input.status,
    updatedAt: nowIso(),
  })
}

export async function deleteCustomPayment(paymentId: string): Promise<void> {
  await db.customPayments.update(paymentId, {
    status: 'archived',
    updatedAt: nowIso(),
  })
}

export async function addCreditCardRepayment(input: CreditCardRepaymentInput): Promise<void> {
  const timestamp = nowIso()
  const amountPence = Math.abs(input.amountPence)

  if (!input.creditCardId || amountPence <= 0) {
    return
  }

  await db.creditCardRepayments.add({
    id: crypto.randomUUID(),
    creditCardId: input.creditCardId,
    amountPence,
    date: input.date,
    note: input.note.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export async function updateCreditCardRepayment(
  repaymentId: string,
  input: CreditCardRepaymentUpdateInput,
): Promise<void> {
  const amountPence = Math.abs(input.amountPence)

  if (!input.creditCardId || amountPence <= 0) {
    return
  }

  await db.creditCardRepayments.update(repaymentId, {
    creditCardId: input.creditCardId,
    amountPence,
    date: input.date,
    note: input.note.trim(),
    updatedAt: nowIso(),
  })
}

export async function deleteCreditCardRepayment(repaymentId: string): Promise<void> {
  await db.creditCardRepayments.delete(repaymentId)
}

export async function addDailyBrief(input: DailyBriefInput): Promise<void> {
  const timestamp = nowIso()
  const existing = await db.dailyBriefs.where('date').equals(input.date).first()

  await db.dailyBriefs.put({
    id: existing?.id ?? crypto.randomUUID(),
    date: input.date,
    snapshotSignature: input.snapshotSignature,
    content: input.content,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  })
}

export async function addRecurringPayment(input: RecurringPaymentInput): Promise<void> {
  const timestamp = nowIso()
  const payment: RecurringPayment = {
    id: crypto.randomUUID(),
    name: input.name,
    amountPence: input.amountPence,
    dueDay: input.dueDay,
    frequency: input.frequency,
    potId: input.potId,
    creditCardId: input.creditCardId ?? null,
    priority: input.priority,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await db.transaction('rw', [db.recurringPayments, db.payPeriods, db.potAllocations, db.pots], async () => {
    await db.recurringPayments.add(payment)
    await reserveNewRecurringPaymentForActivePeriod(payment, timestamp)
  })
}

export async function updateRecurringPayment(
  paymentId: string,
  input: RecurringPaymentUpdateInput,
): Promise<void> {
  const timestamp = nowIso()

  await db.transaction('rw', [db.recurringPayments, db.payPeriods, db.potAllocations, db.pots], async () => {
    const current = await db.recurringPayments.get(paymentId)

    if (!current) {
      return
    }

    const nextPayment: RecurringPayment = {
      ...current,
      ...input,
      updatedAt: timestamp,
    }

    await db.recurringPayments.put(nextPayment)
    await reconcileRecurringPaymentForActivePeriod(nextPayment, timestamp)
  })
}

export async function toggleRecurringPayment(payment: RecurringPayment): Promise<void> {
  await db.recurringPayments.update(payment.id, {
    active: !payment.active,
    updatedAt: nowIso(),
  })
}

export async function deleteRecurringPayment(paymentId: string): Promise<void> {
  await db.transaction('rw', [db.recurringPayments, db.potAllocations, db.pots], async () => {
    const allocations = (await db.potAllocations.toArray()).filter(
      (allocation) => allocation.recurringPaymentId === paymentId,
    )

    for (const allocation of allocations) {
      await db.potAllocations.delete(allocation.id)

      const pot = await db.pots.get(allocation.potId)

      if (pot) {
        await db.pots.update(pot.id, {
          balancePence: pot.balancePence - allocation.amountPence,
          updatedAt: nowIso(),
        })
      }
    }

    await db.recurringPayments.delete(paymentId)
  })
}

export async function addTransaction(input: TransactionInput): Promise<void> {
  const timestamp = nowIso()
  const amountPence = Math.abs(input.amountPence)
  const paymentMethod = input.paymentMethod ?? 'pot'

  await db.transaction('rw', db.transactions, db.pots, db.payPeriods, async () => {
    const periodId = input.payPeriodId ?? (await findStoredPayPeriodIdForDate(input.date))
    const potId = paymentMethod === 'credit_card' ? null : input.potId ?? null

    if (paymentMethod === 'pot' && !potId) {
      return
    }

    await db.transactions.add({
      id: crypto.randomUUID(),
      potId,
      payPeriodId: periodId,
      amountPence,
      type: input.type,
      paymentMethod,
      creditCardId: paymentMethod === 'credit_card' ? input.creditCardId ?? null : null,
      date: input.date,
      note: input.note,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const pot = potId ? await db.pots.get(potId) : null

    if (pot && paymentMethod !== 'credit_card') {
      const delta = input.type === 'spending' ? -amountPence : amountPence
      await db.pots.update(pot.id, {
        balancePence: pot.balancePence + delta,
        updatedAt: timestamp,
      })
    }
  })
}

export async function updateTransaction(
  transactionId: string,
  input: TransactionUpdateInput,
): Promise<void> {
  const timestamp = nowIso()
  const amountPence = Math.abs(input.amountPence)
  const paymentMethod = input.paymentMethod ?? 'pot'

  await db.transaction('rw', db.transactions, db.pots, db.payPeriods, async () => {
    const current = await db.transactions.get(transactionId)

    if (!current) {
      return
    }

    const nextPotId = paymentMethod === 'credit_card' ? null : input.potId ?? null

    if (paymentMethod === 'pot' && !nextPotId) {
      return
    }

    const oldPot = current.potId ? await db.pots.get(current.potId) : null
    let samePotAfterRemovalBalance: number | null = null

    if (oldPot && (current.paymentMethod ?? 'pot') !== 'credit_card') {
      samePotAfterRemovalBalance = getPotBalanceAfterTransactionRemoval(oldPot, current)
      await db.pots.update(oldPot.id, {
        balancePence: samePotAfterRemovalBalance,
        updatedAt: timestamp,
      })
    }

    const nextPot =
      nextPotId === current.potId && oldPot && samePotAfterRemovalBalance !== null
        ? { ...oldPot, balancePence: samePotAfterRemovalBalance }
        : nextPotId
          ? await db.pots.get(nextPotId)
          : null

    if (nextPot) {
      if (paymentMethod !== 'credit_card') {
        const delta = current.type === 'spending' ? -amountPence : amountPence
        await db.pots.update(nextPot.id, {
          balancePence: nextPot.balancePence + delta,
          updatedAt: timestamp,
        })
      }
    }

    await db.transactions.update(current.id, {
      potId: nextPotId,
      payPeriodId: await findStoredPayPeriodIdForDate(input.date),
      amountPence,
      paymentMethod,
      creditCardId: paymentMethod === 'credit_card' ? input.creditCardId ?? null : null,
      date: input.date,
      note: input.note,
      updatedAt: timestamp,
    })
  })
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.pots, async () => {
    const transaction = await db.transactions.get(transactionId)

    if (!transaction) {
      return
    }

    await db.transactions.delete(transaction.id)

    const pot = transaction.potId ? await db.pots.get(transaction.potId) : null

    if (pot && (transaction.paymentMethod ?? 'pot') !== 'credit_card') {
      await db.pots.update(pot.id, {
        balancePence: getPotBalanceAfterTransactionRemoval(pot, transaction),
        updatedAt: nowIso(),
      })
    }
  })
}

export async function addDebt(input: DebtInput): Promise<void> {
  const timestamp = nowIso()
  const currentBalancePence = Math.max(0, input.currentBalancePence)

  await db.debts.add({
    id: crypto.randomUUID(),
    name: input.name.trim(),
    lender: input.lender.trim(),
    originalAmountPence: currentBalancePence,
    currentBalancePence,
    minimumPaymentPence: Math.max(0, input.minimumPaymentPence),
    dueDate: input.dueDate,
    interestRateApr: input.interestRateApr,
    note: input.note.trim(),
    status: currentBalancePence > 0 ? 'active' : 'paid',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export async function updateDebt(debtId: string, input: DebtUpdateInput): Promise<void> {
  const current = await db.debts.get(debtId)

  if (!current) {
    return
  }

  const currentBalancePence = Math.max(0, input.currentBalancePence)
  const status = currentBalancePence <= 0 ? 'paid' : input.status

  await db.debts.update(debtId, {
    name: input.name.trim(),
    lender: input.lender.trim(),
    originalAmountPence: Math.max(current.originalAmountPence, currentBalancePence),
    currentBalancePence,
    minimumPaymentPence: Math.max(0, input.minimumPaymentPence),
    dueDate: input.dueDate,
    interestRateApr: input.interestRateApr,
    note: input.note.trim(),
    status,
    updatedAt: nowIso(),
  })
}

export async function deleteDebt(debtId: string): Promise<void> {
  await db.transaction('rw', db.debts, db.debtPayments, db.debtReserves, async () => {
    await db.debtPayments.where('debtId').equals(debtId).delete()
    await db.debtReserves.where('debtId').equals(debtId).delete()
    await db.debts.delete(debtId)
  })
}

export async function addDebtPayment(input: DebtPaymentInput): Promise<void> {
  const timestamp = nowIso()
  const amountPence = Math.abs(input.amountPence)

  if (amountPence <= 0) {
    return
  }

  await db.transaction('rw', db.debts, db.debtPayments, async () => {
    const debt = await db.debts.get(input.debtId)

    if (!debt || debt.currentBalancePence <= 0) {
      return
    }

    const appliedAmountPence = Math.min(amountPence, debt.currentBalancePence)
    const nextBalancePence = debt.currentBalancePence - appliedAmountPence

    await db.debtPayments.add({
      id: crypto.randomUUID(),
      debtId: input.debtId,
      amountPence: appliedAmountPence,
      date: input.date,
      note: input.note.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await db.debts.update(debt.id, {
      currentBalancePence: nextBalancePence,
      status: nextBalancePence > 0 ? 'active' : 'paid',
      updatedAt: timestamp,
    })
  })
}

export async function deleteDebtPayment(paymentId: string): Promise<void> {
  await db.transaction('rw', db.debts, db.debtPayments, async () => {
    const payment = await db.debtPayments.get(paymentId)

    if (!payment) {
      return
    }

    await db.debtPayments.delete(payment.id)

    const debt = await db.debts.get(payment.debtId)

    if (!debt) {
      return
    }

    const restoredBalancePence = Math.min(
      debt.originalAmountPence,
      debt.currentBalancePence + payment.amountPence,
    )

    await db.debts.update(debt.id, {
      currentBalancePence: restoredBalancePence,
      status: restoredBalancePence > 0 ? 'active' : 'paid',
      updatedAt: nowIso(),
    })
  })
}

export async function addDebtReserve(input: DebtReserveInput): Promise<void> {
  const timestamp = nowIso()
  const amountPence = Math.max(0, input.amountPence)

  if (!input.debtId || amountPence <= 0) {
    return
  }

  await db.debtReserves.add({
    id: crypto.randomUUID(),
    debtId: input.debtId,
    payPeriodId: input.payPeriodId,
    payday: input.payday,
    periodStartDate: input.periodStartDate,
    periodEndDate: input.periodEndDate,
    amountPence,
    status: 'planned',
    source: input.source,
    note: input.note.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export async function updateDebtReserve(
  reserveId: string,
  input: DebtReserveUpdateInput,
): Promise<void> {
  await db.debtReserves.update(reserveId, {
    amountPence: Math.max(0, input.amountPence),
    note: input.note.trim(),
    updatedAt: nowIso(),
  })
}

export async function cancelDebtReserve(reserveId: string): Promise<void> {
  await db.debtReserves.update(reserveId, {
    status: 'cancelled',
    updatedAt: nowIso(),
  })
}

export async function skipDebtReserve(input: DebtReserveSkipInput): Promise<void> {
  const timestamp = nowIso()

  await db.debtReserves.add({
    id: crypto.randomUUID(),
    debtId: input.debtId,
    payPeriodId: input.payPeriodId,
    payday: input.payday,
    periodStartDate: input.periodStartDate,
    periodEndDate: input.periodEndDate,
    amountPence: 0,
    status: 'skipped',
    source: input.source,
    note: input.note.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export async function applyDebtReserve(
  reserveId: string,
  input: DebtReserveApplyInput,
): Promise<void> {
  const timestamp = nowIso()

  await db.transaction('rw', db.debts, db.debtPayments, db.debtReserves, async () => {
    const reserve = await db.debtReserves.get(reserveId)

    if (!reserve || reserve.status !== 'planned' || reserve.amountPence <= 0) {
      return
    }

    const debt = await db.debts.get(reserve.debtId)

    if (!debt || debt.currentBalancePence <= 0) {
      await db.debtReserves.update(reserve.id, {
        status: 'cancelled',
        updatedAt: timestamp,
      })
      return
    }

    const appliedAmountPence = Math.min(reserve.amountPence, debt.currentBalancePence)
    const nextBalancePence = debt.currentBalancePence - appliedAmountPence

    await db.debtPayments.add({
      id: crypto.randomUUID(),
      debtId: debt.id,
      amountPence: appliedAmountPence,
      date: input.date,
      note: input.note.trim() || reserve.note,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await db.debts.update(debt.id, {
      currentBalancePence: nextBalancePence,
      status: nextBalancePence > 0 ? 'active' : 'paid',
      updatedAt: timestamp,
    })

    await db.debtReserves.update(reserve.id, {
      amountPence: appliedAmountPence,
      status: 'applied',
      note: input.note.trim() || reserve.note,
      updatedAt: timestamp,
    })
  })
}

export async function createPaycheckPlan(input: PaycheckPlanInput): Promise<void> {
  const settings = normalizeSettings(await db.settings.get('default'))
  const periodDates = createNextPayPeriod(input.payday, input.payFrequency ?? settings.payFrequency)
  const timestamp = nowIso()
  const calculatedAmountPence = calculatePaycheckAmount({
    hoursWorked: input.hoursWorked,
    hourlyRatePence: input.hourlyRatePence,
  })
  const incomePence = calculatePaycheckAmount({
    hoursWorked: input.hoursWorked,
    hourlyRatePence: input.hourlyRatePence,
    actualAmountPence: input.actualAmountPence,
  })

  await db.transaction(
    'rw',
    [
      db.settings,
      db.payPeriods,
      db.paychecks,
      db.potAllocations,
      db.pots,
      db.recurringPayments,
      db.transactions,
    ],
    async () => {
      const matchingPeriods = await db.payPeriods.where('payday').equals(input.payday).toArray()
      const [existingPeriod, ...duplicatePeriods] = matchingPeriods
      const payPeriodId = existingPeriod?.id ?? crypto.randomUUID()
      const recurringPayments = await db.recurringPayments.toArray()
      const duePayments = getRecurringPaymentsDue(
        recurringPayments,
        periodDates.startDate,
        periodDates.endDate,
      )
      const reservedAllocations = duePayments.map((payment) => ({
        potId: payment.potId,
        amountPence: payment.amountPence,
        source: 'recurring' as const,
        recurringPaymentId: payment.id,
      }))
      const manualAllocations = input.allocations.map((allocation) => ({
        ...allocation,
        source: 'manual' as const,
        recurringPaymentId: null,
      }))
      const allAllocations = [...reservedAllocations, ...manualAllocations].filter(
        (allocation) => allocation.amountPence > 0,
      )

      await db.settings.put({
        ...settings,
        payFrequency: input.payFrequency ?? settings.payFrequency,
        hourlyRatePence: input.hourlyRatePence,
        defaultHoursWorked: input.hoursWorked,
        updatedAt: timestamp,
      })

      for (const duplicatePeriod of duplicatePeriods) {
        await deletePayPeriodRecords(duplicatePeriod.id, timestamp)
      }

      if (existingPeriod) {
        await deletePayPeriodAllocations(existingPeriod.id, timestamp)
        await db.payPeriods.put({
          ...existingPeriod,
          payday: input.payday,
          incomePence,
          status: 'active',
          startDate: periodDates.startDate,
          endDate: periodDates.endDate,
          nextPayday: periodDates.nextPayday,
          payFrequency: input.payFrequency ?? settings.payFrequency,
          updatedAt: timestamp,
        })
      } else {
        await db.payPeriods.add({
          id: payPeriodId,
          payday: input.payday,
          incomePence,
          status: 'active',
          startDate: periodDates.startDate,
          endDate: periodDates.endDate,
          nextPayday: periodDates.nextPayday,
          payFrequency: input.payFrequency ?? settings.payFrequency,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }

      const existingPaychecks = await db.paychecks.where('payPeriodId').equals(payPeriodId).toArray()
      const [existingPaycheck, ...duplicatePaychecks] = existingPaychecks

      for (const duplicatePaycheck of duplicatePaychecks) {
        await db.paychecks.delete(duplicatePaycheck.id)
      }

      if (existingPaycheck) {
        await db.paychecks.put({
          ...existingPaycheck,
          hoursWorked: input.hoursWorked,
          hourlyRatePence: input.hourlyRatePence,
          calculatedAmountPence,
          actualAmountPence: input.actualAmountPence,
          updatedAt: timestamp,
        })
      } else {
        await db.paychecks.add({
          id: crypto.randomUUID(),
          payPeriodId,
          hoursWorked: input.hoursWorked,
          hourlyRatePence: input.hourlyRatePence,
          calculatedAmountPence,
          actualAmountPence: input.actualAmountPence,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }

      for (const allocation of allAllocations) {
        await db.potAllocations.add({
          id: crypto.randomUUID(),
          payPeriodId,
          potId: allocation.potId,
          amountPence: allocation.amountPence,
          source: allocation.source,
          recurringPaymentId: allocation.recurringPaymentId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })

        const pot = await db.pots.get(allocation.potId)

        if (pot) {
          await db.pots.update(pot.id, {
            balancePence: pot.balancePence + allocation.amountPence,
            updatedAt: timestamp,
          })
        }
      }
    },
  )
}

export async function deletePayPeriod(payPeriodId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.payPeriods, db.paychecks, db.potAllocations, db.pots, db.transactions, db.debtReserves],
    async () => {
      await deletePayPeriodRecords(payPeriodId, nowIso())
    },
  )
}

export async function resetPlannerData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.settings,
      db.pots,
      db.recurringPayments,
      db.payPeriods,
      db.paychecks,
      db.potAllocations,
      db.transactions,
      db.debts,
      db.debtPayments,
      db.debtReserves,
      db.creditCards,
      db.customPayments,
      db.creditCardRepayments,
      db.dailyBriefs,
    ],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.pots.clear(),
        db.recurringPayments.clear(),
        db.payPeriods.clear(),
        db.paychecks.clear(),
        db.potAllocations.clear(),
        db.transactions.clear(),
        db.debts.clear(),
        db.debtPayments.clear(),
        db.debtReserves.clear(),
        db.creditCards.clear(),
        db.customPayments.clear(),
        db.creditCardRepayments.clear(),
        db.dailyBriefs.clear(),
      ])
      await seedDefaults()
    },
  )
}

export async function replacePlannerSnapshot(snapshot: PlannerSnapshot): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.settings,
      db.pots,
      db.recurringPayments,
      db.payPeriods,
      db.paychecks,
      db.potAllocations,
      db.transactions,
      db.debts,
      db.debtPayments,
      db.debtReserves,
      db.creditCards,
      db.customPayments,
      db.creditCardRepayments,
      db.dailyBriefs,
    ],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.pots.clear(),
        db.recurringPayments.clear(),
        db.payPeriods.clear(),
        db.paychecks.clear(),
        db.potAllocations.clear(),
        db.transactions.clear(),
        db.debts.clear(),
        db.debtPayments.clear(),
        db.debtReserves.clear(),
        db.creditCards.clear(),
        db.customPayments.clear(),
        db.creditCardRepayments.clear(),
        db.dailyBriefs.clear(),
      ])

      await db.settings.put(normalizeSettings(snapshot.settings))
      await putAll(db.pots, snapshot.pots)
      await putAll(db.recurringPayments, snapshot.recurringPayments)
      await putAll(db.payPeriods, snapshot.payPeriods)
      await putAll(db.paychecks, snapshot.paychecks)
      await putAll(db.potAllocations, snapshot.potAllocations)
      await putAll(db.transactions, snapshot.transactions)
      await putAll(db.debts, snapshot.debts)
      await putAll(db.debtPayments, snapshot.debtPayments)
      await putAll(db.debtReserves, snapshot.debtReserves ?? [])
      await putAll(db.creditCards, snapshot.creditCards)
      await putAll(db.customPayments, snapshot.customPayments)
      await putAll(db.creditCardRepayments, snapshot.creditCardRepayments)
      await putAll(db.dailyBriefs, snapshot.dailyBriefs)
    },
  )
  await repairDuplicateRecurringAllocations()
}

async function ensureSeedData(): Promise<void> {
  const settings = await db.settings.get('default')
  const potCount = await db.pots.count()

  if (!settings && potCount === 0) {
    await seedDefaults()
    return
  }

  if (!settings) {
    await db.settings.put({
      ...defaultSettings,
      updatedAt: nowIso(),
    })
  }
}

async function repairDuplicateRecurringAllocations(): Promise<void> {
  const timestamp = nowIso()

  await db.transaction('rw', [db.potAllocations, db.pots], async () => {
    const allocationGroups = new Map<string, PotAllocation[]>()
    const allocations = await db.potAllocations.toArray()

    for (const allocation of allocations) {
      if (!allocation.recurringPaymentId) {
        continue
      }

      const key = `${allocation.payPeriodId}:${allocation.recurringPaymentId}`
      allocationGroups.set(key, [...(allocationGroups.get(key) ?? []), allocation])
    }

    for (const group of allocationGroups.values()) {
      if (group.length < 2) {
        continue
      }

      const [, ...duplicates] = group.sort(sortNewestAllocationFirst)

      for (const allocation of duplicates) {
        await removeAllocationFromPot(allocation, timestamp)
        await db.potAllocations.delete(allocation.id)
      }
    }
  })
}

async function seedDefaults(): Promise<void> {
  await db.settings.put({
    ...defaultSettings,
    updatedAt: nowIso(),
  })
  await db.pots.bulkPut(
    defaultPots.map((pot) => ({
      ...pot,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })),
  )
}

async function findStoredPayPeriodIdForDate(date: string): Promise<string | null> {
  const payPeriods = await db.payPeriods.toArray()
  return findPayPeriodForDate(payPeriods, date)?.id ?? null
}

function nowIso(): string {
  return new Date().toISOString()
}

function sortNewestAllocationFirst(a: PotAllocation, b: PotAllocation): number {
  const updatedSort = b.updatedAt.localeCompare(a.updatedAt)

  if (updatedSort !== 0) {
    return updatedSort
  }

  const createdSort = b.createdAt.localeCompare(a.createdAt)

  if (createdSort !== 0) {
    return createdSort
  }

  return b.id.localeCompare(a.id)
}

function normalizeSettings(settings?: Settings): Settings {
  return {
    ...defaultSettings,
    ...settings,
    defaultHoursWorked: settings?.defaultHoursWorked ?? defaultSettings.defaultHoursWorked,
    aiInstructions: settings?.aiInstructions ?? defaultSettings.aiInstructions,
    aiProvider: settings?.aiProvider ?? defaultSettings.aiProvider,
  }
}

async function putAll<T extends { id: string }>(
  table: { bulkPut: (items: T[]) => Promise<unknown> },
  items: T[],
): Promise<void> {
  if (items.length > 0) {
    await table.bulkPut(items)
  }
}

async function reserveNewRecurringPaymentForActivePeriod(
  payment: RecurringPayment,
  timestamp: string,
): Promise<void> {
  const latestPeriod = await db.payPeriods.orderBy('payday').last()

  if (!latestPeriod || latestPeriod.status === 'closed') {
    return
  }

  const duePayments = getRecurringPaymentsDue([payment], latestPeriod.startDate, latestPeriod.endDate)

  if (duePayments.length === 0) {
    return
  }

  const existingAllocations = await db.potAllocations
    .where('payPeriodId')
    .equals(latestPeriod.id)
    .toArray()
  const uncoveredPence = getUncoveredRecurringPence(duePayments, existingAllocations)

  if (uncoveredPence <= 0) {
    return
  }

  await db.potAllocations.add({
    id: crypto.randomUUID(),
    payPeriodId: latestPeriod.id,
    potId: payment.potId,
    amountPence: uncoveredPence,
    source: 'recurring',
    recurringPaymentId: payment.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  const pot = await db.pots.get(payment.potId)

  if (pot) {
    await db.pots.update(pot.id, {
      balancePence: pot.balancePence + uncoveredPence,
      updatedAt: timestamp,
    })
  }
}

async function reconcileRecurringPaymentForActivePeriod(
  payment: RecurringPayment,
  timestamp: string,
): Promise<void> {
  const latestPeriod = await db.payPeriods.orderBy('payday').last()

  if (!latestPeriod || latestPeriod.status === 'closed') {
    return
  }

  const activePeriodAllocations = await db.potAllocations
    .where('payPeriodId')
    .equals(latestPeriod.id)
    .toArray()
  const existingAllocations = activePeriodAllocations.filter(
    (allocation) => allocation.recurringPaymentId === payment.id,
  )
  const [existingAllocation, ...duplicateAllocations] = existingAllocations
  const isDue = getRecurringPaymentsDue([payment], latestPeriod.startDate, latestPeriod.endDate).length > 0

  for (const allocation of duplicateAllocations) {
    await removeAllocationFromPot(allocation, timestamp)
    await db.potAllocations.delete(allocation.id)
  }

  if (!isDue) {
    if (existingAllocation) {
      await removeAllocationFromPot(existingAllocation, timestamp)
      await db.potAllocations.delete(existingAllocation.id)
    }

    return
  }

  if (!existingAllocation) {
    await db.potAllocations.add({
      id: crypto.randomUUID(),
      payPeriodId: latestPeriod.id,
      potId: payment.potId,
      amountPence: payment.amountPence,
      source: 'recurring',
      recurringPaymentId: payment.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await addAllocationToPot(payment.potId, payment.amountPence, timestamp)
    return
  }

  if (existingAllocation.potId !== payment.potId) {
    await removeAllocationFromPot(existingAllocation, timestamp)
    await addAllocationToPot(payment.potId, payment.amountPence, timestamp)
  } else {
    await addAllocationToPot(
      existingAllocation.potId,
      payment.amountPence - existingAllocation.amountPence,
      timestamp,
    )
  }

  await db.potAllocations.update(existingAllocation.id, {
    potId: payment.potId,
    amountPence: payment.amountPence,
    source: 'recurring',
    recurringPaymentId: payment.id,
    updatedAt: timestamp,
  })
}

async function deletePayPeriodRecords(payPeriodId: string, timestamp: string): Promise<void> {
  await deletePayPeriodAllocations(payPeriodId, timestamp)

  const paychecks = await db.paychecks.where('payPeriodId').equals(payPeriodId).toArray()

  for (const paycheck of paychecks) {
    await db.paychecks.delete(paycheck.id)
  }

  await db.transactions.where('payPeriodId').equals(payPeriodId).modify({
    payPeriodId: null,
    updatedAt: timestamp,
  })
  await db.debtReserves.where('payPeriodId').equals(payPeriodId).modify({
    payPeriodId: null,
    updatedAt: timestamp,
  })
  await db.payPeriods.delete(payPeriodId)
}

async function deletePayPeriodAllocations(payPeriodId: string, timestamp: string): Promise<void> {
  const allocations = await db.potAllocations.where('payPeriodId').equals(payPeriodId).toArray()

  for (const allocation of allocations) {
    await removeAllocationFromPot(allocation, timestamp)
    await db.potAllocations.delete(allocation.id)
  }
}

async function removeAllocationFromPot(
  allocation: Pick<PotAllocation, 'potId' | 'amountPence'>,
  timestamp: string,
): Promise<void> {
  await addAllocationToPot(allocation.potId, -allocation.amountPence, timestamp)
}

async function addAllocationToPot(
  potId: string,
  amountPence: number,
  timestamp: string,
): Promise<void> {
  const pot = await db.pots.get(potId)

  if (!pot) {
    return
  }

  await db.pots.update(pot.id, {
    balancePence: pot.balancePence + amountPence,
    updatedAt: timestamp,
  })
}
