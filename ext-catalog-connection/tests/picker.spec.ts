// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { expect, test, type Locator, type Page } from '@playwright/test';
import { api, member, openApp, signIn, unique } from '@mosaikit/testing/playwright';

// One source picker for the editors of every extension (EXT-026). The bench installs an editor of the
// tests (tests/fixtures/editor) that declares two uses of pieces, a table of the rows of a table or view
// with columns and a live feed of a topic, and opens the picker of the framework through its contract,
// the element mosaikit-ext-catalog-connection-picker; and the consumer of the tests of EXT-019
// (tests/fixtures/consumer), whose uses are a chart, a map, a live view and the input of a process.
// Nothing in the framework names either.

const API = '/api/v1/ext/connections';
const FRAMEWORK = 'io.github.mosaikit.ext.catalog.connection';
const PICKER = 'mosaikit-ext-catalog-connection-picker';

interface Reference {
  connection: { extension: string; type: string; id: string };
  part: { id: string; parents: string[]; name: string; kind: string };
  uses: string[];
}

interface Resolved {
  status: string;
  connection: { id: string; name: string; address: string | null } | null;
  part: { id: string; name: string; kind: string; facts: Record<string, unknown> } | null;
  detail: string | null;
}

/** Creates a connection through the API, as the member. */
async function connection(type: string, settings: Record<string, unknown>, prefix = 'Picked'): Promise<{ id: string; name: string }> {
  const name = unique(prefix);
  const { status, body } = await api(member(), `${API}/connections`, {
    method: 'POST',
    body: JSON.stringify({ name, type, settings }),
  });
  expect(status, JSON.stringify(body)).toBe(201);
  return body as { id: string; name: string };
}

async function openEditor(page: Page): Promise<void> {
  await signIn(page, member());
  await openApp(page, 'Editor');
}

/** Opens the picker as another extension does, from the page, with the uses of that extension. */
async function openPicker(page: Page, extension: string, options: { uses?: string[]; multiple?: boolean } = {}): Promise<void> {
  await page.evaluate(
    ({ element, extension, uses, multiple }) => {
      const picker = document.createElement(element) as HTMLElement & {
        extension: string;
        uses: string[];
        multiple: boolean;
        pick(): Promise<unknown>;
      };
      picker.extension = extension;
      if (uses) {
        picker.uses = uses;
      }
      picker.multiple = Boolean(multiple);
      void picker.pick().then((references) => {
        document.body.dataset.picked = JSON.stringify(references);
      });
    },
    { element: PICKER, extension, ...options },
  );
}

const typeFilter = (dialog: Locator) => dialog.getByRole('complementary', { name: 'Filters' }).getByRole('region', { name: 'Type' });
const card = (dialog: Locator, name: string) => dialog.getByRole('article', { name, exact: true });

/** The parts of a connection in the picker, opened from its card. */
async function parts(dialog: Locator, name: string): Promise<Locator> {
  await dialog.getByRole('button', { name, exact: true }).click();
  return dialog.getByRole('region', { name: `Contents of ${name}` });
}

function references(page: Page): Promise<Reference[]> {
  return page.locator('pre.references').textContent().then((text) => JSON.parse(text ?? '[]') as Reference[]);
}

