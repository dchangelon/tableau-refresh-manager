"use client";

import { useMemo, useState } from "react";
import { TaskRow } from "@/components/drill-down/task-row";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
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
  ChevronUp,
} from "lucide-react";

const BUCKET_ICONS: Record<ErrorBucketKey, React.ElementType> = {
  connection: Unplug,
  timeout: Clock,
  permission: ShieldX,
  "data source unavailable": DatabaseZap,
  other: CircleAlert,
};

interface ErrorSummaryProps {
  tasks: RefreshTask[];
  onAddToPlan?: (task: RefreshTask) => void;
  isInPlan?: (taskId: string) => boolean;
}

export function ErrorSummary({ tasks, onAddToPlan, isInPlan }: ErrorSummaryProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

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

  if (totalFailing === 0) return null;

  return (
    <section className="bg-white rounded-lg shadow-md p-6">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="flex items-center gap-3 w-full text-left"
      >
        <h2 className="text-lg font-semibold">Error Summary</h2>
        <Badge variant="destructive">{totalFailing}</Badge>
        <span className="ml-auto text-muted-foreground">
          {isCollapsed ? (
            <ChevronDown className="size-5" />
          ) : (
            <ChevronUp className="size-5" />
          )}
        </span>
      </button>

      {/* Collapsible content */}
      {!isCollapsed && (
        <div className="mt-4">
          <Accordion
            type="multiple"
            defaultValue={buckets.map((b) => b.key)}
          >
            {buckets.map(({ key, tasks: bucketTasks, label, Icon }) => (
              <AccordionItem key={key} value={key}>
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <span>{label}</span>
                    <Badge variant="outline" className="ml-1">
                      {bucketTasks.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="divide-y">
                    {bucketTasks.map((task) => (
                      <div key={task.id}>
                        <TaskRow
                          task={task}
                          onAddToPlan={onAddToPlan}
                          isInPlan={isInPlan}
                        />
                        {key === "other" && !task.lastFailureMessage && (
                          <p className="text-xs text-muted-foreground pl-9 pb-2">
                            No failure message returned by Tableau
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
    </section>
  );
}
