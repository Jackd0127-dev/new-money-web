import { defaultPots, defaultSettings } from '../data/defaults'
import { normalizeCreditCardDesignId } from '../domain/creditCardDesigns'
import {
  calculatePaycheckAmount,
  createNextPayPeriod,
  findPayPeriodForDate,
  getAppTodayIso,
  getCreditCardAllocationSummary,
  getCreditCardStatementPayments,
  getPayPeriodCostSummary,
  getPotBalanceAfterTransactionRemoval,
  getRecurringPaymentOccurrences,
  getRecurringPaymentsDue,
  toIsoDate,
} from '../domain/money'
import type {
  CreditCard,
  CreditCardPot,
  CreditCardPotSource,
  CreditCardRepayment,
  CustomPayment,
  DailyBrief,
  Debt,
  DebtPayment,
  DebtReserve,
  DebtReserveSource,
  DebtStatus,
  PayFrequency,
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
  creditCardPots: CreditCardPot[]
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

export interface PaycheckPotAllocationInput {
  id: string
  payPeriodId: string
  potId: string
  fundingPotId?: string | null
  amountPence: number
}

export interface PotInput {
  name: string
  type: PotType
  category?: string | null
  icon?: string | null
  balancePence: number
  targetPence: number | null
  color: string
  linkedCreditCardId?: string | null
  linkedDebtId?: string | null
}

export type PotUpdateInput = PotInput

export interface RecurringPaymentInput {
  name: string
  amountPence: number
  dueDay?: number | null
  dueDate?: string | null
  frequency: RecurringFrequency
  potId: string | null
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
  recurringPaymentId?: string | null
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
  openingBalancePence?: number
  openingStatementBalancePence?: number
  statementDate?: string | null
  designId?: string | null
  dueDay?: number | null
  dueDate?: string | null
  color: string
}

export type CreditCardUpdateInput = CreditCardInput

export interface CreditCardPotInput {
  creditCardId: string
  payPeriodId: string | null
  payday: string | null
  periodStartDate: string | null
  periodEndDate: string | null
  name: string
  amountPence: number
  source: CreditCardPotSource
  note: string
}

export type CreditCardPotUpdateInput = CreditCardPotInput

export interface CreditCardPotApplyInput {
  date: string
  note: string
}

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
  const todayIso = getAppTodayIso(normalizeSettings(await db.settings.get('default')))
  await applyDueRecurringPayments(todayIso)
  await applyDueLinkedCreditCardPotRepayments(todayIso)
  await applyDueLinkedDebtPotPayments(todayIso)

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
    creditCardPots,
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
      db.creditCardPots.toArray(),
      db.customPayments.orderBy('dueDate').toArray(),
      db.creditCardRepayments.orderBy('date').reverse().toArray(),
      db.dailyBriefs.orderBy('date').reverse().toArray(),
    ])

  return {
    settings: normalizeSettings(settings),
    pots: pots.map(normalizePot).sort((a, b) => a.name.localeCompare(b.name)),
    recurringPayments: recurringPayments.sort((a, b) => a.name.localeCompare(b.name)),
    payPeriods,
    paychecks,
    potAllocations: potAllocations.map(normalizePotAllocation),
    transactions,
    debts,
    debtPayments,
    debtReserves,
    creditCards: creditCards.map(normalizeCreditCard).sort((a, b) => a.name.localeCompare(b.name)),
    creditCardPots: creditCardPots.sort(sortCreditCardPots),
    customPayments,
    creditCardRepayments,
    dailyBriefs,
  }
}

export async function updateSettings(
  updates: Partial<Pick<Settings, 'defaultHoursWorked' | 'hourlyRatePence' | 'payFrequency' | 'appDateMode' | 'manualTodayIso' | 'aiInstructions' | 'aiProvider'>>,
): Promise<void> {
  const current = normalizeSettings(await db.settings.get('default'))
  const next = normalizeSettings({
    ...current,
    ...updates,
    updatedAt: nowIso(),
  })
  await db.settings.put(next)
}

export async function updatePlannerDataToLatest(): Promise<void> {
  await ensureSeedData()

  const timestamp = nowIso()

  await db.transaction(
    'rw',
    [
      db.settings,
      db.pots,
      db.recurringPayments,
      db.payPeriods,
      db.potAllocations,
      db.transactions,
      db.debts,
      db.debtReserves,
      db.creditCards,
      db.creditCardPots,
      db.customPayments,
      db.creditCardRepayments,
    ],
    async () => {
      await persistNormalizedSettings(timestamp)
      await persistNormalizedPots(timestamp)
      await persistNormalizedCreditCards(timestamp)
      await persistNormalizedRecurringPayments(timestamp)
      await persistNormalizedPayPeriods(timestamp)
      await recalculateOpenPayPeriodAllocations(timestamp)
    },
  )

  await repairDuplicateRecurringAllocations()
  const todayIso = getAppTodayIso(normalizeSettings(await db.settings.get('default')))
  await applyDueRecurringPayments(todayIso)
  await applyDueLinkedCreditCardPotRepayments(todayIso)
  await applyDueLinkedDebtPotPayments(todayIso)
}

