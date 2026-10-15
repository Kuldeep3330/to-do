import type { Metadata } from 'next';
import { DraftNotice, StaticPage } from '@/components/layout/static-page';

export const metadata: Metadata = { title: 'Privacy policy', alternates: { canonical: '/privacy' } };

export default function PrivacyPage() {
  return (
    <StaticPage title="Privacy policy">
      <DraftNotice />
      <h2>What we collect</h2>
      <p>
        When you send an enquiry or create an account we collect your name, mobile number and email address, and any
        message you write. We also keep basic technical logs to keep the site secure.
      </p>
      <h2>How we use it</h2>
      <ul>
        <li>To call or email you about the property you enquired about.</li>
        <li>To run your account, including saved homes and your enquiry history.</li>
        <li>To protect the site against abuse.</li>
      </ul>
      <h2>Your choices</h2>
      <p>You can ask us to correct or delete your information by contacting us through the Contact page.</p>
    </StaticPage>
  );
}
