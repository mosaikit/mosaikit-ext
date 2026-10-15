// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.mosaikit.kernel.api.events.PlatformEvent;
import dev.mosaikit.kernel.api.events.PlatformEvents;
import io.github.mosaikit.ext.catalog.CatalogResource.FileKindView;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent.Change;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * A file of a kind whose extension is absent (EXT-106): it keeps its kind and its state, the lists say
 * that the kind is not there, so that the app shows the placeholder of the platform, and the work on the
 * file goes on as on any other; when the extension comes back, the kind is there again.
 */
@Tag("EXT-106")
class AbsentFileKindsTest {

    private static final UUID ORGANIZATION = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-15T10:00:00Z");
    private static final String NOTES = "org.example.notes";

    private final CatalogJobsTest.FakeItems items = new CatalogJobsTest.FakeItems();
    private final FileKindsTest.ContentFiles files = new FileKindsTest.ContentFiles();
    private final FileKindsTest.RaisedEvents raised = new FileKindsTest.RaisedEvents();
    private final List<io.github.mosaikit.ext.catalog.api.v1.FileKind> active = new ArrayList<>();
    private final FileKinds kinds = new FileKinds(new FileKindsTest.FakeContracts(active));
    private final FileKindEvents events = new FileKindEvents(raised, items);
    private final FileKindJobs jobs = new FileKindJobs(items, files, kinds, events);
    private final FileKindsTest.TestKind notes =
            new FileKindsTest.TestKind(NOTES, "note", sample -> sample.extension().equals("note"));

    private Item note(String name) {
        UUID stored = UUID.randomUUID();
        files.contents.put(stored, "some words".getBytes());
        Item item = Item.file(UUID.randomUUID(), ORGANIZATION, null, name, stored, 10, "text/plain", NOW);
        item.recognizedAs(NOTES + "/note");
        item.recordState("read", "10 bytes");
        items.insert(item);
        return item;
    }

    @Test
    void aFileOfAnAbsentKindIsListedWithItsKindAndStateAsNotThere() {
        Item item = note("plan.note");
        FileKindView absent = FileKindView.of(item, Set.of());
        assertEquals(new FileKindView(NOTES, "note", "read", "10 bytes", false), absent);
        FileKindView there = FileKindView.of(item, Set.of(NOTES + "/note"));
        assertTrue(there.active());
        // A plain file and a folder have no kind.
        assertNull(FileKindView.of(Item.file(UUID.randomUUID(), ORGANIZATION, null, "a.txt", UUID.randomUUID(), 1,
                "text/plain", NOW), Set.of()));
        assertNull(FileKindView.of(Item.folder(ORGANIZATION, null, "Top", NOW), Set.of()));
    }

    @Test
    void whileItsExtensionIsAbsentTheFileKeepsItsKindAndStateThroughRenamesMovesAndShares() {
        Item item = note("kept.note");
        Item folder = Item.folder(ORGANIZATION, null, "Elsewhere", NOW);
        items.insert(folder);

        // The extension is absent: renamed, moved and shared, the file is told to no kind and keeps both.
        item.rename("renamed.note", NOW);
        events.raise(item, Change.RENAMED, Map.of("previousName", "kept.note"));
        item.moveTo(folder.getId());
        events.raise(item, Change.MOVED, Map.of());
        jobs.handle(new PlatformEvent(
                1, ORGANIZATION, PlatformEvents.SHARING_GRANTED, PlatformEvents.KERNEL,
                Map.of("extension", CatalogResource.EXTENSION, "type", "folder", "id", folder.getId().toString(),
                        "subject", "organization", "level", "read"),
                NOW, 1));
        deliver();
        // Another extension that becomes active leaves it as it is.
        jobs.handle(activated("org.example.other"));
        deliver();

        assertTrue(notes.told.isEmpty());
        Item kept = items.findById(item.getId()).orElseThrow();
        assertEquals(NOTES + "/note", kept.getFileKind());
        assertEquals("read", kept.getKindState());
        assertEquals("10 bytes", kept.getKindStateDetail());
        assertFalse(FileKindView.of(kept, Set.of()).active());

        // Back: the kind sees its file again, which is of its kind as before.
        active.add(notes);
        jobs.handle(activated(NOTES));
        deliver();
        assertEquals(List.of(Change.RECOGNIZED), notes.changes());
        assertEquals("renamed.note", notes.told.getFirst().file().name());
        assertTrue(FileKindView.of(items.findById(item.getId()).orElseThrow(),
                kinds.active().stream().map(FileKinds::id).collect(java.util.stream.Collectors.toSet())).active());
    }

    private static PlatformEvent activated(String extension) {
        return new PlatformEvent(
                1, ORGANIZATION, PlatformEvents.EXTENSION_ACTIVATED, PlatformEvents.KERNEL,
                Map.of("extension", extension, "version", "1.0.0", "active", true, "reason", "enabled"), NOW, 1);
    }

    private void deliver() {
        List<Map<String, ?>> pending = new ArrayList<>(raised.payloads);
        raised.payloads.clear();
        for (Map<String, ?> payload : pending) {
            jobs.handle(new PlatformEvent(
                    1, ORGANIZATION, CatalogResource.EXTENSION + ":file.changed", CatalogResource.EXTENSION,
                    new java.util.HashMap<>(payload), NOW, 1));
        }
    }
}
