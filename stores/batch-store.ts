import { create } from "zustand";
import type { BatchPlanItem, RefreshTask, ScheduleConfig } from "@/lib/types";
import { computeRunHours } from "@/lib/utils";

interface BatchState {
  items: BatchPlanItem[];
  isExpanded: boolean;
  addItem: (task: RefreshTask) => void;
  removeItem: (id: string) => void;
  updateItemSchedule: (id: string, schedule: ScheduleConfig) => void;
  setAllSchedules: (schedule: ScheduleConfig) => void;
  setSchedulesByIds: (ids: Set<string>, schedule: ScheduleConfig) => void;
  clearAll: () => void;
  toggleExpanded: () => void;
  isTaskInPlan: (taskId: string) => boolean;
}

export const useBatchStore = create<BatchState>((set, get) => ({
  items: [],
  isExpanded: false,

  addItem: (task) => {
    const { items } = get();
    if (items.some((item) => item.taskId === task.id)) return;

    const newItem: BatchPlanItem = {
      id: crypto.randomUUID(),
      taskId: task.id,
      taskName: task.itemName,
      projectName: task.projectName,
      itemType: task.type,
      currentSchedule: { ...task.schedule },
      newSchedule: { ...task.schedule },
      taskDays: task.taskDays,
      runHours: [...task.runHours],
      newRunHours: [...task.runHours],
    };

    set({ items: [...items, newItem], isExpanded: true });
  },

  removeItem: (id) => {
    const { items } = get();
    const filtered = items.filter((item) => item.id !== id);
    set({ items: filtered, isExpanded: filtered.length > 0 });
  },

  updateItemSchedule: (id, schedule) => {
    const { items } = get();
    set({
      items: items.map((item) =>
        item.id === id
          ? { ...item, newSchedule: schedule, newRunHours: computeRunHours(schedule) }
          : item,
      ),
    });
  },

  setAllSchedules: (schedule) => {
    const { items } = get();
    set({
      items: items.map((item) => ({
        ...item,
        newSchedule: schedule,
        newRunHours: computeRunHours(schedule),
      })),
    });
  },

  setSchedulesByIds: (ids, schedule) => {
    const { items } = get();
    set({
      items: items.map((item) =>
        ids.has(item.id)
          ? { ...item, newSchedule: schedule, newRunHours: computeRunHours(schedule) }
          : item,
      ),
    });
  },

  clearAll: () => set({ items: [], isExpanded: false }),

  toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded })),

  isTaskInPlan: (taskId) => get().items.some((item) => item.taskId === taskId),
}));
