import { type FormEvent, useState } from 'react'
import { Bot, ChevronDown, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { clsx } from 'clsx'

import { getViewLabel } from '../domain/assistantContext'
import { toIsoDate } from '../domain/money'
import type { PlannerSnapshot } from '../hooks/usePlannerData'
import type { PayPeriod } from '../types/models'
import type { ViewKey } from '../types/navigation'

type AppAssistantUser = {
  getIdToken: () => Promise<string>
} | null

interface AssistantResponse {
  answer: string
  highlights: string[]
  actions: string[]
  confidence: 'high' | 'medium' | 'low'
}

interface ChatMessage extends AssistantResponse {
  id: string
  role: 'user' | 'assistant'
}

export function AppAssistant({
  snapshot,
  activeView,
  selectedPayPeriod,
  user,
}: {
  snapshot: PlannerSnapshot
  activeView: ViewKey
  selectedPayPeriod?: PayPeriod | null
  user: AppAssistantUser
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const todayIso = toIsoDate(new Date())
  const viewLabel = getViewLabel(activeView)
  const periodLabel = selectedPayPeriod
    ? `${selectedPayPeriod.startDate} to ${selectedPayPeriod.endDate}`
    : 'No pay period selected'

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const question = draft.trim()

    if (!question || isSending) {
      return
    }

    setDraft('')
    setMessages((current) => [
      ...current,
      createMessage({
        role: 'user',
        answer: question,
        highlights: [],
        actions: [],
        confidence: 'high',
      }),
    ])

    if (!user) {
      setMessages((current) => [...current, createMessage({ role: 'assistant', ...createUnavailableResponse('Sign in from Settings to ask New Money AI.', 'Authentication is required before any planner data is sent to an AI provider.') })])
      return
    }

    setIsSending(true)

    try {
      const idToken = await user.getIdToken()
      const response = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          todayIso,
          activeView,
          selectedPayPeriodId: selectedPayPeriod?.id ?? null,
          snapshot,
        }),
      })

      if (!response.ok) {
        throw new Error(await getAssistantErrorMessage(response))
      }

      const assistantResponse = (await response.json()) as AssistantResponse
      setMessages((current) => [...current, createMessage({ role: 'assistant', ...assistantResponse })])
    } catch (error) {
      setMessages((current) => [...current, createMessage({ role: 'assistant', ...createUnavailableResponse('AI provider failed.', error instanceof Error ? error.message : 'Unknown AI provider error.') })])
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        aria-label="Open AI helper"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-3 rounded-full border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-slate-900/25 transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-white text-slate-950">
          <Sparkles size={18} />
        </span>
        <span className="hidden sm:inline">Ask AI</span>
      </button>
    )
  }

  return (
    <section
      role="dialog"
      aria-label="New Money AI helper"
      className="fixed bottom-5 right-5 z-40 flex max-h-[min(720px,calc(100vh-2.5rem))] w-[min(430px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
    >
      <div className="border-b border-slate-200 bg-slate-950 p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-950">
              <Bot size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold">New Money AI</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">Full app context, focused on your current screen.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close AI helper"
            onClick={() => setIsOpen(false)}
            className="rounded-md p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ContextPill label={viewLabel} />
          <ContextPill label={periodLabel} />
          <ContextPill label={snapshot.settings.aiProvider === 'openrouter' ? 'OpenRouter' : 'Gemini'} />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
          <div className="mb-2 flex items-center gap-2 text-slate-950">
            <MessageCircle size={16} />
            <p className="font-semibold">Ask anything in your planner</p>
          </div>
          <p>
            I can use every saved tab: pay periods, pots, spending, debts, reserves, credit cards,
            recurring payments, calendar data, history, daily briefs, and settings.
          </p>
        </div>

        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}

        {isSending && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={16} />
            Reading the whole planner...
          </div>
        )}
      </div>

      <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-3">
        <label htmlFor="app-assistant-input" className="sr-only">
          Ask New Money AI
        </label>
        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-inner shadow-slate-200/50 focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100">
          <textarea
            id="app-assistant-input"
            aria-label="Ask New Money AI"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder={`Ask about ${viewLabel.toLowerCase()}, costs, pots, debts...`}
            className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-slate-950 outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!draft.trim() || isSending}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={17} />
          </button>
        </div>
      </form>
    </section>
  )
}

function ContextPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-100">
      <ChevronDown size={13} className="-rotate-90 text-slate-400" />
      {label}
    </span>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <article className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[92%] rounded-2xl px-3.5 py-3 text-sm leading-6',
          isUser ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700',
        )}
      >
        <p className={clsx('whitespace-pre-wrap', isUser ? 'text-white' : 'text-slate-800')}>{message.answer}</p>
        {!isUser && message.highlights.length > 0 && (
          <AssistantList title="Highlights" items={message.highlights} />
        )}
        {!isUser && message.actions.length > 0 && (
          <AssistantList title="Actions" items={message.actions} />
        )}
        {!isUser && (
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Confidence: {message.confidence}
          </p>
        )}
      </div>
    </article>
  )
}

function AssistantList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-sm text-slate-700">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function createMessage(input: Omit<ChatMessage, 'id'>): ChatMessage {
  return {
    ...input,
    id: crypto.randomUUID(),
  }
}

function createUnavailableResponse(answer: string, reason: string): AssistantResponse {
  return {
    answer,
    highlights: [reason],
    actions: ['Check Settings, confirm you are signed in, and verify the selected AI provider has a working server key.'],
    confidence: 'low',
  }
}

async function getAssistantErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: unknown
      provider?: unknown
      reason?: unknown
    }
    const parts = [
      typeof body.error === 'string' ? body.error : `AI helper request failed with ${response.status}`,
      typeof body.provider === 'string' ? `Provider: ${body.provider}` : '',
      typeof body.reason === 'string' ? body.reason : '',
    ].filter(Boolean)

    return parts.join(' · ')
  } catch {
    return `AI helper request failed with ${response.status}`
  }
}
