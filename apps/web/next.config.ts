import type { NextConfig } from 'next';

const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:3001';

/** Media host(s) for next/image, derived from the same public base URL the API hands out. */
function mediaPatterns(): NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> {
  const raw = process.env.S3_PUBLIC_BASE_URL ?? 'http://localhost:9000/ncr-media';
  try {
    const u = new URL(raw);
    return [
      {
        protocol: u.protocol.replace(':', '') as 'http' | 'https',
        hostname: u.hostname,
        ...(u.port ? { port: u.port } : {}),
        pathname: `${u.pathname.replace(/\/+$/, '')}/**`,
      },
    ];
  } catch {
    return [];
  }
}

const isProd = process.env.NODE_ENV === 'production';
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/** Origins images may load from: ourselves, data: URIs, and the media host. */
function mediaOrigin(): string {
  try {
    return new URL(process.env.S3_PUBLIC_BASE_URL ?? 'http://localhost:9000/ncr-media').origin;
  } catch {
    return '';
  }
}

/**
 * Content Security Policy. Next.js emits small inline bootstrap scripts, so script-src needs
 * 'unsafe-inline' unless a per-request nonce is added (tracked as a follow-up). Everything
 * else is locked down: no plugins, no framing, forms and base URI only to ourselves.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mediaOrigin()}`.trim(),
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(appUrl.startsWith('https://') ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Only meaningful (and only safe) when the site is served over HTTPS.
  ...(isProd && appUrl.startsWith('https://')
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Signed-in pages must never be stored by shared caches.
      { source: '/(admin|account)/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
  allowedDevOrigins: ['.monkeycode-ai.live'],
  poweredByHeader: false,
  images: {
    remotePatterns: mediaPatterns(),
    // The API already stores right-sized WebP variants (600px card, 1600px detail). Set
    // IMAGES_UNOPTIMIZED=true to serve them as-is (cheap local/CI runs, or behind a CDN).
    unoptimized: process.env.IMAGES_UNOPTIMIZED === 'true',
    // The API already emits WebP variants; AVIF re-encoding is CPU-heavy for little gain.
    formats: ['image/webp'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
      {
        source: '/health',
        destination: `${apiOrigin}/health`,
      },
      {
        source: '/ready',
        destination: `${apiOrigin}/ready`,
      },
    ];
  },
};

export default nextConfig;
