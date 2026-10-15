// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.postgres;

import io.github.mosaikit.ext.catalog.connection.api.v1.Column;
import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.ContentsUnavailableException;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import io.github.mosaikit.ext.catalog.connection.api.v1.Page;
import io.github.mosaikit.ext.catalog.connection.api.v1.Paging;
import io.github.mosaikit.ext.catalog.connection.api.v1.Piece;
import io.github.mosaikit.ext.catalog.connection.api.v1.Rows;
import io.github.mosaikit.ext.catalog.connection.api.v1.TestResult;
import jakarta.enterprise.context.ApplicationScoped;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import org.postgresql.Driver;

/**
 * The connector to a PostgreSQL database (EXT-040), an implementation of the contract "connector" of the
 * connection framework (EXT-010). Its pieces are the schemas of the database, and the tables, views,
 * materialized views and foreign tables of each schema, with their columns (EXT-019); a column of type
 * {@code geometry} or {@code geography} (PostGIS) is also a fact {@value Piece.Facts#GEOMETRY}. It shows
 * only what the user of the connection may read, and runs queries in a read-only transaction.
 *
 * <p>The password of the user is the credential of the connection, which the framework reads from the
 * secrets service of the platform at each call: the connector puts it in the properties of the JDBC
 * connection and nowhere else. The JDBC driver is the one of the kernel ({@code org.postgresql:postgresql},
 * a library of the kernel, so the build of the extension leaves it out of its package, MK-131).
 */
@ApplicationScoped
public class PostgresConnector implements Connector {

    /** The identifier of this extension. */
    static final String EXTENSION = "io.github.mosaikit.ext.catalog.connection.postgres";

    static final int DEFAULT_PORT = 5432;

    /** How long a connection waits for the server, and a call for its answer, in seconds. */
    static final int CONNECT_TIMEOUT = 10;

    static final int SOCKET_TIMEOUT = 120;

    static final int QUERY_TIMEOUT = 60;

    /** The tables shown in the preview of a connection test. */
    static final int PREVIEW = 5;

    /** The SSL modes of the driver, from the least to the most strict. */
    static final List<String> SSL_MODES = List.of("disable", "allow", "prefer", "require", "verify-ca", "verify-full");

    /** The schemas the user may use, out of those of the system. */
    private static final String SCHEMAS = """
            select n.nspname from pg_catalog.pg_namespace n
            where n.nspname <> 'information_schema' and n.nspname not like 'pg\\_%'
              and has_schema_privilege(n.oid, 'USAGE')
            """;

    /** The relations of the user that hold rows: tables, partitioned tables, views, materialized views, foreign tables. */
    private static final String RELATIONS = """
            from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r', 'p', 'v', 'm', 'f') and not c.relispartition
              and n.nspname <> 'information_schema' and n.nspname not like 'pg\\_%'
              and has_schema_privilege(n.oid, 'USAGE') and has_table_privilege(c.oid, 'SELECT')
            """;

    @Override
    public String extension() {
        return EXTENSION;
    }

