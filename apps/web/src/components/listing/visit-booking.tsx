'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { CalendarPlus } from 'lucide-react';
import { VisitForm } from '@/components/forms/visit-form';
import { Button, ButtonLink } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useMe } from '@/lib/auth/use-auth';

type Props = {
  listingId: string;
  listingTitle: string;
  idPrefix: string;
  variant?: 'outline' | 'primary';
  size?: 'md' | 'lg';
  className?: string;
  /** Short label for tight spaces such as the mobile bottom bar. */
  compact?: boolean;
};

/** Signed-in customers get the visit form in a dialog; guests are sent to sign in and brought back here. */
export function VisitBooking({
  listingId,
  listingTitle,
  idPrefix,
  variant = 'outline',
  size = 'lg',
  className,
  compact = false,
}: Props) {
  const { data: me } = useMe();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  if (!me) {
    return (
      <ButtonLink
        href={`/login?next=${encodeURIComponent(pathname)}`}
        variant={variant}
        size={size}
        className={className}
      >
        <CalendarPlus className="h-4 w-4" aria-hidden />
        {compact ? 'Visit' : 'Sign in to book a visit'}
      </ButtonLink>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <CalendarPlus className="h-4 w-4" aria-hidden />
          {compact ? 'Visit' : 'Book a visit'}
        </Button>
      </DialogTrigger>
      <DialogContent title="Book a visit" description={listingTitle}>
        {open && <VisitForm listingId={listingId} listingTitle={listingTitle} idPrefix={idPrefix} />}
      </DialogContent>
    </Dialog>
  );
}
