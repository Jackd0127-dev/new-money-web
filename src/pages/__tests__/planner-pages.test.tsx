import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardPage } from '../DashboardPage'
import { DebtsPage } from '../DebtsPage'
import { HistoryPage } from '../HistoryPage'
import { AiPlanPage } from '../AiPlanPage'
import { AllocatingPaymentsPage } from '../AllocatingPaymentsPage'
import { CalendarPage } from '../CalendarPage'
import { PaydayWizardPage } from '../PaydayWizardPage'
import { PotsPage } from '../PotsPage'
import { RecurringPage } from '../RecurringPage'
import { SavingsInvestmentsPage } from '../SavingsInvestmentsPage'
import { SettingsPage } from '../SettingsPage'
import { SpendingPage } from '../SpendingPage'
import { AppAssistant } from '../../components/AppAssistant'
import { AuthScreen } from '../../components/AuthScreen'
import { AppShell } from '../../components/AppShell'
import { creditCardDesigns } from '../../domain/creditCardDesigns'
import { toIsoDate } from '../../domain/money'
import type { FirebaseAuthController } from '../../hooks/useFirebaseAuth'
import type { PlannerActions, PlannerSnapshot } from '../../hooks/usePlannerData'
import type { RecurringPayment, Transaction } from '../../types/models'

type TestActions = PlannerActions & {
  addDebt: ReturnType<typeof vi.fn>
  addDebtPayment: ReturnType<typeof vi.fn>
  addCreditCard: ReturnType<typeof vi.fn>
  addCreditCardPot: ReturnType<typeof vi.fn>
  addCustomPayment: ReturnType<typeof vi.fn>
  addCreditCardRepayment: ReturnType<typeof vi.fn>
  applyCreditCardPot: ReturnType<typeof vi.fn>
  deletePot: ReturnType<typeof vi.fn>
  deleteCreditCardPot: ReturnType<typeof vi.fn>
  deletePayPeriod: ReturnType<typeof vi.fn>
  updateCreditCard: ReturnType<typeof vi.fn>
  updateCreditCardPot: ReturnType<typeof vi.fn>
  updateCreditCardRepayment: ReturnType<typeof vi.fn>
  updateCustomPayment: ReturnType<typeof vi.fn>
  updatePot: ReturnType<typeof vi.fn>
  upsertPaycheckPotAllocation: ReturnType<typeof vi.fn>
  deletePaycheckPotAllocation: ReturnType<typeof vi.fn>
  updateRecurringPayment: ReturnType<typeof vi.fn>
  updateTransaction: ReturnType<typeof vi.fn>
  addDebtReserve: ReturnType<typeof vi.fn>
  updateDebtReserve: ReturnType<typeof vi.fn>
  cancelDebtReserve: ReturnType<typeof vi.fn>
  skipDebtReserve: ReturnType<typeof vi.fn>
  applyDebtReserve: ReturnType<typeof vi.fn>
  updatePlannerDataToLatest: ReturnType<typeof vi.fn>
}

describe('app shell navigation', () => {
  it('orders tabs around the main paycheck workflow', () => {
    render(
      <AppShell activeView="dashboard" onViewChange={vi.fn()}>
        <div>Page content</div>
      </AppShell>,
    )

    const sidebarNav = screen.getAllByRole('navigation')[0]
    const labels = within(sidebarNav).getAllByRole('button').map((button) => button.textContent)

    expect(labels).toEqual([
      'Overview',
      'Payday',
      'Spending',
      'Cards',
      'Bills',
      'Pots',
      'Savings',
      'Debts',
      'Calendar',
      'Jimbo',
      'Settings',
    ])
  })

  it('keeps renamed navigation labels mapped to the existing view keys', async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn()

    render(
      <AppShell activeView="dashboard" onViewChange={onViewChange}>
        <div>Page content</div>
      </AppShell>,
    )

    const sidebarNav = screen.getByRole('navigation', { name: 'Primary navigation' })

    await user.click(within(sidebarNav).getByRole('button', { name: 'Overview' }))
    await user.click(within(sidebarNav).getByRole('button', { name: 'Payday' }))
    await user.click(within(sidebarNav).getByRole('button', { name: 'Cards' }))
    await user.click(within(sidebarNav).getByRole('button', { name: 'Bills' }))
    await user.click(within(sidebarNav).getByRole('button', { name: 'Savings' }))
    await user.click(within(sidebarNav).getByRole('button', { name: 'Jimbo' }))

    expect(onViewChange).toHaveBeenNthCalledWith(1, 'dashboard')
    expect(onViewChange).toHaveBeenNthCalledWith(2, 'payday')
    expect(onViewChange).toHaveBeenNthCalledWith(3, 'allocatingPayments')
    expect(onViewChange).toHaveBeenNthCalledWith(4, 'recurring')
    expect(onViewChange).toHaveBeenNthCalledWith(5, 'savingsInvestments')
    expect(onViewChange).toHaveBeenNthCalledWith(6, 'aiPlan')
  })

  it('keeps desktop navigation scrollable so all tabs can be reached', () => {
    render(
      <AppShell activeView="dashboard" onViewChange={vi.fn()}>
        <div>Page content</div>
      </AppShell>,
    )

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toHaveClass('overflow-y-auto')
  })

  it('uses the premium shell treatment without changing navigation callbacks', async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn()

    render(
      <AppShell
        activeView="spending"
        onViewChange={onViewChange}
        selectedPayPeriod={createPayPeriod({ startDate: '2026-05-31', endDate: '2026-06-13' })}
      >
        <div>Page content</div>
      </AppShell>,
    )

    const sidebar = screen.getByRole('complementary', { name: 'Application sidebar' })
    const primaryNav = screen.getByRole('navigation', { name: 'Primary navigation' })
    const activeNavItem = within(primaryNav).getByRole('button', { name: 'Spending' })

    expect(sidebar).toHaveClass('bg-[var(--color-emerald)]')
    expect(activeNavItem).toHaveAttribute('aria-current', 'page')
    expect(activeNavItem).toHaveClass('bg-[var(--color-accent)]')
    expect(screen.queryByText('Paycheck flow')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Spending' })).toBeInTheDocument()
    expect(screen.getByText('31 May 26 to 13 Jun 26')).toBeInTheDocument()

    await user.click(within(primaryNav).getByRole('button', { name: 'Calendar' }))

    expect(onViewChange).toHaveBeenCalledWith('calendar')
  })

  it('uses bottom mobile tabs and a capped desktop content width', () => {
    render(
      <AppShell activeView="dashboard" onViewChange={vi.fn()}>
        <div>Page content</div>
      </AppShell>,
    )

    const mobileTabs = screen.getByRole('navigation', { name: 'Mobile tab navigation' })
    const main = screen.getByRole('main')

    expect(mobileTabs).toHaveClass('fixed')
    expect(mobileTabs).toHaveClass('bottom-0')
    expect(mobileTabs).toHaveClass('lg:hidden')
    expect(mobileTabs).not.toHaveClass('mt-3')
    expect(within(mobileTabs).getByRole('button', { name: 'Overview' })).toHaveClass('min-h-11')
    expect(main).toHaveClass('max-w-[1320px]')
    expect(main).toHaveClass('pb-28')
  })
})

