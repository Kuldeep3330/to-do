import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private areas, the JSON API, and endless filter combinations.
        disallow: ['/admin', '/account', '/api/', '/login', '/register', '/forgot-password', '/reset-password'],
      },
    ],
    sitemap: `${config.appUrl}/sitemap.xml`,
    host: config.appUrl,
  };
}
