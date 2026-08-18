import { useMemo, useState } from 'react'
import { ArrowRight, BadgePoundSterling, PiggyBank, Target, TrendingUp } from 'lucide-react'

import { formatPence, parsePoundsToPence } from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import { Button, Field, MoneyMetric, Panel, ProgressRail, SelectInput, TextInput } from '../components/ui'
import type { PayPeriod, Pot } from '../types/models'

export function SavingsInvestmentsPage({
  snapshot,
  actions,
  selectedPayPeriod,
}: {
  snapshot: PlannerSnapshot
  actions: Pick<PlannerActions, 'upsertPaycheckPotAllocation'>
  selectedPayPeriod?: PayPeriod | null
}) {
  const [selectedPotId, setSelectedPotId] = useState('')
  const [amount, setAmount] = useState('')
  const eligiblePots = useMemo(
    () =>
      snapshot.pots
        .filter((pot) => !pot.archived && isSavingsOrInvestmentPot(pot))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot.pots],
  )
  const selectedPot = eligiblePots.find((pot) => pot.id === selectedPotId) ?? null
  const amountPence = parsePoundsToPence(amount)
  const existingAllocationPence =
    selectedPayPeriod && selectedPot
      ? snapshot.potAllocations.find((allocation) => allocation.id === getSavingsInvestmentAllocationId(selectedPayPeriod.id, selectedPot.id))?.amountPence ?? 0
      : 0
  const totalSavedPence = eligiblePots.reduce((total, pot) => total + Math.max(0, pot.balancePence), 0)
  const targetPence = eligiblePots.reduce((total, pot) => total + Math.max(0, pot.targetPence ?? 0), 0)
  const selectedPeriodAllocationByPotId = useMemo(() => {
    const allocations = new Map<string, number>()
    if (!selectedPayPeriod) {
      return allocations
    }

    const eligiblePotIds = new Set(eligiblePots.map((pot) => pot.id))
    snapshot.potAllocations.forEach((allocation) => {
      if (allocation.payPeriodId !== selectedPayPeriod.id || !eligiblePotIds.has(allocation.potId)) {
        return
      }
      allocations.set(allocation.potId, (allocations.get(allocation.potId) ?? 0) + Math.max(0, allocation.amountPence))
    })

    return allocations
  }, [eligiblePots, selectedPayPeriod, snapshot.potAllocations])
  const selectedPeriodAllocationPence = Array.from(selectedPeriodAllocationByPotId.values()).reduce((total, amount) => total + amount, 0)
  const allocationPreviewPence = selectedPot ? existingAllocationPence + Math.max(0, amountPence) : 0
  const canSubmit = Boolean(selectedPayPeriod && selectedPot && amountPence > 0)
  const hasAllocationPreview = Boolean(selectedPot && amountPence > 0)

  async function submitAllocation() {
    if (!selectedPayPeriod || !selectedPot || amountPence <= 0) {
      return
    }

    await actions.upsertPaycheckPotAllocation({
      id: getSavingsInvestmentAllocationId(selectedPayPeriod.id, selectedPot.id),
      payPeriodId: selectedPayPeriod.id,
      potId: selectedPot.id,
      amountPence: existingAllocationPence + amountPence,
    })

    setAmount('')
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <MoneyMetric label="Saved so far" value={formatPence(totalSavedPence)} tone="good" />
        <MoneyMetric label="This paycheck" value={formatPence(selectedPeriodAllocationPence)} tone="primary" />
        <MoneyMetric label="Targets" value={targetPence > 0 ? formatPence(targetPence) : 'Not set'} />
      </div>

      <Panel
        title="Savings"
        description={selectedPayPeriod ? `Set money aside from ${selectedPayPeriod.payday} pay.` : 'Create or select a paycheck first.'}
        accent="emerald"
        density="compact"
      >
        <div className={hasAllocationPreview ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]' : 'grid gap-4'}>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_auto]">
            <Field label="Savings or investment pot">
              <SelectInput value={selectedPotId} onChange={(event) => setSelectedPotId(event.target.value)}>
                <option value="">Choose pot</option>
                {eligiblePots.map((pot) => (
                  <option key={pot.id} value={pot.id}>
                    {pot.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Amount to set aside">
              <TextInput
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="50.00"
              />
            </Field>
            <div className="flex items-end">
              <Button onClick={submitAllocation} disabled={!canSubmit}>
                <PiggyBank size={18} />
                Set aside money
              </Button>
            </div>
          </div>
          {hasAllocationPreview && (
            <AllocationPreviewCard
              selectedPot={selectedPot}
              amountPence={amountPence}
              existingAllocationPence={existingAllocationPence}
              allocationPreviewPence={allocationPreviewPence}
              selectedPayPeriod={selectedPayPeriod ?? null}
            />
          )}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {eligiblePots.map((pot) => (
          <SavingsPotCard
            key={pot.id}
            pot={pot}
            currentSetAsidePence={selectedPeriodAllocationByPotId.get(pot.id) ?? 0}
          />
        ))}
        {eligiblePots.length === 0 && (
          <Panel title="No savings pots yet" accent="slate" density="compact">
            <p className="text-sm text-slate-500">Create a Saving or Investment pot first, then it will appear here.</p>
          </Panel>
        )}
      </div>
    </div>
  )
}

function AllocationPreviewCard({
  selectedPot,
  amountPence,
  existingAllocationPence,
  allocationPreviewPence,
  selectedPayPeriod,
}: {
  selectedPot: Pot | null
  amountPence: number
  existingAllocationPence: number
  allocationPreviewPence: number
  selectedPayPeriod: PayPeriod | null
}) {
  const amountLabel = amountPence > 0 ? formatPence(amountPence) : formatPence(0)

  return (
    <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50 p-4 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Allocation preview</p>
          <p className="mt-2 truncate text-lg font-semibold tracking-[-0.01em] text-slate-950">
            {selectedPot ? selectedPot.name : 'Choose a pot'}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {selectedPayPeriod ? `Payday ${selectedPayPeriod.payday}` : 'Select a paycheck first'}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white/90 text-emerald-700 shadow-sm shadow-emerald-100/70">
          <BadgePoundSterling size={18} />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-emerald-100 bg-white/80 p-3 shadow-inner shadow-emerald-100/50">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add now</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{amountLabel}</p>
        </div>
        <ArrowRight size={16} className="text-emerald-600" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paycheck total</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{formatPence(allocationPreviewPence)}</p>
        </div>
      </div>
      {existingAllocationPence > 0 && (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Includes {formatPence(existingAllocationPence)} already set aside for this pot in the selected paycheck.
        </p>
      )}
    </div>
  )
}

function SavingsPotCard({ pot, currentSetAsidePence }: { pot: Pot; currentSetAsidePence: number }) {
  const targetPence = Math.max(0, pot.targetPence ?? 0)
  const progressPercent = targetPence > 0
    ? Math.round((Math.max(0, pot.balancePence) / targetPence) * 100)
    : 0
  const targetDeltaPence = targetPence - pot.balancePence
  const accentColor = pot.color || '#10b981'

  return (
    <div className="group overflow-hidden rounded-2xl border border-emerald-200/80 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.065)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_58px_rgba(15,23,42,0.1)]">
      <div className="h-1.5" style={{ backgroundColor: accentColor }} />
      <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-950">{pot.name}</p>
          <p className="mt-1 text-sm text-slate-500">{pot.type === 'investment' ? 'Investment' : 'Savings'} pot</p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100/60">
          {pot.type === 'investment' ? <TrendingUp size={18} /> : <Target size={18} />}
        </span>
      </div>
      <p className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-slate-950">{formatPence(pot.balancePence)}</p>
      <ProgressRail
        percent={targetPence > 0 ? progressPercent : 0}
        color={accentColor}
        className="mt-4"
        trackClassName="bg-emerald-100/90 shadow-emerald-200/60"
      />
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-emerald-700">{targetPence > 0 ? `${progressPercent}%` : 'No target'}</span>
        <span className="text-slate-500">{targetPence > 0 ? `Target ${formatPence(targetPence)}` : 'Set a target in Pots'}</span>
      </div>
      {targetPence > 0 && (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {targetDeltaPence > 0
            ? `${formatPence(targetDeltaPence)} left to target.`
            : `${formatPence(Math.abs(targetDeltaPence))} over target.`}
        </p>
      )}
      {currentSetAsidePence > 0 && (
        <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          This paycheck set-aside {formatPence(currentSetAsidePence)}
        </p>
      )}
      </div>
    </div>
  )
}

function isSavingsOrInvestmentPot(pot: Pot): boolean {
  return pot.type === 'saving' || pot.type === 'investment'
}

function getSavingsInvestmentAllocationId(payPeriodId: string, potId: string): string {
  return `savings-investments-${payPeriodId}-${potId}`
}
