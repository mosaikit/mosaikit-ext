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
 * A download asked by a person (EXT-002): one file, or an archive of the items they selected, whose
 * content comes from signed, expiring links of the file service of the kernel (EXT-004, MK-093). It is
 * ready at once when the kernel makes the links for the person, or once a job of the organization made
 * them (see {@link CatalogJobs}).
 */
@Entity
@Table(name = "download", schema = "ext_catalog")
public class Download {

    /** Waiting for the links of a job. */
    public static final String PENDING = "pending";

    /** Its links are made. */
    public static final String READY = "ready";

    /** A file of it was no longer there. */
    public static final String FAILED = "failed";

    @Id
    private UUID id;

    @Column(name = "organization_id", nullable = false)
    private UUID organizationId;

    @Column(name = "requested_by", nullable = false)
    private String requestedBy;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String status;

    private int validity;

    @Column(nullable = false)
    private String entries;

    private Instant expires;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** Required by JPA. */
    protected Download() {}

    /**
     * A new download, pending.
     *
     * @param requestedBy the name of the person who asks for it
     * @param validity how long its links are valid, in seconds
     * @param entries its entries, as JSON
     */
    public Download(UUID organizationId, String requestedBy, String name, int validity, String entries, Instant now) {
        this.id = UUID.randomUUID();
        this.organizationId = Objects.requireNonNull(organizationId, "organizationId");
        this.requestedBy = Objects.requireNonNull(requestedBy, "requestedBy");
        this.name = Objects.requireNonNull(name, "name");
        this.status = PENDING;
        this.validity = validity;
        this.entries = Objects.requireNonNull(entries, "entries");
        this.createdAt = now.truncatedTo(ChronoUnit.MICROS);
    }

    /** Its links are made: the entries with their links, which expire then. */
    public void ready(String signedEntries, Instant until) {
        this.entries = signedEntries;
        this.expires = until.truncatedTo(ChronoUnit.MICROS);
        this.status = READY;
    }

    /** A file was no longer there. */
    public void failed() {
        this.status = FAILED;
    }

    public UUID getId() {
        return id;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public String getName() {
        return name;
    }

    public String getStatus() {
        return status;
    }

    public int getValidity() {
        return validity;
    }

    public String getEntries() {
        return entries;
    }

    public Instant getExpires() {
        return expires;
    }
}
