// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.resource.ResourceRef;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;

/**
 * A document of the catalog linked to a resource of another extension (EXT-006): the file, and the
 * reference by which that extension registered the resource with the kernel (MK-054). The catalog
 * keeps the reference as it is while the extension is absent or the resource is gone, and the kernel
 * resolves it for each person (MK-135); the link goes with the file.
 */
@Entity
@Table(name = "document_link", schema = "ext_catalog")
public class DocumentLink {

    @Id
    private UUID id;

    @Column(name = "organization_id", nullable = false)
    private UUID organizationId;

    @Column(name = "item_id", nullable = false)
    private UUID itemId;

    @Column(nullable = false)
    private String extension;

    @Column(nullable = false, length = 64)
    private String type;

    @Column(name = "resource_id", nullable = false)
    private String resourceId;

    /** The account of the person who made the link, {@code null} when none did. */
    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** Required by JPA. */
    protected DocumentLink() {}

    /** A new link of a file to a resource of another extension, made now by a person, or none. */
    public static DocumentLink of(UUID organizationId, UUID file, ResourceRef resource, UUID person, Instant now) {
        DocumentLink link = new DocumentLink();
        link.id = UUID.randomUUID();
        link.organizationId = Objects.requireNonNull(organizationId, "organizationId");
        link.itemId = Objects.requireNonNull(file, "file");
        link.extension = resource.extension();
        link.type = resource.type();
        link.resourceId = resource.id();
        link.createdBy = person;
        link.createdAt = Objects.requireNonNull(now, "now").truncatedTo(ChronoUnit.MICROS);
        return link;
    }

    public UUID getId() {
        return id;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    /** The file of the catalog. */
    public UUID getItemId() {
        return itemId;
    }

    /** The resource, as its extension registered it. */
    public ResourceRef resource() {
        return new ResourceRef(extension, type, resourceId);
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
