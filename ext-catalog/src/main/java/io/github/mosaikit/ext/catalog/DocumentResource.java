// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.resource.ResourceReferences;
import dev.mosaikit.kernel.api.resource.Resources;
import dev.mosaikit.kernel.api.sharing.Sharing;
import dev.mosaikit.kernel.api.teams.People;
import io.quarkus.security.Authenticated;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * Documents and their links to resources of other extensions (EXT-006): the sheet of a file, under
 * {@code /api/v1/ext/catalog/files}, and the links, under {@code /api/v1/ext/catalog/links}, which the
 * sheet of a resource of another extension lists through the element {@code
 * mosaikit-ext-catalog-documents} of the frontend of the catalog. A document or a resource the person
 * cannot read answers 404, as one that does not exist.
 */
@Path("/api/v1/ext/catalog")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
public class DocumentResource {

    /** A resource of another extension, by the reference with which it registered it (MK-054). */
    public record ResourceView(String extension, String type, String id) {

        static ResourceView of(ResourceRef ref) {
            return new ResourceView(ref.extension(), ref.type(), ref.id());
        }
    }

    /**
     * A link of a document to a resource.
     *
     * @param canUnlink whether the person may remove it
     */
    public record LinkView(UUID id, ResourceView resource, boolean canUnlink) {}

    /**
     * The sheet of a file: the file as a list shows it, the folders above it that the person reads, from
     * the highest one down to its folder, and the resources of other extensions it is linked to, which
     * the app resolves with the kernel (MK-135).
     */
    public record FileSheet(CatalogResource.ItemView file, List<CatalogResource.Step> path, List<LinkView> links) {}

    /** A document linked to a resource, as a list shows the file, with its link. */
    public record LinkedDocumentView(UUID link, CatalogResource.ItemView file, boolean canUnlink) {}

    /**
     * The documents linked to a resource that the person reads, by name.
     *
     * @param canLink whether they may link documents to it, as its extension answers
     */
    public record ResourceDocumentsView(ResourceView resource, boolean canLink, List<LinkedDocumentView> documents) {}

    /** Request to link a file to a resource of another extension. */
    public record NewLink(UUID file, ResourceView resource) {}

    private final Items items;
    private final Links links;
    private final Resources resources;
    private final ResourceReferences references;
    private final Sharing sharing;
    private final People people;
    private final FileKinds kinds;
    private final LinkTargets targets;
    private final SecurityIdentity identity;

    public DocumentResource(
            Items items,
            Links links,
            Resources resources,
            ResourceReferences references,
            Sharing sharing,
            People people,
            FileKinds kinds,
            LinkTargets targets,
            SecurityIdentity identity) {
        this.items = items;
        this.links = links;
        this.resources = resources;
        this.references = references;
        this.sharing = sharing;
        this.people = people;
        this.kinds = kinds;
        this.targets = targets;
        this.identity = identity;
    }

    /** The sheet of a file the person reads, with its links; 404 otherwise, and for a folder. */
    @GET
    @Path("files/{id}")
    @Transactional
    public FileSheet file(@PathParam("id") UUID id) {
        Tree tree = new Tree(items, sharing);
        DocumentLinking linking = linking(tree);
        Item file = handled(() -> linking.document(id));
        List<CatalogResource.Step> path = file.getParentId() == null
                ? List.of()
                : tree.item(file.getParentId()).map(tree::path).orElse(List.of()).stream()
                        .map(step -> new CatalogResource.Step(step.getId(), step.getName()))
                        .toList();
        List<LinkView> linked = linking.linksOf(file).stream()
                .map(link -> new LinkView(link.id(), ResourceView.of(link.resource()), link.canUnlink()))
                .toList();
        return new FileSheet(views(tree, List.of(file)).getFirst(), path, linked);
    }

    /**
     * The documents linked to a resource of another extension that the person reads, by name; 404 when
     * they cannot read the resource or its extension is absent.
     */
    @GET
    @Path("links")
    @Transactional
    public ResourceDocumentsView documents(
            @QueryParam("extension") String extension, @QueryParam("type") String type, @QueryParam("id") String id) {
        Tree tree = new Tree(items, sharing);
        ResourceRef resource = handled(() -> DocumentLinking.reference(extension, type, id));
        DocumentLinking.ResourceDocuments found = handled(() -> linking(tree).documentsOf(resource));
        Map<UUID, DocumentLinking.LinkedDocument> byFile = found.documents().stream()
                .collect(Collectors.toMap(document -> document.file().getId(), Function.identity()));
        List<LinkedDocumentView> documents = views(tree, found.documents().stream()
                        .map(DocumentLinking.LinkedDocument::file)
                        .toList())
                .stream()
                .map(view -> {
                    DocumentLinking.LinkedDocument document = byFile.get(view.id());
                    return new LinkedDocumentView(document.link(), view, document.canUnlink());
                })
                .toList();
        return new ResourceDocumentsView(ResourceView.of(resource), found.canLink(), documents);
    }

    /**
     * Links a file the person reads to a resource of another extension that they read, when that
     * extension lets them: 201 with the link, 200 with the link that was there already; 404 when they
     * cannot read either, 403 when the extension does not let them.
     */
    @POST
    @Path("links")
    @Transactional
    public Response link(NewLink request) {
        if (request == null || request.file() == null || request.resource() == null) {
            throw CatalogResource.problem(Response.Status.BAD_REQUEST, "The request names no file or no resource.");
        }
        ResourceView asked = request.resource();
        ResourceRef resource = handled(() -> DocumentLinking.reference(asked.extension(), asked.type(), asked.id()));
        DocumentLinking.Linked linked =
                handled(() -> linking(new Tree(items, sharing)).link(request.file(), resource, Instant.now()));
        LinkView view = new LinkView(linked.link().getId(), ResourceView.of(resource), true);
        return Response.status(linked.created() ? Response.Status.CREATED : Response.Status.OK)
                .entity(view)
                .build();
    }

    /** Removes a link; 404 when the person cannot read its document, 403 when they may not remove it. */
    @DELETE
    @Path("links/{id}")
    @Transactional
    public Response unlink(@PathParam("id") UUID id) {
        handled(() -> {
            linking(new Tree(items, sharing)).unlink(id);
            return null;
        });
        return Response.noContent().build();
    }

    private DocumentLinking linking(Tree tree) {
        UUID person = people.findByUsername(identity.getPrincipal().getName())
                .map(People.Person::account)
                .orElse(null);
        return new DocumentLinking(tree, links, references, targets, person);
    }

    private List<CatalogResource.ItemView> views(Tree tree, List<Item> list) {
        return CatalogResource.views(items, resources, people, kinds, tree, list, Listing.order(null, null));
    }

    /** Answers the refusals of the links as the API does: 404, 403 or 400. */
    private static <T> T handled(Supplier<T> action) {
        try {
            return action.get();
        } catch (NoSuchElementException e) {
            throw CatalogResource.notFound();
        } catch (SecurityException e) {
            throw CatalogResource.problem(Response.Status.FORBIDDEN, e.getMessage());
        } catch (IllegalArgumentException e) {
            throw CatalogResource.problem(Response.Status.BAD_REQUEST, e.getMessage());
        }
    }
}
