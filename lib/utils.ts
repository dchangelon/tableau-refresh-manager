import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { HOUR_LABELS, DEFAULT_TIMEZONE } from "@/lib/constants";
import type { ScheduleConfig } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format an hour number (0-23) into a human-readable label.
 * e.g. formatHour(7) => "7 AM", formatHour(13) => "1 PM"
 */
export function formatHour(hour: number): string {
  return HOUR_LABELS[hour] ?? `${hour}:00`;
}

/**
 * Get the current date string in YYYY-MM-DD format in the site-local timezone.
 */
export function getTodayLocalDate(timezone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

/**
 * Get the current year and month (1-indexed) in the site-local timezone.
 */
export function getCurrentYearMonth(timezone: string = DEFAULT_TIMEZONE): { year: number; month: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "0");
  const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "0");
  return { year, month };
}

/**
 * Get the number of days in a given month/year.
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Get the weekday index (0=Monday, 6=Sunday) of the first day of a given month.
 */
export function getFirstWeekdayOfMonth(year: number, month: number): number {
  // JS Date: 0=Sunday, 1=Monday...6=Saturday
  // We want 0=Monday...6=Sunday
  const jsDay = new Date(year, month - 1, 1).getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Parse a time string "HH:MM" or "HH:MM:SS" into { hour, minute }.
 */
export function parseTime(time: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = time.split(":");
  return { hour: parseInt(hourStr, 10), minute: parseInt(minuteStr, 10) };
}

/**
 * Format a { hour, minute } object back to "HH:MM".
 */
export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Map a Tableau weekday name to a JS Date day index (0=Sunday).
 */
export const TABLEAU_WEEKDAY_TO_JS: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/**
 * Map a JS Date day index (0=Sunday) to a heatmap y index (0=Monday, 6=Sunday).
 */
export function jsDayToHeatmapY(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Pluralize a word based on count.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/**
 * Compute the expanded run hours for a schedule configuration.
 * Handles midnight wrap-around (e.g., 22:00 to 02:00).
 * Shared by batch-store and use-batch-impact.
 */
export function computeRunHours(schedule: ScheduleConfig): number[] {
  const startHour = parseTime(schedule.startTime).hour;

  if (schedule.frequency === "Hourly" && schedule.endTime) {
    const endHour = parseTime(schedule.endTime).hour;
    const hours: number[] = [];
    if (startHour <= endHour) {
      for (let h = startHour; h <= endHour; h++) hours.push(h);
    } else {
      for (let h = startHour; h < 24; h++) hours.push(h);
      for (let h = 0; h <= endHour; h++) hours.push(h);
    }
    return hours;
  }

  if (
    schedule.frequency === "Daily" &&
    schedule.intervalHours &&
    schedule.intervalHours < 24 &&
    schedule.endTime
  ) {
    const endHour = parseTime(schedule.endTime).hour;
    const hours: number[] = [];
    if (startHour <= endHour) {
      for (let h = startHour; h <= endHour; h += schedule.intervalHours) hours.push(h);
    } else {
      for (let h = startHour; h < 24; h += schedule.intervalHours) hours.push(h);
      for (let h = 0; h <= endHour; h += schedule.intervalHours) hours.push(h);
    }
    return hours;
  }

  return [startHour];
}

/**
 * Format a schedule config into a human-readable string.
 */
export function formatScheduleSummary(
  frequency: string,
  startTime: string,
  intervalHours?: number | null,
  weekDays?: string[],
): string {
  const timeLabel = formatHour(parseTime(startTime).hour);
  switch (frequency) {
    case "Hourly":
      return `Hourly (${timeLabel} window)`;
    case "Daily":
      if (!intervalHours || intervalHours === 24) return `Daily at ${timeLabel}`;
      return `Every ${intervalHours}h from ${timeLabel}`;
    case "Weekly": {
      const days = weekDays?.map((d) => d.slice(0, 3)).join(", ") ?? "";
      return `Weekly ${days} at ${timeLabel}`;
    }
    case "Monthly":
      return `Monthly at ${timeLabel}`;
    default:
      return `${frequency} at ${timeLabel}`;
  }
}
