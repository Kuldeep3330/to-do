/** "3 days 4 hours", "2 hours 5 minutes", "40 seconds": two units at most, for the uptime line. */
export function formatUptime(seconds: number): string {
  const units: [string, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ];
  const parts: string[] = [];
  let rest = Math.max(0, Math.floor(seconds));
  for (const [name, size] of units) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n > 0 && parts.length < 2) parts.push(`${n} ${name}${n === 1 ? '' : 's'}`);
  }
  return parts.length ? parts.join(' ') : '0 seconds';
}

const ENTITY_LINKS = {
  listing: (id: string) => `/admin/listings/${id}`,
  lead: (id: string) => `/admin/leads/${id}`,
  // there is no single-visit page: send people to the queue
  visit: () => '/admin/visits?status=REQUESTED',
} as const;

export function qualityItemHref(entity: keyof typeof ENTITY_LINKS, id: string): string {
  return ENTITY_LINKS[entity](id);
}
