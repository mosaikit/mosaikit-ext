// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.connector.sources;

import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import io.github.mosaikit.ext.catalog.connection.api.v1.Page;
import io.github.mosaikit.ext.catalog.connection.api.v1.Paging;
import io.github.mosaikit.ext.catalog.connection.api.v1.Piece;
import io.github.mosaikit.ext.catalog.connection.api.v1.TestResult;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.Map;

/** A connector of the tests (EXT-019): a stream whose pieces are two topics of JSON messages. */
@ApplicationScoped
public class StreamConnector implements Connector {

    static final List<Piece> TOPICS = List.of(
            new Piece("orders", "orders", "topic", false, Map.of(Piece.Facts.FORMAT, "json")),
            new Piece("clicks", "clicks", "topic", false, Map.of(Piece.Facts.FORMAT, "json")));

    @Override
    public String extension() {
        return "org.example.connector.sources";
    }

    @Override
    public Declaration declaration() {
        return new Declaration(
                "sample-stream",
                "Sample stream",
                Map.of("it", "Flusso di esempio"),
                "stream",
                "web/logo.svg",
                Map.of(
                        "type", "object",
                        "required", List.of("broker"),
                        "properties", Map.of("broker", Map.of("type", "string", "title", "Broker"))));
    }

    @Override
    public TestResult test(ConnectionSettings settings) {
        return TestResult.succeeded("Connected to " + settings.text("broker").orElse(""));
    }

    @Override
    public Page<Piece> list(ConnectionSettings settings, String parent, Paging paging) {
        if (!parent.isEmpty()) {
            throw new IllegalArgumentException("A topic holds no pieces");
        }
        return new Page<>(TOPICS, false);
    }
}
