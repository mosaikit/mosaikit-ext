// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import dev.mosaikit.kernel.api.context.CurrentOrganization;
import dev.mosaikit.kernel.api.files.FileStorage;
import dev.mosaikit.kernel.api.files.StoredFile;
import dev.mosaikit.kernel.api.resource.Resource;
import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.resource.Resources;
import dev.mosaikit.kernel.api.resource.Tags;
import dev.mosaikit.kernel.api.secrets.SecretValue;
import dev.mosaikit.kernel.api.secrets.Secrets;
import dev.mosaikit.kernel.api.secrets.SecretsUnavailableException;
import dev.mosaikit.kernel.api.sharing.Sharing;
import dev.mosaikit.kernel.api.teams.People;
import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.ContentsUnavailableException;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import io.github.mosaikit.ext.catalog.connection.api.v1.Page;
import io.github.mosaikit.ext.catalog.connection.api.v1.Paging;
import io.github.mosaikit.ext.catalog.connection.api.v1.Piece;
import io.github.mosaikit.ext.catalog.connection.api.v1.Rows;
import io.github.mosaikit.ext.catalog.connection.api.v1.TestResult;
import io.quarkus.security.Authenticated;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

/**
 * The connectors and the connections of an organization (EXT-010), under {@code
 * /api/v1/ext/connections}. The framework knows no protocol: it finds the connectors through its
 * contract (MK-134), keeps the connections, reads their credentials from the secrets service of the
 * kernel at the moment of a call and passes them to the connector. No answer of this API contains a
 * credential.
 *
 * <p>Each connection is a resource of the kernel (MK-054), owned by the person who creates it and
 * shared with the dialog of the platform (MK-055): a person lists the connections they view, browses
 * and tests those they use, and changes those they edit. A connection has a description, the address
 * of its source and a thumbnail (EXT-011, EXT-015), and free tags, kept by the kernel with the
 * generic tags of the platform (EXT-012, MK-097).
 */
@Path("/api/v1/ext/connections")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
public class ConnectionResource {

    /** The identifier of the extension, which it names in every call to the kernel. */
    static final String EXTENSION = Connector.FRAMEWORK;

    /** The most pieces of a page of contents. */
    static final int MAX_PAGE = 500;

    /** The resource type of a connection in the manifest. */
    static final String TYPE = "connection";

    /** The level that lists a connection. */
    static final String VIEW = "view";

    /** The level that browses and tests a connection. */
    static final String USE = "use";

    /** The level that changes a connection. */
    static final String EDIT = "edit";

    /** The largest uploaded thumbnail, in bytes. */
    static final int MAX_THUMBNAIL = 1024 * 1024;

    /**
     * The types of image a thumbnail may have. SVG is not among them: an image a person uploads, served
     * by the kernel, must not carry scripts.
     */
    static final Set<String> THUMBNAIL_TYPES = Set.of("image/png", "image/jpeg", "image/gif", "image/webp");
    /** The row limit of a query when the request gives none, and the most it may ask. */
    static final int DEFAULT_ROWS = 100;

    static final int MAX_ROWS = 1000;

    /**
     * A type of source that New connection offers.
     *
     * @param extension the extension of the connector
     * @param titles the title in other languages, by language tag
     * @param logo the address of the logo, served by the kernel with the assets of the extension
     * @param form the JSON Schema of the connection form
     */
    public record ConnectorView(
            String type,
            String extension,
            String title,
            Map<String, String> titles,
            String category,
            String logo,
            Map<String, Object> form) {}

    /** A connector the framework refused, naming the extension and the field of its declaration. */
    public record ProblemView(String extension, String field, String message) {}

    /** The usable connectors, and the problems of those refused. */
    public record ConnectorsView(List<ConnectorView> connectors, List<ProblemView> problems) {}

    /** Request to create a connection, with its free tags (EXT-013), or to test one before creating it. */
    public record NewConnection(
            String name,
            String type,
            String description,
            Map<String, Object> settings,
            String credential,
            List<String> tags) {}

    /** The pieces a preview shows. */
    static final int PREVIEW = 20;

