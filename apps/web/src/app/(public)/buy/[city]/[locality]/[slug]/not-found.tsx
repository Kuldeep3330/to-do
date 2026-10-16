import { SearchX } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';

export default function ListingNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20">
      <EmptyState
        icon={SearchX}
        title="This listing is no longer available"
        description="It may have been rented, sold or taken down. Browse similar homes instead."
        action={<ButtonLink href="/search">Browse homes</ButtonLink>}
      />
    </div>
  );
}
