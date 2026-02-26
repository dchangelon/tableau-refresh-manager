import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAnalysis } from "../tableau-service.js";
import { getHealthColor } from "@/lib/constants";
import { formatHour } from "@/lib/utils";
import type { HealthMetrics } from "@/lib/types";

/**
 * Recompute health metrics from a modified hourly distribution.
 * Mirrors computeEnhancedStats from analyzer.ts but operates on plain data.
 */
function computeHealthFromDistribution(
  hourlyCounts: Record<number, number>,
): HealthMetrics {
  const counts = Object.values(hourlyCounts);
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

  const score = Math.max(0, Math.round(100 / (1 + cv)));
  const scoreHealth = getHealthColor("loadBalanceScore", score);

  // Busiest 3-hour window
  let bestStart = 0;
  let bestSum = 0;
  for (let start = 0; start < 24; start++) {
    const windowSum = [0, 1, 2].reduce(
      (sum, i) => sum + (hourlyCounts[(start + i) % 24] || 0),
      0,
    );
    if (windowSum > bestSum) {
      bestSum = windowSum;
      bestStart = start;
    }
  }
  const endHour = (bestStart + 3) % 24;
  const windowLabel = `${formatHour(bestStart)}-${formatHour(endHour)}`;
  const windowPct = total > 0 ? (bestSum / total) * 100 : 0;
  const windowHealth = getHealthColor("busyWindowPct", windowPct);

  const activeHours = counts.filter((c) => c > 0).length;
  const utilization = Math.round((activeHours / 24) * 100);
  const utilHealth = getHealthColor("utilization", utilization);

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

function formatMetrics(label: string, m: HealthMetrics): string {
  return [
    `${label}:`,
    `  Load Balance Score: ${m.loadBalanceScore.value}/100 (${m.loadBalanceScore.health})`,
    `  Busiest Window: ${m.busiestWindow.label} — ${m.busiestWindow.pct}% (${m.busiestWindow.health})`,
    `  Utilization: ${m.utilization.value}% (${m.utilization.health})`,
    `  Peak-to-Avg: ${m.peakAvgRatio.value}x (${m.peakAvgRatio.health})`,
  ].join("\n");
}

export function registerSimulateTool(server: McpServer) {
  server.tool(
    "simulate_move",
    "What-if analysis: predict how health metrics would change if task(s) were moved to a different hour. Does NOT make any changes — purely a simulation.",
    {
      taskIds: z
        .array(z.string())
        .min(1)
        .describe("Task IDs to simulate moving"),
      targetHour: z
        .number()
        .min(0)
        .max(23)
        .describe("Target hour (0-23) to move the tasks to"),
    },
    async ({ taskIds, targetHour }) => {
      try {
        const analysis = await getAnalysis();
        const currentDist = { ...analysis.hourly.byHour };

        // Find the tasks to move
        const tasksToMove = analysis.tasks.details.filter((t) =>
          taskIds.includes(t.id),
        );

        const notFound = taskIds.filter(
          (id) => !tasksToMove.find((t) => t.id === id),
        );
        if (notFound.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Tasks not found: ${notFound.join(", ")}. Use list_refresh_tasks to find valid IDs.`,
              },
            ],
          };
        }

        // Clone distribution for simulation
        const proposedDist: Record<number, number> = { ...currentDist };

        for (const task of tasksToMove) {
          if (task.isHourly) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Task "${task.itemName}" (${task.id}) is an hourly schedule and cannot be moved to a single hour. Only non-hourly tasks can be simulated for simple moves.`,
                },
              ],
            };
          }

          // Remove from current hours
          for (const h of task.runHours) {
            proposedDist[h] = Math.max(0, (proposedDist[h] || 0) - 1);
          }
          // Add to target hour
          proposedDist[targetHour] = (proposedDist[targetHour] || 0) + 1;
        }

        const currentMetrics = analysis.enhancedStats;
        const proposedMetrics = computeHealthFromDistribution(proposedDist);

        const delta =
          proposedMetrics.loadBalanceScore.value -
          currentMetrics.loadBalanceScore.value;
        const direction = delta > 0 ? "improved" : delta < 0 ? "worsened" : "unchanged";

        const taskNames = tasksToMove
          .map((t) => `${t.itemName} (${t.type})`)
          .join(", ");

        const output = [
          `Simulation: Move ${tasksToMove.length} task(s) to ${formatHour(targetHour)}`,
          `Tasks: ${taskNames}`,
          "",
          formatMetrics("Current", currentMetrics),
          "",
          formatMetrics("After Move", proposedMetrics),
          "",
          `Impact: Load balance score ${direction} by ${Math.abs(delta)} points (${currentMetrics.loadBalanceScore.value} → ${proposedMetrics.loadBalanceScore.value})`,
        ];

        return {
          content: [{ type: "text" as const, text: output.join("\n") }],
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
