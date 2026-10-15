// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { api, bench, member, restart, signIn, unique } from '@mosaikit/testing/playwright';
import { API, download, fetchLink, fileOfType, folder, openFolder, share, type Folder, type Item } from './catalog.js';

// EXT-105: other extensions add kinds of files to the file manager through the contract file-kind of
// the catalog. The fixture tests/fixtures/text-notes (org.example.textnotes) adds "text note": *.note,
// text/x-note, or a text that starts with "NOTE:", with an icon, a preview, the states counted and empty,
// and the action Count words.

const NOTES = 'org.example.textnotes';
const NOTES_API = '/api/v1/ext/text-notes';

const app = (page: Page) => page.locator('mosaikit-ext-catalog');
const content = (page: Page) => app(page).getByRole('table', { name: /^(Content of|Contenuto di) / });
const row = (page: Page, name: string) => content(page).getByRole('row').filter({ hasText: name });
const detail = (page: Page) => app(page).locator('section.detail');
const dialog = (page: Page) => app(page).getByRole('dialog');

interface Received {
  change: string;
  file: string;
  name: string;
  mediaType: string;
  folder: string | null;
  path: string[];
  kind: string;
  details: Record<string, string>;
  content: string | null;
}

/** The changes the kind of the fixture was told about a file, read on the server. */
async function told(file: string): Promise<Received[]> {
  const { status, body } = await api(member(), `${NOTES_API}/events`);
  expect(status, JSON.stringify(body)).toBe(200);
  return (body as Received[]).filter((each) => each.file === file);
}

