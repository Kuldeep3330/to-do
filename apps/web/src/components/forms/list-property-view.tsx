'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { OwnerEnquiryForm } from '@/components/forms/owner-enquiry-form';
import { SelfListWizard } from '@/components/forms/self-list-wizard';
import { cn } from '@/lib/utils';

type Mode = 'help' | 'self';

const HELP_STEPS = [
  {
    title: 'You tell us about the home',
    text: 'City, locality, and how we can reach you. A few details about size and expected rent or price help.',
  },
  {
    title: 'We visit',
    text: 'A person from our team comes to see the home, take real photos and confirm the price.',
  },
  {
    title: 'It goes live',
    text: 'Once verified, the listing appears on NCR Homes. Enquiries come to us, not a crowd of brokers.',
  },
];

export function ListPropertyView() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get('mode') === 'self' ? 'self' : 'help';
  const [mode, setMode] = React.useState<Mode>(initial);

  React.useEffect(() => {
    setMode(params.get('mode') === 'self' ? 'self' : 'help');
  }, [params]);

  function choose(next: Mode) {
    setMode(next);
    router.replace(next === 'self' ? '/list-property?mode=self' : '/list-property', { scroll: false });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold text-brand-600">For owners and landlords</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">List your property with NCR Homes</h1>
      <p className="mt-4 max-w-3xl text-lg text-ink-muted">
        Ask our team to list it, or list it yourself. Either way, a person visits within 2 days. Listings that are not
        genuine are paused.
      </p>
      <div
        role="tablist"
        aria-label="How do you want to list"
        className="mt-8 grid max-w-lg grid-cols-2 gap-2 rounded-xl bg-surface-muted p-1"
      >
        <ModeButton active={mode === 'help'} onClick={() => choose('help')}>
          Help me list
        </ModeButton>
        <ModeButton active={mode === 'self'} onClick={() => choose('self')}>
          I will list it
        </ModeButton>
      </div>

      {mode === 'help' ? (
        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_28rem]">
          <ol className="space-y-6">
            {HELP_STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                  {i + 1}
                </span>
                <div>
                  <h2 className="font-semibold text-ink">{step.title}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
            <h2 className="text-lg font-semibold">Request a listing visit</h2>
            <p className="mb-6 mt-1 text-sm text-ink-muted">We will call you, usually the same working day.</p>
            <OwnerEnquiryForm />
          </div>
        </div>
      ) : (
        <div className="mt-10">
          <h2 className="text-lg font-semibold">List it yourself</h2>
          <p className="mb-6 mt-1 text-sm text-ink-muted">Add the home, photos and price, then publish.</p>
          <SelfListWizard />
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-lg px-3 py-2 text-sm font-medium',
        active ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