test.describe('EXT-026 one source picker for the editors of every extension', () => {
  test('EXT-026 the editor of another extension opens the same picker through the contract of the framework, with filters, cards and the parts of the chosen connection', async ({ page }) => {
    const database = await connection('sample', { host: 'db.example.org' });
    await openEditor(page);
    await page.getByRole('button', { name: 'Choose a source' }).click();

    const dialog = page.getByRole('dialog', { name: 'Choose a source' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('The connections that hold what Live feed, Table can use.')).toBeVisible();
    // The view of the connections itself, not a copy: its element, its filters, its cards and its detail.
    await expect(dialog.locator('mosaikit-ext-catalog-connection')).toHaveCount(1);
    await expect(typeFilter(dialog)).toContainText('Sample source');
    await expect(dialog.getByRole('complementary', { name: 'Filters' }).getByRole('region', { name: 'Tags' })).toBeVisible();
    const chosen = card(dialog, database.name);
    await expect(chosen.locator('.thumb')).toBeVisible();
    await expect(chosen.locator('.subtitle')).toHaveText('sample://db.example.org');
    await expect(chosen.locator('ul.labels .label.type')).toHaveText('Sample source');
    // A choice of pieces, not of connections: no selection box on the cards, no command to edit.
    await expect(chosen.locator('input.select')).toHaveCount(0);
    await expect(chosen.getByRole('button', { name: /Edit/ })).toHaveCount(0);

    const region = await parts(dialog, database.name);
    await expect(region.locator('nav.path li')).toHaveText(['Top level']);
    await region.getByRole('button', { name: 'sales', exact: true }).click();
    await expect(region.locator('nav.path li')).toHaveText(['Top level', 'sales']);
    await expect(region.getByRole('list', { name: 'Uses of customers' }).getByRole('listitem')).toHaveText(['Table']);
    await expect(dialog.locator('footer .chosen')).toHaveText('Nothing chosen yet.');
    await expect(dialog.getByRole('button', { name: 'Choose', exact: true })).toBeDisabled();
    await region.getByRole('radio', { name: 'Choose customers' }).check();
    await expect(dialog.locator('footer .chosen')).toHaveText(`1 chosen: ${database.name} / sales / customers`);
    await dialog.getByRole('button', { name: 'Choose', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(page.locator(PICKER)).toHaveCount(0);
    expect(await references(page)).toEqual([
      {
        connection: { extension: FRAMEWORK, type: 'connection', id: database.id },
        part: { id: 'sales/customers', parents: ['sales'], name: 'customers', kind: 'table' },
        uses: ['grid'],
      },
    ]);

    // Closed without a choice, by its button or with Escape, it returns nothing.
    await page.getByRole('button', { name: 'Choose a source' }).click();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('pre.references')).toHaveText('cancelled');
    await page.getByRole('button', { name: 'Choose sources' }).click();
    const many = page.getByRole('dialog', { name: 'Choose sources' });
    await expect(many).toBeVisible();
    // Escape closes the detail of a connection first, then the picker.
    await parts(many, database.name);
    await page.keyboard.press('Escape');
    await expect(many.getByRole('region', { name: `Contents of ${database.name}` })).toBeHidden();
    await expect(many).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(many).toBeHidden();
    await expect(page.locator('pre.references')).toHaveText('cancelled');
  });

  test('EXT-026 in each context the Type filter and the parts offered are limited to the uses that the opening editor declared', async ({ page }) => {
    const database = await connection('sample', { host: 'db.example.org' });
    const files = await connection('sample-files', { url: 'https://files.example.org/share' });
    const stream = await connection('sample-stream', { broker: 'broker.example.org' });
    const rest = await connection('sample-api', { url: 'https://api.example.org' });

    // The kinds of each type: those its connector declares, or those of its category.
    const connectors = (await api(member(), `${API}/connectors`)).body as { connectors: { type: string; kinds: string[] }[] };
    const kinds = Object.fromEntries(connectors.connectors.map((connector) => [connector.type, connector.kinds]));
    expect(kinds).toMatchObject({
      sample: ['folder', 'schema', 'table'],
      'sample-files': ['file', 'folder'],
      'sample-stream': ['topic'],
      'sample-api': ['endpoint'],
    });

    await openEditor(page);
    // The editor takes tables and views with columns, and topics.
    await page.getByRole('button', { name: 'Choose a source' }).click();
    let dialog = page.getByRole('dialog', { name: 'Choose a source' });
    await expect(typeFilter(dialog).locator('.value')).toHaveText(['Sample source', 'Sample stream']);
    await expect(card(dialog, database.name)).toBeVisible();
    await expect(card(dialog, stream.name)).toBeVisible();
    await expect(card(dialog, files.name)).toHaveCount(0);
    await expect(card(dialog, rest.name)).toHaveCount(0);
    // Containers lead to the parts; a schema or a folder is never chosen itself.
    let region = await parts(dialog, database.name);
    await expect(region.locator('ul.entries > li')).toHaveCount(3);
    await expect(region.locator('ul.entries input.pick')).toHaveCount(0);
    await region.getByRole('button', { name: 'places', exact: true }).click();
    await expect(region.getByRole('list', { name: 'Uses of sites' }).getByRole('listitem')).toHaveText(['Table']);
    region = await parts(dialog, stream.name);
    await expect(region.getByRole('radio')).toHaveCount(2);
    await expect(region.getByRole('list', { name: 'Uses of orders' }).getByRole('listitem')).toHaveText(['Live feed']);
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // For one of its uses only, the live feed: topics.
    await page.getByRole('button', { name: 'Choose a feed' }).click();
    dialog = page.getByRole('dialog', { name: 'Choose a source' });
    await expect(dialog.getByText('The connections that hold what Live feed can use.')).toBeVisible();
    await expect(typeFilter(dialog).locator('.value')).toHaveText(['Sample stream']);
    await expect(card(dialog, database.name)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Another extension, another context: the consumer takes endpoints too, not files.
    await openPicker(page, 'org.example.consumer');
    dialog = page.getByRole('dialog', { name: 'Choose a source' });
    await expect(typeFilter(dialog).locator('.value')).toHaveText(['Sample API', 'Sample source', 'Sample stream']);
    await expect(card(dialog, files.name)).toHaveCount(0);
    region = await parts(dialog, rest.name);
    await expect(region.getByRole('list', { name: 'Uses of /customers' }).getByRole('listitem')).toHaveText(['Process input']);
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Its map takes only tables with geometries: the other tables are not offered, and a level without
    // any says so.
    await openPicker(page, 'org.example.consumer', { uses: ['map'] });
    dialog = page.getByRole('dialog', { name: 'Choose a source' });
    await expect(typeFilter(dialog).locator('.value')).toHaveText(['Sample source']);
    region = await parts(dialog, database.name);
    await region.getByRole('button', { name: 'sales', exact: true }).click();
    await expect(region.locator('ul.entries > li')).toHaveCount(0);
    await expect(region.getByRole('note')).toHaveText('Nothing here can be used in this editor.');
    await region.getByRole('button', { name: 'Top level' }).click();
    await region.getByRole('button', { name: 'places', exact: true }).click();
    await expect(region.getByRole('radio', { name: 'Choose sites' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // An extension that declares no use takes nothing.
    await openPicker(page, 'org.example.none');
    dialog = page.getByRole('dialog', { name: 'Choose a source' });
    await expect(dialog.getByRole('note')).toHaveText('The extension org.example.none declares no use of data: there is nothing to choose for it.');
    await expect(dialog.locator('mosaikit-ext-catalog-connection')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close the picker' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-picked', 'null');
  });

  test('EXT-026 single and multiple choice return references to the connection and its part that follow a later change of the source address', async ({ page }) => {
    const database = await connection('sample', { host: 'db.example.org' });
    const stream = await connection('sample-stream', { broker: 'broker.example.org' });
    await openEditor(page);

    // Single choice: choosing another part replaces the first.
    await page.getByRole('button', { name: 'Choose a source' }).click();
    let dialog = page.getByRole('dialog', { name: 'Choose a source' });
    let region = await parts(dialog, database.name);
    await region.getByRole('button', { name: 'sales', exact: true }).click();
    await region.getByRole('radio', { name: 'Choose customers' }).check();
    await region.getByRole('radio', { name: 'Choose orders' }).check();
    await expect(region.getByRole('radio', { name: 'Choose customers' })).not.toBeChecked();
    region = await parts(dialog, stream.name);
    await region.getByRole('radio', { name: 'Choose clicks' }).check();
    await expect(dialog.locator('footer .chosen')).toHaveText(`1 chosen: ${stream.name} / clicks`);
    await dialog.getByRole('button', { name: 'Choose', exact: true }).click();
    expect((await references(page)).map((reference) => reference.part.id)).toEqual(['clicks']);

    // Multiple choice: parts of several connections, kept while another connection is opened.
    await page.getByRole('button', { name: 'Choose sources' }).click();
    dialog = page.getByRole('dialog', { name: 'Choose sources' });
    region = await parts(dialog, database.name);
    await region.getByRole('button', { name: 'sales', exact: true }).click();
    await region.getByRole('checkbox', { name: 'Choose customers' }).check();
    await region.getByRole('checkbox', { name: 'Choose orders' }).check();
    region = await parts(dialog, stream.name);
    await region.getByRole('checkbox', { name: 'Choose orders' }).check();
    region = await parts(dialog, database.name);
    await region.getByRole('button', { name: 'sales', exact: true }).click();
    await expect(region.getByRole('checkbox', { name: 'Choose customers' })).toBeChecked();
    await expect(dialog.locator('footer .chosen')).toHaveText(
      `3 chosen: ${database.name} / sales / customers; ${database.name} / sales / orders; ${stream.name} / orders`,
    );
    await dialog.getByRole('button', { name: 'Choose', exact: true }).click();
    const chosen = await references(page);
    expect(chosen).toEqual([
      {
        connection: { extension: FRAMEWORK, type: 'connection', id: database.id },
        part: { id: 'sales/customers', parents: ['sales'], name: 'customers', kind: 'table' },
        uses: ['grid'],
      },
      {
        connection: { extension: FRAMEWORK, type: 'connection', id: database.id },
        part: { id: 'sales/orders', parents: ['sales'], name: 'orders', kind: 'table' },
        uses: ['grid'],
      },
      {
        connection: { extension: FRAMEWORK, type: 'connection', id: stream.id },
        part: { id: 'orders', parents: [], name: 'orders', kind: 'topic' },
        uses: ['feed'],
      },
    ]);
    // A reference, not a copy: no address of a source in it.
    const kept = JSON.stringify(chosen);
    expect(kept).not.toContain('example.org');
    expect(kept).not.toContain('address');

    // The address of the source changes: whoever keeps the references reads the new one.
    const moved = await api(member(), `${API}/connections/${database.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: database.name, settings: { host: 'moved.example.org', port: 9100 } }),
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    await page.getByRole('button', { name: 'Show the sources now' }).click();
    await expect(page.locator('pre.resolved')).toContainText('moved.example.org');
    const resolved = JSON.parse((await page.locator('pre.resolved').textContent()) ?? '{}') as { references: Resolved[] };
    expect(resolved.references.map((each) => [each.status, each.connection?.address, each.part?.name])).toEqual([
      ['available', 'sample://moved.example.org:9100', 'customers'],
      ['available', 'sample://moved.example.org:9100', 'orders'],
      ['available', null, 'orders'],
    ]);
    expect(resolved.references[0]?.part?.facts).toEqual({ columns: [{ name: 'id', type: 'integer' }, { name: 'name', type: 'text' }] });

    // A reference that is no longer available says why, and the request names what it resolves.
    const reference = { extension: FRAMEWORK, type: 'connection', id: database.id };
    const missing = await api(member(), `${API}/references/resolve`, {
      method: 'POST',
      body: JSON.stringify({
        references: [
          { connection: reference, part: { id: 'sales/gone', parents: ['sales'] } },
          { connection: { ...reference, id: '00000000-0000-4000-8000-000000000000' }, part: { id: 'x', parents: [] } },
        ],
      }),
    });
    expect(missing.status, JSON.stringify(missing.body)).toBe(200);
    expect((missing.body as { references: Resolved[] }).references.map((each) => each.status)).toEqual(['part-missing', 'deleted']);
    const wrong = await api(member(), `${API}/references/resolve`, {
      method: 'POST',
      body: JSON.stringify({ references: [{ connection: { extension: 'org.example.other', type: 'connection', id: database.id }, part: { id: 'x' } }] }),
    });
    expect(wrong.status).toBe(400);
  });

  test('EXT-026 the filter column is widened by dragging or with the keyboard, in the app and in the picker', async ({ page }) => {
    await connection('sample', { host: 'db.example.org' });
    await signIn(page, member());
    await openApp(page, 'Connections');
    await expectResizable(page, page.locator('mosaikit-ext-catalog-connection').first());

    // The width the person left comes back at the next visit, in the picker too.
    await page.reload();
    await expect(page.getByRole('separator', { name: 'Resize the filters' })).toHaveAttribute('aria-valuenow', '480');
    await openApp(page, 'Editor');
    await page.getByRole('button', { name: 'Choose a source' }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose a source' });
    const handle = dialog.getByRole('separator', { name: 'Resize the filters' });
    await expect(handle).toHaveAttribute('aria-valuenow', '480');
    await handle.focus();
    await page.keyboard.press('Home');
    await expect(handle).toHaveAttribute('aria-valuenow', '160');
    await expect.poll(async () => Math.round((await dialog.getByRole('complementary', { name: 'Filters' }).boundingBox())?.width ?? 0)).toBe(160);
  });

  test('EXT-026 where the shell does not define the resizable pane of the UI kit, the column has a handle of its own that works the same way', async ({ page }) => {
    // As in the frame of an isolated frontend (mosaikit/mosaikit#173): the kit is not defined there.
    await page.addInitScript(() => {
      const define = CustomElementRegistry.prototype.define;
      CustomElementRegistry.prototype.define = function (name, constructor, options) {
        if (name !== 'mk-split-pane') {
          define.call(this, name, constructor, options);
        }
      };
    });
    await connection('sample', { host: 'db.example.org' });
    await signIn(page, member());
    await openApp(page, 'Connections');
    const app = page.locator('mosaikit-ext-catalog-connection').first();
    await expect(app.locator('mk-split-pane')).toHaveCount(0);
    await expect(app.locator('.list-body > .split')).toHaveCount(1);
    await expectResizable(page, app);
  });
});

/**
 * The column of filters of a view of the connections: the handle starts at 220 pixels, follows a drag,
 * moves with the arrow keys (16 pixels, 64 with Shift), goes to its bounds with Home and End, and the
 * column follows it.
 */
async function expectResizable(page: Page, view: Locator): Promise<void> {
  const handle = view.getByRole('separator', { name: 'Resize the filters' });
  const filters = view.getByRole('complementary', { name: 'Filters' });
  const width = async () => Math.round((await filters.boundingBox())?.width ?? 0);
  await expect(handle).toHaveAttribute('aria-valuenow', '220');
  await expect(handle).toHaveAttribute('aria-valuemin', '160');
  await expect(handle).toHaveAttribute('aria-valuemax', '480');
  // The handle is as high as the cards beside it: drag it once they are there.
  await expect(view.getByRole('article').first()).toBeVisible();
  const before = await width();

  const box = (await handle.boundingBox())!;
  const y = box.y + Math.min(40, box.height / 2);
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, y, { steps: 6 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '280');
  await expect.poll(width).toBe(before + 60);

  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '296');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '232');
  await page.keyboard.press('Home');
  await expect(handle).toHaveAttribute('aria-valuenow', '160');
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '480');
  await expect.poll(width).toBe(before + 260);
}

test.describe('EXT-026 in Italian', () => {
  test.use({ locale: 'it-IT' });

  test('EXT-026 the picker speaks Italian, and so do the uses of the editor', async ({ page }) => {
    const database = await connection('sample', { host: 'db.example.org' });
    await signIn(page, member());
    await openApp(page, 'Editor');
    await page.getByRole('button', { name: 'Choose sources' }).click();
    const dialog = page.getByRole('dialog', { name: 'Scegli le fonti' });
    await expect(dialog.getByText('Le connessioni che contengono ciò che può usare Flusso in diretta, Tabella.')).toBeVisible();
    await expect(dialog.locator('footer .chosen')).toHaveText('Ancora niente di scelto.');
    await expect(dialog.getByRole('separator', { name: 'Ridimensiona i filtri' })).toBeVisible();
    await dialog.getByRole('button', { name: database.name, exact: true }).click();
    const region = dialog.getByRole('region', { name: `Contenuto di ${database.name}` });
    await region.getByRole('button', { name: 'places', exact: true }).click();
    await region.getByRole('checkbox', { name: 'Scegli sites' }).check();
    await expect(dialog.locator('footer .chosen')).toHaveText(`1 scelti: ${database.name} / places / sites`);
    await expect(dialog.getByRole('button', { name: 'Annulla' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Chiudi la scelta' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Scegli', exact: true }).click();
    await expect(dialog).toBeHidden();
  });
});
