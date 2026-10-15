// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { translator } from './i18n.js';
import { chosen, dropped } from './drop.js';
import { zip } from './zip.js';

/**
 * Frontend of the catalog (EXT-001, EXT-002, EXT-003): a custom element that the shell renders for /app/catalog. The
 * tree of folders is on the left, the content of the open folder in the middle, its path above as
 * breadcrumbs. The open folder is in the address (/app/catalog?folder=<id>), so it can be linked and
 * the back button of the browser works; Shared with me is at /app/catalog?view=shared (EXT-003). Below
 * the content, who has access to the open folder or to the item chosen in the list, and through which
 * share; sharing itself happens in the sharing dialog of the platform (MK-055). Styled with the --mk-*
 * tokens of the theme, in the language of the person.
 *
 * Files and folders are uploaded by dropping them from the computer onto a folder of the list or of the
 * tree, or onto the open folder, or with the Upload buttons; moved by dragging them onto a folder or
 * with Move; renamed, deleted and downloaded with the buttons above the list (EXT-002). The same works
 * by keyboard, on a row of the list or a folder of the tree: F2 renames, Delete deletes, Ctrl+X then
 * Ctrl+V moves into the folder that has the focus, or into the open folder.
 *
 * Other extensions add kinds of files (EXT-105): a file of a kind shows the icon of the kind, its title
 * and the state the kind recorded, and its actions, in the list and in its detail, which also shows its
 * preview. They contribute them to the point catalog.file-kind (version 1), whose contributions the app
 * reads with context.contributionsTo: { kind, title, icon, preview, states, actions: [{ id, title,
 * element }] }, the texts in other languages in i18n (title, state.<state>, action.<id>). The preview and
 * each action are custom elements of the extension, given the file in their property file; an action
 * that changed the file says so with the event catalog-file-changed. Without the extension, its files
 * are plain files.
 */

const ELEMENT = 'mosaikit-ext-catalog';
const API = '/api/v1/ext/catalog/folders';
const SHARED_API = '/api/v1/ext/catalog/shared';
const ITEMS_API = '/api/v1/ext/catalog/items';
const UPLOADS_API = '/api/v1/ext/catalog/uploads';
const DOWNLOADS_API = '/api/v1/ext/catalog/downloads';
/** The extension point of the kinds of files of other extensions, version 1 (EXT-105). */
const FILE_KINDS = 'catalog.file-kind';
/** Where the shell serves the files of an extension, such as the icon of a kind. */
const ASSETS = '/api/v1/extension-assets';
const ROUTE = '/app/catalog';
const ROOT = 'root';
/** The view Shared with me, where a folder id would be: never the id of a folder. */
const SHARED = 'shared';
/** The type of the items dragged inside the app. */
const DRAGGED = 'application/x-mosaikit-catalog-items';
/** How long the app waits for the links of a download, in milliseconds. */
const DOWNLOAD_WAIT = 60_000;

const ICONS = {
  folder:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.4l1.5 1.5H13A1.5 1.5 0 0 1 14.5 4.5v8A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5z"/></svg>',
  file: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3.5 1.5h6l3 3v10h-9zm6 0v3h3" opacity=".85"/></svg>',
  details:
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 1.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM7.25 7h1.5v4.5h-1.5zM8 4.25a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z"/></svg>',
};

const STYLE = `
  :host { display: block; color: var(--mk-fg); font-family: var(--mk-font); }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between; }
  h1 { margin: 0; font-size: 22px; }
  .intro, .version, .muted { color: var(--mk-muted); font-size: 13px; }
  .intro { margin: 4px 0 0; }
  .version { margin-top: 16px; }
  nav.crumbs ol { list-style: none; display: flex; flex-wrap: wrap; gap: 4px; margin: 12px 0; padding: 0; }
  nav.crumbs li + li::before { content: '/'; color: var(--mk-muted); margin-right: 4px; }
  a { color: var(--mk-accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  a:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--mk-focus); outline-offset: 2px; }
  [aria-current='page'] { color: var(--mk-fg); font-weight: 600; }
  button { font: inherit; padding: 6px 12px; border-radius: var(--mk-radius); border: 1px solid var(--mk-line);
           background: var(--mk-surface); color: var(--mk-fg); cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  button.danger { border-color: var(--mk-danger); color: var(--mk-danger); }
  button.link { border: 0; background: none; padding: 0; color: var(--mk-accent); text-align: left; }
  button.link:hover { text-decoration: underline; }
  button.primary { border-color: var(--mk-accent); background: var(--mk-accent); color: var(--mk-accent-fg); font-weight: 600; }
  form.create { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 12px; }
  form.create input { font: inherit; padding: 6px 10px; border: 1px solid var(--mk-line); border-radius: var(--mk-radius);
                      background: var(--mk-bg); color: var(--mk-fg); min-width: 240px; }
  input[type=text] { font: inherit; padding: 6px 10px; border: 1px solid var(--mk-line); border-radius: var(--mk-radius);
                    background: var(--mk-bg); color: var(--mk-fg); min-width: 240px; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 12px; }
  .toolbar label { display: inline-flex; gap: 6px; align-items: center; margin-right: 8px; }
  .shortcuts { margin: 0 0 8px; }
  .layout { display: grid; grid-template-columns: minmax(180px, 260px) 1fr; gap: 16px; align-items: start; }
  @media (max-width: 720px) { .layout { grid-template-columns: 1fr; } }
  .panel { background: var(--mk-surface); border: 1px solid var(--mk-line); border-radius: var(--mk-radius); padding: 12px; min-width: 0; }
  nav.tree ul { list-style: none; margin: 0; padding-left: 14px; }
  nav.tree > ul { padding-left: 0; }
  nav.tree li > div { display: flex; align-items: center; gap: 4px; padding: 2px 0; }
  nav.tree .toggle { border: 0; background: none; padding: 0 4px; width: 22px; color: var(--mk-muted); }
  nav.tree .leaf { display: inline-block; width: 22px; }
  nav.tree a { display: inline-flex; align-items: center; gap: 6px; color: var(--mk-fg); overflow-wrap: anywhere; }
  .table { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--mk-line); vertical-align: middle; }
  th { font-size: 13px; color: var(--mk-muted); font-weight: 600; white-space: nowrap; }
  th button { border: 0; background: none; padding: 0; color: inherit; font-weight: inherit; }
  td.name { display: flex; align-items: center; gap: 8px; overflow-wrap: anywhere; }
  td.name svg { color: var(--mk-muted); flex: none; }
  td.num { white-space: nowrap; }
  td button.sharing { border: 0; background: none; padding: 0; color: var(--mk-accent); text-align: left; }
  section.access { margin-top: 16px; border-top: 1px solid var(--mk-line); padding-top: 12px; }
  section.access h2 { margin: 0 0 4px; font-size: 16px; overflow-wrap: anywhere; }
  section.access ul { list-style: none; margin: 8px 0; padding: 0; }
  section.access li { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 6px 0; border-bottom: 1px solid var(--mk-line); }
  section.access li .who { flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; }
  section.access li .via { color: var(--mk-muted); }
  tr.selected td { background: color-mix(in srgb, var(--mk-accent) 10%, transparent); }
  tr.cut td { opacity: .6; }
  .drop { outline: 2px dashed var(--mk-accent); outline-offset: -2px; }
  [role='status'] { min-height: 1.2em; margin: 0 0 8px; color: var(--mk-muted); }
  [role='status'].error { color: var(--mk-danger); }
  .uploads { margin-top: 16px; }
  .uploads ul { list-style: none; margin: 0; padding: 0; }
  .uploads li { display: grid; grid-template-columns: minmax(0, 1fr) 140px minmax(90px, auto); gap: 8px; align-items: center; padding: 4px 0; }
  .uploads .path { overflow-wrap: anywhere; }
  .uploads .failed { color: var(--mk-danger); }
  dialog { border: 1px solid var(--mk-line); border-radius: var(--mk-radius); background: var(--mk-surface); color: var(--mk-fg);
           padding: 16px; min-width: min(420px, 90vw); }
  dialog::backdrop { background: rgb(0 0 0 / 40%); }
  dialog h2 { font-size: 17px; }
  dialog .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  dialog [role='alert'] { color: var(--mk-danger); min-height: 1.2em; margin: 8px 0 0; }
  dialog ul.folders { list-style: none; margin: 8px 0; padding: 0; max-height: 280px; overflow-y: auto; }
  dialog ul.folders li { padding: 2px 0; }
  td.name img.kind { width: 16px; height: 16px; flex: none; }
  .badge { display: inline-block; font-size: 12px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--mk-line);
           color: var(--mk-muted); white-space: nowrap; }
  .badge.state { border-color: var(--mk-accent); color: var(--mk-accent); }
  td.name .row-actions { display: inline-flex; gap: 6px; margin-left: auto; }
  td.name .row-actions button, section.detail .kind-actions button { padding: 2px 8px; font-size: 13px; }
  td.name .row-actions button.details { display: inline-flex; align-items: center; padding: 3px 6px; color: var(--mk-muted); }
  section.detail { margin-top: 16px; border-top: 1px solid var(--mk-line); padding-top: 12px; }
  section.detail header { align-items: center; }
  section.detail h2 { margin: 0; font-size: 16px; overflow-wrap: anywhere; display: flex; gap: 8px; align-items: center; }
  section.detail dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 8px 0; }
  section.detail dt { color: var(--mk-muted); }
  section.detail dd { margin: 0; overflow-wrap: anywhere; }
  section.detail .preview { border: 1px solid var(--mk-line); border-radius: var(--mk-radius); padding: 8px; margin: 8px 0;
                            max-height: 320px; overflow: auto; background: var(--mk-bg); }
  section.detail .kind-actions, section.detail .file-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
  [hidden] { display: none !important; }
`;

