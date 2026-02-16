import { useQuery } from '@tanstack/react-query';
import type { TimeSlot } from '@/lib/types';
import { TANSTACK_STALE_TIME_MS } from '@/lib/constants';

async function fetchTimeSlots(): Promise<TimeSlot[]> {
  const response = await fetch('/api/time-slots');
  if (!response.ok) {
    throw new Error('Failed to fetch time slots');
  }
  return response.json();
}

export function useTimeSlots() {
  return useQuery({
    queryKey: ['time-slots'],
    queryFn: fetchTimeSlots,
    staleTime: TANSTACK_STALE_TIME_MS,
    retry: 3,
  });
}
