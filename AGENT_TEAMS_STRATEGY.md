# Agent Teams Strategy — Tableau Refresh Schedule Manager

## What Are Agent Teams?

Agent Teams (also called "swarm mode") is an experimental Claude Code feature where **multiple Claude Code instances work in parallel** on the same project. Unlike subagents (which report results back to a single parent), teammates can **message each other directly** and self-coordinate through a shared task board.

### Key Properties
- Each teammate is an **independent Claude Code session** with its own full context window
- Teammates communicate via **peer-to-peer mailbox** (any agent can message any other)
- A **shared task list** with dependency tracking — tasks block/unblock automatically
- The **team lead** (your main session) spawns teammates, assigns work, and synthesizes results
- Teammates inherit `CLAUDE.md`, MCP servers, and skills from the project
- Teammates do **NOT** inherit the lead's conversation history — include all context in spawn prompts

### Setup
Add to `~/.claude/settings.json`:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

On Windows, use **in-process mode** (all teammates run in the main terminal). Navigate between teammates with `Shift+Up/Down`, toggle task list with `Ctrl+T`.

---

## When to Use Teams vs. Single Agent

| Use Teams | Use Single Agent |
|-----------|-----------------|
| Multiple file trees can be built in parallel | Sequential work where each step depends on the previous |
| Components have clear boundaries (API vs UI vs state) | Same-file edits (no file locking, last-write-wins) |
| You want competing approaches or reviews | Simple, routine tasks |
| Cross-layer features (frontend + backend + tests) | Small scope that fits in one session |

**Cost note**: Each teammate is a separate Claude instance. A 3-person team uses ~3x the tokens of a single session.

---

## Recommended Team Configurations by Phase

### Phase 1-2: Foundation + API Layer — Single Agent

These phases are sequential with heavy dependencies. Types must exist before the client, the client before API routes, the analyzer before the data endpoint.

**Prompt for single agent:**
```
Read IMPLEMENTATION_PLAN.md in this project directory. Complete Phase 1
(Project Foundation) and Phase 2 (Tableau API Layer) sequentially.

Key references:
- Tableau REST API docs are the source-of-truth for ALL XML payloads
  in lib/xml-builder.ts (Daily/Weekly/Hourly/Monthly)
- Use tableau-refresh-balancer/src/tableau_client.py as behavior
  reference only (not XML source-of-truth)
- Port analyzer from: tableau-refresh-balancer/src/analyzer.py
- Follow patterns in: references/TYPESCRIPT_API_PATTERNS.md
- Follow deployment patterns in: references/CONFIGURATION_DEPLOYMENT.md

Start with lib/types.ts (all interfaces from the plan), then build
outward. Test each API route with curl before marking complete.
Ensure lib/refresh-data-service.ts exports runRefreshAnalysis() and
both /api/refresh-data and /api/time-slots call that shared pipeline
(no duplicate Tableau fetch path).
Treat runRefreshAnalysis as the single revalidation boundary: do not add
second-layer TTL caching in TableauClient methods unless invalidated by
the same tableau cache tag. Ensure env validation allows empty
TABLEAU_SITE_NAME for Tableau Default site.
Check off items in IMPLEMENTATION_PLAN.md as you complete them.
```

---

### Phase 3-6: Dashboard UI — 3 Teammates

These phases have natural layer boundaries. The API data shapes, UI components, and state/hooks can be built in parallel once types are defined.

**Spawn prompt:**
```
Read IMPLEMENTATION_PLAN.md. Create a team of 3 to build Phases 3-6
(Dashboard Shell, Charts, Filters, Drill-Down Modal).

Teammate 1 "state-contracts" — STARTS FIRST, messages others when done:
  Owns: stores/filter-store.ts, hooks/use-refresh-data.ts,
        hooks/use-time-slots.ts, lib/types.ts (types owner)
  Task: Create the filter store and core read hooks.
  This teammate is the single owner for type changes during this phase.
  When done, message "dashboard-ui" with the hook return types
  and store interfaces.

Teammate 2 "dashboard-ui" — waits for "state-contracts":
  Owns: app/page.tsx, components/layout/header.tsx,
        components/layout/filter-bar.tsx,
        components/health/health-cards.tsx,
        components/charts/hourly-chart.tsx,
        components/charts/heatmap.tsx,
        components/charts/month-calendar.tsx,
        components/tables/top-refreshers.tsx
  Task: Build all dashboard sections and chart components.
  Import hooks and stores from teammate 1's files.
  Use Recharts for charts, shadcn/ui for UI primitives.
  Follow patterns in references/MODERN_UI_PATTERNS_TAILWIND.md.
  Note: This teammate also depends on drill-down outputs before
  finishing Quick Add and chart click wiring.

Teammate 3 "drill-down" — waits for "state-contracts":
  Owns: components/drill-down/hour-modal.tsx,
        components/drill-down/task-row.tsx
  Task: Build the hour drill-down modal and reusable task row
  component. Use shadcn Dialog. Follow patterns in
  references/MODAL_FORM_SYSTEMS.md.
  Build `task-row.tsx` first and message "dashboard-ui" once its
  props are stable. The task-row component must be reusable (used
  in modal, Quick Add table, and error summary).
  `task-row.tsx` and `hour-modal.tsx` must both accept optional
  `onAddToPlan?: (task: RefreshTask) => void` and
  `isInPlan?: (taskId: string) => boolean` props so Phase 7 can
  wire batch actions without refactoring these components.

Use Opus for each teammate.
Check off Phase 3-6 items in IMPLEMENTATION_PLAN.md as they complete.
```

