// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Page } from '@playwright/test';
import { api, bench, member, signIn, unique } from '@mosaikit/testing/playwright';
import { API, EXTENSION, file, folder, openFolder, type Folder, type Item } from './catalog.js';

// EXT-003: folders and files are shared with people, groups, the organization or a link. The member of
// the bench owns the folders; the colleague is reached by the shares, through a group of the
// organization or by name.

const app = (page: Page) => page.locator('mosaikit-ext-catalog');
const content = (page: Page) => app(page).getByRole('table', { name: /^(Content of|Contenuto di) / });
const tree = (page: Page) => app(page).getByRole('navigation', { name: /^(Folders|Cartelle)$/ });
const access = (page: Page) => app(page).getByRole('region', { name: /^(Who has access to|Chi ha accesso a) / });
const dialog = (page: Page) => page.getByRole('dialog', { name: /^Share / });

interface Access {
  id: string;
  level: string;
  canShare: boolean;
  entries: {
    who: { kind: string; id: string | null; name: string | null };
    level: string;
    via: 'owner' | 'grant';
    from: { id: string; name: string } | null;
  }[];
}

type Subject = { kind: 'person'; email: string } | { kind: 'group'; id: string } | { kind: 'organization' };

/** A private team of the member, with the colleague in it when asked: a group of the organization. */
async function team(withColleague: boolean): Promise<{ id: string; name: string }> {
  const name = unique('Team');
  const created = await api(member(), '/api/v1/teams', {
    method: 'POST',
    body: JSON.stringify({ name, description: 'A group of the tests of EXT-003', visibility: 'private' }),
  });
  expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
  const id = (created.body as { id: string }).id;
  if (withColleague) {
    const added = await api(member(), `/api/v1/teams/${id}/members/${encodeURIComponent(member(1).user)}`, {
      method: 'PUT',
      body: JSON.stringify({ role: 'member' }),
    });
    expect(added.status, JSON.stringify(added.body)).toBeLessThan(300);
  }
  return { id, name };
}

/** Shares an item through the sharing API of the kernel (MK-055) and answers the grant. */
async function grant(item: Item, subject: Subject, level = 'read'): Promise<string> {
  const { status, body } = await api(member(), `/api/v1/sharing/resources/${EXTENSION}/${item.kind}/${item.id}/grants`, {
    method: 'PUT',
    body: JSON.stringify({ subject, level }),
  });
  expect(status, JSON.stringify(body)).toBeLessThan(300);
  return (body as { id: string }).id;
}

async function sharedWithColleague(): Promise<string[]> {
  const { status, body } = await api(member(1), `${API}/shared`);
  expect(status).toBe(200);
  return (body as Folder).items.map((item) => item.id);
}

/** The identifier of a file of the catalog in the file service of the kernel, as the colleague lists it. */
async function storedFile(name: string): Promise<string | undefined> {
  const { body } = await api(member(1), `/api/v1/files/${EXTENSION}?limit=1000`);
  const list = (Array.isArray(body) ? body : ((body as { items?: unknown[] }).items ?? [])) as { id: string; name: string }[];
  return list.find((found) => found.name === name)?.id;
}

