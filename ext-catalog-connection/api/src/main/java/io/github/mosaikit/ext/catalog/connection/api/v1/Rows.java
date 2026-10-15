// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * The result of a query, capped at the row limit (EXT-040).
 *
 * @param columns the columns of the result, in their order
 * @param rows at most the row limit of rows, each with one JSON value per column (text, number,
 *     boolean or null)
 * @param truncated whether the source had more rows than the limit
 */
public record Rows(List<Column> columns, List<List<Object>> rows, boolean truncated) {

    public Rows {
        columns = List.copyOf(columns);
        // A row may hold nulls, which List.copyOf refuses.
        rows = rows.stream().map(row -> Collections.unmodifiableList(new ArrayList<>(row))).toList();
    }
}
