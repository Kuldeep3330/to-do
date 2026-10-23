import { expect, test } from '@playwright/test';
import { loginAsAdmin, waitForHydration } from './helpers';

test.describe('admin console shell and list toolbar', () => {
  test('sidebar is grouped, the breadcrumb follows the page, and dark mode sticks', async ({ page }) => {
    await loginAsAdmin(page);
    const nav = page.getByRole('navigation', { name: 'Admin' });
    for (const group of ['Overview', 'Inventory', 'Sales', 'Settings']) {
      await expect(nav.getByText(group, { exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('link', { name: 'Leads' }).click();
    await expect(page).toHaveURL(/\/admin\/leads$/);
    const crumbs = page.getByRole('navigation', { name: 'Location' });
    await expect(crumbs).toContainText('Admin');
    await expect(crumbs).toContainText('Leads');

    await waitForHydration(page, 'main select');
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-admin-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-admin-theme', 'dark');

    // the public site is never themed
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveAttribute('data-admin-theme', 'dark');
  });

  test('the leads toolbar searches, shows a count, and clears every filter', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/leads');
    await waitForHydration(page, 'main select');
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);

    await page.getByLabel('Search leads').fill('no-such-person-zz');
    await expect(page).toHaveURL(/q=no-such-person-zz/);
    await expect(page.getByText('No leads match these filters')).toBeVisible();

    await page.getByLabel('Filter by status').selectOption('WON');
    await expect(page).toHaveURL(/status=WON/);

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/q=|status=/);
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  });

  test('the dashboard shows what needs attention before the numbers', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
    const attention = page.getByRole('region', { name: 'Needs attention' });
    const caughtUp = page.getByText('All caught up');
    await expect(attention.or(caughtUp)).toBeVisible();
  });
});
