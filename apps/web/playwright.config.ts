import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    // Use the locally installed Chrome so no browser download is needed. In CI set E2E_CHANNEL= to use bundled Chromium.
    channel: process.env.E2E_CHANNEL === undefined ? 'chrome' : process.env.E2E_CHANNEL || undefined,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
  },
});
