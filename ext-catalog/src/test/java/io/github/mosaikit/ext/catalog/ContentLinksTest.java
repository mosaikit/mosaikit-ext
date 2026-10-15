// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.mosaikit.kernel.api.events.PlatformEvent;
import dev.mosaikit.kernel.api.files.SignedLink;
import io.github.mosaikit.ext.catalog.api.v1.CatalogFile;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent.Change;
import io.github.mosaikit.ext.catalog.api.v1.FileKind;
import io.github.mosaikit.ext.catalog.api.v1.FileSample;
import io.github.mosaikit.ext.catalog.api.v1.FileState;
import java.io.InputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * The content of a file of a kind through a signed link of the platform (EXT-107): the kind keeps the
 * link, never a copy; the link names the content the file has, so a file replaced or deleted is no longer
 * served by it, and a new link serves the new content.
 */
@Tag("EXT-107")
class ContentLinksTest {

    private static final UUID ORGANIZATION = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-15T10:00:00Z");
    private static final String TILES = "org.example.tiles";

    private final CatalogJobsTest.FakeItems items = new CatalogJobsTest.FakeItems();
    private final FileKindsTest.ContentFiles files = new FileKindsTest.ContentFiles();
    private final FileKindsTest.RaisedEvents raised = new FileKindsTest.RaisedEvents();
    private final LinkingKind kind = new LinkingKind();
    private final FileKinds kinds = new FileKinds(new FileKindsTest.FakeContracts(List.of(kind)));
    private final FileKindEvents events = new FileKindEvents(raised, items);
    private final FileKindJobs jobs = new FileKindJobs(items, files, kinds, events);

    private UUID store(String content) {
        UUID stored = UUID.randomUUID();
        files.contents.put(stored, content.getBytes());
        return stored;
    }

    @Test
    void theKindGetsALinkToTheContentInAJobAndKeepsNoCopy() {
        UUID content = store("rows of a table");
        Item item = Item.file(UUID.randomUUID(), ORGANIZATION, null, "big.tiles", content, 15, "text/plain", NOW);
        item.recognizedAs(TILES + "/tiles");
        items.insert(item);
        events.raise(item, Change.STORED, Map.of());
        deliver();

        SignedLink link = kind.links.get(item.getId());
        assertEquals(List.of(content), files.linked, "the link names the content of the file in the platform");
        assertTrue(link.path().contains(content.toString()));
        assertEquals(NOW.plus(Duration.ofHours(1)), link.expires());
        // The kind never opened the content to keep it: the only bytes stored are those of the catalog.
        assertEquals(1, files.contents.size());
        assertEquals(Optional.of(FileState.of("linked")), items.findById(item.getId()).flatMap(found ->
                Optional.ofNullable(found.getKindState()).map(FileState::of)));
    }

    @Test
    void aReplacedFileGivesALinkToItsNewContentAndADeletedFileNone() {
        UUID first = store("first");
        Item item = Item.file(UUID.randomUUID(), ORGANIZATION, null, "a.tiles", first, 5, "text/plain", NOW);
        item.recognizedAs(TILES + "/tiles");
        items.insert(item);
        events.raise(item, Change.STORED, Map.of());
        deliver();

        // Replaced as ItemResource does: the new content, then the old one deleted from the platform.
        UUID second = store("second");
        item.replaceContent(second, 6, "text/plain", NOW);
        events.raise(item, Change.REPLACED, Map.of());
        files.delete(CatalogResource.EXTENSION, first);
        deliver();
        assertEquals(List.of(first, second), files.linked);
        assertFalse(files.contents.containsKey(first), "the content the first link named is gone");
        assertTrue(kind.links.get(item.getId()).path().contains(second.toString()));

        // A content gone, and a file deleted, give no link.
        CatalogFile stale = new KindedFile(item, TILES + "/tiles", items, files, events);
        files.delete(CatalogResource.EXTENSION, second);
        assertThrows(IllegalStateException.class, () -> stale.link(null));
        events.raise(item, Change.DELETED, Map.of());
        items.delete(item);
        deliver();
        assertThrows(IllegalStateException.class, () -> kind.deleted.link(Duration.ofMinutes(5)));
    }

    @Test
    void aCatalogOlderThanTheLinksSaysSo() {
        CatalogFile old = new KindedFile.Gone(
                UUID.randomUUID(), "x", "text/plain", 0, Optional.empty(), List.of(), TILES + "/tiles", Optional.empty());
        assertThrows(IllegalStateException.class, () -> old.link(null));
        CatalogFile withoutLinks = new CatalogFile() {
            public UUID id() { return UUID.randomUUID(); }
            public String name() { return "x"; }
            public String mediaType() { return "text/plain"; }
            public long size() { return 0; }
            public Optional<UUID> folder() { return Optional.empty(); }
            public List<String> path() { return List.of(); }
            public String kind() { return TILES + "/tiles"; }
            public Optional<FileState> state() { return Optional.empty(); }
            public InputStream open() { return InputStream.nullInputStream(); }
            public void record(FileState state) {}
        };
        UnsupportedOperationException refused =
                assertThrows(UnsupportedOperationException.class, () -> withoutLinks.link(null));
        assertTrue(refused.getMessage().contains("1.1.0"));
    }

    private void deliver() {
        List<Map<String, ?>> pending = new ArrayList<>(raised.payloads);
        raised.payloads.clear();
        for (Map<String, ?> payload : pending) {
            jobs.handle(new PlatformEvent(
                    1, ORGANIZATION, CatalogResource.EXTENSION + ":file.changed", CatalogResource.EXTENSION,
                    new HashMap<>(payload), NOW, 1));
        }
    }

    /** A kind that loads its files elsewhere from a link to their content, as a tile store would. */
    static final class LinkingKind implements FileKind {
        final Map<UUID, SignedLink> links = new HashMap<>();
        CatalogFile deleted;

        @Override
        public String extension() {
            return TILES;
        }

        @Override
        public String name() {
            return "tiles";
        }

        @Override
        public boolean recognizes(FileSample sample) {
            return sample.extension().equals("tiles");
        }

        @Override
        public void changed(FileEvent event) {
            if (event.change() == Change.DELETED) {
                links.remove(event.file().id());
                deleted = event.file();
                return;
            }
            links.put(event.file().id(), event.file().link(Duration.ofHours(1)));
            event.file().record(FileState.of("linked"));
        }
    }
}
