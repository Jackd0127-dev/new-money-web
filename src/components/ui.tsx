import { useEffect, useId, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { clsx } from 'clsx'
import { ChevronDown, LoaderCircle, X } from 'lucide-react'

export interface CalculationLine {
  label: string
  value: string
  detail?: string
  tone?: 'neutral' | 'add' | 'subtract' | 'result' | 'muted'
}

export interface CalculationBreakdown {
  formula?: string
  lines: CalculationLine[]
  note?: string
}

type PanelAccent = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan' | 'fuchsia'
type CardElement = 'article' | 'div' | 'section'
type CardPadding = 'none' | 'sm' | 'md' | 'lg'
type CardVariant = 'surface' | 'soft' | 'dark'
type PrimitiveTone = 'neutral' | 'success' | 'warning' | 'danger' | 'emerald'
type ActionButtonVariant = 'primary' | 'secondary' | 'subtle' | 'destructive'
type LegacyButtonVariant = ActionButtonVariant | 'danger' | 'ghost'
type RowTone = 'neutral' | 'success' | 'warning' | 'danger'

const drawerFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Card({
  as = 'div',
  variant = 'surface',
  padding = 'md',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  as?: CardElement
  variant?: CardVariant
  padding?: CardPadding
}) {
  const Component = as

  return (
    <Component
      className={clsx(cardVariantClassName(variant), cardPaddingClassName(padding), className)}
      {...props}
    />
  )
}

function cardVariantClassName(variant: CardVariant): string {
  if (variant === 'soft') {
    return 'fintech-surface-soft'
  }

  if (variant === 'dark') {
    return 'rounded-[var(--radius-card)] border border-[var(--color-deep-navy)] bg-[var(--color-deep-navy)] text-white shadow-[var(--shadow-card)]'
  }

  return 'fintech-surface'
}

function cardPaddingClassName(padding: CardPadding): string {
  if (padding === 'none') {
    return ''
  }

  if (padding === 'sm') {
    return 'p-4'
  }

  if (padding === 'lg') {
    return 'p-6'
  }

  return 'p-5'
}

export function Pill({
  tone = 'neutral',
  icon,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: PrimitiveTone
  icon?: ReactNode
}) {
  return (
    <span className={clsx('fintech-pill', pillToneClassName(tone), className)} {...props}>
      {icon}
      {children}
    </span>
  )
}

function pillToneClassName(tone: PrimitiveTone): string {
  if (tone === 'success') {
    return 'border-[color:rgba(20,122,85,0.24)] text-[var(--color-success)]'
  }

  if (tone === 'warning') {
    return 'border-[color:rgba(183,121,31,0.28)] text-[var(--color-warning)]'
  }

  if (tone === 'danger') {
    return 'border-[color:rgba(177,58,50,0.24)] text-[var(--color-danger)]'
  }

  if (tone === 'emerald') {
    return 'border-[color:rgba(11,61,46,0.24)] text-[var(--color-emerald)]'
  }

  return 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
}

export function SectionHeader({
  title,
  description,
  action,
  actionClassName,
  className,
  headingLevel = 2,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  actionClassName?: string
  className?: string
  headingLevel?: 1 | 2 | 3
}) {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3'

  return (
    <div className={clsx('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {title && (
          <Heading
            className={clsx(
              'font-semibold text-[var(--color-text-primary)]',
              headingLevel === 1 ? 'text-2xl leading-8 md:text-3xl md:leading-10' : 'text-base',
            )}
          >
            {title}
          </Heading>
        )}
        {description && <p className="mt-1 text-sm leading-5 text-[var(--color-text-muted)]">{description}</p>}
      </div>
      {action && <div className={clsx('w-full shrink-0 sm:w-auto', actionClassName)}>{action}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('flex flex-col items-start gap-3 xl:flex-row xl:items-center xl:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="flex flex-wrap items-center gap-2">{eyebrow}</div>}
        <h1 className="mt-1 text-2xl font-semibold leading-8 text-[var(--color-text-primary)] md:text-3xl md:leading-10">
          {title}
        </h1>
        {description && <p className="hidden text-sm leading-5 text-[var(--color-text-muted)] sm:block">{description}</p>}
      </div>
      {action && <div className="grid w-full gap-2 sm:grid-cols-[1fr_auto] xl:w-auto">{action}</div>}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] p-6 text-center', className)}>
      {icon && (
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface)] text-[var(--color-emerald)]">
          {icon}
        </div>
      )}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
      {description && <p className="mx-auto mt-1 max-w-md text-sm leading-5 text-[var(--color-text-muted)]">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function TransactionRow({
  title,
  description,
  date,
  amount,
  tone = 'neutral',
  meta,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  date?: ReactNode
  amount: ReactNode
  tone?: RowTone
  meta?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <article className={clsx(rowBaseClassName(), className)}>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
          {meta}
        </div>
        {(description || date) && (
          <p className="mt-1 min-w-0 truncate text-xs leading-5 text-[var(--color-text-muted)]">
            {[description, date].filter(Boolean).map((item, index) => (
              <span key={index}>
                {index > 0 && <span aria-hidden="true"> · </span>}
                {item}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <p className={clsx('text-right text-sm font-semibold', rowAmountToneClassName(tone))}>{amount}</p>
        {action}
      </div>
    </article>
  )
}

export function PaymentRow({
  title,
  source,
  sourceTone = 'neutral',
  date,
  amount,
  status,
  control,
  className,
}: {
  title: ReactNode
  source?: ReactNode
  sourceTone?: PrimitiveTone
  date?: ReactNode
  amount: ReactNode
  status?: ReactNode
  control?: ReactNode
  className?: string
}) {
  return (
    <article className={clsx(rowBaseClassName(), className)}>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
          {source && <Pill tone={sourceTone}>{source}</Pill>}
          {status}
        </div>
        {date && <p className="mt-1 truncate text-xs leading-5 text-[var(--color-text-muted)]">{date}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
        <p className="text-right text-sm font-semibold text-[var(--color-text-primary)]">{amount}</p>
        {control}
      </div>
    </article>
  )
}

function rowBaseClassName(): string {
  return 'grid min-w-0 gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'
}

function rowAmountToneClassName(tone: RowTone): string {
  if (tone === 'success') {
    return 'text-[var(--color-success)]'
  }

  if (tone === 'warning') {
    return 'text-[var(--color-warning)]'
  }

  if (tone === 'danger') {
    return 'text-[var(--color-danger)]'
  }

  return 'text-[var(--color-text-primary)]'
}

export function FormDrawer({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  closeLabel = 'Close drawer',
  className,
}: {
  open: boolean
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  closeLabel?: string
  className?: string
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) {
      return
    }

    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const focusable =
      bodyRef.current?.querySelector<HTMLElement>(drawerFocusableSelector) ??
      dialog?.querySelector<HTMLElement>(drawerFocusableSelector)

    focusable?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousActiveElement?.focus()
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(7,10,8,0.28)] px-3 py-3 sm:px-5" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={clsx('flex h-full w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] outline-none', className)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm leading-5 text-[var(--color-text-muted)]">{description}</p>}
          </div>
          <IconButton label={closeLabel} size="sm" variant="subtle" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] p-4 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  )
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  accent = 'slate',
  density = 'normal',
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  accent?: PanelAccent
  density?: 'normal' | 'compact'
}) {
  return (
    <Card
      as="section"
      aria-label={title}
      padding={density === 'compact' ? 'sm' : 'md'}
      className={clsx(
        'app-panel relative max-w-full min-w-0 overflow-hidden',
        panelAccentClassName(accent),
        className,
      )}
    >
      <span className={clsx('pointer-events-none absolute inset-x-0 top-0 h-1', panelAccentBarClassName(accent))} aria-hidden="true" />
      {(title || description || action) && (
        <SectionHeader
          title={title}
          description={description}
          action={action}
          actionClassName="app-panel__action"
          className={clsx(
            'app-panel__header flex flex-col gap-4 border-b border-slate-100/80 sm:flex-row sm:items-start sm:justify-between',
            density === 'compact' ? 'mb-3 pb-3' : 'mb-4 pb-4',
          )}
        />
      )}
      {children}
    </Card>
  )
}

export function SectionGrid({
  children,
  variant = 'balanced',
  className,
}: {
  children: ReactNode
  variant?: 'balanced' | 'wideLeft' | 'wideRight' | 'compactLeft' | 'three'
  className?: string
}) {
  return (
    <div
      className={clsx(
        'grid items-start gap-6',
        variant === 'balanced' && 'xl:grid-cols-2',
        variant === 'wideLeft' && 'xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]',
        variant === 'wideRight' && 'xl:grid-cols-[minmax(320px,0.65fr)_minmax(0,1.35fr)]',
        variant === 'compactLeft' && 'xl:grid-cols-[minmax(280px,0.55fr)_minmax(0,1.45fr)]',
        variant === 'three' && 'xl:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

function panelAccentClassName(accent: PanelAccent): string {
  if (accent === 'blue') {
    return 'border-[var(--color-border)]'
  }

  if (accent === 'emerald') {
    return 'border-[color:rgba(11,61,46,0.24)]'
  }

  if (accent === 'amber') {
    return 'border-[color:rgba(183,121,31,0.28)]'
  }

  if (accent === 'rose') {
    return 'border-[color:rgba(177,58,50,0.24)]'
  }

  if (accent === 'violet') {
    return 'border-[var(--color-border)]'
  }

  if (accent === 'cyan') {
    return 'border-[color:rgba(11,61,46,0.18)]'
  }

  if (accent === 'fuchsia') {
    return 'border-[var(--color-border)]'
  }

  return 'border-[var(--color-border)]'
}

function panelAccentBarClassName(accent: PanelAccent): string {
  if (accent === 'blue') {
    return 'bg-[var(--color-deep-navy)]'
  }

  if (accent === 'emerald') {
    return 'bg-[var(--color-emerald)]'
  }

  if (accent === 'amber') {
    return 'bg-[var(--color-warning)]'
  }

  if (accent === 'rose') {
    return 'bg-[var(--color-danger)]'
  }

  if (accent === 'violet') {
    return 'bg-[var(--color-ink)]'
  }

  if (accent === 'cyan') {
    return 'bg-[var(--color-emerald)]'
  }

  if (accent === 'fuchsia') {
    return 'bg-[var(--color-accent-strong)]'
  }

  return 'bg-[var(--color-border-strong)]'
}

function actionButtonVariantClassName(variant: ActionButtonVariant): string {
  if (variant === 'secondary') {
    return 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-none hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-soft)] focus-visible:outline-[var(--color-emerald)]'
  }

  if (variant === 'subtle') {
    return 'border border-transparent bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)] shadow-none hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] focus-visible:outline-[var(--color-emerald)]'
  }

  if (variant === 'destructive') {
    return 'bg-[var(--color-danger)] text-white hover:-translate-y-0.5 hover:bg-[#942f29] focus-visible:outline-[var(--color-danger)]'
  }

  return 'bg-[var(--color-deep-navy)] text-white hover:-translate-y-0.5 hover:bg-[var(--color-ink)] focus-visible:outline-[var(--color-deep-navy)]'
}

function normalizeActionButtonVariant(variant: LegacyButtonVariant): ActionButtonVariant {
  if (variant === 'danger') {
    return 'destructive'
  }

  if (variant === 'ghost') {
    return 'subtle'
  }

  return variant
}

export function ActionButton({
  variant = 'primary',
  isLoading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ActionButtonVariant
  isLoading?: boolean
}) {
  return (
    <button
      {...props}
      aria-busy={isLoading ? true : props['aria-busy']}
      disabled={disabled || isLoading}
      className={clsx(
        'fintech-button inline-flex min-h-10 items-center justify-center gap-2 px-4 text-sm font-semibold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        actionButtonVariantClassName(variant),
        className,
      )}
    >
      {isLoading && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  variant = 'secondary',
  isLoading = false,
  size = 'md',
  className,
  children,
  disabled,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string
  variant?: ActionButtonVariant
  isLoading?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      aria-label={label}
      aria-busy={isLoading ? true : props['aria-busy']}
      disabled={disabled || isLoading}
      className={clsx(
        'fintech-button inline-flex shrink-0 items-center justify-center text-sm font-semibold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'size-9',
        size === 'md' && 'size-10',
        size === 'lg' && 'size-11',
        actionButtonVariantClassName(variant),
        className,
      )}
    >
      {isLoading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : children}
    </button>
  )
}

export function Button({
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: LegacyButtonVariant
  isLoading?: boolean
}) {
  return (
    <ActionButton
      variant={normalizeActionButtonVariant(variant)}
      {...props}
    />
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[var(--color-text-secondary)]">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-[var(--color-text-muted)]">{hint}</span>}
    </label>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] shadow-none outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-emerald)] focus:ring-4 focus:ring-[rgba(11,61,46,0.12)]',
        className,
      )}
      {...props}
    />
  )
}

export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        'h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] shadow-none outline-none transition focus:border-[var(--color-emerald)] focus:ring-4 focus:ring-[rgba(11,61,46,0.12)]',
        className,
      )}
      {...props}
    />
  )
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        'min-h-24 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] shadow-none outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-emerald)] focus:ring-4 focus:ring-[rgba(11,61,46,0.12)]',
        className,
      )}
      {...props}
    />
  )
}

