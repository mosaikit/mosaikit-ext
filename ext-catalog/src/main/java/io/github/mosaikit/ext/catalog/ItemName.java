// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import java.util.Locale;

/**
 * The name of a folder or a file (EXT-001): what a file system of any operating system accepts, so that
 * a folder can be downloaded and uploaded again as it is (EXT-002).
 */
public final class ItemName {

    /** The longest name, in characters. */
    public static final int MAX_LENGTH = 255;

    private ItemName() {}

    /**
     * The name without the spaces around it.
     *
     * @throws IllegalArgumentException when it is empty, longer than {@value #MAX_LENGTH} characters,
     *     {@code .} or {@code ..}, or holds a slash, a backslash or a control character
     */
    public static String check(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("The name is empty.");
        }
        String stripped = name.strip();
        if (stripped.length() > MAX_LENGTH) {
            throw new IllegalArgumentException("The name is longer than " + MAX_LENGTH + " characters.");
        }
        if (stripped.equals(".") || stripped.equals("..")) {
            throw new IllegalArgumentException("The name cannot be . or ..");
        }
        if (stripped.chars().anyMatch(c -> c == '/' || c == '\\' || Character.isISOControl(c))) {
            throw new IllegalArgumentException("The name cannot hold / or \\ or control characters.");
        }
        return stripped;
    }

    /** Whether two names are the same name in a folder, where case does not count. */
    public static boolean same(String a, String b) {
        return a.toLowerCase(Locale.ROOT).equals(b.toLowerCase(Locale.ROOT));
    }
}
