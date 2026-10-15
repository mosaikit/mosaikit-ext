// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.events.PlatformEvent;
import dev.mosaikit.kernel.api.events.PlatformEventSubscriber;
import dev.mosaikit.kernel.api.events.PlatformEvents;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Set;

/**
 * The work of the catalog on events of the platform (MK-085), each in the organization of its event,
 * without a person.
 *
 * <p>{@code organization.deleted} (MK-130): an extension releases there only what it keeps outside the
 * database and the files of the kernel, and the catalog keeps nothing else: its folders and files are
 * rows of its schema with {@code organization_id}, resources of the kernel and files of its file
 * service. It leaves them all to the kernel, which keeps them for the retention of the installation, so
 * that a deletion can still be undone, then removes the rows and queues the content of the files for
 * the clean-up of the store (EXT-004). Destroying them here would make the deletion final at once.
 */
@ApplicationScoped
public class CatalogJobs implements PlatformEventSubscriber {

    @Override
    public String extension() {
        return CatalogResource.EXTENSION;
    }

    @Override
    public Set<String> types() {
        return Set.of(PlatformEvents.ORGANIZATION_DELETED);
    }

    @Override
    public void handle(PlatformEvent event) {
        if (PlatformEvents.ORGANIZATION_DELETED.equals(event.type())) {
            release();
        }
    }

    /**
     * Releases what the catalog keeps outside the database and the files of the kernel for the
     * organization: nothing yet. Its rows, resources and stored files stay for the kernel to remove.
     */
    void release() {
        // Nothing outside the kernel to release.
    }
}
