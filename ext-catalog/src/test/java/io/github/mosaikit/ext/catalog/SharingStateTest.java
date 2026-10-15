// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.mosaikit.kernel.api.extension.SubjectKind;
import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** The sharing state of an item and the levels that pass from a folder to its content (EXT-001). */
@Tag("EXT-001")
class SharingStateTest {

    @Test
    void theStateIsTheWidestGrant() {
        assertEquals("private", SharingState.scopeOf(List.of()));
        assertEquals("people", SharingState.scopeOf(List.of(SubjectKind.PERSON, SubjectKind.GROUP)));
        assertEquals("organization", SharingState.scopeOf(List.of(SubjectKind.GROUP, SubjectKind.ORGANIZATION)));
        assertEquals("link", SharingState.scopeOf(List.of(SubjectKind.LINK, SubjectKind.PERSON)));
        assertEquals("public", SharingState.scopeOf(List.of(SubjectKind.PUBLIC, SubjectKind.LINK)));
    }

    @Test
    void aWiderGrantOnAFolderAboveIsShownAsInherited() {
        assertEquals(new SharingState("organization", true), SharingState.of("people", "organization"));
        assertEquals(new SharingState("people", false), SharingState.of("people", "people"));
        assertEquals(new SharingState("private", false), SharingState.of("private", "private"));
    }

    @Test
    void eachLevelIncludesThoseBeforeIt() {
        assertTrue(Levels.atLeast("manage", "edit"));
        assertFalse(Levels.atLeast("read", "edit"));
        assertFalse(Levels.atLeast(null, "read"));
    }
}
