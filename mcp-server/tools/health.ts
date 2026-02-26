import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAnalysis } from "../tableau-service.js";
import { formatHour } from "@/lib/utils";

export function registerHealthTool(server: McpServer) {
  server.tool(
    "get_refresh_health",
    "Get the 4 KPI health summary for Tableau extract refresh schedules: load balance score, busiest 3-hour window percentage, utilization, and peak-to-average ratio. Each metric includes a color rating (green/yellow/red).",
    {},
    async () => {
      try {
        const analysis = await getAnalysis();
        const stats = analysis.enhancedStats;

        const summary = [
          `Load Balance Score: ${stats.loadBalanceScore.value}/100 (${stats.loadBalanceScore.health})`,
          `Busiest 3h Window: ${stats.busiestWindow.label} — ${stats.busiestWindow.count} refreshes, ${stats.busiestWindow.pct}% of total (${stats.busiestWindow.health})`,
          `Utilization: ${stats.utilization.value}% of hours have activity (${stats.utilization.health})`,
          `Peak-to-Avg Ratio: ${stats.peakAvgRatio.value}x (${stats.peakAvgRatio.health})`,
          "",
          `Total refresh task runs: ${analysis.hourly.totalRefreshes}`,
          `Average per hour: ${analysis.hourly.averagePerHour}`,
          `Peak hours: ${analysis.hourly.peakHours.map(formatHour).join(", ")}`,
          `Quietest hours: ${analysis.hourly.quietHours.map(formatHour).join(", ")}`,
        ].join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: summary,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching health data: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
