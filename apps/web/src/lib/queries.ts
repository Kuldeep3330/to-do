'use client';

import { useQuery } from '@tanstack/react-query';
import { locationsApi } from '@/lib/api/endpoints';

const DAY = 24 * 60 * 60 * 1000;

export function useCities() {
  return useQuery({ queryKey: ['cities'], queryFn: locationsApi.cities, staleTime: DAY });
}

export function useLocalities(citySlug: string | undefined) {
  return useQuery({
    queryKey: ['localities', citySlug],
    queryFn: () => locationsApi.localities(citySlug as string),
    enabled: !!citySlug,
    staleTime: DAY,
  });
}

export function useAmenities() {
  return useQuery({ queryKey: ['amenities'], queryFn: locationsApi.amenities, staleTime: DAY });
}
