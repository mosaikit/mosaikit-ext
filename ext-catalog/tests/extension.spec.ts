// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test } from '@playwright/test';
import { member, openApp, signIn } from '@mosaikit/testing/playwright';

// The smoke test of the folder: built alone with the published SDK, the package installs on the
// bench and its app opens, in the languages it has.

test('EXT-102 ext-catalog, built alone, installs and opens its app in English', async ({ page }) => {
  await signIn(page, member());
  await openApp(page, 'Catalog');
  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible();
  await expect(page.getByText('Extension io.github.mosaikit.ext.catalog 0.1.0.')).toBeVisible();
});

test.describe('in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-102 ext-catalog opens its app in Italian', async ({ page }) => {
    await signIn(page, member());
    await openApp(page, 'Catalogo');
    await expect(page.getByRole('heading', { name: 'Catalogo' })).toBeVisible();
    await expect(page.getByText('I file della tua organizzazione, in cartelle e sottocartelle.')).toBeVisible();
  });
});
