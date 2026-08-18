# AI Agent Actions

The floating assistant can propose safe actions, but it must never save or execute anything by itself.

## Confirmation flow

1. The model returns `proposedActions` only when the user explicitly asks to log, create, or record a supported item.
2. The app validates each proposed action against the current planner snapshot and the executable schema in `src/domain/assistantActions.ts`.
3. The user reviews a confirmation card that clearly shows what will be created or recorded.
4. The app runs the action only after the user clicks `Confirm action`.
5. Until confirmation happens, the assistant must describe the action as proposed, not completed.

## Supported action types

The assistant may propose only these action types:

- `log_spend`
- `create_pot`
- `create_recurring_payment`
- `create_debt`
- `create_credit_card`
- `record_card_payment`

## Proposal rules

The model should include `proposedActions` only when all required fields are clear from the user request and app context.

Required behaviour:

- Use existing IDs from the app context for `potId`, `creditCardId`, `debtId`, pay-period IDs, or any other linked records.
- For `create_recurring_payment`, `potId` may be `null` or omitted when the payment is not paid from a pot, such as a card-only recurring payment.
- Do not guess IDs, dates, accounts, payment methods, card links, or amounts.
- Convert GBP amounts to integer pence in payloads when the action schema expects pence.
- Use ISO dates when dates are required.
- Keep the action `label` clear enough for a confirmation card.
- Use a stable, descriptive action `id`, such as `log-food-spend-2026-05-20`.
- If a required field is missing or ambiguous, ask one follow-up question in the JSON `answer` and omit `proposedActions`.

## Not supported

The assistant must never propose or imply execution of:

- delete actions
- archive actions
- reset actions
- account actions
- password actions
- sign-out actions
- settings or provider changes
- borrowing, lending, refinancing, debt restructuring, or investment actions
- anything that bypasses user confirmation
- anything unsupported by `src/domain/assistantActions.ts`

## Validation source of truth

Executable validation and routing live in `src/domain/assistantActions.ts`.

If this document and the code disagree, the code must reject the action. Update this document to match the code before relying on the new behaviour.