export function HeroMoneyCard({
  label,
  value,
  description,
  action,
  breakdown,
  open,
  onOpenChange,
  className: classNameProp,
}: {
  label: string
  value: string
  description?: ReactNode
  action?: ReactNode
  breakdown?: CalculationBreakdown
  open?: boolean
  onOpenChange?: (isOpen: boolean) => void
  className?: string
}) {
  const cardClassName = clsx(
    'relative h-fit self-start overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-deep-navy)] bg-[var(--color-deep-navy)] p-5 text-white shadow-[var(--shadow-card)]',
    classNameProp,
  )

  if (!breakdown) {
    return (
      <article className={cardClassName}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
            {description && <p className="mt-2 text-sm leading-5 text-white/70">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </article>
    )
  }

  return (
    <details
      className={clsx(cardClassName, 'group')}
      open={open}
      onToggle={(event) => onOpenChange?.(event.currentTarget.open)}
    >
      <summary className="-m-2 cursor-pointer list-none rounded-md p-2 outline-none transition focus-visible:ring-4 focus-visible:ring-[rgba(11,61,46,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
            {description && <p className="mt-2 text-sm leading-5 text-white/70">{description}</p>}
          </div>
          <ChevronDown
            size={18}
            className="mt-1 shrink-0 text-white/70 transition group-open:rotate-180"
          />
        </div>
      </summary>
      <CalculationDetails breakdown={breakdown} inverted />
    </details>
  )
}

export function MetricCard({
  label,
  value,
  tone = 'neutral',
  detail,
  icon,
  breakdown,
  open,
  onOpenChange,
  className: classNameProp,
}: {
  label: string
  value: string
  tone?: 'neutral' | 'primary' | 'good' | 'warning' | 'bad'
  detail?: ReactNode
  icon?: ReactNode
  breakdown?: CalculationBreakdown
  open?: boolean
  onOpenChange?: (isOpen: boolean) => void
  className?: string
}) {
  if (tone === 'primary') {
    return (
      <HeroMoneyCard
        label={label}
        value={value}
        description={detail}
        breakdown={breakdown}
        open={open}
        onOpenChange={onOpenChange}
        className={classNameProp}
      />
    )
  }

  const cardClassName = clsx(
    'relative h-fit self-start overflow-hidden rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card-soft)]',
    metricCardClassName(tone),
    classNameProp,
  )
  const labelClassName = metricLabelClassName(tone)

  if (!breakdown) {
    return (
      <article className={cardClassName}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={clsx('text-xs font-semibold uppercase tracking-wide', labelClassName)}>{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{value}</p>
            {detail && <p className="mt-1 text-sm leading-5 text-[var(--color-text-muted)]">{detail}</p>}
          </div>
          {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface)] text-[var(--color-emerald)]">{icon}</span>}
        </div>
      </article>
    )
  }

  return (
    <details
      className={clsx(cardClassName, 'group')}
      open={open}
      onToggle={(event) => onOpenChange?.(event.currentTarget.open)}
    >
      <summary className="-m-2 cursor-pointer list-none rounded-md p-2 outline-none transition focus-visible:ring-4 focus-visible:ring-[rgba(11,61,46,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={clsx('text-xs font-semibold uppercase tracking-wide', labelClassName)}>{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{value}</p>
            {detail && <p className="mt-1 text-sm leading-5 text-[var(--color-text-muted)]">{detail}</p>}
          </div>
          <ChevronDown size={18} className="mt-1 shrink-0 text-[var(--color-text-muted)] transition group-open:rotate-180" />
        </div>
      </summary>
      <CalculationDetails breakdown={breakdown} />
    </details>
  )
}

export function MoneyMetric(props: Parameters<typeof MetricCard>[0]) {
  return <MetricCard {...props} />
}

export function ProgressBar({
  percent,
  label,
  color,
  className,
  trackClassName,
  fillClassName,
}: {
  percent: number
  label?: string
  color?: string
  className?: string
  trackClassName?: string
  fillClassName?: string
}) {
  const safePercent = Math.max(0, percent)
  const baseWidth = `${Math.min(100, safePercent)}%`
  const overTargetPercent = Math.max(0, safePercent - 100)
  const overTargetWidth = `${Math.min(100, overTargetPercent)}%`
  const fillBackground = color ?? 'var(--color-accent)'

  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, safePercent)}
        className={clsx('relative h-2.5 overflow-hidden rounded-full bg-[rgba(11,61,46,0.08)] ring-1 ring-[rgba(11,61,46,0.08)]', trackClassName)}
      >
        <span
          className={clsx('block h-full rounded-full transition-all shadow-sm', fillClassName)}
          style={{
            width: baseWidth,
            background: fillBackground,
          }}
        />
        {overTargetPercent > 0 && (
          <span
            className="absolute inset-y-0 right-0 w-8 bg-white/60"
            aria-hidden="true"
          />
        )}
      </div>
      {overTargetPercent > 0 && (
        <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(11,61,46,0.08)]">
            <span
              className="block h-full rounded-full bg-[var(--color-success)]"
              style={{ width: overTargetWidth }}
            />
          </div>
          <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--color-success)]">
            +{overTargetPercent}%
          </span>
        </div>
      )}
    </div>
  )
}

