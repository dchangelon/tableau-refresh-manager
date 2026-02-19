/**
 * Analysis engine for Tableau extract refresh patterns.
 * Ported from tableau-refresh-balancer/src/analyzer.py
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { getCurrentYearMonth, getDaysInMonth, getFirstWeekdayOfMonth, formatHour } from "@/lib/utils";
import { getHealthColor } from "@/lib/constants";
import type { AnalysisResponse, RefreshTask, HeatmapCell, HealthMetrics } from "@/lib/types";

// Day name mappings for heatmap
const SHORT_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const JS_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Tableau weekday name to heatmap y-index (0=Monday, 6=Sunday)
const DAY_NAME_TO_INDEX: Record<string, number> = {
  Sunday: 6,
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
};

// Month names
const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Parse schedule time (already in site-local timezone) and return the hour.
 */
function parseScheduleTime(timeStr: string): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  return parseInt(parts[0], 10);
}

/**
 * Extract which days of the week a task runs.
 * Returns heatmap y-indices (0=Monday, 6=Sunday).
 */
function extractScheduleDays(intervals: any): number[] {
  if (!intervals) return [0, 1, 2, 3, 4, 5, 6]; // All days

  let intervalList = intervals.interval || [];
  if (!Array.isArray(intervalList)) {
    intervalList = [intervalList];
  }

  const days: number[] = [];
  for (const item of intervalList) {
    if (item.weekDay && item.weekDay in DAY_NAME_TO_INDEX) {
      days.push(DAY_NAME_TO_INDEX[item.weekDay]);
    }
  }

  return days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
}

function getIntervalList(intervals: any): any[] {
  if (!intervals) return [];
  const intervalList = intervals.interval || [];
  return Array.isArray(intervalList) ? intervalList : [intervalList];
}

