// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0

/**
 * The frontend of the fixture "records" (EXT-006): an app that lists and creates records, and the sheet
 * of a record (/app/records?record=<id>), which shows the documents of the catalog linked to it with the
 * element mosaikit-ext-catalog-documents of the catalog, given the record in its property resource. The
 * element is there only while the catalog is active in the organization: the sheet asks the presence of
 * the shell (MK-133) and shows it, or not, when the catalog comes or goes.
 */
const APP = 'example-records-app';
const EXTENSION = 'org.example.records';
const CATALOG = 'io.github.mosaikit.ext.catalog';
const DOCUMENTS = 'mosaikit-ext-catalog-documents';
const API = '/api/v1/ext/records/records';

export default {
  activate(context) {
    if (customElements.get(APP)) {
      return;
    }
    const italian = () => String(context.locale ?? 'en').toLowerCase().startsWith('it');
    const text = (en, it) => (italian() ? it : en);

    customElements.define(
      APP,
      class extends HTMLElement {
        connectedCallback() {
          const id = new URL(location.href).searchParams.get('record');
          this.stop?.();
          this.stop = context.extensions?.subscribe?.((change) => {
            if (change.extension === CATALOG && this.record) {
              this.showDocuments();
            }
          });
          void (id ? this.sheet(id) : this.list());
        }

        disconnectedCallback() {
          this.stop?.();
          this.stop = undefined;
        }

        async list() {
          const h1 = document.createElement('h1');
          h1.textContent = text('Records', 'Schede');
          const form = document.createElement('form');
          const input = document.createElement('input');
          input.name = 'title';
          input.required = true;
          input.setAttribute('aria-label', text('Title of the record', 'Titolo della scheda'));
          const create = document.createElement('button');
          create.textContent = text('Create record', 'Crea scheda');
          form.append(input, create);
          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const response = await context.fetch(API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: input.value }),
            });
            if (response.ok) {
              const { id } = await response.json();
              location.assign(`/app/records?record=${encodeURIComponent(id)}`);
            }
          });
          const ul = document.createElement('ul');
          ul.setAttribute('aria-label', text('Records', 'Schede'));
          const response = await context.fetch(API);
          for (const record of response.ok ? await response.json() : []) {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `/app/records?record=${encodeURIComponent(record.id)}`;
            a.textContent = record.title;
            li.append(a);
            ul.append(li);
          }
          this.replaceChildren(h1, form, ul);
        }

        async sheet(id) {
          const response = await context.fetch(`${API}/${encodeURIComponent(id)}`);
          if (!response.ok) {
            const p = document.createElement('p');
            p.textContent = text('This record does not exist.', 'Questa scheda non esiste.');
            this.replaceChildren(p);
            return;
          }
          this.record = await response.json();
          const h1 = document.createElement('h1');
          h1.textContent = this.record.title;
          this.documents = document.createElement('div');
          this.documents.className = 'documents';
          this.replaceChildren(h1, this.documents);
          this.showDocuments();
        }

        /** The documents of the record, with the element of the catalog, while the catalog is active. */
        showDocuments() {
          const active = context.extensions?.isActive?.(CATALOG) ?? false;
          if (!active || !customElements.get(DOCUMENTS)) {
            const p = document.createElement('p');
            p.textContent = text('Documents are kept in the catalog.', 'I documenti stanno nel catalogo.');
            this.documents.replaceChildren(p);
            return;
          }
          const element = document.createElement(DOCUMENTS);
          element.setAttribute('label', this.record.title);
          element.resource = { extension: EXTENSION, type: 'record', id: this.record.id };
          this.documents.replaceChildren(element);
        }
      },
    );
  },
};
