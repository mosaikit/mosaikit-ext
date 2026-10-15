// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.sharing.Sharing;
import io.quarkus.security.Authenticated;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The search of the folders and files of the organization (EXT-006), under {@code
 * /api/v1/ext/catalog/search}: the provider of the catalog in the search of the platform (point {@code
 * search.provider}, MK-040), which calls it with the credentials of the person, and the search of the
 * documents to link in the app. It searches the words of the names with the full-text search of
 * PostgreSQL, and keeps in the same query only what the person reads, also through a folder above it
 * (MK-136), so that a page is never short of results they cannot see.
 */
@Path("/api/v1/ext/catalog/search")
@Produces(MediaType.APPLICATION_JSON)
@Authenticated
public class SearchResource {

    /** The most results of a page. */
    static final int MAX_LIMIT = 50;

    /** The longest text searched, as the platform sends it. */
    static final int MAX_QUERY = 200;

    /** A resource of the catalog that a result names, which the platform checks for the person. */
    public record ResultResource(String type, String id) {}

    /**
     * A result: the name of the item, the folders above it that the person reads, where it opens in the
     * shell, and the item as a resource.
     */
    public record Result(String title, String detail, String link, ResultResource resource) {}

    /** A page of results, and whether there are more. */
    public record Page(List<Result> results, boolean more) {}

    /** The words of the name of an item, as both the index of V5 and the query read them. */
    private static final String WORDS =
            "to_tsvector('simple', regexp_replace(i.name, '[[:punct:][:space:]]+', ' ', 'g'))";

    private final EntityManager entities;
    private final Items items;
    private final Sharing sharing;

    public SearchResource(EntityManager entities, Items items, Sharing sharing) {
        this.entities = entities;
        this.items = items;
        this.sharing = sharing;
    }

    /**
     * The folders and files whose name has words that start with the words of {@code q}, best first.
     *
     * @param q the text as typed
     * @param tsquery the same text as a query of PostgreSQL where every word is a prefix, as the platform
     *     gives it; made from {@code q} when missing or not of that form
     * @param kind {@code file} or {@code folder} for only those; both otherwise
     */
    @GET
    @Transactional
    public Page search(
            @QueryParam("q") String q,
            @QueryParam("tsquery") String tsquery,
            @QueryParam("kind") String kind,
            @QueryParam("offset") Integer offset,
            @QueryParam("limit") Integer limit) {
        int from = offset == null ? 0 : offset;
        int size = limit == null ? 10 : limit;
        if (from < 0 || size < 1 || size > MAX_LIMIT) {
            throw CatalogResource.problem(
                    Response.Status.BAD_REQUEST, "offset is at least 0, and limit between 1 and " + MAX_LIMIT + ".");
        }
        if (kind != null && !kind.isBlank() && !Item.FILE.equals(kind) && !Item.FOLDER.equals(kind)) {
            throw CatalogResource.problem(Response.Status.BAD_REQUEST, "kind is file or folder.");
        }
        String query = SearchQuery.of(q, tsquery);
        if (query == null) {
            return new Page(List.of(), false);
        }
        @SuppressWarnings("unchecked")
        List<Object> ids = entities.createNativeQuery("select cast(i.id as varchar) from ext_catalog.item i"
                        + " where " + WORDS + " @@ to_tsquery('simple', :query)"
                        + " and (:kind = '' or i.kind = :kind)"
                        + " and mk_kernel.allows(:extension, i.kind, cast(i.id as varchar), :level)"
                        + " order by ts_rank(" + WORDS + ", to_tsquery('simple', :query)) desc, lower(i.name), i.id"
                        + " limit :limit offset :offset")
                .setParameter("query", query)
                .setParameter("kind", kind == null ? "" : kind.trim())
                .setParameter("extension", CatalogResource.EXTENSION)
                .setParameter("level", Levels.READ)
                .setParameter("limit", size + 1)
                .setParameter("offset", from)
                .getResultList();
        List<UUID> found = ids.stream().limit(size).map(id -> UUID.fromString(id.toString())).toList();
        Tree tree = new Tree(items, sharing);
        var byId = items.findByIds(found).stream().collect(Collectors.toMap(Item::getId, item -> item));
        List<Result> results = new ArrayList<>();
        for (UUID id : found) {
            Item item = byId.get(id);
            if (item != null) {
                results.add(result(tree, item));
            }
        }
        return new Page(List.copyOf(results), ids.size() > size);
    }

    private static Result result(Tree tree, Item item) {
        String detail = item.getParentId() == null
                ? ""
                : tree.item(item.getParentId()).map(tree::path).orElse(List.of()).stream()
                        .map(Item::getName)
                        .collect(Collectors.joining(" / "));
        String link = item.isFolder() ? CatalogResource.link(item.getId()) : CatalogResource.fileLink(item.getId());
        return new Result(item.getName(), detail, link, new ResultResource(item.getKind(), item.getId().toString()));
    }
}
