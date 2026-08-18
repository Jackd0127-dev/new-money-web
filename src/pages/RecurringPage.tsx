import { useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import {
  CalendarDays,
  ChevronDown,
  CreditCard,
  PauseCircle,
  PenLine,
  PiggyBank,
  PlayCircle,
  Trash2,
} from 'lucide-react'

import {
  formatPence,
  getAppTodayIso,
  getRecurringPaymentOccurrences,
  parsePoundsToPence,
  type RecurringPaymentOccurrence,
} from '../domain/money'
import type { PlannerActions, PlannerSnapshot } from '../hooks/usePlannerData'
import {
  Button,
  Field,
  FormDrawer,
  Panel,
  SectionGrid,
  SelectInput,
  TextInput,
} from '../components/ui'
import type {
  PayPeriod,
  RecurringFrequency,
  RecurringPayment,
  RecurringPriority,
} from '../types/models'

interface RecurringFormState {
  name: string
  amount: string
  dueDay: string
  dueDate: string
  frequency: RecurringFrequency
  priority: RecurringPriority
  potId: string
  creditCardId: string
}

export function RecurringPage({
  snapshot,
  actions,
  selectedPayPeriod,
  isCreateOpen = false,
  onCreateOpenChange,
}: {
  snapshot: PlannerSnapshot
  actions: PlannerActions
  selectedPayPeriod?: PayPeriod | null
  isCreateOpen?: boolean
  onCreateOpenChange?: (isOpen: boolean) => void
}) {
  const today = getAppTodayIso(snapshot.settings)
  const activePots = snapshot.pots.filter((pot) => !pot.archived)
  const activeCards = snapshot.creditCards.filter((card) => !card.archived)
  const [createForm, setCreateForm] = useState<RecurringFormState>(() =>
    createEmptyRecurringForm(activePots[0]?.id ?? ''),
  )
  const [expandedPaymentIds, setExpandedPaymentIds] = useState<Set<string>>(() => new Set())
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<RecurringFormState | null>(null)
  const viewedPeriod = selectedPayPeriod ?? null
  const billsSummary = getBillsSummary(snapshot.recurringPayments, viewedPeriod, today)
  const upcomingBillItems = getUpcomingBillAgendaItems(snapshot.recurringPayments, today)
  const dueSoonPaymentIds = new Set(
    billsSummary.currentPeriodOccurrences.map((occurrence) => occurrence.payment.id),
  )

  async function submitPayment(form: RecurringFormState, mode: 'create' | 'edit') {
    const amountPence = parsePoundsToPence(form.amount)
    const dueDayNumber = Number.parseInt(form.dueDay, 10)
    const usesIntervalAnchor = isIntervalFrequency(form.frequency)

    if (
      !form.name.trim() ||
      amountPence <= 0 ||
      (!usesIntervalAnchor && (dueDayNumber < 1 || dueDayNumber > 31)) ||
      (usesIntervalAnchor && !isIsoDateInput(form.dueDate))
    ) {
      return
    }
    const dueDay = usesIntervalAnchor ? null : dueDayNumber
    const dueDate = usesIntervalAnchor ? form.dueDate : null

    if (mode === 'edit' && editingPaymentId) {
      const currentPayment = snapshot.recurringPayments.find((candidate) => candidate.id === editingPaymentId)
      const updateInput = {
        name: form.name.trim(),
        amountPence,
        dueDay,
        dueDate,
        frequency: form.frequency,
        potId: form.potId || null,
        priority: form.priority,
        ...(form.creditCardId || currentPayment?.creditCardId
          ? {
              creditCardId: form.creditCardId || null,
            }
          : {}),
      }

      await actions.updateRecurringPayment(editingPaymentId, updateInput)
      closeEditModal()
      return
    }

    const addInput = {
      name: form.name.trim(),
      amountPence,
      dueDay,
      dueDate,
      frequency: form.frequency,
      potId: form.potId || null,
      priority: form.priority,
      ...(form.creditCardId
        ? {
            creditCardId: form.creditCardId,
          }
        : {}),
    }

    await actions.addRecurringPayment(addInput)
    resetCreateForm()
    onCreateOpenChange?.(false)
  }

  function startEditingPayment(paymentId: string) {
    const payment = snapshot.recurringPayments.find((candidate) => candidate.id === paymentId)

    if (!payment) {
      return
    }

    setEditingPaymentId(payment.id)
    setEditForm({
      name: payment.name,
      amount: (payment.amountPence / 100).toFixed(2),
      dueDay: String(payment.dueDay ?? 1),
      dueDate: payment.dueDate ?? '',
      frequency: payment.frequency,
      priority: payment.priority,
      potId: payment.potId ?? '',
      creditCardId: payment.creditCardId ?? '',
    })
  }

  function resetCreateForm() {
    setCreateForm(createEmptyRecurringForm(activePots[0]?.id ?? ''))
  }

  function closeCreateDrawer() {
    resetCreateForm()
    onCreateOpenChange?.(false)
  }

  function closeEditModal() {
    setEditingPaymentId(null)
    setEditForm(null)
  }

  function togglePaymentDetails(paymentId: string) {
    setExpandedPaymentIds((current) => {
      const next = new Set(current)

      if (next.has(paymentId)) {
        next.delete(paymentId)
      } else {
        next.add(paymentId)
      }

      return next
    })
  }

  const paymentGroups = getRecurringPaymentGroups(snapshot.recurringPayments)

  return (
    <div className="min-w-0 space-y-4">
      <BillsSummaryHeader summary={billsSummary} viewedPeriod={viewedPeriod} />

      <SectionGrid variant="wideLeft" className="gap-4">
        <div className="space-y-4">
          <Panel
            title="Bills list"
            accent="blue"
            density="compact"
          >
            <div className="space-y-4 xl:max-h-[690px] xl:overflow-y-auto xl:pr-1">
              {snapshot.recurringPayments.length > 0 ? (
                paymentGroups.map((group) => (
                  <RecurringPaymentSection
                    key={group.id}
                    label={group.label}
                    payments={group.payments}
                    pots={snapshot.pots}
                    creditCards={snapshot.creditCards}
                    dueSoonPaymentIds={dueSoonPaymentIds}
                    expandedPaymentIds={expandedPaymentIds}
                    onToggleDetails={togglePaymentDetails}
                    onToggleActive={(payment) => actions.toggleRecurringPayment(payment)}
                    onEdit={startEditingPayment}
                    onDelete={(payment) => {
                      if (window.confirm(`Delete ${payment.name}?`)) {
                        void actions.deleteRecurringPayment(payment.id)
                      }
                    }}
                  />
                ))
              ) : (
                <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] p-6 text-center">
                  <p className="text-base font-semibold text-[var(--color-text-primary)]">No bills yet.</p>
                  <p className="mt-1 text-sm leading-5 text-[var(--color-text-muted)]">Add a bill to start tracking recurring payments.</p>
                </div>
              )}
            </div>
          </Panel>
        </div>

        <UpcomingBillsAgendaPanel items={upcomingBillItems} />
      </SectionGrid>

      <FormDrawer
        open={isCreateOpen}
        title="Add recurring payment"
        description="Add the bill details, source pot, and optional credit card link."
        closeLabel="Close add recurring payment"
        onClose={closeCreateDrawer}
        footer={
          <>
            <Button variant="secondary" onClick={closeCreateDrawer}>
              Cancel
            </Button>
            <Button onClick={() => void submitPayment(createForm, 'create')}>
              Add recurring payment
            </Button>
          </>
        }
      >
        <RecurringPaymentFormFields
          form={createForm}
          activePots={activePots}
          activeCards={activeCards}
          onChange={setCreateForm}
        />
      </FormDrawer>

      {editingPaymentId && editForm && (
        <FormDrawer
          open
          title="Edit recurring payment"
          description="Update this bill without changing the add-payment form."
          closeLabel="Close edit recurring payment"
          onClose={closeEditModal}
          footer={
            <>
              <Button variant="secondary" onClick={closeEditModal}>
                Cancel
              </Button>
              <Button onClick={() => void submitPayment(editForm, 'edit')}>Save recurring payment</Button>
            </>
          }
        >
          <RecurringPaymentFormFields
            form={editForm}
            activePots={activePots}
            activeCards={activeCards}
            onChange={setEditForm}
          />
        </FormDrawer>
      )}
    </div>
  )
}