/** Waits until the kind was told a change of a file, and gives that change. */
async function toldOf(file: string, change: string, count = 1): Promise<Received> {
  await expect
    .poll(async () => (await told(file)).filter((each) => each.change === change).length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(count);
  return (await told(file)).filter((each) => each.change === change).at(count - 1)!;
}

/** A file of a folder, as the API lists it. */
async function listed(parent: string, name: string): Promise<Item> {
  const found = ((await api(member(), `${API}/folders/${parent}`)).body as Folder).items.find((item) => item.name === name);
  expect(found, `${name} in ${parent}`).toBeTruthy();
  return found!;
}

/** Waits until a file of a folder has a state recorded by its kind. */
async function stateOf(parent: string, name: string, state: string | null): Promise<Item> {
  await expect.poll(async () => (await listed(parent, name)).fileKind?.state ?? null, { timeout: 30_000 }).toBe(state);
  return listed(parent, name);
}

test('EXT-105 a kind declared through the contract of the catalog recognizes files by name, media type or content, and the file manager shows them with its icon and its preview', async ({
  page,
}) => {
  const top = await folder(member(), unique('Kinds'));
  const byName = await fileOfType(member(), top.id, 'plan.note', 'Buy bread and milk', 'text/plain');
  const byType = await fileOfType(member(), top.id, 'memo.txt', 'Call the office', 'text/x-note');
  const byContent = await fileOfType(member(), top.id, 'todo.txt', 'NOTE: water the plants', 'text/plain');
  const plain = await fileOfType(member(), top.id, 'plain.txt', 'Just a text', 'text/plain');

  for (const item of [byName, byType, byContent]) {
    expect(item.fileKind, item.name).toEqual(expect.objectContaining({ extension: NOTES, name: 'text-note' }));
  }
  expect(plain.fileKind).toBeNull();
  expect(byType.contentType).toBe('text/x-note');

  await signIn(page, member());
  await openFolder(page, top.id);
  // The icon of the kind comes from the package of its extension; a plain file keeps the icon of a file.
  const icon = row(page, 'plan.note').locator('img.kind');
  await expect(icon).toHaveAttribute('src', `/api/v1/extension-assets/${NOTES}/web/note.svg`);
  await expect.poll(() => icon.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(row(page, 'plan.note').getByText('Text note', { exact: true })).toBeVisible();
  await expect(row(page, 'todo.txt').getByText('Text note', { exact: true })).toBeVisible();
  await expect(row(page, 'plain.txt').locator('img.kind')).toHaveCount(0);
  await expect(row(page, 'plain.txt').getByText('Text note', { exact: true })).toHaveCount(0);

  // The detail of a note shows its kind and its preview element, which reads the note.
  await row(page, 'plan.note').getByRole('button', { name: 'Details of plan.note' }).click();
  await expect(detail(page).getByRole('heading', { name: 'plan.note' })).toBeVisible();
  await expect(detail(page).getByRole('definition').filter({ hasText: 'Text note' })).toBeVisible();
  await expect(detail(page).getByRole('region', { name: 'Preview of plan.note' })).toContainText('Buy bread and milk');

  // A plain file has no preview: its detail says it is a file.
  await row(page, 'plain.txt').getByRole('button', { name: 'Details of plain.txt' }).click();
  await expect(detail(page).getByRole('heading', { name: 'plain.txt' })).toBeVisible();
  await expect(detail(page).getByRole('definition').filter({ hasText: /^File$/ })).toBeVisible();
  await expect(detail(page).getByRole('region', { name: /^Preview of/ })).toHaveCount(0);
});

test('EXT-105 the actions of a kind are in the list and in the detail of its files, and the file manager works the same on plain files', async ({
  page,
}) => {
  const top = await folder(member(), unique('Actions'));
  await fileOfType(member(), top.id, 'words.note', 'one two three four', 'text/plain');
  await fileOfType(member(), top.id, 'other.txt', 'not a note', 'text/plain');

  await signIn(page, member());
  await openFolder(page, top.id);
  // In the list: the action of the kind on its file, none on a plain file.
  await expect(row(page, 'words.note').getByRole('button', { name: 'Count words: words.note' })).toBeVisible();
  await expect(row(page, 'other.txt').getByRole('button', { name: /^Count words/ })).toHaveCount(0);

  await row(page, 'words.note').getByRole('button', { name: 'Count words: words.note' }).click();
  await expect(dialog(page)).toContainText('words.note has 4 words.');
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  // The action recorded its state on the file, which the list shows.
  await expect(row(page, 'words.note').getByText('Counted', { exact: true })).toBeVisible();
  expect((await listed(top.id, 'words.note')).fileKind).toEqual(
    expect.objectContaining({ state: 'counted', stateDetail: '4 words' }),
  );

  // In the detail: the same action, and the state with its detail.
  await row(page, 'words.note').getByRole('button', { name: 'Details of words.note' }).click();
  await expect(detail(page).getByRole('definition').filter({ hasText: 'Counted: 4 words' })).toBeVisible();
  await expect(
    detail(page).getByRole('group', { name: 'Actions on words.note' }).getByRole('button', { name: 'Count words: words.note' }),
  ).toBeVisible();

  // A plain file: no actions of a kind, and the gestures of the file manager as always.
  await row(page, 'other.txt').getByRole('button', { name: 'Details of other.txt' }).click();
  await expect(detail(page).getByRole('group', { name: /^Actions on/ })).toBeHidden();
  await row(page, 'other.txt').getByRole('checkbox').check();
  await app(page).getByRole('button', { name: 'Rename' }).click();
  await dialog(page).getByRole('textbox').fill('renamed.txt');
  await dialog(page).getByRole('button', { name: 'Rename' }).click();
  await expect(row(page, 'renamed.txt')).toBeVisible();
  const plain = await listed(top.id, 'renamed.txt');
  const { download: link } = await download(member(), [plain.id]);
  expect((await fetchLink(link.entries[0]!.url!)).text).toBe('not a note');
});

test('EXT-105 the kind is told when its file is stored, replaced, renamed, moved, shared differently or deleted, reads it on the server, and records a state the file manager shows', async ({
  page,
}) => {
  const top = await folder(member(), unique('Told'));
  const sub = await folder(member(), 'Archive', top.id);
  const note = await fileOfType(member(), top.id, 'story.note', 'Once upon a time', 'text/plain');

  // Stored: the kind reads the content on the server and records its state.
  const stored = await toldOf(note.id, 'STORED');
  expect(stored).toEqual(
    expect.objectContaining({ name: 'story.note', kind: `${NOTES}/text-note`, folder: top.id, content: 'Once upon a time' }),
  );
  expect(stored.path).toEqual([top.name]);
  expect((await stateOf(top.id, 'story.note', 'counted')).fileKind?.stateDetail).toBe('4 words');

  // Replaced: the same file with another content.
  const replaced = await api(member(), `${API}/items/${note.id}/content`, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: 'NOTE:',
  });
  expect(replaced.status, JSON.stringify(replaced.body)).toBe(204);
  expect((await toldOf(note.id, 'REPLACED')).content).toBe('NOTE:');
  await stateOf(top.id, 'story.note', 'empty');

  // The file manager shows the state the kind recorded, with its detail.
  await signIn(page, member());
  await openFolder(page, top.id);
  await expect(row(page, 'story.note').getByText('Empty', { exact: true })).toBeVisible();
  await row(page, 'story.note').getByRole('button', { name: 'Details of story.note' }).click();
  await expect(detail(page).getByRole('definition').filter({ hasText: 'Empty: The note has no words.' })).toBeVisible();

  // Renamed, then moved into a sub-folder.
  expect((await api(member(), `${API}/items/${note.id}/rename`, { method: 'POST', body: JSON.stringify({ name: 'tale.note' }) })).status).toBe(204);
  expect((await toldOf(note.id, 'RENAMED')).details).toEqual({ previousName: 'story.note' });
  expect((await api(member(), `${API}/items/${note.id}/move`, { method: 'POST', body: JSON.stringify({ parent: sub.id }) })).status).toBe(204);
  const moved = await toldOf(note.id, 'MOVED');
  expect(moved).toEqual(expect.objectContaining({ folder: sub.id, path: [top.name, 'Archive'], content: 'NOTE:' }));
  expect(moved.details).toEqual({ previousFolder: top.id });

  // Shared differently: a share of the folder above it counts on it, and so does a share of the file.
  await share(member(), top, { kind: 'organization' }, 'read');
  const sharedFolder = await toldOf(note.id, 'SHARING_CHANGED');
  expect(sharedFolder.details).toEqual(
    expect.objectContaining({ sharing: 'granted', on: top.id, subject: 'organization', level: 'read' }),
  );
  await share(member(), { ...note, kind: 'file' } as Item, { kind: 'person', email: 'colleague@example.test' }, 'edit');
  const sharedFile = await toldOf(note.id, 'SHARING_CHANGED', 2);
  expect(sharedFile.details).toEqual(expect.objectContaining({ sharing: 'granted', on: note.id, subject: 'person', level: 'edit' }));

  // Deleted, with the folder that holds it: the kind is told the file as it was, without content.
  expect((await api(member(), `${API}/items/${sub.id}`, { method: 'DELETE' })).status).toBe(204);
  const deleted = await toldOf(note.id, 'DELETED');
  expect(deleted).toEqual(
    expect.objectContaining({ name: 'tale.note', folder: sub.id, path: [top.name, 'Archive'], content: null }),
  );

  // A plain file is never told to a kind.
  const plain = await fileOfType(member(), top.id, 'plain.txt', 'nothing', 'text/plain');
  await toldOf(note.id, 'DELETED');
  expect(await told(plain.id)).toEqual([]);
});

test('EXT-105 a person who edits a file through its folder replaces its content, and its kind reads it in their request', async () => {
  const top = await folder(member(), unique('Through'));
  const note = await fileOfType(member(), top.id, 'shared.note', 'one two', 'text/plain');
  await stateOf(top.id, 'shared.note', 'counted');
  const before = (await download(member(), [note.id])).download.entries[0]!.url!;
  await share(member(), top, { kind: 'person', email: member(1).user }, 'edit');

  // The level on the folder reaches the file in the kernel (MK-136): the colleague replaces it, and the
  // content it had leaves the storage in the same request.
  const replaced = await api(member(1), `${API}/items/${note.id}/content`, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: 'three four five',
  });
  expect(replaced.status, JSON.stringify(replaced.body)).toBe(204);
  expect((await fetchLink(before)).status).toBe(404);

  // The extension of the kind opens the file in a request of the colleague, who reads it through the folder.
  const counted = await api(member(1), `${NOTES_API}/notes/${note.id}/count`, { method: 'POST' });
  expect(counted.status, JSON.stringify(counted.body)).toBe(200);
  expect(counted.body).toEqual(expect.objectContaining({ words: 3 }));
});

