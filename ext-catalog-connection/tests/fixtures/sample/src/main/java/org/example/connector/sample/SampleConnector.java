// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.connector.sample;

import io.github.mosaikit.ext.catalog.connection.api.v1.Column;
import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.ContentsUnavailableException;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import io.github.mosaikit.ext.catalog.connection.api.v1.Page;
import io.github.mosaikit.ext.catalog.connection.api.v1.Paging;
import io.github.mosaikit.ext.catalog.connection.api.v1.Piece;
import io.github.mosaikit.ext.catalog.connection.api.v1.TestResult;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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
            List.of(new Piece(
                    "places/sites",
                    "sites",
                    "table",
                    false,
                    Map.of(
                            Piece.Facts.COLUMNS, List.of(new Column("name", "text"), new Column("location", "geometry")),
                            Piece.Facts.GEOMETRY, List.of("location")))));

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
