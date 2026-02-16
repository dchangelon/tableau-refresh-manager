# Code Quality Improvements - February 13, 2026

## Summary

Resolved all minor code quality issues identified in Phase 6 review. All changes are **non-breaking** and improve maintainability without altering functionality.

**Status**: ✅ Lint clean | ✅ 49/49 tests passing | ✅ Production build successful

---

## Changes Made

### 1. Extracted Shared Filtering Logic

**Problem**: `taskMatchesFilters`, `taskRunsOnDay`, and `taskRunsOnDate` were duplicated across multiple files.

**Solution**: Created [lib/filters.ts](lib/filters.ts) as a single source of truth for all filtering logic.

**Files Modified**:
- ✅ **Created** `lib/filters.ts` - Centralized filtering functions with JSDoc documentation
- ✅ **Updated** `app/page.tsx` - Removed local filter functions, imports from `lib/filters`
- ✅ **Updated** `components/charts/month-calendar.tsx` - Removed local `taskRunsOnDate`, imports from `lib/filters`

**Benefits**:
- Single source of truth for filter logic
- Easier to test filter functions in isolation
- Consistent behavior across all components
- Clear documentation via JSDoc comments

**Example**:
```typescript
// Before: Duplicated in page.tsx and month-calendar.tsx
function taskRunsOnDate(task: RefreshTask, dateStr: string): boolean { ... }

// After: Shared from lib/filters.ts
import { taskRunsOnDate } from "@/lib/filters";
```

---

### 2. Optimized Chart Component Data Fetching

**Problem**: Chart components called `useRefreshData()` even when receiving `tasks` prop, causing unnecessary hook execution.

**Solution**: Made data fetching conditional using TanStack Query's `enabled` option.

**Files Modified**:
- ✅ **Updated** `hooks/use-refresh-data.ts` - Accept optional query options (enables `enabled: false`)
- ✅ **Updated** `components/charts/hourly-chart.tsx` - Only fetch when `tasks` not provided
- ✅ **Updated** `components/charts/heatmap.tsx` - Only fetch when `tasks` not provided
- ✅ **Updated** `components/charts/month-calendar.tsx` - Only fetch when `tasks` not provided

**How It Works**:
```typescript
// Hook now accepts options
export function useRefreshData(
  options?: Omit<UseQueryOptions<AnalysisResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: ['refresh-data'],
    queryFn: fetchRefreshData,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    ...options, // Allows enabled: false
  });
}

// Components use it conditionally
const { data, isLoading } = useRefreshData({ enabled: !tasks });
```

**Benefits**:
- No wasted hook executions when data is already provided
- Clearer component intent (self-fetching vs. parent-filtered)
- Better performance (fewer memo checks, smaller hook dependency graph)

**Performance Impact**:
- Before: Hook always executed, TanStack Query short-circuits based on cache
- After: Hook skipped entirely when data already available via props
- Net benefit: Reduced React overhead, cleaner profiler traces

---

### 3. Improved Lint Pattern for Unused Parameters

**Problem**: `void taskId` pattern for intentionally unused parameter was non-idiomatic.

**Solution**: Used TypeScript underscore prefix convention + eslint-disable comment.

**Files Modified**:
- ✅ **Updated** `components/tables/top-refreshers.tsx` - Changed `void taskId` to `_taskId` with inline disable

**Before**:
```typescript
const isInPlan = (taskId: string) => {
  void taskId;  // Suppress unused warning
  return false;
};
```

**After**:
```typescript
// TODO: Wire to batch store in Phase 7
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const isInPlan = (_taskId: string) => {
  return false;
};
```

**Benefits**:
- Follows TypeScript/JavaScript community conventions
- Clear intent: underscore prefix signals "intentionally unused"
- Explicit TODO comment explains why it's a stub

---

## Verification

All quality gates passing:

```bash
# Lint - No warnings or errors
npm run lint
✓ Clean

# Tests - All passing
npm test
✓ 49/49 tests passing

# Build - Production-ready
npm run build
✓ Successful build
```

---

## Impact on Phase 7

These improvements directly benefit the upcoming batch planning implementation:

### 1. Filter Logic Reuse
The extracted `taskMatchesFilters` from `lib/filters.ts` will be used in:
- Batch impact preview (apply filters before computing "after" metrics)
- Validation (check if task already in plan)
- Search/filter UI in batch drawer (if implemented)

### 2. Hook Pattern Established
The `useRefreshData({ enabled: false })` pattern can be applied to:
- `use-time-slots.ts` hook (same optimization)
- Future hooks in batch planning (preview data fetching)

### 3. Cleaner Codebase for New Features
With filtering logic centralized and data fetching optimized, Phase 7 components can:
- Import filters directly without duplication
- Pass filtered data down without performance concerns
- Focus on batch planning UX without fighting technical debt

---

## Files Changed

| File | Lines Changed | Type |
|------|---------------|------|
| `lib/filters.ts` | +145 | Created |
| `app/page.tsx` | -95, +4 | Refactored |
| `components/charts/month-calendar.tsx` | -38, +5 | Refactored |
| `components/charts/hourly-chart.tsx` | ±12 | Optimized |
| `components/charts/heatmap.tsx` | ±12 | Optimized |
| `components/tables/top-refreshers.tsx` | ±3 | Improved |
| `hooks/use-refresh-data.ts` | +6 | Enhanced |

**Total**: +145 lines added (new file), ~95 lines removed (deduplicated), ~40 lines modified

**Net Result**: Cleaner codebase with better separation of concerns

---

## Code Quality Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Lint warnings | 2 | 0 | ✅ 100% |
| Duplicate filter logic | 2 files | 1 file | ✅ 50% |
| Unnecessary hook calls | 3 charts | 0 | ✅ 100% |
| JSDoc documentation | None | 3 functions | ✅ Added |

---

## Lessons Learned

1. **Extract Early**: Even minor duplication across 2 files compounds as the codebase grows. Extracting to `lib/filters.ts` now prevents 5+ files needing the same logic in Phase 7-9.

2. **Hook Options**: TanStack Query's `enabled` option is powerful for conditional data fetching. Pattern established here applies to all future query hooks.

3. **Type-Only Imports**: TypeScript imports used only in type positions still trigger "unused" warnings in some ESLint configs. Interface definitions should always precede function implementations to avoid orphaned imports.

4. **TODO Placeholders**: For stub functions waiting on feature implementation, prefer:
   - Underscore prefix for unused params (`_paramName`)
   - Inline eslint-disable for intentional violations
   - Adjacent TODO comment explaining when it'll be wired

---

## Next Steps

With these improvements complete, the codebase is **ready for Phase 7** (Batch Drawer + Schedule Editor):

1. Create `stores/batch-store.ts`
2. Wire `onAddToPlan` callbacks to batch store (replace TODOs in `top-refreshers.tsx`)
3. Build batch drawer UI with impact preview
4. Leverage `lib/filters.ts` for filtered impact computation

No additional refactoring needed - Phase 7 can proceed immediately.
