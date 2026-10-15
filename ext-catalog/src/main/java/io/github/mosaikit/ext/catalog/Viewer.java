// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.sharing.Grant;
import dev.mosaikit.kernel.api.sharing.Subject;
import java.util.Set;
import java.util.UUID;

/**
 * The person of a request, as Shared with me needs them (EXT-003): which grants are for them.
 *
 * @param account their account, or {@code null} when the request has no person
 * @param teams the teams and groups they are in
 * @param member whether they are a member of the organization, not a guest: a grant to the
 *     organization reaches only its members
 */
record Viewer(UUID account, Set<UUID> teams, boolean member) {

    Viewer {
        teams = Set.copyOf(teams);
    }

    /** Whether a grant is to the person, to a team of theirs or to their organization. */
    boolean reaches(Grant grant) {
        return switch (grant.subject()) {
            case Subject.Person person -> account != null && person.account().equals(account);
            case Subject.Group group -> teams.contains(group.team());
            case Subject.Organization _ -> account != null && member;
            case Subject.Link _, Subject.Public _ -> false;
        };
    }

    /** Whether the person is {@code owner}, the owner of a resource ({@code null}: the organization). */
    boolean owns(UUID owner) {
        return account != null && account.equals(owner);
    }
}
