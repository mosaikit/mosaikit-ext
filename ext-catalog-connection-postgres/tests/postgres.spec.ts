// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Page } from '@playwright/test';
import { api, bench, member, openApp, signIn, unique } from '@mosaikit/testing/playwright';
import { asAdmin, source } from './source.js';

// PostgreSQL connect through ext-catalog-connection-postgres (EXT-040). The bench installs the connector
// with the connection framework it requires, on an embedded PostgreSQL that also holds the database the
// connections reach (tests/global-setup.ts).

const API = '/api/v1/ext/connections';
const EXTENSION = 'io.github.mosaikit.ext.catalog.connection.postgres';

interface Connection {
  id: string;
  name: string;
  type: string;
  connector: string;
  available: boolean;
  settings: Record<string, unknown>;
  credential: string | null;
}

interface Piece {
  id: string;
  name: string;
  kind: string;
  container: boolean;
  facts: Record<string, unknown>;
}

let promoted = false;

/** Stores a credential in the secrets service of the organization, as one of its administrators. */
async function credential(value: string): Promise<string> {
  const slug = bench().organization.slug;
  if (!promoted) {
    const done = await api(bench().admin, `/api/v1/organizations/${slug}/members/${member(1).user}`, {
      method: 'PUT',
      body: JSON.stringify({ roles: ['organization-user', 'organization-admin'] }),
    });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    promoted = true;
  }
  const name = unique('postgres-password').replaceAll(' ', '-');
  const stored = await api(member(1), `/api/v1/organizations/${slug}/secrets`, {
    method: 'POST',
    body: JSON.stringify({ name, kind: 'password', value }),
  });
  expect(stored.status, JSON.stringify(stored.body)).toBe(201);
  return name;
}

/** The settings of a connection to the database of the tests, with some of them changed. */
function settings(changes: Record<string, unknown> = {}): Record<string, unknown> {
  const { host, port, database, user } = source();
  return { host, port, database, user, ...changes };
}

