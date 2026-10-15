// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Page } from '@playwright/test';
import { api, member, openApp, signIn, unique } from '@mosaikit/testing/playwright';

// The cards of the connections (EXT-014): a selection box, the size of the source, its last update,
// its status and a footer with the owner and the commands; a header with the order, most recent
// first, the grid/rows switch and the number of cards shown. The sample connector of the tests
// (tests/fixtures/sample) holds three pieces at the top level; its host unreachable.example.org does
// not answer.

const API = '/api/v1/ext/connections';

interface Connection {
  id: string;
  name: string;
  type: string;
  updated: string;
  pieces: number | null;
  morePieces: boolean;
  state: string | null;
  checked: string | null;
}

async function create(name: string, host = 'db.example.org', type = 'sample'): Promise<Connection> {
  const settings = type === 'sample' ? { host } : { url: 'https://files.example.org/share' };
  const { status, body } = await api(member(), `${API}/connections`, {
    method: 'POST',
    body: JSON.stringify({ name, type, settings }),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as Connection;
}

async function read(id: string): Promise<Connection> {
  const { status, body } = await api(member(), `${API}/connections/${id}`);
  expect(status).toBe(200);
  return body as Connection;
}

async function all(): Promise<Connection[]> {
  const { status, body } = await api(member(), `${API}/connections`);
  expect(status).toBe(200);
  return body as Connection[];
}

async function openConnections(page: Page, app = 'Connections'): Promise<void> {
  await signIn(page, member());
  await openApp(page, app);
  await expect(page.getByRole('heading', { name: app, exact: true })).toBeVisible();
}

const card = (page: Page, name: string) => page.getByRole('article', { name, exact: true });
const count = (page: Page) => page.locator('.list-head .count');
const typeFilter = (page: Page) => page.getByRole('complementary', { name: 'Filters' }).getByRole('region', { name: 'Type' });

/** The number at the start of the count of the header. */
async function counted(page: Page): Promise<number> {
  return Number.parseInt((await count(page).textContent()) ?? '', 10);
}

test.describe('EXT-014 connection cards with selection, size, freshness, status, owner and commands', () => {
  test('EXT-014 each card has a selection box, its size, its last update, its status and a footer with owner and commands', async ({ page }) => {
    const name = unique('Card measures');
    const created = await create(name);
    expect(created).toMatchObject({ pieces: null, morePieces: false, state: null, checked: null });
    expect(created.updated).toBeTruthy();
    const down = await create(unique('Card down'), 'unreachable.example.org');

    await openConnections(page);
    const shown = card(page, name);
    // Selection box.
    const box = shown.getByRole('checkbox', { name: `Select ${name}` });
    await expect(box).not.toBeChecked();
    // Size, last update and status, before the source is ever tested or listed.
    await expect(shown.locator('.size')).toHaveText('Size not known yet');
    await expect(shown.locator('time.updated')).toHaveAttribute('datetime', created.updated);
    await expect(shown.locator('time.updated')).toHaveText(/^Updated /);
    await expect(shown.locator('.status')).toHaveText('Not checked yet');
    // Footer with the owner and the commands.
    const footer = shown.locator('footer');
    await expect(footer.locator('.owner')).toHaveText(/^Owner: /);
    await expect(footer.getByRole('button', { name: `Edit ${name}` })).toBeVisible();

    // Selecting does not open the detail, and the header counts the selection.
    await box.check();
    await expect(page.locator('.list-head .selection')).toContainText('1 selected');
    await expect(page.locator('aside.detail')).toBeHidden();
    await page.locator('.list-head').getByRole('button', { name: 'Clear the selection' }).click();
    await expect(box).not.toBeChecked();
    await expect(page.locator('.list-head .selection')).toBeHidden();

    // Opening the detail lists the source: the card tells its size and that it answers.
    await shown.click();
    await expect(page.getByRole('region', { name: `Contents of ${name}` }).locator('ul.entries > li')).toHaveCount(3);
    await expect(shown.locator('.size')).toHaveText('3 pieces');
    await expect(shown.locator('.status')).toHaveText('Reachable');
    await page.keyboard.press('Escape');
    expect(await read(created.id)).toMatchObject({ pieces: 3, morePieces: false, state: 'reachable' });

    // A test of a source that does not answer.
    const tested = await api(member(), `${API}/connections/${down.id}/test`, { method: 'POST' });
    expect(tested.body).toMatchObject({ success: false });
    expect(await read(down.id)).toMatchObject({ state: 'unreachable', pieces: null });
    await page.reload();
    await expect(card(page, down.name).locator('.status')).toHaveText('Unreachable');
    await expect(card(page, down.name).locator('.status')).toHaveAttribute('data-status', 'unreachable');

    // The rows say the same, each with its selection box.
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Rows' }).click();
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row.getByRole('checkbox', { name: `Select ${name}` })).toBeVisible();
    await expect(row.locator('.size')).toHaveText('3 pieces');
    await expect(row.locator('time.updated')).toHaveAttribute('datetime', created.updated);
    await expect(row.locator('.status')).toHaveText('Reachable');
  });

  test('EXT-014 the header sorts by most recent by default or by name, and switches between grid and rows', async ({ page }) => {
    const older = await create(unique('Sort older'));
    await create(unique('Sort newer'));
    // Changing the older one makes it the most recent.
    const changed = await api(member(), `${API}/connections/${older.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: older.name, description: 'Changed now.', settings: { host: 'db.example.org' } }),
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(Date.parse((changed.body as Connection).updated)).toBeGreaterThan(Date.parse(older.updated));

    await openConnections(page);
    const sort = page.locator('.list-head').getByRole('combobox', { name: 'Sort by' });
    await expect(sort).toHaveValue('recent');
    await expect(sort.locator('option')).toHaveText(['Most recent', 'Name']);
    await expect(page.locator('article.card').first()).toHaveAttribute('aria-label', older.name);
    const updated = await page.locator('article.card time.updated').evaluateAll((all) => all.map((time) => Date.parse(time.getAttribute('datetime') ?? '')));
    expect(updated).toEqual([...updated].sort((a, b) => b - a));

    await sort.selectOption('name');
    const names = await page.locator('article.card').evaluateAll((all) => all.map((card) => card.getAttribute('aria-label') ?? ''));
    const sorted = await page.evaluate(
      (list) => [...list].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      names,
    );
    expect(names).toEqual(sorted);

    // The switch between grid and rows keeps the order.
    const switcher = page.getByRole('group', { name: 'View' });
    await expect(switcher.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
    await switcher.getByRole('button', { name: 'Rows' }).click();
    await expect(switcher.getByRole('button', { name: 'Rows' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('article.card')).toHaveCount(0);
    expect(await page.locator('tbody tr').evaluateAll((rows) => rows.map((row) => row.querySelector('td.name')?.textContent?.trim() ?? ''))).toEqual(names);
    await switcher.getByRole('button', { name: 'Grid' }).click();
    await expect(page.locator('article.card')).toHaveCount(names.length);
  });

  test('EXT-014 the number in the header equals the number of cards shown, also after filtering', async ({ page }) => {
    await create(unique('Count source'));
    await create(unique('Count files'), '', 'sample-files');
    const connections = await all();
    await openConnections(page);
    await expect(page.locator('article.card')).toHaveCount(connections.length);
    expect(await counted(page)).toBe(connections.length);

    const values = typeFilter(page).locator('label');
    const types = await values.count();
    expect(types).toBeGreaterThan(1);
    for (let i = 0; i < types; i++) {
      await values.nth(i).getByRole('checkbox').check();
      const shown = await page.locator('article.card').count();
      expect(await counted(page)).toBe(shown);
      expect(shown).toBe(Number(await values.nth(i).locator('.number').textContent()));
      await values.nth(i).getByRole('checkbox').uncheck();
    }
    // Two types together, in rows as in the grid.
    await values.nth(0).getByRole('checkbox').check();
    await values.nth(1).getByRole('checkbox').check();
    const together = await page.locator('article.card').count();
    expect(await counted(page)).toBe(together);
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Rows' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(together);
    expect(await counted(page)).toBe(together);
  });

  test('EXT-014 the unified list is the view shown when the connections page opens', async ({ page }) => {
    await create(unique('Unified sample'));
    await create(unique('Unified files'), '', 'sample-files');
    const connections = await all();
    await openConnections(page);
    // Every connection, whatever its type, as cards of one grid, with no filter and no detail open.
    await expect(page.locator('ul.cards')).toHaveCount(1);
    await expect(page.locator('ul.cards article.card')).toHaveCount(connections.length);
    expect(await counted(page)).toBe(connections.length);
    await expect(page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
    await expect(typeFilter(page).getByRole('checkbox', { checked: true })).toHaveCount(0);
    await expect(page.locator('aside.detail')).toBeHidden();
    await expect(page.locator('section.create')).toBeHidden();
    for (const type of new Set(connections.map((connection) => connection.type))) {
      await expect(page.locator(`ul.cards article.card[data-id="${connections.find((connection) => connection.type === type)!.id}"]`)).toBeVisible();
    }
  });
});

test.describe('EXT-014 in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-014 the cards and the header speak Italian', async ({ page }) => {
    const name = unique('Scheda');
    await create(name);
    await openConnections(page, 'Connessioni');
    const shown = card(page, name);
    await expect(shown.getByRole('checkbox', { name: `Seleziona ${name}` })).toBeVisible();
    await expect(shown.locator('.size')).toHaveText('Dimensione non ancora nota');
    await expect(shown.locator('time.updated')).toHaveText(/^Aggiornata /);
    await expect(shown.locator('.status')).toHaveText('Non ancora verificata');
    const sort = page.locator('.list-head').getByRole('combobox', { name: 'Ordina per' });
    await expect(sort.locator('option')).toHaveText(['Più recenti', 'Nome']);
    await shown.getByRole('checkbox').check();
    await expect(page.locator('.list-head .selection')).toContainText('1 selezionata');
    await expect(page.locator('.list-head').getByRole('button', { name: 'Annulla la selezione' })).toBeVisible();
  });
});
