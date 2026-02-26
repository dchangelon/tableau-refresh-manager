"use client";

import { useMemo, useState } from "react";
import { TaskRow } from "@/components/drill-down/task-row";
import { Badge } from "@/components/ui/badge";
import {
  categorizeError,
  ERROR_BUCKET_ORDER,
  ERROR_BUCKET_LABELS,
  type ErrorBucketKey,
} from "@/lib/constants";
import type { RefreshTask } from "@/lib/types";
import {
  Unplug,
  Clock,
  ShieldX,
  DatabaseZap,
  CircleAlert,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const BUCKET_ICONS: Record<ErrorBucketKey, React.ElementType> = {
  connection: Unplug,
  timeout: Clock,
  permission: ShieldX,
  "data source unavailable": DatabaseZap,
  other: CircleAlert,
};

const BUCKET_DOT_COLORS: Record<ErrorBucketKey, string> = {
  connection: "bg-red-500",
  timeout: "bg-amber-500",
  permission: "bg-purple-500",
  "data source unavailable": "bg-orange-500",
  other: "bg-gray-400",
};

interface ErrorSummaryProps {
  tasks: RefreshTask[];
  onAddToPlan?: (task: RefreshTask) => void;
  isInPlan?: (taskId: string) => boolean;
}

export function ErrorSummary({ tasks, onAddToPlan, isInPlan }: ErrorSummaryProps) {
  const { buckets, totalFailing } = useMemo(() => {
    const failingTasks = tasks.filter((t) => t.consecutiveFailures > 0);
    const grouped = new Map<ErrorBucketKey, RefreshTask[]>();

    for (const task of failingTasks) {
      const bucket = categorizeError(task.lastFailureMessage);
      const existing = grouped.get(bucket) ?? [];
      existing.push(task);
      grouped.set(bucket, existing);
    }

    // Build ordered buckets (only non-empty)
    const orderedBuckets = ERROR_BUCKET_ORDER
      .filter((key) => grouped.has(key))
      .map((key) => ({
        key,
        tasks: grouped.get(key)!,
        label: ERROR_BUCKET_LABELS[key].label,
        Icon: BUCKET_ICONS[key],
      }));

    return { buckets: orderedBuckets, totalFailing: failingTasks.length };
  }, [tasks]);

  // Per-bucket expand/collapse — all collapsed by default
  const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>({});

  function isBucketExpanded(key: ErrorBucketKey): boolean {
    return expandedBuckets[key] ?? false;
  }

  function toggleBucket(key: ErrorBucketKey) {
    setExpandedBuckets((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? false),
    }));
  }

  if (totalFailing === 0) return null;

  return (
    <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
      {/* Header — always visible */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold">Error Summary</h2>
        <Badge variant="destructive">{totalFailing}</Badge>
      </div>

      {/* Bucket sections */}
      <div className="space-y-3">
        {buckets.map(({ key, tasks: bucketTasks, label, Icon }) => {
          const isExpanded = isBucketExpanded(key);
          const dotColor = BUCKET_DOT_COLORS[key];

          return (
            <div key={key} className="rounded-lg border bg-card">
              {/* Bucket header */}
              <button
                onClick={() => toggleBucket(key)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
                <Icon className="size-4 text-muted-foreground shrink-0" />
                <span className="font-semibold text-sm">{label}</span>
                <Badge variant="secondary" className="text-xs">
                  {bucketTasks.length}
                </Badge>
              </button>

              {/* Bucket content */}
              {isExpanded && (
                <div className="px-4 pb-3">
                  <div className="divide-y">
                    {bucketTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onAddToPlan={onAddToPlan}
                        isInPlan={isInPlan}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
