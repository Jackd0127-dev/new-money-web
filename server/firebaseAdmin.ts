import { cert, getApps, initializeApp } from 'firebase-admin/app'

export function initializeFirebaseAdmin(): void {
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

export function getBearerToken(value: string | string[] | undefined): string | null {
  const header = Array.isArray(value) ? value[0] : value

  if (!header?.startsWith('Bearer ')) {
    return null
  }

  return header.slice('Bearer '.length).trim() || null
}

export function getSafeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}

export function isRecentAuthTime(authTimeSeconds: unknown, maxAgeSeconds: number): boolean {
  if (typeof authTimeSeconds !== 'number' || !Number.isFinite(authTimeSeconds)) {
    return false
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  return nowSeconds - authTimeSeconds <= maxAgeSeconds
}
