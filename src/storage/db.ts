import Dexie, { type Table } from 'dexie'

import type {
  CreditCard,
  CreditCardRepayment,
  CustomPayment,
  DailyBrief,
  Debt,
  DebtPayment,
  DebtReserve,
  PayPeriod,
  Paycheck,
  Pot,
  PotAllocation,
  RecurringPayment,
  Settings,
  Transaction,
} from '../types/models'

export class PlannerDatabase extends Dexie {
  settings!: Table<Settings, string>
  pots!: Table<Pot, string>
  recurringPayments!: Table<RecurringPayment, string>
  payPeriods!: Table<PayPeriod, string>
  paychecks!: Table<Paycheck, string>
  potAllocations!: Table<PotAllocation, string>
  transactions!: Table<Transaction, string>
  debts!: Table<Debt, string>
  debtPayments!: Table<DebtPayment, string>
  debtReserves!: Table<DebtReserve, string>
  creditCards!: Table<CreditCard, string>
  customPayments!: Table<CustomPayment, string>
  creditCardRepayments!: Table<CreditCardRepayment, string>
  dailyBriefs!: Table<DailyBrief, string>

  constructor() {
    super('privatePaycheckPlanner')

    this.version(1).stores({
      settings: 'id',
      pots: 'id, type, archived',
      recurringPayments: 'id, potId, active, frequency',
      payPeriods: 'id, payday, status',
      paychecks: 'id, payPeriodId',
      potAllocations: 'id, payPeriodId, potId',
      transactions: 'id, potId, payPeriodId, date, type',
    })

    this.version(2).stores({
      settings: 'id',
      pots: 'id, type, archived',
      recurringPayments: 'id, potId, active, frequency',
      payPeriods: 'id, payday, status',
      paychecks: 'id, payPeriodId',
      potAllocations: 'id, payPeriodId, potId',
      transactions: 'id, potId, payPeriodId, date, type',
      debts: 'id, status, dueDate',
      debtPayments: 'id, debtId, date',
    })

    this.version(3).stores({
      settings: 'id',
      pots: 'id, type, archived',
      recurringPayments: 'id, potId, creditCardId, active, frequency',
      payPeriods: 'id, payday, status',
      paychecks: 'id, payPeriodId',
      potAllocations: 'id, payPeriodId, potId',
      transactions: 'id, potId, payPeriodId, creditCardId, date, type, paymentMethod',
      debts: 'id, status, dueDate',
      debtPayments: 'id, debtId, date',
      creditCards: 'id, archived',
      customPayments: 'id, creditCardId, dueDate, status',
      creditCardRepayments: 'id, creditCardId, date',
      dailyBriefs: 'id, date',
    })

    this.version(4).stores({
      settings: 'id',
      pots: 'id, type, archived',
      recurringPayments: 'id, potId, creditCardId, active, frequency',
      payPeriods: 'id, payday, status',
      paychecks: 'id, payPeriodId',
      potAllocations: 'id, payPeriodId, potId',
      transactions: 'id, potId, payPeriodId, creditCardId, date, type, paymentMethod',
      debts: 'id, status, dueDate',
      debtPayments: 'id, debtId, date',
      debtReserves: 'id, debtId, payPeriodId, payday, status',
      creditCards: 'id, archived',
      customPayments: 'id, creditCardId, dueDate, status',
      creditCardRepayments: 'id, creditCardId, date',
      dailyBriefs: 'id, date',
    })
  }
}

export const db = new PlannerDatabase()
