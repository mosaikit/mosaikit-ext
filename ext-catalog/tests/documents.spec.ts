// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Page } from '@playwright/test';
import { api, bench, member, signIn, unique } from '@mosaikit/testing/playwright';
import { API, EXTENSION, download, fetchLink, file, folder, share, type Item } from './catalog.js';

type Person = Parameters<typeof api>[0];

// EXT-006: documents of the catalog are linked to resources of other extensions, through the contract
// linked-documents of the catalog (MK-134). The fixture tests/fixtures/records (org.example.records) has
// records, resources registered with the platform that take documents from those who edit them; the
// sheet of a record lists its documents with the element mosaikit-ext-catalog-documents of the catalog,
// and the sheet of a document lists its records. The third person of the bench is outside the groups of
// the tests.

const RECORDS = 'org.example.records';
const RECORDS_API = '/api/v1/ext/records/records';
const APPS = () => `/api/v1/organizations/${bench().organization.slug}/apps`;
const MEMBERS = (person: Person) => `/api/v1/organizations/${bench().organization.slug}/members/${person.user}`;

const outsider = () => member(2);
const app = (page: Page) => page.locator('mosaikit-ext-catalog');
const sheet = (page: Page) => app(page).locator('section.detail');
const linksOf = (page: Page, name: string) => sheet(page).getByRole('list', { name: `Resources linked to ${name}` });
const documents = (page: Page) => page.locator('mosaikit-ext-catalog-documents');

interface Sheet {
  file: Item;
  path: { id: string; name: string }[];
  links: { id: string; resource: { extension: string; type: string; id: string }; canUnlink: boolean }[];
}

interface Documents {
  resource: { extension: string; type: string; id: string };
  canLink: boolean;
  documents: { link: string; file: Item; canUnlink: boolean }[];
}

interface Results {
  results: { title: string; detail: string; link: string; resource: { type: string; id: string } }[];
  more: boolean;
}

/** Searches the catalog as the search of the platform calls it, with the credentials of the person. */
async function search(person: Person, query: Record<string, string>): Promise<Results> {
  const { status, body } = await api(person, `${API}/search?${new URLSearchParams(query)}`);
  expect(status, JSON.stringify(body)).toBe(200);
  return body as Results;
}

/** Creates a record of the fixture, which the person owns. */
async function record(person: Person, title: string): Promise<{ id: string; title: string }> {
  const { status, body } = await api(person, RECORDS_API, { method: 'POST', body: JSON.stringify({ title }) });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as { id: string; title: string };
}

const recordRef = (id: string) => ({ extension: RECORDS, type: 'record', id });

/** Links a document to a record through the API of the catalog. */
async function link(person: Person, document: string, recordId: string): Promise<{ status: number; body: unknown }> {
  return api(person, `${API}/links`, {
    method: 'POST',
    body: JSON.stringify({ file: document, resource: recordRef(recordId) }),
  });
}

/** The documents linked to a record, as the person reads them. */
async function documentsOf(person: Person, recordId: string): Promise<{ status: number; body: Documents }> {
  const { status, body } = await api(person, `${API}/links?${new URLSearchParams(recordRef(recordId))}`);
  return { status, body: body as Documents };
}

/** Shares a record of the fixture with a person, through the sharing API of the platform. */
async function shareRecord(recordId: string, person: Person, level: string): Promise<void> {
  const { status, body } = await api(member(), `/api/v1/sharing/resources/${RECORDS}/record/${recordId}/grants`, {
    method: 'PUT',
    body: JSON.stringify({ subject: { kind: 'person', email: person.user }, level }),
  });
  expect(status, JSON.stringify(body)).toBeLessThan(300);
}

/** A private team of the member with the colleague in it: a group of the organization. */
async function team(): Promise<{ id: string; name: string }> {
  const name = unique('Readers');
  const created = await api(member(), '/api/v1/teams', {
    method: 'POST',
    body: JSON.stringify({ name, description: 'A group of the tests of EXT-006', visibility: 'private' }),
  });
  expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
  const id = (created.body as { id: string }).id;
  const added = await api(member(), `/api/v1/teams/${id}/members/${encodeURIComponent(member(1).user)}`, {
    method: 'PUT',
    body: JSON.stringify({ role: 'member' }),
  });
  expect(added.status, JSON.stringify(added.body)).toBeLessThan(300);
  return { id, name };
}

