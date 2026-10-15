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
 * A connector of the tests of the connection framework (EXT-010): a source with a few entries in memory.
 * A host named {@code unreachable.example.org} does not answer; a credential, when the connection has
 * one, must be {@code s3cret}.
 */
@ApplicationScoped
public class SampleConnector implements Connector {

    static final String UNREACHABLE = "unreachable.example.org";

    static final Map<String, List<Entry>> CONTENTS = Map.of(
            "",
            List.of(new Entry("sales", "sales", "schema", true), new Entry("archive", "archive", "folder", true)),
            "sales",
            List.of(
                    new Entry("customers", "sales/customers", "table", false),
                    new Entry("orders", "sales/orders", "table", false)),
            "archive",
            List.of(new Entry("2025.csv", "archive/2025.csv", "file", false)));

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
    public Page<Entry> list(ConnectionSettings settings, String path, Paging paging) {
        List<Entry> entries = CONTENTS.get(path);
        if (entries == null) {
            throw new IllegalArgumentException("No such path: " + path);
        }
        int to = Math.min(entries.size(), paging.offset() + paging.limit());
        int from = Math.min(paging.offset(), to);
        return new Page<>(entries.subList(from, to), to < entries.size());
    }
}
