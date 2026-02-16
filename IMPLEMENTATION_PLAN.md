# Tableau Refresh Schedule Manager — Implementation Plan (Revised)

## Context

The existing `tableau-refresh-balancer` is a Flask + vanilla JS app (2,057-line single HTML file, 917-line analyzer, 517-line Tableau client) that analyzes and rebalances Tableau Cloud extract refresh schedules. It works but has outgrown its architecture — the monolithic dashboard is hard to maintain, state management is fragile (global JS variables + DOM manipulation), and the schedule editing capabilities are limited to changing the target hour.

This rebuild reimagines the tool as a **schedule management application** — analysis exists to support the action of changing schedules, not the other way around. The batch planning workflow with Preview Impact becomes the centerpiece.

## Current Build State

- Phases 1-8 implementation is complete in the codebase (foundation, API layer, dashboard, drill-down, batch planning, and apply flow).
- Remaining work is Phase 9-10 (error summary UX, polish, deployment hardening, and production verification checklist).

---

## Decisions From Audit

These gaps were identified during plan review and resolved:

| Gap | Decision |
|-----|----------|
| **Vercel caching** — file-based cache won't work in serverless (ephemeral FS) | Use **service-level `unstable_cache` + tag revalidation** via `runRefreshAnalysis()` (no external service) |
| **Source system mapping** — requires 50+ extra API calls to fetch datasource connections | **Deferred to v2**. Ship without source system filtering to reduce scope |
| **Schedule XML** — existing code only handles Daily/Weekly, not Hourly/Monthly | Build **all** schedule XML payloads (Daily/Weekly/Hourly/Monthly) from Tableau REST API docs. Use legacy Python only as behavioral reference, not XML source-of-truth |
| **Testing** — existing project has 84 tests, new plan had none | Add **Vitest tests alongside each phase** |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| Data Fetching | TanStack Query |
| State | Zustand (batch plan + filters) |
| Forms | React Hook Form + Zod |
| Notifications | Sonner |
| Testing | Vitest + React Testing Library |
| Deployment | Vercel |

---

## Caching Strategy

The main data endpoint makes **50-100+ Tableau API calls** per full refresh (task pagination + workbook/datasource name resolution). Caching is essential.

**Approach: Service-level `unstable_cache` with shared cache key and tag-based invalidation**

Both `/api/refresh-data` and `/api/time-slots` call the same `runRefreshAnalysis()` function. By caching at the service level (not the route level), Tableau API calls happen **once per cache period**, regardless of how many routes consume the data.

```typescript
// lib/refresh-data-service.ts
import { unstable_cache } from 'next/cache';

const getCachedAnalysis = unstable_cache(
  async () => {
    const client = new TableauClient();
    await client.signIn();
    const tasks = await client.getExtractRefreshTasks();
    const details = await client.resolveItemDetails(tasks);
    await client.signOut();
    return analyzeScheduledTasks(details);
  },
  ['tableau-analysis'],             // Cache key
  { revalidate: 3600, tags: ['tableau'] }  // 1 hour TTL, tag for invalidation
);

export async function runRefreshAnalysis(): Promise<AnalysisResponse> {
  return getCachedAnalysis();
}
```

```typescript
// app/api/refresh-data/route.ts — simple pass-through
export const maxDuration = 120;    // Allow up to 2 minutes for Tableau API fetch on cache miss

export async function GET() {
  const analysis = await runRefreshAnalysis();
  return Response.json(analysis);
}
```

**How this works in practice:**

| Scenario | What happens | User wait time |
|----------|-------------|----------------|
| First visit after deploy | Function runs fully (auth + 50-100 API calls). Response cached. | 30-60s |
| Subsequent visits (within 1 hour) | Served from Vercel's data cache. No Tableau calls. | **Fast** |
| After cache expires (1 hour) | Background revalidation runs. Stale data served until fresh data ready. | **Fast** (stale) |
| Tableau is down during revalidation | Stale data keeps being served. Site never breaks. | **Fast** (stale) |

**Why service-level caching, not route-level ISR:**
- Both read routes share one cache entry — Tableau API calls happen once, not twice per revalidation
- Tag-based invalidation (`revalidateTag('tableau')`) busts all routes in one call after apply
- No need for `force-static` or route-level `revalidate` exports — simpler route handlers

**Single cache-layer contract (LOCKED):**
- Treat `runRefreshAnalysis()` in `lib/refresh-data-service.ts` as the **only** revalidation boundary for analysis data.
- Do **not** add additional long-lived caching (`next.revalidate`, custom memo caches, or secondary cache wrappers) inside `TableauClient` methods that feed `runRefreshAnalysis()`, unless those entries are explicitly invalidated by the same `tableau` tag.
- This ensures `revalidateTag('tableau')` after `POST /api/reschedule` always refreshes both `/api/refresh-data` and `/api/time-slots` from fresh Tableau data.

**Mitigating the cold-start wait:** For v1, automated warm-up is deferred. Use a manual deploy checklist step that calls production `/api/refresh-data` once after each deploy. If cold-start latency becomes a pain point, add an automated warm-up (deploy hook, GitHub Action, or cron endpoint) in a follow-up. Do not rely on `postbuild` + `$VERCEL_URL`, because build-time env values are not guaranteed to point at the final production deployment URL.

**Timeout is not a concern:** Vercel Fluid Compute (enabled by default since April 2025) gives Hobby tier 300s and Pro tier 800s. The 50-100 API calls taking 30-60s fits comfortably. Active CPU pricing means you're only billed for compute time, not I/O wait on Tableau responses.

**Read endpoints** (`/api/refresh-data`, `/api/time-slots`): No route-level caching needed — the shared `unstable_cache` in `refresh-data-service.ts` handles it. Keep `maxDuration = 120` on routes for Vercel timeout.

**Write endpoint** (`/api/reschedule`): No caching (dynamic by default for POST). After successful apply, the **server route handler** calls `revalidateTag('tableau')` to invalidate the shared cache. The client calls TanStack Query `invalidateQueries()` to refresh in-session data.

**Client-side**: TanStack Query with `staleTime: 5 * 60 * 1000` (5 min) for in-session caching on top of the server-side cache.

