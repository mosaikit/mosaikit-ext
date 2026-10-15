// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.events.PlatformEvents;
import dev.mosaikit.kernel.api.files.FileStorage;
import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.resource.Resources;
import dev.mosaikit.kernel.api.sharing.Sharing;
import dev.mosaikit.kernel.api.files.StoredFile;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent.Change;
import io.github.mosaikit.ext.catalog.api.v1.FileSample;
import io.quarkus.security.Authenticated;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.UUID;

/**
 * Renaming, moving and deleting folders and files (EXT-002), under {@code /api/v1/ext/catalog/items}.
 * They act with the level edit on the item, which a level on a folder above it gives too; an item the
 * person cannot read answers 404, as one that does not exist. Moving and renaming keep the identity of
 * the item and so its own shares, links and references.
 */
@Path("/api/v1/ext/catalog/items")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
public class ItemResource {

    /** Request to rename an item. */
    public record NewName(String name) {}

    /** Request to move an item into a folder, or to the root when {@code parent} is {@code null}. */
    public record NewParent(UUID parent) {}

    /** What an item holds, at any depth: the confirmation of a delete names it. */
    public record Summary(int items, long bytes) {}

    /** The event that asks a job to delete the content of files the person could not delete themselves. */
    static final String REMOVAL_REQUESTED = "removal.requested";

    /** The event that asks a job to delete a content replaced by another one (EXT-105). */
    static final String CONTENT_DISCARDED = "content.discarded";

    private final Items items;
    private final PendingRemovals removals;
    private final Resources resources;
    private final Sharing sharing;
    private final FileStorage files;
    private final PlatformEvents events;
    private final FileKinds kinds;
    private final FileKindEvents kindEvents;
    private final SecurityIdentity identity;

    public ItemResource(
            Items items,
            PendingRemovals removals,
            Resources resources,
            Sharing sharing,
            FileStorage files,
            PlatformEvents events,
            FileKinds kinds,
            FileKindEvents kindEvents,
            SecurityIdentity identity) {
        this.items = items;
        this.removals = removals;
        this.resources = resources;
        this.sharing = sharing;
        this.files = files;
        this.events = events;
        this.kinds = kinds;
        this.kindEvents = kindEvents;
        this.identity = identity;
    }

    /** How many items a folder holds, at any depth, and their size; nothing for a file. */
    @GET
    @Path("{id}/summary")
    @Transactional
    public Summary summary(@PathParam("id") UUID id) {
        Tree tree = new Tree(items, sharing);
        Item item = tree.readable(id).orElseThrow(CatalogResource::notFound);
        List<Item> contents = tree.contents(item);
        long bytes = contents.stream()
                .map(Item::getSize)
                .filter(Objects::nonNull)
                .mapToLong(Long::longValue)
                .sum();
        return new Summary(contents.size(), bytes);
    }

    /** Renames an item; a name used by another item of the same folder, in any case, is refused with 409. */
    @POST
    @Path("{id}/rename")
    @Transactional
    public Response rename(@PathParam("id") UUID id, NewName request) {
        if (request == null) {
            throw CatalogResource.problem(Response.Status.BAD_REQUEST, "The request has no name.");
        }
        String name = CatalogResource.name(request.name());
        Tree tree = new Tree(items, sharing);
        Item item = editable(tree, id);
        CatalogResource.checkFree(name, siblings(tree, item.getParentId()), item.getId());
        String previous = item.getName();
        item.rename(name, Instant.now());
        items.update(item);
        register(tree, item);
        if (!previous.equals(item.getName())) {
            kindEvents.raise(item, Change.RENAMED, Map.of("previousName", previous));
        }
        return Response.noContent().build();
    }

    /**
     * Moves an item into a folder where the person has the level edit, or to the root for the members
     * of the organization. A folder never goes into itself nor into a folder it holds, and a name used
     * there is refused with 409.
     */
    @POST
    @Path("{id}/move")
    @Transactional
    public Response move(@PathParam("id") UUID id, NewParent request) {
        if (request == null) {
            throw CatalogResource.problem(Response.Status.BAD_REQUEST, "The request has no folder.");
        }
        Tree tree = new Tree(items, sharing);
        Item item = editable(tree, id);
        UUID target = request.parent();
        if (target == null) {
            if (!CatalogResource.member(identity)) {
                throw CatalogResource.problem(
                        Response.Status.FORBIDDEN, "Only the members of the organization put items at the root.");
            }
        } else {
            Item folder = CatalogResource.writableFolder(tree, target);
            if (tree.within(folder, item)) {
                throw CatalogResource.problem(
                        Response.Status.CONFLICT, "A folder cannot go into itself nor into a folder it holds.");
            }
        }
        if (Objects.equals(item.getParentId(), target)) {
            return Response.noContent().build();
        }
        CatalogResource.checkFree(item.getName(), siblings(tree, target), item.getId());
        UUID previous = item.getParentId();
        item.moveTo(target);
        items.update(item);
        register(tree, item);
        kindEvents.raise(item, Change.MOVED, Map.of("previousFolder", previous == null ? "" : previous.toString()));
        kindEvents.raiseForFiles(tree.contents(item), Change.MOVED, Map.of("movedWith", item.getId().toString()));
        return Response.noContent().build();
    }

