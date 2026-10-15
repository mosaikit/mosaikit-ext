// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { api, bench, member, signIn, unique } from '@mosaikit/testing/playwright';
import {
  API,
  download,
  dropFiles,
  fetchLink,
  file,
  folder,
  openFolder,
  share,
  unzip,
  type Folder,
} from './catalog.js';

// EXT-002: files and folders are uploaded, downloaded, moved, renamed and deleted, in the list, in the
// tree and by keyboard. The member of the bench works in the app; the colleague is the other person.

const app = (page: Page) => page.locator('mosaikit-ext-catalog');
const tree = (page: Page) => app(page).getByRole('navigation', { name: 'Folders' });
const content = (page: Page) => app(page).getByRole('table', { name: /^(Content of|Contenuto di) / });
const row = (page: Page, name: string) => content(page).getByRole('row').filter({ hasText: name });
const status = (page: Page) => app(page).getByRole('status');
const dialog = (page: Page) => app(page).getByRole('dialog');

/** The names in a folder, through the API. */
async function namesIn(id: string, person = member()): Promise<string[]> {
  const opened = await api(person, `${API}/folders/${id}`);
  expect(opened.status).toBe(200);
  return (opened.body as Folder).items.map((item) => item.name);
}

async function itemIn(id: string, name: string) {
  const found = ((await api(member(), `${API}/folders/${id}`)).body as Folder).items.find((item) => item.name === name);
  expect(found, `${name} in ${id}`).toBeTruthy();
  return found!;
}

test('EXT-002 dropping several files and a folder from the computer onto a folder uploads them with the folder structure kept, with progress per file', async ({
  page,
}) => {
  const top = await folder(member(), unique('Uploads'));
  const target = await folder(member(), 'Target', top.id);
  const other = await folder(member(), 'Other', top.id);

  await signIn(page, member());
  await openFolder(page, top.id);
  // Onto a folder of the list.
  await dropFiles(row(page, 'Target'), [
    { name: 'a.txt', content: 'first' },
    { name: 'b.txt', content: 'second file' },
    {
      name: 'Reports',
      entries: [
        { name: 'q1.txt', content: 'quarter one' },
        { name: '2026', entries: [{ name: 'q2.txt', content: 'quarter two' }] },
        { name: 'Empty', entries: [] },
      ],
    },
  ]);
  const uploads = app(page).getByRole('region', { name: 'Uploads' });
  for (const path of ['a.txt', 'b.txt', 'Reports/q1.txt', 'Reports/2026/q2.txt']) {
    const progress = uploads.getByRole('progressbar', { name: `Upload of ${path}` });
    await expect(progress).toHaveAttribute('value', '100');
    const item = uploads.getByRole('listitem').filter({ has: page.getByRole('progressbar', { name: `Upload of ${path}` }) });
    await expect(item).toContainText('Uploaded');
  }
  await expect(status(page)).toHaveText('4 files uploaded.');
  await expect(row(page, 'Target').getByRole('cell').nth(1)).toHaveText('3 items');

  // The structure is kept, with the empty folder.
  expect((await namesIn(target.id)).sort()).toEqual(['Reports', 'a.txt', 'b.txt']);
  const reports = await itemIn(target.id, 'Reports');
  expect(await namesIn(reports.id)).toEqual(['2026', 'Empty', 'q1.txt']);
  const year = await itemIn(reports.id, '2026');
  const q2 = await itemIn(year.id, 'q2.txt');
  expect(q2.size).toBe('quarter two'.length);
  const { download: q2Download } = await download(member(), [q2.id]);
  expect((await fetchLink(q2Download.entries[0]!.url!)).text).toBe('quarter two');

  // Onto a folder of the tree, the same; a folder already there takes the new files.
  await dropFiles(tree(page).getByRole('link', { name: 'Other', exact: true }), [
    { name: 'Reports', entries: [{ name: 'q3.txt', content: 'quarter three' }] },
  ]);
  await expect(status(page)).toHaveText('1 file uploaded.');
  await dropFiles(tree(page).getByRole('link', { name: 'Other', exact: true }), [
    { name: 'Reports', entries: [{ name: 'q4.txt', content: 'quarter four' }] },
  ]);
  await expect(status(page)).toHaveText('1 file uploaded.');
  const otherReports = await itemIn(other.id, 'Reports');
  expect(await namesIn(otherReports.id)).toEqual(['q3.txt', 'q4.txt']);
});