test.describe('in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-105 the kinds of files speak Italian, with the texts of their extension', async ({ page }) => {
    const top = await folder(member(), unique('Note'));
    await fileOfType(member(), top.id, 'spesa.note', 'pane latte', 'text/plain');
    await stateOf(top.id, 'spesa.note', 'counted');

    await signIn(page, member());
    await openFolder(page, top.id);
    const note = row(page, 'spesa.note');
    await expect(note.getByText('Nota di testo', { exact: true })).toBeVisible();
    await expect(note.getByText('Contata', { exact: true })).toBeVisible();
    await expect(note.getByRole('button', { name: 'Conta le parole: spesa.note' })).toBeVisible();
    await note.getByRole('button', { name: 'Dettagli di spesa.note' }).click();
    await expect(detail(page).getByRole('term')).toHaveText(['Tipo', 'Dimensione', 'Genere', 'Stato']);
    await expect(detail(page).getByRole('region', { name: 'Anteprima di spesa.note' })).toContainText('pane latte');
    await expect(detail(page).getByRole('group', { name: 'Azioni su spesa.note' })).toBeVisible();
    await expect(detail(page).getByRole('button', { name: 'Sostituisci il contenuto' })).toBeVisible();
  });
});

test('EXT-105 removing the extension of a kind leaves its files as plain files with their content, and installing it again recognizes them', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const top = await folder(member(), unique('Removal'));
  const before = await fileOfType(member(), top.id, 'kept.note', 'kept with its content', 'text/plain');
  await stateOf(top.id, 'kept.note', 'counted');

  // The package of the fixture leaves the installation, which restarts without it.
  const extensions = join(bench().installation, 'extensions');
  const aside = join(bench().work, 'removed-extensions');
  mkdirSync(aside, { recursive: true });
  const fixture = readdirSync(extensions).filter((name) => name.startsWith('fixture-text-notes'));
  expect(fixture.length).toBeGreaterThan(0);
  for (const name of fixture) {
    renameSync(join(extensions, name), join(aside, name));
  }
  await restart();
  try {
    // A plain file now, with its content; one stored meanwhile is a plain file too.
    expect((await listed(top.id, 'kept.note')).fileKind).toBeNull();
    const meanwhile = await fileOfType(member(), top.id, 'meanwhile.note', 'stored without the kind', 'text/plain');
    expect(meanwhile.fileKind).toBeNull();
    const { download: link } = await download(member(), [before.id]);
    expect((await fetchLink(link.entries[0]!.url!)).text).toBe('kept with its content');

    await signIn(page, member());
    await openFolder(page, top.id);
    await expect(row(page, 'kept.note')).toBeVisible();
    await expect(row(page, 'kept.note').locator('img.kind')).toHaveCount(0);
    await expect(row(page, 'kept.note').getByText('Text note', { exact: true })).toHaveCount(0);
    await expect(row(page, 'kept.note').getByRole('button', { name: /^Count words/ })).toHaveCount(0);
    await row(page, 'kept.note').getByRole('button', { name: 'Details of kept.note' }).click();
    await expect(detail(page).getByRole('definition').filter({ hasText: /^File$/ })).toBeVisible();
  } finally {
    // Installed again: whatever happened, the other tests find the fixture.
    for (const name of fixture) {
      if (existsSync(join(aside, name))) {
        renameSync(join(aside, name), join(extensions, name));
      }
    }
    await restart();
  }

  // Both files are of the kind again: the one it knew, and the one stored while it was away, which it
  // recognizes when it becomes active, with its content read on the server.
  const meanwhile = await listed(top.id, 'meanwhile.note');
  expect((await toldOf(meanwhile.id, 'RECOGNIZED')).content).toBe('stored without the kind');
  expect((await toldOf(before.id, 'RECOGNIZED')).content).toBe('kept with its content');
  await stateOf(top.id, 'meanwhile.note', 'counted');
  expect((await listed(top.id, 'kept.note')).fileKind).toEqual(expect.objectContaining({ extension: NOTES, state: 'counted' }));

  // A new page of the shell, which reads the extensions active now.
  const again = await browser.newPage();
  await signIn(again, member());
  await openFolder(again, top.id);
  await expect(row(again, 'meanwhile.note').getByText('Text note', { exact: true })).toBeVisible();
  await expect(row(again, 'kept.note').getByRole('button', { name: 'Count words: kept.note' })).toBeVisible();
  await again.close();
});
