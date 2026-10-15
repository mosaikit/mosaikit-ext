// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0

/**
 * The texts of the pages of the extension, by language. The texts of the manifest (the title of the
 * app) are translated in its i18n blocks (MK-053); these are the texts the frontend renders, in the
 * language of context.locale. A new language is one more entry here and in the manifest.
 */
export const MESSAGES = {
  en: {
    title: 'Connections',
    intro: 'The connections of your organization to its data sources.',
    version: 'Extension {id} {version}.',
    new: 'New connection',
    types: 'Type of source',
    noTypes: 'No connector is installed: install a connector extension to add connections.',
    name: 'Name',
    credential: 'Credential',
    credentialHint: 'The name of a credential that the administrators keep in Credentials; never its value.',
    test: 'Test connection',
    create: 'Create',
    cancel: 'Cancel',
    back: 'Other types',
    testing: 'Testing the connection…',
    tested: 'Connection succeeded: {message}',
    testFailed: 'Connection failed: {message}',
    created: 'Connection {name} created.',
    failed: 'Something went wrong: {message}',
    empty: 'No connections yet.',
    columnName: 'Name',
    columnType: 'Type',
    columnCategory: 'Category',
    unavailableTitle: 'Not available: {name}',
    unavailableWhy: 'The extension that provides it is not active in this organization.',
    unavailableDetail: 'Its connector, {extension}, is not installed or is turned off for the organization. The connection is kept and works again when the connector is back.',
    refusedTitle: 'Connectors refused',
    refused: 'The connector of {extension} is refused: check the field {field} of its declaration.',
    contents: 'Contents of {name}',
    contentsEmpty: 'Nothing here: the source holds no pieces at this level.',
    contentsUnreachable: 'The source does not answer: {detail}',
    contentsNeedsDeclaration: 'The source does not describe what it contains: declare its pieces to use them. {detail}',
    contentsNotReadable: 'This kind of content cannot be read yet. {detail}',
    uses: 'Uses of {name}',
    columns: 'Columns: {list}',
    moreColumns: '{count} more',
    top: 'Top level',
    more: 'More',
    close: 'Close',
    required: 'required',
    description: 'Description',
    descriptionHint: 'What the source holds and what it is for. Left empty, the card shows the address of the source.',
    thumbnail: 'Thumbnail',
    thumbnailHint: 'A PNG, JPEG, GIF or WebP image of at most 1 MB. Without one, the card shows an image generated from the name.',
    removeThumbnail: 'Remove the thumbnail',
    edit: 'Edit',
    editNamed: 'Edit {name}',
    save: 'Save',
    saved: 'Connection {name} saved.',
    owner: 'Owner: {name}',
    ownerOrganization: 'Owned by the organization',
    formerMember: 'a former member',
    count: '{count} connections',
    countOne: '1 connection',
    view: 'View',
    grid: 'Grid',
    rows: 'Rows',
    filters: 'Filters',
    facetType: 'Type',
    noMatch: 'No connection matches the filters.',
    noTypesConfigured: 'No type yet.',
    columnDescription: 'Description or address',
    columnOwner: 'Owner',
    columnActions: 'Actions',
    detail: 'Detail of {name}',
    closeDetail: 'Close the detail',
    factType: 'Type',
    factCategory: 'Category',
    factDescription: 'Description',
    factAddress: 'Address',
    factOwner: 'Owner',
    factTags: 'Tags',
    detailActions: 'Actions on {name}',
    category: {
      database: 'Database',
      warehouse: 'Data warehouse',
      lake: 'Data lake',
      api: 'API',
      stream: 'Stream',
      files: 'Files',
    },
    kind: {
      'materialized-view': 'materialized view',
      'foreign-table': 'foreign table',
    },
  },
  it: {
    title: 'Connessioni',
    intro: 'Le connessioni della tua organizzazione alle sue fonti di dati.',
    version: 'Estensione {id} {version}.',
    new: 'Nuova connessione',
    types: 'Tipo di fonte',
    noTypes: 'Nessun connettore installato: installa un’estensione connettore per aggiungere connessioni.',
    name: 'Nome',
    credential: 'Credenziale',
    credentialHint: 'Il nome di una credenziale che gli amministratori custodiscono in Credenziali; mai il suo valore.',
    test: 'Prova connessione',
    create: 'Crea',
    cancel: 'Annulla',
    back: 'Altri tipi',
    testing: 'Prova della connessione…',
    tested: 'Connessione riuscita: {message}',
    testFailed: 'Connessione non riuscita: {message}',
    created: 'Connessione {name} creata.',
    failed: 'Qualcosa è andato storto: {message}',
    empty: 'Ancora nessuna connessione.',
    columnName: 'Nome',
    columnType: 'Tipo',
    columnCategory: 'Categoria',
    unavailableTitle: 'Non disponibile: {name}',
    unavailableWhy: "L'estensione che lo fornisce non è attiva in questa organizzazione.",
    unavailableDetail: 'Il suo connettore, {extension}, non è installato o è disattivato per l’organizzazione. La connessione è conservata e torna a funzionare quando il connettore ritorna.',
    refusedTitle: 'Connettori rifiutati',
    refused: 'Il connettore di {extension} è rifiutato: controlla il campo {field} della sua dichiarazione.',
    contents: 'Contenuto di {name}',
    contentsEmpty: 'Qui non c’è niente: la fonte non contiene parti a questo livello.',
    contentsUnreachable: 'La fonte non risponde: {detail}',
    contentsNeedsDeclaration: 'La fonte non descrive cosa contiene: dichiarane le parti per usarle. {detail}',
    contentsNotReadable: 'Questo tipo di contenuto non si può ancora leggere. {detail}',
    uses: 'Usi di {name}',
    columns: 'Colonne: {list}',
    moreColumns: 'altre {count}',
    top: 'Livello principale',
    more: 'Altri',
    close: 'Chiudi',
    required: 'obbligatorio',
    description: 'Descrizione',
    descriptionHint: 'Che cosa contiene la fonte e a che cosa serve. Se è vuota, la scheda mostra l’indirizzo della fonte.',
    thumbnail: 'Miniatura',
    thumbnailHint: 'Un’immagine PNG, JPEG, GIF o WebP di al massimo 1 MB. Senza, la scheda mostra un’immagine generata dal nome.',
    removeThumbnail: 'Rimuovi la miniatura',
    edit: 'Modifica',
    editNamed: 'Modifica {name}',
    save: 'Salva',
    saved: 'Connessione {name} salvata.',
    owner: 'Proprietario: {name}',
    ownerOrganization: 'Dell’organizzazione',
    formerMember: 'un ex membro',
    count: '{count} connessioni',
    countOne: '1 connessione',
    view: 'Vista',
    grid: 'Griglia',
    rows: 'Righe',
    filters: 'Filtri',
    facetType: 'Tipo',
    noMatch: 'Nessuna connessione corrisponde ai filtri.',
    noTypesConfigured: 'Ancora nessun tipo.',
    columnDescription: 'Descrizione o indirizzo',
    columnOwner: 'Proprietario',
    columnActions: 'Azioni',
    detail: 'Dettaglio di {name}',
    closeDetail: 'Chiudi il dettaglio',
    factType: 'Tipo',
    factCategory: 'Categoria',
    factDescription: 'Descrizione',
    factAddress: 'Indirizzo',
    factOwner: 'Proprietario',
    factTags: 'Etichette',
    detailActions: 'Azioni su {name}',
    category: {
      database: 'Database',
      warehouse: 'Data warehouse',
      lake: 'Data lake',
      api: 'API',
      stream: 'Flusso',
      files: 'File',
    },
    kind: {
      schema: 'schema',
      table: 'tabella',
      view: 'vista',
      'materialized-view': 'vista materializzata',
      'foreign-table': 'tabella esterna',
      topic: 'topic',
      endpoint: 'endpoint',
      folder: 'cartella',
      file: 'file',
    },
  },
};

