import { useCallback, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'

import {
  appleAuthProvider,
  firebaseAuth,
  googleAuthProvider,
  isAppleAuthEnabled,
  isFirebaseConfigured,
} from '../firebase/client'

export interface FirebaseAuthController {
  user: User | null
  isConfigured: boolean
  isAppleEnabled: boolean
  isLoading: boolean
  error: string | null
  clearError: () => void
  signInWithGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  createEmailAccount: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export function useFirebaseAuth(): FirebaseAuthController {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(firebaseAuth))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseAuth) {
      return undefined
    }

    return onAuthStateChanged(
      firebaseAuth,
      (nextUser) => {
        setUser(nextUser)
        setIsLoading(false)
      },
      (caughtError) => {
        setError(toAuthMessage(caughtError))
        setIsLoading(false)
      },
    )
  }, [])

  const requireAuth = useCallback(() => {
    if (!firebaseAuth) {
      throw new Error('Firebase is not configured for this build.')
    }

    return firebaseAuth
  }, [])

  const runAuthAction = useCallback(async (action: () => Promise<void>) => {
    setError(null)

    try {
      await action()
    } catch (caughtError) {
      setError(toAuthMessage(caughtError))
    }
  }, [])

  const signInWithGoogle = useCallback(
    () =>
      runAuthAction(async () => {
        await signInWithPopup(requireAuth(), googleAuthProvider)
      }),
    [requireAuth, runAuthAction],
  )

  const signInWithApple = useCallback(
    () =>
      runAuthAction(async () => {
        if (!isAppleAuthEnabled) {
          throw new Error('Apple sign-in is not enabled yet.')
        }

        await signInWithPopup(requireAuth(), appleAuthProvider)
      }),
    [requireAuth, runAuthAction],
  )

  const signInWithEmail = useCallback(
    (email: string, password: string) =>
      runAuthAction(async () => {
        await signInWithEmailAndPassword(requireAuth(), email, password)
      }),
    [requireAuth, runAuthAction],
  )

  const createEmailAccount = useCallback(
    (email: string, password: string) =>
      runAuthAction(async () => {
        await createUserWithEmailAndPassword(requireAuth(), email, password)
      }),
    [requireAuth, runAuthAction],
  )

  const signOut = useCallback(
    () =>
      runAuthAction(async () => {
        await firebaseSignOut(requireAuth())
      }),
    [requireAuth, runAuthAction],
  )

  return {
    user,
    isConfigured: isFirebaseConfigured,
    isAppleEnabled: isAppleAuthEnabled,
    isLoading,
    error,
    clearError: () => setError(null),
    signInWithGoogle,
    signInWithApple,
    signInWithEmail,
    createEmailAccount,
    signOut,
  }
}

function toAuthMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('auth/popup-closed-by-user')) {
      return 'The sign-in popup was closed before it finished.'
    }

    if (error.message.includes('auth/unauthorized-domain')) {
      return 'This website domain is not authorised in Firebase Authentication.'
    }

    if (error.message.includes('auth/invalid-credential')) {
      return 'The email or password was not accepted.'
    }

    if (error.message.includes('auth/email-already-in-use')) {
      return 'That email already has an account. Try signing in instead.'
    }

    return error.message
  }

  return 'Authentication failed.'
}
