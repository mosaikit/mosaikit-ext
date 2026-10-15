// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, type Page } from '@playwright/test';
import { api, bench } from '@mosaikit/testing/playwright';

/** Helpers of the tests: folders and files made through the API of the extension, as a person. */

type Person = Parameters<typeof api>[0];

export const EXTENSION = 'io.github.mosaikit.ext.catalog';
export const API = '/api/v1/ext/catalog';

export interface Item {
  id: string;
  kind: 'folder' | 'file';
  name: string;
  size: number | null;
  items: number | null;
  owner: { account: string; name: string | null } | null;
  changed: string;
  sharing: { scope: string; inherited: boolean };
  level: string;
}

export interface Folder {
  id: string | null;
  name: string | null;
  path: { id: string; name: string }[];
  level: string | null;
  canCreate: boolean;
  items: Item[];
}

/** Creates a folder, at the root without a parent. */
export async function folder(person: Person, name: string, parent: string | null = null): Promise<Item> {
  const { status, body } = await api(person, `${API}/folders`, {
    method: 'POST',
    body: JSON.stringify({ name, parent }),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as Item;
}

/** Stores a file in a folder, with the content given. */
export async function file(person: Person, parent: string, name: string, content: string): Promise<Item> {
  const { status, body } = await api(person, `${API}/folders/${parent}/files?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: content,
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as Item;
}

/** Shares a folder or a file through the sharing API of the kernel (MK-055). */
export async function share(
  person: Person,
  item: Item,
  subject: { kind: 'organization' } | { kind: 'person'; email: string },
  level = 'read',
): Promise<void> {
  const { status, body } = await api(person, `/api/v1/sharing/resources/${EXTENSION}/${item.kind}/${item.id}/grants`, {
    method: 'PUT',
    body: JSON.stringify({ subject, level }),
  });
  expect(status, JSON.stringify(body)).toBeLessThan(300);
}

/** Opens the catalog at a folder, by its address. */
export async function openFolder(page: Page, id: string | null): Promise<void> {
  await page.goto(`${bench().baseUrl}/app/catalog${id ? `?folder=${id}` : ''}`);
}
