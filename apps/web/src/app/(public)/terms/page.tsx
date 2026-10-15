import type { Metadata } from 'next';
import { DraftNotice, StaticPage } from '@/components/layout/static-page';

export const metadata: Metadata = { title: 'Terms of use', alternates: { canonical: '/terms' } };

export default function TermsPage() {
  return (
    <StaticPage title="Terms of use">
      <DraftNotice />
      <h2>Using the site</h2>
      <p>
        Listings are provided for information. Prices, availability and details can change, so please confirm them
        with our team before you decide.
      </p>
      <h2>Your account</h2>
      <p>Keep your password private. You are responsible for activity on your account.</p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Do not misuse the site, scrape it at scale, or attempt to disrupt it.</li>
        <li>Do not submit false or misleading information in an enquiry.</li>
      </ul>
    </StaticPage>
  );
}
