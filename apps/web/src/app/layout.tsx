import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { config } from '@/lib/config';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(config.appUrl),
  title: { default: 'NCR Homes — Buy and rent homes in Delhi-NCR', template: '%s | NCR Homes' },
  description:
    'Find verified apartments, houses and commercial spaces to buy or rent across Delhi, Noida, Gurugram, Ghaziabad and Faridabad.',
  openGraph: { siteName: 'NCR Homes', type: 'website', locale: 'en_IN' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1d4ed8',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={inter.variable}>
      <body className="min-h-screen bg-surface text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
