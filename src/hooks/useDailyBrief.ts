import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getAppTodayIso } from '../domain/money'
import type { DailyBrief } from '../types/models'
import type { DailyBriefInput, PlannerSnapshot } from '../storage/repository'

type DailyBriefUser = {
  getIdToken: () => Promise<string>
} | null

export type DailyBriefStatus = 'signed-out' | 'idle' | 'generating' | 'ready' | 'error'

export interface DailyBriefController {
  currentBrief: DailyBrief | null
  status: DailyBriefStatus
  error: string | null
  regenerate: () => Promise<void>
}

export function useDailyBrief({
  user,
  snapshot,
  addDailyBrief,
  apiPath = '/api/daily-brief',
}: {
  user: DailyBriefUser
  snapshot: PlannerSnapshot | null
  addDailyBrief: (input: DailyBriefInput) => Promise<void>
  apiPath?: string
}): DailyBriefController {
  const today = snapshot ? getAppTodayIso(snapshot.settings) : getAppTodayIso()
  const [generatedBrief, setGeneratedBrief] = useState<DailyBrief | null>(null)
  const [status, setStatus] = useState<DailyBriefStatus>(user ? 'idle' : 'signed-out')
  const [error, setError] = useState<string | null>(null)
  const generatedDateRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)
  const snapshotSignature = useMemo(
    () => (snapshot ? getBriefSnapshotSignature(snapshot) : ''),
    [snapshot],
  )
  const cachedBrief = useMemo(
    () => snapshot?.dailyBriefs.find((brief) => brief.date === today) ?? null,
    [snapshot, today],
  )
  const currentBrief = cachedBrief ?? (generatedBrief?.date === today ? generatedBrief : null)

  const generateBrief = useCallback(
    async (force: boolean) => {
      if (!user || !snapshot || (!force && currentBrief)) {
        return
      }

      if (inFlightRef.current || (!force && generatedDateRef.current === today)) {
        return
      }

      inFlightRef.current = true
      generatedDateRef.current = today
      setStatus('generating')
      setError(null)

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(apiPath, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            todayIso: today,
            snapshot: getBriefSnapshot(snapshot),
            snapshotSignature,
          }),
        })

        if (!response.ok) {
          throw new Error(`Daily brief request failed with ${response.status}`)
        }

        const body = (await response.json()) as { content?: unknown }
        const content = typeof body.content === 'string' ? body.content.trim() : ''

        if (!content) {
          throw new Error('Gemini returned an empty daily brief.')
        }

        await addDailyBrief({
          date: today,
          snapshotSignature,
          content,
        })

        const timestamp = new Date().toISOString()
        setGeneratedBrief({
          id: `brief-${today}`,
          date: today,
          snapshotSignature,
          content,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        setStatus('ready')
      } catch (caughtError) {
        generatedDateRef.current = null
        setError(caughtError instanceof Error ? caughtError.message : 'Unable to generate daily brief.')
        setStatus('error')
      } finally {
        inFlightRef.current = false
      }
    },
    [addDailyBrief, apiPath, currentBrief, snapshot, snapshotSignature, today, user],
  )

  useEffect(() => {
    if (!user) {
      return
    }

    if (!snapshot) {
      return
    }

    if (currentBrief) {
      return
    }

    const timeout = window.setTimeout(() => {
      void generateBrief(false)
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [currentBrief, generateBrief, snapshot, user])

  const regenerate = useCallback(async () => {
    generatedDateRef.current = null
    await generateBrief(true)
  }, [generateBrief])

  const effectiveStatus: DailyBriefStatus = !user ? 'signed-out' : currentBrief ? 'ready' : status

  return {
    currentBrief,
    status: effectiveStatus,
    error,
    regenerate,
  }
}

function getBriefSnapshot(snapshot: PlannerSnapshot): PlannerSnapshot {
  return {
    ...snapshot,
    dailyBriefs: [],
  }
}

function getBriefSnapshotSignature(snapshot: PlannerSnapshot): string {
  return JSON.stringify(getBriefSnapshot(snapshot))
}
