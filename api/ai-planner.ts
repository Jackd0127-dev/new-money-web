import { GoogleGenAI, Type } from '@google/genai'
import { getAuth } from 'firebase-admin/auth'

import { defaultSettings } from '../src/data/defaults.js'
import { getDebtReservePlans, type DebtReservePlan } from '../src/domain/debtPlanner.js'
import { findPayPeriodForDate, formatPence, toIsoDate } from '../src/domain/money.js'
import type { PlannerSnapshot } from '../src/storage/repository.js'
import { getBearerToken, getSafeErrorName, initializeFirebaseAdmin } from '../server/firebaseAdmin.js'
import { isRequestBodyTooLarge, setSecureApiHeaders } from '../server/apiSecurity.js'
import { readAiInstruction } from '../server/aiInstructions.js'

const systemInstruction = readAiInstruction('ai-planner-system.md')

const aiPlannerResponseSchema = {
  type: Type.OBJECT,
  properties: {
    answer: {
      type: Type.STRING,
      description: 'A direct answer to the user question using calculated plan facts.',
    },
    risks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Risks from the calculated plan, ordered by urgency.',
    },
    actions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Specific next actions the user can take in the app.',
    },
    confidence: {
      type: Type.STRING,
      enum: ['high', 'medium', 'low'],
    },
  },
  required: ['answer', 'risks', 'actions', 'confidence'],
  propertyOrdering: ['answer', 'risks', 'actions', 'confidence'],
}

interface ApiRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (payload: unknown) => ApiResponse
  end: () => ApiResponse
  setHeader?: (key: string, value: string) => ApiResponse
}

interface AiPlannerRequestBody {
  question?: string
  todayIso?: string
  selectedPayPeriodId?: string | null
  customInstructions?: string
  snapshot?: unknown
}

interface AiPlannerResponse {
  answer: string
  risks: string[]
  actions: string[]
  confidence: 'high' | 'medium' | 'low'
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setSecureApiHeaders(res)

  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (isRequestBodyTooLarge(req.body)) {
    return res.status(413).json({ error: 'Request body is too large.' })
  }

  const idToken = getBearerToken(req.headers.authorization)

  if (!idToken) {
    return res.status(401).json({ error: 'Missing Firebase ID token' })
  }

  const body = parseBody(req.body)
  const todayIso = body.todayIso ?? toIsoDate(new Date())

  try {
    initializeFirebaseAdmin()
    await getAuth().verifyIdToken(idToken, true)
  } catch (error) {
    console.error('AI planner access verification failed', { reason: getSafeErrorName(error) })
    return res.status(401).json({ error: 'Unable to verify planner access.' })
  }

  const snapshot = normalizePlannerSnapshot(body.snapshot)
  const selectedPayPeriod =
    snapshot.payPeriods.find((period) => period.id === body.selectedPayPeriodId) ??
    findPayPeriodForDate(snapshot.payPeriods, todayIso)
  const plans = getDebtReservePlans({
    allDebts: snapshot.debts,
    selectedPayPeriod,
    settings: snapshot.settings,
    payPeriods: snapshot.payPeriods,
    recurringPayments: snapshot.recurringPayments,
    customPayments: snapshot.customPayments,
    transactions: snapshot.transactions,
    creditCardPots: snapshot.creditCardPots,
    creditCardRepayments: snapshot.creditCardRepayments,
    debtReserves: snapshot.debtReserves,
    pots: snapshot.pots,
    potAllocations: snapshot.potAllocations,
  })
  const fallback = createFallbackResponse(plans)
  const provider = snapshot.settings.aiProvider
  const prompt = buildPrompt({
    question: body.question ?? '',
    todayIso,
    customInstructions: [snapshot.settings.aiInstructions, body.customInstructions]
      .filter(Boolean)
      .join('\n'),
    plans,
  })

  if (provider === 'openrouter') {
    const openRouterApiKey = process.env.OPENROUTER_API_KEY

    if (!openRouterApiKey) {
      return res.status(200).json(fallback)
    }

    try {
      return res.status(200).json(
        parseAiPlannerResponse(
          await generateOpenRouterJson({
            apiKey: openRouterApiKey,
            systemInstruction,
            prompt,
          }),
        ),
      )
    } catch {
      return res.status(200).json(fallback)
    }
  }

  const geminiApiKey = process.env.GEMINI_API_KEY

  if (!geminiApiKey) {
    return res.status(200).json(fallback)
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: aiPlannerResponseSchema,
      },
    })
    const parsed = parseAiPlannerResponse(extractGeminiText(response))

    return res.status(200).json(parsed)
  } catch {
    return res.status(200).json(fallback)
  }
}

async function generateOpenRouterJson({
  apiKey,
  systemInstruction,
  prompt,
}: {
  apiKey: string
  systemInstruction: string
  prompt: string
}): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://money.scriptai.space',
      'X-OpenRouter-Title': 'New Money',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b:free',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter request failed with ${response.status}`)
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const content = body.choices?.[0]?.message?.content

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter returned an empty AI planner response.')
  }

  return content.trim()
}

