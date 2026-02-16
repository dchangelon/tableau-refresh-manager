import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBatchImpact } from "@/hooks/use-batch-impact";
import type { BatchPlanItem, AnalysisResponse } from "@/lib/types";

// Mock the batch store
const mockItems: BatchPlanItem[] = [];
vi.mock("@/stores/batch-store", () => ({
  useBatchStore: (selector: (state: { items: BatchPlanItem[] }) => unknown) =>
    selector({ items: mockItems }),
}));

// Mock the refresh data hook
let mockData: AnalysisResponse | undefined;
vi.mock("@/hooks/use-refresh-data", () => ({
  useRefreshData: () => ({ data: mockData }),
}));

function makeBaseData(byHour: Record<number, number>): AnalysisResponse {
  return {
    hourly: {
      byHour,
      peakHours: [],
      quietHours: [],
      totalRefreshes: Object.values(byHour).reduce((s, c) => s + c, 0),
      averagePerHour: Object.values(byHour).reduce((s, c) => s + c, 0) / 24,
    },
    daily: { byDay: {} },
    heatmap: { data: [], days: [], maxValue: 0 },
    loadComposition: { totalTaskRuns: 0, hourlyFixedRuns: 0, moveableRuns: 0, hourlyByHour: {} },
    tasks: { total: 0, details: [], withFailures: [], totalWithFailures: 0, byHour: {} },
    enhancedStats: {
      loadBalanceScore: { value: 100, health: "green" },
      busiestWindow: { label: "N/A", count: 0, pct: 0, health: "green" },
      utilization: { value: 0, health: "green" },
      peakAvgRatio: { value: 0, health: "green" },
    },
    calendar: { year: 2026, month: 2, monthName: "February", daysInMonth: 28, firstWeekday: 6, byDate: {} },
  };
}

function makeBatchItem(overrides: Partial<BatchPlanItem> = {}): BatchPlanItem {
  return {
    id: "item-1",
    taskId: "task-1",
    taskName: "Test Workbook",
    itemType: "workbook",
    currentSchedule: {
      frequency: "Daily",
      startTime: "08:00",
      endTime: null,
      intervalHours: 24,
      weekDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      monthDays: [],
      monthlyOrdinal: null,
      monthlyWeekDay: null,
    },
    newSchedule: {
      frequency: "Daily",
      startTime: "02:00",
      endTime: null,
      intervalHours: 24,
      weekDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      monthDays: [],
      monthlyOrdinal: null,
      monthlyWeekDay: null,
    },
    taskDays: 7,
    runHours: [8],
    newRunHours: [2],
    ...overrides,
  };
}

beforeEach(() => {
  mockItems.length = 0;
  mockData = undefined;
});

