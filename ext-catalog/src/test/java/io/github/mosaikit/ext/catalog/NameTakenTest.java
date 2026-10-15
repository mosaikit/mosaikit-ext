// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** A name already used in a folder is refused, naming the item that has it (EXT-002). */
@Tag("EXT-002")
class NameTakenTest {

    private static final UUID ORGANIZATION = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-15T10:00:00Z");

    private final Item docs = Item.folder(ORGANIZATION, null, "Docs", NOW);
    private final Item report =
            Item.file(UUID.randomUUID(), ORGANIZATION, null, "Report.txt", UUID.randomUUID(), 3, "text/plain", NOW);

    @Test
    void theConflictNamesTheExistingItem() {
        WebApplicationException refused = assertThrows(
                WebApplicationException.class, () -> CatalogResource.checkFree("report.TXT", List.of(docs, report)));
        Response response = refused.getResponse();
        assertEquals(409, response.getStatus());
        @SuppressWarnings("unchecked")
        Map<String, Object> problem = (Map<String, Object>) response.getEntity();
        assertEquals("This folder already holds a file named Report.txt.", problem.get("detail"));
        assertEquals(Map.of("id", report.getId(), "kind", "file", "name", "Report.txt"), problem.get("existing"));

        Map<?, ?> folder = (Map<?, ?>) assertThrows(
                        WebApplicationException.class, () -> CatalogResource.checkFree("docs", List.of(docs, report)))
                .getResponse()
                .getEntity();
        assertEquals("This folder already holds a folder named Docs.", folder.get("detail"));
    }

    @Test
    void anItemRenamedDoesNotCollideWithItself() {
        assertDoesNotThrow(() -> CatalogResource.checkFree("REPORT.txt", List.of(docs, report), report.getId()));
    }

    @Test
    void renamingAndMovingKeepTheIdentity() {
        UUID id = report.getId();
        report.rename("Final.txt", NOW.plusSeconds(60));
        report.moveTo(docs.getId());
        assertEquals(id, report.getId());
        assertEquals("Final.txt", report.getName());
        assertEquals(docs.getId(), report.getParentId());
        assertEquals(NOW.plusSeconds(60), report.getChangedAt());
    }
}
