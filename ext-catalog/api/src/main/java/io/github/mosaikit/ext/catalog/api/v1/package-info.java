// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
/**
 * Version 1 of the contracts of the catalog (MK-134): {@link io.github.mosaikit.ext.catalog.api.v1.FileKind},
 * the kinds of files that other extensions add to the file manager, with the file they see ({@link
 * io.github.mosaikit.ext.catalog.api.v1.CatalogFile}), what happens to it ({@link
 * io.github.mosaikit.ext.catalog.api.v1.FileEvent}) and the state they record on it ({@link
 * io.github.mosaikit.ext.catalog.api.v1.FileState}) (EXT-105); and {@link
 * io.github.mosaikit.ext.catalog.api.v1.LinkedDocuments}, the resources of other extensions to which
 * documents of the catalog are linked (EXT-006). A breaking change goes into a package
 * {@code api.v2}, next to this one.
 */
package io.github.mosaikit.ext.catalog.api.v1;
