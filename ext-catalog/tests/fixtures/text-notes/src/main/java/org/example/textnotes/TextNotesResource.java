// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.textnotes;

import dev.mosaikit.kernel.api.quota.Quotas;
import io.github.mosaikit.ext.catalog.api.v1.CatalogFile;
import io.github.mosaikit.ext.catalog.api.v1.CatalogFiles;
import io.github.mosaikit.ext.catalog.api.v1.FileState;
import io.quarkus.security.Authenticated;
import jakarta.enterprise.inject.Instance;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.ServiceUnavailableException;
import jakarta.ws.rs.core.MediaType;
import java.util.List;
import java.util.UUID;

/**
 * The API of the fixture, under {@code /api/v1/ext/text-notes} (EXT-105): the action "Count words" of a
 * note, which reads it through the catalog and records its state, the changes the kind was told, and the
 * storage the organization uses, which the notes count to once (EXT-107).
 */
@Path("/api/v1/ext/text-notes")
@Produces(MediaType.APPLICATION_JSON)
@Authenticated
public class TextNotesResource {

    /** The words of a note. */
    public record Count(UUID file, int words) {}

    /** The storage the organization uses, in bytes. */
    public record Storage(long used) {}

    private final Instance<CatalogFiles> catalog;
    private final ReceivedEvents received;
    private final Quotas quotas;

    public TextNotesResource(Instance<CatalogFiles> catalog, ReceivedEvents received, Quotas quotas) {
        this.catalog = catalog;
        this.received = received;
        this.quotas = quotas;
    }

    /** Counts the words of a note the person reads, and records them on it. */
    @POST
    @Path("notes/{id}/count")
    @Transactional
    public Count count(@PathParam("id") UUID id) {
        if (!catalog.isResolvable()) {
            throw new ServiceUnavailableException("The catalog is not installed.");
        }
        CatalogFile file = catalog.get().find(TextNoteKind.EXTENSION, id).orElseThrow(NotFoundException::new);
        int words = TextNoteKind.words(TextNoteKind.read(file));
        file.record(FileState.of("counted", words == 1 ? "1 word" : words + " words"));
        return new Count(id, words);
    }

    /** The changes the kind was told, in the order it was told them. */
    @GET
    @Path("events")
    public List<ReceivedEvents.Received> events() {
        return received.all();
    }

    /** The storage the organization of the person uses: its files, and what extensions report (MK-076). */
    @GET
    @Path("storage")
    @Transactional
    public Storage storage() {
        return new Storage(quotas.check(TextNoteKind.EXTENSION, "storage", 0).used());
    }
}
