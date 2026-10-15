// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import java.util.List;

/**
 * The levels of folders and files, from the lowest to the highest, as the manifest declares them. A
 * level on a folder also counts on what it holds, at any depth: the kernel answers the level of a
 * person on an item as the highest of their levels on it and on the folders above it, since both types
 * declare {@code inherits: parent} (EXT-003, MK-136).
 */
public final class Levels {

    /** Reads the item: lists a folder, downloads a file. */
    public static final String READ = "read";

    /** Changes the item: adds items to a folder. */
    public static final String EDIT = "edit";

    /** Shares the item. */
    public static final String MANAGE = "manage";

    /** From the lowest to the highest. */
    public static final List<String> ORDER = List.of(READ, EDIT, MANAGE);

    private Levels() {}

    /** Whether a level, possibly {@code null}, is at least the wanted one. */
    public static boolean atLeast(String level, String wanted) {
        return level != null && ORDER.indexOf(level) >= ORDER.indexOf(wanted);
    }
}
