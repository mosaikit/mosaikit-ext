// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.textnotes;

import dev.mosaikit.kernel.api.files.SignedLink;
import io.github.mosaikit.ext.catalog.api.v1.CatalogFile;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.config.ConfigProvider;

/**
 * Reads a note as a process of the extension would, outside the request of a person (EXT-107): through a
 * signed link of the catalog to its content, downloaded over HTTP at the address of the installation,
 * without a session and without keeping a copy.
 */
final class LinkedContent {

    /** What a read through a link gave: the link, and the content or why there is none. */
    record Read(String link, String content) {}

    private static final HttpClient HTTP =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    private LinkedContent() {}

    static Read read(CatalogFile file) {
        SignedLink link = file.link(Duration.ofHours(1));
        try {
            HttpResponse<String> response = HTTP.send(
                    HttpRequest.newBuilder(URI.create(base() + link.path()))
                            .timeout(Duration.ofSeconds(30))
                            .GET()
                            .build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            return new Read(link.path(), response.statusCode() == 200 ? response.body() : "HTTP " + response.statusCode());
        } catch (IOException e) {
            return new Read(link.path(), "failed: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Read(link.path(), "interrupted");
        }
    }

    /** The address of the installation: mosaikit.public-url, or the port the kernel listens on here. */
    private static String base() {
        Config config = ConfigProvider.getConfig();
        return config.getOptionalValue("mosaikit.public-url", String.class)
                .map(url -> url.endsWith("/") ? url.substring(0, url.length() - 1) : url)
                .orElseGet(() -> "http://127.0.0.1:"
                        + config.getOptionalValue("quarkus.http.port", Integer.class).orElse(8080));
    }
}