async function connection(secret: string | null, changes: Record<string, unknown> = {}): Promise<Connection> {
  const { status, body } = await api(member(), `${API}/connections`, {
    method: 'POST',
    body: JSON.stringify({ name: unique('Shop'), type: 'postgres', settings: settings(changes), credential: secret }),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as Connection;
}

async function testOf(secret: string | null, changes: Record<string, unknown> = {}) {
  const { status, body } = await api(member(), `${API}/connections/test`, {
    method: 'POST',
    body: JSON.stringify({ type: 'postgres', settings: settings(changes), credential: secret }),
  });
  expect(status, JSON.stringify(body)).toBe(200);
  return body as { success: boolean; message: string };
}

async function contents(id: string, parent = '') {
  return api(member(), `${API}/connections/${id}/contents?parent=${encodeURIComponent(parent)}`);
}

async function openConnections(page: Page): Promise<void> {
  await signIn(page, member());
  await openApp(page, 'Connections');
}

const PREVIEW = /^PostgreSQL [\d.]+\S*, database shop: places\.sites, sales\.big_orders, sales\.customers, sales\.orders, sales\.totals$/;

test.describe('EXT-040 PostgreSQL connect through ext-catalog-connection-postgres', () => {
  test('EXT-040 with the connector installed, New connection offers a PostgreSQL database with its connection form', async ({ page }) => {
    const secret = await credential(source().password);
    const name = unique('Shop');
    await openConnections(page);
    await page.getByRole('button', { name: 'New connection' }).click();
    const type = page.getByRole('button', { name: /PostgreSQL/ });
    await expect(type).toContainText('Database');
    const logo = type.locator('img.logo');
    await expect(logo).toHaveAttribute('src', `/api/v1/extension-assets/${EXTENSION}/web/logo.svg`);
    expect(await logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await type.click();

    // The form of the connector: host, port, database, user and SSL mode; the password is the credential.
    await page.getByLabel('Name', { exact: true }).fill(name);
    await expect(page.getByLabel('Port')).toHaveValue('5432');
    await expect(page.getByLabel('SSL mode')).toHaveValue('prefer');
    await page.getByLabel('Host (required)').fill(source().host);
    await page.getByLabel('Port').fill(String(source().port));
    await page.getByLabel('Database (required)').fill(source().database);
    await page.getByLabel('User (required)').fill(source().user);
    await page.getByRole('textbox', { name: /^Credential/ }).fill(secret);
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(page.getByRole('status')).toHaveText(new RegExp(`^Connection succeeded: ${PREVIEW.source.slice(1)}`));
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(`Connection ${name} created.`);

    const { body } = await api(member(), `${API}/connections`);
    expect((body as Connection[]).find((found) => found.name === name)).toMatchObject({
      type: 'postgres',
      connector: EXTENSION,
      available: true,
      settings: { host: source().host, port: source().port, database: 'shop', user: 'reader', sslmode: 'prefer' },
      credential: secret,
    });
  });

  test('EXT-040 the connection test returns a preview of the content or the error of the remote system', async () => {
    const right = await credential(source().password);
    const wrong = await credential('not-the-password');

    const tested = await testOf(right);
    expect(tested.success).toBe(true);
    expect(tested.message).toMatch(PREVIEW);

    const refused = await testOf(wrong);
    expect(refused).toEqual({ success: false, message: expect.stringContaining('password authentication failed for user "reader"') });
    const missing = await testOf(right, { database: 'nowhere' });
    expect(missing).toEqual({ success: false, message: expect.stringContaining('database "nowhere" does not exist') });
    const closed = await testOf(right, { port: 1 });
    expect(closed).toEqual({ success: false, message: expect.stringMatching(/Connection to 127\.0\.0\.1:1 refused/) });
    for (const result of [tested, refused, missing, closed]) {
      expect(result.message).not.toContain(source().password);
    }

    // A saved connection is tested the same way.
    const saved = await connection(right);
    const again = await api(member(), `${API}/connections/${saved.id}/test`, { method: 'POST' });
    expect(again.body).toMatchObject({ success: true, message: expect.stringMatching(PREVIEW) });
  });

  test('EXT-040 the connector lists schemas and tables with their columns, and runs queries with the row limit', async ({ page }) => {
    const saved = await connection(await credential(source().password));

    // The schemas the user may use; secret is not one of them.
    const top = await contents(saved.id);
    expect(top.status).toBe(200);
    expect(top.body).toMatchObject({ state: 'listed', more: false });
    expect((top.body as { items: Piece[] }).items).toEqual(
      ['places', 'public', 'sales', 'staging'].map((schema) => ({ id: schema, name: schema, kind: 'schema', container: true, facts: {} })),
    );
    expect((await contents(saved.id, 'secret')).status).toBe(404);

    // The tables, views and materialized views of a schema, with their columns.
    const sales = (await contents(saved.id, 'sales')).body as { items: Piece[] };
    expect(sales.items.map(({ id, name, kind, container }) => ({ id, name, kind, container }))).toEqual([
      { id: 'sales/big_orders', name: 'big_orders', kind: 'view', container: false },
      { id: 'sales/customers', name: 'customers', kind: 'table', container: false },
      { id: 'sales/orders', name: 'orders', kind: 'table', container: false },
      { id: 'sales/totals', name: 'totals', kind: 'materialized-view', container: false },
    ]);
    expect(sales.items[2]?.facts).toEqual({
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'customer', type: 'integer' },
        { name: 'total', type: 'numeric(10,2)' },
        { name: 'placed', type: 'date' },
      ],
    });
    // A column of geometries is a fact of its table.
    const places = (await contents(saved.id, 'places')).body as { items: Piece[] };
    expect(places.items).toEqual([
      {
        id: 'places/sites',
        name: 'sites',
        kind: 'table',
        container: false,
        facts: { columns: [{ name: 'name', type: 'text' }, { name: 'location', type: 'geometry' }], geometry: ['location'] },
      },
    ]);
    expect((await contents(saved.id, 'staging')).body).toMatchObject({ state: 'empty', items: [] });

    // The same in the app.
    await openConnections(page);
    await page.getByRole('button', { name: saved.name, exact: true }).click();
    const region = page.getByRole('region', { name: `Contents of ${saved.name}` });
    await expect(region.locator('ul.entries > li > .name')).toHaveText(['places', 'public', 'sales', 'staging']);
    await region.getByRole('button', { name: 'sales', exact: true }).click();
    await expect(region.locator('ul.entries > li > .name')).toHaveText(['big_orders', 'customers', 'orders', 'totals']);
    await expect(region.locator('li[data-id="sales/orders"] .columns')).toHaveText(
      'Columns: id integer, customer integer, total numeric(10,2), placed date',
    );
    await expect(region.locator('li[data-id="sales/totals"] .kind')).toHaveText('materialized view');

    // Queries, capped at the row limit.
    const query = (statement: string, limit?: number) =>
      api(member(), `${API}/connections/${saved.id}/query`, { method: 'POST', body: JSON.stringify({ statement, limit }) });
    const two = await query('select id, total, placed from sales.orders order by id', 2);
    expect(two.status, JSON.stringify(two.body)).toBe(200);
    expect(two.body).toEqual({
      columns: [
        { name: 'id', type: 'int4' },
        { name: 'total', type: 'numeric' },
        { name: 'placed', type: 'date' },
      ],
      rows: [
        [1, 50, '2026-01-10'],
        [2, 150, '2026-02-11'],
      ],
      truncated: true,
    });
    const all = await query('select id from sales.orders order by id', 10);
    expect(all.body).toMatchObject({ rows: [[1], [2], [3], [4], [5]], truncated: false });
    expect((await query('select 1 as one')).body).toMatchObject({ rows: [[1]], truncated: false });
    expect((await query('select 1', 1001)).status).toBe(400);

    // A query only reads: a change is refused by the source, and nothing changes.
    const insert = await query("insert into sales.orders values (6, 1, 1.00, '2026-06-15') returning id");
    expect(insert.status).toBe(400);
    expect(insert.body).toMatchObject({ message: expect.stringContaining('read-only transaction') });
    const wrong = await query('select * from sales.nothing');
    expect(wrong).toMatchObject({ status: 400, body: { message: expect.stringContaining('relation "sales.nothing" does not exist') } });
    expect(await asAdmin<{ count: string }>(source().database, 'select count(*) from sales.orders')).toEqual([{ count: '5' }]);
  });

  test('EXT-040 the credential of a connection is stored encrypted and never returned by the API', async () => {
    const password = source().password;
    const secret = await credential(password);
    const saved = await connection(secret);
    const answers = [
      saved,
      (await api(member(), `${API}/connections`)).body,
      (await api(member(), `${API}/connections/${saved.id}/test`, { method: 'POST' })).body,
      (await contents(saved.id)).body,
      (await contents(saved.id, 'sales')).body,
      (
        await api(member(), `${API}/connections/${saved.id}/query`, {
          method: 'POST',
          body: JSON.stringify({ statement: 'select current_user' }),
        })
      ).body,
      (await api(member(1), `/api/v1/organizations/${bench().organization.slug}/secrets`)).body,
    ];
    expect(saved.credential).toBe(secret);
    expect((answers[5] as { rows: unknown[][] }).rows).toEqual([['reader']]);
    for (const answer of answers) {
      expect(JSON.stringify(answer)).not.toContain(password);
    }

    // In the database of the installation the credential is kept, by name, and its value never in clear.
    const tables = await asAdmin<{ schema: string; name: string }>(
      source().admin.database,
      `select table_schema as schema, table_name as name from information_schema.tables
       where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')`,
    );
    let named = 0;
    for (const { schema, name } of tables) {
      const table = `"${schema.replaceAll('"', '""')}"."${name.replaceAll('"', '""')}"`;
      const [clear] = await asAdmin<{ count: string }>(
        source().admin.database,
        `select count(*) from ${table} t where t::text like '%' || $1 || '%'`,
        [password],
      );
      expect(clear?.count, `the password in clear in ${table}`).toBe('0');
      const [byName] = await asAdmin<{ count: string }>(
        source().admin.database,
        `select count(*) from ${table} t where t::text like '%' || $1 || '%'`,
        [secret],
      );
      named += Number(byName?.count ?? 0);
    }
    expect(named).toBeGreaterThan(0);
  });
});
