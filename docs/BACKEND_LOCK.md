# Backend Lock

The finance backend is locked for UI-focused work.

## Locked Areas

Treat these paths as backend or calculation code:

- `src/domain/**`
- `src/storage/**`
- `src/firebase/**`
- `src/hooks/useCloudSync.ts`
- `src/hooks/useFirebaseAuth.ts`
- `src/hooks/usePlannerData.ts`
- `src/types/models.ts`
- `api/**`
- `server/**`
- `firestore.rules`

Do not change these paths for visual layout, wording, spacing, grouping, or navigation work. UI work should stay in:

- `src/pages/**`
- `src/components/**`
- `src/index.css`
- static presentation assets under `public/**`

## Allowed Backend Changes

Backend changes are allowed only when the task explicitly requires a calculation, persistence, authentication, sync, or API behavior change. When that happens:

1. Add or update a regression test for the exact behavior.
2. Keep money as integer pence.
3. Keep actual, forecast, pot, debt, and statement concepts separate.
4. Run `npm run check:backend`.
5. Note the backend reason in the commit message or PR summary.

## Frozen Financial Contracts

- Pot balances are stored separately from card and debt balances.
- Adding money to a linked pot must not change actual card balance or actual available credit.
- Card statement direct debits deduct statement due from the linked pot on the direct debit date.
- Debt due dates deduct from linked debt pots only when the debt is due.
- Weekly and biweekly recurring payments use their anchor date and never monthly due-day fallback.
- Dashboard checklist items can carry forward across paychecks until completed.
- Calendar entries must show completed and pending items explicitly.

## Verification Commands

Use these before any backend-affecting commit:

```bash
npm run check:backend
```

Use the full project gate before deploys:

```bash
npm run check
```
