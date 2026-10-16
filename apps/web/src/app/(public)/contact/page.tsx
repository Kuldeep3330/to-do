import type { Metadata } from 'next';
import { StaticPage } from '@/components/layout/static-page';
import { ButtonLink } from '@/components/ui/button';
import { contact } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Get in touch with the NCR Homes team.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <StaticPage title="Contact us" intro="The fastest way to reach us is to enquire about a property you like.">
      <p>
        Open any listing and choose <strong>Request a call back</strong>. Our team will phone you, usually within a few
        hours during working days.
      </p>
      {(contact.email || contact.phone) && (
        <ul>
          {contact.email && (
            <li>
              Email: <a href={`mailto:${contact.email}`}>{contact.email}</a>
            </li>
          )}
          {contact.phone && (
            <li>
              Phone: <a href={`tel:${contact.phone.replace(/\s/g, '')}`}>{contact.phone}</a>
            </li>
          )}
        </ul>
      )}
      <ButtonLink href="/search" className="no-underline">
        Browse homes
      </ButtonLink>
    </StaticPage>
  );
}
