// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Page } from '@playwright/test';
import { api, member, openApp, signIn, unique } from '@mosaikit/testing/playwright';
import { API, file, folder, openFolder, share, type Folder } from './catalog.js';

// EXT-001: the files of an organization are kept in folders and sub-folders. The member of the bench
// works in the app; the colleague is the other person of the organization.

const app = (page: Page) => page.locator('mosaikit-ext-catalog');
const tree = (page: Page) => app(page).getByRole('navigation', { name: 'Folders' });
const crumbs = (page: Page) => app(page).getByRole('navigation', { name: 'Path' });
const content = (page: Page) => app(page).getByRole('table', { name: /^(Content of|Contenuto di) / });

/** The names in the list of the open folder, in their order. */
async function names(page: Page): Promise<string[]> {
  return (await content(page).locator('tbody td.name').allTextContents()).map((name) => name.trim());
}

test('EXT-001 a folder created at the root and a sub-folder inside it appear in the tree and in the list of the parent', async ({
  page,
}) => {
  await signIn(page, member());
  await openApp(page, 'Catalog');
  const projects = unique('Projects');
  const drafts = unique('Drafts');

  await app(page).getByRole('button', { name: 'New folder' }).click();
  await app(page).getByLabel('Folder name').fill(projects);
  await app(page).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(app(page).getByRole('status')).toHaveText(`Folder ${projects} created.`);
  await expect(content(page).getByRole('link', { name: projects })).toBeVisible();
  await expect(tree(page).getByRole('link', { name: projects })).toBeVisible();

  await content(page).getByRole('link', { name: projects }).click();
  await expect(page).toHaveURL(/\/app\/catalog\?folder=/);
  await expect(app(page).getByText('This folder is empty.')).toBeVisible();
  await app(page).getByRole('button', { name: 'New folder' }).click();
  await app(page).getByLabel('Folder name').fill(drafts);
  await app(page).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(content(page).getByRole('link', { name: drafts })).toBeVisible();
  // In the tree the sub-folder is under its parent, which is expanded.
  const parentNode = tree(page).getByRole('listitem').filter({ has: page.getByRole('link', { name: projects }) }).last();
  await expect(parentNode.getByRole('button', { name: `Collapse ${projects}` })).toBeVisible();
  await expect(parentNode.getByRole('link', { name: drafts })).toBeVisible();

  // The same through the API: the root lists the folder, the folder its sub-folder, which is a
  // resource of the kernel owned by the person (MK-054).
  const root = (await api(member(), `${API}/folders`)).body as Folder;
  const parent = root.items.find((item) => item.name === projects);
  expect(parent?.kind).toBe('folder');
  const opened = (await api(member(), `${API}/folders/${parent?.id}`)).body as Folder;
  expect(opened.items.map((item) => item.name)).toEqual([drafts]);
  const child = opened.items[0];
  const registered = await api(member(), `/api/v1/sharing/resources/io.github.mosaikit.ext.catalog/folder/${child?.id}`);
  expect(registered.status).toBe(200);
  expect(JSON.stringify(registered.body)).toContain(drafts);

  // A second folder with the same name, in any case, is refused.
  const again = await api(member(), `${API}/folders`, {
    method: 'POST',
    body: JSON.stringify({ name: drafts.toUpperCase(), parent: parent?.id }),
  });
  expect(again.status).toBe(409);
  expect(JSON.stringify(again.body)).toContain(drafts);
});