test('EXT-003 sharing a folder with a group gives its members the folder and everything inside it, also items added later', async ({
  page,
}) => {
  const group = await team(true);
  const top = await folder(member(), unique('Team space'));
  const reports = await folder(member(), 'Reports', top.id);
  await file(member(), top.id, 'charter.txt', 'charter');
  expect((await api(member(1), `${API}/folders/${top.id}`)).status).toBe(404);

  // The member shares the folder with the group in the sharing dialog of the platform.
  await signIn(page, member());
  await openFolder(page, top.id);
  await expect(access(page)).toHaveAccessibleName(`Who has access to ${top.name}`);
  await access(page).getByRole('button', { name: `Share ${top.name}` }).click();
  await expect(dialog(page)).toHaveAccessibleName(`Share ${top.name}`);
  await dialog(page).getByLabel('Who', { exact: true }).selectOption({ label: 'A team' });
  await dialog(page).getByLabel('Team', { exact: true }).selectOption({ label: group.name });
  await dialog(page).getByLabel('Level', { exact: true }).selectOption({ label: 'Edit' });
  await dialog(page).getByRole('button', { name: 'Share', exact: true }).click();
  await expect(dialog(page).getByRole('list', { name: 'Who has access' })).toContainText(group.name);
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(access(page).getByRole('listitem').filter({ hasText: `Team ${group.name}` })).toContainText('Edit');

  // The colleague, in the group, reads the folder and what it holds, at the level of the share.
  const opened = await api(member(1), `${API}/folders/${top.id}`);
  expect(opened.status).toBe(200);
  expect((opened.body as Folder).level).toBe('edit');
  expect((opened.body as Folder).items.map((item) => item.name)).toEqual(['Reports', 'charter.txt']);
  expect((opened.body as Folder).items.every((item) => item.level === 'edit')).toBe(true);
  expect((await api(member(1), `${API}/folders/${reports.id}`)).status).toBe(200);

  // Items added later, by the owner or by the colleague with the level edit, are reached as well.
  const later = await folder(member(), 'Added later', reports.id);
  await file(member(), later.id, 'minutes.txt', 'minutes');
  const theirs = await folder(member(1), 'By the colleague', reports.id);
  const inside = (await api(member(1), `${API}/folders/${later.id}`)).body as Folder;
  expect(inside.level).toBe('edit');
  expect(inside.items.map((item) => item.name)).toEqual(['minutes.txt']);
  expect((await api(member(), `${API}/folders/${theirs.id}`)).status).toBe(200);

  // In the app, the folder is in the Shared with me of the colleague and opens with all it holds.
  expect(await sharedWithColleague()).toContain(top.id);
  await page.context().clearCookies();
  await signIn(page, member(1));
  await openFolder(page, null);
  await tree(page).getByRole('link', { name: 'Shared with me' }).click();
  await expect(page).toHaveURL(/\/app\/catalog\?view=shared$/);
  await content(page).getByRole('link', { name: top.name }).click();
  await content(page).getByRole('link', { name: 'Reports' }).click();
  await content(page).getByRole('link', { name: 'Added later' }).click();
  await expect(content(page).getByRole('row').filter({ hasText: 'minutes.txt' })).toBeVisible();
});

test("EXT-003 a file shared with one person outside the folder's sharing is in their Shared with me, and the rest of the folder is not", async ({
  page,
}) => {
  const group = await team(false);
  const top = await folder(member(), unique('Board'));
  await grant(top, { kind: 'group', id: group.id }, 'edit');
  const plan = await file(member(), top.id, 'plan.txt', 'the plan');
  const budget = await file(member(), top.id, 'budget.txt', 'the budget');
  const minutes = await folder(member(), 'Minutes', top.id);
  await grant(plan, { kind: 'person', email: member(1).user });

  const shared = await sharedWithColleague();
  expect(shared).toContain(plan.id);
  expect(shared).not.toContain(top.id);
  expect(shared).not.toContain(budget.id);
  expect(shared).not.toContain(minutes.id);
  // The folder stays closed to them, and the file is not among the files of the organization.
  expect((await api(member(1), `${API}/folders/${top.id}`)).status).toBe(404);
  expect((await api(member(1), `${API}/folders/${minutes.id}`)).status).toBe(404);
  expect((await api(member(1), `${API}/items/${budget.id}/access`)).status).toBe(404);
  const root = (await api(member(1), `${API}/folders`)).body as Folder;
  expect(root.items.map((item) => item.id)).not.toContain(plan.id);
  // Who has access to the file, for them: its owner and their own share, not the shares of the folder.
  const theirs = (await api(member(1), `${API}/items/${plan.id}/access`)).body as Access;
  expect(theirs.level).toBe('read');
  expect(theirs.canShare).toBe(false);
  expect(theirs.entries.every((entry) => entry.from === null)).toBe(true);
  expect(theirs.entries.map((entry) => entry.via)).toEqual(['owner', 'grant']);

  await signIn(page, member(1));
  await page.goto(`${bench().baseUrl}/app/catalog?view=shared`);
  await expect(content(page)).toHaveAccessibleName('Content of Shared with me');
  await expect(app(page).getByRole('navigation', { name: 'Path' }).getByRole('link')).toHaveText(['Shared with me']);
  await expect(content(page).getByRole('row').filter({ hasText: 'plan.txt' })).toBeVisible();
  await expect(content(page).getByText('budget.txt')).toHaveCount(0);
  await expect(content(page).getByText(top.name)).toHaveCount(0);
  await expect(app(page).getByRole('button', { name: 'New folder' })).toBeHidden();
});

