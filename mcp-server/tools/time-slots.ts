import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAnalysis } from "../tableau-service.js";
import { formatHour } from "@/lib/utils";

export function registerTimeSlotsTool(server: McpServer) {
  server.tool(
    "find_quiet_hours",
    "Find the best (quietest) hours to schedule new or moved extract refreshes. Returns time slots sorted by load, lightest first.",
    {
      count: z
        .number()
        .min(1)
        .max(24)
        .optional()
        .describe("How many quiet hours to return (default 5)"),
    },
    async ({ count }) => {
      try {
        const limit = count ?? 5;
        const analysis = await getAnalysis();
        const { byHour } = analysis.hourly;

        const slots = Object.entries(byHour)
          .map(([h, c]) => ({ hour: parseInt(h, 10), count: c }))
          .sort((a, b) => a.count - b.count)
          .slice(0, limit);

        const lines = [
          `Top ${limit} quietest hours:`,
          "",
          "Hour     | Refreshes",
          "---------|----------",
          ...slots.map(
            (s) =>
              `${formatHour(s.hour).padEnd(9)}| ${s.count}`,
          ),
        ];

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
