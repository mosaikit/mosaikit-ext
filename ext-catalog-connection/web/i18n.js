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
  },
  it: {
    title: 'Connessioni',
    intro: 'Le connessioni della tua organizzazione alle sue fonti di dati.',
    version: 'Estensione {id} {version}.',
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
