import { expect, test } from '@playwright/test';
import { login, loginAsAdmin } from './helpers';

const stamp = Date.now().toString(36);

test.describe('system health and data quality', () => {
  test('an admin sees the platform is healthy and what each check says', async ({ page }) => {
    await loginAsAdmin(page);
    const nav = page.getByRole('navigation', { name: 'Admin' });
    for (const group of ['Oversight']) await expect(nav.getByText(group, { exact: true })).toBeVisible();
    await nav.getByRole('link', { name: 'System health' }).click();

    await expect(page).toHaveURL(/\/admin\/system$/);
    await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
    await expect(page.getByText('Everything is working.')).toBeVisible();

    const checks = page.getByRole('list', { name: 'Checks' });
    await expect(checks.getByRole('listitem').filter({ hasText: 'Database' })).toContainText('Working');
    await expect(checks.getByRole('listitem').filter({ hasText: 'Photo storage' })).toContainText('Working');
    await expect(checks.getByRole('listitem').filter({ hasText: 'Email' })).toBeVisible();

    await expect(page.getByText('Lead response target')).toBeVisible();
    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.getByText('Everything is working.')).toBeVisible();
  });

  test('data quality lists problems with a way to fix each one', async ({ page }) => {
    await loginAsAdmin(page);
    // an enquiry nobody owns is one of the checks; create one so the list is never empty
    const listings = (await (await page.request.get('/api/v1/admin/listings?pageSize=1&status=PUBLISHED')).json()).data as { id: string }[];
    test.skip(listings.length === 0, 'needs a published listing');
    const lead = await page.request.post('/api/v1/leads', {
      data: { listingId: listings[0]!.id, name: `Quality ${stamp}`, phone: `+9197${Date.now().toString().slice(-8)}` },
    });
    expect(lead.ok()).toBe(true);

    await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Data quality' }).click();
    await expect(page).toHaveURL(/\/admin\/data-quality$/);
    await expect(page.getByRole('heading', { name: 'Data quality' })).toBeVisible();
    const issues = page.getByRole('list', { name: 'Issues' });
    await expect(issues).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /need(s)? attention/ })).toBeVisible();

    // each item links to the thing to fix
    const first = issues.getByRole('link').first();
    await expect(first).toHaveAttribute('href', /\/admin\/(leads|listings|visits)/);
  });

  test('a sales agent has no oversight links and the API refuses them', async ({ page, browser }) => {
    await loginAsAdmin(page);
    const email = `system.agent.${stamp}@example.com`;
    const made = await page.request.post('/api/v1/admin/users', {
      data: { email, name: 'System Agent', phone: `+9197${Date.now().toString().slice(-8)}`, password: 'AgentPassword1', role: 'SALES_AGENT' },
    });
    expect(made.ok()).toBe(true);

    const ctx = await browser.newContext();
    const agent = await ctx.newPage();
    await login(agent, email, 'AgentPassword1');
    await expect(agent).toHaveURL(/\/admin$/);
    const nav = agent.getByRole('navigation', { name: 'Admin' });
    for (const name of ['System health', 'Data quality', 'Audit log']) await expect(nav.getByRole('link', { name })).toHaveCount(0);
    expect((await agent.request.get('/api/v1/admin/system/health')).status()).toBe(403);
    expect((await agent.request.get('/api/v1/admin/system/data-quality')).status()).toBe(403);
    await ctx.close();
  });
});
