import { GoogleGenAI, Type } from '@google/genai'
import { getAuth } from 'firebase-admin/auth'

import { defaultSettings } from '../src/data/defaults.js'
import {
  normalizeAssistantActionProposals,
  type AssistantActionProposal,
} from '../src/domain/assistantActions.js'
import { buildAssistantAppContext } from '../src/domain/assistantContext.js'
import {
  calculatePaycheckAmount,
  createNextPayPeriod,
  getPayPeriodCostSummary,
  toIsoDate,
} from '../src/domain/money.js'
import type { PlannerSnapshot } from '../src/storage/repository.js'
import type { AiProvider, PayPeriod, PotAllocation, PotType } from '../src/types/models.js'
import { getBearerToken, getSafeErrorName, initializeFirebaseAdmin } from '../server/firebaseAdmin.js'
import { isRequestBodyTooLarge, setSecureApiHeaders } from '../server/apiSecurity.js'
import { readAiInstruction } from '../server/aiInstructions.js'

const systemInstruction = readAiInstruction('app-assistant-system.md')
const promptInstructions = readAiInstruction('app-assistant-prompt.md')

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    answer: {
      type: Type.STRING,
      description: 'A direct answer to the user question using the full app context.',
    },
    highlights: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Important facts from the app data.',
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
    proposedActions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING },
          label: { type: Type.STRING },
          payload: { type: Type.OBJECT },
        },
      },
      description: 'Optional app actions for the user to review and confirm before saving.',
    },
  },
  required: ['answer', 'highlights', 'actions', 'confidence'],
  propertyOrdering: ['answer', 'highlights', 'actions', 'confidence', 'proposedActions'],
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

interface AssistantRequestBody {
  question?: string
  todayIso?: string
  activeView?: string
  selectedPayPeriodId?: string | null
  conversationHistory?: unknown
  snapshot?: unknown
}

interface AssistantResponse {
  answer: string
  highlights: string[]
  actions: string[]
  confidence: 'high' | 'medium' | 'low'
  proposedActions?: AssistantActionProposal[]
}

interface AssistantConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AssistantActionFallbackContext {
  question: string
  conversationHistory: AssistantConversationMessage[]
}

interface CompactPromptAppContext {
  settings: Record<string, unknown>
  overview: unknown
  selectedPayPeriod: unknown
  payHistory: unknown
  pots: unknown
  recurringPayments: unknown
  payPeriods: unknown
  potAllocations: unknown
  transactions: unknown
  debts: unknown
  debtPayments: unknown
  debtReserves: unknown
  creditCards: unknown
  creditCardPots: unknown
  customPayments: unknown
  creditCardRepayments: unknown
  dailyBriefs: unknown
  futurePlanning: unknown
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
    console.error('AI assistant access verification failed', { reason: getSafeErrorName(error) })
    return res.status(401).json({ error: 'Unable to verify assistant access.' })
  }

  const question = body.question ?? ''
  const conversationHistory = normalizeConversationHistory(body.conversationHistory)
  const snapshot = normalizePlannerSnapshot(body.snapshot)
  const context = buildAssistantAppContext({
    snapshot,
    activeView: body.activeView,
    selectedPayPeriodId: body.selectedPayPeriodId ?? null,
    todayIso,
  })
  const prompt = buildPrompt({
    question,
    customInstructions: snapshot.settings.aiInstructions,
    conversationHistory,
    context,
  })
  const provider = snapshot.settings.aiProvider

  if (provider === 'openrouter') {
    const openRouterApiKey = process.env.OPENROUTER_API_KEY

    if (!openRouterApiKey) {
      return res.status(503).json(createAiProviderError('openrouter', 'OpenRouter API key is not configured.'))
    }

    try {
      return res.status(200).json(
        parseAssistantResponse(
          await generateOpenRouterJson({
            apiKey: openRouterApiKey,
            systemInstruction,
            prompt,
          }),
          { question, conversationHistory },
        ),
      )
    } catch (error) {
      logAiProviderError(provider, error)
      return res.status(502).json(createAiProviderError(provider, 'The AI provider could not complete the request.'))
    }
  }

  const geminiApiKey = process.env.GEMINI_API_KEY

  if (!geminiApiKey) {
    return res.status(503).json(createAiProviderError('gemini', 'Gemini API key is not configured.'))
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema,
      },
    })

    return res.status(200).json(parseAssistantResponse(extractGeminiText(response), { question, conversationHistory }))
  } catch (error) {
    logAiProviderError(provider, error)
    return res.status(502).json(createAiProviderError(provider, 'The AI provider could not complete the request.'))
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
    throw new Error('OpenRouter returned an empty assistant response.')
  }

  return content.trim()
}