export function ProgressRail(props: Parameters<typeof ProgressBar>[0]) {
  return <ProgressBar {...props} />
}

function metricCardClassName(tone: 'neutral' | 'primary' | 'good' | 'warning' | 'bad'): string {
  if (tone === 'primary') {
    return 'border-[var(--color-deep-navy)] bg-[var(--color-deep-navy)] text-white'
  }

  if (tone === 'good') {
    return 'border-[color:rgba(20,122,85,0.24)] bg-[var(--color-surface-soft)]'
  }

  if (tone === 'warning') {
    return 'border-[color:rgba(183,121,31,0.28)] bg-[var(--color-surface-soft)]'
  }

  if (tone === 'bad') {
    return 'border-[color:rgba(177,58,50,0.24)] bg-[var(--color-surface-soft)]'
  }

  return 'border-[var(--color-border)] bg-[var(--color-surface)]'
}

function metricLabelClassName(tone: 'neutral' | 'primary' | 'good' | 'warning' | 'bad'): string {
  if (tone === 'good') {
    return 'text-[var(--color-success)]'
  }

  if (tone === 'warning') {
    return 'text-[var(--color-warning)]'
  }

  if (tone === 'bad') {
    return 'text-[var(--color-danger)]'
  }

  return 'text-[var(--color-text-muted)]'
}

