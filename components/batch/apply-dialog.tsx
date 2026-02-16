"use client";

import { useState } from "react";
import { useBatchStore } from "@/stores/batch-store";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RescheduleResponse } from "@/lib/types";
import { formatScheduleSummary } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface ApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DialogState = "confirm" | "loading" | "results";

export function ApplyDialog({ open, onOpenChange }: ApplyDialogProps) {
  const items = useBatchStore((s) => s.items);
  const removeItem = useBatchStore((s) => s.removeItem);
  const queryClient = useQueryClient();
  const [state, setState] = useState<DialogState>("confirm");
  const [results, setResults] = useState<RescheduleResponse | null>(null);

  const handleClose = (isOpen: boolean) => {
    if (state === "loading") return; // Prevent closing during apply
    onOpenChange(isOpen);
    if (!isOpen) {
      // Reset state when closing
      setState("confirm");
      setResults(null);
    }
  };

  const handleApply = async () => {
    setState("loading");

    try {
      const response = await fetch("/api/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes: items.map((item) => ({
            taskId: item.taskId,
            schedule: item.newSchedule,
          })),
        }),
      });

      const data: RescheduleResponse = await response.json();
      setResults(data);
      setState("results");

      // Remove succeeded items from batch store
      const succeededIds = new Set(
        data.results
          .filter((r) => r.success)
          .map((r) => r.taskId),
      );
      for (const item of items) {
        if (succeededIds.has(item.taskId)) {
          removeItem(item.id);
        }
      }

      // Invalidate query caches on any success
      if (data.summary.succeeded > 0) {
        queryClient.invalidateQueries({ queryKey: ["refresh-data"] });
        queryClient.invalidateQueries({ queryKey: ["time-slots"] });
      }

      // Single combined toast based on outcome
      if (data.summary.succeeded > 0 && data.summary.failed > 0) {
        toast.warning(
          `${data.summary.succeeded} updated, ${data.summary.failed} failed — see details`,
        );
      } else if (data.summary.failed > 0) {
        toast.error(
          `All ${data.summary.failed} change${data.summary.failed === 1 ? "" : "s"} failed — see details`,
        );
      } else {
        toast.success(
          `Successfully updated ${data.summary.succeeded} schedule${data.summary.succeeded === 1 ? "" : "s"}`,
        );
      }
    } catch (error) {
      setState("results");
      setResults(null);
      toast.error("Failed to apply changes. Please try again.");
      console.error("Reschedule error:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {/* Confirmation State */}
        {state === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle>
                Apply {items.length} Schedule {items.length === 1 ? "Change" : "Changes"}?
              </DialogTitle>
              <DialogDescription>
                The following schedules will be updated on Tableau Cloud.
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-60">
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 text-sm p-2 rounded bg-gray-50"
                  >
                    <Badge
                      variant={item.itemType === "workbook" ? "default" : "secondary"}
                      className="text-xs shrink-0"
                    >
                      {item.itemType === "workbook" ? "WB" : "DS"}
                    </Badge>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{item.taskName}</div>
                      <div className="text-xs text-gray-500">
                        {formatScheduleSummary(
                          item.newSchedule.frequency,
                          item.newSchedule.startTime,
                          item.newSchedule.intervalHours,
                          item.newSchedule.weekDays,
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleApply}>
                Apply {items.length} {items.length === 1 ? "Change" : "Changes"}
              </Button>
            </div>
          </>
        )}

        {/* Loading State */}
        {state === "loading" && (
          <>
            <DialogHeader>
              <DialogTitle>Applying Changes...</DialogTitle>
              <DialogDescription>
                Updating schedules on Tableau Cloud. Please wait.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="size-8 animate-spin text-blue-500" />
              <p className="text-sm text-gray-500">
                Processing {items.length} {items.length === 1 ? "change" : "changes"}...
              </p>
            </div>
          </>
        )}

        {/* Results State */}
        {state === "results" && (
          <>
            <DialogHeader>
              <DialogTitle>
                {results
                  ? results.summary.failed === 0
                    ? "All Changes Applied"
                    : "Partial Results"
                  : "Request Failed"}
              </DialogTitle>
              <DialogDescription>
                {results
                  ? `${results.summary.succeeded} succeeded, ${results.summary.failed} failed`
                  : "Could not reach the server. Please try again."}
              </DialogDescription>
            </DialogHeader>

            {results && (
              <ScrollArea className="max-h-60">
                <div className="space-y-2">
                  {results.results.map((result) => {
                    const item = items.find((i) => i.taskId === result.taskId);
                    return (
                      <div
                        key={result.taskId}
                        className={`flex items-center gap-2 text-sm p-2 rounded ${
                          result.success ? "bg-green-50" : "bg-red-50"
                        }`}
                      >
                        {result.success ? (
                          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
                        ) : (
                          <XCircle className="size-4 text-red-600 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {item?.taskName ?? result.taskId}
                          </div>
                          {result.error && (
                            <div className="text-xs text-red-600">{result.error}</div>
                          )}
                          {result.message && result.success && (
                            <div className="text-xs text-green-600">{result.message}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={() => handleClose(false)}>
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
