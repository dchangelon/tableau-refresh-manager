"use client";

import { useMemo, useState } from "react";
import { useBatchStore } from "@/stores/batch-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RefreshTask } from "@/lib/types";
import { formatScheduleSummary } from "@/lib/utils";

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
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="animate-pulse flex items-center gap-4 p-4 bg-gray-50 rounded">
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/4" />
            </div>
            <div className="h-8 bg-gray-200 rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (topTasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {hasActiveFilters ? "No tasks match your filters" : "No tasks available"}
      </div>
    );
  }

  const handleAddToPlan = addItem;
  const isInPlan = isTaskInPlan;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-gray-200">
          <tr className="text-left text-sm font-semibold text-gray-700">
            <th className="pb-3 pr-4">Name</th>
            <th className="pb-3 pr-4">Project</th>
            <th className="pb-3 pr-4 text-center">Slots/Week</th>
            <th className="pb-3 pr-4">Schedule</th>
            <th className="pb-3 pr-4 text-center">Failures</th>
            <th className="pb-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visibleTasks.map((task) => (
            <tr
              key={task.id}
              className="text-sm hover:bg-gray-50 transition-colors"
            >
              {/* Name */}
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={task.type === "workbook" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {task.type === "workbook" ? "WB" : "DS"}
                  </Badge>
                  {task.itemUrl ? (
                    <a
                      href={task.itemUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {task.itemName}
                    </a>
                  ) : (
                    <span className="font-medium text-gray-900">
                      {task.itemName}
                    </span>
                  )}
                </div>
              </td>

              {/* Project */}
              <td className="py-3 pr-4 text-gray-600">{task.projectName}</td>

              {/* Slots/Week */}
              <td className="py-3 pr-4 text-center">
                <span className="font-semibold text-gray-900">
                  {task.slotsPerWeek}
                </span>
              </td>

              {/* Schedule */}
              <td className="py-3 pr-4">
                <div className="text-gray-700">
                  {formatScheduleSummary(
                    task.schedule.frequency,
                    task.schedule.startTime,
                    task.schedule.intervalHours,
                    task.schedule.weekDays,
                    task.schedule.endTime,
                  )}
                </div>
                {task.isHourly && task.hourlyWindow && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {task.hourlyWindow}
                  </div>
                )}
              </td>

              {/* Failures */}
              <td className="py-3 pr-4 text-center">
                {task.consecutiveFailures > 0 ? (
                  <Badge variant="destructive">
                    {task.consecutiveFailures}
                  </Badge>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>

              {/* Actions */}
              <td className="py-3 text-right">
                <Button
                  size="sm"
                  variant={isInPlan(task.id) ? "outline" : "default"}
                  onClick={() => handleAddToPlan(task)}
                  disabled={isInPlan(task.id)}
                  className="gap-1"
                >
                  {isInPlan(task.id) ? (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      In Plan
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Add to Plan
                    </>
                  )}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasMore && (
        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-gray-600 hover:text-gray-900"
          >
            {expanded ? "Show less" : `Show all ${topTasks.length}`}
          </Button>
        </div>
      )}
    </div>
  );
}
