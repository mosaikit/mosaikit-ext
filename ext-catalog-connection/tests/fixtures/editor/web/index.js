// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0

/**
 * The editor of the tests (EXT-026): it opens the source picker of the connection framework through its
 * contract, the element mosaikit-ext-catalog-connection-picker, in single and multiple choice and for
 * one of its uses, shows the references it returns, and resolves them as they are now. It keeps only
 * the references, never the address of a source.
 */

const FRAMEWORK = 'io.github.mosaikit.ext.catalog.connection';
const PICKER = 'mosaikit-ext-catalog-connection-picker';

export default {
  activate(context) {
    if (customElements.get('org-example-editor')) {
      return;
    }

    class Editor extends HTMLElement {
      connectedCallback() {
        this.innerHTML = `
          <h1>Editor</h1>
          <p class="presence" role="note"></p>
          <div class="commands">
            <button type="button" class="one">Choose a source</button>
            <button type="button" class="many">Choose sources</button>
            <button type="button" class="feed">Choose a feed</button>
            <button type="button" class="resolve">Show the sources now</button>
          </div>
          <pre class="references"></pre>
          <pre class="resolved"></pre>`;
        this.references = [];
        this.querySelector('button.one').addEventListener('click', () => this.open({}));
        this.querySelector('button.many').addEventListener('click', () => this.open({ multiple: true }));
        this.querySelector('button.feed').addEventListener('click', () => this.open({ uses: ['feed'] }));
        this.querySelector('button.resolve').addEventListener('click', () => this.resolve());
        this.render();
        this.stop = context.extensions?.subscribe?.((change) => {
          if (change.extension === FRAMEWORK) {
            this.render();
          }
        });
      }

      disconnectedCallback() {
        this.stop?.();
      }

      /** Whether the framework is there to pick from (MK-133). */
      render() {
        const present = context.extensions?.isActive?.(FRAMEWORK) !== false && Boolean(customElements.get(PICKER));
        this.querySelector('.presence').textContent = present ? '' : 'There is no source to choose: the connections are not available.';
        for (const button of this.querySelectorAll('.commands button')) {
          button.disabled = !present;
        }
      }

      async open({ multiple = false, uses }) {
        const picker = document.createElement(PICKER);
        picker.extension = context.extension.id;
        picker.multiple = multiple;
        if (uses) {
          picker.uses = uses;
        }
        const references = await picker.pick();
        if (references) {
          this.references = references;
          this.querySelector('.references').textContent = JSON.stringify(references);
        } else {
          this.querySelector('.references').textContent = 'cancelled';
        }
      }

      async resolve() {
        const response = await context.fetch('/api/v1/ext/connections/references/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ references: this.references }),
        });
        this.querySelector('.resolved').textContent = response.ok ? JSON.stringify(await response.json()) : `HTTP ${response.status}`;
      }
    }

    customElements.define('org-example-editor', Editor);
  },
};
