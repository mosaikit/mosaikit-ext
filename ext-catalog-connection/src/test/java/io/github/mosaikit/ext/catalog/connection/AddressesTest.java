// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import io.github.mosaikit.ext.catalog.connection.api.v1.Page;
import io.github.mosaikit.ext.catalog.connection.api.v1.Paging;
import io.github.mosaikit.ext.catalog.connection.api.v1.Piece;
import io.github.mosaikit.ext.catalog.connection.api.v1.TestResult;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * The address of the source of a connection, which its card shows under the name when it has no
 * description (EXT-015): what the connector tells, or what the usual settings of a source say, never
 * with a credential; and a description saved empty is cleared.
 */
@Tag("EXT-015")
class AddressesTest {

    /** A connector whose address, when given, tells the address of its source. */
    record Source(Function<ConnectionSettings, Optional<String>> told) implements Connector {
        @Override
        public String extension() {
            return "org.example.source";
        }

        @Override
        public Declaration declaration() {
            return DiscoveryTest.declaration("source");
        }

        @Override
        public TestResult test(ConnectionSettings settings) {
            return TestResult.succeeded("ok");
        }

        @Override
        public Page<Piece> list(ConnectionSettings settings, String parent, Paging paging) {
            return new Page<>(List.of(), false);
        }

        @Override
        public Optional<String> address(ConnectionSettings settings) {
            return told == null ? Connector.super.address(settings) : told.apply(settings);
        }
    }

    @Test
    void theConnectorTellsTheAddress() {
        Source telling = new Source(settings -> Optional.of("custom://" + settings.text("host").orElseThrow()));

        assertEquals(Optional.of("custom://db.example.org"), Addresses.of(telling, Map.of("host", "db.example.org")));
    }

    @Test
    void withoutItTheUsualSettingsSayIt() {
        Source silent = new Source(null);

        assertEquals(Optional.of("https://api.example.org/v1"), Addresses.of(silent, Map.of("url", "https://api.example.org/v1")));
        assertEquals(Optional.of("https://api.example.org"), Addresses.of(silent, Map.of("Endpoint", "https://api.example.org")));
        Map<String, Object> database = new LinkedHashMap<>();
        database.put("database", "sales");
        database.put("port", 5432);
        database.put("host", "db.example.org");
        assertEquals(Optional.of("db.example.org:5432/sales"), Addresses.of(silent, database));
        assertEquals(Optional.of("db.example.org"), Addresses.guess(Map.of("hostname", "db.example.org")));
        assertEquals(Optional.empty(), Addresses.guess(Map.of("token", "abc", "port", 1)));
    }

    @Test
    void anAddressNeverCarriesACredential() {
        assertEquals(
                Optional.of("https://api.example.org/data"),
                Addresses.guess(Map.of("url", "https://acme:s3cret@api.example.org/data")));
        assertEquals(
                Optional.of("postgres://db.example.org:5432/sales"),
                Addresses.guess(Map.of("uri", "postgres://reader@db.example.org:5432/sales")));
        assertEquals(Optional.of("https://example.org/a@b"), Addresses.guess(Map.of("url", "https://example.org/a@b")));
    }

    @Test
    void aConnectorThatFailsFallsBackOnTheSettings() {
        Source failing = new Source(settings -> {
            throw new IllegalStateException("no");
        });

        assertEquals(Optional.of("db.example.org"), Addresses.of(failing, Map.of("host", "db.example.org")));
    }

    @Test
    void anEmptyDescriptionIsCleared() {
        assertNull(ConnectionResource.description(""));
        assertNull(ConnectionResource.description("   "));
        assertNull(ConnectionResource.description(null));
        assertEquals("Orders of the shop", ConnectionResource.description("  Orders of the shop "));
    }
}
