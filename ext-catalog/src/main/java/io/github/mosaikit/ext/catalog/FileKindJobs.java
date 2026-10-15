// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.events.PlatformEvent;
import dev.mosaikit.kernel.api.events.PlatformEventSubscriber;
import dev.mosaikit.kernel.api.events.PlatformEvents;
import dev.mosaikit.kernel.api.files.FileContent;
import dev.mosaikit.kernel.api.files.FileStorage;
import io.github.mosaikit.ext.catalog.api.v1.CatalogFile;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent.Change;
import io.github.mosaikit.ext.catalog.api.v1.FileKind;
import io.github.mosaikit.ext.catalog.api.v1.FileSample;
import io.github.mosaikit.ext.catalog.api.v1.FileState;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jboss.logging.Logger;

/**
 * The work of the kinds of files in jobs of the organization (EXT-105), on events of the platform
 * (MK-085), without a person:
 *
 * <ul>
 *   <li>{@code file.changed} of the catalog: tells the kind of the file what happened, with the file and
 *       its content; a kind whose extension is not active in the organization is not told.
 *   <li>{@code sharing.granted}, {@code sharing.changed}, {@code sharing.revoked} of a folder or a file of
 *       the catalog: a {@code file.changed} for each file of a kind that the share counts on.
 *   <li>{@code extension.activated}: the files that no kind recognized yet are shown to the kinds of
 *       the extension that became active, and the files of its kinds are given to it again, both as
 *       {@link Change#RECOGNIZED}: an extension installed again finds its files.
 * </ul>
 */
@ApplicationScoped
public class FileKindJobs implements PlatformEventSubscriber {

    private static final Logger LOG = Logger.getLogger(FileKindJobs.class);

    private static final Set<String> SHARING = Set.of(
            PlatformEvents.SHARING_GRANTED, PlatformEvents.SHARING_CHANGED, PlatformEvents.SHARING_REVOKED);

    private final Items items;
    private final FileStorage files;
    private final FileKinds kinds;
    private final FileKindEvents events;

    public FileKindJobs(Items items, FileStorage files, FileKinds kinds, FileKindEvents events) {
        this.items = items;
        this.files = files;
        this.kinds = kinds;
        this.events = events;
    }

    @Override
    public String extension() {
        return CatalogResource.EXTENSION;
    }

    /** A subscriber of its own, next to {@link CatalogJobs}: the kernel keeps what it delivered by name. */
    @Override
    public String name() {
        return "file-kinds";
    }

    @Override
    public Set<String> types() {
        return Set.of(
                CatalogResource.EXTENSION + ":" + FileKindEvents.FILE_CHANGED,
                PlatformEvents.SHARING_GRANTED,
                PlatformEvents.SHARING_CHANGED,
                PlatformEvents.SHARING_REVOKED,
                PlatformEvents.EXTENSION_ACTIVATED);
    }

    @Override
    public void handle(PlatformEvent event) {
        String type = event.type();
        if (type.equals(CatalogResource.EXTENSION + ":" + FileKindEvents.FILE_CHANGED)) {
            tell(event);
        } else if (SHARING.contains(type)) {
            if (CatalogResource.EXTENSION.equals(event.text("extension"))) {
                shared(event);
            }
        } else if (type.equals(PlatformEvents.EXTENSION_ACTIVATED)) {
            activated(event.text("extension"));
        }
    }

    /** Gives a change of a file to its kind, when the extension of the kind is active. */
    void tell(PlatformEvent event) {
        String kindId = event.text("kind");
        Optional<FileKind> kind = kinds.find(kindId);
        if (kind.isEmpty()) {
            return;
        }
        Change change = Change.valueOf(event.text("change"));
        UUID id = UUID.fromString(event.text("item"));
        CatalogFile file;
        if (change == Change.DELETED) {
            file = gone(event, id, kindId);
        } else {
            Item item = items.findById(id).orElse(null);
            if (item == null || !kindId.equals(item.getFileKind())) {
                // Deleted, or of another kind, since: an event of that change follows.
                return;
            }
            file = new KindedFile(item, kindId, items, files, events);
        }
        kind.get().changed(new FileEvent(change, file, details(event)));
    }

