// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.connector.sample;

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
 * A second type of source of the same connector extension, for the tests of the list of connections
 * (EXT-011, EXT-015): files at an address, with one entry. It does not tell the address of its source,
 * so the framework takes it from its setting {@code url}.
 */
@ApplicationScoped
public class SampleFilesConnector implements Connector {

    @Override
    public String extension() {
        return "org.example.connector.sample";
    }

    @Override
    public Declaration declaration() {
        return new Declaration(
                "sample-files",
                "Sample files",
                Map.of("it", "File di esempio"),
                "files",
                "web/logo.svg",
                Map.of(
                        "type", "object",
                        "required", List.of("url"),
                        "properties", Map.of("url", Map.of("type", "string", "title", "Address"))));
    }

    @Override
    public TestResult test(ConnectionSettings settings) {
        return TestResult.succeeded("Reached " + settings.text("url").orElse(""));
    }

    @Override
    public Page<Entry> list(ConnectionSettings settings, String path, Paging paging) {
        if (!path.isEmpty()) {
            throw new IllegalArgumentException("No such path: " + path);
        }
        return new Page<>(List.of(new Entry("readme.txt", "readme.txt", "file", false)), false);
    }
}