**Future upgrade path (Pro tier):** Add a Vercel cron job running hourly to pre-warm the cache via `revalidateTag('tableau')`. No architecture changes needed — just an additive cron endpoint.

---

## Locked Pre-Build Contracts

These decisions are fixed for v1 and should not be reinterpreted during implementation.

### Timezone Policy
- Tableau `frequencyDetails.start`/`end` values are treated as **site-local time**, not UTC.
- Default timezone for v1 is `America/Chicago` (Central Time).
- UI input/output, analyzer math, XML generation, and API writes must all use this same site-local assumption.

### Cache Contract (LOCKED)
- `lib/refresh-data-service.ts` (`runRefreshAnalysis`) is the single source of cache truth for analysis data.
- `revalidateTag('tableau')` must invalidate everything needed for both read routes.
- Avoid second-layer cache TTLs in the Tableau fetch path that can outlive tag invalidation.

### ScheduleConfig to Tableau Mapping (Authoritative)

| App ScheduleConfig | Allowed intervalHours | Tableau frequency used in XML | Notes |
|--------------------|-----------------------|-------------------------------|-------|
| `frequency: "Hourly"` | `1` only | `Hourly` | Use `<interval hours="1" />` |
| `frequency: "Daily"` | `2,4,6,8,12,24` | `Daily` | Include `<interval hours="N" />`; optional weekday constraints |
| `frequency: "Weekly"` | `24` | `Weekly` | 1-7 weekdays selected via toggle buttons |
| `frequency: "Monthly"` (On Day) | `24` | `Monthly` | `monthDays` with numeric values `1-31` or `"LastDay"` |
| `frequency: "Monthly"` (On Ordinal Weekday) | `24` | `Monthly` | `monthlyOrdinal` + `monthlyWeekDay` — e.g., "Second Monday" |

### Error Summary Data Source
- `lastFailureMessage` is populated from Tableau Jobs/history endpoints when available.
- `resolveFailureMessages()` mapping algorithm (deterministic):
  1. If the Tableau job payload includes a direct `taskId`, map by `taskId` (authoritative).
  2. If direct linkage is absent, group failed jobs by target workbook/datasource ID.
  3. For each target group, select the most recent failed job by job timestamp (`completedAt` fallback `startedAt` fallback `createdAt`).
  4. Assign that selected message to every task whose `itemId` matches the target ID.
  5. If target metadata is missing or no match is possible, leave message null and bucket as `other`.
- If a message is unavailable, bucket the task as `other` and still show it based on `consecutiveFailures`.
- Error bucket patterns are implemented in `lib/constants.ts` and tested with representative strings.
  - `connection`: `/connection refused|could not connect|connection reset|network error/i`
  - `timeout`: `/timeout|timed out|operation timed out|gateway timeout/i`
  - `permission`: `/permission denied|access denied|unauthorized|forbidden/i`
  - `data source unavailable`: `/data source.*unavailable|datasource.*unavailable|failed to connect to.*database/i`
  - `other`: fallback when no pattern matches or message is missing

### API and Validation Contract
- `POST /api/reschedule` request uses: `{ changes: Array<{ taskId: string; schedule: ScheduleConfig }> }`
- Validation uses a Zod discriminated union on `frequency` with frequency-specific rules.
- The route returns per-item results and a summary object (see API section below).
- For `frequency: "Daily"`, `endTime` is **required** when `intervalHours` is `2 | 4 | 6 | 8 | 12`, and optional when `intervalHours === 24`.
- For `frequency: "Hourly"`, `endTime` is always required.

### Schema Ownership Contract (LOCKED)
- Define all schedule-related Zod schemas in `lib/schemas.ts` as the single source of truth.
- `app/api/reschedule/route.ts` must import request/schedule schemas from `lib/schemas.ts` (no route-local duplicates).
- `components/batch/schedule-editor.tsx` must import the same schedule schema from `lib/schemas.ts` for form validation (no component-local duplicates).
- If schema rules change, update `lib/schemas.ts` first, then adjust API/UI/tests.

### Weekday Semantics (LOCKED)
- `weekDays` values use Tableau names: `"Sunday"` through `"Saturday"`.
- `Weekly`: `weekDays` must include at least one day (1-7 entries).
- `Hourly` and `Daily`: `weekDays` may be empty; empty means **all days** (no weekday constraints emitted in XML).
- If `weekDays` is provided for `Hourly`/`Daily`, serialize each selected day as its own `<interval weekDay="..."/>`.

### Reschedule Response Semantics (LOCKED)
- `POST /api/reschedule` returns HTTP `200` for syntactically valid requests, including partial success.
- `RescheduleResponse.success` means **all items succeeded** (`summary.failed === 0`).
- Partial success sets `success: false` with mixed per-item `results`.
- Schema/validation failures return HTTP `400` with error details and no Tableau write attempts.

### Tableau Site Name Handling (LOCKED)
- `TABLEAU_SITE_NAME` supports empty string for Tableau Default site.
- Env validation must allow empty string (do not enforce `.min(1)` for this variable).

### Monthly Schedule — Two Sub-Types (LOCKED)
Tableau's Monthly frequency has two mutually exclusive modes, confirmed from Tableau Cloud UI screenshots:
- **"On Day" mode**: User selects numeric days (1-31) and/or "Last" from a grid. XML uses `<interval monthDay="12" />`.
- **"On [Ordinal] [Weekday]" mode**: User selects an ordinal (First/Second/Third/Fourth/Fifth/Last) and a weekday (Sunday-Saturday). XML uses `<interval monthDay="Second" weekDay="Monday" />` — note `monthDay` carries the ordinal string, not a number.
- Ordinal mode uses `monthDay="Last"` for "Last Monday" style schedules. `monthDay="LastDay"` is reserved for On Day mode only.
- In `ScheduleConfig`: `monthDays` (array) for On Day mode, `monthlyOrdinal` + `monthlyWeekDay` for ordinal mode. These are mutually exclusive — reject if both are populated.
- For analyzer `taskDays`/`runHours`: Monthly tasks always have `runHours = [startHour]`. For `taskDays`, follow the Python analyzer's approximation: "On Day" tasks use `run_days = all 7 weekdays` (approximate), "On Ordinal Weekday" tasks use `run_days = [weekday index]`. Accurate per-date counts come from `computeMonthlyCalendar()`.
- Reference screenshots: `tableau-refresh-manager/tableau_monthOnDay_refresh.png`, `tableau-refresh-manager/tableau_monthOnFirst_refresh1.png`, `tableau-refresh-manager/tableau_monthOnFirst_refresh2.png`.

