import type { Metadata } from 'next';
import { StaticPage } from '@/components/layout/static-page';

export const metadata: Metadata = {
  title: 'About us',
  description: 'NCR Homes helps people buy and rent homes across Delhi-NCR with verified listings and a real person to help.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <StaticPage title="About NCR Homes" intro="Finding a home in Delhi-NCR should not feel like a gamble.">
      <p>
        NCR Homes lists apartments, houses and commercial spaces to buy or rent across Delhi, Noida, Gurugram,
        Ghaziabad and Faridabad. Owners can list a home themselves or ask our team to visit. We check every listing
        within 2 days, so you see real photos, a real price and the real locality.
      </p>
      <h2>How it works</h2>
      <ul>
        <li>Search by city, locality, budget and size.</li>
        <li>Open a listing to see photos, details and the price.</li>
        <li>Send an enquiry and our team calls you back to arrange a visit.</li>
      </ul>
      <h2>For owners</h2>
      <p>
        If you want your home on NCR Homes, <a href="/list-property">list it yourself or ask us to visit</a>. A person
        from our team visits within 2 days. Listings that are not genuine are paused.
      </p>
    </StaticPage>
  );
}
