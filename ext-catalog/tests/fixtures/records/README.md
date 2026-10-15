# Records (fixture)

A fixture of the tests of the catalog (EXT-006): an extension whose resources, records, take documents
of the catalog through its contract `io.github.mosaikit.ext.catalog/linked-documents` version 1, as an
extension of connections or dashboards takes reports and acts.

- **Server** (`src/main/java`): `RecordsResource` keeps records in memory and registers each one with
  the platform (`GET`/`POST /api/v1/ext/records/records`, `GET`/`DELETE …/records/{id}`), so that they
  are shared in its dialog; `RecordDocuments` implements `LinkedDocuments`: documents are linked to a
  record by those who edit it.
- **Frontend** (`web/`): an app (`/app/records`) that lists and creates records; the sheet of a record
  (`/app/records?record=<id>`) shows its documents with the element `mosaikit-ext-catalog-documents` of
  the catalog while the catalog is active. The tests turn the app off in the organization to make the
  extension absent (MK-133), and the sheet of a document then shows the placeholder of the platform for
  the record (MK-135).

`mvn -f ../../../api install` once, then `mvn package`: `target/fixture-records-0.1.0.zip`, which the
tests of the catalog install next to it.
