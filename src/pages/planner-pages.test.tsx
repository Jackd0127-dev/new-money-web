import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DashboardPage } from './DashboardPage'
import { DebtsPage } from './DebtsPage'
import { HistoryPage } from './HistoryPage'
import { AiPlanPage } from './AiPlanPage'
import { AllocatingPaymentsPage } from './AllocatingPaymentsPage'
import { PaydayWizardPage } from './PaydayWizardPage'
import { PotsPage } from './PotsPage'
import { RecurringPage } from './RecurringPage'
import { SettingsPage } from './SettingsPage'
import { SpendingPage } from './SpendingPage'
import { toIsoDate } from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import type { RecurringPayment, Transaction } from '../types/models'

type TestActions = PlannerActions & {
  addDebt: ReturnType<typeof vi.fn>
  addDebtPayment: ReturnType<typeof vi.fn>
  addCreditCard: ReturnType<typeof vi.fn>
  addCustomPayment: ReturnType<typeof vi.fn>
  addCreditCardRepayment: ReturnType<typeof vi.fn>
  deletePot: ReturnType<typeof vi.fn>
  deletePayPeriod: ReturnType<typeof vi.fn>
  updateCreditCard: ReturnType<typeof vi.fn>
  updateCreditCardRepayment: ReturnType<typeof vi.fn>
  updateCustomPayment: ReturnType<typeof vi.fn>
  updatePot: ReturnType<typeof vi.fn>
  updateRecurringPayment: ReturnType<typeof vi.fn>
  updateTransaction: ReturnType<typeof vi.fn>
  addDebtReserve: ReturnType<typeof vi.fn>
  updateDebtReserve: ReturnType<typeof vi.fn>
  cancelDebtReserve: ReturnType<typeof vi.fn>
  skipDebtReserve: ReturnType<typeof vi.fn>
  applyDebtReserve: ReturnType<typeof vi.fn>
}

