// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.connector.sample;

import io.github.mosaikit.ext.catalog.connection.api.v1.Column;
import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.ContentsUnavailableException;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import io.github.mosaikit.ext.catalog.connection.api.v1.Inspection;
import io.github.mosaikit.ext.catalog.connection.api.v1.Page;
import io.github.mosaikit.ext.catalog.connection.api.v1.Paging;
import io.github.mosaikit.ext.catalog.connection.api.v1.Piece;
import io.github.mosaikit.ext.catalog.connection.api.v1.TestResult;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.Set;

/**
 * A connector of the tests of the connection framework (EXT-010, EXT-019): a database with a few pieces
 * in memory. A host named {@code unreachable.example.org} does not answer, one named {@code
 * empty.example.org} holds nothing; a credential, when the connection has one, must be {@code s3cret}.
 * The folder {@code archive} is a kind the connector cannot read yet. It tells the address of its
 * source itself (EXT-015).
 */
@ApplicationScoped
public class SampleConnector implements Connector {

    static final String UNREACHABLE = "unreachable.example.org";

    static final String EMPTY = "empty.example.org";

    static final Map<String, List<Piece>> CONTENTS = Map.of(
            "",
            List.of(
                    new Piece("sales", "sales", "schema", true),
                    new Piece("places", "places", "schema", true),
                    new Piece("archive", "archive", "folder", true)),
            "sales",
            List.of(
                    table("sales/customers", "customers", List.of(new Column("id", "integer"), new Column("name", "text"))),
                    table("sales/orders", "orders", List.of(new Column("id", "integer"), new Column("total", "numeric")))),
            "places",
            List.of(
                    new Piece(
                            "places/sites",
                            "sites",
                            "table",
                            false,
                            Map.of(
                                    Piece.Facts.COLUMNS, List.of(new Column("name", "text"), new Column("location", "geometry")),
                                    Piece.Facts.GEOMETRY, List.of("location"))),
                    // Its column position is text: only reading its rows shows that it holds coordinates (EXT-018).
                    table("places/stores", "stores", List.of(new Column("name", "text"), new Column("position", "text")))));

    /** The first rows of each table, as JSON, which inspecting a table reads (EXT-018). */
    static final Map<String, String> ROWS = Map.of(
            "sales/customers", "[{\"id\":1,\"name\":\"Acme\"},{\"id\":2,\"name\":\"Green\"}]",
            "sales/orders", "[{\"id\":1,\"total\":10.5},{\"id\":2,\"total\":7}]",
            "places/sites", "[{\"name\":\"North\",\"location\":\"POINT(7.68 45.07)\"}]",
            "places/stores", "[{\"name\":\"Centre\",\"position\":\"45.0703 7.6869\"},{\"name\":\"Station\",\"position\":\"45.0621 7.6782\"}]");

    /** A value made of a latitude and a longitude, as some tables keep coordinates in text. */
    static final Pattern COORDINATES = Pattern.compile("-?\\d{1,2}\\.\\d+[ ,;]+-?\\d{1,3}\\.\\d+");

    /** A field of a JSON object with a text value. */
    static final Pattern TEXT_FIELD = Pattern.compile("\"(\\w+)\":\"([^\"]*)\"");

    private static Piece table(String id, String name, List<Column> columns) {
        return new Piece(id, name, "table", false, Map.of(Piece.Facts.COLUMNS, columns));
    }

    @Override
    public String extension() {
        return "org.example.connector.sample";
    }

    @Override
    public Declaration declaration() {
        return new Declaration(
                "sample",
                "Sample source",
                Map.of("it", "Sorgente di esempio"),
                "database",
                "web/logo.svg",
                Map.of(
                        "type", "object",
                        "required", List.of("host"),
                        "properties", Map.of(
                                "host", Map.of("type", "string", "title", "Host"),
                                "port", Map.of("type", "integer", "title", "Port", "default", 9000))));
    }

    /** The kinds of its pieces, declared rather than taken from its category (EXT-026). */
    @Override
    public Set<String> kinds() {
        return Set.of("schema", "table", "folder");
    }

    @Override
    public TestResult test(ConnectionSettings settings) {
        String host = settings.text("host").orElse("");
        if (UNREACHABLE.equals(host)) {
            return TestResult.failed(host + " does not answer");
        }
        if (settings.credential().isPresent() && !"s3cret".equals(settings.credential().get().reveal())) {
            return TestResult.failed(host + " refused the credential");
        }
        return TestResult.succeeded("Connected to " + host + (settings.credential().isPresent() ? " with the credential" : ""));
    }

    /**
     * Reads the first rows of a table (EXT-018), and finds the text columns whose values are coordinates:
     * a fact {@code geometry} that the declaration of the table does not have.
     */
    @Override
    public Inspection inspect(ConnectionSettings settings, String piece) {
        String host = settings.text("host").orElse("");
        if (UNREACHABLE.equals(host)) {
            throw ContentsUnavailableException.unreachable(host + " does not answer");
        }
        String rows = ROWS.get(piece);
        if (rows == null) {
            if (CONTENTS.containsKey(piece) || "archive".equals(piece)) {
                throw ContentsUnavailableException.notReadable("A schema or a folder holds pieces: inspect them one by one.");
            }
            throw new IllegalArgumentException("No such piece: " + piece);
        }
        List<String> coordinates = new ArrayList<>();
        Matcher found = TEXT_FIELD.matcher(rows);
        while (found.find()) {
            if (COORDINATES.matcher(found.group(2)).matches() && !coordinates.contains(found.group(1))) {
                coordinates.add(found.group(1));
            }
        }
        return new Inspection(
                "application/json",
                List.of(rows),
                coordinates.isEmpty() ? Map.of() : Map.of(Piece.Facts.GEOMETRY, coordinates));
    }

    @Override
    public Optional<String> address(ConnectionSettings settings) {
        return settings.text("host").map(host -> "sample://" + host + settings.text("port").map(port -> ":" + port).orElse(""));
    }

    @Override
    public Page<Piece> list(ConnectionSettings settings, String parent, Paging paging) {
        String host = settings.text("host").orElse("");
        if (UNREACHABLE.equals(host)) {
            throw ContentsUnavailableException.unreachable(host + " does not answer");
        }
        if (EMPTY.equals(host)) {
            return new Page<>(List.of(), false);
        }
        if ("archive".equals(parent)) {
            throw ContentsUnavailableException.notReadable("The sample connector cannot read folders.");
        }
        List<Piece> pieces = CONTENTS.get(parent);
        if (pieces == null) {
            throw new IllegalArgumentException("No such container: " + parent);
        }
        int to = Math.min(pieces.size(), paging.offset() + paging.limit());
        int from = Math.min(paging.offset(), to);
        return new Page<>(pieces.subList(from, to), to < pieces.size());
    }
}