export function CalculationDetails({
  breakdown,
  inverted = false,
}: {
  breakdown: CalculationBreakdown
  inverted?: boolean
}) {
  return (
    <div
      className={clsx(
        'mt-4 rounded-2xl border p-3 shadow-inner',
        inverted ? 'border-white/10 bg-white/10 shadow-white/5' : 'border-[var(--color-border)] bg-[var(--color-surface-soft)] shadow-none',
      )}
    >
      {breakdown.formula && (
        <p className={clsx('text-xs leading-5', inverted ? 'text-white/75' : 'text-[var(--color-text-muted)]')}>
          {breakdown.formula}
        </p>
      )}
      <div className="mt-3 space-y-2">
        {breakdown.lines.map((line) => (
          <div key={`${line.label}-${line.value}`} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
            <div className="min-w-0">
              <p className={clsx('font-medium', inverted ? 'text-white/90' : 'text-[var(--color-text-secondary)]')}>{line.label}</p>
              {line.detail && (
                <p className={clsx('mt-0.5 text-xs leading-5', inverted ? 'text-white/65' : 'text-[var(--color-text-muted)]')}>
                  {line.detail}
                </p>
              )}
            </div>
            <p className={clsx('font-semibold', calculationLineValueClass(line.tone, inverted))}>{line.value}</p>
          </div>
        ))}
      </div>
      {breakdown.note && (
        <p className={clsx('mt-3 border-t pt-3 text-xs leading-5', inverted ? 'border-white/10 text-white/65' : 'border-[var(--color-border)] text-[var(--color-text-muted)]')}>
          {breakdown.note}
        </p>
      )}
    </div>
  )
}

function calculationLineValueClass(tone: CalculationLine['tone'] = 'neutral', inverted: boolean): string {
  if (tone === 'add') {
    return inverted ? 'text-emerald-100' : 'text-[var(--color-success)]'
  }

  if (tone === 'subtract') {
    return inverted ? 'text-red-100' : 'text-[var(--color-danger)]'
  }

  if (tone === 'result') {
    return inverted ? 'text-white' : 'text-[var(--color-text-primary)]'
  }

  if (tone === 'muted') {
    return inverted ? 'text-white/65' : 'text-[var(--color-text-muted)]'
  }

  return inverted ? 'text-white/90' : 'text-[var(--color-text-secondary)]'
}
