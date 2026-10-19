import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, registerCustomer, seedListing, waitForHydration } from './helpers';

const marker = `vs${Date.now().toString(36)}`;
const title = `${marker} Sunny 2BHK`;
let slug = '';
const detail = () => `/rent/noida/sector-62/${slug}`;

/** Calendar date in India, matching what the API validates against. */
function istDate(daysFromToday: number): string {
  return new Date(Date.now() + 5.5 * 3_600_000 + daysFromToday * 86_400_000).toISOString().slice(0, 10);
}

async function openDetail(page: Page) {
  await page.goto(detail());
  await waitForHydration(page, 'aside form input');
}

test.describe('visit booking', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    const l = await seedListing(page.request, { title, intent: 'RENT', bedrooms: 2, price: 24000 });
    slug = l.slug;
    await page.close();
  });

  test('guests are sent to sign in and brought back to the home', async ({ page }) => {
    await openDetail(page);
    const link = page.locator('aside').getByRole('link', { name: 'Sign in to book a visit' });
    await expect(link).toHaveAttribute('href', `/login?next=${encodeURIComponent(detail())}`);
  });

  test('customer requests a visit, staff confirm it, and the customer sees the update', async ({ page, browser }) => {
    await registerCustomer(page, 'visitor');
    await openDetail(page);

    await page.locator('aside').getByRole('button', { name: 'Book a visit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Book a visit' });
    await expect(dialog).toBeVisible();

    // client-side validation: a past date is refused
    await dialog.getByLabel('Preferred date (optional)').fill(istDate(-1));
    await dialog.getByRole('button', { name: 'Request a visit' }).click();
    await expect(dialog.getByText(/Choose a date between today and/)).toBeVisible();

    await dialog.getByLabel('Preferred date (optional)').fill(istDate(2));
    await dialog.getByLabel('Preferred time').selectOption('EVENING');
    await dialog.getByLabel('Anything we should know? (optional)').fill('Bringing my parents');
    await dialog.getByRole('button', { name: 'Request a visit' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Visit requested' })).toBeVisible();
    await page.keyboard.press('Escape');

    // asking again for the same home is refused with a clear message
    await page.locator('aside').getByRole('button', { name: 'Book a visit' }).click();
    const again = page.getByRole('dialog', { name: 'Book a visit' });
    await again.getByRole('button', { name: 'Request a visit' }).click();
    await expect(again.getByText('You already have a visit request for this home')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/account/visits');
    await waitForHydration(page, 'main ul');
    const item = page.getByRole('list', { name: 'Visits' }).getByRole('listitem').filter({ hasText: title });
    await expect(item).toContainText('Requested');
    await expect(item).toContainText('Evening');
    await expect(item).toContainText('Bringing my parents');

    // staff confirm it from the visits queue
    const admin = await browser.newPage();
    await loginAsAdmin(admin);
    await admin.goto('/admin/visits?status=REQUESTED');
    await waitForHydration(admin, 'main select');
    const row = admin.getByRole('row').filter({ hasText: title });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Confirm' }).click();
    await expect(admin.getByText('Visit confirmed')).toBeVisible();
    await admin.goto('/admin/visits?status=CONFIRMED');
    const confirmed = admin.getByRole('row').filter({ hasText: title });
    await expect(confirmed).toContainText('Confirmed');
    await expect(confirmed.getByRole('button', { name: 'Completed' })).toBeVisible();
    await admin.close();

    // customer now sees it confirmed and can no longer cancel it themselves
    await page.reload();
    const updated = page.getByRole('list', { name: 'Visits' }).getByRole('listitem').filter({ hasText: title });
    await expect(updated).toContainText('Confirmed');
    await expect(updated.getByRole('button', { name: 'Cancel request' })).toHaveCount(0);
  });

  test('customer can cancel a request that is still pending', async ({ page }) => {
    await registerCustomer(page, 'canceller');
    await openDetail(page);
    await page.locator('aside').getByRole('button', { name: 'Book a visit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Book a visit' });
    await dialog.getByRole('button', { name: 'Request a visit' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Visit requested' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/account/visits');
    await waitForHydration(page, 'main ul');
    const item = page.getByRole('list', { name: 'Visits' }).getByRole('listitem').filter({ hasText: title });
    await expect(item).toContainText('Any day');
    await item.getByRole('button', { name: 'Cancel request' }).click();
    await expect(page.getByText('Visit request cancelled')).toBeVisible();
    await expect(item).toContainText('Cancelled');
    await expect(item.getByRole('button', { name: 'Cancel request' })).toHaveCount(0);
  });

  test('a customer never sees someone else\'s visits', async ({ page }) => {
    await registerCustomer(page, 'stranger');
    await page.goto('/account/visits');
    await expect(page.getByRole('heading', { name: 'No visits yet' })).toBeVisible();
  });
});