function buildPrompt({
  question,
  customInstructions,
  conversationHistory,
  context,
}: {
  question: string
  customInstructions: string
  conversationHistory: AssistantConversationMessage[]
  context: ReturnType<typeof buildAssistantAppContext>
}): string {
  const promptContext = buildCompactPromptContext(context, question)

  return [
    promptInstructions,
    customInstructions ? `User custom instructions:\n${truncateText(customInstructions, 2000)}` : '',
    conversationHistory.length > 0 ? `Recent conversation JSON:\n${JSON.stringify(conversationHistory)}` : '',
    `User question:\n${question || 'Give the most useful answer for the current app screen.'}`,
    `Current screen context JSON:\n${JSON.stringify(promptContext.screen)}`,
    `Computed app summaries JSON:\n${JSON.stringify(promptContext.computedSummaries)}`,
    `Compact app context JSON:\n${JSON.stringify(promptContext.compactAppContext)}`,
    `Focused app facts JSON:\n${JSON.stringify(promptContext.focusedFacts)}`,
  ].filter(Boolean).join('\n\n')
}

function buildCompactPromptContext(context: ReturnType<typeof buildAssistantAppContext>, question: string) {
  const snapshot = context.snapshot
  const lookups = buildLookups(snapshot)
  const compactAppContext: CompactPromptAppContext = {
    settings: {
      currency: snapshot.settings.currency,
      payFrequency: snapshot.settings.payFrequency,
      defaultPayPeriodDays: snapshot.settings.defaultPayPeriodDays,
      hourlyRatePence: snapshot.settings.hourlyRatePence,
      defaultHoursWorked: snapshot.settings.defaultHoursWorked,
      aiProvider: snapshot.settings.aiProvider,
      hasCustomAiInstructions: Boolean(snapshot.settings.aiInstructions.trim()),
    },
    overview: context.overview,
    selectedPayPeriod: compactPayPeriod(context.screen.selectedPayPeriod),
    payHistory: limitList(buildPayHistory(snapshot), 500, (item) => item),
    pots: limitList(snapshot.pots, 200, compactPot),
    recurringPayments: limitList(snapshot.recurringPayments, 250, (payment) => compactRecurringPayment(payment, lookups)),
    payPeriods: limitList(sortByDate(snapshot.payPeriods, 'payday'), 500, compactPayPeriod),
    potAllocations: limitList(snapshot.potAllocations, 500, (allocation) => compactPotAllocation(allocation, lookups)),
    transactions: limitList(sortByDate(snapshot.transactions, 'date', 'desc'), 350, (transaction) =>
      compactTransaction(transaction, lookups),
    ),
    debts: limitList(sortByDate(snapshot.debts, 'dueDate'), 200, compactDebt),
    debtPayments: limitList(sortByDate(snapshot.debtPayments, 'date', 'desc'), 350, (payment) =>
      compactDebtPayment(payment, lookups),
    ),
    debtReserves: limitList(sortByDate(snapshot.debtReserves, 'payday'), 350, (reserve) =>
      compactDebtReserve(reserve, lookups),
    ),
    creditCards: limitList(snapshot.creditCards, 100, compactCreditCard),
    creditCardPots: limitList(sortByDate(snapshot.creditCardPots, 'createdAt', 'desc'), 250, (creditCardPot) =>
      compactCreditCardPot(creditCardPot, lookups),
    ),
    customPayments: limitList(sortByDate(snapshot.customPayments, 'dueDate'), 250, (payment) =>
      compactCustomPayment(payment, lookups),
    ),
    creditCardRepayments: limitList(sortByDate(snapshot.creditCardRepayments, 'date', 'desc'), 250, (repayment) =>
      compactCreditCardRepayment(repayment, lookups),
    ),
    dailyBriefs: limitList(sortByDate(snapshot.dailyBriefs, 'date', 'desc'), 40, compactDailyBrief),
    futurePlanning: buildFuturePlanningFacts(context, lookups),
  }

  return {
    screen: {
      ...context.screen,
      selectedPayPeriod: compactPayPeriod(context.screen.selectedPayPeriod),
    },
    computedSummaries: compactComputedSummaries(context, lookups),
    compactAppContext,
    focusedFacts: buildFocusedFacts(context, question, compactAppContext, lookups),
  }
}

function compactComputedSummaries(context: ReturnType<typeof buildAssistantAppContext>, lookups: ReturnType<typeof buildLookups>) {
  return {
    overview: context.overview,
    summaries: {
      dashboard: {
        ...context.summaries.dashboard,
        items: limitList(context.summaries.dashboard.items, 120, (item) => ({
          ...item,
          label: truncateText(item.label, 140),
          potName: getLookupName(lookups.pots, item.potId),
          creditCardName: getLookupName(lookups.creditCards, item.creditCardId),
        })),
      },
      debts: context.summaries.debts,
      creditCards: {
        ...context.summaries.creditCards,
        cards: limitList(context.summaries.creditCards.cards, 80, (card) => ({
          ...card,
          card: compactCreditCard(card.card),
          items: limitList(card.items, 80, (item) => ({
            ...item,
            label: truncateText(item.label, 140),
            potName: getLookupName(lookups.pots, item.potId),
          })),
        })),
        unlinkedItems: limitList(context.summaries.creditCards.unlinkedItems, 80, (item) => ({
          ...item,
          label: truncateText(item.label, 140),
          potName: getLookupName(lookups.pots, item.potId),
        })),
      },
      debtPlans: limitList(context.summaries.debtPlans, 80, (plan) => ({
        ...plan,
        debt: compactDebt(plan.debt),
        schedule: limitList(plan.schedule, 80, (item) => item),
      })),
    },
    futurePlanning: buildFuturePlanningFacts(context, lookups),
  }
}

