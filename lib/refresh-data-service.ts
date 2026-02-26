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

// --- Project hierarchy helpers ---

/** Exclusion rules (matches tableau-report-tracker/api/config/exceptions.json) */
const EXCLUDED_FOLDERS = ["Prep Builder Flows", "Retire", "Archive", "Other", "Default"];
const EXCLUDED_FOLDERS_EXACT = ["default", "Testing"];
const EXCLUDED_PROJECT_IDS = new Set(["b9f122ec-cff6-4ac5-8f54-2bebc51dd2ce"]);

interface ProjectNode {
  name: string;
  parentId: string | null;
  fullPath: string;
  topLevelName: string;
}

/**
 * Build a project hierarchy map from raw Tableau projects.
 * Resolves full paths and top-level ancestor for each project.
 */
function buildProjectMap(
  rawProjects: Array<{ id: string; name: string; parentProjectId: string | null }>,
): Map<string, ProjectNode> {
  const map = new Map<string, ProjectNode>();

  for (const p of rawProjects) {
    map.set(p.id, { name: p.name, parentId: p.parentProjectId, fullPath: "", topLevelName: "" });
  }

  // Recursive path builder (memoized via fullPath)
  function resolve(id: string): { fullPath: string; topLevelName: string } {
    const node = map.get(id);
    if (!node) return { fullPath: "Unknown", topLevelName: "Unknown" };
    if (node.fullPath) return { fullPath: node.fullPath, topLevelName: node.topLevelName };

    if (node.parentId && map.has(node.parentId)) {
      const parent = resolve(node.parentId);
      node.fullPath = `${parent.fullPath}/${node.name}`;
      node.topLevelName = parent.topLevelName;
    } else {
      node.fullPath = node.name;
      node.topLevelName = node.name;
    }

    return { fullPath: node.fullPath, topLevelName: node.topLevelName };
  }

  for (const id of map.keys()) {
    resolve(id);
  }

  return map;
}

/**
 * Check if a task should be excluded based on its project path.
 */
function shouldExcludeByPath(projectPath: string): boolean {
  const segments = projectPath.split("/");

  // Substring match per segment (e.g., "Archive" matches "Archive_2025")
  for (const pattern of EXCLUDED_FOLDERS) {
    for (const segment of segments) {
      if (segment.includes(pattern)) return true;
    }
  }

  // Exact segment match
  for (const exact of EXCLUDED_FOLDERS_EXACT) {
    if (segments.includes(exact)) return true;
  }

  return false;
}

/**
 * Check if a task should be excluded based on its project ID (rename-proof).
 * Walks up the ancestor chain so sub-projects are also excluded.
 */
function shouldExcludeByProjectId(
  projectId: string,
  projectMap: Map<string, ProjectNode>,
): boolean {
  if (!EXCLUDED_PROJECT_IDS.size || !projectId) return false;
  let current: string | null = projectId;
  while (current) {
    if (EXCLUDED_PROJECT_IDS.has(current)) return true;
    current = projectMap.get(current)?.parentId ?? null;
  }
  return false;
}

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
      // Fetch project hierarchy and build map
      const rawProjects = await client.getProjects();
      const projectMap = buildProjectMap(rawProjects);

      // Fetch tasks
      const tasks = await client.getExtractRefreshTasks();

      // Resolve workbook/datasource details (names, URLs, projects, hierarchy)
      const tasksWithDetails = await client.resolveItemDetails(
        tasks as Record<string, unknown>[],
        projectMap,
      );

      // Filter out tasks in excluded folders/projects
      const filteredTasks = tasksWithDetails.filter((task) => {
        const resolved = task.resolved_item as Record<string, unknown> | undefined;
        const projectPath = (resolved?.projectPath as string) || "";
        const projectId = (resolved?.projectId as string) || "";
        return !shouldExcludeByPath(projectPath) && !shouldExcludeByProjectId(projectId, projectMap);
      });

      // Resolve failure messages from job history (best-effort)
      const tasksWithFailures = await client.resolveFailureMessages(filteredTasks);

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