**File ownership boundaries** (prevents write conflicts):

| Teammate | Owned Files |
|----------|-------------|
| state-contracts | `stores/filter-store.ts`, `hooks/use-refresh-data.ts`, `hooks/use-time-slots.ts`, `lib/types.ts` |
| dashboard-ui | `app/page.tsx`, `components/layout/*`, `components/health/*`, `components/charts/*`, `components/tables/*` |
| drill-down | `components/drill-down/*` |

**Coordination points:**
- `state-contracts` finishes first and messages both teammates with store/hook interfaces and any new shared types
- `dashboard-ui` wires filter-bar to `filter-store`, charts to `use-refresh-data`
- `drill-down` ships `task-row` first; `dashboard-ui` imports it for Quick Add table
- `dashboard-ui` cannot finalize Quick Add or chart/heatmap modal wiring until `drill-down` confirms stable `task-row` and `hour-modal` props
- `hour-modal` contract is fixed before wiring chart/heatmap click handlers (`hour`, optional `dayOfWeek`, optional `date`, optional `onAddToPlan`, optional `isInPlan`)

---

### Phase 7-8: Batch System — 2 Teammates

The batch drawer (UI) and batch logic (store, impact computation, API route) can be built in parallel.

**Spawn prompt:**
```
Read IMPLEMENTATION_PLAN.md. Create a team of 2 to build Phases 7-8
(Batch Drawer, Schedule Editor, Preview Impact, Apply).

Teammate 1 "batch-logic" — STARTS FIRST:
  Owns: stores/batch-store.ts, hooks/use-batch-impact.ts,
        lib/schemas.ts,
        app/api/reschedule/route.ts,
        __tests__/hooks/use-batch-impact.test.ts,
        __tests__/api/reschedule-route.test.ts
  Note: XML payloads are built via lib/xml-builder.ts (already exists from Phase 2)
  Task:
  1. Create batch-store with add/remove/update/clear and
     newRunHours recomputation
  2. Build use-batch-impact hook: compute ImpactPreview from
     batch store items + current hourly distribution
  3. Create `lib/schemas.ts` as the single schema source with
     shared schedule + request schemas used by both API and UI.
  4. Build reschedule API route: validate with Zod imported from
     `lib/schemas.ts`, construct
     XML payloads, call Tableau API, return per-item results,
     and trigger server-side revalidation for refresh-data/time-slots
     Use retry/backoff for 429 + transient 5xx (1s, 2s, 4s;
     max 3 retries) and apply updates sequentially with 150ms
     pacing between requests. Enforce response semantics:
     - HTTP 200 for valid shape (full or partial success)
     - RescheduleResponse.success = true only when all items succeed
     - HTTP 400 for schema validation failures (no write attempts)
  5. Message "batch-ui" with: store interface, impact hook
     return type, API request/response shapes
     and schema exports from `lib/schemas.ts`
  6. Build `__tests__/hooks/use-batch-impact.test.ts`
  7. Build `__tests__/api/reschedule-route.test.ts` for:
     - invalid schema => 400 + no write calls
     - partial success => 200 + `success: false` + per-item results
     - retry/backoff behavior for 429/5xx
     - revalidateTag call when any item succeeds

Teammate 2 "batch-ui" — waits for "batch-logic":
  Owns: components/batch/batch-drawer.tsx,
        components/batch/batch-item.tsx,
        components/batch/schedule-editor.tsx,
        components/batch/preview-impact.tsx,
        components/batch/apply-dialog.tsx,
        app/page.tsx (BatchDrawer integration only),
        __tests__/components/schedule-editor.test.tsx,
        __tests__/components/batch-drawer.test.tsx
  Task:
  1. Build batch-drawer (fixed bottom panel, collapse/expand)
  2. Build batch-item (schedule diff display, edit toggle)
  3. Build schedule-editor (React Hook Form + Zod, all 4
     frequency types) by importing schemas from `lib/schemas.ts`
     (no component-local schedule schema). Follow
     references/MODAL_FORM_SYSTEMS.md.
  4. Build preview-impact (Recharts grouped bar chart +
     health metric deltas)
  5. Build apply-dialog (confirmation, loading, results)
  6. Integrate <BatchDrawer /> into app/page.tsx
  7. Wire Add to Plan by passing `onAddToPlan` and `isInPlan`
     from batch-store/page into hour-modal, task-row, and top-refreshers
  8. Build `__tests__/components/schedule-editor.test.tsx` and
     `__tests__/components/batch-drawer.test.tsx`

Use Opus for each teammate.
Check off Phase 7-8 items in IMPLEMENTATION_PLAN.md as they complete.
```

