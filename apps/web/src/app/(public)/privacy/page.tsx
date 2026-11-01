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
      <h2>NCR Homes Discover</h2>
      <p>
        Discover is a set of short assessments for home seekers, owners and agents. You do not need an account to use
        it, and it does not ask for your name, mobile number or email address.
      </p>
      <ul>
        <li>
          We store your answers and the result we calculate. If you do not save the result to an account, the record is
          not linked to you. Anyone who has your result link can open it, so keep the link private.
        </li>
        <li>
          If you save a result to your account, it is linked to your account. You can delete it, and your saved home
          preferences, at any time from My account, under My preferences.
        </li>
        <li>
          We use answers to prepare your result and, in combined form, to understand what people in Delhi-NCR are
          looking for and to improve search and listing quality. We do not show individual answers publicly, and we do
          not use them for unrelated marketing.
        </li>
        <li>
          Answers are self-reported. A Discover result is not advice, and it does not verify a property, an owner or an
          agent.
        </li>
      </ul>
      <p>
        Community Insights polls work the same way without an account. When you vote we set a random cookie in your
        browser and store a one-way code made from it and the poll, so we can limit repeat votes. The code cannot be
        linked across polls or to you, and we do not store your name or contact details with a vote. If you choose to add
        your area, it is used only for combined results, which are shown for an area once enough people there have
        voted. We do not show individual votes.
      </p>
      <h2>Your choices</h2>
      <p>You can ask us to correct or delete your information by contacting us through the Contact page.</p>
    </StaticPage>
  );
}