test('EXT-002 the Upload buttons upload files and a folder chosen in the dialogs of the browser', async ({ page }, info) => {
  const top = await folder(member(), unique('Chosen'));
  const local = info.outputPath('Photos');
  mkdirSync(join(local, 'Summer'), { recursive: true });
  writeFileSync(join(local, 'cover.txt'), 'cover');
  writeFileSync(join(local, 'Summer', 'beach.txt'), 'beach');

  await signIn(page, member());
  await openFolder(page, top.id);
  const chooser = page.waitForEvent('filechooser');
  await app(page).getByRole('button', { name: 'Upload folder' }).click();
  await (await chooser).setFiles(local);
  await expect(status(page)).toHaveText('2 files uploaded.');
  const photos = await itemIn(top.id, 'Photos');
  expect(await namesIn(photos.id)).toEqual(['Summer', 'cover.txt']);

  const files = page.waitForEvent('filechooser');
  await app(page).getByRole('button', { name: 'Upload files' }).click();
  await (await files).setFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') }]);
  await expect(status(page)).toHaveText('1 file uploaded.');
  expect(await namesIn(top.id)).toEqual(['Photos', 'notes.txt']);
});

test('EXT-002 an upload too large for the quota of the organization is refused before it starts, naming the limit', async ({
  page,
}) => {
  const target = await folder(member(), unique('Quota'));
  const admin = bench().admin;
  const slug = bench().organization.slug;
  const storage = await api(admin, `/api/v1/organizations/${slug}/quotas/storage`);
  expect(storage.status, JSON.stringify(storage.body)).toBe(200);
  const used = (storage.body as { used: number }).used;
  // Room for 1 KB more, the upload is 3 KB.
  const set = await api(admin, `/api/v1/organizations/${slug}/quotas/storage`, {
    method: 'PUT',
    body: JSON.stringify({ limit: used + 1024 }),
  });
  expect(set.status, JSON.stringify(set.body)).toBeLessThan(300);
  try {
    // The API refuses the whole upload before any file, with the limit.
    const check = await api(member(), `${API}/uploads/check`, {
      method: 'POST',
      body: JSON.stringify({ folder: target.id, bytes: 3 * 1024 }),
    });
    expect(check.status).toBe(403);
    expect(check.body).toMatchObject({ title: 'Quota exceeded', quota: { measure: 'storage', limit: used + 1024 } });

    await signIn(page, member());
    await openFolder(page, target.id);
    await dropFiles(content(page), [
      { name: 'big.txt', content: 'x'.repeat(2048) },
      { name: 'small.txt', content: 'y'.repeat(1024) },
    ]);
    await expect(status(page)).toContainText('The upload of 3 KB does not fit the storage of the organization: its limit is');
    await expect(status(page)).toContainText('Nothing was uploaded.');
    await expect(app(page).getByRole('progressbar')).toHaveCount(0);
    expect(await namesIn(target.id)).toEqual([]);

    // What fits is uploaded.
    await dropFiles(content(page), [{ name: 'small.txt', content: 'y'.repeat(512) }]);
    await expect(status(page)).toHaveText('1 file uploaded.');
  } finally {
    await api(admin, `/api/v1/organizations/${slug}/quotas/storage`, { method: 'DELETE' });
  }
});