async function openSheet(page: Page, id: string): Promise<void> {
  await page.goto(`${bench().baseUrl}/app/catalog?file=${id}`);
}

async function openRecord(page: Page, id: string): Promise<void> {
  await page.goto(`${bench().baseUrl}/app/records?record=${id}`);
}

test('EXT-006 a document is found by the search of the catalog, the provider the search of the platform calls, and shown with its own sheet', async ({
  page,
}) => {
  const word = unique('Budget').toLowerCase().replace(/[^a-z0-9]/g, '');
  const top = await folder(member(), unique('Finance'));
  const plans = await folder(member(), 'Plans', top.id);
  const report = await file(member(), plans.id, `${word} report 2026.txt`, 'the budget of the year');
  await file(member(), plans.id, `${word} draft.txt`, 'a draft');
  await file(member(), plans.id, `${word} notes.txt`, 'notes');

  // Every word typed is the start of a word of the name, in any case and order, as the platform asks.
  const found = await search(member(), { q: `REPORT ${word.slice(0, 8)}`, offset: '0', limit: '5' });
  expect(found.results).toEqual([
    {
      title: report.name,
      detail: `${top.name} / Plans`,
      link: `/app/catalog?file=${report.id}`,
      resource: { type: 'file', id: report.id },
    },
  ]);
  const given = await search(member(), { q: 'x', tsquery: `${word}:* & 2026:*`, offset: '0', limit: '5' });
  expect(given.results.map((result) => result.title)).toEqual([report.name]);
  // A page at a time, and whether there is more; folders are found too, files alone when asked.
  const first = await search(member(), { q: word, offset: '0', limit: '2' });
  expect(first.results).toHaveLength(2);
  expect(first.more).toBe(true);
  const rest = await search(member(), { q: word, offset: '2', limit: '2' });
  expect(rest.results).toHaveLength(1);
  expect(rest.more).toBe(false);
  expect((await search(member(), { q: 'plans', kind: 'folder', limit: '50' })).results.map((each) => each.resource.id)).toContain(
    plans.id,
  );
  expect((await search(member(), { q: 'plans', kind: 'file', limit: '50' })).results.map((each) => each.resource.id)).not.toContain(
    plans.id,
  );
  expect((await api(member(), `${API}/search?q=x&limit=51`)).status).toBe(400);
  // The colleague does not read the folder: nothing of it is found.
  expect((await search(member(1), { q: word, limit: '10' })).results).toEqual([]);

  // The link of the result opens the sheet of the document: what it is, where, who has access, its
  // download and the resources it is linked to, none yet.
  await signIn(page, member());
  await page.goto(`${bench().baseUrl}${found.results[0]!.link}`);
  await expect(sheet(page).getByRole('heading', { name: report.name })).toBeVisible();
  await expect(app(page).getByRole('navigation', { name: 'Path' }).getByRole('listitem').last()).toHaveText(report.name);
  await expect(sheet(page).getByRole('definition').filter({ hasText: `Files / ${top.name} / Plans` })).toBeVisible();
  await expect(sheet(page).getByRole('definition').filter({ hasText: 'Member' })).toBeVisible();
  await expect(sheet(page).getByText('Not linked to resources of other apps.')).toBeVisible();
  await expect(app(page).getByRole('region', { name: `Who has access to ${report.name}` })).toBeVisible();
  await expect(app(page).getByRole('table')).toBeHidden();
  const saved = page.waitForEvent('download');
  await sheet(page).getByRole('button', { name: 'Download' }).click();
  expect((await saved).suggestedFilename()).toBe(report.name);
  // Closed, the sheet gives way to the folder of the document.
  await sheet(page).getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(new RegExp(`\\?folder=${plans.id}$`));
  await expect(app(page).getByRole('table', { name: 'Content of Plans' })).toBeVisible();
  // From the detail of the file in the list, its name opens the sheet.
  await app(page).getByRole('row').filter({ hasText: report.name }).getByRole('button', { name: `Details of ${report.name}` }).click();
  await sheet(page).getByRole('link', { name: report.name }).click();
  await expect(page).toHaveURL(new RegExp(`\\?file=${report.id}$`));
  await expect(app(page).getByRole('table')).toBeHidden();

  // The registry of the platform opens the file at its sheet too, as the search shows it.
  const { body: resolved } = await api(member(), '/api/v1/resources/references/resolve', {
    method: 'POST',
    body: JSON.stringify([{ extension: EXTENSION, type: 'file', id: report.id }]),
  });
  expect((resolved as { status: string; link: string }[])[0]).toEqual(
    expect.objectContaining({ status: 'available', link: `/app/catalog?file=${report.id}` }),
  );
});

