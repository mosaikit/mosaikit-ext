// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.api.v1;

import java.util.Objects;
import java.util.regex.Pattern;

/**
 * A state that a kind of file records on a file and the catalog shows with it (EXT-105), such as
 * {@code loaded} or {@code failed}, with a detail for people, such as why it failed. The frontend of
 * the kind may give the state a title in each language (the {@code states} of its contribution to
 * {@code catalog.file-kind}); otherwise the catalog shows the value as it is.
 *
 * @param value lowercase letters, digits and {@code -}, at most 32 characters, starting with a letter
 * @param detail what people read about it, at most {@value #MAX_DETAIL} characters; {@code null} for none
 */
public record FileState(String value, String detail) {

    /** The longest detail. */
    public static final int MAX_DETAIL = 500;

    private static final Pattern VALUE = Pattern.compile("[a-z][a-z0-9-]{0,31}");

    /**
     * @throws IllegalArgumentException for a value that is not a name of a state, or a detail too long
     */
    public FileState {
        Objects.requireNonNull(value, "value");
        if (!VALUE.matcher(value).matches()) {
            throw new IllegalArgumentException(
                    "A state is lowercase letters, digits and '-', at most 32, starting with a letter: " + value);
        }
        if (detail != null && detail.isBlank()) {
            detail = null;
        }
        if (detail != null && detail.length() > MAX_DETAIL) {
            throw new IllegalArgumentException("The detail of a state has at most " + MAX_DETAIL + " characters");
        }
    }

    /** A state without a detail. */
    public static FileState of(String value) {
        return new FileState(value, null);
    }

    /** A state with a detail. */
    public static FileState of(String value, String detail) {
        return new FileState(value, detail);
    }
}