### Tableau REST Source-of-Truth (LOCKED)
- XML shape and allowed schedule values come from Tableau REST API docs, not legacy Python.
- Base docs index: `https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref.htm`
- Extract refresh/schedule references: `https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_extracts.htm` and related schedule payload examples on that page.
- Use `TABLEAU_API_VERSION` from env (default `3.24`) and verify payload fields against the matching Tableau Cloud docs when implementing.

### Environment Contract (`.env.example`)
- Server-only env vars (no `NEXT_PUBLIC_`): `TABLEAU_SERVER_URL`, `TABLEAU_SITE_NAME`, `TABLEAU_TOKEN_NAME`, `TABLEAU_TOKEN_SECRET`, `TABLEAU_API_VERSION` (optional, defaults to `3.24`), `APP_TIMEZONE`.
- `APP_TIMEZONE` defaults to `America/Chicago`.
- Include a PAT expiry note in `.env.example` so operators know expired/revoked tokens surface as auth failures.

---

## Project Structure

```
tableau-refresh-manager/
├── app/
│   ├── layout.tsx                    # Root layout, providers (QueryClient, Toaster)
│   ├── page.tsx                      # Dashboard page (assembles all sections)
│   ├── globals.css                   # Tailwind base + custom CSS
│   ├── providers.tsx                 # Client wrapper: QueryClientProvider + Toaster
│   └── api/
│       ├── refresh-data/route.ts     # GET — Main analysis endpoint (shared analysis cache)
│       ├── time-slots/route.ts       # GET — Hours sorted by load (shared analysis cache)
│       ├── reschedule/route.ts       # POST — Apply batch schedule changes
│       └── health/route.ts           # GET — Health check
├── components/
│   ├── layout/
│   │   ├── header.tsx                # App title, pulse indicator, refresh button
│   │   └── filter-bar.tsx            # Project, type, search filters
│   ├── health/
│   │   └── health-cards.tsx          # 4 health metric cards
│   ├── charts/
│   │   ├── hourly-chart.tsx          # Recharts stacked bar: fixed + moveable
│   │   ├── heatmap.tsx               # CSS grid 7x24, clickable, week/month toggle
│   │   └── month-calendar.tsx        # Calendar grid for monthly view
│   ├── tables/
│   │   └── top-refreshers.tsx        # Quick Add table with +Add to Plan
│   ├── drill-down/
│   │   ├── hour-modal.tsx            # Modal: tasks at a specific hour
│   │   └── task-row.tsx              # Reusable task display with +Add to Plan
│   ├── batch/
│   │   ├── batch-drawer.tsx          # THE CENTERPIECE: fixed bottom panel
│   │   ├── batch-item.tsx            # Queued schedule change with edit/remove
│   │   ├── schedule-editor.tsx       # Full schedule form (all 4 Tableau types)
│   │   ├── preview-impact.tsx        # Before/after chart + health deltas
│   │   └── apply-dialog.tsx          # Confirmation dialog before applying
│   └── errors/
│       └── error-summary.tsx         # Collapsible error buckets
├── lib/
│   ├── types.ts                      # ALL TypeScript interfaces
│   ├── schemas.ts                    # Authoritative Zod schemas (shared by API + form)
│   ├── tableau-client.ts             # Tableau REST API client
│   ├── tableau-auth.ts               # PAT sign-in/sign-out
│   ├── refresh-data-service.ts       # Shared fetch+analyze pipeline used by refresh-data/time-slots routes
│   ├── analyzer.ts                   # Schedule analysis logic
│   ├── xml-builder.ts                # XML payload construction for ALL schedule types
│   ├── constants.ts                  # Schedule types, hour labels, color scales
│   └── utils.ts                      # formatHour(), timezone helpers, cn()
├── stores/
│   ├── batch-store.ts                # Zustand: batch plan state
│   └── filter-store.ts              # Zustand: filter state
├── hooks/
│   ├── use-refresh-data.ts           # TanStack Query hook for main data
│   ├── use-time-slots.ts             # TanStack Query hook for time slots
│   └── use-batch-impact.ts           # Computed impact from batch plan
├── __tests__/
│   ├── lib/
│   │   ├── analyzer.test.ts          # Schedule analysis unit tests
│   │   ├── xml-builder.test.ts       # XML payload tests for ALL 4 frequency types
│   │   └── utils.test.ts             # Utility function tests
│   ├── hooks/
│   │   └── use-batch-impact.test.ts  # Impact computation tests
│   └── components/
│       ├── schedule-editor.test.tsx   # Form validation tests
│       └── batch-drawer.test.tsx      # Batch workflow integration tests
├── .env.local                        # Tableau credentials (NEVER committed)
├── .env.example                      # Template with required server-side variables
├── vitest.config.ts                  # Vitest configuration
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

**Removed from previous plan**: `lib/source-systems.ts`, `config/source-systems.json` — deferred to v2.
**Added**: `lib/xml-builder.ts` (separated from client for testability), `__tests__/` tree, `vitest.config.ts`.

---

## Key TypeScript Interfaces

```typescript
// lib/types.ts

// === Core Data Types ===

interface RefreshTask {
  id: string;                          // Tableau extract task ID
  type: "workbook" | "datasource";
  itemId: string;                      // Workbook or datasource ID
  itemName: string;
  itemUrl: string | null;              // Link to item on Tableau Cloud
  projectName: string;
  schedule: ScheduleConfig;
  consecutiveFailures: number;
  lastFailureMessage: string | null;   // From jobs/history endpoint when available
  priority: number;
  nextRunAt: string | null;
  isHourly: boolean;
  runHours: number[];                  // All hours this task runs (expanded for hourly)
  hourlyWindow: string | null;         // "7 AM - 10 PM CT"
  taskDays: number;                    // Days per week this runs
}

