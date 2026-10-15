// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

/**
 * What a download holds (EXT-002): the files of the items selected, with their path in the archive, so
 * that a folder is saved with its structure and can be uploaded again as it is. A folder is an entry of
 * its own, ending with {@code /}, so that an empty one is kept too.
 */
public final class Archive {

    /**
     * An entry of a download.
     *
     * @param path its path in the archive, the name alone for a file selected on its own
     * @param item the file in the catalog, {@code null} for a folder
     * @param file the content in the file service of the kernel, {@code null} for a folder
     */
    public record Entry(String path, UUID item, UUID file) {}

    private Archive() {}

    /**
     * The entries of the items selected, in the order given, each folder followed by what it holds. Two
     * items of the same name (selected from several folders) get " (2)", " (3)" before their extension.
     *
     * @param children the items of a folder
     */
    public static List<Entry> entries(List<Item> selected, Function<Item, List<Item>> children) {
        List<Entry> entries = new ArrayList<>();
        Set<String> used = new HashSet<>();
        for (Item item : selected) {
            add(entries, unique(item.getName(), used), item, children);
        }
        return entries;
    }

    private static void add(List<Entry> entries, String path, Item item, Function<Item, List<Item>> children) {
        if (!item.isFolder()) {
            entries.add(new Entry(path, item.getId(), item.getFileId()));
            return;
        }
        entries.add(new Entry(path + "/", null, null));
        for (Item child : children.apply(item)) {
            add(entries, path + "/" + child.getName(), child, children);
        }
    }

    private static String unique(String name, Set<String> used) {
        String candidate = name;
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name;
        String extension = dot > 0 ? name.substring(dot) : "";
        for (int n = 2; !used.add(candidate.toLowerCase(Locale.ROOT)); n++) {
            candidate = stem + " (" + n + ")" + extension;
        }
        return candidate;
    }
}
