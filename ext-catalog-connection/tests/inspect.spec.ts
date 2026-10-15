// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Page } from '@playwright/test';
import { api, member, openApp, signIn, unique } from '@mosaikit/testing/playwright';

// A connection declares what it contains by looking at it (EXT-018), not by its type. The connectors
// of the tests stand for the sources (tests/fixtures): a REST API whose customers answer JSON records
// and whose orders answer CSV; a stream that plays Kafka, server-sent events or WebSocket, which no
// connector of this repository reads yet, whose orders are JSON messages and clicks lines of text; a
// database whose table stores keeps coordinates in a text column, which only reading its rows shows;
// and files, whose connector cannot look at them.

const API = '/api/v1/ext/connections';

interface Inspection {
  piece: string;
  state: string;
  detail: string | null;
  shape: string | null;
  samples: string[];
  facts: Record<string, unknown>;
}

async function create(name: string, type: string, settings: Record<string, unknown>): Promise<{ id: string; name: string }> {
  const { status, body } = await api(member(), `${API}/connections`, {
    method: 'POST',
    body: JSON.stringify({ name, type, settings }),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as { id: string; name: string };
}

async function inspect(id: string, piece: string): Promise<Inspection> {
  const { status, body } = await api(member(), `${API}/connections/${id}/inspection?piece=${encodeURIComponent(piece)}`);
  expect(status, JSON.stringify(body)).toBe(200);
  return body as Inspection;
}

async function openConnections(page: Page, app = 'Connections'): Promise<void> {
  await signIn(page, member());
  await openApp(page, app);
  await expect(page.getByRole('heading', { name: app, exact: true })).toBeVisible();
}

const panel = (page: Page) => page.locator('section.create');
const preview = (page: Page, title = 'Preview of the source') => panel(page).getByRole('region', { name: title });
const previewed = (page: Page, id: string) => preview(page).locator(`ul.entries > li[data-id="${id}"]`);

/** Opens the detail of a connection and returns the region of its contents. */
async function contents(page: Page, name: string) {
  await page.keyboard.press('Escape');
  await page.getByRole('article', { name, exact: true }).click();
  return page.getByRole('region', { name: `Contents of ${name}` });
}

test.describe('EXT-018 a connection declares what it contains by inspecting it', () => {
  test('EXT-018 for a REST endpoint and for SSE, Kafka and WebSocket streams the connection step shows a sample and its shape', async ({ page }) => {
    await openConnections(page);
    // A REST API: each endpoint answers in its own shape.
    await page.getByRole('button', { name: 'New connection' }).click();
    await page.getByRole('button', { name: /Sample API/ }).click();
    await page.getByLabel('Address (required)').fill('https://api.example.org');
    await page.getByRole('button', { name: 'Test connection' }).click();
    const customers = previewed(page, 'GET /customers');
    await expect(customers.locator('.shape')).toHaveText('Shape: JSON records');
    await customers.getByText('Sample').click();
    await expect(customers.locator('pre.sample')).toContainText('"name":"Acme"');
    await expect(previewed(page, 'GET /orders').locator('.shape')).toHaveText('Shape: CSV');
    await expect(previewed(page, 'GET /orders').locator('pre.sample')).toContainText('id,customer,total');

    // Streams: the messages of each protocol.
    for (const protocol of ['kafka', 'sse', 'websocket']) {
      await page.getByRole('button', { name: 'Cancel' }).click();
      await page.getByRole('button', { name: 'New connection' }).click();
      await page.getByRole('button', { name: /Sample stream/ }).click();
      await page.getByLabel('Broker (required)').fill('broker.example.org');
      await page.getByLabel('Protocol').selectOption(protocol);
      await page.getByRole('button', { name: 'Test connection' }).click();
      const orders = previewed(page, 'orders');
      await expect(orders.locator('.shape')).toHaveText('Shape: JSON records');
      await expect(orders.locator('pre.sample')).toContainText(`"via":"${protocol}"`);
      await expect(previewed(page, 'clicks').locator('.shape')).toHaveText('Shape: Text');
      await expect(previewed(page, 'clicks').locator('pre.sample')).toContainText('page /home');
    }

    // The API of the preview says the same, with the facts of the shape.
    const { body } = await api(member(), `${API}/connections/preview`, {
      method: 'POST',
      body: JSON.stringify({ type: 'sample-api', settings: { url: 'https://api.example.org' } }),
    });
    const inspections = (body as { inspections: Inspection[] }).inspections;
    expect(inspections.map(({ piece, state, shape }) => ({ piece, state, shape }))).toEqual([
      { piece: 'GET /customers', state: 'inspected', shape: 'json-records' },
      { piece: 'GET /orders', state: 'inspected', shape: 'csv' },
    ]);
    expect(inspections[0]!.facts).toMatchObject({
      shape: 'json-records',
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'name', type: 'string' },
        { name: 'active', type: 'boolean' },
      ],
    });
  });

  test('EXT-018 for a database the list of tables shows the columns of each table with their types', async ({ page }) => {
    const database = await create(unique('Inspect tables'), 'sample', { host: 'db.example.org' });
    await openConnections(page);
    const region = await contents(page, database.name);
    await region.getByRole('button', { name: 'places', exact: true }).click();
    await expect(region.locator('ul.entries > li[data-id="places/sites"] .columns')).toHaveText('Columns: name text, location geometry');
    await expect(region.locator('ul.entries > li[data-id="places/stores"] .columns')).toHaveText('Columns: name text, position text');
    await region.getByRole('button', { name: 'Top level' }).click();
    await region.getByRole('button', { name: 'sales', exact: true }).click();
    await expect(region.locator('ul.entries > li[data-id="sales/customers"] .columns')).toHaveText('Columns: id integer, name text');
    await expect(region.locator('ul.entries > li[data-id="sales/orders"] .columns')).toHaveText('Columns: id integer, total numeric');
    // Each table shows its first rows too.
    const customers = region.locator('ul.entries > li[data-id="sales/customers"]');
    await expect(customers).toHaveAttribute('data-inspected', 'inspected');
    await expect(customers.locator('pre.sample')).toContainText('"name":"Green"');
  });

  test('EXT-018 a connector adds facts it finds by inspection, and the parts offer only the uses those facts allow', async ({ page }) => {
    const database = await create(unique('Inspect facts'), 'sample', { host: 'db.example.org' });
    // The listing does not know that stores holds coordinates; looking at its rows does.
    const { body } = await api(member(), `${API}/connections/${database.id}/contents?parent=places`);
    const stores = (body as { items: { id: string; facts: Record<string, unknown> }[] }).items.find((piece) => piece.id === 'places/stores');
    expect(stores?.facts.geometry).toBeUndefined();
    expect((await inspect(database.id, 'places/stores')).facts.geometry).toEqual(['position']);
    expect((await inspect(database.id, 'sales/customers')).facts.geometry).toBeUndefined();

    await openConnections(page);
    const region = await contents(page, database.name);
    await region.getByRole('button', { name: 'places', exact: true }).click();
    // The map of the consumer of the tests takes tables with a geometry: stores offers it once looked at.
    const uses = (id: string) => region.locator(`ul.entries > li[data-id="${id}"] ul.uses li`);
    await expect(region.locator('ul.entries > li[data-id="places/stores"]')).toHaveAttribute('data-inspected', 'inspected');
    await expect(uses('places/stores').filter({ hasText: /^Map$/ })).toHaveCount(1);
    await expect(uses('places/sites').filter({ hasText: /^Map$/ })).toHaveCount(1);
    await region.getByRole('button', { name: 'Top level' }).click();
    await region.getByRole('button', { name: 'sales', exact: true }).click();
    await expect(region.locator('ul.entries > li[data-id="sales/customers"]')).toHaveAttribute('data-inspected', 'inspected');
    await expect(uses('sales/customers').filter({ hasText: /^Chart$/ })).toHaveCount(1);
    await expect(uses('sales/customers').filter({ hasText: /^Map$/ })).toHaveCount(0);
  });

  test('EXT-018 a source that cannot be inspected says why instead of showing nothing', async ({ page }) => {
    const files = await create(unique('Inspect files'), 'sample-files', { url: 'https://files.example.org/share' });
    const down = await create(unique('Inspect down'), 'sample', { host: 'unreachable.example.org' });
    const database = await create(unique('Inspect schema'), 'sample', { host: 'db.example.org' });
    expect(await inspect(files.id, 'readme.txt')).toMatchObject({
      state: 'not-readable',
      detail: 'This connector cannot inspect the pieces of its sources yet',
      samples: [],
    });
    expect(await inspect(down.id, 'sales/customers')).toMatchObject({ state: 'unreachable', detail: 'unreachable.example.org does not answer' });
    expect(await inspect(database.id, 'sales')).toMatchObject({ state: 'not-readable' });
    const missing = await api(member(), `${API}/connections/${database.id}/inspection?piece=nowhere`);
    expect(missing.status).toBe(404);

    await openConnections(page);
    const region = await contents(page, files.name);
    const readme = region.locator('ul.entries > li[data-id="readme.txt"]');
    await expect(readme).toHaveAttribute('data-inspected', 'not-readable');
    await expect(readme.locator('.inspection')).toHaveText('Not inspected: This connector cannot inspect the pieces of its sources yet');
  });
});

test.describe('EXT-018 in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-018 the shapes and the reasons speak Italian', async ({ page }) => {
    const files = await create(unique('Esame'), 'sample-files', { url: 'https://files.example.org/share' });
    await openConnections(page, 'Connessioni');
    await page.getByRole('button', { name: 'Nuova connessione' }).click();
    await page.getByRole('button', { name: /API di esempio/ }).click();
    await page.getByLabel('Address (obbligatorio)').fill('https://api.example.org');
    await page.getByRole('button', { name: 'Prova connessione' }).click();
    const customers = preview(page, 'Anteprima della fonte').locator('ul.entries > li[data-id="GET /customers"]');
    await expect(customers.locator('.shape')).toHaveText('Forma: Record JSON');
    await expect(customers.getByText('Campione')).toBeVisible();
    await page.getByRole('button', { name: 'Annulla' }).click();
    await page.getByRole('article', { name: files.name, exact: true }).click();
    await expect(page.getByRole('region', { name: `Contenuto di ${files.name}` }).locator('.inspection')).toHaveText(
      'Non esaminata: This connector cannot inspect the pieces of its sources yet',
    );
  });
});
