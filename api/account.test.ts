import { beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './account'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  deleteUser: vi.fn(),
  recursiveDelete: vi.fn(),
  doc: vi.fn((path: string) => ({ path })),
  initializeApp: vi.fn(),
  cert: vi.fn((value) => value),
}))

vi.mock('firebase-admin/app', () => ({
  cert: mocks.cert,
  getApps: () => [],
  initializeApp: mocks.initializeApp,
}))

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: mocks.verifyIdToken,
    deleteUser: mocks.deleteUser,
  }),
}))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: mocks.doc,
    recursiveDelete: mocks.recursiveDelete,
  }),
}))

describe('account api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv(
      'FIREBASE_SERVICE_ACCOUNT_JSON',
      JSON.stringify({
        project_id: 'new-money',
        client_email: 'firebase-admin@example.com',
        private_key: 'mock-private-key',
      }),
    )
    mocks.verifyIdToken.mockResolvedValue({
      uid: 'user-1',
      auth_time: Math.floor(Date.now() / 1000),
    })
    mocks.deleteUser.mockResolvedValue(undefined)
    mocks.recursiveDelete.mockResolvedValue(undefined)
  })

  it('rejects account deletion without a Firebase ID token', async () => {
    const response = createResponse()

    await handler(
      {
        method: 'DELETE',
        headers: {},
      },
      response,
    )

    expect(response.statusCode).toBe(401)
    expect(response.headers['Cache-Control']).toBe('no-store')
    expect(mocks.verifyIdToken).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('requires a recent sign-in before deleting an account', async () => {
    mocks.verifyIdToken.mockResolvedValueOnce({
      uid: 'user-1',
      auth_time: Math.floor(Date.now() / 1000) - 301,
    })
    const response = createResponse()

    await handler(
      {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer firebase-token',
        },
      },
      response,
    )

    expect(response.statusCode).toBe(403)
    expect(response.payload).toEqual({
      error: 'For security, sign out and sign back in, then try again.',
    })
    expect(mocks.recursiveDelete).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('deletes the signed-in user document tree before deleting the Auth user', async () => {
    const response = createResponse()

    await handler(
      {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer firebase-token',
        },
      },
      response,
    )

    expect(mocks.verifyIdToken).toHaveBeenCalledWith('firebase-token', true)
    expect(mocks.doc).toHaveBeenCalledWith('users/user-1')
    expect(mocks.recursiveDelete).toHaveBeenCalledWith({ path: 'users/user-1' })
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-1')
    expect(response.statusCode).toBe(200)
    expect(response.payload).toEqual({ ok: true })
  })

  it('does not return Firebase verification internals to the client', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.verifyIdToken.mockRejectedValueOnce(new Error('private service account failure'))
    const response = createResponse()

    await handler(
      {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer firebase-token',
        },
      },
      response,
    )

    expect(response.statusCode).toBe(401)
    expect(response.payload).toEqual({ error: 'Unable to verify account access.' })
    expect(JSON.stringify(response.payload)).not.toContain('private service account failure')

    consoleSpy.mockRestore()
  })

  it('rejects oversized account requests', async () => {
    const response = createResponse()

    await handler(
      {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer firebase-token',
        },
        body: 'x'.repeat(10_001),
      },
      response,
    )

    expect(response.statusCode).toBe(413)
    expect(response.payload).toEqual({ error: 'Request body is too large.' })
    expect(mocks.verifyIdToken).not.toHaveBeenCalled()
  })
})

function createResponse() {
  return {
    statusCode: 200,
    payload: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.payload = payload
      return this
    },
    end() {
      return this
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value
      return this
    },
  }
}
