"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { scheduleConfigSchema } from "@/lib/schemas";
import type { ScheduleConfig } from "@/lib/types";
import {
  SCHEDULE_FREQUENCIES,
  DAILY_INTERVAL_OPTIONS,
  MONTHLY_ORDINALS,
  TABLEAU_WEEKDAY_NAMES,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ScheduleEditorProps {
  value: ScheduleConfig;
  onChange: (schedule: ScheduleConfig) => void;
  onCancel?: () => void;
}

const DEFAULT_SCHEDULE: ScheduleConfig = {
  frequency: "Daily",
  startTime: "08:00",
  endTime: null,
  intervalHours: 24,
  weekDays: [],
  monthDays: [],
  monthlyOrdinal: null,
  monthlyWeekDay: null,
};

/** Extract minutes from a "HH:MM" or "HH:MM:SS" string */
function getMinutes(time: string): string {
  return time.split(":")[1] ?? "00";
}

/** Build an endTime with matching minutes from startTime */
function syncEndMinutes(endTime: string, startTime: string): string {
  const endHour = endTime.split(":")[0] ?? "22";
  return `${endHour}:${getMinutes(startTime)}`;
}

/** Normalize incoming value so Daily always has a valid intervalHours */
function normalizeValue(value: ScheduleConfig): ScheduleConfig {
  const normalized = { ...value };
  if (normalized.frequency === "Daily" && (normalized.intervalHours === null || normalized.intervalHours === 1)) {
    normalized.intervalHours = 24;
  }
  return normalized;
}

function getDefaults(frequency: ScheduleConfig["frequency"]): Partial<ScheduleConfig> {
  switch (frequency) {
    case "Hourly":
      return { intervalHours: 1, endTime: "22:00", weekDays: [], monthDays: [], monthlyOrdinal: null, monthlyWeekDay: null };
    case "Daily":
      return { intervalHours: 24, endTime: null, weekDays: [], monthDays: [], monthlyOrdinal: null, monthlyWeekDay: null };
    case "Weekly":
      return { intervalHours: 24, endTime: null, weekDays: ["Monday"], monthDays: [], monthlyOrdinal: null, monthlyWeekDay: null };
    case "Monthly":
      return { intervalHours: 24, endTime: null, weekDays: [], monthDays: [1], monthlyOrdinal: null, monthlyWeekDay: null };
  }
}

const DAY_ABBREV: Record<string, string> = {
  Sunday: "Su",
  Monday: "Mo",
  Tuesday: "Tu",
  Wednesday: "We",
  Thursday: "Th",
  Friday: "Fr",
  Saturday: "Sa",
};

export function ScheduleEditor({ value, onChange, onCancel }: ScheduleEditorProps) {
  const normalized = normalizeValue(value);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ScheduleConfig>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(scheduleConfigSchema) as any,
    defaultValues: { ...DEFAULT_SCHEDULE, ...normalized },
  });

  const frequency = watch("frequency");
  const intervalHours = watch("intervalHours");
  const weekDays = watch("weekDays");
  const monthDays = watch("monthDays");
  const monthlyOrdinal = watch("monthlyOrdinal");
  const startTime = watch("startTime");

  const monthlyMode: "day" | "ordinal" = monthlyOrdinal !== null ? "ordinal" : "day";

  const needsEndTime =
    frequency === "Hourly" ||
    (frequency === "Daily" && intervalHours !== null && intervalHours !== 24);

  const showWeekdays = frequency === "Hourly" || frequency === "Daily" || frequency === "Weekly";

  const handleFrequencyChange = (newFreq: ScheduleConfig["frequency"]) => {
    const currentStartTime = watch("startTime");
    const defaults = getDefaults(newFreq);
    // Sync endTime minutes with startTime
    if (defaults.endTime) {
      defaults.endTime = syncEndMinutes(defaults.endTime, currentStartTime);
    }
    reset({
      ...DEFAULT_SCHEDULE,
      ...defaults,
      frequency: newFreq,
      startTime: currentStartTime,
    });
  };

  const handleStartTimeChange = (newStartTime: string) => {
    setValue("startTime", newStartTime, { shouldValidate: true });
    // If endTime is visible, sync its minutes
    const currentEndTime = watch("endTime");
    if (currentEndTime) {
      setValue("endTime", syncEndMinutes(currentEndTime, newStartTime), { shouldValidate: true });
    }
  };

  const toggleWeekday = (day: string) => {
    const current = weekDays ?? [];
    if (current.includes(day)) {
      setValue(
        "weekDays",
        current.filter((d) => d !== day),
        { shouldValidate: true },
      );
    } else {
      setValue("weekDays", [...current, day], { shouldValidate: true });
    }
  };

  const toggleMonthDay = (day: number | "LastDay") => {
    const current = monthDays ?? [];
    if (current.includes(day)) {
      setValue(
        "monthDays",
        current.filter((d) => d !== day),
        { shouldValidate: true },
      );
    } else {
      setValue("monthDays", [...current, day], { shouldValidate: true });
    }
  };

  const setMonthlyMode = (mode: "day" | "ordinal") => {
    if (mode === "day") {
      setValue("monthlyOrdinal", null, { shouldValidate: true });
      setValue("monthlyWeekDay", null, { shouldValidate: true });
      if (!monthDays || monthDays.length === 0) {
        setValue("monthDays", [1], { shouldValidate: true });
      }
    } else {
      setValue("monthDays", [], { shouldValidate: true });
      setValue("monthlyOrdinal", "First", { shouldValidate: true });
      setValue("monthlyWeekDay", "Monday", { shouldValidate: true });
    }
  };

  const onSubmit = (data: ScheduleConfig) => {
    onChange(data);
  };

  const rootError = errors as Record<string, { message?: string }>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2 p-2.5 bg-gray-50 rounded-lg border">
      {/* Row 1: Frequency + Interval (or just Frequency for Weekly/Monthly) */}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs font-medium">Frequency</Label>
          <Controller
            name="frequency"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  handleFrequencyChange(v as ScheduleConfig["frequency"]);
                }}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {/* Daily: Interval selector inline */}
        {frequency === "Daily" && (
          <div className="flex-1 space-y-1">
            <Label className="text-xs font-medium">Interval</Label>
            <Controller
              name="intervalHours"
              control={control}
              render={({ field }) => (
                <Select
                  value={String(field.value ?? 24)}
                  onValueChange={(v) => {
                    const numVal = Number(v) as 2 | 4 | 6 | 8 | 12 | 24;
                    field.onChange(numVal);
                    if (numVal === 24) {
                      setValue("endTime", null);
                    } else if (!watch("endTime")) {
                      setValue("endTime", syncEndMinutes("22:00", startTime));
                    }
                  }}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAILY_INTERVAL_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={String(opt)}>
                        Every {opt}h
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        )}

        {/* Hourly: Fixed interval display inline */}
        {frequency === "Hourly" && (
          <div className="flex-1 space-y-1">
            <Label className="text-xs font-medium">Interval</Label>
            <div className="text-xs text-gray-600 bg-white px-2 py-1.5 rounded border h-7 flex items-center">
              Every 1 hour
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Start Time + End Time (on same row) */}
      <div className="flex gap-2">
        <div className={needsEndTime ? "flex-1" : "w-1/2"}>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Start</Label>
            <Controller
              name="startTime"
              control={control}
              render={({ field }) => (
                <Input
                  type="time"
                  value={field.value}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="h-7 text-xs"
                />
              )}
            />
          </div>
        </div>
        {needsEndTime && (
          <div className="flex-1 space-y-1">
            <Label className="text-xs font-medium">End</Label>
            <Controller
              name="endTime"
              control={control}
              render={({ field }) => (
                <Input
                  type="time"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value || null;
                    // Auto-sync minutes with startTime
                    const synced = raw ? syncEndMinutes(raw, startTime) : null;
                    field.onChange(synced);
                  }}
                  className="h-7 text-xs"
                />
              )}
            />
          </div>
        )}
      </div>
      {errors.startTime && (
        <p className="text-xs text-red-600">{errors.startTime.message}</p>
      )}
      {errors.endTime && (
        <p className="text-xs text-red-600">{errors.endTime.message}</p>
      )}

      {/* Row 3: Weekday toggle buttons (compact) */}
      {showWeekdays && (
        <div className="space-y-1">
          <Label className="text-xs font-medium">
            {frequency === "Weekly" ? "Days (at least 1)" : "Days (optional, empty = all)"}
          </Label>
          <div className="flex gap-0.5">
            {TABLEAU_WEEKDAY_NAMES.map((day) => {
              const isActive = (weekDays ?? []).includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={`flex-1 text-xs py-1 rounded transition-colors ${
                    isActive
                      ? "bg-blue-500 text-white"
                      : "bg-white text-gray-500 border border-gray-200 hover:border-blue-300"
                  }`}
                  onClick={() => toggleWeekday(day)}
                >
                  {DAY_ABBREV[day]}
                </button>
              );
            })}
          </div>
          {errors.weekDays && (
            <p className="text-xs text-red-600">{errors.weekDays.message}</p>
          )}
        </div>
      )}

      {/* Monthly Options */}
      {frequency === "Monthly" && (
        <div className="space-y-2">
          {/* Mode Toggle */}
          <div className="flex gap-1 bg-white rounded border p-0.5">
            <button
              type="button"
              className={`flex-1 text-xs py-1 px-2 rounded transition-colors ${
                monthlyMode === "day"
                  ? "bg-blue-100 text-blue-700 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setMonthlyMode("day")}
            >
              On Day
            </button>
            <button
              type="button"
              className={`flex-1 text-xs py-1 px-2 rounded transition-colors ${
                monthlyMode === "ordinal"
                  ? "bg-blue-100 text-blue-700 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setMonthlyMode("ordinal")}
            >
              On Ordinal Weekday
            </button>
          </div>

          {/* On Day Mode: Grid of 1-31 + Last Day */}
          {monthlyMode === "day" && (
            <div className="space-y-1">
              <div className="grid grid-cols-8 gap-0.5">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={`text-xs py-0.5 rounded border transition-colors ${
                      (monthDays ?? []).includes(day)
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                    }`}
                    onClick={() => toggleMonthDay(day)}
                  >
                    {day}
                  </button>
                ))}
                <button
                  type="button"
                  className={`text-xs py-0.5 rounded border transition-colors col-span-2 ${
                    (monthDays ?? []).includes("LastDay")
                      ? "bg-blue-500 text-white border-blue-500"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                  }`}
                  onClick={() => toggleMonthDay("LastDay")}
                >
                  Last
                </button>
              </div>
              {errors.monthDays && (
                <p className="text-xs text-red-600">{errors.monthDays.message}</p>
              )}
            </div>
          )}

          {/* On Ordinal Weekday Mode */}
          {monthlyMode === "ordinal" && (
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs font-medium">Ordinal</Label>
                <Controller
                  name="monthlyOrdinal"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "First"}
                      onValueChange={(v) =>
                        field.onChange(v as ScheduleConfig["monthlyOrdinal"])
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHLY_ORDINALS.map((ord) => (
                          <SelectItem key={ord} value={ord}>
                            {ord}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs font-medium">Weekday</Label>
                <Controller
                  name="monthlyWeekDay"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "Monday"}
                      onValueChange={(v) => field.onChange(v)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TABLEAU_WEEKDAY_NAMES.map((day) => (
                          <SelectItem key={day} value={day}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Root-level validation errors (from refine) */}
      {rootError?.[""] && (
        <p className="text-xs text-red-600">{rootError[""].message}</p>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-1.5 border-t">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" className="h-7 text-xs">
          Save
        </Button>
      </div>
    </form>
  );
}
