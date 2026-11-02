import type { Metadata } from 'next';
import { ResultView } from '@/components/discover/result-view';

// A result is private to whoever holds the link: keep it out of search engines.
export const metadata: Metadata = {
  title: 'Your Discover result',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function DiscoverResultPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <ResultView token={token} />
    </div>
  );
}
