# Changelog of ext-catalog-connection-postgres

All notable changes of this extension, which is versioned and released on its own from tags
`ext-catalog-connection-postgres/vX.Y.Z` (ADR-0001). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- PostgreSQL connect through this connector (EXT-040): New connection offers a PostgreSQL database
  with its form (host, port, database, user, SSL mode), the password being a credential of the secrets
  service; the connection test shows the version of the server and a preview of its tables, or the
  error of the server; the contents are the schemas and the tables, views, materialized views and
  foreign tables the user may read, with their columns and the columns of geometries (EXT-019); queries
  run in a read-only transaction, capped at the row limit.