function matchesMonthlyScheduleDate(
  dayNum: number,
  daysInMonth: number,
  jsWeekDayName: string,
  intervals: any
): boolean {
  const intervalList = getIntervalList(intervals);
  if (intervalList.length === 0) return false;

  for (const item of intervalList) {
    const monthDay = item.monthDay;
    const weekDay = item.weekDay;

    // "On Day" mode: numeric day or LastDay
    if (!weekDay && monthDay !== undefined) {
      if (monthDay === "LastDay" && dayNum === daysInMonth) {
        return true;
      }
      const numericDay = parseInt(monthDay, 10);
      if (!isNaN(numericDay) && numericDay === dayNum) {
        return true;
      }
    }

    // "On [Ordinal] [Weekday]" mode
    if (weekDay && monthDay && jsWeekDayName === weekDay) {
      const occurrence = Math.floor((dayNum - 1) / 7) + 1;
      const isLastOccurrence = dayNum + 7 > daysInMonth;

      if (
        (monthDay === "First" && occurrence === 1) ||
        (monthDay === "Second" && occurrence === 2) ||
        (monthDay === "Third" && occurrence === 3) ||
        (monthDay === "Fourth" && occurrence === 4) ||
        (monthDay === "Fifth" && occurrence === 5) ||
        (monthDay === "Last" && isLastOccurrence)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract hour interval from intervals dict. Default to 1 if not found.
 */
function extractHourInterval(intervals: any): number {
  if (!intervals) return 1;

  let intervalList = intervals.interval || [];
  if (!Array.isArray(intervalList)) {
    intervalList = [intervalList];
  }

  for (const item of intervalList) {
    if (item.hours !== undefined) {
      const h = parseInt(item.hours, 10);
      if (!isNaN(h)) return h;
    }
    if (item.minutes !== undefined) {
      // Sub-hourly intervals (15/30 min) treated as every hour for load counting
      return 1;
    }
  }

  return 1;
}

/**
 * For Hourly tasks, return all local hours the task runs within its window.
 */
function expandHourlyRunHours(
  startTime: string,
  endTime: string | null,
  intervals: any
): number[] {
  const startParts = startTime.split(":");
  const startHour = parseInt(startParts[0], 10);
  const startMinute = startParts.length > 1 ? parseInt(startParts[1], 10) : 0;

  // If no end time, return just the start hour
  if (!endTime) {
    const localHour = parseScheduleTime(startTime);
    return localHour !== null ? [localHour] : [];
  }

  const endParts = endTime.split(":");
  const endHour = parseInt(endParts[0], 10);
  const endMinute = endParts.length > 1 ? parseInt(endParts[1], 10) : 0;

  const hourInterval = extractHourInterval(intervals);

  // Iterate local hours directly (times are already local)
  const localHours = new Set<number>();
  let currentMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  while (currentMinutes <= endMinutes) {
    const h = Math.floor(currentMinutes / 60);
    if (h > 23) break;
    localHours.add(h);
    currentMinutes += hourInterval * 60;
  }

  return Array.from(localHours).sort((a, b) => a - b);
}

/**
 * Format 'X AM - Y PM' string for hourly window display.
 */
function formatHourlyWindow(runHours: number[]): string {
  if (runHours.length === 0) return "";
  return `${formatHour(Math.min(...runHours))} - ${formatHour(Math.max(...runHours))}`;
}

/**
 * Format a list of task details for display in recommendations.
 */
function formatWorkbookList(tasks: any[], maxItems = 5): Array<{ name: string; url: string; type: string }> {
  if (!tasks || tasks.length === 0) return [];

  // Sort by consecutive failures (descending) to prioritize problem items
  const sorted = [...tasks].sort((a, b) => (b.consecutive_failures || 0) - (a.consecutive_failures || 0));

  const items: Array<{ name: string; url: string; type: string }> = [];
  const seenNames = new Set<string>();

  for (const task of sorted) {
    const name = task.item_name || "Unknown";
    if (seenNames.has(name)) continue;
    seenNames.add(name);

    items.push({
      name,
      url: task.item_url || "",
      type: task.type || "workbook",
    });

    if (items.length >= maxItems) break;
  }

  return items;
}

/**
 * Generate recommendations for spreading refresh load.
 */
function generateRecommendations(
  hourlyCountsParam: Record<number, number>,
  peakHours: number[],
  quietHours: number[],
  avgPerHour: number,
  tasksByHour?: Record<number, any[]>,
  hourlyCountsByHour?: Record<number, number>
): Array<{
  type: "critical" | "warning" | "info" | "suggestion" | "success";
  title: string;
  message: string;
  action?: string;
  affectedItems?: Array<{ name: string; url: string; type: string }>;
}> {
  const recommendations: Array<{
    type: "critical" | "warning" | "info" | "suggestion" | "success";
    title: string;
    message: string;
    action?: string;
    affectedItems?: Array<{ name: string; url: string; type: string }>;
  }> = [];

  if (peakHours.length === 0) return recommendations;

  const counts = Object.values(hourlyCountsParam);
  const maxCount = Math.max(...counts);

  if (maxCount > 0 && avgPerHour > 0) {
    const imbalanceRatio = maxCount / avgPerHour;

    if (imbalanceRatio > 3) {
      // Get affected workbooks for critical recommendation
      let affectedItems: Array<{ name: string; url: string; type: string }> = [];
      if (tasksByHour && peakHours[0] in tasksByHour) {
        affectedItems = formatWorkbookList(tasksByHour[peakHours[0]]);
      }

      let message = `Peak hours have ${imbalanceRatio.toFixed(1)}x the average load. Consider distributing refreshes more evenly.`;
      const peakTotal = hourlyCountsParam[peakHours[0]] || 0;
      const peakFixed = hourlyCountsByHour ? hourlyCountsByHour[peakHours[0]] || 0 : 0;
      if (peakFixed > 0) {
        message += ` (${peakFixed} of ${peakTotal} runs are from hourly schedules and cannot be moved.)`;
      }

      recommendations.push({
        type: "critical",
        title: "Severe Load Imbalance",
        message,
        action: `Move some refreshes from ${formatHour(peakHours[0])} to quieter hours like ${formatHour(quietHours[0])}.`,
        affectedItems,
      });

      // If peak is >80% hourly tasks, note it separately
      if (peakTotal > 0 && peakFixed / peakTotal > 0.8) {
        recommendations.push({
          type: "info",
          title: "Peak Dominated by Hourly Schedules",
          message: `${formatHour(peakHours[0])} load is ${Math.round((peakFixed / peakTotal) * 100)}% from hourly schedules — these cannot be rescheduled to a different time.`,
          action: "Focus on moving non-hourly tasks away from this hour.",
        });
      }
    } else if (imbalanceRatio > 2) {
      // Get affected workbooks for warning recommendation
      let affectedItems: Array<{ name: string; url: string; type: string }> = [];
      if (tasksByHour && peakHours[0] in tasksByHour) {
        affectedItems = formatWorkbookList(tasksByHour[peakHours[0]]);
      }

      let message = `Peak hours have ${imbalanceRatio.toFixed(1)}x the average load.`;
      const peakTotal = hourlyCountsParam[peakHours[0]] || 0;
      const peakFixed = hourlyCountsByHour ? hourlyCountsByHour[peakHours[0]] || 0 : 0;
      if (peakFixed > 0) {
        message += ` (${peakFixed} of ${peakTotal} runs are from hourly schedules and cannot be moved.)`;
      }

      recommendations.push({
        type: "warning",
        title: "Moderate Load Imbalance",
        message,
        action: "Consider spreading refreshes across more hours.",
        affectedItems,
      });

      if (peakTotal > 0 && peakFixed / peakTotal > 0.8) {
        recommendations.push({
          type: "info",
          title: "Peak Dominated by Hourly Schedules",
          message: `${formatHour(peakHours[0])} load is ${Math.round((peakFixed / peakTotal) * 100)}% from hourly schedules — these cannot be rescheduled to a different time.`,
          action: "Focus on moving non-hourly tasks away from this hour.",
        });
      }
    }
  }

  // Check for business hours concentration
  const businessHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17].reduce(
    (sum, h) => sum + (hourlyCountsParam[h] || 0),
    0
  );
  const offHours =
    [...Array(8).keys(), 18, 19, 20, 21, 22, 23].reduce((sum, h) => sum + (hourlyCountsParam[h] || 0), 0) + 0;
  const total = businessHours + offHours;

  if (total > 0 && businessHours / total > 0.8) {
    recommendations.push({
      type: "info",
      title: "High Business Hours Concentration",
      message: `${Math.round((businessHours / total) * 100)}% of refreshes run during business hours (8 AM - 6 PM).`,
      action: "Consider moving non-critical refreshes to early morning or evening.",
    });
  }

  // Suggest specific quiet hours
  if (quietHours.length > 0 && peakHours.length > 0) {
    const peakCount = hourlyCountsParam[peakHours[0]] || 0;
    const quietCount = hourlyCountsParam[quietHours[0]] || 0;

    if (peakCount > quietCount + 5) {
      // Get affected workbooks for suggestion
      let affectedItems: Array<{ name: string; url: string; type: string }> = [];
      if (tasksByHour && peakHours[0] in tasksByHour) {
        affectedItems = formatWorkbookList(tasksByHour[peakHours[0]]);
      }

      recommendations.push({
        type: "suggestion",
        title: "Recommended Time Slots",
        message: `The hour starting at ${formatHour(quietHours[0])} has minimal activity (${quietCount} refreshes).`,
        action: `This is a good candidate for moving refreshes from ${formatHour(peakHours[0])} (${peakCount} refreshes).`,
        affectedItems,
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: "success",
      title: "Load Distribution Looks Good",
      message: "Refresh load appears reasonably distributed across hours.",
      action: "Continue monitoring for changes in patterns.",
    });
  }

  return recommendations;
}

/**
 * Compute health metrics for the dashboard.
 */
function computeEnhancedStats(hourlyCountsParam: Record<number, number>): HealthMetrics {
  const counts = Object.values(hourlyCountsParam);
  const total = counts.reduce((sum, c) => sum + c, 0);

  if (total === 0) {
    return {
      loadBalanceScore: { value: 100, health: "green" },
      busiestWindow: { label: "N/A", count: 0, pct: 0, health: "green" },
      utilization: { value: 0, health: "green" },
      peakAvgRatio: { value: 0, health: "green" },
    };
  }

  const mean = total / 24;
  const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / 24;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  // Score: 100 when perfectly balanced (cv=0), decreases as imbalance grows
  const score = Math.max(0, Math.round(100 / (1 + cv)));
  const scoreHealth = getHealthColor("loadBalanceScore", score);

  // Busiest 3-hour window (sliding, wraps midnight)
  let bestStart = 0;
  let bestSum = 0;
  for (let start = 0; start < 24; start++) {
    const windowSum = [0, 1, 2].reduce((sum, i) => sum + (hourlyCountsParam[(start + i) % 24] || 0), 0);
    if (windowSum > bestSum) {
      bestSum = windowSum;
      bestStart = start;
    }
  }
  const endHour = (bestStart + 3) % 24;
  const windowLabel = `${formatHour(bestStart)}-${formatHour(endHour)}`;
  const windowPct = total > 0 ? (bestSum / total) * 100 : 0;
  const windowHealth = getHealthColor("busyWindowPct", windowPct);

  // Utilization: % of hours with at least 1 refresh
  const activeHours = counts.filter((c) => c > 0).length;
  const utilization = Math.round((activeHours / 24) * 100);
  const utilHealth = getHealthColor("utilization", utilization);

  // Peak-to-Average Ratio
  const maxCount = Math.max(...counts);
  const ratio = mean > 0 ? parseFloat((maxCount / mean).toFixed(1)) : 0;
  const ratioHealth = getHealthColor("peakAvgRatio", ratio);

  return {
    loadBalanceScore: { value: score, health: scoreHealth },
    busiestWindow: {
      label: windowLabel,
      count: bestSum,
      pct: parseFloat(windowPct.toFixed(1)),
      health: windowHealth,
    },
    utilization: { value: utilization, health: utilHealth },
    peakAvgRatio: { value: ratio, health: ratioHealth },
  };
}

/**
 * Compute heatmap data (hour x day grid).
 */
function computeHeatmap(taskDetails: any[]): { data: HeatmapCell[]; days: string[]; maxValue: number } {
  const heatmap: Record<string, Record<number, number>> = {};
  for (const day of SHORT_DAY_NAMES) {
    heatmap[day] = {};
    for (let h = 0; h < 24; h++) {
      heatmap[day][h] = 0;
    }
  }

  for (const task of taskDetails) {
    const runDays = task.days || [];
    const runHours = task.run_hours || [task.hour];

    for (const dayName of runDays) {
      const dayIdx = FULL_DAY_NAMES.indexOf(dayName);
      if (dayIdx === -1) continue;
      const shortDayName = SHORT_DAY_NAMES[dayIdx];

      for (const rh of runHours) {
        heatmap[shortDayName][rh] = (heatmap[shortDayName][rh] || 0) + 1;
      }
    }
  }

  // Convert to Chart.js format
  const dataPoints: HeatmapCell[] = [];
  for (let dayIdx = 0; dayIdx < SHORT_DAY_NAMES.length; dayIdx++) {
    const day = SHORT_DAY_NAMES[dayIdx];
    for (let hour = 0; hour < 24; hour++) {
      const count = heatmap[day][hour];
      dataPoints.push({ x: hour, y: dayIdx, v: count });
    }
  }

  const maxValue = dataPoints.length > 0 ? Math.max(...dataPoints.map((p) => p.v)) : 0;

  return {
    data: dataPoints,
    days: SHORT_DAY_NAMES,
    maxValue,
  };
}

/**
 * Compute a monthly calendar grid showing refresh counts per day.
 */
function computeMonthlyCalendar(
  _tasks: any[],
  taskDetails: any[],
  year: number,
  month: number
): {
  year: number;
  month: number;
  monthName: string;
  daysInMonth: number;
  firstWeekday: number;
  byDate: Record<string, number>;
} {
  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getFirstWeekdayOfMonth(year, month); // 0=Monday

  const byDate: Record<string, number> = {};
  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    byDate[dateStr] = 0;
  }

  for (const taskInfo of taskDetails) {
    const frequency = taskInfo.schedule_frequency || "";
    const runDayNames = taskInfo.days || [];
    const runDays = runDayNames
      .map((d: string) => FULL_DAY_NAMES.indexOf(d))
      .filter((idx: number) => idx !== -1);
    const intervals = taskInfo.schedule_intervals || {};

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const jsDate = new Date(year, month - 1, dayNum);
      const weekday = jsDate.getDay() === 0 ? 6 : jsDate.getDay() - 1; // 0=Monday, 6=Sunday

      let shouldInclude = false;

      if (frequency && frequency.toLowerCase() === "monthly") {
        const jsWeekDayName = JS_DAY_NAMES[jsDate.getDay()];
        shouldInclude = matchesMonthlyScheduleDate(dayNum, daysInMonth, jsWeekDayName, intervals);
      } else {
        // Daily or Weekly: check weekday
        if (runDays.includes(weekday)) {
          shouldInclude = true;
        }
      }

      if (shouldInclude) {
        const runsPerDay = taskInfo.run_hours ? taskInfo.run_hours.length : 1;
        byDate[dateStr] += runsPerDay;
      }
    }
  }

  return {
    year,
    month,
    monthName: MONTH_NAMES[month],
    daysInMonth,
    firstWeekday,
    byDate,
  };
}

/**
 * Analyze scheduled extract refresh tasks by hour and day.
 *
 * @param tasks - Array of enriched task records (must have `resolved_item` from tableau-client)
 * @param timezone - Timezone for analysis (default: Central Time)
 * @returns Analysis results including hourly counts, peaks, and recommendations
 */
export function analyzeScheduledTasks(tasks: any[], timezone = "America/Chicago"): AnalysisResponse {
  const hourlyCountsParam: Record<number, number> = {};
  const dailyCountsParam: Record<string, number> = {};
  const hourlyOnlyCountsParam: Record<number, number> = {};
  const tasksByHourParam: Record<number, any[]> = {};

  // Initialize
  for (let h = 0; h < 24; h++) {
    hourlyCountsParam[h] = 0;
    hourlyOnlyCountsParam[h] = 0;
    tasksByHourParam[h] = [];
  }
  for (const day of FULL_DAY_NAMES) {
    dailyCountsParam[day] = 0;
  }

  const taskDetails: any[] = [];
  const tasksWithFailures: any[] = [];

  for (const task of tasks) {
    const extractRefresh = task.extractRefresh || {};
    const schedule = extractRefresh.schedule || {};
    const freqDetails = schedule.frequencyDetails || {};

    const startTimeUtc = freqDetails.start;
    if (!startTimeUtc) continue;

    const localHour = parseScheduleTime(startTimeUtc);
    if (localHour === null) continue;

    const intervals = freqDetails.intervals || {};
    const runDays = extractScheduleDays(intervals);

    const endTimeUtc = freqDetails.end || null;
    const frequency = schedule.frequency || "";
    const isHourly = frequency.toLowerCase() === "hourly";

    let runHours: number[];
    let hourlyInterval: number | null = null;

    if (isHourly) {
      runHours = expandHourlyRunHours(startTimeUtc, endTimeUtc, intervals);
      hourlyInterval = extractHourInterval(intervals);
    } else if (frequency.toLowerCase() === "daily") {
      // Daily schedules: extract interval from Tableau, default to 24 (once per day)
      const extracted = extractHourInterval(intervals);
      hourlyInterval = [2, 4, 6, 8, 12, 24].includes(extracted) ? extracted : 24;
      if (hourlyInterval < 24 && endTimeUtc) {
        runHours = expandHourlyRunHours(startTimeUtc, endTimeUtc, intervals);
      } else {
        runHours = [localHour];
      }
    } else {
      runHours = [localHour];
    }

    const workbook = extractRefresh.workbook || {};
    const datasource = extractRefresh.datasource || {};
    const itemId = workbook.id || datasource.id || "unknown";
    const itemType = workbook.id ? "workbook" : "datasource";

    const failCount = parseInt(extractRefresh.consecutiveFailedCount || "0", 10);

    // Count for each day the task runs
    for (const dayIdx of runDays) {
      for (const rh of runHours) {
        hourlyCountsParam[rh] = (hourlyCountsParam[rh] || 0) + 1;
        if (isHourly) {
          hourlyOnlyCountsParam[rh] = (hourlyOnlyCountsParam[rh] || 0) + 1;
        }
      }
      dailyCountsParam[FULL_DAY_NAMES[dayIdx]] += runHours.length;
    }

    const resolved = task.resolved_item || {};

    const taskInfo = {
      id: extractRefresh.id,
      type: itemType,
      item_id: itemId,
      item_name: resolved.name || (itemId ? `ID: ${itemId.slice(0, 8)}...` : "Unknown"),
      item_url: resolved.url || "",
      project_name: resolved.project || "",
      hour: localHour,
      hour_formatted: formatHour(localHour),
      days: runDays.map((d: number) => FULL_DAY_NAMES[d]),
      frequency: schedule.frequency,
      next_run: schedule.nextRunAt,
      consecutive_failures: failCount,
      last_failure_message: extractRefresh.lastFailureMessage || null,
      priority: extractRefresh.priority,
      schedule_start_utc: startTimeUtc,
      schedule_end_utc: endTimeUtc,
      schedule_frequency: schedule.frequency,
      schedule_intervals: intervals,
      is_hourly: isHourly,
      hourly_interval: hourlyInterval,
      run_hours: runHours,
      hourly_window: isHourly ? formatHourlyWindow(runHours) : null,
    };

    taskDetails.push(taskInfo);

    for (const rh of runHours) {
      tasksByHourParam[rh].push(taskInfo);
    }

    if (failCount > 0) {
      tasksWithFailures.push(taskInfo);
    }
  }

  // Calculate statistics
  const totalScheduled = Object.values(hourlyCountsParam).reduce((sum, c) => sum + c, 0);
  const avgPerHour = totalScheduled > 0 ? totalScheduled / 24 : 0;

  // Find peak and quiet hours
  const sortedHours = Object.entries(hourlyCountsParam)
    .map(([h, c]) => ({ hour: parseInt(h, 10), count: c }))
    .sort((a, b) => b.count - a.count);

  const peakHours = sortedHours
    .slice(0, 3)
    .filter((x) => x.count > 0)
    .map((x) => x.hour);

  const quietHours = sortedHours.slice(-3).map((x) => x.hour);

  // Generate recommendations
  generateRecommendations(
    hourlyCountsParam,
    peakHours,
    quietHours,
    avgPerHour,
    tasksByHourParam,
    hourlyOnlyCountsParam
  );

  // Compute heatmap
  const heatmap = computeHeatmap(taskDetails);

  // Sort failing tasks by failure count
  tasksWithFailures.sort((a, b) => b.consecutive_failures - a.consecutive_failures);

  // Enhanced stats
  const enhancedStats = computeEnhancedStats(hourlyCountsParam);

  // Monthly calendar for current month
  const { year, month } = getCurrentYearMonth(timezone);
  const calendar = computeMonthlyCalendar(tasks, taskDetails, year, month);

  // Load composition: fixed (hourly) vs moveable task runs
  const totalTaskRuns = Object.values(hourlyCountsParam).reduce((sum, c) => sum + c, 0);
  const hourlyFixedRuns = Object.values(hourlyOnlyCountsParam).reduce((sum, c) => sum + c, 0);
  const moveableRuns = totalTaskRuns - hourlyFixedRuns;
  const loadComposition = {
    totalTaskRuns,
    hourlyFixedRuns,
    moveableRuns,
    hourlyByHour: hourlyOnlyCountsParam,
  };

  // Map task details to RefreshTask type
  const refreshTasks: RefreshTask[] = taskDetails.map((t) => ({
    id: t.id,
    type: t.type,
    itemId: t.item_id,
    itemName: t.item_name,
    itemUrl: t.item_url,
    projectName: t.project_name,
    schedule: {
      frequency: t.schedule_frequency,
      startTime: t.schedule_start_utc,
      endTime: t.schedule_end_utc,
      intervalHours: t.hourly_interval,
      weekDays: t.days,
      monthDays: [],
      monthlyOrdinal: null,
      monthlyWeekDay: null,
    },
    consecutiveFailures: t.consecutive_failures,
    lastFailureMessage: t.last_failure_message || null,
    priority: t.priority,
    nextRunAt: t.next_run,
    isHourly: t.is_hourly,
    runHours: t.run_hours,
    hourlyWindow: t.hourly_window,
    taskDays: t.days.length,
  }));

  const failedTasks: RefreshTask[] = tasksWithFailures.slice(0, 10).map((t) => ({
    id: t.id,
    type: t.type,
    itemId: t.item_id,
    itemName: t.item_name,
    itemUrl: t.item_url,
    projectName: t.project_name,
    schedule: {
      frequency: t.schedule_frequency,
      startTime: t.schedule_start_utc,
      endTime: t.schedule_end_utc,
      intervalHours: t.hourly_interval,
      weekDays: t.days,
      monthDays: [],
      monthlyOrdinal: null,
      monthlyWeekDay: null,
    },
    consecutiveFailures: t.consecutive_failures,
    lastFailureMessage: t.last_failure_message || null,
    priority: t.priority,
    nextRunAt: t.next_run,
    isHourly: t.is_hourly,
    runHours: t.run_hours,
    hourlyWindow: t.hourly_window,
    taskDays: t.days.length,
  }));

  const tasksByHour: Record<number, RefreshTask[]> = {};
  for (let h = 0; h < 24; h++) {
    tasksByHour[h] = tasksByHourParam[h].map((t) => ({
      id: t.id,
      type: t.type,
      itemId: t.item_id,
      itemName: t.item_name,
      itemUrl: t.item_url,
      projectName: t.project_name,
      schedule: {
        frequency: t.schedule_frequency,
        startTime: t.schedule_start_utc,
        endTime: t.schedule_end_utc,
        intervalHours: t.hourly_interval,
        weekDays: t.days,
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      },
      consecutiveFailures: t.consecutive_failures,
      lastFailureMessage: t.last_failure_message || null,
      priority: t.priority,
      nextRunAt: t.next_run,
      isHourly: t.is_hourly,
      runHours: t.run_hours,
      hourlyWindow: t.hourly_window,
      taskDays: t.days.length,
    }));
  }

  return {
    hourly: {
      byHour: hourlyCountsParam,
      peakHours,
      quietHours,
      totalRefreshes: totalScheduled,
      averagePerHour: parseFloat(avgPerHour.toFixed(1)),
    },
    daily: {
      byDay: dailyCountsParam,
    },
    heatmap,
    loadComposition,
    tasks: {
      total: tasks.length,
      details: refreshTasks,
      withFailures: failedTasks,
      totalWithFailures: tasksWithFailures.length,
      byHour: tasksByHour,
    },
    enhancedStats,
    calendar,
  };
}