interface ScheduleConfig {
  frequency: "Hourly" | "Daily" | "Weekly" | "Monthly";
  startTime: string;                   // "HH:MM" site-local time
  endTime: string | null;              // Required for Hourly and Daily intervals 2/4/6/8/12; optional for Daily 24; otherwise null
  intervalHours: 1 | 2 | 4 | 6 | 8 | 12 | 24 | null;
  weekDays: string[];                  // Tableau weekday names ("Sunday"..."Saturday"); Hourly/Daily: 0-7 (empty => all days), Weekly: 1-7 required
  // Monthly "On Day" mode (mutually exclusive with monthlyOrdinal):
  monthDays: Array<number | "LastDay">; // Numeric day-of-month selections (1-31 or "LastDay")
  // Monthly "On [Ordinal] [Weekday]" mode (mutually exclusive with monthDays):
  monthlyOrdinal: "First" | "Second" | "Third" | "Fourth" | "Fifth" | "Last" | null;
  monthlyWeekDay: string | null;       // Single Tableau weekday name; required when monthlyOrdinal is set
}

// === Batch Plan Types ===

interface BatchPlanItem {
  id: string;                          // Client-generated UUID
  taskId: string;
  taskName: string;
  itemType: "workbook" | "datasource";
  currentSchedule: ScheduleConfig;
  newSchedule: ScheduleConfig;         // Any field can change
  taskDays: number;
  runHours: number[];                  // Current run hours
  newRunHours: number[];               // Proposed (recomputed on edit)
}

interface ImpactPreview {
  currentDist: Record<number, number>;  // hour → count
  proposedDist: Record<number, number>;
  currentMetrics: HealthMetrics;
  proposedMetrics: HealthMetrics;
  deltas: {
    loadBalanceScore: number;
    peakAvgRatio: number;
    busyWindowPct: number;
  };
}

// === Analysis Types ===

interface HealthMetrics {
  loadBalanceScore: { value: number; health: "green" | "yellow" | "red" };
  busiestWindow: { label: string; count: number; pct: number; health: "green" | "yellow" | "red" };
  utilization: { value: number; health: "green" | "yellow" | "red" };
  peakAvgRatio: { value: number; health: "green" | "yellow" | "red" };
}

interface HeatmapCell {
  x: number;                           // hour (0-23)
  y: number;                           // weekday index (0=Monday ... 6=Sunday)
  v: number;                           // task count
}

interface AnalysisResponse {
  hourly: { byHour: Record<number, number>; peakHours: number[]; quietHours: number[]; totalRefreshes: number; averagePerHour: number };
  daily: { byDay: Record<string, number> };
  heatmap: { data: HeatmapCell[]; days: string[]; maxValue: number };
  loadComposition: { totalTaskRuns: number; hourlyFixedRuns: number; moveableRuns: number; hourlyByHour: Record<number, number> };
  tasks: { total: number; details: RefreshTask[]; withFailures: RefreshTask[]; totalWithFailures: number; byHour: Record<number, RefreshTask[]> };
  enhancedStats: HealthMetrics;
  calendar: { year: number; month: number; monthName: string; daysInMonth: number; firstWeekday: number; byDate: Record<string, number> }; // byDate keys use "YYYY-MM-DD" (site-local). Always current month, determined by APP_TIMEZONE. No month navigation for v1.
}

// === API Types ===

type RescheduleChange = {
  taskId: string;
  schedule: ScheduleConfig;
};

interface RescheduleRequest {
  changes: RescheduleChange[];
}

interface RescheduleResult {
  taskId: string;
  success: boolean;
  message?: string;
  error?: string;
  statusCode?: number;
}

interface RescheduleResponse {
  success: boolean;
  results: RescheduleResult[];
  summary: { total: number; succeeded: number; failed: number };
}
```

---

## XML Payload Construction (`lib/xml-builder.ts`)

**Critical**: Tableau REST API docs are the XML source-of-truth for all frequencies (Daily/Weekly/Hourly/Monthly). The existing Python code is behavior reference only and should not be copied as authoritative XML.
Also, not every UI frequency maps 1:1 to Tableau frequency. Use the locked mapping table above.

```typescript
// buildScheduleXml(schedule: ScheduleConfig, timezone: string): string

// Daily — used for every N hours (2/4/6/8/12/24)
<tsRequest><extractRefresh><schedule frequency="Daily">
  <frequencyDetails start="08:00:00" end="20:00:00">
    <intervals>
      <interval hours="4" />
      <interval weekDay="Monday" /><interval weekDay="Friday" />
    </intervals>
  </frequencyDetails>
</schedule></extractRefresh></tsRequest>

// Weekly — one or more weekdays (1-7 allowed)
<tsRequest><extractRefresh><schedule frequency="Weekly">
  <frequencyDetails start="08:00:00">
    <intervals>
      <interval weekDay="Wednesday" />
    </intervals>
  </frequencyDetails>
</schedule></extractRefresh></tsRequest>

// Hourly — every hour only
<tsRequest><extractRefresh><schedule frequency="Hourly">
  <frequencyDetails start="07:00:00" end="22:00:00">
    <intervals>
      <interval hours="1" />
      <interval weekDay="Monday" /><interval weekDay="Friday" />
    </intervals>
  </frequencyDetails>
</schedule></extractRefresh></tsRequest>

// Monthly "On Day" — numeric days or LastDay
<tsRequest><extractRefresh><schedule frequency="Monthly">
  <frequencyDetails start="06:00:00">
    <intervals>
      <interval monthDay="1" /><interval monthDay="15" />
      <interval monthDay="LastDay" />
    </intervals>
  </frequencyDetails>
</schedule></extractRefresh></tsRequest>

// Monthly "On [Ordinal] [Weekday]" — e.g., "Every Second Monday"
// monthDay carries the ordinal occurrence, weekDay carries the day name
<tsRequest><extractRefresh><schedule frequency="Monthly">
  <frequencyDetails start="11:05:00">
    <intervals>
      <interval monthDay="Second" weekDay="Monday" />
    </intervals>
  </frequencyDetails>
</schedule></extractRefresh></tsRequest>
// Monthly "On [Ordinal] [Weekday]" — e.g., "Every Last Monday"
<tsRequest><extractRefresh><schedule frequency="Monthly">
  <frequencyDetails start="11:05:00">
    <intervals>
      <interval monthDay="Last" weekDay="Monday" />
    </intervals>
  </frequencyDetails>
