// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Checks the declaration of a connector (EXT-010): each problem names the field it is about, so that the
 * author of the connector knows what to fix. A connector with a problem is refused; the others are not
 * affected.
 */
public final class Declarations {

    /** A field of a declaration and what is wrong with it. */
    public record Problem(String field, String message) {}

    /** Types and categories: lowercase letters, digits and '-', from a letter, at most 64 characters. */
    static final Pattern NAME = Pattern.compile("[a-z][a-z0-9-]{0,63}");

    /** The types of the settings that the form of the framework renders. */
    static final Set<String> FIELD_TYPES = Set.of("string", "number", "integer", "boolean");

    private Declarations() {}

    /** The problems of a declaration, empty when the framework can use it. */
    public static List<Problem> problems(Declaration declaration) {
        List<Problem> problems = new ArrayList<>();
        if (declaration == null) {
            problems.add(lacks("declaration"));
            return problems;
        }
        name(problems, "type", declaration.type());
        if (blank(declaration.title())) {
            problems.add(lacks("title"));
        }
        name(problems, "category", declaration.category());
        logo(problems, declaration.logo());
        form(problems, declaration.form());
        return problems;
    }


    private static void name(List<Problem> problems, String field, String value) {
        if (blank(value)) {
            problems.add(lacks(field));
        } else if (!NAME.matcher(value).matches()) {
            problems.add(new Problem(
                    field, "must be lowercase letters, digits and '-', from a letter, not '" + value + "'"));
        }
    }

    private static void logo(List<Problem> problems, String logo) {
        if (blank(logo)) {
            problems.add(lacks("logo"));
            return;
        }
        String path = logo.toLowerCase(Locale.ROOT);
        if (path.startsWith("/") || path.contains("..") || path.contains("\\") || path.contains(":")) {
            problems.add(new Problem("logo", "must be a path inside the package of the connector, not '" + logo + "'"));
        } else if (!(path.endsWith(".svg") || path.endsWith(".png"))) {
            problems.add(new Problem("logo", "must be an SVG or PNG image, not '" + logo + "'"));
        }
    }

    private static void form(List<Problem> problems, Map<String, Object> form) {
        if (form == null) {
            problems.add(lacks("form"));
            return;
        }
        if (!"object".equals(form.get("type"))) {
            problems.add(new Problem("form.type", "must be 'object'"));
        }
        Object properties = form.get("properties");
        if (properties == null) {
            problems.add(lacks("form.properties"));
            return;
        }
        if (!(properties instanceof Map<?, ?> fields)) {
            problems.add(new Problem("form.properties", "must be an object"));
            return;
        }
        fields.forEach((name, field) -> {
            String where = "form.properties." + name;
            if (!(field instanceof Map<?, ?> schema)) {
                problems.add(new Problem(where, "must be an object"));
            } else if (schema.get("type") == null) {
                problems.add(lacks(where + ".type"));
            } else if (!FIELD_TYPES.contains(String.valueOf(schema.get("type")))) {
                problems.add(new Problem(where + ".type", "must be one of " + FIELD_TYPES.stream().sorted().toList()));
            }
        });
        Object required = form.get("required");
        if (required != null) {
            if (!(required instanceof List<?> names)) {
                problems.add(new Problem("form.required", "must be a list of the names of properties"));
            } else {
                names.stream()
                        .filter(name -> !fields.containsKey(name))
                        .forEach(name -> problems.add(new Problem("form.required", "names " + name + ", which is not a property")));
            }
        }
    }

    private static Problem lacks(String field) {
        return new Problem(field, "is missing");
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