function buildFuturePlanningFacts(
  context: ReturnType<typeof buildAssistantAppContext>,
  lookups: ReturnType<typeof buildLookups>,
) {
  const snapshot = context.snapshot
  const settingsPaycheckEstimatePence = calculatePaycheckAmount({
    hoursWorked: snapshot.settings.defaultHoursWorked,
    hourlyRatePence: snapshot.settings.hourlyRatePence,
  })
  const automaticPotTopUps = snapshot.pots
    .filter((pot) => !pot.archived && (pot.targetPence ?? 0) > 0)
    .map((pot) => ({
      potId: pot.id,
      potName: pot.name,
      amountPence: pot.targetPence ?? 0,
      type: pot.type,
    }))
  const seedPeriod = getProjectionSeedPeriod(snapshot, context.screen.selectedPayPeriod, context.screen.todayIso)
  const projectedPeriods = buildProjectedPeriods({
    snapshot,
    seedPeriod,
    todayIso: context.screen.todayIso,
    settingsPaycheckEstimatePence,
    count: 8,
  }).map((period) => {
    const potAllocations = [
      ...snapshot.potAllocations,
      ...buildAssistantProjectedPotAllocations(snapshot, period.id),
    ]
    const summary = getPayPeriodCostSummary({
      payPeriod: period,
      recurringPayments: snapshot.recurringPayments,
      customPayments: snapshot.customPayments,
      transactions: snapshot.transactions,
      debts: snapshot.debts,
      creditCardRepayments: snapshot.creditCardRepayments,
      creditCardPots: snapshot.creditCardPots,
      debtReserves: snapshot.debtReserves,
      pots: snapshot.pots,
      potAllocations,
    })

    return {
      payPeriodId: period.id,
      payday: period.payday,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      incomePence: period.incomePence,
      projected: !snapshot.payPeriods.some((savedPeriod) => savedPeriod.id === period.id),
      incomeSource: snapshot.payPeriods.some((savedPeriod) => savedPeriod.id === period.id)
        ? 'savedPayPeriod'
        : seedPeriod
          ? 'projectedFromSavedPayPeriod'
          : 'settingsEstimate',
      totalCostsPence: summary.totalCostsPence,
      moneyLeftPence: summary.moneyLeftPence,
      recurringPence: summary.directRecurringPence,
      savedPaymentsPence: summary.savedPaymentsPence,
      manualSpendingPence: summary.manualSpendingPence,
      potTopUpsPence: summary.potAllocationsPence,
      debtReservesPence: summary.debtReservesPence,
      debtDuePence: summary.debtMinimumsPence,
      creditCardPotsPence: summary.creditCardPotsPence,
      creditCardNetPence: summary.creditCardNetPence,
      costItems: limitList(summary.items, 80, (item) => ({
        ...item,
        label: truncateText(item.label, 140),
        potName: getLookupName(lookups.pots, item.potId),
        creditCardName: getLookupName(lookups.creditCards, item.creditCardId),
      })),
    }
  })
  const projectedMoneyLeftTotalPence = projectedPeriods.reduce((total, period) => total + period.moneyLeftPence, 0)

  return {
    settingsPaycheckEstimatePence,
    settingsPaycheckCalculation: {
      defaultHoursWorked: snapshot.settings.defaultHoursWorked,
      hourlyRatePence: snapshot.settings.hourlyRatePence,
    },
    payFrequency: snapshot.settings.payFrequency,
    hasSavedPayPeriods: snapshot.payPeriods.length > 0,
    seedPeriod: compactPayPeriod(seedPeriod),
    assumptions: seedPeriod
      ? [
          'Uses the selected/current/next saved pay period first.',
          'Projects missing future pay periods from the saved frequency and income.',
          'Uses current stored payments and debts as they exist now.',
        ]
      : [
          'No saved payday is available, so the first projected payday uses today as a placeholder date.',
          'Income uses Settings default hours and hourly rate.',
          'Exact dates will improve after one payday is saved.',
        ],
    automaticPotTopUps,
    automaticPotTopUpsPerPaycheckPence: automaticPotTopUps.reduce((total, item) => total + item.amountPence, 0),
    projectedPeriods,
    projectedMoneyLeftTotalPence,
    averageProjectedMoneyLeftPence:
      projectedPeriods.length > 0 ? Math.round(projectedMoneyLeftTotalPence / projectedPeriods.length) : 0,
  }
}

function getProjectionSeedPeriod(
  snapshot: PlannerSnapshot,
  selectedPayPeriod: PayPeriod | null,
  todayIso: string,
): PayPeriod | null {
  if (selectedPayPeriod) {
    return selectedPayPeriod
  }

  const sortedPeriods = sortByDate(snapshot.payPeriods, 'payday')
  const upcomingPeriod = sortedPeriods.find((period) => period.endDate >= todayIso)

  return upcomingPeriod ?? sortedPeriods[sortedPeriods.length - 1] ?? null
}

