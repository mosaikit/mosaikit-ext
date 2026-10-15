// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Locator, type Page } from '@playwright/test';
import { api, member, openApp, signIn, unique } from '@mosaikit/testing/playwright';

// The detail of a connection (EXT-016): a panel over the list, on its right edge, that does not move
// the cards; its header and facts stay in place while the pieces of the connection scroll, and its
// actions stay at the bottom. The cards that the tests click while a detail is open are the first two
// of the grid, at its left, where the panel never covers them.

const API = '/api/v1/ext/connections';

/** Creates a connection of the sample source through the API, as the member. */
async function create(name: string, description?: string): Promise<{ id: string; name: string }> {
  const { status, body } = await api(member(), `${API}/connections`, {
    method: 'POST',
    body: JSON.stringify({ name, type: 'sample', settings: { host: 'db.example.org' }, description }),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as { id: string; name: string };
}

async function openConnections(page: Page, app = 'Connections'): Promise<void> {
  await signIn(page, member());
  await openApp(page, app);
  await expect(page.getByRole('heading', { name: app, exact: true })).toBeVisible();
}

const card = (page: Page, name: string) => page.getByRole('article', { name, exact: true });
/**
 * The first two cards that open a detail, at the left of the grid: other tests of the bench add
 * connections, and the list is ordered by name.
 */
async function firstTwo(page: Page): Promise<[{ name: string }, { name: string }]> {
  const cards = page.locator('article.card.opens');
  await expect(cards.nth(1)).toBeVisible();
  const name = async (i: number) => ({ name: (await cards.nth(i).getAttribute('aria-label')) ?? '' });
  return [await name(0), await name(1)];
}

const detail = (page: Page, name: string, label = `Detail of ${name}`) => page.getByRole('complementary', { name: label });

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  expect(found).not.toBeNull();
  return found!;
}

test.describe('EXT-016 the detail of a connection opens as a panel over the list', () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test('EXT-016 clicking a card opens the detail on the right edge, over the list, without moving the other cards', async ({ page }) => {
    const first = await create(unique('000 Detail first'), 'The orders of the shop.');
    const second = await create(unique('001 Detail second'));
    await openConnections(page);
    const cards = page.locator('article.card');
    await expect(card(page, second.name)).toBeVisible();
    const before = await cards.evaluateAll((all) => all.map((element) => JSON.stringify(element.getBoundingClientRect())));

    await card(page, first.name).click();
    const panel = detail(page, first.name);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: first.name, level: 2 })).toBeVisible();
    await expect(panel.getByRole('region', { name: `Contents of ${first.name}` }).locator('ul.entries > li .name')).toHaveText([
      'sales',
      'places',
      'archive',
    ]);

    // On the right edge of the area of the app, as high as it, over the list.
    const area = await page.evaluate(() => {
      const main = document.querySelector('mk-shell')?.shadowRoot?.querySelector('main') ?? document.documentElement;
      const { top, bottom, right } = main.getBoundingClientRect();
      return { top, bottom, right };
    });
    const placed = await box(panel);
    expect(Math.abs(placed.x + placed.width - area.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(placed.y - Math.max(0, area.top))).toBeLessThanOrEqual(1);
    expect(Math.abs(placed.y + placed.height - area.bottom)).toBeLessThanOrEqual(1);
    const list = await box(page.locator('ul.cards'));
    expect(placed.x).toBeLessThan(list.x + list.width);

    // The cards did not move.
    expect(await cards.evaluateAll((all) => all.map((element) => JSON.stringify(element.getBoundingClientRect())))).toEqual(before);
  });

  test('EXT-016 the facts stay in place while the list of the pieces scrolls, and the actions stay at the bottom', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 420 });
    const connection = await create(unique('002 Detail facts'), 'The orders of the shop.');
    await openConnections(page);
    await card(page, connection.name).click();
    const panel = detail(page, connection.name);
    const contents = panel.getByRole('region', { name: `Contents of ${connection.name}` });
    await contents.getByRole('button', { name: 'sales', exact: true }).click();
    await expect(contents.locator('ul.entries > li .name')).toHaveText(['customers', 'orders']);

    // The facts of the connection.
    const facts = panel.locator('dl.facts');
    await expect(facts.locator('[data-fact="type"]')).toHaveText('Sample source');
    await expect(facts.locator('[data-fact="category"]')).toHaveText('Database');
    await expect(facts.locator('[data-fact="description"]')).toHaveText('The orders of the shop.');
    await expect(facts.locator('[data-fact="address"]')).toHaveText('sample://db.example.org');
    await expect(facts.locator('[data-fact="owner"]')).not.toBeEmpty();
    // The place of the tags, in the part that stays in place (they come with EXT-012).
    await expect(panel.locator('[data-slot="tags"]')).toHaveCount(1);

    // Only the pieces scroll: the panel itself does not.
    const parts = panel.locator('.parts');
    expect(await parts.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await panel.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
    const actions = panel.getByRole('group', { name: `Actions on ${connection.name}` });
    await expect(actions.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Test connection' })).toBeVisible();
    const fixed = async () => ({
      head: await box(panel.getByRole('heading', { name: connection.name, level: 2 })),
      facts: await box(facts),
      actions: await box(actions),
    });
    const before = await fixed();
    await parts.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await parts.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await fixed()).toEqual(before);
    // The actions at the bottom of the panel.
    const placed = await box(panel);
    expect(Math.abs(before.actions.y + before.actions.height - (placed.y + placed.height))).toBeLessThanOrEqual(1);

    // They act on the connection.
    await actions.getByRole('button', { name: 'Test connection' }).click();
    await expect(page.getByRole('status')).toHaveText('Connection succeeded: Connected to db.example.org');
  });

  test('EXT-016 clicking the card again or outside the panel closes it, clicking another card shows its detail', async ({ page }) => {
    await create(unique('003 Detail toggle'));
    await create(unique('004 Detail other'));
    await openConnections(page);
    const [first, second] = await firstTwo(page);

    // The same card again.
    await card(page, first.name).click();
    await expect(detail(page, first.name)).toBeVisible();
    await card(page, first.name).click();
    await expect(page.locator('aside.detail')).toBeHidden();

    // Another card.
    await card(page, first.name).click();
    await expect(detail(page, first.name)).toBeVisible();
    await card(page, second.name).click();
    await expect(detail(page, second.name)).toBeVisible();
    await expect(detail(page, second.name).getByRole('region', { name: `Contents of ${second.name}` })).toBeVisible();
    await expect(detail(page, first.name)).toHaveCount(0);

    // A click inside the panel keeps it open; one outside closes it.
    await detail(page, second.name).locator('dl.facts').click();
    await expect(detail(page, second.name)).toBeVisible();
    await page.getByRole('heading', { name: 'Connections', exact: true }).click();
    await expect(page.locator('aside.detail')).toBeHidden();

    // Escape and the close button close it too, giving the keyboard back to the card.
    await card(page, first.name).getByRole('button', { name: first.name, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(detail(page, first.name)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('aside.detail')).toBeHidden();
    await expect(card(page, first.name).getByRole('button', { name: first.name, exact: true })).toBeFocused();
    await card(page, first.name).click();
    await detail(page, first.name).getByRole('button', { name: 'Close the detail' }).click();
    await expect(page.locator('aside.detail')).toBeHidden();
  });

  test('EXT-016 the open card is marked as selected and announced with aria-current', async ({ page }) => {
    await create(unique('005 Detail selected'));
    await create(unique('006 Detail not selected'));
    await openConnections(page);
    const [first, second] = await firstTwo(page);
    const opener = card(page, first.name).getByRole('button', { name: first.name, exact: true });
    await expect(card(page, first.name)).not.toHaveAttribute('aria-current');
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    const unselected = await card(page, first.name).evaluate((element) => getComputedStyle(element).outlineStyle);

    await card(page, first.name).click();
    await expect(card(page, first.name)).toHaveAttribute('aria-current', 'true');
    await expect(card(page, first.name)).toHaveClass(/selected/);
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
    await expect(opener).toHaveAttribute('aria-controls', 'detail');
    expect(await card(page, first.name).evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(unselected);
    await expect(card(page, second.name)).not.toHaveAttribute('aria-current');

    // The mark follows the detail.
    await card(page, second.name).click();
    await expect(card(page, second.name)).toHaveAttribute('aria-current', 'true');
    await expect(card(page, first.name)).not.toHaveAttribute('aria-current');

    // And the row, in the row view.
    await page.keyboard.press('Escape');
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Rows' }).click();
    await page.getByRole('button', { name: first.name, exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: first.name })).toHaveAttribute('aria-current', 'true');
    await expect(detail(page, first.name)).toBeVisible();
  });
});

test.describe('EXT-016 in Italian', () => {
  test.use({ locale: 'it-IT', viewport: { width: 1600, height: 900 } });

  test('EXT-016 the detail speaks Italian', async ({ page }) => {
    const connection = await create(unique('007 Dettaglio'), 'Gli ordini del negozio.');
    await openConnections(page, 'Connessioni');
    await card(page, connection.name).click();
    const panel = detail(page, connection.name, `Dettaglio di ${connection.name}`);
    await expect(panel).toBeVisible();
    await expect(panel.locator('dl.facts dt')).toHaveText(['Tipo', 'Categoria', 'Descrizione', 'Indirizzo', 'Proprietario']);
    await expect(panel.getByRole('region', { name: `Contenuto di ${connection.name}` })).toBeVisible();
    const actions = panel.getByRole('group', { name: `Azioni su ${connection.name}` });
    await expect(actions.getByRole('button', { name: 'Modifica' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Prova connessione' })).toBeVisible();
    await panel.getByRole('button', { name: 'Chiudi il dettaglio' }).click();
    await expect(page.locator('aside.detail')).toBeHidden();
  });
});