    @Override
    public Declaration declaration() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("host", Map.of("type", "string", "title", "Host", "description", "The name or address of the server"));
        properties.put("port", Map.of("type", "integer", "title", "Port", "default", DEFAULT_PORT));
        properties.put("database", Map.of("type", "string", "title", "Database"));
        properties.put("user", Map.of("type", "string", "title", "User", "description", "Its password is the credential of the connection"));
        properties.put("sslmode", Map.of(
                "type", "string",
                "title", "SSL mode",
                "default", "prefer",
                "enum", SSL_MODES));
        return new Declaration(
                "postgres",
                "PostgreSQL",
                Map.of(),
                "database",
                "web/logo.svg",
                Map.of("type", "object", "required", List.of("host", "database", "user"), "properties", properties));
    }

    /** Connects, and answers with the version of the server and a preview of its tables, or the error of the server. */
    @Override
    public TestResult test(ConnectionSettings settings) {
        try (Connection connection = open(settings)) {
            connection.setReadOnly(true);
            String version;
            try (Statement statement = connection.createStatement();
                    ResultSet result = statement.executeQuery("show server_version")) {
                result.next();
                version = result.getString(1);
            }
            List<String> tables = new ArrayList<>();
            long total = 0;
            try (Statement statement = connection.createStatement();
                    ResultSet result = statement.executeQuery("select n.nspname, c.relname, count(*) over () " + RELATIONS
                            + " order by n.nspname, c.relname limit " + PREVIEW)) {
                while (result.next()) {
                    tables.add(result.getString(1) + "." + result.getString(2));
                    total = result.getLong(3);
                }
            }
            String database = settings.text("database").orElse("");
            String preview = tables.isEmpty()
                    ? "no tables or views yet"
                    : String.join(", ", tables) + (total > tables.size() ? " and " + (total - tables.size()) + " more" : "");
            return TestResult.succeeded("PostgreSQL " + version + ", database " + database + ": " + preview);
        } catch (SQLException e) {
            return TestResult.failed(message(e));
        } catch (IllegalArgumentException e) {
            return TestResult.failed(e.getMessage());
        }
    }

    /** The schemas with an empty parent, the relations of a schema with its id, each with its columns. */
    @Override
    public Page<Piece> list(ConnectionSettings settings, String parent, Paging paging) {
        List<String> path = Ids.parse(parent);
        if (path.size() > 1) {
            throw new IllegalArgumentException("A table holds no pieces");
        }
        try (Connection connection = reach(settings)) {
            connection.setReadOnly(true);
            return path.isEmpty() ? schemas(connection, paging) : relations(connection, path.getFirst(), paging);
        } catch (SQLException e) {
            throw ContentsUnavailableException.unreachable(message(e));
        }
    }

    /** Runs the query in a read-only transaction, which it rolls back, and returns at most limit rows. */
    @Override
    public Rows query(ConnectionSettings settings, String statement, int limit) {
        Connection connection = reach(settings);
        try (connection) {
            connection.setAutoCommit(false);
            connection.setReadOnly(true);
            try (Statement query = connection.createStatement()) {
                query.setMaxRows(limit + 1);
                query.setFetchSize(Math.min(limit + 1, 500));
                query.setQueryTimeout(QUERY_TIMEOUT);
                if (!query.execute(statement)) {
                    throw new IllegalArgumentException("The statement returns no rows");
                }
                try (ResultSet result = query.getResultSet()) {
                    ResultSetMetaData meta = result.getMetaData();
                    List<Column> columns = new ArrayList<>();
                    for (int i = 1; i <= meta.getColumnCount(); i++) {
                        columns.add(new Column(meta.getColumnLabel(i), meta.getColumnTypeName(i)));
                    }
                    List<List<Object>> rows = new ArrayList<>();
                    boolean truncated = false;
                    while (result.next()) {
                        if (rows.size() == limit) {
                            truncated = true;
                            break;
                        }
                        List<Object> row = new ArrayList<>(columns.size());
                        for (int i = 1; i <= columns.size(); i++) {
                            row.add(Values.json(result.getObject(i)));
                        }
                        rows.add(row);
                    }
                    return new Rows(columns, rows, truncated);
                }
            } finally {
                connection.rollback();
            }
        } catch (SQLException e) {
            if (connectionLost(e)) {
                throw ContentsUnavailableException.unreachable(message(e));
            }
            throw new IllegalArgumentException(message(e), e);
        }
    }

    private static Page<Piece> schemas(Connection connection, Paging paging) throws SQLException {
        List<Piece> pieces = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(SCHEMAS + " order by n.nspname offset ? limit ?")) {
            statement.setInt(1, paging.offset());
            statement.setInt(2, paging.limit() + 1);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    String schema = result.getString(1);
                    pieces.add(new Piece(Ids.of(schema), schema, "schema", true));
                }
            }
        }
        return page(pieces, paging);
    }

    private static Page<Piece> relations(Connection connection, String schema, Paging paging) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(SCHEMAS + " and n.nspname = ?")) {
            statement.setString(1, schema);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalArgumentException("No such schema: " + schema);
                }
            }
        }
        Map<String, String> kinds = new LinkedHashMap<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "select c.relname, c.relkind " + RELATIONS + " and n.nspname = ? order by c.relname offset ? limit ?")) {
            statement.setString(1, schema);
            statement.setInt(2, paging.offset());
            statement.setInt(3, paging.limit() + 1);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    kinds.put(result.getString(1), kind(result.getString(2)));
                }
            }
        }
        Map<String, List<Column>> columns = new LinkedHashMap<>();
        Map<String, List<String>> geometries = new LinkedHashMap<>();
        if (!kinds.isEmpty()) {
            try (PreparedStatement statement = connection.prepareStatement("""
                    select c.relname, a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod), t.typname
                    from pg_catalog.pg_attribute a
                      join pg_catalog.pg_class c on c.oid = a.attrelid
                      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                      join pg_catalog.pg_type t on t.oid = a.atttypid
                    where n.nspname = ? and c.relname = any(?) and a.attnum > 0 and not a.attisdropped
                    order by c.relname, a.attnum
                    """)) {
                statement.setString(1, schema);
                statement.setArray(2, connection.createArrayOf("text", kinds.keySet().toArray()));
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        String table = result.getString(1);
                        String column = result.getString(2);
                        columns.computeIfAbsent(table, any -> new ArrayList<>()).add(new Column(column, result.getString(3)));
                        String type = result.getString(4);
                        if ("geometry".equals(type) || "geography".equals(type)) {
                            geometries.computeIfAbsent(table, any -> new ArrayList<>()).add(column);
                        }
                    }
                }
            }
        }
        List<Piece> pieces = new ArrayList<>();
        kinds.forEach((table, kind) -> {
            Map<String, Object> facts = new LinkedHashMap<>();
            facts.put(Piece.Facts.COLUMNS, columns.getOrDefault(table, List.of()));
            facts.put(Piece.Facts.GEOMETRY, geometries.get(table));
            pieces.add(new Piece(Ids.of(schema, table), table, kind, false, facts));
        });
        return page(pieces, paging);
    }

    /** A page out of one more row than asked, which says whether there are more. */
    private static Page<Piece> page(List<Piece> pieces, Paging paging) {
        boolean more = pieces.size() > paging.limit();
        return new Page<>(more ? pieces.subList(0, paging.limit()) : pieces, more);
    }

    private static String kind(String relkind) {
        return switch (relkind) {
            case "v" -> "view";
            case "m" -> "materialized-view";
            case "f" -> "foreign-table";
            default -> "table";
        };
    }

    /** A JDBC connection, or the reason why the source cannot be reached, with its error. */
    private static Connection reach(ConnectionSettings settings) {
        try {
            return open(settings);
        } catch (SQLException e) {
            throw ContentsUnavailableException.unreachable(message(e));
        } catch (IllegalArgumentException e) {
            throw ContentsUnavailableException.unreachable(e.getMessage());
        }
    }

    /** A JDBC connection with the settings and the credential of the connection. */
    static Connection open(ConnectionSettings settings) throws SQLException {
        String host = settings.text("host").orElseThrow(() -> new IllegalArgumentException("The host is required")).strip();
        if (host.contains("/") || host.contains("?") || host.contains("#") || host.contains("@")) {
            throw new IllegalArgumentException("The host is a name or an address, not '" + host + "'");
        }
        int port = port(settings);
        String database = settings.text("database").orElseThrow(() -> new IllegalArgumentException("The database is required"));
        String user = settings.text("user").orElseThrow(() -> new IllegalArgumentException("The user is required"));
        String sslmode = settings.text("sslmode").orElse("prefer");
        if (!SSL_MODES.contains(sslmode)) {
            throw new IllegalArgumentException("The SSL mode is one of " + SSL_MODES);
        }
        String address = host.contains(":") && !host.startsWith("[") ? "[" + host + "]" : host;
        String url = "jdbc:postgresql://" + address + ":" + port + "/" + URLEncoder.encode(database, StandardCharsets.UTF_8);
        Properties properties = new Properties();
        properties.setProperty("user", user);
        settings.credential().ifPresent(secret -> properties.setProperty("password", secret.reveal()));
        properties.setProperty("sslmode", sslmode);
        properties.setProperty("connectTimeout", String.valueOf(CONNECT_TIMEOUT));
        properties.setProperty("loginTimeout", String.valueOf(CONNECT_TIMEOUT));
        properties.setProperty("socketTimeout", String.valueOf(SOCKET_TIMEOUT));
        properties.setProperty("ApplicationName", "Mosaikit connections");
        Connection connection = new Driver().connect(url, properties);
        if (connection == null) {
            throw new IllegalArgumentException("The address of the server is not valid");
        }
        return connection;
    }

    private static int port(ConnectionSettings settings) {
        Object value = settings.values().get("port");
        if (value == null || value.toString().isBlank()) {
            return DEFAULT_PORT;
        }
        try {
            int port = value instanceof Number number ? number.intValue() : Integer.parseInt(value.toString().strip());
            if (port < 1 || port > 65535) {
                throw new NumberFormatException();
            }
            return port;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("The port is a number from 1 to 65535");
        }
    }

    /** Whether the server could not be reached or refused the user: SQL states of the classes 08 and 28. */
    private static boolean connectionLost(SQLException e) {
        String state = e.getSQLState();
        return state != null && (state.startsWith("08") || state.startsWith("28"));
    }

    /** The error of the server, as it says it: never the credential, which the server does not repeat. */
    private static String message(SQLException e) {
        String message = e.getMessage();
        return message == null || message.isBlank() ? "The server refused the connection (" + e.getSQLState() + ")" : message;
    }
}
