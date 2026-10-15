// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import jakarta.data.repository.Delete;
import jakarta.data.repository.Find;
import jakarta.data.repository.Insert;
import jakarta.data.repository.Query;
import jakarta.data.repository.Repository;
import jakarta.data.repository.Update;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Jakarta Data repository of the items; the implementation is generated when the extension is built.
 * The row-level security of the schema keeps each organization to its own items.
 */
@Repository
public interface Items {

    @Find
    Optional<Item> findById(UUID id);

    /** The items of a folder. */
    @Query("from Item i where i.parentId = :parent")
    List<Item> children(UUID parent);

    /** The items with these identifiers. */
    @Query("from Item i where i.id in :ids")
    List<Item> findByIds(Collection<UUID> ids);

    /** The parent of every item of these folders, once per item: counted, the size of each folder. */
    @Query("select i.parentId from Item i where i.parentId in :parents")
    List<UUID> parentsOfChildren(Collection<UUID> parents);

    /** Every file of the organization (EXT-105). */
    @Query("from Item i where i.kind = 'file'")
    List<Item> files();

    @Insert
    void insert(Item item);

    @Update
    void update(Item item);

    @Delete
    void delete(Item item);
}
