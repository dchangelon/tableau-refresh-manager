"use client";

import { useRefreshData } from "@/hooks/use-refresh-data";
import { formatHour } from "@/lib/utils";
import { CHART_COLORS, getHeatmapBlueHex } from "@/lib/constants";
import type { RefreshTask } from "@/lib/types";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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
      <div className="h-80 space-y-3 animate-pulse p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-10 h-3 bg-gray-200 rounded" />
            <div
              className="h-3 bg-gray-200 rounded"
              style={{ width: `${30 + Math.random() * 50}%` }}
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
      <div className="h-80 flex items-center justify-center text-gray-500">
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
      Fixed: fixedCount,
      Moveable: moveableCount,
      total: totalCount,
    };
  });
  const maxTotal = Math.max(...chartData.map((d) => d.total), 1);

  const handleBarClick = (data: { payload?: { hour?: number } }) => {
    const hour = data?.payload?.hour;
    if (hour !== undefined) {
      onHourClick?.(hour);
    }
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
        />
        <YAxis
          dataKey="hourLabel"
          type="category"
          tick={{ fontSize: 10 }}
          width={52}
          interval={1}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;
            const data = payload[0].payload;
            return (
              <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                <p className="font-semibold mb-2">{data.hourLabel}</p>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: CHART_COLORS.fixed }}
                    />
                    <span>Fixed (Hourly): {data.Fixed}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: CHART_COLORS.moveable }}
                    />
                    <span>Moveable: {data.Moveable}</span>
                  </div>
                  <div className="border-t pt-1 mt-1">
                    <strong>Total: {data.total}</strong>
                  </div>
                </div>
              </div>
            );
          }}
        />
        <Legend
          wrapperStyle={{ paddingTop: "20px" }}
          iconType="rect"
          formatter={(value) => {
            if (value === "Fixed") return "Fixed (Hourly)";
            return value;
          }}
        />
        <Bar
          dataKey="Fixed"
          stackId="a"
          fill={CHART_COLORS.fixed}
          cursor="pointer"
          barSize={10}
          onClick={handleBarClick}
        />
        <Bar
          dataKey="Moveable"
          stackId="a"
          fill={CHART_COLORS.moveable}
          cursor="pointer"
          barSize={10}
          onClick={handleBarClick}
        >
          {chartData.map((entry) => (
            <Cell key={`moveable-${entry.hour}`} fill={getHeatmapBlueHex(entry.total, maxTotal)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
