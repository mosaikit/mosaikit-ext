// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import jakarta.data.repository.Find;
import jakarta.data.repository.Insert;
import jakarta.data.repository.Query;
import jakarta.data.repository.Repository;
import jakarta.data.repository.Update;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Jakarta Data repository of the downloads, kept to each organization by row-level security. */
@Repository
public interface Downloads {

    @Find
    Optional<Download> findById(UUID id);

    @Insert
    void insert(Download download);

    @Update
    void update(Download download);

    /** Forgets the downloads asked before a time, whose links expired long ago. */
    @Query("delete from Download d where d.createdAt < :before")
    void deleteBefore(Instant before);

    /** Forgets every download of the organization. */
    @Query("delete from Download")
    void deleteAll();
}
