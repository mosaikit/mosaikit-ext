// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.mosaikit.kernel.api.contract.ContractImplementation;
import dev.mosaikit.kernel.api.contract.Contracts;
import dev.mosaikit.kernel.api.resource.ResolvedReference;
import dev.mosaikit.kernel.api.resource.Resource;
import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.sharing.Grant;
import dev.mosaikit.kernel.api.sharing.SharedLink;
import dev.mosaikit.kernel.api.sharing.Sharing;
import dev.mosaikit.kernel.api.sharing.Subject;
import io.github.mosaikit.ext.catalog.api.v1.LinkedDocuments;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * Documents linked to resources of other extensions (EXT-006), on a tree kept in memory, a kernel that
 * answers the levels of a person and resolves references as MK-135 does, and an extension of records
 * that implements the contract linked-documents of the catalog (MK-134): documents are linked to a
 * record by those who edit it and read the document; each sheet lists the other side to those who read
 * it; a link stays while the extension of the record is absent.
 */
@Tag("EXT-006")
class DocumentLinkingTest {

    private static final UUID ORGANIZATION = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID EDITOR = UUID.randomUUID();
    private static final UUID READER = UUID.randomUUID();
    private static final String RECORDS = "org.example.records";
    private static final Instant NOW = Instant.parse("2026-10-15T10:00:00Z");

    private final CatalogJobsTest.FakeItems items = new CatalogJobsTest.FakeItems();
    private final FakeLinks links = new FakeLinks();
    private final FakeKernel kernel = new FakeKernel();
    private final FakeRecords records = new FakeRecords();
    private final Contracts contracts = new Contracts() {
        @Override
        @SuppressWarnings("unchecked")
        public <T extends ContractImplementation> List<T> implementations(Class<T> contract) {
            return contract == LinkedDocuments.class && kernel.active.contains(RECORDS)
                    ? List.of((T) records)
                    : List.of();
        }
    };

    private Item folder;
    private Item act;
    private ResourceRef green;

    @BeforeEach
    void tree() {
        folder = Item.folder(ORGANIZATION, null, "Acts", NOW);
        act = Item.file(UUID.randomUUID(), ORGANIZATION, folder.getId(), "act.pdf", UUID.randomUUID(), 3, "application/pdf", NOW);
        items.insert(folder);
        items.insert(act);
        kernel.levels(OWNER, Map.of(folder.getId(), Levels.MANAGE, act.getId(), Levels.MANAGE));
        green = new ResourceRef(RECORDS, "record", UUID.randomUUID().toString());
        kernel.readers.put(green, new HashSet<>(Set.of(OWNER, EDITOR, READER)));
        records.editors.put(green, Set.of(OWNER, EDITOR));
    }

    @Test
    void aDocumentLinkedToARecordIsListedOnTheRecordAndTheRecordOnTheDocument() {
        DocumentLinking.Linked linked = as(OWNER).link(act.getId(), green, NOW);

        assertTrue(linked.created());
        DocumentLinking.ResourceDocuments documents = as(OWNER).documentsOf(green);
        assertTrue(documents.canLink());
        assertEquals(List.of(act.getId()), documents.documents().stream().map(each -> each.file().getId()).toList());
        assertEquals(linked.link().getId(), documents.documents().getFirst().link());
        assertEquals(
                List.of(new DocumentLinking.LinkView(linked.link().getId(), green, true)),
                as(OWNER).linksOf(act));
        assertEquals(OWNER, linked.link().getCreatedBy());

        // Linked again, it is the same link.
        DocumentLinking.Linked again = as(OWNER).link(act.getId(), green, NOW);
        assertFalse(again.created());
        assertEquals(linked.link().getId(), again.link().getId());
        assertEquals(1, links.rows.size());
    }

    @Test
    void theRecordListsOnlyTheDocumentsThePersonReads() {
        Item annex = file("annex.pdf");
        kernel.levels(READER, Map.of(act.getId(), Levels.READ));
        as(OWNER).link(act.getId(), green, NOW);
        as(OWNER).link(annex.getId(), green, NOW);

        DocumentLinking.ResourceDocuments seen = as(READER).documentsOf(green);
        assertFalse(seen.canLink());
        assertEquals(List.of(act.getId()), seen.documents().stream().map(each -> each.file().getId()).toList());
        // Who neither edits the record nor the document may not remove its link.
        assertFalse(seen.documents().getFirst().canUnlink());
        assertEquals(2, as(OWNER).documentsOf(green).documents().size());
    }

