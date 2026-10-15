// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { translator } from './i18n.js';

/**
 * Frontend of the catalog: a custom element that the shell renders for /app/catalog. It is styled
 * with the --mk-* tokens of the theme and renders its texts in the language of the person.
 */

const ELEMENT = 'mosaikit-ext-catalog';

/** @type {import('@mosaikit/sdk').MosaikitExtension} */
const extension = {
  activate(context) {
    if (customElements.get(ELEMENT)) {
      return;
    }

    class Catalog extends HTMLElement {
      connectedCallback() {
        // The shell mounts the app again when the language changes: read it at every mount.
        const t = translator(context.locale);
        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        root.innerHTML = `
          <style>
            section { background: var(--mk-surface); border: 1px solid var(--mk-line);
                      border-radius: var(--mk-radius); padding: 20px; max-width: 720px; }
            p { color: var(--mk-muted); }
          </style>
          <section>
            <h1></h1>
            <p class="intro"></p>
            <p class="version"></p>
          </section>`;
        root.querySelector('h1').textContent = t('title');
        root.querySelector('.intro').textContent = t('intro');
        root.querySelector('.version').textContent = t('version', context.extension);
      }
    }

    customElements.define(ELEMENT, Catalog);
  },
};

export default extension;
