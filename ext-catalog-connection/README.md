# ext-catalog-connection

Manifest id `io.github.mosaikit.ext.catalog.connection`, package `io.github.mosaikit.ext:ext-catalog-connection`.

The framework of connections to data sources: the list, the creation path, the detail, the source picker the editors of other extensions open, encrypted credentials, the content model and the SQL workspace. Each kind of source is a connector, `ext-catalog-connection-<source>`.

This folder holds everything of the extension and refers to nothing outside it (ADR-0001 of this
repository): it is a project of its own, built and tested like an extension of a third party, only
against what Mosaikit publishes. Its requirements are in [`docs/requirements/`](docs/requirements/),
one `EXT-nnn.md` each, and its changes in [`CHANGELOG.md`](CHANGELOG.md).

| Path | Content |
|---|---|
| `manifest.yaml` | identity, backend, database, the contract it provides, frontend and contributions of the extension |
| `api/` | `io.github.mosaikit.ext:ext-catalog-connection-api`, the contract that connectors implement (EXT-010) |
| `src/main/java/` | the backend: the connectors found through the contract, the connections, their contents and queries, `/api/v1/ext/connections` |
| `db/` | the migrations of the schema `ext_catalog_connection` |
| `web/index.js` | the app, a custom element the shell renders at `/app/connections` |
| `web/list.js` | the list page of the app: header with the count and the grid/rows switch, the column of filters, cards and rows |
| `web/thumbnail.js` | the thumbnails generated from the names of the connections |
| `web/i18n.js` | the texts of the app in English and Italian, chosen by `context.locale` |
| `pom.xml` | the build, on the parent of Mosaikit extensions `io.github.mosaikit:mosaikit-extension-parent` |
| `package.json`, `playwright.config.ts`, `tests/` | the bench of `@mosaikit/testing` and the Playwright tests |
| `tests/fixtures/` | the extensions of the tests: connectors built with the framework (a sample source with two types, sample source and sample files, a sample stream and API, one whose declaration lacks a field) and an extension that contributes uses of pieces |
| `docs/requirements/` | the requirements of this extension |

## The list of connections

Every connection the person views, whatever its connector, is a card of one grid, with rows next to
it (EXT-011). The column of filters lists the types actually configured, each with the number of its
connections, and filters instead of navigating: several types add up. Each card shows:

- a **thumbnail**, the image uploaded for the connection (PNG, JPEG, GIF or WebP, at most 1 MB, kept in
  the file service of the platform attached to the connection), or one generated from its name, whose
  hue and silhouette come from a hash of the name, so that connections of one type do not look alike;
- its **name**, and under it its **description**, or the **address of its source** when it has none
  (EXT-015);
- its **labels**, three kinds that look different (EXT-012): its **type**, with the logo of its
  connector, a fact that cannot be removed; its **category**, from the taxonomy of the connectors, so
  that no connection is without one; and its **free tags**, which a person who edits it writes in its
  detail, kept by the kernel with the generic tags of the platform (MK-097), lowercase and each once;
- its **owner**;
- a **selection box**, which the header counts (EXT-014);
- the **size** of its source, the pieces at its top level as last listed, its **last update** and its
  **status**: unavailable when its connector is absent, otherwise reachable or unreachable at the last
  test or listing of its source, or not checked yet. Nothing is read from the source to show them:
  testing a connection or opening its detail records them;
- a footer with its owner and the commands the person may give.

The header gives the number of cards shown, which follows the filters, the order (most recent first,
the default, or by name) and the switch between the grid and the rows. The page opens on this one
list: every connection, in the grid, with no filter.

Each connection is a resource of the platform (MK-054), of type `connection` with the levels `view`,
`use`, `edit` and `manage`: the person who creates it owns it, and it is shared with the dialog of the
platform. A person lists the connections they view, browses and tests those they use, and changes
those they edit: name, description, settings, credential and thumbnail; the type never changes.

| Request | Level | Answer |
|---|---|---|
| `GET /api/v1/ext/connections/connections` | `view` | the connections, with `description`, `address`, `owner`, `thumbnail`, `editable`, `updated`, `pieces`, `morePieces`, `state` and `checked` |
| `GET /api/v1/ext/connections/connections/{id}` | `view` | one connection |
| `POST /api/v1/ext/connections/connections` | | creates one, owned by the person: `name`, `type`, `description`, `settings`, `credential` |
| `PUT /api/v1/ext/connections/connections/{id}` | `edit` | changes `name`, `description` (empty clears it), `settings` and `credential` |
| `PUT /api/v1/ext/connections/connections/{id}/tags` | `edit` | replaces its free tags, `{tags}`; the answer is the connection, with `tags` |
| `GET /api/v1/ext/connections/tags?prefix=` | | the tags in use that start with the prefix, among the resources the person reads, the most used first |
| `PUT /api/v1/ext/connections/connections/{id}/thumbnail` | `edit` | uploads the thumbnail, the image as the body with its `Content-Type` |
| `DELETE /api/v1/ext/connections/connections/{id}/thumbnail` | `edit` | back to the generated thumbnail |
| `POST /api/v1/ext/connections/connections/{id}/test`, `GET .../{id}/contents` | `use` | test, contents |

