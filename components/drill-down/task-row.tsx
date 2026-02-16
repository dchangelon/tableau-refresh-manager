import { RefreshTask } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatScheduleSummary } from "@/lib/utils";
import { CheckCircle2, Plus } from "lucide-react";

interface TaskRowProps {
  task: RefreshTask;
  onAddToPlan?: (task: RefreshTask) => void;
  isInPlan?: (taskId: string) => boolean;
}

export function TaskRow({ task, onAddToPlan, isInPlan }: TaskRowProps) {
  const inPlan = isInPlan?.(task.id) ?? false;
  const showAddButton = onAddToPlan !== undefined;

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
      {/* Type badge */}
      <Badge
        variant={task.type === "workbook" ? "default" : "secondary"}
        className="mt-0.5"
      >
        {task.type === "workbook" ? "WB" : "DS"}
      </Badge>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Name (linked if URL available) */}
        {task.itemUrl ? (
          <a
            href={task.itemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sm text-primary hover:underline"
          >
            {task.itemName}
          </a>
        ) : (
          <div className="font-medium text-sm">{task.itemName}</div>
        )}

        {/* Project */}
        <div className="text-xs text-muted-foreground mt-0.5">
          {task.projectName}
        </div>

        {/* Schedule summary */}
        <div className="text-xs text-muted-foreground mt-1">
          {formatScheduleSummary(
            task.schedule.frequency,
            task.schedule.startTime,
            task.schedule.intervalHours,
            task.schedule.weekDays
          )}
          {task.hourlyWindow && (
            <span className="ml-1">({task.hourlyWindow})</span>
          )}
        </div>

        {/* Failure badge if applicable */}
        {task.consecutiveFailures > 0 && (
          <Badge variant="destructive" className="mt-2">
            {task.consecutiveFailures} consecutive{" "}
            {task.consecutiveFailures === 1 ? "failure" : "failures"}
          </Badge>
        )}
      </div>

      {/* Add to Plan button (optional) */}
      {showAddButton && (
        <Button
          size="sm"
          variant={inPlan ? "outline" : "default"}
          disabled={inPlan}
          onClick={() => onAddToPlan(task)}
          className="shrink-0"
        >
          {inPlan ? (
            <>
              <CheckCircle2 className="size-4" />
              In Plan
            </>
          ) : (
            <>
              <Plus className="size-4" />
              Add to Plan
            </>
          )}
        </Button>
      )}
    </div>
  );
}
