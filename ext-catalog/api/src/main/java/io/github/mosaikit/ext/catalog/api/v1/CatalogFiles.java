// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.api.v1;

import java.util.Optional;
import java.util.UUID;

/**
 * The files of the catalog for the extension of a kind, outside the events of {@link FileKind} (EXT-105):
 * for work that goes on after an event, such as a long load that records {@code loaded} when it ends, or
 * for a request of the extension, such as an action on a file. The catalog provides this bean while it
 * is installed; an extension that may run without the catalog looks it up rather than injecting it:
 *
 * <pre>{@code
 * @Inject Instance<CatalogFiles> catalog;
 *
 * if (catalog.isResolvable()) {
 *     catalog.get().find(id).ifPresent(file -> file.record(FileState.of("loaded")));
 * }
 * }</pre>
 */
public interface CatalogFiles {

    /**
     * A file of the organization of the request (or of the job) that is of a kind of the extension
     * asking; in a request of a person, only one they read. Empty otherwise, as for a file that does not
     * exist.
     *
     * @param extension the identifier of the extension asking, which implements the kind of the file
     */
    Optional<CatalogFile> find(String extension, UUID file);
}
