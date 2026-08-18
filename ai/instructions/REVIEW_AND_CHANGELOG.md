# Review and Changelog

## Main issues found

1. Runtime prompts repeated the same safety rules in slightly different wording, which increases the chance of inconsistent behaviour.
2. The JSON output prompt did not define confidence levels clearly, so the model could mark weak answers as high confidence.
3. Action proposal behaviour was too light: it said not to guess IDs but did not strongly define missing-field behaviour, confirmation wording, or payload discipline.
4. Daily brief instructions used the phrase “Treat all pence values as GBP”, which could be misread. The optimised version says pence are integer minor units and should be presented as GBP.
5. The assistant prompts did not clearly rank data sources, such as computed summaries versus compact raw records.
6. Missing data and `omittedCount` handling needed stronger wording.
7. Financial-safety wording did not explicitly cover refinancing, consolidation, insolvency, or using one credit product to pay another.
8. The daily brief prompt could drift into generic budgeting advice instead of prioritising urgent due dates and risks.

## What changed

- Added explicit instruction priority.
- Added source-of-truth hierarchy for the whole-app assistant.
- Strengthened “use computed summaries first” behaviour.
- Added clear confidence definitions.
- Strengthened missing-data and omitted-record handling.
- Made action proposal rules stricter and safer.
- Added explicit “proposed, not completed” wording for actions.
- Improved daily brief risk ordering.
- Clarified pence-to-GBP handling.
- Expanded regulated-finance safety boundaries without blocking normal app explanations.
- Kept UK English, GBP formatting, and practical next-step style.

## Expected result

These prompts should make the AI more reliable, not magically more intelligent. The biggest gains should be:

- fewer invented balances or dates
- better handling of missing data
- more consistent JSON
- safer action proposals
- clearer daily briefs
- better use of server-calculated facts
- less generic financial advice

## Recommended implementation checks

Before deploying, test these cases:

1. Ask the assistant to log a spend with a clear pot and date.
2. Ask it to log a spend without specifying the pot.
3. Ask it to delete/archive/reset something.
4. Ask it whether you can afford a future target with no payday recorded but settings default income available.
5. Ask a question where a list has `omittedCount > 0`.
6. Ask for investment advice.
7. Ask the planner what happens if a paycheck is skipped.
8. Generate a daily brief with no risks.
9. Generate a daily brief with overdue payments and credit card risks.
10. Confirm every floating-assistant response is valid JSON.
