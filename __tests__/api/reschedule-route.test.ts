import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RescheduleResponse } from "@/lib/types";

// Mock next/cache
const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

// Mock tableau-client
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockBatchUpdateTasks = vi.fn();
vi.mock("@/lib/tableau-client", () => ({
  createTableauClient: () => ({
    signIn: mockSignIn,
    signOut: mockSignOut,
    batchUpdateTasks: mockBatchUpdateTasks,
  }),
}));

// Mock xml-builder
vi.mock("@/lib/xml-builder", () => ({
  buildScheduleXml: () => "<tsRequest><test/></tsRequest>",
}));

// Import after mocks
const { POST } = await import("@/app/api/reschedule/route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/reschedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validSchedule() {
  return {
    frequency: "Daily",
    startTime: "08:00",
    endTime: "20:00",
    intervalHours: 4,
    weekDays: ["Monday", "Wednesday", "Friday"],
    monthDays: [],
    monthlyOrdinal: null,
    monthlyWeekDay: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSignIn.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
});

describe("POST /api/reschedule", () => {
  describe("schema validation (400 responses)", () => {
    it("rejects missing changes array", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
      expect(mockBatchUpdateTasks).not.toHaveBeenCalled();
    });

    it("rejects empty changes array", async () => {
      const res = await POST(makeRequest({ changes: [] }));
      expect(res.status).toBe(400);
      expect(mockBatchUpdateTasks).not.toHaveBeenCalled();
    });

    it("rejects missing taskId", async () => {
      const res = await POST(
        makeRequest({
          changes: [{ schedule: validSchedule() }],
        }),
      );
      expect(res.status).toBe(400);
      expect(mockBatchUpdateTasks).not.toHaveBeenCalled();
    });

    it("rejects invalid frequency", async () => {
      const res = await POST(
        makeRequest({
          changes: [
            {
              taskId: "task-1",
              schedule: { ...validSchedule(), frequency: "Biweekly" },
            },
          ],
        }),
      );
      expect(res.status).toBe(400);
      expect(mockBatchUpdateTasks).not.toHaveBeenCalled();
    });

    it("rejects Hourly with intervalHours > 1", async () => {
      const res = await POST(
        makeRequest({
          changes: [
            {
              taskId: "task-1",
              schedule: {
                frequency: "Hourly",
                startTime: "08:00",
                endTime: "20:00",
                intervalHours: 2,
                weekDays: [],
                monthDays: [],
                monthlyOrdinal: null,
                monthlyWeekDay: null,
              },
            },
          ],
        }),
      );
      expect(res.status).toBe(400);
      expect(mockBatchUpdateTasks).not.toHaveBeenCalled();
    });

    it("rejects Weekly with 0 weekDays", async () => {
      const res = await POST(
        makeRequest({
          changes: [
            {
              taskId: "task-1",
              schedule: {
                frequency: "Weekly",
                startTime: "08:00",
                endTime: null,
                intervalHours: 24,
                weekDays: [],
                monthDays: [],
                monthlyOrdinal: null,
                monthlyWeekDay: null,
              },
            },
          ],
        }),
      );
      expect(res.status).toBe(400);
      expect(mockBatchUpdateTasks).not.toHaveBeenCalled();
    });

    it("rejects Monthly with both monthDays and monthlyOrdinal", async () => {
      const res = await POST(
        makeRequest({
          changes: [
            {
              taskId: "task-1",
              schedule: {
                frequency: "Monthly",
                startTime: "08:00",
                endTime: null,
                intervalHours: 24,
                weekDays: [],
                monthDays: [1, 15],
                monthlyOrdinal: "First",
                monthlyWeekDay: "Monday",
              },
            },
          ],
        }),
      );
      expect(res.status).toBe(400);
      expect(mockBatchUpdateTasks).not.toHaveBeenCalled();
    });

    it("rejects invalid JSON body", async () => {
      const req = new Request("http://localhost:3000/api/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid JSON body");
    });
  });

  describe("full success", () => {
    it("returns success: true when all items succeed", async () => {
      mockBatchUpdateTasks.mockResolvedValue([
        { taskId: "task-1", success: true, message: "Updated" },
        { taskId: "task-2", success: true, message: "Updated" },
      ]);

      const res = await POST(
        makeRequest({
          changes: [
            { taskId: "task-1", schedule: validSchedule() },
            { taskId: "task-2", schedule: validSchedule() },
          ],
        }),
      );

      expect(res.status).toBe(200);
      const data: RescheduleResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.summary.total).toBe(2);
      expect(data.summary.succeeded).toBe(2);
      expect(data.summary.failed).toBe(0);
    });

    it("calls revalidateTag when all succeed", async () => {
      mockBatchUpdateTasks.mockResolvedValue([
        { taskId: "task-1", success: true, message: "Updated" },
      ]);

      await POST(
        makeRequest({
          changes: [{ taskId: "task-1", schedule: validSchedule() }],
        }),
      );

      expect(mockRevalidateTag).toHaveBeenCalled();
    });
  });

  describe("partial success", () => {
    it("returns success: false with mixed results", async () => {
      mockBatchUpdateTasks.mockResolvedValue([
        { taskId: "task-1", success: true, message: "Updated" },
        { taskId: "task-2", success: false, error: "Not found", statusCode: 404 },
      ]);

      const res = await POST(
        makeRequest({
          changes: [
            { taskId: "task-1", schedule: validSchedule() },
            { taskId: "task-2", schedule: validSchedule() },
          ],
        }),
      );

      expect(res.status).toBe(200);
      const data: RescheduleResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.summary.succeeded).toBe(1);
      expect(data.summary.failed).toBe(1);
      expect(data.results).toHaveLength(2);
    });

    it("calls revalidateTag when at least one succeeds", async () => {
      mockBatchUpdateTasks.mockResolvedValue([
        { taskId: "task-1", success: true, message: "Updated" },
        { taskId: "task-2", success: false, error: "Error" },
      ]);

      await POST(
        makeRequest({
          changes: [
            { taskId: "task-1", schedule: validSchedule() },
            { taskId: "task-2", schedule: validSchedule() },
          ],
        }),
      );

      expect(mockRevalidateTag).toHaveBeenCalled();
    });
  });

  describe("all fail", () => {
    it("returns success: false when all items fail", async () => {
      mockBatchUpdateTasks.mockResolvedValue([
        { taskId: "task-1", success: false, error: "Unauthorized", statusCode: 401 },
      ]);

      const res = await POST(
        makeRequest({
          changes: [{ taskId: "task-1", schedule: validSchedule() }],
        }),
      );

      expect(res.status).toBe(200);
      const data: RescheduleResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.summary.failed).toBe(1);
      expect(data.summary.succeeded).toBe(0);
    });

    it("does NOT call revalidateTag when all fail", async () => {
      mockBatchUpdateTasks.mockResolvedValue([
        { taskId: "task-1", success: false, error: "Error" },
        { taskId: "task-2", success: false, error: "Error" },
      ]);

      await POST(
        makeRequest({
          changes: [
            { taskId: "task-1", schedule: validSchedule() },
            { taskId: "task-2", schedule: validSchedule() },
          ],
        }),
      );

      expect(mockRevalidateTag).not.toHaveBeenCalled();
    });
  });

  describe("signOut always called", () => {
    it("calls signOut even after batch update failure", async () => {
      mockBatchUpdateTasks.mockRejectedValue(new Error("Connection lost"));

      const res = await POST(
        makeRequest({
          changes: [{ taskId: "task-1", schedule: validSchedule() }],
        }),
      );

      expect(res.status).toBe(500);
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
