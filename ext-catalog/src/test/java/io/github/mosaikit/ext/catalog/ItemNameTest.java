// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** The names of folders and files (EXT-001). */
@Tag("EXT-001")
class ItemNameTest {

    @Test
    void aNameIsKeptWithoutTheSpacesAroundIt() {
        assertEquals("Reports 2026", ItemName.check("  Reports 2026 "));
        assertEquals("Relazioni è più", ItemName.check("Relazioni è più"));
    }

    @Test
    void emptyLongAndPathLikeNamesAreRefused() {
        for (String name : new String[] {null, "", "   ", ".", "..", "a/b", "a\b", "tab\there", "x".repeat(256)}) {
            assertThrows(IllegalArgumentException.class, () -> ItemName.check(name), String.valueOf(name));
        }
        assertEquals(255, ItemName.check("x".repeat(255)).length());
    }

    @Test
    void namesInAFolderCompareWithoutCase() {
        assertTrue(ItemName.same("Reports", "REPORTS"));
        assertFalse(ItemName.same("Reports", "Report"));
    }
}
