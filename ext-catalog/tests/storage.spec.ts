// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import { basic } from '@mosaikit/testing';
import { api, bench, member, unique } from '@mosaikit/testing/playwright';
import { API, EXTENSION, type Download, type Item, download, fetchLink, file, folder, share } from './catalog.js';

// EXT-004: files are stored through the file service of the platform, and downloaded through its
// signed, expiring links. The bench is a portable installation, whose file service writes to a
// directory of the local disk; a server installation sets mosaikit.files.store=s3 and the same
// extension writes to its bucket (README).

/** The files of a directory, at any depth, that have a name. */
function findAll(directory: string, name: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...findAll(path, name));
    } else if (entry.name === name) {
      found.push(path);
    }
  }
  return found;
}

/** The organization and the stored file that a signed link names: /api/v1/files/signed/<org>/<ext>/<id>. */
function named(url: string): { organization: string; extension: string; file: string } {
  const match = /^\/api\/v1\/files\/signed\/([^/]+)\/([^/]+)\/([^/?]+)\?/.exec(url);
  expect(match, url).toBeTruthy();
  return { organization: match![1]!, extension: match![2]!, file: match![3]! };
}

test('EXT-004 in a portable installation the uploaded files are written on the local disk through the file service of the kernel', async () => {
  const top = await folder(member(), unique('Disk'));
  const text = `content ${unique('on disk')}`;
  const stored = await file(member(), top.id, 'disk.txt', text);
  const { download: made } = await download(member(), [stored.id]);
  const { organization, extension, file: id } = named(made.entries[0]!.url!);
  expect(extension).toBe(EXTENSION);

  // The kernel wrote it under <organization>/<extension>/<id> in the directory of its file service;
  // the extension keeps no copy of its own.
  const copies = findAll(bench().installation, id);
  expect(copies).toHaveLength(1);
  expect(copies[0]!.endsWith([organization, EXTENSION, id].join(sep))).toBe(true);
  expect(readFileSync(copies[0]!, 'utf8')).toBe(text);
  expect(findAll(join(bench().installation, 'extensions'), id)).toEqual([]);
});

test('EXT-004 downloads go through signed, expiring links of the platform, and an expired link is refused', async () => {
  const top = await folder(member(), unique('Links'));
  const stored = await file(member(), top.id, 'signed.txt', 'signed content');

  // The owner: the kernel makes the link for the person at once.
  const own = await download(member(), [stored.id], { validFor: 2 });
  expect(own.status).toBe(200);
  const url = own.download.entries[0]!.url!;
  expect(url).toMatch(/^\/api\/v1\/files\/signed\/.+[?&]expires=\d+.*&signature=/);
  expect(await fetchLink(url)).toEqual({ status: 200, text: 'signed content' });
  expect((await fetchLink(url.replace(/signature=[^&]+/, 'signature=altered'))).status).toBe(404);

  // The colleague reads the file through its folder only: the kernel passes the level of the folder to
  // the file (MK-136) and makes their link at once too; it expires the same way.
  await share(member(), top, { kind: 'person', email: member(1).user });
  const theirs = await download(member(1), [stored.id], { validFor: 2 });
  expect(theirs.status).toBe(200);
  const theirUrl = theirs.download.entries[0]!.url!;
  expect(theirUrl).toMatch(/^\/api\/v1\/files\/signed\//);
  expect(await fetchLink(theirUrl)).toEqual({ status: 200, text: 'signed content' });

  // Once expired, both are refused as a file that does not exist.
  await expect.poll(async () => (await fetchLink(url)).status, { timeout: 10_000, intervals: [500] }).toBe(404);
  await expect.poll(async () => (await fetchLink(theirUrl)).status, { timeout: 10_000, intervals: [500] }).toBe(404);
});

/** Calls the API of the platform as its administrator, outside any organization. */
async function asAdmin(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const response = await fetch(bench().baseUrl + path, {
    ...init,
    headers: { authorization: basic(bench().admin), 'content-type': 'application/json' },
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    return { status: response.status, body: text };
  }
}

test('EXT-004 deleting an organization leaves its files to the kernel, which removes them from the storage, and they are reachable no more', async () => {
  // An organization of its own, since the bench keeps using its organization after this test.
  const slug = `gone-${Date.now().toString(36)}`;
  expect((await asAdmin('/api/v1/organizations', { method: 'POST', body: JSON.stringify({ slug, name: `Gone ${slug}` }) })).status).toBe(201);
  const joined = await asAdmin(`/api/v1/organizations/${slug}/members/${encodeURIComponent(member().user)}`, {
    method: 'PUT',
    body: JSON.stringify({ roles: ['organization-user'] }),
  });
  expect(joined.status, JSON.stringify(joined.body)).toBeLessThan(300);

  const created = await api(member(), `${API}/folders`, { method: 'POST', body: JSON.stringify({ name: 'Archive', parent: null }) }, slug);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const top = created.body as Item;
  const text = `content ${unique('of an organization deleted')}`;
  const stored = await api(
    member(),
    `${API}/folders/${top.id}/files?name=kept.txt`,
    { method: 'POST', headers: { 'content-type': 'text/plain' }, body: text },
    slug,
  );
  expect(stored.status, JSON.stringify(stored.body)).toBe(201);
  const signed = await api(member(), `${API}/downloads`, { method: 'POST', body: JSON.stringify({ items: [(stored.body as Item).id] }) }, slug);
  expect(signed.status).toBe(200);
  const url = (signed.body as Download).entries[0]!.url!;
  expect(await fetchLink(url)).toEqual({ status: 200, text });
  const { organization, file: id } = named(url);
  const onDisk = findAll(bench().installation, id);
  expect(onDisk).toHaveLength(1);

  const deleted = await asAdmin(`/api/v1/organizations/${slug}?confirmation=${slug}`, { method: 'DELETE' });
  expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
  // The kernel removes its data, the rows of the catalog and the content of its files, after the
  // retention of the installation (MK-130), one day at least: the deletion can be undone until then.
  expect(Date.parse((deleted.body as { removableFrom: string }).removableFrom)).toBeGreaterThan(Date.now());

  // At once, nobody reaches its files: not through the catalog, not with a new link, not with a link
  // made before.
  expect((await api(member(), `${API}/folders/${top.id}`, {}, slug)).status).not.toBe(200);
  expect((await api(member(), `${API}/downloads`, { method: 'POST', body: JSON.stringify({ items: [(stored.body as Item).id] }) }, slug)).status).not.toBe(200);
  expect((await fetchLink(url)).status).toBe(404);

  // The catalog got organization.deleted and destroyed nothing: the content stays in the store until the
  // kernel removes it, which an event delivered a few seconds later would have done before.
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  const audit = await asAdmin(`/api/v1/audit-events?organization=${organization}&action=file.deleted`);
  expect(audit.status).toBe(200);
  expect(audit.body).toEqual([]);
  expect(findAll(bench().installation, id)).toEqual(onDisk);
  expect(readFileSync(onDisk[0]!, 'utf8')).toBe(text);
});
