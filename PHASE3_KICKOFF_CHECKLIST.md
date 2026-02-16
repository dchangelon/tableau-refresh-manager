# Phase 3 Kickoff Checklist (No Implementation)

Use this as the handoff before starting Phase 3 (Dashboard Shell + Health Cards).

## Current Readiness Status

- Phase 1-2 foundation and API layer are in place.
- Test, lint, and production build are all passing.
- Project is ready to begin Phase 3 work.

## What Was Cleaned Up in Prior Phases

### Build and platform compatibility fixes

- Updated cache invalidation in `app/api/reschedule/route.ts` for Next.js 16:
  - `revalidateTag("tableau")` -> `revalidateTag("tableau", "max")`
- Result: `npm run build` now passes.

### Analyzer correctness fixes

- Fixed monthly calendar handling in `lib/analyzer.ts` for Tableau Monthly ordinal schedules:
  - Supports intervals like `monthDay="Second" weekDay="Monday"`
  - Supports `monthDay="Last" weekDay="Friday"` style schedules
- This closes a behavioral gap where ordinal monthly schedules were previously not counted correctly in calendar day totals.

### Test coverage improvements

- Added regression test in `__tests__/lib/analyzer.test.ts`:
  - Verifies monthly ordinal schedules produce exactly one active day in current month calendar output.
- Result: prevents silent reintroduction of monthly ordinal calendar bugs.

### Code quality cleanup

- Removed or refactored unused parameters/variables in Phase 2 files so lint is clean.
- `lib/xml-builder.ts` simplified by removing unused `timezone` function parameter and updating call sites.
- Result: `npm run lint` now passes with no warnings/errors.

## Verified Baseline Commands

Run from `tableau-refresh-manager/`:

- `npm test`
- `npm run lint`
- `npm run build`

Expected baseline at handoff:

- All tests pass
- Lint passes clean
- Build succeeds

## Phase 3 Scope Reminder

Phase 3 should include only:

- `app/page.tsx` shell layout
- `components/layout/header.tsx`
- `hooks/use-refresh-data.ts`
- `hooks/use-time-slots.ts`
- `components/health/health-cards.tsx`
- Loading skeletons for health cards

## Execution Mode (Important)

Follow `AGENT_TEAMS_STRATEGY.md` as the source of truth for orchestration:

- If using **Agent Teams in Claude**: run **Phases 3-6 in parallel** using the documented 3-teammate setup (`state-contracts`, `dashboard-ui`, `drill-down`).

The "Phase 3 scope" section above applies to strict Phase 3-only execution. It is not intended to override the parallel Agent Teams plan.

## Contracts to Preserve While Starting Phase 3

- Keep `runRefreshAnalysis()` in `lib/refresh-data-service.ts` as the single analysis cache boundary.
- Keep `revalidateTag("tableau", "max")` in reschedule flow after any successful updates.
- Keep schedule schema ownership in `lib/schemas.ts` (single source of truth).
- Preserve timezone policy (`APP_TIMEZONE`, default `America/Chicago`) and site-local treatment of schedule times.

## Known Notes (Non-Blocking, For Awareness)

- `/api/time-slots` currently returns slots sorted by quietest first (count ascending), not hour ascending.
  - Confirm desired behavior before wiring final UI interactions that depend on slot ordering.
- Scaffolding files under `app/app/` still exist (default template route at `/app`).
  - Non-blocking for Phase 3, but consider cleanup in polish phase if that route is not intended.