function buildProjectedPeriods({
  snapshot,
  seedPeriod,
  todayIso,
  settingsPaycheckEstimatePence,
  count,
}: {
  snapshot: PlannerSnapshot
  seedPeriod: PayPeriod | null
  todayIso: string
  settingsPaycheckEstimatePence: number
  count: number
}): PayPeriod[] {
  const savedByPayday = new Map(snapshot.payPeriods.map((period) => [period.payday, period]))
  const frequency = seedPeriod?.payFrequency ?? snapshot.settings.payFrequency
  let payday = seedPeriod?.payday ?? todayIso
  const periods: PayPeriod[] = []

  for (let index = 0; index < count; index += 1) {
    const savedPeriod = savedByPayday.get(payday)

    if (savedPeriod) {
      periods.push(savedPeriod)
      payday = savedPeriod.nextPayday
      continue
    }

    const periodDates = createNextPayPeriod(payday, frequency)

    periods.push({
      id: `projected-${payday}`,
      payday,
      startDate: periodDates.startDate,
      endDate: periodDates.endDate,
      nextPayday: periodDates.nextPayday,
      payFrequency: frequency,
      incomePence: seedPeriod?.incomePence ?? settingsPaycheckEstimatePence,
      status: 'planned',
      createdAt: `${payday}T00:00:00.000Z`,
      updatedAt: `${payday}T00:00:00.000Z`,
    })
    payday = periodDates.nextPayday
  }

  return periods
}

function buildAssistantProjectedPotAllocations(snapshot: PlannerSnapshot, payPeriodId: string): PotAllocation[] {
  const existingAutoPotIds = new Set(
    snapshot.potAllocations
      .filter((allocation) => allocation.payPeriodId === payPeriodId && allocation.source === 'pot_auto')
      .map((allocation) => allocation.potId),
  )

  return snapshot.pots
    .filter((pot) => !pot.archived && (pot.targetPence ?? 0) > 0 && !existingAutoPotIds.has(pot.id))
    .map((pot) => ({
      id: `assistant-projected-pot-${payPeriodId}-${pot.id}`,
      payPeriodId,
      potId: pot.id,
      amountPence: pot.targetPence ?? 0,
      source: 'pot_auto' as const,
      recurringPaymentId: null,
      createdAt: `${payPeriodId}T00:00:00.000Z`,
      updatedAt: `${payPeriodId}T00:00:00.000Z`,
    }))
}

function buildFocusedFacts(
  context: ReturnType<typeof buildAssistantAppContext>,
  question: string,
  compactAppContext: CompactPromptAppContext,
  lookups: ReturnType<typeof buildLookups>,
) {
  const query = question.toLowerCase()
  const activeView = context.screen.activeView
  const selectedPeriod = context.screen.selectedPayPeriod
  const facts: Record<string, unknown> = {
    currentTab: context.screen.activeViewLabel,
    todayIso: context.screen.todayIso,
    selectedPayPeriod: compactPayPeriod(selectedPeriod),
  }

  if (activeView === 'history' || activeView === 'payday' || /pay\s*che?cks?|payday|wages?|salary|received|history/.test(query)) {
    facts.payHistory = compactAppContext.payHistory
  }

  if (activeView === 'dashboard' || /dashboard|left|cost|total|pay period|money/.test(query)) {
    facts.dashboard = compactComputedSummaries(context, lookups).summaries.dashboard
  }

  if (activeView === 'spending' || /spend|transaction|manual|purchase/.test(query)) {
    const transactions = selectedPeriod
      ? context.snapshot.transactions.filter(
          (transaction) => transaction.date >= selectedPeriod.startDate && transaction.date <= selectedPeriod.endDate,
        )
      : context.snapshot.transactions

    facts.transactionsForSelectedPeriod = limitList(sortByDate(transactions, 'date', 'desc'), 250, (transaction) =>
      compactTransaction(transaction, lookups),
    )
  }

  if (activeView === 'debts' || activeView === 'aiPlan' || /debt|reserve|owe|owed|payment plan/.test(query)) {
    facts.debts = compactAppContext.debts
    facts.debtPayments = compactAppContext.debtPayments
    facts.debtReserves = compactAppContext.debtReserves
    facts.debtPlans = compactComputedSummaries(context, lookups).summaries.debtPlans
  }

  if (activeView === 'pots' || /pot|saving|balance/.test(query)) {
    facts.pots = compactAppContext.pots
    facts.potAllocations = compactAppContext.potAllocations
    facts.creditCardPots = compactAppContext.creditCardPots
  }

  if (activeView === 'allocatingPayments' || /card|credit|repayment|allocation/.test(query)) {
    facts.creditCards = compactAppContext.creditCards
    facts.creditCardPots = compactAppContext.creditCardPots
    facts.customPayments = compactAppContext.customPayments
    facts.creditCardRepayments = compactAppContext.creditCardRepayments
    facts.creditCardSummary = compactComputedSummaries(context, lookups).summaries.creditCards
  }

  if (activeView === 'recurring' || activeView === 'calendar' || /recurring|subscription|due|calendar|bill/.test(query)) {
    facts.recurringPayments = compactAppContext.recurringPayments
    facts.customPayments = compactAppContext.customPayments
    facts.debtDueDates = compactAppContext.debts
  }

  if (activeView === 'settings' || /setting|instruction|provider|ai/.test(query)) {
    facts.settings = compactAppContext.settings
  }

  if (/future|save|savings?|goal|target|timeline|afford|invest|investment|s&p|sp500|s and p|how long|when can/.test(query)) {
    facts.futurePlanning = compactAppContext.futurePlanning
  }

  return facts
}