    /**
     * The test of the settings of a connection not yet created, with a preview of its source (EXT-013).
     *
     * @param success whether the source answered
     * @param message what the connector or the source said
     * @param address the address of the source, from which the app proposes a name
     * @param contents the first pieces at the top level of the source when it answered, or why there
     *     are none
     */
    public record Preview(boolean success, String message, String address, ContentsView contents) {}

    /**
     * Request to change a connection, whose type never changes: its name, its description (empty or
     * {@code null} clears it), the values of its form and its credential.
     */
    public record ConnectionChange(String name, String description, Map<String, Object> settings, String credential) {}

    /**
     * The owner of a connection.
     *
     * @param account the account of the person
     * @param name the name shown for the person, {@code null} when they are no longer in the organization
     */
    public record OwnerView(UUID account, String name) {}

    /**
     * A connection in a list.
     *
     * @param connector the extension that declared its type
     * @param available whether its connector is active in the organization; when it is not, the
     *     connection is kept as it is and works again when the connector comes back
     * @param settings the values of its connection form
     * @param credential the name of its credential in the secrets service, never the credential
     * @param description its description, {@code null} without one
     * @param address the address of its source, which the card shows when there is no description
     * @param owner the person who owns it, {@code null} when the organization does
     * @param thumbnail the file of its uploaded thumbnail in the file service of the kernel, {@code
     *     null} when the thumbnail is generated from its name
     * @param editable whether the person may change it
     * @param updated when it was last changed (EXT-014)
     * @param pieces the pieces at the top level of its source as last listed, {@code null} until it is
     *     listed (EXT-014)
     * @param morePieces whether its source held more pieces than those counted
     * @param state {@code reachable} or {@code unreachable} at the last test or listing of its source,
     *     {@code null} before
     * @param checked when its source was last tested or listed, {@code null} before
     * @param tags its free tags, lowercase and each once, in alphabetical order (EXT-012)
     */
    public record ConnectionView(
            UUID id,
            String name,
            String type,
            String connector,
            boolean available,
            Map<String, Object> settings,
            String credential,
            Instant created,
            String description,
            String address,
            OwnerView owner,
            UUID thumbnail,
            boolean editable,
            Instant updated,
            Integer pieces,
            boolean morePieces,
            String state,
            Instant checked,
            List<String> tags) {}

    /** The free tags of a connection, to replace them all (EXT-012). */
    public record TagsChange(List<String> tags) {}

    /** The tags in use that start with what a person types, the most used first (EXT-012). */
    public record TagSuggestions(List<String> tags) {}

    /** The most suggestions of tags the app asks for. */
    static final int SUGGESTIONS = 20;

    /**
     * A page of the contents of a connection, in the one shape of every connector (EXT-019).
     *
     * @param parent the id of the container listed, empty for the top level
     * @param state {@code listed}, or why there is nothing to list: {@code empty} (the source, or the
     *     container, holds nothing), {@code unreachable} (the source does not answer), {@code
     *     needs-declaration} (the source does not describe its contents) or {@code not-readable} (the
     *     connector cannot read this kind yet); each one has its own message in the app
     * @param detail what the source or the connector said, when the state is not {@code listed}
     * @param items the pieces, each with its id, name, kind and facts
     */
    public record ContentsView(String parent, String state, String detail, List<Piece> items, boolean more) {

        static ContentsView listed(String parent, Page<Piece> page, boolean first) {
            if (first && page.items().isEmpty()) {
                return new ContentsView(parent, "empty", null, List.of(), false);
            }
            return new ContentsView(parent, "listed", null, page.items(), page.more());
        }

        static ContentsView unavailable(String parent, ContentsUnavailableException e) {
            String state = switch (e.reason()) {
                case UNREACHABLE -> "unreachable";
                case NEEDS_DECLARATION -> "needs-declaration";
                case NOT_READABLE -> "not-readable";
            };
            return new ContentsView(parent, state, e.getMessage(), List.of(), false);
        }
    }

    /** A query to run on a connection, with its row limit. */
    public record QueryRequest(String statement, Integer limit) {}

