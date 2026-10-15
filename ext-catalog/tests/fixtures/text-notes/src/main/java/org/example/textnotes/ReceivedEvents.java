// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.textnotes;

import io.github.mosaikit.ext.catalog.api.v1.CatalogFile;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** The changes the kind was told, in memory, for the tests of the catalog to read (EXT-105). */
@ApplicationScoped
public class ReceivedEvents {

    /**
     * A change as the kind saw it.
     *
     * @param content the content of the file, read on the server; {@code null} for a file deleted
     * @param link the signed link to the content the kind got in its job, when it read the file through
     *     one (EXT-107)
     * @param linked what the kind read through that link
     */
    public record Received(
            String change,
            UUID file,
            String name,
            String mediaType,
            UUID folder,
            List<String> path,
            String kind,
            Map<String, String> details,
            String content,
            String link,
            String linked) {}

    private final List<Received> received = new ArrayList<>();

    synchronized void add(FileEvent event, String content, LinkedContent.Read read) {
        CatalogFile file = event.file();
        received.add(new Received(
                event.change().name(),
                file.id(),
                file.name(),
                file.mediaType(),
                file.folder().orElse(null),
                file.path(),
                file.kind(),
                event.details(),
                content,
                read == null ? null : read.link(),
                read == null ? null : read.content()));
    }

    synchronized List<Received> all() {
        return List.copyOf(received);
    }
}
