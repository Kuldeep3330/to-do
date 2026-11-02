import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { DiscoverWizard } from '@/components/discover/discover-wizard';
import type { DiscoverSlug } from '@/lib/discover/types';

const PAGES: Record<DiscoverSlug, { title: string; intro: string }> = {
  customer: {
    title: 'Find Your Home Preferences',
    intro: 'A few questions about where, how much and what matters to you. About 4 minutes.',
  },
  owner: {
    title: 'Is Your Property Ready to List?',
    intro: 'Check what to prepare before you submit your property. About 2 minutes.',
  },
  agent: {
    title: 'NCR Homes Agent Service Profile',
    intro: 'Describe the areas you serve and how you work. Self-reported. About 2 minutes.',
  },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = PAGES[slug as DiscoverSlug];
  if (!page) return {};
  return { title: page.title, description: page.intro, alternates: { canonical: `/discover/${slug}` } };
}

export default async function DiscoverAssessmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = PAGES[slug as DiscoverSlug];
  if (!page) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/discover" className="text-sm text-ink-muted hover:text-brand-700">
        &larr; All Discover assessments
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{page.title}</h1>
      <p className="mb-8 mt-2 text-ink-muted">{page.intro}</p>
      <Suspense>
        <DiscoverWizard slug={slug as DiscoverSlug} />
      </Suspense>
    </div>
  );
}
