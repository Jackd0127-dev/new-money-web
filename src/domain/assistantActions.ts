import { formatPence } from './money.js'
import type {
  CreditCardInput,
  CreditCardRepaymentInput,
  DebtInput,
  PlannerSnapshot,
  PotInput,
  RecurringPaymentInput,
  TransactionInput,
} from '../storage/repository.js'
import type { PaymentMethod, PotType, RecurringFrequency, RecurringPriority } from '../types/models.js'

const validPotTypes = new Set<PotType>(['spending', 'reserved', 'saving', 'investment', 'buffer'])
const validRecurringFrequencies = new Set<RecurringFrequency>(['weekly', 'biweekly', 'monthly', 'yearly'])
const validRecurringPriorities = new Set<RecurringPriority>(['essential', 'important', 'optional'])
const validPaymentMethods = new Set<PaymentMethod>(['pot', 'credit_card'])

export type AssistantActionStatusState = 'pending' | 'running' | 'done' | 'cancelled' | 'error'

export interface AssistantActionStatus {
  state: AssistantActionStatusState
  error?: string
}

interface AssistantActionBase<Type extends string, Payload> {
  id: string
  type: Type
  label: string
  payload: Payload
}

export interface LogSpendPayload {
  amountPence: number
  date: string
  note: string
  paymentMethod?: PaymentMethod | null
  potId?: string | null
  creditCardId?: string | null
}

export interface CreatePotPayload {
  name: string
  type: PotType
  balancePence: number
  targetPence: number | null
  color: string
  linkedCreditCardId?: string | null
  linkedDebtId?: string | null
}

export interface CreateRecurringPaymentPayload {
  name: string
  amountPence: number
  dueDay?: number | null
  dueDate?: string | null
  frequency: RecurringFrequency
  potId?: string | null
  creditCardId?: string | null
  priority: RecurringPriority
}

export interface CreateDebtPayload {
  name: string
  lender: string
  currentBalancePence: number
  minimumPaymentPence: number
  dueDate: string
  interestRateApr: number | null
  note: string
}

export interface CreateCreditCardPayload {
  name: string
  provider: string
  limitPence: number
  openingBalancePence?: number
  openingStatementBalancePence?: number
  statementDate?: string | null
  dueDay?: number | null
  dueDate?: string | null
  color: string
}

export interface RecordCardPaymentPayload {
  creditCardId: string
  amountPence: number
  date: string
  note: string
}

export type AssistantActionProposal =
  | AssistantActionBase<'log_spend', LogSpendPayload>
  | AssistantActionBase<'create_pot', CreatePotPayload>
  | AssistantActionBase<'create_recurring_payment', CreateRecurringPaymentPayload>
  | AssistantActionBase<'create_debt', CreateDebtPayload>
  | AssistantActionBase<'create_credit_card', CreateCreditCardPayload>
  | AssistantActionBase<'record_card_payment', RecordCardPaymentPayload>

export interface AssistantActionRunner {
  addTransaction: (input: TransactionInput) => Promise<unknown>
  addPot: (input: PotInput) => Promise<unknown>
  addRecurringPayment: (input: RecurringPaymentInput) => Promise<unknown>
  addDebt: (input: DebtInput) => Promise<unknown>
  addCreditCard: (input: CreditCardInput) => Promise<unknown>
  addCreditCardRepayment: (input: CreditCardRepaymentInput) => Promise<unknown>
}

export function normalizeAssistantActionProposals(value: unknown): AssistantActionProposal[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item, index) => normalizeAssistantActionProposal(item, index))
    .filter((action): action is AssistantActionProposal => Boolean(action))
    .slice(0, 4)
}

