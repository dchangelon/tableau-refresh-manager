"use client";

import { Button } from "@/components/ui/button";
import { useRefreshData } from "@/hooks/use-refresh-data";
import { useQueryClient } from "@tanstack/react-query";

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
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Title and Pulse Indicator */}
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              Tableau Refresh Manager
            </h1>

            {/* Pulse Indicator */}
            <div className="flex items-center gap-2">
              {isLoading && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-sm text-gray-600">Loading...</span>
                </div>
              )}

              {!isLoading && !error && data && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-sm text-gray-600">
                    {data.tasks.total} tasks
                  </span>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                  <span className="text-sm text-red-600">Error loading data</span>
                </div>
              )}
            </div>
          </div>

          {/* Refresh Button + Last Updated */}
          <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-gray-400">
              Last refresh: {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button
            onClick={handleRefresh}
            variant="outline"
            disabled={isLoading}
            className="gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
