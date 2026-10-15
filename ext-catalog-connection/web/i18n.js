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
    contentsEmpty: 'Nothing here.',
    top: 'Top level',
    more: 'More',
    close: 'Close',
    required: 'required',
    category: {
      database: 'Database',
      warehouse: 'Data warehouse',
      lake: 'Data lake',
      api: 'API',
      stream: 'Stream',
      files: 'Files',
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
    contentsEmpty: 'Qui non c’è niente.',
    top: 'Livello principale',
    more: 'Altri',
    close: 'Chiudi',
    required: 'obbligatorio',
    category: {
      database: 'Database',
      warehouse: 'Data warehouse',
      lake: 'Data lake',
      api: 'API',
      stream: 'Flusso',
      files: 'File',
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
