import { beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './ai-planner'

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

describe('ai planner api', () => {
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
        answer: 'Reserve the recommended amount first, then review the shortfall.',
        risks: ['The selected paycheck is tight.'],
        actions: ['Reserve £666.66 for Card balance.'],
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

  it('sends calculated debt plan facts and custom instructions to Gemini', async () => {
    const response = createResponse()

    await handler(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer firebase-token',
        },
        body: {
          question: 'What should I do next?',
          todayIso: '2026-01-01',
          selectedPayPeriodId: 'period-jan-02',
          customInstructions: 'Use direct wording.',
          snapshot: {
            settings: {
              id: 'default',
              currency: 'GBP',
              payFrequency: 'biweekly',
              defaultPayPeriodDays: 14,
              hourlyRatePence: 1000,
              defaultHoursWorked: 80,
              aiInstructions: 'Prefer short advice.',
              aiProvider: 'gemini',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            payPeriods: [
              {
                id: 'period-jan-02',
                payday: '2026-01-02',
                startDate: '2026-01-02',
                endDate: '2026-01-15',
                nextPayday: '2026-01-16',
                payFrequency: 'biweekly',
                incomePence: 80000,
                status: 'active',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            debts: [
              {
                id: 'debt-card',
                name: 'Card balance',
                lender: 'Card Provider',
                originalAmountPence: 200000,
                currentBalancePence: 200000,
                minimumPaymentPence: 0,
                dueDate: '2026-02-01',
                interestRateApr: null,
                note: '',
                status: 'active',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            debtReserves: [],
            dailyBriefs: [{ content: 'Do not send old generated content.' }],
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

    expect(request.config.systemInstruction).toContain('deterministic debt planner')
    expect(request.config.responseMimeType).toBe('application/json')
    expect(request.contents).toContain('Calculated debt plan facts JSON:')
    expect(request.contents).toContain('Use direct wording.')
    expect(request.contents).toContain('66666')
    expect(request.contents).not.toContain('Do not send old generated content.')
    expect(response.payload).toEqual({
      answer: 'Reserve the recommended amount first, then review the shortfall.',
      risks: ['The selected paycheck is tight.'],
      actions: ['Reserve £666.66 for Card balance.'],
      confidence: 'high',
    })
  })

  it('falls back to deterministic guidance when Gemini returns invalid JSON', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: 'loose text' })
    const response = createResponse()

    await handler(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer firebase-token',
        },
        body: {
          question: 'Can I skip this?',
          selectedPayPeriodId: 'period-jan-02',
          snapshot: {
            payPeriods: [],
            debts: [],
            debtReserves: [],
          },
        },
      },
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(response.payload).toEqual(
      expect.objectContaining({
        answer: expect.stringContaining('No active debt plan'),
        confidence: 'low',
      }),
    )
  })

  it('uses OpenRouter gpt-oss-120b when the planner is set to OpenRouter', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: 'Use the OpenRouter plan.',
                risks: [],
                actions: ['Reserve this paycheck amount.'],
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
          question: 'Use the new model?',
          todayIso: '2026-01-01',
          selectedPayPeriodId: 'period-jan-02',
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
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            payPeriods: [
              {
                id: 'period-jan-02',
                payday: '2026-01-02',
                startDate: '2026-01-02',
                endDate: '2026-01-15',
                nextPayday: '2026-01-16',
                payFrequency: 'biweekly',
                incomePence: 80000,
                status: 'active',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            debts: [],
            debtReserves: [],
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
      response_format: { type: string }
    }
    expect(requestBody.model).toBe('openai/gpt-oss-120b:free')
    expect(requestBody.messages[0]).toMatchObject({
      role: 'system',
    })
    expect(requestBody.messages[0].content).toContain('deterministic debt planner')
    expect(requestBody.messages[1].content).toContain('Calculated debt plan facts JSON:')
    expect(requestBody.response_format.type).toBe('json_object')
    expect(response.payload).toEqual({
      answer: 'Use the OpenRouter plan.',
      risks: [],
      actions: ['Reserve this paycheck amount.'],
      confidence: 'medium',
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
