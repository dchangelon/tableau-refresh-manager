/**
 * Tableau service wrapper for MCP server.
 *
 * Manages a singleton TableauClient with lazy authentication:
 * - Signs in on first tool call
 * - Reuses the session for the process lifetime
 * - Signs out on graceful shutdown (SIGINT/SIGTERM)
 */

import { createTableauClient, TableauClient } from "@/lib/tableau-client";
import { analyzeScheduledTasks } from "@/lib/analyzer";
import { getCached, invalidateAll } from "./cache.js";
import type { AnalysisResponse } from "@/lib/types";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TIMEZONE = "America/Chicago";

let client: TableauClient | null = null;
let authenticated = false;

/**
 * Get or create the singleton TableauClient, ensuring it's authenticated.
 */
async function getClient(): Promise<TableauClient> {
  if (!client) {
    client = createTableauClient();
  }
  if (!authenticated) {
    await client.signIn();
    authenticated = true;
  }
  return client;
}

/**
 * Run the full analysis pipeline (fetch tasks, resolve details, analyze).
 * Cached for 5 minutes.
 */
export async function getAnalysis(): Promise<AnalysisResponse> {
  return getCached("analysis", CACHE_TTL_MS, async () => {
    const timezone = process.env.APP_TIMEZONE || DEFAULT_TIMEZONE;
    const tc = await getClient();

    const tasks = await tc.getExtractRefreshTasks();
    const tasksWithDetails = await tc.resolveItemDetails(
      tasks as Record<string, unknown>[],
    );
    const tasksWithFailures = await tc.resolveFailureMessages(tasksWithDetails);

    return analyzeScheduledTasks(tasksWithFailures, timezone);
  });
}

/**
 * Get the authenticated TableauClient for write operations.
 */
export async function getTableauClient(): Promise<TableauClient> {
  return getClient();
}

/**
 * Invalidate all cached analysis data (call after reschedule).
 */
export function invalidateCache(): void {
  invalidateAll();
}

/**
 * Gracefully shut down: sign out from Tableau.
 */
export async function shutdown(): Promise<void> {
  if (client && authenticated) {
    try {
      await client.signOut();
    } catch {
      // Best-effort sign out
    }
    authenticated = false;
    client = null;
  }
}