export function getAssistantActionValidationError(
  action: AssistantActionProposal,
  snapshot: PlannerSnapshot,
): string | null {
  if (!action.label.trim()) {
    return 'The action label is missing.'
  }

  if (action.type === 'log_spend') {
    if (action.payload.amountPence <= 0) {
      return 'The spend amount must be above zero.'
    }

    if (!isIsoDate(action.payload.date)) {
      return 'The spend date is missing or invalid.'
    }

    if (!action.payload.note.trim()) {
      return 'The spend note is missing.'
    }

    if (action.payload.paymentMethod && !validPaymentMethods.has(action.payload.paymentMethod)) {
      return 'The payment method is not supported.'
    }

    if (action.payload.paymentMethod === 'pot' && !snapshot.pots.some((pot) => pot.id === action.payload.potId && !pot.archived)) {
      return 'The linked pot could not be found.'
    }

    if (
      action.payload.paymentMethod === 'credit_card' &&
      !snapshot.creditCards.some((card) => card.id === action.payload.creditCardId && !card.archived)
    ) {
      return 'The linked credit card could not be found.'
    }

    return null
  }

  if (action.type === 'create_pot') {
    if (!action.payload.name.trim()) {
      return 'The pot name is missing.'
    }

    if (!validPotTypes.has(action.payload.type)) {
      return 'The pot type is not supported.'
    }

    if (action.payload.balancePence < 0 || (action.payload.targetPence ?? 0) < 0) {
      return 'Pot amounts cannot be negative.'
    }

    if (action.payload.linkedCreditCardId && !snapshot.creditCards.some((card) => card.id === action.payload.linkedCreditCardId && !card.archived)) {
      return 'The linked credit card could not be found.'
    }

    if (action.payload.linkedDebtId && !snapshot.debts.some((debt) => debt.id === action.payload.linkedDebtId && debt.status !== 'archived')) {
      return 'The linked debt could not be found.'
    }

    return null
  }

  if (action.type === 'create_recurring_payment') {
    if (!action.payload.name.trim() || action.payload.amountPence <= 0) {
      return 'The recurring payment needs a name and amount.'
    }

    const usesIntervalAnchor = action.payload.frequency === 'weekly' || action.payload.frequency === 'biweekly'

    if (!usesIntervalAnchor && ((action.payload.dueDay ?? 0) < 1 || (action.payload.dueDay ?? 0) > 31)) {
      return 'The due day must be between 1 and 31.'
    }

    if (usesIntervalAnchor && !action.payload.dueDate && !action.payload.dueDay) {
      return 'The recurring payment needs a first due date.'
    }

    if (!validRecurringFrequencies.has(action.payload.frequency) || !validRecurringPriorities.has(action.payload.priority)) {
      return 'The recurring payment schedule is not supported.'
    }

    if (action.payload.potId && !snapshot.pots.some((pot) => pot.id === action.payload.potId && !pot.archived)) {
      return 'The linked pot could not be found.'
    }

    if (action.payload.creditCardId && !snapshot.creditCards.some((card) => card.id === action.payload.creditCardId && !card.archived)) {
      return 'The linked credit card could not be found.'
    }

    return null
  }

  if (action.type === 'create_debt') {
    if (!action.payload.name.trim() || !action.payload.lender.trim() || action.payload.currentBalancePence <= 0) {
      return 'The debt needs a name, lender, and balance.'
    }

    if (!isIsoDate(action.payload.dueDate)) {
      return 'The debt due date is missing or invalid.'
    }

    return null
  }

  if (action.type === 'create_credit_card') {
    if (!action.payload.name.trim() || !action.payload.provider.trim()) {
      return 'The card needs a name and provider.'
    }

    if (action.payload.limitPence <= 0) {
      return 'The card limit must be above zero.'
    }

    return null
  }

  if (action.type === 'record_card_payment') {
    if (!snapshot.creditCards.some((card) => card.id === action.payload.creditCardId && !card.archived)) {
      return 'The credit card could not be found.'
    }

    if (action.payload.amountPence <= 0 || !isIsoDate(action.payload.date)) {
      return 'The repayment needs an amount and date.'
    }

    return null
  }

  return 'This action is not supported yet.'
}

export async function runAssistantAction(
  action: AssistantActionProposal,
  actions: AssistantActionRunner,
): Promise<void> {
  if (action.type === 'log_spend') {
    await actions.addTransaction({
      amountPence: action.payload.amountPence,
      date: action.payload.date,
      note: action.payload.note.trim(),
      paymentMethod: action.payload.paymentMethod ?? undefined,
      potId: action.payload.paymentMethod === 'pot' ? action.payload.potId ?? null : null,
      creditCardId: action.payload.paymentMethod === 'credit_card' ? action.payload.creditCardId ?? null : null,
      recurringPaymentId: null,
      type: 'spending',
    })
    return
  }

  if (action.type === 'create_pot') {
    await actions.addPot({
      name: action.payload.name.trim(),
      type: action.payload.type,
      balancePence: Math.max(0, action.payload.balancePence),
      targetPence: action.payload.targetPence === null ? null : Math.max(0, action.payload.targetPence),
      color: action.payload.color,
      linkedCreditCardId: action.payload.linkedCreditCardId ?? null,
      linkedDebtId: action.payload.linkedDebtId ?? null,
    })
    return
  }

  if (action.type === 'create_recurring_payment') {
    await actions.addRecurringPayment({
      name: action.payload.name.trim(),
      amountPence: action.payload.amountPence,
      dueDay: action.payload.dueDay ?? null,
      dueDate: action.payload.dueDate ?? null,
      frequency: action.payload.frequency,
      potId: action.payload.potId ?? null,
      creditCardId: action.payload.creditCardId ?? null,
      priority: action.payload.priority,
    })
    return
  }

  if (action.type === 'create_debt') {
    await actions.addDebt({
      name: action.payload.name.trim(),
      lender: action.payload.lender.trim(),
      currentBalancePence: action.payload.currentBalancePence,
      minimumPaymentPence: action.payload.minimumPaymentPence,
      dueDate: action.payload.dueDate,
      interestRateApr: action.payload.interestRateApr,
      note: action.payload.note.trim(),
    })
    return
  }

  if (action.type === 'create_credit_card') {
    await actions.addCreditCard({
      name: action.payload.name.trim(),
      provider: action.payload.provider.trim(),
      limitPence: action.payload.limitPence,
      openingBalancePence: action.payload.openingBalancePence ?? 0,
      openingStatementBalancePence: action.payload.openingStatementBalancePence ?? action.payload.openingBalancePence ?? 0,
      statementDate: action.payload.statementDate ?? null,
      dueDay: action.payload.dueDay ?? null,
      dueDate: action.payload.dueDate ?? null,
      color: action.payload.color,
    })
    return
  }

  if (action.type === 'record_card_payment') {
    await actions.addCreditCardRepayment({
      creditCardId: action.payload.creditCardId,
      amountPence: action.payload.amountPence,
      date: action.payload.date,
      note: action.payload.note.trim(),
    })
  }
}

