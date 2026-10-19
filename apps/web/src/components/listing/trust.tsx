import { BadgeCheck, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/feedback';
import { formatDate } from '@/lib/format';

/** Compact "Verified" pill for cards and headers. Renders nothing for unverified listings. */
export function VerifiedBadge({ verifiedAt, className }: { verifiedAt: string | null; className?: string }) {
  if (!verifiedAt) return null;
  return (
    <Badge tone="success" className={className}>
      <BadgeCheck className="mr-1 h-3.5 w-3.5" aria-hidden />
      Verified
    </Badge>
  );
}

/** Detail-page trust summary: who verified the home and when availability was last confirmed. */
export function TrustNote({
  verifiedAt,
  verifiedByFirstName,
  lastConfirmedAt,
}: {
  verifiedAt: string | null;
  verifiedByFirstName: string | null;
  lastConfirmedAt: string | null;
}) {
  if (!verifiedAt && !lastConfirmedAt) return null;
  return (
    <ul className="mt-3 space-y-1 text-sm text-ink-muted" aria-label="Listing trust details">
      {verifiedAt && (
        <li className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-success-600" aria-hidden />
          <span>
            Visited and verified by our team on {formatDate(verifiedAt)}
            {verifiedByFirstName ? ` (${verifiedByFirstName})` : ''}
          </span>
        </li>
      )}
      {lastConfirmedAt && (
        <li className="flex items-center gap-2">
          <Clock className="h-4 w-4" aria-hidden />
          <span>Availability last confirmed on {formatDate(lastConfirmedAt)}</span>
        </li>
      )}
    </ul>
  );
}