The list page has the shape of the list page of the UI kit of Mosaikit (MK-105) and takes the same
inputs (facets, card, columns). The shell defines the elements of the kit only for the frontends that
run as modules, not in the frame of an isolated one, so `web/list.js` stays until the frame has them too.

## The detail of a connection

Clicking a card, or the name of a connection in its row, opens its detail (EXT-016): a panel over the
list, on the right edge of the area of the app and as high as it, so that the cards do not move. Its
header (thumbnail and name) and the facts of the connection (type, category, description, address,
owner, and its labels: type, category and free tags, added and removed there) stay in place while the pieces of the connection (EXT-019) scroll
under them; the actions on the connection (edit, test) stay at the bottom. Clicking the same card
again, clicking outside the panel, Escape or its close button close it; clicking another card shows
that card's detail. The open card, or row, is marked as selected and has `aria-current`, and the name
that opens it says whether the detail is expanded.

## Connectors

The framework knows no protocol. Each kind of source is a connector, an extension of its own
(`ext-catalog-connection-<source>`, or one of a product), which implements the contract `connector` of
the framework (MK-134 of Mosaikit) in a CDI bean: `Connector` of
`io.github.mosaikit.ext.catalog.connection.api.v1`, in the artifact
`io.github.mosaikit.ext:ext-catalog-connection-api`, a dependency of the connector that its build
copies into `lib/` as a library. The framework finds the connectors active in the organization each
time it needs them: installing a connector adds its type to New connection, without any change to the
framework.

```java
@ApplicationScoped
public class FilesConnector implements Connector {
    public String extension() { return "org.example.ext.catalog.connection.files"; }

    public Declaration declaration() {
        return new Declaration("files", "Files", Map.of("it", "File"), "files", "web/logo.svg", Map.of(
                "type", "object",
                "required", List.of("root"),
                "properties", Map.of("root", Map.of("type", "string", "title", "Root folder"))));
    }

    public TestResult test(ConnectionSettings settings) { ... }
    public Page<Piece> list(ConnectionSettings settings, String parent, Paging paging) { ... }
}
```

```yaml
# manifest.yaml of the connector
backend:
  jar: lib/ext-catalog-connection-files.jar
  api: catalog-connection-files          # required with Java code
contracts:
  implements:
    - contract: io.github.mosaikit.ext.catalog.connection/connector
      version: 1
      api: io.github.mosaikit.ext:ext-catalog-connection-api
```

- **The declaration**: the type (unique, kept with each connection), its title in English and in other
  languages, its category (`database`, `warehouse`, `lake`, `api`, `stream`, `files`, or one of its
  own), its logo (an SVG or PNG image of the package of the connector, served by the kernel) and the
  connection form, a JSON Schema of the settings of a connection (strings, numbers, integers and
  booleans, with titles, defaults and choices). The framework checks it at start and whenever it
  lists the connectors: a declaration that lacks a field, or has a wrong one, is refused with a
  problem naming the field, in the log of the installation, in `GET /api/v1/ext/connections/connectors`
  and in the app; the other connectors keep working.
- **The address of the source**, which a card shows when the connection has no description: the
  connector tells it from the settings with `address`, a default method of the contract, or the
  framework takes it from the usual settings (`url`, `uri`, `endpoint`, `address`, `baseUrl`,
  `server`, or `host` with `port` and `database`). It is kept with the connection when it is saved,
  and never carries a user or a password.
- **Credentials**: a connection names a credential that the administrators keep in Credentials (the
  secrets service of the platform); the framework reads it at the moment of a call and passes it in
  `ConnectionSettings`. The connector never keeps it, logs it or returns it, and no answer of the API
  of the framework contains it.
