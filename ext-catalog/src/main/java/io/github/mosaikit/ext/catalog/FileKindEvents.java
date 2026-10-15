// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.events.PlatformEvents;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent.Change;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Tells the kinds of files what happens to their files (EXT-105): each change of a file that has a kind
 * raises an event of the catalog, {@code file.changed}, in the transaction of the change (MK-085); a job
 * of the organization then gives it to the kind ({@link FileKindJobs}), so the kind is told only when the
 * change commits, at least once, and without slowing the request of the person.
 */
@ApplicationScoped
public class FileKindEvents {

    /** The event of the catalog for a change of a file of a kind. */
    static final String FILE_CHANGED = "file.changed";

    /** The longest path kept in an event; a longer one is left out, as the payload has a limit. */
    private static final int MAX_PATH = 4000;

    private final PlatformEvents events;
    private final Items items;

    public FileKindEvents(PlatformEvents events, Items items) {
        this.events = events;
        this.items = items;
    }

    /** Tells the kind of a file that it changed; nothing for a file without kind or a folder. */
    public void raise(Item file, Change change, Map<String, String> details) {
        if (!file.isFolder() && file.getFileKind() != null) {
            raise(file, file.getFileKind(), change, details);
        }
    }

    /** Tells a kind that a file changed, also one that is no longer of that kind. */
    public void raise(Item file, String kind, Change change, Map<String, String> details) {
        events.raise(CatalogResource.EXTENSION, FILE_CHANGED, payload(file, kind, change, details));
    }

    /** Tells the kinds of the files among some items, such as what a folder holds, that they changed. */
    public void raiseForFiles(List<Item> list, Change change, Map<String, String> details) {
        for (Item each : list) {
            raise(each, change, details);
        }
    }

    Map<String, Object> payload(Item file, String kind, Change change, Map<String, String> details) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("item", file.getId().toString());
        payload.put("kind", kind);
        payload.put("change", change.name());
        payload.put("name", file.getName());
        payload.put("contentType", file.getContentType());
        payload.put("size", file.getSize());
        payload.put("parent", file.getParentId() == null ? "" : file.getParentId().toString());
        if (change == Change.DELETED) {
            // The folders above it may be gone too when the kind is told.
            List<String> path = path(file);
            if (String.join("/", path).length() <= MAX_PATH) {
                payload.put("path", path);
            }
            if (kind.equals(file.getFileKind()) && file.getKindState() != null) {
                payload.put("state", file.getKindState());
                Optional.ofNullable(file.getKindStateDetail()).ifPresent(detail -> payload.put("stateDetail", detail));
            }
        }
        payload.put("details", details == null ? Map.of() : new HashMap<>(details));
        return payload;
    }

    /** The names of the folders above an item, from the highest one down to its folder. */
    List<String> path(Item item) {
        List<String> names = new ArrayList<>();
        UUID parent = item.getParentId();
        int steps = 0;
        while (parent != null && steps++ < 1000) {
            Optional<Item> folder = items.findById(parent);
            if (folder.isEmpty()) {
                break;
            }
            names.addFirst(folder.get().getName());
            parent = folder.get().getParentId();
        }
        return names;
    }
}
