# Project Structure

This project is now organized around one locked finance backend and one active UI layer.

## Runtime Code

- `src/App.tsx`: routes the current app view into the shell.
- `src/components/`: shared UI surfaces and app-wide components.
- `src/pages/`: screen-level UI. Prefer making presentation changes here first.
- `src/domain/`: finance, recurrence, card, pot, debt, and planning calculations. Locked unless the task is explicitly backend behavior.
- `src/storage/`: Dexie schema and repository actions. Locked unless the task is explicitly persistence behavior.
- `src/firebase/`: Firebase client and cloud planner sync. Locked unless the task is explicitly auth/sync behavior.
- `src/hooks/`: app state hooks. Auth, planner data, and cloud sync are backend-adjacent and locked.
- `api/` and `server/`: Vercel functions and server-only helpers. Locked unless the task is explicitly API behavior.

## Tests

Tests live beside the area they protect, inside `__tests__` folders where useful:

- `src/__tests__/`: app-level behavior.
- `src/components/__tests__/`: component behavior.
- `src/pages/__tests__/`: screen/workflow behavior.
- `src/hooks/__tests__/`: hook behavior.
- `src/domain/*.test.ts`: financial calculation regression tests.
- `src/storage/*.test.ts`: repository and data mutation regression tests.
- `api/*.test.ts`: server function behavior.

## UI Work Rule

For UI-only work:

1. Do not touch locked backend files listed in `docs/BACKEND_LOCK.md`.
2. Reuse existing domain outputs instead of recomputing money in components.
3. Keep labels clear about actual versus forecast values.
4. Run `npm run test:ui`, then `npm run check` before deploy.

## Backend Work Rule

For backend work:

1. Add a failing regression test first.
2. Make the smallest behavior change.
3. Run `npm run check:backend`.
4. Run `npm run check` before deploy.