    private final Connections connections;
    private final ConnectorCatalog catalog;
    private final CurrentOrganization organization;
    private final Secrets secrets;
    private final Resources resources;
    private final Sharing sharing;
    private final People people;
    private final FileStorage files;
    private final Tags tags;

    public ConnectionResource(
            Connections connections,
            ConnectorCatalog catalog,
            CurrentOrganization organization,
            Secrets secrets,
            Resources resources,
            Sharing sharing,
            People people,
            FileStorage files,
            Tags tags) {
        this.connections = connections;
        this.catalog = catalog;
        this.organization = organization;
        this.secrets = secrets;
        this.resources = resources;
        this.sharing = sharing;
        this.people = people;
        this.files = files;
        this.tags = tags;
    }

    /** The types of source of the connectors active in the organization, and the connectors refused. */
    @GET
    @Path("connectors")
    public ConnectorsView connectors() {
        Discovery discovery = catalog.discover();
        return new ConnectorsView(
                discovery.connectors().values().stream()
                        .map(found -> view(found.connector().extension(), found.declaration()))
                        .toList(),
                discovery.problems().stream()
                        .map(problem -> new ProblemView(problem.extension(), problem.field(), problem.message()))
                        .toList());
    }

    /**
     * The connections of the organization that the person views, whatever their connector, by name;
     * those whose connector is absent are unavailable.
     */
    @GET
    @Path("connections")
    @Transactional
    public List<ConnectionView> list() {
        Discovery discovery = catalog.discover();
        Set<String> visible = sharing.visible(EXTENSION, TYPE, VIEW);
        Map<String, UUID> owners = new HashMap<>();
        for (Resource resource : resources.list(EXTENSION, TYPE, null)) {
            if (resource.owner() != null) {
                owners.put(resource.ref().id(), resource.owner());
            }
        }
        Names names = new Names();
        return connections.all().stream()
                .filter(connection -> visible.contains(connection.getId().toString()))
                .map(connection -> view(connection, discovery, owners.get(connection.getId().toString()), names))
                .toList();
    }

    /** A connection that the person views. */
    @GET
    @Path("connections/{id}")
    @Transactional
    public ConnectionView get(@PathParam("id") UUID id) {
        return view(find(id, VIEW), catalog.discover());
    }

    /**
     * Creates a connection with a connector active in the organization, owned by the person of the
     * request.
     */
    @POST
    @Path("connections")
    @Transactional
    public Response create(NewConnection request) {
        if (request == null) {
            throw problem(Response.Status.BAD_REQUEST, "The name of the connection is required");
        }
        String name = name(request.name());
        String description = description(request.description());
        Discovery discovery = catalog.discover();
        Discovery.Found found = usable(discovery, request.type());
        Map<String, Object> values = checked(found.declaration(), request.settings());
        if (connections.countByName(name) > 0) {
            throw problem(Response.Status.CONFLICT, "A connection named " + name + " exists already");
        }
        String credential = credentialName(request.credential());
        Connection connection = new Connection(
                organization.require(),
                name,
                found.declaration().type(),
                found.connector().extension(),
                values,
                credential,
                Instant.now());
        connection.describe(description);
        connection.configure(values, credential, Addresses.of(found.connector(), values).orElse(null));
        connections.insert(connection);
        // The kernel records the person of the request as the owner (EXT-015), in the same transaction.
        resources.register(ref(connection.getId()), details(connection));
        if (request.tags() != null && !request.tags().isEmpty()) {
            try {
                tags.replace(ref(connection.getId()), request.tags());
            } catch (IllegalArgumentException e) {
                throw problem(Response.Status.BAD_REQUEST, e.getMessage());
            }
        }
        return Response.status(Response.Status.CREATED)
                .entity(view(connection, discovery))
                .build();
    }

