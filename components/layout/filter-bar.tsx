"use client";

import { useState, useEffect } from "react";
import { useRefreshData } from "@/hooks/use-refresh-data";
import { useFilterStore } from "@/stores/filter-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEARCH_DEBOUNCE_MS } from "@/lib/constants";

export function FilterBar() {
  const { data } = useRefreshData();
  const { search, project, type, setSearch, setProject, setType, clearAll } =
    useFilterStore();

  const [searchInput, setSearchInput] = useState(search);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput, setSearch]);

  // Extract unique projects from data
  const projects = data
    ? Array.from(new Set(data.tasks.details.map((task) => task.projectName))).sort()
    : [];

  const hasActiveFilters = search || project || type !== "all";

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search Input */}
        <div className="flex-1 min-w-0">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <Input
              type="text"
              placeholder="Search tasks or projects..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Project Filter */}
        <div className="w-full sm:w-64">
          <Select value={project ?? "all"} onValueChange={(val) => setProject(val === "all" ? null : val)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((proj) => (
                <SelectItem key={proj} value={proj}>
                  {proj}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Type Filter - Segmented Control */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setType("all")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              type === "all"
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setType("workbook")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              type === "workbook"
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Workbooks
          </button>
          <button
            onClick={() => setType("datasource")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              type === "datasource"
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Datasources
          </button>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button variant="ghost" onClick={clearAll} size="sm">
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
}
