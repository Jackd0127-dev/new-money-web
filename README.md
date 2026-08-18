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
OPENROUTER_API_KEY=
FIREBASE_SERVICE_ACCOUNT_JSON=
```

The app still works without Firebase config. In that mode, data remains in this browser through IndexedDB.
AI features only work on Vercel when `FIREBASE_SERVICE_ACCOUNT_JSON` and at least one provider key, `GEMINI_API_KEY` or `OPENROUTER_API_KEY`, are set as server-side environment variables.

## Firebase Setup

Required services:

- Firebase Authentication with Email/Password and Google providers enabled.
- Cloud Firestore in production mode.
- Firestore rules that limit each user to their own document tree. The checked-in rules live in `firestore.rules`:

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

Deploy them after changing production Firebase rules:

```bash
firebase deploy --only firestore:rules
```

Apple sign-in is implemented in code but stays disabled until the Firebase Apple provider is configured with an Apple Developer Services ID, Team ID, Key ID, and private key. Set `VITE_ENABLE_APPLE_AUTH=true` after the provider is fully enabled.

## Gemini Daily Brief

The app calls `/api/daily-brief` after Firebase sync is up to date for a signed-in user. The browser sends the Firebase ID token, the Vercel function verifies it with Firebase Admin, then Gemini generates one daily run-through from the planner snapshot. The Gemini key is never exposed to the client bundle.

## Production Security

Vercel serves security headers from `vercel.json`, including CSP, frame blocking, referrer policy, permission policy, and no-store caching for API responses. Account deletion runs through `/api/account`, verifies the Firebase ID token server-side, requires a recent sign-in, deletes the user's Firestore document tree, then deletes the Firebase Auth user.

## Checks

```bash
npm run check
npm run test:backend
npm run test:ui
npm run test
npm run lint
npm run build
```

Backend/domain behavior is locked for UI-focused work. Read `docs/BACKEND_LOCK.md` before changing calculation, storage, Firebase sync, authentication, API, or model files. The current code layout is documented in `docs/PROJECT_STRUCTURE.md`.

## Deployment

Production is linked to Vercel as `new-money` and served from:

- https://money.scriptai.space

The project also keeps Firebase Hosting configuration because its default domain can be useful for Firebase Auth allow-listing:

```bash
npm run build
```

Install the Vercel CLI when you need local deploy, logs, or env workflows:

```bash
npm i -g vercel
vercel deploy --prod
```
