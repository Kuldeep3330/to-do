import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('admin properties', () => {
  test('create, find, edit and archive a property', async ({ page }) => {
    const title = `E2E Property ${Date.now()}`;
    await loginAsAdmin(page);

    await page.goto('/admin/properties');
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
    await page.getByRole('link', { name: 'New property' }).first().click();

    // Validation: submitting empty shows field errors and stays on the page.
    await page.getByRole('button', { name: 'Create property' }).click();
    await expect(page.getByText('Enter an internal title')).toBeVisible();
    await expect(page.getByText('Select a city', { exact: true })).toBeVisible();

    await page.locator('#internalTitle').fill(title);
    await page.locator('#societyName').fill('E2E Heights');
    await page.locator('#cityId').selectOption({ label: 'Noida' });
    await expect(page.locator('#localityId')).toBeEnabled();
    await page.locator('#localityId').selectOption({ label: 'Sector 62' });
    await page.locator('#bedrooms').fill('3');
    await page.locator('#bathrooms').fill('2');
    await page.locator('#areaValue').fill('1450');
    await page.locator('#furnishing').selectOption('SEMI');
    await page.getByLabel('Lift', { exact: true }).check();
    await page.getByLabel('Security', { exact: true }).check();

    // lat without lng is rejected client-side
    await page.locator('#lat').fill('28.6');
    await page.getByRole('button', { name: 'Create property' }).click();
    await expect(page.getByText(/both latitude and longitude/i)).toBeVisible();
    await page.locator('#lng').fill('77.2');

    await page.getByRole('button', { name: 'Create property' }).click();
    await expect(page).toHaveURL(/\/admin\/properties\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    // Persisted values load back into the form.
    await expect(page.locator('#societyName')).toHaveValue('E2E Heights');
    await expect(page.locator('#bedrooms')).toHaveValue('3');
    await expect(page.getByLabel('Lift', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Park', { exact: true })).not.toBeChecked();

    // Edit
    await page.locator('#bedrooms').fill('4');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/admin\/properties$/);

    // Search finds it and shows updated details
    await page.getByLabel('Search properties').fill(title);
    const row = page.getByRole('row', { name: new RegExp(title) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('4 BHK');
    await expect(row).toContainText('Noida');

    // Archive moves it out of the Active list
    await row.getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Property archived')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);

    await page.getByLabel('Filter by status').selectOption('ARCHIVED');
    await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible();
  });

  test('an unknown property id shows not-found', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/properties/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
});
