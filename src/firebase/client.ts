import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, OAuthProvider, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: getFirebaseAuthDomain(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean)
export const isAppleAuthEnabled = import.meta.env.VITE_ENABLE_APPLE_AUTH === 'true'

const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? getApps()[0] ?? initializeApp(firebaseConfig)
  : null

export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null
export const firebaseDb: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null

export const googleAuthProvider = new GoogleAuthProvider()
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
})

export const appleAuthProvider = new OAuthProvider('apple.com')
appleAuthProvider.addScope('email')
appleAuthProvider.addScope('name')

interface AuthLocation {
  hostname: string
  host: string
}

export function getFirebaseAuthDomain(configuredAuthDomain: string | undefined, location: AuthLocation | null = getRuntimeLocation()) {
  if (location?.hostname === 'money.scriptai.space') {
    return location.host
  }

  return configuredAuthDomain
}

function getRuntimeLocation(): AuthLocation | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.location
}
