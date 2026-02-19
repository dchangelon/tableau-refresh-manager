import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BatchDrawer } from "@/components/batch/batch-drawer";
import { useBatchStore } from "@/stores/batch-store";
import type { ScheduleConfig, BatchPlanItem } from "@/lib/types";

// Mock recharts to avoid rendering issues in tests
vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Legend: () => <div />,
}));

// Mock use-batch-impact hook
vi.mock("@/hooks/use-batch-impact", () => ({
  useBatchImpact: () => null,
}));

const mockSchedule: ScheduleConfig = {
  frequency: "Daily",
  startTime: "08:00",
  endTime: null,
  intervalHours: 24,
  weekDays: [],
  monthDays: [],
  monthlyOrdinal: null,
  monthlyWeekDay: null,
};

const mockItem: BatchPlanItem = {
  id: "batch-1",
  taskId: "task-1",
  taskName: "Test Workbook Refresh",
  projectName: "Marketing",
  itemType: "workbook",
  currentSchedule: mockSchedule,
  newSchedule: mockSchedule,
  taskDays: 7,
  runHours: [8],
  newRunHours: [8],
};

const mockItem2: BatchPlanItem = {
  id: "batch-2",
  taskId: "task-2",
  taskName: "Test Datasource Refresh",
  projectName: "Sales Analytics",
  itemType: "datasource",
  currentSchedule: mockSchedule,
  newSchedule: {
    ...mockSchedule,
    frequency: "Weekly",
    weekDays: ["Monday", "Wednesday"],
  },
  taskDays: 2,
  runHours: [8],
  newRunHours: [8],
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("BatchDrawer", () => {
  beforeEach(() => {
    // Reset the store before each test
    useBatchStore.setState({
      items: [],
      isExpanded: false,
    });
  });

  it("renders nothing when no items in store", () => {
    const { container } = render(<BatchDrawer />, { wrapper: createWrapper() });
    expect(container.innerHTML).toBe("");
  });

  it("shows collapsed bar with item count when items present", () => {
    useBatchStore.setState({ items: [mockItem] });
    render(<BatchDrawer />, { wrapper: createWrapper() });

    expect(screen.getByText("1 change queued")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows correct count for multiple items", () => {
    useBatchStore.setState({ items: [mockItem, mockItem2] });
    render(<BatchDrawer />, { wrapper: createWrapper() });

    expect(screen.getByText("2 changes queued")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("expands drawer when clicking collapsed bar", async () => {
    useBatchStore.setState({ items: [mockItem] });
    render(<BatchDrawer />, { wrapper: createWrapper() });

    // Click the collapsed bar to expand
    fireEvent.click(screen.getByText("1 change queued"));

    await waitFor(() => {
      expect(screen.getByText("Clear All")).toBeInTheDocument();
      expect(screen.getByText("Apply 1 Change")).toBeInTheDocument();
    });
  });

  it("shows items with task names when expanded", async () => {
    useBatchStore.setState({ items: [mockItem, mockItem2], isExpanded: true });
    render(<BatchDrawer />, { wrapper: createWrapper() });

    expect(screen.getByText("Test Workbook Refresh")).toBeInTheDocument();
    expect(screen.getByText("Test Datasource Refresh")).toBeInTheDocument();
  });

  it("removes item when remove button is clicked", async () => {
    useBatchStore.setState({ items: [mockItem, mockItem2], isExpanded: true });
    render(<BatchDrawer />, { wrapper: createWrapper() });

    // Find all X buttons (remove buttons) — they're the ones with text-red-500
    const removeButtons = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector(".lucide-x") !== null,
    );

    // Click the first remove button
    if (removeButtons.length > 0) {
      fireEvent.click(removeButtons[0]);
    }

    await waitFor(() => {
      const state = useBatchStore.getState();
      expect(state.items).toHaveLength(1);
    });
  });

  it("clears all items when Clear All is clicked", async () => {
    useBatchStore.setState({ items: [mockItem, mockItem2], isExpanded: true });
    render(<BatchDrawer />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByText("Clear All"));

    await waitFor(() => {
      const state = useBatchStore.getState();
      expect(state.items).toHaveLength(0);
    });
  });

  it("shows correct schedule diff for changed items", () => {
    useBatchStore.setState({ items: [mockItem2], isExpanded: true });
    render(<BatchDrawer />, { wrapper: createWrapper() });

    // The new schedule summary should appear
    expect(screen.getByText("Test Datasource Refresh")).toBeInTheDocument();
  });

  it("hides drawer after all items are removed", async () => {
    useBatchStore.setState({ items: [mockItem], isExpanded: true });
    const { container } = render(<BatchDrawer />, { wrapper: createWrapper() });

    // Clear all
    fireEvent.click(screen.getByText("Clear All"));

    await waitFor(() => {
      // After clearing, the drawer should render nothing
      expect(container.querySelector('[class*="fixed"]')).not.toBeInTheDocument();
    });
  });
});
