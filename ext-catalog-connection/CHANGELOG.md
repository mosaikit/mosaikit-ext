# Changelog of ext-catalog-connection

All notable changes of this extension, which is versioned and released on its own from tags
`ext-catalog-connection/vX.Y.Z` (ADR-0001). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- One source picker for the editors of every extension (EXT-026): the element
  `mosaikit-ext-catalog-connection-picker`, the view of the connections in a dialog, limited to the
  uses that the opening extension contributes to `catalog.connection.use`, with single and multiple
  choice; it returns references by id, which `POST /api/v1/ext/connections/references/resolve` gives
  as they are now. Connectors may declare the kinds of their pieces with the new default method
  `Connector.kinds` of version 1 of the contract (`kinds` in `GET .../connectors`), connections say
  whether the person uses them (`usable`), and the column of filters is resized by dragging or with
  the keyboard.
- All connections of an organization in one list, filtered by type (EXT-011): a grid of cards with
  rows next to it, the Type filter computed from the connections with their numbers, and a thumbnail
  for each connection, uploaded or generated from its name.
- Every connection has an owner and a description (EXT-015): connections are resources of the
  platform (MK-054), owned by the person who creates them and shared with the dialog of the platform;
  the forms of creation and edit have a description under the name, and the card shows the
  description or the address of the source, which a connector tells with the new default method
  `Connector.address` of version 1 of the contract. Connections are changed with
  `PUT /api/v1/ext/connections/connections/{id}`.

- Every connection lists its contents in one shape, with what each piece can be used for (EXT-019):
  version 1 of the contract lists `Piece`s (id, name, kind, container, facts such as `columns` and
  `geometry`) instead of entries with a path, and tells an unreachable source, one that needs a
  declaration and a kind not yet readable apart with `ContentsUnavailableException`; the contents API
  answers a state for each, and an empty source, which the app shows with four different messages. The
  extensions that consume data contribute their uses of pieces to the point `catalog.connection.use`,
  with the kinds and facts they need, and the app shows on each piece the uses it allows.
- Connection cards with selection, size, freshness, status, owner and commands (EXT-014): a
  selection box counted in the header, the pieces at the top level of the source and its state as last
  tested or listed (migration V3, fields `updated`, `pieces`, `morePieces`, `state` and `checked` of a
  connection), the last update, and a header with the order (most recent first, or by name).
- Adding a connection takes three steps (EXT-013): the types grouped by category with their logos; the
  form of the connector, whose test previews the source (`POST /api/v1/ext/connections/connections/preview`)
  or shows its error; the name proposed, the type fixed, description, thumbnail and tags, which
  `POST /api/v1/ext/connections/connections` now takes.
- Connections carry a type, a category and free tags (EXT-012): the card and the detail show the type
  of the connector, which cannot be removed, its category, and the free tags kept by the kernel (MK-097),
  written and removed in the detail with suggestions of the tags in use; a Tags filter next to the Type
  one, a type and a tag giving the intersection and two tags the union.
  `PUT /api/v1/ext/connections/connections/{id}/tags` and `GET /api/v1/ext/connections/tags`.
- The detail of a connection opens as a panel over the list (EXT-016): on the right edge of the app,
  without moving the cards, with the facts of the connection fixed while its pieces scroll and its
  actions (edit, test) at the bottom; the open card is marked and has `aria-current`, and the panel
  closes from the same card, a click outside it, Escape or its close button.
- Queries on connections (EXT-040): `Connector.query` returns the rows of a query capped at the row
  limit, through `POST /api/v1/ext/connections/connections/{id}/query`.
- Connectors are extensions, discovered by the framework (EXT-010): the contract `connector`
  version 1, in the artifact `ext-catalog-connection-api`, with which a connector declares its type,
  title, logo, category and connection form, tests a connection and lists its contents. The app lists
  the connections of the organization and creates new ones with the form of the connector; a connector
  whose declaration lacks a field is refused naming it, and the connections of a connector that is no
  longer active stay listed as unavailable until it comes back.
- The folder builds and tests alone on the parent of Mosaikit extensions and the bench of
  `@mosaikit/testing`: manifest, an app page in English and Italian, and its first test (EXT-102).
