import { useEffect, useState } from 'react'

export interface AssistantProfile {
  name: string
  avatar: string
}

const assistantProfileStorageKey = 'new-money.assistant-profile.v1'
const assistantProfileEventName = 'new-money.assistant-profile.updated'
const defaultAssistantProfile: AssistantProfile = {
  name: 'Jimbo',
  avatar: 'J',
}

export function useAssistantProfile() {
  const [profile, setProfileState] = useState<AssistantProfile>(() => readAssistantProfile())

  useEffect(() => {
    function handleProfileEvent(event: Event) {
      if (event instanceof CustomEvent && isAssistantProfile(event.detail)) {
        setProfileState(cleanAssistantProfile(event.detail))
      }
    }

    function handleStorageEvent(event: StorageEvent) {
      if (event.key === assistantProfileStorageKey) {
        setProfileState(readAssistantProfile())
      }
    }

    window.addEventListener(assistantProfileEventName, handleProfileEvent)
    window.addEventListener('storage', handleStorageEvent)

    return () => {
      window.removeEventListener(assistantProfileEventName, handleProfileEvent)
      window.removeEventListener('storage', handleStorageEvent)
    }
  }, [])

  function setProfile(nextProfile: AssistantProfile) {
    const next = cleanAssistantProfile(nextProfile)

    setProfileState(next)
    writeAssistantProfile(next)

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(assistantProfileEventName, { detail: next }))
    }
  }

  return { profile, setProfile }
}

function readAssistantProfile(): AssistantProfile {
  if (typeof window === 'undefined') {
    return defaultAssistantProfile
  }

  try {
    const stored = window.localStorage.getItem(assistantProfileStorageKey)

    if (!stored) {
      return defaultAssistantProfile
    }

    const parsed = JSON.parse(stored) as unknown

    if (!isAssistantProfile(parsed)) {
      return defaultAssistantProfile
    }

    return cleanAssistantProfile(parsed)
  } catch {
    return defaultAssistantProfile
  }
}

function writeAssistantProfile(profile: AssistantProfile): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(assistantProfileStorageKey, JSON.stringify(profile))
  } catch {
    // The assistant keeps the updated profile in memory if local storage is unavailable.
  }
}

function isAssistantProfile(value: unknown): value is AssistantProfile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const profile = value as Record<string, unknown>

  return typeof profile.name === 'string' && typeof profile.avatar === 'string'
}

function cleanAssistantProfile(profile: AssistantProfile): AssistantProfile {
  const name = profile.name.trim().replace(/\s+/g, ' ').slice(0, 24) || defaultAssistantProfile.name
  const avatarText = Array.from(profile.avatar.trim()).slice(0, 4).join('') || defaultAssistantProfile.avatar

  return {
    name,
    avatar: avatarText,
  }
}
