// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.mosaikit.kernel.api.events.PlatformEvent;
import dev.mosaikit.kernel.api.events.PlatformEventSubscriber;
import dev.mosaikit.kernel.api.events.PlatformEvents;
import dev.mosaikit.kernel.api.files.FileStorage;
import dev.mosaikit.kernel.api.files.SignedLink;
import dev.mosaikit.kernel.api.resource.Resources;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;

/**
 * The work of the catalog in jobs of an organization (EXT-002, EXT-004), on events of the platform
 * (MK-085): each runs in the organization of its event, without a person, so the file service of the
 * kernel applies the rules of the organization rather than the shares of one person.
 *
 * <ul>
 *   <li>{@code download.requested}: makes the signed links of a download that the kernel would not make
 *       for the person, because they reach a file only through a folder above it. The extension checked
 *       the person before it asked.
 *   <li>{@code removal.requested}: deletes the content of files deleted from the catalog that the person
 *       could not delete in the file service themselves, then removes their resources.
 *   <li>{@code content.discarded}: deletes a content that a file no longer has, replaced by another one
 *       (EXT-105), which the person could not delete themselves.
 *   <li>{@code organization.deleted}: deletes the content of every file of the organization from the
 *       storage, and its folders and files.
 * </ul>
 *
 * <p>Each is idempotent: a download already ready, or a removal already done, is left as it is.
 */
@ApplicationScoped
public class CatalogJobs implements PlatformEventSubscriber {

    private final Items items;
    private final Downloads downloads;
    private final PendingRemovals removals;
    private final FileStorage files;
    private final Resources resources;
    private final ObjectMapper mapper;

    public CatalogJobs(
            Items items,
            Downloads downloads,
            PendingRemovals removals,
            FileStorage files,
            Resources resources,
            ObjectMapper mapper) {
        this.items = items;
        this.downloads = downloads;
        this.removals = removals;
        this.files = files;
        this.resources = resources;
        this.mapper = mapper;
    }

    @Override
    public String extension() {
        return CatalogResource.EXTENSION;
    }

    @Override
    public Set<String> types() {
        return Set.of(
                own(DownloadResource.DOWNLOAD_REQUESTED),
                own(ItemResource.REMOVAL_REQUESTED),
                own(ItemResource.CONTENT_DISCARDED),
                PlatformEvents.ORGANIZATION_DELETED);
    }

    @Override
    public void handle(PlatformEvent event) {
        String type = event.type();
        if (type.equals(own(DownloadResource.DOWNLOAD_REQUESTED))) {
            sign(UUID.fromString(event.text("download")));
        } else if (type.equals(own(ItemResource.REMOVAL_REQUESTED))) {
            removePending();
        } else if (type.equals(own(ItemResource.CONTENT_DISCARDED))) {
            deleteContent(UUID.fromString(event.text("file")));
        } else if (type.equals(PlatformEvents.ORGANIZATION_DELETED)) {
            release();
        }
    }

    /** Makes the links of a pending download, valid for its validity from now. */
    void sign(UUID id) {
        Download download = downloads.findById(id).orElse(null);
        if (download == null || !Download.PENDING.equals(download.getStatus())) {
            return;
        }
        Duration validity = Duration.ofSeconds(download.getValidity());
        List<Archive.Entry> signed = new ArrayList<>();
        try {
            for (Archive.Entry entry : Archive.read(mapper, download.getEntries())) {
                if (entry.file() == null) {
                    signed.add(entry);
                } else {
                    SignedLink link = files.link(CatalogResource.EXTENSION, entry.file(), validity);
                    signed.add(entry.signed(link.path()));
                }
            }
            download.ready(Archive.json(mapper, signed), Instant.now().plus(validity));
        } catch (NoSuchElementException e) {
            // A file was deleted since the person asked.
            download.failed();
        }
        downloads.update(download);
    }

    /** Deletes the content of the files waiting for it, then their resources. */
    void removePending() {
        for (PendingRemoval removal : removals.all()) {
            deleteContent(removal.getFileId());
            resources.remove(Tree.ref(Item.FILE, removal.getItemId()));
            removals.delete(removal);
        }
    }

    /** Deletes the content of every file of the organization from the storage, then the catalog. */
    void release() {
        List<Item> all = items.all();
        for (Item item : all) {
            if (!item.isFolder()) {
                deleteContent(item.getFileId());
            }
        }
        for (PendingRemoval removal : removals.all()) {
            deleteContent(removal.getFileId());
            resources.remove(Tree.ref(Item.FILE, removal.getItemId()));
            removals.delete(removal);
        }
        for (Item item : all) {
            resources.remove(Tree.ref(item));
        }
        downloads.deleteAll();
        items.deleteAll();
    }

    private void deleteContent(UUID file) {
        try {
            files.delete(CatalogResource.EXTENSION, file);
        } catch (NoSuchElementException e) {
            // Already gone: an event given twice.
        }
    }

    private static String own(String name) {
        return CatalogResource.EXTENSION + ":" + name;
    }
}
