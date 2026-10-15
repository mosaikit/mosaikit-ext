// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import jakarta.data.repository.Delete;
import jakarta.data.repository.Insert;
import jakarta.data.repository.Query;
import jakarta.data.repository.Repository;
import java.util.List;

/** Jakarta Data repository of the removals waiting for a job, kept to each organization by row-level security. */
@Repository
public interface PendingRemovals {

    @Query("from PendingRemoval r")
    List<PendingRemoval> all();

    @Insert
    void insert(PendingRemoval removal);

    @Delete
    void delete(PendingRemoval removal);
}
