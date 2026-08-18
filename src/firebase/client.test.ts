import { describe, expect, it } from 'vitest'

import { getFirebaseAuthDomain } from './client'

describe('getFirebaseAuthDomain', () => {
  it('uses the app domain as authDomain on the production custom domain', () => {
    expect(
      getFirebaseAuthDomain('new-money-14d2a.firebaseapp.com', {
        hostname: 'money.scriptai.space',
        host: 'money.scriptai.space',
      }),
    ).toBe('money.scriptai.space')
  })

  it('keeps the configured Firebase auth domain outside the production custom domain', () => {
    expect(
      getFirebaseAuthDomain('new-money-14d2a.firebaseapp.com', {
        hostname: 'localhost',
        host: 'localhost:5173',
      }),
    ).toBe('new-money-14d2a.firebaseapp.com')
  })
})
