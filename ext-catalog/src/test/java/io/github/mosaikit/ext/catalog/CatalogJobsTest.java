// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.mosaikit.kernel.api.events.PlatformEvent;
import dev.mosaikit.kernel.api.events.PlatformEvents;
import dev.mosaikit.kernel.api.files.FileContent;
import dev.mosaikit.kernel.api.files.FileStorage;
import dev.mosaikit.kernel.api.files.SignedLink;
import dev.mosaikit.kernel.api.files.StoredFile;
import dev.mosaikit.kernel.api.resource.Resource;
import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.resource.Resources;
import java.io.InputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * The jobs of the catalog: the content of files always goes through the file service of the kernel,
 * which keeps it in its store (a directory or an S3 bucket), and out of it only through its signed,
 * expiring links (EXT-004).
 */
@Tag("EXT-004")
class CatalogJobsTest {

    private static final UUID ORGANIZATION = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-15T10:00:00Z");

    private final FakeItems items = new FakeItems();
    private final FakeDownloads downloads = new FakeDownloads();
    private final FakeRemovals removals = new FakeRemovals();
    private final FakeFiles files = new FakeFiles();
    private final FakeResources resources = new FakeResources();
    private final ObjectMapper mapper = new ObjectMapper();
    private final CatalogJobs jobs = new CatalogJobs(items, downloads, removals, files, resources, mapper);

    private Item stored(String name, UUID parent) {
        Item file = Item.file(UUID.randomUUID(), ORGANIZATION, parent, name, UUID.randomUUID(), 4, "text/plain", NOW);
        items.insert(file);
        files.store.add(file.getFileId());
        return file;
    }

    private static PlatformEvent event(String type, Map<String, Object> payload) {
        return new PlatformEvent(1, ORGANIZATION, type, CatalogResource.EXTENSION, payload, NOW, 1);
    }

    @Test
    void itListensToTheDeletionOfTheOrganizationAndToItsOwnRequests() {
        assertEquals(
                java.util.Set.of(
                        "io.github.mosaikit.ext.catalog:download.requested",
                        "io.github.mosaikit.ext.catalog:removal.requested",
                        "io.github.mosaikit.ext.catalog:content.discarded",
                        PlatformEvents.ORGANIZATION_DELETED),
                jobs.types());
    }

    @Test
    void deletingTheOrganizationRemovesItsFilesFromTheStorage() {
        Item folder = Item.folder(ORGANIZATION, null, "Album", NOW);
        items.insert(folder);
        Item one = stored("one.txt", folder.getId());
        Item two = stored("two.txt", null);
        UUID pending = UUID.randomUUID();
        files.store.add(pending);
        removals.insert(new PendingRemoval(
                Item.file(UUID.randomUUID(), ORGANIZATION, null, "gone.txt", pending, 1, "text/plain", NOW)));

        jobs.handle(event(PlatformEvents.ORGANIZATION_DELETED, Map.of("slug", "example")));

        // Through the file service, which deletes the content from its store.
        assertEquals(List.of(one.getFileId(), two.getFileId(), pending), files.deleted);
        assertTrue(files.store.isEmpty());
        assertTrue(items.all().isEmpty());
        assertTrue(removals.all().isEmpty());
        assertEquals(4, resources.removed.size());
        assertTrue(resources.removed.contains(Tree.ref(folder)));

        // Given twice, it does nothing more.
        jobs.handle(event(PlatformEvents.ORGANIZATION_DELETED, Map.of("slug", "example")));
        assertEquals(3, files.deleted.size());
    }

    @Test
    void aDownloadGetsSignedExpiringLinksOfTheFileService() {
        Item one = stored("one.txt", null);
        List<Archive.Entry> entries = List.of(
                new Archive.Entry("Album/", null, null, null),
                new Archive.Entry("Album/one.txt", one.getId(), one.getFileId(), null));
        Download download = new Download(ORGANIZATION, "member", "Album.zip", 120, Archive.json(mapper, entries), NOW);
        downloads.insert(download);

        jobs.handle(event(
                CatalogResource.EXTENSION + ":download.requested", Map.of("download", download.getId().toString())));

        assertEquals(Download.READY, download.getStatus());
        assertEquals(List.of(Duration.ofSeconds(120)), files.validities);
        List<Archive.Entry> signed = Archive.read(mapper, download.getEntries());
        assertEquals(null, signed.get(0).url());
        assertEquals("/api/v1/files/signed/" + one.getFileId() + "?expires=120", signed.get(1).url());
        assertNotNull(download.getExpires());
    }

    @Test
    void aDownloadWhoseFileIsGoneFails() {
        List<Archive.Entry> entries = List.of(new Archive.Entry("gone.txt", UUID.randomUUID(), UUID.randomUUID(), null));
        Download download = new Download(ORGANIZATION, "member", "gone.txt", 60, Archive.json(mapper, entries), NOW);
        downloads.insert(download);
        jobs.sign(download.getId());
        assertEquals(Download.FAILED, download.getStatus());
    }

