import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAnalysis } from "../tableau-service.js";
import { taskMatchesFilters } from "@/lib/filters";
import { formatHour } from "@/lib/utils";
import type { RefreshTask } from "@/lib/types";

function formatTask(t: RefreshTask): string {
  const parts = [
    `ID: ${t.id}`,
    `Name: ${t.itemName}`,
    `Type: ${t.type}`,
    `Project: ${t.projectName}`,
    `Schedule: ${t.schedule.frequency} at ${formatHour(parseInt(t.schedule.startTime.split(":")[0], 10))}`,
  ];
  if (t.isHourly && t.hourlyWindow) {
    parts.push(`Window: ${t.hourlyWindow}`);
  }
  if (t.schedule.weekDays.length > 0 && t.schedule.weekDays.length < 7) {
    parts.push(`Days: ${t.schedule.weekDays.map((d) => d.slice(0, 3)).join(", ")}`);
  }
  parts.push(`Run hours: ${t.runHours.map(formatHour).join(", ")}`);
  if (t.consecutiveFailures > 0) {
    parts.push(`Failures: ${t.consecutiveFailures} consecutive`);
    if (t.lastFailureMessage) {
      parts.push(`Last error: ${t.lastFailureMessage}`);
    }
  }
  return parts.join("\n  ");
}

export function registerTaskTools(server: McpServer) {
  server.tool(
    "list_refresh_tasks",
    "List all Tableau extract refresh tasks with optional filtering by search term, project, type, or schedule frequency. Returns task names, schedules, failure counts, and IDs.",
    {
      search: z.string().optional().describe("Filter by item name or project name (case-insensitive)"),
      project: z.string().optional().describe("Filter by exact project name"),
      type: z
        .enum(["workbook", "datasource"])
        .optional()
        .describe("Filter by item type"),
      scheduleType: z
        .enum(["Hourly", "Daily", "Weekly", "Monthly"])
        .optional()
        .describe("Filter by schedule frequency"),
      failingOnly: z
        .boolean()
        .optional()
        .describe("Only show tasks with consecutive failures"),
    },
    async ({ search, project, type, scheduleType, failingOnly }) => {
      try {
        const analysis = await getAnalysis();
        let tasks = analysis.tasks.details;

        // Apply filters
        if (search || project || type) {
          tasks = tasks.filter((t) =>
            taskMatchesFilters(
              t,
              search || "",
              project || null,
              type || "all",
            ),
          );
        }

        if (scheduleType) {
          tasks = tasks.filter(
            (t) => t.schedule.frequency === scheduleType,
          );
        }

        if (failingOnly) {
          tasks = tasks.filter((t) => t.consecutiveFailures > 0);
        }

        if (tasks.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "No tasks match the given filters." },
            ],
          };
        }

        const header = `Found ${tasks.length} task(s):\n`;
        const formatted = tasks.map((t, i) => `${i + 1}. ${formatTask(t)}`);

        return {
          content: [
            { type: "text" as const, text: header + formatted.join("\n\n") },
          ],
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

  server.tool(
    "get_task_details",
    "Get full details for a specific extract refresh task by its ID, including schedule configuration, failure history, and timing.",
    {
      taskId: z.string().describe("The Tableau extract refresh task ID"),
    },
    async ({ taskId }) => {
      try {
        const analysis = await getAnalysis();
        const task = analysis.tasks.details.find((t) => t.id === taskId);

        if (!task) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Task not found: ${taskId}. Use list_refresh_tasks to find valid task IDs.`,
              },
            ],
          };
        }

        const details = [
          `Task ID: ${task.id}`,
          `Item: ${task.itemName}`,
          `Type: ${task.type}`,
          `Project: ${task.projectName}`,
          `URL: ${task.itemUrl || "N/A"}`,
          "",
          "Schedule:",
          `  Frequency: ${task.schedule.frequency}`,
          `  Start: ${task.schedule.startTime}`,
          task.schedule.endTime ? `  End: ${task.schedule.endTime}` : null,
          task.schedule.intervalHours
            ? `  Interval: Every ${task.schedule.intervalHours}h`
            : null,
          `  Days: ${task.schedule.weekDays.length === 0 || task.schedule.weekDays.length === 7 ? "All days" : task.schedule.weekDays.join(", ")}`,
          task.isHourly && task.hourlyWindow
            ? `  Hourly Window: ${task.hourlyWindow}`
            : null,
          `  Run Hours: ${task.runHours.map(formatHour).join(", ")}`,
          `  Days per Week: ${task.taskDays}`,
          "",
          `Next Run: ${task.nextRunAt || "N/A"}`,
          `Priority: ${task.priority}`,
          `Consecutive Failures: ${task.consecutiveFailures}`,
          task.lastFailureMessage
            ? `Last Failure: ${task.lastFailureMessage}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");

        return {
          content: [{ type: "text" as const, text: details }],
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