function buildLookups(snapshot: PlannerSnapshot) {
  return {
    pots: new Map(snapshot.pots.map((pot) => [pot.id, pot.name])),
    creditCards: new Map(snapshot.creditCards.map((card) => [card.id, card.name])),
    debts: new Map(snapshot.debts.map((debt) => [debt.id, debt.name])),
    payPeriods: new Map(snapshot.payPeriods.map((period) => [period.id, period.payday])),
  }
}

function buildPayHistory(snapshot: PlannerSnapshot) {
  const paychecksByPeriod = new Map(snapshot.paychecks.map((paycheck) => [paycheck.payPeriodId, paycheck]))
  const periodIds = new Set(snapshot.payPeriods.map((period) => period.id))
  const rows = sortByDate(snapshot.payPeriods, 'payday').map((period) => {
    const paycheck = paychecksByPeriod.get(period.id) ?? null
    const receivedAmountPence = paycheck?.actualAmountPence ?? period.incomePence ?? paycheck?.calculatedAmountPence ?? 0

    return {
      payPeriodId: period.id,
      paycheckId: paycheck?.id ?? null,
      payday: period.payday,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      nextPayday: period.nextPayday,
      payFrequency: period.payFrequency ?? snapshot.settings.payFrequency,
      status: period.status,
      incomePence: period.incomePence,
      hoursWorked: paycheck?.hoursWorked ?? null,
      hourlyRatePence: paycheck?.hourlyRatePence ?? null,
      calculatedAmountPence: paycheck?.calculatedAmountPence ?? null,
      actualAmountPence: paycheck?.actualAmountPence ?? null,
      receivedAmountPence,
      receivedAmountSource: paycheck?.actualAmountPence != null
        ? 'actualPaycheck'
        : paycheck
          ? 'recordedPaycheckEstimate'
          : 'payPeriodIncome',
    }
  })
  const orphanPaychecks = snapshot.paychecks
    .filter((paycheck) => !periodIds.has(paycheck.payPeriodId))
    .map((paycheck) => ({
      payPeriodId: paycheck.payPeriodId,
      paycheckId: paycheck.id,
      payday: null,
      periodStartDate: null,
      periodEndDate: null,
      nextPayday: null,
      payFrequency: snapshot.settings.payFrequency,
      status: 'unknown',
      incomePence: null,
      hoursWorked: paycheck.hoursWorked,
      hourlyRatePence: paycheck.hourlyRatePence,
      calculatedAmountPence: paycheck.calculatedAmountPence,
      actualAmountPence: paycheck.actualAmountPence,
      receivedAmountPence: paycheck.actualAmountPence ?? paycheck.calculatedAmountPence,
      receivedAmountSource: paycheck.actualAmountPence != null ? 'actualPaycheck' : 'recordedPaycheckEstimate',
    }))

  return [...rows, ...orphanPaychecks]
}

function compactPayPeriod(period: PlannerSnapshot['payPeriods'][number] | null) {
  if (!period) {
    return null
  }

  return {
    id: period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    payday: period.payday,
    nextPayday: period.nextPayday,
    payFrequency: period.payFrequency,
    incomePence: period.incomePence,
    status: period.status,
  }
}

function compactPot(pot: PlannerSnapshot['pots'][number]) {
  return {
    id: pot.id,
    name: truncateText(pot.name, 120),
    type: pot.type,
    category: pot.category ?? null,
    icon: pot.icon ?? null,
    balancePence: pot.balancePence,
    targetPence: pot.targetPence,
    color: pot.color,
    archived: pot.archived,
  }
}

function compactRecurringPayment(payment: PlannerSnapshot['recurringPayments'][number], lookups: ReturnType<typeof buildLookups>) {
  return {
    id: payment.id,
    name: truncateText(payment.name, 140),
    amountPence: payment.amountPence,
    dueDay: payment.dueDay,
    dueDate: payment.dueDate,
    frequency: payment.frequency,
    potId: payment.potId,
    potName: getLookupName(lookups.pots, payment.potId),
    creditCardId: payment.creditCardId ?? null,
    creditCardName: getLookupName(lookups.creditCards, payment.creditCardId),
    priority: payment.priority,
    active: payment.active,
  }
}

