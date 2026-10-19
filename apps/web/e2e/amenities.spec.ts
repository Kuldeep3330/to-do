import { expect, test } from '@playwright/test';
import { loginAsAdmin, seedListing } from './helpers';

const marker = `am${Date.now().toString(36)}`;
let withSlug = '';
let withoutSlug = '';
const detail = (slug: string) => `/rent/noida/sector-62/${slug}`;

test.describe('amenities on the listing page', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    withSlug = (
      await seedListing(page.request, { title: `${marker} With amenities`, amenities: ['gym', 'lift', 'park'] })
    ).slug;
    withoutSlug = (await seedListing(page.request, { title: `${marker} Bare` })).slug;
    await page.close();
  });

  test('shows the property amenities, alphabetically, and puts them in the structured data', async ({ page }) => {
    await page.goto(detail(withSlug));
    const section = page.getByRole('region', { name: 'Amenities' });
    await expect(section).toBeVisible();
    const items = section.getByRole('listitem');
    await expect(items).toHaveText(['Gym', 'Lift', 'Park']);

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const listing = ld.map((t) => JSON.parse(t)).find((j) => j['@type'] === 'RealEstateListing');
    expect(listing.about.amenityFeature.map((f: { name: string }) => f.name)).toEqual(['Gym', 'Lift', 'Park']);
  });

  test('a listing without amenities has no empty Amenities section', async ({ page }) => {
    await page.goto(detail(withoutSlug));
    await expect(page.getByRole('heading', { name: `${marker} Bare` })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Amenities' })).toHaveCount(0);
  });
});