test('EXT-006 a document linked to a record of another extension is listed on the sheet of the record, and the record on the sheet of the document', async ({
  page,
}) => {
  const top = await folder(member(), unique('Acts'));
  const act = await file(member(), top.id, `${unique('Act').toLowerCase().replace(/[^a-z0-9]/g, '')}.txt`, 'the act');
  const other = await file(member(), top.id, 'annex.txt', 'the annex');
  const green = await record(member(), unique('Green project'));

  // The member edits the record: on its sheet they find the document by name and link it.
  await signIn(page, member());
  await openRecord(page, green.id);
  await expect(page.getByRole('heading', { name: green.title })).toBeVisible();
  await expect(documents(page).getByText('No document is linked yet.')).toBeVisible();
  await documents(page).getByRole('button', { name: `Link a document to ${green.title}` }).click();
  await documents(page).getByRole('textbox', { name: 'Search the files' }).fill(act.name.slice(0, 10));
  await documents(page).getByRole('button', { name: `Link ${act.name}` }).click();
  const listed = documents(page).getByRole('list', { name: `Documents of ${green.title}` });
  await expect(listed.getByRole('listitem')).toHaveCount(1);
  await expect(listed.getByRole('link', { name: act.name })).toHaveAttribute('href', `/app/catalog?file=${act.id}`);
  const saved = page.waitForEvent('download');
  await listed.getByRole('button', { name: `Download ${act.name}` }).click();
  expect((await saved).suggestedFilename()).toBe(act.name);

  // The sheet of the document lists the record, which opens it.
  await listed.getByRole('link', { name: act.name }).click();
  await expect(sheet(page).getByRole('heading', { name: act.name })).toBeVisible();
  await expect(linksOf(page, act.name).getByRole('link', { name: green.title })).toHaveAttribute(
    'href',
    `/app/records?record=${green.id}`,
  );
  await linksOf(page, act.name).getByRole('link', { name: green.title }).click();
  await expect(page.getByRole('heading', { name: green.title })).toBeVisible();

  // Through the API: a link made again is the same link; a folder, the catalog itself and a record the
  // person cannot read are refused.
  const again = await link(member(), act.id, green.id);
  expect(again.status).toBe(200);
  const linkId = (await documentsOf(member(), green.id)).body.documents[0]!.link;
  expect((again.body as { id: string }).id).toBe(linkId);
  expect((await link(member(), top.id, green.id)).status).toBe(404);
  expect(
    (await api(member(), `${API}/links`, {
      method: 'POST',
      body: JSON.stringify({ file: act.id, resource: { extension: EXTENSION, type: 'folder', id: top.id } }),
    })).status,
  ).toBe(400);
  expect((await link(member(), act.id, crypto.randomUUID())).status).toBe(404);

  // The colleague sees the record but does not edit it, nor reads the documents: the record shows them
  // nothing and offers no link; once the act is shared with them, it lists the act only.
  expect((await documentsOf(member(1), green.id)).status).toBe(404);
  await shareRecord(green.id, member(1), 'view');
  await link(member(), other.id, green.id);
  const seen = await documentsOf(member(1), green.id);
  expect(seen.status).toBe(200);
  expect(seen.body.canLink).toBe(false);
  expect(seen.body.documents).toEqual([]);
  await share(member(), act, { kind: 'person', email: member(1).user }, 'read');
  const shared = await documentsOf(member(1), green.id);
  expect(shared.body.documents.map((each) => [each.file.name, each.canUnlink])).toEqual([[act.name, false]]);
  expect((await link(member(1), act.id, green.id)).status).toBe(403);
  expect((await api(member(1), `${API}/links/${linkId}`, { method: 'DELETE' })).status).toBe(403);
  // The sheet of the act lists the record to the colleague, who cannot remove the link.
  const colleague = (await api(member(1), `${API}/files/${act.id}`)).body as Sheet;
  expect(colleague.links).toEqual([{ id: linkId, resource: recordRef(green.id), canUnlink: false }]);
  // Once they edit the record, they link and unlink documents they read.
  await shareRecord(green.id, member(1), 'edit');
  expect((await documentsOf(member(1), green.id)).body.canLink).toBe(true);

  // The member removes the link on the sheet of the document: the record no longer lists it.
  await openSheet(page, act.id);
  await linksOf(page, act.name)
    .getByRole('button', { name: `Remove the link between ${act.name} and ${green.title}` })
    .click();
  await expect(sheet(page).getByText('Not linked to resources of other apps.')).toBeVisible();
  expect((await documentsOf(member(), green.id)).body.documents.map((each) => each.file.name)).toEqual(['annex.txt']);

  // A document deleted from the catalog leaves the records it was linked to.
  expect((await api(member(), `${API}/items/${other.id}`, { method: 'DELETE' })).status).toBe(204);
  expect((await documentsOf(member(), green.id)).body.documents).toEqual([]);
  await openRecord(page, green.id);
  await expect(documents(page).getByText('No document is linked yet.')).toBeVisible();
});

