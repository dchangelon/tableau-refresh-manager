export type ApiErrorCode =
  | "invalid_json"
  | "validation_failed"
  | "bad_request"
  | "internal_error";

interface ApiErrorPayload {
  error: string;
  code: ApiErrorCode;
  details?: unknown;
}

export function apiErrorResponse(
  status: number,
  code: ApiErrorCode,
  error: string,
  details?: unknown,
) {
  const payload: ApiErrorPayload = { error, code };
  if (details !== undefined) {
    payload.details = details;
  }
  return Response.json(payload, { status });
}

export function logApiError(context: string, error: unknown) {
  console.error(`[api] ${context}`, error);
}
