// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.api.v1;

import java.io.InputStream;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * A file of the catalog as a kind of file sees it (EXT-105): what it is, where it is, its content and
 * the state its kind recorded on it. The content stays in the file service of the platform (MK-041)
 * under the catalog, which the kind reads only through {@link #open()}.
 */
public interface CatalogFile {

    /** The identifier of the file in the catalog: the same while it is renamed, moved or replaced. */
    UUID id();

    /** Its name in its folder. */
    String name();

    /** The media type it was stored with. */
    String mediaType();

    /** Its size in bytes. */
    long size();

    /** The folder that holds it; empty at the root of the organization. */
    Optional<UUID> folder();

    /** The names of the folders above it, from the highest one down to its folder; empty at the root. */
    List<String> path();

    /** The kind of the file, {@code <extension>/<name>}, such as {@code org.example.notes/text-note}. */
    String kind();

    /** The state its kind recorded on it, if any. */
    Optional<FileState> state();

    /**
     * Reads its content; close the stream. Within the handling of an event or of a request of the
     * extension, while the file exists.
     *
     * @throws IllegalStateException when the content is gone, such as for a file deleted
     */
    InputStream open();

    /**
     * Records the state of the file, which the catalog shows with it; {@code null} removes it. Joins the
     * transaction of the caller. Does nothing on a file that is no longer of this kind or that is gone.
     */
    void record(FileState state);
}