function createEmptyRecurringForm(defaultPotId: string): RecurringFormState {
  return {
    name: '',
    amount: '',
    dueDay: '1',
    dueDate: '',
    frequency: 'monthly',
    priority: 'essential',
    potId: defaultPotId,
    creditCardId: '',
  }
}

interface BillsSummary {
  activeBillCount: number
  billsThisPayPeriodPence: number
  beforeNextPaydayPence: number
  currentPeriodOccurrences: RecurringPaymentOccurrence[]
  nextOccurrence: RecurringPaymentOccurrence | null
}

function getBillsSummary(
  payments: RecurringPayment[],
  viewedPeriod: PayPeriod | null,
  today: string,
): BillsSummary {
  const activePayments = payments.filter((payment) => payment.active)
  const currentPeriodOccurrences = viewedPeriod
    ? getRecurringPaymentOccurrences(activePayments, viewedPeriod.startDate, viewedPeriod.endDate)
    : []
  const nextOccurrence = getRecurringPaymentOccurrences(activePayments, today, getOneYearFromIso(today))[0] ?? null
  const currentPeriodTotalPence = currentPeriodOccurrences.reduce((total, occurrence) => total + occurrence.amountPence, 0)

  return {
    activeBillCount: activePayments.length,
    billsThisPayPeriodPence: currentPeriodTotalPence,
    beforeNextPaydayPence: viewedPeriod ? currentPeriodTotalPence : 0,
    currentPeriodOccurrences,
    nextOccurrence,
  }
}

