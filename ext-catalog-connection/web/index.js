// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { categoryName, contributionText, kindName, titleOf, translator } from './i18n.js';
import { LIST_STYLE, ListPage } from './list.js';
import { generatedThumbnail } from './thumbnail.js';

/**
 * Frontend of the connections (EXT-010): a custom element that the shell renders for /app/connections.
 * It lists the connections of the organization, creates new ones and changes them. The types of source
 * come from the connectors installed, each an extension of its own that implements the contract of the
 * framework (MK-134): the app knows no type. A connection whose connector is absent stays in the list,
 * marked unavailable, and works again when the connector comes back. Styled with the --mk-* tokens of
 * the theme, in the language of the person.
 *
 * Every connection the person views is a card of one grid, with rows next to it, whatever its
 * connector, filtered by the types actually configured (EXT-011); each card shows a thumbnail,
 * uploaded or generated from the name, the description or else the address of the source, and the
 * owner (EXT-015).
 *
 * The contents of a connection come in one shape whatever its connector (EXT-019): pieces with an id,
 * a name, a kind and facts. What each piece can be used for comes from the extensions that consume
 * data: they contribute uses to the point catalog.connection.use (version 1), each with the kinds and
 * the facts it needs, and the app offers on a piece the uses its kind and facts allow, while their
 * extension is active.
 */

