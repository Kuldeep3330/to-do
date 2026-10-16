import type { ReactNode } from 'react';

export function StaticPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {intro && <p className="mt-3 text-lg text-ink-muted">{intro}</p>}
      <div className="mt-8 space-y-6 leading-relaxed text-ink-muted [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_a]:text-brand-600 [&_a]:underline">
        {children}
      </div>
    </div>
  );
}

/** Shown on legal pages until counsel has reviewed the text. */
export function DraftNotice() {
  return (
    <p className="rounded-lg border border-warning-600/30 bg-warning-50 p-3 text-sm text-warning-600" role="note">
      Draft text. This page must be reviewed by a qualified professional before the site launches.
    </p>
  );
}
