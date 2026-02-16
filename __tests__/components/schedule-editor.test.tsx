import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleEditor } from "@/components/batch/schedule-editor";
import type { ScheduleConfig } from "@/lib/types";

const dailySchedule: ScheduleConfig = {
  frequency: "Daily",
  startTime: "08:00",
  endTime: null,
  intervalHours: 24,
  weekDays: [],
  monthDays: [],
  monthlyOrdinal: null,
  monthlyWeekDay: null,
};

const hourlySchedule: ScheduleConfig = {
  frequency: "Hourly",
  startTime: "07:00",
  endTime: "22:00",
  intervalHours: 1,
  weekDays: [],
  monthDays: [],
  monthlyOrdinal: null,
  monthlyWeekDay: null,
};

const weeklySchedule: ScheduleConfig = {
  frequency: "Weekly",
  startTime: "09:00",
  endTime: null,
  intervalHours: 24,
  weekDays: ["Monday", "Wednesday"],
  monthDays: [],
  monthlyOrdinal: null,
  monthlyWeekDay: null,
};

const monthlyDaySchedule: ScheduleConfig = {
  frequency: "Monthly",
  startTime: "06:00",
  endTime: null,
  intervalHours: 24,
  weekDays: [],
  monthDays: [1, 15],
  monthlyOrdinal: null,
  monthlyWeekDay: null,
};

describe("ScheduleEditor", () => {
  it("renders with Daily frequency by default", () => {
    const onChange = vi.fn();
    render(<ScheduleEditor value={dailySchedule} onChange={onChange} />);

    expect(screen.getByText("Frequency")).toBeInTheDocument();
    expect(screen.getByText("Start Time")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("renders Hourly frequency with end time and fixed interval", () => {
    const onChange = vi.fn();
    render(<ScheduleEditor value={hourlySchedule} onChange={onChange} />);

    expect(screen.getByText("End Time")).toBeInTheDocument();
    expect(screen.getByText("Every 1 hour")).toBeInTheDocument();
  });

  it("renders Weekly frequency with weekday checkboxes", () => {
    const onChange = vi.fn();
    render(<ScheduleEditor value={weeklySchedule} onChange={onChange} />);

    expect(screen.getByText("Days (at least 1)")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
  });

  it("renders Monthly frequency with On Day and On Ordinal mode toggle", () => {
    const onChange = vi.fn();
    render(<ScheduleEditor value={monthlyDaySchedule} onChange={onChange} />);

    expect(screen.getByText("On Day")).toBeInTheDocument();
    expect(screen.getByText("On Ordinal Weekday")).toBeInTheDocument();
    expect(screen.getByText("Select Days")).toBeInTheDocument();
    expect(screen.getByText("Last Day")).toBeInTheDocument();
  });

  it("toggles Monthly mode from Day to Ordinal", async () => {
    const onChange = vi.fn();
    render(<ScheduleEditor value={monthlyDaySchedule} onChange={onChange} />);

    // Click "On Ordinal Weekday" button
    fireEvent.click(screen.getByText("On Ordinal Weekday"));

    await waitFor(() => {
      expect(screen.getByText("Ordinal")).toBeInTheDocument();
      expect(screen.getByText("Weekday")).toBeInTheDocument();
    });
  });

  it("shows end time for Daily with interval < 24", async () => {
    const dailyWith4h: ScheduleConfig = {
      ...dailySchedule,
      intervalHours: 4,
      endTime: "20:00",
    };
    const onChange = vi.fn();
    render(<ScheduleEditor value={dailyWith4h} onChange={onChange} />);

    expect(screen.getByText("End Time")).toBeInTheDocument();
  });

  it("hides end time for Daily with interval 24", () => {
    const onChange = vi.fn();
    render(<ScheduleEditor value={dailySchedule} onChange={onChange} />);

    expect(screen.queryByText("End Time")).not.toBeInTheDocument();
  });

  it("calls onChange with valid ScheduleConfig on submit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ScheduleEditor value={dailySchedule} onChange={onChange} />);

    await user.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
      const result = onChange.mock.calls[0][0];
      expect(result.frequency).toBe("Daily");
      expect(result.startTime).toBe("08:00");
    });
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCancel = vi.fn();
    render(
      <ScheduleEditor value={dailySchedule} onChange={onChange} onCancel={onCancel} />,
    );

    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not show Cancel button when onCancel is not provided", () => {
    const onChange = vi.fn();
    render(<ScheduleEditor value={dailySchedule} onChange={onChange} />);

    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });
});
