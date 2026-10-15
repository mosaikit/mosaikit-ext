// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.files.FileContent;
import dev.mosaikit.kernel.api.files.FileStorage;
import dev.mosaikit.kernel.api.files.SignedLink;
import io.github.mosaikit.ext.catalog.api.v1.CatalogFile;
import io.github.mosaikit.ext.catalog.api.v1.FileState;
import java.io.InputStream;
import java.time.Duration;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

/**
 * A file of the catalog as its kind sees it (EXT-105), backed by the item of the catalog: its content is
 * read through the file service of the kernel under the catalog (MK-041), which the extension of the kind
 * could not read under its own name, and so are the signed links to it (EXT-107), which name the content
 * the file has now: replacing or deleting the file deletes that content, and its links answer 404.
 */
final class KindedFile implements CatalogFile {

    private final Item item;
    private final String kind;
    private final Items items;
    private final FileStorage files;
    private final FileKindEvents events;

    KindedFile(Item item, String kind, Items items, FileStorage files, FileKindEvents events) {
        this.item = item;
        this.kind = kind;
        this.items = items;
        this.files = files;
        this.events = events;
    }

    @Override
    public UUID id() {
        return item.getId();
    }

    @Override
    public String name() {
        return item.getName();
    }

    @Override
    public String mediaType() {
        return item.getContentType();
    }

    @Override
    public long size() {
        return item.getSize() == null ? 0 : item.getSize();
    }

    @Override
    public Optional<UUID> folder() {
        return Optional.ofNullable(item.getParentId());
    }

    @Override
    public List<String> path() {
        return List.copyOf(events.path(item));
    }

    @Override
    public String kind() {
        return kind;
    }

    @Override
    public Optional<FileState> state() {
        return kind.equals(item.getFileKind()) && item.getKindState() != null
                ? Optional.of(new FileState(item.getKindState(), item.getKindStateDetail()))
                : Optional.empty();
    }

    @Override
    public InputStream open() {
        try {
            FileContent content = files.read(CatalogResource.EXTENSION, item.getFileId());
            return content.stream();
        } catch (NoSuchElementException e) {
            throw new IllegalStateException("The content of " + item.getName() + " is gone", e);
        }
    }

    @Override
    public SignedLink link(Duration validFor) {
        try {
            return files.link(CatalogResource.EXTENSION, item.getFileId(), validFor);
        } catch (NoSuchElementException e) {
            throw new IllegalStateException("The content of " + item.getName() + " is gone", e);
        }
    }

    @Override
    public void record(FileState state) {
        Item current = items.findById(item.getId()).orElse(null);
        if (current == null || !kind.equals(current.getFileKind())) {
            return;
        }
        current.recordState(state == null ? null : state.value(), state == null ? null : state.detail());
        items.update(current);
        item.recordState(current.getKindState(), current.getKindStateDetail());
    }

    /**
     * A file deleted from the catalog, or no longer of the kind, as it was (EXT-105): its content can no
     * longer be read, and no state can be recorded on it.
     */
    record Gone(
            UUID id,
            String name,
            String mediaType,
            long size,
            Optional<UUID> folder,
            List<String> path,
            String kind,
            Optional<FileState> state)
            implements CatalogFile {

        @Override
        public InputStream open() {
            throw new IllegalStateException("The file " + name + " was deleted: its content is gone");
        }

        @Override
        public SignedLink link(Duration validFor) {
            throw new IllegalStateException("The file " + name + " was deleted: its content is gone");
        }

        @Override
        public void record(FileState newState) {
            // Nothing to record on a file that is gone.
        }
    }
}
