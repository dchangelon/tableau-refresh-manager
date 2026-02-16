"use client";

import { useBatchImpact } from "@/hooks/use-batch-impact";
import { CHART_COLORS } from "@/lib/constants";
import { formatHour } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function DeltaMetric({
  label,
  current,
  proposed,
  format,
  lowerIsBetter,
}: {
  label: string;
  current: number;
  proposed: number;
  format?: (v: number) => string;
  lowerIsBetter?: boolean;
}) {
  const delta = proposed - current;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const fmt = format ?? ((v: number) => v.toFixed(1));
  const sign = delta > 0 ? "+" : "";

  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-gray-600">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500">{fmt(current)}</span>
        <span className="text-gray-400">&rarr;</span>
        <span className="font-medium">{fmt(proposed)}</span>
        <span
          className={`text-xs font-medium ${
            delta === 0
              ? "text-gray-400"
              : improved
                ? "text-green-600"
                : "text-red-600"
          }`}
        >
          ({sign}{fmt(delta)})
        </span>
      </div>
    </div>
  );
}

export function PreviewImpact() {
  const impact = useBatchImpact();

  if (!impact) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Add items to see impact preview
      </div>
    );
  }

  // Build chart data for hours 0-23
  const chartData = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHour(hour),
    current: impact.currentDist[hour] ?? 0,
    proposed: impact.proposedDist[hour] ?? 0,
  }));

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Impact Preview</h3>

      {/* Grouped Bar Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={0} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="hour"
              tickFormatter={(h: number) => (h % 3 === 0 ? formatHour(h) : "")}
              tick={{ fontSize: 10 }}
              interval={0}
            />
            <YAxis tick={{ fontSize: 10 }} width={30} />
            <Tooltip
              labelFormatter={(h) => formatHour(Number(h))}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="current"
              name="Current"
              fill={CHART_COLORS.current}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="proposed"
              name="Proposed"
              fill={CHART_COLORS.proposed}
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Health Metric Deltas */}
      <div className="space-y-0.5 border-t pt-3">
        <DeltaMetric
          label="Load Balance"
          current={impact.currentMetrics.loadBalanceScore.value}
          proposed={impact.proposedMetrics.loadBalanceScore.value}
          format={(v) => Math.round(v).toString()}
          lowerIsBetter={false}
        />
        <DeltaMetric
          label="Peak:Avg Ratio"
          current={impact.currentMetrics.peakAvgRatio.value}
          proposed={impact.proposedMetrics.peakAvgRatio.value}
          lowerIsBetter={true}
        />
        <DeltaMetric
          label="Busy Window"
          current={impact.currentMetrics.busiestWindow.pct}
          proposed={impact.proposedMetrics.busiestWindow.pct}
          format={(v) => `${Math.round(v)}%`}
          lowerIsBetter={true}
        />
      </div>
    </div>
  );
}