test('EXT-001 a folder lists its files and sub-folders with name, size, owner, last change and sharing state', async ({
  page,
}) => {
  const top = await folder(member(), unique('Contracts'));
  const shared = await folder(member(), 'Shared with everyone', top.id);
  const report = await file(member(), top.id, 'report.txt', 'x'.repeat(2048));
  await file(member(), shared.id, 'notes.txt', 'hello');
  await share(member(), shared, { kind: 'organization' });

  await signIn(page, member());
  await openFolder(page, top.id);
  await expect(content(page)).toHaveAccessibleName(`Content of ${top.name}`);
  await expect(content(page).getByRole('columnheader')).toHaveText(['Name', 'Size', 'Owner', 'Last change', 'Sharing']);

  const folderRow = content(page).getByRole('row').filter({ hasText: 'Shared with everyone' });
  await expect(folderRow.getByRole('cell')).toHaveText([
    'Shared with everyone',
    '1 item',
    member().name,
    /\d/,
    'Whole organization',
  ]);
  const fileRow = content(page).getByRole('row').filter({ hasText: 'report.txt' });
  await expect(fileRow.getByRole('cell')).toHaveText(['report.txt', '2 KB', member().name, /\d/, 'Private']);
  const changed = await fileRow.locator('time').getAttribute('datetime');
  expect(changed).toBe(report.changed);

  // Inside the shared folder, the file is reached through the folder.
  await content(page).getByRole('link', { name: 'Shared with everyone' }).click();
  const notes = content(page).getByRole('row').filter({ hasText: 'notes.txt' });
  await expect(notes.getByRole('cell')).toHaveText(['notes.txt', '5 B', member().name, /\d/, 'Whole organization (from the folder)']);

  // The colleague reads the shared folder and its file, through the folder.
  const seen = await api(member(1), `${API}/folders/${shared.id}`);
  expect(seen.status).toBe(200);
  const item = (seen.body as Folder).items[0];
  expect(item).toMatchObject({ name: 'notes.txt', kind: 'file', size: 5, level: 'read' });
  expect(item?.owner?.name).toBe(member().name);
  expect(item?.sharing).toEqual({ scope: 'organization', inherited: true });
});

test('EXT-001 the content of a folder is sorted by name or by date', async ({ page }) => {
  const top = await folder(member(), unique('Sorting'));
  // Made one after the other: by date the newest comes first, by name the other way round.
  await folder(member(), 'Alpha', top.id);
  await folder(member(), 'beta', top.id);
  await file(member(), top.id, 'one.txt', '1');
  await file(member(), top.id, 'Two.txt', '2');

  await signIn(page, member());
  await openFolder(page, top.id);
  const name = content(page).getByRole('columnheader', { name: 'Name' });
  const changed = content(page).getByRole('columnheader', { name: 'Last change' });
  await expect(name).toHaveAttribute('aria-sort', 'ascending');
  await expect.poll(() => names(page)).toEqual(['Alpha', 'beta', 'one.txt', 'Two.txt']);

  await changed.getByRole('button').click();
  await expect(changed).toHaveAttribute('aria-sort', 'descending');
  await expect.poll(() => names(page)).toEqual(['beta', 'Alpha', 'Two.txt', 'one.txt']);

  await changed.getByRole('button').click();
  await expect(changed).toHaveAttribute('aria-sort', 'ascending');
  await expect.poll(() => names(page)).toEqual(['Alpha', 'beta', 'one.txt', 'Two.txt']);

  await name.getByRole('button').click();
  await name.getByRole('button').click();
  await expect(name).toHaveAttribute('aria-sort', 'descending');
  await expect.poll(() => names(page)).toEqual(['beta', 'Alpha', 'Two.txt', 'one.txt']);

  // The API sorts the same way.
  const byDate = (await api(member(), `${API}/folders/${top.id}?sort=changed&order=desc`)).body as Folder;
  expect(byDate.items.map((item) => item.name)).toEqual(['beta', 'Alpha', 'Two.txt', 'one.txt']);
  expect((await api(member(), `${API}/folders/${top.id}?sort=size`)).status).toBe(400);
});

test('EXT-001 the path of the open folder is shown as breadcrumbs, and each step opens that folder', async ({ page }) => {
  const a = await folder(member(), unique('Archive'));
  const b = await folder(member(), '2026', a.id);
  const c = await folder(member(), 'October', b.id);

  await signIn(page, member());
  await openFolder(page, c.id);
  await expect(crumbs(page).getByRole('link')).toHaveText(['Files', a.name, '2026', 'October']);
  await expect(crumbs(page).getByRole('link', { name: 'October' })).toHaveAttribute('aria-current', 'page');
  // The tree is open down to the folder.
  await expect(tree(page).getByRole('link', { name: 'October' })).toHaveAttribute('aria-current', 'page');

  await crumbs(page).getByRole('link', { name: '2026' }).click();
  await expect(page).toHaveURL(new RegExp(`\\?folder=${b.id}$`));
  await expect(content(page)).toHaveAccessibleName('Content of 2026');
  await expect(content(page).getByRole('link', { name: 'October' })).toBeVisible();
  await expect(crumbs(page).getByRole('link')).toHaveText(['Files', a.name, '2026']);

  await crumbs(page).getByRole('link', { name: a.name }).click();
  await expect(content(page)).toHaveAccessibleName(`Content of ${a.name}`);
  await expect(content(page).getByRole('link', { name: '2026' })).toBeVisible();

  await crumbs(page).getByRole('link', { name: 'Files' }).click();
  await expect(page).toHaveURL(/\/app\/catalog$/);
  await expect(content(page)).toHaveAccessibleName('Content of Files');
  await expect(content(page).getByRole('link', { name: a.name })).toBeVisible();

  // The back button of the browser goes back along the same steps.
  await page.goBack();
  await expect(content(page)).toHaveAccessibleName(`Content of ${a.name}`);
});

