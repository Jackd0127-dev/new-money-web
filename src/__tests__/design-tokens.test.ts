/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd()

function readProjectFile(path: string) {
  return readFileSync(join(root, path), 'utf8').toLowerCase()
}

describe('premium fintech design tokens', () => {
  it('defines the shared premium fintech token contract', () => {
    const css = readProjectFile('src/index.css')

    expect(css).toContain('--color-app-bg: #f3f5f1;')
    expect(css).toContain('--color-surface: #ffffff;')
    expect(css).toContain('--color-surface-soft: #f8faf6;')
    expect(css).toContain('--color-emerald: #0b3d2e;')
    expect(css).toContain('--color-accent: #a7f15b;')
    expect(css).toContain('--color-success: #147a55;')
    expect(css).toContain('--color-danger: #b13a32;')
    expect(css).toContain('--color-warning: #b7791f;')
    expect(css).toContain('--color-deep-navy: #071426;')
    expect(css).toContain('--radius-card: 8px;')
    expect(css).toContain('--shadow-card:')
    expect(css).toContain('--font-ui:')
    expect(css).toContain('.fintech-pill')
    expect(css).toContain('.fintech-button')
  })

  it('uses the app background and shared token classes in core UI surfaces', () => {
    const shell = readProjectFile('src/components/AppShell.tsx')
    const ui = readProjectFile('src/components/ui.tsx')

    expect(shell).toContain('bg-[var(--color-app-bg)]')
    expect(ui).toContain('fintech-surface')
    expect(ui).toContain('fintech-button')
  })

  it('prevents horizontal page overflow and enforces mobile touch targets', () => {
    const css = readProjectFile('src/index.css')

    expect(css).toContain('overflow-x: hidden;')
    expect(css).toContain('@media (max-width: 639px)')
    expect(css).toContain('min-width: 44px;')
    expect(css).toContain('min-height: 44px;')
  })

  it('keeps the floating assistant trigger free of animated gradient rings', () => {
    const css = readProjectFile('src/index.css')

    expect(css).toContain('.ai-assistant-trigger')
    expect(css).not.toContain('.ai-assistant-trigger::before')
  })

  it('keeps assistant chrome on the shared neutral token system', () => {
    const css = readProjectFile('src/index.css')
    const assistant = readProjectFile('src/components/AppAssistant.tsx')

    expect(css).not.toContain('ai-assistant-gradient')
    expect(css).not.toContain('#4285f4')
    expect(assistant).not.toContain('radial-gradient')
    expect(assistant).not.toContain('linear-gradient')
  })

  it('keeps page chrome free of decorative gradients outside card artwork', () => {
    const files = [
      'src/pages/AiPlanPage.tsx',
      'src/pages/DashboardPage.tsx',
      'src/pages/AllocatingPaymentsPage.tsx',
      'src/pages/SavingsInvestmentsPage.tsx',
      'src/pages/HistoryPage.tsx',
      'src/pages/CalendarPage.tsx',
      'src/components/RecurringCalendar.tsx',
      'src/components/AuthScreen.tsx',
    ]

    for (const file of files) {
      const source = readProjectFile(file)

      expect(source).not.toContain('bg-[linear-gradient')
      expect(source).not.toContain('bg-[radial-gradient')
      expect(source).not.toContain('bg-gradient-')
    }
  })

  it('keeps shared CSS free of decorative gradient backgrounds', () => {
    const css = readProjectFile('src/index.css')

    expect(css).not.toContain('linear-gradient(')
    expect(css).not.toContain('radial-gradient(')
  })
})
