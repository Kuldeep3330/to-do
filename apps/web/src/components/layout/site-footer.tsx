import Link from 'next/link';
import { Building2 } from 'lucide-react';

const COLUMNS = [
  {
    title: 'Explore',
    links: [
      { href: '/search?intent=BUY', label: 'Buy a home' },
      { href: '/search?intent=RENT', label: 'Rent a home' },
      { href: '/search?type=COMMERCIAL', label: 'Commercial' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About us' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms of use' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface-muted">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div>
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-brand-700">
            <Building2 className="h-6 w-6" aria-hidden />
            NCR Homes
          </Link>
          <p className="mt-3 max-w-xs text-sm text-ink-muted">
            Buy and rent homes across Delhi-NCR with verified listings and a real person to help.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-semibold text-ink">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-ink-muted hover:text-brand-700">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-ink-subtle">
        © {new Date().getFullYear()} NCR Homes. All rights reserved.
      </div>
    </footer>
  );
}
