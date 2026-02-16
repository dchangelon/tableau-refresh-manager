/**
 * GET /api/refresh-data
 *
 * Main analysis endpoint - returns full AnalysisResponse.
 * Calls the shared `runRefreshAnalysis()` service (cached at service level).
 */

import { runRefreshAnalysis } from "@/lib/refresh-data-service";
import { apiErrorResponse, logApiError } from "@/lib/api-errors";

export const maxDuration = 120; // Allow up to 2 minutes for Tableau API fetch on cache miss

export async function GET() {
  try {
    const analysis = await runRefreshAnalysis();
    return Response.json(analysis);
  } catch (error) {
    logApiError("refresh-data GET failed", error);
    return apiErrorResponse(
      500,
      "internal_error",
      error instanceof Error ? error.message : "Failed to fetch refresh data",
    );
  }
}
