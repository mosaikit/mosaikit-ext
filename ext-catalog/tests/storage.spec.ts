// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import { bench, member, unique } from '@mosaikit/testing/playwright';
import { EXTENSION, download, fetchLink, file, folder, share } from './catalog.js';

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

  // The colleague reads the file through its folder only: the extension checks them and has the link
  // made without a person; it expires the same way.
  await share(member(), top, { kind: 'person', email: member(1).user });
  const theirs = await download(member(1), [stored.id], { validFor: 2 });
  expect(theirs.status).toBe(202);
  expect(theirs.download.status).toBe('ready');
  const theirUrl = theirs.download.entries[0]!.url!;
  expect(theirUrl).toMatch(/^\/api\/v1\/files\/signed\//);
  expect(await fetchLink(theirUrl)).toEqual({ status: 200, text: 'signed content' });

  // Once expired, both are refused as a file that does not exist.
  await expect.poll(async () => (await fetchLink(url)).status, { timeout: 10_000, intervals: [500] }).toBe(404);
  await expect.poll(async () => (await fetchLink(theirUrl)).status, { timeout: 10_000, intervals: [500] }).toBe(404);
});
