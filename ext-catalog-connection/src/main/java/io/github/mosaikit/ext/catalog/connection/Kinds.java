// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The kinds of pieces that the sources of a connector hold (EXT-026), with which the source picker
 * offers a type only to the editors whose uses take one of them: those the connector declares, or else
 * those usual for its category.
 */
public final class Kinds {

    /** The kinds usual for the categories that the framework knows. */
    static final Map<String, List<String>> OF_CATEGORY = Map.of(
            "database", List.of("schema", "table", "view"),
            "warehouse", List.of("schema", "table", "view"),
            "lake", List.of("folder", "file"),
            "files", List.of("folder", "file"),
            "api", List.of("endpoint"),
            "stream", List.of("topic"));

    private Kinds() {}

    /**
     * The kinds of a connector, in alphabetical order: those it declares that are names (lowercase
     * letters, digits and '-'), or those of its category; empty when neither says, and the picker then
     * offers the type to every editor.
     */
    public static List<String> of(Connector connector, Declaration declaration) {
        Set<String> declared;
        try {
            declared = connector.kinds();
        } catch (RuntimeException e) {
            declared = Set.of();
        }
        List<String> kinds = declared == null
                ? List.of()
                : declared.stream()
                        .filter(kind -> kind != null && Declarations.NAME.matcher(kind).matches())
                        .sorted()
                        .toList();
        if (!kinds.isEmpty()) {
            return kinds;
        }
        return OF_CATEGORY.getOrDefault(declaration.category(), List.of()).stream().sorted().toList();
    }
}
