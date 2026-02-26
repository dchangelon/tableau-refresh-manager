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
import { Search, XCircle } from "lucide-react";

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

  // Extract unique top-level folders from data
  const projects = data
    ? Array.from(new Set(data.tasks.details.map((task) => task.topLevelProject))).sort()
    : [];

  const hasActiveFilters = search || project || type !== "all";

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search Input */}
        <div className="flex-1 min-w-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Project Filter */}
        <div className="w-full sm:w-64">
          <Select value={project ?? "all"} onValueChange={(val) => setProject(val === "all" ? null : val)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Folders" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Folders</SelectItem>
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
