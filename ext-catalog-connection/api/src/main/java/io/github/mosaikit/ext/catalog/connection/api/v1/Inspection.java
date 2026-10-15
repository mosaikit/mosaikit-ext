// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * What a connector found by looking at a piece of a source (EXT-018): a sample of what the piece holds,
 * such as the response of an endpoint, the first messages of a topic or the first rows of a table, and
 * the facts it found in it, such as a column whose values are coordinates. A piece is not judged by its
 * type: a REST path can serve anything, a table may hold only codes.
 *
 * <p>The framework classifies the shape of the samples (JSON records, a JSON object, GeoJSON, CSV, XML
 * or text) and derives the facts the shape tells, such as the {@value Piece.Facts#COLUMNS} of JSON
 * records or the {@value Piece.Facts#GEOMETRY} of GeoJSON; the facts of the connector come first. The
 * uses of the extensions that consume data then light up on the piece as its facts allow.
 *
 * @param mediaType the media type of the samples, such as {@code application/json} or {@code
 *     text/csv}; {@code null} when the source does not say
 * @param samples the response, or the first messages or rows, each as text, in the order of the source;
 *     the framework shows the first few and cuts long ones
 * @param facts the facts found by looking, by name, as JSON values; absent facts are left out
 */
public record Inspection(String mediaType, List<String> samples, Map<String, Object> facts) {

    public Inspection {
        samples = samples == null ? List.of() : samples.stream().filter(Objects::nonNull).toList();
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

    /** Samples without facts of the connector: the framework derives what their shape tells. */
    public Inspection(String mediaType, List<String> samples) {
        this(mediaType, samples, Map.of());
    }
}
