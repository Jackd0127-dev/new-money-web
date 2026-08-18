import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppAssistant } from '../AppAssistant'
import type { PlannerActions, PlannerSnapshot } from '../../hooks/usePlannerData'
import type { PayPeriod } from '../../types/models'

describe('AppAssistant', () => {
  let restoreLocalStorage: (() => void) | null = null

  beforeEach(() => {
    restoreLocalStorage = mockLocalStorage()
  })

  afterEach(() => {
    restoreLocalStorage?.()
    restoreLocalStorage = null
  })

  it('keeps the floating trigger clear of mobile bottom tabs', () => {
    render(
      <AppAssistant
        snapshot={createSnapshot()}
        activeView="dashboard"
        selectedPayPeriod={createPayPeriod()}
        actions={createActions()}
        user={null}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Open Jimbo helper' })

    expect(trigger).toHaveClass('bottom-[5.75rem]')
    expect(trigger).toHaveClass('lg:bottom-5')
    expect(trigger).not.toHaveClass('sm:bottom-5')
    expect(trigger).toHaveClass('min-h-10')
    expect(trigger).toHaveClass('rounded-full')
    expect(trigger).toHaveClass('bg-white/95')
    expect(trigger).toHaveClass('text-[var(--color-text-primary)]')
    expect(trigger).not.toHaveClass('text-white')
    expect(trigger.className).not.toContain('radial-gradient')
    expect(trigger.className).not.toContain('linear-gradient')
    expect(trigger).toHaveTextContent('Jimbo')
  })

  it('opens as a pinned helper and sends the current tab, selected period, and full snapshot', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        answer: 'You are on Spending and your Food pot has £120.00.\n\nWhat I’d do next: check Lunch in recent spending and keep an eye on the Food pot.',
        highlights: ['Current tab: Spending'],
        actions: ['Check Lunch in recent spending.'],
        confidence: 'high',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppAssistant
        snapshot={createSnapshot()}
        activeView="spending"
        selectedPayPeriod={createPayPeriod()}
        actions={createActions()}
        user={{
          getIdToken: async () => 'firebase-token',
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open Jimbo helper' }))

    const dialog = screen.getByRole('dialog', { name: 'Jimbo helper' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getAllByText('Jimbo').length).toBeGreaterThan(0)
    expect(screen.getByText('I can access all of your payments and give you a detailed plan depending on your needs.')).toBeInTheDocument()
    expect(screen.queryByText('New Money AI')).not.toBeInTheDocument()
    expect(screen.queryByText('Full app context, focused on your current screen.')).not.toBeInTheDocument()
    expect(screen.queryByText('Spending')).not.toBeInTheDocument()
    expect(screen.queryByText('2026-05-16 to 2026-05-29')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Ask Jimbo'), 'What am I looking at?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const fetchCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const requestBody = JSON.parse(fetchCall[1].body as string) as {
      question: string
      activeView: string
      selectedPayPeriodId: string
      snapshot: PlannerSnapshot
    }

    expect(fetchMock).toHaveBeenCalledWith('/api/ai-assistant', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer firebase-token',
      }),
    }))
    expect(requestBody.question).toBe('What am I looking at?')
    expect(requestBody.activeView).toBe('spending')
    expect(requestBody.selectedPayPeriodId).toBe('period-current')
    expect(requestBody.snapshot.pots[0].name).toBe('Food')
    expect(requestBody.snapshot.transactions[0].note).toBe('Lunch')
    expect(screen.getByText(/You are on Spending and your Food pot has £120.00/)).toBeInTheDocument()
    expect(screen.getByText(/What I’d do next: check Lunch in recent spending/)).toBeInTheDocument()
    expect(screen.queryByText('Highlights')).not.toBeInTheDocument()
    expect(screen.queryByText('Current tab: Spending')).not.toBeInTheDocument()
    expect(screen.queryByText('Actions')).not.toBeInTheDocument()
    expect(screen.queryByText('Check Lunch in recent spending.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Confidence:/)).not.toBeInTheDocument()
  })

  it('does not create a local financial answer when the user is not signed in', async () => {
    const user = userEvent.setup()

    render(
      <AppAssistant
        snapshot={createSnapshot()}
        activeView="dashboard"
        selectedPayPeriod={createPayPeriod()}
        actions={createActions()}
        user={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open Jimbo helper' }))
    await user.type(screen.getByLabelText('Ask Jimbo'), 'Can you see my app?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    const dialog = screen.getByRole('dialog', { name: 'Jimbo helper' })

    expect(within(dialog).getByText(/Sign in from Settings to ask Jimbo/)).toBeInTheDocument()
    expect(within(dialog).getByText(/What I’d do next: Sign in from Settings/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/I can still see the local dashboard context/)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/pay is/)).not.toBeInTheDocument()
  })

  it('shows provider errors instead of a local deterministic answer', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({
        error: 'AI provider failed',
        provider: 'gemini',
        reason: 'Assistant returned invalid JSON.',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppAssistant
        snapshot={createSnapshot()}
        activeView="history"
        selectedPayPeriod={null}
        actions={createActions()}
        user={{
          getIdToken: async () => 'firebase-token',
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open Jimbo helper' }))
    await user.type(screen.getByLabelText('Ask Jimbo'), 'Give me every paycheck I received.')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    const dialog = screen.getByRole('dialog', { name: 'Jimbo helper' })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(within(dialog).getByText(/Assistant returned invalid JSON/)).toBeInTheDocument()
    expect(within(dialog).getAllByText(/AI provider failed/).length).toBeGreaterThan(0)
    expect(within(dialog).getByText(/What I’d do next: Check Settings/)).toBeInTheDocument()
    expect(within(dialog).queryByText('Highlights')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Actions')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/Confidence:/)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/I can see History/)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/Create or select a pay period/)).not.toBeInTheDocument()
  })

  it('sends recent chat messages with follow-up questions', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: 'Your Food pot has £120.00 left.',
          highlights: ['Food pot: £120.00'],
          actions: ['Ask what to change next.'],
          confidence: 'high',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: 'Yes, that still means the Food pot.',
          highlights: ['Follow-up understood.'],
          actions: ['Review the Food pot.'],
          confidence: 'high',
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppAssistant
        snapshot={createSnapshot()}
        activeView="dashboard"
        selectedPayPeriod={createPayPeriod()}
        actions={createActions()}
        user={{
          getIdToken: async () => 'firebase-token',
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open Jimbo helper' }))
    await user.type(screen.getByLabelText('Ask Jimbo'), 'How much is in my Food pot?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(screen.getByText(/Your Food pot has £120.00 left/)).toBeInTheDocument())

    await user.type(screen.getByLabelText('Ask Jimbo'), 'What about if I spend another tenner?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const secondFetchCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    const secondRequestBody = JSON.parse(secondFetchCall[1].body as string) as {
      question: string
      conversationHistory: Array<{ role: string; content: string }>
    }

    expect(secondRequestBody.question).toBe('What about if I spend another tenner?')
    expect(secondRequestBody.conversationHistory).toEqual([
      { role: 'user', content: 'How much is in my Food pot?' },
      {
        role: 'assistant',
        content: 'Your Food pot has £120.00 left.\n\nWhat I’d do next: Ask what to change next.',
      },
    ])
  })

  it('confirms an AI-proposed spend before logging it', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        answer: 'I can log that lunch spend.',
        highlights: ['Food pot matched.'],
        actions: ['Confirm the suggested spend.'],
        confidence: 'high',
        proposedActions: [
          {
            id: 'action-log-lunch',
            type: 'log_spend',
            label: 'Log £18.50 lunch spend',
            payload: {
              amountPence: 1850,
              date: '2026-05-20',
              note: 'Lunch',
              paymentMethod: 'pot',
              potId: 'pot-food',
              creditCardId: null,
            },
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppAssistant
        snapshot={createSnapshot()}
        activeView="spending"
        selectedPayPeriod={createPayPeriod()}
        actions={actions}
        user={{
          getIdToken: async () => 'firebase-token',
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open Jimbo helper' }))
    await user.type(screen.getByLabelText('Ask Jimbo'), 'I spent £18.50 on lunch today from Food')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    const dialog = screen.getByRole('dialog', { name: 'Jimbo helper' })

    await waitFor(() => expect(within(dialog).getByText('Suggested action')).toBeInTheDocument())
    expect(within(dialog).getByText('Log £18.50 lunch spend')).toBeInTheDocument()
    expect(within(dialog).getByText('Pot: Food')).toBeInTheDocument()
    expect(actions.addTransaction).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Confirm action' }))

    await waitFor(() =>
      expect(actions.addTransaction).toHaveBeenCalledWith({
        amountPence: 1850,
        date: '2026-05-20',
        note: 'Lunch',
        paymentMethod: 'pot',
        potId: 'pot-food',
        creditCardId: null,
        recurringPaymentId: null,
        type: 'spending',
      }),
    )
    expect(within(dialog).getByText('Done')).toBeInTheDocument()
  })

  it('confirms an AI-proposed pot before creating it', async () => {
    const user = userEvent.setup()
    const actions = createActions()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        answer: 'I can create that pot.',
        highlights: ['Pot details are complete.'],
        actions: ['Confirm the suggested pot.'],
        confidence: 'high',
        proposedActions: [
          {
            id: 'action-create-car-pot',
            type: 'create_pot',
            label: 'Create Car Insurance pot',
            payload: {
              name: 'Car Insurance',
              type: 'reserved',
              balancePence: 8711,
              targetPence: 8711,
              color: '#2563eb',
              linkedCreditCardId: null,
              linkedDebtId: null,
            },
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppAssistant
        snapshot={createSnapshot()}
        activeView="pots"
        selectedPayPeriod={createPayPeriod()}
        actions={actions}
        user={{
          getIdToken: async () => 'firebase-token',
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open Jimbo helper' }))
    await user.type(screen.getByLabelText('Ask Jimbo'), 'Make me a car insurance pot with £87.11')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    const dialog = screen.getByRole('dialog', { name: 'Jimbo helper' })

    await waitFor(() => expect(within(dialog).getByText('Create Car Insurance pot')).toBeInTheDocument())
    expect(actions.addPot).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Confirm action' }))

    await waitFor(() =>
      expect(actions.addPot).toHaveBeenCalledWith({
        name: 'Car Insurance',
        type: 'reserved',
        balancePence: 8711,
        targetPence: 8711,
        color: '#2563eb',
        linkedCreditCardId: null,
        linkedDebtId: null,
      }),
    )
    expect(within(dialog).getByText('Done')).toBeInTheDocument()
  })
})

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

function createActions(): PlannerActions {
  return {
    refresh: vi.fn(async () => {}),
    updateSettings: vi.fn(async () => {}),
    addPot: vi.fn(async () => {}),
    updatePot: vi.fn(async () => {}),
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
    createPaycheckPlan: vi.fn(async () => {}),
    upsertPaycheckPotAllocation: vi.fn(async () => {}),
    deletePaycheckPotAllocation: vi.fn(async () => {}),
    deletePayPeriod: vi.fn(async () => {}),
    resetPlannerData: vi.fn(async () => {}),
    updatePlannerDataToLatest: vi.fn(async () => {}),
  }
}

function createSnapshot(overrides: Partial<PlannerSnapshot> = {}): PlannerSnapshot {
  const timestamp = '2026-05-20T00:00:00.000Z'

  return {
    settings: {
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
    },
    pots: [
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
    recurringPayments: [],
    payPeriods: [createPayPeriod()],
    paychecks: [],
    potAllocations: [],
    transactions: [
      {
        id: 'transaction-lunch',
        potId: 'pot-food',
        payPeriodId: 'period-current',
        amountPence: 1200,
        type: 'spending',
        paymentMethod: 'pot',
        creditCardId: null,
        date: '2026-05-20',
        note: 'Lunch',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
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

function createPayPeriod(overrides: Partial<PayPeriod> = {}): PayPeriod {
  const timestamp = '2026-05-20T00:00:00.000Z'

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
