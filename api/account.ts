import { getAuth, type DecodedIdToken } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

import { getBearerToken, getSafeErrorName, initializeFirebaseAdmin, isRecentAuthTime } from '../server/firebaseAdmin.js'
import {
  isRequestBodyTooLarge,
  MAX_ACCOUNT_REQUEST_BODY_BYTES,
  setSecureApiHeaders,
} from '../server/apiSecurity.js'

const RECENT_LOGIN_MAX_AGE_SECONDS = 5 * 60

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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setSecureApiHeaders(res)

  if (req.method !== 'DELETE') {
    res.setHeader?.('Allow', 'DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (isRequestBodyTooLarge(req.body, MAX_ACCOUNT_REQUEST_BODY_BYTES)) {
    return res.status(413).json({ error: 'Request body is too large.' })
  }

  const idToken = getBearerToken(req.headers.authorization)

  if (!idToken) {
    return res.status(401).json({ error: 'Missing Firebase ID token' })
  }

  let decodedToken: DecodedIdToken

  try {
    initializeFirebaseAdmin()
    decodedToken = await getAuth().verifyIdToken(idToken, true)
  } catch (error) {
    console.error('Account access verification failed', { reason: getSafeErrorName(error) })
    return res.status(401).json({ error: 'Unable to verify account access.' })
  }

  if (!isRecentAuthTime(decodedToken.auth_time, RECENT_LOGIN_MAX_AGE_SECONDS)) {
    return res.status(403).json({
      error: 'For security, sign out and sign back in, then try again.',
    })
  }

  try {
    const firestore = getFirestore()

    await firestore.recursiveDelete(firestore.doc(`users/${decodedToken.uid}`))
    await getAuth().deleteUser(decodedToken.uid)

    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Account deletion failed', { reason: getSafeErrorName(error) })
    return res.status(500).json({ error: 'Unable to delete account.' })
  }
}
