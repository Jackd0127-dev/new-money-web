import { useState } from 'react'
import {
  Apple,
  CheckCircle2,
  Cloud,
  LogOut,
  Mail,
  RefreshCw,
} from 'lucide-react'

import type { FirebaseAuthController } from '../hooks/useFirebaseAuth'
import type { CloudSyncController, CloudSyncStatus } from '../hooks/useCloudSync'
import { Button, Field, Panel, TextInput } from './ui'

export function CloudSyncPanel({
  auth,
  sync,
}: {
  auth: FirebaseAuthController
  sync: CloudSyncController
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function signInWithEmail() {
    await auth.signInWithEmail(email, password)
  }

  async function createEmailAccount() {
    await auth.createEmailAccount(email, password)
  }

  if (!auth.isConfigured) {
    return (
      <Panel title="Cloud sync" description="Firebase config is missing for this build.">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Add the Firebase environment values, rebuild, and this panel will enable sign-in and Firestore sync.
        </div>
      </Panel>
    )
  }

  if (auth.isLoading) {
    return (
      <Panel title="Cloud sync" description="Checking your sign-in state.">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <RefreshCw className="animate-spin" size={18} />
          Loading Firebase Auth
        </div>
      </Panel>
    )
  }

  if (!auth.user) {
    return (
      <Panel title="Cloud sync" description="Sign in to keep this planner synced across devices.">
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={auth.signInWithGoogle}>
              <Cloud size={18} />
              Continue with Google
            </Button>
            <Button variant="secondary" disabled={!auth.isAppleEnabled} onClick={auth.signInWithApple}>
              <Apple size={18} />
              Continue with Apple
            </Button>
          </div>

          {!auth.isAppleEnabled && (
            <p className="text-xs leading-5 text-slate-500">
              Apple sign-in is ready in code, but Firebase still needs your Apple Developer Services ID, Team ID,
              Key ID, and private key before it can be enabled.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
            <Field label="Email">
              <TextInput
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
              />
            </Field>
            <Field label="Password">
              <TextInput
                autoComplete="current-password"
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="6+ characters"
                type="password"
              />
            </Field>
            <Button className="self-end" onClick={signInWithEmail} disabled={!email || password.length < 6}>
              <Mail size={18} />
              Sign in
            </Button>
            <Button
              className="self-end"
              variant="secondary"
              onClick={createEmailAccount}
              disabled={!email || password.length < 6}
            >
              Create
            </Button>
          </div>

          {auth.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-700">
              {auth.error}
            </div>
          )}
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      title="Cloud sync"
      description="Signed-in planner data syncs with Firestore automatically."
      action={<StatusBadge status={sync.status} />}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">{auth.user.email ?? 'Signed in account'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {sync.cloudUpdatedAtIso ? `Cloud updated ${formatDateTime(sync.cloudUpdatedAtIso)}` : sync.message}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm('Sign out of cloud sync on this device?')) {
                void auth.signOut()
              }
            }}
          >
            <LogOut size={18} />
            Sign out
          </Button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <StatusIcon status={sync.status} />
            <div>
              <p className="text-sm font-semibold text-slate-950">{statusTitle(sync.status)}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{sync.message}</p>
            </div>
          </div>
        </div>

        <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          Changes are checked, uploaded, and downloaded in the background while you are signed in.
        </p>
      </div>
    </Panel>
  )
}

function StatusBadge({ status }: { status: CloudSyncStatus }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
      <StatusIcon status={status} size={14} />
      {statusLabel(status)}
    </span>
  )
}

function StatusIcon({ status, size = 18 }: { status: CloudSyncStatus; size?: number }) {
  if (status === 'synced') {
    return <CheckCircle2 className="text-emerald-600" size={size} />
  }

  if (status === 'checking' || status === 'syncing') {
    return <RefreshCw className="animate-spin text-slate-500" size={size} />
  }

  return <Cloud className="text-slate-500" size={size} />
}

function statusLabel(status: CloudSyncStatus): string {
  const labels: Record<CloudSyncStatus, string> = {
    disabled: 'Disabled',
    'signed-out': 'Signed out',
    checking: 'Checking',
    'choice-needed': 'Choose source',
    syncing: 'Syncing',
    synced: 'Synced',
    error: 'Needs attention',
  }

  return labels[status]
}

function statusTitle(status: CloudSyncStatus): string {
  if (status === 'choice-needed') {
    return 'Choose which data to keep'
  }

  if (status === 'error') {
    return 'Sync needs attention'
  }

  return statusLabel(status)
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
