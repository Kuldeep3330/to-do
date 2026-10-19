import { expect, test } from '@playwright/test';
import { loginAsAdmin, seedListing, waitForHydration } from './helpers';

const marker = `dl${Date.now().toString(36)}`;
const title = `${marker} Garden 2BHK`;
let slug = '';

test.describe('deal tracking', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    const l = await seedListing(page.request, { title, intent: 'RENT', bedrooms: 2, price: 28000 });
    slug = l.slug;
    await page.close();
  });

  test('marking a lead won asks for the deal, shows it, lets staff correct it, and clears it when reopened', async ({ page }) => {
    const name = `Deal ${marker}`;
    const phone = `+919${`${Date.now()}`.slice(-9)}`;
    await loginAsAdmin(page);
    expect((await page.request.post('/api/v1/leads', { data: { listingSlug: slug, name, phone } })).ok()).toBe(true);

    await page.goto('/admin/leads');
    await waitForHydration(page, 'main select');
    await page.getByRole('row').filter({ hasText: name }).getByRole('link', { name }).click();
    await expect(page).toHaveURL(/\/admin\/leads\/[0-9a-f-]{36}$/);
    await waitForHydration(page, '#lead-status');

    // choosing Won opens the dialog instead of changing the status straight away
    await page.getByLabel('Status').selectOption('WON');
    const dialog = page.getByRole('dialog', { name: 'Mark lead as won' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#lead-status')).toHaveValue('NEW');
    await expect(dialog.getByLabel(/Monthly rent agreed/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Mark as won' }).click();
    await expect(dialog.getByText('Enter the amount agreed')).toBeVisible();

    await dialog.getByLabel(/Monthly rent agreed/).fill('27,500');
    await dialog.getByRole('button', { name: 'Mark as won' }).click();
    await expect(page.getByText('Marked won')).toBeVisible();
    await expect(page.locator('#lead-status')).toHaveValue('WON');

    const deal = page.getByRole('heading', { name: 'Deal', exact: true });
    await expect(deal).toBeVisible();
    await expect(page.getByText('₹27,500')).toBeVisible();

    // correct the amount
    await page.getByRole('button', { name: 'Edit deal' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit deal' });
    await edit.getByLabel(/Monthly rent agreed/).fill('26000');
    await edit.getByRole('button', { name: 'Save deal' }).click();
    await expect(page.getByText('Deal saved')).toBeVisible();
    await expect(page.getByText('₹26,000')).toBeVisible();

    // persists across a reload
    await page.reload();
    await expect(page.getByText('₹26,000')).toBeVisible();

    // reopening the lead removes the deal
    await waitForHydration(page, '#lead-status');
    await page.getByLabel('Status').selectOption('QUALIFIED');
    await expect(page.getByText('Marked qualified')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Deal', exact: true })).toHaveCount(0);
  });

  test('the dashboard shows deals won and the value won', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    await expect(page.getByText('Deals won')).toBeVisible();
    await expect(page.getByText('Rent won (per month)')).toBeVisible();
    await expect(page.getByText('Sales won')).toBeVisible();
  });
});
