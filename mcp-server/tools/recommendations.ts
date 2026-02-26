import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAnalysis } from "../tableau-service.js";
import { formatHour } from "@/lib/utils";

// Inline recommendation generation using existing analysis data
function generateRecommendationsFromAnalysis(analysis: {
  hourly: {
    byHour: Record<number, number>;
    peakHours: number[];
    quietHours: number[];
    averagePerHour: number;
  };
  loadComposition: {
    hourlyByHour: Record<number, number>;
  };
  tasks: {
    byHour: Record<number, { itemName: string; type: string; isHourly: boolean }[]>;
  };
}) {
  const { byHour, peakHours, quietHours, averagePerHour } = analysis.hourly;
  const { hourlyByHour } = analysis.loadComposition;
  const recommendations: Array<{
    severity: string;
    title: string;
    message: string;
    action?: string;
    affectedTasks?: string[];
  }> = [];

  if (peakHours.length === 0) return recommendations;

  const counts = Object.values(byHour);
  const maxCount = Math.max(...counts);

  if (maxCount > 0 && averagePerHour > 0) {
    const ratio = maxCount / averagePerHour;
    const peakHour = peakHours[0];
    const peakTotal = byHour[peakHour] || 0;
    const peakFixed = hourlyByHour[peakHour] || 0;

    // Get moveable tasks in peak hour
    const peakTasks = analysis.tasks.byHour[peakHour] || [];
    const moveableTasks = peakTasks
      .filter((t) => !t.isHourly)
      .map((t) => `${t.itemName} (${t.type})`)
      .slice(0, 5);

    if (ratio > 3) {
      recommendations.push({
        severity: "critical",
        title: "Severe Load Imbalance",
        message: `Peak hours have ${ratio.toFixed(1)}x the average load. ${peakFixed} of ${peakTotal} runs at ${formatHour(peakHour)} are from hourly schedules (cannot be moved).`,
        action: `Move some refreshes from ${formatHour(peakHour)} to quieter hours like ${formatHour(quietHours[0])}.`,
        affectedTasks: moveableTasks,
      });
    } else if (ratio > 2) {
      recommendations.push({
        severity: "warning",
        title: "Moderate Load Imbalance",
        message: `Peak hours have ${ratio.toFixed(1)}x the average load. ${peakFixed} of ${peakTotal} runs at ${formatHour(peakHour)} are hourly (fixed).`,
        action: "Consider spreading refreshes across more hours.",
        affectedTasks: moveableTasks,
      });
    }
  }

  // Business hours concentration
  const businessHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17].reduce(
    (sum, h) => sum + (byHour[h] || 0),
    0,
  );
  const total = Object.values(byHour).reduce((sum, c) => sum + c, 0);

  if (total > 0 && businessHours / total > 0.8) {
    recommendations.push({
      severity: "info",
      title: "High Business Hours Concentration",
      message: `${Math.round((businessHours / total) * 100)}% of refreshes run during 8 AM–6 PM.`,
      action: "Consider moving non-critical refreshes to early morning or evening.",
    });
  }

  // Suggest quiet hours
  if (quietHours.length > 0 && peakHours.length > 0) {
    const peakCount = byHour[peakHours[0]] || 0;
    const quietCount = byHour[quietHours[0]] || 0;
    if (peakCount > quietCount + 5) {
      recommendations.push({
        severity: "suggestion",
        title: "Recommended Time Slots",
        message: `${formatHour(quietHours[0])} has minimal activity (${quietCount} refreshes).`,
        action: `Good candidate for moving refreshes from ${formatHour(peakHours[0])} (${peakCount} refreshes).`,
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      severity: "success",
      title: "Load Distribution Looks Good",
      message: "Refresh load appears reasonably distributed.",
    });
  }

  return recommendations;
}

export function registerRecommendationsTool(server: McpServer) {
  server.tool(
    "get_recommendations",
    "Get actionable recommendations for improving extract refresh load balance. Returns prioritized suggestions with severity levels and affected tasks.",
    {},
    async () => {
      try {
        const analysis = await getAnalysis();
        const recs = generateRecommendationsFromAnalysis(analysis);

        const lines = recs.map((r) => {
          const parts = [`[${r.severity.toUpperCase()}] ${r.title}`, `  ${r.message}`];
          if (r.action) parts.push(`  Action: ${r.action}`);
          if (r.affectedTasks && r.affectedTasks.length > 0) {
            parts.push(`  Moveable tasks: ${r.affectedTasks.join(", ")}`);
          }
          return parts.join("\n");
        });

        return {
          content: [{ type: "text" as const, text: lines.join("\n\n") }],
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
