// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0

/**
 * The files of an upload (EXT-002), dropped from the computer or chosen in a dialog, with their path
 * below the folder they go to: "a.txt", or "Reports/2026/q1.txt" for a file of a folder dropped, so
 * that the structure of the folder is kept. A folder is an entry of its own, its path ending with "/"
 * and no file, so that an empty one is created too.
 */

/**
 * The entries of a drop. The items of the drop are read at once, as the browser forgets them when the
 * event ends; their content is read afterwards.
 *
 * @param {DataTransfer} dataTransfer
 * @returns {Promise<{ path: string, file: File | null }[]>}
 */
export function dropped(dataTransfer) {
  const entries = [...(dataTransfer.items ?? [])]
    .filter((item) => item.kind === 'file')
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (entries.length === 0) {
    return Promise.resolve(chosen(dataTransfer.files ?? []));
  }
  return (async () => {
    const found = [];
    for (const entry of entries) {
      await walk(entry, '', found);
    }
    return found;
  })();
}

/**
 * The entries of files chosen in a dialog: with a folder chosen, each file has its path in it.
 *
 * @param {FileList | File[]} files
 */
export function chosen(files) {
  const found = [];
  const folders = new Set();
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const folder = `${parts.slice(0, i).join('/')}/`;
      if (!folders.has(folder)) {
        folders.add(folder);
        found.push({ path: folder, file: null });
      }
    }
    found.push({ path, file });
  }
  return found;
}

async function walk(entry, prefix, found) {
  const path = prefix + entry.name;
  if (entry.isFile) {
    found.push({ path, file: await new Promise((resolve, reject) => entry.file(resolve, reject)) });
    return;
  }
  found.push({ path: `${path}/`, file: null });
  const reader = entry.createReader();
  // A reader gives the entries of a folder in batches, until an empty one.
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) {
      break;
    }
    for (const child of batch) {
      await walk(child, `${path}/`, found);
    }
  }
}
