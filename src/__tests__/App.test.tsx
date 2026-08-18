import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from '../App'

const mockAuthState = vi.hoisted(() => ({
  value: {
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
  },
}))

vi.mock('../hooks/useFirebaseAuth', () => ({
  useFirebaseAuth: () => mockAuthState.value,
}))

vi.mock('../hooks/usePlannerData', () => ({
  usePlannerData: () => ({
    snapshot: null,
    isLoading: false,
    error: null,
    actions: {
      refresh: vi.fn(async () => {}),
    },
  }),
}))

vi.mock('../hooks/useCloudSync', () => ({
  useCloudSync: vi.fn(),
}))

describe('app authentication gate', () => {
  it('shows the login screen instead of the planner shell when no user is signed in', () => {
    mockAuthState.value.user = null
    mockAuthState.value.isConfigured = true
    mockAuthState.value.isLoading = false

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Sign in to open your planner.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log spend' })).not.toBeInTheDocument()
  })
})