</schedule></extractRefresh></tsRequest>
// Valid monthDay ordinal values: "First", "Second", "Third", "Fourth", "Fifth", "Last"
// Valid weekDay values: "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
```

**Validation rules (must enforce before XML generation):**
- Reject `frequency: "Hourly"` unless `intervalHours === 1`
- Reject `frequency: "Weekly"` unless `weekDays.length >= 1`
- Reject any `monthDays` entries outside `1-31` or `"LastDay"`
- Reject sub-hourly intervals (not supported in v1)
- For `frequency: "Monthly"`: `monthDays` and `monthlyOrdinal` are **mutually exclusive** — reject if both are populated
- When `monthlyOrdinal` is set, `monthlyWeekDay` must also be set (and vice versa)
- Valid `monthlyOrdinal` values: `"First"`, `"Second"`, `"Third"`, `"Fourth"`, `"Fifth"`, `"Last"`
- Valid `monthlyWeekDay` values: `"Sunday"` through `"Saturday"`
- `Hourly`: require both `startTime` and `endTime`; if `weekDays` empty, treat as all days (omit weekday intervals)
- `Daily`: require `startTime`; require `endTime` when `intervalHours` is `2|4|6|8|12`; allow null `endTime` when `intervalHours === 24`; if `weekDays` empty, treat as all days

**Test requirement**: `__tests__/lib/xml-builder.test.ts` must verify all 5 XML patterns (Hourly, Daily, Weekly, Monthly On Day, Monthly On Ordinal Weekday) produce valid XML and that invalid combinations are rejected with clear errors.

---

## Component Design

### Filter Bar (`components/layout/filter-bar.tsx`)
- **Project** dropdown (populated from task data)
- **Type** segmented control: All / Workbook / Datasource
- **Search** input with 300ms debounce (task name, project)
- **Clear Filters** button (visible when filters active)
- State: Zustand `filter-store.ts`, applies globally

### Hourly Chart (`components/charts/hourly-chart.tsx`)
- Recharts stacked `BarChart`: gray "Fixed (Hourly)" + blue "Moveable"
- Click bar → opens hour-modal
- Respects active filters

### Heatmap (`components/charts/heatmap.tsx`)
- CSS Grid 7x24 (week) or calendar (month), toggleable
- Click cell → opens hour-modal for that day+hour
- Color scale: empty → low → medium → high → critical

### Top Refreshers / Quick Add (`components/tables/top-refreshers.tsx`)
- Sorted by slots/week descending
- Columns: Name (linked), Project, Slots/Week, Schedule Type, Failures
- "Add to Plan" button per row, checkmark if already in plan

### Hour Modal (`components/drill-down/hour-modal.tsx`)
- Tasks at clicked hour, each as `task-row.tsx`
- shadcn Dialog with focus trap, Escape to close
- Contract:
  - `HourModalProps = { open: boolean; onOpenChange: (open: boolean) => void; hour: number; dayOfWeek?: number; date?: string; tasks: RefreshTask[]; onAddToPlan?: (task: RefreshTask) => void; isInPlan?: (taskId: string) => boolean }`
  - Week heatmap click passes `dayOfWeek + hour`; month/calendar click passes `date + hour`
  - `onAddToPlan` and `isInPlan` are optional in Phase 6 and wired by parent containers in Phase 7.

### Task Row (`components/drill-down/task-row.tsx`)
Reusable across modal, Quick Add table, and error summary:
- Type badge, linked name, project, schedule summary, failure badge
- "Add to Plan" button (disabled if in plan)
- Contract includes optional callbacks so parent components can wire batch actions in later phases:
  - `onAddToPlan?: (task: RefreshTask) => void`
  - `isInPlan?: (taskId: string) => boolean`

### Batch Drawer (`components/batch/batch-drawer.tsx`) — CENTERPIECE
- Fixed bottom panel, visible when items > 0
- Collapsed: "N changes queued" + expand
- Expanded (~45% viewport):
  - Left: scrollable `batch-item.tsx` list with inline `schedule-editor.tsx`
  - Right: `preview-impact.tsx` (live cumulative impact)
  - Footer: "Clear All" + "Apply N Changes"

### Schedule Editor (`components/batch/schedule-editor.tsx`)
Frequency selector → conditional fields:
- **Hourly**: start/end time, fixed 1-hour interval, weekday checkboxes
- **Daily**: time picker, interval (2/4/6/8/12/24h), end time required for 2/4/6/8/12 and optional for 24, optional weekday checkboxes
- **Weekly**: time picker, weekday checkboxes (1-7 days, at least one required)
- **Monthly**: time picker + "On" mode selector:
  - **"Day"** mode: day-of-month multi-select grid (1-31 + Last Day)
  - **"[Ordinal] [Weekday]"** mode: ordinal dropdown (First/Second/Third/Fourth/Fifth/Last) + weekday dropdown (Sunday-Saturday)
- Zod validation, React Hook Form, live `newRunHours` recomputation

### Preview Impact (`components/batch/preview-impact.tsx`)
- Recharts grouped bar: gray (current) vs blue (proposed) per hour
- Health metric deltas: "Load Balance: 62 → 71 (+9)" in green
- All computed client-side from batch store (no API calls during preview)

### Error Summary (`components/errors/error-summary.tsx`)
- Collapsed by default, count badge in header
- Bucketed by category (pattern match on `lastFailureMessage`): connection, timeout, permission, data source unavailable, other
- If `lastFailureMessage` is null, bucket as `other` and show fallback text `"No failure message returned by Tableau"`
- Starter regex patterns must live in `lib/constants.ts` (see Locked Pre-Build Contracts) and be unit-tested with representative Tableau failure strings.
- Accordion per bucket, task rows with "Add to Plan"

---

## API Routes

### `GET /api/refresh-data`
1. Call `runRefreshAnalysis()` from shared `lib/refresh-data-service.ts` (single source of truth)
2. `runRefreshAnalysis()` flow:
   - Auth with Tableau (PAT, ~1-2s)
   - Fetch extract tasks (paginated)
   - Resolve workbook/datasource names + URLs
   - Resolve failure messages from jobs/history endpoint (best-effort mapping to task ID)
   - Run analysis (pure computation, no API calls)
3. Return full `AnalysisResponse`

### `GET /api/time-slots`
Must call the same `runRefreshAnalysis()` function as `/api/refresh-data` (no duplicate Tableau fetch path). Returns a 24-entry list derived from `analysis.hourly.byHour` in ascending hour order.

### `POST /api/reschedule`
Body: `RescheduleRequest` = `{ changes: Array<{ taskId: string; schedule: ScheduleConfig }> }`
- Auth once, iterate changes, build XML via `xml-builder.ts`
- PUT each to Tableau API with retry/backoff for `429` and transient `5xx` (1s, 2s, 4s; max 3 retries)
- Apply changes sequentially with a short inter-request delay (150ms) to reduce burst throttling
- Return `RescheduleResponse` with per-item `results` + `summary`
- On any success, route handler calls `revalidateTag('tableau')` to invalidate the shared analysis cache
- Client then calls TanStack Query `invalidateQueries()` for in-session sync
- HTTP semantics:
  - `200`: valid request shape; may include full success or partial success
  - `400`: request/schema validation failure (no writes attempted)
  - `500`: unexpected server failure before structured per-item results can be returned

### `GET /api/health`
Returns `{ status: "ok" }`.

### Zod Schema Shape for `POST /api/reschedule`
Use discriminated union validation on `frequency`:
- `Hourly`: `intervalHours === 1`, requires `startTime`, `endTime`, optional `weekDays`
- `Daily`: `intervalHours in [2,4,6,8,12,24]`, requires `startTime`, requires `endTime` when interval is `2|4|6|8|12`, optional `endTime` when interval is `24`, optional `weekDays`
- `Weekly`: `intervalHours === 24`, requires `startTime`, `weekDays` with 1-7 entries
- `Monthly`: `intervalHours === 24`, requires `startTime`, **one of** (mutually exclusive):
  - `monthDays` with entries from `1-31` or `"LastDay"` (On Day mode)
  - `monthlyOrdinal` (First/Second/Third/Fourth/Fifth/Last) + `monthlyWeekDay` (Sunday-Saturday) (On Ordinal Weekday mode)
Implementation location: `lib/schemas.ts` (shared by `schedule-editor.tsx` and `/api/reschedule` route).

---

## State Management

### Batch Store (`stores/batch-store.ts`)
```typescript
interface BatchState {
  items: BatchPlanItem[];
  isExpanded: boolean;
  addItem: (task: RefreshTask) => void;
  removeItem: (id: string) => void;
  updateItemSchedule: (id: string, schedule: ScheduleConfig) => void;
  clearAll: () => void;
  toggleExpanded: () => void;
  isTaskInPlan: (taskId: string) => boolean;
}
```

### Filter Store (`stores/filter-store.ts`)
```typescript
interface FilterState {
  search: string;
  project: string | null;
  type: "all" | "workbook" | "datasource";
  setSearch: (s: string) => void;
  setProject: (p: string | null) => void;
  setType: (t: "all" | "workbook" | "datasource") => void;
  clearAll: () => void;
}
```

---

## Build Phases & Checklists

### Phase 0: Sync Plan Files to Project
- [x] Update `tableau-refresh-manager/IMPLEMENTATION_PLAN.md` with this revised plan
- [x] Update `tableau-refresh-manager/AGENT_TEAMS_STRATEGY.md` to remove source system references
- [x] Verify both files are saved and ready for any agent to pick up cold

### Phase 1: Project Foundation
- [x] Initialize Next.js 16 with TypeScript (`npx create-next-app@latest`)
- [x] Install deps: `recharts`, `@tanstack/react-query`, `zustand`, `react-hook-form`, `@hookform/resolvers`, `zod`, `sonner`
- [x] Install dev deps: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@vitejs/plugin-react`, `jsdom`
- [x] Initialize shadcn/ui, add components: `dialog`, `button`, `select`, `input`, `accordion`, `badge`, `tooltip`, `separator`
- [x] Create folder structure (all directories from tree above)
- [x] Create `lib/types.ts` with ALL interfaces
- [x] Create `lib/constants.ts` (hour labels, color scales, health thresholds)
- [x] Create `lib/utils.ts` (`formatHour()`, `cn()`, timezone helpers)
- [x] Create `app/layout.tsx`, `app/providers.tsx`
- [x] Create `vitest.config.ts`
- [x] Create `.env.example` with: `TABLEAU_SERVER_URL`, `TABLEAU_SITE_NAME`, `TABLEAU_TOKEN_NAME`, `TABLEAU_TOKEN_SECRET`, `TABLEAU_API_VERSION` (optional), `APP_TIMEZONE`
- [x] Create `__tests__/lib/utils.test.ts` — test `formatHour()` and timezone helpers
- [x] Verify: `npm run dev` serves page, `npx vitest run` passes (90/90 tests, 7 suites)

