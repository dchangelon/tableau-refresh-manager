import { describe, it, expect } from "vitest";
import {
  formatHour,
  parseTime,
  formatTime,
  getDaysInMonth,
  getFirstWeekdayOfMonth,
  jsDayToHeatmapY,
  formatScheduleSummary,
} from "@/lib/utils";

describe("formatHour", () => {
  it("formats midnight as 12 AM", () => {
    expect(formatHour(0)).toBe("12 AM");
  });

  it("formats noon as 12 PM", () => {
    expect(formatHour(12)).toBe("12 PM");
  });

  it("formats 7 as 7 AM", () => {
    expect(formatHour(7)).toBe("7 AM");
  });

  it("formats 13 as 1 PM", () => {
    expect(formatHour(13)).toBe("1 PM");
  });

  it("formats 23 as 11 PM", () => {
    expect(formatHour(23)).toBe("11 PM");
  });
});

describe("parseTime", () => {
  it("parses HH:MM format", () => {
    expect(parseTime("08:30")).toEqual({ hour: 8, minute: 30 });
  });

  it("parses HH:MM:SS format (ignores seconds)", () => {
    expect(parseTime("14:00:00")).toEqual({ hour: 14, minute: 0 });
  });

  it("parses midnight", () => {
    expect(parseTime("00:00")).toEqual({ hour: 0, minute: 0 });
  });
});

describe("formatTime", () => {
  it("pads single-digit hour and minute", () => {
    expect(formatTime(8, 5)).toBe("08:05");
  });

  it("formats noon correctly", () => {
    expect(formatTime(12, 0)).toBe("12:00");
  });

  it("formats 23:59 correctly", () => {
    expect(formatTime(23, 59)).toBe("23:59");
  });
});

describe("getDaysInMonth", () => {
  it("returns 31 for January", () => {
    expect(getDaysInMonth(2024, 1)).toBe(31);
  });

  it("returns 28 for Feb in non-leap year", () => {
    expect(getDaysInMonth(2023, 2)).toBe(28);
  });

  it("returns 29 for Feb in leap year", () => {
    expect(getDaysInMonth(2024, 2)).toBe(29);
  });

  it("returns 30 for April", () => {
    expect(getDaysInMonth(2024, 4)).toBe(30);
  });
});

describe("getFirstWeekdayOfMonth", () => {
  // January 1, 2024 is a Monday => heatmap y=0
  it("returns 0 (Monday) for Jan 2024", () => {
    expect(getFirstWeekdayOfMonth(2024, 1)).toBe(0);
  });

  // February 1, 2024 is a Thursday => heatmap y=3
  it("returns 3 (Thursday) for Feb 2024", () => {
    expect(getFirstWeekdayOfMonth(2024, 2)).toBe(3);
  });

  // March 1, 2026 is a Sunday => heatmap y=6
  it("returns 6 (Sunday) for Mar 2026", () => {
    expect(getFirstWeekdayOfMonth(2026, 3)).toBe(6);
  });
});

describe("jsDayToHeatmapY", () => {
  it("maps Sunday (0) to 6", () => {
    expect(jsDayToHeatmapY(0)).toBe(6);
  });

  it("maps Monday (1) to 0", () => {
    expect(jsDayToHeatmapY(1)).toBe(0);
  });

  it("maps Saturday (6) to 5", () => {
    expect(jsDayToHeatmapY(6)).toBe(5);
  });
});

describe("formatScheduleSummary", () => {
  it("formats Hourly with endTime", () => {
    expect(formatScheduleSummary("Hourly", "07:00", 1, [], "22:00")).toBe("Hourly 7 AM – 10 PM");
  });

  it("formats Hourly without endTime", () => {
    expect(formatScheduleSummary("Hourly", "07:00")).toBe("Hourly 7 AM");
  });

  it("formats Daily every 24h", () => {
    expect(formatScheduleSummary("Daily", "08:00", 24)).toBe("Daily at 8 AM");
  });

  it("formats Daily every 24h with specific days", () => {
    expect(formatScheduleSummary("Daily", "08:00", 24, ["Monday", "Wednesday"])).toBe("Daily at 8 AM Mon, Wed");
  });

  it("formats Daily every 4h with endTime", () => {
    expect(formatScheduleSummary("Daily", "08:00", 4, [], "22:00")).toBe("Every 4h 8 AM – 10 PM");
  });

  it("formats Daily every 4h without endTime", () => {
    expect(formatScheduleSummary("Daily", "08:00", 4)).toBe("Every 4h 8 AM");
  });

  it("formats Weekly with days", () => {
    const result = formatScheduleSummary("Weekly", "09:00", null, ["Monday", "Wednesday", "Friday"]);
    expect(result).toContain("Mon");
    expect(result).toContain("Wed");
    expect(result).toContain("Fri");
  });

  it("formats Monthly", () => {
    expect(formatScheduleSummary("Monthly", "06:00")).toBe("Monthly at 6 AM");
  });

  it("omits days label when all 7 days selected", () => {
    const allDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    expect(formatScheduleSummary("Daily", "08:00", 24, allDays)).toBe("Daily at 8 AM");
  });
});
