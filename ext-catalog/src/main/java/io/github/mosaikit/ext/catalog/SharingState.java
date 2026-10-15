// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.extension.SubjectKind;
import java.util.Collection;
import java.util.List;

/**
 * The sharing state of an item as its list shows it (EXT-001): who reaches it besides its owner and
 * the administrators, by the widest of the grants on it and on the folders above it.
 *
 * @param scope {@code private} (nobody else), {@code people} (people or groups), {@code organization}
 *     (every member), {@code link} (whoever has a link) or {@code public} (anyone)
 * @param inherited whether that widest grant is on a folder above the item rather than on the item
 */
public record SharingState(String scope, boolean inherited) {

    /** The scopes, from the narrowest to the widest. */
    public static final List<String> SCOPES = List.of("private", "people", "organization", "link", "public");

    /** The scope of the grants of one item. */
    public static String scopeOf(Collection<SubjectKind> kinds) {
        String scope = SCOPES.getFirst();
        for (SubjectKind kind : kinds) {
            scope = wider(scope, switch (kind) {
                case PERSON, GROUP -> "people";
                case ORGANIZATION -> "organization";
                case LINK -> "link";
                case PUBLIC -> "public";
            });
        }
        return scope;
    }

    /** The state of an item from the scope of its own grants and the one of the folders above it. */
    public static SharingState of(String own, String above) {
        return SCOPES.indexOf(above) > SCOPES.indexOf(own) ? new SharingState(above, true) : new SharingState(own, false);
    }

    /** The wider of two scopes. */
    public static String wider(String a, String b) {
        return SCOPES.indexOf(a) >= SCOPES.indexOf(b) ? a : b;
    }
}
