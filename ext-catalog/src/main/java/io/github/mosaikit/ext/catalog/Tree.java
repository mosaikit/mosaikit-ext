// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.sharing.Grant;
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
import java.util.function.Predicate;

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
    private final Map<UUID, Optional<String>> ownLevels = new HashMap<>();
    private final Map<UUID, List<Grant>> grants = new HashMap<>();
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
        String own = ownLevel(item);
        String above = item.getParentId() == null
                ? null
                : item(item.getParentId()).map(this::level).orElse(null);
        String level = Levels.highest(own, above);
        levels.put(item.getId(), Optional.ofNullable(level));
        return level;
    }

    /**
     * The level of the person on the item itself, as the kernel answers it, without the folders above:
     * the one with which the kernel lets them share it, read its content in the file service or make
     * signed links to it (MK-055).
     */
    String ownLevel(Item item) {
        return ownLevels
                .computeIfAbsent(item.getId(), _ -> sharing.level(ref(item)))
                .orElse(null);
    }

    /**
     * Whether the person may share the item in the sharing dialog of the kernel: they hold its highest
     * level on the item itself, as its owner, an administrator or through a grant (MK-055). A level
     * that reaches them only through a folder above does not count, as the kernel does not know it.
     */
    boolean canShare(Item item) {
        return Levels.ORDER.getLast().equals(ownLevel(item));
    }

    /** The grants of the item itself, links included, as the kernel keeps them. */
    List<Grant> grants(Item item) {
        return grants.computeIfAbsent(item.getId(), _ -> sharing.grants(ref(item)));
    }

    /**
     * The folders above an item that the person reads, from its parent upwards: those whose grants
     * reach the item. A person who reads a folder reads everything in it, so they stop at the first
     * one the person cannot read.
     */
    List<Item> readableAncestors(Item item) {
        List<Item> above = new ArrayList<>();
        Item step = item.getParentId() == null ? null : item(item.getParentId()).orElse(null);
        while (step != null && level(step) != null) {
            above.add(step);
            step = step.getParentId() == null ? null : item(step.getParentId()).orElse(null);
        }
        return above;
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

    /** The items at the root of the organization that the person reads (EXT-001). */
    List<Item> roots() {
        return visibleItems().stream().filter(item -> item.getParentId() == null).toList();
    }

    /**
     * The items in Shared with me (EXT-003): those that a grant to the person, to a group of theirs or
     * to the organization opens to them, that someone else owns, and that are not inside a folder the
     * person reads already, where they are found in their place. A folder shared with them is listed,
     * not what it holds.
     *
     * @param reachesPerson whether a grant is to the person, to a group of theirs or to the
     *     organization of which they are a member
     * @param ownedByPerson whether the person owns an item
     */
    List<Item> sharedWithPerson(Predicate<Grant> reachesPerson, Predicate<Item> ownedByPerson) {
        List<Item> shared = new ArrayList<>();
        for (Item item : visibleItems()) {
            boolean inReadableFolder =
                    item.getParentId() != null && item(item.getParentId()).map(this::level).isPresent();
            if (!inReadableFolder
                    && !ownedByPerson.test(item)
                    && grants(item).stream().anyMatch(reachesPerson)) {
                shared.add(item);
            }
        }
        return shared;
    }

    /** The items on which the kernel gives the person a level of their own, without the folders above. */
    private List<Item> visibleItems() {
        Set<UUID> direct = new HashSet<>();
        for (String kind : List.of(Item.FOLDER, Item.FILE)) {
            for (String id : sharing.visible(CatalogResource.EXTENSION, kind, Levels.READ)) {
                direct.add(UUID.fromString(id));
            }
        }
        if (direct.isEmpty()) {
            return List.of();
        }
        List<Item> found = items.findByIds(direct);
        for (Item item : found) {
            loaded.put(item.getId(), Optional.of(item));
        }
        return found;
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
                grants(item).stream().map(grant -> grant.subject().kind()).toList()));
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
