# Text notes (fixture)

A fixture of the tests of the catalog (EXT-105): an extension that adds the kind "text note" to the
file manager through the contract `io.github.mosaikit.ext.catalog/file-kind` version 1, as an
extension of a product adds its own kinds of files.

- **Server** (`src/main/java`): `TextNoteKind` recognizes `*.note`, `text/x-note` or a text that starts
  with `NOTE:`; on each change it reads the note through the catalog, records the state `counted`
  (with the number of words) or `empty`, and keeps what it was told, which the tests read at
  `GET /api/v1/ext/text-notes/events`. `POST /api/v1/ext/text-notes/notes/{id}/count` is the action
  Count words, through the bean `CatalogFiles` of the catalog.
- **Frontend** (`web/`): the icon, the preview `example-text-note-preview` and the action
  `example-text-note-count`, contributed to the point `catalog.file-kind` of the catalog.

`mvn -f ../../../api install` once, then `mvn package`: `target/fixture-text-notes-0.1.0.zip`, which
the tests of the catalog install next to it.
