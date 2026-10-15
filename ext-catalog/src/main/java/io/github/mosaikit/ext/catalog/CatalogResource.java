// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.context.CurrentOrganization;
import dev.mosaikit.kernel.api.files.FileStorage;
import dev.mosaikit.kernel.api.files.StoredFile;
import dev.mosaikit.kernel.api.resource.Resource;
import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.resource.Resources;
import dev.mosaikit.kernel.api.sharing.Sharing;
import dev.mosaikit.kernel.api.teams.People;
import io.quarkus.security.Authenticated;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.io.InputStream;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The folders and files of an organization (EXT-001), under {@code /api/v1/ext/catalog}. Every folder
 * and file is a resource registered with the kernel (MK-054); a person reads an item when they hold a
 * level on it or on a folder above it (MK-055), and a folder they cannot read answers 404, exactly as
 * one that does not exist.
 */
@Path("/api/v1/ext/catalog")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
public class CatalogResource {

    /** The identifier of the extension, which it names in every call to the kernel. */
    static final String EXTENSION = "io.github.mosaikit.ext.catalog";

    /** Request to create a folder, at the root when {@code parent} is {@code null}. */
    public record NewFolder(String name, UUID parent) {}

    /** The person who owns an item; {@code null} in a view when the organization owns it. */
    public record Owner(UUID account, String name) {}

    /**
     * A folder or a file in a list.
     *
     * @param size the size of a file in bytes, {@code null} for a folder
     * @param items the number of items in a folder, {@code null} for a file
     * @param owner the person who owns it, {@code null} when the organization does
     * @param changed when it last changed
     * @param sharing who reaches it besides its owner and the administrators
     * @param level the level of the person on it: read, edit or manage
     */
    public record ItemView(
            UUID id,
            String kind,
            String name,
            Long size,
            Integer items,
            Owner owner,
            Instant changed,
            SharingState sharing,
            String level) {}

    /** A step of the breadcrumbs. */
    public record Step(UUID id, String name) {}

    /**
     * A folder and its content, or the root of the person when {@code id} is {@code null}.
     *
     * @param path the folders from the highest one the person reads down to this one, which is the
     *     last; empty at the root
     * @param level the level of the person on the folder; {@code null} at the root
     * @param canCreate whether the person may create folders here
     * @param items its folders, then its files, in the order asked
     */
    public record FolderView(
            UUID id, String name, List<Step> path, String level, boolean canCreate, List<ItemView> items) {}

    private final Items items;
    private final CurrentOrganization organization;
    private final Resources resources;
    private final Sharing sharing;
    private final People people;
    private final FileStorage files;
    private final SecurityIdentity identity;

    public CatalogResource(
            Items items,
            CurrentOrganization organization,
            Resources resources,
            Sharing sharing,
            People people,
            FileStorage files,
            SecurityIdentity identity) {
        this.items = items;
        this.organization = organization;
        this.resources = resources;
        this.sharing = sharing;
        this.people = people;
        this.files = files;
        this.identity = identity;
    }

    /** The root of the person: the folders and files at the root they read, and those shared with them. */
    @GET
    @Path("folders")
    @Transactional
    public FolderView root(@QueryParam("sort") String sort, @QueryParam("order") String order) {
        Comparator<Item> comparator = order(sort, order);
        Tree tree = new Tree(items, sharing);
        return new FolderView(null, null, List.of(), null, member(), views(tree, tree.roots(), comparator));
    }

    /** A folder the person reads, with its content; 404 when it does not exist or they cannot read it. */
    @GET
    @Path("folders/{id}")
    @Transactional
    public FolderView folder(
            @PathParam("id") UUID id, @QueryParam("sort") String sort, @QueryParam("order") String order) {
        Comparator<Item> comparator = order(sort, order);
        Tree tree = new Tree(items, sharing);
        Item folder = tree.readableFolder(id).orElseThrow(CatalogResource::notFound);
        String level = tree.level(folder);
        List<Step> path = tree.path(folder).stream()
                .map(step -> new Step(step.getId(), step.getName()))
                .toList();
        return new FolderView(
                folder.getId(),
                folder.getName(),
                path,
                level,
                Levels.atLeast(level, Levels.EDIT),
                views(tree, items.children(folder.getId()), comparator));
    }

    /**
     * Creates a folder at the root, for the members of the organization, or in a folder where the
     * person has the level edit. The person owns it.
     */
    @POST
    @Path("folders")
    @Transactional
    public Response create(NewFolder request) {
        if (request == null) {
            throw problem(Response.Status.BAD_REQUEST, "The request has no folder.");
        }
        String name = name(request.name());
        Tree tree = new Tree(items, sharing);
        ResourceRef parent = null;
        if (request.parent() == null) {
            if (!member()) {
                throw problem(Response.Status.FORBIDDEN, "Only the members of the organization create folders at the root.");
            }
            checkFree(name, tree.roots().stream().filter(item -> item.getParentId() == null).toList());
        } else {
            Item folder = writableFolder(tree, request.parent());
            checkFree(name, items.children(folder.getId()));
            parent = Tree.ref(folder);
        }
        Item created = Item.folder(organization.require(), request.parent(), name, Instant.now());
        items.insert(created);
        resources.register(Tree.ref(created), new Resources.Details(name, link(created.getId()), parent));
        return Response.status(Response.Status.CREATED)
                .entity(views(new Tree(items, sharing), List.of(created), Listing.order(null, null)).getFirst())
                .build();
    }