test('EXT-001 the address of a folder the person cannot read answers not found, the same as a folder that does not exist', async ({
  page,
}) => {
  const secret = await folder(member(), unique('Private'));
  const missing = crypto.randomUUID();

  // The API answers the colleague the same for both, also when they try to add to it.
  const hidden = await api(member(1), `${API}/folders/${secret.id}`);
  const absent = await api(member(1), `${API}/folders/${missing}`);
  expect(hidden.status).toBe(404);
  expect(absent.status).toBe(404);
  expect(hidden.body).toEqual(absent.body);
  const addHidden = await api(member(1), `${API}/folders`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Intruder', parent: secret.id }),
  });
  const addAbsent = await api(member(1), `${API}/folders`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Intruder', parent: missing }),
  });
  expect(addHidden.status).toBe(404);
  expect(addHidden.body).toEqual(addAbsent.body);
  // Nor is the folder in the colleague's list.
  const root = (await api(member(1), `${API}/folders`)).body as Folder;
  expect(root.items.map((item) => item.id)).not.toContain(secret.id);

  // The page says the same for both.
  await signIn(page, member(1));
  await openFolder(page, secret.id);
  await expect(app(page).getByRole('heading', { name: 'Folder not found' })).toBeVisible();
  const forHidden = await app(page).locator('section.content').innerText();
  await expect(app(page).getByText(secret.name)).toHaveCount(0);
  await openFolder(page, missing);
  await expect(app(page).getByRole('heading', { name: 'Folder not found' })).toBeVisible();
  expect(await app(page).locator('section.content').innerText()).toBe(forHidden);

  // Once shared with the colleague, the same address opens it.
  await share(member(), secret, { kind: 'person', email: member(1).user });
  expect((await api(member(1), `${API}/folders/${secret.id}`)).status).toBe(200);
  await openFolder(page, secret.id);
  await expect(content(page)).toHaveAccessibleName(`Content of ${secret.name}`);
});

test.describe('in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-001 the catalog speaks Italian', async ({ page }) => {
    const top = await folder(member(), unique('Fatture'));
    await file(member(), top.id, 'gennaio.txt', 'x'.repeat(1536));

    await signIn(page, member());
    await openApp(page, 'Catalogo');
    await expect(app(page).getByRole('navigation', { name: 'Cartelle' })).toBeVisible();
    await expect(app(page).getByRole('navigation', { name: 'Percorso' }).getByRole('link')).toHaveText(['File']);
    await app(page).getByRole('navigation', { name: 'Cartelle' }).getByRole('link', { name: top.name }).click();

    const table = app(page).getByRole('table', { name: `Contenuto di ${top.name}` });
    await expect(table.getByRole('columnheader')).toHaveText([
      'Nome',
      'Dimensione',
      'Proprietario',
      'Ultima modifica',
      'Condivisione',
    ]);
    await expect(table.getByRole('row').filter({ hasText: 'gennaio.txt' }).getByRole('cell')).toHaveText([
      'gennaio.txt',
      '1,5 KB',
      member().name,
      /\d/,
      'Privato',
    ]);

    await app(page).getByRole('button', { name: 'Nuova cartella' }).click();
    await app(page).getByLabel('Nome della cartella').fill('Bozze');
    await app(page).getByRole('button', { name: 'Crea', exact: true }).click();
    await expect(app(page).getByRole('status')).toHaveText('Cartella Bozze creata.');
    await expect(table.getByRole('row').filter({ hasText: 'Bozze' }).getByRole('cell')).toHaveText([
      'Bozze',
      'Vuota',
      member().name,
      /\d/,
      'Privato',
    ]);

    await page.goto(page.url().replace(/folder=.*/, `folder=${crypto.randomUUID()}`));
    await expect(app(page).getByRole('heading', { name: 'Cartella non trovata' })).toBeVisible();
    await expect(app(page).getByText('Non esiste, oppure non hai accesso.')).toBeVisible();
  });
});
