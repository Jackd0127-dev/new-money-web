export type PayFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom'

export type AiProvider = 'gemini' | 'openrouter'

export type PotType = 'spending' | 'reserved' | 'saving' | 'investment' | 'buffer'

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'yearly'

export type RecurringPriority = 'essential' | 'important' | 'optional'

export type PayPeriodStatus = 'planned' | 'active' | 'closed'

export type TransactionType = 'spending' | 'allocation' | 'transfer' | 'adjustment'

export type DebtStatus = 'active' | 'paid' | 'archived'

export type PaymentMethod = 'pot' | 'credit_card'

export type CustomPaymentStatus = 'unpaid' | 'paid' | 'archived'

export type DebtReserveStatus = 'planned' | 'skipped' | 'applied' | 'cancelled'

export type DebtReserveSource = 'assistant' | 'manual'

export interface Timestamped {
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface Settings extends Timestamped {
  id: 'default'
  currency: 'GBP'
  payFrequency: PayFrequency
  defaultPayPeriodDays: number
  hourlyRatePence: number
  defaultHoursWorked: number
  aiInstructions: string
  aiProvider: AiProvider
}

export interface Pot extends Timestamped {
  id: string
  name: string
  type: PotType
  balancePence: number
  targetPence: number | null
  color: string
  archived: boolean
}

export interface RecurringPayment extends Timestamped {
  id: string
  name: string
  amountPence: number
  dueDay?: number
  dueDate?: string
  frequency: RecurringFrequency
  potId: string
  creditCardId?: string | null
  priority: RecurringPriority
  active: boolean
}

export interface PayPeriod extends Timestamped {
  id: string
  startDate: string
  endDate: string
  payday: string
  nextPayday: string
  payFrequency?: PayFrequency
  incomePence: number
  status: PayPeriodStatus
}

export interface Paycheck extends Timestamped {
  id: string
  payPeriodId: string
  hoursWorked: number
  hourlyRatePence: number
  calculatedAmountPence: number
  actualAmountPence: number | null
}

export interface PotAllocation extends Timestamped {
  id: string
  payPeriodId: string
  potId: string
  amountPence: number
  source?: 'manual' | 'recurring'
  recurringPaymentId?: string | null
}

export interface Transaction extends Timestamped {
  id: string
  potId?: string | null
  payPeriodId?: string | null
  amountPence: number
  type: TransactionType
  paymentMethod?: PaymentMethod
  creditCardId?: string | null
  date: string
  note: string
}

export interface Debt extends Timestamped {
  id: string
  name: string
  lender: string
  originalAmountPence: number
  currentBalancePence: number
  minimumPaymentPence: number
  dueDate: string
  interestRateApr: number | null
  note: string
  status: DebtStatus
}

export interface DebtPayment extends Timestamped {
  id: string
  debtId: string
  amountPence: number
  date: string
  note: string
}

export interface DebtReserve extends Timestamped {
  id: string
  debtId: string
  payPeriodId: string | null
  payday: string
  periodStartDate: string
  periodEndDate: string
  amountPence: number
  status: DebtReserveStatus
  source: DebtReserveSource
  note: string
}

export interface CreditCard extends Timestamped {
  id: string
  name: string
  provider: string
  limitPence: number
  dueDay?: number | null
  dueDate?: string | null
  color: string
  archived: boolean
}

export interface CustomPayment extends Timestamped {
  id: string
  name: string
  amountPence: number
  dueDate: string
  creditCardId?: string | null
  status: CustomPaymentStatus
}

export interface CreditCardRepayment extends Timestamped {
  id: string
  creditCardId: string
  amountPence: number
  date: string
  note: string
}

export interface DailyBrief extends Timestamped {
  id: string
  date: string
  snapshotSignature: string
  content: string
}
