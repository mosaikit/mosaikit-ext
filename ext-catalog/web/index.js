// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { translator } from './i18n.js';

/**
 * Frontend of the catalog (EXT-001): a custom element that the shell renders for /app/catalog. The
 * tree of folders is on the left, the content of the open folder in the middle, its path above as
 * breadcrumbs. The open folder is in the address (/app/catalog?folder=<id>), so it can be linked and
 * the back button of the browser works; Shared with me is at /app/catalog?view=shared (EXT-003). Below
 * the content, who has access to the open folder or to the item chosen in the list, and through which
 * share; sharing itself happens in the sharing dialog of the platform (MK-055). Styled with the --mk-*
 * tokens of the theme, in the language of the person.
 */

const ELEMENT = 'mosaikit-ext-catalog';
const API = '/api/v1/ext/catalog/folders';
const SHARED_API = '/api/v1/ext/catalog/shared';
const ITEMS_API = '/api/v1/ext/catalog/items';
const ROUTE = '/app/catalog';
const ROOT = 'root';
/** The view Shared with me, where a folder id would be: never the id of a folder. */
const SHARED = 'shared';

const ICONS = {
  folder:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.4l1.5 1.5H13A1.5 1.5 0 0 1 14.5 4.5v8A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5z"/></svg>',
  file: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3.5 1.5h6l3 3v10h-9zm6 0v3h3" opacity=".85"/></svg>',
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
  button.primary { border-color: var(--mk-accent); background: var(--mk-accent); color: var(--mk-accent-fg); font-weight: 600; }
  form.create { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 12px; }
  form.create input { font: inherit; padding: 6px 10px; border: 1px solid var(--mk-line); border-radius: var(--mk-radius);
                      background: var(--mk-bg); color: var(--mk-fg); min-width: 240px; }
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
  [role='status'] { min-height: 1.2em; margin: 0 0 8px; color: var(--mk-muted); }
  [role='status'].error { color: var(--mk-danger); }
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
              <section class="access" aria-labelledby="access-title" hidden>
                <h2 id="access-title"></h2>
                <ul></ul>
                <p class="muted admins"></p>
                <button type="button" class="share"></button>
              </section>
            </section>
          </div>
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
        await this.renderTree();
        // An open folder shows who has access to it; the root and Shared with me show it for the item
        // chosen in the list.
        if (folder.id && folder.id !== SHARED) {
          await this.showAccess(folder.id);
        } else {
          this.hideAccess();
        }
      }

      /** Loads the open view again, and who has access to the item shown, after a change of sharing. */
      async refresh() {
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
        this.renderCrumbs(folder.path);
        $('table').setAttribute('aria-label', t('content', { name: folder.name ?? t('root') }));
        for (const header of this.shadowRoot.querySelectorAll('th[data-sort]')) {
          header.setAttribute(
            'aria-sort',
            header.dataset.sort === this.sort ? (this.order === 'asc' ? 'ascending' : 'descending') : 'none',
          );
        }
        $('tbody').replaceChildren(...folder.items.map((item) => this.row(item)));
        $('.empty').hidden = folder.items.length > 0;
        $('.empty').textContent = folder.id === SHARED ? t('emptyShared') : folder.id ? t('empty') : t('emptyRoot');
      }

      row(item) {
        const t = this.t;
        const tr = document.createElement('tr');
        tr.dataset.kind = item.kind;
        const name = document.createElement('td');
        name.className = 'name';
        name.insertAdjacentHTML('afterbegin', ICONS[item.kind] ?? ICONS.file);
        if (item.kind === 'folder') {
          name.append(this.link(item.id, item.name));
        } else {
          const span = document.createElement('span');
          span.textContent = item.name;
          name.append(span);
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
        return tr;
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
        if ((this.current?.id ?? null) === folder.id && this.current) {
          a.setAttribute('aria-current', 'page');
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
          this.say(this.t('notCreated', { reason: problem.detail ?? response.status }), true);
          return;
        }
        const created = await response.json();
        const form = this.$('form.create');
        form.reset();
        form.hidden = true;
        await this.open(parent, { push: false });
        this.say(this.t('created', { name: created.name }));
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

function cell(text, className) {
  const td = document.createElement('td');
  if (className) {
    td.className = className;
  }
  td.textContent = text;
  return td;
}

export default extension;
