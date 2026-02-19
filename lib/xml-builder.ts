/**
 * XML Payload Construction for Tableau Extract Refresh Schedules
 *
 * CRITICAL: All XML payloads are based on the Tableau REST API documentation,
 * NOT the legacy Python code. The Python code is reference for behavior only.
 *
 * Tableau REST API Reference:
 * https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_extracts.htm
 */

import type { ScheduleConfig } from "@/lib/types";

const ALL_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Escape a string for safe use in an XML attribute value.
 */
function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build XML payload for an extract refresh task schedule update.
 *
 * @param schedule - Schedule configuration
 * @returns XML payload string for PUT /tasks/extractRefreshes/{taskId}
 */
export function buildScheduleXml(schedule: ScheduleConfig): string {
  validateSchedule(schedule);

  const { frequency, startTime, endTime, intervalHours, weekDays, monthDays, monthlyOrdinal, monthlyWeekDay } =
    schedule;

  // Convert "HH:MM" to "HH:MM:SS" format
  const startTimeFull = ensureTimeFormat(startTime);
  const endTimeFull = endTime ? ensureTimeFormat(endTime) : null;

  let intervalsXml = "";

  switch (frequency) {
    case "Hourly":
      intervalsXml = buildHourlyIntervals(intervalHours!, weekDays);
      return wrapXml("Hourly", startTimeFull, endTimeFull!, intervalsXml);

    case "Daily":
      intervalsXml = buildDailyIntervals(intervalHours!, weekDays);
      return wrapXml("Daily", startTimeFull, endTimeFull, intervalsXml);

    case "Weekly":
      intervalsXml = buildWeeklyIntervals(weekDays);
      return wrapXml("Weekly", startTimeFull, null, intervalsXml);

    case "Monthly":
      intervalsXml = buildMonthlyIntervals(monthDays, monthlyOrdinal, monthlyWeekDay);
      return wrapXml("Monthly", startTimeFull, null, intervalsXml);

    default:
      throw new Error(`Unsupported frequency: ${frequency}`);
  }
}

/**
 * Build intervals for Hourly frequency.
 * - intervalHours must be 1
 * - weekDays is optional (empty => all days)
 */
function buildHourlyIntervals(intervalHours: number, weekDays: string[]): string {
  const hourInterval = `<interval hours="${intervalHours}" />`;

  // Tableau requires at least one weekDay interval for Hourly/Daily.
  // Empty array means "all days" — send all 7 explicitly.
  const effectiveDays =
    !weekDays || weekDays.length === 0 ? ALL_WEEKDAYS : weekDays;

  const weekDayIntervals = effectiveDays.map((day) => `<interval weekDay="${escapeXmlAttr(day)}" />`).join("\n      ");
  return `${hourInterval}\n      ${weekDayIntervals}`;
}

/**
 * Build intervals for Daily frequency.
 * - intervalHours: 2, 4, 6, 8, 12, 24
 * - weekDays is optional (empty => all days)
 */
function buildDailyIntervals(intervalHours: number, weekDays: string[]): string {
  const hourInterval = `<interval hours="${intervalHours}" />`;

  // Tableau requires at least one weekDay interval for Hourly/Daily.
  // Empty array means "all days" — send all 7 explicitly.
  const effectiveDays =
    !weekDays || weekDays.length === 0 ? ALL_WEEKDAYS : weekDays;

  const weekDayIntervals = effectiveDays.map((day) => `<interval weekDay="${escapeXmlAttr(day)}" />`).join("\n      ");
  return `${hourInterval}\n      ${weekDayIntervals}`;
}

/**
 * Build intervals for Weekly frequency.
 * - weekDays must have 1-7 entries
 */
function buildWeeklyIntervals(weekDays: string[]): string {
  if (!weekDays || weekDays.length === 0) {
    throw new Error("Weekly frequency requires at least one weekDay");
  }

  return weekDays.map((day) => `<interval weekDay="${escapeXmlAttr(day)}" />`).join("\n      ");
}

/**
 * Build intervals for Monthly frequency.
 * Two mutually exclusive sub-types:
 * 1. "On Day" mode: monthDays (1-31 or "LastDay")
 * 2. "On [Ordinal] [Weekday]" mode: monthlyOrdinal + monthlyWeekDay
 */
function buildMonthlyIntervals(
  monthDays: Array<number | "LastDay">,
  monthlyOrdinal: string | null,
  monthlyWeekDay: string | null,
): string {
  // Check mutual exclusivity
  const hasMonthDays = monthDays && monthDays.length > 0;
  const hasOrdinal = monthlyOrdinal && monthlyWeekDay;

  if (hasMonthDays && hasOrdinal) {
    throw new Error("Monthly frequency: monthDays and monthlyOrdinal are mutually exclusive");
  }

  if (!hasMonthDays && !hasOrdinal) {
    throw new Error("Monthly frequency requires either monthDays or (monthlyOrdinal + monthlyWeekDay)");
  }

  if (hasMonthDays) {
    // "On Day" mode
    return monthDays.map((day) => `<interval monthDay="${escapeXmlAttr(String(day))}" />`).join("\n      ");
  }

  // "On [Ordinal] [Weekday]" mode
  // monthDay attribute carries the ordinal string (e.g., "Second", "Last")
  return `<interval monthDay="${escapeXmlAttr(monthlyOrdinal!)}" weekDay="${escapeXmlAttr(monthlyWeekDay!)}" />`;
}

