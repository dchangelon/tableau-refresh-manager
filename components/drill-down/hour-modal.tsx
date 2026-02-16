"use client";

import { RefreshTask } from "@/lib/types";
import { TaskRow } from "./task-row";
import { formatHour } from "@/lib/utils";
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
            <div className="divide-y">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onAddToPlan={onAddToPlan}
                  isInPlan={isInPlan}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
