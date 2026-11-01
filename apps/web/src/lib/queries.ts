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

export function useAmenities(source: 'admin' | 'public' = 'admin') {
  return useQuery({
    queryKey: ['amenities', source],
    queryFn: source === 'public' ? locationsApi.publicAmenities : locationsApi.amenities,
    staleTime: DAY,
  });
}
