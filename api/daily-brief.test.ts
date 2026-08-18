import { beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './daily-brief'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  generateContent: vi.fn(),
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
  }),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return {
      models: {
        generateContent: mocks.generateContent,
      },
    }
  }),
  Type: {
    ARRAY: 'ARRAY',
    OBJECT: 'OBJECT',
    STRING: 'STRING',
  },
}))

describe('daily brief api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key')
    vi.stubEnv(
      'FIREBASE_SERVICE_ACCOUNT_JSON',
      JSON.stringify({
        project_id: 'new-money',
        client_email: 'firebase-admin@example.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----\\n',
      }),
    )
    mocks.verifyIdToken.mockResolvedValue({ uid: 'user-1' })
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({
        summary: 'You have a clear brief.',
        risks: ['Phone is due today.'],
        today: ['Pay or mark the phone bill as paid.'],
        next: ['Keep bill money aside before payday.'],
        missingData: [],
        confidence: 'high',
      }),
    })
  })

  it('rejects requests without a Firebase ID token', async () => {
    const response = createResponse()

    await handler(
      {
        method: 'POST',
        headers: {},
        body: {},
      },
      response,
    )

    expect(response.statusCode).toBe(401)
    expect(mocks.verifyIdToken).not.toHaveBeenCalled()
    expect(mocks.generateContent).not.toHaveBeenCalled()
  })

  it('verifies the user token and returns the formatted Gemini brief', async () => {
    const response = createResponse()

    await handler(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer firebase-token',
        },
        body: {
          todayIso: '2026-05-19',
          snapshotSignature: 'snapshot-signature',
          snapshot: {
            payPeriods: [],
            recurringPayments: [],
            creditCards: [],
          },
        },
      },
      response,
    )

    expect(mocks.verifyIdToken).toHaveBeenCalledWith('firebase-token')
    expect(mocks.initializeApp).toHaveBeenCalled()
    expect(mocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining('gemini'),
      }),
    )
    expect(response.statusCode).toBe(200)
    expect(response.payload).toEqual({
      content: [
        'Summary:',
        'You have a clear brief.',
        '',
        'Risks:',
        '- Phone is due today.',
        '',
        'Today:',
        '- Pay or mark the phone bill as paid.',
        '',
        'Next:',
        '- Keep bill money aside before payday.',
      ].join('\n'),
    })
  })

  it('uses system instructions, editable instructions, brief facts, and JSON output', async () => {
    const response = createResponse()

    await handler(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer firebase-token',
        },
        body: {
          todayIso: '2026-05-19',
          snapshotSignature: 'snapshot-signature',
          snapshot: {
            payPeriods: [],
            dailyBriefs: [
              {
                content: 'Do not resend old generated content.',
              },
            ],
          },
        },
      },
      response,
    )

    const request = mocks.generateContent.mock.calls[0][0] as {
      contents: string
      config: {
        systemInstruction: string
        responseMimeType: string
        responseSchema: unknown
      }
    }

    expect(request.config.systemInstruction).toContain('financial brief writer')
    expect(request.config.responseMimeType).toBe('application/json')
    expect(request.config.responseSchema).toEqual(expect.objectContaining({ type: 'OBJECT' }))
    expect(request.contents).toContain('Editable daily brief instructions:')
    expect(request.contents).toContain('Planner brief facts JSON:')
    expect(request.contents).not.toContain('Planner snapshot JSON:')
    expect(request.contents).not.toContain('Do not resend old generated content.')
  })

  it('returns a calculated fallback brief when Gemini returns invalid JSON', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: 'loose text, not json' })
    const response = createResponse()

    await handler(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer firebase-token',
        },
        body: {
          todayIso: '2026-05-19',
          snapshotSignature: 'snapshot-signature',
          snapshot: {
            payPeriods: [],
            pots: [],
            recurringPayments: [],
            paychecks: [],
            potAllocations: [],
            transactions: [],
            debts: [],
            debtPayments: [],
            creditCards: [],
            customPayments: [],
            creditCardRepayments: [],
          },
        },
      },
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(response.payload).toEqual({
      content: expect.stringContaining('Summary:'),
    })
  })

  it('uses OpenRouter when the planner settings choose OpenRouter', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'OpenRouter brief.',
                risks: [],
                today: ['Check the AI Plan tab.'],
                next: [],
                missingData: [],
                confidence: 'medium',
              }),
            },
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENROUTER_API_KEY', 'openrouter-key')
    const response = createResponse()

    await handler(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer firebase-token',
        },
        body: {
          todayIso: '2026-05-19',
          snapshotSignature: 'snapshot-signature',
          snapshot: {
            settings: {
              id: 'default',
              currency: 'GBP',
              payFrequency: 'biweekly',
              defaultPayPeriodDays: 14,
              hourlyRatePence: 1000,
              defaultHoursWorked: 80,
              aiInstructions: 'Prefer short advice.',
              aiProvider: 'openrouter',
              createdAt: '2026-05-19T00:00:00.000Z',
              updatedAt: '2026-05-19T00:00:00.000Z',
            },
            payPeriods: [],
            dailyBriefs: [{ content: 'Old generated brief.' }],
          },
        },
      },
      response,
    )

    expect(mocks.generateContent).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer openrouter-key',
        }),
      }),
    )
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      model: string
      messages: Array<{ role: string; content: string }>
    }
    expect(requestBody.model).toBe('openai/gpt-oss-120b:free')
    expect(requestBody.messages[0].content).toContain('financial brief writer')
    expect(requestBody.messages[1].content).toContain('Planner brief facts JSON:')
    expect(requestBody.messages[1].content).not.toContain('Old generated brief.')
    expect(response.payload).toEqual({
      content: [
        'Summary:',
        'OpenRouter brief.',
        '',
        'Risks:',
        '- No major risks flagged.',
        '',
        'Today:',
        '- Check the AI Plan tab.',
        '',
        'Next:',
        '- Keep upcoming payments updated before payday.',
      ].join('\n'),
    })
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
