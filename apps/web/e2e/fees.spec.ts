import { expect, test } from '@playwright/test';
import { login, loginAsAdmin, seedListing, waitForHydration } from './helpers';

const marker = `fe${Date.now().toString(36)}`;
let slug = '';

test.describe('fee rules and earnings per deal', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    // Known starting point: half a month's rent.
    const set = await page.request.put('/api/v1/admin/fee-rules/RENT', { data: { method: 'PERCENT', value: 50 } });
    expect(set.ok()).toBe(true);
    slug = (await seedListing(page.request, { title: `${marker} Fee 2BHK`, intent: 'RENT', price: 28000 })).slug;
    await page.close();
  });

  test('an admin sets the rental fee, sees an example, and it persists', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Fees', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/settings\/fees$/);
    await waitForHydration(page, '#fee-rent-value');

    const rent = page.getByRole('region', { name: 'Rentals' });
    await expect(rent).toContainText('Current rule: 50% of the monthly rent');
    await expect(rent).toContainText('Example: a rental at ₹30,000 a month earns ₹15,000');

    // validation explains itself and nothing is saved
    await rent.getByLabel(/Percentage/).fill('150');
    await rent.getByRole('button', { name: /Save rentals fee/ }).click();
    await expect(rent.getByText('A percentage cannot be more than 100')).toBeVisible();

    await rent.getByLabel(/Percentage/).fill('40');
    await rent.getByLabel(/Maximum fee/).fill('10,000');
    await expect(rent).toContainText('earns ₹10,000'); // the cap wins over 40% of 30,000
    await rent.getByRole('button', { name: /Save rentals fee/ }).click();
    await expect(page.getByText('Rentals fee saved')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('region', { name: 'Rentals' })).toContainText('40% of the monthly rent, at most ₹10,000');

    // put it back for the other scenarios
    await waitForHydration(page, '#fee-rent-value');
    const again = page.getByRole('region', { name: 'Rentals' });
    await again.getByLabel(/Percentage/).fill('50');
    await again.getByLabel(/Maximum fee/).fill('');
    await again.getByRole('button', { name: /Save rentals fee/ }).click();
    await expect(page.getByText('Rentals fee saved')).toBeVisible();
  });

  test('winning a rental shows the calculated fee, which an admin can change, and agents never see it', async ({ page, browser }) => {
    const name = `Fee ${marker}`;
    const phone = `+919${`${Date.now()}`.slice(-9)}`;
    await loginAsAdmin(page);
    expect((await page.request.post('/api/v1/leads', { data: { listingSlug: slug, name, phone } })).ok()).toBe(true);

    await page.goto('/admin/leads');
    await waitForHydration(page, 'main select');
    await page.getByRole('row').filter({ hasText: name }).getByRole('link', { name }).click();
    await expect(page).toHaveURL(/\/admin\/leads\/[0-9a-f-]{36}$/);
    const leadUrl = page.url();
    await waitForHydration(page, '#lead-status');

    await page.getByLabel('Status').selectOption('WON');
    const dialog = page.getByRole('dialog', { name: 'Mark lead as won' });
    await dialog.getByLabel(/Monthly rent agreed/).fill('28,000');
    await expect(dialog.getByLabel('Our fee (₹)')).toHaveValue('14000');
    await expect(dialog.getByText(/From the fee rule: 50% of the monthly rent/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Mark as won' }).click();
    await expect(page.getByText('Marked won')).toBeVisible();
    await expect(page.getByText('Our fee', { exact: true }).locator('..')).toContainText('₹14,000');

    // give a discount
    await page.getByRole('button', { name: 'Edit deal' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit deal' });
    await expect(edit.getByLabel('Our fee (₹)')).toHaveValue('14000');
    await edit.getByLabel('Our fee (₹)').fill('9000');
    await edit.getByRole('button', { name: 'Save deal' }).click();
    await expect(page.getByText('Deal saved')).toBeVisible();
    await expect(page.getByText('Our fee', { exact: true }).locator('..')).toContainText('₹9,000');

    // changing the amount without touching the fee recalculates it
    await page.getByRole('button', { name: 'Edit deal' }).click();
    const edit2 = page.getByRole('dialog', { name: 'Edit deal' });
    await edit2.getByLabel(/Monthly rent agreed/).fill('30000');
    await expect(edit2.getByLabel('Our fee (₹)')).toHaveValue('15000');
    await edit2.getByRole('button', { name: 'Save deal' }).click();
    await expect(page.getByText('Our fee', { exact: true }).locator('..')).toContainText('₹15,000');

    // dashboard shows the earnings
    await page.goto('/admin');
    await expect(page.getByText('Fees earned')).toBeVisible();

    // a sales agent assigned to the lead sees the deal but never the fee, the dialog field, or the nav entry
    const lead = (await (await page.request.get(`/api/v1/admin/leads/${leadUrl.split('/').pop()}`)).json()).data as { id: string };
    const staff = {
      email: `fee.agent.${marker}@example.com`,
      name: 'Fee Agent',
      phone: `+9197${`${Date.now()}`.slice(-8)}`,
      password: 'StaffPassword1',
      role: 'SALES_AGENT',
    };
    const made = await page.request.post('/api/v1/admin/users', { data: staff });
    expect(made.status()).toBe(201);
    const assigned = await page.request.patch(`/api/v1/admin/leads/${lead.id}`, {
      data: { assignedToUserId: (await made.json()).data.id },
    });
    expect(assigned.ok()).toBe(true);

    const agentCtx = await browser.newContext();
    const agent = await agentCtx.newPage();
    await login(agent, staff.email, staff.password);
    await expect(agent).toHaveURL(/\/admin$/);
    await agent.goto(leadUrl);
    await expect(agent.getByRole('heading', { name: 'Deal', exact: true })).toBeVisible();
    await expect(agent.getByText('₹30,000')).toBeVisible();
    await expect(agent.getByText('Our fee', { exact: true })).toHaveCount(0);
    await expect(agent.getByRole('link', { name: 'Fees', exact: true })).toHaveCount(0);
    await agent.getByRole('button', { name: 'Edit deal' }).click();
    await expect(agent.getByLabel('Our fee (₹)')).toHaveCount(0);
    expect((await agent.request.get('/api/v1/admin/fee-rules')).status()).toBe(403);
    expect((await agent.goto('/admin/settings/fees'))?.status()).toBeLessThan(500);
    await expect(agent.getByRole('heading', { name: 'Fees' })).toHaveCount(0);
    await agentCtx.close();
  });
});
