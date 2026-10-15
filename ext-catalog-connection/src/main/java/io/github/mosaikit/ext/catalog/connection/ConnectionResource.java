// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import dev.mosaikit.kernel.api.context.CurrentOrganization;
import dev.mosaikit.kernel.api.secrets.SecretValue;
import dev.mosaikit.kernel.api.secrets.Secrets;
import dev.mosaikit.kernel.api.secrets.SecretsUnavailableException;
import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import io.github.mosaikit.ext.catalog.connection.api.v1.Entry;
import io.github.mosaikit.ext.catalog.connection.api.v1.Page;
import io.github.mosaikit.ext.catalog.connection.api.v1.Paging;
import io.github.mosaikit.ext.catalog.connection.api.v1.TestResult;
import io.quarkus.security.Authenticated;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

/**
 * The connectors and the connections of an organization (EXT-010), under {@code
 * /api/v1/ext/connections}. The framework knows no protocol: it finds the connectors through its
 * contract (MK-134), keeps the connections, reads their credentials from the secrets service of the
 * kernel at the moment of a call and passes them to the connector. No answer of this API contains a
 * credential.
 */
@Path("/api/v1/ext/connections")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
public class ConnectionResource {

    /** The identifier of the extension, which it names in every call to the kernel. */
    static final String EXTENSION = Connector.FRAMEWORK;

    /** The most entries of a page of contents. */
    static final int MAX_PAGE = 500;

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

    /** Request to create a connection, or to test one before creating it. */
    public record NewConnection(String name, String type, Map<String, Object> settings, String credential) {}

    /**
     * A connection in a list.
     *
     * @param connector the extension that declared its type
     * @param available whether its connector is active in the organization; when it is not, the
     *     connection is kept as it is and works again when the connector comes back
     * @param settings the values of its connection form
     * @param credential the name of its credential in the secrets service, never the credential
     */
    public record ConnectionView(
            UUID id,
            String name,
            String type,
            String connector,
            boolean available,
            Map<String, Object> settings,
            String credential,
            Instant created) {}

    /** A page of the contents of a connection. */
    public record ContentsView(String path, List<Entry> items, boolean more) {}

    private final Connections connections;
    private final ConnectorCatalog catalog;
    private final CurrentOrganization organization;
    private final Secrets secrets;

    public ConnectionResource(
            Connections connections, ConnectorCatalog catalog, CurrentOrganization organization, Secrets secrets) {
        this.connections = connections;
        this.catalog = catalog;
        this.organization = organization;
        this.secrets = secrets;
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

    /** The connections of the organization, by name; those whose connector is absent are unavailable. */
    @GET
    @Path("connections")
    @Transactional
    public List<ConnectionView> list() {
        Discovery discovery = catalog.discover();
        return connections.all().stream().map(connection -> view(connection, discovery)).toList();
    }

    /** Creates a connection with a connector active in the organization. */
    @POST
    @Path("connections")
    @Transactional
    public Response create(NewConnection request) {
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw problem(Response.Status.BAD_REQUEST, "The name of the connection is required");
        }
        String name = request.name().strip();
        if (name.length() > Connection.MAX_NAME) {
            throw problem(Response.Status.BAD_REQUEST, "The name is longer than " + Connection.MAX_NAME + " characters");
        }
        Discovery discovery = catalog.discover();
        Discovery.Found found = usable(discovery, request.type());
        Map<String, Object> values = checked(found.declaration(), request.settings());
        if (connections.countByName(name) > 0) {
            throw problem(Response.Status.CONFLICT, "A connection named " + name + " exists already");
        }
        Connection connection = new Connection(
                organization.require(),
                name,
                found.declaration().type(),
                found.connector().extension(),
                values,
                credentialName(request.credential()),
                Instant.now());
        connections.insert(connection);
        return Response.status(Response.Status.CREATED)
                .entity(view(connection, discovery))
                .build();
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

    /** Tests a connection with its settings and credential. */
    @POST
    @Path("connections/{id}/test")
    @Transactional
    public TestResult test(@PathParam("id") UUID id) {
        Connection connection = find(id);
        Discovery.Found found = available(connection);
        return test(found.connector(), connection.getSettings(), connection.getCredential());
    }

    /** The contents of a connection at a path, its top level without one, as its connector lists them. */
    @GET
    @Path("connections/{id}/contents")
    @Transactional
    public ContentsView contents(
            @PathParam("id") UUID id,
            @QueryParam("path") @DefaultValue("") String path,
            @QueryParam("offset") @DefaultValue("0") int offset,
            @QueryParam("limit") @DefaultValue("100") int limit) {
        if (offset < 0 || limit < 1 || limit > MAX_PAGE) {
            throw problem(Response.Status.BAD_REQUEST, "offset is 0 or more, limit from 1 to " + MAX_PAGE);
        }
        Connection connection = find(id);
        Connector connector = available(connection).connector();
        Page<Entry> page = withSettings(connection.getSettings(), connection.getCredential(), settings -> {
            try {
                return connector.list(settings, path, new Paging(offset, limit));
            } catch (IllegalArgumentException e) {
                throw problem(Response.Status.NOT_FOUND, "No such path in the source: " + path);
            }
        });
        return new ContentsView(path, page.items(), page.more());
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

    private Connection find(UUID id) {
        return connections.findById(id).orElseThrow(NotFoundException::new);
    }

    /** The connector of a connection, or 409 naming its extension when it is absent. */
    private Discovery.Found available(Connection connection) {
        return catalog.discover()
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

    private static ConnectionView view(Connection connection, Discovery discovery) {
        return new ConnectionView(
                connection.getId(),
                connection.getName(),
                connection.getType(),
                connection.getConnector(),
                discovery.connector(connection.getType()).isPresent(),
                connection.getSettings(),
                connection.getCredential(),
                connection.getCreatedAt());
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