### Phase 2: Tableau API Layer
- [x] Create `lib/tableau-auth.ts` — PAT sign-in/sign-out via REST (no TSC). Default API version: `3.24`, overridable via `TABLEAU_API_VERSION` env var
- [x] Create `lib/tableau-client.ts`:
  - [x] `getExtractRefreshTasks()` — paginated fetch (cache controlled by shared `runRefreshAnalysis()` layer)
  - [x] `resolveItemDetails()` — workbook/datasource names, URLs, projects
  - [x] `resolveFailureMessages()` — best-effort jobs/history lookup keyed by task ID (fallback: latest failed job by target workbook/datasource)
  - [x] `updateExtractRefreshTask()` — single task update
  - [x] `batchUpdateTasks()` — single auth, iterate changes sequentially with retry/backoff + short pacing delay
- [x] Create `lib/refresh-data-service.ts` — shared fetch+analyze pipeline using `unstable_cache` with `['tableau-analysis']` key and `{ revalidate: 3600, tags: ['tableau'] }`. Exports `runRefreshAnalysis(): Promise<AnalysisResponse>`. Both `/api/refresh-data` and `/api/time-slots` call this single cached function
- [x] Create `lib/xml-builder.ts` — XML payloads for frequency types:
  - [x] Daily (Tableau REST docs are authoritative; use legacy Python as behavior reference only)
  - [x] Weekly (Tableau REST docs are authoritative; use legacy Python as behavior reference only)
  - [x] **Hourly** (NEW — build from Tableau REST API docs, include start/end/interval/weekDays)
  - [x] **Monthly** — TWO sub-types:
    - [x] "On Day" mode: `<interval monthDay="12" />` with numeric 1-31 or "LastDay"
    - [x] "On [Ordinal] [Weekday]" mode: `<interval monthDay="Second" weekDay="Monday" />` — `monthDay` carries the ordinal string
