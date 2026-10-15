import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Camera, Headset, Search } from 'lucide-react';
import { ListingGrid } from '@/components/listing/listing-card';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { publicData } from '@/lib/api/public';
import type { City, PublicListingCard } from '@/lib/api/types';
import { searchHref } from '@/lib/search-params';

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: 'NCR Homes — Buy and rent homes in Delhi-NCR' },
  alternates: { canonical: '/' },
};

const selectClass =
  'h-12 w-full appearance-none rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink focus-visible:border-brand-600';

const TRUST = [
  { icon: BadgeCheck, title: 'Verified listings', text: 'Every property is checked by our team before it goes live.' },
  { icon: Camera, title: 'Real photos', text: 'Listings need real photos and a real price. No bait and switch.' },
  { icon: Headset, title: 'A person to help', text: 'Send an enquiry and our team calls you back, usually the same day.' },
];

export default async function HomePage() {
  let latest: PublicListingCard[] = [];
  let cities: City[] = [];
  const [l, c] = await Promise.allSettled([publicData.latestListings(6), publicData.cities()]);
  if (l.status === 'fulfilled') latest = l.value.data;
  if (c.status === 'fulfilled') cities = c.value;

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-surface">
        <div className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-5xl">Find your next home in Delhi-NCR</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-ink-muted sm:text-lg">
            Browse verified apartments, houses and commercial spaces to buy or rent across Delhi, Noida, Gurugram,
            Ghaziabad and Faridabad.
          </p>

          {/* Plain GET form: works before JavaScript loads and produces shareable URLs. */}
          <form
            action="/search"
            method="get"
            role="search"
            className="mx-auto mt-8 grid max-w-4xl gap-3 rounded-2xl bg-surface p-3 text-left shadow-pop sm:grid-cols-[9rem_1fr_1fr_auto]"
          >
            <div>
              <label htmlFor="h-intent" className="sr-only">
                Buy or rent
              </label>
              <select id="h-intent" name="intent" defaultValue="RENT" className={selectClass}>
                <option value="BUY">Buy</option>
                <option value="RENT">Rent</option>
              </select>
            </div>
            <div>
              <label htmlFor="h-city" className="sr-only">
                City
              </label>
              <select id="h-city" name="city" defaultValue="" className={selectClass}>
                <option value="">All of Delhi-NCR</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.slug}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="h-q" className="sr-only">
                Keyword
              </label>
              <input
                id="h-q"
                name="q"
                type="search"
                minLength={2}
                maxLength={80}
                placeholder="Project, locality or keyword"
                className={`${selectClass} placeholder:text-ink-subtle`}
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Search className="h-4 w-4" aria-hidden />
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6" aria-labelledby="latest-heading">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 id="latest-heading" className="text-2xl font-bold tracking-tight">
              Latest listings
            </h2>
            <p className="mt-1 text-sm text-ink-muted">Freshly added homes, updated through the day.</p>
          </div>
          <Link href="/search" className="hidden items-center gap-1 text-sm font-medium text-brand-600 hover:underline sm:inline-flex">
            View all <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        {latest.length > 0 ? (
          <ListingGrid listings={latest} />
        ) : (
          <EmptyState
            title="New listings are on the way"
            description="We are adding verified homes right now. Check back soon, or send us a message."
            action={<ButtonLink href="/contact">Contact us</ButtonLink>}
          />
        )}
      </section>

      {cities.length > 0 && (
        <section className="bg-surface-muted" aria-labelledby="cities-heading">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
            <h2 id="cities-heading" className="text-2xl font-bold tracking-tight">
              Explore by city
            </h2>
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {cities.map((city) => (
                <li key={city.id}>
                  <Link
                    href={searchHref({ city: city.slug })}
                    className="block rounded-xl border border-border bg-surface px-4 py-5 text-center font-medium shadow-card hover:border-brand-300 hover:text-brand-700"
                  >
                    {city.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6" aria-labelledby="trust-heading">
        <h2 id="trust-heading" className="text-2xl font-bold tracking-tight">
          Why NCR Homes
        </h2>
        <ul className="mt-6 grid gap-6 md:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-xl border border-border p-6">
              <span className="inline-flex rounded-lg bg-brand-50 p-2 text-brand-600">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
