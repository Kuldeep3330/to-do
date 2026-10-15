import type { NextConfig } from 'next';

const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['.monkeycode-ai.live'],
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
