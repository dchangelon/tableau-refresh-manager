import { describe, it, expect } from "vitest";
import { analyzeScheduledTasks } from "@/lib/analyzer";

describe("analyzeScheduledTasks", () => {
  it("returns valid AnalysisResponse structure", () => {
    const tasks = [
      {
        extractRefresh: {
          id: "task-1",
          schedule: {
            frequency: "Daily",
            frequencyDetails: {
              start: "08:00:00",
              intervals: {},
            },
          },
          workbook: { id: "wb-1" },
          consecutiveFailedCount: 0,
        },
        resolved_item: {
          name: "Test Workbook",
          url: "https://test.tableau.com",
          project: "Default",
        },
      },
    ];

    const result = analyzeScheduledTasks(tasks, "America/Chicago");

    // Verify structure
    expect(result).toHaveProperty("hourly");
    expect(result).toHaveProperty("daily");
    expect(result).toHaveProperty("heatmap");
    expect(result).toHaveProperty("loadComposition");
    expect(result).toHaveProperty("tasks");
    expect(result).toHaveProperty("enhancedStats");
    expect(result).toHaveProperty("calendar");

    // Verify hourly stats
    expect(result.hourly).toHaveProperty("byHour");
    expect(result.hourly).toHaveProperty("peakHours");
    expect(result.hourly).toHaveProperty("quietHours");
    expect(result.hourly).toHaveProperty("totalRefreshes");
    expect(result.hourly).toHaveProperty("averagePerHour");

    // Verify health metrics
    expect(result.enhancedStats).toHaveProperty("loadBalanceScore");
    expect(result.enhancedStats).toHaveProperty("busiestWindow");
    expect(result.enhancedStats).toHaveProperty("utilization");
    expect(result.enhancedStats).toHaveProperty("peakAvgRatio");
  });

  it("processes Daily schedule at 8 AM", () => {
    const tasks = [
      {
        extractRefresh: {
          id: "task-1",
          schedule: {
            frequency: "Daily",
            frequencyDetails: {
              start: "08:00:00",
              intervals: {},
            },
          },
          workbook: { id: "wb-1" },
          consecutiveFailedCount: 0,
        },
        resolved_item: {
          name: "Morning Refresh",
          url: "https://test.tableau.com",
          project: "Default",
        },
      },
    ];

    const result = analyzeScheduledTasks(tasks, "America/Chicago");

    // Should count 1 refresh at hour 8
    expect(result.hourly.byHour[8]).toBe(7); // 7 days per week
    expect(result.hourly.totalRefreshes).toBe(7);
    expect(result.tasks.total).toBe(1);
    expect(result.tasks.details).toHaveLength(1);
  });

  it("processes Hourly schedule", () => {
    const tasks = [
      {
        extractRefresh: {
          id: "task-hourly",
          schedule: {
            frequency: "Hourly",
            frequencyDetails: {
              start: "07:00:00",
              end: "10:00:00",
              intervals: {
                interval: { hours: "1" },
              },
            },
          },
          datasource: { id: "ds-1" },
          consecutiveFailedCount: 0,
        },
        resolved_item: {
          name: "Hourly Refresh",
          url: "https://test.tableau.com",
          project: "Hourly",
        },
      },
    ];

    const result = analyzeScheduledTasks(tasks, "America/Chicago");

    // Hourly from 7-10 should include hours 7, 8, 9, 10
    const totalHourly = [7, 8, 9, 10].reduce((sum, h) => sum + (result.hourly.byHour[h] || 0), 0);
    expect(totalHourly).toBeGreaterThan(0);

    // Load composition should reflect hourly tasks
    expect(result.loadComposition.hourlyFixedRuns).toBeGreaterThan(0);
  });

  it("handles tasks with failures", () => {
    const tasks = [
      {
        extractRefresh: {
          id: "task-fail",
          schedule: {
            frequency: "Daily",
            frequencyDetails: {
              start: "06:00:00",
              intervals: {},
            },
          },
          workbook: { id: "wb-fail" },
          consecutiveFailedCount: 3,
          lastFailureMessage: "Connection timeout",
        },
        resolved_item: {
          name: "Failing Workbook",
          url: "https://test.tableau.com",
          project: "Default",
        },
      },
    ];

    const result = analyzeScheduledTasks(tasks, "America/Chicago");

    expect(result.tasks.totalWithFailures).toBe(1);
    expect(result.tasks.withFailures).toHaveLength(1);
    expect(result.tasks.withFailures[0].lastFailureMessage).toBe("Connection timeout");
  });

  it("generates heatmap data", () => {
    const tasks = [
      {
        extractRefresh: {
          id: "task-1",
          schedule: {
            frequency: "Daily",
            frequencyDetails: {
              start: "08:00:00",
              intervals: {},
            },
          },
          workbook: { id: "wb-1" },
          consecutiveFailedCount: 0,
        },
        resolved_item: {
          name: "Test",
          url: "",
          project: "",
        },
      },
    ];

    const result = analyzeScheduledTasks(tasks, "America/Chicago");

    expect(result.heatmap.data).toBeInstanceOf(Array);
    expect(result.heatmap.data.length).toBeGreaterThan(0);
    expect(result.heatmap.maxValue).toBeGreaterThanOrEqual(0);

    // Verify heatmap cell structure
    const cell = result.heatmap.data[0];
    expect(cell).toHaveProperty("x"); // hour
    expect(cell).toHaveProperty("y"); // day
    expect(cell).toHaveProperty("v"); // value
  });

  it("generates calendar data for current month", () => {
    const tasks = [
      {
        extractRefresh: {
          id: "task-1",
          schedule: {
            frequency: "Daily",
            frequencyDetails: {
              start: "08:00:00",
              intervals: {},
            },
          },
          workbook: { id: "wb-1" },
          consecutiveFailedCount: 0,
        },
        resolved_item: {
          name: "Test",
          url: "",
          project: "",
        },
      },
    ];

    const result = analyzeScheduledTasks(tasks, "America/Chicago");

    expect(result.calendar).toHaveProperty("year");
    expect(result.calendar).toHaveProperty("month");
    expect(result.calendar).toHaveProperty("monthName");
    expect(result.calendar).toHaveProperty("daysInMonth");
    expect(result.calendar).toHaveProperty("firstWeekday");
    expect(result.calendar).toHaveProperty("byDate");

    expect(result.calendar.year).toBeGreaterThan(2020);
    expect(result.calendar.month).toBeGreaterThanOrEqual(1);
    expect(result.calendar.month).toBeLessThanOrEqual(12);
  });

  it("handles monthly ordinal weekday schedules in calendar view", () => {
    const tasks = [
      {
        extractRefresh: {
          id: "task-monthly-ordinal",
          schedule: {
            frequency: "Monthly",
            frequencyDetails: {
              start: "11:05:00",
              intervals: {
                interval: { monthDay: "Second", weekDay: "Monday" },
              },
            },
          },
          workbook: { id: "wb-monthly-ordinal" },
          consecutiveFailedCount: 0,
        },
        resolved_item: {
          name: "Monthly Ordinal Workbook",
          url: "https://test.tableau.com",
          project: "Default",
        },
      },
    ];

    const result = analyzeScheduledTasks(tasks, "America/Chicago");
    const nonZeroDays = Object.values(result.calendar.byDate).filter((count) => count > 0);

    expect(nonZeroDays.length).toBe(1);
  });
});
