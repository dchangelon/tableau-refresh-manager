import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { AnalysisResponse } from '@/lib/types';
import { TANSTACK_STALE_TIME_MS } from '@/lib/constants';

async function fetchRefreshData(): Promise<AnalysisResponse> {
  const response = await fetch('/api/refresh-data');
  if (!response.ok) {
    throw new Error('Failed to fetch refresh data');
  }
  return response.json();
}

export function useRefreshData(
  options?: Omit<UseQueryOptions<AnalysisResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: ['refresh-data'],
    queryFn: fetchRefreshData,
    staleTime: TANSTACK_STALE_TIME_MS,
    retry: 3,
    ...options, // Allow overriding defaults (e.g., enabled: false)
  });
}
