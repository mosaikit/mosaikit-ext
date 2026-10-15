// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Objects;
import java.util.UUID;

/**
 * The content of a file deleted from the catalog that the file service of the kernel still keeps,
 * because the person who deleted it reaches the file only through a folder above it (EXT-002). A job
 * of the organization deletes it, then removes the resource of the file (see {@link CatalogJobs}).
 */
@Entity
@Table(name = "pending_removal", schema = "ext_catalog")
public class PendingRemoval {

    @Id
    @Column(name = "item_id")
    private UUID itemId;

    @Column(name = "organization_id", nullable = false)
    private UUID organizationId;

    @Column(name = "file_id", nullable = false)
    private UUID fileId;

    /** Required by JPA. */
    protected PendingRemoval() {}

    public PendingRemoval(Item file) {
        this.itemId = file.getId();
        this.organizationId = file.getOrganizationId();
        this.fileId = Objects.requireNonNull(file.getFileId(), "fileId");
    }

    public UUID getItemId() {
        return itemId;
    }

    public UUID getFileId() {
        return fileId;
    }
}