function compactPotAllocation(allocation: PlannerSnapshot['potAllocations'][number], lookups: ReturnType<typeof buildLookups>) {
  return {
    id: allocation.id,
    payPeriodId: allocation.payPeriodId,
    payday: getLookupName(lookups.payPeriods, allocation.payPeriodId),
    potId: allocation.potId,
    potName: getLookupName(lookups.pots, allocation.potId),
    fundingPotId: allocation.fundingPotId ?? null,
    fundingPotName: getLookupName(lookups.pots, allocation.fundingPotId),
    amountPence: allocation.amountPence,
    source: allocation.source,
    recurringPaymentId: allocation.recurringPaymentId ?? null,
  }
}

function compactTransaction(transaction: PlannerSnapshot['transactions'][number], lookups: ReturnType<typeof buildLookups>) {
  return {
    id: transaction.id,
    potId: transaction.potId ?? null,
    potName: getLookupName(lookups.pots, transaction.potId),
    payPeriodId: transaction.payPeriodId ?? null,
    payday: getLookupName(lookups.payPeriods, transaction.payPeriodId),
    amountPence: transaction.amountPence,
    type: transaction.type,
    paymentMethod: transaction.paymentMethod,
    creditCardId: transaction.creditCardId ?? null,
    creditCardName: getLookupName(lookups.creditCards, transaction.creditCardId),
    recurringPaymentId: transaction.recurringPaymentId ?? null,
    date: transaction.date,
    note: truncateText(transaction.note, 180),
  }
}

function compactDebt(debt: PlannerSnapshot['debts'][number]) {
  return {
    id: debt.id,
    name: truncateText(debt.name, 140),
    lender: truncateText(debt.lender, 140),
    originalAmountPence: debt.originalAmountPence,
    currentBalancePence: debt.currentBalancePence,
    minimumPaymentPence: debt.minimumPaymentPence,
    dueDate: debt.dueDate,
    interestRateApr: debt.interestRateApr,
    note: truncateText(debt.note, 220),
    status: debt.status,
  }
}

function compactDebtPayment(payment: PlannerSnapshot['debtPayments'][number], lookups: ReturnType<typeof buildLookups>) {
  return {
    id: payment.id,
    debtId: payment.debtId,
    debtName: getLookupName(lookups.debts, payment.debtId),
    amountPence: payment.amountPence,
    date: payment.date,
    note: truncateText(payment.note, 180),
  }
}

function compactDebtReserve(reserve: PlannerSnapshot['debtReserves'][number], lookups: ReturnType<typeof buildLookups>) {
  return {
    id: reserve.id,
    debtId: reserve.debtId,
    debtName: getLookupName(lookups.debts, reserve.debtId),
    payPeriodId: reserve.payPeriodId,
    payday: reserve.payday,
    periodStartDate: reserve.periodStartDate,
    periodEndDate: reserve.periodEndDate,
    amountPence: reserve.amountPence,
    status: reserve.status,
    source: reserve.source,
    note: truncateText(reserve.note, 180),
  }
}

function compactCreditCard(card: PlannerSnapshot['creditCards'][number]) {
  return {
    id: card.id,
    name: truncateText(card.name, 120),
    provider: truncateText(card.provider, 120),
    limitPence: card.limitPence,
    dueDay: card.dueDay,
    dueDate: card.dueDate,
    color: card.color,
    archived: card.archived,
  }
}

function compactCreditCardPot(creditCardPot: PlannerSnapshot['creditCardPots'][number], lookups: ReturnType<typeof buildLookups>) {
  return {
    id: creditCardPot.id,
    creditCardId: creditCardPot.creditCardId,
    creditCardName: getLookupName(lookups.creditCards, creditCardPot.creditCardId),
    payPeriodId: creditCardPot.payPeriodId,
    payday: creditCardPot.payday,
    periodStartDate: creditCardPot.periodStartDate,
    periodEndDate: creditCardPot.periodEndDate,
    name: truncateText(creditCardPot.name, 140),
    amountPence: creditCardPot.amountPence,
    source: creditCardPot.source,
    status: creditCardPot.status,
    note: truncateText(creditCardPot.note, 180),
  }
}

function compactCustomPayment(payment: PlannerSnapshot['customPayments'][number], lookups: ReturnType<typeof buildLookups>) {
  return {
    id: payment.id,
    name: truncateText(payment.name, 140),
    amountPence: payment.amountPence,
    dueDate: payment.dueDate,
    creditCardId: payment.creditCardId ?? null,
    creditCardName: getLookupName(lookups.creditCards, payment.creditCardId),
    status: payment.status,
  }
}

function compactCreditCardRepayment(
  repayment: PlannerSnapshot['creditCardRepayments'][number],
  lookups: ReturnType<typeof buildLookups>,
) {
  return {
    id: repayment.id,
    creditCardId: repayment.creditCardId,
    creditCardName: getLookupName(lookups.creditCards, repayment.creditCardId),
    amountPence: repayment.amountPence,
    date: repayment.date,
    note: truncateText(repayment.note, 180),
  }
}

function compactDailyBrief(brief: PlannerSnapshot['dailyBriefs'][number]) {
  return {
    id: brief.id,
    date: brief.date,
    snapshotSignature: brief.snapshotSignature,
    contentLength: brief.content.length,
  }
}

