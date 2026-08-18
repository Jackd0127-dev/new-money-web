import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import {
  Banknote,
  Car,
  CreditCard,
  Dumbbell,
  Fuel,
  Gift,
  Heart,
  Home,
  PenLine,
  Phone,
  PiggyBank,
  Plane,
  Plus,
  Shield,
  Target,
  Trash2,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import {
  findPayPeriodForDate,
  formatPence,
  getAppTodayIso,
  getCreditCardAllocationSummary,
  parsePoundsToPence,
} from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import {
  Button,
  CalculationDetails,
  Field,
  FormDrawer,
  Panel,
  SelectInput,
  TextInput,
  type CalculationBreakdown,
} from '../components/ui'
import type { PayPeriod, Pot, PotAllocation, PotType, RecurringPayment, Transaction } from '../types/models'

const colors = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#0f766e', '#4338ca', '#475569']
const builtinCategories = ['All Pots', 'Spending', 'Bills', 'Savings'] as const
const customCategoryAll = 'All Pots'

const iconOptions = [
  { key: 'wallet', label: 'Wallet', Icon: Wallet },
  { key: 'home', label: 'Home', Icon: Home },
  { key: 'card', label: 'Card', Icon: CreditCard },
  { key: 'shield', label: 'Shield', Icon: Shield },
  { key: 'car', label: 'Car', Icon: Car },
  { key: 'fuel', label: 'Fuel', Icon: Fuel },
  { key: 'gym', label: 'Gym', Icon: Dumbbell },
  { key: 'food', label: 'Food', Icon: Utensils },
  { key: 'phone', label: 'Phone', Icon: Phone },
  { key: 'zap', label: 'Bolt', Icon: Zap },
  { key: 'gift', label: 'Gift', Icon: Gift },
  { key: 'plane', label: 'Travel', Icon: Plane },
  { key: 'heart', label: 'Heart', Icon: Heart },
  { key: 'target', label: 'Target', Icon: Target },
  { key: 'money', label: 'Money', Icon: Banknote },
  { key: 'savings', label: 'Savings', Icon: PiggyBank },
] satisfies Array<{ key: string; label: string; Icon: LucideIcon }>

type PotLinkType = 'none' | 'credit_card' | 'debt'

interface PotFormState {
  name: string
  type: PotType
  category: string
  icon: string
  paycheckAmount: string
  balance: string
  color: string
  linkType: PotLinkType
  linkedEntityId: string
}

interface PotProgress {
  targetPence: number
  coveredPence: number
  percent: number
  targetLabel: string
  sourceLabels: string[]
  shortfallPence: number
  dueIso: string | null
}

interface PotActivityItem {
  id: string
  title: string
  detail: string
  amountPence: number
}

interface PotsSummary {
  totalPence: number
  spendingPence: number
  savingsPence: number
  reservedCardPence: number
  activePotCount: number
}

const emptyPotForm = (): PotFormState => ({
  name: '',
  type: 'spending',
  category: 'Spending',
  icon: 'wallet',
  paycheckAmount: '',
  balance: '',
  color: colors[0],
  linkType: 'none',
  linkedEntityId: '',
})

export function PotsPage({
  snapshot,
  actions,
  selectedPayPeriod,
  isCreateModalOpen,
  onCreateModalOpenChange,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
  selectedPayPeriod?: PayPeriod | null
  isCreateModalOpen?: boolean
  onCreateModalOpenChange?: (isOpen: boolean) => void
}) {
  const today = getAppTodayIso(snapshot.settings)
  const [createForm, setCreateForm] = useState<PotFormState>(emptyPotForm)
  const [editForm, setEditForm] = useState<PotFormState | null>(null)
  const [openPotId, setOpenPotId] = useState<string | null>(null)
  const [editingPotId, setEditingPotId] = useState<string | null>(null)
  const [localCreateModalOpen, setLocalCreateModalOpen] = useState(false)
  const [isTopUpDrawerOpen, setIsTopUpDrawerOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>(customCategoryAll)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [topUpPotId, setTopUpPotId] = useState('')
  const [topUpAmount, setTopUpAmount] = useState('')
  const activePots = snapshot.pots.filter((pot) => !pot.archived)
  const potsSummary = useMemo(() => getPotsSummary(activePots), [activePots])
  const categoryOptions = useMemo(() => getPotCategoryOptions(activePots, customCategories), [activePots, customCategories])
  const visiblePots = activePots.filter((pot) => isPotInCategory(pot, activeCategory))
  const isCreateOpen = isCreateModalOpen ?? localCreateModalOpen
  const setCreateOpen = onCreateModalOpenChange ?? setLocalCreateModalOpen
  const detailPot = activePots.find((pot) => pot.id === openPotId) ?? null
  const topUpAmountPence = parsePoundsToPence(topUpAmount)
  const canTopUpPot = Boolean(selectedPayPeriod && topUpPotId && topUpAmountPence > 0)
  const canSaveCreatePot = canSubmitPotForm(createForm, snapshot)
  const canSaveEditPot = editForm ? canSubmitPotForm(editForm, snapshot) : false
  const topUpHistory = useMemo(() => {
    if (!selectedPayPeriod) {
      return []
    }

    const potById = new Map(snapshot.pots.map((pot) => [pot.id, pot]))

    return snapshot.potAllocations
      .filter(
        (allocation) =>
          allocation.payPeriodId === selectedPayPeriod.id &&
          allocation.amountPence > 0 &&
          isPotTopUpAllocation(allocation),
      )
      .map((allocation) => ({
        allocation,
        pot: potById.get(allocation.potId) ?? null,
      }))
      .sort((left, right) => right.allocation.createdAt.localeCompare(left.allocation.createdAt))
  }, [selectedPayPeriod, snapshot.potAllocations, snapshot.pots])

  async function submitPot() {
    if (!canSaveCreatePot) {
      return
    }

    await actions.addPot(potFormToPayload(createForm))
    resetCreateForm()
    setCreateOpen(false)
  }

  async function submitEditedPot() {
    if (!editingPotId || !editForm || !canSaveEditPot) {
      return
    }

    await actions.updatePot(editingPotId, potFormToPayload(editForm))
    closeEditModal()
  }

  function startEditingPot(potId: string) {
    const pot = snapshot.pots.find((candidate) => candidate.id === potId)

    if (!pot) {
      return
    }

    setEditingPotId(pot.id)
    setEditForm({
      name: pot.name,
      type: pot.type,
      category: getPotCategory(pot),
      icon: getPotIconKey(pot),
      paycheckAmount: pot.targetPence ? (pot.targetPence / 100).toFixed(2) : '',
      balance: (pot.balancePence / 100).toFixed(2),
      color: pot.color,
      linkType: getPotLinkType(pot),
      linkedEntityId: pot.linkedCreditCardId ?? pot.linkedDebtId ?? '',
    })
  }

  function resetCreateForm() {
    setCreateForm(emptyPotForm())
  }

  function closeCreateDrawer() {
    resetCreateForm()
    setCreateOpen(false)
  }

  function closeEditModal() {
    setEditingPotId(null)
    setEditForm(null)
  }

  function closeTopUpDrawer() {
    setTopUpPotId('')
    setTopUpAmount('')
    setIsTopUpDrawerOpen(false)
  }

  function submitCustomCategory() {
    const category = cleanCategory(newCategory)

    if (!category) {
      return
    }

    setCustomCategories((current) => current.some((item) => item.toLowerCase() === category.toLowerCase()) ? current : [...current, category])
    setActiveCategory(category)
    setCreateForm((current) => ({ ...current, category }))
    setNewCategory('')
    setIsAddingCategory(false)
  }

  async function submitPotTopUp() {
    if (!selectedPayPeriod || !topUpPotId || topUpAmountPence <= 0) {
      return
    }

    await actions.upsertPaycheckPotAllocation({
      id: createPotTopUpAllocationId(selectedPayPeriod.id, topUpPotId),
      payPeriodId: selectedPayPeriod.id,
      potId: topUpPotId,
      amountPence: topUpAmountPence,
    })

    closeTopUpDrawer()
  }

  async function deleteTopUp(allocationId: string) {
    await actions.deletePaycheckPotAllocation(allocationId)
  }

  return (
    <div className="min-w-0 space-y-4">
      <PotsSummaryHeader summary={potsSummary} />

      <Panel
        title="Top-up history"
        description={selectedPayPeriod ? `Manual top-ups from the ${selectedPayPeriod.payday} paycheck.` : 'Choose a paycheck to see top-ups.'}
        accent="emerald"
        density="compact"
        action={
          <Button onClick={() => setIsTopUpDrawerOpen(true)} disabled={!selectedPayPeriod || activePots.length === 0}>
            <Plus size={18} />
            Top up pot
          </Button>
        }
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Manual entries</h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {selectedPayPeriod ? `From the ${selectedPayPeriod.payday} paycheck.` : 'Choose a paycheck to see top-ups.'}
            </p>
          </div>
          {topUpHistory.length > 0 && (
            <span className="rounded-[var(--radius-control)] border border-[color:rgba(20,122,85,0.22)] bg-[rgba(20,122,85,0.08)] px-2.5 py-1 text-xs font-semibold text-[var(--color-success)]">
              {formatPence(topUpHistory.reduce((total, item) => total + item.allocation.amountPence, 0))}
            </span>
          )}
        </div>
        {topUpHistory.length > 0 ? (
          <div className="mt-3 divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            {topUpHistory.map(({ allocation, pot }) => {
              const potName = pot?.name ?? 'Deleted pot'

              return (
                <div key={allocation.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 transition hover:bg-[var(--color-surface-soft)]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{potName}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
                      Added {formatTopUpDate(allocation.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{formatPence(allocation.amountPence)}</p>
                  <button
                    type="button"
                    onClick={() => void deleteTopUp(allocation.id)}
                    aria-label={`Delete ${potName} top-up`}
                    title={`Delete ${potName} top-up`}
                    className="inline-flex size-7 items-center justify-center rounded-md border border-[color:rgba(177,58,50,0.22)] bg-[rgba(177,58,50,0.06)] text-[var(--color-danger)] transition hover:-translate-y-0.5 hover:bg-[rgba(177,58,50,0.1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
            No manual top-ups for this paycheck yet.
          </p>
        )}
      </Panel>

      <Panel
        title="Pots"
        description="Click a pot to see spending, recurring payments, and allocations tied to it."
        accent="blue"
        density="compact"
        action={
          onCreateModalOpenChange ? undefined : (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={18} />
              Create pot
            </Button>
          )
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {categoryOptions.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={clsx(
                  'inline-flex min-h-9 items-center justify-center rounded-[var(--radius-control)] border px-3 text-sm font-semibold transition',
                  activeCategory === category
                    ? 'border-[var(--color-deep-navy)] bg-[var(--color-deep-navy)] text-white'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]',
                )}
              >
                {category}
              </button>
            ))}
            <button
              type="button"
              aria-label="Add pot category"
              onClick={() => setIsAddingCategory((current) => !current)}
              className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
            >
              <Plus size={16} />
            </button>
          </div>

          {isAddingCategory && (
            <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3 sm:flex-row">
              <TextInput
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="New section name"
                aria-label="New pot category"
              />
              <Button onClick={submitCustomCategory}>Add section</Button>
            </div>
          )}

          <section aria-label="Pot grid" className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visiblePots.map((pot) => {
              const activityItems = getPotActivityItems(pot.id, snapshot)
              const progress = getPotProgress(pot, snapshot, today)

              return (
                <PotCard
                  key={pot.id}
                  pot={pot}
                  progress={progress}
                  activityItems={activityItems}
                  today={today}
                  onViewDetails={() => setOpenPotId(pot.id)}
                  onEdit={() => startEditingPot(pot.id)}
                  onDelete={() => {
                    if (window.confirm(`Delete ${pot.name}?`)) {
                      void actions.deletePot(pot.id)
                    }
                  }}
                />
              )
            })}

            {visiblePots.length === 0 && (
              <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] p-6 text-center sm:col-span-2 xl:col-span-3 2xl:col-span-4">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">No pots yet.</p>
                <p className="mt-1 text-sm leading-5 text-[var(--color-text-muted)]">Create a pot to separate spending, savings, or reserved money.</p>
              </div>
            )}
          </section>
        </div>
      </Panel>

      <FormDrawer
        open={isCreateOpen}
        title="Create pot"
        description="Add money you already set aside, then linked payments can spend from that pot when due."
        closeLabel="Close create pot"
        onClose={closeCreateDrawer}
        footer={
          <>
            <Button variant="secondary" onClick={closeCreateDrawer}>
              Cancel
            </Button>
            <Button onClick={submitPot} disabled={!canSaveCreatePot}>Add pot</Button>
          </>
        }
      >
        <div className="space-y-4">
          <PotFormFields
            form={createForm}
            snapshot={snapshot}
            categoryOptions={categoryOptions}
            onChange={setCreateForm}
          />
        </div>
      </FormDrawer>

      <FormDrawer
        open={isTopUpDrawerOpen}
        title="Top up pot"
        description={selectedPayPeriod ? `Add a manual top-up from the ${selectedPayPeriod.payday} paycheck.` : 'Create a paycheck first.'}
        closeLabel="Close top up pot"
        onClose={closeTopUpDrawer}
        footer={
          <>
            <Button variant="secondary" onClick={closeTopUpDrawer}>
              Cancel
            </Button>
            <Button onClick={submitPotTopUp} disabled={!canTopUpPot}>
              Top up pot
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Pot to top up">
            <SelectInput value={topUpPotId} onChange={(event) => setTopUpPotId(event.target.value)}>
              <option value="">Choose pot</option>
              {activePots.map((pot) => (
                <option key={pot.id} value={pot.id}>
                  {pot.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Top up amount">
            <TextInput
              inputMode="decimal"
              value={topUpAmount}
              onChange={(event) => setTopUpAmount(event.target.value)}
              placeholder="25.00"
            />
          </Field>
        </div>
      </FormDrawer>

      {editingPotId && editForm && (
        <FormDrawer
          open
          title="Edit pot"
          description="Update this pot without replacing the create form."
          closeLabel="Close edit pot"
          onClose={closeEditModal}
          footer={
            <>
              <Button variant="secondary" onClick={closeEditModal}>
                Cancel
              </Button>
              <Button onClick={submitEditedPot} disabled={!canSaveEditPot}>Save pot</Button>
            </>
          }
        >
          <div className="space-y-4">
            <PotFormFields
              form={editForm}
              snapshot={snapshot}
              categoryOptions={categoryOptions}
              onChange={setEditForm}
            />
          </div>
        </FormDrawer>
      )}

      <PotDetailDrawer
        pot={detailPot}
        snapshot={snapshot}
        today={today}
        onClose={() => setOpenPotId(null)}
      />
    </div>
  )
}

function getPotsSummary(pots: Pot[]): PotsSummary {
  return pots.reduce<PotsSummary>(
    (summary, pot) => {
      const balancePence = pot.balancePence

      summary.totalPence += balancePence
      summary.activePotCount += 1

      if (pot.type === 'spending') {
        summary.spendingPence += balancePence
      }

      if (isSavingsPotType(pot.type)) {
        summary.savingsPence += balancePence
      }

      if (pot.type === 'reserved' || pot.linkedCreditCardId) {
        summary.reservedCardPence += balancePence
      }

      return summary
    },
    {
      totalPence: 0,
      spendingPence: 0,
      savingsPence: 0,
      reservedCardPence: 0,
      activePotCount: 0,
    },
  )
}

function PotsSummaryHeader({ summary }: { summary: PotsSummary }) {
  return (
    <section
      aria-label="Pots summary"
      className="fintech-surface relative max-w-full min-w-0 overflow-hidden rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[var(--color-emerald)]" aria-hidden="true" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--color-emerald)]">
            <PiggyBank size={18} aria-hidden="true" />
            <h1 className="text-2xl font-semibold leading-8 text-[var(--color-text-primary)] md:text-3xl md:leading-10">Pots</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--color-text-muted)]">
            {summary.activePotCount > 0
              ? `${summary.activePotCount} active pot${summary.activePotCount === 1 ? '' : 's'} across spending, savings, and reserves.`
              : 'No active pots yet.'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <span className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 text-sm font-semibold text-[var(--color-text-primary)]">
          <Wallet size={15} aria-hidden="true" />
          Total in pots
          <strong>{formatPence(summary.totalPence)}</strong>
        </span>
        <span className="inline-flex min-h-9 items-center rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-text-secondary)]">
          {summary.activePotCount} active pot{summary.activePotCount === 1 ? '' : 's'}
        </span>
      </div>
    </section>
  )
}

function PotCard({
  pot,
  progress,
  activityItems,
  today,
  onViewDetails,
  onEdit,
  onDelete,
}: {
  pot: Pot
  progress: PotProgress
  activityItems: PotActivityItem[]
  today: string
  onViewDetails: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const icon = getPotIconOption(pot)
  const Icon = icon.Icon
  const dueLabel = getPotDueLabel(progress, today)
  const sourceLabels = progress.sourceLabels.slice(0, 2)
  const hiddenSourceLabelCount = Math.max(0, progress.sourceLabels.length - sourceLabels.length)
  const previewActivity = activityItems[0] ?? null

  return (
    <article
      role="article"
      aria-label={`${pot.name} pot card`}
      data-testid="pot-card"
      className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-none transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-soft)]"
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onViewDetails}
          aria-label={`View ${pot.name} details`}
          className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-start gap-3 rounded-[var(--radius-control)] text-left outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,61,46,0.12)]"
        >
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-emerald)]"
          >
            <Icon size={19} strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">{pot.name}</span>
            <span className="mt-1 inline-flex rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-secondary)]">
              {formatPotTypeLabel(pot.type)}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-emerald)]"
            onClick={onEdit}
            aria-label={`Edit ${pot.name}`}
            title={`Edit ${pot.name}`}
          >
            <PenLine size={14} />
          </button>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md border border-[color:rgba(177,58,50,0.22)] bg-[rgba(177,58,50,0.06)] text-[var(--color-danger)] transition hover:-translate-y-0.5 hover:bg-[rgba(177,58,50,0.1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]"
            onClick={onDelete}
            aria-label={`Delete ${pot.name}`}
            title={`Delete ${pot.name}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <p className="mt-4 text-2xl font-semibold leading-7 text-[var(--color-text-primary)]">{formatPence(pot.balancePence)}</p>

      <div className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
        {progress.targetPence > 0 ? (
          <>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-[var(--color-emerald)]">{progress.percent}%</span>
              <span className="min-w-0 truncate text-right text-[var(--color-text-muted)]" title={progress.targetLabel}>
                {progress.targetLabel}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]" aria-hidden="true">
              <div
                className="h-full rounded-full bg-[var(--color-emerald)]"
                style={{ width: `${Math.min(progress.percent, 100)}%` }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-[var(--color-text-secondary)]">No target</span>
            <span className="min-w-0 truncate text-right text-[var(--color-text-muted)]">Balance only</span>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-[var(--color-text-secondary)]">{getActivityCountLabel(activityItems.length)}</span>
          {previewActivity && (
            <span className={clsx('font-semibold', previewActivity.amountPence < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]')}>
              {formatSignedPence(previewActivity.amountPence)}
            </span>
          )}
        </div>
        <p className="truncate text-[var(--color-text-muted)]" title={previewActivity?.title ?? 'No recent activity'}>
          {previewActivity?.title ?? 'No recent activity'}
        </p>
      </div>

      {(dueLabel || sourceLabels.length > 0) && (
        <div className="mt-3 space-y-2">
          {dueLabel && (
            <div className="truncate rounded-[var(--radius-control)] border border-[color:rgba(183,121,31,0.22)] bg-[rgba(183,121,31,0.08)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-warning)]" title={dueLabel}>
              {dueLabel}
            </div>
          )}

          {sourceLabels.length > 0 && (
            <div className="flex min-h-7 flex-nowrap gap-1.5 overflow-hidden">
              {sourceLabels.map((label) => (
                <span
                  key={label}
                  className="max-w-[9rem] truncate rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)]"
                  title={label}
                >
                  {label}
                </span>
              ))}
              {hiddenSourceLabelCount > 0 && (
                <span className="shrink-0 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)]">
                  +{hiddenSourceLabelCount}
                </span>
              )}
            </div>
          )}
        </div>
      )}

    </article>
  )
}

function PotDetailDrawer({
  pot,
  snapshot,
  today,
  onClose,
}: {
  pot: Pot | null
  snapshot: PlannerSnapshot
  today: string
  onClose: () => void
}) {
  if (!pot) {
    return null
  }

  const activityItems = getPotActivityItems(pot.id, snapshot)
  const linkedRecurringPayments = getPotLinkedRecurringPayments(pot.id, snapshot)
  const progress = getPotProgress(pot, snapshot, today)
  const dueLabel = getPotDueLabel(progress, today)

  return (
    <FormDrawer
      open
      title={`${pot.name} pot details`}
      description={`${formatPence(pot.balancePence)} saved in ${formatPotTypeLabel(pot.type).toLowerCase()} money.`}
      closeLabel={`Close ${pot.name} pot details`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <CompactPotDetail label="Balance" value={formatPence(pot.balancePence)} />
          <CompactPotDetail label="Target" value={progress.targetPence > 0 ? progress.targetLabel : 'No target'} />
          <CompactPotDetail label="Progress" value={progress.targetPence > 0 ? `${progress.percent}%` : 'Balance only'} />
          <CompactPotDetail label="Type" value={formatPotTypeLabel(pot.type)} />
        </div>

        {dueLabel && (
          <p className="rounded-[var(--radius-card)] border border-[color:rgba(183,121,31,0.22)] bg-[rgba(183,121,31,0.08)] p-3 text-sm font-semibold text-[var(--color-warning)]">
            {dueLabel}
          </p>
        )}

        <CalculationDetails breakdown={getPotBalanceBreakdown(pot.id, pot.balancePence, activityItems)} />

        <section aria-label={`${pot.name} activity`} className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Activity</h3>
          {activityItems.length > 0 ? (
            <div className="space-y-2">
              {activityItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{item.title}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">{item.detail}</p>
                  </div>
                  <p className={clsx('text-sm font-semibold', item.amountPence < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]')}>
                    {formatSignedPence(item.amountPence)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3 text-sm text-[var(--color-text-muted)]">
              No activity recorded for this pot yet.
            </p>
          )}
        </section>

        {linkedRecurringPayments.length > 0 && (
          <section aria-label={`${pot.name} linked recurring payments`} className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-border)] px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Linked recurring payments</p>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {linkedRecurringPayments.map((payment) => (
                <div key={payment.id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{payment.name}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {payment.frequency} · due day {payment.dueDay ?? 'set date'}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{formatPence(payment.amountPence)}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </FormDrawer>
  )
}

function CompactPotDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{value}</p>
    </div>
  )
}

function PotFormFields({
  form,
  snapshot,
  categoryOptions,
  onChange,
}: {
  form: PotFormState
  snapshot: PlannerSnapshot
  categoryOptions: string[]
  onChange: (form: PotFormState) => void
}) {
  const creditCards = getSelectableCreditCards(snapshot, form.linkedEntityId)
  const debts = getSelectableDebts(snapshot, form.linkedEntityId)
  const activeCreditCards = creditCards.filter((card) => !card.archived)
  const activeDebts = debts.filter((debt) => debt.status !== 'archived' && debt.currentBalancePence > 0)
  const creditCardHint = activeCreditCards.length === 0
    ? 'Create an active credit card before linking this pot.'
    : !form.linkedEntityId
      ? 'Choose which credit card this pot is covering.'
      : undefined
  const debtHint = activeDebts.length === 0
    ? 'Create an active debt before linking this pot.'
    : !form.linkedEntityId
      ? 'Choose which debt this pot is covering.'
      : undefined

  function changeLinkType(linkType: PotLinkType) {
    onChange({
      ...form,
      linkType,
      linkedEntityId: getDefaultLinkedEntityId(linkType, activeCreditCards, activeDebts),
    })
  }

  return (
    <>
      <Field label="Pot name">
        <TextInput
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          placeholder="Car insurance"
        />
      </Field>
      <Field label="Type">
        <SelectInput
          value={form.type}
          onChange={(event) => {
            const type = event.target.value as PotType
            const currentCategory = cleanCategory(form.category)
            const shouldUseTypeCategory = !currentCategory || isBuiltinPotCategory(currentCategory)

            onChange({
              ...form,
              type,
              category: shouldUseTypeCategory ? defaultCategoryForPotType(type) : form.category,
            })
          }}
        >
          <option value="spending">Spending</option>
          <option value="reserved">Reserved</option>
          <option value="saving">Saving</option>
          <option value="investment">Investment</option>
          <option value="buffer">Buffer</option>
        </SelectInput>
      </Field>
      <Field label="Category" hint="This controls the little section tabs above the pot cards.">
        <TextInput
          value={form.category}
          onChange={(event) => onChange({ ...form, category: event.target.value })}
          placeholder="Spending"
          list="pot-category-options"
        />
        <datalist id="pot-category-options">
          {categoryOptions.filter((category) => category !== customCategoryAll).map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </Field>
      <Field label="Add each paycheck" hint="This amount is automatically deducted from every confirmed paycheck and added to this pot.">
        <TextInput
          inputMode="decimal"
          value={form.paycheckAmount}
          onChange={(event) => onChange({ ...form, paycheckAmount: event.target.value })}
          placeholder="50.00"
        />
      </Field>
      <Field label="Current balance" hint="Money already set aside in this pot before you started using the app.">
        <TextInput
          inputMode="decimal"
          value={form.balance}
          onChange={(event) => onChange({ ...form, balance: event.target.value })}
          placeholder="0.00"
        />
      </Field>
      <Field label="Link this pot to">
        <SelectInput
          value={form.linkType}
          onChange={(event) => changeLinkType(event.target.value as PotLinkType)}
        >
          <option value="none">No link</option>
          <option value="credit_card">Credit card</option>
          <option value="debt">Debt</option>
        </SelectInput>
      </Field>
      {form.linkType === 'credit_card' && (
        <Field label="Credit card" hint={creditCardHint}>
          <SelectInput
            value={form.linkedEntityId}
            onChange={(event) => onChange({ ...form, linkedEntityId: event.target.value })}
          >
            <option value="">Choose credit card</option>
            {creditCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </SelectInput>
        </Field>
      )}
      {form.linkType === 'debt' && (
        <Field label="Debt" hint={debtHint}>
          <SelectInput
            value={form.linkedEntityId}
            onChange={(event) => onChange({ ...form, linkedEntityId: event.target.value })}
          >
            <option value="">Choose debt</option>
            {debts.map((debt) => (
              <option key={debt.id} value={debt.id}>
                {debt.name} · {formatPence(debt.currentBalancePence)}
              </option>
            ))}
          </SelectInput>
        </Field>
      )}
      <Field label="Symbol">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {iconOptions.map((option) => {
            const Icon = option.Icon

            return (
              <button
                key={option.key}
                type="button"
                aria-label={`Use ${option.label} symbol`}
                onClick={() => onChange({ ...form, icon: option.key })}
                className={clsx(
                  'flex size-10 items-center justify-center rounded-xl border transition',
                  option.key === form.icon
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
                title={option.label}
              >
                <Icon size={18} />
              </button>
            )
          })}
        </div>
      </Field>
      <Field label="Colour">
        <div className="flex flex-wrap gap-2">
          {colors.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`Use colour ${option}`}
              onClick={() => onChange({ ...form, color: option })}
              className="size-8 rounded-full border-2"
              style={{
                backgroundColor: option,
                borderColor: option === form.color ? '#0f172a' : 'white',
                boxShadow: option === form.color ? '0 0 0 2px #cbd5e1' : '0 0 0 1px #e2e8f0',
              }}
            />
          ))}
        </div>
      </Field>
    </>
  )
}

function potFormToPayload(form: PotFormState) {
  return {
    name: form.name.trim(),
    type: form.type,
    category: cleanCategory(form.category) || defaultCategoryForPotType(form.type),
    icon: form.icon,
    balancePence: form.balance ? parsePoundsToPence(form.balance) : 0,
    targetPence: form.paycheckAmount ? parsePoundsToPence(form.paycheckAmount) : null,
    color: form.color,
    linkedCreditCardId: form.linkType === 'credit_card' ? form.linkedEntityId || null : null,
    linkedDebtId: form.linkType === 'debt' ? form.linkedEntityId || null : null,
  }
}

function canSubmitPotForm(form: PotFormState, snapshot: PlannerSnapshot): boolean {
  if (!form.name.trim()) {
    return false
  }

  if (form.linkType === 'credit_card') {
    return snapshot.creditCards.some((card) => card.id === form.linkedEntityId && !card.archived)
  }

  if (form.linkType === 'debt') {
    return snapshot.debts.some(
      (debt) =>
        debt.id === form.linkedEntityId &&
        debt.status !== 'archived' &&
        debt.currentBalancePence > 0,
    )
  }

  return true
}

function getSelectableCreditCards(snapshot: PlannerSnapshot, linkedEntityId: string) {
  return snapshot.creditCards.filter((card) => !card.archived || card.id === linkedEntityId)
}

function getSelectableDebts(snapshot: PlannerSnapshot, linkedEntityId: string) {
  return snapshot.debts.filter((debt) => debt.status !== 'archived' || debt.id === linkedEntityId)
}

function getDefaultLinkedEntityId(
  linkType: PotLinkType,
  creditCards: PlannerSnapshot['creditCards'],
  debts: PlannerSnapshot['debts'],
): string {
  if (linkType === 'credit_card') {
    return creditCards.length === 1 ? creditCards[0].id : ''
  }

  if (linkType === 'debt') {
    return debts.length === 1 ? debts[0].id : ''
  }

  return ''
}

function getPotTopUpAllocationPrefix(payPeriodId: string, potId: string): string {
  return `pot-top-up-${payPeriodId}-${potId}`
}

function createPotTopUpAllocationId(payPeriodId: string, potId: string): string {
  const randomSuffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  return `${getPotTopUpAllocationPrefix(payPeriodId, potId)}-${randomSuffix}`
}

function isPotTopUpAllocation(allocation: PotAllocation): boolean {
  return (
    allocation.source === 'manual' &&
    !allocation.recurringPaymentId &&
    allocation.id.startsWith('pot-top-up-')
  )
}

function formatTopUpDate(value: string): string {
  return value.slice(0, 10)
}

function getPotLinkType(pot: Pot): PotLinkType {
  if (pot.linkedCreditCardId) {
    return 'credit_card'
  }

  if (pot.linkedDebtId) {
    return 'debt'
  }

  return 'none'
}

function isSavingsPotType(type: PotType): boolean {
  return type === 'saving' || type === 'investment' || type === 'buffer'
}

function formatPotTypeLabel(type: PotType): string {
  if (type === 'saving') {
    return 'Saving'
  }

  if (type === 'reserved') {
    return 'Reserved'
  }

  if (type === 'investment') {
    return 'Investment'
  }

  if (type === 'buffer') {
    return 'Buffer'
  }

  return 'Spending'
}

function getActivityCountLabel(count: number): string {
  if (count === 0) {
    return 'No activity'
  }

  return `${count} activit${count === 1 ? 'y' : 'ies'}`
}

function getPotProgress(pot: Pot, snapshot: PlannerSnapshot, today: string): PotProgress {
  const sourceLabels: string[] = []
  let linkedTargetPence = 0
  let dueIso: string | null = null
  let usesForecastTarget = false

  const linkedRecurringPayments = getPotLinkedRecurringPayments(pot.id, snapshot)
  const recurringTargetPence = linkedRecurringPayments.reduce((total, payment) => total + payment.amountPence, 0)

  if (recurringTargetPence > 0) {
    linkedTargetPence += recurringTargetPence
    sourceLabels.push('Recurring')
    dueIso = minIsoDate(dueIso, getEarliestRecurringDueDate(linkedRecurringPayments, today))
  }

  if (pot.linkedCreditCardId) {
    const creditCardPayPeriod = getCurrentOrLatestPayPeriod(snapshot.payPeriods, today)
    const cardSummary = getCreditCardAllocationSummary({
      creditCards: snapshot.creditCards,
      recurringPayments: snapshot.recurringPayments,
      customPayments: snapshot.customPayments,
      transactions: snapshot.transactions,
      repayments: snapshot.creditCardRepayments,
      creditCardPots: snapshot.creditCardPots,
      pots: snapshot.pots,
      payPeriod: creditCardPayPeriod,
      asOfDate: today,
    }).cards.find((summary) => summary.card.id === pot.linkedCreditCardId)

    if (cardSummary) {
      const cardUsesForecastTarget = cardSummary.forecastOwedPence > cardSummary.actualOwedPence
      const cardTargetPence = cardUsesForecastTarget
        ? cardSummary.forecastOwedPence
        : cardSummary.actualOwedPence

      if (cardTargetPence > 0) {
        linkedTargetPence += cardTargetPence
        usesForecastTarget = usesForecastTarget || cardUsesForecastTarget
        sourceLabels.push(`${cardSummary.card.name} card`)
        dueIso = minIsoDate(
          dueIso,
          cardUsesForecastTarget
            ? creditCardPayPeriod?.payday ?? getCreditCardDueIso(cardSummary.card, today)
            : getCreditCardDueIso(cardSummary.card, today),
        )
      }
    }
  }

  if (pot.linkedCreditCardId) {
    const card = snapshot.creditCards.find((candidate) => candidate.id === pot.linkedCreditCardId)

    if (!card) {
      sourceLabels.push(`missing card ${pot.linkedCreditCardId}`)
    }
  }

  if (pot.linkedDebtId) {
    const debt = snapshot.debts.find((candidate) => candidate.id === pot.linkedDebtId && candidate.status !== 'archived')

    if (debt && debt.currentBalancePence > 0) {
      linkedTargetPence += debt.currentBalancePence
      sourceLabels.push(`${debt.name} debt`)
      dueIso = minIsoDate(dueIso, debt.dueDate)
    }
  }

  const manualTargetPence = Math.max(0, pot.targetPence ?? 0)
  const targetPence = linkedTargetPence > 0 ? linkedTargetPence : manualTargetPence
  const coveredPence = Math.max(0, pot.balancePence)
  const shortfallPence = Math.max(0, targetPence - coveredPence)

  return {
    targetPence,
    coveredPence,
    percent: targetPence > 0 ? Math.round((coveredPence / targetPence) * 100) : 0,
    targetLabel: targetPence > 0 ? `${formatPence(targetPence)}${usesForecastTarget ? ' forecast target' : ' target'}` : 'No target yet',
    sourceLabels,
    shortfallPence,
    dueIso,
  }
}

function getCurrentOrLatestPayPeriod(payPeriods: PlannerSnapshot['payPeriods'], today: string): PlannerSnapshot['payPeriods'][number] | null {
  const currentPeriod = findPayPeriodForDate(payPeriods, today)

  if (currentPeriod) {
    return currentPeriod
  }

  const activePeriod = payPeriods.find((period) => period.status === 'active')

  if (activePeriod) {
    return activePeriod
  }

  const previousPeriods = payPeriods
    .filter((period) => period.startDate <= today)
    .sort((left, right) => right.startDate.localeCompare(left.startDate))

  if (previousPeriods[0]) {
    return previousPeriods[0]
  }

  return [...payPeriods].sort((left, right) => right.startDate.localeCompare(left.startDate))[0] ?? null
}

function getPotDueLabel(progress: PotProgress, today: string): string | null {
  if (progress.targetPence <= 0 || progress.shortfallPence <= 0) {
    return null
  }

  if (!progress.dueIso) {
    return `Top up ${formatPence(progress.shortfallPence)}`
  }

  const days = getDaysUntil(progress.dueIso, today)
  const dueText = days <= 0 ? 'Due now' : `Due in ${days} day${days === 1 ? '' : 's'}`

  return `${dueText} • ${formatPence(progress.shortfallPence)} left`
}

function getPotActivityItems(potId: string, snapshot: PlannerSnapshot): PotActivityItem[] {
  const transactions = snapshot.transactions
    .filter((transaction) => transaction.potId === potId)
    .map((transaction) => transactionToActivityItem(transaction))
  const allocations = snapshot.potAllocations
    .filter((allocation) => allocation.potId === potId)
    .map((allocation) => allocationToActivityItem(allocation, snapshot))

  return [...transactions, ...allocations]
}

function getPotLinkedRecurringPayments(potId: string, snapshot: PlannerSnapshot): RecurringPayment[] {
  return snapshot.recurringPayments
    .filter((payment) => payment.active && payment.potId === potId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function getPotBalanceBreakdown(
  potId: string,
  balancePence: number,
  activityItems: PotActivityItem[],
): CalculationBreakdown {
  const activityNetPence = activityItems.reduce((total, item) => total + item.amountPence, 0)
  const startingOrImportedPence = balancePence - activityNetPence

  return {
    formula: 'Pot balance = starting/imported balance + recorded activity shown below.',
    lines: [
      {
        label: 'Starting or imported balance',
        value: formatPence(startingOrImportedPence),
        detail: `Balance not represented by the visible activity for this pot (${potId}).`,
        tone: startingOrImportedPence >= 0 ? 'add' : 'subtract',
      },
      ...activityItems.map((item) => ({
        label: item.title,
        value: formatSignedPence(item.amountPence),
        detail: item.detail,
        tone: item.amountPence >= 0 ? ('add' as const) : ('subtract' as const),
      })),
      {
        label: 'Current pot balance',
        value: formatPence(balancePence),
        tone: 'result',
      },
    ],
    note: 'This explains the displayed balance using the pot record plus the activity currently stored for it.',
  }
}

function transactionToActivityItem(transaction: Transaction): PotActivityItem {
  const isSpending = transaction.type === 'spending'

  return {
    id: `transaction-${transaction.id}`,
    title: transaction.note,
    detail: `${transaction.recurringPaymentId ? 'Recurring payment' : formatTransactionType(transaction.type)} · ${transaction.date}`,
    amountPence: isSpending ? -transaction.amountPence : transaction.amountPence,
  }
}

function allocationToActivityItem(allocation: PotAllocation, snapshot: PlannerSnapshot): PotActivityItem {
  const period = snapshot.payPeriods.find((candidate) => candidate.id === allocation.payPeriodId)
  const payment = allocation.recurringPaymentId
    ? snapshot.recurringPayments.find((candidate) => candidate.id === allocation.recurringPaymentId)
    : null

  return {
    id: `allocation-${allocation.id}`,
    title: payment
      ? `Reserved for ${payment.name}`
      : allocation.source === 'pot_auto'
        ? 'Automatic payday top-up'
        : 'Paycheck allocation',
    detail: `Allocation · ${period?.payday ?? allocation.createdAt.slice(0, 10)}`,
    amountPence: allocation.amountPence,
  }
}

function getPotCategoryOptions(pots: Pot[], customCategories: string[]): string[] {
  const categories = new Set<string>(builtinCategories)

  for (const pot of pots) {
    categories.add(getPotCategory(pot))
  }

  for (const category of customCategories) {
    const clean = cleanCategory(category)

    if (clean) {
      categories.add(clean)
    }
  }

  return Array.from(categories)
}

function isPotInCategory(pot: Pot, category: string): boolean {
  if (category === customCategoryAll) {
    return true
  }

  if (category === 'Spending') {
    return getPotCategory(pot) === 'Spending' || pot.type === 'spending'
  }

  if (category === 'Bills') {
    return getPotCategory(pot) === 'Bills' || pot.type === 'reserved'
  }

  if (category === 'Savings') {
    return getPotCategory(pot) === 'Savings' || pot.type === 'saving' || pot.type === 'investment' || pot.type === 'buffer'
  }

  return getPotCategory(pot).toLowerCase() === category.toLowerCase()
}

function getPotCategory(pot: Pot): string {
  return cleanCategory(pot.category ?? '') || defaultCategoryForPotType(pot.type)
}

function defaultCategoryForPotType(type: PotType): string {
  if (type === 'reserved') {
    return 'Bills'
  }

  if (type === 'saving' || type === 'investment' || type === 'buffer') {
    return 'Savings'
  }

  return 'Spending'
}

function isBuiltinPotCategory(category: string): boolean {
  return builtinCategories.some((builtin) => builtin.toLowerCase() === category.toLowerCase())
}

function cleanCategory(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 32)
}

function getPotIconOption(pot: Pot) {
  const key = getPotIconKey(pot)

  return iconOptions.find((option) => option.key === key) ?? iconOptions[0]
}

function getPotIconKey(pot: Pot): string {
  if (pot.icon && iconOptions.some((option) => option.key === pot.icon)) {
    return pot.icon
  }

  const name = pot.name.toLowerCase()

  if (/airbnb|rent|home|house/.test(name)) {
    return 'home'
  }

  if (/card|amex|capital|barclays|jaja|zable|credit/.test(name)) {
    return 'card'
  }

  if (/car|insurance|cover|tax/.test(name)) {
    return 'shield'
  }

  if (/fuel|petrol|diesel/.test(name)) {
    return 'fuel'
  }

  if (/gym|fitness/.test(name)) {
    return 'gym'
  }

  if (/food|grocery|groceries|lunch/.test(name)) {
    return 'food'
  }

  if (/saving|goal/.test(name)) {
    return 'savings'
  }

  return 'wallet'
}

function getEarliestRecurringDueDate(payments: RecurringPayment[], today: string): string | null {
  return payments.reduce<string | null>((earliest, payment) => {
    const dueDate = payment.dueDate ?? (payment.dueDay ? getNextDueDayIso(payment.dueDay, today) : null)

    return minIsoDate(earliest, dueDate)
  }, null)
}

function getCreditCardDueIso(card: PlannerSnapshot['creditCards'][number], today: string): string | null {
  return card.dueDate ?? (card.dueDay ? getNextDueDayIso(card.dueDay, today) : null)
}

function getNextDueDayIso(dueDay: number, todayIso: string): string {
  const [year, month] = todayIso.split('-').map(Number)
  let targetYear = year
  let targetMonthIndex = month - 1
  let candidate = getDueDayIso(targetYear, targetMonthIndex, dueDay)

  if (candidate < todayIso) {
    targetMonthIndex += 1

    if (targetMonthIndex > 11) {
      targetMonthIndex = 0
      targetYear += 1
    }

    candidate = getDueDayIso(targetYear, targetMonthIndex, dueDay)
  }

  return candidate
}

function getDueDayIso(year: number, monthIndex: number, dueDay: number): string {
  const day = Math.min(Math.max(1, dueDay), getDaysInMonth(year, monthIndex))

  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function minIsoDate(left: string | null, right: string | null): string | null {
  if (!left) {
    return right
  }

  if (!right) {
    return left
  }

  return right < left ? right : left
}

function getDaysUntil(isoDate: string, todayIso: string): number {
  const today = isoDateToUtcMillis(todayIso)
  const due = isoDateToUtcMillis(isoDate)

  return Math.ceil((due - today) / 86_400_000)
}

function isoDateToUtcMillis(value: string): number {
  const [year, month, day] = value.split('-').map(Number)

  return Date.UTC(year, month - 1, day)
}

function formatTransactionType(type: Transaction['type']): string {
  if (type === 'spending') {
    return 'Spending'
  }

  return type.charAt(0).toUpperCase() + type.slice(1)
}

function formatSignedPence(amountPence: number): string {
  if (amountPence > 0) {
    return `+${formatPence(amountPence)}`
  }

  return formatPence(amountPence)
}
