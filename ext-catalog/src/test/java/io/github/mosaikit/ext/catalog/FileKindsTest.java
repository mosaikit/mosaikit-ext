// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.mosaikit.kernel.api.contract.ContractImplementation;
import dev.mosaikit.kernel.api.contract.Contracts;
import dev.mosaikit.kernel.api.events.PlatformEvent;
import dev.mosaikit.kernel.api.events.PlatformEvents;
import dev.mosaikit.kernel.api.files.FileContent;
import dev.mosaikit.kernel.api.files.FileStorage;
import dev.mosaikit.kernel.api.files.SignedLink;
import dev.mosaikit.kernel.api.files.StoredFile;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent.Change;
import io.github.mosaikit.ext.catalog.api.v1.FileKind;
import io.github.mosaikit.ext.catalog.api.v1.FileSample;
import io.github.mosaikit.ext.catalog.api.v1.FileState;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Predicate;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * The kinds of files of other extensions (EXT-105): recognized by name, type or content, told what
 * happens to their files with the content readable, recording a state; and their files are recognized
 * again when their extension becomes active.
 */
@Tag("EXT-105")
class FileKindsTest {

    private static final UUID ORGANIZATION = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-15T10:00:00Z");
    private static final String NOTES = "org.example.notes";
    private static final String TABLES = "org.example.tables";

    private final CatalogJobsTest.FakeItems items = new CatalogJobsTest.FakeItems();
    private final ContentFiles files = new ContentFiles();
    private final RaisedEvents raised = new RaisedEvents();
    private final List<FileKind> active = new ArrayList<>();
    private final FileKinds kinds = new FileKinds(new FakeContracts(active));
    private final FileKindEvents events = new FileKindEvents(raised, items);
    private final FileKindJobs jobs = new FileKindJobs(items, files, kinds, events);

    private final TestKind notes = new TestKind(NOTES, "note", sample -> sample.extension().equals("note"));
    private final TestKind tables = new TestKind(
            TABLES, "csv", sample -> sample.isOfType("text/csv") || sample.startsWith("id,".getBytes()));

    private Item file(String name, String type, String content, UUID parent) {
        UUID stored = UUID.randomUUID();
        files.contents.put(stored, content.getBytes(StandardCharsets.UTF_8));
        Item item = Item.file(UUID.randomUUID(), ORGANIZATION, parent, name, stored, content.length(), type, NOW);
        items.insert(item);
        return item;
    }

    private static FileSample sample(String name, String type, String head) {
        return new FileSample(name, type, head.length(), head.getBytes(StandardCharsets.UTF_8));
    }

    /** Delivers the events of the catalog raised so far to its job, as the platform does. */
    private void deliver() {
        List<Map<String, ?>> pending = new ArrayList<>(raised.payloads);
        raised.payloads.clear();
        for (Map<String, ?> payload : pending) {
            jobs.handle(new PlatformEvent(
                    1, ORGANIZATION, CatalogResource.EXTENSION + ":file.changed", CatalogResource.EXTENSION,
                    new HashMap<>(payload), NOW, 1));
        }
    }

    @Test
    void theFirstKindThatRecognizesAFileByNameTypeOrContentIsItsKind() {
        List<FileKind> both = List.of(notes, tables);
        assertEquals(Optional.of(NOTES + "/note"), FileKinds.recognize(sample("plan.NOTE", "text/plain", ""), both));
        assertEquals(Optional.of(TABLES + "/csv"), FileKinds.recognize(sample("a.txt", "text/csv; charset=utf-8", ""), both));
        assertEquals(Optional.of(TABLES + "/csv"), FileKinds.recognize(sample("a.txt", "text/plain", "id,name"), both));
        assertEquals(Optional.empty(), FileKinds.recognize(sample("a.txt", "text/plain", "hello"), both));
    }

    @Test
    void aKindThatFailsDoesNotRecognizeAndAKindWithAnInvalidNameIsLeftOut() {
        TestKind failing = new TestKind("org.example.broken", "broken", sample -> {
            throw new IllegalStateException("bug");
        });
        assertEquals(
                Optional.of(NOTES + "/note"),
                FileKinds.recognize(sample("a.note", "text/plain", ""), List.of(failing, notes)));
        active.add(new TestKind("org.example.odd", "Not Valid", sample -> true));
        active.add(notes);
        assertEquals(List.of(notes), kinds.active());
        assertEquals(Optional.of(notes), kinds.find(NOTES + "/note"));
        assertEquals(Optional.empty(), kinds.find(TABLES + "/csv"));
    }

