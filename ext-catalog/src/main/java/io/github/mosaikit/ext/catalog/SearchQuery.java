// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import java.util.Arrays;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * The query of the full-text search of PostgreSQL for a text (EXT-006, MK-040): every word a prefix,
 * all of them required ({@code budget:* & 2026:*}), with letters and digits only, so that it is bound
 * to {@code to_tsquery} as it is.
 */
final class SearchQuery {

    /** The query the platform gives, of exactly that form. */
    private static final Pattern GIVEN = Pattern.compile("[\\p{L}\\p{N}]+:\\*( & [\\p{L}\\p{N}]+:\\*)*");

    /** What separates words: anything but letters and digits. */
    private static final Pattern SEPARATOR = Pattern.compile("[^\\p{L}\\p{N}]+");

    /** The most words a query keeps. */
    static final int MAX_WORDS = 16;

    private SearchQuery() {}

    /**
     * The query for a search: the one the platform gave when it has the form, otherwise one made from the
     * text; {@code null} when the text has no word.
     */
    static String of(String text, String given) {
        if (given != null && given.length() <= 4 * SearchResource.MAX_QUERY && GIVEN.matcher(given).matches()) {
            return given;
        }
        if (text == null) {
            return null;
        }
        String limited = text.length() > SearchResource.MAX_QUERY ? text.substring(0, SearchResource.MAX_QUERY) : text;
        String query = Arrays.stream(SEPARATOR.split(limited.toLowerCase(Locale.ROOT)))
                .filter(word -> !word.isEmpty())
                .limit(MAX_WORDS)
                .map(word -> word + ":*")
                .collect(Collectors.joining(" & "));
        return query.isEmpty() ? null : query;
    }
}
