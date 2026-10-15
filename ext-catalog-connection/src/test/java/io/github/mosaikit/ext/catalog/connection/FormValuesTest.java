// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** The values of a connection form are checked against the form its connector declares (EXT-010). */
@Tag("EXT-010")
class FormValuesTest {

    static final Map<String, Object> FORM = Map.of(
            "type", "object",
            "required", List.of("host"),
            "properties", Map.of(
                    "host", Map.of("type", "string"),
                    "port", Map.of("type", "integer"),
                    "ratio", Map.of("type", "number"),
                    "secure", Map.of("type", "boolean"),
                    "mode", Map.of("type", "string", "enum", List.of("read", "write"))));

    @Test
    void valuesAreKeptInTheTypeOfTheirField() {
        FormValues.Checked checked = FormValues.check(
                FORM, Map.of("host", "db.example.org", "port", "5432", "ratio", 0.5, "secure", true, "mode", "read"));

        assertTrue(checked.problems().isEmpty(), checked.problems().toString());
        assertEquals(
                Map.of("host", "db.example.org", "port", 5432L, "ratio", 0.5, "secure", true, "mode", "read"),
                checked.values());
    }

    @Test
    void blankOptionalFieldsAreLeftOut() {
        Map<String, Object> values = new HashMap<>();
        values.put("host", "db.example.org");
        values.put("port", "");
        values.put("ratio", null);

        assertEquals(Map.of("host", "db.example.org"), FormValues.check(FORM, values).values());
    }

    @Test
    void problemsNameTheField() {
        FormValues.Checked checked =
                FormValues.check(FORM, Map.of("port", "5432.5", "secure", "yes", "mode", "delete", "user", "x"));

        assertEquals(
                List.of(
                        "host is required",
                        "mode must be one of [read, write]",
                        "port must be an integer",
                        "secure must be a boolean",
                        "user is not a field of the form"),
                checked.problems().stream().sorted().toList());
    }
}
