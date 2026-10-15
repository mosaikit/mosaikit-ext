// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.connector.broken;

import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import io.github.mosaikit.ext.catalog.connection.api.v1.Entry;
import io.github.mosaikit.ext.catalog.connection.api.v1.Page;
import io.github.mosaikit.ext.catalog.connection.api.v1.Paging;
import io.github.mosaikit.ext.catalog.connection.api.v1.TestResult;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.Map;

/**
 * A connector of the tests of the connection framework (EXT-010) whose declaration lacks its category:
 * the framework refuses it, naming the field, and the other connectors keep working.
 */
@ApplicationScoped
public class BrokenConnector implements Connector {

    @Override
    public String extension() {
        return "org.example.connector.broken";
    }

    @Override
    public Declaration declaration() {
        return new Declaration(
                "broken",
                "Broken source",
                Map.of(),
                null,
                "web/logo.svg",
                Map.of("type", "object", "properties", Map.of("host", Map.of("type", "string"))));
    }

    @Override
    public TestResult test(ConnectionSettings settings) {
        return TestResult.succeeded("Never called");
    }

    @Override
    public Page<Entry> list(ConnectionSettings settings, String path, Paging paging) {
        return new Page<>(List.of(), false);
    }
}
