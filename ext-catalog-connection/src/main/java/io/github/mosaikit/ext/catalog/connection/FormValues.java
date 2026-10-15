// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The values of a connection form, checked against the form that the connector declares (EXT-010): the
 * required properties are filled, each value has the type of its property, and nothing else is kept.
 */
public final class FormValues {

    /** The values to keep, or why they cannot be kept. */
    public record Checked(Map<String, Object> values, List<String> problems) {}

    private FormValues() {}

    /** Checks values against a form whose declaration passed {@link Declarations#problems}. */
    @SuppressWarnings("unchecked")
    public static Checked check(Map<String, Object> form, Map<String, Object> values) {
        Map<String, Object> given = values == null ? Map.of() : values;
        Map<String, Object> properties = (Map<String, Object>) form.getOrDefault("properties", Map.of());
        List<?> required = (List<?>) form.getOrDefault("required", List.of());
        Map<String, Object> kept = new LinkedHashMap<>();
        List<String> problems = new ArrayList<>();
        for (String name : given.keySet()) {
            if (!properties.containsKey(name)) {
                problems.add(name + " is not a field of the form");
            }
        }
        properties.forEach((name, schema) -> {
            Object value = given.get(name);
            if (value == null || value instanceof String text && text.isBlank()) {
                if (required.contains(name)) {
                    problems.add(name + " is required");
                }
                return;
            }
            String type = String.valueOf(((Map<String, Object>) schema).get("type"));
            Object typed = typed(type, value);
            if (typed == null) {
                problems.add(name + " must be " + ("integer".equals(type) ? "an " : "a ") + type);
                return;
            }
            Object choices = ((Map<String, Object>) schema).get("enum");
            if (choices instanceof List<?> allowed && !allowed.contains(typed)) {
                problems.add(name + " must be one of " + allowed);
                return;
            }
            kept.put(name, typed);
        });
        return new Checked(kept, problems);
    }

    /** The value in the type of its property, {@code null} when it is not one. */
    private static Object typed(String type, Object value) {
        return switch (type) {
            case "string" -> value instanceof String ? value : null;
            case "boolean" -> value instanceof Boolean ? value : null;
            case "integer" -> integer(number(value));
            case "number" -> number(value) instanceof BigDecimal n ? n.doubleValue() : null;
            default -> null;
        };
    }

    private static Long integer(BigDecimal number) {
        try {
            return number == null ? null : number.longValueExact();
        } catch (ArithmeticException _) {
            return null; // a fraction, or beyond a long
        }
    }

    private static BigDecimal number(Object value) {
        try {
            if (value instanceof Number n) {
                return new BigDecimal(n.toString());
            }
            if (value instanceof String text) {
                return new BigDecimal(text.trim());
            }
        } catch (NumberFormatException _) {
            // not a number
        }
        return null;
    }
}
