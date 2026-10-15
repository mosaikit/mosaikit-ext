// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import java.text.Collator;
import java.util.Comparator;
import java.util.Locale;

/**
 * The order of the content of a folder (EXT-001): folders first, then files, each sorted by name or by
 * the date of their last change, ascending or descending. Names compare as people read them: case
 * and accents count only when everything else is equal.
 */
public final class Listing {

    /** By name. */
    public static final String NAME = "name";

    /** By the date of the last change. */
    public static final String CHANGED = "changed";

    private Listing() {}

    /**
     * The order of a listing.
     *
     * @param sort {@value #NAME} or {@value #CHANGED}; by name when {@code null}
     * @param order {@code asc} or {@code desc}; ascending by name and descending (newest first) by date
     *     when {@code null}
     * @throws IllegalArgumentException for another sort or order
     */
    public static Comparator<Item> order(String sort, String order) {
        String by = sort == null || sort.isBlank() ? NAME : sort;
        if (!by.equals(NAME) && !by.equals(CHANGED)) {
            throw new IllegalArgumentException("sort is name or changed");
        }
        boolean descending;
        if (order == null || order.isBlank()) {
            descending = by.equals(CHANGED);
        } else if (order.equals("asc") || order.equals("desc")) {
            descending = order.equals("desc");
        } else {
            throw new IllegalArgumentException("order is asc or desc");
        }
        Collator collator = Collator.getInstance(Locale.ROOT);
        collator.setStrength(Collator.TERTIARY);
        Comparator<Item> byName = Comparator.comparing(Item::getName, collator);
        Comparator<Item> within = by.equals(NAME)
                ? byName
                : Comparator.comparing(Item::getChangedAt).thenComparing(byName);
        if (descending) {
            within = within.reversed();
        }
        return Comparator.comparing((Item item) -> !item.isFolder()).thenComparing(within);
    }
}
