// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.postgres;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** The ids of the pieces of a database, its declaration and the values of its rows (EXT-040). */
@Tag("EXT-040")
class IdsTest {

    @Test
    void anyNameOfPostgresqlMakesOneIdThatGivesItBack() {
        assertEquals("sales", Ids.of("sales"));
        assertEquals("sales/orders", Ids.of("sales", "orders"));
        assertEquals("a%2Fb/50%25 off", Ids.of("a/b", "50% off"));
        assertEquals(List.of("a/b", "50% off"), Ids.parse(Ids.of("a/b", "50% off")));
        assertEquals(List.of("a%2Fb"), Ids.parse(Ids.of("a%2Fb")));
        assertEquals(List.of(), Ids.parse(""));
    }

    @Test
    void anIdOfAnotherConnectorIsRefused() {
        assertThrows(IllegalArgumentException.class, () -> Ids.parse("sales//orders"));
        assertThrows(IllegalArgumentException.class, () -> Ids.parse("50%off"));
    }

    @Test
    void theFormAsksForHostDatabaseAndUserButNeverThePassword() {
        Declaration declaration = new PostgresConnector().declaration();
        assertEquals("postgres", declaration.type());
        assertEquals("database", declaration.category());
        assertEquals(List.of("host", "database", "user"), declaration.form().get("required"));
        @SuppressWarnings("unchecked")
        Map<String, Object> properties = (Map<String, Object>) declaration.form().get("properties");
        assertEquals(List.of("host", "port", "database", "user", "sslmode"), List.copyOf(properties.keySet()));
    }

    @Test
    void theValuesOfARowAreJsonValues() throws Exception {
        assertEquals(1, Values.json((short) 1));
        assertEquals(new BigDecimal("2.50"), Values.json(new BigDecimal("2.50")));
        assertEquals("NaN", Values.json(Double.NaN));
        assertEquals("\\x0aff", Values.json(new byte[] {10, -1}));
        assertEquals(null, Values.json(null));
        assertEquals("2026-10-15", Values.json(java.time.LocalDate.of(2026, 10, 15)));
    }
}
