// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { categoryName, titleOf, translator } from './i18n.js';

/**
 * Frontend of the connections (EXT-010): a custom element that the shell renders for /app/connections.
 * It lists the connections of the organization and creates new ones. The types of source come from the
 * connectors installed, each an extension of its own that implements the contract of the framework
 * (MK-134): the app knows no type. A connection whose connector is absent stays in the list, marked
 * unavailable, and works again when the connector comes back. Styled with the --mk-* tokens of the
 * theme, in the language of the person.
 */

const ELEMENT = 'mosaikit-ext-catalog-connection';
const API = '/api/v1/ext/connections';
const PAGE = 100;
/** The placeholder of the platform for what an absent extension provides (MK-135). */
const PLACEHOLDER = 'mk-reference-placeholder';

const STYLE = `
  :host { display: block; color: var(--mk-fg); font-family: var(--mk-font); }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between; }
  h1 { margin: 0; font-size: 22px; }
  h2 { font-size: 17px; margin: 0 0 8px; }
  .intro, .version, .muted { color: var(--mk-muted); font-size: 13px; }
  .intro { margin: 4px 0 0; }
  .version { margin-top: 16px; }
  a { color: var(--mk-accent); text-decoration: none; }
  button { font: inherit; padding: 6px 12px; border-radius: var(--mk-radius); border: 1px solid var(--mk-line);
           background: var(--mk-surface); color: var(--mk-fg); cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  button.primary { border-color: var(--mk-accent); background: var(--mk-accent); color: var(--mk-accent-fg); font-weight: 600; }
  button.link { border: 0; background: none; padding: 0; color: var(--mk-accent); text-align: left; }
  button.link:hover { text-decoration: underline; }
  a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--mk-focus); outline-offset: 2px; }
  input, select { font: inherit; padding: 6px 10px; border: 1px solid var(--mk-line); border-radius: var(--mk-radius);
                  background: var(--mk-bg); color: var(--mk-fg); min-width: 240px; }
  input[type=checkbox] { min-width: 0; }
  .panel { background: var(--mk-surface); border: 1px solid var(--mk-line); border-radius: var(--mk-radius);
           padding: 16px; margin: 16px 0; min-width: 0; }
  ul.types { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px;
             grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  ul.types button { width: 100%; display: flex; gap: 10px; align-items: center; text-align: left; padding: 10px; }
  ul.types .what { display: flex; flex-direction: column; min-width: 0; }
  ul.types .category { color: var(--mk-muted); font-size: 12px; }
  img.logo { width: 24px; height: 24px; flex: none; }
  form.connect { display: grid; gap: 12px; max-width: 520px; }
  form.connect label { display: grid; gap: 4px; }
  form.connect label.check { display: flex; gap: 8px; align-items: center; }
  form.connect .hint { color: var(--mk-muted); font-size: 12px; }
  form.connect .chosen { display: flex; gap: 8px; align-items: center; font-weight: 600; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .table { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--mk-line); vertical-align: middle; }
  th { font-size: 13px; color: var(--mk-muted); font-weight: 600; }
  td.name { display: flex; align-items: center; gap: 8px; overflow-wrap: anywhere; }
  .absent { display: flex; flex-direction: column; gap: 4px; min-width: 0; color: var(--mk-muted); font-size: 13px; }
  .absent .box { display: flex; flex-direction: column; gap: 2px; padding: 12px 16px; border: 1px dashed var(--mk-line);
                 border-radius: var(--mk-radius); background: var(--mk-surface); }
  .absent strong { color: var(--mk-fg); }
  .problems { border-color: var(--mk-danger); }
  .problems li { margin: 4px 0; }
  .problems .detail { color: var(--mk-muted); font-size: 12px; }
  nav.path ol { list-style: none; display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 8px; padding: 0; }
  nav.path li + li::before { content: '/'; color: var(--mk-muted); margin-right: 4px; }
  ul.entries { list-style: none; margin: 0; padding: 0; }
  ul.entries li { display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--mk-line); }
  ul.entries .kind { color: var(--mk-muted); font-size: 12px; }
  [role='status'] { min-height: 1.2em; margin: 8px 0; color: var(--mk-muted); }
  [role='status'].error { color: var(--mk-danger); }
  [hidden] { display: none !important; }
`;

