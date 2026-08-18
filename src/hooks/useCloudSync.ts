import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'

import {
  getCloudPlannerSnapshot,
  getPlannerSnapshotUpdatedAtIso,
  getSnapshotSignature,
  hasMeaningfulPlannerData,
  saveCloudPlannerSnapshot,
} from '../firebase/cloudPlanner'
import { isFirebaseConfigured } from '../firebase/client'
import {
  replacePlannerSnapshot,
  type PlannerSnapshot,
} from '../storage/repository'

export type CloudSyncStatus =
  | 'disabled'
  | 'signed-out'
  | 'checking'
  | 'choice-needed'
  | 'syncing'
  | 'synced'
  | 'error'

export interface CloudSyncController {
  status: CloudSyncStatus
  message: string
  cloudUpdatedAtIso: string | null
  isBusy: boolean
  saveNow: () => Promise<boolean>
  retryCloudCheck: () => Promise<void>
}

export function useCloudSync({
  user,
  snapshot,
  refresh,
}: {
  user: User | null
  snapshot: PlannerSnapshot | null
  refresh: () => Promise<void>
}): CloudSyncController {
  const [status, setStatus] = useState<CloudSyncStatus>(
    isFirebaseConfigured ? 'signed-out' : 'disabled',
  )
  const [message, setMessage] = useState(
    isFirebaseConfigured
      ? 'Sign in to sync this browser with the cloud.'
      : 'Firebase is not configured for this build.',
  )
  const [cloudUpdatedAtIso, setCloudUpdatedAtIso] = useState<string | null>(null)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const lastUploadedSignatureRef = useRef<string | null>(null)
  const checkedUserRef = useRef<string | null>(null)
  const syncGenerationRef = useRef(0)

  const checkCloud = useCallback(async () => {
    if (!isFirebaseConfigured) {
      setStatus('disabled')
      setMessage('Firebase is not configured for this build.')
      setAutoSyncEnabled(false)
      return
    }

    if (!user) {
      setStatus('signed-out')
      setMessage('Sign in to sync this browser with the cloud.')
      setCloudUpdatedAtIso(null)
      setAutoSyncEnabled(false)
      lastUploadedSignatureRef.current = snapshot ? getSnapshotSignature(snapshot) : null
      return
    }

    if (!snapshot) {
      return
    }

    const syncGeneration = syncGenerationRef.current
    const isCurrentSync = () => syncGenerationRef.current === syncGeneration

    setStatus('checking')
    setMessage('Checking for cloud data.')
    setAutoSyncEnabled(false)

    try {
      const cloudRecord = await getCloudPlannerSnapshot(user.uid)

      if (!isCurrentSync()) {
        return
      }

      if (!cloudRecord) {
        const updatedAtIso = await saveCloudPlannerSnapshot(user.uid, snapshot)

        if (!isCurrentSync()) {
          return
        }

        lastUploadedSignatureRef.current = getSnapshotSignature(snapshot)
        setCloudUpdatedAtIso(updatedAtIso)
        setStatus('synced')
        setMessage('Automatic cloud sync is ready.')
        setAutoSyncEnabled(true)
        return
      }

      const localSignature = getSnapshotSignature(snapshot)
      const cloudSignature = getSnapshotSignature(cloudRecord.snapshot)
      setCloudUpdatedAtIso(cloudRecord.updatedAtIso)

      if (localSignature === cloudSignature) {
        lastUploadedSignatureRef.current = localSignature
        setStatus('synced')
        setMessage('Account data is up to date.')
        setAutoSyncEnabled(true)
        return
      }

      if (!hasMeaningfulPlannerData(snapshot)) {
        if (!isCurrentSync()) {
          return
        }

        await replacePlannerSnapshot(cloudRecord.snapshot)

        if (!isCurrentSync()) {
          return
        }

        await refresh()
        lastUploadedSignatureRef.current = cloudSignature
        setStatus('synced')
        setMessage('Cloud data was downloaded automatically.')
        setAutoSyncEnabled(true)
        return
      }

      const localUpdatedAtIso = getPlannerSnapshotUpdatedAtIso(snapshot)

      if (cloudRecord.updatedAtIso && cloudRecord.updatedAtIso > localUpdatedAtIso) {
        if (!isCurrentSync()) {
          return
        }

        await replacePlannerSnapshot(cloudRecord.snapshot)

        if (!isCurrentSync()) {
          return
        }

        await refresh()
        lastUploadedSignatureRef.current = cloudSignature
        setStatus('synced')
        setMessage('Newer cloud data was downloaded automatically.')
        setAutoSyncEnabled(true)
        return
      }

      const updatedAtIso = await saveCloudPlannerSnapshot(user.uid, snapshot)

      if (!isCurrentSync()) {
        return
      }

      lastUploadedSignatureRef.current = localSignature
      setCloudUpdatedAtIso(updatedAtIso)
      setStatus('synced')
      setMessage('Newer local changes were uploaded automatically.')
      setAutoSyncEnabled(true)
    } catch (caughtError) {
      setStatus('error')
      setMessage(toSyncMessage(caughtError))
    }
  }, [refresh, snapshot, user])

  useEffect(() => {
    syncGenerationRef.current += 1
  }, [snapshot, user])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!isFirebaseConfigured) {
        void checkCloud()
        return
      }

      if (!user) {
        checkedUserRef.current = null
        void checkCloud()
        return
      }

      if (!snapshot || checkedUserRef.current === user.uid) {
        return
      }

      checkedUserRef.current = user.uid
      void checkCloud()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [checkCloud, snapshot, user])

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !snapshot) {
      return undefined
    }

    const interval = window.setInterval(() => {
      void checkCloud()
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [checkCloud, snapshot, user])

  useEffect(() => {
    if (!autoSyncEnabled || !user || !snapshot) {
      return undefined
    }

    const signature = getSnapshotSignature(snapshot)

    if (signature === lastUploadedSignatureRef.current) {
      return undefined
    }

    const syncGeneration = syncGenerationRef.current
    const isCurrentSync = () => syncGenerationRef.current === syncGeneration

    const timeout = window.setTimeout(() => {
      setStatus('syncing')
      setMessage('Uploading the latest local changes.')

      saveCloudPlannerSnapshot(user.uid, snapshot)
        .then((updatedAtIso) => {
          if (!isCurrentSync()) {
            return
          }

          lastUploadedSignatureRef.current = signature
          setCloudUpdatedAtIso(updatedAtIso)
          setStatus('synced')
          setMessage('Account data is up to date.')
        })
        .catch((caughtError) => {
          if (!isCurrentSync()) {
            return
          }

          setStatus('error')
          setMessage(toSyncMessage(caughtError))
        })
    }, 800)

    return () => window.clearTimeout(timeout)
  }, [autoSyncEnabled, snapshot, user])

  const saveNow = useCallback(async () => {
    if (!isFirebaseConfigured || !user || !snapshot) {
      return false
    }

    const signature = getSnapshotSignature(snapshot)

    syncGenerationRef.current += 1
    checkedUserRef.current = user.uid
    setStatus('syncing')
    setMessage('Saving account data before logout.')

    try {
      const updatedAtIso = await saveCloudPlannerSnapshot(user.uid, snapshot)

      lastUploadedSignatureRef.current = signature
      setCloudUpdatedAtIso(updatedAtIso)
      setStatus('synced')
      setMessage('Account data is up to date.')
      setAutoSyncEnabled(true)
      return true
    } catch (caughtError) {
      setStatus('error')
      setMessage(toSyncMessage(caughtError))
      return false
    }
  }, [snapshot, user])

  return {
    status,
    message,
    cloudUpdatedAtIso,
    isBusy: status === 'checking' || status === 'syncing',
    saveNow,
    retryCloudCheck: checkCloud,
  }
}

function toSyncMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    if (message.includes('permission') || message.includes('auth')) {
      return 'Account data sync failed. Check your sign-in and account permissions.'
    }

    if (message.includes('network') || message.includes('offline')) {
      return 'Account data sync failed. Check your connection and try again.'
    }
  }

  return 'Account data sync failed.'
}
