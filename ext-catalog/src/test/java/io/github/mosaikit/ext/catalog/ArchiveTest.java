// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** What a download holds: one file by its name, or the structure of the folders selected (EXT-002). */
@Tag("EXT-002")
class ArchiveTest {

    private static final UUID ORGANIZATION = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-15T10:00:00Z");

    private static Item folder(String name) {
        return Item.folder(ORGANIZATION, null, name, NOW);
    }

    private static Item file(String name) {
        return Item.file(UUID.randomUUID(), ORGANIZATION, null, name, UUID.randomUUID(), 1, "text/plain", NOW);
    }

    @Test
    void severalItemsAreOneArchiveThatKeepsTheStructureOfTheirFolders() {
        Item album = folder("Album");
        Item deeper = folder("Deeper");
        Item empty = folder("Nothing");
        Item one = file("one.txt");
        Item two = file("two.txt");
        Item report = file("report.txt");
        Map<Item, List<Item>> children = Map.of(album, List.of(deeper, empty, one), deeper, List.of(two), empty, List.of());

        List<Archive.Entry> entries = Archive.entries(List.of(album, report), children::get);

        assertEquals(
                List.of("Album/", "Album/Deeper/", "Album/Deeper/two.txt", "Album/Nothing/", "Album/one.txt", "report.txt"),
                entries.stream().map(Archive.Entry::path).toList());
        // A folder is an entry without content; a file names its item and its content in the file service.
        assertNull(entries.getFirst().file());
        assertEquals(two.getId(), entries.get(2).item());
        assertEquals(two.getFileId(), entries.get(2).file());
    }

    @Test
    void oneFileIsItsNameAlone() {
        Item report = file("final report.txt");
        assertEquals(List.of("final report.txt"), Archive.entries(List.of(report), _ -> List.of()).stream()
                .map(Archive.Entry::path)
                .toList());
    }

    @Test
    void itemsOfTheSameNameFromSeveralFoldersAreNumbered() {
        List<Archive.Entry> entries =
                Archive.entries(List.of(file("notes.txt"), file("Notes.txt"), file("notes.txt"), folder("notes")), _ -> List.of());
        assertEquals(
                List.of("notes.txt", "Notes (2).txt", "notes (3).txt", "notes/"),
                entries.stream().map(Archive.Entry::path).toList());
    }

    @Test
    void theEntriesAreKeptAsJsonWithTheirLinks() {
        ObjectMapper mapper = new ObjectMapper();
        List<Archive.Entry> entries = List.of(
                new Archive.Entry("Album/", null, null, null),
                new Archive.Entry("Album/one.txt", UUID.randomUUID(), UUID.randomUUID(), null)
                        .signed("/api/v1/files/signed/o/e/f?expires=1&signature=s"));
        assertEquals(entries, Archive.read(mapper, Archive.json(mapper, entries)));
    }
}
