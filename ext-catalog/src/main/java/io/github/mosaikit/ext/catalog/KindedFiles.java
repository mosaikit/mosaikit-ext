// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.files.FileStorage;
import dev.mosaikit.kernel.api.sharing.Sharing;
import io.github.mosaikit.ext.catalog.api.v1.CatalogFile;
import io.github.mosaikit.ext.catalog.api.v1.CatalogFiles;
import io.quarkus.arc.Unremovable;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.ContextNotActiveException;
import jakarta.enterprise.inject.Instance;
import java.util.Optional;
import java.util.UUID;

/**
 * The files of the catalog for the extensions of their kinds, outside the events of their kinds
 * (EXT-105): a file of a kind of the extension that asks, in the organization of the request or of the
 * job, and in a request of a person only one they read. Other extensions find it through the API of the
 * catalog, so the bean stays even when nothing of the catalog injects it.
 */
@ApplicationScoped
@Unremovable
public class KindedFiles implements CatalogFiles {

    private final Items items;
    private final Sharing sharing;
    private final FileStorage files;
    private final FileKindEvents events;
    private final Instance<SecurityIdentity> identity;

    public KindedFiles(
            Items items, Sharing sharing, FileStorage files, FileKindEvents events, Instance<SecurityIdentity> identity) {
        this.items = items;
        this.sharing = sharing;
        this.files = files;
        this.events = events;
        this.identity = identity;
    }

    @Override
    public Optional<CatalogFile> find(String extension, UUID file) {
        if (extension == null || file == null) {
            return Optional.empty();
        }
        Optional<Item> found = person()
                ? new Tree(items, sharing).readable(file)
                : items.findById(file);
        return found.filter(item -> !item.isFolder())
                .filter(item -> item.getFileKind() != null
                        && FileKinds.extensionOf(item.getFileKind()).equals(extension))
                .map(item -> new KindedFile(item, item.getFileKind(), items, files, events));
    }

    /** Whether a person makes the request, rather than a job of the organization. */
    private boolean person() {
        try {
            return identity.isResolvable() && !identity.get().isAnonymous();
        } catch (ContextNotActiveException e) {
            return false;
        }
    }
}
