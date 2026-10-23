import * as React from 'react';
import Link from 'next/link';
import { Avatar } from './avatar';

/** Avatar + name (optionally a link) + one muted line. The standard "who" cell in admin tables. */
export function PersonCell({ name, sub, href }: { name: string; sub?: React.ReactNode; href?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} />
      <div className="min-w-0">
        {href ? (
          <Link href={href} className="block truncate font-medium text-ink hover:text-brand-700">
            {name}
          </Link>
        ) : (
          <p className="truncate font-medium text-ink">{name}</p>
        )}
        {sub && <p className="truncate text-xs text-ink-subtle">{sub}</p>}
      </div>
    </div>
  );
}