export async function addPot(input: PotInput): Promise<void> {
  const timestamp = nowIso()

  await db.pots.add({
    id: crypto.randomUUID(),
    name: input.name,
    type: input.type,
    category: normalizePotCategory(input.category),
    icon: normalizePotIcon(input.icon),
    balancePence: input.balancePence,
    targetPence: input.targetPence === null ? null : Math.max(0, input.targetPence),
    color: input.color,
    linkedCreditCardId: input.linkedCreditCardId ?? null,
    linkedDebtId: input.linkedDebtId ?? null,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export async function updatePot(potId: string, input: PotUpdateInput): Promise<void> {
  await db.pots.update(potId, {
    name: input.name.trim(),
    type: input.type,
    category: normalizePotCategory(input.category),
    icon: normalizePotIcon(input.icon),
    balancePence: input.balancePence,
    targetPence: input.targetPence === null ? null : Math.max(0, input.targetPence),
    color: input.color,
    linkedCreditCardId: input.linkedCreditCardId ?? null,
    linkedDebtId: input.linkedDebtId ?? null,
    updatedAt: nowIso(),
  })
}

export async function deletePot(potId: string): Promise<void> {
  const timestamp = nowIso()

  await db.transaction(
    'rw',
    [db.pots, db.recurringPayments, db.potAllocations, db.transactions],
    async () => {
      const [recurringCount, allocationCount, fundingAllocationCount, transactionCount] = await Promise.all([
        db.recurringPayments.where('potId').equals(potId).count(),
        db.potAllocations.where('potId').equals(potId).count(),
        db.potAllocations.filter((allocation) => allocation.fundingPotId === potId).count(),
        db.transactions.where('potId').equals(potId).count(),
      ])

      if (recurringCount + allocationCount + fundingAllocationCount + transactionCount > 0) {
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
    openingBalancePence: Math.max(0, input.openingBalancePence ?? 0),
    openingStatementBalancePence: Math.max(0, input.openingStatementBalancePence ?? input.openingBalancePence ?? 0),
    statementDate: isIsoDateText(input.statementDate) ? input.statementDate : null,
    designId: normalizeCreditCardDesignId(input.designId),
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
    openingBalancePence: Math.max(0, input.openingBalancePence ?? 0),
    openingStatementBalancePence: Math.max(0, input.openingStatementBalancePence ?? input.openingBalancePence ?? 0),
    statementDate: isIsoDateText(input.statementDate) ? input.statementDate : null,
    designId: normalizeCreditCardDesignId(input.designId),
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

export async function addCreditCardPot(input: CreditCardPotInput): Promise<void> {
  const timestamp = nowIso()
  const amountPence = Math.max(0, input.amountPence)

  if (!input.creditCardId || amountPence <= 0) {
    return
  }

  await db.creditCardPots.add({
    id: crypto.randomUUID(),
    creditCardId: input.creditCardId,
    payPeriodId: input.source === 'paycheck' ? input.payPeriodId : null,
    payday: input.source === 'paycheck' ? input.payday : null,
    periodStartDate: input.source === 'paycheck' ? input.periodStartDate : null,
    periodEndDate: input.source === 'paycheck' ? input.periodEndDate : null,
    name: input.name.trim() || 'Credit pot',
    amountPence,
    source: input.source,
    status: 'active',
    note: input.note.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export async function updateCreditCardPot(
  creditCardPotId: string,
  input: CreditCardPotUpdateInput,
): Promise<void> {
  const amountPence = Math.max(0, input.amountPence)

  if (!input.creditCardId || amountPence <= 0) {
    return
  }

  await db.creditCardPots.update(creditCardPotId, {
    creditCardId: input.creditCardId,
    payPeriodId: input.source === 'paycheck' ? input.payPeriodId : null,
    payday: input.source === 'paycheck' ? input.payday : null,
    periodStartDate: input.source === 'paycheck' ? input.periodStartDate : null,
    periodEndDate: input.source === 'paycheck' ? input.periodEndDate : null,
    name: input.name.trim() || 'Credit pot',
    amountPence,
    source: input.source,
    status: 'active',
    note: input.note.trim(),
    updatedAt: nowIso(),
  })
}

export async function deleteCreditCardPot(creditCardPotId: string): Promise<void> {
  await db.creditCardPots.delete(creditCardPotId)
}

export async function applyCreditCardPot(
  creditCardPotId: string,
  input: CreditCardPotApplyInput,
): Promise<void> {
  const timestamp = nowIso()

  await db.transaction('rw', db.creditCardPots, db.creditCardRepayments, async () => {
    const creditCardPot = await db.creditCardPots.get(creditCardPotId)

    if (!creditCardPot || creditCardPot.status !== 'active' || creditCardPot.amountPence <= 0) {
      return
    }

    await db.creditCardRepayments.add({
      id: crypto.randomUUID(),
      creditCardId: creditCardPot.creditCardId,
      amountPence: creditCardPot.amountPence,
      date: input.date,
      note: input.note.trim() || creditCardPot.note || creditCardPot.name,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await db.creditCardPots.update(creditCardPot.id, {
      status: 'applied',
      updatedAt: timestamp,
    })
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
    dueDay: input.dueDay ?? undefined,
    dueDate: input.dueDate ?? undefined,
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
      dueDay: input.dueDay ?? undefined,
      dueDate: input.dueDate ?? undefined,
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

  await db.transaction('rw', db.transactions, db.pots, db.payPeriods, async () => {
    const periodId = input.payPeriodId ?? (await findStoredPayPeriodIdForDate(input.date))
    const link = await resolveStoredTransactionLink(input)

    await db.transactions.add({
      id: crypto.randomUUID(),
      potId: link.potId,
      payPeriodId: periodId,
      amountPence,
      type: input.type,
      paymentMethod: link.paymentMethod,
      creditCardId: link.creditCardId,
      recurringPaymentId: input.recurringPaymentId ?? null,
      date: input.date,
      note: input.note,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    if (link.pot && link.paymentMethod !== 'credit_card') {
      const delta = input.type === 'spending' ? -amountPence : amountPence
      await db.pots.update(link.pot.id, {
        balancePence: link.pot.balancePence + delta,
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

  await db.transaction('rw', db.transactions, db.pots, db.payPeriods, async () => {
    const current = await db.transactions.get(transactionId)

    if (!current) {
      return
    }

    const link = await resolveStoredTransactionLink(input)
    const nextPotId = link.potId

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
        : link.pot

    if (nextPot) {
      if (link.paymentMethod !== 'credit_card') {
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
      paymentMethod: link.paymentMethod,
      creditCardId: link.creditCardId,
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

function resolveTransactionPaymentMethod(
  paymentMethod: Transaction['paymentMethod'] | undefined,
  potId?: string | null,
  creditCardId?: string | null,
): Transaction['paymentMethod'] | undefined {
  if (paymentMethod === 'credit_card') {
    return creditCardId ? 'credit_card' : undefined
  }

  if (paymentMethod === 'pot') {
    return potId ? 'pot' : undefined
  }

  if (creditCardId) {
    return 'credit_card'
  }

  if (potId) {
    return 'pot'
  }

  return undefined
}

interface StoredTransactionLink {
  paymentMethod: Transaction['paymentMethod'] | undefined
  potId: string | null
  creditCardId: string | null
  pot: Pot | null
}

async function resolveStoredTransactionLink(input: {
  paymentMethod?: Transaction['paymentMethod']
  potId?: string | null
  creditCardId?: string | null
}): Promise<StoredTransactionLink> {
  const paymentMethod = resolveTransactionPaymentMethod(input.paymentMethod, input.potId, input.creditCardId)

  if (paymentMethod === 'credit_card') {
    return {
      paymentMethod: 'credit_card',
      potId: null,
      creditCardId: input.creditCardId ?? null,
      pot: null,
    }
  }

  if (paymentMethod === 'pot' && input.potId) {
    const pot = (await db.pots.get(input.potId)) ?? null

    if (pot?.linkedCreditCardId) {
      return {
        paymentMethod: 'credit_card',
        potId: null,
        creditCardId: pot.linkedCreditCardId,
        pot: null,
      }
    }

    return {
      paymentMethod: 'pot',
      potId: input.potId,
      creditCardId: null,
      pot,
    }
  }

  return {
    paymentMethod: undefined,
    potId: null,
    creditCardId: null,
    pot: null,
  }
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
      const pots = await db.pots.toArray()
      const existingPeriodAllocations = existingPeriod
        ? await db.potAllocations.where('payPeriodId').equals(existingPeriod.id).toArray()
        : []
      const potsBeforePeriodAllocations = removeAllocationsFromPotBalances(pots, existingPeriodAllocations)
      const reservedAllocations = getRecurringReserveAllocations(duePayments, potsBeforePeriodAllocations)
      const automaticPotAllocations = pots
        .filter((pot) => !pot.archived && (pot.targetPence ?? 0) > 0)
        .map((pot) => ({
          potId: pot.id,
          amountPence: pot.targetPence ?? 0,
          source: 'pot_auto' as const,
          recurringPaymentId: null,
        }))
      const manualAllocations = input.allocations.map((allocation) => ({
        ...allocation,
        source: 'manual' as const,
        recurringPaymentId: null,
      }))
      const allAllocations = [...reservedAllocations, ...automaticPotAllocations, ...manualAllocations].filter(
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
          fundingPotId: null,
          amountPence: allocation.amountPence,
          source: allocation.source,
          recurringPaymentId: allocation.recurringPaymentId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })

        await applyPotAllocationToBalances(allocation, timestamp)
      }
    },
  )
}

export async function upsertPaycheckPotAllocation(input: PaycheckPotAllocationInput): Promise<void> {
  const timestamp = nowIso()
  const amountPence = Math.max(0, Math.round(input.amountPence))

  if (!input.id || !input.payPeriodId || !input.potId || amountPence <= 0) {
    return
  }

  await db.transaction('rw', [db.payPeriods, db.potAllocations, db.pots], async () => {
    const [payPeriod, pot, fundingPot, existingAllocation] = await Promise.all([
      db.payPeriods.get(input.payPeriodId),
      db.pots.get(input.potId),
      input.fundingPotId ? db.pots.get(input.fundingPotId) : Promise.resolve(undefined),
      db.potAllocations.get(input.id),
    ])

    if (!payPeriod || !pot || pot.archived) {
      return
    }

    const fundingPotId = isFundingPotEligible(fundingPot, pot.id) ? fundingPot.id : null
    const nextAllocation: PotAllocation = {
      ...(existingAllocation ?? {
        id: input.id,
        createdAt: timestamp,
      }),
      id: input.id,
      payPeriodId: input.payPeriodId,
      potId: input.potId,
      fundingPotId,
      amountPence,
      source: 'manual',
      recurringPaymentId: null,
      updatedAt: timestamp,
    }

    if (!existingAllocation) {
      await db.potAllocations.add(nextAllocation)
      await applyPotAllocationToBalances(nextAllocation, timestamp)
      return
    }

    await removeAllocationFromPot(existingAllocation, timestamp)
    await db.potAllocations.put(nextAllocation)
    await applyPotAllocationToBalances(nextAllocation, timestamp)
  })
}

function isFundingPotEligible(pot: Pot | undefined | null, destinationPotId: string): pot is Pot {
  return Boolean(
    pot &&
    !pot.archived &&
    pot.id !== destinationPotId &&
    (pot.type === 'saving' || pot.type === 'investment'),
  )
}

export async function deletePaycheckPotAllocation(allocationId: string): Promise<void> {
  if (!allocationId) {
    return
  }

  const timestamp = nowIso()

  await db.transaction('rw', [db.potAllocations, db.pots], async () => {
    const allocation = await db.potAllocations.get(allocationId)

    if (!allocation) {
      return
    }

    await removeAllocationFromPot(allocation, timestamp)
    await db.potAllocations.delete(allocation.id)
  })
}

export async function deletePayPeriod(payPeriodId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.payPeriods, db.paychecks, db.potAllocations, db.pots, db.transactions, db.debtReserves, db.creditCardPots],
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
      db.creditCardPots,
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
        db.creditCardPots.clear(),
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
      db.creditCardPots,
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
        db.creditCardPots.clear(),
        db.customPayments.clear(),
        db.creditCardRepayments.clear(),
        db.dailyBriefs.clear(),
      ])

      await db.settings.put(normalizeSettings(snapshot.settings))
      await putAll(db.pots, snapshot.pots.map(normalizePot))
      await putAll(db.recurringPayments, snapshot.recurringPayments)
      await putAll(db.payPeriods, snapshot.payPeriods)
      await putAll(db.paychecks, snapshot.paychecks)
      await putAll(db.potAllocations, snapshot.potAllocations.map(normalizePotAllocation))
      await putAll(db.transactions, snapshot.transactions)
      await putAll(db.debts, snapshot.debts)
      await putAll(db.debtPayments, snapshot.debtPayments)
      await putAll(db.debtReserves, snapshot.debtReserves ?? [])
      await putAll(db.creditCards, snapshot.creditCards)
      await putAll(db.creditCardPots, snapshot.creditCardPots ?? [])
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

async function persistNormalizedSettings(timestamp: string): Promise<void> {
  const settings = normalizeSettings(await db.settings.get('default'))

  await db.settings.put({
    ...settings,
    updatedAt: timestamp,
  })
}

async function persistNormalizedPots(timestamp: string): Promise<void> {
  const pots = await db.pots.toArray()

  for (const pot of pots) {
    const normalizedPot = normalizePot(pot)

    await db.pots.put({
      ...normalizedPot,
      name: normalizedPot.name.trim(),
      targetPence: normalizedPot.targetPence === null ? null : Math.max(0, normalizedPot.targetPence),
      archived: Boolean(normalizedPot.archived),
      updatedAt: timestamp,
    })
  }
}

async function persistNormalizedCreditCards(timestamp: string): Promise<void> {
  const cards = await db.creditCards.toArray()

  for (const card of cards) {
    const normalizedCard = normalizeCreditCard(card)

    await db.creditCards.put({
      ...normalizedCard,
      name: normalizedCard.name.trim(),
      provider: normalizedCard.provider.trim(),
      limitPence: Math.max(0, normalizedCard.limitPence),
      openingStatementBalancePence: Math.max(0, normalizedCard.openingStatementBalancePence ?? normalizedCard.openingBalancePence ?? 0),
      statementDate: isIsoDateText(normalizedCard.statementDate) ? normalizedCard.statementDate : null,
      dueDay: normalizedCard.dueDay ?? null,
      dueDate: normalizedCard.dueDate ?? null,
      archived: Boolean(normalizedCard.archived),
      updatedAt: timestamp,
    })
  }
}

async function persistNormalizedRecurringPayments(timestamp: string): Promise<void> {
  const payments = await db.recurringPayments.toArray()

  for (const payment of payments) {
    await db.recurringPayments.put(normalizeRecurringPaymentForLatestMaths(payment, timestamp))
  }
}

async function persistNormalizedPayPeriods(timestamp: string): Promise<void> {
  const settings = normalizeSettings(await db.settings.get('default'))
  const periods = await db.payPeriods.toArray()

  for (const period of periods) {
    await db.payPeriods.put({
      ...period,
      payFrequency: period.payFrequency ?? inferPayFrequencyFromPayPeriod(period, settings.payFrequency),
      incomePence: Math.max(0, Math.round(period.incomePence)),
      updatedAt: timestamp,
    })
  }
}

function normalizeRecurringPaymentForLatestMaths(payment: RecurringPayment, timestamp: string): RecurringPayment {
  const frequency = payment.frequency
  const nextPayment: RecurringPayment = {
    ...payment,
    name: payment.name.trim(),
    amountPence: Math.max(0, Math.round(payment.amountPence)),
    potId: payment.potId ?? null,
    creditCardId: payment.creditCardId ?? null,
    active: Boolean(payment.active),
    updatedAt: timestamp,
  }

  if (frequency === 'weekly' || frequency === 'biweekly') {
    return {
      ...nextPayment,
      dueDate: isIsoDateText(payment.dueDate) ? payment.dueDate : getLegacyIntervalAnchorIso(payment),
      dueDay: undefined,
    }
  }

  if (frequency === 'monthly' && !payment.dueDay && isIsoDateText(payment.dueDate)) {
    return {
      ...nextPayment,
      dueDay: Number(payment.dueDate.slice(8, 10)),
    }
  }

  return nextPayment
}

async function recalculateOpenPayPeriodAllocations(timestamp: string): Promise<void> {
  const periods = (await db.payPeriods.toArray())
    .filter((period) => period.status !== 'closed')
    .sort((a, b) => a.payday.localeCompare(b.payday))

  for (const period of periods) {
    await recalculatePayPeriodAllocations(period, timestamp)
  }
}

async function recalculatePayPeriodAllocations(period: PayPeriod, timestamp: string): Promise<void> {
  const [
    pots,
    allAllocations,
    recurringPayments,
    creditCards,
    customPayments,
    transactions,
    debts,
    debtReserves,
    creditCardPots,
    creditCardRepayments,
  ] = await Promise.all([
    db.pots.toArray(),
    db.potAllocations.toArray(),
    db.recurringPayments.toArray(),
    db.creditCards.toArray(),
    db.customPayments.toArray(),
    db.transactions.toArray(),
    db.debts.toArray(),
    db.debtReserves.toArray(),
    db.creditCardPots.toArray(),
    db.creditCardRepayments.toArray(),
  ])
  const periodAllocations = allAllocations.filter((allocation) => allocation.payPeriodId === period.id)
  const dashboardPrefix = getDashboardTodoAllocationPrefix(period.id)
  const recalculatedAllocations = periodAllocations.filter(
    (allocation) =>
      allocation.source === 'recurring' ||
      allocation.source === 'pot_auto' ||
      allocation.id.startsWith(dashboardPrefix),
  )

  if (recalculatedAllocations.length === 0) {
    return
  }

  const allocationsToKeep = allAllocations.filter(
    (allocation) => !recalculatedAllocations.some((candidate) => candidate.id === allocation.id),
  )
  const basePots = removeAllocationsFromPotBalances(pots, recalculatedAllocations)
  const recurringReserveAllocations = getRecurringReserveAllocations(
    getRecurringPaymentsDue(recurringPayments, period.startDate, period.endDate),
    basePots,
  )
  const desiredRecurringAllocations = recurringReserveAllocations.map((allocation) =>
    createRecalculatedAllocation({
      id: `recurring-reserve-${period.id}-${allocation.recurringPaymentId}`,
      period,
      allocation,
      source: 'recurring',
      timestamp,
    }),
  )
  const desiredPotAutoAllocations = basePots
    .filter((pot) => !pot.archived && (pot.targetPence ?? 0) > 0)
    .map((pot) =>
      createRecalculatedAllocation({
        id: `pot-auto-${period.id}-${pot.id}`,
        period,
        allocation: {
          potId: pot.id,
          amountPence: pot.targetPence ?? 0,
          recurringPaymentId: null,
        },
        source: 'pot_auto',
        timestamp,
      }),
    )
  const automaticAllocations = [...desiredRecurringAllocations, ...desiredPotAutoAllocations]
  const potsForDashboard = applyAllocationsToPots(basePots, automaticAllocations)
  const allocationsForDashboard = [...allocationsToKeep, ...automaticAllocations]
  const summary = getPayPeriodCostSummary({
    payPeriod: period,
    creditCards,
    recurringPayments,
    customPayments,
    transactions,
    debts,
    creditCardRepayments,
    creditCardPots,
    debtReserves,
    pots: potsForDashboard,
    potAllocations: allocationsForDashboard,
  })
  const desiredDashboardAllocations = recalculatedAllocations
    .filter((allocation) => allocation.id.startsWith(dashboardPrefix))
    .flatMap((allocation) => {
      const costItemId = getCostItemIdFromDashboardTodoAllocationId(allocation.id, period.id)
      const costItem = costItemId ? summary.items.find((item) => item.id === costItemId) : null

      if (!costItem?.potId || costItem.amountPence <= 0) {
        return []
      }

      return [
        createRecalculatedAllocation({
          id: allocation.id,
          period,
          allocation: {
            potId: costItem.potId,
            fundingPotId: allocation.fundingPotId ?? null,
            amountPence: costItem.amountPence,
            recurringPaymentId: null,
          },
          source: 'manual',
          createdAt: allocation.createdAt,
          timestamp,
        }),
      ]
    })

  for (const allocation of recalculatedAllocations) {
    await removeAllocationFromPot(allocation, timestamp)
    await db.potAllocations.delete(allocation.id)
  }

  for (const allocation of [...automaticAllocations, ...desiredDashboardAllocations]) {
    if (allocation.amountPence <= 0) {
      continue
    }

    await db.potAllocations.put(allocation)
    await applyPotAllocationToBalances(allocation, timestamp)
  }
}

function createRecalculatedAllocation({
  id,
  period,
  allocation,
  source,
  createdAt,
  timestamp,
}: {
  id: string
  period: PayPeriod
  allocation: {
    potId: string
    fundingPotId?: string | null
    amountPence: number
    recurringPaymentId?: string | null
  }
  source: PotAllocation['source']
  createdAt?: string
  timestamp: string
}): PotAllocation {
  return {
    id,
    payPeriodId: period.id,
    potId: allocation.potId,
    fundingPotId: allocation.fundingPotId ?? null,
    amountPence: Math.max(0, Math.round(allocation.amountPence)),
    source,
    recurringPaymentId: allocation.recurringPaymentId ?? null,
    createdAt: createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}

function applyAllocationsToPots(
  pots: Pot[],
  allocations: Array<Pick<PotAllocation, 'potId' | 'amountPence' | 'fundingPotId'>>,
): Pot[] {
  const allocationTotalsByPot = new Map<string, number>()

  for (const allocation of allocations) {
    allocationTotalsByPot.set(
      allocation.potId,
      (allocationTotalsByPot.get(allocation.potId) ?? 0) + allocation.amountPence,
    )

    if (allocation.fundingPotId) {
      allocationTotalsByPot.set(
        allocation.fundingPotId,
        (allocationTotalsByPot.get(allocation.fundingPotId) ?? 0) - allocation.amountPence,
      )
    }
  }

  return pots.map((pot) => ({
    ...pot,
    balancePence: pot.balancePence + (allocationTotalsByPot.get(pot.id) ?? 0),
  }))
}

function getDashboardTodoAllocationPrefix(payPeriodId: string): string {
  return `dashboard-todo-${payPeriodId}-`
}

function getCostItemIdFromDashboardTodoAllocationId(allocationId: string, payPeriodId: string): string | null {
  const prefix = getDashboardTodoAllocationPrefix(payPeriodId)

  if (!allocationId.startsWith(prefix)) {
    return null
  }

  return allocationId.slice(prefix.length) || null
}

function inferPayFrequencyFromPayPeriod(period: PayPeriod, fallback: PayFrequency): PayFrequency {
  const daysBetweenPaydays =
    Math.round(
      (new Date(`${period.nextPayday}T00:00:00.000Z`).getTime() -
        new Date(`${period.payday}T00:00:00.000Z`).getTime()) /
        86_400_000,
    ) || 0

  if (daysBetweenPaydays === 7) {
    return 'weekly'
  }

  if (daysBetweenPaydays >= 28) {
    return 'monthly'
  }

  if (daysBetweenPaydays > 0) {
    return 'biweekly'
  }

  return fallback
}

function getLegacyIntervalAnchorIso(payment: RecurringPayment): string {
  const createdDate = payment.createdAt.slice(0, 10)

  if (!payment.dueDay) {
    return isIsoDateText(createdDate) ? createdDate : toIsoDate(new Date())
  }

  const created = isIsoDateText(createdDate) ? new Date(`${createdDate}T00:00:00.000Z`) : new Date()
  const lastDay = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth() + 1, 0)).getUTCDate()
  const dueDay = Math.min(Math.max(1, payment.dueDay), lastDay)

  return toIsoDate(new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), dueDay)))
}

function isIsoDateText(value?: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
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

async function applyDueRecurringPayments(todayIso: string): Promise<void> {
  const timestamp = nowIso()

  await db.transaction('rw', [db.recurringPayments, db.transactions, db.pots, db.payPeriods], async () => {
    const recurringPayments = await db.recurringPayments.toArray()
    const directPayments = recurringPayments.filter(
      (payment): payment is RecurringPayment & { potId: string } =>
        payment.active && !payment.creditCardId && Boolean(payment.potId),
    )

    for (const payment of directPayments) {
      const startDate = getRecurringApplicationStartDate(payment, todayIso)
      const occurrences = getRecurringPaymentOccurrences([payment], startDate, todayIso)

      for (const occurrence of occurrences) {
        const transactionId = getRecurringTransactionId(payment.id, occurrence.dueDate)
        const existingTransaction = await db.transactions.get(transactionId)

        if (existingTransaction) {
          continue
        }

        const pot = await db.pots.get(payment.potId)

        if (!pot || pot.archived || occurrence.amountPence <= 0) {
          continue
        }

        const periodId = await findStoredPayPeriodIdForDate(occurrence.dueDate)

        await db.transactions.add({
          id: transactionId,
          potId: payment.potId,
          payPeriodId: periodId,
          amountPence: occurrence.amountPence,
          type: 'spending',
          paymentMethod: 'pot',
          creditCardId: null,
          recurringPaymentId: payment.id,
          date: occurrence.dueDate,
          note: payment.name,
          createdAt: timestamp,
          updatedAt: timestamp,
        })

        await db.pots.update(pot.id, {
          balancePence: pot.balancePence - occurrence.amountPence,
          updatedAt: timestamp,
        })
      }
    }
  })
}

async function applyDueLinkedCreditCardPotRepayments(todayIso: string): Promise<void> {
  const timestamp = nowIso()

  await db.transaction('rw', [db.creditCards, db.pots, db.transactions, db.creditCardRepayments], async () => {
    const [creditCards, pots, transactions, creditCardRepayments] = await Promise.all([
      db.creditCards.toArray(),
      db.pots.toArray(),
      db.transactions.toArray(),
      db.creditCardRepayments.toArray(),
    ])
    const repayments = [...creditCardRepayments]

    for (const card of creditCards.filter((candidate) => !candidate.archived)) {
      const linkedPot = pots.find(
        (pot) => !pot.archived && pot.linkedCreditCardId === card.id && pot.balancePence > 0,
      )

      if (!linkedPot) {
        continue
      }

      let linkedPotBalancePence = linkedPot.balancePence

      const startDate = isIsoDateText(card.createdAt.slice(0, 10)) ? card.createdAt.slice(0, 10) : todayIso
      const statementPayments = getCreditCardStatementPayments({
        card,
        recurringPayments: [],
        customPayments: [],
        transactions,
        repayments,
        startDate,
        endDate: todayIso,
        asOfDate: todayIso,
      })

      for (const statementPayment of statementPayments) {
        if (linkedPotBalancePence <= 0) {
          break
        }

        const repaymentId = getLinkedCreditCardPotRepaymentId(card.id, statementPayment.statementDate, statementPayment.directDebitDate)

        if (repayments.some((repayment) => repayment.id === repaymentId)) {
          continue
        }

        const cardSummary = getCreditCardAllocationSummary({
          creditCards: [card],
          recurringPayments: [],
          customPayments: [],
          transactions,
          repayments,
          creditCardPots: [],
          pots: [],
          payPeriod: null,
          asOfDate: statementPayment.directDebitDate,
        }).cards[0]
        const repaymentAmountPence = Math.min(
          statementPayment.actualDuePence,
          cardSummary?.actualOwedPence ?? 0,
          linkedPotBalancePence,
        )

        if (repaymentAmountPence <= 0) {
          continue
        }

        const repayment: CreditCardRepayment = {
          id: repaymentId,
          creditCardId: card.id,
          amountPence: repaymentAmountPence,
          date: statementPayment.directDebitDate,
          note: `Automatic ${card.name} statement payment from ${linkedPot.name} pot`,
          createdAt: timestamp,
          updatedAt: timestamp,
        }

        await db.creditCardRepayments.add(repayment)
        repayments.push(repayment)
        linkedPotBalancePence -= repaymentAmountPence

        await db.pots.update(linkedPot.id, {
          balancePence: linkedPotBalancePence,
          updatedAt: timestamp,
        })
      }
    }
  })
}

function getLinkedCreditCardPotRepaymentId(creditCardId: string, statementDate: string, dueDate: string): string {
  return `linked-card-pot-repayment-${creditCardId}-${statementDate}-${dueDate}`
}

async function applyDueLinkedDebtPotPayments(todayIso: string): Promise<void> {
  const timestamp = nowIso()

  await db.transaction('rw', [db.debts, db.pots, db.debtPayments], async () => {
    const [debts, pots, debtPayments] = await Promise.all([
      db.debts.toArray(),
      db.pots.toArray(),
      db.debtPayments.toArray(),
    ])

    for (const debt of debts.filter((candidate) => candidate.status === 'active' && candidate.currentBalancePence > 0 && candidate.dueDate <= todayIso)) {
      const linkedPots = pots
        .filter((pot) => !pot.archived && pot.linkedDebtId === debt.id && pot.balancePence > 0)
        .sort((a, b) => a.name.localeCompare(b.name))

      if (linkedPots.length === 0) {
        continue
      }

      const paymentId = getLinkedDebtPotPaymentId(debt.id, debt.dueDate)

      if (debtPayments.some((payment) => payment.id === paymentId)) {
        continue
      }

      const availableInLinkedPotsPence = linkedPots.reduce((total, pot) => total + Math.max(0, pot.balancePence), 0)
      const paymentAmountPence = Math.min(debt.currentBalancePence, availableInLinkedPotsPence)

      if (paymentAmountPence <= 0) {
        continue
      }

      let remainingToDeductPence = paymentAmountPence

      for (const pot of linkedPots) {
        if (remainingToDeductPence <= 0) {
          break
        }

        const potDeductionPence = Math.min(pot.balancePence, remainingToDeductPence)
        pot.balancePence -= potDeductionPence
        remainingToDeductPence -= potDeductionPence

        await db.pots.update(pot.id, {
          balancePence: pot.balancePence,
          updatedAt: timestamp,
        })
      }

      const nextBalancePence = debt.currentBalancePence - paymentAmountPence

      await db.debtPayments.add({
        id: paymentId,
        debtId: debt.id,
        amountPence: paymentAmountPence,
        date: debt.dueDate,
        note: linkedPots.length === 1
          ? `Automatic ${debt.name} payment from ${linkedPots[0].name}`
          : `Automatic ${debt.name} payment from linked debt pots`,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      await db.debts.update(debt.id, {
        currentBalancePence: nextBalancePence,
        status: nextBalancePence > 0 ? 'active' : 'paid',
        updatedAt: timestamp,
      })
    }
  })
}

function getLinkedDebtPotPaymentId(debtId: string, dueDate: string): string {
  return `linked-debt-pot-payment-${debtId}-${dueDate}`
}

function getRecurringReserveAllocations(
  duePayments: RecurringPayment[],
  pots: Pot[],
): Array<{
  potId: string
  amountPence: number
  source: 'recurring'
  recurringPaymentId: string
}> {
  const availableByPot = new Map(
    pots
      .filter((pot) => !pot.archived)
      .map((pot) => [pot.id, Math.max(0, pot.balancePence)]),
  )
  const uncoveredByPayment = new Map<string, {
    potId: string
    amountPence: number
    source: 'recurring'
    recurringPaymentId: string
  }>()

  for (const payment of duePayments) {
    if (payment.creditCardId || !payment.potId) {
      continue
    }

    const availablePence = availableByPot.get(payment.potId) ?? 0
    const coveredPence = Math.min(payment.amountPence, availablePence)
    const uncoveredPence = Math.max(0, payment.amountPence - coveredPence)

    availableByPot.set(payment.potId, availablePence - coveredPence)

    if (uncoveredPence <= 0) {
      continue
    }

    const current = uncoveredByPayment.get(payment.id)

    if (current) {
      current.amountPence += uncoveredPence
      continue
    }

    uncoveredByPayment.set(payment.id, {
      potId: payment.potId,
      amountPence: uncoveredPence,
      source: 'recurring',
      recurringPaymentId: payment.id,
    })
  }

  return [...uncoveredByPayment.values()]
}

function removeAllocationsFromPotBalances(pots: Pot[], allocations: PotAllocation[]): Pot[] {
  const allocationTotalsByPot = new Map<string, number>()

  for (const allocation of allocations) {
    allocationTotalsByPot.set(
      allocation.potId,
      (allocationTotalsByPot.get(allocation.potId) ?? 0) + allocation.amountPence,
    )

    if (allocation.fundingPotId) {
      allocationTotalsByPot.set(
        allocation.fundingPotId,
        (allocationTotalsByPot.get(allocation.fundingPotId) ?? 0) - allocation.amountPence,
      )
    }
  }

  return pots.map((pot) => ({
    ...pot,
    balancePence: pot.balancePence - (allocationTotalsByPot.get(pot.id) ?? 0),
  }))
}

function getRecurringApplicationStartDate(payment: RecurringPayment, todayIso: string): string {
  const createdDate = payment.createdAt.slice(0, 10)

  if (/^\d{4}-\d{2}-\d{2}$/.test(createdDate)) {
    return createdDate <= todayIso ? createdDate : todayIso
  }

  return todayIso
}

function getRecurringTransactionId(paymentId: string, dueDate: string): string {
  return `recurring-${paymentId}-${dueDate}`
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

function sortCreditCardPots(a: CreditCardPot, b: CreditCardPot): number {
  const statusSort = a.status.localeCompare(b.status)

  if (statusSort !== 0) {
    return statusSort
  }

  const dateSort = (b.payday ?? b.createdAt).localeCompare(a.payday ?? a.createdAt)

  if (dateSort !== 0) {
    return dateSort
  }

  return a.name.localeCompare(b.name)
}

function normalizeSettings(settings?: Settings): Settings {
  const manualTodayIso = isIsoDateText(settings?.manualTodayIso) ? settings.manualTodayIso : null
  const appDateMode = settings?.appDateMode === 'manual' && manualTodayIso ? 'manual' : 'automatic'

  return {
    ...defaultSettings,
    ...settings,
    appDateMode,
    manualTodayIso,
    defaultHoursWorked: settings?.defaultHoursWorked ?? defaultSettings.defaultHoursWorked,
    aiInstructions: settings?.aiInstructions ?? defaultSettings.aiInstructions,
    aiProvider: settings?.aiProvider ?? defaultSettings.aiProvider,
  }
}

function normalizePot(pot: Pot): Pot {
  return {
    ...pot,
    category: normalizePotCategory(pot.category),
    icon: normalizePotIcon(pot.icon),
    linkedCreditCardId: pot.linkedCreditCardId ?? null,
    linkedDebtId: pot.linkedDebtId ?? null,
  }
}

function normalizePotAllocation(allocation: PotAllocation): PotAllocation {
  return {
    ...allocation,
    fundingPotId: allocation.fundingPotId ?? null,
  }
}

function normalizePotCategory(category?: string | null): string | null {
  const clean = category?.trim().replace(/\s+/g, ' ').slice(0, 32) ?? ''

  return clean || null
}

function normalizePotIcon(icon?: string | null): string | null {
  const clean = icon?.trim().slice(0, 32) ?? ''

  return clean || null
}

function normalizeCreditCard(card: CreditCard): CreditCard {
  return {
    ...card,
    openingBalancePence: Math.max(0, card.openingBalancePence ?? 0),
    openingStatementBalancePence: Math.max(0, card.openingStatementBalancePence ?? card.openingBalancePence ?? 0),
    statementDate: isIsoDateText(card.statementDate) ? card.statementDate : null,
    designId: normalizeCreditCardDesignId(card.designId),
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

  const pots = await db.pots.toArray()
  const reserveAllocations = getRecurringReserveAllocations(duePayments, pots)

  if (reserveAllocations.length === 0) {
    return
  }

  for (const reserveAllocation of reserveAllocations) {
    await db.potAllocations.add({
      id: crypto.randomUUID(),
      payPeriodId: latestPeriod.id,
      potId: reserveAllocation.potId,
      fundingPotId: null,
      amountPence: reserveAllocation.amountPence,
      source: 'recurring',
      recurringPaymentId: reserveAllocation.recurringPaymentId,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await addAllocationToPot(reserveAllocation.potId, reserveAllocation.amountPence, timestamp)
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
  const duePayments = getRecurringPaymentsDue([payment], latestPeriod.startDate, latestPeriod.endDate)
  const isDue = duePayments.length > 0

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

  const pots = await db.pots.toArray()
  const adjustedPots = existingAllocation
    ? pots.map((pot) =>
        pot.id === existingAllocation.potId
          ? { ...pot, balancePence: pot.balancePence - existingAllocation.amountPence }
          : pot,
      )
    : pots
  const [reserveAllocation] = getRecurringReserveAllocations(duePayments, adjustedPots)

  if (!reserveAllocation) {
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
      potId: reserveAllocation.potId,
      fundingPotId: null,
      amountPence: reserveAllocation.amountPence,
      source: 'recurring',
      recurringPaymentId: reserveAllocation.recurringPaymentId,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await addAllocationToPot(reserveAllocation.potId, reserveAllocation.amountPence, timestamp)
    return
  }

  if (existingAllocation.potId !== reserveAllocation.potId) {
    await removeAllocationFromPot(existingAllocation, timestamp)
    await addAllocationToPot(reserveAllocation.potId, reserveAllocation.amountPence, timestamp)
  } else {
    await addAllocationToPot(
      existingAllocation.potId,
      reserveAllocation.amountPence - existingAllocation.amountPence,
      timestamp,
    )
  }

  await db.potAllocations.update(existingAllocation.id, {
    potId: reserveAllocation.potId,
    fundingPotId: null,
    amountPence: reserveAllocation.amountPence,
    source: 'recurring',
    recurringPaymentId: reserveAllocation.recurringPaymentId,
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
  await db.creditCardPots.where('payPeriodId').equals(payPeriodId).modify({
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
  allocation: Pick<PotAllocation, 'potId' | 'amountPence' | 'fundingPotId'>,
  timestamp: string,
): Promise<void> {
  await addAllocationToPot(allocation.potId, -allocation.amountPence, timestamp)

  if (allocation.fundingPotId) {
    await addAllocationToPot(allocation.fundingPotId, allocation.amountPence, timestamp)
  }
}

async function applyPotAllocationToBalances(
  allocation: Pick<PotAllocation, 'potId' | 'amountPence' | 'fundingPotId'>,
  timestamp: string,
): Promise<void> {
  await addAllocationToPot(allocation.potId, allocation.amountPence, timestamp)

  if (allocation.fundingPotId) {
    await addAllocationToPot(allocation.fundingPotId, -allocation.amountPence, timestamp)
  }
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