describe('auth screen', () => {
  it('signs in with email from the app entry screen', async () => {
    const user = userEvent.setup()
    const auth = createAuth()

    render(<AuthScreen auth={auth} />)

    await user.type(screen.getByLabelText('Email'), 'money@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret12')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(auth.signInWithEmail).toHaveBeenCalledWith('money@example.com', 'secret12')
    expect(screen.queryByRole('button', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('blocks the planner when Firebase sign-in is unavailable', () => {
    render(<AuthScreen auth={createAuth({ isConfigured: false })} />)

    expect(screen.getByText('Sign-in is not configured for this deployment, so the planner cannot be opened.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})

describe('savings and investments page', () => {
  it('sets aside selected paycheck money into a savings pot', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      pots: [
        {
          id: 'pot-emergency',
          name: 'Emergency fund',
          type: 'saving',
          category: 'Savings',
          icon: 'savings',
          balancePence: 10000,
          targetPence: 100000,
          color: '#16a34a',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'pot-index',
          name: 'Index fund',
          type: 'investment',
          category: 'Investments',
          icon: 'target',
          balancePence: 25000,
          targetPence: null,
          color: '#7c3aed',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'pot-food',
          name: 'Food',
          type: 'spending',
          balancePence: 12000,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(
      <SavingsInvestmentsPage
        snapshot={snapshot}
        actions={actions}
        selectedPayPeriod={selectedPayPeriod}
      />,
    )

    expect(screen.getAllByText('Emergency fund').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Index fund').length).toBeGreaterThan(0)
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
    expect(screen.queryByText('Allocation preview')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Savings or investment pot'), 'pot-emergency')
    await user.type(screen.getByLabelText('Amount to set aside'), '35.00')
    expect(screen.getByText('Allocation preview')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Set aside money' }))

    expect(actions.upsertPaycheckPotAllocation).toHaveBeenCalledWith({
      id: 'savings-investments-period-current-pot-emergency',
      payPeriodId: 'period-current',
      potId: 'pot-emergency',
      amountPence: 3500,
    })
  })

  it('adds to the existing savings allocation for the selected paycheck', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      pots: [
        {
          id: 'pot-index',
          name: 'Index fund',
          type: 'investment',
          category: 'Investments',
          icon: 'target',
          balancePence: 25000,
          targetPence: null,
          color: '#7c3aed',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      potAllocations: [
        {
          id: 'savings-investments-period-current-pot-index',
          payPeriodId: 'period-current',
          potId: 'pot-index',
          amountPence: 2000,
          source: 'manual',
          recurringPaymentId: null,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(
      <SavingsInvestmentsPage
        snapshot={snapshot}
        actions={actions}
        selectedPayPeriod={selectedPayPeriod}
      />,
    )

    expect(screen.getByText('This paycheck set-aside £20.00')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Savings or investment pot'), 'pot-index')
    await user.type(screen.getByLabelText('Amount to set aside'), '15.00')
    await user.click(screen.getByRole('button', { name: 'Set aside money' }))

    expect(actions.upsertPaycheckPotAllocation).toHaveBeenCalledWith({
      id: 'savings-investments-period-current-pot-index',
      payPeriodId: 'period-current',
      potId: 'pot-index',
      amountPence: 3500,
    })
  })
})

describe('calendar page', () => {
  it('renders a mobile agenda view while keeping the desktop month grid', () => {
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
    })

    render(
      <CalendarPage
        snapshot={createSnapshot({
          settings: createSettings({ appDateMode: 'manual', manualTodayIso: '2026-05-16' }),
          payPeriods: [selectedPayPeriod],
        })}
        selectedPayPeriod={selectedPayPeriod}
      />,
    )

    const agenda = screen.getByRole('region', { name: 'Calendar agenda' })
    const monthGrid = screen.getByRole('region', { name: 'Calendar month grid' })
    const paydayGroup = within(agenda).getByRole('region', { name: 'Agenda for 16 May 2026' })

    expect(agenda).toHaveClass('md:hidden')
    expect(within(agenda).getAllByText(/Income/).length).toBeGreaterThan(0)
    expect(within(paydayGroup).getByText(/16 May 2026/)).toBeInTheDocument()
    expect(within(paydayGroup).getByText('Today')).toBeInTheDocument()
    expect(monthGrid).toHaveClass('hidden')
    expect(monthGrid).toHaveClass('md:block')
  })

  it('uses six display categories without changing event dates', () => {
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      pots: [
        {
          id: 'pot-holiday',
          name: 'Holiday',
          type: 'saving',
          category: 'Savings',
          icon: 'savings',
          balancePence: 12000,
          targetPence: 50000,
          color: '#16a34a',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      potAllocations: [
        {
          id: 'allocation-holiday',
          payPeriodId: 'period-current',
          potId: 'pot-holiday',
          amountPence: 2500,
          source: 'manual',
          recurringPaymentId: null,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'rec-phone',
          name: 'Phone bill',
          amountPence: 2200,
          dueDay: 17,
          dueDate: '2026-05-17',
          frequency: 'monthly',
          potId: null,
          creditCardId: null,
          priority: 'important',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      creditCards: [
        {
          id: 'card-amex',
          name: 'Everyday',
          provider: 'Amex',
          limitPence: 100000,
          dueDate: '2026-05-18',
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      customPayments: [
        {
          id: 'custom-mot',
          name: 'MOT',
          amountPence: 4500,
          dueDate: '2026-05-17',
          creditCardId: 'card-amex',
          status: 'unpaid',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      debts: [
        {
          id: 'debt-loan',
          name: 'Personal loan',
          lender: 'Loan Provider',
          originalAmountPence: 50000,
          currentBalancePence: 50000,
          minimumPaymentPence: 5000,
          dueDate: '2026-05-19',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'txn-groceries',
          potId: null,
          payPeriodId: 'period-current',
          amountPence: 1850,
          type: 'spending',
          date: '2026-05-20',
          note: 'Groceries',
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
    })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    const categories = within(screen.getByRole('list', { name: 'Calendar categories' })).getAllByRole('listitem')

    expect(categories.map((category) => category.textContent)).toEqual([
      'Income',
      'Bills',
      'Cards',
      'Debts',
      'Savings',
      'Spending',
    ])
    expect(categories[0]).toHaveClass('bg-lime-50')
    expect(screen.getByRole('button', { name: 'Open 16 May 2026' })).toHaveClass('bg-lime-50/80')
    expect(screen.getByRole('button', { name: 'Open 16 May 2026' })).toHaveTextContent('Paycheck received')
    expect(screen.getByRole('button', { name: 'Open 17 May 2026' })).toHaveTextContent('Phone bill')
    expect(screen.getByRole('button', { name: 'Open 18 May 2026' })).toHaveTextContent('Everyday card payment')
    expect(screen.getByRole('button', { name: 'Open 19 May 2026' })).toHaveTextContent('Personal loan')
    expect(screen.getByRole('button', { name: 'Open 20 May 2026' })).toHaveTextContent('Groceries')
    const agenda = screen.getByRole('region', { name: 'Calendar agenda' })
    const may16AgendaGroup = within(agenda).getByRole('region', { name: 'Agenda for 16 May 2026' })
    expect(within(may16AgendaGroup).getByText('Paycheck received')).toBeInTheDocument()
    expect(within(may16AgendaGroup).getByText('Holiday allocation')).toBeInTheDocument()
    expect(screen.getByText('Holiday allocation').closest('button')).toHaveTextContent('Savings')
    expect(screen.queryByText('Recurring')).not.toBeInTheDocument()
    expect(screen.queryByText('Subscription')).not.toBeInTheDocument()
    expect(screen.queryByText('Insurance')).not.toBeInTheDocument()
    expect(screen.queryByText('Saved payment')).not.toBeInTheDocument()
    expect(screen.queryByText('Card due')).not.toBeInTheDocument()
    expect(screen.queryByText('Credit pot')).not.toBeInTheDocument()
    expect(screen.queryByText('Pot allocation')).not.toBeInTheDocument()
    expect(screen.queryByText('Manual spend')).not.toBeInTheDocument()
  })

  it('groups card-linked recurring payments under the card payment instead of showing them twice', async () => {
    const user = userEvent.setup()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 78850,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      recurringPayments: [
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
      creditCards: [
        {
          id: 'card-barclays',
          name: 'Barclays',
          provider: 'Barclays',
          limitPence: 80000,
          openingBalancePence: 68005,
          dueDay: 5,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
        {
          id: 'card-capital-one',
          name: 'Capital One',
          provider: 'Capital One',
          limitPence: 50000,
          openingBalancePence: 0,
          dueDay: 5,
          dueDate: null,
          color: '#64748b',
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
    })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    expect(screen.queryByText('Calendar command centre')).not.toBeInTheDocument()
    expect(screen.queryByText('Busiest day')).not.toBeInTheDocument()
    expect(screen.queryByText('Month composition')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open 29 May 2026' }))
    expect(screen.getByRole('heading', { name: /Friday.*29 May 2026/ })).toBeInTheDocument()
    expect(screen.queryByText('Fuel')).not.toBeInTheDocument()
    expect(screen.queryByText('Personal')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to calendar' }))
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'Open 1 June 2026' }))
    expect(screen.queryByText('Gym')).not.toBeInTheDocument()
    expect(screen.queryByText('Fuel')).not.toBeInTheDocument()
    expect(screen.queryByText('Personal')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to calendar' }))
    await user.click(screen.getByRole('button', { name: 'Open 5 June 2026' }))
    expect(screen.getByText('Barclays card payment')).toBeInTheDocument()
    const barclaysCard = screen.getByText('Barclays card payment').closest('article') as HTMLElement
    await user.click(within(barclaysCard).getByRole('button', { name: 'Show breakdown for Barclays card payment -£95.00' }))
    expect(within(barclaysCard).getByText('Fuel')).toBeInTheDocument()
    expect(within(barclaysCard).getByText('Gym')).toBeInTheDocument()
    expect(within(barclaysCard).getByText('£95.00')).toBeInTheDocument()
    expect(screen.getByText('Capital One card payment')).toBeInTheDocument()
    const capitalOneCard = screen.getByText('Capital One card payment').closest('article') as HTMLElement
    await user.click(within(capitalOneCard).getByRole('button', { name: 'Show breakdown for Capital One card payment -£50.00' }))
    expect(within(capitalOneCard).getByText('Personal')).toBeInTheDocument()
    expect(within(capitalOneCard).getAllByText('£50.00').length).toBeGreaterThan(0)
  })

  it('shows statement direct debits with the payment breakdown on the calendar', async () => {
    const user = userEvent.setup()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-june',
      startDate: '2026-06-15',
      endDate: '2026-06-28',
      payday: '2026-06-15',
      nextPayday: '2026-06-29',
      incomePence: 78850,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
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
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
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
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
      creditCards: [
        {
          id: 'card-barclays',
          name: 'Barclays',
          provider: 'Barclays',
          limitPence: 80000,
          openingBalancePence: 60000,
          openingStatementBalancePence: 60000,
          statementDate: '2026-05-14',
          dueDay: 1,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
    })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    await user.click(screen.getByRole('button', { name: 'Open 1 June 2026' }))
    expect(screen.queryByText('Gym')).not.toBeInTheDocument()
    expect(screen.getByText('Barclays statement payment')).toBeInTheDocument()
    const juneCard = screen.getByText('Barclays statement payment').closest('article') as HTMLElement
    await user.click(within(juneCard).getByRole('button', { name: 'Show breakdown for Barclays statement payment -£600.00' }))
    expect(within(juneCard).getByText('Existing statement due')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to calendar' }))
    await user.click(screen.getByRole('button', { name: 'Open 1 July 2026' }))
    expect(screen.getByText('Barclays statement payment')).toBeInTheDocument()
    const julyCard = screen.getByText('Barclays statement payment').closest('article') as HTMLElement
    await user.click(within(julyCard).getByRole('button', { name: 'Show breakdown for Barclays statement payment -£165.00' }))
    expect(within(julyCard).getAllByText('Fuel')).toHaveLength(2)
    expect(within(julyCard).getByText('Gym')).toBeInTheDocument()
    expect(within(julyCard).getByText('£165.00')).toBeInTheDocument()
  })

  it('shows overpaid statement direct debits as covered instead of a negative total', async () => {
    const user = userEvent.setup()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-june',
      startDate: '2026-06-01',
      endDate: '2026-06-14',
      payday: '2026-06-01',
      nextPayday: '2026-06-15',
      incomePence: 78850,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      creditCards: [
        {
          id: 'card-capital-one',
          name: 'Capital One',
          provider: 'Capital One',
          limitPence: 80000,
          openingBalancePence: 37238,
          openingStatementBalancePence: 22271,
          statementDate: '2026-05-09',
          dueDay: 5,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
      creditCardRepayments: [
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
    })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    await user.click(screen.getByRole('button', { name: 'Open 5 June 2026' }))
    const capitalOneCard = screen.getByText('Capital One statement covered').closest('article') as HTMLElement
    await user.click(within(capitalOneCard).getByRole('button', { name: 'Show breakdown for Capital One statement covered Info' }))

    expect(within(capitalOneCard).getByText('Existing statement due')).toBeInTheDocument()
    expect(within(capitalOneCard).getByText('Automatic Capital One payment from Capital One pot')).toBeInTheDocument()
    expect(within(capitalOneCard).getByText('£222.71')).toBeInTheDocument()
    expect(within(capitalOneCard).getByText('-£222.71')).toBeInTheDocument()
    expect(within(capitalOneCard).getByText(/£149\.67 extra was already recorded/)).toBeInTheDocument()
    expect(within(capitalOneCard).getByText('Still due')).toBeInTheDocument()
    expect(within(capitalOneCard).getByText('£0.00')).toBeInTheDocument()
    expect(within(capitalOneCard).queryByText('-£149.67')).not.toBeInTheDocument()
  })

  it('shows events on visible next-month cells in the current month grid', () => {
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 78850,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      pots: [
        {
          id: 'pot-car-insurance',
          name: 'Car Insurance',
          type: 'reserved',
          balancePence: 0,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'car-insurance',
          name: 'Car insurance',
          amountPence: 8711,
          dueDay: 1,
          frequency: 'monthly',
          potId: 'pot-car-insurance',
          creditCardId: null,
          priority: 'essential',
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
    })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    expect(screen.getByRole('button', { name: 'Open 1 June 2026' })).toHaveTextContent('£87.11 out')
    expect(screen.getByRole('button', { name: 'Open 5 June 2026' })).toHaveTextContent('Next payday starts')
  })

  it('shows the full linked-pot debt amount due on the calendar before the due date is paid', async () => {
    const user = userEvent.setup()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-june',
      startDate: '2026-06-01',
      endDate: '2026-06-14',
      payday: '2026-06-01',
      nextPayday: '2026-06-15',
      incomePence: 100000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      pots: [
        {
          id: 'pot-loan',
          name: 'Loan pot',
          type: 'reserved',
          balancePence: 50000,
          targetPence: null,
          color: '#2563eb',
          linkedCreditCardId: null,
          linkedDebtId: 'debt-loan',
          archived: false,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      debts: [
        {
          id: 'debt-loan',
          name: 'Personal loan',
          lender: 'Loan Provider',
          originalAmountPence: 50000,
          currentBalancePence: 50000,
          minimumPaymentPence: 0,
          dueDate: '2026-06-10',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    expect(screen.getByRole('button', { name: 'Open 10 June 2026' })).toHaveTextContent('£500.00 out')

    await user.click(screen.getByRole('button', { name: 'Open 10 June 2026' }))

    expect(screen.getByText('Personal loan')).toBeInTheDocument()
    expect(screen.getAllByText('-£500.00').length).toBeGreaterThan(0)
    expect(screen.getByText('Loan Provider due date. £0.00 still to cover after linked pots and planned reserves.')).toBeInTheDocument()
  })

  it('opens a day overview with every money event attached to the clicked date', async () => {
    const user = userEvent.setup()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 90000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      recurringPayments: [
        {
          id: 'rec-phone',
          name: 'Phone',
          amountPence: 2200,
          dueDay: 22,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'important',
          active: true,
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
          dueDay: null,
          dueDate: '2026-05-22',
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      customPayments: [
        {
          id: 'custom-mot',
          name: 'MOT',
          amountPence: 4500,
          dueDate: '2026-05-22',
          creditCardId: 'card-amex',
          status: 'unpaid',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      debts: [
        {
          id: 'debt-card',
          name: 'Card balance',
          lender: 'Card Provider',
          originalAmountPence: 30000,
          currentBalancePence: 30000,
          minimumPaymentPence: 0,
          dueDate: '2026-05-22',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      debtReserves: [
        {
          id: 'reserve-card',
          debtId: 'debt-card',
          payPeriodId: 'period-current',
          payday: '2026-05-22',
          periodStartDate: '2026-05-16',
          periodEndDate: '2026-05-29',
          amountPence: 10000,
          status: 'planned',
          source: 'assistant',
          note: 'Set aside before due date',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      debtPayments: [
        {
          id: 'payment-card',
          debtId: 'debt-card',
          amountPence: 5000,
          date: '2026-05-22',
          note: 'Actual payment',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      creditCardRepayments: [
        {
          id: 'repayment-amex',
          creditCardId: 'card-amex',
          amountPence: 2500,
          date: '2026-05-22',
          note: 'Card autopay',
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
      transactions: [
        {
          id: 'txn-lunch',
          potId: 'pot-food',
          payPeriodId: 'period-current',
          amountPence: 1250,
          type: 'spending',
          date: '2026-05-22',
          note: 'Lunch',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    await user.click(screen.getByRole('button', { name: 'Open 22 May 2026' }))

    expect(screen.getByRole('heading', { name: /Friday.*22 May 2026/ })).toBeInTheDocument()
    expect(screen.getByText('Paycheck received')).toBeInTheDocument()
    expect(screen.getByText('Phone')).toBeInTheDocument()
    expect(screen.getByText('Card balance')).toBeInTheDocument()
    expect(screen.getByText('Card balance reserve')).toBeInTheDocument()
    expect(screen.getByText('Card balance payment')).toBeInTheDocument()
    expect(screen.getByText('Everyday Amex repayment')).toBeInTheDocument()
    expect(screen.getByText('Food allocation')).toBeInTheDocument()
    expect(screen.getByText('Lunch')).toBeInTheDocument()
    expect(screen.getByText('Everyday Amex card payment')).toBeInTheDocument()
    expect(screen.getByText('Actual payment')).toBeInTheDocument()
    expect(screen.getByText('Card autopay')).toBeInTheDocument()
    const amexCard = screen.getByText('Everyday Amex card payment').closest('article') as HTMLElement
    await user.click(within(amexCard).getByRole('button', { name: 'Show breakdown for Everyday Amex card payment -£45.00' }))
    expect(within(amexCard).getByText('MOT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to calendar' })).toBeInTheDocument()
  })

  it('shows the payment breakdown inside a completed linked-card pot allocation event', async () => {
    const user = userEvent.setup()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({ completed: true })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    await user.click(screen.getByRole('button', { name: 'Open 22 May 2026' }))

    const allocationCard = screen.getByText('Barclays allocation').closest('article')

    expect(allocationCard).not.toBeNull()
    expect(within(allocationCard as HTMLElement).getByText('Completed')).toBeInTheDocument()
    await user.click(within(allocationCard as HTMLElement).getByRole('button', { name: 'Show breakdown for Barclays allocation -£178.57' }))
    expect(within(allocationCard as HTMLElement).getByText('Owed from last statement')).toBeInTheDocument()
    expect(within(allocationCard as HTMLElement).getByText('Fuel')).toBeInTheDocument()
    expect(within(allocationCard as HTMLElement).getByText('Gym')).toBeInTheDocument()
    expect(within(allocationCard as HTMLElement).getByText('£83.57')).toBeInTheDocument()
    expect(within(allocationCard as HTMLElement).getByText('£70.00')).toBeInTheDocument()
    expect(within(allocationCard as HTMLElement).getByText('£25.00')).toBeInTheDocument()
    expect(within(allocationCard as HTMLElement).getByText('£178.57')).toBeInTheDocument()
  })

  it('shows unticked linked-card pot checklist items on the calendar as not completed', async () => {
    const user = userEvent.setup()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({ completed: false })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    await user.click(screen.getByRole('button', { name: 'Open 22 May 2026' }))

    const allocationCard = screen.getByText('Barclays allocation').closest('article')

    expect(allocationCard).not.toBeNull()
    expect(within(allocationCard as HTMLElement).getByText('Not completed')).toBeInTheDocument()
    await user.click(within(allocationCard as HTMLElement).getByRole('button', { name: 'Show breakdown for Barclays allocation -£178.57' }))
    expect(within(allocationCard as HTMLElement).getByText('Owed from last statement')).toBeInTheDocument()
    expect(within(allocationCard as HTMLElement).getByText('Fuel')).toBeInTheDocument()
    expect(within(allocationCard as HTMLElement).getByText('Gym')).toBeInTheDocument()
    expect(within(allocationCard as HTMLElement).getByText('£83.57')).toBeInTheDocument()
    expect(within(allocationCard as HTMLElement).getByText('£70.00')).toBeInTheDocument()
    expect(within(allocationCard as HTMLElement).getByText('£25.00')).toBeInTheDocument()
  })

  it('keeps calendar event breakdowns hidden until the row is expanded', async () => {
    const user = userEvent.setup()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({ completed: true })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    await user.click(screen.getByRole('button', { name: 'Open 22 May 2026' }))

    const allocationCard = screen.getByText('Barclays allocation').closest('article') as HTMLElement

    expect(within(allocationCard).queryByText('Fuel')).not.toBeInTheDocument()

    await user.click(within(allocationCard).getByRole('button', { name: 'Show breakdown for Barclays allocation -£178.57' }))

    expect(within(allocationCard).getByText('Fuel')).toBeInTheDocument()
    expect(within(allocationCard).getByRole('button', { name: 'Hide breakdown for Barclays allocation -£178.57' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('shows later card spend as its own calendar event after linked card cover is completed', async () => {
    const user = userEvent.setup()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({
      completed: true,
      extraCardSpendPence: 2000,
    })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    await user.click(screen.getByRole('button', { name: 'Open 24 May 2026' }))

    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByText('£20.00')).toBeInTheDocument()
  })

  it('keeps completed linked-card allocation breakdowns separated from later top-ups', async () => {
    const user = userEvent.setup()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({
      completed: true,
      extraCardSpendPence: 2000,
      additionalCoverCompleted: true,
    })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    await user.click(screen.getByRole('button', { name: 'Open 22 May 2026' }))

    const allocationCards = screen
      .getAllByText('Barclays allocation')
      .map((heading) => heading.closest('article'))
      .filter((article): article is HTMLElement => article instanceof HTMLElement)
    const originalCard = allocationCards.find((article) => article.textContent?.includes('-£178.57'))
    const additionalCard = allocationCards.find((article) => article.textContent?.includes('-£20.00'))

    expect(originalCard).toBeDefined()
    expect(additionalCard).toBeDefined()
    await user.click(within(originalCard as HTMLElement).getByRole('button', { name: 'Show breakdown for Barclays allocation -£178.57' }))
    await user.click(within(additionalCard as HTMLElement).getByRole('button', { name: 'Show breakdown for Barclays allocation -£20.00' }))
    expect(within(originalCard as HTMLElement).getByText('Owed from last statement')).toBeInTheDocument()
    expect(within(originalCard as HTMLElement).getByText('Fuel')).toBeInTheDocument()
    expect(within(originalCard as HTMLElement).getByText('Gym')).toBeInTheDocument()
    expect(within(originalCard as HTMLElement).getByText('£83.57')).toBeInTheDocument()
    expect(within(originalCard as HTMLElement).queryByText('Coffee')).not.toBeInTheDocument()
    expect(within(originalCard as HTMLElement).queryByText('Manual spend')).not.toBeInTheDocument()

    expect(within(additionalCard as HTMLElement).getByText('Coffee')).toBeInTheDocument()
    expect(within(additionalCard as HTMLElement).getAllByText('£20.00')).toHaveLength(2)
    expect(within(additionalCard as HTMLElement).queryByText('Fuel')).not.toBeInTheDocument()
    expect(within(additionalCard as HTMLElement).queryByText('Gym')).not.toBeInTheDocument()
    expect(within(additionalCard as HTMLElement).queryByText('Existing card cover already set aside')).not.toBeInTheDocument()
  })

  it('shows a fresh linked-card top-up separately from a completed additional top-up on the calendar', async () => {
    const user = userEvent.setup()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({
      completed: true,
      extraCardSpendPence: 2000,
      additionalCoverCompleted: true,
    })
    const snapshotWithNewSpend = {
      ...snapshot,
      transactions: [
        ...snapshot.transactions,
        {
          id: 'txn-barclays-snack',
          potId: null,
          payPeriodId: 'period-current',
          amountPence: 295,
          type: 'spending' as const,
          paymentMethod: 'credit_card' as const,
          creditCardId: 'card-barclays',
          recurringPaymentId: null,
          date: '2026-05-25',
          note: 'Snack',
          createdAt: '2026-05-25T10:00:00.000Z',
          updatedAt: '2026-05-25T10:00:00.000Z',
        },
      ],
    }

    render(<CalendarPage snapshot={snapshotWithNewSpend} selectedPayPeriod={selectedPayPeriod} />)

    await user.click(screen.getByRole('button', { name: 'Open 22 May 2026' }))

    const allocationCards = screen
      .getAllByText('Barclays allocation')
      .map((heading) => heading.closest('article'))
      .filter((article): article is HTMLElement => article instanceof HTMLElement)
    const completedAdditionalCard = allocationCards.find((article) => article.textContent?.includes('-£20.00'))
    const freshAdditionalCard = allocationCards.find((article) => article.textContent?.includes('-£2.95'))

    expect(completedAdditionalCard).toBeDefined()
    expect(freshAdditionalCard).toBeDefined()
    expect(within(completedAdditionalCard as HTMLElement).getByText('Completed')).toBeInTheDocument()
    expect(within(freshAdditionalCard as HTMLElement).getByText('Not completed')).toBeInTheDocument()

    await user.click(within(completedAdditionalCard as HTMLElement).getByRole('button', { name: 'Show breakdown for Barclays allocation -£20.00' }))
    await user.click(within(freshAdditionalCard as HTMLElement).getByRole('button', { name: 'Show breakdown for Barclays allocation -£2.95' }))

    expect(within(completedAdditionalCard as HTMLElement).getByText('Coffee')).toBeInTheDocument()
    expect(within(completedAdditionalCard as HTMLElement).queryByText('Snack')).not.toBeInTheDocument()
    expect(within(freshAdditionalCard as HTMLElement).getByText('Snack')).toBeInTheDocument()
    expect(within(freshAdditionalCard as HTMLElement).queryByText('Coffee')).not.toBeInTheDocument()
  })

  it('does not show a separately covered manual spend inside the original allocation breakdown', async () => {
    const user = userEvent.setup()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({
      completed: true,
      extraCardSpendPence: 2000,
      additionalCoverCompleted: true,
      originalAllocationCreatedAt: '2026-05-26T00:00:00.000Z',
    })

    render(<CalendarPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} />)

    await user.click(screen.getByRole('button', { name: 'Open 22 May 2026' }))

    const allocationCards = screen
      .getAllByText('Barclays allocation')
      .map((heading) => heading.closest('article'))
      .filter((article): article is HTMLElement => article instanceof HTMLElement)
    const originalCard = allocationCards.find((article) => article.textContent?.includes('-£178.57'))

    expect(originalCard).toBeDefined()
    await user.click(within(originalCard as HTMLElement).getByRole('button', { name: 'Show breakdown for Barclays allocation -£178.57' }))

    expect(within(originalCard as HTMLElement).getByText('Owed from last statement')).toBeInTheDocument()
    expect(within(originalCard as HTMLElement).getByText('Fuel')).toBeInTheDocument()
    expect(within(originalCard as HTMLElement).getByText('Gym')).toBeInTheDocument()
    expect(within(originalCard as HTMLElement).getByText('£83.57')).toBeInTheDocument()
    expect(within(originalCard as HTMLElement).queryByText('Manual spend')).not.toBeInTheDocument()
    expect(within(originalCard as HTMLElement).queryByText('Coffee')).not.toBeInTheDocument()
    expect(within(originalCard as HTMLElement).queryByText('Existing card cover already set aside')).not.toBeInTheDocument()
  })
})

describe('settings page', () => {
  it('confirms when settings are saved', async () => {
    const user = userEvent.setup()
    const actions = createActions()

    const { container } = render(<SettingsPage snapshot={createSnapshot()} actions={actions} />)

    expect(screen.queryByText('Planner settings')).not.toBeInTheDocument()
    expect(screen.queryByText('Settings saved')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Account' })).toBeInTheDocument()
    expect(screen.getByText('Local planner')).toBeInTheDocument()
    expect(screen.queryByText(/Cloud sync/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Planner data' })).not.toBeInTheDocument()
    expect(container.querySelector('[class*="linear-gradient"]')).not.toBeInTheDocument()
    expect(screen.queryByText(/Choose the AI provider used by the server/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Normalises existing pots/i)).not.toBeInTheDocument()
    expect(screen.getByText('Used for Jimbo replies.')).toBeVisible()
    expect(screen.getByText('Checks saved planner data and applies any available updates.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(actions.updateSettings).toHaveBeenCalledWith({
      defaultHoursWorked: 72,
      hourlyRatePence: 1250,
      payFrequency: 'biweekly',
      appDateMode: 'automatic',
      manualTodayIso: null,
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

    fireEvent.change(screen.getByLabelText('Custom AI instructions'), {
      target: { value: 'Be blunt and prioritise debt deadlines.' },
    })
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(actions.updateSettings).toHaveBeenCalledWith({
      defaultHoursWorked: 72,
      hourlyRatePence: 1250,
      payFrequency: 'biweekly',
      appDateMode: 'automatic',
      manualTodayIso: null,
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
      appDateMode: 'automatic',
      manualTodayIso: null,
      aiInstructions: '',
      aiProvider: 'openrouter',
    })
  })

  it('saves a manual app date for testing future planner behaviour', async () => {
    const user = userEvent.setup()
    const actions = createActions()

    render(<SettingsPage snapshot={createSnapshot()} actions={actions} />)

    await user.selectOptions(screen.getByLabelText('App date mode'), 'manual')
    fireEvent.change(screen.getByLabelText('Manual app date'), {
      target: { value: '2026-06-11' },
    })
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(actions.updateSettings).toHaveBeenCalledWith({
      defaultHoursWorked: 72,
      hourlyRatePence: 1250,
      payFrequency: 'biweekly',
      appDateMode: 'manual',
      manualTodayIso: '2026-06-11',
      aiInstructions: '',
      aiProvider: 'gemini',
    })
  })

  it('runs the planner update action from settings', async () => {
    const user = userEvent.setup()
    const actions = createActions()

    render(<SettingsPage snapshot={createSnapshot()} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Update' }))

    expect(actions.updatePlannerDataToLatest).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Planner updated')).toBeVisible()
  })

  it('sends a password reset email from account actions', async () => {
    const user = userEvent.setup()
    const auth = createAuth({
      user: createAuthUser({ email: 'money@example.com' }),
    })

    render(<SettingsPage snapshot={createSnapshot()} actions={createActions()} auth={auth} />)

    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(auth.sendPasswordResetEmail).toHaveBeenCalledWith('money@example.com')
    expect(screen.getByText('Password reset email sent to money@example.com.')).toBeVisible()
  })

  it('deletes the signed-in account after confirmation', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const auth = createAuth({
      user: createAuthUser({ email: 'money@example.com' }),
    })

    render(<SettingsPage snapshot={createSnapshot()} actions={createActions()} auth={auth} />)

    const deleteButton = screen.getByRole('button', { name: 'Delete account' })
    expect(deleteButton).toHaveClass('border-red-200')
    expect(deleteButton).not.toHaveClass('bg-[var(--color-danger)]')

    await user.click(deleteButton)

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete money@example.com? This cannot be undone. Local app data on this device will stay available.',
    )
    expect(auth.deleteAccount).toHaveBeenCalled()
    expect(screen.getByText('Account deleted. Local app data remains on this device.')).toBeVisible()

    confirmSpy.mockRestore()
  })

  it('saves the latest cloud snapshot before logging out', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const signOut = vi.fn(async () => true)
    const saveNow = vi.fn(async () => true)
    const auth = createAuth({
      user: createAuthUser({ email: 'money@example.com' }),
      signOut,
    })

    render(
      <SettingsPage
        snapshot={createSnapshot()}
        actions={createActions()}
        auth={auth}
        cloudSync={{ saveNow }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(saveNow).toHaveBeenCalledTimes(1)
    expect(saveNow.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0])

    confirmSpy.mockRestore()
  })

  it('keeps the user signed in when the final cloud save fails', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const signOut = vi.fn(async () => true)
    const saveNow = vi.fn(async () => false)
    const auth = createAuth({
      user: createAuthUser({ email: 'money@example.com' }),
      signOut,
    })

    render(
      <SettingsPage
        snapshot={createSnapshot()}
        actions={createActions()}
        auth={auth}
        cloudSync={{ saveNow }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(saveNow).toHaveBeenCalledTimes(1))
    expect(signOut).not.toHaveBeenCalled()
    expect(screen.getByText('Could not save your latest account data. Stay signed in and try again.')).toBeVisible()

    confirmSpy.mockRestore()
  })
})

describe('AI page', () => {
  let restoreLocalStorage: (() => void) | null = null

  beforeEach(() => {
    restoreLocalStorage = mockLocalStorage()
  })

  afterEach(() => {
    restoreLocalStorage?.()
    restoreLocalStorage = null
  })

  it('shows the messaging surface without debt-plan controls', async () => {
    const user = userEvent.setup()
    const selectedPayPeriod = createPayPeriod()

    render(
      <AiPlanPage
        snapshot={createSnapshot({ payPeriods: [selectedPayPeriod] })}
        selectedPayPeriod={selectedPayPeriod}
        user={null}
        actions={createActions()}
      />,
    )

    expect(screen.queryByText('AI planning room')).not.toBeInTheDocument()
    expect(screen.queryByText('Planner context')).not.toBeInTheDocument()
    expect(screen.queryByText('Planning sources')).not.toBeInTheDocument()
    const messageInput = screen.getByRole('textbox', { name: 'Message Jimbo' })

    expect(messageInput).toHaveClass('min-h-12')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    expect(screen.getByText('Saved money chats with confirmable actions.')).toBeInTheDocument()
    expect(screen.getByText('Chats')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
    expect(screen.getByText(/Ask Jimbo about this pay period/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Can I afford this before payday?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Which bills are due before payday?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Why is my money left low?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What is my payment priority?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'How much card cover do I need?' })).toBeInTheDocument()
    expect(screen.getByText('Pay period')).toBeInTheDocument()
    expect(screen.getByText('Money left')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Debt recommendations' })).not.toBeInTheDocument()
    expect(screen.queryByText('Set aside this paycheck')).not.toBeInTheDocument()
    expect(screen.queryByText(/Reserve £/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'How much card cover do I need?' }))

    expect(messageInput).toHaveValue('How much card cover do I need?')
  })

  it('collapses the Jimbo insights rail when no pay period or actions exist', () => {
    render(
      <AiPlanPage
        snapshot={createSnapshot({ payPeriods: [] })}
        selectedPayPeriod={null}
        user={null}
        actions={createActions()}
      />,
    )

    expect(screen.queryByText('Pay period')).not.toBeInTheDocument()
    expect(screen.queryByText('Action queue')).not.toBeInTheDocument()
  })

  it('sends any user question to the assistant endpoint and shows the answer', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Use the spare cash for the highest-impact move first.',
        highlights: ['Hidden fees'],
        actions: ['Check balances'],
        confidence: 'high',
        proposedActions: [
          {
            id: 'action-create-buffer-pot',
            type: 'create_pot',
            label: 'Create buffer pot',
            payload: {
              name: 'Buffer',
              type: 'saving',
              balancePence: 2500,
              targetPence: 10000,
              color: '#10b981',
              linkedCreditCardId: null,
              linkedDebtId: null,
            },
          },
        ],
      }),
    } as Response)
    const authUser = {
      getIdToken: vi.fn(async () => 'test-token'),
    }
    const selectedPayPeriod = createPayPeriod({
      id: 'period-jan-02',
      payday: '2026-01-02',
      startDate: '2026-01-02',
      endDate: '2026-01-15',
      nextPayday: '2026-01-16',
      incomePence: 80000,
    })
    const snapshot = createSnapshot({ payPeriods: [selectedPayPeriod] })

    render(
      <AiPlanPage
        snapshot={snapshot}
        selectedPayPeriod={selectedPayPeriod}
        user={authUser}
        actions={createActions()}
      />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Message Jimbo' }), 'Can I afford my cards this month?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(authUser.getIdToken).toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledWith('/api/ai-assistant', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      body: expect.stringContaining('Can I afford my cards this month?'),
    }))
    expect(screen.getByText(/Use the spare cash for the highest-impact move first/)).toBeInTheDocument()
    expect(screen.getByText('Action queue')).toBeInTheDocument()
    expect(screen.getAllByText('Create buffer pot').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Confidence:/)).not.toBeInTheDocument()

    fetchSpy.mockRestore()
  })

  it('saves conversations and lets users reopen them after leaving the AI page', async () => {
    const user = userEvent.setup()
    const snapshot = createSnapshot()
    const actions = createActions()
    const { unmount } = render(
      <AiPlanPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} user={null} actions={actions} />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Message Jimbo' }), 'How much can I move to savings?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    const messages = screen.getByRole('log', { name: 'Jimbo conversation messages' })

    expect(within(messages).getByText('How much can I move to savings?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open conversation How much can I move to savings?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New' }))

    const newMessages = screen.getByRole('log', { name: 'Jimbo conversation messages' })

    expect(within(newMessages).queryByText('How much can I move to savings?')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open conversation How much can I move to savings?' }))

    expect(within(screen.getByRole('log', { name: 'Jimbo conversation messages' })).getByText('How much can I move to savings?')).toBeInTheDocument()

    unmount()

    render(<AiPlanPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} user={null} actions={actions} />)

    expect(within(screen.getByRole('log', { name: 'Jimbo conversation messages' })).getByText('How much can I move to savings?')).toBeInTheDocument()
  })

  it('customizes the assistant name and avatar across the Jimbo page and floating assistant', async () => {
    const user = userEvent.setup()
    const snapshot = createSnapshot()
    const actions = createActions()

    render(
      <>
        <AiPlanPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} user={null} actions={actions} />
        <AppAssistant
          snapshot={snapshot}
          activeView="aiPlan"
          selectedPayPeriod={snapshot.payPeriods[0]}
          actions={actions}
          user={null}
        />
      </>,
    )

    await user.click(screen.getByRole('button', { name: 'Customize' }))
    fireEvent.change(screen.getByLabelText('Assistant name'), { target: { value: 'Nova' } })
    fireEvent.change(screen.getByLabelText('PFP / initials'), { target: { value: 'NV' } })

    expect(screen.getByRole('heading', { name: 'Nova' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Nova helper' })).toHaveTextContent('Nova')
    expect(screen.getAllByText('NV').length).toBeGreaterThan(0)
  })

  it('syncs Jimbo page and floating helper conversations without render-phase console errors', async () => {
    const user = userEvent.setup()
    const snapshot = createSnapshot()
    const actions = createActions()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    window.localStorage.removeItem('new-money.assistant-conversations.v1')

    try {
      render(
        <>
          <AiPlanPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} user={null} actions={actions} />
          <AppAssistant
            snapshot={snapshot}
            activeView="aiPlan"
            selectedPayPeriod={snapshot.payPeriods[0]}
            actions={actions}
            user={null}
          />
        </>,
      )

      await user.type(screen.getByRole('textbox', { name: 'Message Jimbo' }), 'Can I cover the card payment?')
      await user.click(screen.getByRole('button', { name: 'Send message' }))

      await waitFor(() => {
        expect(screen.getAllByText(/Sign in from Settings to ask/).length).toBeGreaterThan(0)
      })

      expect(
        consoleErrorSpy.mock.calls.some((call) =>
          call.some((part) => String(part).includes('Cannot update a component')),
        ),
      ).toBe(false)
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})

describe('payday wizard', () => {
  it('shows pay planning on the left and a sticky allocation summary on the right', () => {
    render(<PaydayWizardPage snapshot={createSnapshot()} actions={createActions()} />)

    const formPanel = screen.getByRole('region', { name: 'Pay planning' })
    const summaryPanel = screen.getByRole('region', { name: 'Pay plan summary' })

    expect(formPanel).toContainElement(screen.getByLabelText('Payday'))
    expect(formPanel).toContainElement(screen.getByLabelText('Pay frequency'))
    expect(formPanel).toContainElement(screen.getByLabelText('Hours worked'))
    expect(formPanel).toContainElement(screen.getByLabelText('Hourly rate'))
    expect(formPanel).toContainElement(screen.getByLabelText('Actual received'))
    expect(formPanel).toContainElement(screen.getByLabelText('Pay period'))

    expect(summaryPanel).toHaveClass('lg:sticky')
    expect(within(summaryPanel).getByText('Pay to plan')).toBeInTheDocument()
    expect(within(summaryPanel).getByText('Reserved bills')).toBeInTheDocument()
    expect(within(summaryPanel).getByText('Manual allocations')).toBeInTheDocument()
    expect(within(summaryPanel).getByText('Left unassigned')).toBeInTheDocument()
    expect(within(summaryPanel).queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm paycheque plan' })).toBeInTheDocument()
    expect(screen.queryByText('Estimate')).not.toBeInTheDocument()
    expect(screen.queryByText('Override')).not.toBeInTheDocument()
    expect(screen.queryByText('Plan state')).not.toBeInTheDocument()
  })

  it('confirms an hourly estimate without changing the paycheck plan action shape', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const snapshot = createSnapshot({
      settings: createSettings({ appDateMode: 'manual', manualTodayIso: '2026-05-16' }),
    })

    render(<PaydayWizardPage snapshot={snapshot} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Confirm paycheque plan' }))

    expect(actions.createPaycheckPlan).toHaveBeenCalledWith({
      payday: '2026-05-16',
      payFrequency: 'biweekly',
      hoursWorked: 72,
      hourlyRatePence: 1250,
      actualAmountPence: null,
      allocations: [],
    })
  })

  it('uses actual received as the pay to plan while preserving the action payload', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const snapshot = createSnapshot({
      settings: createSettings({ appDateMode: 'manual', manualTodayIso: '2026-05-16' }),
    })

    render(<PaydayWizardPage snapshot={snapshot} actions={actions} />)

    await user.type(screen.getByLabelText('Actual received'), '1000')

    const summaryPanel = screen.getByRole('region', { name: 'Pay plan summary' })
    const payToPlanMetric = within(summaryPanel).getByText('Pay to plan').closest('article')

    expect(payToPlanMetric).not.toBeNull()
    expect(within(payToPlanMetric as HTMLElement).getByText('£1,000.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm paycheque plan' }))

    expect(actions.createPaycheckPlan).toHaveBeenCalledWith({
      payday: '2026-05-16',
      payFrequency: 'biweekly',
      hoursWorked: 72,
      hourlyRatePence: 1250,
      actualAmountPence: 100000,
      allocations: [],
    })
  })

  it('summarizes saved allocations and warns when a pay plan is overallocated', () => {
    const snapshot = createSnapshot({
      payPeriods: [createPayPeriod({ incomePence: 90000 })],
      potAllocations: [
        {
          id: 'allocation-rent',
          payPeriodId: 'period-current',
          potId: 'pot-bills',
          amountPence: 60000,
          source: 'recurring',
          recurringPaymentId: 'rent',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'allocation-food',
          payPeriodId: 'period-current',
          potId: 'pot-food',
          amountPence: 40000,
          source: 'manual',
          recurringPaymentId: null,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<PaydayWizardPage snapshot={snapshot} actions={createActions()} />)

    const summaryPanel = screen.getByRole('region', { name: 'Pay plan summary' })

    expect(within(summaryPanel).getByText('Reserved bills')).toBeInTheDocument()
    expect(within(summaryPanel).getByText('£600.00')).toBeInTheDocument()
    expect(within(summaryPanel).getByText('Manual allocations')).toBeInTheDocument()
    expect(within(summaryPanel).getByText('£400.00')).toBeInTheDocument()
    expect(within(summaryPanel).getByText('Left unassigned')).toBeInTheDocument()
    expect(within(summaryPanel).getByText('-£100.00')).toBeInTheDocument()
    expect(within(summaryPanel).getByText('This paycheque is overallocated by £100.00.')).toBeInTheDocument()
  })

  it('does not crash while the payday date is temporarily invalid', () => {
    render(<PaydayWizardPage snapshot={createSnapshot()} actions={createActions()} />)

    fireEvent.change(screen.getByLabelText('Payday'), { target: { value: '' } })

    expect(screen.getByDisplayValue('Choose a valid payday')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm paycheque plan' })).toBeDisabled()
  })

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
    await user.click(screen.getByRole('button', { name: 'Update paycheque plan' }))

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
  it('shows a premium spending hero and quick form without the old command desk cards', () => {
    const selectedPayPeriod = createPayPeriod()
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
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
      transactions: [
        {
          id: 'txn-card',
          potId: null,
          payPeriodId: selectedPayPeriod.id,
          amountPence: 2000,
          type: 'spending',
          paymentMethod: 'credit_card',
          creditCardId: 'card-amex',
          date: '2026-05-18',
          note: 'Fuel',
          createdAt: '2026-05-18T00:00:00.000Z',
          updatedAt: '2026-05-18T00:00:00.000Z',
        },
        {
          id: 'txn-pot',
          potId: 'pot-food',
          payPeriodId: selectedPayPeriod.id,
          amountPence: 1000,
          type: 'spending',
          paymentMethod: 'pot',
          creditCardId: null,
          date: '2026-05-17',
          note: 'Groceries',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
        {
          id: 'txn-unlinked',
          potId: null,
          payPeriodId: selectedPayPeriod.id,
          amountPence: 1250,
          type: 'spending',
          date: '2026-05-16',
          note: 'Lunch',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<SpendingPage snapshot={snapshot} actions={createActions()} selectedPayPeriod={selectedPayPeriod} />)

    const hero = screen.getByRole('region', { name: 'Spending hero' })
    const quickSpend = screen.getByRole('region', { name: 'Quick spend' })

    expect(within(hero).getByText('Spent this pay period')).toBeInTheDocument()
    expect(within(hero).getByText('-£42.50')).toBeInTheDocument()
    expect(within(hero).getByText('3 transactions')).toBeInTheDocument()
    expect(within(hero).getByText('Routed')).toBeInTheDocument()
    expect(within(hero).getByText('£30.00')).toBeInTheDocument()
    expect(within(hero).getByText('Unlinked')).toBeInTheDocument()
    expect(within(hero).getByText('£12.50')).toBeInTheDocument()
    expect(within(hero).getByText('Recent payments')).toBeInTheDocument()

    expect(quickSpend).toContainElement(screen.getByLabelText('Amount'))
    expect(within(quickSpend).getByRole('button', { name: '£10.00' })).toBeInTheDocument()
    expect(quickSpend).toContainElement(screen.getByLabelText('Link spend to'))
    expect(quickSpend).toContainElement(screen.getByLabelText('Date'))
    expect(quickSpend).toContainElement(screen.getByLabelText('Note'))
    expect(within(quickSpend).getByRole('button', { name: 'Log spend' })).toBeInTheDocument()

    expect(screen.queryByText('Spending command desk')).not.toBeInTheDocument()
    expect(screen.queryByText('Today logged')).not.toBeInTheDocument()
    expect(screen.queryByText('Selected paycheck')).not.toBeInTheDocument()
    expect(screen.queryByText('Latest paycheck')).not.toBeInTheDocument()
    expect(screen.queryByText('Card-linked spend')).not.toBeInTheDocument()
  })

  it('shows compact spending transaction rows with restrained edit and delete actions', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod()
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
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
      transactions: [
        {
          id: 'txn-long',
          potId: 'pot-food',
          payPeriodId: selectedPayPeriod.id,
          amountPence: 1250,
          type: 'spending',
          paymentMethod: 'pot',
          creditCardId: null,
          date: '2026-05-18',
          note: 'Long grocery merchant with weekend household essentials',
          createdAt: '2026-05-18T00:00:00.000Z',
          updatedAt: '2026-05-18T00:00:00.000Z',
        },
        {
          id: 'txn-card',
          potId: null,
          payPeriodId: selectedPayPeriod.id,
          amountPence: 3250,
          type: 'spending',
          paymentMethod: 'credit_card',
          creditCardId: 'card-amex',
          date: '2026-05-17',
          note: 'Train tickets',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
      ],
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<SpendingPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />)

    const spendingPanel = screen.getByRole('region', { name: 'Spending by pay period' })
    const groceryRow = within(spendingPanel)
      .getByText('Long grocery merchant with weekend household essentials')
      .closest('article')
    const cardRow = within(spendingPanel).getByText('Train tickets').closest('article')

    expect(groceryRow).toBeInstanceOf(HTMLElement)
    expect(cardRow).toBeInstanceOf(HTMLElement)

    expect(groceryRow as HTMLElement).toHaveClass('rounded-[var(--radius-card)]')
    expect(within(groceryRow as HTMLElement).getByText('Food')).toBeInTheDocument()
    expect(within(groceryRow as HTMLElement).getByText('2026-05-18')).toBeInTheDocument()
    expect(within(groceryRow as HTMLElement).getByText('-£12.50')).toHaveClass('text-right')
    expect(within(cardRow as HTMLElement).getByText('Everyday Amex')).toBeInTheDocument()
    expect(within(cardRow as HTMLElement).getByText('-£32.50')).toHaveClass('text-right')

    expect(within(groceryRow as HTMLElement).getByRole('button', { name: 'Edit Long grocery merchant with weekend household essentials' })).toHaveClass('size-9')
    expect(within(groceryRow as HTMLElement).getByRole('button', { name: 'Delete Long grocery merchant with weekend household essentials' })).toHaveClass('size-9')
    expect(within(spendingPanel).queryByText('Delete')).not.toBeInTheDocument()
    expect(within(spendingPanel).queryByText('Edit')).not.toBeInTheDocument()
    expect(spendingPanel.querySelector('.divide-y')).toBeNull()

    await user.click(within(groceryRow as HTMLElement).getByRole('button', { name: 'Edit Long grocery merchant with weekend household essentials' }))

    expect(screen.getByRole('region', { name: 'Edit spending entry' })).toBeInTheDocument()

    await user.click(within(groceryRow as HTMLElement).getByRole('button', { name: 'Delete Long grocery merchant with weekend household essentials' }))

    expect(confirmSpy).toHaveBeenCalledWith('Delete Long grocery merchant with weekend household essentials?')
    expect(actions.deleteTransaction).toHaveBeenCalledWith('txn-long')
    confirmSpy.mockRestore()
  })

  it('shows a concise empty spending list state for a selected pay period', () => {
    const selectedPayPeriod = createPayPeriod()
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      transactions: [],
    })

    render(<SpendingPage snapshot={snapshot} actions={createActions()} selectedPayPeriod={selectedPayPeriod} />)

    const spendingPanel = screen.getByRole('region', { name: 'Spending by pay period' })

    expect(within(spendingPanel).getByText('No spending yet.')).toBeInTheDocument()
    expect(within(spendingPanel).getByText('Log your first payment to see it grouped by paycheck.')).toBeInTheDocument()
    expect(within(spendingPanel).queryByText('No spending entries yet.')).not.toBeInTheDocument()
  })

  it('saves quick spend without a pot or credit card link', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const today = toIsoDate(new Date())

    render(<SpendingPage snapshot={createSnapshot()} actions={actions} />)

    expect(screen.queryByText('Ready to log')).not.toBeInTheDocument()
    expect(screen.getByText('Recent payments')).toBeInTheDocument()
    expect(screen.queryByText('Recent trail')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '£10.00' }))
    await user.click(screen.getByRole('button', { name: 'Log spend' }))

    expect(actions.addTransaction).toHaveBeenCalledWith({
      amountPence: 1000,
      creditCardId: null,
      date: today,
      note: 'Manual spend',
      payPeriodId: null,
      potId: null,
      type: 'spending',
    })
  })

  it('uses quick amount buttons for faster manual spending entry with an optional note', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const today = toIsoDate(new Date())

    render(<SpendingPage snapshot={createSnapshot()} actions={actions} />)

    await user.click(screen.getByRole('button', { name: '£10.00' }))
    await user.type(screen.getByLabelText('Note'), 'Coffee')
    await user.click(screen.getByRole('button', { name: 'Log spend' }))

    expect(actions.addTransaction).toHaveBeenCalledWith({
      amountPence: 1000,
      creditCardId: null,
      date: today,
      note: 'Coffee',
      payPeriodId: null,
      potId: null,
      type: 'spending',
    })
  })

  it('logs spending against a pot when a pot link is selected', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const today = toIsoDate(new Date())

    render(<SpendingPage snapshot={createSnapshot()} actions={actions} />)

    await user.click(screen.getByRole('button', { name: '£5.00' }))
    await user.selectOptions(screen.getByLabelText('Link spend to'), 'pot')
    await user.selectOptions(screen.getByLabelText('Pot'), 'pot-food')
    await user.click(screen.getByRole('button', { name: 'Log spend' }))

    expect(actions.addTransaction).toHaveBeenCalledWith({
      amountPence: 500,
      creditCardId: null,
      date: today,
      note: 'Manual spend',
      payPeriodId: null,
      paymentMethod: 'pot',
      potId: 'pot-food',
      type: 'spending',
    })
  })

  it('logs linked credit card pot spending as card cover instead of deducting the pot', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const today = toIsoDate(new Date())

    render(
      <SpendingPage
        snapshot={createSnapshot({
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
              createdAt: '2026-05-16T00:00:00.000Z',
              updatedAt: '2026-05-16T00:00:00.000Z',
            },
          ],
          creditCards: [
            {
              id: 'card-barclays',
              name: 'Barclays',
              provider: 'Barclays',
              limitPence: 80000,
              openingBalancePence: 68005,
              dueDay: 1,
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
    await user.selectOptions(screen.getByLabelText('Link spend to'), 'pot')
    await user.selectOptions(screen.getByLabelText('Pot'), 'pot-barclays')
    await user.type(screen.getByLabelText('Note'), 'Fuel top-up')
    await user.click(screen.getByRole('button', { name: 'Log spend' }))

    expect(actions.addTransaction).toHaveBeenCalledWith({
      amountPence: 2000,
      creditCardId: 'card-barclays',
      date: today,
      note: 'Fuel top-up',
      paymentMethod: 'credit_card',
      payPeriodId: null,
      potId: null,
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
    await user.selectOptions(screen.getByLabelText('Link spend to'), 'credit_card')
    await user.selectOptions(screen.getByLabelText('Credit card'), 'card-amex')
    await user.type(screen.getByLabelText('Note'), 'Groceries')
    await user.click(screen.getByRole('button', { name: 'Log spend' }))

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
  it('shows a Cards hero with card cover totals from the current allocation summary', () => {
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
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
        selectedPayPeriod={selectedPayPeriod}
      />,
    )

    const hero = screen.getByRole('region', { name: 'Cards hero' })

    expect(within(hero).getByRole('heading', { name: 'Cards' })).toBeInTheDocument()
    expect(within(hero).getAllByText('Card cover needed').length).toBeGreaterThan(0)
    expect(within(hero).getAllByText('Total owed').length).toBeGreaterThan(0)
    expect(within(hero).getAllByText('Available after card cover').length).toBeGreaterThan(0)
    expect(within(hero).queryAllByText('Current pay period').filter((element) => element.closest('article'))).toHaveLength(0)
    expect(within(hero).getAllByText('£72.00').length).toBeGreaterThanOrEqual(2)
    expect(within(hero).getAllByText('£828.00').length).toBeGreaterThan(0)
    expect(screen.queryByRole('region', { name: 'Credit card summary' })).not.toBeInTheDocument()
  })

  it('renders premium stack cards with provider, owed, available, limit, due date, and utilization states', () => {
    const selectedPayPeriod = createPayPeriod()
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      creditCards: [
        {
          id: 'card-high',
          name: 'High Card',
          provider: 'High Bank',
          limitPence: 100000,
          openingBalancePence: 90000,
          dueDay: 7,
          dueDate: null,
          color: '#0f172a',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'card-low',
          name: 'Low Card',
          provider: 'Low Bank',
          limitPence: 100000,
          openingBalancePence: 10000,
          dueDay: 19,
          dueDate: null,
          color: '#475569',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'card-missing',
          name: 'No Limit Card',
          provider: 'Unknown Bank',
          limitPence: 0,
          openingBalancePence: 10000,
          dueDay: null,
          dueDate: null,
          color: '#64748b',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<AllocatingPaymentsPage snapshot={snapshot} actions={createActions()} selectedPayPeriod={selectedPayPeriod} />)

    const stack = screen.getByRole('region', { name: 'Credit card stack' })
    const highCard = within(stack).getByRole('button', { name: 'Open High Card card details' })
    const lowCard = within(stack).getByRole('button', { name: 'Open Low Card card details' })
    const missingCard = within(stack).getByRole('button', { name: 'Open No Limit Card card details' })

    expect(within(highCard).getAllByText('High Bank').length).toBeGreaterThan(0)
    expect(within(highCard).getAllByText('High Card').length).toBeGreaterThan(0)
    expect(within(highCard).getByText('Owed')).toBeInTheDocument()
    expect(within(highCard).getAllByText('£900.00').length).toBeGreaterThan(0)
    expect(within(highCard).getByText('Available')).toBeInTheDocument()
    expect(within(highCard).getAllByText('£100.00').length).toBeGreaterThan(0)
    expect(within(highCard).getByText('Limit')).toBeInTheDocument()
    expect(within(highCard).getAllByText('£1,000.00').length).toBeGreaterThan(0)
    expect(within(highCard).getByText('Due date')).toBeInTheDocument()
    expect(within(highCard).getAllByText('Day 7').length).toBeGreaterThan(0)
    expect(within(highCard).getByText('Utilization')).toBeInTheDocument()
    expect(within(highCard).getAllByText('90%').length).toBeGreaterThan(0)

    expect(within(lowCard).getAllByText('Low Bank').length).toBeGreaterThan(0)
    expect(within(lowCard).getAllByText('10%').length).toBeGreaterThan(0)
    expect(within(missingCard).getAllByText('Unknown Bank').length).toBeGreaterThan(0)
    expect(within(missingCard).getByText('Utilization unavailable')).toBeInTheDocument()
  })

  it('labels Barclays actual available credit separately from forecast available credit', async () => {
    const user = userEvent.setup()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 78850,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
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
    })

    render(
      <AllocatingPaymentsPage
        snapshot={snapshot}
        actions={createActions()}
        selectedPayPeriod={selectedPayPeriod}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open Barclays card details' }))

    expect(screen.getByText('Actual balance')).toBeInTheDocument()
    expect(screen.getByText('Actual available')).toBeInTheDocument()
    expect(screen.getByText('Forecast balance')).toBeInTheDocument()
    expect(screen.getByText('Forecast available')).toBeInTheDocument()
    expect(screen.getAllByText('£680.05').length).toBeGreaterThan(0)
    expect(screen.getAllByText('£119.95').length).toBeGreaterThan(0)
    expect(screen.getAllByText('£775.05').length).toBeGreaterThan(0)
    expect(screen.getAllByText('£24.95').length).toBeGreaterThan(0)
  })

  it('flags allocation rows linked to a missing credit card', () => {
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 78850,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      recurringPayments: [
        {
          id: 'personal',
          name: 'Personal',
          amountPence: 5000,
          dueDate: '2026-05-29',
          frequency: 'biweekly',
          potId: null,
          creditCardId: 'card-capital-one',
          priority: 'optional',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      creditCards: [],
    })

    render(
      <AllocatingPaymentsPage
        snapshot={snapshot}
        actions={createActions()}
        selectedPayPeriod={selectedPayPeriod}
      />,
    )

    expect(screen.getByText(/missing card card-capital-one/i)).toBeInTheDocument()
  })

  it('shows compact payment allocation rows and preserves card linking behavior', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod()
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      creditCards: [
        {
          id: 'card-amex',
          name: 'Everyday Amex',
          provider: 'Amex',
          limitPence: 100000,
          openingBalancePence: 20000,
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
          name: 'Phone bill',
          amountPence: 2200,
          dueDate: '2026-05-20',
          frequency: 'monthly',
          potId: 'pot-bills',
          creditCardId: null,
          priority: 'important',
          active: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      customPayments: [
        {
          id: 'custom-mot',
          name: 'MOT',
          amountPence: 14950,
          dueDate: '2026-05-21',
          creditCardId: 'card-amex',
          status: 'unpaid',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'txn-lunch',
          potId: 'pot-food',
          payPeriodId: selectedPayPeriod.id,
          amountPence: 1250,
          type: 'spending',
          paymentMethod: 'pot',
          creditCardId: null,
          date: '2026-05-18',
          note: 'Lunch',
          createdAt: '2026-05-18T00:00:00.000Z',
          updatedAt: '2026-05-18T00:00:00.000Z',
        },
      ],
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<AllocatingPaymentsPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />)

    const paymentPanel = screen.getByRole('region', { name: 'Payment allocation list' })
    const phoneRow = within(paymentPanel).getByText('Phone bill').closest('article')
    const motRow = within(paymentPanel).getByText('MOT').closest('article')
    const lunchRow = within(paymentPanel).getByText('Lunch').closest('article')

    expect(phoneRow).toBeInstanceOf(HTMLElement)
    expect(motRow).toBeInstanceOf(HTMLElement)
    expect(lunchRow).toBeInstanceOf(HTMLElement)

    expect(phoneRow as HTMLElement).toHaveClass('rounded-[var(--radius-card)]')
    expect(within(phoneRow as HTMLElement).getByText('Bill')).toBeInTheDocument()
    expect(within(phoneRow as HTMLElement).getByText('2026-05-20')).toBeInTheDocument()
    expect(within(phoneRow as HTMLElement).getByText('£22.00')).toHaveClass('text-right')
    expect(within(phoneRow as HTMLElement).getByText('Unlinked')).toBeInTheDocument()
    expect(within(phoneRow as HTMLElement).getByLabelText('Linked card for Phone bill')).toHaveValue('')

    expect(within(motRow as HTMLElement).getByText('Custom')).toBeInTheDocument()
    expect(within(motRow as HTMLElement).getByText('Everyday Amex')).toBeInTheDocument()
    expect(within(motRow as HTMLElement).getByLabelText('Linked card for MOT')).toHaveValue('card-amex')
    expect(within(lunchRow as HTMLElement).getByText('Spending')).toBeInTheDocument()
    expect(within(lunchRow as HTMLElement).getByText('£12.50')).toHaveClass('text-right')
    expect(paymentPanel.querySelector('.divide-y')).toBeNull()
    expect(within(paymentPanel).queryByText('Payment group total')).not.toBeInTheDocument()

    await user.selectOptions(within(phoneRow as HTMLElement).getByLabelText('Linked card for Phone bill'), 'card-amex')

    expect(actions.updateRecurringPayment).toHaveBeenCalledWith('rec-phone', {
      name: 'Phone bill',
      amountPence: 2200,
      dueDay: null,
      dueDate: '2026-05-20',
      frequency: 'monthly',
      potId: 'pot-bills',
      creditCardId: 'card-amex',
      priority: 'important',
    })

    await user.selectOptions(within(motRow as HTMLElement).getByLabelText('Linked card for MOT'), '')

    expect(actions.updateCustomPayment).toHaveBeenCalledWith('custom-mot', {
      name: 'MOT',
      amountPence: 14950,
      dueDate: '2026-05-21',
      creditCardId: null,
      status: 'unpaid',
    })

    await user.selectOptions(within(lunchRow as HTMLElement).getByLabelText('Linked card for Lunch'), 'card-amex')

    expect(actions.updateTransaction).toHaveBeenCalledWith('txn-lunch', {
      potId: null,
      amountPence: 1250,
      date: '2026-05-18',
      note: 'Lunch',
      paymentMethod: 'credit_card',
      creditCardId: 'card-amex',
    })

    await user.click(within(motRow as HTMLElement).getByRole('button', { name: 'Delete MOT' }))

    expect(within(motRow as HTMLElement).queryByText('Delete')).not.toBeInTheDocument()
    expect(within(motRow as HTMLElement).getByRole('button', { name: 'Delete MOT' })).toHaveClass('size-9')
    expect(confirmSpy).toHaveBeenCalledWith('Delete MOT?')
    expect(actions.deleteCustomPayment).toHaveBeenCalledWith('custom-mot')
    confirmSpy.mockRestore()
  })

  it('opens Cards forms in drawers and cancels them without side effects', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod()
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      creditCards: [
        {
          id: 'card-amex',
          name: 'Everyday Amex',
          provider: 'Amex',
          limitPence: 100000,
          openingBalancePence: 20000,
          dueDay: 12,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<AllocatingPaymentsPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />)

    expect(screen.queryByText('Card allocation cockpit')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New card' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add one-off payment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record repayment' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add credit card' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add one-off payment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Record card repayment' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New card' }))
    const cardDialog = screen.getByRole('dialog', { name: 'Add credit card' })
    await user.type(within(cardDialog).getByLabelText('Card name'), 'Draft card')
    await user.click(within(cardDialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Add credit card' })).not.toBeInTheDocument()
    expect(actions.addCreditCard).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Add one-off payment' }))
    const paymentDialog = screen.getByRole('dialog', { name: 'Add one-off payment' })
    await user.type(within(paymentDialog).getByLabelText('Payment name'), 'MOT')
    await user.type(within(paymentDialog).getByLabelText('Amount'), '149.50')
    await user.click(within(paymentDialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Add one-off payment' })).not.toBeInTheDocument()
    expect(actions.addCustomPayment).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Record repayment' }))
    const repaymentDialog = screen.getByRole('dialog', { name: 'Record card repayment' })
    await user.type(within(repaymentDialog).getByLabelText('Amount'), '20')
    await user.click(within(repaymentDialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Record card repayment' })).not.toBeInTheDocument()
    expect(actions.addCreditCardRepayment).not.toHaveBeenCalled()
  })

  it('creates a credit card and records a card repayment without showing credit pot controls', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      payday: '2026-05-22',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      nextPayday: '2026-06-05',
      incomePence: 80000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
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

    render(<AllocatingPaymentsPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />)

    await user.click(screen.getByRole('button', { name: 'New card' }))
    const cardPanel = screen.getByRole('dialog', { name: 'Add credit card' })
    await user.type(within(cardPanel).getByLabelText('Card name'), 'Gold Card')
    await user.type(within(cardPanel).getByLabelText('Provider'), 'Capital One')
    await user.type(within(cardPanel).getByLabelText('Limit'), '1200')
    await user.type(within(cardPanel).getByLabelText('Existing balance'), '250')
    await user.type(within(cardPanel).getByLabelText('Existing statement due'), '200')
    await user.type(within(cardPanel).getByLabelText('Statement date'), '2026-05-14')
    await user.clear(within(cardPanel).getByLabelText('Direct debit day'))
    await user.type(within(cardPanel).getByLabelText('Direct debit day'), '9')
    await user.click(within(cardPanel).getByRole('button', { name: 'Card design' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Card design' })).getByRole('button', { name: 'Blue Card' }))
    await user.click(within(cardPanel).getByRole('button', { name: 'Add card' }))

    expect(actions.addCreditCard).toHaveBeenCalledWith({
      color: '#2563eb',
      designId: 'cart-gradient-12',
      dueDate: null,
      dueDay: 9,
      statementDate: '2026-05-14',
      limitPence: 120000,
      name: 'Gold Card',
      openingBalancePence: 25000,
      openingStatementBalancePence: 20000,
      provider: 'Capital One',
    })

    expect(screen.queryByRole('region', { name: 'Add saved payment' })).not.toBeInTheDocument()

    expect(screen.queryByRole('region', { name: 'Credit Pots' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Credit pots' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add one-off payment' }))
    const paymentDialog = screen.getByRole('dialog', { name: 'Add one-off payment' })
    await user.type(within(paymentDialog).getByLabelText('Payment name'), 'MOT')
    await user.type(within(paymentDialog).getByLabelText('Amount'), '149.50')
    fireEvent.change(within(paymentDialog).getByLabelText('Due date'), { target: { value: '2026-05-27' } })
    await user.selectOptions(within(paymentDialog).getByLabelText('Linked card'), 'card-amex')
    await user.click(within(paymentDialog).getByRole('button', { name: 'Add one-off payment' }))

    expect(actions.addCustomPayment).toHaveBeenCalledWith({
      amountPence: 14950,
      creditCardId: 'card-amex',
      dueDate: '2026-05-27',
      name: 'MOT',
    })

    await user.click(screen.getByRole('button', { name: 'Record repayment' }))
    const repaymentPanel = screen.getByRole('dialog', { name: 'Record card repayment' })
    await user.type(within(repaymentPanel).getByLabelText('Amount'), '12.50')
    await user.type(within(repaymentPanel).getByLabelText('Note'), 'Part payment')
    await user.click(within(repaymentPanel).getByRole('button', { name: 'Record repayment' }))

    expect(actions.addCreditCardRepayment).toHaveBeenCalledWith({
      amountPence: 1250,
      creditCardId: 'card-amex',
      date: toIsoDate(new Date()),
      note: 'Part payment',
    })
    expect(actions.addCreditCardPot).not.toHaveBeenCalled()
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

    expect(screen.getByRole('button', { name: 'Open Everyday Amex card details' })).toBeInTheDocument()
    const cardVisual = screen.getByLabelText('Everyday Amex credit card')
    expect(cardVisual).toHaveAttribute('data-figma-design', 'cart-minimal-11')
    expect(cardVisual).toHaveAttribute('data-node-id', '3114:376')
    expect(screen.getAllByText('Everyday Amex').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Day 12').length).toBeGreaterThan(0)
    expect(screen.getAllByText('£1,000.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('£72.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('£928.00').length).toBeGreaterThan(0)
    expect(screen.queryByText('Pay left after cards')).not.toBeInTheDocument()
    expect(screen.getAllByText('Groceries').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Phone').length).toBeGreaterThan(0)
  })

  it('orders and expands Cards hero summary cards independently', async () => {
    const user = userEvent.setup()
    const selectedPayPeriod = createPayPeriod()
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      creditCards: [
        {
          id: 'card-amex',
          name: 'Everyday Amex',
          provider: 'Amex',
          limitPence: 100000,
          openingBalancePence: 20000,
          dueDay: 12,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<AllocatingPaymentsPage snapshot={snapshot} actions={createActions()} selectedPayPeriod={selectedPayPeriod} />)

    const summaryPanel = screen.getByRole('region', { name: 'Cards hero' })
    const metricLabels = within(summaryPanel)
      .getAllByText(/Card cover needed|Total owed|Available after card cover/)
      .filter((element) => element.closest('summary'))
      .map((element) => element.textContent)

    expect(metricLabels).toEqual(['Card cover needed', 'Total owed', 'Available after card cover'])

    const cardCoverNeeded = getMetricDetails(summaryPanel, 'Card cover needed')
    const totalOwed = getMetricDetails(summaryPanel, 'Total owed')
    const availableAfterCardCover = getMetricDetails(summaryPanel, 'Available after card cover')

    expect(within(summaryPanel).queryByText('Show calculation')).not.toBeInTheDocument()

    await clickMetricSummary(user, cardCoverNeeded)
    expect(cardCoverNeeded).toHaveAttribute('open')
    expect(totalOwed).not.toHaveAttribute('open')
    expect(availableAfterCardCover).not.toHaveAttribute('open')

    await clickMetricSummary(user, totalOwed)
    expect(cardCoverNeeded).not.toHaveAttribute('open')
    expect(totalOwed).toHaveAttribute('open')
    expect(availableAfterCardCover).not.toHaveAttribute('open')

    await clickMetricSummary(user, availableAfterCardCover)
    expect(cardCoverNeeded).not.toHaveAttribute('open')
    expect(totalOwed).not.toHaveAttribute('open')
    expect(availableAfterCardCover).toHaveAttribute('open')
  })

  it('offers and renders the teal credit card design', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod()
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      creditCards: [
        {
          id: 'card-mint',
          name: 'Mint Travel',
          provider: 'Mastercard',
          limitPence: 200000,
          openingBalancePence: 34550,
          designId: 'cart-geometric-4',
          dueDay: 2,
          dueDate: null,
          color: '#14b8a6',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    const { container } = render(
      <AllocatingPaymentsPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />,
    )

    const cardVisual = screen.getByLabelText('Mint Travel credit card')
    expect(cardVisual).toHaveAttribute('data-figma-design', 'cart-geometric-4')
    expect(cardVisual).toHaveAttribute('data-node-id', '1730:4631')
    expect(container.querySelector('img[src="/figma-assets/cart-geometric-4/mastercard-logo.svg"]')).not.toBeNull()
    expect(container.querySelector('img[src="/figma-assets/cart-geometric-4/bottom-panel.svg"]')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'New card' }))
    const cardPanel = screen.getByRole('dialog', { name: 'Add credit card' })
    await user.type(within(cardPanel).getByLabelText('Card name'), 'Mint Reserve')
    await user.type(within(cardPanel).getByLabelText('Provider'), 'Mastercard')
    await user.type(within(cardPanel).getByLabelText('Limit'), '900')
    await user.click(within(cardPanel).getByRole('button', { name: 'Card design' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Card design' })).getByRole('button', { name: 'Teal Card' }))
    await user.click(within(cardPanel).getByRole('button', { name: 'Add card' }))

    expect(actions.addCreditCard).toHaveBeenCalledWith(expect.objectContaining({ designId: 'cart-geometric-4' }))
  })

  it('offers clean colorway names as separate card designs', async () => {
    const geometric4Colorways = [
      ['cart-geometric-4-blue', 'Royal Blue Card'],
      ['cart-geometric-4-red', 'Red Card'],
      ['cart-geometric-4-black', 'Black Card'],
      ['cart-geometric-4-orange', 'Orange Card'],
      ['cart-geometric-4-gray', 'Grey Card'],
      ['cart-geometric-4-gold', 'Gold Card'],
      ['cart-geometric-4-light-blue', 'Light Blue Card'],
      ['cart-geometric-4-teal', 'Deep Teal Card'],
      ['cart-geometric-4-maroon', 'Maroon Card'],
      ['cart-geometric-4-violet', 'Violet Card'],
    ]
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod()
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      creditCards: [
        {
          id: 'card-maroon',
          name: 'Maroon Travel',
          provider: 'Mastercard',
          limitPence: 180000,
          openingBalancePence: 0,
          designId: 'cart-geometric-4-maroon',
          dueDay: 11,
          dueDate: null,
          color: '#7f1d1d',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    for (const [id, label] of geometric4Colorways) {
      expect(creditCardDesigns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetPath: `/figma-assets/${id}`,
            id,
            label,
            network: 'mastercard',
            nodeId: '1730:4631',
          }),
        ]),
      )
    }

    const { container } = render(
      <AllocatingPaymentsPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />,
    )

    const cardVisual = screen.getByLabelText('Maroon Travel credit card')
    expect(cardVisual).toHaveAttribute('data-figma-design', 'cart-geometric-4-maroon')
    expect(container.querySelector('img[src="/figma-assets/cart-geometric-4-maroon/mastercard-logo.svg"]')).not.toBeNull()
    expect(container.querySelector('img[src="/figma-assets/cart-geometric-4-maroon/bottom-panel.svg"]')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'New card' }))
    const cardPanel = screen.getByRole('dialog', { name: 'Add credit card' })

    expect(within(cardPanel).queryByRole('button', { name: 'Gold Card' })).not.toBeInTheDocument()
    await user.click(within(cardPanel).getByRole('button', { name: 'Card design' }))
    const designDialog = screen.getByRole('dialog', { name: 'Card design' })

    for (const [, label] of geometric4Colorways) {
      expect(within(designDialog).getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(designDialog.querySelector('img[src$="/reference.png"]')).toBeNull()
    expect(designDialog.querySelector('.credit-card-design-picker__art')).not.toBeNull()
    await user.click(within(designDialog).getByRole('button', { name: 'Gold Card' }))

    await user.type(within(cardPanel).getByLabelText('Card name'), 'Gold Reserve')
    await user.type(within(cardPanel).getByLabelText('Provider'), 'Mastercard')
    await user.type(within(cardPanel).getByLabelText('Limit'), '900')
    await user.click(within(cardPanel).getByRole('button', { name: 'Add card' }))

    expect(actions.addCreditCard).toHaveBeenCalledWith(expect.objectContaining({ designId: 'cart-geometric-4-gold' }))
  })

  it('offers and renders the bright blue credit card design', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod()
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      creditCards: [
        {
          id: 'card-blue',
          name: 'Blue Travel',
          provider: 'Visa',
          limitPence: 150000,
          openingBalancePence: 20000,
          designId: 'cart-geometric-1',
          dueDay: 5,
          dueDate: null,
          color: '#0e8bff',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    const { container } = render(
      <AllocatingPaymentsPage snapshot={snapshot} actions={actions} selectedPayPeriod={selectedPayPeriod} />,
    )

    const cardVisual = screen.getByLabelText('Blue Travel credit card')
    expect(cardVisual).toHaveAttribute('data-figma-design', 'cart-geometric-1')
    expect(cardVisual).toHaveAttribute('data-node-id', '1730:3774')
    expect(container.querySelector('img[src="/figma-assets/cart-geometric-1/visa-logo.svg"]')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'New card' }))
    const cardPanel = screen.getByRole('dialog', { name: 'Add credit card' })
    await user.type(within(cardPanel).getByLabelText('Card name'), 'Blue Reserve')
    await user.type(within(cardPanel).getByLabelText('Provider'), 'Visa')
    await user.type(within(cardPanel).getByLabelText('Limit'), '900')
    await user.click(within(cardPanel).getByRole('button', { name: 'Card design' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Card design' })).getByRole('button', { name: 'Bright Blue Card' }))
    await user.click(within(cardPanel).getByRole('button', { name: 'Add card' }))

    expect(actions.addCreditCard).toHaveBeenCalledWith(expect.objectContaining({ designId: 'cart-geometric-1' }))
  })

  it('uses a simplified card details view with a card edit dialog', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const snapshot = createSnapshot({
      payPeriods: [createPayPeriod()],
      creditCards: [
        {
          id: 'card-amex',
          name: 'Everyday Amex',
          provider: 'Amex',
          limitPence: 100000,
          openingBalancePence: 20000,
          designId: 'cart-geometric-15',
          dueDay: 12,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
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

    render(<AllocatingPaymentsPage snapshot={snapshot} actions={actions} selectedPayPeriod={snapshot.payPeriods[0]} />)

    await user.click(screen.getByRole('button', { name: 'Open Everyday Amex card details' }))

    expect(screen.getByRole('region', { name: 'Card activity' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Credit pots for this card' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Actual balance').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Actual available').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Edit card' }))

    const dialog = screen.getByRole('dialog', { name: 'Edit credit card' })
    await user.clear(within(dialog).getByLabelText('Card name'))
    await user.type(within(dialog).getByLabelText('Card name'), 'Updated Amex')
    await user.click(within(dialog).getByRole('button', { name: 'Save card' }))

    expect(actions.updateCreditCard).toHaveBeenCalledWith('card-amex', {
      color: '#2563eb',
      designId: 'cart-geometric-15',
      dueDate: null,
      dueDay: 12,
      limitPence: 100000,
      name: 'Updated Amex',
      openingBalancePence: 20000,
      openingStatementBalancePence: 20000,
      provider: 'Amex',
      statementDate: null,
    })
  })
})

describe('pots page', () => {
  it('shows a Pots summary and compact premium pot cards with targets and activity previews', () => {
    const snapshot = createSnapshot({
      pots: [
        {
          id: 'pot-food',
          name: 'Food',
          type: 'spending',
          category: 'Spending',
          icon: 'food',
          balancePence: 12000,
          targetPence: null,
          color: '#16a34a',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'pot-holiday',
          name: 'Holiday',
          type: 'saving',
          category: 'Savings',
          icon: 'plane',
          balancePence: 15000,
          targetPence: 50000,
          color: '#7c3aed',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'pot-bills',
          name: 'Bills',
          type: 'reserved',
          category: 'Bills',
          icon: 'shield',
          balancePence: 40000,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'pot-card',
          name: 'Barclays reserve',
          type: 'reserved',
          category: 'Bills',
          icon: 'card',
          balancePence: 30000,
          targetPence: null,
          color: '#ea580c',
          linkedCreditCardId: 'card-barclays',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'pot-archived',
          name: 'Archived stash',
          type: 'saving',
          category: 'Savings',
          icon: 'savings',
          balancePence: 99900,
          targetPence: null,
          color: '#475569',
          archived: true,
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
      ],
    })

    render(<PotsPage snapshot={snapshot} actions={createActions()} />)

    const summary = screen.getByRole('region', { name: 'Pots summary' })

    expect(within(summary).getByRole('heading', { name: 'Pots' })).toBeInTheDocument()
    expect(within(summary).getByText('Total in pots')).toBeInTheDocument()
    expect(within(summary).getByText('4 active pots')).toBeInTheDocument()
    expect(within(summary).queryByText('Spending pots')).not.toBeInTheDocument()
    expect(within(summary).queryByText('Savings pots')).not.toBeInTheDocument()
    expect(within(summary).queryByText('Reserved/card pots')).not.toBeInTheDocument()
    expect(within(summary).getByText('£970.00')).toBeInTheDocument()

    const potGrid = screen.getByRole('region', { name: 'Pot grid' })
    const foodCard = within(potGrid).getByRole('article', { name: 'Food pot card' })
    const holidayCard = within(potGrid).getByRole('article', { name: 'Holiday pot card' })

    expect(foodCard).not.toHaveClass('h-[330px]')
    expect(within(foodCard).getByText('Spending')).toBeInTheDocument()
    expect(within(foodCard).getByText('£120.00')).toBeInTheDocument()
    expect(within(foodCard).getByText('No target')).toBeInTheDocument()
    expect(within(foodCard).queryByText('0%')).not.toBeInTheDocument()
    expect(within(foodCard).getByText('1 activity')).toBeInTheDocument()
    expect(within(foodCard).getByText('Lunch')).toBeInTheDocument()

    expect(within(holidayCard).getByText('Saving')).toBeInTheDocument()
    expect(within(holidayCard).getByText('£150.00')).toBeInTheDocument()
    expect(within(holidayCard).getByText('30%')).toBeInTheDocument()
    expect(within(holidayCard).getByText('£500.00 target')).toBeInTheDocument()
    expect(screen.queryByText('Archived stash')).not.toBeInTheDocument()
  })

  it('shows a clean empty Pots state without counting archived pots', () => {
    const snapshot = createSnapshot({
      pots: [
        {
          id: 'pot-archived',
          name: 'Archived stash',
          type: 'saving',
          category: 'Savings',
          icon: 'savings',
          balancePence: 99900,
          targetPence: null,
          color: '#475569',
          archived: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<PotsPage snapshot={snapshot} actions={createActions()} />)

    const summary = screen.getByRole('region', { name: 'Pots summary' })
    const potGrid = screen.getByRole('region', { name: 'Pot grid' })

    expect(within(summary).getByRole('heading', { name: 'Pots' })).toBeInTheDocument()
    expect(within(summary).getAllByText('£0.00').length).toBeGreaterThan(0)
    expect(within(potGrid).getByText('No pots yet.')).toBeInTheDocument()
    expect(within(potGrid).getByText('Create a pot to separate spending, savings, or reserved money.')).toBeInTheDocument()
    expect(screen.queryByText('Archived stash')).not.toBeInTheDocument()
  })

  it('edits and deletes pots after confirmation', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<PotsPage snapshot={createSnapshot()} actions={actions} />)

    expect(screen.queryByText('Pot command centre')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Food' }))

    expect(screen.queryByRole('dialog', { name: 'Create pot' })).not.toBeInTheDocument()
    const editDialog = screen.getByRole('dialog', { name: 'Edit pot' })
    await user.clear(within(editDialog).getByLabelText('Pot name'))
    await user.type(within(editDialog).getByLabelText('Pot name'), 'Groceries')
    await user.click(within(editDialog).getByRole('button', { name: 'Save pot' }))

    expect(actions.updatePot).toHaveBeenCalledWith('pot-food', {
      balancePence: 12000,
      category: 'Spending',
      color: '#16a34a',
      icon: 'food',
      linkedCreditCardId: null,
      linkedDebtId: null,
      name: 'Groceries',
      targetPence: null,
      type: 'spending',
    })
    expect(screen.queryByRole('dialog', { name: 'Edit pot' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete Food' }))

    expect(confirmSpy).toHaveBeenCalledWith('Delete Food?')
    expect(actions.deletePot).toHaveBeenCalledWith('pot-food')

    confirmSpy.mockRestore()
  })

  it('keeps pot create and top-up forms hidden until their actions open drawers', async () => {
    const user = userEvent.setup()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
    })

    render(
      <PotsPage
        snapshot={createSnapshot({ payPeriods: [selectedPayPeriod] })}
        actions={createActions()}
        selectedPayPeriod={selectedPayPeriod}
      />,
    )

    expect(screen.queryByLabelText('Pot name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Pot to top up')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Create pot' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Top up pot' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create pot' }))

    expect(within(screen.getByRole('dialog', { name: 'Create pot' })).getByLabelText('Pot name')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close create pot' }))
    await user.click(screen.getByRole('button', { name: 'Top up pot' }))

    const topUpDialog = screen.getByRole('dialog', { name: 'Top up pot' })
    expect(within(topUpDialog).getByLabelText('Pot to top up')).toBeInTheDocument()
    expect(within(topUpDialog).getByLabelText('Top up amount')).toBeInTheDocument()
  })

  it('creates a pot linked to a credit card reserve target', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const snapshot = createSnapshot({
      creditCards: [
        {
          id: 'card-amex',
          name: 'Everyday Amex',
          provider: 'Amex',
          limitPence: 80000,
          openingBalancePence: 60000,
          dueDay: 1,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<PotsPage snapshot={snapshot} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Create pot' }))
    const createDialog = screen.getByRole('dialog', { name: 'Create pot' })
    await user.type(within(createDialog).getByLabelText('Pot name'), 'Amex reserve')
    await user.type(within(createDialog).getByLabelText(/Current balance/), '400.00')
    await user.selectOptions(within(createDialog).getByLabelText('Link this pot to'), 'credit_card')
    await user.selectOptions(within(createDialog).getByLabelText('Credit card'), 'card-amex')
    await user.click(within(createDialog).getByRole('button', { name: 'Add pot' }))

    expect(actions.addPot).toHaveBeenCalledWith({
      balancePence: 40000,
      category: 'Spending',
      color: '#2563eb',
      icon: 'wallet',
      linkedCreditCardId: 'card-amex',
      linkedDebtId: null,
      name: 'Amex reserve',
      targetPence: null,
      type: 'spending',
    })
  })

  it('creates a pot linked to the selected debt target', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const snapshot = createSnapshot({
      debts: [
        {
          id: 'debt-airbnb',
          name: 'AIRBNB',
          lender: 'AIRBNB',
          originalAmountPence: 50000,
          currentBalancePence: 50000,
          minimumPaymentPence: 0,
          dueDate: '2026-06-10',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<PotsPage snapshot={snapshot} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Create pot' }))
    const createDialog = screen.getByRole('dialog', { name: 'Create pot' })
    await user.type(within(createDialog).getByLabelText('Pot name'), 'AIRBNB')
    await user.selectOptions(within(createDialog).getByLabelText('Link this pot to'), 'debt')
    await user.click(within(createDialog).getByRole('button', { name: 'Add pot' }))

    expect(actions.addPot).toHaveBeenCalledWith({
      balancePence: 0,
      category: 'Spending',
      color: '#2563eb',
      icon: 'wallet',
      linkedCreditCardId: null,
      linkedDebtId: 'debt-airbnb',
      name: 'AIRBNB',
      targetPence: null,
      type: 'spending',
    })
  })

  it('does not save a debt-linked pot until a debt is available', async () => {
    const user = userEvent.setup()
    const actions = createActions()

    render(<PotsPage snapshot={createSnapshot()} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Create pot' }))
    const createDialog = screen.getByRole('dialog', { name: 'Create pot' })
    await user.type(within(createDialog).getByLabelText('Pot name'), 'Debt pot')
    await user.selectOptions(within(createDialog).getByLabelText('Link this pot to'), 'debt')

    expect(within(createDialog).getByRole('button', { name: 'Add pot' })).toBeDisabled()
  })

  it('creates a custom pot section and saves the selected symbol', async () => {
    const user = userEvent.setup()
    const actions = createActions()

    render(<PotsPage snapshot={createSnapshot()} actions={actions} />)

    await user.click(screen.getByRole('button', { name: 'Add pot category' }))
    await user.type(screen.getByLabelText('New pot category'), 'Travel')
    await user.click(screen.getByRole('button', { name: 'Add section' }))

    expect(screen.getByRole('button', { name: 'Travel' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create pot' }))
    const createDialog = screen.getByRole('dialog', { name: 'Create pot' })
    await user.type(within(createDialog).getByLabelText('Pot name'), 'Holiday')
    await user.click(within(createDialog).getByRole('button', { name: 'Use Shield symbol' }))
    await user.click(within(createDialog).getByRole('button', { name: 'Add pot' }))

    expect(actions.addPot).toHaveBeenCalledWith({
      balancePence: 0,
      category: 'Travel',
      color: '#2563eb',
      icon: 'shield',
      linkedCreditCardId: null,
      linkedDebtId: null,
      name: 'Holiday',
      targetPence: null,
      type: 'spending',
    })
  })

  it('tops up a pot from the selected paycheck allocation', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
    })

    render(
      <PotsPage
        snapshot={createSnapshot({ payPeriods: [selectedPayPeriod] })}
        actions={actions}
        selectedPayPeriod={selectedPayPeriod}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Top up pot' }))
    const topUpDialog = screen.getByRole('dialog', { name: 'Top up pot' })
    await user.selectOptions(within(topUpDialog).getByLabelText('Pot to top up'), 'pot-food')
    await user.type(within(topUpDialog).getByLabelText('Top up amount'), '25.00')
    await user.click(within(topUpDialog).getByRole('button', { name: 'Top up pot' }))

    expect(actions.upsertPaycheckPotAllocation).toHaveBeenCalledWith({
      id: expect.stringMatching(/^pot-top-up-period-current-pot-food-/),
      payPeriodId: 'period-current',
      potId: 'pot-food',
      amountPence: 2500,
    })
    expect(screen.queryByRole('dialog', { name: 'Top up pot' })).not.toBeInTheDocument()
  })

  it('records another pot top-up as a separate paycheck allocation', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
    })

    render(
      <PotsPage
        snapshot={createSnapshot({
          payPeriods: [selectedPayPeriod],
          potAllocations: [
            {
              id: 'pot-top-up-period-current-pot-food',
              payPeriodId: 'period-current',
              potId: 'pot-food',
              amountPence: 1000,
              source: 'manual',
              recurringPaymentId: null,
              createdAt: '2026-05-16T00:00:00.000Z',
              updatedAt: '2026-05-16T00:00:00.000Z',
            },
          ],
        })}
        actions={actions}
        selectedPayPeriod={selectedPayPeriod}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Top up pot' }))
    const topUpDialog = screen.getByRole('dialog', { name: 'Top up pot' })
    await user.selectOptions(within(topUpDialog).getByLabelText('Pot to top up'), 'pot-food')
    await user.type(within(topUpDialog).getByLabelText('Top up amount'), '15.00')
    await user.click(within(topUpDialog).getByRole('button', { name: 'Top up pot' }))

    expect(actions.upsertPaycheckPotAllocation).toHaveBeenCalledWith({
      id: expect.stringMatching(/^pot-top-up-period-current-pot-food-/),
      payPeriodId: 'period-current',
      potId: 'pot-food',
      amountPence: 1500,
    })
  })

  it('shows top-up history for the selected paycheck and can delete a top-up', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
    })

    render(
      <PotsPage
        snapshot={createSnapshot({
          payPeriods: [selectedPayPeriod],
          potAllocations: [
            {
              id: 'pot-top-up-period-current-pot-food',
              payPeriodId: 'period-current',
              potId: 'pot-food',
              amountPence: 1000,
              source: 'manual',
              recurringPaymentId: null,
              createdAt: '2026-05-16T00:00:00.000Z',
              updatedAt: '2026-05-16T00:00:00.000Z',
            },
            {
              id: 'pot-top-up-period-current-pot-bills-abc123',
              payPeriodId: 'period-current',
              potId: 'pot-bills',
              amountPence: 2250,
              source: 'manual',
              recurringPaymentId: null,
              createdAt: '2026-05-17T00:00:00.000Z',
              updatedAt: '2026-05-17T00:00:00.000Z',
            },
          ],
        })}
        actions={actions}
        selectedPayPeriod={selectedPayPeriod}
      />,
    )

    const topUpPanel = screen.getByRole('region', { name: 'Top-up history' })

    expect(within(topUpPanel).getByText('Top-up history')).toBeInTheDocument()
    expect(within(topUpPanel).getAllByText('Food').length).toBeGreaterThan(0)
    expect(within(topUpPanel).getAllByText('Bills').length).toBeGreaterThan(0)
    expect(within(topUpPanel).getByText('£10.00')).toBeInTheDocument()
    expect(within(topUpPanel).getByText('£22.50')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete Bills top-up' }))

    expect(actions.deletePaycheckPotAllocation).toHaveBeenCalledWith('pot-top-up-period-current-pot-bills-abc123')
  })

  it('shows the linked debt balance as the pot target', () => {
    const snapshot = createSnapshot({
      pots: [
        {
          id: 'pot-airbnb',
          name: 'AIRBNB',
          type: 'reserved',
          category: 'Bills',
          icon: 'home',
          balancePence: 12500,
          targetPence: null,
          color: '#2563eb',
          linkedCreditCardId: null,
          linkedDebtId: 'debt-airbnb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      debts: [
        {
          id: 'debt-airbnb',
          name: 'AIRBNB',
          lender: 'AIRBNB',
          originalAmountPence: 50000,
          currentBalancePence: 50000,
          minimumPaymentPence: 0,
          dueDate: '2026-06-10',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<PotsPage snapshot={snapshot} actions={createActions()} />)

    expect(screen.getByText('£500.00 target')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('shows the true percentage when a debt-linked pot is over the debt target', () => {
    const snapshot = createSnapshot({
      pots: [
        {
          id: 'pot-airbnb',
          name: 'AIRBNB',
          type: 'reserved',
          category: 'Bills',
          icon: 'home',
          balancePence: 60000,
          targetPence: null,
          color: '#2563eb',
          linkedCreditCardId: null,
          linkedDebtId: 'debt-airbnb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      debts: [
        {
          id: 'debt-airbnb',
          name: 'AIRBNB',
          lender: 'AIRBNB',
          originalAmountPence: 50000,
          currentBalancePence: 50000,
          minimumPaymentPence: 0,
          dueDate: '2026-06-10',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<PotsPage snapshot={snapshot} actions={createActions()} />)

    expect(screen.getByText('£500.00 target')).toBeInTheDocument()
    expect(screen.getByText('120%')).toBeInTheDocument()
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
  })

  it('shows the true percentage when a pot is over target', () => {
    const snapshot = createSnapshot({
      pots: [
        {
          id: 'pot-emergency',
          name: 'Emergency fund',
          type: 'saving',
          category: 'Savings',
          icon: 'savings',
          balancePence: 11400,
          targetPence: 10000,
          color: '#16a34a',
          linkedCreditCardId: null,
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<PotsPage snapshot={snapshot} actions={createActions()} />)

    expect(screen.getByText('114%')).toBeInTheDocument()
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
  })

  it('shows the true percentage for over-target savings and investments pots', () => {
    const snapshot = createSnapshot({
      pots: [
        {
          id: 'pot-emergency',
          name: 'Emergency fund',
          type: 'saving',
          category: 'Savings',
          icon: 'savings',
          balancePence: 11400,
          targetPence: 10000,
          color: '#16a34a',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<SavingsInvestmentsPage snapshot={snapshot} actions={createActions()} selectedPayPeriod={null} />)

    expect(screen.queryByText('Savings runway')).not.toBeInTheDocument()
    expect(screen.getByText('Saved so far')).toBeInTheDocument()
    expect(screen.getByText('This paycheck')).toBeInTheDocument()
    expect(screen.getByText('Targets')).toBeInTheDocument()
    expect(screen.getByText('114%')).toBeInTheDocument()
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
  })

  it('opens a pot detail drawer to show spending recurring payments and allocations tied to it', async () => {
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

    expect(screen.queryByRole('dialog', { name: 'Food pot details' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'View Food details' }))

    const activity = screen.getByRole('dialog', { name: 'Food pot details' })
    expect(within(activity).getAllByText('Lunch').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('Spending · 2026-05-17').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('-£12.50').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('Paycheck allocation').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('Allocation · 2026-05-16').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('+£75.00').length).toBeGreaterThan(0)
    expect(within(activity).getAllByText('Meal kit').length).toBeGreaterThan(0)
    expect(within(activity).getByText('Linked recurring payments')).toBeInTheDocument()
    expect(within(activity).getByText('monthly · due day 20')).toBeInTheDocument()
    expect(within(activity).getByText('£18.00')).toBeInTheDocument()
    expect(within(activity).queryByText('Direct debit')).not.toBeInTheDocument()
  })

  it('shows pot card progress from linked recurring, credit card, and debt obligations', () => {
    const snapshot = createSnapshot({
      pots: [
        {
          id: 'pot-car',
          name: 'Car Insurance',
          type: 'reserved',
          category: 'Bills',
          icon: 'shield',
          balancePence: 8711,
          targetPence: null,
          color: '#7c3aed',
          linkedCreditCardId: null,
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'pot-card',
          name: 'Capital One',
          type: 'spending',
          category: 'Spending',
          icon: 'card',
          balancePence: 40000,
          targetPence: null,
          color: '#ea580c',
          linkedCreditCardId: 'card-capital-one',
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'pot-debt',
          name: 'AIRBNB',
          type: 'reserved',
          category: 'Bills',
          icon: 'home',
          balancePence: 34678,
          targetPence: null,
          color: '#2563eb',
          linkedCreditCardId: null,
          linkedDebtId: 'debt-airbnb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'rec-car',
          name: 'Car insurance',
          amountPence: 8711,
          dueDay: 1,
          frequency: 'monthly',
          potId: 'pot-car',
          creditCardId: null,
          priority: 'essential',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      creditCards: [
        {
          id: 'card-capital-one',
          name: 'Capital One',
          provider: 'Capital One',
          limitPence: 80000,
          openingBalancePence: 60000,
          dueDay: 5,
          dueDate: null,
          color: '#ea580c',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      debts: [
        {
          id: 'debt-airbnb',
          name: 'AIRBNB',
          lender: 'AIRBNB',
          originalAmountPence: 55741,
          currentBalancePence: 55741,
          minimumPaymentPence: 0,
          dueDate: '2026-06-05',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<PotsPage snapshot={snapshot} actions={createActions()} />)

    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('£87.11 target')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
    expect(screen.getByText('£600.00 target')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()
    expect(screen.getByText('£557.41 target')).toBeInTheDocument()
  })

  it('shows the real pot percentage when a pot is over target', () => {
    const snapshot = createSnapshot({
      pots: [
        {
          id: 'pot-holiday',
          name: 'Holiday',
          type: 'spending',
          category: 'Savings',
          icon: 'target',
          balancePence: 15000,
          targetPence: 10000,
          color: '#2563eb',
          linkedCreditCardId: null,
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<PotsPage snapshot={snapshot} actions={createActions()} />)

    expect(screen.getByText('150%')).toBeInTheDocument()
    expect(screen.getByText('£100.00 target')).toBeInTheDocument()
  })

  it('labels linked credit card pot targets as forecast cover when upcoming card charges are included', () => {
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 78850,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      pots: [
        {
          id: 'pot-barclays',
          name: 'Barclays',
          type: 'reserved',
          category: 'Bills',
          icon: 'card',
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
    })

    render(<PotsPage snapshot={snapshot} actions={createActions()} />)

    expect(screen.getByText('77%')).toBeInTheDocument()
    expect(screen.getByText('£775.05 forecast target')).toBeInTheDocument()
    expect(screen.getByText('Due now • £178.57 left')).toBeInTheDocument()
  })

  it('increases a linked credit card pot target when new card spend is logged', () => {
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 78850,
    })
    const snapshot = createSnapshot({
      settings: {
        ...createSnapshot().settings,
        appDateMode: 'manual',
        manualTodayIso: '2026-05-26',
      },
      payPeriods: [selectedPayPeriod],
      pots: [
        {
          id: 'pot-barclays',
          name: 'Barclays',
          type: 'reserved',
          category: 'Bills',
          icon: 'card',
          balancePence: 68005,
          targetPence: null,
          color: '#2563eb',
          linkedCreditCardId: 'card-barclays',
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
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
      transactions: [
        {
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
        },
      ],
    })

    render(<PotsPage snapshot={snapshot} actions={createActions()} />)

    expect(screen.getByText('97%')).toBeInTheDocument()
    expect(screen.getByText('£700.05 target')).toBeInTheDocument()
    expect(screen.getByText('Due in 16 days • £20.00 left')).toBeInTheDocument()
  })
})

describe('recurring page', () => {
  it('shows a Bills summary and row list for active paused and due-soon bills', () => {
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
    })
    const snapshot = createSnapshot({
      settings: createSettings({ appDateMode: 'manual', manualTodayIso: '2026-05-16' }),
      payPeriods: [selectedPayPeriod],
      recurringPayments: [
        {
          id: 'rec-phone',
          name: 'Phone',
          amountPence: 2200,
          dueDay: 18,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'important',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'rec-broadband',
          name: 'Broadband',
          amountPence: 3200,
          dueDay: 24,
          frequency: 'monthly',
          potId: null,
          creditCardId: 'card-aqua',
          priority: 'essential',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'rec-gym',
          name: 'Gym',
          amountPence: 1800,
          dueDay: 20,
          frequency: 'monthly',
          potId: 'pot-food',
          priority: 'optional',
          active: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      creditCards: [
        {
          id: 'card-aqua',
          name: 'Aqua',
          provider: 'Aqua',
          limitPence: 80000,
          dueDay: 5,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<RecurringPage snapshot={snapshot} actions={createActions()} selectedPayPeriod={selectedPayPeriod} />)

    const summary = screen.getByRole('region', { name: 'Bills summary' })

    expect(within(summary).getByRole('heading', { name: 'Bills' })).toBeInTheDocument()
    expect(within(summary).getByText('Bills this pay period')).toBeInTheDocument()
    expect(within(summary).getByText('Next bill due')).toBeInTheDocument()
    expect(within(summary).getByText('2 active bills')).toBeInTheDocument()
    expect(within(summary).queryByText('Active bills')).not.toBeInTheDocument()
    expect(within(summary).queryByText('Before next payday')).not.toBeInTheDocument()
    expect(within(summary).getAllByText('£54.00').length).toBe(1)
    expect(within(summary).getByText('Phone')).toBeInTheDocument()
    expect(within(summary).getByText('2026-05-18')).toBeInTheDocument()

    const billsList = screen.getByRole('region', { name: 'Bills list' })
    const phoneRow = within(billsList).getByRole('article', { name: 'Phone bill row' })
    const broadbandRow = within(billsList).getByRole('article', { name: 'Broadband bill row' })
    const gymRow = within(billsList).getByRole('article', { name: 'Gym bill row' })

    expect(within(phoneRow).getByLabelText('Phone status active')).toBeInTheDocument()
    expect(within(phoneRow).getByText('Due soon')).toBeInTheDocument()
    expect(within(phoneRow).getByText(/Due day 18/)).toBeInTheDocument()
    expect(within(phoneRow).getByText(/monthly/)).toBeInTheDocument()
    expect(within(phoneRow).getByText('Bills')).toBeInTheDocument()
    expect(within(phoneRow).getByText('important')).toBeInTheDocument()
    expect(within(phoneRow).getByText('£22.00')).toBeInTheDocument()

    expect(within(broadbandRow).getByText('Aqua')).toBeInTheDocument()
    expect(within(broadbandRow).getByText('essential')).toBeInTheDocument()
    expect(within(gymRow).getByLabelText('Gym status paused')).toBeInTheDocument()
    expect(within(gymRow).getByText('Paused')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Recurring payments' })).not.toBeInTheDocument()
  })

  it('shows a clean Bills empty state when no bills exist', () => {
    render(<RecurringPage snapshot={createSnapshot()} actions={createActions()} />)

    const summary = screen.getByRole('region', { name: 'Bills summary' })
    const billsList = screen.getByRole('region', { name: 'Bills list' })

    expect(within(summary).getByRole('heading', { name: 'Bills' })).toBeInTheDocument()
    expect(within(summary).getAllByText('£0.00').length).toBeGreaterThan(0)
    expect(within(summary).getByText('0 active bills')).toBeInTheDocument()
    expect(within(summary).getByText('No bills scheduled')).toBeInTheDocument()
    expect(within(billsList).getByText('No bills yet.')).toBeInTheDocument()
    expect(within(billsList).getByText('Add a bill to start tracking recurring payments.')).toBeInTheDocument()
  })

  it('opens the create form from the app header action and keeps payment details tucked away', async () => {
    const user = userEvent.setup()
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

    render(<RecurringWithHeaderAction snapshot={snapshot} actions={createActions()} />)

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Bills list' })).getByRole('article', {
        name: 'Phone bill row',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Paid from Bills')).not.toBeInTheDocument()
    expect(screen.queryByText('Recurring control')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New payment' }))

    const createDialog = screen.getByRole('dialog', { name: 'Add recurring payment' })
    expect(within(createDialog).getByLabelText('Name')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show Phone details' }))

    expect(screen.getByText('Paid from Bills')).toBeInTheDocument()
  })

  it('removes the recurring calendar and keeps the payment list visible', () => {
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
        {
          id: 'rec-broadband',
          name: 'Broadband',
          amountPence: 3200,
          dueDay: 15,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'important',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<RecurringPage snapshot={snapshot} actions={createActions()} />)

    expect(screen.queryByRole('region', { name: 'Recurring calendar' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Bills list' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Recurring payments' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'What you owe next payday' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Upcoming bills' })).toBeInTheDocument()
    expect(screen.getAllByText('Phone').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Broadband').length).toBeGreaterThan(0)
  })

  it('shows a Bills-only upcoming agenda without dashboard next-payday totals', () => {
    const snapshot = createSnapshot({
      settings: createSettings({ appDateMode: 'manual', manualTodayIso: '2026-05-16' }),
      pots: [
        {
          id: 'pot-bills',
          name: 'Bills',
          type: 'reserved',
          balancePence: 0,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
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

    const upcomingPanel = screen.getByRole('region', { name: 'Upcoming bills' })
    expect(within(upcomingPanel).getByText('Rent')).toBeInTheDocument()
    expect(within(upcomingPanel).getByText('2026-06-01')).toBeInTheDocument()
    expect(within(upcomingPanel).getByText('£650.00')).toBeInTheDocument()
    expect(within(upcomingPanel).queryByText('MOT')).not.toBeInTheDocument()
    expect(within(upcomingPanel).queryByText('Loan')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'What you owe next payday' })).not.toBeInTheDocument()
    expect(screen.queryByText('Total owed next payday')).not.toBeInTheDocument()
    expect(screen.queryByText('Money left estimate')).not.toBeInTheDocument()
  })

  it('creates a card-linked recurring payment without a pot', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const snapshot = createSnapshot({
      creditCards: [
        {
          id: 'card-aqua',
          name: 'Aqua',
          provider: 'Aqua',
          limitPence: 80000,
          dueDay: 5,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<RecurringPage snapshot={snapshot} actions={actions} isCreateOpen onCreateOpenChange={vi.fn()} />)
    await user.type(screen.getByLabelText('Name'), 'Spotify')
    await user.type(screen.getByLabelText('Amount'), '11.99')
    await user.clear(screen.getByLabelText('Due day'))
    await user.type(screen.getByLabelText('Due day'), '12')
    await user.selectOptions(screen.getByLabelText('Paid from pot'), '')
    await user.selectOptions(screen.getByLabelText('Paid on credit card'), 'card-aqua')
    await user.click(screen.getByRole('button', { name: 'Add recurring payment' }))

    expect(actions.addRecurringPayment).toHaveBeenCalledWith({
      amountPence: 1199,
      creditCardId: 'card-aqua',
      dueDate: null,
      dueDay: 12,
      frequency: 'monthly',
      name: 'Spotify',
      potId: null,
      priority: 'essential',
    })
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

    const editDialog = screen.getByRole('dialog', { name: 'Edit recurring payment' })
    await user.clear(within(editDialog).getByLabelText('Amount'))
    await user.type(within(editDialog).getByLabelText('Amount'), '25.50')
    await user.selectOptions(within(editDialog).getByLabelText('Frequency'), 'yearly')
    await user.click(within(editDialog).getByRole('button', { name: 'Save recurring payment' }))

    expect(actions.updateRecurringPayment).toHaveBeenCalledWith('rec-phone', {
      amountPence: 2550,
      dueDate: null,
      dueDay: 23,
      frequency: 'yearly',
      name: 'Phone',
      potId: 'pot-bills',
      priority: 'important',
    })
  })

  it('flags recurring payments linked to missing credit cards', () => {
    const snapshot = createSnapshot({
      recurringPayments: [
        {
          id: 'personal',
          name: 'Personal',
          amountPence: 5000,
          dueDate: '2026-05-29',
          frequency: 'biweekly',
          potId: null,
          creditCardId: 'card-capital-one',
          priority: 'optional',
          active: true,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
      creditCards: [],
    })

    render(<RecurringPage snapshot={snapshot} actions={createActions()} />)

    expect(screen.getByText(/missing card card-capital-one/i)).toBeInTheDocument()
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

  it('shows the premium Overview hero with real summary values and primary actions', async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn()
    const selectedPayPeriod = createPayPeriod({ incomePence: 90000 })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      creditCards: [
        {
          id: 'card-amex',
          name: 'Everyday Amex',
          provider: 'Amex',
          limitPence: 100000,
          dueDay: 1,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      creditCardPots: [
        {
          id: 'credit-pot-amex',
          creditCardId: 'card-amex',
          payPeriodId: selectedPayPeriod.id,
          payday: selectedPayPeriod.payday,
          periodStartDate: selectedPayPeriod.startDate,
          periodEndDate: selectedPayPeriod.endDate,
          name: 'Amex payoff',
          amountPence: 5000,
          source: 'paycheck',
          status: 'active',
          note: 'Card set-aside',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} onViewChange={onViewChange} />)

    const overviewHero = screen.getByRole('region', { name: 'Overview hero' })

    expect(within(overviewHero).getAllByText('Money left this pay period').length).toBeGreaterThan(0)
    expect(within(overviewHero).getByText('16th May 26 to 29th May 26')).toBeInTheDocument()
    expect(within(overviewHero).getAllByText('£850.00').length).toBeGreaterThan(0)
    expect(within(overviewHero).getAllByText('Income').length).toBeGreaterThan(0)
    expect(within(overviewHero).getAllByText('Planned costs').length).toBeGreaterThan(0)
    expect(within(overviewHero).getAllByText('Card cover / spend').length).toBeGreaterThan(0)
    expect(within(overviewHero).getByText('Available after cards')).toBeInTheDocument()
    expect(within(overviewHero).getAllByText('£900.00').length).toBeGreaterThan(0)
    expect(within(overviewHero).getAllByText('£50.00').length).toBeGreaterThan(0)

    await user.click(within(overviewHero).getByRole('button', { name: 'Log spend' }))
    await user.click(within(overviewHero).getByRole('button', { name: 'Update payday' }))

    expect(onViewChange).toHaveBeenNthCalledWith(1, 'spending')
    expect(onViewChange).toHaveBeenNthCalledWith(2, 'payday')
  })

  it('shows a clean empty Overview hero without fake money values', async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn()

    render(<DashboardPage snapshot={createSnapshot()} selectedPayPeriod={null} onViewChange={onViewChange} />)

    const overviewHero = screen.getByRole('region', { name: 'Overview hero' })

    expect(within(overviewHero).getByText('No paycheck plan yet')).toBeInTheDocument()
    expect(within(overviewHero).getByText('Create your first paycheck plan to see your pay, planned costs, and money left.')).toBeInTheDocument()
    expect(within(overviewHero).queryByText('£0.00')).not.toBeInTheDocument()

    await user.click(within(overviewHero).getByRole('button', { name: 'Update payday' }))

    expect(onViewChange).toHaveBeenCalledWith('payday')
  })

  it('shows one clear pay summary with correct current period maths', () => {
    const snapshot = createSnapshot({
      pots: [
        {
          id: 'pot-bills',
          name: 'Bills',
          type: 'reserved',
          balancePence: 0,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
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

    const currentPeriod = screen.getByRole('region', { name: 'Overview hero' })
    expect(within(currentPeriod).getAllByText('Income').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('Planned costs').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('Money left this pay period').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getByText('Safe to spend')).toBeInTheDocument()
    expect(within(currentPeriod).getAllByText('£798.00').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('£250.00').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('£548.00').length).toBeGreaterThan(0)
    expect(screen.queryByText('Safe today')).not.toBeInTheDocument()
    expect(screen.queryByText('Available after bills')).not.toBeInTheDocument()
    expect(screen.queryByText('Dashboard command centre')).not.toBeInTheDocument()
    expect(screen.queryByText('Checklist position')).not.toBeInTheDocument()
    expect(screen.queryByText('Paycheck shape')).not.toBeInTheDocument()
  })

  it('shows compact lower Overview sections with useful obligations and recent activity rows', () => {
    const restoreLocalStorage = mockLocalStorage()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 120000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      pots: [
        {
          id: 'pot-bills',
          name: 'Bills',
          type: 'reserved',
          balancePence: 0,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'pot-food',
          name: 'Food',
          type: 'spending',
          balancePence: 9000,
          targetPence: null,
          color: '#16a34a',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'pot-holiday',
          name: 'Holiday',
          type: 'saving',
          balancePence: 25000,
          targetPence: 10000,
          color: '#7c3aed',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'council-tax',
          name: 'Council Tax',
          amountPence: 6000,
          dueDay: 20,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'essential',
          active: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'rent',
          name: 'Rent',
          amountPence: 100000,
          dueDay: 8,
          frequency: 'monthly',
          potId: null,
          priority: 'essential',
          active: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      customPayments: [
        {
          id: 'mot',
          name: 'MOT',
          amountPence: 14950,
          dueDate: '2026-06-02',
          status: 'unpaid',
          creditCardId: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      debts: [
        {
          id: 'debt-loan',
          name: 'Loan',
          lender: 'Finance Co',
          originalAmountPence: 50000,
          currentBalancePence: 20000,
          minimumPaymentPence: 4000,
          dueDate: '2026-06-05',
          interestRateApr: null,
          note: '',
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
          dueDay: 1,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      creditCardPots: [
        {
          id: 'credit-pot-amex',
          creditCardId: 'card-amex',
          payPeriodId: null,
          payday: '2026-05-30',
          periodStartDate: '2026-05-30',
          periodEndDate: '2026-06-12',
          name: 'Amex payoff',
          amountPence: 5000,
          source: 'paycheck',
          status: 'active',
          note: 'Card set-aside',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      potAllocations: [
        {
          id: 'allocation-food',
          payPeriodId: 'period-current',
          potId: 'pot-food',
          amountPence: 2500,
          source: 'manual',
          recurringPaymentId: null,
          createdAt: '2026-05-18T00:00:00.000Z',
          updatedAt: '2026-05-18T00:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'txn-lunch',
          potId: 'pot-food',
          payPeriodId: 'period-current',
          amountPence: 1250,
          type: 'spending',
          paymentMethod: 'pot',
          creditCardId: null,
          recurringPaymentId: null,
          date: '2026-05-18',
          note: 'Lunch',
          createdAt: '2026-05-18T10:00:00.000Z',
          updatedAt: '2026-05-18T10:00:00.000Z',
        },
      ],
    })

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} onViewChange={vi.fn()} />)

    const checklist = screen.getByRole('region', { name: 'Paycheck to-do list' })
    expect(within(checklist).getByText('0 of 3 sorted')).toBeInTheDocument()
    expect(within(checklist).getByText('£97.50 left to sort')).toBeInTheDocument()
    expect(within(checklist).getByText('Set aside £60.00 into "Bills" pot for "Council Tax"')).toBeInTheDocument()
    expect(within(checklist).queryByText('Done')).not.toBeInTheDocument()
    expect(within(checklist).queryByText('Left')).not.toBeInTheDocument()
    expect(within(checklist).queryByText('Ignored')).not.toBeInTheDocument()

    const obligations = screen.getByRole('region', { name: 'What you owe next paycheck' })
    expect(within(obligations).getByText('Rent')).toBeInTheDocument()
    expect(within(obligations).getByText('MOT')).toBeInTheDocument()
    expect(within(obligations).getByText('Loan')).toBeInTheDocument()
    expect(within(obligations).getByText('Amex payoff')).toBeInTheDocument()
    expect(within(obligations).queryByText('Holiday')).not.toBeInTheDocument()
    expect(within(obligations).queryByText('Total outgoing')).not.toBeInTheDocument()
    expect(within(obligations).queryByText('Money left estimate')).not.toBeInTheDocument()
    expect(within(obligations).queryByRole('button', { name: 'Show next paycheck outgoings' })).not.toBeInTheDocument()

    const activity = screen.getByRole('region', { name: 'Recent activity' })
    expect(within(activity).getByText('Lunch')).toBeInTheDocument()
    expect(within(activity).getByText('Spending · Food')).toBeInTheDocument()
    expect(within(activity).getByText('2026-05-18')).toBeInTheDocument()
    expect(within(activity).getByText('-£12.50')).toBeInTheDocument()
    expect(within(activity).getByText('Food top-up')).toBeInTheDocument()
    expect(within(activity).getByText('Pot top-up · Food')).toBeInTheDocument()
    expect(within(activity).getByText('2026-05-16')).toBeInTheDocument()
    expect(within(activity).getByText('+£25.00')).toBeInTheDocument()

    restoreLocalStorage()
  })

  it('shows clean empty lower Overview states without duplicate totals', () => {
    const restoreLocalStorage = mockLocalStorage()
    const selectedPayPeriod = createPayPeriod()
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      pots: [],
      transactions: [],
      potAllocations: [],
      recurringPayments: [],
      customPayments: [],
      debts: [],
      creditCards: [],
      creditCardPots: [],
    })

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} onViewChange={vi.fn()} />)

    expect(screen.getByText('No set-asides for this paycheck')).toBeInTheDocument()
    expect(screen.getByText('No bills, debts, or card payments in this preview.')).toBeInTheDocument()
    expect(screen.getByText('No recent activity for this paycheck.')).toBeInTheDocument()
    expect(screen.queryByText('Total outgoing')).not.toBeInTheDocument()
    expect(screen.queryByText('Money left estimate')).not.toBeInTheDocument()

    restoreLocalStorage()
  })

  it('previews next paycheck outgoings in a compact agenda with paycheck navigation', async () => {
    const user = userEvent.setup()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      payFrequency: 'biweekly',
      incomePence: 200000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      recurringPayments: [
        {
          id: 'rent',
          name: 'Rent',
          amountPence: 100000,
          dueDay: 8,
          frequency: 'monthly',
          potId: null,
          priority: 'essential',
          active: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'phone',
          name: 'Phone',
          amountPence: 3300,
          dueDay: 20,
          frequency: 'monthly',
          potId: null,
          priority: 'important',
          active: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      customPayments: [
        {
          id: 'mot',
          name: 'MOT',
          amountPence: 14950,
          dueDate: '2026-06-16',
          status: 'unpaid',
          creditCardId: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    })

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} onViewChange={vi.fn()} />)

    const previewPanel = screen.getByRole('region', { name: 'What you owe next paycheck' })
    expect(within(previewPanel).getByText('2026-06-05 to 2026-06-18')).toBeInTheDocument()
    expect(within(previewPanel).getAllByText('£1,149.50').length).toBeGreaterThan(0)
    expect(within(previewPanel).getByText('Rent')).toBeInTheDocument()
    expect(within(previewPanel).getByText('MOT')).toBeInTheDocument()
    expect(within(previewPanel).getByText('2026-06-08')).toBeInTheDocument()
    expect(within(previewPanel).getByText('Recurring')).toBeInTheDocument()
    expect(within(previewPanel).getByText('2026-06-16')).toBeInTheDocument()
    expect(within(previewPanel).getByText('Saved payment')).toBeInTheDocument()
    expect(within(previewPanel).queryByText('Phone')).not.toBeInTheDocument()
    expect(within(previewPanel).queryByRole('button', { name: 'Show next paycheck outgoings' })).not.toBeInTheDocument()

    await user.click(within(previewPanel).getByRole('button', { name: 'Next paycheck preview' }))

    expect(within(previewPanel).getByText('2026-06-19 to 2026-07-02')).toBeInTheDocument()
    expect(within(previewPanel).getByText('Phone')).toBeInTheDocument()
    expect(within(previewPanel).getAllByText('£33.00').length).toBeGreaterThan(0)
    expect(within(previewPanel).queryByText('Rent')).not.toBeInTheDocument()

    await user.click(within(previewPanel).getByRole('button', { name: 'Previous paycheck preview' }))

    expect(within(previewPanel).getByText('2026-06-05 to 2026-06-18')).toBeInTheDocument()
    expect(within(previewPanel).getByText('Rent')).toBeInTheDocument()
  })

  it('shows a per-paycheck to-do list and marks set-asides complete', async () => {
    const user = userEvent.setup()
    const restoreLocalStorage = mockLocalStorage()
    const snapshot = createSnapshot({
      payPeriods: [createPayPeriod({ id: 'period-current', incomePence: 120000 })],
      pots: [
        {
          id: 'pot-bills',
          name: 'Bills',
          type: 'reserved',
          balancePence: 0,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'pot-food',
          name: 'Food',
          type: 'spending',
          balancePence: 12000,
          targetPence: null,
          color: '#16a34a',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'insurance',
          name: 'Car Insurance',
          amountPence: 8500,
          dueDay: 1,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'essential',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'council-tax',
          name: 'Council Tax',
          amountPence: 6000,
          dueDay: 20,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'essential',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      potAllocations: [
        {
          id: 'allocation-food',
          payPeriodId: 'period-current',
          potId: 'pot-food',
          amountPence: 14000,
          source: 'manual',
          recurringPaymentId: null,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'allocation-insurance',
          payPeriodId: 'period-current',
          potId: 'pot-bills',
          amountPence: 8500,
          source: 'recurring',
          recurringPaymentId: 'insurance',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
        {
          id: 'allocation-savings-topup',
          payPeriodId: 'period-current',
          potId: 'pot-bills',
          amountPence: 2211,
          source: 'pot_auto',
          recurringPaymentId: null,
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
          dueDate: '2026-05-25',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      debtReserves: [
        {
          id: 'reserve-loan',
          debtId: 'debt-loan',
          payPeriodId: 'period-current',
          payday: '2026-05-16',
          periodStartDate: '2026-05-16',
          periodEndDate: '2026-05-29',
          amountPence: 20000,
          status: 'planned',
          source: 'manual',
          note: 'Loan reserve',
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
          dueDay: 1,
          dueDate: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      creditCardPots: [
        {
          id: 'credit-pot-amex',
          creditCardId: 'card-amex',
          payPeriodId: 'period-current',
          payday: '2026-05-16',
          periodStartDate: '2026-05-16',
          periodEndDate: '2026-05-29',
          name: 'Amex payoff',
          amountPence: 5000,
          source: 'paycheck',
          status: 'active',
          note: 'Card set-aside',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    const { unmount } = render(
      <DashboardPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} onViewChange={vi.fn()} />,
    )

    const todoList = screen.getByRole('region', { name: 'Paycheck to-do list' })
    expect(within(todoList).getByText('0 of 7 done.', { exact: false })).toBeInTheDocument()
    expect(within(todoList).getByText('Set aside £140.00 into "Food" pot')).toBeInTheDocument()
    expect(within(todoList).getByText('Set aside £85.00 into "Bills" pot for "Car Insurance"')).toBeInTheDocument()
    expect(within(todoList).getByText('Set aside £60.00 into "Bills" pot for "Council Tax"')).toBeInTheDocument()
    expect(within(todoList).getByText('Set aside £22.11 into "Bills" pot')).toBeInTheDocument()
    expect(within(todoList).getByText('Set aside £200.00 for "Loan" debt')).toBeInTheDocument()
    expect(within(todoList).getByText('Pay £600.00 toward "Loan" debt')).toBeInTheDocument()
    expect(within(todoList).getByText('Set aside £50.00 for "Everyday Amex" card')).toBeInTheDocument()

    const foodCheckbox = within(todoList).getByRole('checkbox', {
      name: /Set aside £140\.00 into "Food" pot/,
    })
    await user.click(foodCheckbox)

    expect(foodCheckbox).toBeChecked()
    expect(foodCheckbox.closest('li')).toHaveClass('bg-emerald-50')
    expect(within(todoList).getByText('1 of 7 done.', { exact: false })).toBeInTheDocument()

    unmount()

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} onViewChange={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: /Set aside £140\.00 into "Food" pot/ })).toBeChecked()
    restoreLocalStorage()
  })

  it('moves money into a pot when a dashboard set-aside is checked', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const restoreLocalStorage = mockLocalStorage()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 100000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      pots: [
        {
          id: 'pot-bills',
          name: 'Bills',
          type: 'reserved',
          balancePence: 0,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'council-tax',
          name: 'Council Tax',
          amountPence: 14800,
          dueDay: 20,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'essential',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(
      <DashboardPage
        snapshot={snapshot}
        selectedPayPeriod={selectedPayPeriod}
        actions={actions}
        onViewChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: /Set aside £148\.00 into "Bills" pot/ }))

    expect(actions.upsertPaycheckPotAllocation).toHaveBeenCalledWith({
      id: 'dashboard-todo-period-current-recurring-council-tax-2026-05-20',
      payPeriodId: 'period-current',
      potId: 'pot-bills',
      amountPence: 14800,
    })

    restoreLocalStorage()
  })

  it('applies the exact Barclays planned card cover amount from the dashboard checklist', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const restoreLocalStorage = mockLocalStorage()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 78850,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
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
    })

    render(
      <DashboardPage
        snapshot={snapshot}
        selectedPayPeriod={selectedPayPeriod}
        actions={actions}
        onViewChange={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole('checkbox', {
        name: /Set aside £178\.57 into "Barclays" pot for "Barclays" planned card cover/,
      }),
    )

    expect(actions.upsertPaycheckPotAllocation).toHaveBeenCalledWith({
      id: 'dashboard-todo-period-current-linked-credit-card-pot-card-barclays',
      payPeriodId: 'period-current',
      potId: 'pot-barclays',
      amountPence: 17857,
    })

    restoreLocalStorage()
  })

  it('can fund a planned card cover checklist item from a savings pot', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const restoreLocalStorage = mockLocalStorage()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture()
    const snapshotWithSavings = {
      ...snapshot,
      pots: [
        ...snapshot.pots,
        {
          id: 'pot-emergency',
          name: 'Emergency savings',
          type: 'saving' as const,
          balancePence: 20200,
          targetPence: null,
          color: '#10b981',
          linkedCreditCardId: null,
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
    }

    render(
      <DashboardPage
        snapshot={snapshotWithSavings}
        selectedPayPeriod={selectedPayPeriod}
        actions={actions}
        onViewChange={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Pay Barclays planned card cover from'), 'pot-emergency')
    await user.click(
      screen.getByRole('checkbox', {
        name: /Set aside £178\.57 into "Barclays" pot for "Barclays" planned card cover/,
      }),
    )

    expect(actions.upsertPaycheckPotAllocation).toHaveBeenCalledWith({
      id: 'dashboard-todo-period-current-linked-credit-card-pot-card-barclays',
      payPeriodId: 'period-current',
      potId: 'pot-barclays',
      fundingPotId: 'pot-emergency',
      amountPence: 17857,
    })

    restoreLocalStorage()
  })

  it('can change the funding pot after a planned card cover checklist item is completed', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const restoreLocalStorage = mockLocalStorage()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({ completed: true })
    window.localStorage.setItem(
      'new-money.dashboard-todos.v1',
      JSON.stringify({ 'period-current': ['linked-credit-card-pot-card-barclays-todo'] }),
    )
    const snapshotWithSavings = {
      ...snapshot,
      pots: [
        ...snapshot.pots,
        {
          id: 'pot-emergency',
          name: 'Emergency savings',
          type: 'saving' as const,
          balancePence: 20200,
          targetPence: null,
          color: '#10b981',
          linkedCreditCardId: null,
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
    }

    render(
      <DashboardPage
        snapshot={snapshotWithSavings}
        selectedPayPeriod={selectedPayPeriod}
        actions={actions}
        onViewChange={vi.fn()}
      />,
    )

    const fundingSelect = screen.getByLabelText('Pay Barclays planned card cover from')

    expect(fundingSelect).toBeEnabled()

    await user.selectOptions(fundingSelect, 'pot-emergency')

    expect(actions.upsertPaycheckPotAllocation).toHaveBeenCalledWith({
      id: 'dashboard-todo-period-current-linked-credit-card-pot-card-barclays',
      payPeriodId: 'period-current',
      potId: 'pot-barclays',
      fundingPotId: 'pot-emergency',
      amountPence: 17857,
    })

    restoreLocalStorage()
  })

  it('expands a checklist row to show the payments that make up the amount', async () => {
    const user = userEvent.setup()
    const restoreLocalStorage = mockLocalStorage()
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 78850,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
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
    })

    render(
      <DashboardPage
        snapshot={snapshot}
        selectedPayPeriod={selectedPayPeriod}
        actions={createActions()}
        onViewChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Show breakdown.*Barclays planned card cover/ }))

    const breakdown = screen.getByRole('region', { name: /Breakdown.*Barclays planned card cover/ })

    expect(within(breakdown).getByText('Owed from last statement')).toBeInTheDocument()
    expect(within(breakdown).getByText('Fuel')).toBeInTheDocument()
    expect(within(breakdown).getByText('Gym')).toBeInTheDocument()
    expect(within(breakdown).getByText('£83.57')).toBeInTheDocument()
    expect(within(breakdown).getByText('£70.00')).toBeInTheDocument()
    expect(within(breakdown).getByText('£25.00')).toBeInTheDocument()
    expect(within(breakdown).getByText('£178.57')).toBeInTheDocument()

    restoreLocalStorage()
  })

  it('keeps the full linked-card cover breakdown after the checklist item is completed', async () => {
    const user = userEvent.setup()
    const restoreLocalStorage = mockLocalStorage()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({ completed: true })

    render(
      <DashboardPage
        snapshot={snapshot}
        selectedPayPeriod={selectedPayPeriod}
        actions={createActions()}
        onViewChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Show breakdown.*Barclays/ }))

    const breakdown = screen.getByRole('region', { name: /Breakdown.*Barclays/ })

    expect(within(breakdown).getByText('Owed from last statement')).toBeInTheDocument()
    expect(within(breakdown).getByText('Fuel')).toBeInTheDocument()
    expect(within(breakdown).getByText('Gym')).toBeInTheDocument()
    expect(within(breakdown).getByText('£83.57')).toBeInTheDocument()
    expect(within(breakdown).getByText('£70.00')).toBeInTheDocument()
    expect(within(breakdown).getByText('£25.00')).toBeInTheDocument()
    expect(within(breakdown).getByText('£178.57')).toBeInTheDocument()

    restoreLocalStorage()
  })

  it('merges later Barclays card spend into the open planned cover checklist item', async () => {
    const user = userEvent.setup()
    const restoreLocalStorage = mockLocalStorage()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({
      completed: false,
      extraCardSpendPence: 2000,
    })

    render(
      <DashboardPage
        snapshot={snapshot}
        selectedPayPeriod={selectedPayPeriod}
        actions={createActions()}
        onViewChange={vi.fn()}
      />,
    )

    const mergedItem = screen.getByRole('checkbox', {
      name: /Set aside £198\.57 into "Barclays" pot for "Barclays" planned card cover/,
    })

    expect(mergedItem).not.toBeChecked()
    expect(screen.queryByRole('checkbox', { name: /Set aside £20\.00 into "Barclays" pot/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Show breakdown.*Barclays planned card cover/ }))

    const breakdown = screen.getByRole('region', { name: /Breakdown.*Barclays planned card cover/ })

    expect(within(breakdown).getByText('Owed from last statement')).toBeInTheDocument()
    expect(within(breakdown).getByText('Coffee')).toBeInTheDocument()
    expect(within(breakdown).getByText('Fuel')).toBeInTheDocument()
    expect(within(breakdown).getByText('Gym')).toBeInTheDocument()
    expect(within(breakdown).getByText('£20.00')).toBeInTheDocument()
    expect(within(breakdown).getByText('£198.57')).toBeInTheDocument()

    restoreLocalStorage()
  })

  it('carries an unchecked linked-card spend into the next paycheck checklist', () => {
    const restoreLocalStorage = mockLocalStorage()
    const currentPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 78850,
    })
    const nextPeriod = createPayPeriod({
      id: 'period-next',
      startDate: '2026-06-05',
      endDate: '2026-06-18',
      payday: '2026-06-05',
      nextPayday: '2026-06-19',
      incomePence: 78850,
      status: 'planned',
    })
    const snapshot = createSnapshot({
      settings: {
        ...createSnapshot().settings,
        appDateMode: 'manual',
        manualTodayIso: '2026-06-05',
      },
      payPeriods: [currentPeriod, nextPeriod],
      pots: [
        {
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
        },
      ],
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
      transactions: [
        {
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
        },
      ],
    })

    render(
      <DashboardPage
        snapshot={snapshot}
        selectedPayPeriod={nextPeriod}
        actions={createActions()}
        onViewChange={vi.fn()}
      />,
    )

    const carriedItem = screen.getByRole('checkbox', {
      name: /Set aside £20\.00 into "Barclays" pot for "Barclays" planned card cover/,
    })

    expect(carriedItem).not.toBeChecked()
    expect(screen.getByText('Current shortfall plus planned card charges before next payday')).toBeInTheDocument()

    restoreLocalStorage()
  })

  it('keeps later Barclays card spend separate and unticked after planned cover is completed', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const restoreLocalStorage = mockLocalStorage()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({
      completed: true,
      extraCardSpendPence: 2000,
    })

    window.localStorage.setItem(
      'new-money.dashboard-todos.v1',
      JSON.stringify({ 'period-current': ['linked-credit-card-pot-card-barclays-todo'] }),
    )

    render(
      <DashboardPage
        snapshot={snapshot}
        selectedPayPeriod={selectedPayPeriod}
        actions={actions}
        onViewChange={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('checkbox', {
        name: /Set aside £178\.57 into "Barclays" pot for "Barclays" planned card cover/,
      }),
    ).toBeChecked()

    const extraItem = screen.getByRole('checkbox', {
      name: /Set aside £20\.00 into "Barclays" pot for "Barclays" planned card cover/,
    })

    expect(extraItem).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: /Show breakdown.*Barclays additional planned card cover/ }))

    const extraBreakdown = screen.getByRole('region', { name: /Breakdown.*Barclays additional planned card cover/ })

    expect(within(extraBreakdown).getByText('Coffee')).toBeInTheDocument()
    expect(within(extraBreakdown).getAllByText('£20.00')).toHaveLength(2)
    expect(within(extraBreakdown).queryByText('Fuel')).not.toBeInTheDocument()
    expect(within(extraBreakdown).queryByText('Gym')).not.toBeInTheDocument()

    await user.click(extraItem)

    expect(actions.upsertPaycheckPotAllocation).toHaveBeenCalledWith({
      id: 'dashboard-todo-period-current-linked-credit-card-pot-additional-card-barclays--transaction-txn-barclays-coffee',
      payPeriodId: 'period-current',
      potId: 'pot-barclays',
      amountPence: 2000,
    })

    restoreLocalStorage()
  })

  it('keeps a new same-card spend unticked after an earlier additional cover was completed', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const restoreLocalStorage = mockLocalStorage()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({
      completed: true,
      extraCardSpendPence: 2000,
      additionalCoverCompleted: true,
    })
    const snapshotWithNewSpend = {
      ...snapshot,
      transactions: [
        ...snapshot.transactions,
        {
          id: 'txn-barclays-snack',
          potId: null,
          payPeriodId: 'period-current',
          amountPence: 295,
          type: 'spending' as const,
          paymentMethod: 'credit_card' as const,
          creditCardId: 'card-barclays',
          recurringPaymentId: null,
          date: '2026-05-25',
          note: 'Snack',
          createdAt: '2026-05-25T10:00:00.000Z',
          updatedAt: '2026-05-25T10:00:00.000Z',
        },
      ],
    }
    const freshAllocationId =
      'dashboard-todo-period-current-linked-credit-card-pot-additional-card-barclays--transaction-txn-barclays-snack'

    window.localStorage.setItem(
      'new-money.dashboard-todos.v1',
      JSON.stringify({
        'period-current': [
          'linked-credit-card-pot-card-barclays-todo',
          'linked-credit-card-pot-additional-card-barclays-todo',
        ],
      }),
    )

    render(
      <DashboardPage
        snapshot={snapshotWithNewSpend}
        selectedPayPeriod={selectedPayPeriod}
        actions={actions}
        onViewChange={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('checkbox', {
        name: /Set aside £20\.00 into "Barclays" pot for "Barclays" planned card cover/,
      }),
    ).toBeChecked()

    const freshItem = screen.getByRole('checkbox', {
      name: /Set aside £2\.95 into "Barclays" pot for "Barclays" planned card cover/,
    })

    expect(freshItem).not.toBeChecked()

    await user.click(freshItem)

    expect(actions.upsertPaycheckPotAllocation).toHaveBeenCalledWith({
      id: freshAllocationId,
      payPeriodId: 'period-current',
      potId: 'pot-barclays',
      amountPence: 295,
    })

    await user.click(freshItem)

    expect(actions.deletePaycheckPotAllocation).toHaveBeenCalledWith(freshAllocationId)
    expect(actions.deletePaycheckPotAllocation).not.toHaveBeenCalledWith(
      'dashboard-todo-period-current-linked-credit-card-pot-additional-card-barclays',
    )

    restoreLocalStorage()
  })

  it('does not duplicate separately completed Barclays card spend inside the original dashboard breakdown', async () => {
    const user = userEvent.setup()
    const restoreLocalStorage = mockLocalStorage()
    const { selectedPayPeriod, snapshot } = createBarclaysLinkedCardCoverFixture({
      completed: true,
      extraCardSpendPence: 2000,
      additionalCoverCompleted: true,
      originalAllocationCreatedAt: '2026-05-26T00:00:00.000Z',
    })

    render(
      <DashboardPage
        snapshot={snapshot}
        selectedPayPeriod={selectedPayPeriod}
        actions={createActions()}
        onViewChange={vi.fn()}
      />,
    )

    const originalCheckbox = screen.getByRole('checkbox', {
      name: /Set aside £178\.57 into "Barclays" pot for "Barclays" planned card cover/,
    })
    const originalItem = originalCheckbox.closest('li')

    expect(originalItem).toBeInstanceOf(HTMLElement)

    await user.click(within(originalItem as HTMLElement).getByRole('button', { name: /Show breakdown/ }))

    const originalBreakdown = within(originalItem as HTMLElement).getByRole('region', {
      name: /Breakdown.*Barclays planned card cover/,
    })

    expect(within(originalBreakdown).getByText('Owed from last statement')).toBeInTheDocument()
    expect(within(originalBreakdown).getByText('Fuel')).toBeInTheDocument()
    expect(within(originalBreakdown).getByText('Gym')).toBeInTheDocument()
    expect(within(originalBreakdown).getByText('£83.57')).toBeInTheDocument()
    expect(within(originalBreakdown).queryByText('Manual spend')).not.toBeInTheDocument()
    expect(within(originalBreakdown).queryByText('Coffee')).not.toBeInTheDocument()
    expect(within(originalBreakdown).queryByText('Existing card cover already set aside')).not.toBeInTheDocument()
    expect(within(originalBreakdown).queryByText('Additional forecast cover')).not.toBeInTheDocument()

    const extraCheckbox = screen.getByRole('checkbox', {
      name: /Set aside £20\.00 into "Barclays" pot for "Barclays" planned card cover/,
    })
    const extraItem = extraCheckbox.closest('li')

    expect(extraItem).toBeInstanceOf(HTMLElement)

    await user.click(within(extraItem as HTMLElement).getByRole('button', { name: /Show breakdown/ }))

    const extraBreakdown = within(extraItem as HTMLElement).getByRole('region', {
      name: /Breakdown.*Barclays additional planned card cover/,
    })

    expect(within(extraBreakdown).getByText('Additional card cover')).toBeInTheDocument()
    expect(within(extraBreakdown).getAllByText('£20.00')).toHaveLength(2)

    restoreLocalStorage()
  })

  it('ignores a checklist payment for the selected paycheck maths', async () => {
    const user = userEvent.setup()
    const restoreLocalStorage = mockLocalStorage()
    const snapshot = createSnapshot({
      payPeriods: [createPayPeriod({ id: 'period-current', incomePence: 100000 })],
      pots: [
        {
          id: 'pot-bills',
          name: 'Bills',
          type: 'reserved',
          balancePence: 0,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
      recurringPayments: [
        {
          id: 'council-tax',
          name: 'Council Tax',
          amountPence: 6000,
          dueDay: 20,
          frequency: 'monthly',
          potId: 'pot-bills',
          priority: 'essential',
          active: true,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    const { unmount } = render(
      <DashboardPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} onViewChange={vi.fn()} />,
    )

    const currentPeriod = screen.getByRole('region', { name: 'Overview hero' })
    const todoList = screen.getByRole('region', { name: 'Paycheck to-do list' })

    expect(within(currentPeriod).getAllByText('£60.00').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('£940.00').length).toBeGreaterThan(0)

    await user.click(within(todoList).getByRole('button', { name: 'Ignore Payment for Council Tax' }))

    expect(within(todoList).queryByText('Ignore Payment')).not.toBeInTheDocument()
    expect(within(todoList).getByRole('button', { name: 'Ignore Payment for Council Tax' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(todoList).getByText('Ignored for this paycheck')).toBeInTheDocument()
    expect(within(currentPeriod).getAllByText('£0.00').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('£1,000.00').length).toBeGreaterThan(0)

    unmount()

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} onViewChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Ignore Payment for Council Tax' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('Ignored for this paycheck')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Overview hero' })).getAllByText('£1,000.00').length,
    ).toBeGreaterThan(0)
    restoreLocalStorage()
  })

  it('does not ask for a recurring pot set-aside when the linked pot already covers it', () => {
    const selectedPayPeriod = createPayPeriod({
      startDate: '2026-05-22',
      endDate: '2026-06-04',
      payday: '2026-05-22',
      nextPayday: '2026-06-05',
      incomePence: 100000,
    })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
      pots: [
        {
          id: 'pot-car-insurance',
          name: 'Car Insurance',
          type: 'reserved',
          balancePence: 8711,
          targetPence: null,
          color: '#2563eb',
          archived: false,
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
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
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      ],
    })

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} onViewChange={vi.fn()} />)

    const currentPeriod = screen.getByRole('region', { name: 'Overview hero' })
    const todoList = screen.getByRole('region', { name: 'Paycheck to-do list' })

    expect(within(currentPeriod).getAllByText('£0.00').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('£1,000.00').length).toBeGreaterThan(0)
    expect(
      within(todoList).queryByText('Set aside £87.11 into "Car Insurance" pot for "Car Insurance"'),
    ).not.toBeInTheDocument()
    expect(within(todoList).getByText('No set-asides for this paycheck')).toBeInTheDocument()
  })

  it('shows linked credit card amounts owed as pot set-asides', () => {
    const selectedPayPeriod = createPayPeriod({ incomePence: 100000 })
    const snapshot = createSnapshot({
      payPeriods: [selectedPayPeriod],
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
    })

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={selectedPayPeriod} onViewChange={vi.fn()} />)

    const currentPeriod = screen.getByRole('region', { name: 'Overview hero' })
    const todoList = screen.getByRole('region', { name: 'Paycheck to-do list' })

    expect(within(currentPeriod).getAllByText('£200.00').length).toBeGreaterThan(0)
    expect(within(currentPeriod).getAllByText('£800.00').length).toBeGreaterThan(0)
    expect(
      within(todoList).getByText('Set aside £200.00 into "Card Reserve" pot for "Everyday Amex" planned card cover'),
    ).toBeInTheDocument()
    expect(within(todoList).getByText('Current shortfall plus planned card charges before next payday')).toBeInTheDocument()
  })

  it('expands only one dashboard summary card at a time', async () => {
    const user = userEvent.setup()
    const snapshot = createSnapshot({
      payPeriods: [createPayPeriod({ incomePence: 90000 })],
    })

    render(<DashboardPage snapshot={snapshot} selectedPayPeriod={snapshot.payPeriods[0]} onViewChange={vi.fn()} />)

    const currentPeriod = screen.getByRole('region', { name: 'Overview hero' })
    const totalPay = getMetricDetails(currentPeriod, 'Income')
    const totalCosts = getMetricDetails(currentPeriod, 'Planned costs')
    const moneyLeft = getMetricDetails(currentPeriod, 'Money left this pay period')

    expect(within(currentPeriod).queryByText('Show calculation')).not.toBeInTheDocument()

    await clickMetricSummary(user, totalPay)

    expect(totalPay).toHaveAttribute('open')
    expect(totalCosts).not.toHaveAttribute('open')
    expect(moneyLeft).not.toHaveAttribute('open')

    await clickMetricSummary(user, totalCosts)

    expect(totalPay).not.toHaveAttribute('open')
    expect(totalCosts).toHaveAttribute('open')
    expect(moneyLeft).not.toHaveAttribute('open')

    await clickMetricSummary(user, moneyLeft)

    expect(totalPay).not.toHaveAttribute('open')
    expect(totalCosts).not.toHaveAttribute('open')
    expect(moneyLeft).toHaveAttribute('open')
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

    const currentPeriod = screen.getByRole('region', { name: 'Overview hero' })
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

    expect(screen.queryByText('Paycheck history')).not.toBeInTheDocument()
    expect(screen.getByText('Paychecks')).toBeInTheDocument()
    expect(screen.getByText('Total income')).toBeInTheDocument()
    expect(screen.getByText('Total allocated')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete paycheck plan for 2026-05-16' }))

    expect(confirmSpy).toHaveBeenCalledWith('Delete paycheck plan for 2026-05-16?')
    expect(actions.deletePayPeriod).toHaveBeenCalledWith('period-current')

    confirmSpy.mockRestore()
  })
})

describe('debts page', () => {
  it('shows a calm Debts hero and compact debt rows for active paid overdue and due-soon debts', () => {
    const selectedPayPeriod = createPayPeriod({
      id: 'period-current',
      startDate: '2026-05-16',
      endDate: '2026-05-29',
      payday: '2026-05-16',
      nextPayday: '2026-05-30',
      incomePence: 90000,
    })
    const snapshot = createSnapshot({
      settings: createSettings({ appDateMode: 'manual', manualTodayIso: '2026-05-16' }),
      payPeriods: [selectedPayPeriod],
      debts: [
        {
          id: 'debt-car',
          name: 'Car loan',
          lender: 'Finance Co',
          originalAmountPence: 100000,
          currentBalancePence: 60000,
          minimumPaymentPence: 5000,
          dueDate: '2026-05-20',
          interestRateApr: 12.5,
          note: 'Vehicle finance',
          status: 'active',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'debt-store',
          name: 'Store card',
          lender: 'Retail Bank',
          originalAmountPence: 80000,
          currentBalancePence: 70000,
          minimumPaymentPence: 2500,
          dueDate: '2026-05-10',
          interestRateApr: null,
          note: '',
          status: 'active',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'debt-paid',
          name: 'Paid off loan',
          lender: 'Old Lender',
          originalAmountPence: 30000,
          currentBalancePence: 0,
          minimumPaymentPence: 0,
          dueDate: '2026-04-01',
          interestRateApr: 7.2,
          note: '',
          status: 'paid',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    })

    render(<DebtsPage snapshot={snapshot} actions={createActions()} selectedPayPeriod={selectedPayPeriod} />)

    const hero = screen.getByRole('region', { name: 'Debts hero' })

    expect(within(hero).getByRole('heading', { name: 'Debts' })).toBeInTheDocument()
    expect(within(hero).getAllByText('Total debt').length).toBeGreaterThan(0)
    expect(within(hero).getAllByText('Paid off').length).toBeGreaterThan(0)
    expect(within(hero).getAllByText('Debt due this pay period').length).toBeGreaterThan(0)
    expect(within(hero).getAllByText('Overdue').length).toBeGreaterThan(0)
    expect(within(hero).getAllByText('£1,300.00').length).toBeGreaterThan(0)
    expect(within(hero).getByText('28%')).toBeInTheDocument()
    expect(within(hero).getAllByText('1').length).toBeGreaterThan(0)
    expect(screen.queryByText('Active debt')).not.toBeInTheDocument()
    expect(screen.queryByText('Debt control')).not.toBeInTheDocument()

    const debtList = screen.getByRole('region', { name: 'Debt list' })
    const carLoanRow = within(debtList).getByRole('article', { name: 'Car loan debt row' })
    const storeCardRow = within(debtList).getByRole('article', { name: 'Store card debt row' })
    const paidOffRow = within(debtList).getByRole('article', { name: 'Paid off loan debt row' })

    expect(carLoanRow.className).not.toContain('linear-gradient')
    expect(within(carLoanRow).getByText('Finance Co')).toBeInTheDocument()
    expect(within(carLoanRow).getByText('Balance')).toBeInTheDocument()
    expect(within(carLoanRow).getAllByText('£600.00').length).toBeGreaterThan(0)
    expect(within(carLoanRow).getByText('Minimum')).toBeInTheDocument()
    expect(within(carLoanRow).getByText('£50.00')).toBeInTheDocument()
    expect(within(carLoanRow).getByText('Due date')).toBeInTheDocument()
    expect(within(carLoanRow).getByText('20 May 2026')).toBeInTheDocument()
    expect(within(carLoanRow).getAllByText('40%').length).toBeGreaterThan(0)
    expect(within(carLoanRow).getByText('12.5% APR')).toBeInTheDocument()
    expect(within(carLoanRow).getByRole('button', { name: 'Edit Car loan' })).toHaveClass('size-7')
    expect(within(carLoanRow).getByRole('button', { name: 'Delete Car loan' })).toHaveClass('size-7')

    expect(within(storeCardRow).getByText('Overdue')).toBeInTheDocument()
    expect(within(storeCardRow).queryByText(/APR/)).not.toBeInTheDocument()
    expect(within(paidOffRow).getByText('Paid')).toBeInTheDocument()
    expect(within(paidOffRow).getAllByText('100%').length).toBeGreaterThan(0)
  })

  it('shows a clean empty Debts state', () => {
    render(<DebtsPage snapshot={createSnapshot()} actions={createActions()} />)

    const hero = screen.getByRole('region', { name: 'Debts hero' })
    const debtList = screen.getByRole('region', { name: 'Debt list' })

    expect(within(hero).getByRole('heading', { name: 'Debts' })).toBeInTheDocument()
    expect(within(hero).getAllByText('£0.00').length).toBeGreaterThan(0)
    expect(within(hero).getByText('0%')).toBeInTheDocument()
    expect(within(debtList).getByText('No debts yet.')).toBeInTheDocument()
    expect(within(debtList).getByText('Add a debt to start tracking balances and due dates.')).toBeInTheDocument()
  })

  it('keeps debt and payment forms hidden until their drawer actions open them', async () => {
    const user = userEvent.setup()
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

    render(<DebtsPage snapshot={snapshot} actions={createActions()} />)

    expect(screen.queryByLabelText('Debt name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Payment amount')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add debt' }))
    const addDebtDialog = screen.getByRole('dialog', { name: 'Add debt' })

    expect(within(addDebtDialog).getByLabelText('Debt name')).toBeInTheDocument()

    await user.click(within(addDebtDialog).getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Record payment' }))

    const paymentDialog = screen.getByRole('dialog', { name: 'Record debt payment' })

    expect(within(paymentDialog).getByLabelText('Payment amount')).toBeInTheDocument()
  })

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

    await user.click(screen.getByRole('button', { name: 'Record payment' }))

    const paymentDialog = screen.getByRole('dialog', { name: 'Record debt payment' })
    await user.selectOptions(within(paymentDialog).getByLabelText('Debt'), 'debt-card')
    await user.type(within(paymentDialog).getByLabelText('Payment amount'), '25.00')
    await user.type(within(paymentDialog).getByLabelText('Payment note'), 'Extra payment')
    await user.click(within(paymentDialog).getByRole('button', { name: 'Record payment' }))

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

    await user.click(screen.getByRole('button', { name: 'Add debt' }))

    const debtDialog = screen.getByRole('dialog', { name: 'Add debt' })
    await user.type(within(debtDialog).getByLabelText('Debt name'), 'Car finance')
    await user.type(within(debtDialog).getByLabelText('Lender'), 'Finance Co')
    await user.type(within(debtDialog).getByLabelText('Current balance'), '4000')
    await user.type(within(debtDialog).getByLabelText('Minimum payment'), '120')
    await user.clear(within(debtDialog).getByLabelText('Due date'))
    await user.type(within(debtDialog).getByLabelText('Due date'), '2026-06-01')
    await user.click(within(debtDialog).getByRole('button', { name: 'Add debt' }))

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

    await user.click(screen.getByRole('button', { name: 'Add debt' }))

    const debtDialog = screen.getByRole('dialog', { name: 'Add debt' })
    await user.type(within(debtDialog).getByLabelText('Debt name'), 'Store card')
    await user.type(within(debtDialog).getByLabelText('Lender'), 'Retail Bank')
    await user.type(within(debtDialog).getByLabelText('Current balance'), '300')
    await user.clear(within(debtDialog).getByLabelText('Due date'))
    await user.type(within(debtDialog).getByLabelText('Due date'), '2026-05-23')

    expect(within(debtDialog).getByRole('button', { name: 'Add debt' })).toBeEnabled()
    await user.click(within(debtDialog).getByRole('button', { name: 'Add debt' }))

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

  it('opens edit debt in a drawer and preserves the update payload', async () => {
    const user = userEvent.setup()
    const actions = createActions()
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

    await user.click(screen.getByRole('button', { name: 'Edit Credit card' }))

    const debtDialog = screen.getByRole('dialog', { name: 'Edit debt' })
    await user.clear(within(debtDialog).getByLabelText('Current balance'))
    await user.type(within(debtDialog).getByLabelText('Current balance'), '800')
    await user.clear(within(debtDialog).getByLabelText('Note'))
    await user.type(within(debtDialog).getByLabelText('Note'), 'Updated balance')
    await user.click(within(debtDialog).getByRole('button', { name: 'Save debt' }))

    expect(actions.updateDebt).toHaveBeenCalledWith('debt-card', {
      currentBalancePence: 80000,
      dueDate: '2026-05-20',
      interestRateApr: 19.9,
      lender: 'Bank',
      minimumPaymentPence: 5000,
      name: 'Credit card',
      note: 'Updated balance',
      status: 'active',
    })
  })

  it('shows debt payment history as compact rows with restrained delete actions', () => {
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
      debtPayments: [
        {
          id: 'debt-payment-1',
          debtId: 'debt-card',
          amountPence: 2500,
          date: '2026-05-18',
          note: 'Extra',
          createdAt: '2026-05-18T00:00:00.000Z',
          updatedAt: '2026-05-18T00:00:00.000Z',
        },
      ],
    })

    render(<DebtsPage snapshot={snapshot} actions={createActions()} />)

    const history = screen.getByRole('region', { name: 'Payment history' })
    const deleteButton = within(history).getByRole('button', { name: 'Delete payment for Credit card' })

    expect(within(history).getByText('Credit card')).toBeInTheDocument()
    expect(within(history).getByText('2026-05-18 · Extra')).toBeInTheDocument()
    expect(within(history).getByText('-£25.00')).toBeInTheDocument()
    expect(deleteButton).toHaveClass('size-7')
  })

  it('shows the full balance as due for active debts even when minimum payment is zero', () => {
    render(
      <DebtsPage
        snapshot={createSnapshot({
          settings: createSettings({
            appDateMode: 'manual',
            manualTodayIso: '2026-05-29',
          }),
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

  it('counts linked debt pot balances in each debt card progress bar', () => {
    render(
      <DebtsPage
        snapshot={createSnapshot({
          pots: [
            {
              id: 'pot-airbnb',
              name: 'AIRBNB pot',
              type: 'reserved',
              balancePence: 34678,
              targetPence: null,
              color: '#f59e0b',
              linkedDebtId: 'debt-airbnb',
              archived: false,
              createdAt: '2026-05-16T00:00:00.000Z',
              updatedAt: '2026-05-16T00:00:00.000Z',
            },
          ],
          debts: [
            {
              id: 'debt-airbnb',
              name: 'AIRBNB',
              lender: 'AIRBNB',
              originalAmountPence: 55741,
              currentBalancePence: 55741,
              minimumPaymentPence: 0,
              dueDate: '2026-06-05',
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

    const debtList = screen.getByRole('region', { name: 'Debt list' })

    expect(within(debtList).getAllByText('£346.78').length).toBeGreaterThan(0)
    expect(within(debtList).getByText('£346.78 covered')).toBeInTheDocument()
    expect(within(debtList).getAllByText('62%').length).toBeGreaterThan(0)
    expect(debtList.querySelector('.bg-emerald-500')).toHaveStyle({ width: '62%' })
    expect(within(debtList).queryByText('£0.00 paid')).not.toBeInTheDocument()
  })

  it('does not treat a future paycheck plan as the current pay period', () => {
    const futureDate = (daysFromToday: number) => {
      const date = new Date()
      date.setDate(date.getDate() + daysFromToday)
      return toIsoDate(date)
    }
    const startDate = futureDate(30)

    render(
      <DebtsPage
        snapshot={createSnapshot({
          payPeriods: [
            {
              id: 'period-next',
              startDate,
              endDate: futureDate(43),
              payday: startDate,
              nextPayday: futureDate(44),
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
              dueDate: futureDate(31),
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
    expect(within(debtDueMetric as HTMLElement).getByText(`Next saved period starts ${startDate}; next payday is ${futureDate(44)}.`)).toBeInTheDocument()
    expect(within(debtDueMetric as HTMLElement).queryByText('Future period debt')).not.toBeInTheDocument()
  })
})

function getMetricDetails(container: HTMLElement, label: string): HTMLElement {
  const details = within(container)
    .getAllByText(label)
    .map((element) => element.closest('details'))
    .find((candidate): candidate is HTMLDetailsElement => {
      if (!candidate) {
        return false
      }

      const summary = candidate.querySelector('summary')

      return summary ? within(summary as HTMLElement).queryByText(label) !== null : false
    })

  expect(details).not.toBeNull()

  return details as HTMLElement
}

async function clickMetricSummary(user: ReturnType<typeof userEvent.setup>, details: HTMLElement) {
  const summary = details.querySelector('summary')

  expect(summary).not.toBeNull()

  await user.click(summary as HTMLElement)
}

function RecurringWithHeaderAction({
  snapshot,
  actions,
}: {
  snapshot: PlannerSnapshot
  actions: TestActions
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  return (
    <AppShell
      activeView="recurring"
      onViewChange={vi.fn()}
      headerAction={
        <button type="button" onClick={() => setIsCreateOpen(true)}>
          New payment
        </button>
      }
    >
      <RecurringPage
        snapshot={snapshot}
        actions={actions}
        isCreateOpen={isCreateOpen}
        onCreateOpenChange={setIsCreateOpen}
      />
    </AppShell>
  )
}

function createActions(): TestActions {
  return {
    refresh: vi.fn(async () => {}),
    updateSettings: vi.fn(async () => {}),
    addPot: vi.fn(async () => {}),
    updatePot: vi.fn(async () => {}),
    upsertPaycheckPotAllocation: vi.fn(async () => {}),
    deletePaycheckPotAllocation: vi.fn(async () => {}),
    deletePot: vi.fn(async () => {}),
    addCreditCard: vi.fn(async () => {}),
    updateCreditCard: vi.fn(async () => {}),
    archiveCreditCard: vi.fn(async () => {}),
    addCreditCardPot: vi.fn(async () => {}),
    updateCreditCardPot: vi.fn(async () => {}),
    deleteCreditCardPot: vi.fn(async () => {}),
    applyCreditCardPot: vi.fn(async () => {}),
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
    updatePlannerDataToLatest: vi.fn(async () => {}),
    createPaycheckPlan: vi.fn(async () => {}),
    deletePayPeriod: vi.fn(async () => {}),
    resetPlannerData: vi.fn(async () => {}),
  }
}

function createAuth(overrides: Partial<FirebaseAuthController> = {}): FirebaseAuthController {
  return {
    user: null,
    isConfigured: true,
    isAppleEnabled: true,
    isLoading: false,
    error: null,
    clearError: vi.fn(),
    signInWithGoogle: vi.fn(async () => true),
    signInWithApple: vi.fn(async () => true),
    signInWithEmail: vi.fn(async () => true),
    createEmailAccount: vi.fn(async () => true),
    sendPasswordResetEmail: vi.fn(async () => true),
    deleteAccount: vi.fn(async () => true),
    signOut: vi.fn(async () => true),
    ...overrides,
  }
}

function createAuthUser(
  overrides: Partial<NonNullable<FirebaseAuthController['user']>> = {},
): NonNullable<FirebaseAuthController['user']> {
  return {
    uid: 'user-1',
    email: 'user@example.com',
    providerData: [{ providerId: 'password' }],
    ...overrides,
  } as NonNullable<FirebaseAuthController['user']>
}

function mockLocalStorage(): () => void {
  const storedItems = new Map<string, string>()
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => storedItems.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storedItems.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        storedItems.delete(key)
      }),
      clear: vi.fn(() => {
        storedItems.clear()
      }),
    },
  })

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor)
    }
  }
}

function createSnapshot(overrides: Partial<PlannerSnapshot> = {}): PlannerSnapshot {
  const timestamp = '2026-05-16T00:00:00.000Z'
  const recurringPayments = overrides.recurringPayments as RecurringPayment[] | undefined
  const transactions = overrides.transactions as Transaction[] | undefined

  return {
    settings: createSettings(),
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
    creditCardPots: [],
    customPayments: [],
    creditCardRepayments: [],
    dailyBriefs: [],
    ...overrides,
  }
}

function createSettings(overrides: Partial<PlannerSnapshot['settings']> = {}): PlannerSnapshot['settings'] {
  const timestamp = '2026-05-16T00:00:00.000Z'

  return {
    id: 'default',
    currency: 'GBP',
    payFrequency: 'biweekly',
    defaultPayPeriodDays: 14,
    hourlyRatePence: 1250,
    defaultHoursWorked: 72,
    appDateMode: 'automatic',
    manualTodayIso: null,
    aiInstructions: '',
    aiProvider: 'gemini',
    createdAt: timestamp,
    updatedAt: timestamp,
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

function createBarclaysLinkedCardCoverFixture({
  completed = false,
  extraCardSpendPence = 0,
  additionalCoverCompleted = false,
  originalAllocationCreatedAt = '2026-05-22T00:00:00.000Z',
}: {
  completed?: boolean
  extraCardSpendPence?: number
  additionalCoverCompleted?: boolean
  originalAllocationCreatedAt?: string
} = {}): {
  selectedPayPeriod: PlannerSnapshot['payPeriods'][number]
  snapshot: PlannerSnapshot
} {
  const selectedPayPeriod = createPayPeriod({
    id: 'period-current',
    startDate: '2026-05-22',
    endDate: '2026-06-04',
    payday: '2026-05-22',
    nextPayday: '2026-06-05',
    incomePence: 78850,
  })

  return {
    selectedPayPeriod,
    snapshot: createSnapshot({
      payPeriods: [selectedPayPeriod],
      pots: [
        {
          id: 'pot-barclays',
          name: 'Barclays',
          type: 'reserved',
          balancePence: completed ? 77505 + (additionalCoverCompleted ? 2000 : 0) : 59648,
          targetPence: null,
          color: '#2563eb',
          linkedCreditCardId: 'card-barclays',
          linkedDebtId: null,
          archived: false,
          createdAt: '2026-05-22T00:00:00.000Z',
          updatedAt: '2026-05-22T00:00:00.000Z',
        },
      ],
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
      potAllocations: completed
        ? [
            {
              id: 'dashboard-todo-period-current-linked-credit-card-pot-card-barclays',
              payPeriodId: 'period-current',
              potId: 'pot-barclays',
              amountPence: 17857,
              source: 'manual',
              recurringPaymentId: null,
              createdAt: originalAllocationCreatedAt,
              updatedAt: originalAllocationCreatedAt,
            },
            ...(additionalCoverCompleted
              ? [
                  {
                    id: 'dashboard-todo-period-current-linked-credit-card-pot-additional-card-barclays',
                    payPeriodId: 'period-current',
                    potId: 'pot-barclays',
                    amountPence: 2000,
                    source: 'manual' as const,
                    recurringPaymentId: null,
                    createdAt: '2026-05-24T11:00:00.000Z',
                    updatedAt: '2026-05-24T11:00:00.000Z',
                  },
                ]
              : []),
          ]
        : [],
      transactions: extraCardSpendPence > 0
        ? [
            {
              id: 'txn-barclays-coffee',
              potId: null,
              payPeriodId: 'period-current',
              amountPence: extraCardSpendPence,
              type: 'spending',
              paymentMethod: 'credit_card',
              creditCardId: 'card-barclays',
              recurringPaymentId: null,
              date: '2026-05-24',
              note: 'Coffee',
              createdAt: '2026-05-24T10:00:00.000Z',
              updatedAt: '2026-05-24T10:00:00.000Z',
            },
          ]
        : [],
    }),
  }
}
