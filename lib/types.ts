// === Core Data Types ===

export interface RefreshTask {
  id: string; // Tableau extract task ID
  type: "workbook" | "datasource";
  itemId: string; // Workbook or datasource ID
  itemName: string;
  itemUrl: string | null; // Link to item on Tableau Cloud
  projectName: string;
  schedule: ScheduleConfig;
  consecutiveFailures: number;
  lastFailureMessage: string | null; // From jobs/history endpoint when available
  priority: number;
  nextRunAt: string | null;
  isHourly: boolean;
  runHours: number[]; // All hours this task runs (expanded for hourly)
  hourlyWindow: string | null; // "7 AM - 10 PM CT"
  taskDays: number; // Days per week this runs
}

export interface ScheduleConfig {
  frequency: "Hourly" | "Daily" | "Weekly" | "Monthly";
  startTime: string; // "HH:MM" site-local time
  endTime: string | null; // Required for Hourly and Daily intervals 2/4/6/8/12; optional for Daily 24; otherwise null
  intervalHours: 1 | 2 | 4 | 6 | 8 | 12 | 24 | null;
  weekDays: string[]; // Tableau weekday names ("Sunday"..."Saturday"); Hourly/Daily: 0-7 (empty => all days), Weekly: 1-7 required
  // Monthly "On Day" mode (mutually exclusive with monthlyOrdinal):
  monthDays: Array<number | "LastDay">; // Numeric day-of-month selections (1-31 or "LastDay")
  // Monthly "On [Ordinal] [Weekday]" mode (mutually exclusive with monthDays):
  monthlyOrdinal: "First" | "Second" | "Third" | "Fourth" | "Fifth" | "Last" | null;
  monthlyWeekDay: string | null; // Single Tableau weekday name; required when monthlyOrdinal is set
}

// === Batch Plan Types ===

export interface BatchPlanItem {
  id: string; // Client-generated UUID
  taskId: string;
  taskName: string;
  itemType: "workbook" | "datasource";
  currentSchedule: ScheduleConfig;
  newSchedule: ScheduleConfig; // Any field can change
  taskDays: number;
  runHours: number[]; // Current run hours
  newRunHours: number[]; // Proposed (recomputed on edit)
}

export interface ImpactPreview {
  currentDist: Record<number, number>; // hour → count
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

export interface HealthMetrics {
  loadBalanceScore: { value: number; health: "green" | "yellow" | "red" };
  busiestWindow: { label: string; count: number; pct: number; health: "green" | "yellow" | "red" };
  utilization: { value: number; health: "green" | "yellow" | "red" };
  peakAvgRatio: { value: number; health: "green" | "yellow" | "red" };
}

export interface HeatmapCell {
  x: number; // hour (0-23)
  y: number; // weekday index (0=Monday ... 6=Sunday)
  v: number; // task count
}

export interface AnalysisResponse {
  hourly: {
    byHour: Record<number, number>;
    peakHours: number[];
    quietHours: number[];
    totalRefreshes: number;
    averagePerHour: number;
  };
  daily: { byDay: Record<string, number> };
  heatmap: { data: HeatmapCell[]; days: string[]; maxValue: number };
  loadComposition: {
    totalTaskRuns: number;
    hourlyFixedRuns: number;
    moveableRuns: number;
    hourlyByHour: Record<number, number>;
  };
  tasks: {
    total: number;
    details: RefreshTask[];
    withFailures: RefreshTask[];
    totalWithFailures: number;
    byHour: Record<number, RefreshTask[]>;
  };
  enhancedStats: HealthMetrics;
  // byDate keys use "YYYY-MM-DD" (site-local). Always current month per APP_TIMEZONE.
  calendar: {
    year: number;
    month: number;
    monthName: string;
    daysInMonth: number;
    firstWeekday: number;
    byDate: Record<string, number>;
  };
}

// === API Types ===

export type RescheduleChange = {
  taskId: string;
  schedule: ScheduleConfig;
};

export interface RescheduleRequest {
  changes: RescheduleChange[];
}

export interface RescheduleResult {
  taskId: string;
  success: boolean;
  message?: string;
  error?: string;
  statusCode?: number;
}

export interface RescheduleResponse {
  success: boolean;
  results: RescheduleResult[];
  summary: { total: number; succeeded: number; failed: number };
}

// === Time Slot Types ===

export interface TimeSlot {
  hour: number;
  label: string;
  count: number;
}
