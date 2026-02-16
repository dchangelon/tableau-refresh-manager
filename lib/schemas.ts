/**
 * Zod Schemas - Single Source of Truth
 *
 * CRITICAL: This file is the authoritative schema definition for schedules and API requests.
 * Both `app/api/reschedule/route.ts` and `components/batch/schedule-editor.tsx` MUST import from here.
 * Do NOT create duplicate schemas in routes or components.
 */

import { z } from "zod";

// === Base Schedule Schema ===

const baseScheduleSchema = z.object({
  frequency: z.enum(["Hourly", "Daily", "Weekly", "Monthly"]),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "startTime must be HH:MM or HH:MM:SS format"),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "endTime must be HH:MM or HH:MM:SS format").nullable(),
  intervalHours: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(8), z.literal(12), z.literal(24)]).nullable(),
  weekDays: z.array(
    z.enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]),
  ),
  monthDays: z.array(z.union([z.number().int().min(1).max(31), z.literal("LastDay")])),
  monthlyOrdinal: z.enum(["First", "Second", "Third", "Fourth", "Fifth", "Last"]).nullable(),
  monthlyWeekDay: z.enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]).nullable(),
});

// === Discriminated Union by Frequency ===

export const scheduleConfigSchema = z.discriminatedUnion("frequency", [
  // Hourly: intervalHours must be 1, endTime required, weekDays optional
  baseScheduleSchema.extend({
    frequency: z.literal("Hourly"),
    intervalHours: z.literal(1),
    endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    weekDays: z.array(z.enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])).default([]),
    monthDays: z.array(z.union([z.number(), z.literal("LastDay")])).default([]),
    monthlyOrdinal: z.null().default(null),
    monthlyWeekDay: z.null().default(null),
  }),

  // Daily: intervalHours in [2,4,6,8,12,24], endTime required for 2/4/6/8/12 and optional for 24, weekDays optional
  baseScheduleSchema.extend({
    frequency: z.literal("Daily"),
    intervalHours: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(8), z.literal(12), z.literal(24)]),
    weekDays: z.array(z.enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])).default([]),
    monthDays: z.array(z.union([z.number(), z.literal("LastDay")])).default([]),
    monthlyOrdinal: z.null().default(null),
    monthlyWeekDay: z.null().default(null),
  }).refine(
    (data) => {
      // For intervals 2/4/6/8/12, endTime is required
      if ([2, 4, 6, 8, 12].includes(data.intervalHours)) {
        return data.endTime !== null;
      }
      // For interval 24, endTime is optional
      return true;
    },
    {
      message: "endTime is required for Daily schedules with intervalHours 2, 4, 6, 8, or 12",
      path: ["endTime"],
    },
  ),

  // Weekly: weekDays must have 1-7 entries, intervalHours is 24, endTime is null
  baseScheduleSchema.extend({
    frequency: z.literal("Weekly"),
    intervalHours: z.literal(24).nullable().default(24),
    endTime: z.null().default(null),
    weekDays: z
      .array(z.enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]))
      .min(1, "Weekly requires at least one weekDay")
      .max(7, "Weekly cannot have more than 7 weekDays"),
    monthDays: z.array(z.union([z.number(), z.literal("LastDay")])).default([]),
    monthlyOrdinal: z.null().default(null),
    monthlyWeekDay: z.null().default(null),
  }),

  // Monthly: intervalHours is 24, endTime is null, either monthDays OR (monthlyOrdinal + monthlyWeekDay)
  baseScheduleSchema.extend({
    frequency: z.literal("Monthly"),
    intervalHours: z.literal(24).nullable().default(24),
    endTime: z.null().default(null),
    weekDays: z.array(z.enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])).default([]),
    monthDays: z.array(z.union([z.number().int().min(1).max(31), z.literal("LastDay")])),
    monthlyOrdinal: z.enum(["First", "Second", "Third", "Fourth", "Fifth", "Last"]).nullable(),
    monthlyWeekDay: z.enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]).nullable(),
  }).refine(
    (data) => {
      const hasMonthDays = data.monthDays.length > 0;
      const hasOrdinal = data.monthlyOrdinal !== null && data.monthlyWeekDay !== null;

      // Must have exactly one mode
      return hasMonthDays !== hasOrdinal; // XOR
    },
    {
      message: "Monthly requires either monthDays (On Day mode) OR (monthlyOrdinal + monthlyWeekDay) (On Ordinal Weekday mode), not both",
      path: ["monthDays"],
    },
  ),
]);

export type ScheduleConfig = z.infer<typeof scheduleConfigSchema>;

// === API Request/Response Schemas ===

export const rescheduleChangeSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  schedule: scheduleConfigSchema,
});

export const rescheduleRequestSchema = z.object({
  changes: z.array(rescheduleChangeSchema).min(1, "At least one change is required"),
});

export type RescheduleChange = z.infer<typeof rescheduleChangeSchema>;
export type RescheduleRequest = z.infer<typeof rescheduleRequestSchema>;
