// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import jakarta.data.repository.Delete;
import jakarta.data.repository.Find;
import jakarta.data.repository.Insert;
import jakarta.data.repository.Query;
import jakarta.data.repository.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Jakarta Data repository of the links of documents to resources of other extensions (EXT-006); the
 * row-level security of the schema keeps each organization to its own links.
 */
@Repository
public interface Links {

    @Find
    Optional<DocumentLink> findById(UUID id);

    /** The links of a file, oldest first. */
    @Query("from DocumentLink l where l.itemId = :file order by l.createdAt, l.id")
    List<DocumentLink> ofFile(UUID file);

    /** The links to a resource, oldest first. */
    @Query("from DocumentLink l where l.extension = :extension and l.type = :type and l.resourceId = :id"
            + " order by l.createdAt, l.id")
    List<DocumentLink> toResource(String extension, String type, String id);

    @Insert
    void insert(DocumentLink link);

    @Delete
    void delete(DocumentLink link);
}
