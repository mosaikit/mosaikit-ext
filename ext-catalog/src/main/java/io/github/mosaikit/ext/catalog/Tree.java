// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.sharing.Sharing;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * The tree of the organization as the person of one request sees it (EXT-001). The kernel keeps the
 * grants of each item (MK-055) and does not pass them from a folder to what it holds; the catalog
 * does: the level of the person on an item is the highest of their levels on it and on the folders
 * above it. One instance serves one request and remembers what it asked the kernel.
 */
final class Tree {

    private final Items items;
    private final Sharing sharing;
    private final Map<UUID, Optional<Item>> loaded = new HashMap<>();
    private final Map<UUID, Optional<String>> levels = new HashMap<>();
    private final Map<UUID, String> scopes = new HashMap<>();
    private final Map<UUID, String> scopesAbove = new HashMap<>();

    Tree(Items items, Sharing sharing) {
        this.items = items;
        this.sharing = sharing;
    }

    /** The reference of an item in the registry of the kernel. */
    static ResourceRef ref(Item item) {
        return ref(item.getKind(), item.getId());
    }

    static ResourceRef ref(String kind, UUID id) {
        return new ResourceRef(CatalogResource.EXTENSION, kind, id.toString());
    }

    /** An item of the organization, read or not. */
    Optional<Item> item(UUID id) {
        return loaded.computeIfAbsent(id, items::findById);
    }

    /** A folder the person reads; empty when it does not exist, is a file, or they cannot read it. */
    Optional<Item> readableFolder(UUID id) {
        return item(id).filter(Item::isFolder).filter(folder -> level(folder) != null);
    }

    /** The level of the person on an item, or {@code null} when they cannot read it. */
    String level(Item item) {
        Optional<String> known = levels.get(item.getId());
        if (known != null) {
            return known.orElse(null);
        }
        String own = sharing.level(ref(item)).orElse(null);
        String above = item.getParentId() == null
                ? null
                : item(item.getParentId()).map(this::level).orElse(null);
        String level = Levels.highest(own, above);
        levels.put(item.getId(), Optional.ofNullable(level));
        return level;
    }

    /** The folders from the highest one the person reads down to this folder, which is the last. */
    List<Item> path(Item folder) {
        List<Item> path = new ArrayList<>();
        Item step = folder;
        while (step != null && level(step) != null) {
            path.add(step);
            step = step.getParentId() == null ? null : item(step.getParentId()).orElse(null);
        }
        Collections.reverse(path);
        return path;
    }

    /**
     * What the person sees at the top of their tree: the items at the root they read, and the items
     * shared with them whose folder they cannot read.
     */
    List<Item> roots() {
        Set<UUID> direct = new HashSet<>();
        for (String kind : List.of(Item.FOLDER, Item.FILE)) {
            for (String id : sharing.visible(CatalogResource.EXTENSION, kind, Levels.READ)) {
                direct.add(UUID.fromString(id));
            }
        }
        if (direct.isEmpty()) {
            return List.of();
        }
        List<Item> roots = new ArrayList<>();
        for (Item item : items.findByIds(direct)) {
            loaded.put(item.getId(), Optional.of(item));
            if (item.getParentId() == null || item(item.getParentId()).map(this::level).isEmpty()) {
                roots.add(item);
            }
        }
        return roots;
    }

    /** The sharing state of an item, from its own grants and those of the folders above it. */
    SharingState sharingState(Item item) {
        String above = item.getParentId() == null
                ? SharingState.SCOPES.getFirst()
                : item(item.getParentId()).map(this::scopeWithAbove).orElse(SharingState.SCOPES.getFirst());
        return SharingState.of(scope(item), above);
    }

    private String scope(Item item) {
        return scopes.computeIfAbsent(item.getId(), _ -> SharingState.scopeOf(
                sharing.grants(ref(item)).stream().map(grant -> grant.subject().kind()).toList()));
    }

    private String scopeWithAbove(Item folder) {
        String known = scopesAbove.get(folder.getId());
        if (known != null) {
            return known;
        }
        String above = folder.getParentId() == null
                ? SharingState.SCOPES.getFirst()
                : item(folder.getParentId()).map(this::scopeWithAbove).orElse(SharingState.SCOPES.getFirst());
        String scope = SharingState.wider(scope(folder), above);
        scopesAbove.put(folder.getId(), scope);
        return scope;
    }
}
