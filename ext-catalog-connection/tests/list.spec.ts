// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Page } from '@playwright/test';
import { api, member, openApp, signIn, unique } from '@mosaikit/testing/playwright';

// The list of the connections (EXT-011) and what each card says of its connection (EXT-015). The
// connector of the tests (tests/fixtures/sample) declares two types: a sample source, which tells the
// address of its source itself, and sample files, whose address the framework takes from its url.

const API = '/api/v1/ext/connections';

/** A PNG image of one pixel. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

interface Connection {
  id: string;
  name: string;
  type: string;
  description: string | null;
  address: string | null;
  owner: { account: string; name: string | null } | null;
  thumbnail: string | null;
  editable: boolean;
  settings: Record<string, unknown>;
}

/** Creates a connection through the API, as the member. */
async function create(name: string, type: 'sample' | 'sample-files', description?: string): Promise<Connection> {
  const settings = type === 'sample' ? { host: 'db.example.org' } : { url: 'https://files.example.org/share' };
  const { status, body } = await api(member(), `${API}/connections`, {
    method: 'POST',
    body: JSON.stringify({ name, type, settings, description }),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as Connection;
}

async function connections(): Promise<Connection[]> {
  const { status, body } = await api(member(), `${API}/connections`);
  expect(status).toBe(200);
  return body as Connection[];
}

async function openConnections(page: Page): Promise<void> {
  await signIn(page, member());
  await openApp(page, 'Connections');
  await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
}

/** The card of a connection in the grid. */
const card = (page: Page, name: string) => page.getByRole('article', { name, exact: true });

/** The Type filter, in the column of the filters. */
const typeFilter = (page: Page) => page.getByRole('complementary', { name: 'Filters' }).getByRole('region', { name: 'Type' });

/** The value of the Type filter for a type title, with its number. */
const typeValue = (page: Page, title: string) => typeFilter(page).locator('label').filter({ hasText: title });

test.describe('EXT-011 all connections of an organization in one list, filtered by type', () => {
  test('EXT-011 the Type filter lists only the types configured, each with the number of its connections', async ({ page }) => {
    await create(unique('Inventory'), 'sample');
    const before = await connections();
    const files = before.filter((connection) => connection.type === 'sample-files').length;
    await openConnections(page);
    if (files === 0) {
      // The connector of sample files is installed, but no connection has its type yet.
      await expect(typeValue(page, 'Sample source')).toBeVisible();
      await expect(typeValue(page, 'Sample files')).toHaveCount(0);
    }
    const name = unique('Shared drive');
    await create(name, 'sample-files');

    const all = await connections();
    const count = (type: string) => all.filter((connection) => connection.type === type).length;
    await page.reload();
    // One value per type configured: other tests of the bench may have configured more (EXT-019).
    await expect(typeFilter(page).locator('label')).toHaveCount(new Set(all.map((connection) => connection.type)).size);
    await expect(typeValue(page, 'Sample files').locator('.number')).toHaveText(String(count('sample-files')));
    await expect(typeValue(page, 'Sample source').locator('.number')).toHaveText(String(count('sample')));
    // The refused connector has no type, in the filter as in New connection.
    await expect(typeValue(page, 'Broken source')).toHaveCount(0);

    // Filtering: only the connections of the chosen types, and the header counts them.
    await typeValue(page, 'Sample files').getByRole('checkbox').check();
    await expect(page.locator('article.card')).toHaveCount(count('sample-files'));
    await expect(card(page, name)).toBeVisible();
    await expect(page.locator('.list-head .count')).toHaveText(
      count('sample-files') === 1 ? '1 connection' : `${count('sample-files')} connections`,
    );
    await typeValue(page, 'Sample source').getByRole('checkbox').check();
    await expect(page.locator('article.card')).toHaveCount(count('sample') + count('sample-files'));
    await typeValue(page, 'Sample files').getByRole('checkbox').uncheck();
    await expect(page.locator('article.card')).toHaveCount(count('sample'));
    await expect(card(page, name)).toHaveCount(0);
  });

  test('EXT-011 every connection appears as a card of one grid, with a row view next to it', async ({ page }) => {
    const names: [string, string, string] = [unique('Orders'), unique('Customers'), unique('Exports')];
    await create(names[0], 'sample');
    await create(names[1], 'sample');
    await create(names[2], 'sample-files');
    const all = await connections();

    await openConnections(page);
    // One grid, whatever the connector: every connection the person views is a card of it.
    await expect(page.locator('ul.cards')).toHaveCount(1);
    await expect(page.locator('ul.cards article.card')).toHaveCount(all.length);
    for (const name of names) {
      await expect(card(page, name)).toBeVisible();
    }
    await expect(card(page, names[2])).toContainText('Sample files');
    await expect(card(page, names[0])).toContainText('Sample source');
    await expect(page.locator('.list-head .count')).toHaveText(`${all.length} connections`);

    // The rows, next to the grid.
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Rows' }).click();
    await expect(page.getByRole('button', { name: 'Rows' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('article.card')).toHaveCount(0);
    await expect(page.locator('tbody tr')).toHaveCount(all.length);
    await expect(page.getByRole('row').filter({ hasText: names[2] })).toContainText('Sample files');
    await expect(page.getByRole('row').filter({ hasText: names[2] })).toContainText('https://files.example.org/share');
    // A connection opens from its row as from its card.
    await page.getByRole('button', { name: names[0], exact: true }).click();
    await expect(page.getByRole('region', { name: `Contents of ${names[0]}` })).toBeVisible();

    // The detail is a panel over the list (EXT-016): Escape closes it.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Grid' }).click();
    await expect(page.locator('ul.cards article.card')).toHaveCount(all.length);
  });

  test('EXT-011 two connections of the same type show two different thumbnails generated from their names', async ({ page }) => {
    const first = await create(unique('Warehouse north'), 'sample');
    const second = await create(unique('Warehouse south'), 'sample');

    await openConnections(page);
    const thumbnail = (name: string) => card(page, name).locator('.thumb[data-thumbnail="generated"] svg');
    await expect(thumbnail(first.name)).toBeVisible();
    await expect(thumbnail(second.name)).toBeVisible();
    const drawn = async (name: string) => thumbnail(name).evaluate((svg) => svg.outerHTML);
    const one = await drawn(first.name);
    const other = await drawn(second.name);
    expect(one).not.toEqual(other);

    // Derived from the name: the same name draws the same thumbnail, another name another one.
    const renamed = unique('Warehouse east');
    const rename = async (connection: Connection, name: string) => {
      const { status, body } = await api(member(), `${API}/connections/${connection.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, settings: connection.settings }),
      });
      expect(status, JSON.stringify(body)).toBe(200);
    };
    await rename(first, renamed);
    await page.reload();
    await expect(thumbnail(renamed)).toBeVisible();
    expect(await drawn(renamed)).not.toEqual(one);
    await rename(first, first.name);
    await page.reload();
    await expect(thumbnail(first.name)).toBeVisible();
    expect(await drawn(first.name)).toEqual(one);
    expect(await drawn(second.name)).toEqual(other);
  });

  test('EXT-011 a connection with an uploaded thumbnail shows that image instead of the generated one', async ({ page }) => {
    const connection = await create(unique('Pictured'), 'sample');
    await openConnections(page);
    await expect(card(page, connection.name).locator('.thumb')).toHaveAttribute('data-thumbnail', 'generated');

    // Edit, choose an image, save.
    await card(page, connection.name).getByRole('button', { name: `Edit ${connection.name}` }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Thumbnail').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(`Connection ${connection.name} saved.`);
    const image = card(page, connection.name).locator('.thumb[data-thumbnail="uploaded"] img');
    // A signed link of the file service to the image, which the page loads from the installation.
    await expect(image).toHaveAttribute('src', /^https?:\/\//);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1);
    await expect(card(page, connection.name).locator('.thumb svg')).toHaveCount(0);
    const stored = (await connections()).find((found) => found.id === connection.id);
    expect(stored?.thumbnail).toBeTruthy();

    // Only images without scripts: an SVG is refused.
    const svg = await api(member(), `${API}/connections/${connection.id}/thumbnail`, {
      method: 'PUT',
      headers: { 'content-type': 'image/svg+xml' },
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
    expect(svg.status).toBe(415);

    // Removed, the generated thumbnail is back.
    await card(page, connection.name).getByRole('button', { name: `Edit ${connection.name}` }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Remove the thumbnail').check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(card(page, connection.name).locator('.thumb')).toHaveAttribute('data-thumbnail', 'generated');
    expect((await connections()).find((found) => found.id === connection.id)?.thumbnail).toBeNull();
  });
});

test.describe('EXT-015 every connection has an owner and a description', () => {
  test('EXT-015 creating any kind of connection records the person who created it, and the card shows that owner', async ({ page }) => {
    const me = member();
    const sample = await create(unique('Owned source'), 'sample');
    const files = await create(unique('Owned files'), 'sample-files');
    for (const connection of [sample, files]) {
      expect(connection.owner?.account).toBeTruthy();
      expect(connection.owner?.name).toBe(me.name);
      expect(connection.editable).toBe(true);
    }
    expect(files.owner?.account).toBe(sample.owner?.account);

    // Created in the app, too.
    const name = unique('Owned in the app');
    await openConnections(page);
    await page.getByRole('button', { name: 'New connection' }).click();
    await page.getByRole('button', { name: /Sample files/ }).click();
    await page.getByLabel('Address (required)').fill('https://files.example.org/app');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(`Connection ${name} created.`);
    for (const each of [sample.name, files.name, name]) {
      await expect(card(page, each).locator('.owner')).toHaveText(`Owner: ${me.name}`);
    }
    const created = (await connections()).find((connection) => connection.name === name);
    expect(created?.owner?.account).toBe(sample.owner?.account);

    // The connection is a resource of its owner: a colleague without a grant does not reach it.
    const colleague = await api(member(1), `${API}/connections/${sample.id}`);
    const administrator = colleague.status === 200;
    if (!administrator) {
      expect(colleague.status).toBe(404);
      const edit = await api(member(1), `${API}/connections/${sample.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: 'Taken', settings: { host: 'db.example.org' } }),
      });
      expect(edit.status).toBe(404);
    }
  });

  test('EXT-015 the creation and edit forms have a description right under the name, and saving it empty clears it', async ({ page }) => {
    await openConnections(page);
    const labels = () => page.locator('form.connect fieldset.naming > label > span:first-child').allTextContents();

    // Every connector: the form of each type has the description right under the name.
    for (const type of [/Sample source/, /Sample files/]) {
      await page.getByRole('button', { name: 'New connection' }).click();
      await page.getByRole('button', { name: type }).click();
      expect((await labels()).slice(0, 2)).toEqual(['Name', 'Description']);
      await page.getByRole('button', { name: 'Cancel' }).click();
    }

    const name = unique('Described');
    await page.getByRole('button', { name: 'New connection' }).click();
    await page.getByRole('button', { name: /Sample source/ }).click();
    await page.getByLabel('Host (required)').fill('shop.example.org');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Description').fill('Orders and customers of the shop');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(`Connection ${name} created.`);
    await expect(card(page, name).locator('.subtitle')).toHaveText('Orders and customers of the shop');

    // The edit form: the same order, with the values of the connection.
    await card(page, name).getByRole('button', { name: `Edit ${name}` }).click();
    await expect(page.getByRole('heading', { name: `Edit ${name}` })).toBeVisible();
    expect((await labels()).slice(0, 2)).toEqual(['Name', 'Description']);
    await expect(page.getByLabel('Description')).toHaveValue('Orders and customers of the shop');
    await expect(page.getByLabel('Host (required)')).toHaveValue('shop.example.org');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Description').fill('The shop, all of it');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(`Connection ${name} saved.`);
    await expect(card(page, name).locator('.subtitle')).toHaveText('The shop, all of it');

    // Saved empty, the description is cleared.
    await card(page, name).getByRole('button', { name: `Edit ${name}` }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Description').fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(`Connection ${name} saved.`);
    expect((await connections()).find((connection) => connection.name === name)?.description).toBeNull();
    await expect(card(page, name).locator('.subtitle')).toHaveText('sample://shop.example.org:9000');
  });

  test('EXT-015 under the name a card shows the description, or the address of the source without one', async ({ page }) => {
    const described = await create(unique('With description'), 'sample', 'The sales of the year');
    const told = await create(unique('Told address'), 'sample');
    const settings = await create(unique('Address from settings'), 'sample-files');
    // The sample source tells its address; for sample files the framework reads its url.
    expect(told.address).toBe('sample://db.example.org');
    expect(settings.address).toBe('https://files.example.org/share');

    await openConnections(page);
    await expect(card(page, described.name).locator('.subtitle')).toHaveText('The sales of the year');
    await expect(card(page, told.name).locator('.subtitle')).toHaveText('sample://db.example.org');
    await expect(card(page, settings.name).locator('.subtitle')).toHaveText('https://files.example.org/share');
  });
});

test.describe('EXT-011 EXT-015 in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-011 EXT-015 the list, its filter and the cards speak Italian', async ({ page }) => {
    const connection = await create(unique('Vendite'), 'sample');
    await signIn(page, member());
    await openApp(page, 'Connessioni');
    await expect(page.getByRole('complementary', { name: 'Filtri' }).getByRole('region', { name: 'Tipo' })).toContainText('Sorgente di esempio');
    const italian = page.getByRole('article', { name: connection.name, exact: true });
    await expect(italian.locator('.owner')).toHaveText(`Proprietario: ${member().name}`);
    await expect(italian.getByRole('button', { name: `Modifica ${connection.name}` })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: 'Righe' })).toBeVisible();
    await expect(page.locator('.list-head .count')).toHaveText(/\d+ connession[ei]/);
  });
});
