// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Page } from '@playwright/test';
import { api, member, openApp, signIn, unique } from '@mosaikit/testing/playwright';

// Every connection lists its contents in one shape, with what each piece can be used for (EXT-019).
// The bench installs three connectors of the tests, which nothing in the framework names: a sample
// database, a sample stream and a sample API; and an extension of the tests that consumes data and
// contributes its uses of pieces (tests/fixtures/consumer): a chart of a table or view with columns, a
// map of one with geometries, a live view of a topic, and the input of a process.

const API = '/api/v1/ext/connections';

interface Piece {
  id: string;
  name: string;
  kind: string;
  container: boolean;
  facts: Record<string, unknown>;
}

interface Contents {
  parent: string;
  state: string;
  detail: string | null;
  items: Piece[];
  more: boolean;
}

/** Creates a connection through the API, as the member. */
async function connection(type: string, settings: Record<string, unknown>, prefix = 'Contents'): Promise<{ id: string; name: string }> {
  const name = unique(prefix);
  const { status, body } = await api(member(), `${API}/connections`, {
    method: 'POST',
    body: JSON.stringify({ name, type, settings }),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as { id: string; name: string };
}

async function contents(id: string, parent = ''): Promise<Contents> {
  const { status, body } = await api(member(), `${API}/connections/${id}/contents?parent=${encodeURIComponent(parent)}`);
  expect(status, JSON.stringify(body)).toBe(200);
  return body as Contents;
}

/** The region of the contents of a connection, opened from the list of the app. */
async function open(page: Page, name: string, title = `Contents of ${name}`) {
  await page.getByRole('button', { name, exact: true }).click();
  return page.getByRole('region', { name: title });
}

async function openConnections(page: Page, app = 'Connections'): Promise<void> {
  await signIn(page, member());
  await openApp(page, app);
}

/** The piece with an id in a region of contents. */
function piece(region: ReturnType<Page['getByRole']>, id: string) {
  return region.locator(`ul.entries > li[data-id="${id}"]`);
}

test.describe('EXT-019 every connection lists its contents in one shape', () => {
  test('EXT-019 a database, a stream and an API connection list their pieces, each with id, name and kind', async ({ page }) => {
    const database = await connection('sample', { host: 'db.example.org' });
    const stream = await connection('sample-stream', { broker: 'broker.example.org' });
    const rest = await connection('sample-api', { url: 'https://api.example.org' });

    // The API: one shape for every connector, read on the server.
    const top = await contents(database.id);
    expect(top).toMatchObject({ parent: '', state: 'listed', more: false });
    expect(top.items).toEqual([
      { id: 'sales', name: 'sales', kind: 'schema', container: true, facts: {} },
      { id: 'places', name: 'places', kind: 'schema', container: true, facts: {} },
      { id: 'archive', name: 'archive', kind: 'folder', container: true, facts: {} },
    ]);
    expect((await contents(database.id, 'sales')).items[0]).toEqual({
      id: 'sales/customers',
      name: 'customers',
      kind: 'table',
      container: false,
      facts: { columns: [{ name: 'id', type: 'integer' }, { name: 'name', type: 'text' }] },
    });
    expect((await contents(stream.id)).items).toEqual([
      { id: 'orders', name: 'orders', kind: 'topic', container: false, facts: { format: 'json' } },
      { id: 'clicks', name: 'clicks', kind: 'topic', container: false, facts: { format: 'json' } },
    ]);
    expect((await contents(rest.id)).items.map(({ id, name, kind }) => ({ id, name, kind }))).toEqual([
      { id: 'GET /customers', name: '/customers', kind: 'endpoint' },
      { id: 'GET /orders', name: '/orders', kind: 'endpoint' },
    ]);

    // The app: the same pieces, whatever the connector.
    await openConnections(page);
    const tables = await open(page, database.name);
    await tables.getByRole('button', { name: 'sales', exact: true }).click();
    await expect(tables.locator('nav.path li')).toHaveText(['Top level', 'sales']);
    await expect(piece(tables, 'sales/customers').locator('.name')).toHaveText('customers');
    await expect(piece(tables, 'sales/customers').locator('.kind')).toHaveText('table');
    await expect(piece(tables, 'sales/customers').locator('.columns')).toHaveText('Columns: id integer, name text');
    await expect(piece(tables, 'sales/orders').locator('.kind')).toHaveText('table');

    const topics = await open(page, stream.name);
    await expect(topics.locator('ul.entries > li .name')).toHaveText(['orders', 'clicks']);
    await expect(topics.locator('ul.entries > li .kind')).toHaveText(['topic', 'topic']);

    const endpoints = await open(page, rest.name);
    await expect(piece(endpoints, 'GET /customers').locator('.name')).toHaveText('/customers');
    await expect(piece(endpoints, 'GET /customers').locator('.kind')).toHaveText('endpoint');
  });

  test('EXT-019 each piece offers the uses of the installed extensions that its kind and facts allow', async ({ page }) => {
    const database = await connection('sample', { host: 'db.example.org' });
    const stream = await connection('sample-stream', { broker: 'broker.example.org' });
    const rest = await connection('sample-api', { url: 'https://api.example.org' });
    await openConnections(page);

    const region = await open(page, database.name);
    // A schema is a kind no use takes.
    await expect(piece(region, 'sales').locator('ul.uses')).toHaveCount(0);
    await region.getByRole('button', { name: 'sales', exact: true }).click();
    // A table with columns: a chart and the input of a process, not a map, which needs geometries.
    await expect(region.getByRole('list', { name: 'Uses of customers' }).getByRole('listitem')).toHaveText([
      'Chart',
      'Process input',
    ]);
    await expect(piece(region, 'sales/customers').locator('ul.uses li[data-use="org.example.consumer/chart"]')).toHaveAttribute(
      'title',
      'A chart of the rows of a table or a view.',
    );
    await region.getByRole('button', { name: 'Top level' }).click();
    await region.getByRole('button', { name: 'places', exact: true }).click();
    // The same kind with the fact of geometries is offered for a map too.
    await expect(region.getByRole('list', { name: 'Uses of sites' }).getByRole('listitem')).toHaveText([
      'Chart',
      'Map',
      'Process input',
    ]);

    const topics = await open(page, stream.name);
    await expect(topics.getByRole('list', { name: 'Uses of orders' }).getByRole('listitem')).toHaveText([
      'Live view',
      'Process input',
    ]);
    const endpoints = await open(page, rest.name);
    await expect(endpoints.getByRole('list', { name: 'Uses of /customers' }).getByRole('listitem')).toHaveText([
      'Process input',
    ]);
  });

  test('EXT-019 an unreachable source, an empty one, one that needs a declaration and a kind not yet readable say so in four ways', async ({ page }) => {
    const unreachable = await connection('sample', { host: 'unreachable.example.org' }, 'Unreachable');
    const empty = await connection('sample', { host: 'empty.example.org' }, 'Empty');
    const undeclared = await connection('sample-api', { url: 'https://undeclared.example.org' }, 'Undeclared');
    const database = await connection('sample', { host: 'db.example.org' }, 'Archive');

    expect(await contents(unreachable.id)).toEqual({
      parent: '',
      state: 'unreachable',
      detail: 'unreachable.example.org does not answer',
      items: [],
      more: false,
    });
    expect(await contents(empty.id)).toMatchObject({ state: 'empty', items: [] });
    expect(await contents(undeclared.id)).toMatchObject({
      state: 'needs-declaration',
      detail: 'The API publishes no description of its endpoints.',
    });
    expect(await contents(database.id, 'archive')).toMatchObject({
      state: 'not-readable',
      detail: 'The sample connector cannot read folders.',
    });

    await openConnections(page);
    const messages: string[] = [];
    for (const [name, text] of [
      [unreachable.name, 'The source does not answer: unreachable.example.org does not answer'],
      [empty.name, 'Nothing here: the source holds no pieces at this level.'],
      [
        undeclared.name,
        'The source does not describe what it contains: declare its pieces to use them. The API publishes no description of its endpoints.',
      ],
    ] as const) {
      const region = await open(page, name);
      await expect(region.getByRole('note')).toHaveText(text);
      await expect(region.locator('ul.entries > li')).toHaveCount(0);
      messages.push(text);
    }
    const region = await open(page, database.name);
    await region.getByRole('button', { name: 'archive', exact: true }).click();
    const notReadable = 'This kind of content cannot be read yet. The sample connector cannot read folders.';
    await expect(region.getByRole('note')).toHaveText(notReadable);
    await expect(region.locator('ul.entries > li')).toHaveCount(0);
    messages.push(notReadable);
    expect(new Set(messages).size).toBe(4);
    // A listed level shows no such message.
    await region.getByRole('button', { name: 'Top level' }).click();
    await expect(region.getByRole('note')).toBeHidden();
  });
});

test.describe('EXT-019 in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-019 the kinds, the uses and the messages of the contents are in Italian', async ({ page }) => {
    const database = await connection('sample', { host: 'db.example.org' });
    const unreachable = await connection('sample', { host: 'unreachable.example.org' }, 'Unreachable');
    await openConnections(page, 'Connessioni');

    const region = await open(page, database.name, `Contenuto di ${database.name}`);
    await region.getByRole('button', { name: 'places', exact: true }).click();
    await expect(piece(region, 'places/sites').locator('.kind')).toHaveText('tabella');
    await expect(region.getByRole('list', { name: 'Usi di sites' }).getByRole('listitem')).toHaveText([
      'Grafico',
      'Mappa',
      'Input di un processo',
    ]);
    await expect(piece(region, 'places/sites').locator('.columns')).toHaveText('Colonne: name text, location geometry');

    const failed = await open(page, unreachable.name, `Contenuto di ${unreachable.name}`);
    await expect(failed.getByRole('note')).toHaveText('La fonte non risponde: unreachable.example.org does not answer');
  });
});