    /**
     * Changes the name, the description, the values of the form and the credential of a connection
     * that the person edits. Its type never changes, and its connector must be active to check the
     * values. An empty description clears it.
     */
    @PUT
    @Path("connections/{id}")
    @Transactional
    public ConnectionView update(@PathParam("id") UUID id, ConnectionChange request) {
        if (request == null) {
            throw problem(Response.Status.BAD_REQUEST, "The name of the connection is required");
        }
        Connection connection = find(id, EDIT);
        String name = name(request.name());
        String description = description(request.description());
        Discovery discovery = catalog.discover();
        Discovery.Found found = available(connection, discovery);
        Map<String, Object> values = checked(found.declaration(), request.settings());
        if (connections.countOthersByName(name, id) > 0) {
            throw problem(Response.Status.CONFLICT, "A connection named " + name + " exists already");
        }
        connection.rename(name);
        connection.describe(description);
        connection.configure(
                values, credentialName(request.credential()), Addresses.of(found.connector(), values).orElse(null));
        connection.touch(Instant.now());
        connections.update(connection);
        resources.update(ref(id), details(connection));
        return view(connection, discovery);
    }

    /**
     * Uploads the thumbnail of a connection that the person edits, an image that its card shows
     * instead of the one generated from its name (EXT-011), replacing the previous one. It is a file of
     * the file service of the kernel attached to the connection, so that it follows its sharing.
     */
    @PUT
    @Path("connections/{id}/thumbnail")
    @Consumes(MediaType.WILDCARD)
    @Transactional
    public ConnectionView thumbnail(
            @PathParam("id") UUID id, @HeaderParam("Content-Type") String contentType, InputStream content) {
        Connection connection = find(id, EDIT);
        String type = contentType == null ? "" : contentType.split(";")[0].strip().toLowerCase(Locale.ROOT);
        if (!THUMBNAIL_TYPES.contains(type)) {
            throw problem(Response.Status.UNSUPPORTED_MEDIA_TYPE, "A thumbnail is a PNG, JPEG, GIF or WebP image");
        }
        byte[] image;
        try {
            image = content.readNBytes(MAX_THUMBNAIL + 1);
        } catch (IOException e) {
            throw problem(Response.Status.BAD_REQUEST, "The image could not be read");
        }
        if (image.length == 0) {
            throw problem(Response.Status.BAD_REQUEST, "The image is empty");
        }
        if (image.length > MAX_THUMBNAIL) {
            throw problem(Response.Status.REQUEST_ENTITY_TOO_LARGE, "A thumbnail is at most 1 MB");
        }
        StoredFile stored;
        try {
            stored = files.store(
                    EXTENSION,
                    FileStorage.NewFile.of("thumbnail-" + id, type).attachedTo(ref(id)),
                    new ByteArrayInputStream(image));
        } catch (IllegalArgumentException e) {
            throw problem(Response.Status.BAD_REQUEST, e.getMessage());
        } catch (IllegalStateException e) {
            // The image does not fit the storage quota of the organization; the kernel names the limit.
            throw problem(Response.Status.FORBIDDEN, e.getMessage());
        }
        forgetThumbnail(connection);
        connection.thumbnail(stored.id());
        connection.touch(Instant.now());
        connections.update(connection);
        return view(connection, catalog.discover());
    }

    /**
     * Replaces the free tags of a connection that the person edits (EXT-012): the kernel keeps them
     * lowercase, each once. The type and the category are not tags: they come from the connector.
     */
    @PUT
    @Path("connections/{id}/tags")
    @Transactional
    public ConnectionView replaceTags(@PathParam("id") UUID id, TagsChange request) {
        Connection connection = find(id, EDIT);
        try {
            tags.replace(ref(id), request == null || request.tags() == null ? List.of() : request.tags());
        } catch (IllegalArgumentException e) {
            throw problem(Response.Status.BAD_REQUEST, e.getMessage());
        }
        connection.touch(Instant.now());
        connections.update(connection);
        return view(connection, catalog.discover());
    }

    /**
     * The tags in use in the organization that start with what the person types, drawn by the kernel
     * from the resources the person may read, of any extension.
     */
    @GET
    @Path("tags")
    public TagSuggestions suggestTags(@QueryParam("prefix") @DefaultValue("") String prefix) {
        return new TagSuggestions(tags.suggest(prefix, SUGGESTIONS));
    }

