// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

import dev.mosaikit.kernel.api.contract.Contract;
import dev.mosaikit.kernel.api.contract.ContractImplementation;
import java.util.Optional;

/**
 * A kind of data source, version 1 of the contract "connector" of the connection framework (EXT-010,
 * MK-134). A connector is an extension of its own that implements this interface in a CDI bean and
 * declares it in its manifest, with this artifact among its libraries:
 *
 * <pre>{@code
 * contracts:
 *   implements:
 *     - contract: io.github.mosaikit.ext.catalog.connection/connector
 *       version: 1
 *       api: io.github.mosaikit.ext:ext-catalog-connection-api
 * }</pre>
 *
 * <p>The framework finds the connectors active in the organization each time it needs them: installing
 * a connector adds its type to New connection, removing it leaves its connections listed as
 * unavailable, without a change to the framework. The framework knows no protocol: it keeps the
 * connections, reads their credentials from the secrets service of the platform and passes them to
 * the connector, which never stores or returns them.
 *
 * <pre>{@code
 * @ApplicationScoped
 * public class FilesConnector implements Connector {
 *     public String extension() { return "org.example.ext.catalog.connection.files"; }
 *     public Declaration declaration() { ... }
 *     public TestResult test(ConnectionSettings settings) { ... }
 *     public Page<Entry> list(ConnectionSettings settings, String path, Paging paging) { ... }
 * }
 * }</pre>
 */
@Contract(extension = Connector.FRAMEWORK, name = Connector.CONTRACT, version = 1)
public interface Connector extends ContractImplementation {

    /** The identifier of the extension that owns the contract, the connection framework. */
    String FRAMEWORK = "io.github.mosaikit.ext.catalog.connection";

    /** The name of the contract in the framework. */
    String CONTRACT = "connector";

    /**
     * What the connector is: its type, title, logo, category and connection form. The framework checks
     * it when it starts and whenever it lists the connectors: a declaration that lacks a required field
     * is refused with a problem that names the field, and the other connectors keep working.
     */
    Declaration declaration();

    /**
     * Tries to connect with these settings, for the button "Test connection" of the framework. A source
     * that does not answer or refuses the credential is a failed result, not an exception; its message
     * is shown to the person and never contains the credential.
     */
    TestResult test(ConnectionSettings settings);

    /**
     * The contents of a source at a path: its top level with an empty path, then what a container entry
     * holds, such as the tables of a schema or the files of a folder, with the path of that entry.
     *
     * @throws IllegalArgumentException when the path does not exist in the source
     */
    Page<Entry> list(ConnectionSettings settings, String path, Paging paging);

    /**
     * The address of the source of a connection with these settings, such as {@code db.example.org:5432/sales}
     * or {@code https://api.example.org}, which the card of a connection shows under its name when it has
     * no description (EXT-015). The framework asks for it when a connection is saved, without the
     * credential, and keeps it with the connection, so that it is shown also while the connector is
     * absent. The address never contains a credential.
     *
     * <p>Empty by default: the framework then takes it from the usual settings of a source, such as
     * {@code url}, {@code endpoint} or {@code host} with {@code port} and {@code database}. A connector
     * whose settings say it otherwise overrides this method.
     */
    default Optional<String> address(ConnectionSettings settings) {
        return Optional.empty();
    }
}
