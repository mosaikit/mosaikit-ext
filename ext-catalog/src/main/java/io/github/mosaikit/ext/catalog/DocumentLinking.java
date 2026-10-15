// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.resource.ResolvedReference;
import dev.mosaikit.kernel.api.resource.ResourceReferences;
import dev.mosaikit.kernel.api.resource.ResourceRef;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Documents linked to resources of other extensions, as the person of one request sees them (EXT-006).
 * A person who reads a document links it to a resource of another extension when that extension, active
 * in the organization, lets them (contract {@code linked-documents}, MK-134); the sheet of the resource
 * lists the documents linked to it that the person reads, and the sheet of the document the resources it
 * is linked to, which the kernel resolves for the person (MK-135), so that a resource of an absent
 * extension shows the placeholder of the platform and its link stays.
 *
 * <p>Refusals are exceptions: {@link NoSuchElementException} for a document or a resource the person
 * cannot read, as one that does not exist; {@link SecurityException} for what they read but may not
 * change; {@link IllegalArgumentException} for a reference that is not valid.
 */
final class DocumentLinking {

    /** The most links one document, or one resource, shows. */
    static final int MAX_LINKS = 200;

    private static final Pattern TYPE = Pattern.compile("[a-z][a-z0-9-]{0,63}");

    /**
     * A link as the person sees it.
     *
     * @param canUnlink whether they may remove it: they edit the document, or the extension of the
     *     resource lets them link documents to it
     */
    record LinkView(UUID id, ResourceRef resource, boolean canUnlink) {}

    /** A document linked to a resource, with its link. */
    record LinkedDocument(UUID link, Item file, boolean canUnlink) {}

    /**
     * The documents linked to a resource that the person reads.
     *
     * @param canLink whether they may link documents to it
     */
    record ResourceDocuments(ResourceRef resource, boolean canLink, List<LinkedDocument> documents) {}

    private final Tree tree;
    private final Links links;
    private final ResourceReferences references;
    private final LinkTargets targets;
    private final UUID person;

    DocumentLinking(Tree tree, Links links, ResourceReferences references, LinkTargets targets, UUID person) {
        this.tree = tree;
        this.links = links;
        this.references = references;
        this.targets = targets;
        this.person = person;
    }

    /** A file the person reads; not found otherwise, and for a folder. */
    Item document(UUID id) {
        return tree.readable(id).filter(item -> !item.isFolder()).orElseThrow(NoSuchElementException::new);
    }

    /** The links of a document the person reads, oldest first, with whether they may remove each. */
    List<LinkView> linksOf(Item document) {
        boolean edits = Levels.atLeast(tree.level(document), Levels.EDIT);
        return links.ofFile(document.getId()).stream()
                .limit(MAX_LINKS)
                .map(link -> new LinkView(link.getId(), link.resource(), edits || targets.mayLink(link.resource())))
                .toList();
    }

    /** The documents linked to a resource the person reads, among those they read; not found otherwise. */
    ResourceDocuments documentsOf(ResourceRef resource) {
        readableResource(resource);
        boolean canLink = targets.mayLink(resource);
        List<LinkedDocument> documents = new ArrayList<>();
        for (DocumentLink link : links.toResource(resource.extension(), resource.type(), resource.id())) {
            Optional<Item> file = tree.readable(link.getItemId()).filter(item -> !item.isFolder());
            if (file.isPresent()) {
                boolean edits = Levels.atLeast(tree.level(file.get()), Levels.EDIT);
                documents.add(new LinkedDocument(link.getId(), file.get(), canLink || edits));
            }
            if (documents.size() == MAX_LINKS) {
                break;
            }
        }
        return new ResourceDocuments(resource, canLink, List.copyOf(documents));
    }

    /**
     * Links a document the person reads to a resource they read, when its extension lets them; a link
     * that exists already is given back as it is.
     *
     * @return the link, and whether it was made now
     */
    Linked link(UUID file, ResourceRef resource, Instant now) {
        Item document = document(file);
        readableResource(resource);
        if (!targets.mayLink(resource)) {
            throw new SecurityException("You cannot link documents to this resource.");
        }
        for (DocumentLink existing : links.ofFile(document.getId())) {
            if (existing.resource().equals(resource)) {
                return new Linked(existing, false);
            }
        }
        DocumentLink link = DocumentLink.of(document.getOrganizationId(), document.getId(), resource, person, now);
        links.insert(link);
        return new Linked(link, true);
    }

    /** A link, and whether it was made by the request. */
    record Linked(DocumentLink link, boolean created) {}

    /**
     * Removes a link of a document the person reads: they edit the document, or the extension of the
     * resource lets them link documents to it.
     */
    void unlink(UUID id) {
        DocumentLink link = links.findById(id).orElseThrow(NoSuchElementException::new);
        Item document = document(link.getItemId());
        if (!Levels.atLeast(tree.level(document), Levels.EDIT) && !targets.mayLink(link.resource())) {
            throw new SecurityException("You cannot remove this link.");
        }
        links.delete(link);
    }

    /** Checks a reference to a resource of another extension. */
    static ResourceRef reference(String extension, String type, String id) {
        if (extension == null || extension.isBlank() || extension.length() > 255) {
            throw new IllegalArgumentException("The resource has no valid extension.");
        }
        if (CatalogResource.EXTENSION.equals(extension)) {
            throw new IllegalArgumentException("Documents are linked to resources of other extensions.");
        }
        if (type == null || !TYPE.matcher(type).matches()) {
            throw new IllegalArgumentException("The resource has no valid type.");
        }
        if (id == null || id.isBlank() || id.length() > 255) {
            throw new IllegalArgumentException("The resource has no valid id.");
        }
        return new ResourceRef(extension, type, id);
    }

    /** A resource the person reads, as the kernel resolves it; not found otherwise, also while its extension is absent. */
    private void readableResource(ResourceRef resource) {
        ResolvedReference resolved = references.resolve(CatalogResource.EXTENSION, resource);
        if (resolved == null || !resolved.isAvailable()) {
            throw new NoSuchElementException();
        }
    }
}
