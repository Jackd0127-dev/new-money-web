import { useEffect, useState } from 'react'

import type { AssistantActionProposal, AssistantActionStatus } from '../domain/assistantActions'

export interface AssistantConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantResponse {
  answer: string
  highlights: string[]
  actions: string[]
  confidence: 'high' | 'medium' | 'low'
  proposedActions?: AssistantActionProposal[]
}

export interface AssistantChatMessage extends AssistantResponse {
  id: string
  role: 'user' | 'assistant'
}

export interface AssistantConversation {
  id: string
  title: string
  messages: AssistantChatMessage[]
  actionStatuses: Record<string, AssistantActionStatus>
  createdAt: string
  updatedAt: string
}

interface AssistantConversationStore {
  conversations: AssistantConversation[]
  activeConversationId: string
}

const assistantConversationStorageKey = 'new-money.assistant-conversations.v1'
const maxSavedConversations = 20
const maxMessagesPerConversation = 60

export function useAssistantConversations() {
  const [store, setStore] = useState<AssistantConversationStore>(() => readAssistantConversationStore())

  useEffect(() => {
    function handleStorageEvent(event: StorageEvent) {
      if (event.key === assistantConversationStorageKey) {
        setStore(readAssistantConversationStore())
      }
    }

    window.addEventListener('storage', handleStorageEvent)

    return () => {
      window.removeEventListener('storage', handleStorageEvent)
    }
  }, [])

  const activeConversation =
    store.conversations.find((conversation) => conversation.id === store.activeConversationId) ??
    store.conversations[0]

  function commitStore(updater: (current: AssistantConversationStore) => AssistantConversationStore) {
    setStore((current) => {
      const next = cleanAssistantConversationStore(updater(current))

      writeAssistantConversationStore(next)

      return next
    })
  }

  function selectConversation(conversationId: string) {
    commitStore((current) => ({
      ...current,
      activeConversationId: conversationId,
    }))
  }

  function createConversation() {
    const conversation = createEmptyConversation()

    commitStore((current) => ({
      activeConversationId: conversation.id,
      conversations: [conversation, ...current.conversations],
    }))
  }

  function appendMessage(message: AssistantChatMessage) {
    updateActiveConversation((conversation) => {
      const messages = [...conversation.messages, message].slice(-maxMessagesPerConversation)

      return {
        ...conversation,
        messages,
        title: getConversationTitle(messages),
      }
    })
  }

  function setActionStatuses(updater: (current: Record<string, AssistantActionStatus>) => Record<string, AssistantActionStatus>) {
    updateActiveConversation((conversation) => ({
      ...conversation,
      actionStatuses: updater(conversation.actionStatuses),
    }))
  }

  function updateActiveConversation(updater: (conversation: AssistantConversation) => AssistantConversation) {
    commitStore((current) => {
      const updatedAt = new Date().toISOString()
      const conversations = current.conversations.map((conversation) => {
        if (conversation.id !== current.activeConversationId) {
          return conversation
        }

        return {
          ...updater(conversation),
          updatedAt,
        }
      })

      return {
        ...current,
        conversations,
      }
    })
  }

  return {
    conversations: store.conversations,
    activeConversation,
    messages: activeConversation.messages,
    actionStatuses: activeConversation.actionStatuses,
    appendMessage,
    setActionStatuses,
    selectConversation,
    createConversation,
  }
}

export function createAssistantMessage(input: Omit<AssistantChatMessage, 'id'>): AssistantChatMessage {
  return {
    ...input,
    id: createAssistantConversationId(),
  }
}

export function createConversationHistory(messages: AssistantChatMessage[]): AssistantConversationMessage[] {
  return messages
    .filter((message) => message.answer.trim())
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: truncateConversationText(message.answer),
    }))
}

function readAssistantConversationStore(): AssistantConversationStore {
  if (typeof window === 'undefined') {
    return createDefaultConversationStore()
  }

  try {
    const stored = window.localStorage.getItem(assistantConversationStorageKey)

    if (!stored) {
      return createDefaultConversationStore()
    }

    const parsed = JSON.parse(stored) as unknown

    if (!isAssistantConversationStore(parsed)) {
      return createDefaultConversationStore()
    }

    return cleanAssistantConversationStore(parsed)
  } catch {
    return createDefaultConversationStore()
  }
}

