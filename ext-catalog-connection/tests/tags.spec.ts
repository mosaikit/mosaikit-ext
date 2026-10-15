// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Page } from '@playwright/test';
import { api, member, openApp, signIn, unique } from '@mosaikit/testing/playwright';

// The labels of a connection (EXT-012): its type, a fact of its connector that cannot be removed, its
// category, from the taxonomy of the connectors, and free tags, kept by the kernel with the generic
// tags of the platform (MK-097). Types and tags are two columns of filters.

const API = '/api/v1/ext/connections';

interface Connection {
  id: string;
  name: string;
  type: string;
  available: boolean;
  tags: string[];
}

async function create(name: string, type: 'sample' | 'sample-files' = 'sample'): Promise<Connection> {
  const settings = type === 'sample' ? { host: 'db.example.org' } : { url: 'https://files.example.org/share' };
  const { status, body } = await api(member(), `${API}/connections`, {
    method: 'POST',
    body: JSON.stringify({ name, type, settings }),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as Connection;
}

async function tag(id: string, tags: string[]): Promise<Connection> {
  const { status, body } = await api(member(), `${API}/connections/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) });
  expect(status, JSON.stringify(body)).toBe(200);
  return body as Connection;
}

async function openConnections(page: Page, app = 'Connections'): Promise<void> {
  await signIn(page, member());
  await openApp(page, app);
  await expect(page.getByRole('heading', { name: app, exact: true })).toBeVisible();
}

/** A tag no other test uses. */
const word = (prefix: string) => unique(prefix).toLowerCase().replace(/[^a-z0-9]+/g, '-');

const card = (page: Page, name: string) => page.getByRole('article', { name, exact: true });
const filters = (page: Page) => page.getByRole('complementary', { name: 'Filters' });
const facet = (page: Page, title: string) => filters(page).getByRole('region', { name: title });
const value = (page: Page, title: string, label: string) => facet(page, title).locator('label').filter({ hasText: new RegExp(`^${label}\\d+$`) });

test.describe('EXT-012 connections carry a type, a category and free tags', () => {
  test('EXT-012 every connection shows its type, derived from its connector, which cannot be removed', async ({ page }) => {
    const connection = await create(unique('Labels type'));
    // The type is not a tag: replacing the tags leaves it.
    expect((await tag(connection.id, [])).tags).toEqual([]);
    await openConnections(page);
    const type = card(page, connection.name).locator('ul.labels .label.type');
    await expect(type).toHaveText('Sample source');
    await expect(type.locator('img.logo')).toHaveCount(1);
    await card(page, connection.name).click();
    const labels = page.getByRole('complementary', { name: `Detail of ${connection.name}` }).getByRole('list', { name: `Labels of ${connection.name}` });
    await expect(labels.locator('.label.type')).toHaveText('Sample source');
    await expect(labels.locator('.label.type').getByRole('button')).toHaveCount(0);
    await expect(labels.locator('.label.category').getByRole('button')).toHaveCount(0);
  });

  test('EXT-012 every connection shows a category from the taxonomy of the connectors, so none is without a tag', async ({ page }) => {
    const database = await create(unique('Labels category'));
    const files = await create(unique('Labels files'), 'sample-files');
    await openConnections(page);
    await expect(card(page, database.name).locator('.label.category')).toHaveText('Database');
    await expect(card(page, files.name).locator('.label.category')).toHaveText('Files');
    // Every card of an active connector has its category.
    const available = page.locator('article.card.opens');
    await expect(available.locator('.label.category')).toHaveCount(await available.count());
  });

  test('EXT-012 free tags are stored lowercase without duplicates and appear in the Tags filter', async ({ page }) => {
    const connection = await create(unique('Labels free'));
    const first = word('Finance');
    await openConnections(page);
    await card(page, connection.name).click();
    const detail = page.getByRole('complementary', { name: `Detail of ${connection.name}` });
    const field = detail.getByRole('combobox', { name: 'Add a tag' });
    await field.fill(first.toUpperCase());
    await detail.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(detail.locator('.label.tag > span')).toHaveText([first]);
    await field.fill(`  ${first}  `);
    await field.press('Enter');
    await field.fill('Q3   Reports');
    await field.press('Enter');
    await expect(detail.locator('.label.tag > span')).toHaveText([first, 'q3 reports']);
    const { body } = await api(member(), `${API}/connections/${connection.id}`);
    expect((body as Connection).tags).toEqual([first, 'q3 reports']);

    // On the card and in the Tags filter, a column apart from the types.
    await expect(card(page, connection.name).locator('.label.tag > span')).toHaveText([first, 'q3 reports']);
    await expect(value(page, 'Tags', first).locator('.number')).toHaveText('1');
    await expect(facet(page, 'Type').locator('label').filter({ hasText: first })).toHaveCount(0);

    // A tag is removed from the detail; the suggestions offer the tags in use.
    await detail.getByRole('button', { name: 'Remove the tag q3 reports' }).click();
    await expect(detail.locator('.label.tag > span')).toHaveText([first]);
    const suggested = await api(member(), `${API}/tags?prefix=${encodeURIComponent(first.slice(0, 8))}`);
    expect((suggested.body as { tags: string[] }).tags).toContain(first);
  });

  test('EXT-012 a type and a tag together give the intersection, two tags the union', async ({ page }) => {
    const shared = word('Shared');
    const other = word('Other');
    const a = await create(unique('Labels A'));
    const b = await create(unique('Labels B'), 'sample-files');
    const c = await create(unique('Labels C'));
    await tag(a.id, [shared]);
    await tag(b.id, [shared]);
    await tag(c.id, [other]);
    await openConnections(page);

    const shown = () => page.locator('article.card').evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')).sort());
    await value(page, 'Tags', shared).getByRole('checkbox').check();
    expect(await shown()).toEqual([a.name, b.name].sort());
    // A type and a tag: the intersection.
    await value(page, 'Type', 'Sample source').getByRole('checkbox').check();
    expect(await shown()).toEqual([a.name]);
    await value(page, 'Type', 'Sample source').getByRole('checkbox').uncheck();
    // Two tags of the same list: the union.
    await value(page, 'Tags', other).getByRole('checkbox').check();
    expect(await shown()).toEqual([a.name, b.name, c.name].sort());
    await expect(page.locator('.list-head .count')).toHaveText('3 connections');
  });
});

test.describe('EXT-012 in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-012 the labels and the Tags filter speak Italian', async ({ page }) => {
    const connection = await create(unique('Etichette'));
    const label = word('Vendite');
    await tag(connection.id, [label]);
    await openConnections(page, 'Connessioni');
    await expect(card(page, connection.name).locator('.label.type')).toHaveText('Sorgente di esempio');
    await expect(card(page, connection.name).locator('.label.category')).toHaveText('Database');
    await expect(page.getByRole('complementary', { name: 'Filtri' }).getByRole('region', { name: 'Etichette' })).toContainText(label);
    await card(page, connection.name).click();
    const detail = page.getByRole('complementary', { name: `Dettaglio di ${connection.name}` });
    await expect(detail.getByRole('combobox', { name: 'Aggiungi un’etichetta' })).toBeVisible();
    await expect(detail.getByRole('button', { name: `Rimuovi l’etichetta ${label}` })).toBeVisible();
  });
});
