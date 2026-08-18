import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import {
  ActionButton,
  Card,
  EmptyState,
  FormDrawer,
  HeroMoneyCard,
  IconButton,
  MetricCard,
  PageHeader,
  PaymentRow,
  Pill,
  ProgressBar,
  SectionHeader,
  TransactionRow,
} from '../ui'

describe('premium fintech UI primitives', () => {
  it('renders the shared primitive set with token-based surfaces and controls', () => {
    render(
      <div>
        <Card data-testid="primitive-card">Cashflow card</Card>
        <MetricCard label="Net position" value="+£420.00" tone="good" detail="After bills" />
        <HeroMoneyCard label="Current pay" value="£2,400.00" description="Available this period" />
        <ActionButton>Primary action</ActionButton>
        <ActionButton variant="secondary">Secondary action</ActionButton>
        <ActionButton variant="subtle" disabled>
          Subtle action
        </ActionButton>
        <ActionButton variant="destructive" isLoading>
          Delete item
        </ActionButton>
        <IconButton label="Refresh totals">
          <RefreshCw size={16} />
        </IconButton>
        <Pill tone="success">Live</Pill>
        <ProgressBar percent={64} label="Paycheck coverage" />
        <SectionHeader title="Section title" description="Section context" />
        <PageHeader
          title="Page title"
          description="Page context"
          eyebrow={<Pill tone="neutral">Workspace</Pill>}
          action={<ActionButton variant="secondary">Page action</ActionButton>}
        />
      </div>,
    )

    expect(screen.getByTestId('primitive-card')).toHaveClass('fintech-surface')
    expect(screen.getByText('Net position')).toBeInTheDocument()
    expect(screen.getByText('Current pay')).toBeInTheDocument()
    expect(screen.getByText('Live')).toHaveClass('fintech-pill')
    expect(screen.getByRole('button', { name: 'Primary action' })).toHaveClass('fintech-button')
    expect(screen.getByRole('button', { name: 'Secondary action' })).toHaveClass('border-[var(--color-border)]')
    expect(screen.getByRole('button', { name: 'Subtle action' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete item' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Refresh totals' })).toHaveClass('fintech-button')
    expect(screen.getByRole('progressbar', { name: 'Paycheck coverage' })).toHaveAttribute('aria-valuenow', '64')
    expect(screen.getByRole('heading', { name: 'Section title' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Page title' })).toBeInTheDocument()
  })

  it('renders compact row and empty-state primitives without financial logic', () => {
    render(
      <div>
        <TransactionRow
          title="Train ticket"
          description="Travel pot"
          date="31 May"
          amount="-£18.40"
          tone="danger"
          meta={<Pill tone="neutral">Spending</Pill>}
          action={<IconButton label="Edit train ticket" size="sm"><RefreshCw size={16} /></IconButton>}
        />
        <PaymentRow
          title="Rent"
          source="Bill"
          date="1 Jun"
          amount="£850.00"
          status={<Pill tone="warning">Due soon</Pill>}
          control={<ActionButton variant="secondary">Link card</ActionButton>}
        />
        <EmptyState
          title="No transactions yet"
          description="Add spending when money leaves this pay period."
          action={<ActionButton>Log spend</ActionButton>}
        />
      </div>,
    )

    expect(screen.getByText('Train ticket')).toBeInTheDocument()
    expect(screen.getByText('-£18.40')).toHaveClass('text-[var(--color-danger)]')
    expect(screen.getByText('Rent')).toBeInTheDocument()
    expect(screen.getByText('Bill')).toHaveClass('fintech-pill')
    expect(screen.getByRole('button', { name: 'Edit train ticket' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No transactions yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log spend' })).toBeInTheDocument()
  })

  it('keeps expandable calculation cards visually quiet', async () => {
    const user = userEvent.setup()
    const breakdown = {
      title: 'Net position calculation',
      lines: [
        { label: 'Income', value: '+£1,200.00', tone: 'add' as const },
        { label: 'Bills', value: '-£420.00', tone: 'subtract' as const },
      ],
    }

    render(
      <div>
        <MetricCard label="Net position" value="£780.00" breakdown={breakdown} />
        <HeroMoneyCard label="Current pay" value="£1,200.00" breakdown={breakdown} />
      </div>,
    )

    expect(screen.queryByText('Show calculation')).not.toBeInTheDocument()

    const netPositionCard = screen.getByText('Net position').closest('details')
    expect(netPositionCard).not.toBeNull()

    await user.click((netPositionCard as HTMLDetailsElement).querySelector('summary') as HTMLElement)

    expect(netPositionCard).toHaveAttribute('open')
    expect(within(netPositionCard as HTMLDetailsElement).getByText('Income')).toBeInTheDocument()
    expect(within(netPositionCard as HTMLDetailsElement).getByText('Bills')).toBeInTheDocument()
  })

  it('opens, closes, submits, cancels, and handles Escape in FormDrawer', async () => {
    const user = userEvent.setup()
    const submittedValues: string[] = []

    function DrawerHarness() {
      const [isOpen, setIsOpen] = useState(false)

      return (
        <div>
          <ActionButton onClick={() => setIsOpen(true)}>Open drawer</ActionButton>
          <FormDrawer
            open={isOpen}
            title="Add payment"
            description="Compact form surface"
            onClose={() => setIsOpen(false)}
            footer={
              <>
                <ActionButton type="submit" form="payment-form">Save payment</ActionButton>
                <ActionButton variant="secondary" onClick={() => setIsOpen(false)}>Cancel</ActionButton>
              </>
            }
          >
            <form
              id="payment-form"
              onSubmit={(event) => {
                event.preventDefault()
                const formData = new FormData(event.currentTarget)
                submittedValues.push(String(formData.get('paymentName')))
                setIsOpen(false)
              }}
            >
              <label>
                Payment name
                <input name="paymentName" />
              </label>
            </form>
          </FormDrawer>
        </div>
      )
    }

    render(<DrawerHarness />)

    await user.click(screen.getByRole('button', { name: 'Open drawer' }))
    const drawer = screen.getByRole('dialog', { name: 'Add payment' })

    expect(drawer).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Payment name')).toHaveFocus()

    await user.type(screen.getByLabelText('Payment name'), 'Council tax')
    await user.click(screen.getByRole('button', { name: 'Save payment' }))

    expect(submittedValues).toEqual(['Council tax'])
    expect(screen.queryByRole('dialog', { name: 'Add payment' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open drawer' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Add payment' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open drawer' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Add payment' })).not.toBeInTheDocument()
  })
})