/** The language of MESSAGES for a locale: itself (it), its main language (it for it-CH), or English. */
export function languageOf(locale) {
  const tag = String(locale ?? '').toLowerCase();
  if (Object.hasOwn(MESSAGES, tag)) {
    return tag;
  }
  const main = tag.split('-')[0];
  return Object.hasOwn(MESSAGES, main) ? main : 'en';
}

/** A function that gives the text of a key in the language of the locale, with its {parameters}. */
export function translator(locale) {
  const messages = MESSAGES[languageOf(locale)];
  return (key, parameters = {}) =>
    (messages[key] ?? MESSAGES.en[key] ?? key).replace(/\{(\w+)\}/g, (whole, name) =>
      Object.hasOwn(parameters, name) ? String(parameters[name]) : whole,
    );
}

/** The name of a category of sources in the language of the locale, or the category itself. */
export function categoryName(locale, category) {
  return MESSAGES[languageOf(locale)].category[category] ?? MESSAGES.en.category[category] ?? category;
}

/**
 * The title a connector declares, in the language of the locale: the title for the locale itself, for
 * its main language, or the English one.
 */
export function titleOf(locale, connector) {
  const titles = connector.titles ?? {};
  const tag = String(locale ?? '');
  const main = tag.split('-')[0];
  const found = Object.keys(titles).find((key) => key.toLowerCase() === tag.toLowerCase())
    ?? Object.keys(titles).find((key) => key.toLowerCase() === main.toLowerCase());
  return found ? titles[found] : connector.title;
}

/** The kind of a piece in the language of the locale: the words of the kinds it knows, or the kind itself. */
export function kindName(locale, kind) {
  return MESSAGES[languageOf(locale)].kind[kind] ?? MESSAGES.en.kind[kind] ?? kind;
}

/**
 * A text attribute of the contribution of another extension in the language of the locale (MK-053):
 * from its i18n block for the locale or its main language, otherwise the attribute itself.
 */
export function contributionText(contribution, key, locale) {
  const attributes = contribution?.attributes ?? {};
  const i18n = attributes.i18n ?? {};
  const tag = String(locale ?? '').toLowerCase();
  const main = tag.split('-')[0];
  for (const [language, texts] of Object.entries(i18n)) {
    if (language.toLowerCase() === tag && typeof texts?.[key] === 'string') {
      return texts[key];
    }
  }
  for (const [language, texts] of Object.entries(i18n)) {
    if (language.toLowerCase() === main && typeof texts?.[key] === 'string') {
      return texts[key];
    }
  }
  return typeof attributes[key] === 'string' ? attributes[key] : undefined;
}