function limitList<T, U>(items: T[], limit: number, mapper: (item: T) => U) {
  const safeLimit = Math.max(0, limit)
  const limitedItems = items.slice(0, safeLimit).map(mapper)

  return {
    totalCount: items.length,
    returnedCount: limitedItems.length,
    omittedCount: Math.max(0, items.length - limitedItems.length),
    items: limitedItems,
  }
}

function sortByDate<T, K extends keyof T>(items: T[], key: K, direction: 'asc' | 'desc' = 'asc'): T[] {
  const multiplier = direction === 'asc' ? 1 : -1

  return [...items].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * multiplier)
}

function getLookupName(lookup: Map<string, string>, id: string | null | undefined): string | null {
  if (!id) {
    return null
  }

  return lookup.get(id) ?? null
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function createAiProviderError(provider: AiProvider, reason: string) {
  return {
    error: 'AI provider failed',
    provider,
    reason,
  }
}

function parseAssistantResponse(value: string, fallbackContext?: AssistantActionFallbackContext): AssistantResponse {
  const parsed = JSON.parse(extractJsonObjectText(value)) as unknown

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Assistant returned a non-object JSON response.')
  }

  const response = getResponseObject(parsed as Record<string, unknown>)
  const answer = getFirstString(response, ['answer', 'response', 'message', 'summary'])

  if (!answer) {
    throw new Error('Assistant returned an invalid JSON shape.')
  }

  const proposedActions = normalizeAssistantActionProposals(
    getValue(response, ['proposedActions', 'proposed_actions', 'appActions', 'app_actions']),
  )

  return addFallbackProposedActions({
    answer: answer.trim(),
    highlights: normalizeStringList(getValue(response, ['highlights', 'facts', 'keyFacts'])),
    actions: normalizeStringList(getValue(response, ['actions', 'nextActions', 'next_steps'])),
    confidence: normalizeConfidence(getValue(response, ['confidence', 'certainty'])),
    ...(proposedActions.length > 0 ? { proposedActions } : {}),
  }, fallbackContext)
}

function addFallbackProposedActions(
  response: AssistantResponse,
  fallbackContext?: AssistantActionFallbackContext,
): AssistantResponse {
  if ((response.proposedActions?.length ?? 0) > 0) {
    return response
  }

  const createPotAction = createFallbackPotAction(fallbackContext)

  if (!createPotAction) {
    return response
  }

  return {
    ...response,
    actions: response.actions.length > 0 ? response.actions : ['Review and confirm the suggested pot.'],
    proposedActions: [createPotAction],
  }
}

function createFallbackPotAction(fallbackContext?: AssistantActionFallbackContext): AssistantActionProposal | null {
  const source = getFallbackPotActionSource(fallbackContext)

  if (!source) {
    return null
  }

  const name = extractRequestedPotName(source)

  if (!name) {
    return null
  }

  const targetPence = extractPaycheckTopUpPence(source)
  const balancePence = extractPotBalancePence(source) ?? 0

  return {
    id: `create-pot-${slugifyActionId(name)}`,
    type: 'create_pot',
    label: `Create ${name} pot`,
    payload: {
      name,
      type: extractRequestedPotType(source) ?? 'spending',
      balancePence,
      targetPence,
      color: '#2563eb',
      linkedCreditCardId: null,
      linkedDebtId: null,
    },
  }
}

function getFallbackPotActionSource(fallbackContext?: AssistantActionFallbackContext): string {
  if (!fallbackContext) {
    return ''
  }

  const question = fallbackContext.question.trim()

  if (isCreatePotRequest(question)) {
    return question
  }

  if (!isConfirmationRequest(question)) {
    return ''
  }

  const previousAssistantProposal = [...fallbackContext.conversationHistory]
    .reverse()
    .find((message) => message.role === 'assistant' && isCreatePotRequest(message.content))

  return previousAssistantProposal?.content ?? ''
}

function isCreatePotRequest(value: string): boolean {
  const normalised = value.toLowerCase()

  return /\bpot\b/.test(normalised) && /\b(create|make|add|set up|setup|new|propos(?:e|ing|ed))\b/.test(normalised)
}

function isConfirmationRequest(value: string): boolean {
  return /^(confirm|confirm it|yes|yep|yeah|do it|go ahead|save it|create it)$/i.test(value.trim())
}

function extractRequestedPotName(value: string): string {
  const patterns = [
    /\bpot\s+(?:called|named)\s+\*\*([^*]{1,80})\*\*/i,
    /\bpot\s+(?:called|named)\s+["“']([^"”']{1,80})["”']/i,
    /\bpot\s+(?:called|named)\s+(.+?)(?:\s+(?:with|that|and)\b|[.!?]|$)/i,
    /\b(?:called|named)\s+\*\*([^*]{1,80})\*\*/i,
    /\b(?:called|named)\s+["“']([^"”']{1,80})["”']/i,
    /\b(?:called|named)\s+(.+?)(?:\s+(?:with|that|and)\b|[.!?]|$)/i,
  ]

  for (const pattern of patterns) {
    const match = value.match(pattern)
    const name = cleanPotName(match?.[1] ?? '')

    if (name) {
      return name
    }
  }

  return ''
}

