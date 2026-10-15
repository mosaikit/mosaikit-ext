// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import io.github.mosaikit.ext.catalog.connection.api.v1.ConnectionSettings;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * The address of the source of a connection, which its card shows under the name when it has no
 * description (EXT-015): what the connector tells ({@link Connector#address}), or else what the usual
 * settings of a source say: an address such as {@code url} or {@code endpoint}, or {@code host} with
 * {@code port} and {@code database}. The user and password that an address may carry are removed.
 */
final class Addresses {

    /** The longest address kept with a connection. */
    static final int MAX = 500;

    /** Settings that hold the whole address of a source, the first one present wins. */
    private static final List<String> WHOLE = List.of("url", "uri", "endpoint", "address", "baseurl", "server");

    private static final List<String> HOST = List.of("host", "hostname");

    private static final List<String> DATABASE = List.of("database", "db", "catalog");

    /** The user information of an address, {@code scheme://user:password@}. */
    private static final Pattern USER_INFO = Pattern.compile("(^|//)[^/@\\s]*@");

    private Addresses() {}

    /** The address of a connection with these values of its form, empty when nothing tells it. */
    static Optional<String> of(Connector connector, Map<String, Object> values) {
        Optional<String> told;
        try {
            told = connector.address(new ConnectionSettings(values, Optional.empty()));
        } catch (RuntimeException e) {
            told = Optional.empty();
        }
        return told == null || told.isEmpty() || told.get().isBlank() ? guess(values) : clean(told.get());
    }

    /** The address that the usual settings of a source say, empty when they say none. */
    static Optional<String> guess(Map<String, Object> values) {
        for (String name : WHOLE) {
            Optional<String> whole = value(values, name);
            if (whole.isPresent()) {
                return clean(whole.get());
            }
        }
        Optional<String> host = HOST.stream().map(name -> value(values, name)).flatMap(Optional::stream).findFirst();
        if (host.isEmpty()) {
            return Optional.empty();
        }
        StringBuilder address = new StringBuilder(host.get());
        value(values, "port").ifPresent(port -> address.append(':').append(port));
        DATABASE.stream()
                .map(name -> value(values, name))
                .flatMap(Optional::stream)
                .findFirst()
                .ifPresent(database -> address.append('/').append(database));
        return clean(address.toString());
    }

    private static Optional<String> clean(String address) {
        String cleaned = USER_INFO.matcher(address.strip()).replaceFirst("$1");
        if (cleaned.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(cleaned.length() > MAX ? cleaned.substring(0, MAX) : cleaned);
    }

    /** A value of the form by its name in any case, as text, when it is not blank. */
    private static Optional<String> value(Map<String, Object> values, String name) {
        return values.entrySet().stream()
                .filter(entry -> entry.getKey().toLowerCase(Locale.ROOT).equals(name))
                .map(Map.Entry::getValue)
                .filter(value -> value != null && !value.toString().isBlank())
                .map(value -> value instanceof Number number && number.doubleValue() == Math.rint(number.doubleValue())
                        ? Long.toString(number.longValue())
                        : value.toString().strip())
                .findFirst();
    }
}
