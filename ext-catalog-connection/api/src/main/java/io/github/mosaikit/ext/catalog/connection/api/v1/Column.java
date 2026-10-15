// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

/**
 * A column of a table, a view or the result of a query (EXT-019, EXT-040).
 *
 * @param name its name in the source
 * @param type its type in the words of the source, such as {@code integer}, {@code text} or {@code
 *     geometry}
 */
public record Column(String name, String type) {}
