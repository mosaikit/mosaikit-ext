// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.github.mosaikit.ext.catalog.connection.api.v1.Declaration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The connectors the framework uses, out of the implementations of its contract (EXT-010): those whose
 * declaration has no problem, one per type, and the problems of the others, each naming its extension
 * and the field. One refused connector never prevents the others from working.
 *
 * @param connectors the usable connectors by type, in the order of their extensions
 * @param problems why the others are refused
 */
public record Discovery(Map<String, Found> connectors, List<Refusal> problems) {

    /** A usable connector and its declaration, read once. */
    public record Found(Connector connector, Declaration declaration) {}

    /** A connector the framework refuses, and why, naming the field of its declaration. */
    public record Refusal(String extension, String field, String message) {}

    /** Reads and checks the declarations of the connectors, in the order given (by extension). */
    public static Discovery of(List<? extends Connector> implementations) {
        Map<String, Found> connectors = new LinkedHashMap<>();
        List<Refusal> problems = new ArrayList<>();
        for (Connector connector : implementations) {
            String extension = connector.extension();
            Declaration declaration;
            try {
                declaration = connector.declaration();
            } catch (RuntimeException e) {
                problems.add(new Refusal(extension, "declaration", "its declaration failed: " + e.getClass().getSimpleName()));
                continue;
            }
            List<Declarations.Problem> found = Declarations.problems(declaration);
            if (!found.isEmpty()) {
                found.forEach(problem -> problems.add(
                        new Refusal(extension, problem.field(), "the field " + problem.field() + " " + problem.message())));
                continue;
            }
            Found other = connectors.get(declaration.type());
            if (other != null) {
                problems.add(new Refusal(
                        extension,
                        "type",
                        "the type " + declaration.type() + " is declared already by " + other.connector().extension()));
                continue;
            }
            connectors.put(declaration.type(), new Found(connector, declaration));
        }
        return new Discovery(Collections.unmodifiableMap(connectors), List.copyOf(problems));
    }

    /** The usable connector of a type. */
    public Optional<Found> connector(String type) {
        return Optional.ofNullable(connectors.get(type));
    }
}
