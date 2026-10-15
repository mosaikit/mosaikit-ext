# Changelog of ext-catalog-connection

All notable changes of this extension, which is versioned and released on its own from tags
`ext-catalog-connection/vX.Y.Z` (ADR-0001). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- All connections of an organization in one list, filtered by type (EXT-011): a grid of cards with
  rows next to it, the Type filter computed from the connections with their numbers, and a thumbnail
  for each connection, uploaded or generated from its name.
- Every connection has an owner and a description (EXT-015): connections are resources of the
  platform (MK-054), owned by the person who creates them and shared with the dialog of the platform;
  the forms of creation and edit have a description under the name, and the card shows the
  description or the address of the source, which a connector tells with the new default method
  `Connector.address` of version 1 of the contract. Connections are changed with
  `PUT /api/v1/ext/connections/connections/{id}`.

- Connectors are extensions, discovered by the framework (EXT-010): the contract `connector`
  version 1, in the artifact `ext-catalog-connection-api`, with which a connector declares its type,
  title, logo, category and connection form, tests a connection and lists its contents. The app lists
  the connections of the organization and creates new ones with the form of the connector; a connector
  whose declaration lacks a field is refused naming it, and the connections of a connector that is no
  longer active stay listed as unavailable until it comes back.
- The folder builds and tests alone on the parent of Mosaikit extensions and the bench of
  `@mosaikit/testing`: manifest, an app page in English and Italian, and its first test (EXT-102).
