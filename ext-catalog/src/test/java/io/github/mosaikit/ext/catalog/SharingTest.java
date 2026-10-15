// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.sharing.Grant;
import dev.mosaikit.kernel.api.sharing.SharedLink;
import dev.mosaikit.kernel.api.sharing.Sharing;
import dev.mosaikit.kernel.api.sharing.Subject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Sharing of folders and files (EXT-003), on a tree kept in memory and a kernel that answers as the
 * kernel does (MK-055, MK-136): the level of a person on an item is the highest of the one from its
 * owner and its grants and of their level on the folder above it, since folders and files inherit. The
 * catalog asks it and adds Shared with me and who has access through which share.
 */
@Tag("EXT-003")
class SharingTest {

    private static final UUID ORGANIZATION = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID TEAMMATE = UUID.randomUUID();
    private static final UUID OUTSIDER = UUID.randomUUID();
    private static final UUID TEAM = UUID.randomUUID();

    private final FakeItems items = new FakeItems();
    private final FakeKernel kernel = new FakeKernel(items);

    private Item projects;
    private Item drafts;
    private Item plan;
    private Item budget;

    @BeforeEach
    void tree() {
        kernel.teams.put(TEAMMATE, Set.of(TEAM));
        projects = add(Item.folder(ORGANIZATION, null, "Projects", Instant.now()));
        drafts = add(Item.folder(ORGANIZATION, projects.getId(), "Drafts", Instant.now()));
        plan = add(file(projects, "plan.txt"));
        budget = add(file(projects, "budget.txt"));
    }

    @Test
    void aFolderSharedWithAGroupGivesItsMembersEverythingInsideItAlsoWhatIsAddedLater() {
        kernel.grant(projects, Subject.group(TEAM), "edit");

        Tree teammate = as(TEAMMATE);
        assertEquals("edit", teammate.level(projects));
        assertEquals("edit", teammate.level(drafts));
        assertEquals("edit", teammate.level(plan));
        assertTrue(teammate.readableFolder(drafts.getId()).isPresent());

        Item later = add(file(drafts, "later.txt"));
        assertEquals("edit", as(TEAMMATE).level(later));

        // Someone outside the group reads nothing of it.
        Tree outsider = as(OUTSIDER);
        assertNull(outsider.level(projects));
        assertNull(outsider.level(later));
        assertTrue(outsider.readableFolder(projects.getId()).isEmpty());
    }

    @Test
    void aFileSharedWithOnePersonIsInTheirSharedWithMeAndTheRestOfTheFolderIsNot() {
        kernel.grant(projects, Subject.group(TEAM), "read");
        kernel.grant(plan, Subject.person(OUTSIDER), "read");

        Tree outsider = as(OUTSIDER);
        assertEquals(List.of(plan), shared(outsider, OUTSIDER));
        assertEquals("read", outsider.level(plan));
        assertNull(outsider.level(budget));
        assertNull(outsider.level(drafts));
        assertTrue(outsider.readableFolder(projects.getId()).isEmpty());
        // Not among the files of the organization: it is inside a folder they do not read.
        assertTrue(outsider.roots().isEmpty());

        // The folder shared with the group is in the Shared with me of its members, alone: what it holds
        // is found inside it.
        assertEquals(List.of(projects), shared(as(TEAMMATE), TEAMMATE));
        // The owner shared it, so it is not shared with them.
        assertTrue(shared(as(OWNER), OWNER).isEmpty());
    }

    @Test
    void theFolderShowsWhoHasAccessAndThroughWhichShare() {
        kernel.grant(projects, Subject.group(TEAM), "edit");
        Grant direct = kernel.grant(drafts, Subject.person(OUTSIDER), "read");
        Item notes = add(file(drafts, "notes.txt"));

        Access access = Access.of(as(OWNER), notes, kernel::owner, NAMES);
        assertEquals("manage", access.level());
        assertTrue(access.canShare());
        assertEquals(
                List.of(
                        "person Owner manage owner on the item",
                        "person Owner manage owner from Drafts",
                        "person Outsider read grant from Drafts",
                        "person Owner manage owner from Projects",
                        "group Team edit grant from Projects"),
                describe(access));

        // The person reached by the share of Drafts sees the shares of Drafts and below, not those of
        // Projects, which they do not read.
        Access theirs = Access.of(as(OUTSIDER), notes, kernel::owner, NAMES);
        assertEquals("read", theirs.level());
        assertFalse(theirs.canShare());
        assertEquals(
                List.of("person Owner manage owner on the item", "person Owner manage owner from Drafts", "person Outsider read grant from Drafts"),
                describe(theirs));
        assertEquals(direct.level(), theirs.entries().getLast().level());
    }

