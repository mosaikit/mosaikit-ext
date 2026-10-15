// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

import java.util.Map;

/**
 * What a connector declares of itself (EXT-010): what the framework shows in New connection and in the
 * list of connections, and the form it asks to fill to create a connection.
 *
 * @param type the type of source, unique among the connectors: lowercase letters, digits and '-', such
 *     as {@code postgres}; kept with each connection, so it never changes
 * @param title the name of the type in English, such as {@code PostgreSQL}
 * @param titles the name in other languages, by language tag ({@code it}, {@code pt-BR}); may be empty
 * @param category the kind of source: lowercase letters, digits and '-', such as {@code database},
 *     {@code warehouse}, {@code api}, {@code stream} or {@code files}; the framework translates the
 *     categories it knows and shows the others as they are
 * @param logo the path of the logo in the package of the connector, such as {@code web/logo.svg}: an
 *     SVG or PNG image, served by the kernel with the other web assets of the extension
 * @param form the connection form, a JSON Schema of an object whose properties are the settings of a
 *     connection: strings, numbers, integers and booleans, with {@code title}, {@code description},
 *     {@code default} and {@code enum}, and the names that must be filled in {@code required}. The
 *     credential is not part of it: the framework asks for it apart and keeps it in the secrets
 *     service of the platform
 */
public record Declaration(
        String type, String title, Map<String, String> titles, String category, String logo, Map<String, Object> form) {}
