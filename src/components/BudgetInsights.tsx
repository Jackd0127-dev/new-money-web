import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertCircle, TrendingDown, TrendingUp } from 'lucide-react'

import {
  addIsoDays,
  formatPence,
  getDaysInclusive,
  getRecurringPaymentOccurrences,
  toIsoDate,
} from '../domain/money'
import type { PlannerSnapshot } from '../hooks/usePlannerData'
import { Panel } from './ui'

export function BudgetInsights({
  snapshot,
  chartWidth,
}: {
  snapshot: PlannerSnapshot
  chartWidth: number
}) {
  const today = toIsoDate(new Date())
  const latestPeriod = snapshot.payPeriods[0] ?? null
  const rangeStart = latestPeriod?.startDate ?? addIsoDays(today, -30)
  const rangeEnd = latestPeriod?.endDate ?? today
  const currentRangeEnd = today > rangeEnd ? rangeEnd : today
  const periodTransactions = snapshot.transactions.filter(
    (transaction) =>
      transaction.type === 'spending' &&
      transaction.date >= rangeStart &&
      transaction.date <= rangeEnd,
  )
  const spentPence = periodTransactions.reduce((total, transaction) => total + transaction.amountPence, 0)
  const elapsedDays = getDaysInclusive(rangeStart, currentRangeEnd)
  const periodDays = getDaysInclusive(rangeStart, rangeEnd)
  const dailyAveragePence = Math.floor(spentPence / elapsedDays)
  const projectedSpendPence = dailyAveragePence * periodDays
  const next30RecurringPence = getRecurringPaymentOccurrences(
    snapshot.recurringPayments,
    today,
    addIsoDays(today, 30),
  ).reduce((total, occurrence) => total + occurrence.amountPence, 0)
  const spendingByPot = getSpendingByPot(snapshot, periodTransactions)
  const biggestPot = spendingByPot[0] ?? null
  const overspentPots = snapshot.pots.filter((pot) => !pot.archived && pot.balancePence < 0)
  const spendDirection = latestPeriod && projectedSpendPence > latestPeriod.incomePence ? 'bad' : 'good'

  return (
    <Panel title="Budget insights" description={`${rangeStart} to ${rangeEnd}`}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InsightMetric label="Spent this period" value={formatPence(spentPence)} />
        <InsightMetric
          label="Daily average"
          value={formatPence(dailyAveragePence)}
          tone={dailyAveragePence > 0 ? 'neutral' : 'quiet'}
        />
        <InsightMetric
          label="Projected spend"
          value={formatPence(projectedSpendPence)}
          tone={spendDirection}
        />
        <InsightMetric label="Next 30 days recurring" value={formatPence(next30RecurringPence)} tone="warning" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Spending by pot</p>
              <p className="mt-1 text-xs text-slate-500">
                {biggestPot ? `${biggestPot.name} is your biggest spend pot.` : 'No spending logged in this range.'}
              </p>
            </div>
            {spentPence > 0 ? (
              <TrendingUp className="text-slate-500" size={18} />
            ) : (
              <TrendingDown className="text-slate-500" size={18} />
            )}
          </div>
          <div className="h-64 overflow-x-auto">
            <BarChart data={spendingByPot} width={chartWidth} height={256}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip formatter={(value) => formatPence(Number(value) * 100)} />
              <Bar dataKey="spent" fill="#dc2626" radius={[6, 6, 0, 0]} />
            </BarChart>
          </div>
        </div>

        <div className="space-y-3">
          {overspentPots.length > 0 && (
            <InsightWarning
              title="Overspent pots"
              body={`${overspentPots.map((pot) => pot.name).join(', ')} ${
                overspentPots.length === 1 ? 'is' : 'are'
              } below zero.`}
            />
          )}
          {latestPeriod && projectedSpendPence > latestPeriod.incomePence && (
            <InsightWarning
              title="Spend pace is high"
              body={`At this pace, spending could reach ${formatPence(projectedSpendPence)} before payday.`}
            />
          )}
          {periodTransactions.length === 0 && (
            <InsightWarning
              title="No spending logged"
              body="Insights get more useful once daily spending is added from the Spending page."
              quiet
            />
          )}
          {biggestPot && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-950">Biggest pot</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{biggestPot.name}</p>
              <p className="mt-1 text-sm text-slate-500">{formatPence(biggestPot.spentPence)} spent</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}

function InsightMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warning' | 'bad' | 'quiet'
}) {
  return (
    <div className={metricClassName(tone)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function InsightWarning({
  title,
  body,
  quiet = false,
}: {
  title: string
  body: string
  quiet?: boolean
}) {
  return (
    <div
      className={
        quiet
          ? 'rounded-lg border border-slate-200 bg-white p-4'
          : 'rounded-lg border border-amber-200 bg-amber-50 p-4'
      }
    >
      <div className="flex gap-3">
        <AlertCircle className={quiet ? 'mt-0.5 shrink-0 text-slate-500' : 'mt-0.5 shrink-0 text-amber-700'} size={18} />
        <div>
          <p className={quiet ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-amber-950'}>
            {title}
          </p>
          <p className={quiet ? 'mt-1 text-sm leading-6 text-slate-500' : 'mt-1 text-sm leading-6 text-amber-900'}>
            {body}
          </p>
        </div>
      </div>
    </div>
  )
}

function getSpendingByPot(
  snapshot: PlannerSnapshot,
  transactions: PlannerSnapshot['transactions'],
) {
  const spendByPotId = new Map<string, number>()

  for (const transaction of transactions) {
    if (!transaction.potId) {
      continue
    }

    spendByPotId.set(transaction.potId, (spendByPotId.get(transaction.potId) ?? 0) + transaction.amountPence)
  }

  return Array.from(spendByPotId.entries())
    .map(([potId, spentPence]) => {
      const pot = snapshot.pots.find((candidate) => candidate.id === potId)

      return {
        id: potId,
        name: pot?.name ?? 'Archived pot',
        spent: spentPence / 100,
        spentPence,
      }
    })
    .sort((a, b) => b.spentPence - a.spentPence)
}

function metricClassName(tone: 'neutral' | 'good' | 'warning' | 'bad' | 'quiet') {
  const base = 'rounded-lg border p-4'

  if (tone === 'good') {
    return `${base} border-emerald-200 bg-emerald-50`
  }

  if (tone === 'warning') {
    return `${base} border-amber-200 bg-amber-50`
  }

  if (tone === 'bad') {
    return `${base} border-red-200 bg-red-50`
  }

  if (tone === 'quiet') {
    return `${base} border-slate-200 bg-slate-50`
  }

  return `${base} border-slate-200 bg-white`
}
