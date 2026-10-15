import { expect, test } from '@playwright/test';
import { ADMIN, login, loginAsAdmin, seedListing, waitForHydration } from './helpers';

const marker = `st${Date.now().toString(36)}`;

test.describe('staff management and role scoping', () => {
  test('admin adds an agent; the agent sees only assigned leads', async ({ page, browser }) => {
    const agentEmail = `agent.${marker}@example.com`;
    const agentPhone = `9${`${Date.now()}`.slice(-9)}`;
    const agentName = `Agent ${marker}`;

    await loginAsAdmin(page);
    const l = await seedListing(page.request, { title: `${marker} Lead target` });
    // two enquiries; only one will be assigned to the agent
    for (const [n, who] of [['1', 'Assigned'], ['2', 'Unassigned']] as const) {
      const res = await page.request.post('/api/v1/leads', {
        data: { listingSlug: l.slug, name: `${who} ${marker}`, phone: `+919${`${Date.now()}${n}`.slice(-9)}` },
      });
      expect(res.status()).toBe(200);
    }

    // ---- create the agent through the UI
    await page.goto('/admin/users');
    await waitForHydration(page, 'main select');
    await page.getByRole('button', { name: 'Add team member' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a team member' });
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await expect(dialog.getByText('Enter a name')).toBeVisible();
    await dialog.getByLabel('Full name').fill(agentName);
    await dialog.getByLabel('Email').fill(agentEmail);
    await dialog.getByLabel('Mobile number').fill(agentPhone);
    await dialog.getByLabel('Temporary password').fill('AgentPassword1');
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(`${agentName} can now sign in`)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: agentEmail })).toContainText('Sales Agent');

    // ---- assign one lead to them from the lead page
    await page.goto('/admin/leads');
    await page.getByRole('link', { name: `Assigned ${marker}`, exact: true }).click();
    await waitForHydration(page, '#lead-assignee');
    await expect(page.locator('#lead-assignee option', { hasText: agentName })).toHaveCount(1);
    await page.locator('#lead-assignee').selectOption({ label: agentName });
    await expect(page.getByText('Assignment updated')).toBeVisible();

    // ---- agent: limited navigation, scoped data, no admin-only pages
    const ctx = await browser.newContext();
    const agent = await ctx.newPage();
    await login(agent, agentEmail, 'AgentPassword1');
    await expect(agent).toHaveURL(/\/admin$/);
    const nav = agent.getByRole('navigation', { name: 'Admin' });
    await expect(nav.getByRole('link', { name: 'Leads' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Properties' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Staff' })).toHaveCount(0);
    await expect(agent.getByText('only include leads assigned to you')).toBeVisible();
    await expect(agent.getByText('Published listings')).toHaveCount(0);

    await agent.goto('/admin/leads');
    await expect(agent.getByRole('link', { name: `Assigned ${marker}`, exact: true })).toBeVisible();
    await expect(agent.getByRole('link', { name: `Unassigned ${marker}`, exact: true })).toHaveCount(0);

    // the agent can progress their own lead but cannot reassign it
    await agent.getByRole('link', { name: `Assigned ${marker}`, exact: true }).click();
    await waitForHydration(agent, '#lead-status');
    await expect(agent.locator('#lead-assignee')).toHaveCount(0);
    await agent.locator('#lead-status').selectOption('QUALIFIED');
    await expect(agent.getByText('Marked qualified')).toBeVisible();

    // API enforces what the UI hides: the unassigned lead is a 404 for them, admin routes are 403
    const all = (await (await page.request.get('/api/v1/admin/leads?pageSize=24')).json()).data as { id: string; name: string }[];
    const other = all.find((x) => x.name === `Unassigned ${marker}`)!;
    expect((await agent.request.get(`/api/v1/admin/leads/${other.id}`)).status()).toBe(404);
    expect((await agent.request.get('/api/v1/admin/users')).status()).toBe(403);
    expect((await agent.request.get('/api/v1/admin/properties')).status()).toBe(403);

    // ---- disabling the agent signs them out immediately
    await page.goto('/admin/users');
    await waitForHydration(page, 'main select');
    const row = page.getByRole('row').filter({ hasText: agentEmail });
    await row.getByRole('button', { name: 'Disable' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Disable' }).click();
    await expect(page.getByText(/signed out and disabled/)).toBeVisible();
    await expect(row).toContainText('Disabled');
    expect((await agent.request.get('/api/v1/admin/leads')).status()).toBe(401);
    await ctx.close();
  });

  test('dashboard shows real counts and links into the lists', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
    const counts = (await (await page.request.get('/api/v1/admin/dashboard')).json()).data as {
      publishedListings: number;
      leadsNew: number;
    };
    const tile = page.getByRole('list', { name: 'Key numbers' });
    await expect(tile.getByRole('link', { name: /Published listings/ })).toContainText(counts.publishedListings.toLocaleString('en-IN'));
    await expect(tile.getByRole('link', { name: /New leads/ })).toContainText(counts.leadsNew.toLocaleString('en-IN'));
    await tile.getByRole('link', { name: /New leads/ }).click();
    await expect(page).toHaveURL(/\/admin\/leads\?status=NEW/);
  });

  test('the Admin role is offered to a super admin in the create dialog', async ({ page }) => {
    // The seeded bootstrap account is a super admin, so the Admin role is offered to it…
    await loginAsAdmin(page);
    await page.goto('/admin/users');
    await waitForHydration(page, 'main select');
    await page.getByRole('button', { name: 'Add team member' }).click();
    await expect(page.getByRole('dialog').getByLabel('Role').locator('option', { hasText: 'Admin' })).toHaveCount(1);
    void ADMIN;
  });
});