    /** Removes the uploaded thumbnail of a connection that the person edits: its card generates one again. */
    @DELETE
    @Path("connections/{id}/thumbnail")
    @Transactional
    public ConnectionView removeThumbnail(@PathParam("id") UUID id) {
        Connection connection = find(id, EDIT);
        forgetThumbnail(connection);
        connection.thumbnail(null);
        connection.touch(Instant.now());
        connections.update(connection);
        return view(connection, catalog.discover());
    }

    /** Tests the settings of a connection before it is created. */
    @POST
    @Path("connections/test")
    public TestResult test(NewConnection request) {
        if (request == null) {
            throw problem(Response.Status.BAD_REQUEST, "The type and the settings are required");
        }
        Discovery.Found found = usable(catalog.discover(), request.type());
        Map<String, Object> values = checked(found.declaration(), request.settings());
        return test(found.connector(), values, credentialName(request.credential()));
    }

    /**
     * Tests the settings of a connection before it is created and, when the source answers, lists the
     * first pieces of its top level: the test shows what the source holds, not only that it answers
     * (EXT-013). A source that does not answer gives its error.
     */
    @POST
    @Path("connections/preview")
    public Preview preview(NewConnection request) {
        if (request == null) {
            throw problem(Response.Status.BAD_REQUEST, "The type and the settings are required");
        }
        Discovery.Found found = usable(catalog.discover(), request.type());
        Map<String, Object> values = checked(found.declaration(), request.settings());
        String credential = credentialName(request.credential());
        String address = Addresses.of(found.connector(), values).orElse(null);
        TestResult result = test(found.connector(), values, credential);
        if (!result.success()) {
            return new Preview(false, result.message(), address, null);
        }
        ContentsView contents = withSettings(values, credential, settings -> {
            try {
                return ContentsView.listed("", found.connector().list(settings, "", new Paging(0, PREVIEW)), true);
            } catch (ContentsUnavailableException e) {
                return ContentsView.unavailable("", e);
            }
        });
        return new Preview(true, result.message(), address, contents);
    }

    /** Tests a connection that the person uses, with its settings and credential. */
    @POST
    @Path("connections/{id}/test")
    @Transactional
    public TestResult test(@PathParam("id") UUID id) {
        Connection connection = find(id, USE);
        Discovery.Found found = available(connection, catalog.discover());
        TestResult result = test(found.connector(), connection.getSettings(), connection.getCredential());
        // The state of the source that the card shows (EXT-014).
        connection.checked(result.success(), Instant.now());
        connections.update(connection);
        return result;
    }

    /**
     * The pieces of a connection (EXT-019): its top level without a parent, then what the container
     * with that id holds, as its connector lists them, read on the server, which reaches sources the
     * browser cannot. A source that cannot be listed answers with the reason, never with an empty list.
     */
    @GET
    @Path("connections/{id}/contents")
    @Transactional
    public ContentsView contents(
            @PathParam("id") UUID id,
            @QueryParam("parent") @DefaultValue("") String parent,
            @QueryParam("offset") @DefaultValue("0") int offset,
            @QueryParam("limit") @DefaultValue("100") int limit) {
        if (offset < 0 || limit < 1 || limit > MAX_PAGE) {
            throw problem(Response.Status.BAD_REQUEST, "offset is 0 or more, limit from 1 to " + MAX_PAGE);
        }
        Connection connection = find(id, USE);
        Connector connector = available(connection, catalog.discover()).connector();
        ContentsView contents = withSettings(connection.getSettings(), connection.getCredential(), settings -> {
            try {
                return ContentsView.listed(parent, connector.list(settings, parent, new Paging(offset, limit)), offset == 0);
            } catch (ContentsUnavailableException e) {
                return ContentsView.unavailable(parent, e);
            } catch (IllegalArgumentException e) {
                throw problem(Response.Status.NOT_FOUND, "No such container in the source: " + parent);
            }
        });
        measure(connection, contents, offset);
        return contents;
    }

    /**
     * What a listing tells of the source of a connection, which its card shows (EXT-014): whether it
     * answers and, for the first page of its top level, how many pieces it holds.
     */
    private void measure(Connection connection, ContentsView contents, int offset) {
        boolean reachable = !"unreachable".equals(contents.state());
        connection.checked(reachable, Instant.now());
        if (contents.parent().isEmpty() && offset == 0 && Set.of("listed", "empty").contains(contents.state())) {
            connection.counted(contents.items().size(), contents.more());
        }
        connections.update(connection);
    }