describe("useBatchImpact", () => {
  it("returns null when batch is empty", () => {
    mockData = makeBaseData({ 8: 14 });
    const { result } = renderHook(() => useBatchImpact());
    expect(result.current).toBeNull();
  });

  it("returns null when data is not loaded", () => {
    mockItems.push(makeBatchItem());
    mockData = undefined;
    const { result } = renderHook(() => useBatchImpact());
    expect(result.current).toBeNull();
  });

  it("computes impact for a single item moved from hour 8 to hour 2", () => {
    // Distribution: 14 task-runs at hour 8
    const byHour: Record<number, number> = {};
    for (let h = 0; h < 24; h++) byHour[h] = 0;
    byHour[8] = 14;

    mockData = makeBaseData(byHour);
    mockItems.push(makeBatchItem());

    const { result } = renderHook(() => useBatchImpact());
    expect(result.current).not.toBeNull();

    const impact = result.current!;

    // Current distribution unchanged
    expect(impact.currentDist[8]).toBe(14);
    expect(impact.currentDist[2]).toBe(0);

    // Proposed: hour 8 reduced by taskDays (7), hour 2 increased by newTaskDays (7)
    expect(impact.proposedDist[8]).toBe(7);
    expect(impact.proposedDist[2]).toBe(7);
  });

  it("computes cumulative impact for multiple items", () => {
    const byHour: Record<number, number> = {};
    for (let h = 0; h < 24; h++) byHour[h] = 0;
    byHour[8] = 21;

    mockData = makeBaseData(byHour);

    mockItems.push(
      makeBatchItem({ id: "item-1", taskId: "task-1", runHours: [8], newRunHours: [2], taskDays: 7 }),
      makeBatchItem({ id: "item-2", taskId: "task-2", runHours: [8], newRunHours: [3], taskDays: 7 }),
    );

    const { result } = renderHook(() => useBatchImpact());
    const impact = result.current!;

    // 21 - 7 - 7 = 7 at hour 8
    expect(impact.proposedDist[8]).toBe(7);
    // 7 at hour 2, 7 at hour 3
    expect(impact.proposedDist[2]).toBe(7);
    expect(impact.proposedDist[3]).toBe(7);
  });

  it("moving to same hour results in no net change", () => {
    const byHour: Record<number, number> = {};
    for (let h = 0; h < 24; h++) byHour[h] = 0;
    byHour[8] = 14;

    mockData = makeBaseData(byHour);

    // Move from hour 8 to hour 8 (same)
    mockItems.push(
      makeBatchItem({
        runHours: [8],
        newRunHours: [8],
        newSchedule: {
          frequency: "Daily",
          startTime: "08:00",
          endTime: null,
          intervalHours: 24,
          weekDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
          monthDays: [],
          monthlyOrdinal: null,
          monthlyWeekDay: null,
        },
      }),
    );

    const { result } = renderHook(() => useBatchImpact());
    const impact = result.current!;

    // No net change: subtract 7 then add 7
    expect(impact.proposedDist[8]).toBe(14);
    expect(impact.deltas.loadBalanceScore).toBe(0);
    expect(impact.deltas.peakAvgRatio).toBe(0);
  });

  it("health metric deltas have correct signs", () => {
    // Concentrated at hour 8 => bad balance
    const byHour: Record<number, number> = {};
    for (let h = 0; h < 24; h++) byHour[h] = 0;
    byHour[8] = 70;

    mockData = makeBaseData(byHour);

    // Move half to hour 2 — better balance
    mockItems.push(
      makeBatchItem({
        taskDays: 35,
        runHours: [8],
        newRunHours: [2],
        newSchedule: {
          frequency: "Daily",
          startTime: "02:00",
          endTime: null,
          intervalHours: 24,
          weekDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
          monthDays: [],
          monthlyOrdinal: null,
          monthlyWeekDay: null,
        },
      }),
    );

    const { result } = renderHook(() => useBatchImpact());
    const impact = result.current!;

    // Moving load away from single peak improves loadBalanceScore (positive delta)
    expect(impact.deltas.loadBalanceScore).toBeGreaterThan(0);
    // peakAvgRatio should decrease (negative delta = improvement)
    expect(impact.deltas.peakAvgRatio).toBeLessThanOrEqual(0);
  });

  it("handles Weekly schedule with weekDays for taskDays calculation", () => {
    const byHour: Record<number, number> = {};
    for (let h = 0; h < 24; h++) byHour[h] = 0;
    byHour[8] = 10;

    mockData = makeBaseData(byHour);

    mockItems.push(
      makeBatchItem({
        taskDays: 3,
        runHours: [8],
        newRunHours: [4],
        newSchedule: {
          frequency: "Weekly",
          startTime: "04:00",
          endTime: null,
          intervalHours: 24,
          weekDays: ["Monday", "Wednesday", "Friday"],
          monthDays: [],
          monthlyOrdinal: null,
          monthlyWeekDay: null,
        },
      }),
    );

    const { result } = renderHook(() => useBatchImpact());
    const impact = result.current!;

    // Subtract 3 from hour 8 (taskDays), add 3 to hour 4 (Weekly with 3 weekDays)
    expect(impact.proposedDist[8]).toBe(7);
    expect(impact.proposedDist[4]).toBe(3);
  });
});
