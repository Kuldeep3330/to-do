import { expect, test } from '@playwright/test';
import { SEARCH_FORM, loginAsAdmin, seedListing, waitForHydration } from './helpers';

/**
 * Seeds three published listings that share a unique marker, so every assertion can
 * scope itself with ?q=<marker> regardless of what else is in the database.
 */
const marker = `zq${Date.now().toString(36)}`;
let cheapRent: string;
let pricyRent: string;
let buyFlat: string;

test.describe('public discovery', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    cheapRent = `${marker} Cosy 1BHK`;
    pricyRent = `${marker} Grand 3BHK`;
    buyFlat = `${marker} Family 2BHK`;
    await seedListing(page.request, { title: cheapRent, intent: 'RENT', bedrooms: 1, price: 12000, area: 600, furnishing: 'FURNISHED' });
    await seedListing(page.request, { title: pricyRent, intent: 'RENT', bedrooms: 3, price: 55000, area: 1800 });
    await seedListing(page.request, { title: buyFlat, intent: 'BUY', bedrooms: 2, price: 7_500_000, area: 1100, locality: 'sector-18' });
    // A draft must never appear publicly.
    await seedListing(page.request, { title: `${marker} Hidden Draft`, publish: false });
    await page.close();
  });

  test('home page shows hero search, latest listings and cities', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Find your next home');
    await expect(page.getByRole('heading', { name: 'Latest listings' })).toBeVisible();
    await expect(page.getByRole('article').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Noida', exact: true })).toBeVisible();
  });

  test('hero form searches with a shareable URL', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
    await page.getByLabel('Buy or rent').selectOption('RENT');
    await page.getByLabel('City', { exact: true }).selectOption('noida');
    await page.getByLabel('Keyword').fill(marker);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(new RegExp(`/search\\?intent=RENT&city=noida&q=${marker}`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Homes for rent in Noida');
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(2);
    await expect(page.getByText(`${marker} Hidden Draft`)).toHaveCount(0);
    await expect(page.getByText('2 properties found')).toBeVisible();
  });

  test('cards show price, location, specs and a working photo', async ({ page }) => {
    await page.goto(`/search?q=${marker}&intent=RENT&maxPrice=15000`);
    const card = page.getByRole('article').filter({ hasText: cheapRent });
    await expect(card).toBeVisible();
    await expect(card).toContainText('₹12,000/mo');
    await expect(card).toContainText('Sector 62, Noida');
    await expect(card).toContainText('1 BHK');
    await expect(card).toContainText('600 sq ft');
    await expect(card).toContainText('Furnished');
    await expect(card).toContainText('For rent');

    const img = card.getByRole('img');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(card.getByRole('link')).toHaveAttribute('href', /^\/rent\/noida\/sector-62\//);
  });

  test('filters update the URL, show chips, and can be removed', async ({ page }) => {
    await page.goto(`/search?q=${marker}`);
    await waitForHydration(page, SEARCH_FORM);
    await expect(page.getByRole('article')).toHaveCount(3);

    await page.getByLabel('Looking to').selectOption('BUY');
    await expect(page).toHaveURL(/intent=BUY/);
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('₹75 L');

    await page.getByLabel('City', { exact: true }).selectOption('noida');
    await expect(page.getByLabel('Locality')).toBeEnabled();
    await page.getByLabel('Locality').selectOption('sector-18');
    await expect(page).toHaveURL(/locality=sector-18/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Homes for sale in Sector 18, Noida');
    await expect(page.getByRole('list', { name: 'Active filters' })).toContainText('Sector 18');

    // wrong locality for this seed → empty state with a way out
    await page.getByLabel('Locality').selectOption('sector-62');
    await expect(page.getByRole('heading', { name: 'No homes match your search' })).toBeVisible();

    await page.getByRole('link', { name: 'Remove filter: Sector 62' }).click();
    await expect(page).not.toHaveURL(/locality=/);
    await expect(page.getByRole('article')).toHaveCount(1);

    await page.getByRole('button', { name: 'Clear all filters' }).click();
    await expect(page).not.toHaveURL(/intent=|city=/);
  });

  test('bedroom filter and price presets', async ({ page }) => {
    await page.goto(`/search?q=${marker}&intent=RENT`);
    await waitForHydration(page, SEARCH_FORM);
    await page.getByLabel('Bedrooms').selectOption('3');
    await expect(page).toHaveURL(/bedrooms=3/);
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('Grand 3BHK');

    await page.getByLabel('Bedrooms').selectOption('');
    await page.getByLabel('Max price').selectOption('25000');
    await expect(page).toHaveURL(/maxPrice=25000/);
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('Cosy 1BHK');
  });

  test('price presets are disabled until buy or rent is chosen', async ({ page }) => {
    await page.goto(`/search?q=${marker}`);
    await expect(page.getByLabel('Min price')).toBeDisabled();
    await expect(page.getByText('Choose Buy or Rent to filter by price.')).toBeVisible();
  });

  test('sorting by price orders results', async ({ page }) => {
    await page.goto(`/search?q=${marker}&intent=RENT&sort=price_desc`);
    const titles = page.getByRole('article').getByRole('heading', { level: 3 });
    await expect(titles.first()).toContainText('Grand 3BHK');
    await page.getByLabel('Sort by').selectOption('price_asc');
    await expect(page).toHaveURL(/sort=price_asc/);
    await expect(titles.first()).toContainText('Cosy 1BHK');
  });

  test('no results shows an empty state', async ({ page }) => {
    await page.goto('/search?q=definitelynothingmatchesthis');
    await expect(page.getByRole('heading', { name: 'No homes match your search' })).toBeVisible();
    await page.getByRole('link', { name: 'Clear all filters' }).click();
    await expect(page).toHaveURL(/\/search$/);
  });

  test('garbage params are ignored and absurd pages are handled', async ({ page }) => {
    const ok = await page.goto('/search?intent=NOPE&bedrooms=-4&sort=hax&city=%3Cscript%3E');
    expect(ok?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Homes in Delhi-NCR');

    await page.goto('/search?page=5000');
    await expect(page.getByRole('heading', { name: 'That is further than we can page' })).toBeVisible();
  });

  test('keyword search box applies the query', async ({ page }) => {
    await page.goto('/search');
    await waitForHydration(page, SEARCH_FORM);
    await page.getByRole('searchbox', { name: 'Search by keyword' }).fill(buyFlat);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('list', { name: 'Active filters' })).toBeVisible();
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test('filters open in a sheet and apply together', async ({ page }) => {
      await page.goto(`/search?q=${marker}`);
      await waitForHydration(page, SEARCH_FORM);
      await page.getByRole('button', { name: 'Open filters' }).click();
      const sheet = page.getByRole('dialog', { name: 'Filters' });
      await sheet.getByLabel('Looking to').selectOption('RENT');
      await sheet.getByLabel('Bedrooms').selectOption('1');
      await sheet.getByRole('button', { name: 'Show results' }).click();
      await expect(page).toHaveURL(/intent=RENT/);
      await expect(page).toHaveURL(/bedrooms=1/);
      await expect(page.getByRole('article')).toHaveCount(1);

      // no horizontal scroll
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('mobile menu works', async ({ page }) => {
      await page.goto('/');
      await waitForHydration(page);
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Rent' }).click();
      await expect(page).toHaveURL(/intent=RENT/);
    });
  });
});
