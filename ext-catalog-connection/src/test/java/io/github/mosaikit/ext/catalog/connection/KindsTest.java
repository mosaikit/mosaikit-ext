// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import io.github.mosaikit.ext.catalog.connection.api.v1.TestResult;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * The kinds of pieces of a connector, with which the source picker limits its Type filter to the uses
 * of the editor that opens it (EXT-026): declared by the connector, or usual for its category.
 */
@Tag("EXT-026")
class KindsTest {

    static Declaration declaration(String category) {
        return new Declaration("alpha", "Alpha", Map.of(), category, "web/logo.svg", DiscoveryTest.FORM);
    }

    record Fake(Supplier<Set<String>> declared) implements Connector {
        @Override
        public String extension() {
            return "org.example.alpha";
        }

        @Override
        public Declaration declaration() {
            return KindsTest.declaration("database");
        }

        @Override
        public TestResult test(ConnectionSettings settings) {
            return TestResult.succeeded("ok");
        }

        @Override
        public Set<String> kinds() {
            return declared.get();
        }
    }

    @Test
    void theKindsAConnectorDeclaresComeFirstInOrder() {
        assertEquals(
                List.of("folder", "schema", "table"),
                Kinds.of(new Fake(() -> Set.of("table", "schema", "folder")), declaration("database")));
    }

    @Test
    void withoutDeclaredKindsThoseOfTheCategoryAreTaken() {
        Fake silent = new Fake(Set::of);
        assertEquals(List.of("schema", "table", "view"), Kinds.of(silent, declaration("database")));
        assertEquals(List.of("schema", "table", "view"), Kinds.of(silent, declaration("warehouse")));
        assertEquals(List.of("file", "folder"), Kinds.of(silent, declaration("files")));
        assertEquals(List.of("file", "folder"), Kinds.of(silent, declaration("lake")));
        assertEquals(List.of("endpoint"), Kinds.of(silent, declaration("api")));
        assertEquals(List.of("topic"), Kinds.of(silent, declaration("stream")));
    }

    @Test
    void aCategoryOfItsOwnWithoutDeclaredKindsSaysNothing() {
        assertEquals(List.of(), Kinds.of(new Fake(Set::of), declaration("ledger")));
    }

    @Test
    void kindsThatAreNotNamesAreLeftOutAndAFailingConnectorFallsBackToItsCategory() {
        Set<String> declared = new HashSet<>(List.of("table", "Not A Kind", "../x"));
        declared.add(null);
        assertEquals(List.of("table"), Kinds.of(new Fake(() -> declared), declaration("database")));
        assertEquals(List.of("topic"), Kinds.of(new Fake(() -> {
            throw new IllegalStateException("broken");
        }), declaration("stream")));
        assertEquals(List.of("endpoint"), Kinds.of(new Fake(() -> null), declaration("api")));
    }

    @Test
    void theDefaultOfTheContractDeclaresNoKinds() {
        Connector plain = new DiscoveryTest.Fake("org.example.plain", () -> declaration("api"));
        assertEquals(Set.of(), plain.kinds());
        assertEquals(List.of("endpoint"), Kinds.of(plain, declaration("api")));
    }
}
