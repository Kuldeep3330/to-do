import { expect, test } from '@playwright/test';
import { waitForHydration } from './helpers';

test('owners can request a listing visit from the homepage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'List your property' }).first().click();
  await expect(page).toHaveURL(/\/list-property/);
  await waitForHydration(page, 'form input');

  await expect(page.getByRole('tab', { name: 'Help me list' })).toBeVisible();
  await page.getByRole('tab', { name: 'I will list it' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('tab', { name: 'Help me list' }).click();

  await page.getByRole('button', { name: 'Request a visit from our team' }).click();
  await expect(page.getByText('Enter the city')).toBeVisible();

  await page.getByLabel('City').fill('Noida');
  await page.getByLabel('Your name').fill('E2E Owner');
  await page.getByLabel('Mobile number').fill(`9${`${Date.now()}`.slice(-9)}`);
  await page.getByRole('button', { name: 'Request a visit from our team' }).click();
  await expect(page.getByText(/Thanks, E2E/)).toBeVisible();
});
