// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

/**
 * A piece of the contents of a source (EXT-010): a schema, a table, a folder, a file, a topic.
 *
 * @param name what the person sees
 * @param path where it is in the source, to list what it holds when it is a container
 * @param kind what it is in the words of the source, such as {@code schema}, {@code table}, {@code
 *     view}, {@code folder}, {@code file} or {@code topic}
 * @param container whether it holds other entries
 */
public record Entry(String name, String path, String kind, boolean container) {}
