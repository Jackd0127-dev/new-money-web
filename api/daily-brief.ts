import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { GoogleGenAI, Type } from '@google/genai'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

import { formatPence } from '../src/domain/money.js'
import {
  getDailyBriefFacts,
  type BriefRisk,
  type DailyBriefFacts,
  type DailyBriefSnapshotInput,
} from '../src/domain/dailyBriefFacts.js'

const dailyBriefInstructionsPath = join(dirname(fileURLToPath(import.meta.url)), 'daily-brief-instructions.md')

const systemInstruction = `
You are a financial brief writer inside a private paycheck-planner app.
You do not calculate final balances unless the snapshot explicitly provides the calculated value.
You explain and prioritise the provided facts.
Use only the provided planner snapshot.
Never invent missing data.
Never provide tax, legal, regulated investment, credit product, debt restructuring, or lending advice.
Never suggest borrowing money, taking credit, investing, or changing legal/tax arrangements.
Your job is to produce a short, practical daily money brief focused on:
- pay received in the current pay period
- payments due today or soon
- credit card amounts owed and card-linked payments
- upcoming risks before next payday
- overspent or low pots
- specific actions for today and next steps
Write in UK English.
Use GBP formatting.
`.trim()

const dailyBriefResponseSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "One short summary of today's money position.",
    },
    risks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Important money risks, ordered by urgency.',
    },
    today: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Actions the user should take today.',
    },
    next: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Next actions before payday.',
    },
    missingData: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Missing data that affects the brief.',
    },
    confidence: {
      type: Type.STRING,
      enum: ['high', 'medium', 'low'],
    },
  },
  required: ['summary', 'risks', 'today', 'next', 'missingData', 'confidence'],
  propertyOrdering: ['summary', 'risks', 'today', 'next', 'missingData', 'confidence'],
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

interface DailyBriefRequestBody {
  todayIso?: string
  snapshotSignature?: string
  snapshot?: unknown
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const idToken = getBearerToken(req.headers.authorization)

  if (!idToken) {
    return res.status(401).json({ error: 'Missing Firebase ID token' })
  }

  const body = parseBody(req.body)
  const todayIso = body.todayIso ?? new Date().toISOString().slice(0, 10)

  try {
    initializeFirebaseAdmin()
    await getAuth().verifyIdToken(idToken)
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to verify planner access',
    })
  }

  const briefSnapshot = toBriefSnapshotInput(body.snapshot)
  const aiProvider = briefSnapshot.settings?.aiProvider ?? 'gemini'
  const briefFacts = getDailyBriefFacts(briefSnapshot, todayIso)
  const fallbackContent = formatFallbackDailyBrief(briefFacts)

  if (aiProvider === 'openrouter') {
    const openRouterApiKey = process.env.OPENROUTER_API_KEY

    if (!openRouterApiKey) {
      return res.status(200).json({ content: fallbackContent })
    }

    try {
      const prompt = buildPrompt({
        todayIso,
        snapshotSignature: body.snapshotSignature ?? 'unknown',
        briefFacts,
      })
      const content = formatDailyBriefResponse(
        parseDailyBriefResponse(
          await generateOpenRouterJson({
            apiKey: openRouterApiKey,
            systemInstruction,
            prompt,
          }),
        ),
      )

      return res.status(200).json({ content: content || fallbackContent })
    } catch {
      return res.status(200).json({ content: fallbackContent })
    }
  }

  const geminiApiKey = process.env.GEMINI_API_KEY

  if (!geminiApiKey) {
    return res.status(200).json({ content: fallbackContent })
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: buildPrompt({
        todayIso,
        snapshotSignature: body.snapshotSignature ?? 'unknown',
        briefFacts,
      }),
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: dailyBriefResponseSchema,
      },
    })
    const content = formatDailyBriefResponse(parseDailyBriefResponse(extractGeminiText(response)))

    if (!content) {
      return res.status(200).json({ content: fallbackContent })
    }

    return res.status(200).json({ content })
  } catch {
    return res.status(200).json({ content: fallbackContent })
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
      response_format: { type: 'json_object' },
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
    throw new Error('OpenRouter returned an empty daily brief.')
  }

  return content.trim()
}

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON

  if (!serviceAccountJson) {
    throw new Error('Firebase service account is not configured')
  }

  const serviceAccount = JSON.parse(serviceAccountJson) as Record<string, unknown>

  if (typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
  }

  initializeApp({
    credential: cert(serviceAccount),
  })
}

function getBearerToken(value: string | string[] | undefined): string | null {
  const header = Array.isArray(value) ? value[0] : value

  if (!header?.startsWith('Bearer ')) {
    return null
  }

  return header.slice('Bearer '.length).trim() || null
}