    @Test
    void documentsAreLinkedByWhoReadsThemAndEditsTheRecord() {
        kernel.levels(EDITOR, Map.of(act.getId(), Levels.READ));
        kernel.levels(READER, Map.of(act.getId(), Levels.READ));

        assertThrows(SecurityException.class, () -> as(READER).link(act.getId(), green, NOW));
        DocumentLinking.Linked linked = as(EDITOR).link(act.getId(), green, NOW);
        // The editor of the record removes it although they only read the document.
        assertTrue(as(EDITOR).linksOf(act).getFirst().canUnlink());
        assertFalse(as(READER).linksOf(act).getFirst().canUnlink());
        assertThrows(SecurityException.class, () -> as(READER).unlink(linked.link().getId()));
        as(EDITOR).unlink(linked.link().getId());
        assertTrue(links.rows.isEmpty());
    }

    @Test
    void aDocumentOrARecordThePersonCannotReadIsNotFound() {
        Item hidden = file("hidden.pdf");
        kernel.levels(EDITOR, Map.of(act.getId(), Levels.READ));
        assertThrows(NoSuchElementException.class, () -> as(EDITOR).link(hidden.getId(), green, NOW));
        assertThrows(NoSuchElementException.class, () -> as(EDITOR).link(folder.getId(), green, NOW));
        assertThrows(NoSuchElementException.class, () -> as(EDITOR).document(hidden.getId()));

        kernel.readers.get(green).remove(EDITOR);
        assertThrows(NoSuchElementException.class, () -> as(EDITOR).link(act.getId(), green, NOW));
        assertThrows(NoSuchElementException.class, () -> as(EDITOR).documentsOf(green));
        ResourceRef unknown = new ResourceRef(RECORDS, "record", UUID.randomUUID().toString());
        assertThrows(NoSuchElementException.class, () -> as(OWNER).link(act.getId(), unknown, NOW));

        // A document the person cannot read hides its links too.
        DocumentLinking.Linked linked = as(OWNER).link(act.getId(), green, NOW);
        assertThrows(NoSuchElementException.class, () -> as(READER).unlink(linked.link().getId()));
        assertThrows(NoSuchElementException.class, () -> as(OWNER).unlink(UUID.randomUUID()));
    }

    @Test
    void aLinkToARecordOfAnAbsentExtensionStaysAndIsListedOnTheDocument() {
        DocumentLinking.Linked linked = as(OWNER).link(act.getId(), green, NOW);
        kernel.active.remove(RECORDS);

        // The sheet of the document keeps the link: the app shows the placeholder of the platform.
        assertEquals(List.of(green), as(OWNER).linksOf(act).stream().map(DocumentLinking.LinkView::resource).toList());
        // Who edits the document still removes it; nothing is linked to the absent extension meanwhile.
        assertTrue(as(OWNER).linksOf(act).getFirst().canUnlink());
        assertThrows(NoSuchElementException.class, () -> as(OWNER).documentsOf(green));
        assertThrows(NoSuchElementException.class, () -> as(OWNER).link(file("other.pdf").getId(), green, NOW));
        assertEquals(1, links.rows.size());

        // Back, the record lists the document again.
        kernel.active.add(RECORDS);
        assertEquals(linked.link().getId(), as(OWNER).documentsOf(green).documents().getFirst().link());
    }

    @Test
    void anExtensionWithoutTheContractOrTheTypeTakesNoDocument() {
        ResourceRef memo = new ResourceRef(RECORDS, "memo", "m1");
        kernel.readers.put(memo, Set.of(OWNER));
        assertThrows(SecurityException.class, () -> as(OWNER).link(act.getId(), memo, NOW));
        assertFalse(as(OWNER).documentsOf(memo).canLink());

        // An extension that fails to answer lets nobody link.
        records.failing = true;
        assertThrows(SecurityException.class, () -> as(OWNER).link(act.getId(), green, NOW));
    }

    @Test
    void aReferenceNamesAnotherExtensionATypeAndAnId() {
        assertEquals(green, DocumentLinking.reference(RECORDS, "record", green.id()));
        assertThrows(IllegalArgumentException.class, () -> DocumentLinking.reference(" ", "record", "1"));
        assertThrows(IllegalArgumentException.class, () -> DocumentLinking.reference(CatalogResource.EXTENSION, "file", "1"));
        assertThrows(IllegalArgumentException.class, () -> DocumentLinking.reference(RECORDS, "Record", "1"));
        assertThrows(IllegalArgumentException.class, () -> DocumentLinking.reference(RECORDS, "record", ""));
        assertThrows(IllegalArgumentException.class, () -> DocumentLinking.reference(RECORDS, "record", "x".repeat(256)));
    }

