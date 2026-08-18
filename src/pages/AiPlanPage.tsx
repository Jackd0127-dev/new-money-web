import { useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, Send, Sparkles } from 'lucide-react'

import { getDebtReservePlans, type DebtReservePlan } from '../domain/debtPlanner'
import { formatPence, toIsoDate } from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import { Button, CalculationDetails, MoneyMetric, Panel, TextArea } from '../components/ui'
import type { DebtReserve, PayPeriod } from '../types/models'

type AiPlanUser = {
  getIdToken: () => Promise<string>
} | null

interface AiPlannerResponse {
  answer: string
  risks: string[]
  actions: string[]
  confidence: 'high' | 'medium' | 'low'
}

export function AiPlanPage({
  snapshot,
  actions,
  selectedPayPeriod,
  user,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
  selectedPayPeriod?: PayPeriod | null
  user: AiPlanUser
}) {
  const [question, setQuestion] = useState('')
  const [assistantResponse, setAssistantResponse] = useState<AiPlannerResponse | null>(null)
  const [assistantError, setAssistantError] = useState<string | null>(null)
  const [isAsking, setIsAsking] = useState(false)
  const viewedPeriod = selectedPayPeriod ?? null
  const plans = useMemo(
    () =>
      getDebtReservePlans({
        allDebts: snapshot.debts,
        selectedPayPeriod: viewedPeriod,
        settings: snapshot.settings,
        payPeriods: snapshot.payPeriods,
        recurringPayments: snapshot.recurringPayments,
        customPayments: snapshot.customPayments,
        transactions: snapshot.transactions,
        creditCardRepayments: snapshot.creditCardRepayments,
        debtReserves: snapshot.debtReserves,
      }),
    [snapshot, viewedPeriod],
  )
  const activePlanCount = plans.filter((plan) => plan.remainingDebtPence > 0).length
  const totalRecommendedPence = plans.reduce((total, plan) => total + plan.recommendedAmountPence, 0)
  const totalShortfallPence = plans.reduce((total, plan) => total + plan.shortfallPence, 0)

  async function askAssistant() {
    if (!question.trim()) {
      return
    }

    if (!user) {
      setAssistantResponse(createLocalAssistantResponse(plans))
      setAssistantError('Sign in from Settings to ask the AI planner. Showing calculated guidance instead.')
      return
    }

    setIsAsking(true)
    setAssistantError(null)

    try {
      const idToken = await user.getIdToken()
      const response = await fetch('/api/ai-planner', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: question.trim(),
          todayIso: toIsoDate(new Date()),
          selectedPayPeriodId: viewedPeriod?.id ?? null,
          customInstructions: snapshot.settings.aiInstructions,
          snapshot: {
            ...snapshot,
            dailyBriefs: [],
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`AI planner request failed with ${response.status}`)
      }

      setAssistantResponse((await response.json()) as AiPlannerResponse)
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : 'Unable to ask the AI planner.')
      setAssistantResponse(createLocalAssistantResponse(plans))
    } finally {
      setIsAsking(false)
    }
  }

  async function reserveCurrentRecommendation(plan: DebtReservePlan) {
    if (!viewedPeriod || plan.recommendedAmountPence <= 0) {
      return
    }

    await actions.addDebtReserve({
      debtId: plan.debt.id,
      payPeriodId: viewedPeriod.id,
      payday: viewedPeriod.payday,
      periodStartDate: viewedPeriod.startDate,
      periodEndDate: viewedPeriod.endDate,
      amountPence: plan.recommendedAmountPence,
      source: 'assistant',
      note: `AI Plan reserve for ${plan.debt.name}`,
    })
  }

  async function skipCurrentPaycheck(plan: DebtReservePlan) {
    if (!viewedPeriod) {
      return
    }

    await actions.skipDebtReserve({
      debtId: plan.debt.id,
      payPeriodId: viewedPeriod.id,
      payday: viewedPeriod.payday,
      periodStartDate: viewedPeriod.startDate,
      periodEndDate: viewedPeriod.endDate,
      source: 'assistant',
      note: `Skipped ${viewedPeriod.payday} for ${plan.debt.name}`,
    })
  }

  async function cancelReserve(reserve: DebtReserve) {
    if (window.confirm(`Cancel the ${formatPence(reserve.amountPence)} reserve?`)) {
      await actions.cancelDebtReserve(reserve.id)
    }
  }

  async function applyReserve(reserve: DebtReserve) {
    if (window.confirm(`Apply ${formatPence(reserve.amountPence)} as a real debt payment?`)) {
      await actions.applyDebtReserve(reserve.id, {
        date: toIsoDate(new Date()),
        note: reserve.note || 'Applied debt reserve',
      })
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title="AI debt plan"
        description={
          viewedPeriod
            ? `Calculated from ${viewedPeriod.startDate} to ${viewedPeriod.endDate}.`
            : 'Choose or create a pay period on the dashboard before reserving debt money.'
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <MoneyMetric
            label="Debts being planned"
            value={String(activePlanCount)}
            tone={activePlanCount > 0 ? 'warning' : 'good'}
          />
          <MoneyMetric
            label="Set aside this paycheck"
            value={formatPence(totalRecommendedPence)}
            tone={totalRecommendedPence > 0 ? 'primary' : 'neutral'}
          />
          <MoneyMetric
            label="Shortfall warning"
            value={formatPence(totalShortfallPence)}
            tone={totalShortfallPence > 0 ? 'bad' : 'good'}
          />
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Debt recommendations" description="Reserve money first. Apply it only once the debt is actually paid.">
          <div className="space-y-4">
            {plans.length > 0 ? (
              plans.map((plan) => (
                <DebtPlanCard
                  key={plan.debt.id}
                  plan={plan}
                  selectedPayPeriod={viewedPeriod}
                  debtReserves={snapshot.debtReserves}
                  onReserve={() => reserveCurrentRecommendation(plan)}
                  onSkip={() => skipCurrentPaycheck(plan)}
                  onCancelReserve={cancelReserve}
                  onApplyReserve={applyReserve}
                />
              ))
            ) : (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                Add active debts in the Debts tab to get a paycheck-by-paycheck plan.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Ask AI planner" description="The selected AI provider explains the calculated plan. It does not invent or change the maths.">
          <div className="space-y-4">
            <TextArea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What should I do next with my debts?"
            />
            <Button onClick={askAssistant} disabled={!question.trim() || isAsking}>
              <Send size={16} />
              {isAsking ? 'Asking...' : 'Ask'}
            </Button>
            {assistantError && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {assistantError}
              </p>
            )}
            {assistantResponse && (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 text-slate-500" size={18} />
                  <p className="text-sm leading-6 text-slate-800">{assistantResponse.answer}</p>
                </div>
                <AiList title="Risks" items={assistantResponse.risks} />
                <AiList title="Actions" items={assistantResponse.actions} />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Confidence: {assistantResponse.confidence}
                </p>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function DebtPlanCard({
  plan,
  selectedPayPeriod,
  debtReserves,
  onReserve,
  onSkip,
  onCancelReserve,
  onApplyReserve,
}: {
  plan: DebtReservePlan
  selectedPayPeriod: PayPeriod | null
  debtReserves: DebtReserve[]
  onReserve: () => Promise<void>
  onSkip: () => Promise<void>
  onCancelReserve: (reserve: DebtReserve) => Promise<void>
  onApplyReserve: (reserve: DebtReserve) => Promise<void>
}) {
  const currentReserve = selectedPayPeriod
    ? debtReserves.find(
        (reserve) =>
          reserve.debtId === plan.debt.id &&
          reserve.status === 'planned' &&
          reserveMatchesPayPeriod(reserve, selectedPayPeriod),
      )
    : null
  const currentSkipped = selectedPayPeriod
    ? debtReserves.some(
        (reserve) =>
          reserve.debtId === plan.debt.id &&
          reserve.status === 'skipped' &&
          reserveMatchesPayPeriod(reserve, selectedPayPeriod),
      )
    : false
  const plannedReserves = debtReserves.filter(
    (reserve) => reserve.debtId === plan.debt.id && reserve.status === 'planned',
  )

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">{plan.debt.name}</h3>
            {plan.shortfallPence > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                <CircleAlert size={14} />
                Shortfall
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 size={14} />
                Fits plan
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {plan.debt.lender} · due {plan.debt.dueDate}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onReserve}
            disabled={!selectedPayPeriod || plan.recommendedAmountPence <= 0 || Boolean(currentReserve) || currentSkipped}
            aria-label={`Reserve ${formatPence(plan.recommendedAmountPence)} for ${plan.debt.name}`}
          >
            Reserve {formatPence(plan.recommendedAmountPence)}
          </Button>
          <Button
            variant="secondary"
            onClick={onSkip}
            disabled={!selectedPayPeriod || Boolean(currentReserve) || currentSkipped}
          >
            Move to next paycheck
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <DebtPlanStat label="Balance" value={formatPence(plan.debt.currentBalancePence)} />
        <DebtPlanStat label="Already reserved" value={formatPence(plan.plannedReservePence)} />
        <DebtPlanStat label="This paycheck" value={formatPence(plan.recommendedAmountPence)} />
        <DebtPlanStat label="Available after costs" value={formatPence(plan.currentPeriodAvailablePence)} />
      </div>

      <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">
          Show reserve maths
        </summary>
        <CalculationDetails
          breakdown={{
            formula: 'Recommended reserve = unreserved debt balance split across usable paychecks up to the due date.',
            lines: [
              { label: 'Debt balance', value: formatPence(plan.debt.currentBalancePence), tone: 'add' },
              { label: 'Planned reserves', value: `-${formatPence(plan.plannedReservePence)}`, tone: 'subtract' },
              { label: 'Remaining to plan', value: formatPence(plan.remainingDebtPence), tone: 'result' },
              ...plan.schedule.map((item) => ({
                label: item.payday,
                value: formatPence(item.amountPence),
                detail: `${item.periodStartDate} to ${item.periodEndDate} · available ${formatPence(item.availablePence)}`,
                tone: item.shortfallPence > 0 ? ('subtract' as const) : ('add' as const),
              })),
            ],
            note: plan.shortfallPence > 0
              ? `This plan is short by ${formatPence(plan.shortfallPence)} in the selected paycheck.`
              : 'This plan fits the selected paycheck based on the stored costs.',
          }}
        />
      </details>

      {plannedReserves.length > 0 && (
        <div className="mt-4 space-y-2">
          {plannedReserves.map((reserve) => (
            <div key={reserve.id} className="flex flex-col gap-3 rounded-md bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">{formatPence(reserve.amountPence)} reserved</p>
                <p className="text-xs text-slate-500">
                  {reserve.periodStartDate} to {reserve.periodEndDate}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => onApplyReserve(reserve)}>
                  Apply as payment
                </Button>
                <Button variant="danger" onClick={() => onCancelReserve(reserve)}>
                  Cancel reserve
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function DebtPlanStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function AiList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-1 space-y-1 text-sm text-slate-700">
        {items.length > 0 ? items.map((item) => <li key={item}>{item}</li>) : <li>No {title.toLowerCase()} returned.</li>}
      </ul>
    </div>
  )
}

function createLocalAssistantResponse(plans: DebtReservePlan[]): AiPlannerResponse {
  const firstPlan = plans.find((plan) => plan.remainingDebtPence > 0)

  if (!firstPlan) {
    return {
      answer: 'No active debt plan is available from the current data.',
      risks: [],
      actions: ['Add an active debt and paycheck plan, then ask again.'],
      confidence: 'low',
    }
  }

  return {
    answer: `${firstPlan.debt.name} needs ${formatPence(firstPlan.remainingDebtPence)} planned before ${firstPlan.debt.dueDate}.`,
    risks: firstPlan.shortfallPence > 0 ? [`Shortfall: ${formatPence(firstPlan.shortfallPence)} in the selected paycheck.`] : [],
    actions: firstPlan.recommendedAmountPence > 0
      ? [`Reserve ${formatPence(firstPlan.recommendedAmountPence)} this paycheck.`]
      : ['Review the next usable paycheck in the schedule.'],
    confidence: 'medium',
  }
}

function reserveMatchesPayPeriod(reserve: DebtReserve, payPeriod: PayPeriod): boolean {
  if (reserve.payPeriodId) {
    return reserve.payPeriodId === payPeriod.id
  }

  return reserve.payday === payPeriod.payday ||
    (reserve.periodStartDate === payPeriod.startDate && reserve.periodEndDate === payPeriod.endDate)
}
