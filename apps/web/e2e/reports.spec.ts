import { expect, test } from '@playwright/test';
import { login, loginAsAdmin } from './helpers';

const stamp = Date.now().toString(36);

test.describe('reports', () => {
  test('an admin reads the funnel, switches range, and exports a table', async ({ page }) => {
    await loginAsAdmin(page);
    // make sure the default window has at least one enquiry
    const listings = (await (await page.request.get('/api/v1/admin/listings?pageSize=1&status=PUBLISHED')).json()).data as { id: string }[];
    test.skip(listings.length === 0, 'needs a published listing');
    const lead = await page.request.post('/api/v1/leads', {
      data: { listingId: listings[0]!.id, name: `Report ${stamp}`, phone: `+9197${Date.now().toString().slice(-8)}` },
    });
    expect(lead.ok()).toBe(true);

    await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/admin\/reports$/);
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

    const numbers = page.getByRole('list', { name: 'Headline numbers' });
    await expect(numbers).toBeVisible();
    await expect(numbers).toContainText('Enquiries');
    await expect(page.getByRole('img', { name: /Enquiries per day/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'From enquiry to deal' })).toContainText('Enquiries received');

    // quick ranges are shareable via the URL, and the default carries no parameters
    await expect(page.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Last 7 days' }).click();
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=|to=\d{4}-\d{2}-\d{2}&from=/);
    await expect(page.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Last 30 days' }).click();
    await expect(page).not.toHaveURL(/from=/);

    // the per-person table has our new, unassigned enquiry and exports as CSV
    const table = page.getByRole('table', { name: 'Results by person' });
    await expect(table).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.getByRole('region', { name: 'By person' }).getByRole('button', { name: 'Export CSV' }).click();
    expect((await downloading).suggestedFilename()).toMatch(/^agents-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);

    // money is part of the page for an admin
    await expect(page.getByRole('region', { name: 'Fees by month' })).toBeVisible();
  });

  test('a backwards date range explains itself', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/reports?from=2026-02-02&to=2026-01-01');
    await expect(page.getByText('The end date is before the start date')).toBeVisible();
  });

  test('a sales agent has no Reports link and the API refuses them', async ({ page, browser }) => {
    await loginAsAdmin(page);
    const email = `reports.agent.${stamp}@example.com`;
    const made = await page.request.post('/api/v1/admin/users', {
      data: { email, name: 'Reports Agent', phone: `+9197${Date.now().toString().slice(-8)}`, password: 'AgentPassword1', role: 'SALES_AGENT' },
    });
    expect(made.ok()).toBe(true);

    const ctx = await browser.newContext();
    const agent = await ctx.newPage();
    await login(agent, email, 'AgentPassword1');
    await expect(agent).toHaveURL(/\/admin$/);
    await expect(agent.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Reports' })).toHaveCount(0);
    expect((await agent.request.get('/api/v1/admin/reports')).status()).toBe(403);
    await ctx.close();
  });
});
