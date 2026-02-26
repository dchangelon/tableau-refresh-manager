/**
 * Tableau Refresh MCP Server
 *
 * Exposes Tableau extract refresh analysis and management as MCP tools.
 * Run with: npx tsx mcp-server/index.ts
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { shutdown } from "./tableau-service.js";
import { registerHealthTool } from "./tools/health.js";
import { registerDistributionTool } from "./tools/distribution.js";
import { registerRecommendationsTool } from "./tools/recommendations.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerTimeSlotsTool } from "./tools/time-slots.js";
import { registerSimulateTool } from "./tools/simulate.js";
import { registerRescheduleTool } from "./tools/reschedule.js";

const server = new McpServer({
  name: "tableau-refresh",
  version: "1.0.0",
});

// Register all tools
registerHealthTool(server);
registerDistributionTool(server);
registerRecommendationsTool(server);
registerTaskTools(server);
registerTimeSlotsTool(server);
registerSimulateTool(server);
registerRescheduleTool(server);

// Graceful shutdown
async function handleShutdown() {
  await shutdown();
  process.exit(0);
}
process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Tableau Refresh MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
