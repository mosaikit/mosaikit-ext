// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import jakarta.data.repository.Find;
import jakarta.data.repository.Insert;
import jakarta.data.repository.Query;
import jakarta.data.repository.Repository;
import jakarta.data.repository.Update;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Jakarta Data repository of the connections; the implementation is generated when the extension is
 * built. The row-level security of the schema keeps each organization to its own connections.
 */
@Repository
public interface Connections {

    @Find
    Optional<Connection> findById(UUID id);

    /** Every connection of the organization, by name. */
    @Query("from Connection c order by lower(c.name)")
    List<Connection> all();

    /** Whether the organization has a connection with this name, in any case. */
    @Query("select count(c) from Connection c where lower(c.name) = lower(:name)")
    long countByName(String name);

    /** Whether the organization has another connection with this name, in any case. */
    @Query("select count(c) from Connection c where lower(c.name) = lower(:name) and c.id <> :id")
    long countOthersByName(String name, UUID id);

    @Insert
    void insert(Connection connection);

    @Update
    void update(Connection connection);
}
