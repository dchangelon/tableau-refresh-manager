"use client";

import { useRefreshData } from "@/hooks/use-refresh-data";
import { cn, formatHour } from "@/lib/utils";
import { getHealthColor } from "@/lib/constants";
import type { RefreshTask } from "@/lib/types";

function HealthCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-3 bg-gray-200 rounded w-1/3" />
    </div>
  );
}

interface HealthCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  health: "green" | "yellow" | "red";
}

function HealthCard({ title, value, subtitle, health }: HealthCardProps) {
  const healthColors = {
    green: "bg-green-50 border-green-200",
    yellow: "bg-yellow-50 border-yellow-200",
    red: "bg-red-50 border-red-200",
  };

  const healthDots = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
  };

  return (
    <div
      className={cn(
        "rounded-lg shadow-md p-6 border-2 transition-colors",
        healthColors[health]
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-2 h-2 rounded-full", healthDots[health])} />
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
      </div>
      <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
      {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
    </div>
  );
}

interface HealthCardsProps {
  tasks?: RefreshTask[];
}

function computeHealthFromTasks(tasks: RefreshTask[]) {
  const hourlyCounts = Array.from({ length: 24 }, () => 0);
  for (const task of tasks) {
    for (const hour of task.runHours) {
      if (hour >= 0 && hour <= 23) {
        hourlyCounts[hour] += 1;
      }
    }
  }

  const total = hourlyCounts.reduce((sum, c) => sum + c, 0);
  if (total === 0) {
    return {
      loadBalanceScore: { value: 100, health: "green" as const },
      busiestWindow: { label: "N/A", count: 0, pct: 0, health: "green" as const },
      utilization: { value: 0, health: "green" as const },
      peakAvgRatio: { value: 0, health: "green" as const },
    };
  }

  const mean = total / 24;
  const variance = hourlyCounts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / 24;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  const score = Math.max(0, Math.round(100 / (1 + cv)));
  const scoreHealth = getHealthColor("loadBalanceScore", score);

  let bestStart = 0;
  let bestSum = 0;
  for (let start = 0; start < 24; start++) {
    const windowSum = [0, 1, 2].reduce(
      (sum, i) => sum + (hourlyCounts[(start + i) % 24] || 0),
      0,
    );
    if (windowSum > bestSum) {
      bestSum = windowSum;
      bestStart = start;
    }
  }

  const endHour = (bestStart + 3) % 24;
  const windowLabel = `${formatHour(bestStart)}-${formatHour(endHour)}`;
  const windowPct = total > 0 ? (bestSum / total) * 100 : 0;
  const windowHealth = getHealthColor("busyWindowPct", windowPct);

  const activeHours = hourlyCounts.filter((c) => c > 0).length;
  const utilization = Math.round((activeHours / 24) * 100);
  const utilHealth = getHealthColor("utilization", utilization);

  const maxCount = Math.max(...hourlyCounts);
  const ratio = mean > 0 ? parseFloat((maxCount / mean).toFixed(1)) : 0;
  const ratioHealth = getHealthColor("peakAvgRatio", ratio);

  return {
    loadBalanceScore: { value: score, health: scoreHealth },
    busiestWindow: {
      label: windowLabel,
      count: bestSum,
      pct: parseFloat(windowPct.toFixed(1)),
      health: windowHealth,
    },
    utilization: { value: utilization, health: utilHealth },
    peakAvgRatio: { value: ratio, health: ratioHealth },
  };
}

export function HealthCards({ tasks }: HealthCardsProps) {
  const { data, isLoading } = useRefreshData();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <HealthCardSkeleton />
        <HealthCardSkeleton />
        <HealthCardSkeleton />
        <HealthCardSkeleton />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const enhancedStats =
    tasks !== undefined ? computeHealthFromTasks(tasks) : data.enhancedStats;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <HealthCard
        title="Load Balance Score"
        value={enhancedStats.loadBalanceScore.value}
        subtitle="Higher is better"
        health={enhancedStats.loadBalanceScore.health}
      />

      <HealthCard
        title="Peak/Avg Ratio"
        value={enhancedStats.peakAvgRatio.value.toFixed(1)}
        subtitle="Lower is better"
        health={enhancedStats.peakAvgRatio.health}
      />

      <HealthCard
        title="Utilization"
        value={`${enhancedStats.utilization.value}%`}
        subtitle="Capacity usage"
        health={enhancedStats.utilization.health}
      />

      <HealthCard
        title="Busiest Window"
        value={enhancedStats.busiestWindow.count}
        subtitle={`${enhancedStats.busiestWindow.label} (${enhancedStats.busiestWindow.pct}%)`}
        health={enhancedStats.busiestWindow.health}
      />
    </div>
  );
}
