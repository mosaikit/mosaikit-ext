// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { SPLIT_STYLE, splitPane } from './split.js';

/**
 * A list page with the shape of the other list pages of the platform (EXT-011, EXT-014): a header with
 * the number of items shown, the number selected, the order and a switch between a grid of cards and
 * rows, a column of facets that filters
 * instead of navigating, each value with the number of items it matches, which the person widens by
 * dragging its edge or with the keyboard (EXT-026), and the items. It knows
 * nothing of connections: the page gives the facets, the card and the columns. When the list page of
 * the UI kit of the platform is available, it takes the place of this module with the same inputs.
 */

/** The styles of the list page, with the --mk-* tokens of the theme. */
export const LIST_STYLE = `
  .list-head { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; margin: 16px 0 8px; }
  .list-head .count { color: var(--mk-muted); font-size: 13px; }
  .list-head .title { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
  .list-head .tools { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
  .list-head .selection { display: flex; gap: 8px; align-items: center; font-size: 13px; font-weight: 600; color: var(--mk-accent); }
  .list-head label.sort { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--mk-muted); }
  .list-head label.sort select { min-width: 0; }
  .switch { display: inline-flex; border: 1px solid var(--mk-line); border-radius: var(--mk-radius); overflow: hidden; }
  .switch button { border: 0; border-radius: 0; }
  .switch button[aria-pressed='true'] { background: var(--mk-accent); color: var(--mk-accent-fg); }
  .list-body { min-width: 0; }
  .list-body .facets { padding-right: 14px; }
  .list-body .items { padding-left: 14px; min-width: 0; }
  @media (max-width: 720px) {
    .list-body > mk-split-pane, .list-body > .split { flex-direction: column; }
    .list-body > mk-split-pane::part(handle), .list-body > .split > .split-handle { display: none; }
    .list-body > mk-split-pane::part(pane), .list-body > .split > .split-pane { width: auto !important; }
    .list-body .facets, .list-body .items { padding: 0; }
    .list-body .facets { margin-bottom: 16px; }
  }
  .facets { display: grid; gap: 16px; }
  .facet h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--mk-muted); margin: 0 0 6px; }
  .facet ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .facet label { display: flex; gap: 8px; align-items: center; padding: 4px 6px; border-radius: var(--mk-radius); cursor: pointer; }
  .facet label:hover { background: var(--mk-surface); }
  .facet .value { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .facet .number { color: var(--mk-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .facet .none { color: var(--mk-muted); font-size: 13px; }
  ul.cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
  ul.cards > li { min-width: 0; }
${SPLIT_STYLE}`;

/**
 * A list page in an element.
 *
 * @param {HTMLElement} container where the list page is drawn
 * @param {object} options
 * @param {(item: object) => string} options.key the identifier of an item
 * @param {{ id: string, title: string, none?: string, values: (item: object) => { value: string, label: string }[] }[]} options.facets
 *     the facets: a value is chosen among those of the items, several values of one facet add up, two
 *     facets narrow each other
 * @param {(item: object) => HTMLElement} options.card the card of an item in the grid
 * @param {{ title: string, cell: (item: object) => Node | string }[]} options.columns the columns of the rows
 * @param {{ id: string, title: string, compare: (a: object, b: object) => number }[]} options.sorts the
 *     orders the person chooses among, the first one by default
 * @param {object} options.labels the texts: count(n), selected(n), clearSelection, select(item), sort,
 *     view, grid, rows, filters, noMatch, empty, none
 * @param {() => void} [options.rendered] called after each drawing of the items, such as to mark the selected one
 * @param {boolean} [options.selectable] whether the items have selection boxes, true by default
 * @param {{ name: string, label: string }} [options.pane] the name under which the browser keeps the width
 *     of the column of facets, and the label of its handle; labels.resize by default
 */
