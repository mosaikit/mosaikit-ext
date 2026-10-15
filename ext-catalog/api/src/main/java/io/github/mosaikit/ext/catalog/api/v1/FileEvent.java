// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.api.v1;

import java.util.Map;
import java.util.Objects;

/**
 * What happened to a file of a kind (EXT-105), which the catalog tells that kind in a job of the
 * organization ({@link FileKind#changed}).
 *
 * @param change what happened
 * @param file the file as it is now, or as it was for {@link Change#DELETED}
 * @param details more about the change, by change: {@code previousName} for {@link Change#RENAMED};
 *     {@code previousFolder} (empty for the root) for {@link Change#MOVED}; for {@link
 *     Change#SHARING_CHANGED} {@code sharing} ({@code granted}, {@code changed} or {@code revoked}),
 *     {@code on} (the file, or the folder above it whose share counts on it), {@code subject} ({@code
 *     person}, {@code group}, {@code organization}, {@code public} or {@code link}), {@code subjectId}
 *     for a person or a group, {@code level} and {@code previousLevel} for a change of level
 */
public record FileEvent(Change change, CatalogFile file, Map<String, String> details) {

    /** What can happen to a file. */
    public enum Change {
        /**
         * A file stored before the kind was there (or before its extension was active in the
         * organization), recognized when it became active; also a file of the kind, already known, when
         * its extension comes back, so that it can take up what it keeps of it.
         */
        RECOGNIZED,
        /** Stored: uploaded into a folder. */
        STORED,
        /** Its content replaced by another one, still of this kind. */
        REPLACED,
        /** Renamed in its folder. */
        RENAMED,
        /** Moved into another folder, alone or with a folder above it. */
        MOVED,
        /**
         * Deleted, alone or with a folder above it, or no longer of this kind after its content was
         * replaced; its content can no longer be read.
         */
        DELETED,
        /** Shared differently: a share of it, or of a folder above it, was granted, changed or revoked. */
        SHARING_CHANGED
    }

    public FileEvent {
        Objects.requireNonNull(change, "change");
        Objects.requireNonNull(file, "file");
        details = details == null ? Map.of() : Map.copyOf(details);
    }

    /** A detail of the change, or {@code null}. */
    public String detail(String name) {
        return details.get(name);
    }
}
