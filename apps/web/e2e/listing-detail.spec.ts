import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, seedListing, waitForHydration } from './helpers';

const marker = `ld${Date.now().toString(36)}`;
const title = `${marker} Sunny 3BHK near Metro`;
const XSS = '<script>window.__pwned = true</script><img src=x onerror="window.__pwned=true">';
let slug = '';
let draftSlug = '';
let listingId = '';

const detailPath = () => `/rent/noida/sector-62/${slug}`;

async function openDetail(page: Page, path = detailPath()) {
  await page.goto(path);
  await waitForHydration(page, 'section[aria-roledescription="carousel"] button');
}

test.describe('listing detail page', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    const listing = await seedListing(page.request, {
      title,
      intent: 'RENT',
      bedrooms: 3,
      area: 1450,
      price: 38000,
      furnishing: 'SEMI',
      photos: 2,
      description: `Bright corner flat.\nSecond line.\n${XSS}`,
    });
    slug = listing.slug;
    listingId = listing.id;
    const draft = await seedListing(page.request, { title: `${marker} Draft only`, publish: false });
    draftSlug = draft.slug;
    await page.close();
  });

  test('shows the listing with price, specs, description and gallery', async ({ page }) => {
    await openDetail(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByText('₹38,000/mo').first()).toBeVisible();
    await expect(page.getByText('Sector 62, Noida').first()).toBeVisible();

    const overview = page.getByRole('region', { name: 'Overview' });
    await expect(overview).toContainText('3 BHK');
    await expect(overview).toContainText('1,450 sq ft');
    await expect(overview).toContainText('Semi');

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Noida' })).toHaveAttribute('href', '/rent/noida');

    // gallery: two photos, keyboard + buttons browse them
    const carousel = page.getByRole('region', { name: 'Property photos' });
    await expect(carousel.getByText('1 / 2')).toBeVisible();
    await carousel.getByRole('button', { name: 'Next photo' }).click();
    await expect(carousel.getByText('2 / 2')).toBeVisible();
    await carousel.getByRole('button', { name: 'Show photo 1' }).click();
    await expect(carousel.getByText('1 / 2')).toBeVisible();
    await carousel.locator('[tabindex="0"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(carousel.getByText('2 / 2')).toBeVisible();
    await expect(carousel.getByRole('img', { name: /photo 2 of 2/ }).first()).toBeVisible();
  });

  test('renders visitor-style HTML in the description as plain text', async ({ page }) => {
    await openDetail(page);
    await expect(page.getByText('<script>window.__pwned = true</script>', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
    await expect(page.locator('main img[src="x"]')).toHaveCount(0);
  });

  test('has SEO metadata: title, canonical, Open Graph and valid JSON-LD', async ({ page }) => {
    await page.goto(detailPath());
    await expect(page).toHaveTitle(`${title} | Sector 62 | Noida | NCR Homes`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${detailPath()}$`));
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https?:\/\//);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Bright corner flat/);

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const docs = blocks.map((b) => JSON.parse(b));
    const listing = docs.find((d) => d['@type'] === 'RealEstateListing');
    expect(listing.name).toBe(title);
    expect(listing.offers).toMatchObject({ price: 38000, priceCurrency: 'INR' });
    expect(listing.about.address).toMatchObject({ addressLocality: 'Sector 62', addressRegion: 'Noida' });
    expect(JSON.stringify(docs)).not.toContain('aggregateRating');
    expect(docs.find((d) => d['@type'] === 'BreadcrumbList').itemListElement).toHaveLength(4);
    // the page source must never contain an unescaped closing script tag from user content
    const html = await (await page.request.get(detailPath())).text();
    expect(html).not.toContain('<script>window.__pwned');
  });

  test('redirects a wrong path to the canonical URL', async ({ page }) => {
    const res = await page.goto(`/buy/delhi/dwarka/${slug}`);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${detailPath()}$`));
  });

  test('draft and unknown slugs return a real 404', async ({ page }) => {
    for (const path of [`/rent/noida/sector-62/${draftSlug}`, '/rent/noida/sector-62/does-not-exist-123']) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole('heading', { name: /no longer available/i })).toBeVisible();
      // Assert on the server response (what crawlers receive), not the post-hydration DOM.
      const html = await (await page.request.get(path)).text();
      expect(html).toMatch(/<meta name="robots" content="noindex"/);
    }
  });

  test('a paused listing disappears; sitemap and robots behave', async ({ page }) => {
    const sitemap = await (await page.request.get('/sitemap.xml')).text();
    // The sitemap is cached (ISR, up to an hour), so a listing created seconds ago may not be in it yet.
    // What must always hold: real listing URLs are present, static pages are present, drafts never are.
    expect(sitemap).toMatch(/<loc>[^<]*\/(rent|buy)\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+<\/loc>/);
    expect(sitemap).toContain('/about');
    expect(sitemap).not.toContain(draftSlug);

    const robots = await (await page.request.get('/robots.txt')).text();
    expect(robots).toMatch(/Disallow: \/admin/);
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);

    await loginAsAdmin(page);
    expect((await page.request.post(`/api/v1/admin/listings/${listingId}/pause`)).status()).toBe(200);
    // ISR may serve a cached page for up to the revalidate window; the API is authoritative immediately.
    expect((await page.request.get(`/api/v1/listings/${slug}`)).status()).toBe(404);
    expect((await page.request.post(`/api/v1/admin/listings/${listingId}/publish`)).status()).toBe(200);
  });

  test('listing cards link to the detail page', async ({ page }) => {
    await page.goto(`/search?q=${marker}&intent=RENT`);
    await page.getByRole('article').filter({ hasText: title }).getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(`${detailPath()}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  });
});
