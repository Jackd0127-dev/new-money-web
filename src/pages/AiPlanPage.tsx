import { type FormEvent, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { CheckCircle2, Loader2, Send, Settings2, X } from 'lucide-react'

import {
  getAssistantActionDetails,
  getAssistantActionValidationError,
  normalizeAssistantActionProposals,
  runAssistantAction,
  type AssistantActionProposal,
  type AssistantActionStatus,
} from '../domain/assistantActions'
import { formatPence, getAppTodayIso, getPayPeriodCostSummary } from '../domain/money'
import {
  createAssistantMessage,
  createConversationHistory,
  type AssistantChatMessage,
  type AssistantConversation,
  type AssistantResponse,
  useAssistantConversations,
} from '../hooks/useAssistantConversations'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import { useAssistantProfile } from '../hooks/useAssistantProfile'
import { Button, Field, TextInput } from '../components/ui'
import type { PayPeriod } from '../types/models'

type AiPlanUser = {
  getIdToken: () => Promise<string>
} | null

export function AiPlanPage({
  snapshot,
  selectedPayPeriod,
  user,
  actions,
}: {
  snapshot: PlannerSnapshot
  selectedPayPeriod?: PayPeriod | null
  user: AiPlanUser
  actions: PlannerActions
}) {
  const [draft, setDraft] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [isCustomizing, setIsCustomizing] = useState(false)
  const { profile, setProfile } = useAssistantProfile()
  const {
    conversations,
    activeConversation,
    messages,
    actionStatuses,
    appendMessage,
    setActionStatuses,
    selectConversation,
    createConversation,
  } = useAssistantConversations()
  const viewedPeriod = selectedPayPeriod ?? null
  const proposedActions = useMemo(
    () => messages.flatMap((message) => message.proposedActions ?? []),
    [messages],
  )
  const hasInsightsRail = Boolean(viewedPeriod || proposedActions.length > 0)

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

    if (!question || isAsking) {
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
          ),
        }),
      )
      return
    }

    setIsAsking(true)

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
          todayIso: getAppTodayIso(snapshot.settings),
          activeView: 'aiPlan',
          selectedPayPeriodId: viewedPeriod?.id ?? null,
          conversationHistory: createConversationHistory(messages),
          snapshot,
        }),
      })

      if (!response.ok) {
        throw new Error(await getAssistantErrorMessage(response))
      }

      const assistantResponse = (await response.json()) as AssistantResponse
      appendMessage(createAssistantMessage({ role: 'assistant', ...createVisibleAssistantResponse(assistantResponse) }))
      playAssistantDing()
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
      setIsAsking(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl min-w-0 space-y-6">
      <section
        className={clsx(
          'grid h-[min(620px,calc(100dvh-21rem))] min-h-[420px] max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/[0.94] shadow-[0_26px_80px_rgba(15,23,42,0.12)] backdrop-blur md:h-[min(700px,calc(100vh-9rem))] md:min-h-[520px] md:grid-cols-[230px_minmax(0,1fr)]',
          hasInsightsRail && 'xl:grid-cols-[230px_minmax(0,1fr)_260px]',
        )}
      >
        <ConversationSidebar
          conversations={conversations}
          activeConversationId={activeConversation.id}
          onSelectConversation={selectConversation}
          onCreateConversation={createConversation}
        />

        <div className="flex min-h-0 flex-col">
          <div className="ai-assistant-header p-3 text-white md:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/95 text-xs font-black text-slate-950 shadow-lg shadow-slate-950/20">
                  {profile.avatar}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold md:text-xl">{profile.name}</h2>
                  <p className="mt-1 text-sm text-white/75">Saved money chats with confirmable actions.</p>
                </div>
              </div>
              <Button variant="secondary" onClick={() => setIsCustomizing((current) => !current)}>
                {isCustomizing ? <X size={17} /> : <Settings2 size={17} />}
                Customize
              </Button>
            </div>
          </div>

          {isCustomizing && (
            <div className="grid gap-3 border-b border-slate-200/90 bg-slate-50/80 p-3 md:grid-cols-[1fr_140px]">
              <Field label="Assistant name">
                <TextInput
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                  placeholder="Jimbo"
                />
              </Field>
              <Field label="PFP / initials">
                <TextInput
                  value={profile.avatar}
                  onChange={(event) => setProfile({ ...profile, avatar: event.target.value })}
                  placeholder="J"
                />
              </Field>
            </div>
          )}

          <div
            role="log"
            aria-label={`${profile.name} conversation messages`}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/80 p-3 md:p-4"
          >
            {messages.length === 0 && (
              <AssistantEmptyState
                name={profile.name}
                avatar={profile.avatar}
                onPromptSelect={setDraft}
              />
            )}

            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                avatar={profile.avatar}
                snapshot={snapshot}
                actionStatuses={actionStatuses}
                onConfirmAction={confirmAssistantAction}
                onCancelAction={cancelAssistantAction}
              />
            ))}

            {isAsking && <TypingBubble name={profile.name} avatar={profile.avatar} />}
          </div>

          <form onSubmit={sendMessage} className="border-t border-slate-200/90 bg-white/95 p-3">
            <label htmlFor="ai-plan-chat-input" className="sr-only">
              Message {profile.name}
            </label>
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-2 shadow-inner shadow-slate-200/60 focus-within:border-cyan-400 focus-within:ring-4 focus-within:ring-cyan-100">
              <textarea
                id="ai-plan-chat-input"
                aria-label={`Message ${profile.name}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                placeholder={`Message ${profile.name} about spending, pots, debts, cards...`}
                className="max-h-32 min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-slate-950 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={!draft.trim() || isAsking}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAsking ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              </button>
            </div>
          </form>
        </div>

        {hasInsightsRail && (
          <JimboInsightsRail
            snapshot={snapshot}
            selectedPayPeriod={viewedPeriod}
            proposedActions={proposedActions}
            actionStatuses={actionStatuses}
          />
        )}
      </section>
    </div>
  )
}

function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onCreateConversation,
}: {
  conversations: AssistantConversation[]
  activeConversationId: string
  onSelectConversation: (conversationId: string) => void
  onCreateConversation: () => void
}) {
  return (
    <aside className="flex max-h-28 min-h-0 flex-col border-b border-slate-200/90 bg-slate-950 text-white md:max-h-none md:border-b-0 md:border-r md:border-slate-900">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 md:p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Chats</p>
        <button
          type="button"
          onClick={onCreateConversation}
          className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
        >
          New
        </button>
      </div>
      <div className="flex min-h-0 gap-2 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-y-auto md:overflow-x-hidden">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            aria-label={`Open conversation ${conversation.title}`}
            onClick={() => onSelectConversation(conversation.id)}
            className={clsx(
              'min-w-44 rounded-xl border px-3 py-2 text-left text-sm transition md:min-w-0',
              conversation.id === activeConversationId
                ? 'border-cyan-300/50 bg-white/[0.12] text-white shadow-sm shadow-cyan-950/20'
                : 'border-white/10 bg-white/[0.06] text-slate-300 hover:border-white/20 hover:bg-white/[0.09] hover:text-white',
            )}
          >
            <span className="block truncate font-semibold">{conversation.title}</span>
            <span className={clsx('mt-1 block truncate text-xs', conversation.id === activeConversationId ? 'text-white/65' : 'text-slate-400')}>
              {conversation.messages.length === 0 ? 'Empty chat' : `${conversation.messages.length} messages`}
            </span>
          </button>
        ))}
      </div>
    </aside>
  )
}

const suggestedPrompts = [
  'Can I afford this before payday?',
  'Which bills are due before payday?',
  'Why is my money left low?',
  'What is my payment priority?',
  'How much card cover do I need?',
]

function AssistantEmptyState({
  name,
  avatar,
  onPromptSelect,
}: {
  name: string
  avatar: string
  onPromptSelect: (prompt: string) => void
}) {
  return (
    <article className="flex items-end gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
        {avatar}
      </span>
      <div className="max-w-[88%] rounded-3xl rounded-bl-md border border-slate-200/90 bg-white/95 px-4 py-3 text-sm leading-6 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <p className="font-semibold text-slate-950">{name}</p>
        <p className="mt-1">
          Ask {name} about this pay period, what is due before payday, and where the next pound should go.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPromptSelect(prompt)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}

function TypingBubble({ name, avatar }: { name: string; avatar: string }) {
  return (
    <article className="flex items-end gap-3" aria-label={`${name} is typing`}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
        {avatar}
      </span>
      <div className="rounded-3xl rounded-bl-md border border-slate-200/90 bg-white/95 px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-1">
          <span className="ai-typing-dot" />
          <span className="ai-typing-dot [animation-delay:120ms]" />
          <span className="ai-typing-dot [animation-delay:240ms]" />
        </div>
      </div>
    </article>
  )
}

function MessageBubble({
  message,
  avatar,
  snapshot,
  actionStatuses,
  onConfirmAction,
  onCancelAction,
}: {
  message: AssistantChatMessage
  avatar: string
  snapshot: PlannerSnapshot
  actionStatuses: Record<string, AssistantActionStatus>
  onConfirmAction: (action: AssistantActionProposal) => void
  onCancelAction: (actionId: string) => void
}) {
  const isUser = message.role === 'user'

  return (
    <article className={clsx('flex items-end gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
          {avatar}
        </span>
      )}
      <div
        className={clsx(
          'max-w-[82%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm',
          isUser
            ? 'rounded-br-md bg-slate-950 text-white shadow-[0_14px_34px_rgba(15,23,42,0.16)]'
            : 'rounded-bl-md border border-slate-200/90 bg-white/95 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.06)]',
        )}
      >
        <p className={clsx('whitespace-pre-wrap', isUser ? 'text-white' : 'text-slate-800')}>
          {renderHighlightedMessage(message.answer, isUser)}
        </p>
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

function JimboInsightsRail({
  snapshot,
  selectedPayPeriod,
  proposedActions,
  actionStatuses,
}: {
  snapshot: PlannerSnapshot
  selectedPayPeriod: PayPeriod | null
  proposedActions: AssistantActionProposal[]
  actionStatuses: Record<string, AssistantActionStatus>
}) {
  const summary = selectedPayPeriod
    ? getPayPeriodCostSummary({
        payPeriod: selectedPayPeriod,
        recurringPayments: snapshot.recurringPayments,
        creditCards: snapshot.creditCards,
        customPayments: snapshot.customPayments,
        transactions: snapshot.transactions,
        debts: snapshot.debts,
        creditCardRepayments: snapshot.creditCardRepayments,
        creditCardPots: snapshot.creditCardPots,
        debtReserves: snapshot.debtReserves,
        pots: snapshot.pots,
        potAllocations: snapshot.potAllocations,
        asOfDate: getAppTodayIso(snapshot.settings),
      })
    : null
  const pendingActions = proposedActions.filter((action) => {
    const status = actionStatuses[action.id]

    return !status || status.state === 'pending' || status.state === 'error'
  })

  return (
    <aside
      aria-label="Jimbo insights"
      className="hidden min-h-0 flex-col gap-3 border-l border-slate-200 bg-slate-50/80 p-3 xl:flex"
    >
      {summary && selectedPayPeriod && (
        <section className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm shadow-slate-200/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pay period</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">
            {selectedPayPeriod.startDate} to {selectedPayPeriod.endDate}
          </p>
          <div className="mt-3 grid gap-2">
            <InsightLine label="Income" value={formatPence(summary.payReceivedPence)} />
            <InsightLine label="Planned costs" value={formatPence(summary.totalCostsPence)} />
            <InsightLine
              label="Money left"
              value={formatPence(summary.moneyLeftPence)}
              tone={summary.moneyLeftPence < 0 ? 'warning' : 'good'}
            />
            <InsightLine label="Card cover" value={formatPence(summary.creditCardPotsPence)} />
          </div>
        </section>
      )}

      {pendingActions.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-sm shadow-emerald-100/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Action queue</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">
            {pendingActions.length} confirmable action{pendingActions.length === 1 ? '' : 's'}
          </p>
          <div className="mt-2 space-y-1">
            {pendingActions.slice(0, 3).map((action) => (
              <p key={action.id} className="truncate rounded-lg bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-700">
                {action.label}
              </p>
            ))}
          </div>
        </section>
      )}
    </aside>
  )
}

function InsightLine({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warning'
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span
        className={clsx(
          'text-xs font-semibold',
          tone === 'neutral' && 'text-slate-950',
          tone === 'good' && 'text-emerald-700',
          tone === 'warning' && 'text-amber-700',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function renderHighlightedMessage(text: string, isUser: boolean) {
  const parts = text.split(/([+-]?£\d[\d,]*(?:\.\d{2})?|\b\d+%)/g)

  return parts.map((part, index) => {
    if (!part) {
      return null
    }

    if (/^[+-]?£\d[\d,]*(?:\.\d{2})?$|^\d+%$/.test(part)) {
      return (
        <span
          key={`${part}-${index}`}
          className={clsx(
            'rounded-md px-1 py-0.5 font-semibold',
            isUser ? 'bg-white/10 text-white' : 'bg-emerald-50 text-emerald-800',
          )}
        >
          {part}
        </span>
      )
    }

    return part
  })
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
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-slate-800 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Confirm action</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{action.label}</p>
        </div>
        {status.state === 'done' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
            <CheckCircle2 size={13} />
            Done
          </span>
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
        <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700">
          {status.error ?? validationError}
        </p>
      )}
      {!isTerminal && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={Boolean(validationError) || isRunning}
            className="inline-flex min-h-9 items-center justify-center rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isRunning}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200/90 bg-white/90 px-3 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-200/60 transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function createUnavailableResponse(
  answer: string,
  reason: string,
  action = 'Check Settings, confirm you are signed in, and verify the selected AI provider has a working server key.',
): AssistantResponse {
  return {
    answer: `${answer}\n\n${reason}\n\nWhat I'd do next: ${action}`,
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

  if (/what i'd do next|what to do next|next steps?|my advice|i recommend/i.test(trimmedAnswer)) {
    return trimmedAnswer
  }

  const nextStep = actions.find((action) => action.trim())?.trim()

  if (!nextStep) {
    return `${trimmedAnswer}\n\nWhat I'd do next: ask me a follow-up and I'll help you decide the best move from the current planner data.`
  }

  return `${trimmedAnswer}\n\nWhat I'd do next: ${nextStep}`
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

    return parts.join(' - ')
  } catch {
    return `Assistant helper request failed with ${response.status}`
  }
}

function playAssistantDing(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const audioContext = new AudioContext()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(1320, audioContext.currentTime + 0.08)
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.045, audioContext.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.18)
    window.setTimeout(() => void audioContext.close(), 260)
  } catch {
    // Sound is optional; browsers may block it outside direct user gestures.
  }
}
