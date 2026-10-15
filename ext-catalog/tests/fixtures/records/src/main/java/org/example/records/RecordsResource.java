// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.records;

import dev.mosaikit.kernel.api.context.CurrentOrganization;
import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.resource.Resources;
import dev.mosaikit.kernel.api.sharing.Sharing;
import io.quarkus.security.Authenticated;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The API of the fixture, under {@code /api/v1/ext/records} (EXT-006): records, resources registered with
 * the platform (MK-054) and shared in its dialog, kept in memory, which is enough for the tests. Their
 * sheet in the app lists the documents of the catalog linked to them.
 */
@Path("/api/v1/ext/records")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
@ApplicationScoped
public class RecordsResource {

    static final String EXTENSION = "org.example.records";
    static final String TYPE = "record";

    /** A record: its title, and the level of the person on it. */
    public record RecordView(UUID id, String title, String level) {}

    /** Request to create a record. */
    public record NewRecord(String title) {}

    private record Kept(UUID organization, UUID id, String title) {}

    private final Map<UUID, Kept> records = new ConcurrentHashMap<>();
    private final Resources resources;
    private final Sharing sharing;
    private final CurrentOrganization organization;

    public RecordsResource(Resources resources, Sharing sharing, CurrentOrganization organization) {
        this.resources = resources;
        this.sharing = sharing;
        this.organization = organization;
    }

    /** The records of the organization that the person reads, by title. */
    @GET
    @Path("records")
    @Transactional
    public List<RecordView> list() {
        UUID here = organization.require();
        Set<String> visible = sharing.visible(EXTENSION, TYPE, "view");
        return records.values().stream()
                .filter(kept -> kept.organization().equals(here) && visible.contains(kept.id().toString()))
                .sorted(Comparator.comparing(Kept::title))
                .map(this::view)
                .toList();
    }

    /** Creates a record, which the person owns. */
    @POST
    @Path("records")
    @Transactional
    public Response create(NewRecord request) {
        if (request == null || request.title() == null || request.title().isBlank()) {
            throw new BadRequestException("A record has a title.");
        }
        Kept kept = new Kept(organization.require(), UUID.randomUUID(), request.title().strip());
        resources.register(ref(kept.id()), Resources.Details.of(kept.title(), "/app/records?record=" + kept.id()));
        records.put(kept.id(), kept);
        return Response.status(Response.Status.CREATED).entity(view(kept)).build();
    }

    /** A record the person reads; 404 otherwise. */
    @GET
    @Path("records/{id}")
    @Transactional
    public RecordView get(@PathParam("id") UUID id) {
        Kept kept = find(id);
        sharing.require(ref(id), "view");
        return view(kept);
    }

    /** Deletes a record the person edits, from the registry of the platform too. */
    @DELETE
    @Path("records/{id}")
    @Transactional
    public Response delete(@PathParam("id") UUID id) {
        find(id);
        sharing.require(ref(id), "edit");
        resources.remove(ref(id));
        records.remove(id);
        return Response.noContent().build();
    }

    private Kept find(UUID id) {
        Kept kept = records.get(id);
        if (kept == null || !kept.organization().equals(organization.require())) {
            throw new NotFoundException();
        }
        return kept;
    }

    private RecordView view(Kept kept) {
        return new RecordView(kept.id(), kept.title(), sharing.level(ref(kept.id())).orElse(null));
    }

    private static ResourceRef ref(UUID id) {
        return new ResourceRef(EXTENSION, TYPE, id.toString());
    }
}
