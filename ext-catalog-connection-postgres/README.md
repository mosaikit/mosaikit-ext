# ext-catalog-connection-postgres

Manifest id `io.github.mosaikit.ext.catalog.connection.postgres`, package `io.github.mosaikit.ext:ext-catalog-connection-postgres`.

The connector to PostgreSQL: one connector of `ext-catalog-connection`, which it requires, discovered by
the framework through its contract `connector` (EXT-010). Installed, it adds PostgreSQL to New
connection; removed, its connections stay listed as unavailable until it comes back (MK-135).

This folder holds everything of the extension and refers to nothing outside it (ADR-0001 of this
repository): it is a project of its own, built and tested like an extension of a third party, only
against what Mosaikit and the connection framework publish. Its requirements are in
[`docs/requirements/`](docs/requirements/), one `EXT-nnn.md` each, and its changes in
[`CHANGELOG.md`](CHANGELOG.md).

## What it does

- **Connection form**: host, port (5432), database, user and SSL mode (`disable`, `allow`, `prefer`,
  `require`, `verify-ca`, `verify-full`; `prefer` by default). The password of the user is the
  credential of the connection: the administrators keep it in Credentials (the secrets service of
  the platform), the framework reads it at each call and passes it to the connector, which puts it in
  the JDBC connection and nowhere else.
- **Test connection**: the version of the server and the first tables and views the user may read, or
  the error of the server as it says it (`password authentication failed for user …`,
  `database … does not exist`, `Connection to … refused`).
- **Contents** (EXT-019): the schemas the user may use, then the tables, views, materialized views
  and foreign tables of a schema that the user may read, each with the fact `columns` (name and type
  of each column); a column of type `geometry` or `geography` (PostGIS) is also in the fact
  `geometry`, so that a use that needs geometries is offered on its table. The id of a schema is its
  name, the one of a table `schema/table` (`%` and `/` in a name are written `%25` and `%2F`).
- **Queries**: `POST /api/v1/ext/connections/connections/{id}/query` of the framework, with the
  statement and the row limit; the connector runs it in a read-only transaction, which it rolls back,
  with a timeout of 60 seconds.

The JDBC driver is `org.postgresql:postgresql`, a library of the kernel: the parent POM gives it scope
`provided`, so the package does not carry it and the connector runs on the version of the kernel
(MK-131). The library of the extension is the API of the contract, `ext-catalog-connection-api`.

| Path | Content |
|---|---|
| `manifest.yaml` | identity, the framework it requires, the backend and the contract it implements |
| `src/main/java/` | `PostgresConnector`, the implementation of the contract |
| `web/logo.svg` | the logo shown in New connection |
| `pom.xml` | the build, on the parent of Mosaikit extensions `io.github.mosaikit:mosaikit-extension-parent` |
| `package.json`, `playwright.config.ts`, `tests/` | the bench of `@mosaikit/testing` and the Playwright tests, on an embedded PostgreSQL |
| `docs/requirements/` | the requirements of this extension |

## Build and test

Java 25, Maven and Node.js 24, from this folder:

```bash
mvn package    # target/ext-catalog-connection-postgres-0.1.0.zip, and the framework in target/required/
mvn verify     # also the tests of tests/, on a Mosaikit installation started for them
npm test       # the same tests, after mvn package
npm run dev    # Mosaikit with this connector and the framework, until Ctrl+C
```

The tests start an embedded PostgreSQL (the one of the bench, no Docker) with a database to connect to
and the database of the installation, then Mosaikit on it with this connector and the connection
framework.

Maven needs, in the local repository, the parent of Mosaikit extensions (see the README of
`ext-catalog-connection` or of Mosaikit), the API of the connectors
`io.github.mosaikit.ext:ext-catalog-connection-api` and the package of the framework
`io.github.mosaikit.ext:ext-catalog-connection` of type `zip`, which the tests install: the connector
`requires` it (manifest.yaml). Until the framework is released, put them there from a build of
`ext-catalog-connection` (its folder, or its repository) before building the connector; the CI does
the same:

```bash
# in ext-catalog-connection
mvn -f api/pom.xml install
mvn package -DskipTests -Dinvoker.skip
mvn install:install-file -Dfile=target/ext-catalog-connection-0.1.0.zip \
  -DgroupId=io.github.mosaikit.ext -DartifactId=ext-catalog-connection -Dversion=0.1.0 -Dpackaging=zip
```

`MOSAIKIT_INSTALLATION=<mosaikit>/target/dist/mosaikit` tests against a build of Mosaikit.