function getOneYearFromIso(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`)

  date.setUTCFullYear(date.getUTCFullYear() + 1)

  return date.toISOString().slice(0, 10)
}

interface UpcomingBillAgendaItem {
  id: string
  payment: RecurringPayment
  dueDate: string
  amountPence: number
}

function getUpcomingBillAgendaItems(
  payments: RecurringPayment[],
  today: string,
): UpcomingBillAgendaItem[] {
  const agendaEndDate = getOneYearFromIso(today)

  return payments
    .filter((payment) => payment.active)
    .map((payment) => getRecurringPaymentOccurrences([payment], today, agendaEndDate)[0])
    .filter((occurrence): occurrence is RecurringPaymentOccurrence => Boolean(occurrence))
    .sort((first, second) => first.dueDate.localeCompare(second.dueDate))
    .slice(0, 8)
    .map((occurrence) => ({
      id: `${occurrence.payment.id}-${occurrence.dueDate}`,
      payment: occurrence.payment,
      dueDate: occurrence.dueDate,
      amountPence: occurrence.amountPence,
    }))
}

function UpcomingBillsAgendaPanel({
  items,
}: {
  items: UpcomingBillAgendaItem[]
}) {
  return (
    <Panel
      title="Upcoming bills"
      accent="amber"
      density="compact"
      description="Next scheduled recurring payments only."
    >
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => {
            return (
              <article
                key={item.id}
                className="grid min-w-0 gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--color-text-primary)]">{item.payment.name}</h3>
                    <BillChip label={item.payment.priority} />
                  </div>
                  <p className="mt-1 truncate text-xs leading-5 text-[var(--color-text-muted)]">
                    <time dateTime={item.dueDate}>{item.dueDate}</time>
                    <span aria-hidden="true"> · </span>
                    <span>{item.payment.frequency}</span>
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm font-semibold text-[var(--color-text-primary)]">
                  {formatPence(item.amountPence)}
                </p>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3 text-sm leading-5 text-[var(--color-text-muted)]">
          No upcoming bills scheduled.
        </p>
      )}
    </Panel>
  )
}

function BillsSummaryHeader({
  summary,
  viewedPeriod,
}: {
  summary: BillsSummary
  viewedPeriod: PayPeriod | null
}) {
  return (
    <section
      aria-label="Bills summary"
      className="fintech-surface relative max-w-full min-w-0 overflow-hidden rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[var(--color-deep-navy)]" aria-hidden="true" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--color-emerald)]">
            <CalendarDays size={18} aria-hidden="true" />
            <h1 className="text-2xl font-semibold leading-8 text-[var(--color-text-primary)] md:text-3xl md:leading-10">Bills</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--color-text-muted)]">
            {viewedPeriod ? `${viewedPeriod.startDate} to ${viewedPeriod.endDate}` : 'Choose a pay period to see due bills.'}
            <span className="block">{summary.activeBillCount} active bill{summary.activeBillCount === 1 ? '' : 's'}</span>
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <BillsSummaryMetric label="Bills this pay period" value={formatPence(summary.billsThisPayPeriodPence)} />
        <BillsSummaryMetric
          label="Next bill due"
          value={summary.nextOccurrence?.payment.name ?? 'No bills scheduled'}
          detail={summary.nextOccurrence?.dueDate}
        />
      </div>
    </section>
  )
}

function BillsSummaryMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 shadow-[var(--shadow-card-soft)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-7 text-[var(--color-text-primary)]">{value}</p>
      {detail && <p className="mt-1 text-sm leading-5 text-[var(--color-text-muted)]">{detail}</p>}
    </article>
  )
}

function getRecurringPaymentGroups(payments: RecurringPayment[]): Array<{
  id: string
  label: string
  payments: RecurringPayment[]
}> {
  return [
    {
      id: 'active',
      label: 'Active',
      payments: payments.filter((payment) => payment.active),
    },
    {
      id: 'paused',
      label: 'Paused',
      payments: payments.filter((payment) => !payment.active),
    },
  ].filter((group) => group.payments.length > 0)
}

function RecurringPaymentSection({
  label,
  payments,
  pots,
  creditCards,
  dueSoonPaymentIds,
  expandedPaymentIds,
  onToggleDetails,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  label: string
  payments: RecurringPayment[]
  pots: PlannerSnapshot['pots']
  creditCards: PlannerSnapshot['creditCards']
  dueSoonPaymentIds: Set<string>
  expandedPaymentIds: Set<string>
  onToggleDetails: (paymentId: string) => void
  onToggleActive: (payment: RecurringPayment) => void
  onEdit: (paymentId: string) => void
  onDelete: (payment: RecurringPayment) => void
}) {
  return (
    <section aria-label={`${label} bills`} className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
        <p className="text-xs font-semibold text-slate-500">{payments.length}</p>
      </div>
      <div className="grid gap-2">
        {payments.map((payment) => {
          const pot = pots.find((candidate) => candidate.id === payment.potId)
          const card = creditCards.find((candidate) => candidate.id === payment.creditCardId)
          const cardLabel = getRecurringCreditCardLabel(payment.creditCardId, card)
          const isExpanded = expandedPaymentIds.has(payment.id)
          const isDueSoon = dueSoonPaymentIds.has(payment.id)

          return (
            <RecurringPaymentCard
              key={payment.id}
              payment={payment}
              pot={pot}
              cardLabel={cardLabel}
              isDueSoon={isDueSoon}
              isExpanded={isExpanded}
              onToggleDetails={() => onToggleDetails(payment.id)}
              onToggleActive={() => onToggleActive(payment)}
              onEdit={() => onEdit(payment.id)}
              onDelete={() => onDelete(payment)}
            />
          )
        })}
      </div>
    </section>
  )
}

function RecurringPaymentCard({
  payment,
  pot,
  cardLabel,
  isDueSoon,
  isExpanded,
  onToggleDetails,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  payment: RecurringPayment
  pot: PlannerSnapshot['pots'][number] | undefined
  cardLabel: string | null
  isDueSoon: boolean
  isExpanded: boolean
  onToggleDetails: () => void
  onToggleActive: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const potLabel = payment.potId ? pot?.name ?? 'Archived pot' : 'No pot'

  return (
    <article
      role="article"
      aria-label={`${payment.name} bill row`}
      className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-none transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-soft)]"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(170px,0.5fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              aria-label={`${payment.name} status ${payment.active ? 'active' : 'paused'}`}
              className={payment.active ? 'size-2 rounded-full bg-[var(--color-success)]' : 'size-2 rounded-full bg-[var(--color-border-strong)]'}
            />
            <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--color-text-primary)]">{payment.name}</h3>
            <BillChip label={payment.priority} />
            {!payment.active && <BillChip label="Paused" tone="muted" />}
            {payment.active && isDueSoon && <BillChip label="Due soon" tone="warning" />}
          </div>
          <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
            {getRecurringScheduleLabel(payment)} · {payment.frequency}
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap gap-1.5">
          <CompactMetaPill icon={<PiggyBank size={12} />} label={potLabel} muted={!payment.potId} />
          {cardLabel && <CompactMetaPill icon={<CreditCard size={12} />} label={cardLabel} />}
        </div>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <p className="shrink-0 text-right text-sm font-semibold text-[var(--color-text-primary)]">{formatPence(payment.amountPence)}</p>
          <div className="flex items-center gap-1">
            <IconButton
              onClick={onToggleDetails}
              ariaLabel={`${isExpanded ? 'Hide' : 'Show'} ${payment.name} details`}
              title={`${isExpanded ? 'Hide' : 'Show'} ${payment.name} details`}
            >
              <ChevronDown size={15} className={clsx('transition', isExpanded && 'rotate-180')} />
            </IconButton>
            <IconButton
              onClick={onToggleActive}
              ariaLabel={`${payment.active ? 'Pause' : 'Resume'} ${payment.name}`}
              title={`${payment.active ? 'Pause' : 'Resume'} ${payment.name}`}
            >
              {payment.active ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
            </IconButton>
            <IconButton onClick={onEdit} ariaLabel={`Edit ${payment.name}`} title={`Edit ${payment.name}`}>
              <PenLine size={15} />
            </IconButton>
            <IconButton
              onClick={onDelete}
              ariaLabel={`Delete ${payment.name}`}
              title={`Delete ${payment.name}`}
              tone="danger"
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 grid gap-2 border-t border-[var(--color-border)] pt-3 text-xs sm:grid-cols-2">
          <CompactDetail label="Schedule" value={`${getRecurringScheduleLabel(payment)} · ${payment.frequency}`} />
          <CompactDetail label="Amount" value={formatPence(payment.amountPence)} />
          <CompactDetail label="Pot" value={payment.potId ? `Paid from ${pot?.name ?? 'Archived pot'}` : 'No pot linked'} />
          <CompactDetail label="Card" value={cardLabel ? `Charged to ${cardLabel}` : 'No card linked'} />
        </div>
      )}
    </article>
  )
}

function CompactMetaPill({ icon, label, muted = false }: { icon: ReactNode; label: string; muted?: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex max-w-full items-center gap-1 rounded-[var(--radius-control)] border px-2 py-1 text-[11px] font-semibold',
        muted
          ? 'border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text-muted)]'
          : 'border-[color:rgba(11,61,46,0.16)] bg-[rgba(11,61,46,0.05)] text-[var(--color-emerald)]',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  )
}

function BillChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'warning' | 'muted' }) {
  return (
    <span
      className={clsx(
        'shrink-0 rounded-[var(--radius-control)] border px-2 py-1 text-[11px] font-semibold capitalize',
        tone === 'neutral' && 'border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)]',
        tone === 'warning' && 'border-[color:rgba(183,121,31,0.22)] bg-[rgba(183,121,31,0.08)] text-[var(--color-warning)]',
        tone === 'muted' && 'border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-text-muted)]',
      )}
    >
      {label}
    </span>
  )
}

function CompactDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-2">
      <p className="font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 font-semibold text-[var(--color-text-primary)]">{value}</p>
    </div>
  )
}

function IconButton({
  children,
  onClick,
  ariaLabel,
  title,
  tone = 'neutral',
}: {
  children: ReactNode
  onClick: () => void
  ariaLabel: string
  title: string
  tone?: 'neutral' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={clsx(
        'inline-flex size-7 items-center justify-center rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        tone === 'neutral' &&
          'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] focus-visible:outline-[var(--color-emerald)]',
        tone === 'danger' &&
          'border border-[color:rgba(177,58,50,0.22)] bg-[rgba(177,58,50,0.06)] text-[var(--color-danger)] hover:-translate-y-0.5 hover:bg-[rgba(177,58,50,0.1)] focus-visible:outline-[var(--color-danger)]',
      )}
    >
      {children}
    </button>
  )
}

function getRecurringScheduleLabel(payment: { dueDay?: number | null; dueDate?: string | null; frequency: RecurringFrequency }): string {
  if (isIntervalFrequency(payment.frequency)) {
    return payment.dueDate ? `First due ${payment.dueDate}` : 'First due date missing'
  }

  return payment.dueDay ? `Due day ${payment.dueDay}` : 'Due day missing'
}

function getRecurringCreditCardLabel(
  creditCardId: string | null | undefined,
  card: PlannerSnapshot['creditCards'][number] | undefined,
): string | null {
  if (!creditCardId) {
    return null
  }

  return card ? card.name : `missing card ${creditCardId}`
}

function isIntervalFrequency(frequency: RecurringFrequency): boolean {
  return frequency === 'weekly' || frequency === 'biweekly'
}

function isIsoDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function RecurringPaymentFormFields({
  form,
  activePots,
  activeCards,
  onChange,
}: {
  form: RecurringFormState
  activePots: PlannerSnapshot['pots']
  activeCards: PlannerSnapshot['creditCards']
  onChange: (form: RecurringFormState) => void
}) {
  const usesIntervalAnchor = isIntervalFrequency(form.frequency)

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div className="sm:col-span-2 xl:col-span-1">
        <Field label="Name">
          <TextInput
            className="h-9"
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            placeholder="Phone bill"
          />
        </Field>
      </div>
      <Field label="Amount">
        <TextInput
          className="h-9"
          inputMode="decimal"
          value={form.amount}
          onChange={(event) => onChange({ ...form, amount: event.target.value })}
          placeholder="22.00"
        />
      </Field>
      <div className="grid gap-3 sm:contents">
        {usesIntervalAnchor ? (
          <Field label="First due date">
            <TextInput
              className="h-9"
              type="date"
              value={form.dueDate}
              onChange={(event) => onChange({ ...form, dueDate: event.target.value })}
            />
          </Field>
        ) : (
          <Field label="Due day">
            <TextInput
              className="h-9"
              inputMode="numeric"
              value={form.dueDay}
              onChange={(event) => onChange({ ...form, dueDay: event.target.value })}
            />
          </Field>
        )}
        <Field label="Frequency">
          <SelectInput
            className="h-9"
            value={form.frequency}
            onChange={(event) => onChange({ ...form, frequency: event.target.value as RecurringFrequency })}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </SelectInput>
        </Field>
      </div>
      <Field label="Paid from pot">
        <SelectInput
          className="h-9"
          value={form.potId}
          onChange={(event) => onChange({ ...form, potId: event.target.value })}
        >
          <option value="">No pot</option>
          {activePots.map((pot) => (
            <option key={pot.id} value={pot.id}>
              {pot.name}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Paid on credit card">
        <SelectInput
          className="h-9"
          value={form.creditCardId}
          onChange={(event) => onChange({ ...form, creditCardId: event.target.value })}
        >
          <option value="">Unlinked</option>
          {activeCards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.name} ({card.provider})
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Priority">
        <SelectInput
          className="h-9"
          value={form.priority}
          onChange={(event) => onChange({ ...form, priority: event.target.value as RecurringPriority })}
        >
          <option value="essential">Essential</option>
          <option value="important">Important</option>
          <option value="optional">Optional</option>
        </SelectInput>
      </Field>
    </div>
  )
}
