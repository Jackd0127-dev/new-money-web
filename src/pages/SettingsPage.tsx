import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

import { formatPence, parsePoundsToPence } from '../domain/money'
import { CloudSyncPanel } from '../components/CloudSyncPanel'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import type { CloudSyncController } from '../hooks/useCloudSync'
import type { FirebaseAuthController } from '../hooks/useFirebaseAuth'
import { Button, Field, MoneyMetric, Panel, SelectInput, TextArea, TextInput } from '../components/ui'
import type { AiProvider, PayFrequency } from '../types/models'

export function SettingsPage({
  snapshot,
  actions,
  auth,
  sync,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
  auth?: FirebaseAuthController
  sync?: CloudSyncController
}) {
  const [hourlyRate, setHourlyRate] = useState((snapshot.settings.hourlyRatePence / 100).toFixed(2))
  const [defaultHoursWorked, setDefaultHoursWorked] = useState(String(snapshot.settings.defaultHoursWorked))
  const [payFrequency, setPayFrequency] = useState<PayFrequency>(snapshot.settings.payFrequency)
  const [aiInstructions, setAiInstructions] = useState(snapshot.settings.aiInstructions)
  const [aiProvider, setAiProvider] = useState<AiProvider>(snapshot.settings.aiProvider)
  const [saved, setSaved] = useState(false)
  const totalPotBalancePence = snapshot.pots.reduce((total, pot) => total + pot.balancePence, 0)
  const archivedPotCount = snapshot.pots.filter((pot) => pot.archived).length
  const activeRecurringCount = snapshot.recurringPayments.filter((payment) => payment.active).length

  async function saveSettings() {
    await actions.updateSettings({
      defaultHoursWorked: Number.parseFloat(defaultHoursWorked) || 0,
      hourlyRatePence: parsePoundsToPence(hourlyRate),
      payFrequency,
      aiInstructions: aiInstructions.trim(),
      aiProvider,
    })
    setSaved(true)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <Panel title="Pay defaults" description="These defaults speed up each payday plan.">
        <div className="space-y-4">
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
          <Field
            label="AI provider"
            hint="Gemini stays as the default. OpenRouter uses openai/gpt-oss-120b:free on the server."
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
              <option value="openrouter">OpenRouter gpt-oss-120b</option>
            </SelectInput>
          </Field>
          <Field
            label="Custom AI instructions"
            hint="Used for tone and preferences only. The app still owns all money calculations."
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

      {auth && sync && <CloudSyncPanel auth={auth} sync={sync} />}

      <Panel title="Planner data" description="Signed-in data syncs automatically with Firebase in the background.">
        <div className="grid gap-4 md:grid-cols-3">
          <MoneyMetric
            label="Pots"
            value={String(snapshot.pots.length)}
            breakdown={{
              formula: 'Pots = active pots + archived pots.',
              lines: [
                { label: 'Active pots', value: String(snapshot.pots.length - archivedPotCount), tone: 'add' },
                { label: 'Archived pots', value: String(archivedPotCount), tone: 'muted' },
                { label: 'Pots', value: String(snapshot.pots.length), tone: 'result' },
              ],
            }}
          />
          <MoneyMetric
            label="Recurring"
            value={String(snapshot.recurringPayments.length)}
            breakdown={{
              formula: 'Recurring = active recurring payments + paused recurring payments.',
              lines: [
                { label: 'Active recurring', value: String(activeRecurringCount), tone: 'add' },
                {
                  label: 'Paused recurring',
                  value: String(snapshot.recurringPayments.length - activeRecurringCount),
                  tone: 'muted',
                },
                { label: 'Recurring', value: String(snapshot.recurringPayments.length), tone: 'result' },
              ],
            }}
          />
          <MoneyMetric
            label="Total pot balance"
            value={formatPence(totalPotBalancePence)}
            breakdown={{
              formula: 'Total pot balance = the saved balance of every pot.',
              lines:
                snapshot.pots.length > 0
                  ? [
                      ...snapshot.pots.map((pot) => ({
                        label: pot.name,
                        value: formatPence(pot.balancePence),
                        detail: pot.archived ? 'Archived pot' : `${pot.type} pot`,
                        tone: pot.balancePence >= 0 ? ('add' as const) : ('subtract' as const),
                      })),
                      {
                        label: 'Total pot balance',
                        value: formatPence(totalPotBalancePence),
                        tone: 'result' as const,
                      },
                    ]
                  : [{ label: 'No pots', value: formatPence(0), tone: 'result' }],
            }}
          />
        </div>
      </Panel>
    </div>
  )
}