function writeAssistantConversationStore(store: AssistantConversationStore): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(assistantConversationStorageKey, JSON.stringify(store))
  } catch {
    // The active chat still works in memory if local storage is unavailable.
  }
}

function createDefaultConversationStore(): AssistantConversationStore {
  const conversation = createEmptyConversation()

  return {
    conversations: [conversation],
    activeConversationId: conversation.id,
  }
}

function createEmptyConversation(): AssistantConversation {
  const now = new Date().toISOString()

  return {
    id: createAssistantConversationId(),
    title: 'New chat',
    messages: [],
    actionStatuses: {},
    createdAt: now,
    updatedAt: now,
  }
}

function cleanAssistantConversationStore(store: AssistantConversationStore): AssistantConversationStore {
  const conversations = store.conversations
    .filter(isAssistantConversation)
    .map(cleanAssistantConversation)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, maxSavedConversations)

  if (conversations.length === 0) {
    return createDefaultConversationStore()
  }

  const activeConversationId = conversations.some((conversation) => conversation.id === store.activeConversationId)
    ? store.activeConversationId
    : conversations[0].id

  return {
    conversations,
    activeConversationId,
  }
}

function cleanAssistantConversation(conversation: AssistantConversation): AssistantConversation {
  const messages = conversation.messages.filter(isAssistantChatMessage).slice(-maxMessagesPerConversation)

  return {
    id: conversation.id,
    title: getConversationTitle(messages, conversation.title),
    messages,
    actionStatuses: cleanActionStatuses(conversation.actionStatuses),
    createdAt: isIsoDateText(conversation.createdAt) ? conversation.createdAt : new Date().toISOString(),
    updatedAt: isIsoDateText(conversation.updatedAt) ? conversation.updatedAt : new Date().toISOString(),
  }
}

function cleanActionStatuses(statuses: Record<string, AssistantActionStatus>): Record<string, AssistantActionStatus> {
  return Object.fromEntries(
    Object.entries(statuses).filter(([, status]) =>
      status.state === 'pending' ||
      status.state === 'running' ||
      status.state === 'done' ||
      status.state === 'error' ||
      status.state === 'cancelled',
    ),
  )
}

function isAssistantConversationStore(value: unknown): value is AssistantConversationStore {
  if (!value || typeof value !== 'object') {
    return false
  }

  const store = value as Record<string, unknown>

  return Array.isArray(store.conversations) && typeof store.activeConversationId === 'string'
}

function isAssistantConversation(value: unknown): value is AssistantConversation {
  if (!value || typeof value !== 'object') {
    return false
  }

  const conversation = value as Record<string, unknown>

  return (
    typeof conversation.id === 'string' &&
    typeof conversation.title === 'string' &&
    Array.isArray(conversation.messages) &&
    typeof conversation.actionStatuses === 'object' &&
    typeof conversation.createdAt === 'string' &&
    typeof conversation.updatedAt === 'string'
  )
}

function isAssistantChatMessage(value: unknown): value is AssistantChatMessage {
  if (!value || typeof value !== 'object') {
    return false
  }

  const message = value as Record<string, unknown>

  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.answer === 'string' &&
    Array.isArray(message.highlights) &&
    Array.isArray(message.actions) &&
    (message.confidence === 'high' || message.confidence === 'medium' || message.confidence === 'low')
  )
}

function isIsoDateText(value: string): boolean {
  return !Number.isNaN(Date.parse(value))
}

function getConversationTitle(messages: AssistantChatMessage[], fallback = 'New chat'): string {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.answer.trim()
  const title = firstUserMessage || fallback

  return title.replace(/\s+/g, ' ').slice(0, 42) || 'New chat'
}

function truncateConversationText(value: string): string {
  const trimmed = value.trim()
  const maxLength = 1_500

  if (trimmed.length <= maxLength) {
    return trimmed
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}...`
}

function createAssistantConversationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
