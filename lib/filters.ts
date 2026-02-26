import type { RefreshTask } from "./types";

/**
 * Day names with Monday as index 0 (for week heatmap/analysis)
 */
const MONDAY_FIRST_DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * Day names with Sunday as index 0 (for calendar/Date.getDay() compatibility)
 */
const SUNDAY_FIRST_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Check if a task matches the active filter criteria.
 *
 * @param task - The refresh task to check
 * @param search - Search string (matches item name or project name, case-insensitive)
 * @param project - Project name filter (null = no filter)
 * @param type - Item type filter ("all" = no filter)
 * @returns true if task matches all active filters
 */
export function taskMatchesFilters(
  task: RefreshTask,
  search: string,
  project: string | null,
  type: "all" | "workbook" | "datasource"
): boolean {
  // Search filter - matches item name, project name, or top-level project
  if (search) {
    const searchLower = search.toLowerCase();
    const matchesSearch =
      task.itemName.toLowerCase().includes(searchLower) ||
      task.projectName.toLowerCase().includes(searchLower) ||
      task.topLevelProject.toLowerCase().includes(searchLower);
    if (!matchesSearch) return false;
  }

  // Project filter (matches top-level folder)
  if (project && task.topLevelProject !== project) {
    return false;
  }

  // Type filter
  if (type !== "all" && task.type !== type) {
    return false;
  }

  return true;
}

/**
 * Check if a task runs on a specific day of the week (Monday-first indexing).
 *
 * @param task - The refresh task to check
 * @param dayOfWeek - Day index (0=Monday, 6=Sunday), undefined = no day constraint
 * @returns true if task runs on the specified day (or if no day constraint)
 */
export function taskRunsOnDay(task: RefreshTask, dayOfWeek?: number): boolean {
  if (dayOfWeek === undefined) return true;

  const dayName = MONDAY_FIRST_DAY_NAMES[dayOfWeek];
  if (!dayName) return true;

  // Empty weekDays means "all days"
  if (task.schedule.weekDays.length === 0) return true;

  return task.schedule.weekDays.includes(dayName);
}

/**
 * Check if a task runs on a specific calendar date.
 * Handles both weekly constraints and monthly schedule logic.
 *
 * @param task - The refresh task to check
 * @param dateStr - ISO date string (YYYY-MM-DD)
 * @returns true if task is scheduled to run on this date
 */
export function taskRunsOnDate(task: RefreshTask, dateStr: string): boolean {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!year || !month || !day) return true;

  const date = new Date(year, month - 1, day);
  const dayName = SUNDAY_FIRST_DAY_NAMES[date.getDay()];
  const weekDays = task.schedule.weekDays;

  // Check weekly constraint (if specified)
  if (weekDays.length > 0 && !weekDays.includes(dayName)) {
    return false;
  }

  // For non-Monthly schedules, weekly constraint is sufficient
  if (task.schedule.frequency !== "Monthly") {
    return true;
  }

  // Monthly "On Day" mode - check numeric day-of-month
  if (task.schedule.monthDays.length > 0) {
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    return task.schedule.monthDays.some((monthDay) => {
      if (monthDay === "LastDay") return day === lastDayOfMonth;
      return monthDay === day;
    });
  }

  // Monthly "On [Ordinal] [Weekday]" mode - check ordinal occurrence
  if (task.schedule.monthlyOrdinal && task.schedule.monthlyWeekDay) {
    // Weekday must match
    if (task.schedule.monthlyWeekDay !== dayName) return false;

    // Calculate which occurrence this is (1st, 2nd, 3rd, etc.)
    const occurrence = Math.floor((day - 1) / 7) + 1;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const isLastOccurrence = day + 7 > lastDayOfMonth;
    const ordinal = task.schedule.monthlyOrdinal;

    if (ordinal === "Last") return isLastOccurrence;
    if (ordinal === "First") return occurrence === 1;
    if (ordinal === "Second") return occurrence === 2;
    if (ordinal === "Third") return occurrence === 3;
    if (ordinal === "Fourth") return occurrence === 4;
    if (ordinal === "Fifth") return occurrence === 5;
  }

  return true;
}
