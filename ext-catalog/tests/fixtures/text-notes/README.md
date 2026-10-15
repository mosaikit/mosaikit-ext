# Text notes (fixture)

A fixture of the tests of the catalog (EXT-105, EXT-106, EXT-107): an extension that adds the kind
"text note" to the file manager through the contract `io.github.mosaikit.ext.catalog/file-kind`
version 1, as an extension of a product adds its own kinds of files.

- **Server** (`src/main/java`): `TextNoteKind` recognizes `*.note`, `text/x-note` or a text that starts
  with `NOTE:`; on each change it reads the note through the catalog, records the state `counted`
  (with the number of words) or `empty`, and keeps what it was told, which the tests read at
  `GET /api/v1/ext/text-notes/events`. `POST /api/v1/ext/text-notes/notes/{id}/count` is the action
  Count words, through the bean `CatalogFiles` of the catalog. When a note is stored, replaced or found
  again, the kind also asks for a signed link to its content and reads it over HTTP in its job, as a
  process that loads files elsewhere would (EXT-107); the events give the link and what it read, and
  `GET /api/v1/ext/text-notes/storage` the storage the organization uses.
- **Frontend** (`web/`): the icon, the preview `example-text-note-preview` and the action
  `example-text-note-count`, contributed to the point `catalog.file-kind` of the catalog, and an app
  (`/app/text-notes`), which the tests turn off in the organization to make the kind absent (EXT-106).

`mvn -f ../../../api install` once, then `mvn package`: `target/fixture-text-notes-0.1.0.zip`, which
the tests of the catalog install next to it.