- [x] Create `lib/analyzer.ts` — port from `tableau-refresh-balancer/src/analyzer.py`:
  - [x] `analyzeScheduledTasks()` (main function)
  - [x] `expandHourlyRunHours()` (hourly window expansion)
  - [x] `computeEnhancedStats()` (health metrics)
  - [x] `computeHeatmap()` (7x24 grid)
  - [x] `computeMonthlyCalendar()` (calendar data — always current month in site-local timezone, no month navigation for v1). Must handle both Monthly sub-types: "On Day" (numeric monthDay) and "On [Ordinal] [Weekday]" (e.g., Second Monday → find the 2nd Monday of the month)
- [x] Create `app/api/refresh-data/route.ts` — simple pass-through calling `runRefreshAnalysis()`. Set `maxDuration = 120` (no route-level caching; caching is in the service layer)
- [x] Create `app/api/time-slots/route.ts`
- [x] Create `app/api/health/route.ts`
- [x] Create `__tests__/lib/xml-builder.test.ts` — test all 4 frequency types + edge cases
- [x] Create `__tests__/lib/analyzer.test.ts` — port key tests from `tableau-refresh-balancer/tests/test_analyzer.py`
- [x] Verify: `curl /api/health` OK, `curl /api/refresh-data` returns analysis JSON (192 tasks), `curl /api/time-slots` returns 24 entries, tests pass

### Phase 3: Dashboard Shell + Health Cards
- [x] Create `app/page.tsx` — layout with section placeholders
- [x] Create `components/layout/header.tsx`
- [x] Create `hooks/use-refresh-data.ts` (TanStack Query, 5-min staleTime)
- [x] Create `hooks/use-time-slots.ts` (TanStack Query for `/api/time-slots`)
- [x] Create `components/health/health-cards.tsx` — 4-card grid
- [x] Add loading skeletons for health cards
- [x] Verify: Dashboard loads, health cards show live Tableau data (Load Balance: 60, Peak/Avg: 3.1, Utilization: 92%, Busiest Window: 83)

### Phase 4: Charts + Heatmap
- [x] Create `components/charts/hourly-chart.tsx` — Recharts stacked bar
  - [x] Stacked: gray "Fixed" + blue "Moveable"
  - [x] Click handler on bars
  - [x] Tooltip on hover
- [x] Create `components/charts/heatmap.tsx` — CSS grid
  - [x] Week view (7x24), month toggle
  - [x] Click handler on cells
  - [x] Color scale
- [x] Create `components/charts/month-calendar.tsx`
- [x] Verify: Charts render with live data, interactive (stacked bars, heatmap 7x24 with color scale, clickable)

### Phase 5: Filters + Quick Add Table
- [x] Create `stores/filter-store.ts`
- [x] Create `components/layout/filter-bar.tsx` (project, type, search, clear)
- [x] Create `components/tables/top-refreshers.tsx` (Quick Add)
- [x] Wire filters to all views
- [x] Verify: Filters work globally, search debounced (project, type, search all visible and wired)

### Phase 6: Drill-Down Modal
- [x] Create `components/drill-down/task-row.tsx`
- [x] Create `components/drill-down/hour-modal.tsx`
- [x] Lock `HourModalProps` contract (hour + optional day/date context + optional `onAddToPlan`/`isInPlan`) for chart/heatmap callers
- [x] Wire chart bar click → modal
- [x] Wire heatmap cell click → modal
- [x] Wire month calendar date click → modal at busiest hour
- [x] Implement cross-view filtering hardening (health cards + charts + calendar use same filtered task set from page)
- [x] Verify: Click bar → modal with correct tasks

### Phase 7: Batch Drawer + Schedule Editor (Core Feature)
- [x] Create `stores/batch-store.ts`
- [x] Create `lib/schemas.ts` with authoritative schedule schemas (`scheduleConfigSchema`, `rescheduleRequestSchema`) for shared API/UI validation
- [x] Create `components/batch/batch-drawer.tsx` (fixed bottom, collapse/expand)
- [x] Create `components/batch/batch-item.tsx` (diff display, edit toggle, remove)
- [x] Create `components/batch/schedule-editor.tsx`:
  - [x] Frequency selector (Hourly/Daily/Weekly/Monthly)
  - [x] Hourly fields: start, end, fixed 1-hour interval, weekdays
  - [x] Daily fields: time, interval (2/4/6/8/12/24h), end time required for 2/4/6/8/12 and optional for 24, optional weekdays
  - [x] Weekly fields: time, weekday checkboxes (1-7, at least one)
  - [x] Monthly fields: time, "On" mode selector:
    - [x] "Day" mode: day-of-month multi-select grid (1-31 + Last Day)
    - [x] "Ordinal Weekday" mode: ordinal dropdown (First/Second/Third/Fourth/Fifth/Last) + weekday dropdown (Sunday-Saturday)
  - [x] Zod validation per frequency type (import `scheduleConfigSchema` from `lib/schemas.ts`)
  - [x] `newRunHours` recomputation on change
- [x] Create `hooks/use-batch-impact.ts`
- [x] Wire "Add to Plan" from modal + Quick Add → batch store (pass `onAddToPlan` + `isInPlan` from page/store into modal/task-row/top-refreshers)
- [x] Integrate `<BatchDrawer />` into `app/page.tsx`
- [x] Create `__tests__/components/schedule-editor.test.tsx` — form validation tests
- [x] Create `__tests__/components/batch-drawer.test.tsx` — batch workflow integration tests
- [x] Create `__tests__/hooks/use-batch-impact.test.ts` — impact computation tests
- [x] Verify: Add items, edit schedules, drawer updates correctly (Add to Plan from modal → item in drawer, schedule diff shown)