    @Test
    void theContentOfFilesDeletedThroughAFolderLeavesTheStorageThenTheirResource() {
        Item theirs = stored("theirs.txt", UUID.randomUUID());
        removals.insert(new PendingRemoval(theirs));

        jobs.handle(event(CatalogResource.EXTENSION + ":removal.requested", Map.of("item", theirs.getId().toString())));

        assertEquals(List.of(theirs.getFileId()), files.deleted);
        assertEquals(List.of(Tree.ref(Item.FILE, theirs.getId())), resources.removed);
        assertTrue(removals.all().isEmpty());
    }

    /** The file service of the kernel: what its store holds, deleted and linked. */
    static final class FakeFiles implements FileStorage {
        final List<UUID> store = new ArrayList<>();
        final List<UUID> deleted = new ArrayList<>();
        final List<Duration> validities = new ArrayList<>();

        @Override
        public StoredFile store(String extension, NewFile file, InputStream content) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Optional<StoredFile> find(String extension, UUID id) {
            return Optional.empty();
        }

        @Override
        public FileContent read(String extension, UUID id) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<StoredFile> list(String extension, UUID team, int offset, int limit) {
            return List.of();
        }

        @Override
        public SignedLink link(String extension, UUID id, Duration validFor) {
            if (!store.contains(id)) {
                throw new NoSuchElementException("No file " + id);
            }
            validities.add(validFor);
            String base = "/api/v1/files/signed/";
            String query = "expires=" + validFor.toSeconds();
            return new SignedLink(base + id + "?" + query, base, query, NOW.plus(validFor));
        }

        @Override
        public SignedLink linkToPrefix(String extension, String prefix, UUID team, Duration validFor) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void delete(String extension, UUID id) {
            if (!store.remove(id)) {
                throw new NoSuchElementException("No file " + id);
            }
            deleted.add(id);
        }
    }

    static final class FakeResources implements Resources {
        final List<ResourceRef> removed = new ArrayList<>();

        @Override
        public Resource register(ResourceRef ref, Details details) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Resource update(ResourceRef ref, Details details) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void remove(ResourceRef ref) {
            removed.add(ref);
        }

        @Override
        public Optional<Resource> find(ResourceRef ref) {
            return Optional.empty();
        }

        @Override
        public List<Resource> list(String extension, String type, UUID owner) {
            return List.of();
        }
    }

    static final class FakeItems implements Items {
        private final Map<UUID, Item> rows = new java.util.LinkedHashMap<>();

        @Override
        public Optional<Item> findById(UUID id) {
            return Optional.ofNullable(rows.get(id));
        }

        @Override
        public List<Item> children(UUID parent) {
            return rows.values().stream().filter(item -> parent.equals(item.getParentId())).toList();
        }

        @Override
        public List<Item> findByIds(Collection<UUID> ids) {
            return ids.stream().map(rows::get).filter(java.util.Objects::nonNull).toList();
        }

        @Override
        public List<UUID> parentsOfChildren(Collection<UUID> parents) {
            return rows.values().stream()
                    .map(Item::getParentId)
                    .filter(parents::contains)
                    .toList();
        }

        @Override
        public List<Item> all() {
            return List.copyOf(rows.values());
        }

        @Override
        public List<Item> files() {
            return rows.values().stream().filter(item -> !item.isFolder()).toList();
        }

        @Override
        public void insert(Item item) {
            rows.put(item.getId(), item);
        }

        @Override
        public void update(Item item) {
            rows.put(item.getId(), item);
        }

        @Override
        public void delete(Item item) {
            rows.remove(item.getId());
        }

        @Override
        public void deleteAll() {
            rows.clear();
        }
    }

    static final class FakeDownloads implements Downloads {
        private final Map<UUID, Download> rows = new HashMap<>();

        @Override
        public Optional<Download> findById(UUID id) {
            return Optional.ofNullable(rows.get(id));
        }

        @Override
        public void insert(Download download) {
            rows.put(download.getId(), download);
        }

        @Override
        public void update(Download download) {
            rows.put(download.getId(), download);
        }

        @Override
        public void deleteBefore(Instant before) {}

        @Override
        public void deleteAll() {
            rows.clear();
        }
    }

    static final class FakeRemovals implements PendingRemovals {
        private final List<PendingRemoval> rows = new ArrayList<>();

        @Override
        public List<PendingRemoval> all() {
            return List.copyOf(rows);
        }

        @Override
        public void insert(PendingRemoval removal) {
            rows.add(removal);
        }

        @Override
        public void delete(PendingRemoval removal) {
            rows.remove(removal);
        }
    }
}