    @Test
    void theHeadOfAContentIsReadAndTheWholeContentStillFollows() throws IOException {
        byte[] content = new byte[FileSample.HEAD * 2 + 7];
        for (int i = 0; i < content.length; i++) {
            content[i] = (byte) i;
        }
        FileKinds.Head head = FileKinds.head(new ByteArrayInputStream(content));
        assertEquals(FileSample.HEAD, head.bytes().length);
        assertArrayEquals(content, head.content().readAllBytes());
        FileKinds.Head small = FileKinds.head(new ByteArrayInputStream("NOTE: hi".getBytes()));
        assertEquals("NOTE: hi", new String(small.bytes()));
        assertEquals("NOTE: hi", new String(small.content().readAllBytes()));
    }

    @Test
    void aKindIsToldTheChangesOfItsFilesWithTheirContentAndRecordsAState() {
        active.add(notes);
        Item folder = Item.folder(ORGANIZATION, null, "Notes", NOW);
        items.insert(folder);
        Item note = file("plan.note", "text/plain", "buy bread", folder.getId());
        note.recognizedAs(NOTES + "/note");
        events.raise(note, Change.STORED, Map.of());
        events.raise(note, Change.RENAMED, Map.of("previousName", "old.note"));
        deliver();

        assertEquals(List.of(Change.STORED, Change.RENAMED), notes.changes());
        FileEvent stored = notes.told.getFirst();
        assertEquals("buy bread", notes.contents.getFirst());
        assertEquals(note.getId(), stored.file().id());
        assertEquals(Optional.of(folder.getId()), stored.file().folder());
        assertEquals(List.of("Notes"), stored.file().path());
        assertEquals("old.note", notes.told.get(1).detail("previousName"));
        // The kind recorded its state on the file.
        Item kept = items.findById(note.getId()).orElseThrow();
        assertEquals("read", kept.getKindState());
        assertEquals("9 bytes", kept.getKindStateDetail());
    }

    @Test
    void aDeletedFileIsToldAsItWasWithoutContentAndAKindAbsentIsNotTold() {
        active.add(notes);
        Item note = file("gone.note", "text/plain", "x", null);
        note.recognizedAs(NOTES + "/note");
        note.recordState("read", "1 bytes");
        events.raise(note, Change.DELETED, Map.of());
        items.delete(note);
        deliver();
        FileEvent deleted = notes.told.getFirst();
        assertEquals(Change.DELETED, deleted.change());
        assertEquals("gone.note", deleted.file().name());
        assertEquals(Optional.of(FileState.of("read", "1 bytes")), deleted.file().state());
        assertThrows(IllegalStateException.class, () -> deleted.file().open());
        assertNull(notes.contents.getFirst());

        // Without its extension active, the kind is not told, and the event is done with.
        active.clear();
        Item other = file("other.note", "text/plain", "y", null);
        other.recognizedAs(NOTES + "/note");
        events.raise(other, Change.STORED, Map.of());
        deliver();
        assertEquals(1, notes.told.size());
    }

    @Test
    void aShareOfAFolderTellsTheKindsOfTheFilesItHolds() {
        active.add(notes);
        Item top = Item.folder(ORGANIZATION, null, "Top", NOW);
        items.insert(top);
        Item inner = Item.folder(ORGANIZATION, top.getId(), "Inner", NOW);
        items.insert(inner);
        Item note = file("deep.note", "text/plain", "deep", inner.getId());
        note.recognizedAs(NOTES + "/note");
        file("plain.txt", "text/plain", "plain", top.getId());

        jobs.handle(new PlatformEvent(
                1, ORGANIZATION, PlatformEvents.SHARING_GRANTED, PlatformEvents.KERNEL,
                Map.of("extension", CatalogResource.EXTENSION, "type", "folder", "id", top.getId().toString(),
                        "subject", "organization", "level", "read", "grant", UUID.randomUUID().toString()),
                NOW, 1));
        deliver();

        assertEquals(List.of(Change.SHARING_CHANGED), notes.changes());
        assertEquals(
                Map.of("sharing", "granted", "on", top.getId().toString(), "subject", "organization", "level", "read"),
                notes.told.getFirst().details());
    }