test('EXT-002 a file or folder moved to another folder by drag and drop or by the Move command appears there and disappears from where it was, with its sharing kept', async ({
  page,
}) => {
  const top = await folder(member(), unique('Moves'));
  const target = await folder(member(), 'Target', top.id);
  const plan = await file(member(), top.id, 'roadmap.txt', 'the roadmap');
  const old = await folder(member(), 'Old', top.id);
  await file(member(), old.id, 'inside.txt', 'inside');
  const memo = await file(member(), top.id, 'memo.txt', 'memo');
  const draft = await file(member(), top.id, 'draft.txt', 'draft');
  // The file is shared with the colleague on its own.
  await share(member(), plan, { kind: 'person', email: member(1).user });

  await signIn(page, member());
  await openFolder(page, top.id);

  // Dragged onto a folder of the list.
  await row(page, 'roadmap.txt').dragTo(row(page, 'Target'));
  await expect(status(page)).toHaveText('roadmap.txt moved.');
  await expect(row(page, 'roadmap.txt')).toHaveCount(0);
  expect(await namesIn(target.id)).toEqual(['roadmap.txt']);
  const moved = await itemIn(target.id, 'roadmap.txt');
  expect(moved.id).toBe(plan.id);
  // Its own share goes with it: the colleague still reads it, by the same identifier.
  const sharedWithColleague = (await api(member(1), `${API}/shared`)).body as Folder;
  expect(sharedWithColleague.items.find((item) => item.id === plan.id)).toMatchObject({ name: 'roadmap.txt', level: 'read' });
  expect(moved.sharing.scope).toBe('people');

  // With the Move command, choosing the folder in the dialog.
  await content(page).getByRole('checkbox', { name: 'Select Old' }).check();
  await app(page).getByRole('button', { name: 'Move', exact: true }).click();
  await expect(dialog(page)).toHaveAccessibleName('Move Old');
  await dialog(page).getByRole('button', { name: 'Target' }).click();
  await expect(dialog(page)).toContainText(`To: Files / ${top.name} / Target`);
  await dialog(page).getByRole('button', { name: 'Move here' }).click();
  await expect(status(page)).toHaveText('Old moved.');
  await expect(row(page, 'Old')).toHaveCount(0);
  expect(await namesIn(target.id)).toEqual(['Old', 'roadmap.txt']);
  expect(await namesIn(old.id)).toEqual(['inside.txt']);

  // Dragged onto a folder of the tree.
  await row(page, 'memo.txt').dragTo(tree(page).getByRole('link', { name: 'Target', exact: true }));
  await expect(status(page)).toHaveText('memo.txt moved.');
  await expect(row(page, 'memo.txt')).toHaveCount(0);
  expect((await itemIn(target.id, 'memo.txt')).id).toBe(memo.id);

  // By keyboard: cut on the row, paste on the folder of the tree.
  await content(page).getByRole('checkbox', { name: 'Select draft.txt' }).focus();
  await page.keyboard.press('Control+x');
  await expect(status(page)).toHaveText('1 item cut: move it with Ctrl+V onto a folder.');
  await tree(page).getByRole('link', { name: 'Target', exact: true }).focus();
  await page.keyboard.press('Control+v');
  await expect(status(page)).toHaveText('draft.txt moved.');
  expect((await itemIn(target.id, 'draft.txt')).id).toBe(draft.id);
  expect(await namesIn(top.id)).toEqual(['Target']);

  // A folder never goes into itself, nor into a folder it holds.
  const inside = await api(member(), `${API}/items/${target.id}/move`, {
    method: 'POST',
    body: JSON.stringify({ parent: old.id }),
  });
  expect(inside.status).toBe(409);
});

test('EXT-002 renaming to a name already used in the same folder is refused with a message naming the existing item', async ({
  page,
}) => {
  const top = await folder(member(), unique('Names'));
  await file(member(), top.id, 'a.txt', 'a');
  await file(member(), top.id, 'B.txt', 'b');
  await folder(member(), 'Docs', top.id);

  await signIn(page, member());
  await openFolder(page, top.id);
  await content(page).getByRole('checkbox', { name: 'Select a.txt' }).check();
  await app(page).getByRole('button', { name: 'Rename' }).click();
  await expect(dialog(page)).toHaveAccessibleName('Rename a.txt');
  const name = dialog(page).getByRole('textbox', { name: 'New name' });
  await name.fill('b.TXT');
  await name.press('Enter');
  await expect(dialog(page).getByRole('alert')).toHaveText('This folder already holds a file named B.txt.');
  await name.fill('docs');
  await dialog(page).getByRole('button', { name: 'Rename' }).click();
  await expect(dialog(page).getByRole('alert')).toHaveText('This folder already holds a folder named Docs.');
  await name.fill('c.txt');
  await name.press('Enter');
  await expect(dialog(page)).toBeHidden();
  await expect(status(page)).toHaveText('Renamed to c.txt.');
  expect(await namesIn(top.id)).toEqual(['Docs', 'B.txt', 'c.txt']);

  // The API says the same, naming the item.
  const docs = await itemIn(top.id, 'Docs');
  const refused = await api(member(), `${API}/items/${docs.id}/rename`, {
    method: 'POST',
    body: JSON.stringify({ name: 'C.TXT' }),
  });
  expect(refused.status).toBe(409);
  expect(refused.body).toMatchObject({
    detail: 'This folder already holds a file named c.txt.',
    existing: { kind: 'file', name: 'c.txt' },
  });

  // By keyboard, F2 on a row of the list.
  await content(page).getByRole('link', { name: 'Docs' }).focus();
  await page.keyboard.press('F2');
  await expect(dialog(page)).toHaveAccessibleName('Rename Docs');
  await name.fill('Documents');
  await name.press('Enter');
  await expect(row(page, 'Documents')).toBeVisible();
  await expect(tree(page).getByRole('link', { name: 'Documents', exact: true })).toBeVisible();

  // F2 on a folder of the tree, the same refusal and the same rename.
  await tree(page).getByRole('link', { name: 'Documents', exact: true }).focus();
  await page.keyboard.press('F2');
  await name.fill('B.TXT');
  await name.press('Enter');
  await expect(dialog(page).getByRole('alert')).toHaveText('This folder already holds a file named B.txt.');
  await name.fill('Papers');
  await name.press('Enter');
  await expect(tree(page).getByRole('link', { name: 'Papers', exact: true })).toBeVisible();
  // Its identity is kept.
  expect((await itemIn(top.id, 'Papers')).id).toBe(docs.id);
});

