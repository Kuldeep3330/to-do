import type { Metadata } from 'next';
import { SavedView } from '@/components/account/account-views';

export const metadata: Metadata = { title: 'Saved homes' };

export default function SavedPage() {
  return <SavedView />;
}
