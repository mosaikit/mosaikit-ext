// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { contributionText, translator } from './i18n.js';

/**
 * The source picker (EXT-026): one answer to "what data do I put here" for the editors of every
 * extension. It is the view of the connections itself, not a copy of it, in a dialog: its filters, the
 * connections as cards and the pieces of the chosen one, limited to the uses that the opening editor
 * contributes to the point catalog.connection.use (MK-134): the Type filter lists only the types whose
 * sources hold a kind its uses take, and only the pieces those uses take can be chosen.
 *
 * The contract, version 1, is the element <mosaikit-ext-catalog-connection-picker>, which this
 * extension defines in the page for the extensions that run as modules:
 *
 *   const picker = document.createElement('mosaikit-ext-catalog-connection-picker');
 *   picker.extension = context.extension.id; // whose uses: those it contributes
 *   picker.uses = ['chart'];                 // optional: some of them only
 *   picker.multiple = true;                  // optional: several pieces
 *   const references = await picker.pick();  // null when the person cancels
 *
 * Each reference names the connection as the registry of resources of the platform knows it (MK-135)
 * and the piece by its id and those of the containers above it, never the address of the source:
 * { connection: { extension, type: 'connection', id }, part: { id, parents, name, kind }, uses }. POST
 * /api/v1/ext/connections/references/resolve gives each one as it is now. A breaking change of the
 * contract is a new element, -picker-2, next to this one.
 */

/** The element of the picker, version 1 of its contract. */
export const PICKER = 'mosaikit-ext-catalog-connection-picker';

/** The styles of the boxes that choose a piece in the view of the connections. */
export const PICKER_STYLE = `
  ul.entries input.pick { width: 18px; height: 18px; min-width: 0; margin: 0 4px 0 0; align-self: center;
                          accent-color: var(--mk-accent); cursor: pointer; }
  .state[data-state='nothing-to-pick'] { font-style: italic; }
`;

const STYLE = `
  :host { display: contents; }
  dialog { box-sizing: border-box; width: min(1180px, calc(100vw - 32px)); height: min(820px, calc(100vh - 32px));
           max-width: none; max-height: none; padding: 0; border: 1px solid var(--mk-line); border-radius: var(--mk-radius);
           background: var(--mk-bg); color: var(--mk-fg); font-family: var(--mk-font); }
  dialog[open] { display: flex; flex-direction: column; }
  dialog::backdrop { background: rgb(0 0 0 / .4); }
  header, footer { flex: none; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between;
                   padding: 12px 16px; background: var(--mk-surface); }
  header { border-bottom: 1px solid var(--mk-line); }
  footer { border-top: 1px solid var(--mk-line); }
  h2 { margin: 0; font-size: 18px; }
  .intro, .chosen { margin: 2px 0 0; color: var(--mk-muted); font-size: 13px; overflow-wrap: anywhere; }
  .chosen { flex: 1; min-width: 0; margin: 0; }
  .body { flex: 1; min-height: 0; overflow: auto; padding: 0 16px 16px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  button { font: inherit; padding: 6px 12px; border-radius: var(--mk-radius); border: 1px solid var(--mk-line);
           background: var(--mk-surface); color: var(--mk-fg); cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  button.primary { border-color: var(--mk-accent); background: var(--mk-accent); color: var(--mk-accent-fg); font-weight: 600; }
  button.close { font-size: 18px; line-height: 1; padding: 4px 10px; }
  button:focus-visible { outline: 2px solid var(--mk-focus); outline-offset: 2px; }
  .none { color: var(--mk-muted); margin: 16px 0; }
`;

/**
 * Defines the picker in the page.
 *
 * @param {object} context the context of this extension, whose API and contributions the picker reads
 * @param {{ view: string, uses: () => object[] }} options the element of the view of the connections,
 *     and the uses contributed by the active extensions
 */
