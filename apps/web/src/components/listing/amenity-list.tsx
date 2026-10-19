import {
  Accessibility,
  Car,
  Check,
  Droplets,
  Dumbbell,
  Flame,
  Home,
  ShieldCheck,
  TreePine,
  Zap,
  ArrowUpDown,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { Amenity } from '@/lib/api/types';

type IconType = ComponentType<{ className?: string }>;

/** Icons for the seeded amenity codes. Anything new falls back to a check mark. */
const ICONS: Record<string, IconType> = {
  lift: ArrowUpDown,
  security: ShieldCheck,
  park: TreePine,
  power_backup: Zap,
  gym: Dumbbell,
  clubhouse: Home,
  visitor_parking: Car,
  water_supply: Droplets,
  piped_gas: Flame,
  wheelchair: Accessibility,
};

export function amenityIcon(code: string): IconType {
  return ICONS[code] ?? Check;
}

/** What the property offers. Renders nothing when there are no amenities, so the page has no empty heading. */
export function AmenityList({ amenities }: { amenities: Omit<Amenity, 'id'>[] }) {
  if (amenities.length === 0) return null;
  return (
    <section aria-labelledby="amenities-heading">
      <h2 id="amenities-heading" className="text-xl font-semibold">
        Amenities
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Amenities">
        {amenities.map((a) => {
          const Icon = amenityIcon(a.code);
          return (
            <li key={a.code} className="flex items-center gap-2 text-sm">
              <Icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              {a.name}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
