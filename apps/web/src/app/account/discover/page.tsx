import type { Metadata } from 'next';
import { DiscoverProfileView } from '@/components/account/discover-profile';

export const metadata: Metadata = { title: 'My home preferences' };

export default function AccountDiscoverPage() {
  return <DiscoverProfileView />;
}