test.describe('in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-006 the documents of a record and the links of a document speak Italian', async ({ page }) => {
    const top = await folder(member(), unique('Atti'));
    const act = await file(member(), top.id, 'delibera.txt', 'la delibera');
    const green = await record(member(), unique('Progetto verde'));
    expect((await link(member(), act.id, green.id)).status).toBe(201);
    await signIn(page, member());
    await openRecord(page, green.id);
    const listed = documents(page).getByRole('list', { name: `Documenti di ${green.title}` });
    await expect(listed.getByRole('link', { name: 'delibera.txt' })).toBeVisible();
    await expect(documents(page).getByRole('button', { name: `Collega un documento a ${green.title}` })).toBeVisible();
    await openSheet(page, act.id);
    await expect(sheet(page).getByRole('list', { name: 'Risorse collegate a delibera.txt' }).getByRole('link', { name: green.title })).toBeVisible();
    await expect(sheet(page).getByRole('heading', { name: 'Collegato a' })).toBeVisible();
  });
});

test('EXT-006 a document shared with a group is downloaded by its members through a signed link that expires, and a person outside the group neither finds nor downloads it', async ({
  page,
  browser,
}) => {
  const group = await team();
  const word = unique('Minutes').toLowerCase().replace(/[^a-z0-9]/g, '');
  const top = await folder(member(), unique('Board'));
  const minutes = await file(member(), top.id, `${word}.txt`, 'the minutes of the board');
  const { status, body } = await api(member(), `/api/v1/sharing/resources/${EXTENSION}/file/${minutes.id}/grants`, {
    method: 'PUT',
    body: JSON.stringify({ subject: { kind: 'group', id: group.id }, level: 'read' }),
  });
  expect(status, JSON.stringify(body)).toBeLessThan(300);

  // A member of the group finds it, opens its sheet and downloads it.
  expect((await search(member(1), { q: word, limit: '5' })).results.map((each) => each.resource.id)).toEqual([minutes.id]);
  expect((await api(member(1), `${API}/files/${minutes.id}`)).status).toBe(200);
  await signIn(page, member(1));
  await openSheet(page, minutes.id);
  await expect(sheet(page).getByRole('heading', { name: minutes.name })).toBeVisible();
  const saved = page.waitForEvent('download');
  await sheet(page).getByRole('button', { name: 'Download' }).click();
  expect((await saved).suggestedFilename()).toBe(minutes.name);

  // The download is a signed link of the platform, which works without a session until it expires; an
  // altered link works never.
  const before = Date.now();
  const { status: made, download: signed } = await download(member(1), [minutes.id], { validFor: 2 });
  expect(made).toBe(200);
  expect(Date.parse(signed.expires) - before).toBeLessThanOrEqual(3_000);
  const url = signed.entries[0]!.url!;
  expect(await fetchLink(url)).toEqual({ status: 200, text: 'the minutes of the board' });
  expect((await fetchLink(altered(url))).status).toBe(404);
  await expect.poll(async () => (await fetchLink(url)).status, { timeout: 15_000, intervals: [1_000] }).toBe(404);

  // Outside the group: not found by the search, its sheet and its download not found.
  expect((await search(outsider(), { q: word, limit: '5' })).results).toEqual([]);
  expect((await api(outsider(), `${API}/files/${minutes.id}`)).status).toBe(404);
  expect((await download(outsider(), [minutes.id])).status).toBe(404);
  const other = await (await browser.newContext()).newPage();
  await signIn(other, outsider());
  await openSheet(other, minutes.id);
  await expect(app(other).getByRole('heading', { name: 'File not found' })).toBeVisible();
  await expect(app(other).getByText('the minutes of the board')).toHaveCount(0);
  await other.close();
});