    /**
     * Stores a file in a folder where the person has the level edit, with the content of the body,
     * through the file service of the kernel (MK-041). The person owns it.
     */
    @POST
    @Path("folders/{id}/files")
    @Consumes(MediaType.WILDCARD)
    @Transactional
    public Response upload(
            @PathParam("id") UUID id,
            @QueryParam("name") String requested,
            @HeaderParam("Content-Type") String contentType,
            InputStream content) {
        String name = name(requested);
        Tree tree = new Tree(items, sharing);
        Item folder = writableFolder(tree, id);
        checkFree(name, items.children(folder.getId()));
        String type = contentType == null || contentType.isBlank() ? MediaType.APPLICATION_OCTET_STREAM : contentType;
        UUID itemId = UUID.randomUUID();
        ResourceRef ref = Tree.ref(Item.FILE, itemId);
        resources.register(ref, new Resources.Details(name, link(folder.getId()), Tree.ref(folder)));
        StoredFile stored;
        try {
            stored = files.store(EXTENSION, FileStorage.NewFile.of(name, type).attachedTo(ref), content);
        } catch (IllegalArgumentException e) {
            throw problem(Response.Status.BAD_REQUEST, e.getMessage());
        }
        Item created = Item.file(
                itemId, organization.require(), folder.getId(), name, stored.id(), stored.size(), type, Instant.now());
        items.insert(created);
        return Response.status(Response.Status.CREATED)
                .entity(views(new Tree(items, sharing), List.of(created), Listing.order(null, null)).getFirst())
                .build();
    }

    private Item writableFolder(Tree tree, UUID id) {
        Item folder = tree.readableFolder(id).orElseThrow(CatalogResource::notFound);
        if (!Levels.atLeast(tree.level(folder), Levels.EDIT)) {
            throw problem(Response.Status.FORBIDDEN, "You can only read this folder.");
        }
        return folder;
    }

    private List<ItemView> views(Tree tree, List<Item> list, Comparator<Item> comparator) {
        List<UUID> folders = list.stream().filter(Item::isFolder).map(Item::getId).toList();
        Map<UUID, Long> counts = folders.isEmpty()
                ? Map.of()
                : items.parentsOfChildren(folders).stream()
                        .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));
        Map<UUID, Optional<Owner>> owners = new HashMap<>();
        return list.stream()
                .sorted(comparator)
                .map(item -> new ItemView(
                        item.getId(),
                        item.getKind(),
                        item.getName(),
                        item.getSize(),
                        item.isFolder() ? counts.getOrDefault(item.getId(), 0L).intValue() : null,
                        owner(item, owners),
                        item.getChangedAt(),
                        tree.sharingState(item),
                        tree.level(item)))
                .toList();
    }

    private Owner owner(Item item, Map<UUID, Optional<Owner>> owners) {
        UUID account = resources.find(Tree.ref(item)).map(Resource::owner).orElse(null);
        if (account == null) {
            return null;
        }
        return owners.computeIfAbsent(account, _ -> Optional.of(new Owner(
                        account, people.find(account).map(People.Person::displayName).orElse(null))))
                .orElse(null);
    }

    /** Whether the person is a member or an administrator of the organization, not a guest. */
    private boolean member() {
        return identity.hasRole("organization-user") || identity.hasRole("organization-admin");
    }

    private static void checkFree(String name, List<Item> siblings) {
        siblings.stream()
                .filter(item -> ItemName.same(item.getName(), name))
                .findFirst()
                .ifPresent(existing -> {
                    throw problem(
                            Response.Status.CONFLICT,
                            "This folder already holds " + (existing.isFolder() ? "a folder" : "a file") + " named "
                                    + existing.getName() + ".");
                });
    }

    private static String name(String name) {
        try {
            return ItemName.check(name);
        } catch (IllegalArgumentException e) {
            throw problem(Response.Status.BAD_REQUEST, e.getMessage());
        }
    }

    private static Comparator<Item> order(String sort, String order) {
        try {
            return Listing.order(sort, order);
        } catch (IllegalArgumentException e) {
            throw problem(Response.Status.BAD_REQUEST, e.getMessage());
        }
    }

    /** Where a folder opens in the shell. */
    static String link(UUID folder) {
        return "/app/catalog?folder=" + folder;
    }

    /** The same answer for a folder that does not exist and for one the person cannot read. */
    private static NotFoundException notFound() {
        return new NotFoundException();
    }

    private static WebApplicationException problem(Response.Status status, String detail) {
        return new WebApplicationException(Response.status(status)
                .type("application/problem+json")
                .entity(Map.of("status", status.getStatusCode(), "title", status.getReasonPhrase(), "detail", detail))
                .build());
    }
}