export function getAssistantActionDetails(action: AssistantActionProposal, snapshot: PlannerSnapshot): string[] {
  if (action.type === 'log_spend') {
    const destination = action.payload.paymentMethod === 'credit_card'
      ? getCreditCardName(snapshot, action.payload.creditCardId)
      : action.payload.paymentMethod === 'pot'
        ? getPotName(snapshot, action.payload.potId)
        : 'Unlinked'

    return [
      `${formatPence(action.payload.amountPence)} on ${action.payload.date}`,
      action.payload.note,
      action.payload.paymentMethod === 'credit_card'
        ? `Credit card: ${destination}`
        : action.payload.paymentMethod === 'pot'
          ? `Pot: ${destination}`
          : destination,
    ]
  }

  if (action.type === 'create_pot') {
    return [
      `Type: ${action.payload.type}`,
      `Current balance: ${formatPence(action.payload.balancePence)}`,
      `Paycheck top-up: ${action.payload.targetPence ? formatPence(action.payload.targetPence) : 'None'}`,
    ]
  }

  if (action.type === 'create_recurring_payment') {
    return [
      `${formatPence(action.payload.amountPence)} ${action.payload.frequency}`,
      action.payload.dueDate ? `First due ${action.payload.dueDate}` : `Due day ${action.payload.dueDay}`,
      `Pot: ${getPotName(snapshot, action.payload.potId)}`,
    ]
  }

  if (action.type === 'create_debt') {
    return [
      `Lender: ${action.payload.lender}`,
      `Balance: ${formatPence(action.payload.currentBalancePence)}`,
      `Due: ${action.payload.dueDate}`,
    ]
  }

  if (action.type === 'create_credit_card') {
    return [
      `Provider: ${action.payload.provider}`,
      `Limit: ${formatPence(action.payload.limitPence)}`,
      `Existing balance: ${formatPence(action.payload.openingBalancePence ?? 0)}`,
    ]
  }

  return [
    `Card: ${getCreditCardName(snapshot, action.payload.creditCardId)}`,
    `Amount: ${formatPence(action.payload.amountPence)}`,
    `Date: ${action.payload.date}`,
  ]
}

