// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import io.github.mosaikit.ext.catalog.connection.api.v1.Entry;
import io.github.mosaikit.ext.catalog.connection.api.v1.Page;
import io.github.mosaikit.ext.catalog.connection.api.v1.Paging;
import io.github.mosaikit.ext.catalog.connection.api.v1.TestResult;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * The framework uses the connectors whose declaration is complete, and refuses the others with a problem
 * naming the field, without affecting the rest (EXT-010).
 */
@Tag("EXT-010")
class DiscoveryTest {

    static final Map<String, Object> FORM = Map.of(
            "type", "object",
            "required", List.of("host"),
            "properties", Map.of("host", Map.of("type", "string"), "port", Map.of("type", "integer")));

    static Declaration declaration(String type) {
        return new Declaration(type, "Title of " + type, Map.of("it", "Titolo"), "database", "web/logo.svg", FORM);
    }

    record Fake(String extension, Supplier<Declaration> declared) implements Connector {
        @Override
        public Declaration declaration() {
            return declared.get();
        }

        @Override
        public TestResult test(ConnectionSettings settings) {
            return TestResult.succeeded("ok");
        }

        @Override
        public Page<Entry> list(ConnectionSettings settings, String path, Paging paging) {
            return new Page<>(List.of(), false);
        }
    }

    @Test
    void completeDeclarationsAreUsedByType() {
        Discovery discovery = Discovery.of(List.of(
                new Fake("org.example.a", () -> declaration("alpha")), new Fake("org.example.b", () -> declaration("beta"))));

        assertEquals(List.of("alpha", "beta"), List.copyOf(discovery.connectors().keySet()));
        assertEquals("org.example.b", discovery.connector("beta").orElseThrow().connector().extension());
        assertTrue(discovery.problems().isEmpty());
    }

    @Test
    void aDeclarationThatLacksAFieldIsRefusedNamingItAndTheOthersKeepWorking() {
        Discovery discovery = Discovery.of(List.of(
                new Fake("org.example.broken", () -> new Declaration("broken", "Broken", Map.of(), null, "web/logo.svg", FORM)),
                new Fake("org.example.good", () -> declaration("good"))));

        assertEquals(List.of("good"), List.copyOf(discovery.connectors().keySet()));
        assertEquals(
                List.of(new Discovery.Refusal("org.example.broken", "category", "the field category is missing")),
                discovery.problems());
    }

    @Test
    void eachMissingFieldIsNamed() {
        Discovery discovery = Discovery.of(
                List.of(new Fake("org.example.empty", () -> new Declaration(null, " ", null, null, null, null))));

        assertEquals(
                List.of("type", "title", "category", "logo", "form"),
                discovery.problems().stream().map(Discovery.Refusal::field).toList());
    }

    @Test
    void aDeclarationThatFailsIsRefused() {
        Discovery discovery = Discovery.of(List.of(new Fake("org.example.failing", () -> {
            throw new IllegalStateException("boom");
        })));

        assertTrue(discovery.connectors().isEmpty());
        assertEquals("declaration", discovery.problems().getFirst().field());
    }

    @Test
    void aTypeDeclaredTwiceIsKeptForTheFirstExtension() {
        Discovery discovery = Discovery.of(List.of(
                new Fake("org.example.a", () -> declaration("same")), new Fake("org.example.b", () -> declaration("same"))));

        assertEquals("org.example.a", discovery.connector("same").orElseThrow().connector().extension());
        assertEquals(
                List.of(new Discovery.Refusal("org.example.b", "type", "the type same is declared already by org.example.a")),
                discovery.problems());
    }

    @Test
    void wrongValuesNameTheirField() {
        Map<String, Object> form = Map.of(
                "type", "array",
                "required", List.of("missing"),
                "properties", Map.of("host", Map.of("type", "date"), "port", Map.of("title", "Port")));
        List<String> fields = Declarations.problems(
                        new Declaration("Not A Type", "T", Map.of(), "data base", "../logo.gif", form))
                .stream()
                .map(Declarations.Problem::field)
                .sorted()
                .toList();

        assertEquals(
                List.of(
                        "category",
                        "form.properties.host.type",
                        "form.properties.port.type",
                        "form.required",
                        "form.type",
                        "logo",
                        "type"),
                fields);
    }

    @Test
    void aLogoIsAnImageInsideThePackage() {
        assertTrue(Declarations.problems(declaration("ok")).isEmpty());
        for (String logo : List.of("/web/logo.svg", "web/../../logo.svg", "https://example.org/logo.svg", "web/logo.gif")) {
            Declaration declaration = new Declaration("ok", "Ok", Map.of(), "database", logo, FORM);
            assertEquals(
                    List.of("logo"),
                    Declarations.problems(declaration).stream()
                            .map(Declarations.Problem::field)
                            .toList(),
                    logo);
        }
    }
}
