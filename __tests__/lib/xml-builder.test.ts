import { describe, it, expect } from "vitest";
import { buildScheduleXml } from "@/lib/xml-builder";
import type { ScheduleConfig } from "@/lib/types";

describe("buildScheduleXml", () => {
  describe("Hourly frequency", () => {
    it("builds XML for hourly schedule with all days (empty weekDays sends all 7)", () => {
      const schedule: ScheduleConfig = {
        frequency: "Hourly",
        startTime: "07:00",
        endTime: "22:00",
        intervalHours: 1,
        weekDays: [],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      const xml = buildScheduleXml(schedule);

      expect(xml).toContain('<schedule frequency="Hourly">');
      expect(xml).toContain('start="07:00:00" end="22:00:00"');
      expect(xml).toContain('<interval hours="1" />');
      // Empty weekDays now sends all 7 days explicitly per Tableau API requirement
      expect(xml).toContain('<interval weekDay="Sunday" />');
      expect(xml).toContain('<interval weekDay="Monday" />');
      expect(xml).toContain('<interval weekDay="Saturday" />');
    });

    it("builds XML for hourly schedule with specific weekdays", () => {
      const schedule: ScheduleConfig = {
        frequency: "Hourly",
        startTime: "08:00",
        endTime: "18:00",
        intervalHours: 1,
        weekDays: ["Monday", "Wednesday", "Friday"],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      const xml = buildScheduleXml(schedule);

      expect(xml).toContain('<interval hours="1" />');
      expect(xml).toContain('<interval weekDay="Monday" />');
      expect(xml).toContain('<interval weekDay="Wednesday" />');
      expect(xml).toContain('<interval weekDay="Friday" />');
    });

    it("rejects hourly with intervalHours != 1", () => {
      const schedule: ScheduleConfig = {
        frequency: "Hourly",
        startTime: "07:00",
        endTime: "22:00",
        intervalHours: 2,
        weekDays: [],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      expect(() => buildScheduleXml(schedule)).toThrow("Hourly frequency requires intervalHours === 1");
    });

    it("rejects hourly without endTime", () => {
      const schedule: ScheduleConfig = {
        frequency: "Hourly",
        startTime: "07:00",
        endTime: null,
        intervalHours: 1,
        weekDays: [],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      expect(() => buildScheduleXml(schedule)).toThrow("Hourly frequency requires endTime");
    });
  });

  describe("Daily frequency", () => {
    it("builds XML for daily every 24h (all days — sends all 7 weekDays)", () => {
      const schedule: ScheduleConfig = {
        frequency: "Daily",
        startTime: "08:00",
        endTime: null,
        intervalHours: 24,
        weekDays: [],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      const xml = buildScheduleXml(schedule);

      expect(xml).toContain('<schedule frequency="Daily">');
      expect(xml).toContain('start="08:00:00"');
      expect(xml).not.toContain('end=');
      expect(xml).toContain('<interval hours="24" />');
      // Empty weekDays now sends all 7 days explicitly per Tableau API requirement
      expect(xml).toContain('<interval weekDay="Sunday" />');
      expect(xml).toContain('<interval weekDay="Saturday" />');
    });

    it("builds XML for daily every 4h with end time and weekdays", () => {
      const schedule: ScheduleConfig = {
        frequency: "Daily",
        startTime: "08:00",
        endTime: "20:00",
        intervalHours: 4,
        weekDays: ["Monday", "Friday"],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      const xml = buildScheduleXml(schedule);

      expect(xml).toContain('start="08:00:00" end="20:00:00"');
      expect(xml).toContain('<interval hours="4" />');
      expect(xml).toContain('<interval weekDay="Monday" />');
      expect(xml).toContain('<interval weekDay="Friday" />');
    });

    it("rejects daily with invalid intervalHours", () => {
      const schedule: ScheduleConfig = {
        frequency: "Daily",
        startTime: "08:00",
        endTime: null,
        intervalHours: 3,
        weekDays: [],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      expect(() => buildScheduleXml(schedule)).toThrow("Daily frequency requires intervalHours in [2, 4, 6, 8, 12, 24]");
    });

    it("rejects daily with interval 4h missing endTime", () => {
      const schedule: ScheduleConfig = {
        frequency: "Daily",
        startTime: "08:00",
        endTime: null,
        intervalHours: 4,
        weekDays: [],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      expect(() => buildScheduleXml(schedule)).toThrow("Daily frequency with intervalHours=4 requires endTime");
    });

    it("rejects daily with mismatched start/end minutes", () => {
      const schedule: ScheduleConfig = {
        frequency: "Daily",
        startTime: "08:30",
        endTime: "22:00",
        intervalHours: 4,
        weekDays: [],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      expect(() => buildScheduleXml(schedule)).toThrow("startTime and endTime must have matching minutes");
    });

    it("accepts daily with matching start/end minutes", () => {
      const schedule: ScheduleConfig = {
        frequency: "Daily",
        startTime: "08:30",
        endTime: "22:30",
        intervalHours: 4,
        weekDays: ["Monday"],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      const xml = buildScheduleXml(schedule);
      expect(xml).toContain('start="08:30:00" end="22:30:00"');
    });
  });

  describe("Weekly frequency", () => {
    it("builds XML for weekly on specific days", () => {
      const schedule: ScheduleConfig = {
        frequency: "Weekly",
        startTime: "09:00",
        endTime: null,
        intervalHours: 24,
        weekDays: ["Wednesday"],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      const xml = buildScheduleXml(schedule);

      expect(xml).toContain('<schedule frequency="Weekly">');
      expect(xml).toContain('start="09:00:00"');
      expect(xml).not.toContain('end=');
      expect(xml).toContain('<interval weekDay="Wednesday" />');
    });

    it("rejects weekly with zero weekDays", () => {
      const schedule: ScheduleConfig = {
        frequency: "Weekly",
        startTime: "09:00",
        endTime: null,
        intervalHours: 24,
        weekDays: [],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      expect(() => buildScheduleXml(schedule)).toThrow("Weekly frequency requires at least one weekDay");
    });
  });

  describe("Monthly frequency - On Day mode", () => {
    it("builds XML for monthly on numeric days", () => {
      const schedule: ScheduleConfig = {
        frequency: "Monthly",
        startTime: "06:00",
        endTime: null,
        intervalHours: 24,
        weekDays: [],
        monthDays: [1, 15],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      const xml = buildScheduleXml(schedule);

      expect(xml).toContain('<schedule frequency="Monthly">');
      expect(xml).toContain('<interval monthDay="1" />');
      expect(xml).toContain('<interval monthDay="15" />');
    });

    it("builds XML for monthly with LastDay", () => {
      const schedule: ScheduleConfig = {
        frequency: "Monthly",
        startTime: "06:00",
        endTime: null,
        intervalHours: 24,
        weekDays: [],
        monthDays: ["LastDay"],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      const xml = buildScheduleXml(schedule);

      expect(xml).toContain('<interval monthDay="LastDay" />');
    });
  });

  describe("Monthly frequency - On Ordinal Weekday mode", () => {
    it("builds XML for Second Monday", () => {
      const schedule: ScheduleConfig = {
        frequency: "Monthly",
        startTime: "11:05",
        endTime: null,
        intervalHours: 24,
        weekDays: [],
        monthDays: [],
        monthlyOrdinal: "Second",
        monthlyWeekDay: "Monday",
      };

      const xml = buildScheduleXml(schedule);

      expect(xml).toContain('<schedule frequency="Monthly">');
      expect(xml).toContain('<interval monthDay="Second" weekDay="Monday" />');
    });

    it("builds XML for Last Friday", () => {
      const schedule: ScheduleConfig = {
        frequency: "Monthly",
        startTime: "14:00",
        endTime: null,
        intervalHours: 24,
        weekDays: [],
        monthDays: [],
        monthlyOrdinal: "Last",
        monthlyWeekDay: "Friday",
      };

      const xml = buildScheduleXml(schedule);

      expect(xml).toContain('<interval monthDay="Last" weekDay="Friday" />');
    });

    it("rejects monthly with both monthDays and monthlyOrdinal", () => {
      const schedule: ScheduleConfig = {
        frequency: "Monthly",
        startTime: "06:00",
        endTime: null,
        intervalHours: 24,
        weekDays: [],
        monthDays: [15],
        monthlyOrdinal: "Second",
        monthlyWeekDay: "Monday",
      };

      expect(() => buildScheduleXml(schedule)).toThrow("monthDays and monthlyOrdinal are mutually exclusive");
    });

    it("rejects monthly with neither mode", () => {
      const schedule: ScheduleConfig = {
        frequency: "Monthly",
        startTime: "06:00",
        endTime: null,
        intervalHours: 24,
        weekDays: [],
        monthDays: [],
        monthlyOrdinal: null,
        monthlyWeekDay: null,
      };

      expect(() => buildScheduleXml(schedule)).toThrow("Monthly requires either monthDays or (monthlyOrdinal + monthlyWeekDay)");
    });
  });
});
