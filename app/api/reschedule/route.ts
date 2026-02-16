/**
 * POST /api/reschedule
 *
 * Apply batch schedule changes to Tableau extract refresh tasks.
 *
 * Request: { changes: Array<{ taskId: string; schedule: ScheduleConfig }> }
 * Response: { success: boolean; results: Array<RescheduleResult>; summary: {total, succeeded, failed} }
 *
 * Semantics (LOCKED):
 * - HTTP 200 for syntactically valid requests (including partial success)
 * - success: true only when ALL items succeed (summary.failed === 0)
 * - HTTP 400 for schema/validation failures (no Tableau write attempts)
 * - HTTP 500 for unexpected server failure before structured results can be returned
 *
 * After any successful updates, server-side revalidation is triggered via `revalidateTag('tableau')`.
 */

import { revalidateTag } from "next/cache";
import { rescheduleRequestSchema } from "@/lib/schemas";
import { createTableauClient } from "@/lib/tableau-client";
import { buildScheduleXml } from "@/lib/xml-builder";
import { apiErrorResponse, logApiError } from "@/lib/api-errors";
import type { RescheduleResponse } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiErrorResponse(400, "invalid_json", "Invalid JSON body");
  }

  // Validate request schema
  const parseResult = rescheduleRequestSchema.safeParse(body);

  if (!parseResult.success) {
    return apiErrorResponse(
      400,
      "validation_failed",
      "Validation failed",
      parseResult.error.flatten(),
    );
  }

  const { changes } = parseResult.data;
  // Build XML payloads
  const xmlChanges = changes.map((change) => {
    try {
      const xmlPayload = buildScheduleXml(change.schedule);
      return { taskId: change.taskId, xmlPayload };
    } catch (error) {
      throw new Error(
        `XML generation failed for task ${change.taskId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  // Apply changes
  const client = createTableauClient();

  try {
    await client.signIn();
    const results = await client.batchUpdateTasks(xmlChanges);

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    const response: RescheduleResponse = {
      success: failed === 0,
      results,
      summary: {
        total: results.length,
        succeeded,
        failed,
      },
    };

    // Server-side revalidation if any updates succeeded
    if (succeeded > 0) {
      revalidateTag("tableau", "max");
    }

    return Response.json(response);
  } catch (error) {
    logApiError("reschedule POST failed", error);
    return apiErrorResponse(
      500,
      "internal_error",
      error instanceof Error ? error.message : "Unexpected server error",
    );
  } finally {
    await client.signOut();
  }
}
