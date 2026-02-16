import { create } from 'zustand';

interface FilterState {
  search: string;
  project: string | null;
  type: "all" | "workbook" | "datasource";
  setSearch: (s: string) => void;
  setProject: (p: string | null) => void;
  setType: (t: "all" | "workbook" | "datasource") => void;
  clearAll: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  search: "",
  project: null,
  type: "all",
  setSearch: (s) => set({ search: s }),
  setProject: (p) => set({ project: p }),
  setType: (t) => set({ type: t }),
  clearAll: () => set({ search: "", project: null, type: "all" }),
}));
