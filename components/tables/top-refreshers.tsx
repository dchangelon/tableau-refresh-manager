"use client";

import { useMemo, useState } from "react";
import { useBatchStore } from "@/stores/batch-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RefreshTask } from "@/lib/types";
import { formatScheduleSummary } from "@/lib/utils";
import { BarChart3, Check, ChevronDown, ChevronUp, Plus } from "lucide-react";

interface TopRefreshersProps {
  tasks: RefreshTask[];
  isLoading: boolean;
  hasActiveFilters: boolean;
}

export function TopRefreshers({ tasks, isLoading, hasActiveFilters }: TopRefreshersProps) {
  const addItem = useBatchStore((s) => s.addItem);
  const isTaskInPlan = useBatchStore((s) => s.isTaskInPlan);
  const [expanded, setExpanded] = useState(false);

  // Sort filtered tasks by weekly slot count and keep top 20
  const topTasks = useMemo(() => {
    const withSlots = tasks.map((task) => {
      const slotsPerWeek = task.runHours.length * task.taskDays;
      return { ...task, slotsPerWeek };
    });

    return withSlots.sort((a, b) => b.slotsPerWeek - a.slotsPerWeek).slice(0, 20);
  }, [tasks]);

  const visibleTasks = expanded ? topTasks : topTasks.slice(0, 5);
  const hasMore = topTasks.length > 5;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-gray-200 border-l-[3px] border-l-gray-200 bg-white px-3 py-2.5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-5 w-8 rounded-full bg-gray-200" />
                <div className="h-4 w-40 rounded bg-gray-200" />
              </div>
              <div className="h-5 w-20 rounded-full bg-gray-200" />
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <div className="h-3 w-24 rounded bg-gray-100" />
              <div className="h-3 w-32 rounded bg-gray-100" />
            </div>
            <div className="mt-1.5 flex items-center justify-end">
              <div className="h-6 w-16 rounded-md bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (topTasks.length === 0) {
    return (
      <div className="text-center py-16 bg-gradient-to-b from-gray-50 to-white rounded-lg border border-gray-100">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <BarChart3 className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-gray-600 font-medium">
          {hasActiveFilters ? "No tasks match your filters" : "No tasks available"}
        </p>
        <p className="text-gray-500 text-sm mt-2 max-w-xs mx-auto">
          {hasActiveFilters
            ? "Try adjusting your filter criteria"
            : "Refresh data will appear here once loaded"}
        </p>
      </div>
    );
  }

  const handleAddToPlan = addItem;
  const isInPlan = isTaskInPlan;

  return (
    <div className="space-y-2">
      {visibleTasks.map((task) => (
        <div
          key={task.id}
          className={`rounded-lg border border-gray-200 border-l-[3px] bg-white px-3 py-2.5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-blue-300 ${
            task.type === "workbook" ? "border-l-blue-500" : "border-l-gray-400"
          }`}
        >
          {/* Row 1: Type badge + name (linked) + slots/week pill */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Badge
                variant={task.type === "workbook" ? "default" : "secondary"}
                className="text-xs shrink-0"
              >
                {task.type === "workbook" ? "WB" : "DS"}
              </Badge>
              {task.itemUrl ? (
                <a
                  href={task.itemUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold leading-snug text-blue-600 hover:underline truncate"
                >
                  {task.itemName}
                </a>
              ) : (
                <span className="text-sm font-semibold leading-snug text-gray-900 truncate">
                  {task.itemName}
                </span>
              )}
            </div>
            <span className="shrink-0 inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[11px] font-medium tabular-nums">
              {task.slotsPerWeek} slots/wk
            </span>
          </div>

          {/* Row 2: Project name + schedule summary */}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
            <span className="truncate">{task.projectName}</span>
            <span className="text-gray-300">&middot;</span>
            <span className="truncate">
              {formatScheduleSummary(
                task.schedule.frequency,
                task.schedule.startTime,
                task.schedule.intervalHours,
                task.schedule.weekDays,
                task.schedule.endTime,
              )}
            </span>
            {task.isHourly && task.hourlyWindow && (
              <>
                <span className="text-gray-300">&middot;</span>
                <span className="shrink-0">{task.hourlyWindow}</span>
              </>
            )}
          </div>

          {/* Row 3: Failure badge (if any) + Add to Plan button */}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div>
              {task.consecutiveFailures > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {task.consecutiveFailures} {task.consecutiveFailures === 1 ? "failure" : "failures"}
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              variant={isInPlan(task.id) ? "outline" : "default"}
              onClick={() => handleAddToPlan(task)}
              disabled={isInPlan(task.id)}
              className="gap-1"
            >
              {isInPlan(task.id) ? (
                <>
                  <Check className="size-3.5" />
                  In Plan
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  Add
                </>
              )}
            </Button>
          </div>
        </div>
      ))}

      {/* Expand/collapse toggle */}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-gray-600 hover:text-gray-900"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="mr-1 h-4 w-4" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 h-4 w-4" />
              Show all {topTasks.length}
            </>
          )}
        </Button>
      )}
    </div>
  );
}
