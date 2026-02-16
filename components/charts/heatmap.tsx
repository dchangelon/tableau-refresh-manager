"use client";

import { useState } from "react";
import { useRefreshData } from "@/hooks/use-refresh-data";
import { formatHour } from "@/lib/utils";
import { HEATMAP_DAY_LABELS, getHeatmapColorClass } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MonthCalendar } from "@/components/charts/month-calendar";
import type { RefreshTask } from "@/lib/types";

interface HeatmapProps {
  onCellClick?: (hour: number, dayOfWeek?: number, date?: string) => void;
  onDateClick?: (date: string) => void;
  tasks?: RefreshTask[];
}

function getCellTextColor(value: number, max: number): string {
  if (value === 0) return "";
  const ratio = value / Math.max(max, 1);
  if (ratio < 0.25) return "text-gray-600";
  return "text-white";
}

const DAY_NAME_TO_INDEX: Record<string, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

export function Heatmap({ onCellClick, onDateClick, tasks }: HeatmapProps) {
  // Only fetch data if tasks prop not provided
  const { data, isLoading } = useRefreshData({ enabled: !tasks });
  const [viewMode, setViewMode] = useState<"week" | "month">("week");

  // Show loading state only when self-fetching
  if (!tasks && isLoading) {
    return (
      <div className="h-80 space-y-3 animate-pulse p-4">
        <div className="flex gap-2 mb-4">
          <div className="h-8 w-24 bg-gray-200 rounded" />
          <div className="h-8 w-24 bg-gray-200 rounded" />
        </div>
        {Array.from({ length: 7 }, (_, row) => (
          <div key={row} className="flex items-center gap-1">
            <div className="w-10 h-3 bg-gray-200 rounded" />
            <div className="flex-1 grid grid-cols-12 gap-1">
              {Array.from({ length: 12 }, (_, col) => (
                <div key={col} className="aspect-square bg-gray-200 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const handleCellClick = (hour: number, dayOfWeek?: number, date?: string) => {
    onCellClick?.(hour, dayOfWeek, date);
  };

  // Use provided tasks or fall back to fetched data
  const sourceTasks = tasks ?? data?.tasks.details;

  if (!sourceTasks) {
    return (
      <div className="h-80 flex items-center justify-center text-gray-500">
        No data available
      </div>
    );
  }
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

  for (const task of sourceTasks) {
    const dayIndices =
      task.schedule.weekDays.length > 0
        ? task.schedule.weekDays
            .map((day) => DAY_NAME_TO_INDEX[day])
            .filter((day): day is number => day !== undefined)
        : [0, 1, 2, 3, 4, 5, 6];

    for (const dayIdx of dayIndices) {
      for (const hour of task.runHours) {
        if (hour >= 0 && hour <= 23) {
          grid[dayIdx][hour] += 1;
        }
      }
    }
  }

  const maxValue = Math.max(0, ...grid.flat());

  // Toggle buttons (shared between both views)
  const toggleButtons = (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant={viewMode === "week" ? "default" : "outline"}
        onClick={() => setViewMode("week")}
      >
        Week View
      </Button>
      <Button
        size="sm"
        variant={viewMode === "month" ? "default" : "outline"}
        onClick={() => setViewMode("month")}
      >
        Month View
      </Button>
    </div>
  );

  return (
    <div className="space-y-3">
      {toggleButtons}

      {/* Fixed-height content area — consistent across views */}
      <div className="h-[380px] overflow-hidden">
        {viewMode === "week" ? (
          <div className="h-full grid grid-rows-[1fr_auto] gap-2">
            {/* Week Heatmap (7 days x 24 hours) */}
            <div className="overflow-x-auto min-h-0">
              <div className="inline-block min-w-full">
                {/* Header row with hour labels */}
                <div className="flex">
                  <div className="w-12 flex-shrink-0" /> {/* Empty corner */}
                  <div className="flex-1 grid grid-cols-24 gap-1">
                    {Array.from({ length: 24 }, (_, hour) => (
                      <div
                        key={hour}
                        className="text-xs text-center text-gray-600 pb-1"
                        style={{ fontSize: "10px" }}
                      >
                        {hour}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Heatmap grid */}
                <div className="space-y-1">
                  {HEATMAP_DAY_LABELS.map((dayLabel, dayIndex) => (
                    <div key={dayLabel} className="flex gap-1">
                      {/* Day label */}
                      <div className="w-12 flex-shrink-0 text-xs font-semibold text-gray-700 flex items-center">
                        {dayLabel}
                      </div>

                      {/* Hour cells */}
                      <div className="flex-1 grid grid-cols-24 gap-1">
                        {Array.from({ length: 24 }, (_, hour) => {
                          const value = grid[dayIndex][hour] ?? 0;
                          const colorClass = getHeatmapColorClass(value, maxValue);

                          return (
                            <button
                              key={hour}
                              onClick={() => handleCellClick(hour, dayIndex)}
                              className={cn(
                                "aspect-square rounded transition-all hover:ring-2 hover:ring-blue-400 hover:scale-105 cursor-pointer flex items-center justify-center",
                                colorClass
                              )}
                              title={`${dayLabel} ${formatHour(hour)}: ${value} tasks`}
                            >
                              {value > 0 && (
                                <span className={cn("text-[10px] font-medium leading-none", getCellTextColor(value, maxValue))}>
                                  {value}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 pt-2 border-t">
              <span className="mr-1">Load:</span>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-gray-100 border" />
                <span>Empty</span>
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
        ) : (
          <MonthCalendar tasks={sourceTasks} onDateClick={onDateClick} />
        )}
      </div>
    </div>
  );
}
