// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { readdirSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { api, bench, member, openApp, restart, signIn, unique } from '@mosaikit/testing/playwright';

// Connectors are extensions, discovered by the connection framework (EXT-010). The bench installs the
// framework with two connectors of the tests (tests/fixtures), which nothing in the framework names: a
// sample source, and a connector whose declaration lacks its category.

const API = '/api/v1/ext/connections';
const SAMPLE = 'org.example.connector.sample';
const BROKEN = 'org.example.connector.broken';

interface Connection {
  id: string;
  name: string;
  type: string;
  connector: string;
  available: boolean;
  settings: Record<string, unknown>;
  credential: string | null;
}

/** Creates a connection to the sample source through the API, as the member. */
async function sampleConnection(name: string, credential: string | null = null): Promise<Connection> {
  const { status, body } = await api(member(), `${API}/connections`, {
    method: 'POST',
    body: JSON.stringify({ name, type: 'sample', settings: { host: 'db.example.org' }, credential }),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as Connection;
}

/** The names of the pieces of the contents of a connection, as the app lists them. */
function entries(page: Page, name: string) {
  return page.getByRole('region', { name: `Contents of ${name}` }).locator('ul.entries > li > .name');
}

async function openConnections(page: Page): Promise<void> {
  await signIn(page, member());
  await openApp(page, 'Connections');
  await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
}

test.describe('EXT-010 connectors are extensions, discovered by the connection framework', () => {
  test('EXT-010 New connection lists the type of an installed connector, with its logo and category', async ({ page }) => {
    await openConnections(page);
    await page.getByRole('button', { name: 'New connection' }).click();

    const type = page.getByRole('button', { name: /Sample source/ });
    await expect(type).toBeVisible();
    await expect(type).toContainText('Database');
    // The logo is an image of the connector extension, served by the kernel with its assets.
    const logo = type.locator('img.logo');
    await expect(logo).toHaveAttribute('src', `/api/v1/extension-assets/${SAMPLE}/web/logo.svg`);
    expect(await logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    // The refused connector offers no type.
    await expect(page.getByRole('button', { name: /Broken source/ })).toHaveCount(0);
  });

  test('EXT-010 a connection is created with the form of its connector, tested, and its contents listed', async ({ page }) => {
    const name = unique('Sales');
    await openConnections(page);
    await page.getByRole('button', { name: 'New connection' }).click();
    await page.getByRole('button', { name: /Sample source/ }).click();

    // The form the connector declares: a required host and a port with its default.
    await page.getByLabel('Name', { exact: true }).fill(name);
    await expect(page.getByLabel('Port')).toHaveValue('9000');
    await page.getByLabel('Host (required)').fill('unreachable.example.org');
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(page.getByRole('status')).toHaveText('Connection failed: unreachable.example.org does not answer');
    await page.getByLabel('Host (required)').fill('db.example.org');
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(page.getByRole('status')).toHaveText('Connection succeeded: Connected to db.example.org');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(`Connection ${name} created.`);

    // Its contents, as the connector lists them.
    await page.getByRole('button', { name, exact: true }).click();
    await expect(entries(page, name)).toHaveText(['sales', 'places', 'archive']);
    await entries(page, name).filter({ hasText: /^sales$/ }).click();
    await expect(entries(page, name)).toHaveText(['customers', 'orders']);

    const { body } = await api(member(), `${API}/connections`);
    const created = (body as Connection[]).find((connection) => connection.name === name);
    expect(created).toMatchObject({ type: 'sample', connector: SAMPLE, available: true, settings: { host: 'db.example.org', port: 9000 } });
  });

  test('EXT-010 the credential of a connection comes from the secrets service and is never returned', async () => {
    // The administrators of the organization keep its credentials: the colleague becomes one.
    const slug = bench().organization.slug;
    const promoted = await api(bench().admin, `/api/v1/organizations/${slug}/members/${member(1).user}`, {
      method: 'PUT',
      body: JSON.stringify({ roles: ['organization-user', 'organization-admin'] }),
    });
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(200);
    const credential = unique('sample-password').replace(' ', '-');
    const stored = await api(member(1), `/api/v1/organizations/${slug}/secrets`, {
      method: 'POST',
      body: JSON.stringify({ name: credential, kind: 'password', value: 's3cret' }),
    });
    expect(stored.status, JSON.stringify(stored.body)).toBe(201);

    const connection = await sampleConnection(unique('With credential'), credential);
    expect(connection.credential).toBe(credential);
    expect(JSON.stringify(connection)).not.toContain('s3cret');
    const tested = await api(member(), `${API}/connections/${connection.id}/test`, { method: 'POST' });
    expect(tested.body).toEqual({ success: true, message: 'Connected to db.example.org with the credential' });

    const missing = await sampleConnection(unique('Missing credential'), 'no-such-credential');
    const failed = await api(member(), `${API}/connections/${missing.id}/test`, { method: 'POST' });
    expect(failed.body).toMatchObject({ success: false });
  });

  test('EXT-010 a connector whose declaration lacks a field is refused naming it, the others keep working', async ({ page }) => {
    const { body } = await api(member(), `${API}/connectors`);
    const { connectors, problems } = body as { connectors: { type: string }[]; problems: unknown[] };
    // The connectors of the tests declare their types (EXT-011, EXT-019); the refused one declares none.
    expect(connectors.map((connector) => connector.type).sort()).toEqual(['sample', 'sample-api', 'sample-files', 'sample-stream']);
    expect(problems).toEqual([{ extension: BROKEN, field: 'category', message: 'the field category is missing' }]);

    // Refused when the kernel starts, in the log of the installation.
    expect(readFileSync(join(bench().work, 'installation.log'), 'utf8')).toContain(
      `Connector of ${BROKEN} refused: the field category is missing`,
    );

    await openConnections(page);
    const refused = page.getByRole('region', { name: 'Connectors refused' });
    await expect(refused).toContainText(`The connector of ${BROKEN} is refused: check the field category of its declaration.`);
    await page.getByRole('button', { name: 'New connection' }).click();
    await expect(page.getByRole('button', { name: /Sample source/ })).toBeVisible();
  });

  test('EXT-010 removing a connector leaves its connections unavailable, and they work again when it is back', async ({ page, browser }) => {
    test.setTimeout(600_000);
    const name = unique('Kept');
    const connection = await sampleConnection(name);

    // The connector extension is removed from the installation, which restarts without it.
    const extensions = join(bench().installation, 'extensions');
    const zip = readdirSync(extensions).find((file) => file.startsWith('connector-sample'));
    expect(zip).toBeDefined();
    const aside = join(bench().work, zip!);
    renameSync(join(extensions, zip!), aside);
    try {
      await restart();

      const { body } = await api(member(), `${API}/connections`);
      expect((body as Connection[]).find((found) => found.id === connection.id)).toMatchObject({
        name,
        type: 'sample',
        connector: SAMPLE,
        available: false,
      });
      const contents = await api(member(), `${API}/connections/${connection.id}/contents`);
      expect(contents.status).toBe(409);

      await openConnections(page);
      // The placeholder of the platform (MK-135) where the shell defines it, one alike otherwise.
      await expect(page.getByRole('note').filter({ hasText: `Not available: ${name}` })).toBeVisible();
      if (await page.evaluate(() => customElements.get('mk-reference-placeholder') !== undefined)) {
        await expect(page.locator(`mk-reference-placeholder[label="${name}"]`)).toBeVisible();
      }
      await expect(page.getByRole('article', { name, exact: true })).toContainText(
        `Its connector, ${SAMPLE}, is not installed or is turned off for the organization.`,
      );
      await page.getByRole('button', { name: 'New connection' }).click();
      await expect(page.getByRole('button', { name: /Sample source/ })).toHaveCount(0);
    } finally {
      // Installed again: the same connection works, with nothing to repair.
      renameSync(aside, join(extensions, zip!));
      await restart();
    }

    const { body } = await api(member(), `${API}/connections`);
    expect((body as Connection[]).find((found) => found.id === connection.id)).toMatchObject({ available: true });
    // A new page: the session of the first one may survive the restarts.
    const again = await browser.newPage();
    await openConnections(again);
    await again.getByRole('button', { name, exact: true }).click();
    await expect(entries(again, name)).toHaveText(['sales', 'places', 'archive']);
    await again.close();
  });
});

test.describe('EXT-010 in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-010 New connection shows the types of the connectors in Italian', async ({ page }) => {
    await signIn(page, member());
    await openApp(page, 'Connessioni');
    await page.getByRole('button', { name: 'Nuova connessione' }).click();
    const type = page.getByRole('button', { name: /Sorgente di esempio/ });
    await expect(type).toContainText('Database');
    await expect(page.getByRole('region', { name: 'Connettori rifiutati' })).toContainText(
      `Il connettore di ${BROKEN} è rifiutato: controlla il campo category della sua dichiarazione.`,
    );
  });
});