    /**
     * Deletes an item and, for a folder, everything it holds: from the catalog at once, and their
     * content from the file service of the kernel (EXT-004). The kernel lets a person delete the
     * content of a file they own or edit themselves; the content of a file they reach only through a
     * folder above it is deleted by a job of the organization a few seconds later, and its resource
     * stays registered until then, so that the content is never a file of the whole organization.
     */
    @DELETE
    @Path("{id}")
    @Transactional
    public Response delete(@PathParam("id") UUID id) {
        Tree tree = new Tree(items, sharing);
        Item item = editable(tree, id);
        List<Item> gone = new ArrayList<>(tree.contents(item));
        // What a folder holds goes before it: the parent of each item is still there when it goes.
        gone = new ArrayList<>(gone.reversed());
        gone.add(item);
        boolean pending = false;
        // The kinds are told before the folders above their files go, while their path is still known.
        kindEvents.raiseForFiles(gone, Change.DELETED, Map.of());
        for (Item each : gone) {
            ResourceRef ref = Tree.ref(each);
            if (each.isFolder() || deleteContent(each, ref)) {
                resources.remove(ref);
            } else {
                removals.insert(new PendingRemoval(each));
                pending = true;
            }
            items.delete(each);
        }
        if (pending) {
            events.raise(CatalogResource.EXTENSION, REMOVAL_REQUESTED, Map.of("item", item.getId().toString()));
        }
        return Response.noContent().build();
    }

    /**
     * Replaces the content of a file with the body, with its {@code Content-Type}, keeping the file, its
     * name, its folder and its shares (EXT-105). The kinds of files look at it again: the kind of the file
     * is told that it was replaced, or, when another kind (or none) recognizes it now, that it is no
     * longer of its kind, and the new kind that it was stored. The kernel lets a person store a content of
     * a file with a level of their own on it (MK-055): one who edits it only through a folder above it is
     * refused with 403.
     */
    @PUT
    @Path("{id}/content")
    @Consumes(MediaType.WILDCARD)
    @Transactional
    public Response replace(
            @PathParam("id") UUID id, @HeaderParam("Content-Type") String contentType, InputStream content) {
        Tree tree = new Tree(items, sharing);
        Item item = editable(tree, id);
        if (item.isFolder()) {
            throw CatalogResource.problem(Response.Status.BAD_REQUEST, "A folder has no content to replace.");
        }
        String type = contentType == null || contentType.isBlank() ? MediaType.APPLICATION_OCTET_STREAM : contentType;
        FileKinds.Head head = FileKinds.head(content);
        StoredFile stored;
        try {
            stored = files.store(
                    CatalogResource.EXTENSION,
                    FileStorage.NewFile.of(item.getName(), type).attachedTo(Tree.ref(item)),
                    head.content());
        } catch (IllegalArgumentException e) {
            throw CatalogResource.problem(Response.Status.BAD_REQUEST, e.getMessage());
        } catch (SecurityException e) {
            throw CatalogResource.problem(
                    Response.Status.FORBIDDEN, "Only who holds a level on the file itself replaces its content.");
        } catch (IllegalStateException e) {
            throw CatalogResource.problem(Response.Status.FORBIDDEN, e.getMessage());
        }
        UUID previousContent = item.getFileId();
        String previousKind = item.getFileKind();
        String kind = FileKinds.recognize(
                        new FileSample(item.getName(), type, stored.size(), head.bytes()), kinds.active())
                .orElse(null);
        if (previousKind != null && !previousKind.equals(kind)) {
            kindEvents.raise(item, previousKind, Change.DELETED, Map.of("replaced", "true"));
        }
        item.replaceContent(stored.id(), stored.size(), type, Instant.now());
        item.recognizedAs(kind);
        items.update(item);
        if (kind != null) {
            kindEvents.raise(item, kind.equals(previousKind) ? Change.REPLACED : Change.STORED, Map.of());
        }
        discard(previousContent);
        return Response.noContent().build();
    }

    /** Deletes a content that a file no longer has: as the person, or else in a job of the organization. */
    private void discard(UUID content) {
        try {
            files.delete(CatalogResource.EXTENSION, content);
        } catch (NoSuchElementException | SecurityException e) {
            events.raise(CatalogResource.EXTENSION, CONTENT_DISCARDED, Map.of("file", content.toString()));
        }
    }

    /** Deletes the content of a file as the person, when the kernel lets them; whether it did. */
    private boolean deleteContent(Item file, ResourceRef ref) {
        if (!Levels.atLeast(sharing.level(ref).orElse(null), Levels.EDIT)) {
            return false;
        }
        try {
            files.delete(CatalogResource.EXTENSION, file.getFileId());
            return true;
        } catch (NoSuchElementException | SecurityException e) {
            return false;
        }
    }

    /** An item where the person has the level edit; 404 when they cannot read it, 403 when they only read it. */
    private static Item editable(Tree tree, UUID id) {
        Item item = tree.readable(id).orElseThrow(CatalogResource::notFound);
        if (!Levels.atLeast(tree.level(item), Levels.EDIT)) {
            throw CatalogResource.problem(Response.Status.FORBIDDEN, "You can only read this item.");
        }
        return item;
    }

    /** The items of a folder, or at the root those the person reads there. */
    private List<Item> siblings(Tree tree, UUID parent) {
        if (parent == null) {
            return tree.roots().stream().filter(each -> each.getParentId() == null).toList();
        }
        return items.children(parent);
    }

    /** Registers the item again with its name and its folder: the kernel keeps its owner and its grants. */
    private void register(Tree tree, Item item) {
        ResourceRef parent = item.getParentId() == null
                ? null
                : tree.item(item.getParentId()).map(Tree::ref).orElse(null);
        String link = item.isFolder()
                ? CatalogResource.link(item.getId())
                : item.getParentId() == null ? "/app/catalog" : CatalogResource.link(item.getParentId());
        resources.register(Tree.ref(item), new Resources.Details(item.getName(), link, parent));
    }
}
