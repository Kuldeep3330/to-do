import { expect, test } from '@playwright/test';
import { ADMIN, login, loginAsAdmin, registerCustomer } from './helpers';

test.describe('authentication', () => {
  test('admin can sign in, see the admin shell, and sign out', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Session is really gone: protected routes redirect back to login.
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  });

  test('wrong password shows a friendly error', async ({ page }) => {
    await login(page, ADMIN.email, 'definitely-wrong');
    await expect(page.getByText('Incorrect email or password.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('form validation shows field errors', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter your email')).toBeVisible();
  });

  test('unauthenticated /admin redirects to login with next', async ({ page }) => {
    await page.goto('/admin/leads');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fleads/);
  });

  test('login honours a safe ?next and ignores an external one', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password, 'https://evil.example/phish');
    await expect(page).toHaveURL(/localhost:\d+\/admin$/);
  });

  test('a customer gets a 404 for /admin (existence not disclosed)', async ({ page }) => {
    await registerCustomer(page, 'noadmin');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
});