const ELEMENT = 'mosaikit-ext-catalog-connection';
const API = '/api/v1/ext/connections';
const PAGE = 100;
/** The placeholder of the platform for what an absent extension provides (MK-135). */
const PLACEHOLDER = 'mk-reference-placeholder';
/** The point to which the extensions that consume data contribute their uses of a piece (EXT-019). */
const USES = 'catalog.connection.use';
/** The columns shown under a piece before the rest is summed up. */
const SHOWN_COLUMNS = 6;
/** The identifier of the extension, which owns the files of the uploaded thumbnails. */
const EXTENSION = 'io.github.mosaikit.ext.catalog.connection';
/** The images a thumbnail may be, as the backend takes them. */
const THUMBNAIL_TYPES = 'image/png,image/jpeg,image/gif,image/webp';

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
  form.connect textarea { font: inherit; padding: 6px 10px; border: 1px solid var(--mk-line); border-radius: var(--mk-radius);
                          background: var(--mk-bg); color: var(--mk-fg); min-height: 3.5em; resize: vertical; }
  textarea:focus-visible { outline: 2px solid var(--mk-focus); outline-offset: 2px; }
  form.connect label { display: grid; gap: 4px; }
  form.connect label.check { display: flex; gap: 8px; align-items: center; }
  form.connect .hint { color: var(--mk-muted); font-size: 12px; }
  form.connect .chosen { display: flex; gap: 8px; align-items: center; font-weight: 600; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .table { overflow-x: auto; }
  article.card { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; background: var(--mk-surface);
                 border: 1px solid var(--mk-line); border-radius: var(--mk-radius); overflow: hidden; }
  .thumb { display: block; background: var(--mk-bg); overflow: hidden; }
  .thumb svg, .thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
  article.card .thumb { aspect-ratio: 2 / 1; border-bottom: 1px solid var(--mk-line); }
  td .thumb { width: 48px; height: 30px; flex: none; border-radius: 4px; }
  article.card .body { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; flex: 1; min-width: 0; }
  article.card h3 { margin: 0; font-size: 15px; overflow-wrap: anywhere; }
  .subtitle { margin: 0; color: var(--mk-muted); font-size: 13px; overflow-wrap: anywhere;
              display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .kind { display: flex; gap: 6px; align-items: center; font-size: 13px; }
  .kind img.logo { width: 18px; height: 18px; }
  article.card footer { display: flex; gap: 8px; align-items: center; justify-content: space-between;
                        padding: 8px 12px; border-top: 1px solid var(--mk-line); font-size: 13px; }
  .owner { color: var(--mk-muted); min-width: 0; overflow-wrap: anywhere; }
  button.small { padding: 2px 10px; font-size: 13px; }
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
  ul.entries > li { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; padding: 6px 0;
                    border-bottom: 1px solid var(--mk-line); }
  ul.entries .kind { color: var(--mk-muted); font-size: 12px; display: inline; }
  ul.entries .columns { flex-basis: 100%; color: var(--mk-muted); font-size: 12px; overflow-wrap: anywhere; }
  ul.uses { list-style: none; display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 0 auto; padding: 0; }
  ul.uses li { font-size: 12px; padding: 1px 8px; border: 1px solid var(--mk-line); border-radius: 999px;
               background: var(--mk-bg); }
  .state { margin: 8px 0; color: var(--mk-muted); }
  .state[data-state='unreachable'] { color: var(--mk-danger); }
  [role='status'] { min-height: 1.2em; margin: 8px 0; color: var(--mk-muted); }
  [role='status'].error { color: var(--mk-danger); }
  [hidden] { display: none !important; }
  article.card { position: relative; }
  article.card > input.select { position: absolute; top: 8px; left: 8px; z-index: 1; width: 18px; height: 18px; margin: 0;
                                accent-color: var(--mk-accent); cursor: pointer; }
  .measures { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; color: var(--mk-muted); font-size: 12px; }
  .status { align-self: flex-start; font-size: 12px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--mk-line); }
  .status[data-status='reachable'] { color: var(--mk-success); border-color: var(--mk-success); }
  .status[data-status='unreachable'], .status[data-status='unavailable'] { color: var(--mk-danger); border-color: var(--mk-danger); }
  td.select, th.select { width: 1%; }
  article.card.opens { cursor: pointer; }
  article.card.opens:hover { border-color: var(--mk-accent); }
  article.card.selected, tr.selected { outline: 2px solid var(--mk-accent); outline-offset: -2px;
                                       background: var(--mk-accent-soft, var(--mk-surface)); }
  aside.detail { position: fixed; top: 0; bottom: 0; right: 0; z-index: 20; box-sizing: border-box;
                 width: min(440px, calc(100vw - 32px)); display: flex; flex-direction: column;
                 background: var(--mk-bg); border-left: 1px solid var(--mk-line); box-shadow: -8px 0 24px rgb(0 0 0 / .18); }
  .detail-head { flex: none; display: flex; gap: 10px; align-items: center; padding: 12px 16px;
                 border-bottom: 1px solid var(--mk-line); }
  .detail-head .thumb { width: 56px; height: 36px; flex: none; border-radius: 4px; }
  .detail-head h2 { flex: 1; min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .detail-head button.close { flex: none; font-size: 18px; line-height: 1; padding: 4px 10px; }
  dl.facts { flex: none; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px;
             margin: 0; padding: 12px 16px; font-size: 13px; }
  dl.facts dt { color: var(--mk-muted); }
  dl.facts dd { margin: 0; overflow-wrap: anywhere; }
  .tags { flex: none; padding: 0 16px 8px; }
  aside.detail section.contents { flex: 1; min-height: 0; display: flex; flex-direction: column;
                                  padding: 8px 16px 0; border-top: 1px solid var(--mk-line); }
  aside.detail h3 { flex: none; font-size: 15px; margin: 4px 0 8px; }
  aside.detail nav.path { flex: none; }
  .parts { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 8px; }
  .parts button.more { margin-top: 8px; }
  footer.detail-actions { flex: none; padding: 12px 16px; border-top: 1px solid var(--mk-line); background: var(--mk-surface); }
${LIST_STYLE}`;

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
          <div class="list"></div>
          <aside class="detail" id="detail" hidden>
            <header class="detail-head">
              <span class="detail-thumb"></span>
              <h2 id="detail-title" tabindex="-1"></h2>
              <button type="button" class="close"></button>
            </header>
            <dl class="facts"></dl>
            <div class="tags" data-slot="tags" hidden></div>
            <section class="contents" aria-labelledby="contents-title">
              <h3 id="contents-title"></h3>
              <nav class="path"><ol></ol></nav>
              <div class="parts">
                <ul class="entries"></ul>
                <p class="state" role="note" hidden></p>
                <button type="button" class="more"></button>
              </div>
            </section>
            <footer class="detail-actions actions" role="group"></footer>
          </aside>
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
        this.thumbnails = new Map();
        this.list = new ListPage(root.querySelector('.list'), {
          key: (connection) => connection.id,
          facets: [{ id: 'type', title: t('facetType'), values: (connection) => [{ value: connection.type, label: this.typeTitle(connection) }] }],
          card: (connection) => this.card(connection),
          rendered: () => this.refreshSelection(),
          // Most recent first by default, then by name (EXT-014).
          sorts: [
            { id: 'recent', title: t('sortRecent'), compare: (a, b) => time(b.updated) - time(a.updated) || byName(a, b) },
            { id: 'name', title: t('sortName'), compare: byName },
          ],
          columns: [
            { title: t('columnName'), className: 'name', cell: (connection) => this.nameCell(connection) },
            { title: t('columnDescription'), cell: (connection) => subtitle(connection) },
            { title: t('columnType'), cell: (connection) => this.kind(connection) },
            { title: t('columnCategory'), cell: (connection) => this.categoryOf(connection) },
            { title: t('columnSize'), cell: (connection) => this.size(connection) },
            { title: t('columnUpdated'), cell: (connection) => this.updated(connection) },
            { title: t('columnStatus'), cell: (connection) => this.state(connection) },
            { title: t('columnOwner'), cell: (connection) => this.ownerOf(connection) },
            { title: t('columnActions'), cell: (connection) => this.actions(connection) },
          ],
          labels: {
            count: (count) => t(count === 1 ? 'countOne' : 'count', { count }),
            selected: (count) => t(count === 1 ? 'selectedOne' : 'selected', { count }),
            clearSelection: t('clearSelection'),
            select: (connection) => t('select', connection),
            sort: t('sortBy'),
            view: t('view'),
            grid: t('grid'),
            rows: t('rows'),
            filters: t('filters'),
            noMatch: t('noMatch'),
            empty: t('empty'),
            none: t('noTypesConfigured'),
          },
        });
        root.querySelector('button.more').textContent = t('more');
        const close = root.querySelector('aside.detail button.close');
        close.textContent = '×';
        close.setAttribute('aria-label', t('closeDetail'));
        close.addEventListener('click', () => this.closeDetail(true));
        root.querySelector('button.new').addEventListener('click', () => this.openCreate());
        root.querySelector('button.more').addEventListener('click', () => this.listMore());
        // The detail closes with a click outside it, other than on a card, and with Escape (EXT-016).
        this.outside = (event) => {
          const path = event.composedPath();
          const detail = root.querySelector('aside.detail');
          if (!this.selected || path.includes(detail) || path.some((node) => node?.dataset?.opens === 'detail')) {
            return;
          }
          this.closeDetail(false);
        };
        this.escape = (event) => {
          if (event.key === 'Escape' && this.selected) {
            this.closeDetail(true);
          }
        };
        this.placeDetail = () => this.place();
        document.addEventListener('click', this.outside);
        document.addEventListener('keydown', this.escape);
        window.addEventListener('resize', this.placeDetail);
        this.selected = null;
        this.loading = this.load();
      }

      disconnectedCallback() {
        document.removeEventListener('click', this.outside);
        document.removeEventListener('keydown', this.escape);
        window.removeEventListener('resize', this.placeDetail);
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

      /** Every connection the person views, as cards or rows, filtered by type (EXT-011). */
      renderConnections(connections) {
        this.connections = connections;
        this.list.setItems(connections);
        // The detail open stays open with what was read again, or closes when the connection is gone.
        if (this.selected) {
          const current = connections.find((connection) => connection.id === this.selected);
          if (current && this.connectorOf(current)) {
            this.renderFacts(current);
            this.renderDetailActions(current);
          } else {
            this.closeDetail(false);
          }
        }
      }

      /** The connector of a connection when it is active. */
      connectorOf(connection) {
        return connection.available ? this.connector(connection.type) : undefined;
      }

      /** The title of the type of a connection, as its connector declares it, or the type itself. */
      typeTitle(connection) {
        const connector = this.connectorOf(connection);
        return connector ? titleOf(context.locale, connector) : connection.type;
      }

      categoryOf(connection) {
        const connector = this.connectorOf(connection);
        return connector ? categoryName(context.locale, connector.category) : '';
      }

      /**
       * The card of a connection: a selection box, thumbnail, name, description or address, type, its
       * size, last update and status (EXT-014), and a footer with the owner and the commands.
       */
      card(connection) {
        const t = this.t;
        const card = document.createElement('article');
        card.className = 'card';
        card.dataset.id = connection.id;
        card.setAttribute('aria-label', connection.name);
        const body = document.createElement('div');
        body.className = 'body';
        const connector = this.connectorOf(connection);
        if (connector) {
          // The whole card opens the detail (EXT-016); its name is the button that keyboards reach.
          const title = document.createElement('h3');
          title.append(this.opener(connection));
          body.append(title, subtitle(connection));
          card.dataset.opens = 'detail';
          card.classList.add('opens');
          card.addEventListener('click', (event) => {
            const path = event.composedPath();
            if (!path.some((node) => node instanceof HTMLElement && (node.classList.contains('actions') || node.classList.contains('select')))) {
              this.toggleDetail(connection);
            }
          });
          this.markSelected(card, connection);
        } else {
          // A connection whose connector is absent is kept as it is: the placeholder of the
          // platform says what is missing (MK-135), and the app which connector brings it back.
          body.append(placeholder(connection, t, context.locale), subtitle(connection));
        }
        body.append(this.kind(connection));
        const measures = document.createElement('p');
        measures.className = 'measures';
        measures.append(this.size(connection), this.updated(connection));
        body.append(measures, this.state(connection));
        const footer = document.createElement('footer');
        footer.append(this.ownerOf(connection), this.actions(connection));
        card.append(this.list.selectionBox(connection), this.thumbnail(connection), body, footer);
        return card;
      }

      /**
       * How big the source of a connection is (EXT-014): the pieces at its top level as last listed, or
       * that it was not listed yet.
       */
      size(connection) {
        const size = document.createElement('span');
        size.className = 'size';
        const pieces = connection.pieces;
        if (pieces === null || pieces === undefined) {
          size.dataset.pieces = '';
          size.textContent = this.t('sizeUnknown');
        } else {
          size.dataset.pieces = String(pieces);
          size.textContent = connection.morePieces
            ? this.t('piecesMore', { count: pieces })
            : this.t(pieces === 1 ? 'pieceOne' : 'pieces', { count: pieces });
        }
        return size;
      }

      /** How fresh a connection is (EXT-014): when it was last changed, relative to now. */
      updated(connection) {
        const updated = document.createElement('time');
        updated.className = 'updated';
        const when = connection.updated ?? connection.created;
        updated.dateTime = when ?? '';
        updated.textContent = this.t('updated', { when: relative(when, context.locale) });
        if (when) {
          updated.title = new Date(when).toLocaleString(context.locale);
        }
        return updated;
      }

      /**
       * The status of a connection (EXT-014): unavailable when its connector is absent, otherwise the
       * state of its source at the last test or listing, or not checked yet.
       */
      state(connection) {
        const state = document.createElement('span');
        state.className = 'status';
        const value = !connection.available ? 'unavailable' : (connection.state ?? 'unchecked');
        state.dataset.status = value;
        state.textContent = this.t(STATUS_MESSAGES[value] ?? 'statusUnchecked');
        if (connection.checked) {
          state.title = this.t('checked', { when: new Date(connection.checked).toLocaleString(context.locale) });
        }
        return state;
      }

      /** The name of a connection as the button that opens and closes its detail (EXT-016). */
      opener(connection) {
        const opener = button(connection.name, null, 'link');
        opener.setAttribute('aria-controls', 'detail');
        opener.setAttribute('aria-expanded', String(this.selected === connection.id));
        return opener;
      }

      /** Marks the card or row of the connection whose detail is open, for the eye and for assistive technologies. */
      markSelected(element, connection) {
        const selected = this.selected === connection.id;
        element.classList.toggle('selected', selected);
        if (selected) {
          element.setAttribute('aria-current', 'true');
        } else {
          element.removeAttribute('aria-current');
        }
      }

      /** The marks of the selection on the cards and rows drawn, after the list or the selection changes. */
      refreshSelection() {
        const list = this.root.querySelector('.list');
        for (const element of list.querySelectorAll('article.card[data-id], tr[data-id]')) {
          this.markSelected(element, { id: element.dataset.id });
          element.querySelector('button[aria-controls="detail"]')?.setAttribute('aria-expanded', String(this.selected === element.dataset.id));
        }
      }

      /** Clicking a card opens its detail, clicking it again closes it, another card shows its own. */
      toggleDetail(connection) {
        if (this.selected === connection.id) {
          this.closeDetail(false);
        } else {
          this.openDetail(connection);
        }
      }

      /**
       * The detail of a connection, a panel over the list on its right edge, so that the cards do not
       * move (EXT-016): a header with the name, the facts and the tags that stay in place, the pieces
       * of the connection that scroll, and the actions fixed at the bottom.
       */
      openDetail(connection) {
        const detail = this.root.querySelector('aside.detail');
        this.selected = connection.id;
        detail.dataset.id = connection.id;
        detail.setAttribute('aria-label', this.t('detail', connection));
        detail.querySelector('.detail-thumb').replaceChildren(this.thumbnail(connection));
        detail.querySelector('#detail-title').textContent = connection.name;
        this.renderFacts(connection);
        this.renderDetailActions(connection);
        detail.hidden = false;
        this.place();
        this.refreshSelection();
        this.openContents(connection, []);
      }

      /** Closes the detail; with `focus`, the keyboard goes back to the card it came from. */
      closeDetail(focus) {
        const id = this.selected;
        if (!id) {
          return;
        }
        this.selected = null;
        this.browsing = null;
        this.root.querySelector('aside.detail').hidden = true;
        this.refreshSelection();
        if (focus) {
          this.root.querySelector(`.list [data-id="${CSS.escape(id)}"] button[aria-controls="detail"]`)?.focus();
        }
      }

      /**
       * Places the detail on the right edge of the area where the shell shows the app, over it and as
       * high as it: the nearest ancestor that scrolls, through the shadow roots, or the window.
       */
      place() {
        const detail = this.root.querySelector('aside.detail');
        if (detail.hidden) {
          return;
        }
        let node = this;
        let area = null;
        while (node && !area) {
          node = node.parentElement ?? node.getRootNode?.()?.host ?? null;
          if (node instanceof Element && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) {
            area = node;
          }
        }
        const box = area?.getBoundingClientRect();
        detail.style.top = `${Math.max(0, box?.top ?? 0)}px`;
        detail.style.bottom = `${Math.max(0, box ? window.innerHeight - box.bottom : 0)}px`;
        detail.style.right = `${Math.max(0, box ? window.innerWidth - box.right : 0)}px`;
      }

      /** The facts of a connection in its detail: type, category, description, address, owner, and the slot of its tags. */
      renderFacts(connection) {
        const t = this.t;
        const facts = this.root.querySelector('aside.detail dl.facts');
        const rows = [
          ['type', t('factType'), this.kind(connection)],
          ['category', t('factCategory'), this.categoryOf(connection)],
          ['description', t('factDescription'), connection.description],
          ['address', t('factAddress'), connection.address],
          ['owner', t('factOwner'), connection.owner ? connection.owner.name ?? t('formerMember') : t('ownerOrganization')],
        ];
        facts.replaceChildren(
          ...rows
            .filter(([, , value]) => value)
            .flatMap(([fact, term, value]) => {
              const name = document.createElement('dt');
              name.textContent = term;
              const text = document.createElement('dd');
              text.dataset.fact = fact;
              text.append(value);
              return [name, text];
            }),
        );
        // The tags of the connection come with the tags of the platform (EXT-012 on MK-097): until then
        // their place in the detail stays empty and hidden.
        const tags = this.root.querySelector('aside.detail .tags');
        tags.setAttribute('aria-label', t('factTags'));
      }

      /** The actions on a connection, fixed at the bottom of its detail. */
      renderDetailActions(connection) {
        const t = this.t;
        const footer = this.root.querySelector('aside.detail footer.detail-actions');
        footer.setAttribute('aria-label', t('detailActions', connection));
        const actions = [button(t('test'), () => this.testSaved(connection))];
        if (connection.editable) {
          actions.unshift(
            button(t('edit'), () => {
              this.closeDetail(false);
              this.openEdit(connection);
            }, 'primary'),
          );
        }
        footer.replaceChildren(...actions);
      }

      /**
       * Reads a connection again, after a test or a listing changed what its card says of its source
       * (EXT-014).
       */
      async refresh(id) {
        try {
          const fresh = await call(`/connections/${encodeURIComponent(id)}`);
          this.renderConnections((this.connections ?? []).map((connection) => (connection.id === id ? fresh : connection)));
        } catch {
          // The card keeps what it said; the next load reads it again.
        }
      }

      /** Tests a saved connection with its settings and credential. */
      async testSaved(connection) {
        const t = this.t;
        this.status(t('testing'));
        try {
          const result = await call(`/connections/${encodeURIComponent(connection.id)}/test`, { method: 'POST' });
          this.status(t(result.success ? 'tested' : 'testFailed', result), !result.success);
          await this.refresh(connection.id);
        } catch (error) {
          this.status(t('testFailed', { message: error.message }), true);
        }
      }

      /** The name of a connection in its row, with its thumbnail. */
      nameCell(connection) {
        const cell = document.createElement('div');
        cell.className = 'kind';
        cell.append(this.thumbnail(connection));
        if (this.connectorOf(connection)) {
          const opener = this.opener(connection);
          opener.dataset.opens = 'detail';
          opener.addEventListener('click', () => this.toggleDetail(connection));
          cell.append(opener);
        } else {
          cell.append(placeholder(connection, this.t, context.locale));
        }
        return cell;
      }

      /** The type of a connection, with the logo of its connector when it is active. */
      kind(connection) {
        const kind = document.createElement('span');
        kind.className = 'kind type';
        const connector = this.connectorOf(connection);
        if (connector) {
          kind.append(logo(connector));
        }
        const text = document.createElement('span');
        text.textContent = this.typeTitle(connection);
        kind.append(text);
        return kind;
      }

      /** The owner of a connection, as the kernel keeps it (EXT-015). */
      ownerOf(connection) {
        const owner = document.createElement('span');
        owner.className = 'owner';
        owner.textContent = connection.owner
          ? this.t('owner', { name: connection.owner.name ?? this.t('formerMember') })
          : this.t('ownerOrganization');
        return owner;
      }

      /** The commands on a connection that the person may give. */
      actions(connection) {
        const actions = document.createElement('span');
        actions.className = 'actions';
        if (connection.editable && this.connectorOf(connection)) {
          const edit = button(this.t('edit'), () => this.openEdit(connection), 'small');
          edit.setAttribute('aria-label', this.t('editNamed', connection));
          actions.append(edit);
        }
        return actions;
      }

      /**
       * The thumbnail of a connection: the image uploaded for it, or one generated from its name, so
       * that connections of one type do not look alike.
       */
      thumbnail(connection) {
        const frame = document.createElement('span');
        frame.className = 'thumb';
        if (!connection.thumbnail) {
          frame.dataset.thumbnail = 'generated';
          frame.append(generatedThumbnail(connection.name));
          return frame;
        }
        frame.dataset.thumbnail = 'uploaded';
        const image = document.createElement('img');
        image.alt = '';
        frame.append(image);
        this.thumbnailUrl(connection.thumbnail)
          .then((url) => {
            image.src = url;
          })
          .catch(() => {
            // Not readable: the generated thumbnail instead.
            frame.dataset.thumbnail = 'generated';
            frame.replaceChildren(generatedThumbnail(connection.name));
          });
        return frame;
      }

      /**
       * The address of an uploaded thumbnail: a signed link of the file service to the file (MK-093),
       * asked once for this page. An image of the page loads it without the session of the person,
       * from the origin of the installation, as its security policy allows.
       */
      thumbnailUrl(file) {
        if (!this.thumbnails.has(file)) {
          this.thumbnails.set(
            file,
            context
              .fetch(`/api/v1/files/${EXTENSION}/links`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ file }),
              })
              .then(async (response) => {
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
                }
                return (await response.json()).url;
              }),
          );
        }
        return this.thumbnails.get(file);
      }

      /** New connection: first the type of source, then its form. */
      async openCreate() {
        // The types are those of the connectors read with the list: wait for them.
        await this.loading;
        const section = this.root.querySelector('section.create');
        section.hidden = false;
        section.querySelector('#create-title').textContent = this.t('new');
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

      /** Edit: the form of the connector of a connection, with its values (EXT-015). */
      async openEdit(connection) {
        await this.loading;
        const connector = this.connectorOf(connection);
        if (!connector) {
          return;
        }
        const section = this.root.querySelector('section.create');
        section.hidden = false;
        section.querySelector('#create-title').textContent = this.t('editNamed', connection);
        this.openForm(connector, connection);
        section.scrollIntoView?.({ block: 'nearest' });
      }

      /**
       * The connection form that the connector declares, with a name, a description right under it, a
       * credential and a thumbnail; empty for a new connection, with the values of one to edit.
       */
      openForm(connector, connection = null) {
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
        const name = input('text', '__name', true);
        name.value = connection?.name ?? '';
        form.append(field(t('name'), name));
        const description = document.createElement('textarea');
        description.name = '__description';
        description.rows = 2;
        description.maxLength = 1000;
        description.value = connection?.description ?? '';
        form.append(field(t('description'), description, t('descriptionHint')));
        const values = connection?.settings ?? {};
        const schema = connector.form ?? {};
        const required = new Set(schema.required ?? []);
        for (const [name, property] of Object.entries(schema.properties ?? {})) {
          const title = property.title ?? name;
          if (property.type === 'boolean') {
            const box = input('checkbox', name, false);
            box.checked = Object.hasOwn(values, name) ? values[name] === true : property.default === true;
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
          if (Object.hasOwn(values, name)) {
            control.value = String(values[name]);
          } else if (property.default !== undefined) {
            control.value = String(property.default);
          }
          form.append(field(required.has(name) ? `${title} (${t('required')})` : title, control, property.description));
        }
        const credential = input('text', '__credential', false);
        credential.value = connection?.credential ?? '';
        form.append(field(t('credential'), credential, t('credentialHint')));
        const image = input('file', '__thumbnail', false);
        image.accept = THUMBNAIL_TYPES;
        form.append(field(t('thumbnail'), image, t('thumbnailHint')));
        if (connection?.thumbnail) {
          const remove = input('checkbox', '__removeThumbnail', false);
          const label = document.createElement('label');
          label.className = 'check';
          label.append(remove, document.createTextNode(t('removeThumbnail')));
          form.append(label);
        }
        const actions = document.createElement('div');
        actions.className = 'actions';
        const test = button(t('test'), () => this.test(connector, form));
        const submit = button(t(connection ? 'save' : 'create'), null, 'primary');
        submit.type = 'submit';
        const cancel = button(t('cancel'), () => {
          section.hidden = true;
        });
        if (connection) {
          actions.append(test, submit, cancel);
        } else {
          actions.append(test, submit, button(t('back'), () => this.openCreate()), cancel);
        }
        form.append(actions);
        form.onsubmit = (event) => {
          event.preventDefault();
          if (connection) {
            this.save(connector, connection, form);
          } else {
            this.create(connector, form);
          }
        };
        name.focus();
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
          // Empty clears it (EXT-015).
          description: form.elements.namedItem('__description').value,
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
          await this.saveThumbnail(created, form);
          this.root.querySelector('section.create').hidden = true;
          this.status(t('created', created));
          this.loading = this.load();
          await this.loading;
        } catch (error) {
          this.status(t('failed', { message: error.message }), true);
        }
      }

      /** Saves the changes of a connection; its type never changes. */
      async save(connector, connection, form) {
        const t = this.t;
        try {
          const { name, description, settings, credential } = this.request(connector, form);
          const saved = await call(`/connections/${encodeURIComponent(connection.id)}`, {
            method: 'PUT',
            body: JSON.stringify({ name, description, settings, credential }),
          });
          await this.saveThumbnail(saved, form);
          this.root.querySelector('section.create').hidden = true;
          this.status(t('saved', saved));
          this.loading = this.load();
          await this.loading;
        } catch (error) {
          this.status(t('failed', { message: error.message }), true);
        }
      }

      /** Uploads the image chosen in the form as the thumbnail of a connection, or removes it. */
      async saveThumbnail(connection, form) {
        const file = form.elements.namedItem('__thumbnail')?.files?.[0];
        const path = `/connections/${encodeURIComponent(connection.id)}/thumbnail`;
        if (file) {
          await call(path, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
        } else if (form.elements.namedItem('__removeThumbnail')?.checked) {
          await call(path, { method: 'DELETE' });
        }
      }

      /**
       * The pieces of a connection (EXT-019), as its connector lists them: the top level with an empty
       * trail, then what the last container of the trail holds. The trail is the containers opened, by
       * id and name: ids are the connector's, never split by the app.
       */
      async openContents(connection, trail = []) {
        const t = this.t;
        const section = this.root.querySelector('section.contents');
        this.browsing = { connection, trail, offset: 0 };
        section.querySelector('#contents-title').textContent = t('contents', connection);
        const crumbs = section.querySelector('nav.path ol');
        crumbs.replaceChildren(
          ...[{ name: t('top') }, ...trail].map((step, i, all) => {
            const item = document.createElement('li');
            if (i === all.length - 1) {
              item.textContent = step.name;
              item.setAttribute('aria-current', 'page');
            } else {
              item.append(button(step.name, () => this.openContents(connection, trail.slice(0, i)), 'link'));
            }
            return item;
          }),
        );
        section.querySelector('ul.entries').replaceChildren();
        const state = section.querySelector('.state');
        state.hidden = true;
        state.removeAttribute('data-state');
        section.querySelector('button.more').hidden = true;
        section.querySelector('.parts').scrollTop = 0;
        await this.listMore();
      }

      async listMore() {
        const t = this.t;
        const browsing = this.browsing;
        if (!browsing) {
          return;
        }
        const { connection, trail, offset } = browsing;
        const parent = trail.at(-1)?.id ?? '';
        const section = this.root.querySelector('section.contents');
        try {
          const page = await call(
            `/connections/${encodeURIComponent(connection.id)}/contents?parent=${encodeURIComponent(parent)}&offset=${offset}&limit=${PAGE}`,
          );
          if (this.browsing !== browsing) {
            // Another connection or container was opened meanwhile.
            return;
          }
          const state = section.querySelector('.state');
          if (page.state !== 'listed') {
            // Never an empty list: why there is nothing, in the words of each case.
            state.dataset.state = page.state;
            state.textContent = t(STATE_MESSAGES[page.state] ?? 'contentsEmpty', { detail: page.detail ?? '' }).trim();
            state.hidden = false;
          }
          const uses = usesContributed(context);
          const list = section.querySelector('ul.entries');
          for (const piece of page.items) {
            list.append(this.pieceItem(connection, trail, piece, uses));
          }
          browsing.offset = offset + page.items.length;
          if (trail.length === 0 && offset === 0) {
            // The listing measured the source: its card says so (EXT-014).
            this.refresh(connection.id);
          }
          section.querySelector('button.more').hidden = !page.more;
        } catch (error) {
          this.status(t('failed', { message: error.message }), true);
        }
      }

      /** A piece: its name (which opens it when it is a container), its kind, its uses and its columns. */
      pieceItem(connection, trail, piece, uses) {
        const t = this.t;
        const item = document.createElement('li');
        item.dataset.id = piece.id;
        item.dataset.kind = piece.kind;
        if (piece.container) {
          item.append(button(piece.name, () => this.openContents(connection, [...trail, { id: piece.id, name: piece.name }]), 'link name'));
        } else {
          const name = document.createElement('span');
          name.className = 'name';
          name.textContent = piece.name;
          item.append(name);
        }
        const kind = document.createElement('span');
        kind.className = 'kind';
        kind.textContent = kindName(context.locale, piece.kind);
        item.append(kind);
        const offered = uses.filter((use) => allows(use, piece));
        if (offered.length > 0) {
          const list = document.createElement('ul');
          list.className = 'uses';
          list.setAttribute('aria-label', t('uses', { name: piece.name }));
          list.append(
            ...offered.map((use) => {
              const entry = document.createElement('li');
              entry.dataset.use = `${use.extensionId}/${use.id}`;
              entry.textContent = contributionText(use, 'title', context.locale) ?? use.id;
              const description = contributionText(use, 'description', context.locale);
              if (description) {
                entry.title = description;
              }
              return entry;
            }),
          );
          item.append(list);
        }
        const columns = Array.isArray(piece.facts?.columns) ? piece.facts.columns : [];
        if (columns.length > 0) {
          const line = document.createElement('span');
          line.className = 'columns';
          const shown = columns.slice(0, SHOWN_COLUMNS).map((column) => `${column.name} ${column.type ?? ''}`.trim());
          if (columns.length > SHOWN_COLUMNS) {
            shown.push(t('moreColumns', { count: columns.length - SHOWN_COLUMNS }));
          }
          line.textContent = t('columns', { list: shown.join(', ') });
          item.append(line);
        }
        return item;
      }
    }

    customElements.define(ELEMENT, Connections);
  },
};

/** The text of each status of a connection on its card (EXT-014). */
const STATUS_MESSAGES = {
  reachable: 'statusReachable',
  unreachable: 'statusUnreachable',
  unchecked: 'statusUnchecked',
  unavailable: 'statusUnavailable',
};

/** The time of an instant of the API, 0 when there is none. */
function time(instant) {
  const value = instant ? Date.parse(instant) : NaN;
  return Number.isNaN(value) ? 0 : value;
}

/** The order of connections by name, in any case. */
function byName(a, b) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** An instant relative to now in the language of the locale, such as 5 minutes ago or yesterday. */
function relative(instant, locale) {
  const seconds = (time(instant) - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale ?? 'en', { numeric: 'auto' });
  for (const [unit, size] of [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60]]) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, 'second');
}

/** The message of each state of a listing that has nothing to show (EXT-019). */
const STATE_MESSAGES = {
  empty: 'contentsEmpty',
  unreachable: 'contentsUnreachable',
  'needs-declaration': 'contentsNeedsDeclaration',
  'not-readable': 'contentsNotReadable',
};

/**
 * The uses that the active extensions contribute (EXT-019), each with the kinds of pieces it takes and
 * the facts it needs; a contribution without kinds is ignored. The shell gives only the contributions
 * of the extensions active in the organization, so the use of a removed one is not offered.
 */
function usesContributed(context) {
  return (context.contributionsTo?.(USES) ?? []).filter(
    (use) => Array.isArray(use.attributes?.kinds) && use.attributes.kinds.length > 0,
  );
}

/** Whether a use takes a piece: one of its kinds, and every fact it needs, present and not empty. */
function allows(use, piece) {
  const { kinds, facts = [] } = use.attributes;
  if (!kinds.includes(piece.kind)) {
    return false;
  }
  return facts.every((fact) => {
    const value = piece.facts?.[fact];
    return value !== undefined && value !== null && value !== false && !(Array.isArray(value) && value.length === 0);
  });
}

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

/**
 * What a connection says under its name (EXT-015): its description, or the address of its source when
 * it has none.
 */
function subtitle(connection) {
  const text = document.createElement('p');
  text.className = 'subtitle';
  text.textContent = connection.description || connection.address || '';
  if (text.textContent) {
    text.title = text.textContent;
  }
  return text;
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
