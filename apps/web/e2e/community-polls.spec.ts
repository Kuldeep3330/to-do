import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, registerCustomer, waitForHydration } from './helpers';

async function expectNoA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, `${label} has accessibility violations`).toEqual([]);
}

const stamp = Date.now().toString(36);
const QUESTION = `E2E poll ${stamp}: which matters more for a new home?`;
const pollRow = (page: Page) => page.getByRole('listitem').filter({ hasText: QUESTION }).first();

test.describe.serial('Community polls', () => {
  test('an admin creates a draft that stays private until published', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/polls');
    await expect(page.getByRole('heading', { name: 'Community polls' })).toBeVisible();
    // The starter questions from the product spec exist as drafts.
    await expect(page.getByText('What is your biggest problem when searching for a property?')).toBeVisible();

    await waitForHydration(page, 'main button');
    await page.getByRole('button', { name: /new poll/i }).click();
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page.getByText(/write the full question/i)).toBeVisible();

    await page.getByLabel(/^Question/).fill(QUESTION);
    await page.getByLabel(/^Options/).fill('Better location\nLower price\nMore space');
    await expectNoA11yViolations(page, 'admin polls editor');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(pollRow(page).getByText('Draft')).toBeVisible();

    // Not public yet.
    const publicPolls = await page.request.get('/api/v1/community/polls');
    expect(JSON.stringify(await publicPolls.json())).not.toContain(QUESTION);

    await pollRow(page).getByRole('button', { name: 'Publish' }).click();
    await expect(pollRow(page).getByText('Open')).toBeVisible();
  });

  test('visitors vote without an account and see results only after enough votes', async ({ page, playwright, baseURL }) => {
    await page.goto('/discover/community');
    await waitForHydration(page, 'input[type="radio"]');
    const card = page.getByRole('listitem').filter({ hasText: QUESTION });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'Vote' })).toBeDisabled();
    await expectNoA11yViolations(page, 'community polls');

    await card.getByLabel('Lower price').check();
    await card.getByRole('button', { name: 'Vote' }).click();
    await expect(card.getByText(/your vote is counted/i)).toBeVisible();
    await expect(card.getByText(/results are shown once 10 people have voted/i)).toBeVisible();
    await expect(card.getByText(/1 vote so far/i)).toBeVisible();

    // The browser remembers the vote after a reload and offers no second vote.
    await page.reload();
    await expect(card.getByText(/your vote is counted/i)).toBeVisible();
    await expect(card.getByRole('button', { name: 'Vote' })).toHaveCount(0);

    // Nine more browsers vote (separate cookie jars), which unlocks the results.
    const list = await page.request.get('/api/v1/community/polls');
    const poll = (await list.json()).data.find((p: { question: string }) => p.question === QUESTION);
    for (let i = 0; i < 9; i++) {
      const voter = await playwright.request.newContext({ baseURL });
      const option = poll.options[i < 5 ? 0 : 2].id; // 5 x Better location, 4 x More space
      const res = await voter.post(`/api/v1/community/polls/${poll.id}/vote`, { data: { optionId: option } });
      expect(res.status()).toBe(200);
      await voter.dispose();
    }

    await page.reload();
    const results = card.getByRole('list', { name: 'Results' });
    await expect(results).toBeVisible();
    await expect(results.getByText('50% · 5 votes')).toBeVisible(); // Better location
    await expect(results.getByText('10% · 1 vote')).toBeVisible(); // Lower price (this browser)
    await expect(results.getByText('40% · 4 votes')).toBeVisible(); // More space
    await expect(card.getByText('Your vote', { exact: true })).toBeVisible();
    await expect(card.getByText(/not verified market statistics/i)).toBeVisible();
    await expect(card.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expectNoA11yViolations(page, 'community results');
  });

  test('a signed-in visitor can open the area breakdown, which hides small groups', async ({ page }) => {
    await registerCustomer(page, 'poll');
    await page.goto('/discover/community');
    const card = page.getByRole('listitem').filter({ hasText: QUESTION });
    await waitForHydration(page, 'main button');
    await card.getByRole('button', { name: /see breakdown by area/i }).click();
    await expect(card.getByText(/no area has enough votes to show yet/i)).toBeVisible();
  });

  test('an admin closes the poll: voting stops and results stay public, then it can be archived', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/polls');
    await waitForHydration(page, 'main button');
    await expect(pollRow(page).getByText('10 votes')).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await pollRow(page).getByRole('button', { name: 'Close now' }).click();
    await expect(pollRow(page).getByText('Closed')).toBeVisible();
    await expectNoA11yViolations(page, 'admin polls list');

    await page.goto('/discover/community');
    const card = page.getByRole('listitem').filter({ hasText: QUESTION });
    await expect(card.getByText('Closed', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Vote' })).toHaveCount(0);
    await expect(card.getByRole('list', { name: 'Results' })).toBeVisible();

    await page.goto('/admin/polls');
    await waitForHydration(page, 'main button');
    page.once('dialog', (d) => void d.accept());
    await pollRow(page).getByRole('button', { name: 'Archive' }).click();
    await expect(pollRow(page).getByText('Archived')).toBeVisible();
    await page.goto('/discover/community');
    await expect(page.getByText(QUESTION)).toHaveCount(0);
  });
});
