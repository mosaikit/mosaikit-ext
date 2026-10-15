// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Page } from '@playwright/test';
import { api, member, openApp, signIn, unique } from '@mosaikit/testing/playwright';

// A connection is edited from its detail panel (EXT-017): the steps of its creation form after the
// first, filled in, with the type fixed; saving changes only what the form shows, and the card and the
// detail show the new values at once. The sample API of the tests (tests/fixtures/sources) has a
// method and headers that its form does not show.

const API = '/api/v1/ext/connections';

interface Connection {
  id: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
}

async function create(name: string, type: string, settings: Record<string, unknown>, description?: string): Promise<Connection> {
  const { status, body } = await api(member(), `${API}/connections`, {
    method: 'POST',
    body: JSON.stringify({ name, type, settings, description }),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as Connection;
}

async function read(id: string): Promise<Connection> {
  const { status, body } = await api(member(), `${API}/connections/${id}`);
  expect(status).toBe(200);
  return body as Connection;
}

async function openConnections(page: Page, app = 'Connections'): Promise<void> {
  await signIn(page, member());
  await openApp(page, app);
  await expect(page.getByRole('heading', { name: app, exact: true })).toBeVisible();
}

const card = (page: Page, name: string) => page.getByRole('article', { name, exact: true });
const detail = (page: Page, name: string, label = `Detail of ${name}`) => page.getByRole('complementary', { name: label });
const panel = (page: Page) => page.locator('section.create');

/** Opens the detail of a connection and its Edit command. */
async function edit(page: Page, name: string) {
  await card(page, name).click();
  await expect(detail(page, name)).toBeVisible();
  await page.getByRole('group', { name: `Actions on ${name}` }).getByRole('button', { name: 'Edit', exact: true }).click();
}

test.describe('EXT-017 a connection is edited from its detail panel', () => {
  test('EXT-017 the Edit command of the detail opens the creation form of its type, filled in, with the type fixed', async ({ page }) => {
    const connection = await create(unique('Edit form'), 'sample', { host: 'edit.example.org', port: 9100 }, 'Before the edit.');
    await openConnections(page);
    await edit(page, connection.name);

    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole('heading', { name: `Edit ${connection.name}` })).toBeVisible();
    // The steps of the creation form after the first: the type is not chosen again.
    await expect(panel(page).locator('ol.steps li')).toHaveText(['2. How to connect', '3. How it is named']);
    await expect(panel(page).locator('ol.steps li[aria-current="step"]')).toHaveText('2. How to connect');
    await expect(panel(page).locator('.choose')).toBeHidden();
    await expect(page.getByLabel('Host (required)')).toHaveValue('edit.example.org');
    await expect(page.getByLabel('Port', { exact: true })).toHaveValue('9100');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(connection.name);
    await expect(page.getByLabel('Description')).toHaveValue('Before the edit.');
    const type = panel(page).locator('fieldset.naming .fixed-type');
    await expect(type).toContainText('Sample source');
    await expect(type.locator('input, select, button')).toHaveCount(0);

    // Cancelling goes back to the detail, unchanged.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel(page)).toBeHidden();
    await expect(detail(page, connection.name)).toBeVisible();
    expect(await read(connection.id)).toMatchObject({ settings: { host: 'edit.example.org', port: 9100 } });
  });

  test('EXT-017 saving updates the connection and keeps every setting the form does not show', async ({ page }) => {
    const connection = await create(unique('Edit kept'), 'sample-api', {
      url: 'https://api.example.org',
      method: 'POST',
      headers: 'X-Key: green',
    });
    await openConnections(page);
    await edit(page, connection.name);
    // The method and the headers are not in the form.
    await expect(page.getByLabel('Address (required)')).toHaveValue('https://api.example.org');
    await expect(panel(page).getByLabel('Method')).toHaveCount(0);
    await expect(panel(page).getByLabel('Headers')).toHaveCount(0);
    await page.getByLabel('Address (required)').fill('https://api2.example.org');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Description').fill('The second API.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(`Connection ${connection.name} saved.`);

    expect(await read(connection.id)).toMatchObject({
      description: 'The second API.',
      settings: { url: 'https://api2.example.org', method: 'POST', headers: 'X-Key: green' },
    });
  });

  test('EXT-017 the card and the detail show the new values after saving, without reloading the page', async ({ page }) => {
    const connection = await create(unique('Edit shown'), 'sample', { host: 'shown.example.org' }, 'Old words.');
    const renamed = unique('Edit renamed');
    await openConnections(page);
    // A mark on the page, which a reload would lose.
    await page.evaluate(() => {
      (window as unknown as { kept: boolean }).kept = true;
    });
    await edit(page, connection.name);
    await page.getByLabel('Host (required)').fill('moved.example.org');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(renamed);
    await page.getByLabel('Description').fill('New words.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(`Connection ${renamed} saved.`);

    // The detail is open again, with the new values.
    const shown = detail(page, renamed);
    await expect(shown).toBeVisible();
    await expect(shown.getByRole('heading', { name: renamed, level: 2 })).toBeVisible();
    await expect(shown.locator('[data-fact="description"]')).toHaveText('New words.');
    await expect(shown.locator('[data-fact="address"]')).toHaveText('sample://moved.example.org:9000');
    // And the card.
    await expect(card(page, renamed).locator('.subtitle')).toHaveText('New words.');
    await expect(card(page, connection.name)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
  });
});

test.describe('EXT-017 in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-017 editing from the detail speaks Italian', async ({ page }) => {
    const connection = await create(unique('Modifica'), 'sample', { host: 'it.example.org' });
    await openConnections(page, 'Connessioni');
    await card(page, connection.name).click();
    await expect(detail(page, connection.name, `Dettaglio di ${connection.name}`)).toBeVisible();
    await page.getByRole('group', { name: `Azioni su ${connection.name}` }).getByRole('button', { name: 'Modifica', exact: true }).click();
    await expect(panel(page).getByRole('heading', { name: `Modifica ${connection.name}` })).toBeVisible();
    await expect(panel(page).locator('ol.steps li')).toHaveText(['2. Come collegarsi', '3. Come si chiama']);
    await page.getByRole('button', { name: 'Annulla' }).click();
    await expect(detail(page, connection.name, `Dettaglio di ${connection.name}`)).toBeVisible();
  });
});
