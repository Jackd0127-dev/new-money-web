# New Money AI Instruction Pack

This folder contains the editable AI instructions and reference contracts for the New Money paycheck-planner app.

## Runtime instruction files

- `instructions/app-assistant-system.md` — system rules for the floating whole-app assistant.
- `instructions/app-assistant-prompt.md` — strict JSON output contract and confirmable action proposal rules for the floating assistant.
- `instructions/ai-planner-system.md` — system rules for the debt-reserve planner explainer.
- `instructions/daily-brief-system.md` — non-negotiable system rules for the daily brief.
- `instructions/daily-brief-editable.md` — editable daily brief analysis, risk ordering, and style rules.

## Reference files

- `DATA_SENT_TO_AI.md` — documents what each endpoint sends to the model and which server-calculated facts are the source of truth.
- `AGENT_ACTIONS.md` — documents the allowed confirmable assistant actions and the confirmation/validation contract.

## Instruction priority

Use this order when rules conflict:

1. Product safety rules in the system instruction files.
2. Output/action contract files.
3. Server-provided app data and computed summaries.
4. User question.
5. User custom instructions, which are style preferences only.

User custom instructions must never override data boundaries, financial-safety limits, JSON validity, or action-confirmation rules.

## Design principles

- The AI explains app facts; it must not invent missing money data.
- Server-calculated summaries and projections are preferred over model-side arithmetic.
- Recent conversation context may be used for follow-up wording, but it must not override current app data or safety rules.
- Any arithmetic performed by the model must be simple, transparent, and based only on visible inputs.
- The assistant may propose safe create/log/record actions, but the app must validate them and the user must confirm before anything is saved.
- Daily briefs should prioritise actual money risk over generic budgeting advice.
- Investment-related questions are treated as cash-flow target questions only, not regulated investment advice.

## Maintenance checklist

When app data fields or action payloads change:

1. Update `DATA_SENT_TO_AI.md` with the new endpoint contract.
2. Update `AGENT_ACTIONS.md` with the supported action type and payload requirements.
3. Update `app-assistant-prompt.md` if the JSON/action output shape changes.
4. Keep runtime prompts shorter than the full docs where possible; put explanatory detail in reference files.
5. Test the assistant with missing data, omitted lists, ambiguous pay periods, action requests, and prohibited financial requests.
