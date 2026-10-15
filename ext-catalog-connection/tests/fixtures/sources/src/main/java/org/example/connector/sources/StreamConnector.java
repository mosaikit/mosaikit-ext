// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.connector.sources;

import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import io.github.mosaikit.ext.catalog.connection.api.v1.Inspection;
import io.github.mosaikit.ext.catalog.connection.api.v1.Page;
import io.github.mosaikit.ext.catalog.connection.api.v1.Paging;
import io.github.mosaikit.ext.catalog.connection.api.v1.Piece;
import io.github.mosaikit.ext.catalog.connection.api.v1.TestResult;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.Map;

/**
 * A connector of the tests (EXT-019): a stream whose pieces are two topics. It stands for the streams of
 * Kafka, server-sent events and WebSocket, which no connector of this repository reads yet: its setting
 * {@code protocol} says which one it plays, and inspecting a topic (EXT-018) gives the first messages
 * as that protocol carries them, without a broker.
 */
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
                        "properties", Map.of(
                                "broker", Map.of("type", "string", "title", "Broker"),
                                "protocol", Map.of(
                                        "type", "string",
                                        "title", "Protocol",
                                        "enum", List.of("kafka", "sse", "websocket"),
                                        "default", "kafka"))));
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

    /**
     * The first messages of a topic (EXT-018): orders are JSON objects, clicks are lines of text. Server-sent
     * events carry them as the data of their events, given here without the prefix {@code data:}; Kafka
     * as the values of records; WebSocket as text frames.
     */
    @Override
    public Inspection inspect(ConnectionSettings settings, String piece) {
        String protocol = settings.text("protocol").orElse("kafka");
        List<String> messages = switch (piece) {
            case "orders" -> List.of(
                    "{\"order\":1,\"total\":10.5,\"via\":\"" + protocol + "\"}",
                    "{\"order\":2,\"total\":7,\"via\":\"" + protocol + "\"}");
            case "clicks" -> List.of("page /home", "page /orders");
            default -> throw new IllegalArgumentException("No such topic: " + piece);
        };
        return new Inspection(
                "orders".equals(piece) ? "application/json" : "text/plain", messages, Map.of("protocol", protocol));
    }
}
