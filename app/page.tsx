"use client";

import { useMemo, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { FilterBar } from "@/components/layout/filter-bar";
import { HealthCards } from "@/components/health/health-cards";
import { HourlyChart } from "@/components/charts/hourly-chart";
import { Heatmap } from "@/components/charts/heatmap";
import { TopRefreshers } from "@/components/tables/top-refreshers";
import { HourModal } from "@/components/drill-down/hour-modal";
import { BatchDrawer } from "@/components/batch/batch-drawer";
import { ErrorSummary } from "@/components/errors/error-summary";
import { ErrorBoundary } from "@/components/error-boundary";
import { useRefreshData } from "@/hooks/use-refresh-data";
import { useFilterStore } from "@/stores/filter-store";
import { useBatchStore } from "@/stores/batch-store";
import {
  taskMatchesFilters,
  taskRunsOnDay,
  taskRunsOnDate,
} from "@/lib/filters";
import type { RefreshTask } from "@/lib/types";

export default function DashboardPage() {
  const { data, isLoading } = useRefreshData();
  const { search, project, type } = useFilterStore();
  const addItem = useBatchStore((s) => s.addItem);
  const isTaskInPlan = useBatchStore((s) => s.isTaskInPlan);
  const batchItemCount = useBatchStore((s) => s.items.length);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number | undefined>();
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [isHourModalOpen, setIsHourModalOpen] = useState(false);

  const handleAddToPlan = useCallback(
    (task: RefreshTask) => addItem(task),
    [addItem],
  );

  const filteredTasks = useMemo(() => {
    if (!data) return [];
    return data.tasks.details.filter((task) =>
      taskMatchesFilters(task, search, project, type),
    );
  }, [data, search, project, type]);
  const hasActiveFilters = Boolean(search) || project !== null || type !== "all";

  const modalTasks = useMemo(() => {
    if (selectedHour === null) return [];

    return filteredTasks.filter((task) => {
      if (!task.runHours.includes(selectedHour)) return false;
      if (!taskRunsOnDay(task, selectedDayOfWeek)) return false;
      if (selectedDate && !taskRunsOnDate(task, selectedDate)) return false;
      return true;
    });
  }, [filteredTasks, selectedHour, selectedDayOfWeek, selectedDate]);

  const openHourModal = (hour: number, dayOfWeek?: number, date?: string) => {
    setSelectedHour(hour);
    setSelectedDayOfWeek(dayOfWeek);
    setSelectedDate(date);
    setIsHourModalOpen(true);
  };

  const handleDateClick = (date: string) => {
    const tasksForDate = filteredTasks.filter((task) => taskRunsOnDate(task, date));

    if (tasksForDate.length === 0) {
      openHourModal(0, undefined, date);
      return;
    }

    const countsByHour = new Map<number, number>();
    for (const task of tasksForDate) {
      for (const hour of task.runHours) {
        countsByHour.set(hour, (countsByHour.get(hour) ?? 0) + 1);
      }
    }

    const busiestHour =
      [...countsByHour.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

    openHourModal(busiestHour, undefined, date);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 ${batchItemCount > 0 ? "pb-20" : ""}`}>
        {/* Filters */}
        <FilterBar />

        {/* Health Metrics */}
        <section>
          <HealthCards tasks={filteredTasks} />
        </section>

        {/* Analytics Row: stack on smaller screens, side-by-side on wide screens */}
        <ErrorBoundary fallbackMessage="Chart failed to render.">
          <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 xl:col-span-4 2xl:col-span-5">
              <h2 className="text-lg font-semibold mb-4">Hourly Distribution</h2>
              <HourlyChart
                tasks={filteredTasks}
                onHourClick={(hour) => openHourModal(hour)}
                height={380}
              />
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 xl:col-span-8 2xl:col-span-7">
              <h2 className="text-lg font-semibold mb-4">Schedule Heatmap</h2>
              <Heatmap
                tasks={filteredTasks}
                onCellClick={openHourModal}
                onDateClick={handleDateClick}
              />
            </div>
          </section>
        </ErrorBoundary>

        {/* Top Refreshers + Error Summary side-by-side */}
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Top Refreshers</h2>
            <TopRefreshers
              tasks={filteredTasks}
              isLoading={isLoading}
              hasActiveFilters={hasActiveFilters}
            />
          </div>
          <ErrorSummary
            tasks={filteredTasks}
            onAddToPlan={handleAddToPlan}
            isInPlan={isTaskInPlan}
          />
        </section>
      </main>

      <HourModal
        open={isHourModalOpen}
        onOpenChange={setIsHourModalOpen}
        hour={selectedHour ?? 0}
        dayOfWeek={selectedDayOfWeek}
        date={selectedDate}
        tasks={modalTasks}
        onAddToPlan={handleAddToPlan}
        isInPlan={isTaskInPlan}
      />

      <BatchDrawer />
    </div>
  );
}