    @Test
    void theHighestLevelOnAFolderLetsAPersonShareWhatItHolds() {
        kernel.grant(projects, Subject.group(TEAM), "manage");
        Tree teammate = as(TEAMMATE);
        assertEquals("manage", teammate.level(plan));
        assertTrue(teammate.canShare(projects));
        // The kernel passes the level of the folder to the file, and lets them share it (MK-136).
        assertTrue(teammate.canShare(plan));
        assertTrue(as(OWNER).canShare(plan));

        kernel.grant(drafts, Subject.person(OUTSIDER), "edit");
        Item notes = add(file(drafts, "notes.txt"));
        assertFalse(as(OUTSIDER).canShare(notes));
    }

    @Test
    void removingAShareTakesEffectAtTheNextRequest() {
        Grant toTeam = kernel.grant(projects, Subject.group(TEAM), "read");
        Grant toOutsider = kernel.grant(plan, Subject.person(OUTSIDER), "read");
        assertEquals(List.of(projects), shared(as(TEAMMATE), TEAMMATE));
        assertEquals("read", as(TEAMMATE).level(budget));

        kernel.revoke(toTeam.id());
        kernel.revoke(toOutsider.id());

        Tree teammate = as(TEAMMATE);
        assertTrue(shared(teammate, TEAMMATE).isEmpty());
        assertTrue(teammate.readableFolder(projects.getId()).isEmpty());
        assertNull(teammate.level(budget));
        Tree outsider = as(OUTSIDER);
        assertTrue(shared(outsider, OUTSIDER).isEmpty());
        assertNull(outsider.level(plan));
    }

    @Test
    void aGrantReachesThePersonTheirGroupsAndTheMembersOfTheOrganization() {
        Viewer member = new Viewer(TEAMMATE, Set.of(TEAM), true);
        Viewer guest = new Viewer(OUTSIDER, Set.of(), false);
        ResourceRef ref = Tree.ref(plan);
        assertTrue(member.reaches(grant(ref, Subject.person(TEAMMATE))));
        assertTrue(member.reaches(grant(ref, Subject.group(TEAM))));
        assertTrue(member.reaches(grant(ref, Subject.organization())));
        assertFalse(member.reaches(grant(ref, Subject.person(OUTSIDER))));
        assertFalse(member.reaches(grant(ref, Subject.everyone())));
        assertFalse(guest.reaches(grant(ref, Subject.organization())));
        assertFalse(guest.reaches(grant(ref, Subject.group(TEAM))));
        assertTrue(member.owns(TEAMMATE));
        assertFalse(member.owns(null));
    }

    // --- The tree and the kernel in memory.

    private static final Access.Names NAMES = new Access.Names() {
        @Override
        public Access.Who person(UUID account) {
            String name = account.equals(OWNER) ? "Owner" : account.equals(TEAMMATE) ? "Teammate" : "Outsider";
            return new Access.Who("person", account, name, name.toLowerCase() + "@example.org", null);
        }

        @Override
        public String team(UUID team) {
            return "Team";
        }
    };

    private static List<String> describe(Access access) {
        return access.entries().stream()
                .map(entry -> entry.who().kind() + " " + entry.who().name() + " " + entry.level() + " " + entry.via()
                        + (entry.from() == null ? " on the item" : " from " + entry.from().name()))
                .toList();
    }

    private Tree as(UUID person) {
        kernel.viewer = person;
        return new Tree(items, kernel);
    }

    private List<Item> shared(Tree tree, UUID person) {
        Viewer viewer = new Viewer(person, kernel.teams.getOrDefault(person, Set.of()), true);
        return tree.sharedWithPerson(viewer::reaches, item -> viewer.owns(kernel.owner(item)));
    }

    private Item add(Item item) {
        items.insert(item);
        kernel.owners.put(item.getId(), OWNER);
        return item;
    }

    private static Item file(Item folder, String name) {
        return Item.file(UUID.randomUUID(), ORGANIZATION, folder.getId(), name, UUID.randomUUID(), 1, "text/plain", Instant.now());
    }

    private static Grant grant(ResourceRef ref, Subject subject) {
        return new Grant(UUID.randomUUID(), ref, subject, "read", OWNER, Instant.now());
    }

    private static final class FakeItems implements Items {
        private final Map<UUID, Item> all = new LinkedHashMap<>();

        @Override
        public Optional<Item> findById(UUID id) {
            return Optional.ofNullable(all.get(id));
        }

