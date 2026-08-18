import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { clsx } from 'clsx'
import { ChevronDown } from 'lucide-react'

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

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-label={title} className={clsx('rounded-lg border border-slate-200 bg-white p-5 shadow-sm', className)}>
      {(title || description || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-950">{title}</h2>}
            {description && <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}) {
  return (
    <button
      className={clsx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-slate-950 text-white hover:bg-slate-800 focus-visible:outline-slate-950',
        variant === 'secondary' && 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        className,
      )}
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
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100',
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
        'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100',
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
        'min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100',
        className,
      )}
      {...props}
    />
  )
}

export function MoneyMetric({
  label,
  value,
  tone = 'neutral',
  breakdown,
}: {
  label: string
  value: string
  tone?: 'neutral' | 'primary' | 'good' | 'warning' | 'bad'
  breakdown?: CalculationBreakdown
}) {
  const isPrimary = tone === 'primary'
  const className = clsx(
    'rounded-lg border p-4',
    tone === 'neutral' && 'border-slate-200 bg-white',
    tone === 'primary' && 'border-slate-950 bg-slate-950 text-white',
    tone === 'good' && 'border-emerald-200 bg-emerald-50',
    tone === 'warning' && 'border-amber-200 bg-amber-50',
    tone === 'bad' && 'border-red-200 bg-red-50',
  )
  const labelClassName = isPrimary ? 'text-slate-300' : 'text-slate-500'
  const valueClassName = isPrimary ? 'text-white' : 'text-slate-950'

  if (!breakdown) {
    return (
      <div className={className}>
        <p className={clsx('text-xs font-semibold uppercase tracking-wide', labelClassName)}>{label}</p>
        <p className={clsx('mt-2 text-2xl font-semibold', valueClassName)}>{value}</p>
      </div>
    )
  }

  return (
    <details className={clsx(className, 'group')}>
      <summary className="-m-2 cursor-pointer list-none rounded-md p-2 outline-none transition focus-visible:ring-4 focus-visible:ring-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={clsx('text-xs font-semibold uppercase tracking-wide', labelClassName)}>{label}</p>
            <p className={clsx('mt-2 text-2xl font-semibold', valueClassName)}>{value}</p>
          </div>
          <ChevronDown
            size={18}
            className={clsx('mt-1 shrink-0 transition group-open:rotate-180', isPrimary ? 'text-slate-300' : 'text-slate-500')}
          />
        </div>
        <p className={clsx('mt-3 text-xs font-semibold', isPrimary ? 'text-slate-300' : 'text-slate-500')}>
          Show calculation
        </p>
      </summary>
      <CalculationDetails breakdown={breakdown} inverted={isPrimary} />
    </details>
  )
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
        'mt-4 rounded-lg border p-3',
        inverted ? 'border-white/10 bg-white/10' : 'border-slate-200 bg-white/70',
      )}
    >
      {breakdown.formula && (
        <p className={clsx('text-xs leading-5', inverted ? 'text-slate-200' : 'text-slate-500')}>
          {breakdown.formula}
        </p>
      )}
      <div className="mt-3 space-y-2">
        {breakdown.lines.map((line) => (
          <div key={`${line.label}-${line.value}`} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
            <div className="min-w-0">
              <p className={clsx('font-medium', inverted ? 'text-slate-100' : 'text-slate-700')}>{line.label}</p>
              {line.detail && (
                <p className={clsx('mt-0.5 text-xs leading-5', inverted ? 'text-slate-300' : 'text-slate-500')}>
                  {line.detail}
                </p>
              )}
            </div>
            <p className={clsx('font-semibold', calculationLineValueClass(line.tone, inverted))}>{line.value}</p>
          </div>
        ))}
      </div>
      {breakdown.note && (
        <p className={clsx('mt-3 border-t pt-3 text-xs leading-5', inverted ? 'border-white/10 text-slate-300' : 'border-slate-100 text-slate-500')}>
          {breakdown.note}
        </p>
      )}
    </div>
  )
}

function calculationLineValueClass(tone: CalculationLine['tone'] = 'neutral', inverted: boolean): string {
  if (tone === 'add') {
    return inverted ? 'text-emerald-200' : 'text-emerald-700'
  }

  if (tone === 'subtract') {
    return inverted ? 'text-red-200' : 'text-red-700'
  }

  if (tone === 'result') {
    return inverted ? 'text-white' : 'text-slate-950'
  }

  if (tone === 'muted') {
    return inverted ? 'text-slate-300' : 'text-slate-500'
  }

  return inverted ? 'text-slate-100' : 'text-slate-700'
}