test('EXT-002 deleting a folder asks for confirmation with the number of items it holds, and the deleted items are no longer listed nor downloadable', async ({
  page,
}) => {
  const top = await folder(member(), unique('Deletes'));
  const old = await folder(member(), 'Old', top.id);
  const first = await file(member(), old.id, 'first.txt', 'first');
  const sub = await folder(member(), 'Sub', old.id);
  await file(member(), sub.id, 'second.txt', 'second');
  const before = (await download(member(), [first.id])).download;
  expect((await fetchLink(before.entries[0]!.url!)).status).toBe(200);

  await signIn(page, member());
  await openFolder(page, top.id);
  await content(page).getByRole('checkbox', { name: 'Select Old' }).check();
  await app(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog(page)).toContainText('Delete the folder Old and the 3 items it holds?');
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(row(page, 'Old')).toBeVisible();

  await app(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Delete' }).click();
  await expect(status(page)).toHaveText('Old deleted.');
  await expect(row(page, 'Old')).toHaveCount(0);
  await expect(app(page).getByText('This folder is empty.')).toBeVisible();

  // Nothing of it is listed nor downloadable, not even through a link made before.
  expect((await api(member(), `${API}/folders/${old.id}`)).status).toBe(404);
  expect((await api(member(), `${API}/folders/${sub.id}`)).status).toBe(404);
  expect((await api(member(), `${API}/downloads`, { method: 'POST', body: JSON.stringify({ items: [first.id] }) })).status).toBe(404);
  expect((await fetchLink(before.entries[0]!.url!)).status).toBe(404);

  // By keyboard on a folder of the tree, the same confirmation.
  const tmp = await folder(member(), 'Temporary', top.id);
  await file(member(), tmp.id, 'one.txt', '1');
  await openFolder(page, top.id);
  await tree(page).getByRole('link', { name: 'Temporary', exact: true }).focus();
  await page.keyboard.press('Delete');
  await expect(dialog(page)).toContainText('Delete the folder Temporary and the 1 item it holds?');
  await dialog(page).getByRole('button', { name: 'Delete' }).click();
  await expect(status(page)).toHaveText('Temporary deleted.');
  await expect(tree(page).getByRole('link', { name: 'Temporary', exact: true })).toHaveCount(0);

  // A colleague who edits the folder deletes a file of the member: its content leaves the storage too,
  // in a job, since the file service of the kernel only knows the share of the folder.
  const shared = await folder(member(), 'Shared', top.id);
  const theirs = await file(member(), shared.id, 'theirs.txt', 'theirs');
  const link = (await download(member(), [theirs.id])).download.entries[0]!.url!;
  await share(member(), shared, { kind: 'person', email: member(1).user }, 'edit');
  const removed = await api(member(1), `${API}/items/${theirs.id}`, { method: 'DELETE' });
  expect(removed.status).toBe(204);
  expect(await namesIn(shared.id)).toEqual([]);
  await expect.poll(async () => (await fetchLink(link)).status, { timeout: 30_000 }).toBe(404);
});

test('EXT-002 a file is downloaded with its name, and several selected items are downloaded as one archive', async ({
  page,
}) => {
  const top = await folder(member(), unique('Downloads'));
  const report = await file(member(), top.id, 'report.txt', 'the report');
  // Renamed after it was stored: it downloads with its name of now.
  expect(
    (await api(member(), `${API}/items/${report.id}/rename`, { method: 'POST', body: JSON.stringify({ name: 'final report.txt' }) }))
      .status,
  ).toBe(204);
  const album = await folder(member(), 'Album', top.id);
  await file(member(), album.id, 'one.txt', 'one');
  const deeper = await folder(member(), 'Deeper', album.id);
  await file(member(), deeper.id, 'two.txt', 'two');
  await folder(member(), 'Nothing', album.id);

  await signIn(page, member());
  await openFolder(page, top.id);
  const single = page.waitForEvent('download');
  await content(page).getByRole('button', { name: 'final report.txt', exact: true }).click();
  const saved = await single;
  expect(saved.suggestedFilename()).toBe('final report.txt');
  expect(readFileSync(await saved.path(), 'utf8')).toBe('the report');

  // Selected by keyboard: Space on the boxes, then Download.
  await content(page).getByRole('checkbox', { name: 'Select Album' }).focus();
  await page.keyboard.press('Space');
  await content(page).getByRole('checkbox', { name: 'Select final report.txt' }).focus();
  await page.keyboard.press('Space');
  const archive = page.waitForEvent('download');
  await app(page).getByRole('button', { name: 'Download', exact: true }).click();
  const zipped = await archive;
  expect(zipped.suggestedFilename()).toBe(`${top.name}.zip`);
  expect(unzip(readFileSync(await zipped.path()))).toEqual([
    { name: 'Album/', content: '' },
    { name: 'Album/Deeper/', content: '' },
    { name: 'Album/Deeper/two.txt', content: 'two' },
    { name: 'Album/Nothing/', content: '' },
    { name: 'Album/one.txt', content: 'one' },
    { name: 'final report.txt', content: 'the report' },
  ]);

  // The colleague, who reads the folder through its share only, downloads its files too.
  await share(member(), album, { kind: 'person', email: member(1).user });
  const { download: theirs } = await download(member(1), [album.id]);
  expect(theirs).toMatchObject({ kind: 'archive', name: 'Album.zip', status: 'ready' });
  expect(theirs.entries.map((entry) => entry.path)).toEqual([
    'Album/',
    'Album/Deeper/',
    'Album/Deeper/two.txt',
    'Album/Nothing/',
    'Album/one.txt',
  ]);
  expect((await fetchLink(theirs.entries[2]!.url!)).text).toBe('two');
  // And nothing outside of what they read.
  expect((await api(member(1), `${API}/downloads`, { method: 'POST', body: JSON.stringify({ items: [report.id] }) })).status).toBe(
    404,
  );
});

test.describe('in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-002 the file operations speak Italian', async ({ page }) => {
    const top = await folder(member(), unique('Nomi'));
    await file(member(), top.id, 'uno.txt', '1');
    const box = await folder(member(), 'Scatola', top.id);
    await file(member(), box.id, 'due.txt', '2');

    await signIn(page, member());
    await openFolder(page, top.id);
    const it = app(page);
    await it.getByRole('checkbox', { name: 'Seleziona uno.txt' }).check();
    await it.getByRole('button', { name: 'Rinomina' }).click();
    const name = it.getByRole('dialog').getByRole('textbox', { name: 'Nuovo nome' });
    await name.fill('scatola');
    await name.press('Enter');
    await expect(it.getByRole('dialog').getByRole('alert')).toHaveText(
      'Questa cartella contiene già una cartella di nome Scatola.',
    );
    await it.getByRole('dialog').getByRole('button', { name: 'Annulla' }).click();

    await it.getByRole('checkbox', { name: 'Seleziona uno.txt' }).uncheck();
    await it.getByRole('checkbox', { name: 'Seleziona Scatola' }).check();
    await it.getByRole('button', { name: 'Elimina' }).click();
    await expect(it.getByRole('dialog')).toContainText("Eliminare la cartella Scatola e l'elemento che contiene?");
    await it.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
    await expect(it.getByRole('status')).toHaveText('Scatola eliminato.');
  });
});