function parseBody(body: unknown): DailyBriefRequestBody {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as DailyBriefRequestBody
    } catch {
      return {}
    }
  }

  if (body && typeof body === 'object') {
    return body as DailyBriefRequestBody
  }

  return {}
}

function buildPrompt({
  todayIso,
  snapshotSignature,
  briefFacts,
}: {
  todayIso: string
  snapshotSignature: string
  briefFacts: DailyBriefFacts
}): string {
  const editableInstructions = getDailyBriefInstructions()

  return [
    `Editable daily brief instructions:\n${editableInstructions}`,
    `Local date:\n${todayIso}`,
    `Snapshot signature:\n${snapshotSignature}`,
    `Planner brief facts JSON:\n${JSON.stringify(briefFacts)}`,
  ].filter(Boolean).join('\n\n')
}

function getDailyBriefInstructions(): string {
  try {
    return readFileSync(dailyBriefInstructionsPath, 'utf8').trim()
  } catch {
    return ''
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

interface DailyBriefAiResponse {
  summary: string
  risks: string[]
  today: string[]
  next: string[]
  missingData: string[]
  confidence: 'high' | 'medium' | 'low'
}

function toBriefSnapshotInput(snapshot: unknown): DailyBriefSnapshotInput {
  if (!snapshot || typeof snapshot !== 'object') {
    return {}
  }

  return snapshot as DailyBriefSnapshotInput
}

function parseDailyBriefResponse(value: string): DailyBriefAiResponse {
  const parsed = JSON.parse(value) as unknown

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini returned a non-object daily brief.')
  }

  const response = parsed as Partial<DailyBriefAiResponse>

  if (
    typeof response.summary !== 'string' ||
    !isStringArray(response.risks) ||
    !isStringArray(response.today) ||
    !isStringArray(response.next) ||
    !isStringArray(response.missingData) ||
    !['high', 'medium', 'low'].includes(String(response.confidence))
  ) {
    throw new Error('Gemini returned an invalid daily brief shape.')
  }

  return {
    summary: response.summary.trim(),
    risks: cleanList(response.risks),
    today: cleanList(response.today),
    next: cleanList(response.next),
    missingData: cleanList(response.missingData),
    confidence: response.confidence,
  }
}

function formatDailyBriefResponse(response: DailyBriefAiResponse): string {
  return formatBriefSections({
    summary: response.summary,
    risks: [...response.risks, ...response.missingData.map((item) => `Missing data: ${item}`)],
    today: response.today,
    next: response.next,
  })
}

function formatFallbackDailyBrief(facts: DailyBriefFacts): string {
  const paydayText = facts.payPeriod.nextPaydayIso ? ` before payday on ${facts.payPeriod.nextPaydayIso}` : ''
  const summary = facts.payPeriod.nextPaydayIso
    ? `You have ${formatPence(facts.balances.currentAvailablePence)} available, with ${formatPence(facts.balances.committedBeforeNextPaydayPence)} committed${paydayText}.`
    : 'A current pay period is missing, so the brief can only use the planner data that is available.'
  const importantRisks = facts.risks.slice(0, 4)

  return formatBriefSections({
    summary,
    risks: importantRisks.length > 0 ? importantRisks.map(formatRisk) : ['No major money risks are flagged from the calculated data.'],
    today: getRiskActions(importantRisks.filter((risk) => ['critical', 'high'].includes(risk.severity))),
    next: getRiskActions(importantRisks.filter((risk) => !['critical', 'high'].includes(risk.severity))),
  })
}

function formatBriefSections({
  summary,
  risks,
  today,
  next,
}: {
  summary: string
  risks: string[]
  today: string[]
  next: string[]
}): string {
  return [
    'Summary:',
    summary || 'No summary returned.',
    '',
    'Risks:',
    ...formatList(risks, 'No major risks flagged.'),
    '',
    'Today:',
    ...formatList(today, 'Review the planner and update anything due today.'),
    '',
    'Next:',
    ...formatList(next, 'Keep upcoming payments updated before payday.'),
  ].join('\n')
}

function formatList(items: string[], fallback: string): string[] {
  const cleanItems = cleanList(items)
  return cleanItems.length > 0 ? cleanItems.map((item) => `- ${item}`) : [`- ${fallback}`]
}

function formatRisk(risk: BriefRisk): string {
  const amount = typeof risk.amountPence === 'number' ? ` (${formatPence(risk.amountPence)})` : ''
  const due = risk.dueIso ? ` due ${risk.dueIso}` : ''

  return `${risk.title}${amount}${due}.`
}

function getRiskActions(risks: BriefRisk[]): string[] {
  return cleanList(risks.map((risk) => risk.recommendedAction))
}

function cleanList(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
