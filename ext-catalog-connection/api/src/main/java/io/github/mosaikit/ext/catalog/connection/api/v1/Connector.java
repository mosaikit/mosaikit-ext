// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

import dev.mosaikit.kernel.api.contract.Contract;
import dev.mosaikit.kernel.api.contract.ContractImplementation;
import java.util.Optional;
import java.util.Set;

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
 *     public Page<Piece> list(ConnectionSettings settings, String parent, Paging paging) { ... }
 * }
 * }</pre>
 *
 * <p>Every connector lists its contents in the same shape, {@link Piece}: an id, a name, a kind and
 * the facts it knows (EXT-019). What each piece can be used for comes from the extensions that consume
 * data, not from the connector.
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
     * The pieces of a source (EXT-019): its top level with an empty parent, then what a container
     * holds, such as the tables of a schema or the files of a folder, with the id of that container. A
     * source, or a container, with nothing in it is an empty page.
     *
     * <p>By default a connector cannot list its contents yet ({@link
     * ContentsUnavailableException.Reason#NOT_READABLE}).
     *
     * @param parent the id of a container piece, or empty for the top level
     * @throws IllegalArgumentException when the parent does not exist in the source, or is not a container
     * @throws ContentsUnavailableException when the source does not answer, does not describe its
     *     contents, or holds a kind that the connector cannot read yet; each is told apart to the person
     */
    default Page<Piece> list(ConnectionSettings settings, String parent, Paging paging) {
        throw ContentsUnavailableException.notReadable("This connector cannot list the contents of its sources yet");
    }

    /**
     * Looks at a piece of a source (EXT-018): reads a sample of what it holds, such as the response of
     * an endpoint, the first messages of a topic or the first rows of a table, and tells the facts it
     * finds in it, such as a column holding coordinates ({@value Piece.Facts#GEOMETRY}). The framework
     * shows the sample with its shape on the connection step and in the detail of a connection, and
     * offers on the piece the uses its facts allow. It reads only, and as little as a sample needs.
     *
     * <p>By default a connector cannot inspect its pieces yet ({@link
     * ContentsUnavailableException.Reason#NOT_READABLE}), which the framework says instead of a sample.
     *
     * @param piece the id of a piece that {@link #list} returned
     * @throws IllegalArgumentException when the piece does not exist in the source
     * @throws ContentsUnavailableException when the source does not answer, does not describe the piece,
     *     or holds a kind the connector cannot read yet; each is told apart to the person
     */
    default Inspection inspect(ConnectionSettings settings, String piece) {
        throw ContentsUnavailableException.notReadable("This connector cannot inspect the pieces of its sources yet");
    }

    /**
     * The kinds of pieces that the sources of this connector hold, such as {@code schema}, {@code table}
     * and {@code view} (EXT-026): the source picker of the framework offers a type only to the editors
     * whose uses take one of its kinds.
     *
     * <p>Empty by default: the framework then takes the kinds usual for the category of the
     * declaration ({@code database} and {@code warehouse}: schema, table, view; {@code lake} and {@code
     * files}: folder, file; {@code api}: endpoint; {@code stream}: topic), and offers the type to every
     * editor when its category is one of its own.
     */
    default Set<String> kinds() {
        return Set.of();
    }

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

    /**
     * Runs a query on the source and returns at most {@code limit} rows (EXT-040), for the sources that
     * take queries, such as SQL databases. The query only reads: a connector runs it so that it cannot
     * change the source, such as in a read-only transaction.
     *
     * <p>By default a connector runs no queries ({@link UnsupportedOperationException}).
     *
     * @param statement the query, in the language of the source
     * @param limit the most rows to return, from 1; the result says whether the source had more
     * @throws IllegalArgumentException when the source refuses the query, with its error
     * @throws ContentsUnavailableException when the source does not answer
     */
    default Rows query(ConnectionSettings settings, String statement, int limit) {
        throw new UnsupportedOperationException("This connector runs no queries");
    }
}