    /**
     * Runs a query on a connection whose connector takes queries (EXT-040), and returns at most the row
     * limit of rows, saying whether the source had more. The connector runs it so that it only reads.
     */
    @POST
    @Path("connections/{id}/query")
    @Transactional
    public Rows query(@PathParam("id") UUID id, QueryRequest request) {
        if (request == null || request.statement() == null || request.statement().isBlank()) {
            throw problem(Response.Status.BAD_REQUEST, "The statement of the query is required");
        }
        int limit = request.limit() == null ? DEFAULT_ROWS : request.limit();
        if (limit < 1 || limit > MAX_ROWS) {
            throw problem(Response.Status.BAD_REQUEST, "The row limit is from 1 to " + MAX_ROWS);
        }
        Connection connection = find(id, USE);
        Connector connector = available(connection, catalog.discover()).connector();
        return withSettings(connection.getSettings(), connection.getCredential(), settings -> {
            try {
                return connector.query(settings, request.statement(), limit);
            } catch (UnsupportedOperationException e) {
                throw problem(Response.Status.NOT_IMPLEMENTED, "The connector of this connection runs no queries");
            } catch (ContentsUnavailableException e) {
                throw problem(Response.Status.BAD_GATEWAY, e.getMessage());
            } catch (IllegalArgumentException e) {
                throw problem(Response.Status.BAD_REQUEST, e.getMessage());
            }
        });
    }

    private TestResult test(Connector connector, Map<String, Object> values, String credential) {
        try {
            return withSettings(values, credential, connector::test);
        } catch (NoSuchCredential e) {
            return TestResult.failed(e.getMessage());
        }
    }

    /**
     * Calls the connector with the settings and the credential, read now from the secrets service and
     * closed after the call.
     */
    private <T> T withSettings(Map<String, Object> values, String credential, Function<ConnectionSettings, T> call) {
        Optional<SecretValue> secret = Optional.empty();
        if (credential != null) {
            try {
                secret = secrets.resolve(EXTENSION, credential);
            } catch (SecretsUnavailableException e) {
                throw problem(Response.Status.SERVICE_UNAVAILABLE, "The credentials cannot be read on this installation");
            }
            if (secret.isEmpty()) {
                throw new NoSuchCredential(credential);
            }
        }
        try {
            return call.apply(new ConnectionSettings(values, secret));
        } finally {
            secret.ifPresent(SecretValue::close);
        }
    }

    /** A credential named by a connection that the secrets service does not have. */
    static final class NoSuchCredential extends WebApplicationException {
        NoSuchCredential(String name) {
            super(
                    "There is no credential " + name + " in the credentials of the organization",
                    Response.status(422)
                            .type(MediaType.APPLICATION_JSON)
                            .entity(Map.of("message",
                                    "There is no credential " + name + " in the credentials of the organization"))
                            .build());
        }
    }

    /**
     * A connection on which the person holds the level: 404 when they hold none, as when it does not
     * exist, 403 when they hold a lower one.
     */
    private Connection find(UUID id, String level) {
        Connection connection = connections.findById(id).orElseThrow(NotFoundException::new);
        sharing.require(ref(id), level);
        return connection;
    }

    private void forgetThumbnail(Connection connection) {
        if (connection.getThumbnail() == null) {
            return;
        }
        try {
            files.delete(EXTENSION, connection.getThumbnail());
        } catch (NoSuchElementException e) {
            // Gone already: nothing to remove.
        }
    }

    /** The reference of a connection in the registry of resources of the kernel. */
    static ResourceRef ref(UUID id) {
        return new ResourceRef(EXTENSION, TYPE, id.toString());
    }

    private static Resources.Details details(Connection connection) {
        return Resources.Details.of(connection.getName(), "/app/connections/" + connection.getId());
    }

    private static String name(String requested) {
        if (requested == null || requested.isBlank()) {
            throw problem(Response.Status.BAD_REQUEST, "The name of the connection is required");
        }
        String name = requested.strip();
        if (name.length() > Connection.MAX_NAME) {
            throw problem(Response.Status.BAD_REQUEST, "The name is longer than " + Connection.MAX_NAME + " characters");
        }
        return name;
    }

