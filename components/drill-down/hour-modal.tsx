"use client";

import { useMemo } from "react";
import { RefreshTask } from "@/lib/types";
import { TaskRow } from "./task-row";
import { formatHour } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface HourModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hour: number;
  dayOfWeek?: number;
  date?: string;
  tasks: RefreshTask[];
  onAddToPlan?: (task: RefreshTask) => void;
  isInPlan?: (taskId: string) => boolean;
}

function groupByProject(items: RefreshTask[]): Map<string, RefreshTask[]> {
  const map = new Map<string, RefreshTask[]>();
  for (const task of items) {
    const key = task.projectName || "Ungrouped";
    const arr = map.get(key) ?? [];
    arr.push(task);
    map.set(key, arr);
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function HourModal({
  open,
  onOpenChange,
  hour,
  dayOfWeek,
  date,
  tasks,
  onAddToPlan,
  isInPlan,
}: HourModalProps) {
  // Build context description for the modal title
  const getContextLabel = () => {
    if (date) {
      // Month/calendar click - format as readable date
      const dateObj = new Date(date + "T00:00:00");
      const formatted = dateObj.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      return `${formatted} at ${formatHour(hour)}`;
    }

    if (dayOfWeek !== undefined) {
      // Week heatmap click
      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      return `${dayNames[dayOfWeek]} at ${formatHour(hour)}`;
    }

    // Default: just hour
    return formatHour(hour);
  };

  const groupedSections = useMemo(() => {
    const dailyTasks = tasks.filter((t) => !t.isHourly);
    const hourlyTasks = tasks.filter((t) => t.isHourly);

    return [
      { label: "Daily / Weekly / Monthly", tasks: groupByProject(dailyTasks), count: dailyTasks.length },
      { label: "Hourly", tasks: groupByProject(hourlyTasks), count: hourlyTasks.length },
    ].filter((section) => section.count > 0);
  }, [tasks]);

  const showSectionHeaders = groupedSections.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Tasks at {getContextLabel()}</DialogTitle>
          <DialogDescription>
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"} scheduled
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable task list */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {tasks.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No tasks scheduled at this time
            </div>
          ) : (
            <div className="space-y-4">
              {groupedSections.map((section) => (
                <div key={section.label}>
                  {/* Frequency section header */}
                  {showSectionHeaders && (
                    <div className="flex items-center gap-2 py-1.5 mb-1">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {section.label}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {section.count}
                      </Badge>
                    </div>
                  )}

                  {/* Project groups within section */}
                  {Array.from(section.tasks.entries()).map(([projectName, projectTasks]) => (
                    <div key={projectName} className="mb-2">
                      {/* Folder header */}
                      <div className="flex items-center gap-1.5 px-1 py-1 text-xs text-gray-500">
                        <FolderOpen className="size-3.5" />
                        <span className="font-medium">{projectName}</span>
                        <span className="text-gray-400">({projectTasks.length})</span>
                      </div>
                      {/* Tasks in this folder */}
                      <div className="divide-y">
                        {projectTasks.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            onAddToPlan={onAddToPlan}
                            isInPlan={isInPlan}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
