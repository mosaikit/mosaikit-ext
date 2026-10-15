// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0

/**
 * The texts of the pages of the extension, by language. The texts of the manifest (the title of the
 * app) are translated in its i18n blocks (MK-053); these are the texts the frontend renders, in the
 * language of context.locale. A new language is one more entry here and in the manifest.
 */
export const MESSAGES = {
  en: {
    title: 'Catalog',
    intro: 'The files of your organization, in folders and sub-folders.',
    version: 'Extension {id} {version}.',
    root: 'Files',
    breadcrumbs: 'Path',
    folders: 'Folders',
    content: 'Content of {name}',
    expand: 'Expand {name}',
    collapse: 'Collapse {name}',
    newFolder: 'New folder',
    folderName: 'Folder name',
    create: 'Create',
    cancel: 'Cancel',
    created: 'Folder {name} created.',
    notCreated: 'The folder cannot be created: {reason}',
    notLoaded: 'The folder cannot be loaded ({status}).',
    name: 'Name',
    size: 'Size',
    owner: 'Owner',
    changed: 'Last change',
    sharing: 'Sharing',
    folder: 'Folder',
    file: 'File',
    empty: 'This folder is empty.',
    emptyRoot: 'No folders yet. Create the first one with New folder.',
    notFound: 'Folder not found',
    notFoundText: 'It does not exist, or you do not have access to it.',
    backToRoot: 'Back to Files',
    items_zero: 'Empty',
    items_one: '1 item',
    items_other: '{count} items',
    theOrganization: 'The organization',
    scope_private: 'Private',
    scope_people: 'Shared',
    scope_organization: 'Whole organization',
    scope_link: 'Anyone with the link',
    scope_public: 'Public',
    inherited: '{scope} (from the folder)',
  },
  it: {
    title: 'Catalogo',
    intro: 'I file della tua organizzazione, in cartelle e sottocartelle.',
    version: 'Estensione {id} {version}.',
    root: 'File',
    breadcrumbs: 'Percorso',
    folders: 'Cartelle',
    content: 'Contenuto di {name}',
    expand: 'Espandi {name}',
    collapse: 'Comprimi {name}',
    newFolder: 'Nuova cartella',
    folderName: 'Nome della cartella',
    create: 'Crea',
    cancel: 'Annulla',
    created: 'Cartella {name} creata.',
    notCreated: 'Non è possibile creare la cartella: {reason}',
    notLoaded: 'Non è possibile caricare la cartella ({status}).',
    name: 'Nome',
    size: 'Dimensione',
    owner: 'Proprietario',
    changed: 'Ultima modifica',
    sharing: 'Condivisione',
    folder: 'Cartella',
    file: 'File',
    empty: 'Questa cartella è vuota.',
    emptyRoot: 'Ancora nessuna cartella. Crea la prima con Nuova cartella.',
    notFound: 'Cartella non trovata',
    notFoundText: 'Non esiste, oppure non hai accesso.',
    backToRoot: 'Torna a File',
    items_zero: 'Vuota',
    items_one: '1 elemento',
    items_other: '{count} elementi',
    theOrganization: "L'organizzazione",
    scope_private: 'Privato',
    scope_people: 'Condiviso',
    scope_organization: "Tutta l'organizzazione",
    scope_link: 'Chiunque abbia il link',
    scope_public: 'Pubblico',
    inherited: '{scope} (dalla cartella)',
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