    private DocumentLinking as(UUID person) {
        kernel.viewer = person;
        return new DocumentLinking(new Tree(items, kernel), links, kernel::resolve, new LinkTargets(contracts), person);
    }

    private Item file(String name) {
        Item file = Item.file(UUID.randomUUID(), ORGANIZATION, folder.getId(), name, UUID.randomUUID(), 1, "application/pdf", NOW);
        items.insert(file);
        kernel.levels.get(OWNER).put(file.getId(), Levels.MANAGE);
        return file;
    }

    /** The records of the extension, which those who edit a record link documents to. */
    private final class FakeRecords implements LinkedDocuments {
        private final Map<ResourceRef, Set<UUID>> editors = new HashMap<>();
        private boolean failing;

        @Override
        public String extension() {
            return RECORDS;
        }

        @Override
        public Set<String> types() {
            return Set.of("record");
        }

        @Override
        public boolean mayLink(String type, String id) {
            if (failing) {
                throw new IllegalStateException("down");
            }
            return editors.getOrDefault(new ResourceRef(RECORDS, type, id), Set.of()).contains(kernel.viewer);
        }
    }

    /** The links in memory. */
    private static final class FakeLinks implements Links {
        private final List<DocumentLink> rows = new ArrayList<>();

        @Override
        public Optional<DocumentLink> findById(UUID id) {
            return rows.stream().filter(link -> link.getId().equals(id)).findFirst();
        }

        @Override
        public List<DocumentLink> ofFile(UUID file) {
            return rows.stream()
                    .filter(link -> link.getItemId().equals(file))
                    .sorted(Comparator.comparing(DocumentLink::getCreatedAt))
                    .toList();
        }

        @Override
        public List<DocumentLink> toResource(String extension, String type, String id) {
            ResourceRef ref = new ResourceRef(extension, type, id);
            return rows.stream().filter(link -> link.resource().equals(ref)).toList();
        }

        @Override
        public void insert(DocumentLink link) {
            rows.add(link);
        }

        @Override
        public void delete(DocumentLink link) {
            rows.remove(link);
        }
    }

    /**
     * The kernel: the level of each person on each item, which items they read, and the records each
     * person reads, resolved as available while their extension is active (MK-135).
     */
    private static final class FakeKernel implements Sharing {
        private final Map<UUID, Map<UUID, String>> levels = new HashMap<>();
        private final Map<ResourceRef, Set<UUID>> readers = new HashMap<>();
        private final Set<String> active = new HashSet<>(Set.of(RECORDS));
        private UUID viewer;

        void levels(UUID person, Map<UUID, String> given) {
            levels.put(person, new HashMap<>(given));
        }

        ResolvedReference resolve(String extension, ResourceRef ref) {
            if (!active.contains(ref.extension())) {
                return ResolvedReference.unavailable(ref, ResolvedReference.Availability.EXTENSION_ABSENT);
            }
            Set<UUID> who = readers.get(ref);
            if (who == null) {
                return ResolvedReference.unavailable(ref, ResolvedReference.Availability.DELETED);
            }
            if (!who.contains(viewer)) {
                return ResolvedReference.unavailable(ref, ResolvedReference.Availability.FORBIDDEN);
            }
            return ResolvedReference.available(new Resource(ref, ORGANIZATION, OWNER, "Green", "/app/records", null));
        }

        @Override
        public Optional<String> level(ResourceRef resource) {
            return level(viewer, resource);
        }

        @Override
        public Optional<String> level(UUID person, ResourceRef resource) {
            return Optional.ofNullable(levels.getOrDefault(person, Map.of()).get(UUID.fromString(resource.id())));
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
            Set<String> visible = new HashSet<>();
            levels.getOrDefault(person, Map.of()).forEach((id, held) -> {
                if (Levels.atLeast(held, level)) {
                    visible.add(id.toString());
                }
            });
            return visible;
        }

        @Override
        public Grant grant(ResourceRef resource, Subject subject, String level) {
            throw new UnsupportedOperationException();
        }

        @Override
        public SharedLink createLink(ResourceRef resource, String level, Instant expires) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void revoke(UUID grant) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<Grant> grants(ResourceRef resource) {
            return List.of();
        }
    }
}