- **Contents** (EXT-019): every connector lists what a source holds in one shape, `Piece`: an id
  (unique and stable in the connection, passed back to list what a container holds, and kept by other
  extensions as their reference to the piece), a name, a kind (`schema`, `table`, `view`, `topic`,
  `endpoint`, `folder`, `file`, or one of its own), whether it is a container, and its **facts**, what
  the connector knows of it by name: `columns` (a list of `Column`, name and type), `geometry` (the
  columns that hold geometries), `format` (of messages or responses), or facts of its own. A source
  that cannot be listed throws `ContentsUnavailableException` with its reason: `UNREACHABLE` (with the
  error of the source), `NEEDS_DECLARATION` (the source does not describe its contents) or
  `NOT_READABLE` (a kind the connector cannot read yet, the default of `list`); a source with nothing
  in it is an empty page. `GET /api/v1/ext/connections/connections/{id}/contents?parent=<id>` answers
  `{parent, state, detail, items, more}`, with `state` `listed`, `empty`, `unreachable`,
  `needs-declaration` or `not-readable`, and the app shows each with its own message, never an empty
  list. Contents are read on the server, which reaches sources the browser cannot.
- **Uses** (EXT-019): what a piece can be used for comes from the extensions that consume data, never
  from the connector. Each contributes its uses to the point `catalog.connection.use` (version 1) of the
  frontend of the framework, with the kinds of pieces it takes and the facts it needs; the app offers
  on a piece the uses whose kinds include its kind and whose facts it has, while their extension is
  active:

  ```yaml
  # manifest.yaml of an extension that consumes data
  contributes:
    catalog.connection.use:
      - id: map
        title: Map
        description: The rows of a table on a map.
        kinds: [table, view]
        facts: [geometry]
        i18n:
          it: { title: Mappa, description: Le righe di una tabella su una mappa. }
  ```

- **Queries** (EXT-040): a connector of a source that takes queries, such as a SQL database, implements
  `query(settings, statement, limit)`, which returns `Rows` (columns, at most `limit` rows, and whether
  the source had more) and only reads; `POST /api/v1/ext/connections/connections/{id}/query` with
  `{statement, limit}` (100 by default, at most 1000) runs it. A connector without queries answers 501.
- **Removed or turned off**: the connections of a connector that is no longer active stay listed,
  unavailable, with the placeholder of the platform (MK-135), and work again when it comes back.
- **Versions**: version 1 of the contract is the package `api.v1`. A breaking change is a new package
  `api.v2` with `version = 2` next to it, served together (`versions: [1, 2]` in the manifest of the
  framework) until version 1 is retired.

`tests/fixtures/sample` is a complete small connector, `ext-catalog-connection-postgres` a real one.

## Build and test

Java 25, Maven and Node.js 24, from this folder:

```bash
mvn -f api/pom.xml install   # the API of the connectors, once and after each change of api/
mvn package    # target/ext-catalog-connection-0.1.0.zip, the package to install, and the connectors of the tests
mvn verify     # also the tests of tests/, on a Mosaikit installation started for them
npm test       # the same tests, after mvn package
npm run dev    # Mosaikit with this extension, until Ctrl+C
```

Until the first release of Mosaikit the extension follows its latest snapshot: the parent POM
`0.1.0-SNAPSHOT` and `@mosaikit/testing` (`mosaikit-testing-latest.tgz`) come from the pre-release
[`snapshot`](https://github.com/mosaikit/mosaikit/releases/tag/snapshot) of Mosaikit. npm downloads
the bench by itself; Maven needs the parent in the local repository once, either with
`mvn install` in a clone of Mosaikit or from the pre-release:

```bash
snapshot=https://github.com/mosaikit/mosaikit/releases/download/snapshot v=0.1.0-SNAPSHOT
for f in mosaikit-parent-$v.pom mosaikit-extension-parent-$v.pom mosaikit-kernel-api-$v.pom mosaikit-kernel-api-$v.jar; do
  curl -fsSLO "$snapshot/$f"
done
mvn -q install:install-file -Dfile=mosaikit-parent-$v.pom -DpomFile=mosaikit-parent-$v.pom -Dpackaging=pom
mvn -q install:install-file -Dfile=mosaikit-extension-parent-$v.pom -DpomFile=mosaikit-extension-parent-$v.pom -Dpackaging=pom
mvn -q install:install-file -Dfile=mosaikit-kernel-api-$v.jar -DpomFile=mosaikit-kernel-api-$v.pom
```

The CI does the same with the action `mosaikit/.github/actions/kernel-api`. Maven resolves the
dependencies of a project before any plugin of its build runs, so the API of the connectors is
installed apart, before the framework is built.
`MOSAIKIT_INSTALLATION=<mosaikit>/target/dist/mosaikit` tests against a build of Mosaikit.