    /** The description of a request, {@code null} when it is empty: saving it empty clears it. */
    static String description(String requested) {
        if (requested == null || requested.isBlank()) {
            return null;
        }
        String description = requested.strip();
        if (description.length() > Connection.MAX_DESCRIPTION) {
            throw problem(
                    Response.Status.BAD_REQUEST,
                    "The description is longer than " + Connection.MAX_DESCRIPTION + " characters");
        }
        return description;
    }

    /** The connector of a connection, or 409 naming its extension when it is absent. */
    private static Discovery.Found available(Connection connection, Discovery discovery) {
        return discovery
                .connector(connection.getType())
                .orElseThrow(() -> new WebApplicationException(Response.status(Response.Status.CONFLICT)
                        .type(MediaType.APPLICATION_JSON)
                        .entity(Map.of(
                                "message", "The connector of this connection is not available",
                                "connector", connection.getConnector()))
                        .build()));
    }

    private static Discovery.Found usable(Discovery discovery, String type) {
        if (type == null || type.isBlank()) {
            throw problem(Response.Status.BAD_REQUEST, "The type of the connection is required");
        }
        return discovery.connector(type)
                .orElseThrow(() -> problem(Response.Status.BAD_REQUEST, "There is no connector of type " + type));
    }

    private static Map<String, Object> checked(Declaration declaration, Map<String, Object> settings) {
        FormValues.Checked checked = FormValues.check(declaration.form(), settings);
        if (!checked.problems().isEmpty()) {
            throw problem(Response.Status.BAD_REQUEST, String.join("; ", checked.problems()));
        }
        return checked.values();
    }

    private static String credentialName(String credential) {
        return credential == null || credential.isBlank() ? null : credential.strip();
    }

    private static ConnectorView view(String extension, Declaration declaration) {
        return new ConnectorView(
                declaration.type(),
                extension,
                declaration.title(),
                declaration.titles() == null ? Map.of() : declaration.titles(),
                declaration.category(),
                "/api/v1/extension-assets/" + extension + "/" + declaration.logo(),
                declaration.form());
    }

    /** A connection with its owner as the kernel keeps it. */
    private ConnectionView view(Connection connection, Discovery discovery) {
        UUID owner = resources.find(ref(connection.getId())).map(Resource::owner).orElse(null);
        return view(connection, discovery, owner, new Names());
    }

    private ConnectionView view(Connection connection, Discovery discovery, UUID owner, Names names) {
        return new ConnectionView(
                connection.getId(),
                connection.getName(),
                connection.getType(),
                connection.getConnector(),
                discovery.connector(connection.getType()).isPresent(),
                connection.getSettings(),
                connection.getCredential(),
                connection.getCreatedAt(),
                connection.getDescription(),
                connection.getAddress(),
                owner == null ? null : new OwnerView(owner, names.of(owner)),
                connection.getThumbnail(),
                sharing.allows(ref(connection.getId()), EDIT),
                connection.getUpdatedAt(),
                connection.getPieces(),
                connection.hasMorePieces(),
                connection.getSourceState(),
                connection.getCheckedAt(),
                tagsOf(connection));
    }

    /** The free tags of a connection, empty when the kernel has no entry for it. */
    private List<String> tagsOf(Connection connection) {
        try {
            return tags.of(ref(connection.getId()));
        } catch (NoSuchElementException e) {
            return List.of();
        }
    }

    /** The names of the people of the organization, each read once for an answer. */
    private final class Names {
        private final Map<UUID, Optional<String>> known = new HashMap<>();

        String of(UUID account) {
            return known.computeIfAbsent(account, _ -> people.find(account).map(People.Person::displayName))
                    .orElse(null);
        }
    }

    private static WebApplicationException problem(Response.Status status, String message) {
        return new WebApplicationException(
                message,
                Response.status(status)
                        .type(MediaType.APPLICATION_JSON)
                        .entity(Map.of("message", message))
                        .build());
    }
}