export function definePicker(context, { view, uses }) {
  if (customElements.get(PICKER)) {
    return;
  }

  class Picker extends HTMLElement {
    /** The version of the contract this element serves. */
    static version = 1;

    /** The extension whose uses limit the picker: the editor that opens it. */
    get extension() {
      return this.getAttribute('extension') ?? '';
    }

    set extension(value) {
      this.setAttribute('extension', String(value ?? ''));
    }

    /** Some of the uses of the extension only, by their ids; all of them when empty. */
    get uses() {
      return this.chosenUses ?? (this.getAttribute('uses') ?? '').split(/[\s,]+/).filter(Boolean);
    }

    set uses(value) {
      this.chosenUses = Array.isArray(value) ? value.map(String) : undefined;
    }

    /** Whether the person may choose several pieces. */
    get multiple() {
      return this.hasAttribute('multiple');
    }

    set multiple(value) {
      this.toggleAttribute('multiple', Boolean(value));
    }

    /**
     * Opens the picker and waits for the choice: the references to the pieces chosen, or null when the
     * person closes it without choosing. A picker not in the page is added to it while it is open.
     */
    pick() {
      if (this.pending) {
        return this.pending;
      }
      const t = translator(context.locale);
      const added = !this.isConnected;
      if (added) {
        document.body.append(this);
      }
      const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <style>${STYLE}</style>
        <dialog aria-labelledby="picker-title">
          <header>
            <div>
              <h2 id="picker-title"></h2>
              <p class="intro"></p>
            </div>
            <button type="button" class="close"></button>
          </header>
          <div class="body"></div>
          <footer>
            <p class="chosen" aria-live="polite"></p>
            <div class="actions">
              <button type="button" class="cancel"></button>
              <button type="button" class="primary choose" disabled></button>
            </div>
          </footer>
        </dialog>`;
      const dialog = root.querySelector('dialog');
      const multiple = this.multiple;
      const wanted = this.uses;
      const declared = uses().filter(
        (use) => use.extensionId === this.extension && (wanted.length === 0 || wanted.includes(use.id)),
      );
      const names = declared.map((use) => contributionText(use, 'title', context.locale) ?? use.id);
      root.querySelector('h2').textContent = t(multiple ? 'pickTitleMany' : 'pickTitle');
      root.querySelector('.intro').textContent = names.length > 0 ? t('pickIntro', { uses: names.join(', ') }) : '';
      const close = root.querySelector('button.close');
      close.textContent = '×';
      close.setAttribute('aria-label', t('closePicker'));
      root.querySelector('button.cancel').textContent = t('cancel');
      const choose = root.querySelector('button.choose');
      choose.textContent = t('pickChoose');
      const chosen = root.querySelector('.chosen');
      const picked = new Map();
      const changed = () => {
        const labels = [...picked.values()].map((entry) => entry.label);
        chosen.textContent = labels.length === 0 ? t('pickChosenNone') : t('pickChosen', { count: labels.length, list: labels.join('; ') });
        choose.disabled = labels.length === 0;
      };
      changed();
      const body = root.querySelector('.body');
      if (declared.length === 0) {
        // An editor that contributes no use takes nothing: say so rather than show every source.
        const none = document.createElement('p');
        none.className = 'none';
        none.setAttribute('role', 'note');
        none.textContent = t('pickNoUses', { extension: this.extension });
        body.append(none);
      } else {
        const connections = document.createElement(view);
        connections.picking = { uses: declared, multiple, picked, changed };
        body.append(connections);
      }
      this.pending = new Promise((resolve) => {
        const finish = (references) => {
          this.pending = undefined;
          if (dialog.open) {
            dialog.close();
          }
          root.replaceChildren();
          if (added) {
            this.remove();
          }
          this.dispatchEvent(
            references
              ? new CustomEvent('pick', { detail: { references }, bubbles: true, composed: true })
              : new CustomEvent('pickcancel', { bubbles: true, composed: true }),
          );
          resolve(references);
        };
        choose.addEventListener('click', () => finish([...picked.values()].map((entry) => structuredClone(entry.reference))));
        root.querySelector('button.cancel').addEventListener('click', () => finish(null));
        close.addEventListener('click', () => finish(null));
        // Escape closes the picker, unless it closed the detail of a connection in it.
        dialog.addEventListener('cancel', (event) => {
          event.preventDefault();
          finish(null);
        });
      });
      dialog.showModal();
      return this.pending;
    }
  }

  customElements.define(PICKER, Picker);
}
