// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0

/**
 * The frontend of the fixture "text notes" (EXT-105): the preview of a note and its action "Count words",
 * custom elements that the catalog creates for the files of the kind and gives the file in their
 * property `file` ({ id, name, contentType, size, fileKind, url() }, url() a signed link to its content).
 */
const PREVIEW = 'example-text-note-preview';
const COUNT = 'example-text-note-count';

export default {
  activate(context) {
    if (customElements.get(PREVIEW)) {
      return;
    }
    const italian = () => context.locale.toLowerCase().startsWith('it');

    customElements.define(
      PREVIEW,
      class extends HTMLElement {
        set file(file) {
          this.shown = file;
          void this.show();
        }

        async show() {
          const file = this.shown;
          const pre = document.createElement('pre');
          pre.className = 'note';
          pre.style.whiteSpace = 'pre-wrap';
          pre.style.margin = '0';
          pre.setAttribute('aria-label', italian() ? `Anteprima di ${file.name}` : `Preview of ${file.name}`);
          this.replaceChildren(pre);
          const response = await fetch(await file.url(), { credentials: 'omit' });
          pre.textContent = response.ok ? await response.text() : String(response.status);
        }
      },
    );

    customElements.define(
      COUNT,
      class extends HTMLElement {
        set file(file) {
          this.shown = file;
          void this.count();
        }

        async count() {
          const file = this.shown;
          const p = document.createElement('p');
          p.setAttribute('role', 'status');
          p.textContent = italian() ? 'Conto le parole…' : 'Counting the words…';
          this.replaceChildren(p);
          const response = await context.fetch(`/api/v1/ext/text-notes/notes/${encodeURIComponent(file.id)}/count`, {
            method: 'POST',
          });
          if (!response.ok) {
            p.textContent = String(response.status);
            return;
          }
          const { words } = await response.json();
          p.textContent = italian() ? `${file.name} ha ${words} parole.` : `${file.name} has ${words} words.`;
          // The catalog shows the state the action recorded on the file.
          this.dispatchEvent(new CustomEvent('catalog-file-changed', { bubbles: true, composed: true }));
        }
      },
    );
  },
};