function extractRequestedPotType(value: string): PotType | null {
  const normalised = value.toLowerCase()
  const potTypes: PotType[] = ['spending', 'reserved', 'saving', 'investment', 'buffer']

  return potTypes.find((type) => normalised.includes(`${type} pot`)) ?? null
}

function extractPaycheckTopUpPence(value: string): number | null {
  if (!/\b(each|every)\s+pay(?:check|day)\b|\bpay(?:check|day)\s+top-?up\b|\btop\s+up\b/i.test(value)) {
    return null
  }

  return extractFirstMoneyPence(value)
}

function extractPotBalancePence(value: string): number | null {
  if (!/\b(current balance|balance|already set aside|with)\b/i.test(value)) {
    return null
  }

  return extractFirstMoneyPence(value)
}

function extractFirstMoneyPence(value: string): number | null {
  const match = value.match(/£\s*([\d,]+(?:\.\d{1,2})?)/)

  if (!match) {
    return null
  }

  const amount = Number(match[1].replaceAll(',', ''))

  if (!Number.isFinite(amount) || amount < 0) {
    return null
  }

  return Math.round(amount * 100)
}

function cleanPotName(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+will\s+not\s+be\s+saved.*$/i, '')
    .replace(/\s+won[’']?t\s+be\s+saved.*$/i, '')
    .trim()
    .replace(/[.,!?]+$/g, '')
    .slice(0, 80)
    .trim()
}

function slugifyActionId(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  return slug || 'new-pot'
}

function extractJsonObjectText(value: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error('Assistant returned empty JSON.')
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')

  if (start < 0 || end < start) {
    throw new Error('Assistant returned invalid JSON.')
  }

  return candidate.slice(start, end + 1)
}

function normalizePlannerSnapshot(snapshot: unknown): PlannerSnapshot {
  const input = snapshot && typeof snapshot === 'object' ? snapshot as Partial<PlannerSnapshot> : {}

  return {
    settings: {
      ...defaultSettings,
      ...input.settings,
      aiInstructions: input.settings?.aiInstructions ?? defaultSettings.aiInstructions,
      aiProvider: normalizeAiProvider(input.settings?.aiProvider),
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
    dailyBriefs: input.dailyBriefs ?? [],
  }
}

function normalizeAiProvider(provider: unknown): AiProvider {
  return provider === 'openrouter' ? 'openrouter' : 'gemini'
}

function parseBody(body: unknown): AssistantRequestBody {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as AssistantRequestBody
    } catch {
      return {}
    }
  }

  if (body && typeof body === 'object') {
    return body as AssistantRequestBody
  }

  return {}
}

function normalizeConversationHistory(value: unknown): AssistantConversationMessage[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeConversationMessage)
    .filter((message): message is AssistantConversationMessage => Boolean(message))
    .slice(-8)
}

function normalizeConversationMessage(value: unknown): AssistantConversationMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const source = value as Record<string, unknown>
  const role = source.role === 'user' || source.role === 'assistant' ? source.role : null
  const content = typeof source.content === 'string' ? source.content.trim() : ''

  if (!role || !content) {
    return null
  }

  return {
    role,
    content: truncateText(content, 1500),
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

function cleanList(items: string[]): string[] {
  return items.map(cleanListItem).filter(Boolean)
}

function cleanListItem(item: string): string {
  return item
    .replace(/^\s*[-*•]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .trim()
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return cleanList(value.filter((item): item is string => typeof item === 'string'))
  }

  if (typeof value === 'string') {
    return cleanList(value.split(/\r?\n/))
  }

  return []
}

function normalizeConfidence(value: unknown): AssistantResponse['confidence'] {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()

    if (normalized.includes('high')) {
      return 'high'
    }

    if (normalized.includes('medium')) {
      return 'medium'
    }

    if (normalized.includes('low')) {
      return 'low'
    }
  }

  if (typeof value === 'number') {
    if (value >= 0.75) {
      return 'high'
    }

    if (value >= 0.45) {
      return 'medium'
    }

    return 'low'
  }

  return 'medium'
}

function getFirstString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = getValue(source, [key])

    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return null
}

function getResponseObject(source: Record<string, unknown>): Record<string, unknown> {
  if (getFirstString(source, ['answer', 'response', 'message', 'summary'])) {
    return source
  }

  for (const key of ['assistantResponse', 'assistant_response', 'result', 'data']) {
    const value = getValue(source, [key])

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  }

  return source
}

function getValue(source: Record<string, unknown>, keys: string[]): unknown {
  const entries = Object.entries(source)

  for (const key of keys) {
    if (key in source) {
      return source[key]
    }

    const lowerKey = key.toLowerCase()
    const match = entries.find(([candidate]) => candidate.toLowerCase() === lowerKey)

    if (match) {
      return match[1]
    }
  }

  return undefined
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown AI provider error.'
}

function logAiProviderError(provider: AiProvider, error: unknown) {
  console.error('AI assistant provider failed', {
    provider,
    reason: getErrorMessage(error),
  })
}
