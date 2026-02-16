/**
 * GET /api/time-slots
 *
 * Returns 24 time slots sorted by current load (ascending).
 * Calls the shared `runRefreshAnalysis()` service (same cache as /api/refresh-data).
 */

import { runRefreshAnalysis } from "@/lib/refresh-data-service";
import { formatHour } from "@/lib/utils";
import { apiErrorResponse, logApiError } from "@/lib/api-errors";
import type { TimeSlot } from "@/lib/types";

export const maxDuration = 120;

export async function GET() {
  try {
    const analysis = await runRefreshAnalysis();

    const slots: TimeSlot[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: formatHour(hour),
      count: analysis.hourly.byHour[hour] || 0,
    }));

    // Sort by count ascending (quietest first)
    slots.sort((a, b) => a.count - b.count);

    return Response.json(slots);
  } catch (error) {
    logApiError("time-slots GET failed", error);
    return apiErrorResponse(
      500,
      "internal_error",
      error instanceof Error ? error.message : "Failed to fetch time slots",
    );
  }
}
