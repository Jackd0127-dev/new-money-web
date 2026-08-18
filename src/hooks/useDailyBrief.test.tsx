import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toIsoDate } from '../domain/money'
import type { PlannerSnapshot } from '../storage/repository'
import { useDailyBrief } from './useDailyBrief'

function createSnapshot(overrides: Partial<PlannerSnapshot> = {}): PlannerSnapshot {
  return {
    settings: {
      id: 'default',
      currency: 'GBP',
      payFrequency: 'biweekly',
      defaultPayPeriodDays: 14,
      hourlyRatePence: 1350,
      defaultHoursWorked: 80,
      aiInstructions: '',
      aiProvider: 'gemini',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
    pots: [],
    recurringPayments: [],
    payPeriods: [],
    paychecks: [],
    potAllocations: [],
    transactions: [],
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

describe('useDailyBrief', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('generates and stores one daily brief for a signed-in user', async () => {
    const addDailyBrief = vi.fn(async () => {})
    const getIdToken = vi.fn(async () => 'firebase-token')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: 'Pay is fine. Cards need attention.' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() =>
      useDailyBrief({
        user: { getIdToken },
        snapshot: createSnapshot(),
        addDailyBrief,
      }),
    )

    await waitFor(() => expect(addDailyBrief).toHaveBeenCalledTimes(1))

    expect(getIdToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/daily-brief',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer firebase-token',
        }),
      }),
    )
    expect(addDailyBrief).toHaveBeenCalledWith({
      date: toIsoDate(new Date()),
      snapshotSignature: expect.any(String),
      content: 'Pay is fine. Cards need attention.',
    })
  })

  it('uses the cached brief for the same local day', async () => {
    const today = toIsoDate(new Date())
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useDailyBrief({
        user: { getIdToken: vi.fn(async () => 'firebase-token') },
        snapshot: createSnapshot({
          dailyBriefs: [
            {
              id: 'brief-today',
              date: today,
              snapshotSignature: 'existing',
              content: 'Cached brief',
              createdAt: '2026-05-19T08:00:00.000Z',
              updatedAt: '2026-05-19T08:00:00.000Z',
            },
          ],
        }),
        addDailyBrief: vi.fn(async () => {}),
      }),
    )

    await waitFor(() => expect(result.current.currentBrief?.content).toBe('Cached brief'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
