// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.quota.Quota;
import dev.mosaikit.kernel.api.quota.QuotaExceededException;
import dev.mosaikit.kernel.api.quota.Quotas;
import dev.mosaikit.kernel.api.sharing.Sharing;
import io.quarkus.security.Authenticated;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.UUID;

/**
 * The check of an upload before it starts (EXT-002), under {@code /api/v1/ext/catalog/uploads}: the app
 * asks it with the size of everything dropped, and uploads nothing when it does not fit the storage of
 * the organization (MK-076), so that an upload is never left half done by the quota.
 */
@Path("/api/v1/ext/catalog/uploads")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
public class UploadResource {

    /** The measure of the kernel that its files count to. */
    static final String STORAGE = "storage";

    /**
     * An upload about to start.
     *
     * @param folder the folder it goes to
     * @param bytes the size of all its files
     */
    public record PlannedUpload(UUID folder, long bytes) {}

    private final Items items;
    private final Sharing sharing;
    private final Quotas quotas;

    public UploadResource(Items items, Sharing sharing, Quotas quotas) {
        this.items = items;
        this.sharing = sharing;
        this.quotas = quotas;
    }

    /**
     * 204 when the person may add to the folder and the upload fits the storage of the organization;
     * {@code 403 Quota exceeded} otherwise, whose problem detail names the limit, what is used and what
     * the upload needs; 404 for a folder they cannot read.
     */
    @POST
    @Path("check")
    @Transactional
    public Response check(PlannedUpload request) {
        if (request == null || request.folder() == null || request.bytes() < 0) {
            throw CatalogResource.problem(Response.Status.BAD_REQUEST, "The upload names no folder or no size.");
        }
        CatalogResource.writableFolder(new Tree(items, sharing), request.folder());
        Quota quota = quotas.check(CatalogResource.EXTENSION, STORAGE, request.bytes());
        if (!quota.fits()) {
            throw new QuotaExceededException(
                    "The upload of " + request.bytes() + " bytes does not fit the storage of the organization: "
                            + quota.used() + " of " + quota.limit().orElse(0) + " bytes are used.",
                    quota);
        }
        return Response.noContent().build();
    }
}
