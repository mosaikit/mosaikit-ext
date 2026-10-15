// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.resource.Resource;
import dev.mosaikit.kernel.api.resource.Resources;
import dev.mosaikit.kernel.api.sharing.Sharing;
import dev.mosaikit.kernel.api.teams.People;
import io.quarkus.security.Authenticated;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Who has access to a folder or a file, and through which share (EXT-003), at
 * {@code /api/v1/ext/catalog/items/{id}/access}. Sharing itself happens in the sharing dialog of the
 * kernel (MK-055); this answer adds what the kernel does not know: the access that comes from the
 * folders above.
 */
@Path("/api/v1/ext/catalog/items")
@Produces(MediaType.APPLICATION_JSON)
@Authenticated
public class AccessResource {

    private final Items items;
    private final Resources resources;
    private final Sharing sharing;
    private final People people;

    public AccessResource(Items items, Resources resources, Sharing sharing, People people) {
        this.items = items;
        this.resources = resources;
        this.sharing = sharing;
        this.people = people;
    }

    /** Who has access to an item the person reads; 404 when it does not exist or they cannot read it. */
    @GET
    @Path("{id}/access")
    @Transactional
    public Access access(@PathParam("id") UUID id) {
        Tree tree = new Tree(items, sharing);
        Item item = tree.item(id).filter(found -> tree.level(found) != null).orElseThrow(NotFoundException::new);
        Map<UUID, String> teams = new HashMap<>();
        for (People.OrganizationTeam team : people.teams()) {
            teams.put(team.id(), team.name());
        }
        Access.Names names = new Access.Names() {
            @Override
            public Access.Who person(UUID account) {
                return people.find(account)
                        .map(person -> new Access.Who("person", account, person.displayName(), person.email(), null))
                        .orElse(new Access.Who("person", account, null, null, null));
            }

            @Override
            public String team(UUID team) {
                return teams.get(team);
            }
        };
        return Access.of(
                tree, item, found -> resources.find(Tree.ref(found)).map(Resource::owner).orElse(null), names);
    }
}
