import { RefreshTask } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatScheduleSummary } from "@/lib/utils";
import { Check, CheckCircle2, Plus } from "lucide-react";

interface TaskRowProps {
  task: RefreshTask;
  onAddToPlan?: (task: RefreshTask) => void;
  isInPlan?: (taskId: string) => boolean;
  compact?: boolean;
}

export function TaskRow({ task, onAddToPlan, isInPlan, compact = false }: TaskRowProps) {
  const inPlan = isInPlan?.(task.id) ?? false;
  const showAddButton = onAddToPlan !== undefined;

  const scheduleSummary = formatScheduleSummary(
    task.schedule.frequency,
    task.schedule.startTime,
    task.schedule.intervalHours,
    task.schedule.weekDays,
    task.schedule.endTime,
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2 py-2 border-b last:border-b-0">
        {/* Type badge */}
        <Badge
          variant={task.type === "workbook" ? "default" : "secondary"}
          className="text-xs shrink-0"
        >
          {task.type === "workbook" ? "WB" : "DS"}
        </Badge>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {task.itemUrl ? (
              <a
                href={task.itemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline truncate"
              >
                {task.itemName}
              </a>
            ) : (
              <span className="text-sm font-medium truncate">{task.itemName}</span>
            )}
            {task.consecutiveFailures > 0 && (
              <Badge variant="destructive" className="text-[10px] shrink-0 py-0">
                {task.consecutiveFailures}x
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {task.projectName}
            <span className="text-gray-300 mx-1">&middot;</span>
            {scheduleSummary}
          </div>
        </div>

        {/* Add button */}
        {showAddButton && (
          <Button
            size="sm"
            variant={inPlan ? "outline" : "default"}
            disabled={inPlan}
            onClick={() => onAddToPlan(task)}
            className="shrink-0 gap-1 h-7 text-xs px-2"
          >
            {inPlan ? (
              <>
                <Check className="size-3" />
                Added
              </>
            ) : (
              <>
                <Plus className="size-3" />
                Add
              </>
            )}
          </Button>
        )}
      </div>
    );
  }

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
          {scheduleSummary}
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
