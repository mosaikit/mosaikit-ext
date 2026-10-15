// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection;

import dev.mosaikit.kernel.api.contract.Contracts;
import io.github.mosaikit.ext.catalog.connection.api.v1.Connector;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import org.jboss.logging.Logger;

/**
 * The connectors of the organization of the request (EXT-010): the implementations of the contract
 * "connector" that the kernel finds in the extensions active there (MK-134), checked each time, since a
 * connector installed, removed, or turned off or on changes them without a change to the framework.
 */
@ApplicationScoped
public class ConnectorCatalog {

    private static final Logger LOG = Logger.getLogger(ConnectorCatalog.class);

    private final Contracts contracts;

    public ConnectorCatalog(Contracts contracts) {
        this.contracts = contracts;
    }

    /** The usable connectors and the problems of the refused ones, now. */
    public Discovery discover() {
        return Discovery.of(contracts.implementations(Connector.class));
    }

    /**
     * Checks the declarations of the installed connectors when the kernel starts, so that a connector
     * whose declaration lacks a field is reported in the log of the installation, naming the field;
     * the same problems are in {@code GET /api/v1/ext/connections/connectors} and in the app.
     */
    void onStart(@Observes StartupEvent event) {
        try {
            Discovery discovery = discover();
            discovery.problems().forEach(problem -> LOG.warnf(
                    "Connector of %s refused: %s", problem.extension(), problem.message()));
            LOG.infof("Connectors: %s", discovery.connectors().keySet());
        } catch (RuntimeException e) {
            LOG.warnf("The connectors could not be checked at start: %s", e.getMessage());
        }
    }
}
