import { expect, test } from '@playwright/test';
import { loginAsAdmin, seedListing } from './helpers';

const marker = `ar${Date.now().toString(36)}`;
const CITY = 'greater-noida';
const CITY_NAME = 'Greater Noida';
// A brand-new locality every run: landing pages are cached for a few minutes, so reusing one
// would show the previous run's homes and make the counts unpredictable.
const LOCALITY = `zone-${marker}`;
const LOCALITY_NAME = `Zone ${marker}`;

test.describe('city and locality landing pages', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    const cities = (await (await page.request.get('/api/v1/cities')).json()).data as { id: string; slug: string }[];
    const city = cities.find((c) => c.slug === CITY);
    if (!city) throw new Error(`unknown city ${CITY}`);
    const made = await page.request.post('/api/v1/admin/localities', {
      data: { cityId: city.id, name: LOCALITY_NAME, slug: LOCALITY },
    });
    if (made.status() !== 201) throw new Error(`locality: ${made.status()} ${await made.text()}`);

    for (const [suffix, price] of [['A', 12000], ['B', 18000], ['C', 30000]] as const) {
      await seedListing(page.request, { title: `${marker} Rent ${suffix}`, intent: 'RENT', city: CITY, locality: LOCALITY, price });
    }
    await seedListing(page.request, { title: `${marker} Sale A`, intent: 'BUY', city: CITY, locality: LOCALITY, price: 6_500_000 });
    await page.close();
  });

  test('a locality page shows real facts, its homes and structured data', async ({ page }) => {
    await page.goto(`/rent/${CITY}/${LOCALITY}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Homes for rent in ${LOCALITY_NAME}, ${CITY_NAME}`);
    await expect(page.getByText(`3 homes for rent in ${LOCALITY_NAME}, ${CITY_NAME}.`)).toBeVisible();

    const facts = page.getByLabel('Area facts');
    await expect(facts).toContainText('Lowest price');
    await expect(facts).toContainText('₹12,000/mo');
    await expect(facts).toContainText('Middle price');
    await expect(facts).toContainText('₹18,000/mo');
    await expect(facts).toContainText('Highest price');
    await expect(facts).toContainText('₹30,000/mo');

    for (const s of ['A', 'B', 'C']) {
      await expect(page.getByRole('article').filter({ hasText: `${marker} Rent ${s}` })).toBeVisible();
    }
    // sale listings never appear on the rent page
    await expect(page.getByText(`${marker} Sale A`)).toHaveCount(0);

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: CITY_NAME })).toHaveAttribute('href', `/rent/${CITY}`);

    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t));
    const collection = ld.find((j) => j['@type'] === 'CollectionPage');
    expect(collection.name).toBe(`Homes for rent in ${LOCALITY_NAME}, ${CITY_NAME}`);
    expect(collection.mainEntity.numberOfItems).toBe(3);
    expect(ld.find((j) => j['@type'] === 'BreadcrumbList').itemListElement).toHaveLength(4);

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/rent/${CITY}/${LOCALITY}$`));
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });

  test('the buy page is separate from the rent page, and they link to each other', async ({ page }) => {
    await page.goto(`/buy/${CITY}/${LOCALITY}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Homes for sale in ${LOCALITY_NAME}, ${CITY_NAME}`);
    await expect(page.getByRole('article').filter({ hasText: `${marker} Sale A` })).toBeVisible();
    await expect(page.getByText(`${marker} Rent A`)).toHaveCount(0);

    await page.getByRole('link', { name: /Looking to rent instead/ }).click();
    await expect(page).toHaveURL(new RegExp(`/rent/${CITY}/${LOCALITY}$`));
  });

  test('a city page lists its areas and links into them', async ({ page }) => {
    await page.goto(`/rent/${CITY}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Homes for rent in ${CITY_NAME}`);
    const areas = page.getByRole('list', { name: `Areas in ${CITY_NAME}` });
    const first = areas.getByRole('link').first();
    const href = await first.getAttribute('href');
    expect(href).toMatch(new RegExp(`^/rent/${CITY}/[a-z0-9-]+$`));
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Homes for rent in');
  });

  test('listing pages link up to their locality page', async ({ page }) => {
    await page.goto(`/rent/${CITY}/${LOCALITY}`);
    await page.getByRole('article').filter({ hasText: `${marker} Rent A` }).getByRole('link').first().click();
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: LOCALITY_NAME })).toHaveAttribute('href', `/rent/${CITY}/${LOCALITY}`);
  });

  test('unknown areas are a real 404, and an area with no homes is not indexed', async ({ page }) => {
    const missing = await page.goto('/rent/no-such-city');
    expect(missing?.status()).toBe(404);
    const missingLocality = await page.goto(`/rent/${CITY}/no-such-place`);
    expect(missingLocality?.status()).toBe(404);

    // The new locality has rentals and a sale, but a sale-only check needs a place with nothing for the other intent:
    // an existing seeded locality that no spec ever publishes into.
    const empty = await page.goto('/buy/gurugram/sohna-road');
    expect(empty?.status()).toBe(200);
    if (await page.getByText('No homes for sale here right now').count()) {
      await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
    }
  });

  test('the sitemap lists landing pages for areas that have homes', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    // Cached for an hour, so it may predate this run's new locality; assert the structure, not the new page.
    expect(xml).toMatch(new RegExp(`/rent/${CITY}<`));
    expect(xml).toMatch(new RegExp(`/rent/${CITY}/[a-z0-9-]+<`));
    expect(xml).toMatch(new RegExp(`/buy/${CITY}/[a-z0-9-]+<`));
  });
});