test('EXT-003 the sharing dialog is the one of the platform, with read, edit and manage, and the folder shows who has access and through which share', async ({
  page,
}) => {
  const group = await team(true);
  const top = await folder(member(), unique('Clients'));
  const acme = await folder(member(), 'Acme', top.id);
  await grant(top, { kind: 'group', id: group.id }, 'edit');
  await grant(acme, { kind: 'person', email: member(1).user }, 'manage');
  await grant(acme, { kind: 'organization' }, 'read');

  await signIn(page, member());
  await openFolder(page, acme.id);
  await expect(access(page)).toHaveAccessibleName('Who has access to Acme');
  const rows = access(page).getByRole('list', { name: 'Who has access' }).getByRole('listitem');
  await expect(rows).toHaveText([
    new RegExp(`^${member().name} \\(${member().user}\\)ManageOwner$`),
    new RegExp(`^${member(1).name} \\(${member(1).user}\\)ManageShared directly$`),
    /^Everyone in the organizationReadShared directly$/,
    new RegExp(`^${member().name} \\(${member().user}\\)ManageOwner of ${top.name}$`),
    new RegExp(`^Team ${group.name}EditThrough the folder ${top.name}$`),
  ]);
  await expect(app(page).getByText('The administrators of the organization also have access to everything.')).toBeVisible();
  // The folder of an inherited share opens from the list.
  await expect(rows.last().getByRole('link', { name: top.name })).toHaveAttribute('href', `/app/catalog?folder=${top.id}`);

  // The sharing state of an item of the list opens who has access to it.
  await openFolder(page, top.id);
  await content(page).getByRole('button', { name: 'Who has access to Acme' }).click();
  await expect(access(page)).toHaveAccessibleName('Who has access to Acme');

  // The dialog is the one of the platform, with the levels of the catalog.
  await access(page).getByRole('button', { name: 'Share Acme' }).click();
  await expect(dialog(page)).toHaveAccessibleName('Share Acme');
  await expect(dialog(page).getByLabel('Level', { exact: true }).getByRole('option')).toHaveText(['Read', 'Edit', 'Manage']);
  await dialog(page).getByRole('button', { name: 'Close' }).click();

  // The same through the API: entries on the folder itself, then those of the folder above.
  const answer = (await api(member(), `${API}/items/${acme.id}/access`)).body as Access;
  expect(answer.canShare).toBe(true);
  expect(answer.entries.map((entry) => [entry.who.kind, entry.level, entry.via, entry.from?.name ?? null])).toEqual([
    ['person', 'manage', 'owner', null],
    ['person', 'manage', 'grant', null],
    ['organization', 'read', 'grant', null],
    ['person', 'manage', 'owner', top.name],
    ['group', 'edit', 'grant', top.name],
  ]);
  // The colleague manages Acme through their own share, so the platform lets them share it, and what
  // it holds too, since the level of a folder reaches its content (MK-136); a folder they reach only
  // through the group above, which edits, they cannot share.
  expect(((await api(member(1), `${API}/items/${acme.id}/access`)).body as Access).canShare).toBe(true);
  const inAcme = await folder(member(), 'Offers', acme.id);
  const viaAcme = (await api(member(1), `${API}/items/${inAcme.id}/access`)).body as Access;
  expect(viaAcme.level).toBe('manage');
  expect(viaAcme.canShare).toBe(true);
  const deeper = await folder(member(), 'Contracts', top.id);
  const viaGroup = (await api(member(1), `${API}/items/${deeper.id}/access`)).body as Access;
  expect(viaGroup.level).toBe('edit');
  expect(viaGroup.canShare).toBe(false);
});