test.describe('a record whose extension is turned off', () => {
  /** Turns the app of the fixture off in the organization, which turns the extension off there, or back on. */
  async function records(on: boolean): Promise<void> {
    const changed = await api(bench().admin, APPS(), {
      method: 'PUT',
      body: JSON.stringify(on ? [] : [{ extensionId: RECORDS, appId: 'records', enabled: false, pinned: false, roles: [] }]),
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
  }

  test.beforeAll(async () => {
    // The colleague administers the organization: the placeholder tells them what to turn on.
    const promoted = await api(bench().admin, MEMBERS(member(1)), {
      method: 'PUT',
      body: JSON.stringify({ roles: ['organization-admin', 'organization-user'] }),
    });
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(200);
  });

  test.afterAll(async () => {
    await records(true);
    await api(bench().admin, MEMBERS(member(1)), {
      method: 'PUT',
      body: JSON.stringify({ roles: ['organization-user'] }),
    });
  });

  test('EXT-006 a link to a record of an extension turned off shows the placeholder of the platform on the sheet of the document, stays, and shows the record again without a reload', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const top = await folder(member(), unique('Reports'));
    await share(member(), top, { kind: 'person', email: member(1).user }, 'read');
    const report = await file(member(), top.id, 'report.txt', 'the report');
    const green = await record(member(), unique('Green'));
    expect((await link(member(), report.id, green.id)).status).toBe(201);

    await signIn(page, member());
    await openSheet(page, report.id);
    await expect(linksOf(page, report.name).getByRole('link', { name: green.title })).toBeVisible();
    const admin = await (await browser.newContext()).newPage();
    await signIn(admin, member(1));
    await openSheet(admin, report.id);
    await expect(linksOf(admin, report.name).getByRole('listitem')).toHaveCount(1);

    // Turned off: the open sheets show the placeholder in place of the record; only the administrator
    // reads what to turn on. The document works as before.
    await records(false);
    const placeholder = linksOf(page, report.name).getByRole('note');
    await expect(placeholder).toContainText('Not available: Linked resource', { timeout: 30_000 });
    await expect(placeholder).toContainText('The extension that provides it is not active in this organization.');
    await expect(placeholder).not.toContainText('Turn on');
    await expect(linksOf(page, report.name).getByRole('link', { name: green.title })).toHaveCount(0);
    await expect(linksOf(admin, report.name).getByRole('note')).toContainText(
      'Turn on the extension Records (fixture) (org.example.records) in the apps of the organization.',
      { timeout: 30_000 },
    );
    await expect(sheet(page).getByRole('button', { name: 'Download' })).toBeVisible();
    const { download: signed } = await download(member(), [report.id]);
    expect((await fetchLink(signed.entries[0]!.url!)).text).toBe('the report');
    // The link stays, and the documents of the record are not listed while its extension is absent.
    expect(((await api(member(), `${API}/files/${report.id}`)).body as Sheet).links).toEqual([
      expect.objectContaining({ resource: recordRef(green.id) }),
    ]);
    expect((await documentsOf(member(), green.id)).status).toBe(404);
    expect((await link(member(), report.id, green.id)).status).toBe(404);

    // Back on: the same sheets show the record again, without a reload.
    await records(true);
    await expect(linksOf(page, report.name).getByRole('link', { name: green.title })).toBeVisible({ timeout: 30_000 });
    await expect(linksOf(page, report.name).getByRole('note')).toHaveCount(0);
    await expect(linksOf(admin, report.name).getByRole('link', { name: green.title })).toBeVisible({ timeout: 30_000 });
    expect((await documentsOf(member(), green.id)).body.documents.map((each) => each.file.id)).toEqual([report.id]);
    await admin.close();
  });
});

/**
 * The link with the last character of its signature changed in a bit that carries data: in base64url
 * the last character of a signature may hold padding bits in its low bits, so flipping those (A and B)
 * would give the same signature.
 */
function altered(url: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return url.replace(/.$/, (last) => {
    const index = alphabet.indexOf(last);
    return index < 0 ? (last === 'A' ? 'B' : 'A') : alphabet[index ^ 32]!;
  });
}