function parseBody(body: unknown): AiPlannerRequestBody {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as AiPlannerRequestBody
    } catch {
      return {}
    }
  }

  if (body && typeof body === 'object') {
    return body as AiPlannerRequestBody
  }

  return {}
}

function buildPrompt({
  question,
  todayIso,
  customInstructions,
  plans,
}: {
  question: string
  todayIso: string
  customInstructions: string
  plans: DebtReservePlan[]
}): string {
  return [
    `Local date:\n${todayIso}`,
    customInstructions ? `User custom instructions:\n${customInstructions}` : '',
    `User question:\n${question || 'Give the user the most useful debt-planning guidance.'}`,
    `Calculated debt plan facts JSON:\n${JSON.stringify(plans.map(toPromptPlan))}`,
  ].filter(Boolean).join('\n\n')
}

function toPromptPlan(plan: DebtReservePlan) {
  return {
    debtId: plan.debt.id,
    debtName: plan.debt.name,
    lender: plan.debt.lender,
    dueDate: plan.debt.dueDate,
    balancePence: plan.debt.currentBalancePence,
    plannedReservePence: plan.plannedReservePence,
    remainingDebtPence: plan.remainingDebtPence,
    recommendedThisPaycheckPence: plan.recommendedAmountPence,
    availableThisPaycheckPence: plan.currentPeriodAvailablePence,
    shortfallPence: plan.shortfallPence,
    canCoverRecommendedAmount: plan.canCoverRecommendedAmount,
    currentPeriodSkipped: plan.currentPeriodSkipped,
    schedule: plan.schedule.map((item) => ({
      payday: item.payday,
      periodStartDate: item.periodStartDate,
      periodEndDate: item.periodEndDate,
      amountPence: item.amountPence,
      availablePence: item.availablePence,
      shortfallPence: item.shortfallPence,
      projected: item.projected,
    })),
  }
}

function extractGeminiText(response: unknown): string {
  const text = (response as { text?: unknown }).text

  if (typeof text === 'string') {
    return text.trim()
  }

  if (typeof text === 'function') {
    return String(text()).trim()
  }

  return ''
}

function parseAiPlannerResponse(value: string): AiPlannerResponse {
  const parsed = JSON.parse(value) as unknown

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini returned a non-object AI planner response.')
  }

  const response = parsed as Partial<AiPlannerResponse>
  const confidence = response.confidence

  if (
    typeof response.answer !== 'string' ||
    !isStringArray(response.risks) ||
    !isStringArray(response.actions) ||
    !isAiPlannerConfidence(confidence)
  ) {
    throw new Error('Gemini returned an invalid AI planner response shape.')
  }

  return {
    answer: response.answer.trim(),
    risks: cleanList(response.risks),
    actions: cleanList(response.actions),
    confidence,
  }
}

function createFallbackResponse(plans: DebtReservePlan[]): AiPlannerResponse {
  const firstPlan = plans.find((plan) => plan.remainingDebtPence > 0)

  if (!firstPlan) {
    return {
      answer: 'No active debt plan is available from the current planner data.',
      risks: [],
      actions: ['Add an active debt and a paycheck plan, then ask again.'],
      confidence: 'low',
    }
  }

  return {
    answer: `${firstPlan.debt.name} has ${formatPence(firstPlan.remainingDebtPence)} left to plan before ${firstPlan.debt.dueDate}.`,
    risks: firstPlan.shortfallPence > 0 ? [`Shortfall: ${formatPence(firstPlan.shortfallPence)} this paycheck.`] : [],
    actions: firstPlan.recommendedAmountPence > 0
      ? [`Reserve ${formatPence(firstPlan.recommendedAmountPence)} for ${firstPlan.debt.name}.`]
      : ['Review the next paycheck in the calculated schedule.'],
    confidence: firstPlan.schedule.length > 0 ? 'medium' : 'low',
  }
}

function normalizePlannerSnapshot(snapshot: unknown): PlannerSnapshot {
  const input = snapshot && typeof snapshot === 'object' ? snapshot as Partial<PlannerSnapshot> : {}

  return {
    settings: {
      ...defaultSettings,
      ...input.settings,
      aiInstructions: input.settings?.aiInstructions ?? defaultSettings.aiInstructions,
      aiProvider: input.settings?.aiProvider ?? defaultSettings.aiProvider,
    },
    pots: input.pots ?? [],
    recurringPayments: input.recurringPayments ?? [],
    payPeriods: input.payPeriods ?? [],
    paychecks: input.paychecks ?? [],
    potAllocations: input.potAllocations ?? [],
    transactions: input.transactions ?? [],
    debts: input.debts ?? [],
    debtPayments: input.debtPayments ?? [],
    debtReserves: input.debtReserves ?? [],
    creditCards: input.creditCards ?? [],
    creditCardPots: input.creditCardPots ?? [],
    customPayments: input.customPayments ?? [],
    creditCardRepayments: input.creditCardRepayments ?? [],
    dailyBriefs: [],
  }
}

function cleanList(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isAiPlannerConfidence(value: unknown): value is AiPlannerResponse['confidence'] {
  return value === 'high' || value === 'medium' || value === 'low'
}
