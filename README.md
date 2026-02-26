# Tableau Refresh Schedule Manager

A Next.js application for analyzing and managing Tableau Cloud extract refresh schedules. Visualize schedule distribution, identify peak load times, and batch-reschedule tasks to balance server load.

## Features

- **Health Dashboard**: Load balance score, peak/quiet hours, utilization metrics, and peak-to-average ratio
- **Interactive Charts**: Hourly distribution, weekly heatmap, and monthly calendar views
- **Drill-Down Analysis**: Click any hour/day/date to see scheduled tasks with filter context
- **Cross-View Filtering**: Project, type (workbook/datasource), and search filters apply globally
- **Batch Planning**: Queue schedule changes, preview impact, and apply to Tableau Cloud
- **Error Summary** (Coming Soon): Categorized failure analysis with quick remediation

## Why This Exists

Tableau Cloud extract refreshes were piling up at the same times — 6 AM and midnight had 3x the load of other hours, causing failures and slow dashboards. There was no way to see the schedule distribution across all projects at once, and rescheduling meant clicking through each task one by one. This tool shows the full picture and lets you batch-reschedule in one shot.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Charts**: Recharts
- **Data Fetching**: TanStack Query (5-min client cache) + Next.js unstable_cache (1-hour server cache)
- **State**: Zustand (batch plan + filters)
- **Testing**: Vitest + React Testing Library

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- Tableau Cloud account with Personal Access Token (PAT)
- Extract refresh tasks configured in Tableau

### Environment Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your Tableau credentials:
   ```env
   TABLEAU_SERVER_URL=https://YOUR_SITE.online.tableau.com
   TABLEAU_SITE_NAME=your-site-name
   TABLEAU_TOKEN_NAME=your-token-name
   TABLEAU_TOKEN_SECRET=your-token-secret
   TABLEAU_API_VERSION=3.24
   APP_TIMEZONE=America/Chicago
   ```

   **Notes**:
   - `TABLEAU_SITE_NAME`: Use empty string for Tableau Default site
   - `TABLEAU_API_VERSION`: Defaults to `3.24` if omitted
   - `APP_TIMEZONE`: Defaults to `America/Chicago` (Central Time)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

### Testing

```bash
# Run tests once
npm test

# Watch mode
npm run test:watch
```

### Building for Production

```bash
npm run build
npm start
```

## Project Structure

```
tableau-refresh-manager/
├── app/                  # Next.js App Router pages and API routes
│   ├── api/             # REST API endpoints
│   │   ├── refresh-data/ # Main analysis endpoint (cached 1 hour)
│   │   ├── time-slots/   # Hour buckets sorted by load
│   │   └── reschedule/   # Batch schedule update endpoint
│   └── page.tsx         # Dashboard UI
├── components/          # React components
│   ├── layout/          # Header, filter bar
│   ├── health/          # Health metric cards
│   ├── charts/          # Hourly chart, heatmap, calendar
│   ├── tables/          # Top refreshers table
│   ├── drill-down/      # Hour modal with task list
│   └── batch/           # Batch planning UI (in progress)
├── lib/                 # Core business logic
│   ├── tableau-client.ts    # Tableau REST API client
│   ├── refresh-data-service.ts # Cached analysis pipeline
│   ├── analyzer.ts          # Schedule analysis algorithms
│   └── xml-builder.ts       # XML payload construction
├── stores/              # Zustand state management
├── hooks/               # TanStack Query hooks
└── __tests__/           # Vitest test suites
```

## How It Works

### Data Pipeline

1. **Fetch**: `lib/tableau-client.ts` calls Tableau REST API to get extract refresh tasks (50-100+ API calls per refresh)
2. **Analyze**: `lib/analyzer.ts` computes hourly distribution, heatmaps, health metrics, and calendar data
3. **Cache**: `lib/refresh-data-service.ts` uses Next.js `unstable_cache` (1-hour TTL, tag-based invalidation)
4. **Serve**: API routes (`/api/refresh-data`, `/api/time-slots`) return cached analysis
5. **Client**: TanStack Query adds 5-min client-side cache on top of server cache

**Cold-start behavior**: First request after deploy/cache expiry takes 30-60s (Tableau API calls). Subsequent requests are instant.

### Filtering Architecture

All filters (project, type, search) are applied **once** at the page level in `app/page.tsx`:

```typescript
const filteredTasks = useMemo(() => {
  if (!data) return [];
  return data.tasks.details.filter((task) =>
    taskMatchesFilters(task, search, project, type)
  );
}, [data, search, project, type]);
```

This `filteredTasks` array is then passed to:
- Health cards (metrics reflect filtered tasks)
- Charts (hourly distribution, heatmap, calendar)
- Top refreshers table

**Result**: All views stay perfectly in sync - change a filter, and every component updates consistently.

### Drill-Down Interactions

Click any visualization to see the tasks scheduled at that time:

- **Hourly chart bar** → Opens modal with tasks at that hour (all days)
- **Heatmap cell** → Opens modal with tasks at that hour + day of week
- **Calendar date** → Opens modal at the busiest hour for that date

The modal applies the current filter context (search/project/type) plus the time context (hour/day/date).

## Status

Phases 1-8 complete (API integration, dashboard, filtering, drill-down, batch planning). Error summary and responsive polish are planned. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for details.

## Testing

Test suites cover:
- XML payload generation for all schedule types (Hourly/Daily/Weekly/Monthly)
- Schedule analysis algorithms (hourly expansion, heatmap computation)
- Utility functions (time formatting, timezone handling)

Run `npm test` before committing.

## Deployment

Deploy to Vercel:

```bash
vercel --prod
```

**Post-deploy warm-up**: Call `GET /api/refresh-data` once after deploy to populate the cache (prevents 30-60s cold start for first user).

## License

MIT
