// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

import java.util.List;

/**
 * A part of a listing (EXT-010).
 *
 * @param items the entries of this part, in the order of the source
 * @param more whether the source has more entries after them
 */
public record Page<T>(List<T> items, boolean more) {

    public Page {
        items = List.copyOf(items);
    }
}
