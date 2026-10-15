// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * The query of the search of the catalog (EXT-006), the provider of the search of the platform (MK-040):
 * every word a prefix, all of them required, letters and digits only, so that it is bound to the query
 * as it is.
 */
@Tag("EXT-006")
class SearchQueryTest {

    @Test
    void everyWordOfTheTextIsThePrefixOfAWordOfTheName() {
        assertEquals("budget:* & 2026:*", SearchQuery.of("Budget 2026", null));
        assertEquals("rossi:* & città:*", SearchQuery.of("  Rossi, città!  ", null));
        assertEquals(
                "report:* & final:* & v2:* & pdf:* & drop:* & table:*",
                SearchQuery.of("report_final-v2.pdf'; drop table", null));
    }

    @Test
    void theQueryOfThePlatformIsTakenAsItIsWhenItHasItsForm() {
        assertEquals("ada:* & ros:*", SearchQuery.of("ada ros", "ada:* & ros:*"));
        // Anything else is made again from the text, so that nothing but words reaches the database.
        assertEquals("ada:*", SearchQuery.of("ada", "ada:* | (x"));
        assertEquals("ada:*", SearchQuery.of("ada", "ada"));
    }

    @Test
    void aTextWithoutWordsSearchesNothing() {
        assertNull(SearchQuery.of(null, null));
        assertNull(SearchQuery.of("  ...  ", null));
        assertNull(SearchQuery.of("", "bad"));
    }

    @Test
    void aLongTextKeepsItsFirstWords() {
        String query = SearchQuery.of("word ".repeat(100), null);
        assertEquals(SearchQuery.MAX_WORDS, query.split(" & ").length);
    }
}
