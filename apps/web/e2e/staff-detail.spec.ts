import { expect, test } from '@playwright/test';
import { loginAsAdmin, waitForHydration } from './helpers';

const stamp = Date.now().toString(36);

test.describe('staff profile', () => {
  test('an admin opens a person from the list, sees their numbers, and disables then enables them', async ({ page }) => {
    await loginAsAdmin(page);
    const email = `profile.agent.${stamp}@example.com`;
    const made = await page.request.post('/api/v1/admin/users', {
      data: { email, name: `Profile Agent ${stamp}`, phone: `+9197${Date.now().toString().slice(-8)}`, password: 'AgentPassword1', role: 'SALES_AGENT' },
    });
    expect(made.ok()).toBe(true);
    const id = (await made.json()).data.id as string;

    await page.goto('/admin/users');
    await waitForHydration(page, 'main select');
    await page.getByRole('link', { name: `Profile Agent ${stamp}` }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/users/${id}$`));
    await expect(page.getByRole('heading', { name: `Profile Agent ${stamp}` })).toBeVisible();

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs).toContainText('Staff');
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText('Last active')).toBeVisible();
    await expect(page.getByText('Never')).toBeVisible();

    const numbers = page.getByRole('list', { name: 'Lead numbers' });
    await expect(numbers.getByRole('link', { name: /Assigned/ })).toContainText('0');
    await expect(page.getByText('No leads are assigned to this person.')).toBeVisible();

    await page.getByRole('button', { name: 'Disable account' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Disable' }).click();
    await expect(page.getByText(/signed out and disabled/).first()).toBeVisible();
    await expect(page.getByText('This account is disabled')).toBeVisible();

    await page.getByRole('button', { name: 'Enable account' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Enable' }).click();
    await expect(page.getByText('This account is disabled')).toHaveCount(0);

    // "Full history" opens the audit log already filtered to this person
    await page.getByRole('link', { name: 'Full history' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/audit\\?actorId=${id}`));
  });

  test('nobody can disable themselves from their own profile, and unknown people are a 404', async ({ page }) => {
    await loginAsAdmin(page);
    const me = (await (await page.request.get('/api/v1/me')).json()).data as { id: string };
    await page.goto(`/admin/users/${me.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Disable account|Enable account/ })).toHaveCount(0);

    await page.goto('/admin/users/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
});
