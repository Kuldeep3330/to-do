import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, seedListing, waitForHydration } from './helpers';

const marker = `ax${Date.now().toString(36)}`;
let detailPath = '';
let leadId = '';

/** Fail on serious/critical WCAG A/AA violations; report a readable summary. */
async function expectNoA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, `${label} has accessibility violations`).toEqual([]);
}

test.describe('security headers and accessibility', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    const l = await seedListing(page.request, { title: `${marker} Accessible 2BHK`, photos: 2 });
    detailPath = `/rent/noida/sector-62/${l.slug}`;
    const res = await page.request.post('/api/v1/leads', {
      data: { listingSlug: l.slug, name: `A11y ${marker}`, phone: `+919${`${Date.now()}`.slice(-9)}` },
    });
    expect(res.status()).toBe(200);
    const leads = (await (await page.request.get('/api/v1/admin/leads?pageSize=5')).json()).data as { id: string; name: string }[];
    leadId = leads.find((x) => x.name === `A11y ${marker}`)!.id;
    await page.close();
  });

  test('responses carry the security headers', async ({ request }) => {
    for (const path of ['/', '/search', '/login', '/admin']) {
      const res = await request.get(path, { maxRedirects: 0 });
      const h = res.headers();
      expect(h['x-content-type-options'], path).toBe('nosniff');
      expect(h['x-frame-options'], path).toBe('DENY');
      expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
      expect(h['permissions-policy'], path).toContain('camera=()');
      const csp = h['content-security-policy'];
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).toContain("object-src 'none'");
      expect(csp, path).toContain("form-action 'self'");
      expect(csp, path).not.toMatch(/script-src[^;]*\*/);
    }
    // Next advertises itself by default; we turn that off.
    expect((await request.get('/')).headers()['x-powered-by']).toBeUndefined();
  });

  test('signed-in areas are never cacheable', async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.request.get('/admin/leads');
    expect(res.headers()['cache-control']).toContain('no-store');
    const acct = await page.request.get('/account');
    expect(acct.headers()['cache-control']).toContain('no-store');
  });

  test('the main pages run without CSP violations or console errors', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (m) => {
      const t = m.text();
      // Prefetch probes of intentionally missing routes and the signed-out /me probe are expected 4xx noise.
      if (m.type() === 'error' && !/status of (401|404)/.test(t)) problems.push(t);
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    for (const path of ['/', '/search?intent=RENT', detailPath, '/login', '/register', '/about']) {
      await page.goto(path);
      await page.waitForTimeout(500);
    }
    expect(problems).toEqual([]);
  });

  for (const [name, path] of [
    ['home', '/'],
    ['search', '/search?intent=RENT'],
    ['login', '/login'],
    ['register', '/register'],
    ['forgot password', '/forgot-password'],
    ['contact', '/contact'],
    ['privacy', '/privacy'],
    ['not found', '/definitely-not-a-page'],
  ] as const) {
    test(`public page "${name}" has no serious accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await expectNoA11yViolations(page, name);
    });
  }

  test('listing detail has no serious accessibility violations (incl. enquiry form)', async ({ page }) => {
    await page.goto(detailPath);
    await waitForHydration(page, 'aside form input');
    await expectNoA11yViolations(page, 'listing detail');
    // and with validation errors showing
    await page.locator('aside form').getByRole('button', { name: 'Request a call back' }).click();
    await expect(page.locator('aside form [role="alert"]').first()).toBeVisible();
    await expectNoA11yViolations(page, 'listing detail with errors');
  });

  test('search with filters open on a phone has no serious accessibility violations', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('/search');
    await waitForHydration(page, 'form[role="search"] input');
    await page.getByRole('button', { name: 'Open filters' }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    await expectNoA11yViolations(page, 'mobile filter sheet');
    await ctx.close();
  });

  test('admin pages have no serious accessibility violations', async ({ page }) => {
    await loginAsAdmin(page);
    const meId = ((await (await page.request.get('/api/v1/me')).json()).data as { id: string }).id;
    for (const [name, path, ready] of [
      ['dashboard', '/admin', 'Key numbers'],
      ['properties', '/admin/properties', null],
      ['new property', '/admin/properties/new', null],
      ['listings', '/admin/listings', null],
      ['new listing', '/admin/listings/new', null],
      ['leads', '/admin/leads', null],
      ['lead detail', `/admin/leads/${leadId}`, null],
      ['staff', '/admin/users', null],
      ['audit log', '/admin/audit', null],
      ['system health', '/admin/system', null],
      ['data quality', '/admin/data-quality', null],
      ['reports', '/admin/reports', null],
      ['staff profile', `/admin/users/${meId}`, null],
      ['visits', '/admin/visits', null],
    ] as const) {
      await page.goto(path);
      if (ready) await expect(page.getByRole('list', { name: ready })).toBeVisible();
      else await page.waitForLoadState('load');
      await page.waitForTimeout(800); // let react-query data render
      await expectNoA11yViolations(page, `admin ${name}`);
    }
  });

  test('keyboard-only: skip link, tab order reaches the main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });
});
