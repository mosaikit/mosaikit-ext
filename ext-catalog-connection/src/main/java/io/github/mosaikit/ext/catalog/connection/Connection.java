// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * A connection of an organization to a data source (EXT-010): the type of its connector, the extension
 * that declared that type, the values of the connection form and the name of its credential in the
 * secrets service of the kernel, never the credential itself; its description, the address of its
 * source and the file of its thumbnail (EXT-011, EXT-015). Its owner and its grants are kept by the
 * kernel, where the connection is a resource (MK-054).
 */
@Entity
@Table(name = "connection", schema = "ext_catalog_connection")
public class Connection {

    /** The longest name of a connection. */
    public static final int MAX_NAME = 200;

    /** The longest description of a connection. */
    public static final int MAX_DESCRIPTION = 1000;

    @Id
    private UUID id;

    @Column(name = "organization_id", nullable = false)
    private UUID organizationId;

    @Column(nullable = false, length = MAX_NAME)
    private String name;

    @Column(nullable = false, length = 64)
    private String type;

    @Column(nullable = false)
    private String connector;

    // Text, converted here: the kernel refuses the JSON columns of Hibernate (its format mapper is the
    // one of its REST endpoints).
    @Convert(converter = JsonObject.class)
    @Column(nullable = false)
    private Map<String, Object> settings;

    private String credential;

    @Column(length = MAX_DESCRIPTION)
    private String description;

    @Column(length = Addresses.MAX)
    private String address;

    /** The file of the uploaded thumbnail in the file service of the kernel. */
    private UUID thumbnail;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** The pieces at the top level of the source, as last listed; {@code null} until it is listed. */
    private Integer pieces;

    @Column(name = "more_pieces", nullable = false)
    private boolean morePieces;

    /** {@code reachable} or {@code unreachable} at the last test or listing; {@code null} before. */
    @Column(name = "source_state", length = 32)
    private String sourceState;

    @Column(name = "checked_at")
    private Instant checkedAt;

    /** Required by JPA. */
    protected Connection() {}

    public Connection(
            UUID organizationId,
            String name,
            String type,
            String connector,
            Map<String, Object> settings,
            String credential,
            Instant now) {
        this.id = UUID.randomUUID();
        this.organizationId = Objects.requireNonNull(organizationId, "organizationId");
        this.name = Objects.requireNonNull(name, "name");
        this.type = Objects.requireNonNull(type, "type");
        this.connector = Objects.requireNonNull(connector, "connector");
        this.settings = new LinkedHashMap<>(settings);
        this.credential = credential;
        // The database keeps microseconds: the connection answers the same before and after it is read.
        this.createdAt = Objects.requireNonNull(now, "now").truncatedTo(ChronoUnit.MICROS);
        this.updatedAt = this.createdAt;
    }

    /** When the connection was last changed: created, renamed, described, configured or given a thumbnail. */
    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /** Records a change of the connection at this time. */
    public void touch(Instant now) {
        this.updatedAt = Objects.requireNonNull(now, "now").truncatedTo(ChronoUnit.MICROS);
    }

    /** The pieces at the top level of the source as last listed, {@code null} until it is listed. */
    public Integer getPieces() {
        return pieces;
    }

    /** Whether the source held more pieces than those counted. */
    public boolean hasMorePieces() {
        return morePieces;
    }

    /** {@code reachable} or {@code unreachable} at the last test or listing, {@code null} before. */
    public String getSourceState() {
        return sourceState;
    }

    /** When the source was last tested or listed, {@code null} before. */
    public Instant getCheckedAt() {
        return checkedAt;
    }

    /** Records the state of the source seen by a test or a listing, at this time. */
    public void checked(boolean reachable, Instant now) {
        this.sourceState = reachable ? "reachable" : "unreachable";
        this.checkedAt = Objects.requireNonNull(now, "now").truncatedTo(ChronoUnit.MICROS);
    }

    /** Records the pieces counted at the top level of the source, and whether it held more. */
    public void counted(int pieces, boolean more) {
        this.pieces = pieces;
        this.morePieces = more;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    /** The type of source, as its connector declares it. */
    public String getType() {
        return type;
    }

    /** The identifier of the extension that declared the type when the connection was created. */
    public String getConnector() {
        return connector;
    }

    /** The values of the connection form. */
    public Map<String, Object> getSettings() {
        return Map.copyOf(settings);
    }

    /** The name of the credential in the secrets service of the kernel, {@code null} without one. */
    public String getCredential() {
        return credential;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    /** The description, {@code null} without one. */
    public String getDescription() {
        return description;
    }

    /** The address of the source, as its connector told it when the connection was saved. */
    public String getAddress() {
        return address;
    }

    /** The file of the uploaded thumbnail, {@code null} when the thumbnail is generated from the name. */
    public UUID getThumbnail() {
        return thumbnail;
    }

    /** Changes the name. */
    public void rename(String name) {
        this.name = Objects.requireNonNull(name, "name");
    }

    /** Changes the description; {@code null} clears it. */
    public void describe(String description) {
        this.description = description;
    }

    /** Changes the values of the form, the credential and the address of the source they give. */
    public void configure(Map<String, Object> settings, String credential, String address) {
        this.settings = new LinkedHashMap<>(settings);
        this.credential = credential;
        this.address = address;
    }

    /** Sets the file of the uploaded thumbnail; {@code null} goes back to the generated one. */
    public void thumbnail(UUID file) {
        this.thumbnail = file;
    }
}
