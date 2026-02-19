"use client";

import { useBatchStore } from "@/stores/batch-store";
import { BatchItem } from "./batch-item";
import { PreviewImpact } from "./preview-impact";
import { ApplyDialog } from "./apply-dialog";
import { SetAllDialog } from "./set-all-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronUp, ChevronDown, Trash2, CalendarSync, X, Maximize2, Minimize2, ArrowUpDown } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { BatchPlanItem } from "@/lib/types";

type SortKey = "insertion" | "name" | "folder" | "type" | "frequency" | "changed";

const SORT_LABELS: Record<SortKey, string> = {
  insertion: "Default Order",
  name: "Name (A-Z)",
  folder: "Folder (A-Z)",
  type: "Type (WB/DS)",
  frequency: "Frequency",
  changed: "Changed First",
};

const FREQUENCY_ORDER: Record<string, number> = {
  Hourly: 0,
  Daily: 1,
  Weekly: 2,
  Monthly: 3,
};

export function BatchDrawer() {
  const items = useBatchStore((s) => s.items);
  const isExpanded = useBatchStore((s) => s.isExpanded);
  const removeItem = useBatchStore((s) => s.removeItem);
  const updateItemSchedule = useBatchStore((s) => s.updateItemSchedule);
  const clearAll = useBatchStore((s) => s.clearAll);
  const toggleExpanded = useBatchStore((s) => s.toggleExpanded);
  const [applyOpen, setApplyOpen] = useState(false);
  const [setAllOpen, setSetAllOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [setAllTargetIds, setSetAllTargetIds] = useState<Set<string> | undefined>(undefined);
  const [sortKey, setSortKey] = useState<SortKey>("insertion");

  // Maximize/restore state with localStorage persistence
  const [isMaximized, setIsMaximized] = useState(() => {
    try {
      if (typeof window === "undefined") return false;
      return localStorage.getItem("batch-drawer-maximized") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("batch-drawer-maximized", String(isMaximized));
    } catch {
      // localStorage unavailable (e.g., private browsing) — ignore
    }
  }, [isMaximized]);

  // Escape key collapses the expanded drawer (only when no dialogs are open)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded && !applyOpen && !setAllOpen) {
        toggleExpanded();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, applyOpen, setAllOpen, toggleExpanded]);

  // Auto-maximize when item count crosses threshold
  const AUTO_MAXIMIZE_THRESHOLD = 12;
  useEffect(() => {
    if (items.length >= AUTO_MAXIMIZE_THRESHOLD && !isMaximized) {
      setIsMaximized(true);
    }
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawerHeight = isMaximized ? "h-[80vh]" : "h-[50vh]";
  const contentHeight = isMaximized ? "h-[calc(80vh-3.5rem)]" : "h-[calc(50vh-3.5rem)]";

  // Prune stale IDs when items are removed
  const itemIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  useEffect(() => {
    setSelectedIds((prev) => {
      const pruned = new Set([...prev].filter((id) => itemIds.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [itemIds]);

  const selectedCount = selectedIds.size;
  const allSelected = selectedCount === items.length && items.length > 0;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }, [allSelected, items]);

  const removeSelected = useCallback(() => {
    selectedIds.forEach((id) => removeItem(id));
    setSelectedIds(new Set());
  }, [selectedIds, removeItem]);

  // Sorted items computation
  const sortedItems = useMemo(() => {
    if (sortKey === "insertion") return items;

    const compare = (a: BatchPlanItem, b: BatchPlanItem): number => {
      switch (sortKey) {
        case "name":
          return a.taskName.localeCompare(b.taskName);
        case "folder":
          return a.projectName.localeCompare(b.projectName) || a.taskName.localeCompare(b.taskName);
        case "type": {
          const typeOrder = (t: string) => (t === "workbook" ? 0 : 1);
          return typeOrder(a.itemType) - typeOrder(b.itemType) || a.taskName.localeCompare(b.taskName);
        }
        case "frequency":
          return (FREQUENCY_ORDER[a.currentSchedule.frequency] ?? 99) -
                 (FREQUENCY_ORDER[b.currentSchedule.frequency] ?? 99) ||
                 a.taskName.localeCompare(b.taskName);
        case "changed": {
          const aChanged = JSON.stringify(a.currentSchedule) !== JSON.stringify(a.newSchedule) ? 0 : 1;
          const bChanged = JSON.stringify(b.currentSchedule) !== JSON.stringify(b.newSchedule) ? 0 : 1;
          return aChanged - bChanged || a.taskName.localeCompare(b.taskName);
        }
        default:
          return 0;
      }
    };

    return [...items].sort(compare);
  }, [items, sortKey]);

  if (items.length === 0) return null;

  return (
    <>
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-[0_-4px_16px_rgba(0,0,0,0.08)] transition-all duration-300 ease-in-out ${
          isExpanded ? drawerHeight : "h-14"
        }`}
      >
        {/* Collapsed Bar / Header */}
        <div
          className="flex items-center justify-between px-4 h-14 cursor-pointer select-none"
          onClick={toggleExpanded}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold">
              {items.length}
            </div>
            <span className="text-sm font-medium text-gray-700">
              {items.length} {items.length === 1 ? "change" : "changes"} queued
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isExpanded && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMaximized((prev) => !prev);
                }}
              >
                {isMaximized ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              {isExpanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronUp className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className={`flex flex-col ${contentHeight}`}>
            <Separator />
            <div className="flex-1 flex min-h-0">
              {/* Left Panel: Batch Items */}
              <div className="flex-[3] min-w-0 border-r flex flex-col overflow-hidden">
                {/* Selection Toolbar */}
                <div className="flex items-center gap-3 px-4 py-2 border-b bg-gray-50/50">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      data-testid="batch-select-all"
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleSelectAll}
                    />
                    <span className="text-gray-600 select-none">Select All</span>
                  </label>
                  {selectedCount > 0 ? (
                    <>
                      <span className="text-xs text-gray-500">
                        {selectedCount} of {items.length} selected
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            setSetAllTargetIds(new Set(selectedIds));
                            setSetAllOpen(true);
                          }}
                        >
                          <CalendarSync className="size-3" />
                          Set Schedule ({selectedCount})
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={removeSelected}
                        >
                          <X className="size-3" />
                          Remove ({selectedCount})
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="ml-auto flex items-center gap-1.5">
                      <ArrowUpDown className="size-3 text-gray-400" />
                      <Select value={sortKey} onValueChange={(val) => setSortKey(val as SortKey)}>
                        <SelectTrigger size="sm" className="h-7 text-xs w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <ScrollArea className="flex-1 min-h-0 p-4">
                  <div className="space-y-2">
                    {sortedItems.map((item) => (
                      <BatchItem
                        key={item.id}
                        item={item}
                        selected={selectedIds.has(item.id)}
                        onToggleSelect={toggleSelect}
                        onRemove={removeItem}
                        onUpdateSchedule={updateItemSchedule}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Right Panel: Impact Preview */}
              <div className="flex-[2] min-w-0 hidden lg:block">
                <ScrollArea className="h-full p-4">
                  <PreviewImpact />
                </ScrollArea>
              </div>
            </div>

            {/* Footer */}
            <Separator />
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
              <Button
                data-testid="batch-clear-all"
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
              >
                <Trash2 className="size-3.5" />
                Clear All
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  data-testid="batch-set-all"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSetAllTargetIds(undefined);
                    setSetAllOpen(true);
                  }}
                  className="gap-1.5"
                >
                  <CalendarSync className="size-3.5" />
                  Set All Schedules
                </Button>
                <Button data-testid="batch-apply" size="sm" onClick={() => setApplyOpen(true)} className="gap-1.5">
                  Apply {items.length} {items.length === 1 ? "Change" : "Changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <SetAllDialog open={setAllOpen} onOpenChange={setSetAllOpen} targetIds={setAllTargetIds} />
      <ApplyDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </>
  );
}
