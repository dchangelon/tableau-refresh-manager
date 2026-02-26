import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAnalysis } from "../tableau-service.js";
import { formatHour } from "@/lib/utils";

export function registerDistributionTool(server: McpServer) {
  server.tool(
    "get_hourly_distribution",
    "Show how many extract refreshes run each hour (0-23). Returns the distribution with peak and quiet hours annotated. Also includes load composition (fixed hourly vs moveable tasks).",
    {},
    async () => {
      try {
        const analysis = await getAnalysis();
        const { byHour, peakHours, quietHours, totalRefreshes, averagePerHour } =
          analysis.hourly;
        const { hourlyFixedRuns, moveableRuns } = analysis.loadComposition;

        const lines: string[] = [
          "Hour | Refreshes | Notes",
          "-----|-----------|------",
        ];

        for (let h = 0; h < 24; h++) {
          const count = byHour[h] || 0;
          const notes: string[] = [];
          if (peakHours.includes(h)) notes.push("PEAK");
          if (quietHours.includes(h)) notes.push("quiet");
          lines.push(
            `${formatHour(h).padEnd(5)} | ${String(count).padStart(9)} | ${notes.join(", ")}`,
          );
        }

        lines.push("");
        lines.push(`Total: ${totalRefreshes} task runs`);
        lines.push(`Average per hour: ${averagePerHour}`);
        lines.push(
          `Composition: ${hourlyFixedRuns} fixed (hourly), ${moveableRuns} moveable`,
        );

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
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
