"use client";

import { Button } from "@/components/ui/button";
import { useRefreshData } from "@/hooks/use-refresh-data";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function Header() {
  const { data, isLoading, error, dataUpdatedAt } = useRefreshData();
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    // Bust the server-side unstable_cache first, then re-fetch client-side
    await fetch("/api/revalidate", { method: "POST" }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["refresh-data"] });
    queryClient.invalidateQueries({ queryKey: ["time-slots"] });
  };

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="mx-auto flex max-w-7xl items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center shrink-0" aria-hidden="true">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Tableau Refresh Manager
            </h1>
            <p className="text-xs text-gray-500">
              {isLoading
                ? "Loading..."
                : error
                  ? "Error loading data"
                  : `${data?.tasks.total ?? 0} tasks · Updated ${dataUpdatedAt > 0 ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"}`}
            </p>
          </div>
        </div>

        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={isLoading}
        >
          <RefreshCw
            className={cn("mr-1.5 h-4 w-4", isLoading && "animate-spin")}
          />
          Refresh
        </Button>
      </div>
    </header>
  );
}