/** @type {import('@mosaikit/sdk').MosaikitExtension} */
const extension = {
  activate(context) {
    if (customElements.get(ELEMENT)) {
      return;
    }

    /** Calls the API of the extension; throws with the message of the server when it refuses. */
    async function call(path, init = {}) {
      const response = await context.fetch(API + path, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new Error(body?.message ?? `HTTP ${response.status}`);
      }
      return body;
    }

    class Connections extends HTMLElement {
      connectedCallback() {
        // The shell mounts the app again when the language changes: read it at every mount.
        this.t = translator(context.locale);
        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>${STYLE}</style>
          <header>
            <div>
              <h1></h1>
              <p class="intro"></p>
            </div>
            <button type="button" class="primary new"></button>
          </header>
          <p role="status" aria-live="polite"></p>
          <section class="panel create" aria-labelledby="create-title" hidden>
            <h2 id="create-title"></h2>
            <div class="choose">
              <p class="muted types-label"></p>
              <ul class="types"></ul>
              <p class="muted no-types" hidden></p>
            </div>
            <form class="connect" hidden></form>
          </section>
          <section class="panel problems" aria-labelledby="problems-title" hidden>
            <h2 id="problems-title"></h2>
            <ul></ul>
          </section>
          <div class="table">
            <table>
              <thead><tr><th scope="col" class="c-name"></th><th scope="col" class="c-type"></th><th scope="col" class="c-category"></th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
          <p class="muted empty" hidden></p>
          <section class="panel contents" aria-labelledby="contents-title" hidden>
            <h2 id="contents-title"></h2>
            <nav class="path"><ol></ol></nav>
            <ul class="entries"></ul>
            <p class="muted nothing" hidden></p>
            <div class="actions"><button type="button" class="more"></button><button type="button" class="close"></button></div>
          </section>
          <p class="version"></p>`;
        const t = this.t;
        this.root = root;
        root.querySelector('h1').textContent = t('title');
        root.querySelector('.intro').textContent = t('intro');
        root.querySelector('.version').textContent = t('version', context.extension);
        root.querySelector('button.new').textContent = t('new');
        root.querySelector('#create-title').textContent = t('new');
        root.querySelector('.types-label').textContent = t('types');
        root.querySelector('.no-types').textContent = t('noTypes');
        root.querySelector('#problems-title').textContent = t('refusedTitle');
        root.querySelector('.c-name').textContent = t('columnName');
        root.querySelector('.c-type').textContent = t('columnType');
        root.querySelector('.c-category').textContent = t('columnCategory');
        root.querySelector('.empty').textContent = t('empty');
        root.querySelector('.nothing').textContent = t('contentsEmpty');
        root.querySelector('button.more').textContent = t('more');
        root.querySelector('button.close').textContent = t('close');
        root.querySelector('button.new').addEventListener('click', () => this.openCreate());
        root.querySelector('button.close').addEventListener('click', () => {
          root.querySelector('section.contents').hidden = true;
        });
        root.querySelector('button.more').addEventListener('click', () => this.listMore());
        this.loading = this.load();
      }

      status(text, error = false) {
        const status = this.root.querySelector('[role=status]');
        status.textContent = text;
        status.classList.toggle('error', error);
      }

      /** The connectors and the connections of the organization. */
      async load() {
        try {
          const [connectors, connections] = await Promise.all([call('/connectors'), call('/connections')]);
          this.connectors = connectors.connectors;
          this.renderProblems(connectors.problems);
          this.renderConnections(connections);
        } catch (error) {
          this.status(this.t('failed', { message: error.message }), true);
        }
      }

      connector(type) {
        return (this.connectors ?? []).find((connector) => connector.type === type);
      }

      renderProblems(problems) {
        const section = this.root.querySelector('section.problems');
        const list = section.querySelector('ul');
        list.replaceChildren(
          ...problems.map((problem) => {
            const item = document.createElement('li');
            item.textContent = this.t('refused', problem);
            const detail = document.createElement('div');
            detail.className = 'detail';
            detail.textContent = problem.message;
            item.append(detail);
            return item;
          }),
        );
        section.hidden = problems.length === 0;
      }

      renderConnections(connections) {
        const t = this.t;
        const body = this.root.querySelector('tbody');
        body.replaceChildren(
          ...connections.map((connection) => {
            const row = document.createElement('tr');
            row.dataset.id = connection.id;
            const name = document.createElement('td');
            name.className = 'name';
            const type = document.createElement('td');
            const category = document.createElement('td');
            const connector = connection.available ? this.connector(connection.type) : undefined;
            if (connector) {
              name.append(logo(connector));
              const open = document.createElement('button');
              open.type = 'button';
              open.className = 'link';
              open.textContent = connection.name;
              open.addEventListener('click', () => this.openContents(connection, ''));
              name.append(open);
              type.textContent = titleOf(context.locale, connector);
              category.textContent = categoryName(context.locale, connector.category);
            } else {
              // A connection whose connector is absent is kept as it is: the placeholder of the
              // platform says what is missing (MK-135), and the app which connector brings it back.
              name.append(placeholder(connection, t, context.locale));
              type.textContent = connection.type;
            }
            row.append(name, type, category);
            return row;
          }),
        );
        this.root.querySelector('.empty').hidden = connections.length > 0;
      }

      /** New connection: first the type of source, then its form. */
      async openCreate() {
        // The types are those of the connectors read with the list: wait for them.
        await this.loading;
        const section = this.root.querySelector('section.create');
        section.hidden = false;
        section.querySelector('.choose').hidden = false;
        section.querySelector('form.connect').hidden = true;
        const list = section.querySelector('ul.types');
        const connectors = this.connectors ?? [];
        list.replaceChildren(
          ...connectors.map((connector) => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.type = connector.type;
            const what = document.createElement('span');
            what.className = 'what';
            const title = document.createElement('span');
            title.className = 'type-title';
            title.textContent = titleOf(context.locale, connector);
            const category = document.createElement('span');
            category.className = 'category';
            category.textContent = categoryName(context.locale, connector.category);
            what.append(title, category);
            button.append(logo(connector), what);
            button.addEventListener('click', () => this.openForm(connector));
            item.append(button);
            return item;
          }),
        );
        section.querySelector('.no-types').hidden = connectors.length > 0;
        list.querySelector('button')?.focus();
      }

      /** The connection form that the connector declares, with a name and a credential. */
      openForm(connector) {
        const t = this.t;
        const section = this.root.querySelector('section.create');
        section.querySelector('.choose').hidden = true;
        const form = section.querySelector('form.connect');
        form.hidden = false;
        form.replaceChildren();
        const chosen = document.createElement('div');
        chosen.className = 'chosen';
        chosen.append(logo(connector), document.createTextNode(titleOf(context.locale, connector)));
        form.append(chosen);
        form.append(field(t('name'), input('text', '__name', true)));
        const schema = connector.form ?? {};
        const required = new Set(schema.required ?? []);
        for (const [name, property] of Object.entries(schema.properties ?? {})) {
          const title = property.title ?? name;
          if (property.type === 'boolean') {
            const box = input('checkbox', name, false);
            box.checked = property.default === true;
            const label = document.createElement('label');
            label.className = 'check';
            label.append(box, document.createTextNode(title));
            form.append(label);
            continue;
          }
          let control;
          if (Array.isArray(property.enum)) {
            control = document.createElement('select');
            control.name = name;
            control.required = required.has(name);
            for (const value of property.enum) {
              const option = document.createElement('option');
              option.value = String(value);
              option.textContent = String(value);
              control.append(option);
            }
          } else {
            control = input(property.type === 'string' ? 'text' : 'number', name, required.has(name));
            if (property.type === 'integer') {
              control.step = '1';
            }
          }
          if (property.default !== undefined) {
            control.value = String(property.default);
          }
          form.append(field(required.has(name) ? `${title} (${t('required')})` : title, control, property.description));
        }
        form.append(field(t('credential'), input('text', '__credential', false), t('credentialHint')));
        const actions = document.createElement('div');
        actions.className = 'actions';
        const test = button(t('test'), () => this.test(connector, form));
        const create = button(t('create'), null, 'primary');
        create.type = 'submit';
        const back = button(t('back'), () => this.openCreate());
        const cancel = button(t('cancel'), () => {
          section.hidden = true;
        });
        actions.append(test, create, back, cancel);
        form.append(actions);
        form.onsubmit = (event) => {
          event.preventDefault();
          this.create(connector, form);
        };
        form.querySelector('input')?.focus();
      }

      /** What the form says, as the API takes it. */
      request(connector, form) {
        const settings = {};
        for (const [name, property] of Object.entries(connector.form?.properties ?? {})) {
          const control = form.elements.namedItem(name);
          if (!control) {
            continue;
          }
          if (property.type === 'boolean') {
            settings[name] = control.checked;
          } else if (control.value !== '') {
            settings[name] = property.type === 'string' || Array.isArray(property.enum) ? control.value : Number(control.value);
          }
        }
        return {
          name: form.elements.namedItem('__name').value,
          type: connector.type,
          settings,
          credential: form.elements.namedItem('__credential').value || null,
        };
      }

      async test(connector, form) {
        const t = this.t;
        this.status(t('testing'));
        try {
          const result = await call('/connections/test', {
            method: 'POST',
            body: JSON.stringify(this.request(connector, form)),
          });
          this.status(t(result.success ? 'tested' : 'testFailed', result), !result.success);
        } catch (error) {
          this.status(t('testFailed', { message: error.message }), true);
        }
      }

      async create(connector, form) {
        const t = this.t;
        try {
          const created = await call('/connections', {
            method: 'POST',
            body: JSON.stringify(this.request(connector, form)),
          });
          this.root.querySelector('section.create').hidden = true;
          this.status(t('created', created));
          this.loading = this.load();
          await this.loading;
        } catch (error) {
          this.status(t('failed', { message: error.message }), true);
        }
      }

      /** The contents of a connection at a path, as its connector lists them. */
      async openContents(connection, path) {
        const t = this.t;
        const section = this.root.querySelector('section.contents');
        this.browsing = { connection, path, offset: 0 };
        section.querySelector('#contents-title').textContent = t('contents', connection);
        const crumbs = section.querySelector('nav.path ol');
        const steps = path ? path.split('/') : [];
        crumbs.replaceChildren(
          ...[{ name: t('top'), path: '' }, ...steps.map((name, i) => ({ name, path: steps.slice(0, i + 1).join('/') }))].map(
            (step, i, all) => {
              const item = document.createElement('li');
              if (i === all.length - 1) {
                item.textContent = step.name;
                item.setAttribute('aria-current', 'page');
              } else {
                item.append(button(step.name, () => this.openContents(connection, step.path), 'link'));
              }
              return item;
            },
          ),
        );
        section.querySelector('ul.entries').replaceChildren();
        section.hidden = false;
        await this.listMore();
      }

      async listMore() {
        const { connection, path, offset } = this.browsing;
        const section = this.root.querySelector('section.contents');
        try {
          const page = await call(
            `/connections/${encodeURIComponent(connection.id)}/contents?path=${encodeURIComponent(path)}&offset=${offset}&limit=${PAGE}`,
          );
          const list = section.querySelector('ul.entries');
          for (const entry of page.items) {
            const item = document.createElement('li');
            if (entry.container) {
              item.append(button(entry.name, () => this.openContents(connection, entry.path), 'link'));
            } else {
              const name = document.createElement('span');
              name.textContent = entry.name;
              item.append(name);
            }
            const kind = document.createElement('span');
            kind.className = 'kind';
            kind.textContent = entry.kind;
            item.append(kind);
            list.append(item);
          }
          this.browsing.offset = offset + page.items.length;
          section.querySelector('button.more').hidden = !page.more;
          section.querySelector('.nothing').hidden = list.children.length > 0;
        } catch (error) {
          this.status(this.t('failed', { message: error.message }), true);
        }
      }
    }

    customElements.define(ELEMENT, Connections);
  },
};

/**
 * What stands for a connection whose connector is absent: the placeholder of the platform,
 * <mk-reference-placeholder> (MK-135), where the shell defines it, or one of the app with the same
 * content on a shell without it; under it, the connector that brings the connection back.
 */
function placeholder(connection, t, locale) {
  const absent = document.createElement('div');
  absent.className = 'absent';
  if (customElements.get(PLACEHOLDER)) {
    const element = document.createElement(PLACEHOLDER);
    element.setAttribute('label', connection.name);
    element.setAttribute('locale', String(locale ?? 'en'));
    element.reference = { status: 'extension-absent' };
    absent.append(element);
  } else {
    const box = document.createElement('div');
    box.className = 'box';
    box.setAttribute('role', 'note');
    const label = document.createElement('strong');
    label.textContent = t('unavailableTitle', { name: connection.name });
    const why = document.createElement('span');
    why.textContent = t('unavailableWhy');
    box.append(label, why);
    absent.append(box);
  }
  const detail = document.createElement('span');
  detail.className = 'connector';
  detail.textContent = t('unavailableDetail', { extension: connection.connector });
  absent.append(detail);
  return absent;
}

/** The logo of a connector, an image of its extension. */
function logo(connector) {
  const image = document.createElement('img');
  image.className = 'logo';
  image.src = connector.logo;
  image.alt = '';
  return image;
}

function input(type, name, required) {
  const control = document.createElement('input');
  control.type = type;
  control.name = name;
  control.required = required;
  control.autocomplete = 'off';
  return control;
}

function field(title, control, hint) {
  const label = document.createElement('label');
  const text = document.createElement('span');
  text.textContent = title;
  label.append(text, control);
  if (hint) {
    const help = document.createElement('span');
    help.className = 'hint';
    help.textContent = hint;
    label.append(help);
  }
  return label;
}

function button(text, onClick, className) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  if (onClick) {
    element.addEventListener('click', onClick);
  }
  return element;
}

export default extension;
