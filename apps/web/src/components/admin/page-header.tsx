import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-sm text-ink-subtle">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={b.label}>
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
              {b.href ? (
                <Link href={b.href} className="hover:text-brand-700">
                  {b.label}
                </Link>
              ) : (
                <span aria-current="page">{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
