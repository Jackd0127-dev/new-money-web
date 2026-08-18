import { act, renderHook, waitFor } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCloudSync } from '../useCloudSync'
import type { PlannerSnapshot } from '../../storage/repository'

const cloudPlannerMock = vi.hoisted(() => ({
  getCloudPlannerSnapshot: vi.fn(),
  getPlannerSnapshotUpdatedAtIso: vi.fn((snapshot: PlannerSnapshot) => {
    const timestamps = [
      snapshot.settings.updatedAt,
      ...snapshot.pots.map((item) => item.updatedAt),
      ...snapshot.recurringPayments.map((item) => item.updatedAt),
      ...snapshot.payPeriods.map((item) => item.updatedAt),
      ...snapshot.paychecks.map((item) => item.updatedAt),
      ...snapshot.potAllocations.map((item) => item.updatedAt),
      ...snapshot.transactions.map((item) => item.updatedAt),
      ...snapshot.debts.map((item) => item.updatedAt),
      ...snapshot.debtPayments.map((item) => item.updatedAt),
      ...snapshot.debtReserves.map((item) => item.updatedAt),
      ...snapshot.creditCards.map((item) => item.updatedAt),
      ...snapshot.creditCardPots.map((item) => item.updatedAt),
      ...snapshot.customPayments.map((item) => item.updatedAt),
      ...snapshot.creditCardRepayments.map((item) => item.updatedAt),
      ...snapshot.dailyBriefs.map((item) => item.updatedAt),
    ]

    return timestamps.sort().at(-1) ?? snapshot.settings.createdAt
  }),
  getSnapshotSignature: vi.fn((snapshot: PlannerSnapshot) => JSON.stringify(snapshot)),
  hasMeaningfulPlannerData: vi.fn(() => true),
  saveCloudPlannerSnapshot: vi.fn(),
}))
const storageMock = vi.hoisted(() => ({
  replacePlannerSnapshot: vi.fn(),
}))

vi.mock('../../firebase/client', () => ({
  isFirebaseConfigured: true,
}))

vi.mock('../../firebase/cloudPlanner', () => cloudPlannerMock)

vi.mock('../../storage/repository', () => storageMock)

describe('useCloudSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not overwrite a newer local edit when an older cloud check finishes late', async () => {
    let resolveCloudCheck: (record: {
      snapshot: PlannerSnapshot
      updatedAtIso: string | null
    }) => void = () => {}
    cloudPlannerMock.getCloudPlannerSnapshot.mockReturnValue(
      new Promise((resolve) => {
        resolveCloudCheck = resolve
      }),
    )

    const user = { uid: 'user-1' } as User
    const refresh = vi.fn(async () => {})
    const localBeforeEdit = createSnapshot('Bills', '2026-05-24T10:00:00.000Z')
    const localAfterEdit = createSnapshot('Updated Bills', '2026-05-24T10:01:00.000Z')
    const olderCloudSnapshot = createSnapshot('Old Cloud Bills', '2026-05-24T09:59:00.000Z')

    const { rerender } = renderHook(
      ({ snapshot }) => useCloudSync({ user, snapshot, refresh }),
      { initialProps: { snapshot: localBeforeEdit } },
    )

    await waitFor(() => expect(cloudPlannerMock.getCloudPlannerSnapshot).toHaveBeenCalledWith('user-1'))

    rerender({ snapshot: localAfterEdit })

    await act(async () => {
      resolveCloudCheck({
        snapshot: olderCloudSnapshot,
        updatedAtIso: '2026-05-24T10:00:30.000Z',
      })
      await Promise.resolve()
    })

    expect(storageMock.replacePlannerSnapshot).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('can force-save the latest local snapshot before logout', async () => {
    cloudPlannerMock.getCloudPlannerSnapshot.mockResolvedValue(null)
    cloudPlannerMock.saveCloudPlannerSnapshot.mockResolvedValue('2026-05-24T10:02:00.000Z')

    const user = { uid: 'user-1' } as User
    const refresh = vi.fn(async () => {})
    const snapshot = createSnapshot('Latest Bills', '2026-05-24T10:02:00.000Z')

    const { result } = renderHook(() => useCloudSync({ user, snapshot, refresh }))
    const controller = result.current as unknown as {
      saveNow: () => Promise<boolean>
    }

    let saved = false
    await act(async () => {
      saved = await controller.saveNow()
    })

    expect(saved).toBe(true)
    expect(cloudPlannerMock.saveCloudPlannerSnapshot).toHaveBeenCalledWith('user-1', snapshot)
    expect(result.current.status).toBe('synced')
    expect(result.current.message).toBe('Account data is up to date.')
  })
})

function createSnapshot(potName: string, updatedAt: string): PlannerSnapshot {
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
      createdAt: '2026-05-24T09:00:00.000Z',
      updatedAt,
    },
    pots: [
      {
        id: 'pot-bills',
        name: potName,
        type: 'reserved',
        balancePence: 10000,
        targetPence: null,
        color: '#2563eb',
        archived: false,
        createdAt: '2026-05-24T09:00:00.000Z',
        updatedAt,
      },
    ],
    recurringPayments: [],
    payPeriods: [],
    paychecks: [],
    potAllocations: [],
    transactions: [],
    debts: [],
    debtPayments: [],
    debtReserves: [],
    creditCards: [],
    creditCardPots: [],
    customPayments: [],
    creditCardRepayments: [],
    dailyBriefs: [],
  }
}
