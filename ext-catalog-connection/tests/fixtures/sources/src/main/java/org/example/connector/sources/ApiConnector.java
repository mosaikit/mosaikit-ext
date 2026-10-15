// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.connector.sources;

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

/**
 * A connector of the tests (EXT-019): a REST API whose pieces are its endpoints. An API at {@code
 * https://undeclared.example.org} publishes no description of its endpoints, so they have to be declared.
 * Its method and headers are settings the form does not show ({@code readOnly}): they are given when the
 * connection is created through the API and kept when it is edited in the app (EXT-017).
 */
@ApplicationScoped
public class ApiConnector implements Connector {

    static final String UNDECLARED = "https://undeclared.example.org";

    static final List<Piece> ENDPOINTS = List.of(
            new Piece("GET /customers", "/customers", "endpoint", false, Map.of(Piece.Facts.FORMAT, "json")),
            new Piece("GET /orders", "/orders", "endpoint", false, Map.of(Piece.Facts.FORMAT, "json")));

    @Override
    public String extension() {
        return "org.example.connector.sources";
    }

    @Override
    public Declaration declaration() {
        return new Declaration(
                "sample-api",
                "Sample API",
                Map.of("it", "API di esempio"),
                "api",
                "web/logo.svg",
                Map.of(
                        "type", "object",
                        "required", List.of("url"),
                        "properties", Map.of(
                                "url", Map.of("type", "string", "title", "Address"),
                                "method", Map.of(
                                        "type", "string",
                                        "title", "Method",
                                        "enum", List.of("GET", "POST"),
                                        "default", "GET",
                                        "readOnly", true),
                                "headers", Map.of("type", "string", "title", "Headers", "readOnly", true))));
    }

    @Override
    public TestResult test(ConnectionSettings settings) {
        return TestResult.succeeded("Connected to " + settings.text("url").orElse(""));
    }

    @Override
    public Page<Piece> list(ConnectionSettings settings, String parent, Paging paging) {
        if (UNDECLARED.equals(settings.text("url").orElse(""))) {
            throw ContentsUnavailableException.needsDeclaration("The API publishes no description of its endpoints.");
        }
        if (!parent.isEmpty()) {
            throw new IllegalArgumentException("An endpoint holds no pieces");
        }
        return new Page<>(ENDPOINTS, false);
    }
}
