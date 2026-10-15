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
 * secrets service of the kernel, never the credential itself.
 */
@Entity
@Table(name = "connection", schema = "ext_catalog_connection")
public class Connection {

    /** The longest name of a connection. */
    public static final int MAX_NAME = 200;

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

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

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
}
