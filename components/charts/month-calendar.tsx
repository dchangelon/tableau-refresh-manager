"use client";

import { useRefreshData } from "@/hooks/use-refresh-data";
import { getHeatmapColorClass } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { taskRunsOnDate } from "@/lib/filters";
import type { RefreshTask } from "@/lib/types";

interface MonthCalendarProps {
  onDateClick?: (date: string) => void;
  tasks?: RefreshTask[];
}

function getCellTextColor(value: number, max: number): string {
  if (value === 0) return "text-gray-700";
  const ratio = value / Math.max(max, 1);
  if (ratio < 0.25) return "text-gray-600";
  return "text-white";
}

export function MonthCalendar({ onDateClick, tasks }: MonthCalendarProps) {
  // Only fetch data if tasks prop not provided (we still need calendar metadata)
  const { data, isLoading } = useRefreshData({ enabled: !tasks });

  // Show loading state only when self-fetching
  if (!tasks && isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data?.calendar) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500">
        No calendar data available
      </div>
    );
  }

  const { calendar } = data;
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Use provided tasks or fall back to fetched data
  const sourceTasks = tasks ?? data?.tasks.details;

  if (!sourceTasks) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500">
        No task data available
      </div>
    );
  }
  const byDate: Record<string, number> = {};
  for (let day = 1; day <= calendar.daysInMonth; day++) {
    const dateKey = `${calendar.year}-${String(calendar.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    byDate[dateKey] = sourceTasks.reduce((sum, task) => {
      if (!taskRunsOnDate(task, dateKey)) {
        return sum;
      }
      return sum + task.runHours.length;
    }, 0);
  }

  // Calculate max value for color scaling
  const maxValue = Math.max(0, ...Object.values(byDate));
  // Use a slightly expanded max for month view so color saturation
  // does not overwhelm visual variance across days.
  const monthScaleMax = Math.max(1, maxValue * 1.35);
  const totalDayCells = calendar.firstWeekday + calendar.daysInMonth;
  const trailingEmptyCells = (7 - (totalDayCells % 7)) % 7;

  const handleDayClick = (date: string) => {
    onDateClick?.(date);
  };

  return (
    <div className="h-full grid grid-rows-[auto_1fr_auto] gap-2">
      {/* Month/Year Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {calendar.monthName} {calendar.year}
        </h3>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 auto-rows-fr gap-1 min-h-0">
        {/* Weekday headers */}
        {weekdayLabels.map((day) => (
          <div
            key={day}
            className="text-center text-[10px] sm:text-xs font-semibold text-gray-700 flex items-end justify-center pb-0.5"
          >
            {day}
          </div>
        ))}

        {/* Empty cells before first day */}
        {Array.from({ length: calendar.firstWeekday }, (_, i) => (
          <div key={`empty-${i}`} className="min-h-0 rounded-md bg-transparent" />
        ))}

        {/* Day cells */}
        {Array.from({ length: calendar.daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateKey = `${calendar.year}-${String(calendar.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const count = byDate[dateKey] || 0;
          const colorClass = getHeatmapColorClass(count, monthScaleMax);
          const textColorClass = getCellTextColor(count, monthScaleMax);

          return (
            <button
              key={day}
              onClick={() => handleDayClick(dateKey)}
              className={cn(
                "min-h-0 rounded-md transition-all hover:ring-2 hover:ring-blue-400 cursor-pointer flex flex-col items-center justify-center gap-0.5 p-1",
                colorClass
              )}
              title={`${calendar.monthName} ${day}: ${count} tasks`}
            >
              <span className={cn("text-[10px] sm:text-xs font-semibold leading-none", textColorClass)}>
                {day}
              </span>
              {count > 0 && (
                <span className={cn("text-[9px] sm:text-[10px] font-medium opacity-90 leading-none", textColorClass)}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Empty cells after last day to complete final week row */}
        {Array.from({ length: trailingEmptyCells }, (_, i) => (
          <div key={`tail-empty-${i}`} className="min-h-0 rounded-md bg-transparent" />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 pt-2 border-t">
        <span className="mr-1">Task count:</span>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gray-100 border" />
          <span>None</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-100" />
          <span>Low</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-300" />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span>High</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-700" />
          <span>Critical</span>
        </div>
      </div>
    </div>
  );
}
