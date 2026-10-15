// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

/**
 * Which part of a listing to return (EXT-010).
 *
 * @param offset how many entries to skip, from 0
 * @param limit how many entries to return at most, from 1
 */
public record Paging(int offset, int limit) {

    public Paging {
        if (offset < 0 || limit < 1) {
            throw new IllegalArgumentException("A page starts at 0 or later and has at least one entry");
        }
    }
}
