import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2, Home, Users } from 'lucide-react';
import { Badge, Card } from '@/components/ui/feedback';

export const metadata: Metadata = {
  title: 'NCR Homes Discover',
  description:
    'Tell us what you are looking for, check if your property is ready to list, or describe your agent service. Short, anonymous, and no account needed.',
  alternates: { canonical: '/discover' },
};

const SECTIONS = [
  {
    slug: 'customer',
    icon: Home,
    audience: 'Home seekers',
    title: 'Find Your Home Preferences',
    text: 'Share your location, budget and priorities and get a clear summary that opens matching homes.',
    minutes: 4,
  },
  {
    slug: 'owner',
    icon: Building2,
    audience: 'Owners and landlords',
    title: 'Is Your Property Ready to List?',
    text: 'See what to prepare before you submit your property, with practical next steps.',
    minutes: 2,
  },
  {
    slug: 'agent',
    icon: Users,
    audience: 'Agents',
    title: 'Agent Service Profile',
    text: 'Describe the areas you serve and how you work. This is self-reported and not a ranking.',
    minutes: 2,
  },
] as const;

export default function DiscoverPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold text-brand-600">NCR Homes Discover</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Help us get Delhi-NCR housing right</h1>
      <p className="mt-4 max-w-3xl text-lg text-ink-muted">
        Short assessments that turn what you want, or what you offer, into a useful result. No account needed, and your
        answers are never shown publicly.
      </p>

      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {SECTIONS.map((s) => (
          <li key={s.slug}>
            <Card className="flex h-full flex-col p-6">
              <s.icon className="h-7 w-7 text-brand-600" aria-hidden />
              <p className="mt-4 text-sm font-medium text-ink-muted">{s.audience}</p>
              <h2 className="mt-1 text-xl font-semibold">{s.title}</h2>
              <p className="mt-2 flex-1 text-sm text-ink-muted">{s.text}</p>
              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-ink-subtle">About {s.minutes} min</span>
                <Link
                  href={`/discover/${s.slug}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
                  aria-label={`Start: ${s.title}`}
                >
                  Start <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h2 className="text-lg font-semibold">Community Insights</h2>
          <p className="mt-1 text-sm text-ink-muted">Quick polls on what matters most when finding a home in Delhi-NCR.</p>
        </div>
        <Badge tone="neutral">Coming soon</Badge>
      </Card>

      <p className="mt-8 max-w-3xl text-sm text-ink-subtle">
        Everything here is self-reported. Results describe your answers; they are not advice, a property verification or
        a measure of any agent&apos;s performance.
      </p>
    </div>
  );
}