export class ListPage {
  constructor(container, options) {
    this.options = options;
    this.items = [];
    this.view = 'grid';
    this.sort = options.sorts[0].id;
    /** The keys of the items selected with their boxes. */
    this.selected = new Set();
    /** The values chosen in each facet. */
    this.chosen = new Map(options.facets.map((facet) => [facet.id, new Set()]));
    const { labels } = options;
    container.replaceChildren();
    const head = document.createElement('div');
    head.className = 'list-head';
    this.count = document.createElement('span');
    this.count.className = 'count';
    const views = document.createElement('div');
    views.className = 'switch';
    views.setAttribute('role', 'group');
    views.setAttribute('aria-label', labels.view);
    this.switches = ['grid', 'rows'].map((view) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.view = view;
      button.textContent = labels[view];
      button.addEventListener('click', () => {
        this.view = view;
        this.render();
      });
      views.append(button);
      return button;
    });
    const sort = document.createElement('label');
    sort.className = 'sort';
    sort.append(document.createTextNode(labels.sort));
    this.sorter = document.createElement('select');
    this.sorter.name = 'sort';
    for (const order of options.sorts) {
      const option = document.createElement('option');
      option.value = order.id;
      option.textContent = order.title;
      this.sorter.append(option);
    }
    this.sorter.addEventListener('change', () => {
      this.sort = this.sorter.value;
      this.render();
    });
    sort.append(this.sorter);
    this.selection = document.createElement('div');
    this.selection.className = 'selection';
    this.selection.setAttribute('role', 'group');
    this.selectedCount = document.createElement('span');
    this.selectedCount.className = 'selected-count';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'clear';
    clear.textContent = labels.clearSelection;
    clear.addEventListener('click', () => {
      this.selected.clear();
      this.render();
    });
    this.selection.append(this.selectedCount, clear);
    const title = document.createElement('div');
    title.className = 'title';
    title.append(this.count, this.selection);
    const tools = document.createElement('div');
    tools.className = 'tools';
    tools.append(sort, views);
    head.append(title, tools);
    const body = document.createElement('div');
    body.className = 'list-body';
    this.facets = document.createElement('aside');
    this.facets.className = 'facets';
    this.facets.setAttribute('aria-label', labels.filters);
    this.shown = document.createElement('div');
    this.shown.className = 'items';
    // The column of facets is as wide as the person makes it, by dragging or with the keyboard (EXT-026).
    body.append(
      splitPane(this.facets, this.shown, {
        name: options.pane?.name ?? 'connections.filters',
        label: options.pane?.label ?? labels.resize ?? labels.filters,
        width: 220,
        min: 160,
        max: 480,
      }),
    );
    container.append(head, body);
  }

  /** Shows these items, keeping the chosen values and the selected items that are still among them. */
  setItems(items) {
    this.items = items;
    const keys = new Set(items.map((item) => this.options.key(item)));
    for (const key of [...this.selected]) {
      if (!keys.has(key)) {
        this.selected.delete(key);
      }
    }
    for (const facet of this.options.facets) {
      const present = new Set(items.flatMap((item) => facet.values(item).map((value) => value.value)));
      const chosen = this.chosen.get(facet.id);
      for (const value of [...chosen]) {
        if (!present.has(value)) {
          chosen.delete(value);
        }
      }
    }
    this.render();
  }

  /** Whether an item has one of the chosen values of each facet, leaving one facet out. */
  matches(item, except) {
    return this.options.facets.every((facet) => {
      const chosen = this.chosen.get(facet.id);
      return facet.id === except || chosen.size === 0 || facet.values(item).some((value) => chosen.has(value.value));
    });
  }

  /** The items the chosen values let through, in the order chosen. */
  filtered() {
    const order = this.options.sorts.find((sort) => sort.id === this.sort) ?? this.options.sorts[0];
    return this.items.filter((item) => this.matches(item)).sort(order.compare);
  }

  /**
   * The selection box of an item, for its card or its row: checking it adds the item to the selection,
   * which the header counts.
   */
  selectionBox(item) {
    if (this.options.selectable === false) {
      return document.createTextNode('');
    }
    const key = this.options.key(item);
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'select';
    box.checked = this.selected.has(key);
    box.setAttribute('aria-label', this.options.labels.select(item));
    box.addEventListener('change', () => {
      if (box.checked) {
        this.selected.add(key);
      } else {
        this.selected.delete(key);
      }
      this.renderSelection();
    });
    return box;
  }

  /** The number selected in the header, shown when there is a selection. */
  renderSelection() {
    this.selectedCount.textContent = this.options.labels.selected(this.selected.size);
    this.selection.hidden = this.selected.size === 0;
    this.selection.setAttribute('aria-label', this.selectedCount.textContent);
  }

  render() {
    const { labels } = this.options;
    const items = this.filtered();
    this.count.textContent = labels.count(items.length);
    this.sorter.value = this.sort;
    this.renderSelection();
    for (const button of this.switches) {
      button.setAttribute('aria-pressed', String(button.dataset.view === this.view));
    }
    this.renderFacets();
    if (this.items.length === 0 || items.length === 0) {
      const message = document.createElement('p');
      message.className = 'muted empty';
      message.textContent = this.items.length === 0 ? labels.empty : labels.noMatch;
      this.shown.replaceChildren(message);
    } else {
      this.shown.replaceChildren(this.view === 'grid' ? this.grid(items) : this.rows(items));
    }
    this.options.rendered?.();
  }

  /**
   * Each facet lists only the values that the items have, each with the number of items it matches
   * given the values chosen in the other facets.
   */
  renderFacets() {
    const { labels } = this.options;
    this.facets.replaceChildren(
      ...this.options.facets.map((facet) => {
        const section = document.createElement('section');
        section.className = 'facet';
        section.dataset.facet = facet.id;
        const title = document.createElement('h2');
        title.id = `facet-${facet.id}`;
        title.textContent = facet.title;
        section.setAttribute('aria-labelledby', title.id);
        const counts = new Map();
        for (const item of this.items) {
          if (!this.matches(item, facet.id)) {
            continue;
          }
          for (const { value, label } of facet.values(item)) {
            const known = counts.get(value) ?? { label, count: 0 };
            known.count++;
            counts.set(value, known);
          }
        }
        const chosen = this.chosen.get(facet.id);
        const list = document.createElement('ul');
        const values = [...counts.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
        list.append(
          ...values.map(([value, { label, count }]) => {
            const item = document.createElement('li');
            const choice = document.createElement('label');
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.value = value;
            box.checked = chosen.has(value);
            box.addEventListener('change', () => {
              if (box.checked) {
                chosen.add(value);
              } else {
                chosen.delete(value);
              }
              this.render();
              this.facets.querySelector(`[data-facet="${facet.id}"] input[value="${CSS.escape(value)}"]`)?.focus();
            });
            const text = document.createElement('span');
            text.className = 'value';
            text.textContent = label;
            const number = document.createElement('span');
            number.className = 'number';
            number.textContent = String(count);
            choice.append(box, text, number);
            item.append(choice);
            return item;
          }),
        );
        section.append(title, list);
        if (values.length === 0) {
          const none = document.createElement('p');
          none.className = 'none';
          none.textContent = facet.none ?? labels.none;
          section.append(none);
        }
        return section;
      }),
    );
  }

  grid(items) {
    const list = document.createElement('ul');
    list.className = 'cards';
    list.append(
      ...items.map((item) => {
        const entry = document.createElement('li');
        entry.dataset.id = this.options.key(item);
        entry.append(this.options.card(item));
        return entry;
      }),
    );
    return list;
  }

  rows(items) {
    const wrapper = document.createElement('div');
    wrapper.className = 'table';
    const table = document.createElement('table');
    const head = document.createElement('tr');
    const selectable = this.options.selectable !== false;
    if (selectable) {
      const selectHead = document.createElement('th');
      selectHead.scope = 'col';
      selectHead.className = 'select';
      head.append(selectHead);
    }
    for (const column of this.options.columns) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = column.title;
      head.append(cell);
    }
    const thead = document.createElement('thead');
    thead.append(head);
    const body = document.createElement('tbody');
    body.append(
      ...items.map((item) => {
        const row = document.createElement('tr');
        row.dataset.id = this.options.key(item);
        if (selectable) {
          const select = document.createElement('td');
          select.className = 'select';
          select.append(this.selectionBox(item));
          row.append(select);
        }
        for (const column of this.options.columns) {
          const cell = document.createElement('td');
          cell.className = column.className ?? '';
          cell.append(column.cell(item));
          row.append(cell);
        }
        return row;
      }),
    );
    table.append(thead, body);
    wrapper.append(table);
    return wrapper;
  }
}
