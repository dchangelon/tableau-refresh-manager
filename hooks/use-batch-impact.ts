import { useMemo } from "react";
import { useBatchStore } from "@/stores/batch-store";
import { useRefreshData } from "@/hooks/use-refresh-data";
import { getHealthColor } from "@/lib/constants";
import { formatHour } from "@/lib/utils";
import type { ImpactPreview, HealthMetrics, ScheduleConfig } from "@/lib/types";

function computeTaskDays(schedule: ScheduleConfig): number {
  if (schedule.frequency === "Weekly") {
    return schedule.weekDays.length || 7;
  }
  if (schedule.frequency === "Monthly") {
    // Approximation: Monthly tasks run ~4 times per month, not an exact calendar
    // computation. Accurate per-date counts come from computeMonthlyCalendar().
    return 4;
  }
  // Hourly or Daily
  return schedule.weekDays.length || 7;
}

function computeHealthMetrics(dist: Record<number, number>): HealthMetrics {
  // Ensure all 24 hours represented
  const counts: number[] = [];
  for (let h = 0; h < 24; h++) {
    counts.push(dist[h] || 0);
  }

  const total = counts.reduce((sum, c) => sum + c, 0);

  if (total === 0) {
    return {
      loadBalanceScore: { value: 100, health: "green" },
      busiestWindow: { label: "N/A", count: 0, pct: 0, health: "green" },
      utilization: { value: 0, health: "green" },
      peakAvgRatio: { value: 0, health: "green" },
    };
  }

  const mean = total / 24;
  const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / 24;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  const score = Math.max(0, Math.round(100 / (1 + cv)));

  // Busiest 3-hour window
  let bestStart = 0;
  let bestSum = 0;
  for (let start = 0; start < 24; start++) {
    const windowSum = [0, 1, 2].reduce((sum, i) => sum + (dist[(start + i) % 24] || 0), 0);
    if (windowSum > bestSum) {
      bestSum = windowSum;
      bestStart = start;
    }
  }
  const endHour = (bestStart + 3) % 24;
  const windowLabel = `${formatHour(bestStart)}-${formatHour(endHour)}`;
  const windowPct = total > 0 ? (bestSum / total) * 100 : 0;

  const activeHours = counts.filter((c) => c > 0).length;
  const utilization = Math.round((activeHours / 24) * 100);

  const maxCount = Math.max(...counts);
  const ratio = mean > 0 ? parseFloat((maxCount / mean).toFixed(1)) : 0;

  return {
    loadBalanceScore: {
      value: score,
      health: getHealthColor("loadBalanceScore", score),
    },
    busiestWindow: {
      label: windowLabel,
      count: bestSum,
      pct: parseFloat(windowPct.toFixed(1)),
      health: getHealthColor("busyWindowPct", windowPct),
    },
    utilization: {
      value: utilization,
      health: getHealthColor("utilization", utilization),
    },
    peakAvgRatio: {
      value: ratio,
      health: getHealthColor("peakAvgRatio", ratio),
    },
  };
}

export function useBatchImpact(): ImpactPreview | null {
  const items = useBatchStore((state) => state.items);
  const { data } = useRefreshData();

  return useMemo(() => {
    if (items.length === 0 || !data) return null;

    // Copy current distribution
    const currentDist: Record<number, number> = { ...data.hourly.byHour };
    const proposedDist: Record<number, number> = { ...data.hourly.byHour };

    for (const item of items) {
      // Subtract current run hours
      for (const hour of item.runHours) {
        proposedDist[hour] = (proposedDist[hour] || 0) - item.taskDays;
        if (proposedDist[hour] < 0) proposedDist[hour] = 0;
      }

      // Add new run hours
      const newTaskDays = computeTaskDays(item.newSchedule);
      for (const hour of item.newRunHours) {
        proposedDist[hour] = (proposedDist[hour] || 0) + newTaskDays;
      }
    }

    const currentMetrics = computeHealthMetrics(currentDist);
    const proposedMetrics = computeHealthMetrics(proposedDist);

    return {
      currentDist,
      proposedDist,
      currentMetrics,
      proposedMetrics,
      deltas: {
        loadBalanceScore:
          proposedMetrics.loadBalanceScore.value - currentMetrics.loadBalanceScore.value,
        peakAvgRatio:
          proposedMetrics.peakAvgRatio.value - currentMetrics.peakAvgRatio.value,
        busyWindowPct:
          proposedMetrics.busiestWindow.pct - currentMetrics.busiestWindow.pct,
      },
    };
  }, [items, data]);
}
