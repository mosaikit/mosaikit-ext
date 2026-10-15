// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;

/**
 * A folder or a file of the tree of an organization (EXT-001). Each item is in at most one parent
 * folder, none at the root, and is a resource registered with the kernel (MK-054), which keeps its
 * owner and its grants. A file keeps here its name, size and type; its content is in the file service
 * of the kernel (MK-041), under {@link #getFileId()}.
 */
@Entity
@Table(name = "item", schema = "ext_catalog")
public class Item {

    /** The kind of a folder. */
    public static final String FOLDER = "folder";

    /** The kind of a file. */
    public static final String FILE = "file";

    @Id
    private UUID id;

    @Column(name = "organization_id", nullable = false)
    private UUID organizationId;

    @Column(name = "parent_id")
    private UUID parentId;

    @Column(nullable = false, length = 6)
    private String kind;

    @Column(nullable = false, length = ItemName.MAX_LENGTH)
    private String name;

    @Column(name = "file_id")
    private UUID fileId;

    private Long size;

    @Column(name = "content_type")
    private String contentType;

    /** The kind of a file that another extension recognized, {@code <extension>/<name>} (EXT-105). */
    @Column(name = "file_kind")
    private String fileKind;

    /** The state its kind recorded on the file, such as {@code loaded}. */
    @Column(name = "kind_state")
    private String kindState;

    @Column(name = "kind_state_detail")
    private String kindStateDetail;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "changed_at", nullable = false)
    private Instant changedAt;

    /** Required by JPA. */
    protected Item() {}

    private Item(UUID id, UUID organizationId, UUID parentId, String kind, String name, Instant now) {
        this.id = Objects.requireNonNull(id, "id");
        this.organizationId = Objects.requireNonNull(organizationId, "organizationId");
        this.parentId = parentId;
        this.kind = kind;
        this.name = ItemName.check(name);
        // The database keeps microseconds: the item answers the same before and after it is read again.
        this.createdAt = Objects.requireNonNull(now, "now").truncatedTo(ChronoUnit.MICROS);
        this.changedAt = createdAt;
    }

    /** A new folder, in a parent folder or at the root ({@code parentId} null). */
    public static Item folder(UUID organizationId, UUID parentId, String name, Instant now) {
        return new Item(UUID.randomUUID(), organizationId, parentId, FOLDER, name, now);
    }

    /**
     * A new file whose content the file service of the kernel keeps under {@code fileId}; its own
     * identifier is chosen first, to attach the content to its resource.
     */
    public static Item file(
            UUID id,
            UUID organizationId,
            UUID parentId,
            String name,
            UUID fileId,
            long size,
            String contentType,
            Instant now) {
        Item item = new Item(id, organizationId, parentId, FILE, name, now);
        item.fileId = Objects.requireNonNull(fileId, "fileId");
        item.size = size;
        item.contentType = contentType;
        return item;
    }

    /** Gives the item another name (EXT-002); it changes now. */
    public void rename(String newName, Instant now) {
        this.name = ItemName.check(newName);
        this.changedAt = Objects.requireNonNull(now, "now").truncatedTo(ChronoUnit.MICROS);
    }

    /** Puts the item in another folder, or at the root ({@code null}), keeping its identity (EXT-002). */
    public void moveTo(UUID newParentId) {
        this.parentId = newParentId;
    }

    /**
     * Replaces the content of a file (EXT-105): the file service keeps the new one under {@code fileId}.
     * It changes now.
     */
    public void replaceContent(UUID newFileId, long newSize, String newContentType, Instant now) {
        this.fileId = Objects.requireNonNull(newFileId, "newFileId");
        this.size = newSize;
        this.contentType = newContentType;
        this.changedAt = Objects.requireNonNull(now, "now").truncatedTo(ChronoUnit.MICROS);
    }

    /**
     * Gives the file the kind that recognized it, {@code null} for none (EXT-105); a state recorded by
     * another kind goes.
     */
    public void recognizedAs(String kind) {
        if (!Objects.equals(kind, fileKind)) {
            this.kindState = null;
            this.kindStateDetail = null;
        }
        this.fileKind = kind;
    }

    /** Records the state of its kind on the file, {@code null} for none (EXT-105). */
    public void recordState(String state, String detail) {
        this.kindState = fileKind == null ? null : state;
        this.kindStateDetail = kindState == null ? null : detail;
    }

    public UUID getId() {
        return id;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    public UUID getParentId() {
        return parentId;
    }

    public String getKind() {
        return kind;
    }

    public boolean isFolder() {
        return FOLDER.equals(kind);
    }

    public String getName() {
        return name;
    }

    public UUID getFileId() {
        return fileId;
    }

    /** The size of a file in bytes, {@code null} for a folder. */
    public Long getSize() {
        return size;
    }

    public String getContentType() {
        return contentType;
    }

    /** The kind of a file, {@code <extension>/<name>}; {@code null} for none (EXT-105). */
    public String getFileKind() {
        return fileKind;
    }

    public String getKindState() {
        return kindState;
    }

    public String getKindStateDetail() {
        return kindStateDetail;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getChangedAt() {
        return changedAt;
    }
}
