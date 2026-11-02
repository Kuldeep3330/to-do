import type { Metadata } from 'next';
import Link from 'next/link';
import { CommunityPolls } from '@/components/discover/community-polls';

export const metadata: Metadata = {
  title: 'Community Insights',
  description:
    'Quick polls on what matters most when finding a home in Delhi-NCR. Vote without an account and see how others answered.',
  alternates: { canonical: '/discover/community' },
};

export default function CommunityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/discover" className="text-sm text-ink-muted hover:text-brand-700">
        &larr; All Discover assessments
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Community Insights</h1>
      <p className="mb-8 mt-2 text-ink-muted">
        Short polls on what matters when finding a home in Delhi-NCR. No account needed. Results are opinions from people
        who chose to take part, not verified market statistics.
      </p>
      <CommunityPolls />
    </div>
  );
}