test('EXT-003 removing a share takes effect at the next request of the person', async ({ page, browser }) => {
  const top = await folder(member(), unique('Handover'));
  const inside = await file(member(), top.id, 'inside.txt', 'inside');
  const letterName = `letter-${Date.now().toString(36)}.txt`;
  const letter = await file(member(), (await folder(member(), unique('Letters'))).id, letterName, 'dear colleague');
  await grant(top, { kind: 'person', email: member(1).user });
  const letterGrant = await grant(letter, { kind: 'person', email: member(1).user });

  // Before: the colleague lists the folder, opens it, reads its file and downloads the shared letter.
  expect(await sharedWithColleague()).toEqual(expect.arrayContaining([top.id, letter.id]));
  expect((await api(member(1), `${API}/folders/${top.id}`)).status).toBe(200);
  expect((await api(member(1), `${API}/items/${inside.id}/access`)).status).toBe(200);
  const stored = await storedFile(letterName);
  expect(stored).toBeDefined();
  expect((await api(member(1), `/api/v1/files/${EXTENSION}/${stored}/content`)).status).toBe(200);
  await signIn(page, member(1));
  await openFolder(page, top.id);
  await expect(content(page).getByRole('row').filter({ hasText: 'inside.txt' })).toBeVisible();

  // The member removes the share of the folder in the dialog of the platform, the one of the letter
  // through the API.
  const owner = await browser.newPage();
  await signIn(owner, member());
  await openFolder(owner, top.id);
  await access(owner).getByRole('button', { name: `Share ${top.name}` }).click();
  await dialog(owner).getByRole('button', { name: /^Remove access of / }).click();
  await expect(dialog(owner).getByText('Only who owns it and the administrators.')).toBeVisible();
  await dialog(owner).getByRole('button', { name: 'Close' }).click();
  await expect(access(owner).getByRole('listitem')).toHaveCount(1);
  await owner.close();
  expect((await api(member(), `/api/v1/sharing/grants/${letterGrant}`, { method: 'DELETE' })).status).toBeLessThan(300);

  // At the next request of the colleague: gone from their list, closed, and not downloadable.
  const after = await sharedWithColleague();
  expect(after).not.toContain(top.id);
  expect(after).not.toContain(letter.id);
  expect((await api(member(1), `${API}/folders/${top.id}`)).status).toBe(404);
  expect((await api(member(1), `${API}/items/${inside.id}/access`)).status).toBe(404);
  expect((await api(member(1), `/api/v1/files/${EXTENSION}/${stored}/content`)).status).toBe(404);
  await page.reload();
  await expect(app(page).getByRole('heading', { name: 'Folder not found' })).toBeVisible();
  await tree(page).getByRole('link', { name: 'Shared with me' }).click();
  await expect(content(page)).toHaveAccessibleName('Content of Shared with me');
  await expect(content(page).getByText(top.name)).toHaveCount(0);
  await expect(content(page).getByText(letterName)).toHaveCount(0);
});

test.describe('in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-003 who has access and Shared with me speak Italian', async ({ page }) => {
    const group = await team(true);
    const top = await folder(member(), unique('Clienti'));
    const sub = await folder(member(), 'Contratti', top.id);
    await grant(top, { kind: 'group', id: group.id }, 'read');

    await signIn(page, member());
    await openFolder(page, sub.id);
    await expect(access(page)).toHaveAccessibleName('Chi ha accesso a Contratti');
    await expect(access(page).getByRole('listitem').last()).toHaveText(
      new RegExp(`^Team ${group.name}LetturaTramite la cartella ${top.name}$`),
    );
    await expect(access(page).getByRole('button', { name: 'Condividi Contratti' })).toBeVisible();
    await expect(tree(page).getByRole('link', { name: 'Condivisi con me' })).toBeVisible();
  });
});
