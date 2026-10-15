// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.api.v1;

import dev.mosaikit.kernel.api.contract.Contract;
import dev.mosaikit.kernel.api.contract.ContractImplementation;
import java.util.Set;

/**
 * Resources of another extension to which documents of the catalog are linked (EXT-006), version 1 of
 * the contract {@code io.github.mosaikit.ext.catalog/linked-documents} (MK-134), since {@code
 * ext-catalog-api} 1.2.0.
 *
 * <p>A report next to the connection it describes, an act next to the dashboard it explains: the
 * document stays a file of the catalog, with its folder, its sharing and its content, and the catalog
 * keeps the link, as a reference to the resource that the extension registered with the platform
 * (MK-054, MK-135). The extension implements this interface in an {@code @ApplicationScoped} bean, one
 * per extension, and declares the contract in its manifest:
 *
 * <pre>{@code
 * contracts:
 *   implements:
 *     - contract: io.github.mosaikit.ext.catalog/linked-documents
 *       version: 1
 *       api: io.github.mosaikit.ext:ext-catalog-api
 * }</pre>
 *
 * <p>The catalog then links documents to its resources of the {@link #types()} given, when a person who
 * reads the document may link documents to the resource ({@link #mayLink}), and lists the documents
 * linked to a resource to those who read it, each document only to those who read it too. The sheet of
 * the resource shows them with the element {@code mosaikit-ext-catalog-documents} of the frontend of
 * the catalog; the sheet of the document shows the resource, or the placeholder of the platform while
 * the extension is absent. A link stays when the extension goes, and works again when it comes back.
 */
@Contract(extension = FileKind.CATALOG, name = "linked-documents", version = 1)
public interface LinkedDocuments extends ContractImplementation {

    /**
     * The types of the resources of the extension to which documents are linked, as its manifest declares
     * them under {@code resources}, such as {@code connection}.
     */
    Set<String> types();

    /**
     * Whether the person of the request may link documents to a resource of the extension, and remove the
     * links, such as a person who edits it. Called in their request, only for the {@link #types()} given;
     * the catalog checks that they read the document. An exception counts as no.
     *
     * @param type one of the {@link #types()}
     * @param id the identifier with which the extension registered the resource
     */
    boolean mayLink(String type, String id);
}
