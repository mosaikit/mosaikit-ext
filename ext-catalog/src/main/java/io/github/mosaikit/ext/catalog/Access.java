// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.sharing.Grant;
import dev.mosaikit.kernel.api.sharing.Subject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;

/**
 * Who has access to a folder or a file, and through which share (EXT-003): its owner and its own
 * grants, then the owner and the grants of each folder above it that the person reads, from the
 * nearest one upwards, since a level on a folder counts on everything it holds. The administrators of
 * the organization reach everything and are not listed.
 *
 * @param level the level of the person on the item
 * @param canShare whether the person may share it in the sharing dialog of the kernel (MK-055)
 * @param entries who has access, the item's own first
 */
public record Access(UUID id, String kind, String name, String level, boolean canShare, List<Entry> entries) {

    /** The entry of the owner of the item or of a folder above it. */
    public static final String OWNER = "owner";

    /** The entry of a grant of the sharing dialog. */
    public static final String GRANT = "grant";

    /**
     * Someone who has access.
     *
     * @param via {@value #OWNER} or {@value #GRANT}
     * @param from the folder above the item that gives the access, {@code null} when it is on the item
     *     itself
     */
    public record Entry(Who who, String level, String via, CatalogResource.Step from) {}

    /**
     * Who an entry is for.
     *
     * @param kind {@code person}, {@code group}, {@code organization}, {@code link} or {@code public}
     * @param id the account of a person, the team of a group, the link of a link
     * @param name the name of a person or a team, when known
     * @param email the address of a person
     * @param expires when a link stops working
     */
    public record Who(String kind, UUID id, String name, String email, Instant expires) {}

    /** What names the people and the teams of the organization. */
    interface Names {
        /** A person, with their name and address when known. */
        Who person(UUID account);

        /** The name of a team, or {@code null}. */
        String team(UUID team);
    }

    /**
     * Who has access to an item the person reads.
     *
     * @param owner the owner of an item, {@code null} when the organization owns it
     */
    static Access of(Tree tree, Item item, Function<Item, UUID> owner, Names names) {
        List<Entry> entries = new ArrayList<>();
        add(entries, tree, item, null, owner, names);
        for (Item folder : tree.readableAncestors(item)) {
            add(entries, tree, folder, new CatalogResource.Step(folder.getId(), folder.getName()), owner, names);
        }
        return new Access(
                item.getId(),
                item.getKind(),
                item.getName(),
                tree.level(item),
                tree.canShare(item),
                List.copyOf(entries));
    }

    private static void add(
            List<Entry> entries,
            Tree tree,
            Item item,
            CatalogResource.Step from,
            Function<Item, UUID> owner,
            Names names) {
        UUID account = owner.apply(item);
        if (account != null) {
            entries.add(new Entry(names.person(account), Levels.ORDER.getLast(), OWNER, from));
        }
        for (Grant grant : tree.grants(item)) {
            entries.add(new Entry(who(grant, names), grant.level(), GRANT, from));
        }
    }

    private static Who who(Grant grant, Names names) {
        return switch (grant.subject()) {
            case Subject.Person person -> names.person(person.account());
            case Subject.Group group -> new Who("group", group.team(), names.team(group.team()), null, null);
            case Subject.Organization _ -> new Who("organization", null, null, null, null);
            case Subject.Link link -> new Who("link", link.link(), null, null, link.expires());
            case Subject.Public _ -> new Who("public", null, null, null, null);
        };
    }
}