### Phase 8: Preview Impact + Apply
- [x] Create `components/batch/preview-impact.tsx` (grouped bar + health deltas)
- [x] Create `components/batch/apply-dialog.tsx`
- [x] Create `app/api/reschedule/route.ts`:
  - [x] Zod request validation (import from `lib/schemas.ts`; no route-local schedule schema)
  - [x] XML construction via `xml-builder.ts` for each change
  - [x] Single auth session, iterate changes
  - [x] Per-item success/failure results
  - [x] Server-side revalidation on success: `revalidateTag('tableau')` to invalidate the shared analysis cache
- [x] Wire: button → dialog → API → toast → invalidate queries
- [x] Handle partial failures (failed items stay in drawer)
- [x] Create `__tests__/api/reschedule-route.test.ts`:
  - [x] Returns `400` for invalid schema combinations (no write calls)
  - [x] Returns `200` + `success:false` for partial success with per-item result details
  - [x] Retries `429`/`5xx` with 1s/2s/4s backoff, max 3 retries
  - [x] Calls `revalidateTag('tableau')` when at least one item succeeds
- [x] Verify: Full end-to-end — add, edit, preview verified locally; apply deferred to production deploy

### Phase 9: Error Summary
- [x] Create `components/errors/error-summary.tsx`
- [x] Define error category patterns in `lib/constants.ts` for `lastFailureMessage` text using starter regex map from Locked Contracts (with fallback bucket when message is missing)
- [x] Accordion UI with task rows + "Add to Plan"
- [x] Verify: Failing tasks bucketed correctly (21 failures shown in Error Summary badge)

### Phase 10: Polish + Deploy
- [x] Responsive breakpoints (mobile/tablet)
- [x] Loading skeletons for charts and tables
- [x] Empty states for filtered views
- [x] Keyboard: Escape closes modals/drawer
- [ ] Vercel config (function timeouts if needed)
- [ ] Add manual post-deploy warm-up step to runbook (`GET /api/refresh-data` once after deploy); defer automated warm-up to post-v1
- [x] Final `.env.example` audit (no secret values, all required server vars documented)
- [ ] `vercel --prod` deployment
- [x] Run full Vitest suite — all tests pass
- [ ] Verify: All functionality works in production
- [x] Add React error boundary around chart/dashboard sections (prevents full-page blank on component crash)
- [x] Add `data-testid` attributes to batch drawer action buttons to replace fragile `.lucide-x` selectors in `batch-drawer.test.tsx`
- [x] Add inline comment in `hooks/use-batch-impact.ts` documenting that Monthly `taskDays` is approximated as 4 (not exact calendar computation)

---

## End-to-End Verification

- [x] `/api/health` returns OK
- [x] `/api/refresh-data` returns analysis from live Tableau Cloud (192 tasks, 1285 total refreshes)
- [x] `/api/time-slots` returns 24 sorted hour buckets from shared analysis pipeline
- [x] Shared analysis cache works — second request is instant, revalidates in background
- [x] Health cards show correct metrics (Load Balance: 60, Peak/Avg: 3.1, Utilization: 92%, Busiest: 83)
- [x] Hourly chart: stacked bars, correct counts, clickable
- [x] Heatmap: correct colors, clickable cells (Mon 8AM: 26 tasks verified)
- [x] Month calendar: daily totals, click filters hourly chart
- [x] Filters (project, type, search) work across all views
- [x] Click chart bar → modal with correct tasks (26 tasks at Mon 8AM verified)
- [x] "Add to Plan" from modal → item in drawer (Course Completion Setting Audit verified)
- [x] "Add to Plan" from Quick Add → item in drawer
- [ ] Edit schedule: change frequency type, time, days — all types work (Hourly, Daily, Weekly, Monthly On Day, Monthly On Ordinal Weekday)
- [x] Invalid schedule combos are rejected (Hourly interval >1, Weekly zero weekdays, bad monthDays, both monthDays and monthlyOrdinal set simultaneously)
- [ ] Preview Impact updates in real-time
- [ ] "Apply Changes" → changes persist in Tableau Cloud
- [x] `POST /api/reschedule` semantics hold: full success => `success:true`; partial success => HTTP 200 + `success:false`; validation failure => HTTP 400
- [ ] Successful apply triggers server revalidation for refresh-data/time-slots routes
- [ ] Partial failure: failed items remain in drawer for retry
- [x] Error summary: bucketed failures with accordion
- [x] Vitest: all tests pass
- [ ] Production Vercel deployment works

---

## V2 Backlog (Not in This Build)

- **Source system filtering** — fetch datasource connection details, configurable mapping file for server-address-to-source-name resolution, filter bar dropdown
- **Prep flow support** — extend to cover Tableau Prep flow schedules
- **Undo capability** — store previous schedule before applying, offer revert
- **Custom timezone** — make timezone configurable instead of hardcoded Central Time
- **Alerting** — notifications when load balance score drops below threshold

---

## Files to Reference During Build

| What | Path |
|------|------|
| Existing Tableau client (port to TS) | `tableau-refresh-balancer/src/tableau_client.py` |
| Existing analyzer (port to TS) | `tableau-refresh-balancer/src/analyzer.py` |
| Existing dashboard (reference for behavior) | `tableau-refresh-balancer/templates/dashboard.html` |
| Existing tests (port patterns) | `tableau-refresh-balancer/tests/test_analyzer.py`, `test_reschedule.py` |
| Legacy XML examples (reference only; not source-of-truth) | `tableau-refresh-balancer/src/tableau_client.py` lines 87-139 |
| Batch plan design doc | `tableau-refresh-balancer/BATCH_PLANNING_IMPLEMENTATION.md` |
| Hourly expansion logic | `tableau-refresh-balancer/src/analyzer.py` (`expand_hourly_run_hours`, `_extract_hour_interval`) |
| TypeScript API patterns | `references/TYPESCRIPT_API_PATTERNS.md` |
| Next.js/Vercel deployment | `references/CONFIGURATION_DEPLOYMENT.md` |
| Tailwind UI patterns | `references/MODERN_UI_PATTERNS_TAILWIND.md` |
| Modal/form patterns | `references/MODAL_FORM_SYSTEMS.md` |
| Search/filter patterns | `references/ADVANCED_SEARCH_FILTERING.md` |
| Agent Teams strategy | `tableau-refresh-manager/AGENT_TEAMS_STRATEGY.md` |
