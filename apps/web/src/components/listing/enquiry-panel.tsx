'use client';

import * as React from 'react';
import { MessageSquare } from 'lucide-react';
import { EnquiryForm } from '@/components/forms/enquiry-form';
import { VisitBooking } from '@/components/listing/visit-booking';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Card } from '@/components/ui/feedback';

type Props = { listingId: string; listingSlug: string; listingTitle: string; priceLabel: string };

/** Desktop: sticky card in the sidebar. Mobile: fixed bottom bar that opens the same forms in a sheet. */
export function EnquiryPanel({ listingId, listingSlug, listingTitle, priceLabel }: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Card className="sticky top-24 hidden p-5 lg:block" aria-labelledby="enquiry-heading">
        <h2 id="enquiry-heading" className="text-lg font-semibold">
          Interested in this home?
        </h2>
        <p className="mb-4 mt-1 text-sm text-ink-muted">Leave your details and we will call you back.</p>
        <EnquiryForm idPrefix="enq-d" listingSlug={listingSlug} listingTitle={listingTitle} />
        <div className="mt-5 border-t border-border pt-5">
          <p className="mb-3 text-sm text-ink-muted">Prefer to see it in person? Pick a day and we will arrange it.</p>
          <VisitBooking listingId={listingId} listingTitle={listingTitle} idPrefix="visit-d" className="w-full" />
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 shadow-pop lg:hidden">
        <p className="min-w-0 truncate text-lg font-bold">{priceLabel}</p>
        <div className="flex shrink-0 items-center gap-2">
          <VisitBooking listingId={listingId} listingTitle={listingTitle} idPrefix="visit-m" size="md" compact />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="md">
                <MessageSquare className="h-4 w-4" aria-hidden />
                Contact
              </Button>
            </DialogTrigger>
            <DialogContent title="Request a call back" description={listingTitle} side="bottom">
              {open && <EnquiryForm idPrefix="enq-m" listingSlug={listingSlug} listingTitle={listingTitle} />}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </>
  );
}
