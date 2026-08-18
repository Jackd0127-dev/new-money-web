import { useState } from 'react'
import {
  Apple,
  CalendarDays,
  CheckCircle2,
  KeyRound,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react'

import { getAppTodayIso, parsePoundsToPence } from '../domain/money'
import type { CloudSyncController } from '../hooks/useCloudSync'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import type { FirebaseAuthController } from '../hooks/useFirebaseAuth'
import { Button, Field, Panel, SectionGrid, SelectInput, TextArea, TextInput } from '../components/ui'
import type { AiProvider, AppDateMode, PayFrequency } from '../types/models'

export function SettingsPage({
  snapshot,
  actions,
  auth,
  cloudSync,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
  auth?: FirebaseAuthController
  cloudSync?: Pick<CloudSyncController, 'saveNow'>
}) {
  const [hourlyRate, setHourlyRate] = useState((snapshot.settings.hourlyRatePence / 100).toFixed(2))
  const [defaultHoursWorked, setDefaultHoursWorked] = useState(String(snapshot.settings.defaultHoursWorked))
  const [payFrequency, setPayFrequency] = useState<PayFrequency>(snapshot.settings.payFrequency)
  const [appDateMode, setAppDateMode] = useState<AppDateMode>(snapshot.settings.appDateMode)
  const [manualTodayIso, setManualTodayIso] = useState(snapshot.settings.manualTodayIso ?? getAppTodayIso(snapshot.settings))
  const [aiInstructions, setAiInstructions] = useState(snapshot.settings.aiInstructions)
  const [aiProvider, setAiProvider] = useState<AiProvider>(snapshot.settings.aiProvider)
  const [saved, setSaved] = useState(false)
  const [updatingPlanner, setUpdatingPlanner] = useState(false)
  const [plannerUpdated, setPlannerUpdated] = useState(false)

  async function saveSettings() {
    await actions.updateSettings({
      defaultHoursWorked: Number.parseFloat(defaultHoursWorked) || 0,
      hourlyRatePence: parsePoundsToPence(hourlyRate),
      payFrequency,
      appDateMode,
      manualTodayIso: appDateMode === 'manual' ? manualTodayIso : null,
      aiInstructions: aiInstructions.trim(),
      aiProvider,
    })
    setSaved(true)
  }

  async function updatePlannerData() {
    setPlannerUpdated(false)
    setUpdatingPlanner(true)

    try {
      await actions.updatePlannerDataToLatest()
      setPlannerUpdated(true)
    } finally {
      setUpdatingPlanner(false)
    }
  }

  function updateManualTodayIso(value: string) {
    setManualTodayIso(value)
    setSaved(false)
  }

  return (
    <div className="min-w-0 space-y-6">
      <SectionGrid variant="wideLeft">
        <Panel title="Pay defaults" description="Default pay details and Jimbo preferences." accent="slate" density="compact">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <TextInput value={snapshot.settings.currency} disabled />
              </Field>
              <Field label="Hourly rate">
                <TextInput
                  inputMode="decimal"
                  value={hourlyRate}
                  onChange={(event) => {
                    setHourlyRate(event.target.value)
                    setSaved(false)
                  }}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default hours worked">
                <TextInput
                  inputMode="decimal"
                  value={defaultHoursWorked}
                  onChange={(event) => {
                    setDefaultHoursWorked(event.target.value)
                    setSaved(false)
                  }}
                />
              </Field>
              <Field label="Pay frequency">
                <SelectInput
                  value={payFrequency}
                  onChange={(event) => {
                    setPayFrequency(event.target.value as PayFrequency)
                    setSaved(false)
                  }}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom</option>
                </SelectInput>
              </Field>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 shrink-0 text-slate-500" size={18} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">App date</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Use automatic dates day to day. Switch to manual when checking a future pay period.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="App date mode">
                      <SelectInput
                        aria-label="App date mode"
                        value={appDateMode}
                        onChange={(event) => {
                          setAppDateMode(event.target.value as AppDateMode)
                          setSaved(false)
                        }}
                      >
                        <option value="automatic">Automatic date</option>
                        <option value="manual">Manual date</option>
                      </SelectInput>
                    </Field>
                    <Field label="Manual app date">
                      <TextInput
                        aria-label="Manual app date"
                        type="date"
                        value={manualTodayIso}
                        disabled={appDateMode !== 'manual'}
                        onInput={(event) => updateManualTodayIso(event.currentTarget.value)}
                        onChange={(event) => updateManualTodayIso(event.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </div>
            <Field
              label="AI provider"
              hint="Used for Jimbo replies."
            >
              <SelectInput
                aria-label="AI provider"
                value={aiProvider}
                onChange={(event) => {
                  setAiProvider(event.target.value as AiProvider)
                  setSaved(false)
                }}
              >
                <option value="gemini">Gemini</option>
                <option value="openrouter">GPT</option>
              </SelectInput>
            </Field>
            <Field
              label="Custom AI instructions"
              hint="Tone and preference notes for Jimbo."
            >
              <TextArea
                aria-label="Custom AI instructions"
                value={aiInstructions}
                onChange={(event) => {
                  setAiInstructions(event.target.value)
                  setSaved(false)
                }}
                placeholder="Example: be direct, prioritise debts due soon, keep answers short."
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={saveSettings} disabled={saved}>
                Save settings
              </Button>
              {saved && (
                <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 size={18} />
                  Settings saved
                </span>
              )}
            </div>
          </div>
        </Panel>

        <AccountPanel auth={auth} cloudSync={cloudSync} />
      </SectionGrid>

      <Panel title="Update" description="Apply the latest planner updates." accent="slate" density="compact">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                <RefreshCw size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">Bring this account up to date</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Checks saved planner data and applies any available updates.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <Button onClick={updatePlannerData} disabled={updatingPlanner}>
              <RefreshCw size={16} aria-hidden="true" className={updatingPlanner ? 'animate-spin' : undefined} />
              {updatingPlanner ? 'Updating' : 'Update'}
            </Button>
            {plannerUpdated && (
              <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 size={18} />
                Planner updated
              </span>
            )}
          </div>
        </div>
      </Panel>
    </div>
  )
}

function AccountPanel({
  auth,
  cloudSync,
}: {
  auth?: FirebaseAuthController
  cloudSync?: Pick<CloudSyncController, 'saveNow'>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accountMessage, setAccountMessage] = useState<string | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [busyAccountAction, setBusyAccountAction] = useState<'password' | 'delete' | 'logout' | null>(null)

  async function signInWithEmail() {
    setAccountMessage(null)
    setAccountError(null)
    await auth?.signInWithEmail(email, password)
  }

  async function createEmailAccount() {
    setAccountMessage(null)
    setAccountError(null)
    await auth?.createEmailAccount(email, password)
  }

  async function changePassword() {
    const resetEmail = auth?.user?.email

    if (!auth || !resetEmail) {
      return
    }

    setAccountMessage(null)
    setAccountError(null)
    setBusyAccountAction('password')

    const resetSent = await auth.sendPasswordResetEmail(resetEmail)

    if (resetSent) {
      setAccountMessage(`Password reset email sent to ${resetEmail}.`)
    }

    setBusyAccountAction(null)
  }

  async function deleteAccount() {
    if (!auth?.user) {
      return
    }

    const confirmed = window.confirm(
      `Delete ${accountIdentifier}? This cannot be undone. Local app data on this device will stay available.`,
    )

    if (!confirmed) {
      return
    }

    setAccountMessage(null)
    setAccountError(null)
    setBusyAccountAction('delete')

    const deleted = await auth.deleteAccount()

    if (deleted) {
      setAccountMessage('Account deleted. Local app data remains on this device.')
    }

    setBusyAccountAction(null)
  }

  async function logOut() {
    if (!auth?.user) {
      return
    }

    const confirmed = window.confirm('Log out on this device?')

    if (!confirmed) {
      return
    }

    setAccountMessage(null)
    setAccountError(null)
    setBusyAccountAction('logout')

    const saved = cloudSync ? await cloudSync.saveNow() : true

    if (!saved) {
      setAccountError('Could not save your latest account data. Stay signed in and try again.')
      setBusyAccountAction(null)
      return
    }

    const signedOut = await auth.signOut()

    if (!signedOut) {
      setBusyAccountAction(null)
      return
    }

    setBusyAccountAction(null)
  }

  const accountIdentifier = auth?.user?.email ?? auth?.user?.uid ?? (auth ? 'Not signed in' : 'Local planner')
  const providerLabel = getAuthProviderLabel(auth)
  const canUseAuth = Boolean(auth?.isConfigured)
  const isSignedIn = Boolean(auth?.user)
  const passwordResetEmail = auth?.user?.email ?? ''
  const canChangePassword = Boolean(isSignedIn && passwordResetEmail && hasPasswordProvider(auth?.user ?? null))

  return (
    <Panel title="Account" description="Sign-in, password, and account access." accent="slate" density="compact">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <AccountFact label="Account" value={accountIdentifier} />
          <AccountFact label="Sign-in provider" value={providerLabel} />
        </div>

        {auth?.isLoading && (
          <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3 text-sm text-slate-600">
            Checking account status.
          </div>
        )}

        {!canUseAuth && (
          <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3 text-sm leading-5 text-slate-600">
            Sign-in is not configured for this build.
          </div>
        )}

        {auth && canUseAuth && !auth.isLoading && !auth.user && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={auth.signInWithGoogle}>
                <Mail size={18} />
                Continue with Google
              </Button>
              <Button variant="secondary" disabled={!auth.isAppleEnabled} onClick={auth.signInWithApple}>
                <Apple size={18} />
                Continue with Apple
              </Button>
            </div>

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
          </div>
        )}

        {auth?.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-700">
            {auth.error}
          </div>
        )}

        {accountError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-700">
            {accountError}
          </div>
        )}

        {accountMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-5 text-emerald-800">
            <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
            <p>{accountMessage}</p>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          <Button
            variant="secondary"
            disabled={!canChangePassword || busyAccountAction !== null}
            onClick={() => void changePassword()}
            title={getChangePasswordTitle(isSignedIn, passwordResetEmail, canChangePassword)}
          >
            <KeyRound size={18} />
            {busyAccountAction === 'password' ? 'Sending reset' : 'Change password'}
          </Button>
          <Button
            variant="secondary"
            className="border-red-200 text-red-700 shadow-none hover:border-red-300 hover:bg-red-50 focus-visible:outline-[var(--color-danger)]"
            disabled={!isSignedIn || busyAccountAction !== null}
            onClick={() => void deleteAccount()}
          >
            <Trash2 size={18} />
            {busyAccountAction === 'delete' ? 'Deleting account' : 'Delete account'}
          </Button>
          <Button
            variant="secondary"
            disabled={!isSignedIn || busyAccountAction !== null}
            onClick={() => void logOut()}
          >
            <LogOut size={18} />
            {busyAccountAction === 'logout' ? 'Saving and logging out' : 'Log out'}
          </Button>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 p-3 text-xs leading-5 text-slate-500">
          <ShieldAlert className="mt-0.5 shrink-0" size={15} />
          <p>Password reset uses email. Delete removes the sign-in account; your local planner data stays on this device.</p>
        </div>
      </div>
    </Panel>
  )
}

function AccountFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function getAuthProviderLabel(auth?: FirebaseAuthController): string {
  if (!auth?.isConfigured) {
    return 'Not configured'
  }

  const providerId = auth.user?.providerData[0]?.providerId

  if (!providerId) {
    return auth.user ? 'Email/password' : 'Not signed in'
  }

  if (providerId === 'google.com') {
    return 'Google'
  }

  if (providerId === 'apple.com') {
    return 'Apple'
  }

  if (providerId === 'password') {
    return 'Email/password'
  }

  return providerId
}

function hasPasswordProvider(user: FirebaseAuthController['user']): boolean {
  if (!user) {
    return false
  }

  return user.providerData.length === 0 || user.providerData.some((provider) => provider.providerId === 'password')
}

function getChangePasswordTitle(isSignedIn: boolean, email: string, canChangePassword: boolean): string | undefined {
  if (canChangePassword) {
    return undefined
  }

  if (!isSignedIn) {
    return 'Sign in to change your password.'
  }

  if (!email) {
    return 'This account does not have an email address for password reset.'
  }

  return 'Use your sign-in provider to manage this password.'
}
