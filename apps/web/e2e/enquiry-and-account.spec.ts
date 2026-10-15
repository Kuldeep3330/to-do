import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, registerCustomer, seedListing, waitForHydration } from './helpers';

const marker = `eq${Date.now().toString(36)}`;
const title = `${marker} Quiet 2BHK`;
let slug = '';
let listingId = '';
const detail = () => `/rent/noida/sector-62/${slug}`;

const uniquePhone = () => `9${`${Date.now()}${Math.floor(Math.random() * 100)}`.slice(-9)}`;

async function openDetail(page: Page) {
  await page.goto(detail());
  await waitForHydration(page, 'aside form input');
}

test.describe('enquiries, inbox and customer account', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    const l = await seedListing(page.request, { title, intent: 'RENT', bedrooms: 2, price: 24000 });
    slug = l.slug;
    listingId = l.id;
    await page.close();
  });

  test('guest enquiry validates, succeeds, and lands in the admin inbox', async ({ page, browser }) => {
    const name = `Guest ${marker}`;
    const phone = uniquePhone();
    await openDetail(page);
    const form = page.locator('aside form');

    // client-side validation
    await form.getByLabel('Your name').fill(name);
    await form.getByLabel('Mobile number').fill('12345');
    await form.getByRole('button', { name: 'Request a call back' }).click();
    await expect(form.getByText('Enter a valid 10-digit Indian mobile number')).toBeVisible();

    await form.getByLabel('Mobile number').fill(phone);
    await form.getByLabel('Message (optional)').fill(`Is it pet friendly? ${'<b>bold</b>'}`);
    await form.getByRole('button', { name: 'Request a call back' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Thanks, ${name.split(' ')[0]}` })).toBeVisible();

    // A second submit with the same phone inside the duplicate window is still a success for the visitor
    await openDetail(page);
    const again = page.locator('aside form');
    await again.getByLabel('Your name').fill(name);
    await again.getByLabel('Mobile number').fill(phone);
    await again.getByRole('button', { name: 'Request a call back' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Thanks' })).toBeVisible();

    // admin inbox: exactly one lead, status NEW, message shown as text
    const admin = await browser.newPage();
    await loginAsAdmin(admin);
    const api = (await (await admin.request.get('/api/v1/admin/leads?pageSize=24')).json()).data as { name: string; phone: string }[];
    expect(api.filter((l) => l.phone === `+91${phone}`)).toHaveLength(1);

    await admin.goto('/admin/leads');
    await waitForHydration(admin, 'main select');
    const row = admin.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText('New');
    await expect(row).toContainText(title);
    await row.getByRole('link', { name }).click();

    await expect(admin.getByRole('heading', { name })).toBeVisible();
    await expect(admin.getByText('Is it pet friendly? <b>bold</b>')).toBeVisible();
    await expect(admin.getByRole('link', { name: 'Call' })).toHaveAttribute('href', `tel:+91${phone}`);

    await waitForHydration(admin, '#lead-status');
    await admin.getByLabel('Status').selectOption('CONTACTED');
    await expect(admin.getByText('Marked contacted')).toBeVisible();
    await admin.reload();
    await expect(admin.locator('#lead-status')).toHaveValue('CONTACTED');

    // status filter in the list
    await admin.goto('/admin/leads?status=NEW');
    await expect(admin.getByRole('row').filter({ hasText: name })).toHaveCount(0);
    await admin.goto('/admin/leads?status=CONTACTED');
    await expect(admin.getByRole('row').filter({ hasText: name })).toBeVisible();
    await admin.close();
  });

  test('signed-in customer is prefilled, sees only their own enquiries, and saves homes privately', async ({ page, browser }) => {
    const alice = await registerCustomer(page, 'alice');
    await openDetail(page);
    const form = page.locator('aside form');
    await expect(form.getByLabel('Your name')).toHaveValue('E2E Customer');
    await expect(form.getByLabel('Email (optional)')).toHaveValue(alice.email);
    await form.getByLabel('Message (optional)').fill('Alice here, can I visit Saturday?');
    await form.getByRole('button', { name: 'Request a call back' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Thanks' })).toBeVisible();

    // save it via the heart on the detail page
    const save = page.getByRole('button', { name: new RegExp(`^Save ${title}`) });
    await save.click();
    await expect(page.getByRole('button', { name: new RegExp(`^Remove ${title}`) })).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/account/enquiries');
    await expect(page.getByRole('heading', { name: 'My enquiries' })).toBeVisible();
    const item = page.getByRole('list', { name: 'Enquiries' }).getByRole('listitem').filter({ hasText: title });
    await expect(item).toContainText('New');
    await expect(item).toContainText('Alice here');

    await page.goto('/account/saved');
    await expect(page.getByRole('article').filter({ hasText: title })).toBeVisible();

    // a different customer sees none of it
    const bobCtx = await browser.newContext();
    const bob = await bobCtx.newPage();
    await registerCustomer(bob, 'bob');
    await bob.goto('/account/enquiries');
    await expect(bob.getByRole('heading', { name: 'No enquiries yet' })).toBeVisible();
    await bob.goto('/account/saved');
    await expect(bob.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible();
    await bobCtx.close();

    // un-saving from the card removes it
    await page.goto('/account/saved');
    await waitForHydration(page, 'article button');
    await page.getByRole('article').filter({ hasText: title }).getByRole('button', { name: /^Remove/ }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible();
  });

  test('profile can be edited and validates the phone number', async ({ page }) => {
    await registerCustomer(page, 'prof');
    await page.goto('/account');
    await waitForHydration(page, 'main form input[name="name"]');
    await page.getByLabel('Full name').fill('Renamed Person');
    await page.getByLabel('Mobile number').fill('123');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Enter a valid 10-digit Indian mobile number')).toBeVisible();
    await page.getByLabel('Mobile number').fill(uniquePhone());
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Profile updated')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Full name')).toHaveValue('Renamed Person');
  });

  test('signed-out visitors who tap save are sent to sign in and come back', async ({ page }) => {
    await page.goto(`/search?q=${marker}`);
    await waitForHydration(page, 'article button');
    await page.getByRole('article').filter({ hasText: title }).getByRole('button', { name: /^Save/ }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test('on a phone the contact bar opens the enquiry sheet', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(detail());
    await waitForHydration(page, 'section[aria-roledescription="carousel"] button, header button[aria-controls]');
    await page.getByRole('button', { name: 'Contact' }).click();
    const sheet = page.getByRole('dialog', { name: 'Request a call back' });
    await sheet.getByLabel('Your name').fill(`Mobile ${marker}`);
    await sheet.getByLabel('Mobile number').fill(uniquePhone());
    await sheet.getByRole('button', { name: 'Request a call back' }).click();
    await expect(sheet.getByText(/Thanks/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await ctx.close();
  });

  test('a listing taken down stops accepting enquiries', async ({ page }) => {
    await loginAsAdmin(page);
    const l = await seedListing(page.request, { title: `${marker} Short lived` });
    await page.request.post(`/api/v1/admin/listings/${l.id}/pause`);
    const res = await page.request.post('/api/v1/leads', {
      data: { listingSlug: l.slug, name: 'Late Visitor', phone: '+919876500000' },
    });
    expect(res.status()).toBe(404);
    void listingId;
  });
});
