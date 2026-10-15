// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.api.v1;

import dev.mosaikit.kernel.api.contract.Contract;
import dev.mosaikit.kernel.api.contract.ContractImplementation;

/**
 * A kind of file that another extension adds to the catalog (EXT-105), version 1 of the contract
 * {@code io.github.mosaikit.ext.catalog/file-kind} (MK-134).
 *
 * <p>An extension implements it in an {@code @ApplicationScoped} bean, one per kind, and declares the
 * contract in its manifest:
 *
 * <pre>{@code
 * contracts:
 *   implements:
 *     - contract: io.github.mosaikit.ext.catalog/file-kind
 *       version: 1
 *       api: io.github.mosaikit.ext:ext-catalog-api
 * }</pre>
 *
 * <p>The catalog asks the kinds of the extensions active in the organization whether they recognize a
 * file when it is stored or replaced, and when an extension becomes active, for the files that no kind
 * recognized yet; the first kind that recognizes it, in the order of the extensions, is its kind. It
 * then tells that kind when the file changes ({@link #changed}), in a job of the organization. The
 * file stays a plain file of the catalog, with its content: without the extension, the catalog shows
 * it as any other file, and when the extension comes back its kind applies again.
 *
 * <p>The icon, the preview and the actions of a kind are contributions of the frontend of the extension
 * to the point {@code catalog.file-kind} of the catalog, naming the kind by {@link #name()}.
 */
@Contract(extension = FileKind.CATALOG, name = "file-kind", version = 1)
public interface FileKind extends ContractImplementation {

    /** The identifier of the catalog, which owns the contract. */
    String CATALOG = "io.github.mosaikit.ext.catalog";

    /**
     * The name of the kind within its extension, such as {@code text-note}: lowercase letters, digits and
     * {@code -}, at most 64 characters, starting with a letter. The catalog knows the kind as {@code
     * <extension>/<name>}, and keeps it on the file; so keep it stable across versions.
     */
    String name();

    /**
     * Whether a file is of this kind, from its name, its media type and its first bytes. Called while a
     * person stores a file: answer quickly, without reading anything else, and without failing; an
     * exception counts as no.
     */
    boolean recognizes(FileSample sample);

    /**
     * Something happened to a file of this kind. Called in a job of the organization, without a person,
     * a few seconds after the change (MK-085); at least once, so make it idempotent: an exception rolls
     * the work back and the catalog tells the kind again later, as the platform does with its events.
     * The file reads its content with {@link CatalogFile#open()} and records a state with {@link
     * CatalogFile#record(FileState)}.
     */
    default void changed(FileEvent event) {
        // A kind that only shows its files needs no events.
    }
}
