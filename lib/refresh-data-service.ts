/**
 * Shared Refresh Data Service
 *
 * CRITICAL: This is the SINGLE source of truth for analysis data caching.
 * Both `/api/refresh-data` and `/api/time-slots` call `runRefreshAnalysis()`.
 *
 * Uses Next.js `unstable_cache` at the service level to ensure:
 * - Tableau API calls happen once per cache period (not once per route)
 * - Tag-based invalidation works across all consuming routes
 * - No second-layer caching inside TableauClient methods
 *
 * Cache Contract (LOCKED):
 * - `revalidateTag('tableau')` after `POST /api/reschedule` invalidates this cache
 * - Do NOT add additional long-lived caching in TableauClient that outlives tag invalidation
 */

import { unstable_cache } from "next/cache";
import { createTableauClient } from "@/lib/tableau-client";
import { analyzeScheduledTasks } from "@/lib/analyzer";
import type { AnalysisResponse } from "@/lib/types";
import { CACHE_REVALIDATE_SECONDS, DEFAULT_TIMEZONE } from "@/lib/constants";

/**
 * Fetch and analyze Tableau extract refresh tasks.
 *
 * This function is wrapped with `unstable_cache` to provide:
 * - 1-hour TTL with background revalidation
 * - Tag-based invalidation via `revalidateTag('tableau')`
 * - Shared cache across multiple routes
 */
const getCachedAnalysis = unstable_cache(
  async (): Promise<AnalysisResponse> => {
    const timezone = process.env.APP_TIMEZONE || DEFAULT_TIMEZONE;

    const client = createTableauClient();
    await client.signIn();

    try {
      // Fetch tasks
      const tasks = await client.getExtractRefreshTasks();

      // Resolve workbook/datasource details (names, URLs, projects)
      const tasksWithDetails = await client.resolveItemDetails(tasks as Record<string, unknown>[]);

      // Resolve failure messages from job history (best-effort)
      const tasksWithFailures = await client.resolveFailureMessages(tasksWithDetails);

      // Run analysis
      const analysis = analyzeScheduledTasks(tasksWithFailures, timezone);

      return analysis;
    } finally {
      await client.signOut();
    }
  },
  ["tableau-analysis"], // Cache key
  {
    revalidate: CACHE_REVALIDATE_SECONDS, // 1 hour
    tags: ["tableau"], // Tag for invalidation
  },
);

/**
 * Run the refresh analysis pipeline.
 *
 * This is the public API consumed by route handlers.
 * The actual work is done by `getCachedAnalysis` with service-level caching.
 */
export async function runRefreshAnalysis(): Promise<AnalysisResponse> {
  return getCachedAnalysis();
}
