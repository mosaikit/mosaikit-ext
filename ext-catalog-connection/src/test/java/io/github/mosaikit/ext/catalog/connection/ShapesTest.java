// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.github.mosaikit.ext.catalog.connection.api.v1.Column;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** The shape of a sample, classified by the framework whatever the protocol (EXT-018). */
@Tag("EXT-018")
class ShapesTest {

    @Test
    void aJsonArrayOfObjectsIsRecordsWithTheirFieldsAsColumns() {
        Shapes.Found found = Shapes.classify("application/json", List.of("[{\"id\":1,\"name\":\"Acme\"},{\"id\":2,\"name\":null,\"ok\":true}]"));
        assertEquals("json-records", found.shape());
        assertEquals(
                List.of(new Column("id", "integer"), new Column("name", "string"), new Column("ok", "boolean")),
                found.facts().get("columns"));
    }

    @Test
    void messagesThatAreObjectsAreRecords() {
        Shapes.Found found = Shapes.classify(null, List.of("{\"order\":1,\"total\":10.5}", "{\"order\":2,\"total\":7}"));
        assertEquals("json-records", found.shape());
        assertEquals(List.of(new Column("order", "integer"), new Column("total", "number")), found.facts().get("columns"));
    }

    @Test
    void oneObjectIsAnObject() {
        assertEquals("json-object", Shapes.classify("application/json", List.of("{\"status\":\"up\"}")).shape());
    }

    @Test
    void geoJsonHasAGeometry() {
        Shapes.Found found = Shapes.classify(
                "application/geo+json",
                List.of("{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"properties\":{\"name\":\"North\"},"
                        + "\"geometry\":{\"type\":\"Point\",\"coordinates\":[7.68,45.07]}}]}"));
        assertEquals("geojson", found.shape());
        assertEquals(List.of("geometry"), found.facts().get("geometry"));
        assertEquals(List.of(new Column("name", "string"), new Column("geometry", "geometry")), found.facts().get("columns"));
    }

    @Test
    void csvGivesTheColumnsOfItsHeader() {
        Shapes.Found found = Shapes.classify("text/csv", List.of("id,customer,total\n1,1,10.5\n2,2,7"));
        assertEquals("csv", found.shape());
        assertEquals(
                List.of(new Column("id", "string"), new Column("customer", "string"), new Column("total", "string")),
                found.facts().get("columns"));
    }

    @Test
    void xmlAndTextAreToldApart() {
        assertEquals("xml", Shapes.classify(null, List.of("<orders><order id=\"1\"/></orders>")).shape());
        Shapes.Found text = Shapes.classify("text/plain", List.of("page /home", "page /orders"));
        assertEquals("text", text.shape());
        assertEquals(Map.of(), text.facts());
        assertEquals("text", Shapes.classify(null, List.of()).shape());
    }
}
