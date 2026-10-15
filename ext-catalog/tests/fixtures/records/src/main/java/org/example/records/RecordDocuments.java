// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.records;

import dev.mosaikit.kernel.api.resource.ResourceRef;
import dev.mosaikit.kernel.api.sharing.Sharing;
import io.github.mosaikit.ext.catalog.api.v1.LinkedDocuments;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Set;

/**
 * Records take documents of the catalog (EXT-006), through its contract {@code linked-documents} version
 * 1: a person who edits a record links documents to it and removes them.
 */
@ApplicationScoped
public class RecordDocuments implements LinkedDocuments {

    private final Sharing sharing;

    public RecordDocuments(Sharing sharing) {
        this.sharing = sharing;
    }

    @Override
    public String extension() {
        return RecordsResource.EXTENSION;
    }

    @Override
    public Set<String> types() {
        return Set.of(RecordsResource.TYPE);
    }

    @Override
    public boolean mayLink(String type, String id) {
        return sharing.allows(new ResourceRef(RecordsResource.EXTENSION, type, id), "edit");
    }
}
