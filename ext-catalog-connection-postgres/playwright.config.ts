// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { defineConfig, devices } from '@playwright/test';

/** The tests of the extension on a Mosaikit installation started by the bench (tests/global-setup.ts). */
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  globalSetup: './tests/global-setup.ts',
  workers: 1,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  // In the CI a test that fails is run again once: the report marks it flaky instead of hiding it.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: { trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
});
