// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, type Locator, type Page } from '@playwright/test';
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
  /**
   * EXT-105: the media type of a file, and its kind; EXT-106: also while the extension of the kind is
   * absent, then not active.
   */
  contentType: string | null;
  fileKind: {
    extension: string;
    name: string;
    state: string | null;
    stateDetail: string | null;
    active: boolean;
  } | null;
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

/** Stores a file in a folder with the content and the media type given (EXT-105). */
export async function fileOfType(
  person: Person,
  parent: string,
  name: string,
  content: string,
  type: string,
): Promise<Item> {
  const { status, body } = await api(person, `${API}/folders/${parent}/files?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': type },
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

// EXT-002, EXT-004: downloads, uploads dropped from the computer, archives.

export interface Download {
  kind: 'file' | 'archive';
  name: string;
  expires: string;
  entries: { path: string; url: string | null }[];
}

/** Asks for a download of items, with the signed links of its files. */
export async function download(
  person: Person,
  items: string[],
  options: { name?: string; validFor?: number } = {},
): Promise<{ status: number; download: Download }> {
  const { status, body } = await api(person, `${API}/downloads`, {
    method: 'POST',
    body: JSON.stringify({ items, ...options }),
  });
  return { status, download: body as Download };
}

/** Fetches a signed link without any session, as anyone who holds it does. */
export async function fetchLink(url: string): Promise<{ status: number; text: string }> {
  const response = await fetch(bench().baseUrl + url);
  return { status: response.status, text: await response.text() };
}

/** A file or a folder of a drop from the computer: a folder has its entries. */
export type Dropped = { name: string; content: string } | { name: string; entries: Dropped[] };

/**
 * Drops files and folders from the computer onto an element of the app, as the browser gives them:
 * the items of the drop with their entries of the file system (webkitGetAsEntry), which hold the
 * structure of a folder. Playwright cannot drag files of the computer, so the event is made here.
 */
export async function dropFiles(target: Locator, dropped: Dropped[]): Promise<void> {
  await target.evaluate((element, list: Dropped[]) => {
    type Entry = {
      name: string;
      isFile: boolean;
      isDirectory: boolean;
      file?: (resolve: (file: File) => void) => void;
      createReader?: () => { readEntries: (resolve: (entries: Entry[]) => void) => void };
    };
    const entry = (item: Dropped): Entry => {
      if ('content' in item) {
        const file = new File([item.content], item.name, { type: 'text/plain' });
        return { name: item.name, isFile: true, isDirectory: false, file: (resolve) => resolve(file) };
      }
      const children = item.entries.map(entry);
      return {
        name: item.name,
        isFile: false,
        isDirectory: true,
        createReader: () => {
          let given = false;
          return {
            readEntries: (resolve) => {
              resolve(given ? [] : children);
              given = true;
            },
          };
        },
      };
    };
    const items = list.map((item) => ({ kind: 'file', webkitGetAsEntry: () => entry(item) }));
    const dataTransfer = { types: ['Files'], items, files: [], getData: () => '', dropEffect: 'none' };
    for (const type of ['dragover', 'drop']) {
      const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      element.dispatchEvent(event);
    }
  }, dropped);
}

/** The entries of a ZIP archive whose files are stored as they are: name and content. */
export function unzip(archive: Buffer): { name: string; content: string }[] {
  const entries: { name: string; content: string }[] = [];
  let at = 0;
  while (archive.readUInt32LE(at) === 0x04034b50) {
    const size = archive.readUInt32LE(at + 18);
    const nameLength = archive.readUInt16LE(at + 26);
    const extra = archive.readUInt16LE(at + 28);
    const name = archive.subarray(at + 30, at + 30 + nameLength).toString('utf8');
    const start = at + 30 + nameLength + extra;
    entries.push({ name, content: archive.subarray(start, start + size).toString('utf8') });
    at = start + size;
  }
  return entries;
}
