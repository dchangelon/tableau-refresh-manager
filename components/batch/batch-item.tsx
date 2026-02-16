"use client";

import { useState } from "react";
import type { BatchPlanItem, ScheduleConfig } from "@/lib/types";
import { formatScheduleSummary } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScheduleEditor } from "./schedule-editor";
import { Pencil, X, ArrowRight } from "lucide-react";

interface BatchItemProps {
  item: BatchPlanItem;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateSchedule: (id: string, schedule: ScheduleConfig) => void;
}

function scheduleChanged(a: ScheduleConfig, b: ScheduleConfig): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function BatchItem({ item, selected, onToggleSelect, onRemove, onUpdateSchedule }: BatchItemProps) {
  const [isEditing, setIsEditing] = useState(false);

  const hasChanged = scheduleChanged(item.currentSchedule, item.newSchedule);

  const currentSummary = formatScheduleSummary(
    item.currentSchedule.frequency,
    item.currentSchedule.startTime,
    item.currentSchedule.intervalHours,
    item.currentSchedule.weekDays,
  );

  const newSummary = formatScheduleSummary(
    item.newSchedule.frequency,
    item.newSchedule.startTime,
    item.newSchedule.intervalHours,
    item.newSchedule.weekDays,
  );

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        selected
          ? "border-blue-300 bg-blue-50/70 ring-1 ring-blue-200"
          : hasChanged
            ? "border-blue-200 bg-blue-50/50"
            : "border-gray-200 bg-white"
      }`}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(item.id)}
            className="shrink-0"
          />
          <Badge
            variant={item.itemType === "workbook" ? "default" : "secondary"}
            className="text-xs shrink-0"
          >
            {item.itemType === "workbook" ? "WB" : "DS"}
          </Badge>
          <span className="font-medium text-sm truncate">{item.taskName}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setIsEditing(!isEditing)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
            onClick={() => onRemove(item.id)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Schedule Diff */}
      <div className="mt-1.5 text-xs text-gray-600 flex items-center gap-1.5 flex-wrap">
        <span className={hasChanged ? "line-through text-gray-400" : ""}>
          {currentSummary}
        </span>
        {hasChanged && (
          <>
            <ArrowRight className="size-3 text-blue-500 shrink-0" />
            <span className="text-blue-700 font-medium">{newSummary}</span>
          </>
        )}
      </div>

      {/* Inline Editor */}
      {isEditing && (
        <div className="mt-3">
          <ScheduleEditor
            value={item.newSchedule}
            onChange={(schedule) => {
              onUpdateSchedule(item.id, schedule);
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      )}
    </div>
  );
}
