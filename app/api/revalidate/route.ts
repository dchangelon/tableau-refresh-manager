/**
 * POST /api/revalidate
 *
 * Force-invalidates the Tableau data cache so the next request fetches fresh data.
 * Useful after deployments or when cached data is stale.
 */

import { revalidateTag } from "next/cache";

export async function POST() {
  revalidateTag("tableau", "max");
  return Response.json({ revalidated: true });
}
