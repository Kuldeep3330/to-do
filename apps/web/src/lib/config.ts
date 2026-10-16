/** Typed access to web env. Nothing secret is ever prefixed NEXT_PUBLIC_. */
export const config = {
  /** Where the Next server proxies /api/*. Server-side only. */
  apiOrigin: process.env.API_ORIGIN ?? 'http://localhost:3001',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  mapsEnabled: process.env.NEXT_PUBLIC_MAPS_ENABLED === 'true',
  siteName: 'NCR Homes',
} as const;

/** Optional public contact details. Pages hide the line entirely when unset (no fake placeholders). */
export const contact = {
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || null,
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE || null,
} as const;
