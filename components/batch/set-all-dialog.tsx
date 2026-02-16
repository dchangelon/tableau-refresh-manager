"use client";

import { useBatchStore } from "@/stores/batch-store";
import type { ScheduleConfig } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScheduleEditor } from "./schedule-editor";

interface SetAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetIds?: Set<string>;
}

export function SetAllDialog({ open, onOpenChange, targetIds }: SetAllDialogProps) {
  const items = useBatchStore((s) => s.items);
  const setAllSchedules = useBatchStore((s) => s.setAllSchedules);
  const setSchedulesByIds = useBatchStore((s) => s.setSchedulesByIds);

  const isSubset = targetIds !== undefined && targetIds.size > 0;
  const targetCount = isSubset ? targetIds.size : items.length;

  const defaultSchedule = isSubset
    ? items.find((i) => targetIds.has(i.id))?.newSchedule
    : items[0]?.newSchedule;

  if (!defaultSchedule) return null;

  const handleSave = (schedule: ScheduleConfig) => {
    if (isSubset) {
      setSchedulesByIds(targetIds, schedule);
    } else {
      setAllSchedules(schedule);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isSubset ? "Set Schedule for Selected" : "Set All Schedules"}
          </DialogTitle>
          <DialogDescription>
            Apply a single schedule to{" "}
            {isSubset
              ? `${targetCount} selected ${targetCount === 1 ? "item" : "items"}`
              : `all ${targetCount} ${targetCount === 1 ? "item" : "items"} in the plan`}
            .
          </DialogDescription>
        </DialogHeader>
        <ScheduleEditor
          value={defaultSchedule}
          onChange={handleSave}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