        @Override
        public List<Item> children(UUID parent) {
            return all.values().stream().filter(item -> parent.equals(item.getParentId())).toList();
        }

        @Override
        public List<Item> findByIds(Collection<UUID> ids) {
            return all.values().stream().filter(item -> ids.contains(item.getId())).toList();
        }

        @Override
        public List<UUID> parentsOfChildren(Collection<UUID> parents) {
            return all.values().stream()
                    .map(Item::getParentId)
                    .filter(parents::contains)
                    .toList();
        }

        @Override
        public List<Item> files() {
            return all.values().stream().filter(item -> !item.isFolder()).toList();
        }

        @Override
        public void insert(Item item) {
            all.put(item.getId(), item);
        }

        @Override
        public void update(Item item) {
            all.put(item.getId(), item);
        }

        @Override
        public void delete(Item item) {
            all.remove(item.getId());
        }
    }

    /**
     * The kernel as MK-055 and MK-136 have it: the owner and the grants of the resource, and the level on
     * its parent folder, for types that inherit as folders and files do.
     */
    private static final class FakeKernel implements Sharing {
        private final Items items;
        private final Map<UUID, UUID> owners = new HashMap<>();
        private final Map<UUID, Set<UUID>> teams = new HashMap<>();
        private final List<Grant> grants = new ArrayList<>();
        private UUID viewer;

        FakeKernel(Items items) {
            this.items = items;
        }

        UUID owner(Item item) {
            return owners.get(item.getId());
        }

        Grant grant(Item item, Subject subject, String level) {
            return grant(Tree.ref(item), subject, level);
        }

        @Override
        public Grant grant(ResourceRef resource, Subject subject, String level) {
            Grant grant = new Grant(UUID.randomUUID(), resource, subject, level, OWNER, Instant.now());
            grants.add(grant);
            return grant;
        }

        @Override
        public SharedLink createLink(ResourceRef resource, String level, Instant expires) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void revoke(UUID grant) {
            grants.removeIf(found -> found.id().equals(grant));
        }

        @Override
        public List<Grant> grants(ResourceRef resource) {
            return grants.stream().filter(grant -> grant.resource().equals(resource)).toList();
        }

        @Override
        public List<Grant> inheritedGrants(ResourceRef resource) {
            List<Grant> inherited = new ArrayList<>();
            Optional<Item> above = parent(resource);
            while (above.isPresent()) {
                inherited.addAll(grants(Tree.ref(above.get())));
                above = parent(Tree.ref(above.get()));
            }
            return inherited;
        }

        private Optional<Item> parent(ResourceRef resource) {
            return items.findById(UUID.fromString(resource.id()))
                    .map(Item::getParentId)
                    .flatMap(items::findById);
        }

        @Override
        public Optional<String> level(ResourceRef resource) {
            return level(viewer, resource);
        }

        @Override
        public Optional<String> level(UUID person, ResourceRef resource) {
            if (person.equals(owners.get(UUID.fromString(resource.id())))) {
                return Optional.of(Levels.MANAGE);
            }
            Viewer viewer = new Viewer(person, teams.getOrDefault(person, Set.of()), true);
            String level = parent(resource)
                    .flatMap(folder -> level(person, Tree.ref(folder)))
                    .orElse(null);
            for (Grant grant : grants(resource)) {
                if (viewer.reaches(grant)) {
                    level = highest(level, grant.level());
                }
            }
            return Optional.ofNullable(level);
        }

        private static String highest(String a, String b) {
            if (a == null) {
                return b;
            }
            return b == null || Levels.ORDER.indexOf(a) >= Levels.ORDER.indexOf(b) ? a : b;
        }

        @Override
        public boolean allows(ResourceRef resource, String level) {
            return Levels.atLeast(level(resource).orElse(null), level);
        }

        @Override
        public boolean allows(UUID person, ResourceRef resource, String level) {
            return Levels.atLeast(level(person, resource).orElse(null), level);
        }

        @Override
        public Set<String> visible(String extension, String type, String level) {
            return visible(viewer, extension, type, level);
        }

        @Override
        public Set<String> visible(UUID person, String extension, String type, String level) {
            return owners.keySet().stream()
                    .filter(id -> items.findById(id).map(Item::getKind).filter(type::equals).isPresent())
                    .map(id -> new ResourceRef(extension, type, id.toString()))
                    .filter(ref -> allows(person, ref, level))
                    .map(ResourceRef::id)
                    .collect(Collectors.toSet());
        }
    }
}