    @Test
    void whenAnExtensionBecomesActiveItsKindsRecognizeTheFilesStoredWithoutThem() {
        Item stored = file("before.note", "text/plain", "stored before", null);
        Item known = file("known.note", "text/plain", "known", null);
        known.recognizedAs(NOTES + "/note");
        Item table = file("rows.txt", "text/plain", "id,name", null);
        table.recognizedAs(TABLES + "/csv");
        Item plain = file("plain.txt", "text/plain", "plain", null);
        active.add(notes);
        active.add(tables);

        jobs.handle(new PlatformEvent(
                1, ORGANIZATION, PlatformEvents.EXTENSION_ACTIVATED, PlatformEvents.KERNEL,
                Map.of("extension", NOTES, "version", "1.0.0", "active", true, "reason", "installed"), NOW, 1));
        deliver();

        assertEquals(NOTES + "/note", items.findById(stored.getId()).orElseThrow().getFileKind());
        assertNull(items.findById(plain.getId()).orElseThrow().getFileKind());
        assertEquals(List.of(Change.RECOGNIZED, Change.RECOGNIZED), notes.changes());
        assertEquals(
                java.util.Set.of(stored.getId(), known.getId()),
                java.util.Set.copyOf(notes.told.stream().map(event -> event.file().id()).toList()));
        assertTrue(notes.contents.contains("stored before"));
        // The kinds of other extensions are left as they are.
        assertTrue(tables.told.isEmpty());
    }

    @Test
    void aFileReplacedByAnotherKindLosesTheStateOfTheOldOne() {
        Item item = Item.file(UUID.randomUUID(), ORGANIZATION, null, "a.txt", UUID.randomUUID(), 1, "text/plain", NOW);
        item.recognizedAs(NOTES + "/note");
        item.recordState("read", "1 bytes");
        item.recognizedAs(NOTES + "/note");
        assertEquals("read", item.getKindState());
        item.recognizedAs(TABLES + "/csv");
        assertNull(item.getKindState());
        assertNull(item.getKindStateDetail());
        item.recognizedAs(null);
        item.recordState("read", null);
        assertNull(item.getKindState(), "a file without kind has no state");
    }

    /** A kind that keeps what it is told and records how many bytes it read. */
    static final class TestKind implements FileKind {
        final String extension;
        final String name;
        final Predicate<FileSample> recognizes;
        final List<FileEvent> told = new ArrayList<>();
        final List<String> contents = new ArrayList<>();

        TestKind(String extension, String name, Predicate<FileSample> recognizes) {
            this.extension = extension;
            this.name = name;
            this.recognizes = recognizes;
        }

        @Override
        public String extension() {
            return extension;
        }

        @Override
        public String name() {
            return name;
        }

        @Override
        public boolean recognizes(FileSample sample) {
            return recognizes.test(sample);
        }

        @Override
        public void changed(FileEvent event) {
            told.add(event);
            if (event.change() == Change.DELETED) {
                contents.add(null);
                return;
            }
            try (InputStream content = event.file().open()) {
                byte[] bytes = content.readAllBytes();
                contents.add(new String(bytes, StandardCharsets.UTF_8));
                if (event.change() == Change.STORED) {
                    event.file().record(FileState.of("read", bytes.length + " bytes"));
                }
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }

        List<Change> changes() {
            return told.stream().map(FileEvent::change).toList();
        }
    }

    record FakeContracts(List<FileKind> active) implements Contracts {
        @Override
        @SuppressWarnings("unchecked")
        public <T extends ContractImplementation> List<T> implementations(Class<T> contract) {
            return contract == FileKind.class ? (List<T>) List.copyOf(active) : List.of();
        }
    }

    static final class RaisedEvents implements PlatformEvents {
        final List<Map<String, ?>> payloads = new ArrayList<>();

        @Override
        public void raise(String extension, String name, Map<String, ?> payload) {
            assertEquals(CatalogResource.EXTENSION, extension);
            assertEquals("file.changed", name);
            payloads.add(payload);
        }
    }

    static final class ContentFiles implements FileStorage {
        final Map<UUID, byte[]> contents = new HashMap<>();

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
            byte[] content = contents.get(id);
            if (content == null) {
                throw new NoSuchElementException("No file " + id);
            }
            StoredFile stored = new StoredFile(
                    id, extension, "file", "text/plain", content.length, "0", null, null, null, NOW, NOW);
            return new FileContent(stored, new ByteArrayInputStream(content));
        }

        @Override
        public List<StoredFile> list(String extension, UUID team, int offset, int limit) {
            return List.of();
        }

        /** Signed links made so far, by the content they name (EXT-107). */
        final List<UUID> linked = new ArrayList<>();

        @Override
        public SignedLink link(String extension, UUID id, Duration validFor) {
            if (!contents.containsKey(id)) {
                throw new NoSuchElementException("No file " + id);
            }
            linked.add(id);
            Duration validity = validFor == null ? Duration.ofDays(7) : validFor;
            return new SignedLink(
                    "/api/v1/files/links/" + id + "?sig=1", "/api/v1/files/links/", "sig=1", NOW.plus(validity));
        }

        @Override
        public SignedLink linkToPrefix(String extension, String prefix, UUID team, Duration validFor) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void delete(String extension, UUID id) {
            contents.remove(id);
        }
    }
}
