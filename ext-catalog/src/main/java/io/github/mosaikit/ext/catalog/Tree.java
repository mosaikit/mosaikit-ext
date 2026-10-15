// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.sharing.Grant;
import dev.mosaikit.kernel.api.sharing.Sharing;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
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
 * grants of each item (MK-055) and, since folders and files declare {@code inherits: parent}
 * (MK-136), answers the level of the person on an item with those of the folders above it: the
 * catalog asks it and walks no folder for levels. One instance serves one request and remembers what
 * it asked the kernel.
 */
final class Tree {

    private final Items items;
    private final Sharing sharing;
    private final Map<UUID, Optional<Item>> loaded = new HashMap<>();
    private final Map<UUID, Optional<String>> levels = new HashMap<>();
    private final Map<UUID, List<Grant>> grants = new HashMap<>();
    private final Map<UUID, List<Grant>> inheritedGrants = new HashMap<>();
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

    /**
     * The level of the person on an item, or {@code null} when they cannot read it: the highest of
     * their levels on it and on the folders above it, as the kernel answers it (MK-136).
     */
    String level(Item item) {
        return levels.computeIfAbsent(item.getId(), _ -> sharing.level(ref(item))).orElse(null);
    }

    /**
     * Whether the person may share the item in the sharing dialog of the kernel: they hold its highest
     * level, as its owner, an administrator, or through a grant on it or on a folder above it (MK-055,
     * MK-136).
     */
    boolean canShare(Item item) {
        return Levels.ORDER.getLast().equals(level(item));
    }

    /** The grants of the item itself, links included, as the kernel keeps them. */
    List<Grant> grants(Item item) {
        return grants.computeIfAbsent(item.getId(), _ -> sharing.grants(ref(item)));
    }

    /**
     * The grants of the folders above the item that reach it, from its parent upwards, each naming the
     * folder that carries it in {@link Grant#resource()}, as the kernel answers them (MK-136).
     */
    List<Grant> inheritedGrants(Item item) {
        return inheritedGrants.computeIfAbsent(item.getId(), _ -> sharing.inheritedGrants(ref(item)));
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
        List<Item> visible = visibleItems();
        Set<UUID> readable = new HashSet<>();
        for (Item item : visible) {
            readable.add(item.getId());
        }
        List<Item> shared = new ArrayList<>();
        for (Item item : visible) {
            // A folder the person reads opens what it holds: since the kernel passes its level down,
            // the items they read inside it are visible too, and their parent among them.
            boolean inReadableFolder = item.getParentId() != null && readable.contains(item.getParentId());
            if (!inReadableFolder
                    && !ownedByPerson.test(item)
                    && grants(item).stream().anyMatch(reachesPerson)) {
                shared.add(item);
            }
        }
        return shared;
    }

    /**
     * The items the person reads, as the kernel answers them: those on which they hold a level of their
     * own and everything inside the folders they read (MK-136).
     */
    private List<Item> visibleItems() {
        Set<UUID> visible = new HashSet<>();
        for (String kind : List.of(Item.FOLDER, Item.FILE)) {
            for (String id : sharing.visible(CatalogResource.EXTENSION, kind, Levels.READ)) {
                visible.add(UUID.fromString(id));
            }
        }
        if (visible.isEmpty()) {
            return List.of();
        }
        List<Item> found = items.findByIds(visible);
        for (Item item : found) {
            loaded.put(item.getId(), Optional.of(item));
        }
        return found;
    }

    /** An item the person reads; empty when it does not exist or they cannot read it. */
    Optional<Item> readable(UUID id) {
        return item(id).filter(item -> level(item) != null);
    }

    /**
     * Everything a folder holds, at any depth, each folder before what it holds; empty for a file
     * (EXT-002). The person reads all of it, since a level on a folder counts on its content.
     */
    List<Item> contents(Item item) {
        List<Item> found = new ArrayList<>();
        if (!item.isFolder()) {
            return found;
        }
        Deque<Item> todo = new ArrayDeque<>();
        todo.add(item);
        while (!todo.isEmpty()) {
            Item folder = todo.poll();
            for (Item child : items.children(folder.getId())) {
                loaded.put(child.getId(), Optional.of(child));
                found.add(child);
                if (child.isFolder()) {
                    todo.add(child);
                }
            }
        }
        return found;
    }

    /** Whether a folder is the item itself or is inside it, at any depth. */
    boolean within(Item folder, Item item) {
        Item step = folder;
        while (step != null) {
            if (step.getId().equals(item.getId())) {
                return true;
            }
            step = step.getParentId() == null ? null : item(step.getParentId()).orElse(null);
        }
        return false;
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

    /**
     * The widest scope of the grants on a folder and on those above it, which reach what it holds:
     * asked once per folder, for all the items of a list.
     */
    private String scopeWithAbove(Item folder) {
        return scopesAbove.computeIfAbsent(folder.getId(), _ -> SharingState.wider(
                scope(folder),
                SharingState.scopeOf(inheritedGrants(folder).stream()
                        .map(grant -> grant.subject().kind())
                        .toList())));
    }
}
