// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.github.mosaikit.ext.catalog.connection.ConnectionResource.ContentsView;
import io.github.mosaikit.ext.catalog.connection.api.v1.ContentsUnavailableException;
import io.github.mosaikit.ext.catalog.connection.api.v1.Page;
import io.github.mosaikit.ext.catalog.connection.api.v1.Piece;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * The contents of every connector come in one shape, and a listing with nothing to show says why:
 * empty, unreachable, needing a declaration or not readable, never an empty list alone (EXT-019).
 */
@Tag("EXT-019")
class ContentsViewTest {

    @Test
    void aFirstPageWithoutPiecesIsAnEmptySourceAndALaterOneIsTheEndOfTheList() {
        assertEquals("empty", ContentsView.listed("", new Page<>(List.of(), false), true).state());
        assertEquals("listed", ContentsView.listed("", new Page<>(List.of(), false), false).state());
        ContentsView listed = ContentsView.listed("sales", new Page<>(List.of(new Piece("sales/a", "a", "table", false)), true), true);
        assertEquals("listed", listed.state());
        assertNull(listed.detail());
        assertEquals(true, listed.more());
    }

    @Test
    void eachReasonOfAConnectorHasItsOwnState() {
        assertEquals(
                "unreachable",
                ContentsView.unavailable("", ContentsUnavailableException.unreachable("refused")).state());
        assertEquals(
                "needs-declaration",
                ContentsView.unavailable("", ContentsUnavailableException.needsDeclaration("no description")).state());
        ContentsView notReadable = ContentsView.unavailable("x", ContentsUnavailableException.notReadable("not yet"));
        assertEquals("not-readable", notReadable.state());
        assertEquals("not yet", notReadable.detail());
        assertEquals(List.of(), notReadable.items());
    }

    @Test
    void aPieceKeepsItsFactsInOrderWithoutNulls() {
        Map<String, Object> facts = new HashMap<>();
        facts.put("columns", List.of());
        facts.put("unknown", null);
        Piece piece = new Piece("t", "t", "table", false, facts);
        assertEquals(Map.of("columns", List.of()), piece.facts());
        assertEquals(Map.of(), new Piece("t", "t", "table", false, null).facts());
        assertThrows(UnsupportedOperationException.class, () -> piece.facts().put("more", 1));
    }
}
