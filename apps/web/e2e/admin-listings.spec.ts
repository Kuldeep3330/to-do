import path from 'path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { loginAsAdmin } from './helpers';

const fixture = (name: string) => path.join(__dirname, 'fixtures', name);

/** Create a publishable-ready property through the API so the test focuses on the listing UI. */
async function createProperty(request: APIRequestContext, title: string) {
  const cities = (await (await request.get('/api/v1/cities')).json()).data as { id: string; slug: string }[];
  const noida = cities.find((c) => c.slug === 'noida')!;
  const locs = (await (await request.get('/api/v1/cities/noida/localities')).json()).data as {
    id: string;
    slug: string;
  }[];
  const loc = locs.find((l) => l.slug === 'sector-62')!;
  const res = await request.post('/api/v1/admin/properties', {
    data: {
      type: 'RESIDENTIAL',
      cityId: noida.id,
      localityId: loc.id,
      internalTitle: title,
      areaValue: 1200,
      bedrooms: 3,
      bathrooms: 2,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id as string;
}

test.describe('admin listings and media', () => {
  test('draft → photos → publish → pause → close', async ({ page }) => {
    const stamp = Date.now();
    const title = `E2E Listing ${stamp}`;
    await loginAsAdmin(page);
    const propertyId = await createProperty(page.request, `E2E Prop ${stamp}`);

    // ---- create draft from the property page entry point
    await page.goto(`/admin/listings/new?propertyId=${propertyId}`);
    await expect(page.locator('#propertyId')).toHaveValue(propertyId);

    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page.getByText('Enter a title')).toBeVisible();

    await page.locator('#title').fill(title);
    await page.locator('#description').fill('Bright corner flat close to the metro.');
    await page.locator('#priceAmount').fill('₹ 32,000');
    await expect(page.getByText('₹32,000')).toBeVisible();
    await page.locator('#depositAmount').fill('64000');
    await page.getByLabel('Price is negotiable').check();
    await page.getByRole('button', { name: 'Create draft' }).click();

    await expect(page).toHaveURL(/\/admin\/listings\/[0-9a-f-]{36}$/);
    const listingId = page.url().split('/').pop()!;
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    // ---- cannot publish without a photo
    const publish = page.getByRole('button', { name: 'Publish', exact: true });
    await expect(publish).toBeDisabled();
    await expect(page.getByRole('listitem').filter({ hasText: 'At least one photo' })).toBeVisible();

    // ---- upload: a bad file is rejected client-side, good ones are stored
    await page.locator('#photo-input').setInputFiles(fixture('not-an-image.txt'));
    await expect(page.getByText(/only JPG, PNG or WebP/)).toBeVisible();

    await page.locator('#photo-input').setInputFiles([fixture('photo-1.png'), fixture('photo-2.png')]);
    const photos = page.getByRole('list', { name: 'Photos' }).getByRole('listitem');
    await expect(photos).toHaveCount(2);
    await expect(photos.first().getByText('Cover')).toBeVisible();

    // ---- reorder: move photo 2 earlier; the cover changes
    const firstSrcBefore = await photos.first().locator('img').getAttribute('src');
    await page.getByRole('button', { name: 'Move photo 2 earlier' }).click();
    await expect.poll(async () => photos.first().locator('img').getAttribute('src')).not.toBe(firstSrcBefore);

    // ---- publish
    await expect(publish).toBeEnabled();
    await publish.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Listing published')).toBeVisible();

    const admin = (await (await page.request.get(`/api/v1/admin/listings/${listingId}`)).json()).data;
    expect(admin.status).toBe('PUBLISHED');
    const publicUrl = `/api/v1/listings/${admin.slug}`;
    expect((await page.request.get(publicUrl)).status()).toBe(200);
    await expect(page.getByRole('link', { name: /View public page/ })).toHaveAttribute(
      'href',
      `/rent/noida/sector-62/${admin.slug}`,
    );

    // ---- the last photo of a live listing cannot be removed; others can
    await page.getByRole('button', { name: 'Delete photo 2' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Photo deleted')).toBeVisible();
    await expect(photos).toHaveCount(1);

    await page.getByRole('button', { name: 'Delete photo 1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(/Cannot delete the last ORIGINAL image/)).toBeVisible();
    await expect(photos).toHaveCount(1);

    // ---- edit while live
    await page.locator('#priceAmount').fill('35000');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Listing updated')).toBeVisible();

    // ---- pause hides it publicly
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByText('Listing paused')).toBeVisible();
    expect((await page.request.get(publicUrl)).status()).toBe(404);

    // ---- close is final
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close listing' }).click();
    await expect(page.getByText('Listing closed')).toBeVisible();
    await expect(page.getByText('This listing is closed and read-only.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);

    // ---- shows up in the list with filters
    await page.goto('/admin/listings');
    await page.getByLabel('Search listings').fill(title);
    const row = page.getByRole('row', { name: new RegExp(title) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Closed');
    await expect(row).toContainText('Sector 62, Noida');
    await expect(row).toContainText('₹35,000/mo');
  });

  test('publishing without a price shows the API requirement list', async ({ page }) => {
    const stamp = Date.now();
    await loginAsAdmin(page);
    const propertyId = await createProperty(page.request, `E2E NoPrice ${stamp}`);
    const created = await page.request.post('/api/v1/admin/listings', {
      data: { propertyId, intent: 'BUY', pricePeriod: 'ONE_TIME', title: `E2E NoPrice ${stamp}` },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).data.id as string;
    await page.request.post(`/api/v1/admin/listings/${id}/media`, {
      multipart: { file: { name: 'a.png', mimeType: 'image/png', buffer: require('fs').readFileSync(fixture('photo-3.png')) } },
    });

    await page.goto(`/admin/listings/${id}`);
    await expect(page.getByRole('listitem').filter({ hasText: 'Price is set' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  });
});
