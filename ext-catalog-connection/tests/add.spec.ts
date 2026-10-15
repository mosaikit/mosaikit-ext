// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Page } from '@playwright/test';
import { api, member, openApp, signIn, unique } from '@mosaikit/testing/playwright';

// Adding a connection takes three steps (EXT-013): what it is, the types of the connectors installed,
// grouped by category; how to connect, where the test previews the source or shows its error; how it
// is named and found, with a name proposed, the type fixed and tags. The connectors of the tests
// (tests/fixtures) declare a database, files, a stream and an API; the sample source holds three
// pieces at its top level, and its host unreachable.example.org does not answer.

const API = '/api/v1/ext/connections';

interface Connector {
  type: string;
  title: string;
  category: string;
  logo: string;
}

async function openConnections(page: Page, app = 'Connections'): Promise<void> {
  await signIn(page, member());
  await openApp(page, app);
  await expect(page.getByRole('heading', { name: app, exact: true })).toBeVisible();
}

const panel = (page: Page) => page.locator('section.create');
const current = (page: Page) => panel(page).locator('ol.steps li[aria-current="step"]');

/** A host no other test uses: the sample source answers for any host but one. */
const host = () => `${unique('h').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.example.org`;

test.describe('EXT-013 adding a connection takes three steps', () => {
  test('EXT-013 the first step lists every installed connector type with its logo, grouped by category', async ({ page }) => {
    const { body } = await api(member(), `${API}/connectors`);
    const connectors = (body as { connectors: Connector[] }).connectors;
    const titles: Record<string, string> = { database: 'Database', files: 'Files', stream: 'Stream', api: 'API' };
    await openConnections(page);
    await page.getByRole('button', { name: 'New connection' }).click();
    await expect(current(page)).toHaveText('1. What it is');
    await expect(panel(page).locator('ol.steps li')).toHaveText(['1. What it is', '2. How to connect', '3. How it is named']);

    const groups = panel(page).locator('.choose section.category');
    await expect(groups).toHaveCount(new Set(connectors.map((connector) => connector.category)).size);
    for (const connector of connectors) {
      const group = panel(page).getByRole('region', { name: titles[connector.category] ?? connector.category });
      const choice = group.locator(`button[data-type="${connector.type}"]`);
      await expect(choice).toContainText(connector.title);
      await expect(choice.locator('img.logo')).toHaveAttribute('src', connector.logo);
    }
    await expect(panel(page).locator('.choose button[data-type]')).toHaveCount(connectors.length);
  });

  test('EXT-013 on the second step a successful test previews the source, a failed one shows its error', async ({ page }) => {
    await openConnections(page);
    await page.getByRole('button', { name: 'New connection' }).click();
    await page.getByRole('button', { name: /Sample source/ }).click();
    await expect(current(page)).toHaveText('2. How to connect');
    const preview = panel(page).getByRole('region', { name: 'Preview of the source' });

    await page.getByLabel('Host (required)').fill('unreachable.example.org');
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(preview.getByRole('alert')).toHaveText('The source answered: unreachable.example.org does not answer');
    await expect(preview.locator('ul.entries > li')).toHaveCount(0);

    await page.getByLabel('Host (required)').fill(host());
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(preview.locator('ul.entries > li .name')).toHaveText(['sales', 'places', 'archive']);
    await expect(preview.locator('ul.entries > li .kind')).toHaveText(['schema', 'schema', 'folder']);
    await expect(preview.getByRole('alert')).toHaveCount(0);

    // The API of the preview, for any connector.
    const { status, body } = await api(member(), `${API}/connections/preview`, {
      method: 'POST',
      body: JSON.stringify({ type: 'sample-stream', settings: { broker: 'broker.example.org' } }),
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, contents: { state: 'listed', items: [{ name: 'orders' }, { name: 'clicks' }] } });
  });

  test('EXT-013 on the third step the name is proposed, the type is fixed and tags are added; saving shows the new connection', async ({ page }) => {
    const where = host();
    await openConnections(page);
    await page.getByRole('button', { name: 'New connection' }).click();
    await page.getByRole('button', { name: /Sample source/ }).click();
    await page.getByLabel('Host (required)').fill(where);
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(panel(page).getByRole('region', { name: 'Preview of the source' }).locator('ul.entries > li')).toHaveCount(3);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(current(page)).toHaveText('3. How it is named');

    // The name proposed from the address of the source, which the person may change; here it changes,
    // so that no other test finds a connection named after a type.
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(`Sample source ${where}:9000`);
    const name = unique('Added');
    await page.getByLabel('Name', { exact: true }).fill(name);
    // The type is fixed: shown, with no control to change it.
    const type = panel(page).locator('fieldset.naming .fixed-type');
    await expect(type).toContainText('Sample source');
    await expect(type.locator('input, select, button')).toHaveCount(0);
    // Tags, kept as the kernel keeps them.
    const typed = panel(page).getByRole('combobox', { name: 'Add a tag' });
    await typed.fill('Finance');
    await typed.press('Enter');
    await typed.fill('  Q3   reports ');
    await panel(page).getByRole('button', { name: 'Add', exact: true }).click();
    await typed.fill('finance');
    await typed.press('Enter');
    await expect(panel(page).locator('fieldset.naming .label.tag > span')).toHaveText(['finance', 'q3 reports']);

    // Back and forth keeps what was written.
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(current(page)).toHaveText('2. How to connect');
    await expect(page.getByLabel('Host (required)')).toHaveValue(where);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(name);

    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(`Connection ${name} created.`);
    await expect(panel(page)).toBeHidden();
    const created = page.getByRole('article', { name, exact: true });
    await expect(created).toBeVisible();
    await expect(created.locator('.label.type')).toHaveText('Sample source');
    await expect(created.locator('.label.tag > span')).toHaveText(['finance', 'q3 reports']);
    const { body } = await api(member(), `${API}/connections`);
    expect((body as { name: string; type: string; tags: string[] }[]).find((connection) => connection.name === name)).toMatchObject({
      type: 'sample',
      tags: ['finance', 'q3 reports'],
    });
  });

  test('EXT-013 the second step does not go on without its required settings', async ({ page }) => {
    await openConnections(page);
    await page.getByRole('button', { name: 'New connection' }).click();
    await page.getByRole('button', { name: /Sample source/ }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(current(page)).toHaveText('2. How to connect');
    await expect(page.getByLabel('Host (required)')).toBeFocused();
    // Without a test, the name is proposed from the settings.
    await page.getByLabel('Host (required)').fill('plain.example.org');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Sample source plain.example.org');
  });
});

test.describe('EXT-013 in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-013 the steps and the preview speak Italian', async ({ page }) => {
    await openConnections(page, 'Connessioni');
    await page.getByRole('button', { name: 'Nuova connessione' }).click();
    await expect(panel(page).locator('ol.steps li')).toHaveText(['1. Che cos’è', '2. Come collegarsi', '3. Come si chiama']);
    await page.getByRole('button', { name: /Sorgente di esempio/ }).click();
    await page.getByLabel('Host (obbligatorio)').fill('unreachable.example.org');
    await page.getByRole('button', { name: 'Prova connessione' }).click();
    await expect(panel(page).getByRole('region', { name: 'Anteprima della fonte' }).getByRole('alert')).toHaveText(
      'La fonte ha risposto: unreachable.example.org does not answer',
    );
    await page.getByRole('button', { name: 'Avanti', exact: true }).click();
    await expect(current(page)).toHaveText('3. Come si chiama');
  });
});
