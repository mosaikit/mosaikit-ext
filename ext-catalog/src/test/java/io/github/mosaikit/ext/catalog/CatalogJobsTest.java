// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;

import dev.mosaikit.kernel.api.events.PlatformEvent;
import dev.mosaikit.kernel.api.events.PlatformEvents;
import java.lang.reflect.Constructor;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Deleting an organization removes its files from the storage (EXT-004): the kernel does it, after the
 * retention of the installation (MK-130), with the rows of the catalog; the catalog only releases what
 * it keeps outside the kernel, which is nothing, so that the deletion can be undone until then.
 */
@Tag("EXT-004")
class CatalogJobsTest {

    private static final UUID ORGANIZATION = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-15T10:00:00Z");

    private final CatalogJobs jobs = new CatalogJobs();

    @Test
    void itListensToTheDeletionOfTheOrganization() {
        assertEquals(CatalogResource.EXTENSION, jobs.extension());
        assertEquals(Set.of(PlatformEvents.ORGANIZATION_DELETED), jobs.types());
    }

    @Test
    void deletingTheOrganizationLeavesItsFoldersFilesAndContentToTheKernel() {
        // It holds neither the items, nor the resources, nor the file service: it cannot destroy them.
        assertEquals(List.of(), Arrays.asList(CatalogJobs.class.getDeclaredFields()));
        for (Constructor<?> constructor : CatalogJobs.class.getConstructors()) {
            assertEquals(0, constructor.getParameterCount());
        }
        PlatformEvent deleted = new PlatformEvent(
                1,
                ORGANIZATION,
                PlatformEvents.ORGANIZATION_DELETED,
                PlatformEvents.KERNEL,
                Map.of("slug", "example", "name", "Example", "removableFrom", NOW.plusSeconds(86_400).toString()),
                NOW,
                1);
        // Given twice, as an event may be, it changes nothing either time.
        jobs.handle(deleted);
        jobs.handle(deleted);
    }

    /** The items of an organization in memory, also for the tests of the kinds of files. */
    static final class FakeItems implements Items {
        private final Map<UUID, Item> rows = new LinkedHashMap<>();

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
            return ids.stream().map(rows::get).filter(Objects::nonNull).toList();
        }

        @Override
        public List<UUID> parentsOfChildren(Collection<UUID> parents) {
            return rows.values().stream()
                    .map(Item::getParentId)
                    .filter(parents::contains)
                    .toList();
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
    }
}
