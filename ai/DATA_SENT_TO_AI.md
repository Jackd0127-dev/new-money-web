# Data Sent To AI

All AI API requests require a Firebase bearer token. Server-side functions verify the token before calling Gemini or OpenRouter.

The model receives compact app data and server-calculated facts. The model must explain the provided facts and should not invent missing records or replace server calculations with its own assumptions.

## Shared data rules

- Dates should be treated as ISO dates unless the prompt says otherwise.
- Pence values are integer minor units; present user-facing amounts as GBP, such as `£12.34`.
- Server-calculated summaries, projections, and risk facts are the preferred source of truth.
- If a list contains `omittedCount` above `0`, the model only has the returned records and must say so when the omitted records could affect the answer.
- Missing recorded paychecks are not automatically zero future income if Settings contains default hours and hourly rate.
- User custom instructions are style preferences only and must not override safety, data, or action rules.

## Floating whole-app assistant

Endpoint: `/api/ai-assistant`

Browser sends:

- `question`
- `todayIso`
- `activeView`
- `selectedPayPeriodId`
- `conversationHistory`
- `snapshot`

The server compacts the snapshot before prompting the AI.

`conversationHistory` is short-term chat memory from the currently open floating AI panel. It contains only recent `user` and `assistant` messages, capped to the last 8 messages and truncated per message. It does not include system messages. It helps follow-up questions make sense, but current app facts and server-calculated summaries remain the source of truth.

Compact app context may include:

- settings summary
- selected pay period
- paycheck history
- pots
- recurring payments
- pay periods
- pot allocations
- transactions
- debts
- debt payments
- debt reserves
- credit cards
- credit card pots
- custom payments
- credit card repayments
- daily brief metadata
- future planning projections

Computed summaries may include:

- dashboard costs and money-left summary
- debt summary
- credit card allocation summary
- debt reserve plans
- future planning projections

Focused facts are selected from the current tab and question keywords. The model should prioritise these focused facts first, then fall back to the broader compact context.

## AI Planner page

Endpoint: `/api/ai-planner`

Browser sends:

- `question`
- `todayIso`
- `selectedPayPeriodId`
- `customInstructions`
- `snapshot`

The server calculates debt reserve plans locally and sends calculated plan facts to the model. The model explains those facts; it should not recalculate the plan or invent alternative reserve amounts.

Use this endpoint for deterministic debt-reserve explanations, shortfall consequences, and plan interpretation. Do not use it for regulated debt advice or product recommendations.

## Daily brief

Endpoint: `/api/daily-brief`

Browser sends:

- `todayIso`
- `snapshotSignature`
- `snapshot`

The server builds daily brief facts locally before prompting the model.

Daily brief facts focus on:

- current pay period
- pay received
- upcoming recurring payments
- custom payments
- credit cards
- card-linked payments
- pots
- debts
- risks
- today/next actions

The daily brief should prioritise urgent risk and practical next actions. It should not become a general budgeting essay when there are actual due dates, shortfalls, card payments, or pot problems to mention.

## Provider selection

The saved setting `settings.aiProvider` controls the provider:

- `gemini` uses `GEMINI_API_KEY`
- `openrouter` uses `OPENROUTER_API_KEY`

Provider keys stay server-side and are not sent to the browser bundle.