/**
 * Wrap frequency details and intervals in the full tsRequest XML structure.
 */
function wrapXml(frequency: string, start: string, end: string | null, intervals: string): string {
  const endAttr = end ? ` end="${escapeXmlAttr(end)}"` : "";

  return `<tsRequest>
  <schedule frequency="${escapeXmlAttr(frequency)}">
    <frequencyDetails start="${escapeXmlAttr(start)}"${endAttr}>
      <intervals>
        ${intervals}
      </intervals>
    </frequencyDetails>
  </schedule>
</tsRequest>`;
}

/**
 * Ensure time string is in "HH:MM:SS" format.
 */
function ensureTimeFormat(time: string): string {
  const parts = time.split(":");
  if (parts.length === 2) {
    return `${time}:00`;
  }
  return time;
}

/**
 * Tableau requires startTime and endTime to have matching minute components.
 */
function validateMinuteAlignment(startTime: string, endTime: string): void {
  const startMinute = startTime.split(":")[1] ?? "00";
  const endMinute = endTime.split(":")[1] ?? "00";
  if (startMinute !== endMinute) {
    throw new Error(
      `startTime and endTime must have matching minutes (got :${startMinute} vs :${endMinute}). ` +
      `Tableau requires minute intervals to be similar for start and end times.`,
    );
  }
}

/**
 * Validate a ScheduleConfig before XML generation.
 */
function validateSchedule(schedule: ScheduleConfig): void {
  const { frequency, startTime, endTime, intervalHours, weekDays, monthDays, monthlyOrdinal, monthlyWeekDay } =
    schedule;

  if (!startTime) {
    throw new Error("startTime is required");
  }

  switch (frequency) {
    case "Hourly":
      if (intervalHours !== 1) {
        throw new Error("Hourly frequency requires intervalHours === 1");
      }
      if (!endTime) {
        throw new Error("Hourly frequency requires endTime");
      }
      validateMinuteAlignment(startTime, endTime);
      break;

    case "Daily":
      if (!intervalHours || ![2, 4, 6, 8, 12, 24].includes(intervalHours)) {
        throw new Error("Daily frequency requires intervalHours in [2, 4, 6, 8, 12, 24]");
      }
      if ([2, 4, 6, 8, 12].includes(intervalHours) && !endTime) {
        throw new Error(`Daily frequency with intervalHours=${intervalHours} requires endTime`);
      }
      if (endTime) {
        validateMinuteAlignment(startTime, endTime);
      }
      break;

    case "Weekly":
      if (!weekDays || weekDays.length === 0) {
        throw new Error("Weekly frequency requires at least one weekDay");
      }
      if (weekDays.length > 7) {
        throw new Error("Weekly frequency cannot have more than 7 weekDays");
      }
      break;

    case "Monthly": {
      const hasMonthDays = monthDays && monthDays.length > 0;
      const hasOrdinal = monthlyOrdinal && monthlyWeekDay;

      if (hasMonthDays && hasOrdinal) {
        throw new Error("Monthly: monthDays and monthlyOrdinal are mutually exclusive");
      }

      if (!hasMonthDays && !hasOrdinal) {
        throw new Error("Monthly requires either monthDays or (monthlyOrdinal + monthlyWeekDay)");
      }

      if (hasMonthDays) {
        // Validate monthDays entries
        for (const day of monthDays) {
          if (day === "LastDay") continue;
          if (typeof day === "number" && (day < 1 || day > 31)) {
            throw new Error(`Invalid monthDay value: ${day} (must be 1-31 or "LastDay")`);
          }
        }
      }

      if (hasOrdinal) {
        const validOrdinals = ["First", "Second", "Third", "Fourth", "Fifth", "Last"];
        if (!validOrdinals.includes(monthlyOrdinal!)) {
          throw new Error(
            `Invalid monthlyOrdinal: ${monthlyOrdinal} (must be one of ${validOrdinals.join(", ")})`,
          );
        }

        const validWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        if (!validWeekdays.includes(monthlyWeekDay!)) {
          throw new Error(
            `Invalid monthlyWeekDay: ${monthlyWeekDay} (must be one of ${validWeekdays.join(", ")})`,
          );
        }
      }
      break;
    }

    default:
      throw new Error(`Unsupported frequency: ${frequency}`);
  }
}
