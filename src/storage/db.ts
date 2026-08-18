import Dexie, { type Table } from 'dexie'

import { defaultCreditCardDesignId } from '../domain/creditCardDesigns'
import type {
  CreditCard,
  CreditCardPot,
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
  creditCardPots!: Table<CreditCardPot, string>
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

    this.version(5).stores({
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
      creditCardPots: 'id, creditCardId, payPeriodId, payday, source, status',
      customPayments: 'id, creditCardId, dueDate, status',
      creditCardRepayments: 'id, creditCardId, date',
      dailyBriefs: 'id, date',
    })

    this.version(6).stores({
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
      creditCardPots: 'id, creditCardId, payPeriodId, payday, source, status',
      customPayments: 'id, creditCardId, dueDate, status',
      creditCardRepayments: 'id, creditCardId, date',
      dailyBriefs: 'id, date',
    }).upgrade((transaction) =>
      transaction.table('creditCards').toCollection().modify((card) => {
        if (typeof card.openingBalancePence !== 'number') {
          card.openingBalancePence = 0
        }
      }),
    )

    this.version(7).stores({
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
      creditCardPots: 'id, creditCardId, payPeriodId, payday, source, status',
      customPayments: 'id, creditCardId, dueDate, status',
      creditCardRepayments: 'id, creditCardId, date',
      dailyBriefs: 'id, date',
    }).upgrade((transaction) =>
      transaction.table('creditCards').toCollection().modify((card) => {
        if (typeof card.designId !== 'string') {
          card.designId = defaultCreditCardDesignId
        }
      }),
    )

    this.version(8).stores({
      settings: 'id',
      pots: 'id, type, archived',
      recurringPayments: 'id, potId, creditCardId, active, frequency',
      payPeriods: 'id, payday, status',
      paychecks: 'id, payPeriodId',
      potAllocations: 'id, payPeriodId, potId',
      transactions: 'id, potId, payPeriodId, creditCardId, recurringPaymentId, date, type, paymentMethod',
      debts: 'id, status, dueDate',
      debtPayments: 'id, debtId, date',
      debtReserves: 'id, debtId, payPeriodId, payday, status',
      creditCards: 'id, archived',
      creditCardPots: 'id, creditCardId, payPeriodId, payday, source, status',
      customPayments: 'id, creditCardId, dueDate, status',
      creditCardRepayments: 'id, creditCardId, date',
      dailyBriefs: 'id, date',
    })

    this.version(9).stores({
      settings: 'id',
      pots: 'id, type, archived, linkedCreditCardId, linkedDebtId',
      recurringPayments: 'id, potId, creditCardId, active, frequency',
      payPeriods: 'id, payday, status',
      paychecks: 'id, payPeriodId',
      potAllocations: 'id, payPeriodId, potId',
      transactions: 'id, potId, payPeriodId, creditCardId, recurringPaymentId, date, type, paymentMethod',
      debts: 'id, status, dueDate',
      debtPayments: 'id, debtId, date',
      debtReserves: 'id, debtId, payPeriodId, payday, status',
      creditCards: 'id, archived',
      creditCardPots: 'id, creditCardId, payPeriodId, payday, source, status',
      customPayments: 'id, creditCardId, dueDate, status',
      creditCardRepayments: 'id, creditCardId, date',
      dailyBriefs: 'id, date',
    }).upgrade((transaction) =>
      transaction.table('pots').toCollection().modify((pot) => {
        pot.linkedCreditCardId = pot.linkedCreditCardId ?? null
        pot.linkedDebtId = pot.linkedDebtId ?? null
      }),
    )

    this.version(10).stores({
      settings: 'id',
      pots: 'id, type, archived, linkedCreditCardId, linkedDebtId',
      recurringPayments: 'id, potId, creditCardId, active, frequency',
      payPeriods: 'id, payday, status',
      paychecks: 'id, payPeriodId',
      potAllocations: 'id, payPeriodId, potId',
      transactions: 'id, potId, payPeriodId, creditCardId, recurringPaymentId, date, type, paymentMethod',
      debts: 'id, status, dueDate',
      debtPayments: 'id, debtId, date',
      debtReserves: 'id, debtId, payPeriodId, payday, status',
      creditCards: 'id, archived',
      creditCardPots: 'id, creditCardId, payPeriodId, payday, source, status',
      customPayments: 'id, creditCardId, dueDate, status',
      creditCardRepayments: 'id, creditCardId, date',
      dailyBriefs: 'id, date',
    }).upgrade((transaction) =>
      transaction.table('creditCards').toCollection().modify((card) => {
        card.statementDate = card.statementDate ?? null
        card.openingStatementBalancePence = Math.max(0, card.openingStatementBalancePence ?? card.openingBalancePence ?? 0)
      }),
    )

    this.version(11).stores({
      settings: 'id',
      pots: 'id, type, archived, linkedCreditCardId, linkedDebtId',
      recurringPayments: 'id, potId, creditCardId, active, frequency',
      payPeriods: 'id, payday, status',
      paychecks: 'id, payPeriodId',
      potAllocations: 'id, payPeriodId, potId',
      transactions: 'id, potId, payPeriodId, creditCardId, recurringPaymentId, date, type, paymentMethod',
      debts: 'id, status, dueDate',
      debtPayments: 'id, debtId, date',
      debtReserves: 'id, debtId, payPeriodId, payday, status',
      creditCards: 'id, archived',
      creditCardPots: 'id, creditCardId, payPeriodId, payday, source, status',
      customPayments: 'id, creditCardId, dueDate, status',
      creditCardRepayments: 'id, creditCardId, date',
      dailyBriefs: 'id, date',
    }).upgrade((transaction) =>
      transaction.table('potAllocations').toCollection().modify((allocation) => {
        allocation.fundingPotId = allocation.fundingPotId ?? null
      }),
    )
  }
}

export const db = new PlannerDatabase()
