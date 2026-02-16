// === Hour Labels ===

export const HOUR_LABELS: Record<number, string> = {
  0: "12 AM",
  1: "1 AM",
  2: "2 AM",
  3: "3 AM",
  4: "4 AM",
  5: "5 AM",
  6: "6 AM",
  7: "7 AM",
  8: "8 AM",
  9: "9 AM",
  10: "10 AM",
  11: "11 AM",
  12: "12 PM",
  13: "1 PM",
  14: "2 PM",
  15: "3 PM",
  16: "4 PM",
  17: "5 PM",
  18: "6 PM",
  19: "7 PM",
  20: "8 PM",
  21: "9 PM",
  22: "10 PM",
  23: "11 PM",
};

// === Day Labels ===

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const TABLEAU_WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

// Heatmap y=0 is Monday, y=6 is Sunday
export const HEATMAP_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// === Color Scales ===

export const HEATMAP_COLORS = {
  empty: "bg-gray-100 dark:bg-gray-800",
  low: "bg-blue-100 dark:bg-blue-900",
  medium: "bg-blue-300 dark:bg-blue-700",
  high: "bg-blue-500 dark:bg-blue-500",
  critical: "bg-blue-700 dark:bg-blue-400",
} as const;

// Hex values that mirror the heatmap blue scale for chart fills
export const HEATMAP_BLUE_HEX = {
  low: "#dbeafe", // blue-100
  medium: "#93c5fd", // blue-300
  high: "#3b82f6", // blue-500
  critical: "#1d4ed8", // blue-700
} as const;

export function getHeatmapColorClass(value: number, max: number): string {
  if (value === 0) return HEATMAP_COLORS.empty;
  const ratio = value / Math.max(max, 1);
  if (ratio < 0.25) return HEATMAP_COLORS.low;
  if (ratio < 0.5) return HEATMAP_COLORS.medium;
  if (ratio < 0.75) return HEATMAP_COLORS.high;
  return HEATMAP_COLORS.critical;
}

export function getHeatmapBlueHex(value: number, max: number): string {
  if (value === 0) return HEATMAP_BLUE_HEX.low;
  const ratio = value / Math.max(max, 1);
  if (ratio < 0.25) return HEATMAP_BLUE_HEX.low;
  if (ratio < 0.5) return HEATMAP_BLUE_HEX.medium;
  if (ratio < 0.75) return HEATMAP_BLUE_HEX.high;
  return HEATMAP_BLUE_HEX.critical;
}

// === Health Thresholds ===

export const HEALTH_THRESHOLDS = {
  loadBalanceScore: { green: 75, yellow: 50 }, // higher is better: ≥ green = green, ≥ yellow = yellow, else red
  peakAvgRatio: { green: 1.8, yellow: 3.0 }, // lower is better: ≤ green = green, ≤ yellow = yellow, else red
  utilization: { green: 60, yellow: 40 }, // higher is better: ≥ green = green, ≥ yellow = yellow, else red
  busyWindowPct: { green: 20, yellow: 35 }, // lower is better: ≤ green = green, ≤ yellow = yellow, else red
} as const;

export function getHealthColor(metric: keyof typeof HEALTH_THRESHOLDS, value: number): "green" | "yellow" | "red" {
  const t = HEALTH_THRESHOLDS[metric];
  if (metric === "loadBalanceScore" || metric === "utilization") {
    // Higher is better
    if (value >= t.green) return "green";
    if (value >= t.yellow) return "yellow";
    return "red";
  }
  // For peakAvgRatio, busyWindowPct — lower is better
  if (value <= t.green) return "green";
  if (value <= t.yellow) return "yellow";
  return "red";
}

// === Schedule Types ===

export const SCHEDULE_FREQUENCIES = ["Hourly", "Daily", "Weekly", "Monthly"] as const;

export const DAILY_INTERVAL_OPTIONS = [2, 4, 6, 8, 12, 24] as const;

export const MONTHLY_ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Last"] as const;

// === Error Bucket Patterns ===
// Used in components/errors/error-summary.tsx to categorize failure messages.

export const ERROR_BUCKET_PATTERNS = {
  connection: /connection refused|could not connect|connection reset|network error/i,
  timeout: /timeout|timed out|operation timed out|gateway timeout/i,
  permission: /permission denied|access denied|unauthorized|forbidden/i,
  "data source unavailable": /data source.*unavailable|datasource.*unavailable|failed to connect to.*database/i,
} as const;

export type ErrorBucketKey = keyof typeof ERROR_BUCKET_PATTERNS | "other";

export const ERROR_BUCKET_ORDER: ErrorBucketKey[] = [
  "connection",
  "timeout",
  "permission",
  "data source unavailable",
  "other",
];

export const ERROR_BUCKET_LABELS: Record<ErrorBucketKey, { label: string; icon: string }> = {
  connection: { label: "Connection Errors", icon: "Unplug" },
  timeout: { label: "Timeout Errors", icon: "Clock" },
  permission: { label: "Permission Errors", icon: "ShieldX" },
  "data source unavailable": { label: "Data Source Unavailable", icon: "DatabaseZap" },
  other: { label: "Other Errors", icon: "CircleAlert" },
};

export function categorizeError(message: string | null): ErrorBucketKey {
  if (!message) return "other";
  for (const [key, pattern] of Object.entries(ERROR_BUCKET_PATTERNS)) {
    if (pattern.test(message)) return key as ErrorBucketKey;
  }
  return "other";
}

// === Chart Colors ===

export const CHART_COLORS = {
  fixed: "#9ca3af", // gray-400 — hourly fixed tasks
  moveable: "#3b82f6", // blue-500 — moveable tasks
  current: "#9ca3af", // gray-400 — current distribution in preview
  proposed: "#3b82f6", // blue-500 — proposed distribution in preview
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
} as const;

// === App Config ===

export const DEFAULT_TIMEZONE = "America/Chicago";
export const DEFAULT_API_VERSION = "3.24";
export const CACHE_REVALIDATE_SECONDS = 3600; // 1 hour
export const TANSTACK_STALE_TIME_MS = CACHE_REVALIDATE_SECONDS * 1000; // Match server cache TTL
export const SEARCH_DEBOUNCE_MS = 300;
