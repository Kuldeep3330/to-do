import { expect, test } from '@playwright/test';
import { login, loginAsAdmin, waitForHydration } from './helpers';

const stamp = Date.now().toString(36);

test.describe('audit log', () => {
  test('an admin finds a change, filters to it, and opens its details', async ({ page }) => {
    await loginAsAdmin(page);
    // make a known change so there is something recent to find
    const set = await page.request.put('/api/v1/admin/fee-rules/RENT', { data: { method: 'PERCENT', value: 50 } });
    expect(set.ok()).toBe(true);

    await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Audit log' }).click();
    await expect(page).toHaveURL(/\/admin\/audit$/);
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
    await waitForHydration(page, 'main select');

    await page.getByLabel('Filter by action').selectOption('UPDATE_FEE_RULE');
    await expect(page).toHaveURL(/action=UPDATE_FEE_RULE/);
    const first = page.getByRole('row').filter({ hasText: 'Update fee rule' }).first();
    await expect(first).toContainText('Bootstrap Admin');

    await first.getByRole('button', { name: /Show details/ }).click();
    await expect(page.locator('dt', { hasText: 'About' })).toBeVisible();
    await expect(page.getByText('"intent": "RENT"')).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/action=/);
  });

  test('a start date after the end date explains itself', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/audit?from=2026-02-02&to=2026-01-01');
    await expect(page.getByText('The end date is before the start date')).toBeVisible();
  });

  test('a sales agent has no audit log link and the API refuses them', async ({ page, browser }) => {
    await loginAsAdmin(page);
    const email = `audit.agent.${stamp}@example.com`;
    const made = await page.request.post('/api/v1/admin/users', {
      data: { email, name: 'Audit Agent', phone: `+9197${Date.now().toString().slice(-8)}`, password: 'AgentPassword1', role: 'SALES_AGENT' },
    });
    expect(made.ok()).toBe(true);

    const ctx = await browser.newContext();
    const agent = await ctx.newPage();
    await login(agent, email, 'AgentPassword1');
    await expect(agent).toHaveURL(/\/admin$/);
    await expect(agent.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Audit log' })).toHaveCount(0);
    expect((await agent.request.get('/api/v1/admin/audit-logs')).status()).toBe(403);
    await ctx.close();
  });
});
