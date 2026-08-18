# New Money

Private, local-first paycheck planner built with React, TypeScript, Vite, Dexie, Firebase Auth, and Firestore.

## Local Development

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example` when Firebase sign-in and sync should be enabled:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_ENABLE_APPLE_AUTH=false
GEMINI_API_KEY=
FIREBASE_SERVICE_ACCOUNT_JSON=
```

The app still works without Firebase config. In that mode, data remains in this browser through IndexedDB.
Gemini daily run-throughs only work on Vercel when `GEMINI_API_KEY` and `FIREBASE_SERVICE_ACCOUNT_JSON` are set as server-side environment variables.

## Firebase Setup

Required services:

- Firebase Authentication with Email/Password and Google providers enabled.
- Cloud Firestore in production mode.
- Firestore rules that limit each user to their own document tree:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Apple sign-in is implemented in code but stays disabled until the Firebase Apple provider is configured with an Apple Developer Services ID, Team ID, Key ID, and private key. Set `VITE_ENABLE_APPLE_AUTH=true` after the provider is fully enabled.

## Gemini Daily Brief

The app calls `/api/daily-brief` after Firebase sync is up to date for a signed-in user. The browser sends the Firebase ID token, the Vercel function verifies it with Firebase Admin, then Gemini generates one daily run-through from the planner snapshot. The Gemini key is never exposed to the client bundle.

## Checks

```bash
npm run test
npm run lint
npm run build
```

## Deployment

GitHub Pages is still configured for the existing `/new-money/` link. Firebase Hosting is also configured because its default domain is automatically authorised for Firebase Auth:

```bash
npm run build
npx firebase-tools deploy --only hosting
```
