import { type FormEvent, type ReactNode, useState } from 'react'
import { Bot, CheckCircle2, Loader2, Send, ShieldCheck, Sparkles, X } from 'lucide-react'
import { clsx } from 'clsx'

import {
  getAssistantActionDetails,
  getAssistantActionValidationError,
  normalizeAssistantActionProposals,
  runAssistantAction,
  type AssistantActionProposal,
  type AssistantActionStatus,
} from '../domain/assistantActions'
import { getViewLabel } from '../domain/assistantContext'
import { getAppTodayIso } from '../domain/money'
import {
  createAssistantMessage,
  createConversationHistory,
  type AssistantChatMessage,
  type AssistantResponse,
  useAssistantConversations,
} from '../hooks/useAssistantConversations'
import { useAssistantProfile } from '../hooks/useAssistantProfile'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import type { PayPeriod } from '../types/models'
import type { ViewKey } from '../types/navigation'

type AppAssistantUser = {
  getIdToken: () => Promise<string>
} | null

export function AppAssistant({
  snapshot,
  activeView,
  selectedPayPeriod,
  actions,
  user,
}: {
  snapshot: PlannerSnapshot
  activeView: ViewKey
  selectedPayPeriod?: PayPeriod | null
  actions: PlannerActions
  user: AppAssistantUser
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const { messages, actionStatuses, appendMessage, setActionStatuses } = useAssistantConversations()
  const { profile } = useAssistantProfile()
  const todayIso = getAppTodayIso(snapshot.settings)
  const viewLabel = getViewLabel(activeView)

  async function confirmAssistantAction(action: AssistantActionProposal) {
    const validationError = getAssistantActionValidationError(action, snapshot)

    if (validationError) {
      setActionStatuses((current) => ({
        ...current,
        [action.id]: { state: 'error', error: validationError },
      }))
      return
    }

    setActionStatuses((current) => ({
      ...current,
      [action.id]: { state: 'running' },
    }))

    try {
      await runAssistantAction(action, actions)
      setActionStatuses((current) => ({
        ...current,
        [action.id]: { state: 'done' },
      }))
    } catch (error) {
      setActionStatuses((current) => ({
        ...current,
        [action.id]: {
          state: 'error',
          error: error instanceof Error ? error.message : 'Unable to run this action.',
        },
      }))
    }
  }

  function cancelAssistantAction(actionId: string) {
    setActionStatuses((current) => ({
      ...current,
      [actionId]: { state: 'cancelled' },
    }))
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const question = draft.trim()

    if (!question || isSending) {
      return
    }

    setDraft('')
    appendMessage(
      createAssistantMessage({
        role: 'user',
        answer: question,
        highlights: [],
        actions: [],
        confidence: 'high',
        proposedActions: [],
      }),
    )

    if (!user) {
      appendMessage(
        createAssistantMessage({
          role: 'assistant',
          ...createUnavailableResponse(
            `Sign in from Settings to ask ${profile.name}.`,
            'Authentication is required before any planner data is sent to an AI provider.',
            'Sign in from Settings, then ask again so I can use your synced planner data.',
          ),
        }),
      )
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
          conversationHistory: createConversationHistory(messages),
          snapshot,
        }),
      })

      if (!response.ok) {
        throw new Error(await getAssistantErrorMessage(response))
      }

      const assistantResponse = (await response.json()) as AssistantResponse
      appendMessage(createAssistantMessage({ role: 'assistant', ...createVisibleAssistantResponse(assistantResponse) }))
    } catch (error) {
      appendMessage(
        createAssistantMessage({
          role: 'assistant',
          ...createUnavailableResponse(
            'AI provider failed.',
            error instanceof Error ? error.message : 'Unknown AI provider error.',
          ),
        }),
      )
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        aria-label={`Open ${profile.name} helper`}
        onClick={() => setIsOpen(true)}
        className="ai-assistant-trigger group fixed bottom-[5.75rem] right-3 z-40 inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur transition hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-emerald)] sm:right-5 sm:px-3 lg:bottom-5"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-[var(--color-emerald)] text-[11px] font-black text-white shadow-sm shadow-emerald-950/10">
          {profile.avatar}
        </span>
        <span className="hidden size-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-emerald)] transition group-hover:bg-[var(--color-accent)] sm:flex">
          <Sparkles size={15} />
        </span>
        <span>{profile.name}</span>
      </button>
    )
  }

  return (
    <section
      role="dialog"
      aria-label={`${profile.name} helper`}
      className="fixed inset-x-3 bottom-24 z-40 flex max-h-[min(660px,calc(100vh-7rem))] flex-col overflow-hidden rounded-lg border border-slate-200/90 bg-white/[0.94] shadow-[0_26px_80px_rgba(15,23,42,0.22)] backdrop-blur sm:inset-x-auto sm:right-5 sm:w-[min(440px,calc(100vw-2.5rem))] lg:bottom-5"
    >
      <div className="ai-assistant-header border-b border-white/10 p-3.5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/95 text-xs font-black text-slate-950 shadow-lg shadow-slate-950/20">
              {profile.avatar}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-semibold">{profile.name}</p>
                <span className="rounded-md border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
                  Helper
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-300">Ask, review, approve.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label={`Close ${profile.name} helper`}
            onClick={() => setIsOpen(false)}
            className="rounded-md p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <AssistantHeaderStat icon={<ShieldCheck size={13} />} label={user ? 'Signed in' : 'Sign in needed'} />
          <AssistantHeaderStat icon={<Bot size={13} />} label={`${messages.length} messages`} />
        </div>
      </div>

      <div
        role="log"
        aria-label={`${profile.name} conversation messages`}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--color-surface-soft)] p-3"
      >
        <div className="rounded-lg border border-slate-200/90 bg-white/95 p-3 text-sm leading-5 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-cyan-200/80 bg-cyan-50/80 px-2 py-1 text-[11px] font-semibold text-cyan-900">
            <Sparkles size={12} />
            Planning context
          </div>
          <p>I can access all of your payments and give you a detailed plan depending on your needs.</p>
        </div>

        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            snapshot={snapshot}
            actionStatuses={actionStatuses}
            onConfirmAction={confirmAssistantAction}
            onCancelAction={cancelAssistantAction}
          />
        ))}

        {isSending && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200/90 bg-white/95 p-3 text-sm text-slate-500 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <Loader2 className="animate-spin" size={16} />
            Reading the whole planner...
          </div>
        )}
      </div>

      <form onSubmit={sendMessage} className="border-t border-slate-200/90 bg-white/95 p-2.5">
        <label htmlFor="app-assistant-input" className="sr-only">
          Ask {profile.name}
        </label>
        <div className="flex items-end gap-2 rounded-lg border border-slate-200/90 bg-slate-50/80 p-2 shadow-inner shadow-slate-200/50 focus-within:border-cyan-400 focus-within:ring-4 focus-within:ring-cyan-100">
          <textarea
            id="app-assistant-input"
            aria-label={`Ask ${profile.name}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder={`Ask ${profile.name} about ${viewLabel.toLowerCase()}, costs, pots, debts...`}
            className="max-h-28 min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-slate-950 outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!draft.trim() || isSending}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-deep-navy)] text-white shadow-sm shadow-slate-300/60 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={17} />
          </button>
        </div>
      </form>
    </section>
  )
}

function ChatBubble({
  message,
  snapshot,
  actionStatuses,
  onConfirmAction,
  onCancelAction,
}: {
  message: AssistantChatMessage
  snapshot: PlannerSnapshot
  actionStatuses: Record<string, AssistantActionStatus>
  onConfirmAction: (action: AssistantActionProposal) => void
  onCancelAction: (actionId: string) => void
}) {
  const isUser = message.role === 'user'

  return (
    <article className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[92%] rounded-lg px-3.5 py-3 text-sm leading-6 shadow-sm',
          isUser
            ? 'bg-[var(--color-deep-navy)] text-white shadow-[0_14px_34px_rgba(15,23,42,0.16)]'
            : 'border border-slate-200/90 bg-white/95 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.06)]',
        )}
      >
        <p className={clsx('whitespace-pre-wrap', isUser ? 'text-white' : 'text-slate-800')}>{message.answer}</p>
        {!isUser && message.proposedActions && message.proposedActions.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.proposedActions.map((action) => (
              <AssistantActionCard
                key={action.id}
                action={action}
                snapshot={snapshot}
                status={actionStatuses[action.id] ?? { state: 'pending' }}
                onConfirm={() => onConfirmAction(action)}
                onCancel={() => onCancelAction(action.id)}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

function AssistantHeaderStat({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-semibold text-slate-200 backdrop-blur">
      <span className="text-cyan-100">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  )
}

function AssistantActionCard({
  action,
  snapshot,
  status,
  onConfirm,
  onCancel,
}: {
  action: AssistantActionProposal
  snapshot: PlannerSnapshot
  status: AssistantActionStatus
  onConfirm: () => void
  onCancel: () => void
}) {
  const validationError = getAssistantActionValidationError(action, snapshot)
  const isTerminal = status.state === 'done' || status.state === 'cancelled'
  const isRunning = status.state === 'running'
  const details = getAssistantActionDetails(action, snapshot)

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-slate-800 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white/70 px-2 py-1 text-xs font-semibold uppercase text-emerald-700">
            <CheckCircle2 size={13} />
            Suggested action
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-950">{action.label}</p>
        </div>
        {status.state === 'done' && (
          <span className="rounded-full bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">Done</span>
        )}
        {status.state === 'cancelled' && (
          <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">Cancelled</span>
        )}
      </div>
      <ul className="mt-2 space-y-1">
        {details.map((detail) => (
          <li key={detail} className="text-xs leading-5 text-slate-600">
            {detail}
          </li>
        ))}
      </ul>
      {(validationError || status.error) && (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700">
          {status.error ?? validationError}
        </p>
      )}
      {!isTerminal && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={Boolean(validationError) || isRunning}
            className="inline-flex min-h-8 items-center justify-center rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Confirm action'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isRunning}
            className="inline-flex min-h-8 items-center justify-center rounded-lg border border-slate-200/90 bg-white/90 px-3 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-200/60 transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function createUnavailableResponse(answer: string, reason: string, action = 'Check Settings, confirm you are signed in, and verify the selected AI provider has a working server key.'): AssistantResponse {
  return {
    answer: `${answer}\n\n${reason}\n\nWhat I’d do next: ${action}`,
    highlights: [reason],
    actions: [action],
    confidence: 'low',
    proposedActions: [],
  }
}

function createVisibleAssistantResponse(response: AssistantResponse): AssistantResponse {
  return {
    ...response,
    answer: ensureNextStepGuidance(response.answer, response.actions),
    proposedActions: normalizeAssistantActionProposals(response.proposedActions),
  }
}

function ensureNextStepGuidance(answer: string, actions: string[]): string {
  const trimmedAnswer = answer.trim()

  if (/what i['’]d do next|what to do next|next steps?|my advice|i recommend/i.test(trimmedAnswer)) {
    return trimmedAnswer
  }

  const nextStep = actions.find((action) => action.trim())?.trim()

  if (!nextStep) {
    return `${trimmedAnswer}\n\nWhat I’d do next: ask me a follow-up and I’ll help you decide the best move from the current planner data.`
  }

  return `${trimmedAnswer}\n\nWhat I’d do next: ${nextStep}`
}

async function getAssistantErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: unknown
      provider?: unknown
      reason?: unknown
    }
    const parts = [
      typeof body.error === 'string' ? body.error : `Assistant helper request failed with ${response.status}`,
      typeof body.provider === 'string' ? `Provider: ${body.provider}` : '',
      typeof body.reason === 'string' ? body.reason : '',
    ].filter(Boolean)

    return parts.join(' · ')
  } catch {
    return `Assistant helper request failed with ${response.status}`
  }
}
