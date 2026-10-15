// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.mosaikit.ext.catalog.connection.api.v1.Column;
import io.github.mosaikit.ext.catalog.connection.api.v1.Piece;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The shape of a sample that a connector read from a piece (EXT-018), whatever the protocol: the
 * response of an endpoint, the messages of a topic or of a stream of events, the rows of a table. The
 * framework, not the connector, classifies it, so every connector is judged alike:
 *
 * <ul>
 *   <li>{@code geojson}: a GeoJSON feature collection, feature or geometry; its fact {@value
 *       Piece.Facts#GEOMETRY} is {@code [geometry]}, its {@value Piece.Facts#COLUMNS} the properties of
 *       its features;
 *   <li>{@code json-records}: JSON objects, in an array or one per message; their {@value
 *       Piece.Facts#COLUMNS} are their fields, with the type of their values;
 *   <li>{@code json-object}: one JSON object, or other JSON;
 *   <li>{@code csv}: lines of values separated by commas or semicolons, the first one a header, which
 *       gives the {@value Piece.Facts#COLUMNS};
 *   <li>{@code xml}; {@code text}: anything else.
 * </ul>
 */
public final class Shapes {

    /** What the shape of a sample tells. */
    public record Found(String shape, Map<String, Object> facts) {}

    private static final ObjectMapper JSON = new ObjectMapper();

    private Shapes() {}

    /** Classifies the samples of a piece, the first ones telling the shape. */
    public static Found classify(String mediaType, List<String> samples) {
        String media = mediaType == null ? "" : mediaType.toLowerCase(Locale.ROOT);
        List<String> texts = samples.stream().map(String::strip).filter(text -> !text.isEmpty()).toList();
        if (texts.isEmpty()) {
            return new Found("text", Map.of());
        }
        List<JsonNode> nodes = json(texts);
        if (nodes != null) {
            return fromJson(nodes);
        }
        String first = texts.getFirst();
        if (media.contains("xml") || first.startsWith("<")) {
            return new Found("xml", Map.of());
        }
        List<Column> header = csvHeader(media, texts);
        if (header != null) {
            return new Found("csv", Map.of(Piece.Facts.COLUMNS, header));
        }
        return new Found("text", Map.of());
    }

    /** The samples as JSON, each one a value, or {@code null} when one is not JSON. */
    private static List<JsonNode> json(List<String> texts) {
        List<JsonNode> nodes = new ArrayList<>();
        for (String text : texts) {
            char start = text.charAt(0);
            if (start != '{' && start != '[') {
                return null;
            }
            try {
                nodes.add(JSON.readTree(text));
            } catch (Exception e) {
                return null;
            }
        }
        return nodes;
    }

    private static Found fromJson(List<JsonNode> nodes) {
        JsonNode first = nodes.getFirst();
        if (first.isObject() && geojson(first.path("type").asText(""))) {
            Map<String, Object> facts = new LinkedHashMap<>();
            facts.put(Piece.Facts.GEOMETRY, List.of("geometry"));
            List<JsonNode> features = new ArrayList<>();
            if (first.path("features").isArray()) {
                first.path("features").forEach(features::add);
            } else {
                features.add(first);
            }
            List<JsonNode> properties = features.stream().map(feature -> feature.path("properties")).filter(JsonNode::isObject).toList();
            List<Column> columns = new ArrayList<>(columns(properties));
            columns.add(new Column("geometry", "geometry"));
            facts.put(Piece.Facts.COLUMNS, columns);
            return new Found("geojson", facts);
        }
        List<JsonNode> records = new ArrayList<>();
        for (JsonNode node : nodes) {
            if (node.isArray()) {
                node.forEach(records::add);
            } else {
                records.add(node);
            }
        }
        if (!records.isEmpty() && records.stream().allMatch(JsonNode::isObject) && (nodes.size() > 1 || first.isArray())) {
            return new Found("json-records", Map.of(Piece.Facts.COLUMNS, columns(records)));
        }
        return new Found("json-object", Map.of());
    }

    private static boolean geojson(String type) {
        return List.of("FeatureCollection", "Feature", "Point", "LineString", "Polygon", "MultiPoint",
                        "MultiLineString", "MultiPolygon", "GeometryCollection")
                .contains(type);
    }

    /** The fields of JSON objects, in the order first seen, each with the type of its first value. */
    private static List<Column> columns(List<JsonNode> records) {
        Map<String, String> types = new LinkedHashMap<>();
        for (JsonNode record : records) {
            Iterator<Map.Entry<String, JsonNode>> fields = record.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                String type = type(field.getValue());
                types.merge(field.getKey(), type, (known, other) -> "null".equals(known) ? other : known);
            }
        }
        return types.entrySet().stream().map(entry -> new Column(entry.getKey(), entry.getValue())).toList();
    }

    private static String type(JsonNode value) {
        if (value.isTextual()) {
            return "string";
        }
        if (value.isIntegralNumber()) {
            return "integer";
        }
        if (value.isNumber()) {
            return "number";
        }
        if (value.isBoolean()) {
            return "boolean";
        }
        if (value.isArray()) {
            return "array";
        }
        if (value.isObject()) {
            return "object";
        }
        return "null";
    }

    /**
     * The header of CSV samples: the media type says CSV, or every line has the same number of
     * separators, at least one; {@code null} otherwise.
     */
    private static List<Column> csvHeader(String media, List<String> texts) {
        List<String> lines = texts.stream().flatMap(String::lines).filter(line -> !line.isBlank()).toList();
        if (lines.size() < 2 && !media.contains("csv")) {
            return null;
        }
        for (char separator : new char[] {',', ';', '\t'}) {
            long count = lines.getFirst().chars().filter(c -> c == separator).count();
            boolean same = lines.stream().allMatch(line -> line.chars().filter(c -> c == separator).count() == count);
            if (count > 0 && (same || media.contains("csv"))) {
                List<Column> columns = new ArrayList<>();
                for (String name : lines.getFirst().split(java.util.regex.Pattern.quote(String.valueOf(separator)), -1)) {
                    columns.add(new Column(name.strip(), "string"));
                }
                return columns;
            }
        }
        return null;
    }
}
