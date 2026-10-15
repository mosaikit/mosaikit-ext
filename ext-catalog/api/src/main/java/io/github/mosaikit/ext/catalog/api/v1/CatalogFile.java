// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.api.v1;

import dev.mosaikit.kernel.api.files.SignedLink;
import java.io.InputStream;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * A file of the catalog as a kind of file sees it (EXT-105): what it is, where it is, its content and
 * the state its kind recorded on it. The content stays in the file service of the platform (MK-041)
 * under the catalog, which the kind reads only through {@link #open()} or {@link #link(Duration)}, never
 * keeping a copy of its own (EXT-107).
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
     * A signed, expiring link to its content (EXT-107, MK-093), for work of the extension that goes on
     * outside the handling of an event or of a request, such as a process that loads the file into a
     * database or a tile store: whoever holds the link downloads the content, with ranges and cache
     * validators, without a session, at the address of the installation followed by {@link
     * SignedLink#path()}. The extension keeps the link, not a copy of the content, so the file counts
     * once against the storage of the organization.
     *
     * <p>The link names the content the file has now: it stops working when the file is deleted or its
     * content replaced, and a new link serves the new content (the catalog tells the kind {@code REPLACED}
     * or {@code DELETED}). Made in a job of the organization, it serves the content until it expires;
     * made in a request of a person, it carries their rights, and stops when they lose their access to
     * the file. Making it is in the audit log of the platform.
     *
     * @param validFor how long it works, at most what the installation allows ({@code
     *     mosaikit.files.link-max-validity}, 7 days unless set); {@code null} for the longest
     * @throws IllegalStateException when the content is gone, such as for a file deleted
     * @throws IllegalArgumentException when the validity is not positive or too long
     * @throws UnsupportedOperationException when the catalog installed is older than this method
     *     (ext-catalog-api 1.1.0): read the content with {@link #open()}
     * @since 1.1.0
     */
    default SignedLink link(Duration validFor) {
        throw new UnsupportedOperationException(
                "The catalog installed gives no links to the content of files: it needs ext-catalog-api 1.1.0");
    }

    /**
     * Records the state of the file, which the catalog shows with it; {@code null} removes it. Joins the
     * transaction of the caller. Does nothing on a file that is no longer of this kind or that is gone.
     */
    void record(FileState state);
}
