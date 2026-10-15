// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.LinkedHashMap;
import java.util.Map;

/** Keeps a JSON object, such as the values of a connection form, in a text column (EXT-010). */
@Converter
public class JsonObject implements AttributeConverter<Map<String, Object>, String> {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<LinkedHashMap<String, Object>> OBJECT = new TypeReference<>() {};

    @Override
    public String convertToDatabaseColumn(Map<String, Object> value) {
        try {
            return JSON.writeValueAsString(value == null ? Map.of() : value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Not a JSON object", e);
        }
    }

    @Override
    public Map<String, Object> convertToEntityAttribute(String column) {
        try {
            return column == null || column.isBlank() ? new LinkedHashMap<>() : JSON.readValue(column, OBJECT);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("The column does not hold a JSON object", e);
        }
    }
}
