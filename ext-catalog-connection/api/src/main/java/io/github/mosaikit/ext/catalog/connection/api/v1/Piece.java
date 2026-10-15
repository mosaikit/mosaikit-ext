// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A piece of the contents of a source, in the one shape of every connector (EXT-019): a schema, a
 * table, a view, a topic, an endpoint, a folder or a file.
 *
 * <p>What a piece can be used for is not part of it: the extensions that consume data contribute their
 * uses to the framework (the point {@code catalog.connection.use} of its frontend, MK-134), each naming
 * the kinds and the facts it needs, and the framework offers on each piece the uses that its kind and
 * facts allow. A connector says what it knows; it never names a consumer.
 *
 * @param id where the piece is in the source, unique in the connection and stable: the framework
 *     passes it back to {@link Connector#list} to list what a container holds, and other extensions keep
 *     it, with the connection, as their reference to the piece
 * @param name what the person sees
 * @param kind what it is in the words of the source, lowercase: {@code schema}, {@code table}, {@code
 *     view}, {@code topic}, {@code endpoint}, {@code folder}, {@code file}, or one of the connector's
 * @param container whether it holds other pieces
 * @param facts what the connector knows of the piece, by name, as JSON values (text, numbers,
 *     booleans, lists and objects of them): the uses ask for facts by name. Names the framework knows:
 *     {@value Facts#COLUMNS} (a list of {@link Column}), {@value Facts#GEOMETRY} (the names of the
 *     columns that hold geometries) and {@value Facts#FORMAT} (the format of the messages or responses,
 *     such as {@code json}); a connector may add its own. Absent facts are left out, never null
 */
public record Piece(String id, String name, String kind, boolean container, Map<String, Object> facts) {

    public Piece {
        Map<String, Object> known = new LinkedHashMap<>();
        if (facts != null) {
            facts.forEach((fact, value) -> {
                if (fact != null && value != null) {
                    known.put(fact, value);
                }
            });
        }
        facts = Collections.unmodifiableMap(known);
    }

    /** A piece without facts. */
    public Piece(String id, String name, String kind, boolean container) {
        this(id, name, kind, container, Map.of());
    }

    /** The names of the facts that the framework knows. */
    public static final class Facts {

        /** The columns of a table, a view or a result: a list of {@link Column}, in their order. */
        public static final String COLUMNS = "columns";

        /** The names of the columns that hold geometries or coordinates, such as a PostGIS column. */
        public static final String GEOMETRY = "geometry";

        /** The format of the messages of a topic or of the responses of an endpoint, such as {@code json}. */
        public static final String FORMAT = "format";

        /**
         * The shape of what a piece holds, classified by the framework from a sample (EXT-018): {@code
         * json-records}, {@code json-object}, {@code geojson}, {@code csv}, {@code xml} or {@code text}.
         */
        public static final String SHAPE = "shape";

        private Facts() {}
    }
}