function normalizeAssistantActionProposal(value: unknown, index: number): AssistantActionProposal | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const source = value as Record<string, unknown>
  const type = getString(source.type)
  const label = getString(source.label) || getDefaultLabel(type)
  const id = getString(source.id) || `assistant-action-${index + 1}`
  const payload = getRecord(source.payload)

  if (!payload) {
    return null
  }

  if (type === 'log_spend') {
    const amountPence = getNumber(payload.amountPence)
    const date = getString(payload.date)
    const note = getString(payload.note)
    const paymentMethod = normalizePaymentMethod(payload.paymentMethod)

    if (amountPence === null || !date || !note) {
      return null
    }

    return {
      id,
      type,
      label,
      payload: {
        amountPence,
        date,
        note,
        paymentMethod,
        potId: getNullableString(payload.potId),
        creditCardId: getNullableString(payload.creditCardId),
      },
    }
  }

  if (type === 'create_pot') {
    const name = getString(payload.name)
    const potType = normalizePotType(payload.type)
    const balancePence = getNumber(payload.balancePence)

    if (!name || !potType || balancePence === null) {
      return null
    }

    return {
      id,
      type,
      label,
      payload: {
        name,
        type: potType,
        balancePence,
        targetPence: getNullableNumber(payload.targetPence),
        color: getString(payload.color) || '#2563eb',
        linkedCreditCardId: getNullableString(payload.linkedCreditCardId),
        linkedDebtId: getNullableString(payload.linkedDebtId),
      },
    }
  }

  if (type === 'create_recurring_payment') {
    const name = getString(payload.name)
    const amountPence = getNumber(payload.amountPence)
    const dueDay = getNullableNumber(payload.dueDay)
    const dueDate = getNullableString(payload.dueDate)
    const frequency = normalizeRecurringFrequency(payload.frequency)
    const priority = normalizeRecurringPriority(payload.priority)
    const potId = getNullableString(payload.potId)

    if (!name || amountPence === null || !frequency || !priority) {
      return null
    }

    return {
      id,
      type,
      label,
      payload: {
        name,
        amountPence,
        dueDay,
        dueDate,
        frequency,
        potId,
        creditCardId: getNullableString(payload.creditCardId),
        priority,
      },
    }
  }

  if (type === 'create_debt') {
    const name = getString(payload.name)
    const lender = getString(payload.lender)
    const currentBalancePence = getNumber(payload.currentBalancePence)
    const dueDate = getString(payload.dueDate)

    if (!name || !lender || currentBalancePence === null || !dueDate) {
      return null
    }

    return {
      id,
      type,
      label,
      payload: {
        name,
        lender,
        currentBalancePence,
        minimumPaymentPence: getNumber(payload.minimumPaymentPence) ?? 0,
        dueDate,
        interestRateApr: getNullableNumber(payload.interestRateApr),
        note: getString(payload.note),
      },
    }
  }

  if (type === 'create_credit_card') {
    const name = getString(payload.name)
    const provider = getString(payload.provider)
    const limitPence = getNumber(payload.limitPence)

    if (!name || !provider || limitPence === null) {
      return null
    }

    return {
      id,
      type,
      label,
      payload: {
        name,
        provider,
        limitPence,
        openingBalancePence: getNumber(payload.openingBalancePence) ?? 0,
        openingStatementBalancePence: getNumber(payload.openingStatementBalancePence) ?? getNumber(payload.openingBalancePence) ?? 0,
        statementDate: getNullableString(payload.statementDate),
        dueDay: getNullableNumber(payload.dueDay),
        dueDate: getNullableString(payload.dueDate),
        color: getString(payload.color) || '#2563eb',
      },
    }
  }

  if (type === 'record_card_payment') {
    const creditCardId = getString(payload.creditCardId)
    const amountPence = getNumber(payload.amountPence)
    const date = getString(payload.date)

    if (!creditCardId || amountPence === null || !date) {
      return null
    }

    return {
      id,
      type,
      label,
      payload: {
        creditCardId,
        amountPence,
        date,
        note: getString(payload.note),
      },
    }
  }

  return null
}

function getDefaultLabel(type: string): string {
  if (type === 'log_spend') {
    return 'Log spend'
  }

  if (type === 'create_pot') {
    return 'Create pot'
  }

  if (type === 'create_recurring_payment') {
    return 'Create recurring payment'
  }

  if (type === 'create_debt') {
    return 'Create debt'
  }

  if (type === 'create_credit_card') {
    return 'Create credit card'
  }

  if (type === 'record_card_payment') {
    return 'Record card payment'
  }

  return 'Suggested action'
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getNullableString(value: unknown): string | null {
  const text = getString(value)
  return text || null
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.round(numeric) : null
  }

  return null
}

function getNullableNumber(value: unknown): number | null {
  return value === null || value === undefined || value === '' ? null : getNumber(value)
}

function normalizePaymentMethod(value: unknown): PaymentMethod | null {
  const method = getString(value)
  return validPaymentMethods.has(method as PaymentMethod) ? method as PaymentMethod : null
}

function normalizePotType(value: unknown): PotType | null {
  const type = getString(value)
  return validPotTypes.has(type as PotType) ? type as PotType : null
}

function normalizeRecurringFrequency(value: unknown): RecurringFrequency | null {
  const frequency = getString(value)
  return validRecurringFrequencies.has(frequency as RecurringFrequency) ? frequency as RecurringFrequency : null
}

function normalizeRecurringPriority(value: unknown): RecurringPriority | null {
  const priority = getString(value)
  return validRecurringPriorities.has(priority as RecurringPriority) ? priority as RecurringPriority : null
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function getPotName(snapshot: PlannerSnapshot, potId?: string | null): string {
  if (!potId) {
    return 'No pot linked'
  }

  return snapshot.pots.find((pot) => pot.id === potId)?.name ?? 'Unknown pot'
}

function getCreditCardName(snapshot: PlannerSnapshot, creditCardId?: string | null): string {
  if (!creditCardId) {
    return 'No credit card linked'
  }

  return snapshot.creditCards.find((card) => card.id === creditCardId)?.name ?? 'Unknown credit card'
}
