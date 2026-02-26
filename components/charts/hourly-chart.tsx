"use client";

import { useRefreshData } from "@/hooks/use-refresh-data";
import { formatHour } from "@/lib/utils";
import { CHART_COLORS, getHeatmapBlueHex } from "@/lib/constants";
import type { RefreshTask } from "@/lib/types";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface HourlyChartProps {
  onHourClick?: (hour: number) => void;
  tasks?: RefreshTask[];
  height?: number;
}

export function HourlyChart({ onHourClick, tasks, height = 360 }: HourlyChartProps) {
  // Only fetch data if tasks prop not provided
  const { data, isLoading } = useRefreshData({ enabled: !tasks });

  // Show loading state only when self-fetching
  if (!tasks && isLoading) {
    return (
      <div className="space-y-1 animate-pulse" style={{ height }}>
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-11 h-3 bg-gray-200 rounded" />
            <div
              className="h-3 bg-gray-200 rounded"
              style={{ width: `${10 + Math.random() * 60}%` }}
            />
          </div>
        ))}
      </div>
    );
  }

  // Use provided tasks or fall back to fetched data
  const sourceTasks = tasks ?? data?.tasks.details;

  if (!sourceTasks) {
    return (
      <div className="flex items-center justify-center text-gray-500" style={{ height }}>
        No data available
      </div>
    );
  }

  const byHour: Record<number, number> = {};
  const hourlyFixedByHour: Record<number, number> = {};
  for (let hour = 0; hour < 24; hour++) {
    byHour[hour] = 0;
    hourlyFixedByHour[hour] = 0;
  }

  for (const task of sourceTasks) {
    for (const hour of task.runHours) {
      byHour[hour] += 1;
      if (task.isHourly) {
        hourlyFixedByHour[hour] += 1;
      }
    }
  }

  // Prepare chart data
  const chartData = Array.from({ length: 24 }, (_, hour) => {
    const totalCount = byHour[hour] || 0;
    const fixedCount = hourlyFixedByHour[hour] || 0;
    const moveableCount = totalCount - fixedCount;

    return {
      hour,
      hourLabel: formatHour(hour),
      fixed: fixedCount,
      moveable: moveableCount,
      total: totalCount,
    };
  });
  const maxTotal = Math.max(...chartData.map((d) => d.total), 1);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex flex-col" style={{ height }}>
        {/* Bar rows — grid ensures all 24 rows share the available height equally */}
        <div className="flex-1 grid grid-rows-[repeat(24,1fr)] min-h-0 overflow-hidden">
          {chartData.map((entry) => {
            const moveableColor = getHeatmapBlueHex(entry.total, maxTotal);

            return (
              <Tooltip key={entry.hour}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onHourClick?.(entry.hour)}
                    className="flex items-center gap-2 px-1 min-h-0 rounded hover:bg-gray-50 transition-colors cursor-pointer group"
                  >
                    {/* Hour label */}
                    <span className="w-11 text-right text-[11px] text-gray-500 tabular-nums shrink-0">
                      {entry.hourLabel}
                    </span>

                    {/* Bar + count together, width proportional to total */}
                    <div className="flex-1 flex items-center gap-1.5 min-w-0">
                      <div
                        className="h-3 rounded overflow-hidden flex shrink-0"
                        style={{ width: `${(entry.total / maxTotal) * 100}%` }}
                      >
                        {entry.fixed > 0 && (
                          <div
                            className="h-full"
                            style={{
                              width: `${(entry.fixed / entry.total) * 100}%`,
                              backgroundColor: CHART_COLORS.fixed,
                            }}
                          />
                        )}
                        {entry.moveable > 0 && (
                          <div
                            className="h-full"
                            style={{
                              width: `${(entry.moveable / entry.total) * 100}%`,
                              backgroundColor: moveableColor,
                            }}
                          />
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-gray-600 tabular-nums shrink-0 group-hover:text-gray-900">
                        {entry.total || ""}
                      </span>
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={8}
                  className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-gray-900"
                >
                  <p className="font-semibold mb-2">{entry.hourLabel}</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: CHART_COLORS.fixed }}
                      />
                      <span>Fixed (Hourly): {entry.fixed}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: CHART_COLORS.moveable }}
                      />
                      <span>Moveable: {entry.moveable}</span>
                    </div>
                    <div className="border-t pt-1 mt-1">
                      <strong>Total: {entry.total}</strong>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-gray-600 pt-2 mt-2 border-t shrink-0">
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: CHART_COLORS.fixed }}
            />
            <span>Fixed (Hourly)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: CHART_COLORS.moveable }}
            />
            <span>Moveable</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
