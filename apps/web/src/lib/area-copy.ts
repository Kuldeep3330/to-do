import type { AreaSummary } from '@/lib/api/types';
import { formatPrice } from '@/lib/format';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/** "Sector 62, Noida" for a locality page, "Noida" for a city page. */
export function areaName(a: Pick<AreaSummary, 'city' | 'locality'>): string {
  return a.locality ? `${a.locality.name}, ${a.city.name}` : a.city.name;
}

export function areaHeading(a: Pick<AreaSummary, 'city' | 'locality' | 'intent'>): string {
  return `Homes ${a.intent === 'RENT' ? 'for rent' : 'for sale'} in ${areaName(a)}`;
}

/**
 * One factual sentence per fact, built only from real numbers. Nothing is promised that the data
 * does not show (no "best", no invented averages), and empty areas say so plainly.
 */
export function areaSummaryText(a: AreaSummary): string {
  const { count, minPrice, maxPrice, medianPrice, verifiedCount } = a.stats;
  const where = areaName(a);
  const kind = a.intent === 'RENT' ? 'for rent' : 'for sale';
  const period = a.intent === 'RENT' ? 'MONTHLY' : 'ONE_TIME';
  if (count === 0) return `We have no homes ${kind} in ${where} right now.`;

  const parts = [`${plural(count, 'home', 'homes')} ${kind} in ${where}.`];
  if (minPrice !== null && maxPrice !== null) {
    parts.push(
      minPrice === maxPrice
        ? `Priced at ${formatPrice(minPrice, period)}.`
        : `Prices range from ${formatPrice(minPrice, period)} to ${formatPrice(maxPrice, period)}${
            count >= 3 && medianPrice !== null ? `, with a middle price of ${formatPrice(medianPrice, period)}` : ''
          }.`,
    );
  }
  if (verifiedCount > 0) {
    parts.push(
      verifiedCount === count
        ? `All were visited and verified by our team.`
        : `${plural(verifiedCount, 'was', 'were')} visited and verified by our team.`,
    );
  }
  return parts.join(' ');
}

/** Short meta description: the same facts, trimmed for search results. */
export function areaDescription(a: AreaSummary): string {
  return areaSummaryText(a);
}
