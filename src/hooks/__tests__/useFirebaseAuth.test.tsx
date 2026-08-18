import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFirebaseAuth } from '../useFirebaseAuth'

const firebaseAuthMock = vi.hoisted(() => ({
  createUserWithEmailAndPassword: vi.fn(),
  getRedirectResult: vi.fn(),
  onAuthStateChanged: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}))

const firebaseClientMock = vi.hoisted(() => ({
  appleAuthProvider: { providerId: 'apple.com' },
  firebaseAuth: { currentUser: null },
  googleAuthProvider: { providerId: 'google.com' },
  isAppleAuthEnabled: true,
  isFirebaseConfigured: true,
}))

vi.mock('firebase/auth', () => firebaseAuthMock)
vi.mock('../../firebase/client', () => firebaseClientMock)

describe('useFirebaseAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firebaseAuthMock.onAuthStateChanged.mockImplementation((_auth, onUser) => {
      onUser(null)
      return vi.fn()
    })
    firebaseAuthMock.getRedirectResult.mockResolvedValue(null)
    firebaseAuthMock.signInWithRedirect.mockResolvedValue(undefined)
  })

  it('uses redirect sign-in for Google and Apple providers through the same-origin auth proxy', async () => {
    const { result } = renderHook(() => useFirebaseAuth())

    await act(async () => {
      await result.current.signInWithGoogle()
      await result.current.signInWithApple()
    })

    expect(firebaseAuthMock.signInWithRedirect).toHaveBeenCalledWith(
      firebaseClientMock.firebaseAuth,
      firebaseClientMock.googleAuthProvider,
    )
    expect(firebaseAuthMock.signInWithRedirect).toHaveBeenCalledWith(
      firebaseClientMock.firebaseAuth,
      firebaseClientMock.appleAuthProvider,
    )
    expect(firebaseAuthMock.signInWithPopup).not.toHaveBeenCalled()
  })

  it('shows provider setup errors instead of a generic auth failure', async () => {
    firebaseAuthMock.signInWithRedirect.mockRejectedValueOnce(
      Object.assign(new Error('Firebase: Error (auth/operation-not-allowed).'), {
        code: 'auth/operation-not-allowed',
      }),
    )

    const { result } = renderHook(() => useFirebaseAuth())

    await act(async () => {
      await result.current.signInWithGoogle()
    })

    expect(result.current.error).toBe('This sign-in provider is not enabled in Firebase Authentication.')
  })

  it('explains provider account conflicts after OAuth verification', async () => {
    firebaseAuthMock.signInWithRedirect.mockRejectedValueOnce(
      Object.assign(new Error('Firebase: Error (auth/account-exists-with-different-credential).'), {
        code: 'auth/account-exists-with-different-credential',
      }),
    )

    const { result } = renderHook(() => useFirebaseAuth())

    await act(async () => {
      await result.current.signInWithGoogle()
    })

    expect(result.current.error).toBe(
      'That email already has a Money Manager account using another sign-in method. Sign in with the original method for that account.',
    )
  })

  it('checks redirect results when the login screen opens', () => {
    renderHook(() => useFirebaseAuth())

    expect(firebaseAuthMock.getRedirectResult).toHaveBeenCalledWith(firebaseClientMock.firebaseAuth)
  })

  it('explains redirect storage failures clearly', async () => {
    firebaseAuthMock.getRedirectResult.mockRejectedValueOnce(
      Object.assign(new Error('Firebase: Error (auth/web-storage-unsupported).'), {
        code: 'auth/web-storage-unsupported',
      }),
    )

    const { result } = renderHook(() => useFirebaseAuth())

    await waitFor(() => {
      expect(result.current.error).toBe('The sign-in redirect could not finish in this browser. Try again, or use email sign-in.')
    })

    expect(firebaseAuthMock.getRedirectResult).toHaveBeenCalledWith(firebaseClientMock.firebaseAuth)
  })
})
