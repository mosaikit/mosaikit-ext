// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.contract.Contracts;
import dev.mosaikit.kernel.api.resource.ResourceRef;
import io.github.mosaikit.ext.catalog.api.v1.LinkedDocuments;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Optional;
import java.util.Set;
import org.jboss.logging.Logger;

/**
 * The resources of other extensions to which documents are linked (EXT-006): the implementations of the
 * contract {@code linked-documents} of the catalog (MK-134), of the extensions active in the
 * organization of the request, which the kernel gives anew at each call, so they come and go with their
 * extension.
 */
@ApplicationScoped
public class LinkTargets {

    private static final Logger LOG = Logger.getLogger(LinkTargets.class);

    private final Contracts contracts;

    public LinkTargets(Contracts contracts) {
        this.contracts = contracts;
    }

    /** The implementation of the extension of a resource, when it is active and takes documents on its type. */
    public Optional<LinkedDocuments> of(ResourceRef resource) {
        return contracts.implementations(LinkedDocuments.class).stream()
                .filter(target -> resource.extension().equals(target.extension()))
                .filter(target -> types(target).contains(resource.type()))
                .findFirst();
    }

    /**
     * Whether the person of the request may link documents to a resource, and remove its links, as the
     * extension of the resource answers; no while that extension is absent. A fault of the extension
     * counts as no.
     */
    public boolean mayLink(ResourceRef resource) {
        return of(resource).map(target -> {
                    try {
                        return target.mayLink(resource.type(), resource.id());
                    } catch (RuntimeException e) {
                        LOG.warnf(e, "Extension %s failed to tell whether documents are linked to %s %s",
                                resource.extension(), resource.type(), resource.id());
                        return false;
                    }
                })
                .orElse(false);
    }

    private static Set<String> types(LinkedDocuments target) {
        try {
            Set<String> types = target.types();
            return types == null ? Set.of() : types;
        } catch (RuntimeException e) {
            LOG.warnf(e, "Extension %s failed to tell the types of its resources", target.extension());
            return Set.of();
        }
    }
}