    /** A change of the sharing of a folder or a file: for each file of a kind that it counts on. */
    void shared(PlatformEvent event) {
        String type = event.text("type");
        UUID id;
        try {
            id = UUID.fromString(event.text("id"));
        } catch (IllegalArgumentException | NullPointerException e) {
            return;
        }
        Item item = items.findById(id).orElse(null);
        if (item == null || !(Item.FILE.equals(type) || Item.FOLDER.equals(type))) {
            return;
        }
        Map<String, String> details = new HashMap<>();
        details.put("sharing", event.type().substring(event.type().lastIndexOf('.') + 1));
        details.put("on", item.getId().toString());
        for (String key : List.of("subject", "subjectId", "level", "previousLevel")) {
            String value = event.text(key);
            if (value != null && !value.isEmpty()) {
                details.put(key, value);
            }
        }
        events.raiseForFiles(item.isFolder() ? contents(item) : List.of(item), Change.SHARING_CHANGED, details);
    }

    /**
     * An extension became active in the organization: the files without kind are shown to its kinds, and
     * the files of its kinds are given to it again. When the catalog itself becomes active, to every kind.
     */
    void activated(String extension) {
        if (extension == null) {
            return;
        }
        boolean catalog = CatalogResource.EXTENSION.equals(extension);
        List<FileKind> candidates = kinds.active().stream()
                .filter(kind -> catalog || kind.extension().equals(extension))
                .toList();
        if (candidates.isEmpty()) {
            return;
        }
        for (Item file : items.files()) {
            String kind = file.getFileKind();
            if (kind == null) {
                Optional<String> recognized = FileKinds.recognize(sample(file), candidates);
                if (recognized.isEmpty()) {
                    continue;
                }
                file.recognizedAs(recognized.get());
                items.update(file);
                events.raise(file, Change.RECOGNIZED, Map.of());
            } else if (candidates.stream().anyMatch(each -> FileKinds.id(each).equals(kind))) {
                events.raise(file, Change.RECOGNIZED, Map.of());
            }
        }
    }

    /** The sample of a stored file: its name, type, size and first bytes. */
    FileSample sample(Item file) {
        byte[] head = new byte[0];
        try (FileContent content = files.read(CatalogResource.EXTENSION, file.getFileId())) {
            head = content.stream().readNBytes(FileSample.HEAD);
        } catch (NoSuchElementException | IOException e) {
            LOG.debugf("The content of %s cannot be read to recognize its kind", file.getId());
        }
        return new FileSample(file.getName(), file.getContentType(), file.getSize() == null ? 0 : file.getSize(), head);
    }

    /** Every file a folder holds, at any depth. */
    private List<Item> contents(Item folder) {
        List<Item> found = new ArrayList<>();
        Deque<Item> todo = new ArrayDeque<>();
        todo.add(folder);
        while (!todo.isEmpty()) {
            for (Item child : items.children(todo.poll().getId())) {
                if (child.isFolder()) {
                    todo.add(child);
                } else {
                    found.add(child);
                }
            }
        }
        return found;
    }

    private static CatalogFile gone(PlatformEvent event, UUID id, String kind) {
        String parent = event.text("parent");
        Object path = event.payload().get("path");
        List<String> names = path instanceof List<?> list ? list.stream().map(String::valueOf).toList() : List.of();
        String state = event.text("state");
        String size = event.text("size");
        return new KindedFile.Gone(
                id,
                event.text("name"),
                event.text("contentType"),
                size == null ? 0 : new java.math.BigDecimal(size).longValue(),
                parent == null || parent.isEmpty() ? Optional.empty() : Optional.of(UUID.fromString(parent)),
                names,
                kind,
                state == null ? Optional.empty() : Optional.of(new FileState(state, event.text("stateDetail"))));
    }

    private static Map<String, String> details(PlatformEvent event) {
        Map<String, String> details = new HashMap<>();
        if (event.payload().get("details") instanceof Map<?, ?> map) {
            map.forEach((key, value) -> {
                if (value != null) {
                    details.put(String.valueOf(key), String.valueOf(value));
                }
            });
        }
        return details;
    }
}