**File ownership:**

| Teammate | Owned Files |
|----------|-------------|
| batch-logic | `stores/batch-store.ts`, `hooks/use-batch-impact.ts`, `lib/schemas.ts`, `app/api/reschedule/route.ts`, `__tests__/hooks/use-batch-impact.test.ts`, `__tests__/api/reschedule-route.test.ts` |
| batch-ui | `components/batch/*`, `app/page.tsx` (BatchDrawer mount + Add to Plan wiring), `__tests__/components/schedule-editor.test.tsx`, `__tests__/components/batch-drawer.test.tsx` |

---

### Phase 9-10: Errors + Polish — Single Agent

Small scope, cross-cutting changes that touch many files. Better as one agent.

**Prompt:**
```
Read IMPLEMENTATION_PLAN.md. Complete Phase 9 (Error Summary) and
Phase 10 (Polish + Deploy).

For errors: Build components/errors/error-summary.tsx with
collapsible accordion buckets. Pattern-match failure messages
into categories defined in lib/constants.ts. Each task gets an
"Add to Plan" button using the existing task-row component.

For polish: Add loading skeletons, empty states, responsive
breakpoints, keyboard shortcuts (Escape to close).

For deploy: Configure Vercel, verify .env.example is complete,
run vercel --prod, then perform one manual warm-up call to
GET /api/refresh-data. Treat automated warm-up as a post-v1
optimization, not a launch blocker.

Check off remaining items in IMPLEMENTATION_PLAN.md.
```

---

## Best Practices for This Project

### Before Spawning Teams
1. **Ensure `lib/types.ts` exists** with all interfaces — this is the shared contract
2. **Ensure shadcn components are installed** — teammates shouldn't run `npx shadcn` concurrently
3. **Pre-approve common operations** in permission settings to reduce friction
4. **Verify Phase 2 gates** before parallel UI work:
   - `curl /api/refresh-data` returns `AnalysisResponse`-shaped JSON
   - `curl /api/time-slots` returns 24 hour buckets
   - Time values follow site-local timezone policy (America/Chicago for v1)

### Contract Guardrails (v1 Locked)
- Do not reintroduce `dayFilter` in `stores/filter-store.ts` for v1.
- `ScheduleConfig.weekDays` uses Tableau day names (`Sunday`...`Saturday`), not numeric indexes.
- `HeatmapCell.y` uses weekday index `0=Monday ... 6=Sunday`.
- For `Hourly` and `Daily`, empty `weekDays` means all days (no weekday XML intervals).
- For `Daily`, `endTime` is required when interval is `2|4|6|8|12`, optional only for `24`.
- Keep cache contract strict: service-level `runRefreshAnalysis` is the single revalidation boundary.
- Keep schema contract strict: `lib/schemas.ts` is the single Zod source for schedule/request validation (API and UI import from it; no duplicates).

### During Team Execution
5. **One teammate per file tree** — never have two teammates editing the same directory
6. **Shared types file**: `state-contracts` is the types owner in Phase 3-6. Other teammates must request type edits via message.
7. **5-6 tasks per teammate** keeps them productive without getting stuck
8. **Check in periodically** — if a teammate is stuck, you can redirect or provide context
9. **If the lead starts implementing**: tell it "Wait for your teammates to complete their tasks"

### Task Dependencies
10. Use explicit blocking: "Task B blocks on Task A" so teammates auto-unblock
11. Define API contracts (types, interfaces, return shapes) as the first task in any parallel sprint — this unblocks UI teammates
12. Required handoff message from contract owners should include:
    - Created files list
    - Exported interfaces/types changed
    - Hook return types and expected loading/error states
    - Any unresolved assumptions requiring lead decision

### Cost Management
13. Use **Opus** for teammates when tasks/scope is complex, and **Sonnet** for teammates when possible for low impact tasks (lower cost per token)
14. Keep teams to **2-3 teammates** for this project size
15. Don't use teams for sequential work (Phases 1-2, 9-10)

---

## Summary: Team Usage Map

| Phase | Agents | Teammates | Rationale |
|-------|--------|-----------|-----------|
| 1-2 | 1 (single) | — | Sequential dependencies |
| 3-6 | 3 teammates | state-contracts, dashboard-ui, drill-down | Natural layer boundaries |
| 7-8 | 2 teammates | batch-logic, batch-ui | Logic/UI split |
| 9-10 | 1 (single) | — | Cross-cutting, small scope |

**Total team spawns**: 2 (one 3-person, one 2-person)
**Estimated token multiplier**: ~2-3x vs purely sequential single-agent
