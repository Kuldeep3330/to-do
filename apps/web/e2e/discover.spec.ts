import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { registerCustomer, waitForHydration } from './helpers';

/** Fail on serious/critical WCAG A/AA violations; report a readable summary. */
async function expectNoA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, `${label} has accessibility violations`).toEqual([]);
}

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true }).click();
const choose = (page: Page, label: string) => page.getByLabel(label, { exact: true }).check();

async function waitForLocalities(page: Page) {
  await page.locator('[role=group] button').first().waitFor();
}

/** Rent path through the required customer questions, ending on the review step. */
async function answerCustomerRent(page: Page) {
  await choose(page, 'Home for rent');
  await next(page);
  await waitForLocalities(page);
  await page.getByLabel('City').selectOption({ label: 'Noida' });
  await page.locator('[role=group] button').first().click();
  await next(page);
  await choose(page, '₹15,000–₹20,000/month');
  await next(page);
  await choose(page, 'Apartment / Flat');
  await next(page);
  await choose(page, '2 BHK');
  await next(page);
  await choose(page, 'Within 1 month');
  await next(page);
  await choose(page, 'Affordable price');
  await choose(page, 'Parking');
  await next(page);
  await expect(page.getByText('Check your answers')).toBeVisible();
}

test.describe('Discover', () => {
  test('landing page lists the assessments and is accessible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Discover' }).first().click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(page.getByRole('heading', { name: /get delhi-ncr housing right/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /start: find your home preferences/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /start: is your property ready/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /start: agent service profile/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /vote and see results/i })).toHaveAttribute('href', '/discover/community');
    await expectNoA11yViolations(page, 'discover landing');
  });

  test('an anonymous customer completes the assessment and opens matching homes', async ({ page }) => {
    await page.goto('/discover/customer');
    await waitForHydration(page, 'input[name="intent"]');
    await expect(page.getByText('Question 1 of 6')).toBeVisible();
    await expectNoA11yViolations(page, 'customer step 1');

    // A required question blocks Next until it is answered.
    await next(page);
    await expect(page.getByRole('alert').filter({ hasText: /please choose an answer/i })).toBeVisible();

    await choose(page, 'Home for rent');
    await next(page);
    await waitForLocalities(page);
    await expectNoA11yViolations(page, 'customer locations step');
    await page.getByLabel('City').selectOption({ label: 'Noida' });
    await page.locator('[role=group] button').first().click();
    await next(page);
    await choose(page, '₹15,000–₹20,000/month');
    await next(page);
    await choose(page, 'Apartment / Flat');
    await next(page);
    await choose(page, '2 BHK');
    await next(page);
    await choose(page, 'Within 1 month');
    await next(page);
    await choose(page, 'Affordable price');
    await choose(page, 'Parking');
    await next(page);

    await expect(page.getByText('Check your answers')).toBeVisible();
    await expect(page.getByLabel(/save this to my account/i)).toHaveCount(0); // signed out: no account option
    await expectNoA11yViolations(page, 'customer review');

    await page.getByRole('button', { name: /get my result/i }).click();
    await expect(page).toHaveURL(/\/discover\/result\/[A-Za-z0-9_-]{32}$/);
    await expect(page.getByRole('heading', { name: 'Your Home Preference Profile' })).toBeVisible();
    await expect(page.getByText('Affordable price, Parking')).toBeVisible();
    await expect(page.getByText(/not advice/i)).toBeVisible();
    await expectNoA11yViolations(page, 'customer result');

    await page.getByRole('link', { name: /see homes for rent/i }).click();
    await expect(page).toHaveURL(/\/search\?.*intent=RENT/);
    await expect(page).toHaveURL(/city=noida/);
    await expect(page).toHaveURL(/bedrooms=2/);
    await expect(page).toHaveURL(/maxPrice=20000/);
  });

  test('changing from rent to buy drops answers that no longer apply', async ({ page }) => {
    await page.goto('/discover/customer');
    await waitForHydration(page, 'input[name="intent"]');
    await choose(page, 'Home to buy');
    await next(page);
    await waitForLocalities(page);
    await page.locator('[role=group] button').first().click();
    await next(page);
    await choose(page, 'Below ₹25 lakh');
    await next(page);
    await choose(page, 'Plot / Land');
    await next(page);
    // A plot skips bedrooms.
    await expect(page.getByText('How many bedrooms do you need?')).toHaveCount(0);
    await expect(page.getByText('When are you planning to move or purchase?')).toBeVisible();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByText('Which locations do you prefer?')).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await choose(page, 'Home for rent'); // plot is not offered to renters; buy budget no longer applies
    await next(page);
    await next(page);
    await expect(page.getByText('What is your monthly rent budget?')).toBeVisible();
    await expect(page.getByText('What is your budget to buy?')).toHaveCount(0);
  });

  test('an owner sees a preparation score that does not claim verification', async ({ page }) => {
    await page.goto('/discover/owner');
    await waitForHydration(page, 'input[name="goal"]');
    await choose(page, 'Rent');
    await next(page);
    await waitForLocalities(page);
    await page.getByLabel('City').selectOption({ label: 'Noida' });
    await page.locator('[role=group] button').first().click();
    await page.getByLabel(/society or street address/i).fill('Tower 3');
    await expectNoA11yViolations(page, 'owner location step');
    await next(page);
    for (const label of ['Available now', 'No', 'Partially complete', 'Need price guidance', 'Weekends', 'I am the owner']) {
      await choose(page, label);
      await next(page);
    }
    await page.getByRole('button', { name: /get my result/i }).click();
    await expect(page.getByRole('img', { name: 'Preparation score 66 out of 100' })).toBeVisible();
    await expect(page.getByText('Almost ready')).toBeVisible();
    await expect(page.getByText(/does not verify the property/i)).toBeVisible();
    await expect(page.getByText(/not a property verification score/i)).toBeVisible();
    await expect(page.getByText(/add recent photographs/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'List it yourself' })).toHaveAttribute('href', '/list-property?mode=self');
    await expectNoA11yViolations(page, 'owner result');
  });

  test('an agent profile is presented as self-reported with no score', async ({ page }) => {
    await page.goto('/discover/agent');
    await waitForHydration(page, '[role=group] button');
    await page.getByLabel('City').selectOption({ label: 'Noida' });
    await page.locator('[role=group] button').first().click();
    await next(page);
    await choose(page, 'Rental properties');
    await next(page);
    for (const label of ['6–15', 'Direct owner confirmation', 'Within 1 hour', 'Regularly', 'Only for some', 'Weekly']) {
      await choose(page, label);
      await next(page);
    }
    await page.getByRole('button', { name: /get my result/i }).click();
    await expect(page.getByText(/self-reported by you\. not verified\./i)).toBeVisible();
    await expect(page.getByText(/not used to rank anyone/i)).toBeVisible();
    await expect(page.getByRole('img', { name: /score/i })).toHaveCount(0);
  });

  test('an unknown result link explains itself instead of failing', async ({ page }) => {
    await page.goto(`/discover/result/${'x'.repeat(32)}`);
    await expect(page.getByText(/could not find this result/i)).toBeVisible();
  });

  test('a signed-in customer saves preferences, searches with them, and deletes them', async ({ page }) => {
    await registerCustomer(page, 'discover');
    await page.goto('/account/discover');
    await expect(page.getByText('No saved home preferences')).toBeVisible();
    await page.getByRole('link', { name: /find your home preferences/i }).click();
    await expect(page).toHaveURL(/\/discover\/customer\?save=1/);
    await waitForHydration(page, 'input[name="intent"]');

    await answerCustomerRent(page);
    await expect(page.getByLabel(/save this to my account/i)).toBeChecked();
    await page.getByRole('button', { name: /get my result/i }).click();
    await expect(page.getByText(/saved to your account/i)).toBeVisible();

    // The saved profile is offered on an unfiltered search, and hidden once filters are chosen.
    await page.goto('/search');
    const banner = page.getByLabel('Your saved preferences');
    await expect(banner).toBeVisible();
    await expectNoA11yViolations(page, 'search with saved-preferences banner');
    await page.goto('/search?intent=BUY');
    await waitForHydration(page);
    await expect(page.getByLabel('Your saved preferences')).toHaveCount(0);

    await page.goto('/account/discover');
    await expect(page.getByRole('heading', { name: 'Your home preferences' })).toBeVisible();
    await expect(page.getByText('Affordable price, Parking')).toBeVisible();
    await expectNoA11yViolations(page, 'account preferences');

    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: /delete my discover data/i }).click();
    await expect(page.getByText('No saved home preferences')).toBeVisible();
    await page.goto('/search');
    await waitForHydration(page);
    await expect(page.getByLabel('Your saved preferences')).toHaveCount(0);
  });
});
