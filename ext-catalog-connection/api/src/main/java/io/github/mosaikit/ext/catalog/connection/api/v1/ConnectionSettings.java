// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

import dev.mosaikit.kernel.api.secrets.SecretValue;
import java.util.Map;
import java.util.Optional;

/**
 * The settings of a connection that the framework passes to its connector (EXT-010): the values of the
 * connection form, and the credential, which the framework reads from the secrets service of the
 * platform at the moment of the call and closes after it. The connector reads the credential during the
 * call ({@link SecretValue#chars()}, {@link SecretValue#reveal()}) and never keeps it, logs it or puts it
 * in a result.
 *
 * @param values the values of the form, by the names of its properties
 * @param credential the password, token or key of the connection, when it has one
 */
public record ConnectionSettings(Map<String, Object> values, Optional<SecretValue> credential) {

    public ConnectionSettings {
        values = values == null ? Map.of() : Map.copyOf(values);
        credential = credential == null ? Optional.empty() : credential;
    }

    /** A value of the form as text, empty when it is missing or blank. */
    public Optional<String> text(String name) {
        Object value = values.get(name);
        return value == null || value.toString().isBlank() ? Optional.empty() : Optional.of(value.toString());
    }
}
