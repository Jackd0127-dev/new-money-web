import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppAssistant } from './AppAssistant'
import type { PlannerSnapshot } from '../hooks/usePlannerData'
import type { PayPeriod } from '../types/models'

describe('AppAssistant', () => {
  it('opens as a pinned helper and sends the current tab, selected period, and full snapshot', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        answer: 'You are on Spending and your Food pot has £120.00.',
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
        user={{
          getIdToken: async () => 'firebase-token',
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open AI helper' }))

    expect(screen.getByRole('dialog', { name: 'New Money AI helper' })).toBeInTheDocument()
    expect(screen.getByText('Spending')).toBeInTheDocument()
    expect(screen.getByText('2026-05-16 to 2026-05-29')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Ask New Money AI'), 'What am I looking at?')
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
    expect(screen.getByText('You are on Spending and your Food pot has £120.00.')).toBeInTheDocument()
    expect(screen.getByText('Check Lunch in recent spending.')).toBeInTheDocument()
  })

  it('does not create a local financial answer when the user is not signed in', async () => {
    const user = userEvent.setup()

    render(
      <AppAssistant
        snapshot={createSnapshot()}
        activeView="dashboard"
        selectedPayPeriod={createPayPeriod()}
        user={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open AI helper' }))
    await user.type(screen.getByLabelText('Ask New Money AI'), 'Can you see my app?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    const dialog = screen.getByRole('dialog', { name: 'New Money AI helper' })

    expect(within(dialog).getByText(/Sign in from Settings to ask New Money AI/)).toBeInTheDocument()
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
        user={{
          getIdToken: async () => 'firebase-token',
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open AI helper' }))
    await user.type(screen.getByLabelText('Ask New Money AI'), 'Give me every paycheck I received.')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    const dialog = screen.getByRole('dialog', { name: 'New Money AI helper' })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(within(dialog).getByText(/Assistant returned invalid JSON/)).toBeInTheDocument()
    expect(within(dialog).getAllByText(/AI provider failed/).length).toBeGreaterThan(0)
    expect(within(dialog).queryByText(/I can see History/)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/Create or select a pay period/)).not.toBeInTheDocument()
  })
})

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
