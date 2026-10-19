import { expect, test } from '@playwright/test';
import { loginAsAdmin, seedListing, waitForHydration } from './helpers';

const marker = `lr${Date.now().toString(36)}`;
const title = `${marker} Corner 1BHK`;
let slug = '';

test.describe('lead response timer', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    const l = await seedListing(page.request, { title, intent: 'RENT', bedrooms: 1, price: 15000 });
    slug = l.slug;
    await page.close();
  });

  test('a new lead shows its deadline, then how fast it was answered', async ({ page }) => {
    const name = `Timer ${marker}`;
    const phone = `+919${`${Date.now()}`.slice(-9)}`;
    await loginAsAdmin(page);
    const created = await page.request.post('/api/v1/leads', { data: { listingSlug: slug, name, phone } });
    expect(created.ok()).toBe(true);

    await page.goto('/admin/leads');
    await waitForHydration(page, 'main select');
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toContainText('Respond within');
    await expect(row).not.toContainText('Overdue');

    await row.getByRole('link', { name }).click();
    await expect(page).toHaveURL(/\/admin\/leads\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText(/Respond within/)).toBeVisible();
    await waitForHydration(page, '#lead-status');
    await page.getByLabel('Status').selectOption('CONTACTED');
    await expect(page.getByText('Marked contacted')).toBeVisible();
    await expect(page.getByText(/Answered in/)).toBeVisible();

    await page.goto('/admin/leads');
    await waitForHydration(page, 'main select');
    await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Answered in');
  });

  test('the overdue filter is shareable via the URL and the dashboard links to it', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/leads');
    await waitForHydration(page, 'main select');
    // The checkbox is driven by the URL, so it flips after navigation rather than instantly.
    await page.getByLabel('Overdue only').click();
    await expect(page).toHaveURL(/overdue=true/);
    await expect(page.getByLabel('Overdue only')).toBeChecked();
    // every row left (if any) is overdue and nothing that was just answered is listed
    const rows = page.getByRole('row').filter({ hasText: /Respond within|Answered in/ });
    await expect(rows).toHaveCount(0);

    await page.goto('/admin');
    const tile = page.getByRole('link', { name: /Overdue leads/ });
    await expect(tile).toBeVisible();
    await expect(page.getByText('Median first response')).toBeVisible();
    await tile.click();
    await expect(page).toHaveURL(/\/admin\/leads\?overdue=true/);
  });
});
