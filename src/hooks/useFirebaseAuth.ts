import { useCallback, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithRedirect,
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
  signInWithGoogle: () => Promise<boolean>
  signInWithApple: () => Promise<boolean>
  signInWithEmail: (email: string, password: string) => Promise<boolean>
  createEmailAccount: (email: string, password: string) => Promise<boolean>
  sendPasswordResetEmail: (email: string) => Promise<boolean>
  deleteAccount: () => Promise<boolean>
  signOut: () => Promise<boolean>
}

export function useFirebaseAuth(): FirebaseAuthController {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(firebaseAuth))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseAuth) {
      return undefined
    }

    let isMounted = true
    void getRedirectResult(firebaseAuth).catch((caughtError) => {
      if (!isMounted) {
        return
      }

      setError(toAuthMessage(caughtError))
      setIsLoading(false)
    })

    const unsubscribe = onAuthStateChanged(
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

    return () => {
      isMounted = false
      unsubscribe()
    }
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
      return true
    } catch (caughtError) {
      setError(toAuthMessage(caughtError))
      return false
    }
  }, [])

  const signInWithGoogle = useCallback(
    () =>
      runAuthAction(async () => {
        await signInWithRedirect(requireAuth(), googleAuthProvider)
      }),
    [requireAuth, runAuthAction],
  )

  const signInWithApple = useCallback(
    () =>
      runAuthAction(async () => {
        if (!isAppleAuthEnabled) {
          throw new Error('Apple sign-in is not enabled yet.')
        }

        await signInWithRedirect(requireAuth(), appleAuthProvider)
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

  const sendPasswordResetEmail = useCallback(
    (email: string) =>
      runAuthAction(async () => {
        await firebaseSendPasswordResetEmail(requireAuth(), email)
      }),
    [requireAuth, runAuthAction],
  )

  const deleteAccount = useCallback(
    () =>
      runAuthAction(async () => {
        const auth = requireAuth()
        const currentUser = auth.currentUser

        if (!currentUser) {
          throw new Error('No signed-in account to delete.')
        }

        const idToken = await currentUser.getIdToken(true)
        const response = await fetch('/api/account', {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        })

        if (!response.ok) {
          throw new Error(await getAccountApiErrorMessage(response))
        }

        await firebaseSignOut(auth)
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
    sendPasswordResetEmail,
    deleteAccount,
    signOut,
  }
}

function toAuthMessage(error: unknown): string {
  if (error instanceof Error) {
    const firebaseError = error as Error & { code?: unknown }
    const code = typeof firebaseError.code === 'string' ? firebaseError.code : null
    const message = error.message
    const matchesAuthError = (authCode: string) => code === authCode || message.includes(authCode)

    if (matchesAuthError('auth/popup-closed-by-user')) {
      return 'The sign-in popup was closed before it finished.'
    }

    if (matchesAuthError('auth/popup-blocked')) {
      return 'The sign-in window was blocked by the browser. Try again or allow pop-ups for this site.'
    }

    if (matchesAuthError('auth/account-exists-with-different-credential')) {
      return 'That email already has a Money Manager account using another sign-in method. Sign in with the original method for that account.'
    }

    if (matchesAuthError('auth/credential-already-in-use')) {
      return 'That Google or Apple account is already connected to another Money Manager account.'
    }

    if (matchesAuthError('auth/operation-not-allowed')) {
      return 'This sign-in provider is not enabled in Firebase Authentication.'
    }

    if (matchesAuthError('auth/unauthorized-domain')) {
      return 'This website domain is not authorised in Firebase Authentication.'
    }

    if (matchesAuthError('auth/invalid-credential')) {
      return 'The email or password was not accepted.'
    }

    if (matchesAuthError('auth/email-already-in-use')) {
      return 'That email already has an account. Try signing in instead.'
    }

    if (matchesAuthError('auth/requires-recent-login')) {
      return 'For security, sign out and sign back in, then try again.'
    }

    if (matchesAuthError('auth/user-not-found')) {
      return 'No account was found for that email address.'
    }

    if (matchesAuthError('auth/missing-email')) {
      return 'This account does not have an email address for password reset.'
    }

    if (matchesAuthError('auth/too-many-requests')) {
      return 'Too many attempts. Wait a moment, then try again.'
    }

    if (
      matchesAuthError('auth/web-storage-unsupported') ||
      matchesAuthError('auth/redirect-cancelled-by-user') ||
      message.includes('missing initial state') ||
      message.includes('sessionStorage is inaccessible')
    ) {
      return 'The sign-in redirect could not finish in this browser. Try again, or use email sign-in.'
    }

    if (code) {
      return `Authentication failed (${code}). Please try again.`
    }

    return 'Authentication failed. Please try again.'
  }

  return 'Authentication failed.'
}

async function getAccountApiErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown }

    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // Fall through to the generic account message.
  }

  return 'Unable to update this account. Please try again.'
}