describe('settings page', () => {
  it('confirms when settings are saved', async () => {
    const user = userEvent.setup()
    const actions = createActions()

    render(<SettingsPage snapshot={createSnapshot()} actions={actions} />)

    expect(screen.queryByText('Settings saved')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(actions.updateSettings).toHaveBeenCalledWith({
      defaultHoursWorked: 72,
      hourlyRatePence: 1250,
      payFrequency: 'biweekly',
      aiInstructions: '',
      aiProvider: 'gemini',
    })
    expect(screen.getByText('Settings saved')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  })

  it('saves custom AI instructions with the normal settings form', async () => {
    const user = userEvent.setup()
    const actions = createActions()

    render(<SettingsPage snapshot={createSnapshot()} actions={actions} />)

    await user.type(screen.getByLabelText('Custom AI instructions'), 'Be blunt and prioritise debt deadlines.')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(actions.updateSettings).toHaveBeenCalledWith({
      defaultHoursWorked: 72,
      hourlyRatePence: 1250,
      payFrequency: 'biweekly',
      aiInstructions: 'Be blunt and prioritise debt deadlines.',
      aiProvider: 'gemini',
    })
  })

  it('saves the selected AI provider', async () => {
    const user = userEvent.setup()
    const actions = createActions()

    render(<SettingsPage snapshot={createSnapshot()} actions={actions} />)

    await user.selectOptions(screen.getByLabelText('AI provider'), 'openrouter')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(actions.updateSettings).toHaveBeenCalledWith({
      defaultHoursWorked: 72,
      hourlyRatePence: 1250,
      payFrequency: 'biweekly',
      aiInstructions: '',
      aiProvider: 'openrouter',
    })
  })
})

describe('AI plan page', () => {
  it('shows a deterministic debt reserve recommendation and reserves it without paying the debt', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-jan-02',
      payday: '2026-01-02',
      startDate: '2026-01-02',
      endDate: '2026-01-15',
      nextPayday: '2026-01-16',
      incomePence: 80000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      debts: [
        {
          id: 'debt-card',
          name: 'Card balance',
          lender: 'Card Provider',
          originalAmountPence: 20000,
          currentBalancePence: 20000,
          minimumPaymentPence: 0,
          dueDate: '2026-01-20',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    render(
      <AiPlanPage
        snapshot={snapshot}
        actions={actions}
        selectedPayPeriod={selectedPayPeriod}
        user={null}
      />,
    )

    expect(screen.getByRole('heading', { name: 'AI debt plan' })).toBeInTheDocument()
    expect(screen.getByText('Set aside this paycheck')).toBeInTheDocument()
    expect(screen.getAllByText('£100.00').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Reserve £100.00 for Card balance' }))

    expect(actions.addDebtReserve).toHaveBeenCalledWith({
      debtId: 'debt-card',
      payPeriodId: 'period-jan-02',
      payday: '2026-01-02',
      periodStartDate: '2026-01-02',
      periodEndDate: '2026-01-15',
      amountPence: 10000,
      source: 'assistant',
      note: 'AI Plan reserve for Card balance',
    })
    expect(actions.addDebtPayment).not.toHaveBeenCalled()
  })
})

describe('payday wizard', () => {
  it('lets the paycheck frequency change the visible pay period', async () => {
    const user = userEvent.setup()

    render(<PaydayWizardPage snapshot={createSnapshot()} actions={createActions()} />)

    fireEvent.change(screen.getByLabelText('Payday'), { target: { value: '2026-05-16' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Pay frequency' }), 'monthly')

    expect(screen.getByDisplayValue('2026-05-16 to 2026-06-15')).toBeInTheDocument()
  })

  it('loads an existing payday plan so saving that date updates instead of creating a duplicate', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const snapshot = createSnapshot({
      payPeriods: [
        {
          id: 'period-current',
          startDate: '2026-05-16',
          endDate: '2026-05-29',
          payday: '2026-05-16',
          nextPayday: '2026-05-30',
          payFrequency: 'biweekly',
          incomePence: 120000,
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      paychecks: [
        {
          id: 'paycheck-current',
          payPeriodId: 'period-current',
          hoursWorked: 84.5,
          hourlyRatePence: 1350,
          calculatedAmountPence: 114075,
          actualAmountPence: 120000,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      potAllocations: [
        {
          id: 'allocation-food',
          payPeriodId: 'period-current',
          potId: 'pot-food',
          amountPence: 15000,
          source: 'manual',
          recurringPaymentId: null,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<PaydayWizardPage snapshot={snapshot} actions={actions} />)

    fireEvent.change(screen.getByLabelText('Payday'), { target: { value: '2026-05-16' } })

    expect(screen.getByDisplayValue('84.5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('13.50')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1200.00')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Payday allocation' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Food')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Hours worked'))
    await user.type(screen.getByLabelText('Hours worked'), '86')
    await user.click(screen.getByRole('button', { name: 'Update paycheck plan' }))

    expect(actions.createPaycheckPlan).toHaveBeenCalledWith({
      payday: '2026-05-16',
      payFrequency: 'biweekly',
      hoursWorked: 86,
      hourlyRatePence: 1350,
      actualAmountPence: 120000,
      allocations: [],
    })
  })
})

describe('spending page', () => {
  it('uses quick amount buttons for faster manual spending entry', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const today = toIsoDate(new Date())

    render(<SpendingPage snapshot={createSnapshot()} actions={actions} />)

    await user.click(screen.getByRole('button', { name: '£10.00' }))
    await user.type(screen.getByLabelText('Note'), 'Coffee')
    await user.click(screen.getByRole('button', { name: 'Log spending' }))

    expect(actions.addTransaction).toHaveBeenCalledWith({
      amountPence: 1000,
      creditCardId: null,
      date: today,
      note: 'Coffee',
      payPeriodId: null,
      paymentMethod: 'pot',
      potId: 'pot-bills',
      type: 'spending',
    })
  })

  it('edits an existing manual spending entry', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const snapshot = createSnapshot({
      transactions: [
        {
          id: 'txn-food',
          potId: 'pot-food',
          payPeriodId: null,
          amountPence: 1250,
          type: 'spending',
          date: '2026-05-16',
          note: 'Lunch',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<SpendingPage snapshot={snapshot} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Edit Lunch' }))

    const editPanel = screen.getByRole('region', { name: 'Edit spending entry' })
    await user.clear(within(editPanel).getByLabelText('Amount'))
    await user.type(within(editPanel).getByLabelText('Amount'), '14.20')
    await user.clear(within(editPanel).getByLabelText('Note'))
    await user.type(within(editPanel).getByLabelText('Note'), 'Dinner')
    await user.click(within(editPanel).getByRole('button', { name: 'Save spending' }))

    expect(actions.updateTransaction).toHaveBeenCalledWith('txn-food', {
      amountPence: 1420,
      creditCardId: null,
      date: '2026-05-16',
      note: 'Dinner',
      paymentMethod: 'pot',
      potId: 'pot-food',
    })
  })

  it('logs spending against a credit card when credit card payment method is selected', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const today = toIsoDate(new Date())

    render(
      <SpendingPage
        snapshot={createSnapshot({
          creditCards: [
            {
              id: 'card-amex',
              name: 'Everyday Amex',
              provider: 'Amex',
              limitPence: 100000,
              dueDay: 12,
              dueDate: null,
              color: '#2563eb',
              archived: false,
              createdAt: '2026-05-16T00:00:00.000Z',
              updatedAt: '2026-05-16T00:00:00.000Z',
            },
          ],
        })}
        actions={actions}
      />,
    )

    await user.click(screen.getByRole('button', { name: '£20.00' }))
    await user.selectOptions(screen.getByLabelText('Payment method'), 'credit_card')
    await user.selectOptions(screen.getByLabelText('Credit card'), 'card-amex')
    await user.type(screen.getByLabelText('Note'), 'Groceries')
    await user.click(screen.getByRole('button', { name: 'Log spending' }))

    expect(actions.addTransaction).toHaveBeenCalledWith({
      amountPence: 2000,
      creditCardId: 'card-amex',
      date: today,
      note: 'Groceries',
      paymentMethod: 'credit_card',
      payPeriodId: null,
      potId: null,
      type: 'spending',
    })
  })
})

describe('allocating payments page', () => {
  it('creates a credit card, custom card payment, and card repayment', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const snapshot = createSnapshot({
      creditCards: [
        {
          id: 'card-amex',
          name: 'Everyday Amex',
          provider: 'Amex',
          limitPence: 100000,
          dueDay: 12,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<AllocatingPaymentsPage snapshot={snapshot} actions={actions} />)

    const cardPanel = screen.getByRole('region', { name: 'Add credit card' })
    await user.type(within(cardPanel).getByLabelText('Card name'), 'Gold Card')
    await user.type(within(cardPanel).getByLabelText('Provider'), 'Capital One')
    await user.type(within(cardPanel).getByLabelText('Limit'), '1200')
    await user.clear(within(cardPanel).getByLabelText('Due day'))
    await user.type(within(cardPanel).getByLabelText('Due day'), '9')
    await user.click(within(cardPanel).getByRole('button', { name: 'Add card' }))

    expect(actions.addCreditCard).toHaveBeenCalledWith({
      color: '#2563eb',
      dueDate: null,
      dueDay: 9,
      limitPence: 120000,
      name: 'Gold Card',
      provider: 'Capital One',
    })

    const customPanel = screen.getByRole('region', { name: 'Add saved payment' })
    await user.type(within(customPanel).getByLabelText('Payment name'), 'Tyres')
    await user.type(within(customPanel).getByLabelText('Amount'), '30')
    await user.clear(within(customPanel).getByLabelText('Due date'))
    await user.type(within(customPanel).getByLabelText('Due date'), '2026-05-20')
    await user.selectOptions(within(customPanel).getByLabelText('Credit card'), 'card-amex')
    await user.click(within(customPanel).getByRole('button', { name: 'Add payment' }))

    expect(actions.addCustomPayment).toHaveBeenCalledWith({
      amountPence: 3000,
      creditCardId: 'card-amex',
      dueDate: '2026-05-20',
      name: 'Tyres',
    })

    const repaymentPanel = screen.getByRole('region', { name: 'Record card repayment' })
    await user.type(within(repaymentPanel).getByLabelText('Amount'), '12.50')
    await user.type(within(repaymentPanel).getByLabelText('Note'), 'Part payment')
    await user.click(within(repaymentPanel).getByRole('button', { name: 'Record repayment' }))

    expect(actions.addCreditCardRepayment).toHaveBeenCalledWith({
      amountPence: 1250,
      creditCardId: 'card-amex',
      date: toIsoDate(new Date()),
      note: 'Part payment',
    })
  })

  it('shows credit card diagrams and paycheck impact from linked payments', () => {
    const snapshot = createSnapshot({
      payPeriods: [
        {
          id: 'period-current',
          startDate: '2026-05-16',
          endDate: '2026-05-29',
          payday: '2026-05-16',
          nextPayday: '2026-05-30',
          incomePence: 90000,
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      creditCards: [
        {
          id: 'card-amex',
          name: 'Everyday Amex',
          provider: 'Amex',
          limitPence: 100000,
          dueDay: 12,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'rec-phone',
          name: 'Phone',
          amountPence: 2200,
          dueDay: 23,
          frequency: 'monthly',
          potId: 'pot-bills',
          creditCardId: 'card-amex',
          priority: 'important',
          active: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'txn-card',
          potId: 'pot-food',
          payPeriodId: 'period-current',
          amountPence: 5000,
          type: 'spending',
          paymentMethod: 'credit_card',
          creditCardId: 'card-amex',
          date: '2026-05-18',
          note: 'Groceries',
          createdAt: '2026-05-18T00:00:00.000Z',
          updatedAt: '2026-05-18T00:00:00.000Z',
        },
      ],
    })

    render(
      <AllocatingPaymentsPage
        snapshot={snapshot}
        actions={createActions()}
        selectedPayPeriod={snapshot.payPeriods[0]}
      />,
    )

    expect(screen.getAllByText('Everyday Amex').length).toBeGreaterThan(0)
    expect(screen.getByText('Owed')).toBeInTheDocument()
    expect(screen.getAllByText('£72.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Remaining after cards').length).toBeGreaterThan(0)
    expect(screen.getAllByText('£828.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Groceries').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Phone').length).toBeGreaterThan(0)
  })
})

describe('pots page', () => {
  it('edits and deletes pots after confirmation', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<PotsPage snapshot={createSnapshot()} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Edit Food' }))

    const editPanel = screen.getByRole('region', { name: 'Edit pot' })
    await user.clear(within(editPanel).getByLabelText('Pot name'))
    await user.type(within(editPanel).getByLabelText('Pot name'), 'Groceries')
    await user.click(within(editPanel).getByRole('button', { name: 'Save pot' }))

    expect(actions.updatePot).toHaveBeenCalledWith('pot-food', {
      balancePence: 12000,
      color: '#16a34a',
      name: 'Groceries',
      type: 'spending',
    })

    await user.click(screen.getByRole('button', { name: 'Delete Food' }))

    expect(confirmSpy).toHaveBeenCalledWith('Delete Food?')
    expect(actions.deletePot).toHaveBeenCalledWith('pot-food')

    confirmSpy.mockRestore()
  })

  it('expands a pot to show spending, recurring payments, and allocations tied to it', async () => {
    const user = userEvent.setup()
    const snapshot = createSnapshot({
      payPeriods: [
        {
          id: 'period-current',
          startDate: '2026-05-16',
          endDate: '2026-05-29',
          payday: '2026-05-16',
          nextPayday: '2026-05-30',
          incomePence: 90000,
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      potAllocations: [
        {
          id: 'allocation-food',
          payPeriodId: 'period-current',
          potId: 'pot-food',
          amountPence: 7500,
          source: 'manual',
          recurringPaymentId: null,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'meal-kit',
          name: 'Meal kit',
          amountPence: 1800,
          dueDay: 20,
          frequency: 'monthly',
          potId: 'pot-food',
          priority: 'important',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'txn-food',
          potId: 'pot-food',
          payPeriodId: 'period-current',
          amountPence: 1250,
          type: 'spending',
          date: '2026-05-17',
          note: 'Lunch',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
        {
          id: 'txn-bills',
          potId: 'pot-bills',
          payPeriodId: 'period-current',
          amountPence: 8500,
          type: 'spending',
          date: '2026-05-18',
          note: 'Direct debit',
          createdAt: '2026-05-18T00:00:00.000Z',
          updatedAt: '2026-05-18T00:00:00.000Z',
        },
      ],
    })

    render(<PotsPage snapshot={snapshot} actions={createActions()} />)

    expect(screen.queryByText('Lunch')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'View Food activity' }))

    const activity = screen.getByRole('region', { name: 'Food activity' })
    expect(within(activity).getAllByText('Lunch').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('Spending · 2026-05-17').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('-£12.50').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('Paycheck allocation').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('Allocation · 2026-05-16').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('+£75.00').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('Meal kit').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('Recurring · monthly · day 20').length).toBeGreaterThan(0)
    expect(within(activity).queryByText('Direct debit')).not.toBeInTheDocument()
  })
})

describe('recurring page', () => {
  it('shows a dated recurring calendar', () => {
    const snapshot = createSnapshot({
      recurringPayments: [
        {
          id: 'rec-phone',
          name: 'Phone',
          amountPence: 2200,
          dueDay: 23,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'important',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      payPeriods: [
        {
          id: 'period-current',
          startDate: '2026-05-16',
          endDate: '2026-05-29',
          payday: '2026-05-16',
          nextPayday: '2026-05-30',
          incomePence: 90000,
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<RecurringPage snapshot={snapshot} actions={createActions()} selectedPayPeriod={snapshot.payPeriods[0]} />)

    expect(screen.getByRole('region', { name: 'Recurring calendar' })).toBeInTheDocument()
    expect(screen.getAllByText('Phone').length).toBeGreaterThan(0)
    expect(screen.getByText(/23 May/)).toBeInTheDocument()
    expect(screen.getByText('Before payday')).toBeInTheDocument()
  })

  it('shows a next payday owed dropdown with the next pay period costs', () => {
    const snapshot = createSnapshot({
      recurringPayments: [
        {
          id: 'rec-rent',
          name: 'Rent',
          amountPence: 65000,
          dueDay: 1,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'essential',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      customPayments: [
        {
          id: 'custom-mot',
          name: 'MOT',
          amountPence: 4500,
          dueDate: '2026-06-02',
          creditCardId: null,
          status: 'unpaid',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      debts: [
        {
          id: 'debt-loan',
          name: 'Loan',
          lender: 'Finance Co',
          originalAmountPence: 100000,
          currentBalancePence: 80000,
          minimumPaymentPence: 4000,
          dueDate: '2026-06-03',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      payPeriods: [
        {
          id: 'period-current',
          startDate: '2026-05-16',
          endDate: '2026-05-29',
          payday: '2026-05-16',
          nextPayday: '2026-05-30',
          payFrequency: 'biweekly',
          incomePence: 90000,
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<RecurringPage snapshot={snapshot} actions={createActions()} selectedPayPeriod={snapshot.payPeriods[0]} />)

    const nextPaydayPanel = screen.getByRole('region', { name: 'What you owe next payday' })
    expect(within(nextPaydayPanel).getAllByText('Total owed next payday').length).toBeGreaterThan(0)
    expect(within(nextPaydayPanel).getByText('2026-05-30 to 2026-06-12')).toBeInTheDocument()
    expect(within(nextPaydayPanel).getAllByText('£1,495.00').length).toBeGreaterThan(0)
    expect(within(nextPaydayPanel).getByText('Rent')).toBeInTheDocument()
    expect(within(nextPaydayPanel).getByText('MOT')).toBeInTheDocument()
    expect(within(nextPaydayPanel).getByText('Loan')).toBeInTheDocument()
  })

  it('edits an existing recurring payment', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const snapshot = createSnapshot({
      recurringPayments: [
        {
          id: 'rec-phone',
          name: 'Phone',
          amountPence: 2200,
          dueDay: 23,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'important',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<RecurringPage snapshot={snapshot} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Edit Phone' }))

    const editPanel = screen.getByRole('region', { name: 'Edit recurring payment' })
    await user.clear(within(editPanel).getByLabelText('Amount'))
    await user.type(within(editPanel).getByLabelText('Amount'), '25.50')
    await user.selectOptions(within(editPanel).getByLabelText('Frequency'), 'yearly')
    await user.click(within(editPanel).getByRole('button', { name: 'Save recurring payment' }))

    expect(actions.updateRecurringPayment).toHaveBeenCalledWith('rec-phone', {
      amountPence: 2550,
      dueDay: 23,
      frequency: 'yearly',
      name: 'Phone',
      potId: 'pot-bills',
      priority: 'important',
    })
  })
})

describe('dashboard page', () => {
  it('lets the selected pay period change from the dashboard selector', async () => {
    const user = userEvent.setup()
    const onPayPeriodChange = vi.fn()
    const snapshot = createSnapshot({
      payPeriods: [
        {
          id: 'period-current',
          startDate: '2026-05-16',
          endDate: '2026-05-29',
          payday: '2026-05-16',
          nextPayday: '2026-05-30',
          incomePence: 90000,
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'period-next',
          startDate: '2026-05-30',
          endDate: '2026-06-12',
          payday: '2026-05-30',
          nextPayday: '2026-06-13',
          incomePence: 95000,
          status: 'planned',
          createdAt: '2026-05-30T00:00:00.000Z',
          updatedAt: '2026-05-30T00:00:00.000Z',
        },
      ],
    })

    render(
      <DashboardPage
        snapshot={snapshot}
        selectedPayPeriod={snapshot.payPeriods[0]}
        onPayPeriodChange={onPayPeriodChange}
        onViewChange={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Viewing pay period' }), 'period-next')

    expect(onPayPeriodChange).toHaveBeenCalledWith('period-next')
  })

  it('shows one clear pay summary with correct current period maths', () => {
    const snapshot = createSnapshot({
      payPeriods: [
        {
          id: 'period-current',
          startDate: '2026-05-22',
          endDate: '2026-06-04',
          payday: '2026-05-22',
          nextPayday: '2026-06-05',
          payFrequency: 'biweekly',
          incomePence: 79800,
          status: 'active',
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'applecare',
          name: 'AppleCare',
          amountPence: 1000,
          dueDay: 19,
          frequency: 'monthly',
          potId: 'pot-bills',
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
          potId: 'pot-bills',
          priority: 'essential',
          active: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'fuel',
          name: 'Fuel',
          amountPence: 14000,
          dueDay: 1,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'important',
          active: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'gym',
          name: 'Gym',
          amountPence: 2500,
          dueDay: 1,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'optional',
          active: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      potAllocations: [
        {
          id: 'allocation-insurance',
          payPeriodId: 'period-current',
          potId: 'pot-bills',
          amountPence: 8500,
          source: 'recurring',
          recurringPaymentId: 'insurance',
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
        {
          id: 'allocation-fuel',
          payPeriodId: 'period-current',
          potId: 'pot-bills',
          amountPence: 14000,
          source: 'recurring',
          recurringPaymentId: 'fuel',
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
        {
          id: 'allocation-gym',
          payPeriodId: 'period-current',
          potId: 'pot-bills',
          amountPence: 2500,
          source: 'recurring',
          recurringPaymentId: 'gym',
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
    })

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} onViewChange={vi.fn()} />)

    const currentPeriod = screen.getByRole('region', { name: 'Selected pay period' })
    expect(within(currentPeriod).getAllByText('Total pay').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('Total costs').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('Money left').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('£798.00').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('£250.00').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('£548.00').length).toBeGreaterThan(0)
    expect(screen.queryByText('Safe today')).not.toBeInTheDocument()
    expect(screen.queryByText('Available after bills')).not.toBeInTheDocument()
  })

  it('deducts planned debt reserves and only counts the unreserved debt due amount', () => {
    const snapshot = createSnapshot({
      payPeriods: [
        {
          id: 'period-current',
          startDate: '2026-05-22',
          endDate: '2026-06-04',
          payday: '2026-05-22',
          nextPayday: '2026-06-05',
          payFrequency: 'biweekly',
          incomePence: 100000,
          status: 'active',
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      debts: [
        {
          id: 'debt-card',
          name: 'Card balance',
          lender: 'Card Provider',
          originalAmountPence: 50000,
          currentBalancePence: 50000,
          minimumPaymentPence: 0,
          dueDate: '2026-05-30',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
      debtReserves: [
        {
          id: 'reserve-card',
          debtId: 'debt-card',
          payPeriodId: 'period-current',
          payday: '2026-05-22',
          periodStartDate: '2026-05-22',
          periodEndDate: '2026-06-04',
          amountPence: 20000,
          status: 'planned',
          source: 'assistant',
          note: 'Reserve part of the debt',
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
    })

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} onViewChange={vi.fn()} />)

    const currentPeriod = screen.getByRole('region', { name: 'Selected pay period' })
    expect(within(currentPeriod).getAllByText('£500.00').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('£200.00').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('£300.00').length).toBeGreaterThan(0)
  })

  it('keeps projection and daily average metrics off the simplified dashboard', () => {
    const snapshot = createSnapshot({
      payPeriods: [
        {
          id: 'period-current',
          startDate: '2026-05-16',
          endDate: '2026-05-29',
          payday: '2026-05-16',
          nextPayday: '2026-05-30',
          incomePence: 90000,
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'txn-food',
          potId: 'pot-food',
          payPeriodId: 'period-current',
          amountPence: 1250,
          type: 'spending',
          date: '2026-05-18',
          note: 'Lunch',
          createdAt: '2026-05-18T00:00:00.000Z',
          updatedAt: '2026-05-18T00:00:00.000Z',
        },
      ],
    })

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} onViewChange={vi.fn()} />)

    expect(screen.queryByRole('region', { name: 'Budget insights' })).not.toBeInTheDocument()
    expect(screen.queryByText('Daily average')).not.toBeInTheDocument()
    expect(screen.queryByText('Projected spend')).not.toBeInTheDocument()
  })

})

describe('history page', () => {
  it('deletes a paycheck plan from history after confirmation', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <HistoryPage
        snapshot={createSnapshot({
          payPeriods: [
            {
              id: 'period-current',
              startDate: '2026-05-16',
              endDate: '2026-05-29',
              payday: '2026-05-16',
              nextPayday: '2026-05-30',
              incomePence: 90000,
              status: 'active',
              createdAt: '2026-05-16T00:00:00.000Z',
              updatedAt: '2026-05-16T00:00:00.000Z',
            },
          ],
        })}
        actions={actions}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete paycheck plan for 2026-05-16' }))

    expect(confirmSpy).toHaveBeenCalledWith('Delete paycheck plan for 2026-05-16?')
    expect(actions.deletePayPeriod).toHaveBeenCalledWith('period-current')

    confirmSpy.mockRestore()
  })
})

describe('debts page', () => {
  it('records a debt payment against the selected debt', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const today = toIsoDate(new Date())
    const snapshot = createSnapshot({
      debts: [
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
      ],
    })

    render(<DebtsPage snapshot={snapshot} actions={actions} />)

    const paymentPanel = screen.getByRole('region', { name: 'Record debt payment' })
    await user.selectOptions(within(paymentPanel).getByLabelText('Debt'), 'debt-card')
    await user.type(within(paymentPanel).getByLabelText('Payment amount'), '25.00')
    await user.type(within(paymentPanel).getByLabelText('Payment note'), 'Extra payment')
    await user.click(within(paymentPanel).getByRole('button', { name: 'Record payment' }))

    expect(actions.addDebtPayment).toHaveBeenCalledWith({
      amountPence: 2500,
      date: today,
      debtId: 'debt-card',
      note: 'Extra payment',
    })
  })

  it('creates a new debt with amount, due date, lender, and minimum payment', async () => {
    const user = userEvent.setup()
    const actions = createActions()

    render(<DebtsPage snapshot={createSnapshot()} actions={actions} />)

    const debtPanel = screen.getByRole('region', { name: 'Add debt' })
    await user.type(within(debtPanel).getByLabelText('Debt name'), 'Car finance')
    await user.type(within(debtPanel).getByLabelText('Lender'), 'Finance Co')
    await user.type(within(debtPanel).getByLabelText('Current balance'), '4000')
    await user.type(within(debtPanel).getByLabelText('Minimum payment'), '120')
    await user.clear(within(debtPanel).getByLabelText('Due date'))
    await user.type(within(debtPanel).getByLabelText('Due date'), '2026-06-01')
    await user.click(within(debtPanel).getByRole('button', { name: 'Add debt' }))

    expect(actions.addDebt).toHaveBeenCalledWith({
      currentBalancePence: 400000,
      dueDate: '2026-06-01',
      interestRateApr: null,
      lender: 'Finance Co',
      minimumPaymentPence: 12000,
      name: 'Car finance',
      note: '',
    })
  })

  it('allows an active debt without a minimum payment', async () => {
    const user = userEvent.setup()
    const actions = createActions()

    render(<DebtsPage snapshot={createSnapshot()} actions={actions} />)

    const debtPanel = screen.getByRole('region', { name: 'Add debt' })
    await user.type(within(debtPanel).getByLabelText('Debt name'), 'Store card')
    await user.type(within(debtPanel).getByLabelText('Lender'), 'Retail Bank')
    await user.type(within(debtPanel).getByLabelText('Current balance'), '300')
    await user.clear(within(debtPanel).getByLabelText('Due date'))
    await user.type(within(debtPanel).getByLabelText('Due date'), '2026-05-23')

    expect(within(debtPanel).getByRole('button', { name: 'Add debt' })).toBeEnabled()
    await user.click(within(debtPanel).getByRole('button', { name: 'Add debt' }))

    expect(actions.addDebt).toHaveBeenCalledWith({
      currentBalancePence: 30000,
      dueDate: '2026-05-23',
      interestRateApr: null,
      lender: 'Retail Bank',
      minimumPaymentPence: 0,
      name: 'Store card',
      note: '',
    })
  })

  it('shows the full balance as due for active debts even when minimum payment is zero', () => {
    render(
      <DebtsPage
        snapshot={createSnapshot({
          payPeriods: [
            {
              id: 'period-current',
              startDate: '2026-05-16',
              endDate: '2026-05-29',
              payday: '2026-05-16',
              nextPayday: '2026-05-30',
              payFrequency: 'biweekly',
              incomePence: 90000,
              status: 'active',
              createdAt: '2026-05-16T00:00:00.000Z',
              updatedAt: '2026-05-16T00:00:00.000Z',
            },
          ],
          debts: [
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
            {
              id: 'debt-next-period',
              name: 'Next period debt',
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
        })}
        actions={createActions()}
      />,
    )

    const debtDueMetric = screen.getAllByText('Debt due this pay period')[0].closest('details')

    expect(debtDueMetric).not.toBeNull()
    expect(within(debtDueMetric as HTMLElement).getAllByText('£300.00').length).toBeGreaterThan(0)
    expect(within(debtDueMetric as HTMLElement).queryByText('Next period debt')).not.toBeInTheDocument()
    expect(screen.getAllByText('Due amount').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Optional').length).toBeGreaterThan(0)
  })

  it('does not treat a future paycheck plan as the current pay period', () => {
    render(
      <DebtsPage
        snapshot={createSnapshot({
          payPeriods: [
            {
              id: 'period-next',
              startDate: '2026-05-22',
              endDate: '2026-06-04',
              payday: '2026-05-22',
              nextPayday: '2026-06-05',
              payFrequency: 'biweekly',
              incomePence: 90000,
              status: 'planned',
              createdAt: '2026-05-20T00:00:00.000Z',
              updatedAt: '2026-05-20T00:00:00.000Z',
            },
          ],
          debts: [
            {
              id: 'debt-future-period',
              name: 'Future period debt',
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
        })}
        actions={createActions()}
      />,
    )

    const debtDueMetric = screen.getAllByText('Debt due this pay period')[0].closest('details')

    expect(debtDueMetric).not.toBeNull()
    expect(within(debtDueMetric as HTMLElement).getAllByText('£0.00').length).toBeGreaterThan(0)
    expect(within(debtDueMetric as HTMLElement).getByText('No active pay period today')).toBeInTheDocument()
    expect(within(debtDueMetric as HTMLElement).getByText(/Next saved period starts 2026-05-22/)).toBeInTheDocument()
    expect(within(debtDueMetric as HTMLElement).queryByText('Future period debt')).not.toBeInTheDocument()
  })
})

function createActions(): TestActions {
  return {
    refresh: vi.fn(async () => {}),
    updateSettings: vi.fn(async () => {}),
    addPot: vi.fn(async () => {}),
    updatePot: vi.fn(async () => {}),
    deletePot: vi.fn(async () => {}),
    addCreditCard: vi.fn(async () => {}),
    updateCreditCard: vi.fn(async () => {}),
    archiveCreditCard: vi.fn(async () => {}),
    addCustomPayment: vi.fn(async () => {}),
    updateCustomPayment: vi.fn(async () => {}),
    deleteCustomPayment: vi.fn(async () => {}),
    addCreditCardRepayment: vi.fn(async () => {}),
    updateCreditCardRepayment: vi.fn(async () => {}),
    deleteCreditCardRepayment: vi.fn(async () => {}),
    addDailyBrief: vi.fn(async () => {}),
    addRecurringPayment: vi.fn(async () => {}),
    updateRecurringPayment: vi.fn(async () => {}),
    toggleRecurringPayment: vi.fn(async () => {}),
    deleteRecurringPayment: vi.fn(async () => {}),
    addTransaction: vi.fn(async () => {}),
    updateTransaction: vi.fn(async () => {}),
    deleteTransaction: vi.fn(async () => {}),
    addDebt: vi.fn(async () => {}),
    updateDebt: vi.fn(async () => {}),
    deleteDebt: vi.fn(async () => {}),
    addDebtPayment: vi.fn(async () => {}),
    deleteDebtPayment: vi.fn(async () => {}),
    addDebtReserve: vi.fn(async () => {}),
    updateDebtReserve: vi.fn(async () => {}),
    cancelDebtReserve: vi.fn(async () => {}),
    skipDebtReserve: vi.fn(async () => {}),
    applyDebtReserve: vi.fn(async () => {}),
    createPaycheckPlan: vi.fn(async () => {}),
    deletePayPeriod: vi.fn(async () => {}),
    resetPlannerData: vi.fn(async () => {}),
  }
}

function createSnapshot(overrides: Partial<PlannerSnapshot> = {}): PlannerSnapshot {
  const timestamp = '2026-05-16T00:00:00.000Z'
  const recurringPayments = overrides.recurringPayments as RecurringPayment[] | undefined
  const transactions = overrides.transactions as Transaction[] | undefined

  return {
    settings: {
      id: 'default',
      currency: 'GBP',
      payFrequency: 'biweekly',
      defaultPayPeriodDays: 14,
      hourlyRatePence: 1250,
      defaultHoursWorked: 72,
      aiInstructions: '',
      aiProvider: 'gemini',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    pots: [
      {
        id: 'pot-bills',
        name: 'Bills',
        type: 'reserved',
        balancePence: 40000,
        targetPence: null,
        color: '#2563eb',
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'pot-food',
        name: 'Food',
        type: 'spending',
        balancePence: 12000,
        targetPence: null,
        color: '#16a34a',
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    recurringPayments: recurringPayments ?? [],
    payPeriods: [],
    paychecks: [],
    potAllocations: [],
    transactions: transactions ?? [],
    debts: [],
    debtPayments: [],
    debtReserves: [],
    creditCards: [],
    customPayments: [],
    creditCardRepayments: [],
    dailyBriefs: [],
    ...overrides,
  }
}

function createPayPeriod(overrides: Partial<PlannerSnapshot['payPeriods'][number]> = {}): PlannerSnapshot['payPeriods'][number] {
  const timestamp = '2026-05-16T00:00:00.000Z'

  return {
    id: 'period-current',
    startDate: '2026-05-16',
    endDate: '2026-05-29',
    payday: '2026-05-16',
    nextPayday: '2026-05-30',
    payFrequency: 'biweekly',
    incomePence: 90000,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}
