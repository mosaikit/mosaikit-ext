// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** The content of a folder is sorted by name or by date, folders first (EXT-001). */
@Tag("EXT-001")
class ListingTest {

    private static final UUID ORGANIZATION = UUID.randomUUID();
    private static final Instant T = Instant.parse("2026-10-15T08:00:00Z");

    private final Item beta = Item.folder(ORGANIZATION, null, "beta", T.plusSeconds(10));
    private final Item alpha = Item.folder(ORGANIZATION, null, "Alpha", T.plusSeconds(30));
    private final Item zeta = file("zeta.txt", T);
    private final Item eta = file("Eta.csv", T.plusSeconds(20));

    private static Item file(String name, Instant changed) {
        return Item.file(UUID.randomUUID(), ORGANIZATION, UUID.randomUUID(), name, UUID.randomUUID(), 10, "text/plain", changed);
    }

    private List<String> sorted(String sort, String order) {
        return List.of(beta, zeta, alpha, eta).stream()
                .sorted(Listing.order(sort, order))
                .map(Item::getName)
                .toList();
    }

    @Test
    void byNameFoldersFirstThenFilesWithoutRegardToCase() {
        assertEquals(List.of("Alpha", "beta", "Eta.csv", "zeta.txt"), sorted(null, null));
        assertEquals(List.of("Alpha", "beta", "Eta.csv", "zeta.txt"), sorted("name", "asc"));
        assertEquals(List.of("beta", "Alpha", "zeta.txt", "Eta.csv"), sorted("name", "desc"));
    }

    @Test
    void byDateNewestFirstUnlessAscending() {
        assertEquals(List.of("Alpha", "beta", "Eta.csv", "zeta.txt"), sorted("changed", null));
        assertEquals(List.of("beta", "Alpha", "zeta.txt", "Eta.csv"), sorted("changed", "asc"));
    }

    @Test
    void otherOrdersAreRefused() {
        assertThrows(IllegalArgumentException.class, () -> Listing.order("size", null));
        assertThrows(IllegalArgumentException.class, () -> Listing.order("name", "up"));
    }
}
