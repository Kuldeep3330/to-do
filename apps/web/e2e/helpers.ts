import { expect, type Page } from '@playwright/test';

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMeAdmin1',
};

export async function login(page: Page, email: string, password: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  await waitForHydration(page, 'form input');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function loginAsAdmin(page: Page) {
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/admin$/);
}

/** Unique throwaway customer via the real register form. */
export async function registerCustomer(page: Page, tag = 'e2e') {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `${tag}.${stamp}@example.com`;
  const phone = `9${stamp.slice(-9).padStart(9, '1')}`;
  await page.goto('/register');
  await waitForHydration(page, 'form input');
  await page.getByLabel('Full name').fill('E2E Customer');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mobile number').fill(phone);
  await page.locator('#password').fill('E2ePassword123');
  await page.getByLabel('Confirm password').fill('E2ePassword123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account$/);
  return { email, phone, password: 'E2ePassword123' };
}

import fs from 'fs';
import path from 'path';
import type { APIRequestContext } from '@playwright/test';

export const fixturePath = (name: string) => path.join(__dirname, 'fixtures', name);

type SeedOptions = {
  title: string;
  intent?: 'BUY' | 'RENT';
  city?: string;
  locality?: string;
  bedrooms?: number;
  area?: number;
  price?: number;
  furnishing?: 'UNFURNISHED' | 'SEMI' | 'FURNISHED';
  type?: 'RESIDENTIAL' | 'COMMERCIAL' | 'PLOT';
  photos?: number;
  publish?: boolean;
  description?: string;
};

/** Create property + listing (+ photos, + publish) through the admin API. Needs an admin-authenticated request context. */
export async function seedListing(request: APIRequestContext, o: SeedOptions) {
  const citySlug = o.city ?? 'noida';
  const localitySlug = o.locality ?? 'sector-62';
  const cities = (await (await request.get('/api/v1/cities')).json()).data as { id: string; slug: string }[];
  const city = cities.find((c) => c.slug === citySlug);
  if (!city) throw new Error(`unknown city ${citySlug}`);
  const locs = (await (await request.get(`/api/v1/cities/${citySlug}/localities`)).json()).data as {
    id: string;
    slug: string;
  }[];
  const loc = locs.find((l) => l.slug === localitySlug);
  if (!loc) throw new Error(`unknown locality ${localitySlug}`);

  const prop = await request.post('/api/v1/admin/properties', {
    data: {
      type: o.type ?? 'RESIDENTIAL',
      cityId: city.id,
      localityId: loc.id,
      internalTitle: `${o.title} (property)`,
      areaValue: o.area ?? 1000,
      bedrooms: o.bedrooms ?? 2,
      bathrooms: 2,
      furnishing: o.furnishing ?? null,
    },
  });
  if (prop.status() !== 201) throw new Error(`property: ${prop.status()} ${await prop.text()}`);
  const propertyId = (await prop.json()).data.id as string;

  const intent = o.intent ?? 'RENT';
  const listing = await request.post('/api/v1/admin/listings', {
    data: {
      propertyId,
      intent,
      pricePeriod: intent === 'RENT' ? 'MONTHLY' : 'ONE_TIME',
      title: o.title,
      description: o.description ?? 'Seeded by an end-to-end test.',
      priceAmount: o.price ?? (intent === 'RENT' ? 20000 : 5_000_000),
    },
  });
  if (listing.status() !== 201) throw new Error(`listing: ${listing.status()} ${await listing.text()}`);
  const id = (await listing.json()).data.id as string;

  for (let i = 0; i < (o.photos ?? 1); i++) {
    const up = await request.post(`/api/v1/admin/listings/${id}/media`, {
      multipart: {
        file: { name: `p${i}.png`, mimeType: 'image/png', buffer: fs.readFileSync(fixturePath(`photo-${(i % 3) + 1}.png`)) },
      },
    });
    if (up.status() !== 201) throw new Error(`media: ${up.status()} ${await up.text()}`);
  }

  if (o.publish !== false && (o.photos ?? 1) > 0) {
    const pub = await request.post(`/api/v1/admin/listings/${id}/publish`);
    if (pub.status() !== 200) throw new Error(`publish: ${pub.status()} ${await pub.text()}`);
  }
  const detail = (await (await request.get(`/api/v1/admin/listings/${id}`)).json()).data as { slug: string };
  return { id, propertyId, slug: detail.slug, city: citySlug, locality: localitySlug, intent };
}

/** Wait until React has hydrated the client components (DOM nodes get a __reactFiber$ key). */
export async function waitForHydration(
  page: import('@playwright/test').Page,
  selector = 'header button[aria-controls]',
) {
  // Hydration is per Suspense boundary, so wait on the element the test is about to use.
  // __reactFiber$ is attached during render; __reactProps$ (the event handlers) only at commit,
  // so that is the key that proves the element will actually respond to input.
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps$'));
  }, selector);
}

export const SEARCH_FORM = 'form[role="search"] input';
