import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTableauClient, invalidateCache } from "../tableau-service.js";
import { buildScheduleXml } from "@/lib/xml-builder";
import type { ScheduleConfig } from "@/lib/types";

const scheduleSchema = z.object({
  frequency: z.enum(["Hourly", "Daily", "Weekly", "Monthly"]),
  startTime: z.string().describe('Start time in "HH:MM" format (site-local time)'),
  endTime: z
    .string()
    .nullable()
    .optional()
    .describe('End time in "HH:MM" format. Required for Hourly and Daily intervals <24.'),
  intervalHours: z
    .union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(8), z.literal(12), z.literal(24)])
    .nullable()
    .optional()
    .describe("Interval in hours. 1 for Hourly; 2/4/6/8/12/24 for Daily."),
  weekDays: z
    .array(z.string())
    .optional()
    .describe('Tableau weekday names (e.g., ["Monday","Wednesday"]). Empty = all days.'),
  monthDays: z
    .array(z.union([z.number(), z.literal("LastDay")]))
    .optional()
    .describe("Day-of-month numbers (1-31) or \"LastDay\". For Monthly On Day mode."),
  monthlyOrdinal: z
    .enum(["First", "Second", "Third", "Fourth", "Fifth", "Last"])
    .nullable()
    .optional()
    .describe("Ordinal for Monthly On Weekday mode."),
  monthlyWeekDay: z
    .string()
    .nullable()
    .optional()
    .describe("Weekday name for Monthly On Weekday mode."),
});

export function registerRescheduleTool(server: McpServer) {
  server.tool(
    "reschedule_task",
    "Reschedule a Tableau extract refresh task to a new schedule. This MODIFIES the schedule on Tableau Cloud. Use simulate_move first to preview the impact.",
    {
      taskId: z.string().describe("The Tableau extract refresh task ID to reschedule"),
      schedule: scheduleSchema.describe("The new schedule configuration"),
    },
    async ({ taskId, schedule: rawSchedule }) => {
      try {
        // Normalize optional fields to match ScheduleConfig
        const schedule: ScheduleConfig = {
          frequency: rawSchedule.frequency,
          startTime: rawSchedule.startTime,
          endTime: rawSchedule.endTime ?? null,
          intervalHours: (rawSchedule.intervalHours ?? null) as ScheduleConfig["intervalHours"],
          weekDays: rawSchedule.weekDays ?? [],
          monthDays: (rawSchedule.monthDays ?? []) as Array<number | "LastDay">,
          monthlyOrdinal: (rawSchedule.monthlyOrdinal ?? null) as ScheduleConfig["monthlyOrdinal"],
          monthlyWeekDay: rawSchedule.monthlyWeekDay ?? null,
        };

        const xml = buildScheduleXml(schedule);
        const client = await getTableauClient();
        const results = await client.batchUpdateTasks([
          { taskId, xmlPayload: xml },
        ]);

        // Invalidate cache so next analysis reflects the change
        invalidateCache();

        const result = results[0];
        if (result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Successfully rescheduled task ${taskId}.\nNew schedule: ${schedule.frequency} at ${schedule.startTime}${schedule.endTime ? ` – ${schedule.endTime}` : ""}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to reschedule task ${taskId}: ${result.error || "Unknown error"}${result.statusCode ? ` (HTTP ${result.statusCode})` : ""}`,
            },
          ],
          isError: true,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