/** @type {import('@mosaikit/sdk').MosaikitExtension} */
const extension = {
  activate(context) {
    if (customElements.get(ELEMENT)) {
      return;
    }

    class Catalog extends HTMLElement {
      constructor() {
        super();
        this.onPopState = () => void this.open(folderInAddress(), { push: false });
      }

      connectedCallback() {
        // The shell mounts the app again when the language changes: read it at every mount.
        this.t = translator(context.locale);
        this.dates = new Intl.DateTimeFormat(context.locale, { dateStyle: 'medium', timeStyle: 'short' });
        this.numbers = new Intl.NumberFormat(context.locale, { maximumFractionDigits: 1 });
        this.sort = 'name';
        this.order = 'asc';
        /** The sub-folders of each folder loaded so far, by id (ROOT for the root): [{ id, name }]. */
        this.tree = new Map();
        this.expanded = new Set();
        this.current = null;
        /** The items of the open folder that are selected, by id. */
        this.selected = new Set();
        /** The items cut with Ctrl+X, to move with Ctrl+V: [{ id, name, kind }]. */
        this.cut = [];
        /** The kinds of files of other extensions, by <extension>/<kind> (EXT-105). */
        this.kinds = fileKinds(context);
        /** The file whose detail is shown. */
        this.detail = null;
        this.render();
        window.addEventListener('popstate', this.onPopState);
        void this.open(folderInAddress(), { push: false });
      }

      disconnectedCallback() {
        window.removeEventListener('popstate', this.onPopState);
      }

      render() {
        const t = this.t;
        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>${STYLE}</style>
          <header>
            <div>
              <h1></h1>
              <p class="intro"></p>
            </div>
            <button type="button" class="primary new" hidden></button>
          </header>
          <nav class="crumbs"><ol></ol></nav>
          <form class="create" hidden>
            <input name="name" maxlength="255" required autocomplete="off" />
            <button type="submit" class="primary"></button>
            <button type="button" class="cancel"></button>
          </form>
          <div class="toolbar" hidden>
            <label><input type="checkbox" class="all" /> <span></span></label>
            <button type="button" class="upload-files"></button>
            <button type="button" class="upload-folder"></button>
            <button type="button" class="download"></button>
            <button type="button" class="move"></button>
            <button type="button" class="rename"></button>
            <button type="button" class="delete danger"></button>
            <input type="file" class="files" multiple hidden />
            <input type="file" class="folder" webkitdirectory hidden />
          </div>
          <p class="muted shortcuts" hidden></p>
          <p role="status" aria-live="polite"></p>
          <div class="layout">
            <nav class="tree panel"><ul></ul></nav>
            <section class="panel content">
              <div class="table">
                <table>
                  <thead><tr>
                    <th scope="col" data-sort="name"><button type="button"></button></th>
                    <th scope="col" class="size"></th>
                    <th scope="col" class="owner"></th>
                    <th scope="col" data-sort="changed"><button type="button"></button></th>
                    <th scope="col" class="sharing"></th>
                  </tr></thead>
                  <tbody></tbody>
                </table>
              </div>
              <p class="muted empty" hidden></p>
              <div class="not-found" hidden>
                <h2></h2>
                <p class="muted"></p>
                <p><a class="back"></a></p>
              </div>
              <section class="detail" aria-labelledby="detail-title" hidden>
                <header>
                  <h2 id="detail-title"></h2>
                  <button type="button" class="close"></button>
                </header>
                <dl></dl>
                <div class="preview" hidden></div>
                <div class="kind-actions" role="group" hidden></div>
                <div class="file-actions">
                  <button type="button" class="download-file"></button>
                  <button type="button" class="replace"></button>
                  <input type="file" class="replace-input" hidden />
                </div>
              </section>
              <section class="access" aria-labelledby="access-title" hidden>
                <h2 id="access-title"></h2>
                <ul></ul>
                <p class="muted admins"></p>
                <button type="button" class="share"></button>
              </section>
              <section class="uploads" hidden>
                <h2></h2>
                <ul></ul>
              </section>
            </section>
          </div>
          <dialog aria-labelledby="dialog-title"><form method="dialog"></form></dialog>
          <p class="version"></p>`;
        const $ = (selector) => root.querySelector(selector);
        this.$ = $;
        $('h1').textContent = t('title');
        $('.intro').textContent = t('intro');
        $('.version').textContent = t('version', context.extension);
        $('nav.crumbs').setAttribute('aria-label', t('breadcrumbs'));
        $('nav.tree').setAttribute('aria-label', t('folders'));
        $('button.new').textContent = t('newFolder');
        $('form.create input').setAttribute('aria-label', t('folderName'));
        $('form.create input').placeholder = t('folderName');
        $('form.create button[type=submit]').textContent = t('create');
        $('form.create button.cancel').textContent = t('cancel');
        $('.toolbar').setAttribute('aria-label', t('actions'));
        $('.toolbar').setAttribute('role', 'toolbar');
        $('.toolbar label span').textContent = t('selectAll');
        $('button.upload-files').textContent = t('uploadFiles');
        $('button.upload-folder').textContent = t('uploadFolder');
        $('button.download').textContent = t('download');
        $('button.move').textContent = t('move');
        $('button.rename').textContent = t('rename');
        $('button.delete').textContent = t('delete');
        $('.shortcuts').textContent = t('shortcuts');
        $('th[data-sort=name] button').textContent = t('name');
        $('th.size').textContent = t('size');
        $('th.owner').textContent = t('owner');
        $('th[data-sort=changed] button').textContent = t('changed');
        $('th.sharing').textContent = t('sharing');
        $('.not-found h2').textContent = t('notFound');
        $('.not-found p.muted').textContent = t('notFoundText');
        $('.not-found a.back').textContent = t('backToRoot');
        $('.not-found a.back').href = ROUTE;
        $('.not-found a.back').addEventListener('click', (event) => this.follow(event, null));
        $('section.access ul').setAttribute('aria-label', t('whoHasAccess'));
        $('section.access .admins').textContent = t('admins');
        $('section.access button.share').textContent = t('share');
        $('section.access button.share').addEventListener('click', () => this.share());
        $('section.detail button.close').textContent = t('close');
        $('section.detail button.close').addEventListener('click', () => this.hideDetail());
        $('section.detail button.download-file').textContent = t('download');
        $('section.detail button.download-file').addEventListener('click', () => {
          if (this.detail) {
            void this.download([this.detail]);
          }
        });
        $('section.detail button.replace').textContent = t('replace');
        $('section.detail button.replace').addEventListener('click', () => $('input.replace-input').click());
        $('input.replace-input').addEventListener('change', (event) => {
          const [file] = event.target.files ?? [];
          event.target.value = '';
          if (file && this.detail) {
            void this.replace(this.detail, file);
          }
        });
        $('.uploads').setAttribute('aria-label', t('uploads'));
        $('.uploads h2').textContent = t('uploads');
        // The sharing dialog of the shell gives the focus back to the Share button when it closes: then
        // the list and who has access show what changed in it.
        root.addEventListener('focusin', () => {
          if (this.sharingOpen) {
            this.sharingOpen = false;
            void this.refresh();
          }
        });

        const form = $('form.create');
        $('button.new').addEventListener('click', () => {
          form.hidden = false;
          form.elements.namedItem('name').focus();
        });
        $('form.create button.cancel').addEventListener('click', () => {
          form.reset();
          form.hidden = true;
        });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          void this.create(form.elements.namedItem('name').value);
        });
        for (const header of root.querySelectorAll('th[data-sort]')) {
          header.querySelector('button').addEventListener('click', () => {
            const by = header.dataset.sort;
            if (this.sort === by) {
              this.order = this.order === 'asc' ? 'desc' : 'asc';
            } else {
              this.sort = by;
              this.order = by === 'changed' ? 'desc' : 'asc';
            }
            void this.open(this.current?.id ?? null, { push: false });
          });
        }

        // EXT-002: the actions on the selection, and uploads with the dialogs of the browser.
        $('input.all').addEventListener('change', (event) => {
          const items = this.current?.items ?? [];
          this.selected = new Set(event.target.checked ? items.map((item) => item.id) : []);
          this.showSelection();
        });
        $('button.upload-files').addEventListener('click', () => $('input.files').click());
        $('button.upload-folder').addEventListener('click', () => $('input.folder').click());
        for (const input of [$('input.files'), $('input.folder')]) {
          input.addEventListener('change', () => {
            const entries = chosen(input.files ?? []);
            input.value = '';
            const target = openFolderId(this.current);
            if (target) {
              void this.upload(target, entries);
            }
          });
        }
        $('button.download').addEventListener('click', () => void this.download(this.selection()));
        $('button.move').addEventListener('click', () => void this.askMove(this.selection()));
        $('button.rename').addEventListener('click', () => {
          const [item] = this.selection();
          if (item) {
            void this.askRename(item);
          }
        });
        $('button.delete').addEventListener('click', () => void this.askDelete(this.selection()));

        // Dropped from the computer onto the open folder, or items dragged onto it.
        // Shared with me is no folder: nothing is dropped there.
        this.dropTarget($('section.content'), () => (this.current?.id === SHARED ? undefined : (this.current?.id ?? null)));
        $('tbody').addEventListener('keydown', (event) => {
          const row = event.target.closest?.('tr');
          const item = row && this.current?.items.find((each) => each.id === row.dataset.id);
          if (item) {
            this.onKey(event, item);
          }
        });
        $('nav.tree').addEventListener('keydown', (event) => {
          const link = event.target.closest?.('a[data-id]');
          if (link) {
            this.onKey(event, { id: link.dataset.id, name: link.dataset.name, kind: 'folder' });
          } else if (event.target.closest?.('a')) {
            // The root of the tree: only paste.
            this.onKey(event, null);
          }
        });
      }

      /** Opens a folder, the root when id is null, or Shared with me, and shows it in the address. */
      async open(id, { push = true } = {}) {
        if (push) {
          history.pushState(null, '', address(id));
        }
        const query = `sort=${this.sort}&order=${this.order}`;
        const url =
          id === SHARED ? `${SHARED_API}?${query}` : id ? `${API}/${encodeURIComponent(id)}?${query}` : `${API}?${query}`;
        const response = await context.fetch(url);
        if (response.status === 404) {
          this.current = null;
          this.showNotFound();
          await this.renderTree();
          return;
        }
        if (!response.ok) {
          this.say(this.t('notLoaded', { status: response.status }), true);
          return;
        }
        const folder = await response.json();
        if ((this.current?.id ?? null) !== (id ?? null)) {
          this.selected = new Set();
        }
        if (id === SHARED) {
          folder.id = SHARED;
          folder.name = this.t('sharedWithMe');
          folder.path = [{ id: SHARED, name: folder.name }];
        } else {
          this.tree.set(folder.id ?? ROOT, foldersOf(folder.items));
        }
        this.current = folder;
        for (const step of folder.path) {
          if (step.id !== SHARED) {
            this.expanded.add(step.id);
          }
        }
        this.showFolder(folder);
        const detail = this.detail && folder.items.find((item) => item.id === this.detail.id);
        if (detail) {
          this.showDetail(detail);
        } else {
          this.hideDetail();
        }
        await this.renderTree();
        // An open folder shows who has access to it; the root and Shared with me show it for the item
        // chosen in the list.
        if (folder.id && folder.id !== SHARED) {
          await this.showAccess(folder.id);
        } else {
          this.hideAccess();
        }
      }

      /** Loads the open view again, the tree, and who has access to the item shown, after a change. */
      async refresh() {
        // Items may have moved, been renamed or deleted (EXT-002): read the tree again too.
        this.tree.clear();
        const shown = this.access?.id;
        await this.open(this.current?.id ?? null, { push: false });
        if (shown && shown !== this.access?.id) {
          await this.showAccess(shown);
        }
      }

      /** Shows who has access to an item, and through which share. */
      async showAccess(id) {
        const response = await context.fetch(`${ITEMS_API}/${encodeURIComponent(id)}/access`);
        if (!response.ok) {
          this.hideAccess();
          return;
        }
        const access = await response.json();
        this.access = access;
        const t = this.t;
        const $ = this.$;
        $('section.access').hidden = false;
        $('#access-title').textContent = t('access', { name: access.name });
        $('section.access ul').replaceChildren(...access.entries.map((entry) => this.accessEntry(entry)));
        $('section.access button.share').hidden = !access.canShare;
        $('section.access button.share').setAttribute('aria-label', t('shareItem', { name: access.name }));
      }

      hideAccess() {
        this.access = null;
        this.$('section.access').hidden = true;
      }

      accessEntry(entry) {
        const t = this.t;
        const li = document.createElement('li');
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = this.who(entry.who);
        const level = document.createElement('span');
        level.className = 'level';
        level.textContent = t(`level_${entry.level}`);
        const via = document.createElement('span');
        via.className = 'via';
        if (entry.from) {
          // Inherited from a folder above: its name opens it.
          const [before, after] = t(entry.via === 'owner' ? 'ownerOf' : 'through').split('{folder}');
          via.append(before ?? '', this.link(entry.from.id, entry.from.name), after ?? '');
        } else {
          via.textContent = t(entry.via === 'owner' ? 'owner' : 'direct');
        }
        li.append(who, level, via);
        return li;
      }

      /** Who an entry of the access is for, in words. */
      who(who) {
        const t = this.t;
        switch (who.kind) {
          case 'person':
            return who.name && who.email ? `${who.name} (${who.email})` : (who.name ?? who.email ?? t('somebody'));
          case 'group':
            return t('team', { name: who.name ?? '' });
          case 'organization':
            return t('everyoneInOrganization');
          case 'link':
            return t('anyoneWithLink', { date: who.expires ? this.dates.format(new Date(who.expires)) : '' });
          default:
            return t('everyone');
        }
      }

      /** Opens the sharing dialog of the platform for the item whose access is shown (MK-055). */
      share() {
        const access = this.access;
        if (!access) {
          return;
        }
        context.events.publish('shell.share', { extension: context.extension.id, type: access.kind, id: access.id });
        // Set after the click, whose focus is already on the button: the next focus in the app is the
        // one the dialog gives back when it closes.
        setTimeout(() => {
          this.sharingOpen = true;
        }, 0);
      }

      /** Follows a link of the app without leaving the page. */
      follow(event, id) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        void this.open(id);
      }

      link(id, name) {
        const a = document.createElement('a');
        a.href = address(id);
        a.textContent = name;
        a.addEventListener('click', (event) => this.follow(event, id));
        return a;
      }

      showFolder(folder) {
        const t = this.t;
        const $ = this.$;
        $('.not-found').hidden = true;
        $('.table').hidden = false;
        $('button.new').hidden = !folder.canCreate;
        if (!folder.canCreate) {
          $('form.create').hidden = true;
        }
        $('.toolbar').hidden = false;
        $('.shortcuts').hidden = false;
        // Files go in a folder: no upload at the root nor in Shared with me.
        const noUpload = !openFolderId(folder) || !folder.canCreate;
        $('button.upload-files').hidden = noUpload;
        $('button.upload-folder').hidden = noUpload;
        this.renderCrumbs(folder.path);
        $('table').setAttribute('aria-label', t('content', { name: folder.name ?? t('root') }));
        for (const header of this.shadowRoot.querySelectorAll('th[data-sort]')) {
          header.setAttribute(
            'aria-sort',
            header.dataset.sort === this.sort ? (this.order === 'asc' ? 'ascending' : 'descending') : 'none',
          );
        }
        const ids = new Set(folder.items.map((item) => item.id));
        this.selected = new Set([...this.selected].filter((id) => ids.has(id)));
        $('tbody').replaceChildren(...folder.items.map((item) => this.row(item)));
        $('.empty').hidden = folder.items.length > 0;
        $('.empty').textContent = folder.id === SHARED ? t('emptyShared') : folder.id ? t('empty') : t('emptyRoot');
        this.showSelection();
      }

      row(item) {
        const t = this.t;
        const tr = document.createElement('tr');
        tr.dataset.kind = item.kind;
        tr.dataset.id = item.id;
        const name = document.createElement('td');
        name.className = 'name';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'select';
        box.setAttribute('aria-label', t('select', { name: item.name }));
        box.checked = this.selected.has(item.id);
        box.addEventListener('change', () => {
          if (box.checked) {
            this.selected.add(item.id);
          } else {
            this.selected.delete(item.id);
          }
          this.showSelection();
        });
        name.append(box);
        const kind = this.kindOf(item);
        if (kind?.icon) {
          const icon = document.createElement('img');
          icon.className = 'kind';
          icon.alt = '';
          icon.src = kind.icon;
          name.append(icon);
        } else {
          name.insertAdjacentHTML('beforeend', ICONS[item.kind] ?? ICONS.file);
        }
        if (item.kind === 'folder') {
          name.append(this.link(item.id, item.name));
          this.dropTarget(tr, () => item.id);
        } else {
          // A file downloads with its name (EXT-002).
          const open = document.createElement('button');
          open.type = 'button';
          open.className = 'link';
          open.textContent = item.name;
          open.title = t('downloadItem', { name: item.name });
          open.addEventListener('click', () => void this.download([item]));
          name.append(open);
          // EXT-105: the kind and its state, the actions of the kind, and the detail of the file.
          if (kind) {
            name.append(badge(kind.title, 'kind'));
            if (item.fileKind.state) {
              name.append(badge(this.stateText(kind, item.fileKind.state), 'state'));
            }
          }
          const actions = document.createElement('span');
          actions.className = 'row-actions';
          for (const action of kind?.actions ?? []) {
            actions.append(this.actionButton(item, action));
          }
          const details = document.createElement('button');
          details.type = 'button';
          details.className = 'details';
          // An icon, so that the name of the file stays the only text of its cell.
          details.innerHTML = ICONS.details;
          details.title = t('detailsOf', { name: item.name });
          details.setAttribute('aria-label', t('detailsOf', { name: item.name }));
          details.addEventListener('click', () => this.showDetail(item));
          actions.append(details);
          name.append(actions);
        }
        if (editable(item)) {
          tr.draggable = true;
          tr.addEventListener('dragstart', (event) => {
            const dragged = this.selected.has(item.id) ? this.selection() : [item];
            event.dataTransfer.setData(DRAGGED, JSON.stringify(dragged.map(({ id, name, kind }) => ({ id, name, kind }))));
            event.dataTransfer.effectAllowed = 'move';
          });
        }
        const size = cell(item.kind === 'folder' ? this.count(item.items) : this.bytes(item.size), 'num');
        const owner = cell(item.owner ? (item.owner.name ?? '') : t('theOrganization'));
        const changed = document.createElement('td');
        changed.className = 'num';
        const time = document.createElement('time');
        time.dateTime = item.changed;
        time.textContent = this.dates.format(new Date(item.changed));
        changed.append(time);
        const scope = t(`scope_${item.sharing.scope}`);
        const sharing = document.createElement('td');
        const who = document.createElement('button');
        who.type = 'button';
        who.className = 'sharing';
        who.textContent = item.sharing.inherited ? t('inherited', { scope }) : scope;
        who.setAttribute('aria-label', t('access', { name: item.name }));
        who.addEventListener('click', () => void this.showAccess(item.id));
        sharing.append(who);
        tr.append(name, size, owner, changed, sharing);
        tr.classList.toggle('selected', this.selected.has(item.id));
        tr.classList.toggle('cut', this.cut.some((each) => each.id === item.id));
        return tr;
      }

      /**
       * The kind of a file as the app shows it (EXT-105): the contribution of its extension, when the
       * server says the file is of a kind whose extension is active; null for a plain file.
       */
      kindOf(item) {
        if (!item.fileKind) {
          return null;
        }
        const id = `${item.fileKind.extension}/${item.fileKind.name}`;
        const contribution = this.kinds.get(id);
        const language = String(context.locale ?? 'en');
        const text = (key, fallback) => translated(contribution, key, language) ?? fallback;
        const attributes = contribution?.attributes ?? {};
        return {
          id,
          extension: item.fileKind.extension,
          title: text('title', typeof attributes.title === 'string' ? attributes.title : item.fileKind.name),
          icon: typeof attributes.icon === 'string' ? `${ASSETS}/${contribution.extensionId}/${attributes.icon}` : null,
          preview: typeof attributes.preview === 'string' ? attributes.preview : null,
          states: attributes.states && typeof attributes.states === 'object' ? attributes.states : {},
          actions: (Array.isArray(attributes.actions) ? attributes.actions : []).map((action) => ({
            id: action.id,
            element: action.element,
            title: text(`action.${action.id}`, action.title),
          })),
          text,
        };
      }

      /** The title of a state of a kind, in the language of the person; the state itself otherwise. */
      stateText(kind, state) {
        const title = kind.states[state];
        return kind.text(`state.${state}`, typeof title === 'string' ? title : state);
      }

      actionButton(item, action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'kind-action';
        button.dataset.action = action.id;
        button.textContent = action.title;
        button.setAttribute('aria-label', this.t('actionOn', { action: action.title, name: item.name }));
        button.addEventListener('click', () => void this.runAction(item, action));
        return button;
      }

      /** The file as the elements of its kind receive it: what it is, and a signed link to its content. */
      fileFor(item) {
        return {
          id: item.id,
          name: item.name,
          contentType: item.contentType,
          size: item.size,
          fileKind: item.fileKind,
          url: () => this.contentUrl(item),
        };
      }

      /** A signed, expiring link to the content of a file (EXT-004). */
      async contentUrl(item) {
        const response = await context.fetch(DOWNLOADS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [item.id] }),
        });
        let download = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(this.reason(download, response.status));
        }
        const until = Date.now() + DOWNLOAD_WAIT;
        while (download.status === 'pending' && Date.now() < until) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          const again = await context.fetch(`${DOWNLOADS_API}/${encodeURIComponent(download.id)}`);
          download = await again.json().catch(() => ({ status: 'failed' }));
        }
        if (download.status !== 'ready') {
          throw new Error(this.t('notReady'));
        }
        return download.entries[0].url;
      }

      /** Shows the detail of a file: what it is, its kind and state, its preview and its actions (EXT-105). */
      showDetail(item) {
        const t = this.t;
        const $ = this.$;
        const same = this.detail?.id === item.id && this.detail?.changed === item.changed;
        this.detail = item;
        const kind = this.kindOf(item);
        const section = $('section.detail');
        section.hidden = false;
        $('#detail-title').textContent = item.name;
        const facts = [
          [t('type'), item.contentType ?? ''],
          [t('size'), this.bytes(item.size ?? 0)],
          [t('fileKind'), kind ? kind.title : t('plainFile')],
        ];
        if (kind && item.fileKind.state) {
          const state = this.stateText(kind, item.fileKind.state);
          facts.push([t('state'), item.fileKind.stateDetail ? `${state}: ${item.fileKind.stateDetail}` : state]);
        }
        $('section.detail dl').replaceChildren(
          ...facts.flatMap(([term, value]) => {
            const dt = document.createElement('dt');
            dt.textContent = term;
            const dd = document.createElement('dd');
            dd.textContent = value;
            return [dt, dd];
          }),
        );
        const preview = $('section.detail .preview');
        if (kind?.preview && customElements.get(kind.preview)) {
          // The preview is made again only for another file, or a file that changed.
          if (!same || preview.hidden) {
            const element = document.createElement(kind.preview);
            element.file = this.fileFor(item);
            preview.replaceChildren(element);
          }
          preview.setAttribute('aria-label', t('preview', { name: item.name }));
          preview.setAttribute('role', 'region');
          preview.hidden = false;
        } else {
          preview.replaceChildren();
          preview.hidden = true;
        }
        const actions = $('section.detail .kind-actions');
        actions.setAttribute('aria-label', t('actionsOf', { name: item.name }));
        actions.replaceChildren(...(kind?.actions ?? []).map((action) => this.actionButton(item, action)));
        actions.hidden = actions.childElementCount === 0;
        $('section.detail button.replace').hidden = !editable(item);
      }

      hideDetail() {
        this.detail = null;
        this.$('section.detail').hidden = true;
        this.$('section.detail .preview').replaceChildren();
      }

      /**
       * Runs an action of the kind of a file: its element, in a dialog, given the file. When the element
       * says that it changed the file, the list and the detail show it again, with the new state.
       */
      async runAction(item, action) {
        const t = this.t;
        const answer = this.dialog(t('actionOn', { action: action.title, name: item.name }), (form) => {
          const element = customElements.get(action.element) ? document.createElement(action.element) : null;
          if (element) {
            element.addEventListener('catalog-file-changed', () => void this.refresh());
            element.file = this.fileFor(item);
            form.append(element);
          }
          const row = document.createElement('div');
          row.className = 'actions';
          const close = document.createElement('button');
          close.value = 'close';
          close.textContent = t('close');
          row.append(close);
          form.append(row);
        });
        await answer;
        await this.refresh();
      }

      /** Replaces the content of a file with one chosen on the computer (EXT-105). */
      async replace(item, file) {
        const t = this.t;
        const response = await context.fetch(`${ITEMS_API}/${encodeURIComponent(item.id)}/content`, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (!response.ok) {
          this.say(t('notReplaced', { reason: this.reason(await response.json().catch(() => ({})), response.status) }), true);
          return;
        }
        await this.refresh();
        this.say(t('replaced', { name: item.name }));
      }

      /** The items selected in the open folder, in its order. */
      selection() {
        return (this.current?.items ?? []).filter((item) => this.selected.has(item.id));
      }

      /** Shows the selection on the rows and enables the actions it allows. */
      showSelection() {
        const $ = this.$;
        const selection = this.selection();
        for (const tr of this.shadowRoot.querySelectorAll('tbody tr')) {
          const on = this.selected.has(tr.dataset.id);
          tr.classList.toggle('selected', on);
          tr.querySelector('input.select').checked = on;
        }
        const all = $('input.all');
        const total = this.current?.items.length ?? 0;
        all.checked = total > 0 && selection.length === total;
        all.indeterminate = selection.length > 0 && selection.length < total;
        all.disabled = total === 0;
        const changes = selection.length > 0 && selection.every(editable);
        $('button.download').disabled = selection.length === 0;
        $('button.move').disabled = !changes;
        $('button.rename').disabled = !(changes && selection.length === 1);
        $('button.delete').disabled = !changes;
      }


      count(items) {
        if (items === 0) {
          return this.t('items_zero');
        }
        return items === 1 ? this.t('items_one') : this.t('items_other', { count: items });
      }

      bytes(size) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let value = size;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
          value /= 1024;
          unit += 1;
        }
        return `${this.numbers.format(value)} ${units[unit]}`;
      }

      renderCrumbs(path) {
        const list = this.$('nav.crumbs ol');
        // Shared with me is not under the files of the organization.
        const steps = path[0]?.id === SHARED ? path : [{ id: null, name: this.t('root') }, ...path];
        list.replaceChildren(
          ...steps.map((step, index) => {
            const li = document.createElement('li');
            const a = this.link(step.id, step.name);
            if (index === steps.length - 1) {
              a.setAttribute('aria-current', 'page');
            }
            li.append(a);
            return li;
          }),
        );
      }

      showNotFound() {
        const $ = this.$;
        $('.table').hidden = true;
        $('.empty').hidden = true;
        $('button.new').hidden = true;
        $('form.create').hidden = true;
        $('.toolbar').hidden = true;
        $('.shortcuts').hidden = true;
        $('.not-found').hidden = false;
        this.hideAccess();
        this.renderCrumbs([]);
        this.say('');
      }

      /** The tree of folders: the root, and below it every folder opened or expanded. */
      async renderTree() {
        if (!this.tree.has(ROOT)) {
          await this.load(ROOT);
        }
        for (const id of this.expanded) {
          if (!this.tree.has(id)) {
            await this.load(id);
          }
        }
        const top = document.createElement('li');
        top.append(this.treeRow({ id: null, name: this.t('root') }, false));
        top.append(this.branch(ROOT));
        const shared = document.createElement('li');
        shared.append(this.treeRow({ id: SHARED, name: this.t('sharedWithMe') }, false));
        this.$('nav.tree > ul').replaceChildren(top, shared);
      }

      /** Loads the sub-folders of a folder for the tree, by name. */
      async load(id) {
        const response = await context.fetch(id === ROOT ? `${API}?sort=name` : `${API}/${encodeURIComponent(id)}?sort=name`);
        if (response.ok) {
          const folder = await response.json();
          this.tree.set(id, foldersOf(folder.items));
        } else {
          this.tree.set(id, []);
          this.expanded.delete(id);
        }
      }

      branch(id) {
        const ul = document.createElement('ul');
        for (const folder of this.tree.get(id) ?? []) {
          const li = document.createElement('li');
          li.append(this.treeRow(folder, true));
          if (this.expanded.has(folder.id) && this.tree.has(folder.id)) {
            li.append(this.branch(folder.id));
          }
          ul.append(li);
        }
        return ul;
      }

      treeRow(folder, toggles) {
        const row = document.createElement('div');
        if (toggles) {
          const open = this.expanded.has(folder.id);
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'toggle';
          toggle.textContent = open ? '▾' : '▸';
          toggle.setAttribute('aria-expanded', String(open));
          toggle.setAttribute('aria-label', this.t(open ? 'collapse' : 'expand', { name: folder.name }));
          toggle.addEventListener('click', () => {
            if (this.expanded.has(folder.id)) {
              this.expanded.delete(folder.id);
            } else {
              this.expanded.add(folder.id);
            }
            void this.renderTree();
          });
          row.append(toggle);
        } else {
          const leaf = document.createElement('span');
          leaf.className = 'leaf';
          row.append(leaf);
        }
        const a = this.link(folder.id, folder.name);
        a.insertAdjacentHTML('afterbegin', ICONS.folder);
        if (folder.id && folder.id !== SHARED) {
          a.dataset.id = folder.id;
          a.dataset.name = folder.name;
          // Folders of the tree move like the rows of the list (EXT-002).
          a.draggable = true;
          a.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData(DRAGGED, JSON.stringify([{ id: folder.id, name: folder.name, kind: 'folder' }]));
            event.dataTransfer.effectAllowed = 'move';
          });
        }
        if ((this.current?.id ?? null) === folder.id && this.current) {
          a.setAttribute('aria-current', 'page');
        }
        if (folder.id !== SHARED) {
          this.dropTarget(row, () => folder.id);
        }
        row.append(a);
        return row;
      }

      async create(name) {
        const parent = this.current?.id ?? null;
        const response = await context.fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parent }),
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          this.say(this.t('notCreated', { reason: this.reason(problem, response.status) }), true);
          return;
        }
        const created = await response.json();
        const form = this.$('form.create');
        form.reset();
        form.hidden = true;
        await this.refresh();
        this.say(this.t('created', { name: created.name }));
      }

      /**
       * Makes an element take what is dropped on it: files and folders from the computer are uploaded
       * into its folder, items of the app are moved there (EXT-002).
       *
       * @param folderOf the folder of the element, null for the root, undefined for none
       */
      dropTarget(element, folderOf) {
        const accepts = (event) => {
          const types = [...(event.dataTransfer?.types ?? [])];
          return types.includes(DRAGGED) || types.includes('Files');
        };
        element.addEventListener('dragover', (event) => {
          if (!accepts(event)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = [...event.dataTransfer.types].includes(DRAGGED) ? 'move' : 'copy';
          element.classList.add('drop');
        });
        element.addEventListener('dragleave', () => element.classList.remove('drop'));
        element.addEventListener('drop', (event) => {
          element.classList.remove('drop');
          if (!accepts(event)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const target = folderOf();
          if (target === undefined) {
            return;
          }
          const items = event.dataTransfer.getData(DRAGGED);
          if (items) {
            void this.move(JSON.parse(items), target);
            return;
          }
          // Read the items of the drop now: the browser forgets them when the event ends.
          const entries = dropped(event.dataTransfer);
          if (!target) {
            this.say(this.t('uploadInFolder'), true);
            return;
          }
          void entries.then((list) => this.upload(target, list));
        });
      }

      /** The keys of a row of the list or a folder of the tree; item null for the root of the tree. */
      onKey(event, item) {
        const command = event.ctrlKey || event.metaKey;
        if (command && event.key.toLowerCase() === 'x' && item && editable(item)) {
          event.preventDefault();
          this.cut = this.selected.has(item.id) ? this.selection() : [item];
          for (const tr of this.shadowRoot.querySelectorAll('tbody tr')) {
            tr.classList.toggle('cut', this.cut.some((each) => each.id === tr.dataset.id));
          }
          this.say(this.t(this.cut.length === 1 ? 'cutDone_one' : 'cutDone', { count: this.cut.length }));
        } else if (command && event.key.toLowerCase() === 'v' && this.cut.length > 0) {
          event.preventDefault();
          const into = item?.kind === 'folder' ? item.id : item ? (this.current?.id ?? null) : null;
          if (into === SHARED) {
            return;
          }
          const moving = this.cut;
          this.cut = [];
          void this.move(moving, into);
        } else if (event.key === 'F2' && item && editable(item)) {
          event.preventDefault();
          void this.askRename(item);
        } else if (event.key === 'Delete' && item && editable(item)) {
          event.preventDefault();
          void this.askDelete(this.selected.has(item.id) ? this.selection() : [item]);
        }
      }

      /**
       * Uploads files and folders into a folder, keeping their structure (EXT-002): the size of all of
       * it is checked against the quota of the organization first, and nothing starts when it does not
       * fit. Each file shows its progress.
       *
       * @param entries [{ path, file }], a folder with a path ending with "/" and no file
       */
      async upload(target, entries) {
        const t = this.t;
        const files = entries.filter((entry) => entry.file);
        if (entries.length === 0) {
          return;
        }
        const bytes = files.reduce((total, entry) => total + entry.file.size, 0);
        const check = await context.fetch(`${UPLOADS_API}/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: target, bytes }),
        });
        if (!check.ok) {
          const problem = await check.json().catch(() => ({}));
          if (check.status === 403 && problem.quota) {
            const { limit, used } = problem.quota;
            this.say(
              t('overQuota', { size: this.bytes(bytes), limit: this.bytes(limit), free: this.bytes(Math.max(0, limit - used)) }),
              true,
            );
          } else {
            this.say(t('notUploaded', { reason: this.reason(problem, check.status) }), true);
          }
          return;
        }

        const panel = this.$('.uploads');
        panel.hidden = false;
        const rows = new Map(files.map((entry) => [entry, this.uploadRow(entry.path)]));
        panel.querySelector('ul').replaceChildren(...[...rows.values()].map((row) => row.li));
        const folders = new Map([['', target]]);
        let done = 0;
        let failed = 0;
        this.say(t('uploading', { count: files.length }));
        for (const entry of entries) {
          const parts = entry.path.replace(/\/$/, '').split('/');
          const name = parts.pop();
          const row = rows.get(entry);
          let parent;
          try {
            parent = await this.folderFor(folders, parts);
            if (!entry.file) {
              await this.folderFor(folders, [...parts, name]);
              continue;
            }
          } catch (problem) {
            if (row) {
              row.failed(this.reason(problem, problem.status));
              failed += 1;
            }
            continue;
          }
          row.start();
          const response = await context.fetch(`${API}/${encodeURIComponent(parent)}/files?name=${encodeURIComponent(name)}`, {
            method: 'POST',
            headers: { 'Content-Type': entry.file.type || 'application/octet-stream' },
            body: entry.file,
          });
          if (response.ok) {
            row.done();
            done += 1;
          } else {
            row.failed(this.reason(await response.json().catch(() => ({})), response.status));
            failed += 1;
          }
        }
        await this.refresh();
        this.say(
          failed ? t('uploadedSome', { done, failed }) : t(done === 1 ? 'uploaded_one' : 'uploaded', { count: done }),
          failed > 0,
        );
      }

      /** The row of a file in the panel of uploads, with its progress. */
      uploadRow(path) {
        const t = this.t;
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'path';
        name.textContent = path;
        const progress = document.createElement('progress');
        progress.max = 100;
        progress.value = 0;
        progress.setAttribute('aria-label', t('progressOf', { path }));
        const state = document.createElement('span');
        state.className = 'state';
        state.textContent = t('waiting');
        li.append(name, progress, state);
        return {
          li,
          start() {
            // The browser does not tell how much of a request it sent: the bar runs until the answer.
            progress.removeAttribute('value');
            state.textContent = t('uploadingOne');
          },
          done() {
            progress.value = 100;
            state.textContent = t('uploadedOne');
          },
          failed(reason) {
            progress.value = 0;
            state.textContent = t('failedOne', { reason });
            state.classList.add('failed');
          },
        };
      }

      /**
       * The folder of a path below the target of an upload, created when missing; a folder of that name
       * already there is used as it is.
       */
      async folderFor(folders, parts) {
        for (let i = 0; i < parts.length; i++) {
          const key = parts.slice(0, i + 1).join('/');
          if (folders.has(key)) {
            continue;
          }
          const parent = folders.get(parts.slice(0, i).join('/'));
          const response = await context.fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: parts[i], parent }),
          });
          const body = await response.json().catch(() => ({}));
          if (response.ok) {
            folders.set(key, body.id);
          } else if (response.status === 409 && body.existing?.kind === 'folder') {
            folders.set(key, body.existing.id);
          } else {
            throw { ...body, status: response.status };
          }
        }
        return folders.get(parts.join('/'));
      }

      /**
       * Downloads items (EXT-002): one file with its name, anything else as one archive. Every file comes
       * from a signed, expiring link of the platform (EXT-004), which the app fetches without the
       * session; the name is the one of the item now, whatever the name it was stored with.
       */
      async download(items) {
        const t = this.t;
        if (items.length === 0) {
          return;
        }
        const body = { items: items.map((item) => item.id) };
        if (items.length > 1) {
          body.name = `${this.current?.name ?? t('root')}.zip`;
        }
        const response = await context.fetch(DOWNLOADS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        let download = await response.json().catch(() => ({}));
        if (!response.ok) {
          this.say(t('notDownloaded', { reason: this.reason(download, response.status) }), true);
          return;
        }
        this.say(t('preparing', { name: download.name }));
        const until = Date.now() + DOWNLOAD_WAIT;
        while (download.status === 'pending' && Date.now() < until) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          const again = await context.fetch(`${DOWNLOADS_API}/${encodeURIComponent(download.id)}`);
          download = await again.json().catch(() => ({ status: 'failed' }));
        }
        if (download.status !== 'ready') {
          this.say(t('notDownloaded', { reason: t('notReady') }), true);
          return;
        }
        try {
          let blob;
          if (download.kind === 'file') {
            blob = await fetched(download.entries[0].url);
          } else {
            const entries = [];
            for (const entry of download.entries) {
              entries.push({ path: entry.path, blob: entry.url ? await fetched(entry.url) : null });
            }
            blob = await zip(entries);
          }
          this.save(blob, download.name);
          this.say(t('downloaded', { name: download.name }));
        } catch (error) {
          this.say(t('notDownloaded', { reason: error.message }), true);
        }
      }

      /** Hands a file to the browser, which saves it with the name given. */
      save(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.hidden = true;
        this.shadowRoot.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }

      /** Moves items into a folder, null for the root, keeping their identity and their shares (EXT-002). */
      async move(items, target) {
        const t = this.t;
        const errors = [];
        let moved = 0;
        for (const item of items) {
          if (item.id === target) {
            continue;
          }
          const response = await context.fetch(`${ITEMS_API}/${encodeURIComponent(item.id)}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent: target }),
          });
          if (response.ok) {
            moved += 1;
          } else {
            errors.push(this.reason(await response.json().catch(() => ({})), response.status));
          }
        }
        this.selected = new Set();
        await this.refresh();
        if (errors.length > 0) {
          this.say(t('notMoved', { reason: errors.join(' ') }), true);
        } else {
          this.say(moved === 1 ? t('movedOne', { name: items[0].name }) : t('moved', { count: moved }));
        }
      }

      /** A dialog of the app: its title, its body and its actions; resolves with the value of the button. */
      dialog(title, build) {
        const dialog = this.$('dialog');
        const form = dialog.querySelector('form');
        const heading = document.createElement('h2');
        heading.id = 'dialog-title';
        heading.textContent = title;
        form.replaceChildren(heading);
        form.onsubmit = null;
        const alert = document.createElement('p');
        alert.setAttribute('role', 'alert');
        build(form, alert);
        form.append(alert);
        return new Promise((resolve) => {
          dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
          dialog.returnValue = '';
          dialog.showModal();
        });
      }

      actions(form, confirm, { danger = false } = {}) {
        const row = document.createElement('div');
        row.className = 'actions';
        // Cancel is not a submit button, so that Enter confirms.
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = this.t('cancel');
        cancel.addEventListener('click', () => this.$('dialog').close('cancel'));
        const ok = document.createElement('button');
        ok.value = 'confirm';
        ok.className = danger ? 'primary danger' : 'primary';
        ok.textContent = confirm;
        row.append(cancel, ok);
        form.append(row);
        return ok;
      }

      /** Asks for the new name of an item; a name used in its folder is refused, naming that item. */
      async askRename(item) {
        const t = this.t;
        const dialog = this.$('dialog');
        let input;
        let alert;
        const answer = this.dialog(t('renameTitle', { name: item.name }), (form, message) => {
          alert = message;
          input = document.createElement('input');
          input.type = 'text';
          input.required = true;
          input.maxLength = 255;
          input.value = item.name;
          input.setAttribute('aria-label', t('newName'));
          form.append(input);
          this.actions(form, t('rename'));
          form.onsubmit = async (event) => {
            if (event.submitter?.value !== 'confirm') {
              return;
            }
            event.preventDefault();
            const response = await context.fetch(`${ITEMS_API}/${encodeURIComponent(item.id)}/rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: input.value }),
            });
            if (response.ok) {
              dialog.close('renamed');
            } else {
              alert.textContent = this.reason(await response.json().catch(() => ({})), response.status);
              input.focus();
            }
          };
        });
        const dot = item.kind === 'file' ? item.name.lastIndexOf('.') : -1;
        input.focus();
        input.setSelectionRange(0, dot > 0 ? dot : item.name.length);
        if ((await answer) === 'renamed') {
          await this.refresh();
          this.say(t('renamed', { name: input.value.trim() }));
        }
      }

      /** Asks to confirm the delete of items, with the number of items their folders hold. */
      async askDelete(items) {
        const t = this.t;
        if (items.length === 0) {
          return;
        }
        let held = 0;
        for (const item of items.filter((each) => each.kind === 'folder')) {
          const response = await context.fetch(`${ITEMS_API}/${encodeURIComponent(item.id)}/summary`);
          if (response.ok) {
            held += (await response.json()).items;
          }
        }
        let question;
        if (items.length === 1) {
          const [item] = items;
          question = item.kind === 'file'
            ? t('confirmDeleteFile', { name: item.name })
            : held === 0
              ? t('confirmDeleteEmpty', { name: item.name })
              : t(held === 1 ? 'confirmDeleteFolder_one' : 'confirmDeleteFolder_other', { name: item.name, count: held });
        } else {
          question = held === 0
            ? t('confirmDeleteMany', { count: items.length })
            : t(held === 1 ? 'confirmDeleteManyHeld_one' : 'confirmDeleteManyHeld_other', { count: items.length, held });
        }
        const answer = await this.dialog(t('deleteTitle'), (form) => {
          const p = document.createElement('p');
          p.textContent = question;
          form.append(p);
          this.actions(form, t('delete'), { danger: true });
        });
        if (answer !== 'confirm') {
          return;
        }
        const errors = [];
        for (const item of items) {
          const response = await context.fetch(`${ITEMS_API}/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
          if (!response.ok) {
            errors.push(this.reason(await response.json().catch(() => ({})), response.status));
          }
        }
        this.selected = new Set();
        // The open folder itself may be gone, from the tree.
        if (items.some((item) => item.id === this.current?.id)) {
          await this.open(this.current?.path.at(-2)?.id ?? null);
          this.tree.clear();
          await this.renderTree();
        } else {
          await this.refresh();
        }
        if (errors.length > 0) {
          this.say(t('notDeleted', { reason: errors.join(' ') }), true);
        } else {
          this.say(items.length === 1 ? t('deletedOne', { name: items[0].name }) : t('deleted', { count: items.length }));
        }
      }

      /** Asks for the folder to move items to, going through the folders the person may add to. */
      async askMove(items) {
        const t = this.t;
        if (items.length === 0) {
          return;
        }
        const moving = new Set(items.map((item) => item.id));
        let here = openFolderId(this.current);
        let list;
        let where;
        let ok;
        const show = async () => {
          const response = await context.fetch(here ? `${API}/${encodeURIComponent(here)}?sort=name` : `${API}?sort=name`);
          if (!response.ok) {
            here = null;
            return show();
          }
          const folder = await response.json();
          where.textContent = t('moveTo', { path: [t('root'), ...folder.path.map((step) => step.name)].join(' / ') });
          const entries = [];
          if (folder.id) {
            const up = document.createElement('button');
            up.type = 'button';
            up.className = 'link';
            up.textContent = t('up');
            up.addEventListener('click', () => {
              here = folder.path.at(-2)?.id ?? null;
              void show();
            });
            entries.push(up);
          }
          for (const sub of folder.items.filter((item) => item.kind === 'folder' && !moving.has(item.id))) {
            const go = document.createElement('button');
            go.type = 'button';
            go.className = 'link';
            go.textContent = sub.name;
            go.addEventListener('click', () => {
              here = sub.id;
              void show();
            });
            entries.push(go);
          }
          list.replaceChildren(
            ...entries.map((entry) => {
              const li = document.createElement('li');
              li.append(entry);
              return li;
            }),
          );
          ok.disabled = !folder.canCreate;
        };
        const answer = this.dialog(
          items.length === 1 ? t('moveTitle', { name: items[0].name }) : t('moveTitleMany', { count: items.length }),
          (form) => {
            where = document.createElement('p');
            list = document.createElement('ul');
            list.className = 'folders';
            list.setAttribute('aria-label', t('folders'));
            form.append(where, list);
            ok = this.actions(form, t('moveHere'));
          },
        );
        await show();
        if ((await answer) === 'confirm') {
          await this.move(items, here);
        }
      }

      /** What a refusal of the API says, in the language of the person when the app knows it. */
      reason(problem, status) {
        if (problem?.existing) {
          return this.t(problem.existing.kind === 'folder' ? 'takenFolder' : 'takenFile', { name: problem.existing.name });
        }
        return problem?.detail ?? String(status ?? '');
      }


      say(message, error = false) {
        const status = this.$('[role=status]');
        status.classList.toggle('error', error);
        status.textContent = message;
      }
    }

    customElements.define(ELEMENT, Catalog);
  },
};

/** The folder in the address of the page, SHARED for Shared with me, or null for the root. */
function folderInAddress() {
  const parameters = new URL(location.href).searchParams;
  return parameters.get('view') === SHARED ? SHARED : parameters.get('folder');
}

/** The address of a folder, of the root (null) or of Shared with me (SHARED). */
function address(id) {
  if (id === SHARED) {
    return `${ROUTE}?view=${SHARED}`;
  }
  return id ? `${ROUTE}?folder=${encodeURIComponent(id)}` : ROUTE;
}

/** The sub-folders of a list of items, by name, for the tree. */
function foldersOf(items) {
  return items
    .filter((item) => item.kind === 'folder')
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether the person may change an item: rename, move or delete it. A folder of the tree is checked by the API. */
function editable(item) {
  return item.level === undefined || item.level === 'edit' || item.level === 'manage';
}

/** The content of a signed link, without the session of the person (EXT-004). */
async function fetched(url) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(String(response.status));
  }
  return response.blob();
}

/** The folder open in the app, or null at the root and in Shared with me. */
function openFolderId(folder) {
  return folder?.id && folder.id !== SHARED ? folder.id : null;
}

/**
 * The contributions of other extensions to the kinds of files (EXT-105), by <extension>/<kind>: the shell
 * gives only those that match the schema of the point, of the extensions active for the person.
 */
function fileKinds(context) {
  const kinds = new Map();
  for (const contribution of context.contributionsTo?.(FILE_KINDS) ?? []) {
    const kind = contribution.attributes?.kind;
    if (typeof kind === 'string' && !kinds.has(`${contribution.extensionId}/${kind}`)) {
      kinds.set(`${contribution.extensionId}/${kind}`, contribution);
    }
  }
  return kinds;
}

/** A text of a contribution in a language, from its i18n block (MK-053): for the language, or its main one. */
function translated(contribution, key, language) {
  const i18n = contribution?.attributes?.i18n;
  if (!i18n || typeof i18n !== 'object') {
    return undefined;
  }
  for (const tag of [language, language.split('-')[0]]) {
    const text = i18n[tag]?.[key];
    if (typeof text === 'string' && text.trim() !== '') {
      return text;
    }
  }
  return undefined;
}

function badge(text, className) {
  const span = document.createElement('span');
  span.className = `badge ${className}`;
  span.textContent = text;
  return span;
}

function cell(text, className) {
  const td = document.createElement('td');
  if (className) {
    td.className = className;
  }
  td.textContent = text;
  return td;
}

export default extension;
