# ext-catalog

Manifest id `io.github.mosaikit.ext.catalog`, package `io.github.mosaikit.ext:ext-catalog`.

The file manager of an organization: folders, sub-folders, upload, move, rename and sharing, stored through the file service of the kernel (filesystem in the portable distribution, S3 on a server).

This folder holds everything of the extension and refers to nothing outside it (ADR-0001 of this
repository): it is a project of its own, built and tested like an extension of a third party, only
against what Mosaikit publishes. Its requirements are in [`docs/requirements/`](docs/requirements/),
one `EXT-nnn.md` each, and its changes in [`CHANGELOG.md`](CHANGELOG.md).

| Path | Content |
|---|---|
| `manifest.yaml` | identity, backend, schema, resource types, frontend and contributions of the extension |
| `src/main/java/` | the backend: the REST API under `/api/v1/ext/catalog` and the tree of folders and files |
| `db/` | the migrations of the schema `ext_catalog`: the tree (`V1`), kinds of files (`V3`), links of documents to resources of other extensions and the index of the search (`V5`); `V2` kept downloads and pending removals for jobs, which `V4` drops |
| `api/` | `io.github.mosaikit.ext:ext-catalog-api`, the contracts that other extensions implement (EXT-105, EXT-107, EXT-006): a library of the catalog and of those extensions |
| `web/index.js` | the app, a custom element the shell renders at `/app/catalog`; `web/drop.js` reads what is dropped or chosen, `web/zip.js` writes the archive of a download |
| `web/i18n.js` | the texts of the app in English and Italian, chosen by `context.locale` |
| `pom.xml` | the build, on the parent of Mosaikit extensions `io.github.mosaikit:mosaikit-extension-parent` |
| `src/test/java/` | the unit tests of the backend |
| `package.json`, `playwright.config.ts`, `tests/` | the bench of `@mosaikit/testing` and the Playwright tests |
| `tests/fixtures/text-notes/` | an extension that adds the kind "text note" through the contract, installed with the catalog by the tests |
| `tests/fixtures/records/` | an extension whose records take documents through the contract `linked-documents` (EXT-006), installed with the catalog by the tests |
| `docs/requirements/` | the requirements of this extension |

## Folders and files

Folders and files are the items of one table of the schema `ext_catalog`: each is in at most one
parent folder (none at the root) and is a resource of the kernel (MK-054), of type `folder` or
`file`, registered with its parent, so the sharing dialog, search and audit of the platform apply to
it. The kernel keeps its owner and its grants, at the levels `read`, `edit` and `manage`; the catalog
adds that a level on a folder counts on everything it holds, at any depth. The content of a file goes
to the file service of the kernel (MK-041); the table keeps its name, size and type.

The app shows the folders the person reads as a tree on the left, the content of the open folder in
the middle (folders first, then files, with name, size, owner, last change and sharing state,
sorted by name or by date) and its path as breadcrumbs above it. A folder opens at
`/app/catalog?folder=<id>`; a folder the person cannot read answers not found, exactly like one that
does not exist.

| Request | What it does |
|---|---|
| `GET /api/v1/ext/catalog/folders` | the root of the person: the items at the root of the organization that they read |
| `GET /api/v1/ext/catalog/shared` | Shared with me: what someone else shared with the person, a group of theirs or the organization, outside the folders they read; same `sort` and `order` |
| `GET /api/v1/ext/catalog/items/{id}/access` | who has access to a folder or a file and through which share, the `level` of the person and `canShare`; `404` when the person cannot read it |
| `GET /api/v1/ext/catalog/folders/{id}` | a folder with its `path`, the `level` of the person, `canCreate` and its `items`; `404` when it does not exist or the person cannot read it |
| `?sort=name\|changed&order=asc\|desc` | the order of the items, folders first: by name ascending, or by date newest first, by default |
| `POST /api/v1/ext/catalog/folders` | creates a folder, `{ "name", "parent" }`: at the root for the members of the organization, in a folder with the level `edit`; `409` when the folder already holds an item of that name, in any case |
| `POST /api/v1/ext/catalog/folders/{id}/files?name=<name>` | stores the body as a file of the folder, with its `Content-Type`, through the file service of the kernel; `403` when it does not fit the storage of the organization |
| `POST /api/v1/ext/catalog/uploads/check` | `{ "folder", "bytes" }`: `204` when an upload of that size may start in the folder, `403 Quota exceeded` naming the limit otherwise (MK-076) |
| `POST /api/v1/ext/catalog/items/{id}/rename` | `{ "name" }`, with the level edit; `409` naming the item that already has the name in the folder (member `existing`: `id`, `kind`, `name`) |
| `POST /api/v1/ext/catalog/items/{id}/move` | `{ "parent" }`, a folder where the person has the level edit, or `null` for the root; the item keeps its identifier and its own shares; `409` for a name taken there, or a folder moved into itself |
| `GET /api/v1/ext/catalog/items/{id}/summary` | `{ "items", "bytes" }`: what a folder holds at any depth, for the confirmation of a delete |
| `DELETE /api/v1/ext/catalog/items/{id}` | deletes the item and everything it holds, with the level edit, from the catalog and from the file service |
| `POST /api/v1/ext/catalog/downloads` | `{ "items", "name"?, "validFor"? }`: one file, or the entries of an archive (`path`, and `url` for a file), each with a signed link of the kernel made for the person, valid `validFor` seconds (300 unless given, at most 3600), and `expires` |
| `PUT /api/v1/ext/catalog/items/{id}/content` | replaces the content of a file with the body and its `Content-Type`, with the level edit, also through a folder above it (MK-136); the file keeps its identifier, name, folder and shares |
| `GET /api/v1/ext/catalog/files/{id}` | the sheet of a file (EXT-006): `file` as a list shows it, `path` (the folders above it that the person reads) and `links`, the resources of other extensions it is linked to; `404` for a folder or a file the person cannot read |
| `GET /api/v1/ext/catalog/search?q=&tsquery=&kind=&offset=&limit=` | folders and files whose name has words starting with the words of `q`, best first, only those the person reads (EXT-006): `{ results: [{ title, detail, link, resource: { type, id } }], more }`; `kind=file` or `folder` for only those; `limit` at most 50 |
| `GET /api/v1/ext/catalog/links?extension=&type=&id=` | the documents linked to a resource of another extension that the person reads, and `canLink`; `404` when they cannot read the resource or its extension is absent |
| `POST /api/v1/ext/catalog/links` | `{ "file", "resource": { "extension", "type", "id" } }`: links a file the person reads to a resource they read, when its extension lets them (`403` otherwise); `201`, or `200` with the link already there |
| `DELETE /api/v1/ext/catalog/links/{id}` | removes a link, for those who edit the document or whom the extension of the resource lets link documents to it |

A file in a list also has its `contentType` and `fileKind`: `{ "extension", "name", "state",
"stateDetail" }` when an extension active in the organization recognized it (EXT-105), `null`
otherwise.

## Upload, download, move, rename, delete

The gestures of a file manager, the same in the list, in the tree and by keyboard (EXT-002):

- **Upload.** Files and folders dropped from the computer onto a folder of the list or of the tree,
  or onto the open folder, or chosen with *Upload files* and *Upload folder*, are uploaded with the
  structure of their folders; a folder that is already there takes the new files. The app asks
  `uploads/check` with the size of everything first, and uploads nothing when it does not fit the
  quota of the organization, naming the limit. Each file has its line in *Uploads*, with its
  progress: waiting, uploading, uploaded or not, with the reason.
- **Move.** Items dragged onto a folder of the list or of the tree, *Move* with a folder chosen in its
  dialog, or Ctrl+X on a row then Ctrl+V on a folder (of the list or of the tree) or in the open folder.
- **Rename.** *Rename*, or F2 on a row or on a folder of the tree; a name used in the folder, in any
  case, is refused naming the item that has it.
- **Delete.** *Delete*, or the Delete key on a row or on a folder of the tree, after a confirmation
  that says how many items the folders hold.
- **Download.** A click on a file downloads it with its name; the items selected (with their boxes,
  also by Space) are downloaded with *Download* as one ZIP archive that keeps the structure of their
  folders, empty ones too.

## Storage

The extension keeps no content of its own (EXT-004). The content of each file goes to the file
service of the kernel (MK-041), attached to the resource of the file, which writes it under
`<organization>/<extension>/<file>` of its store: the directory `mosaikit.files.directory` in the
portable distribution (`data/files`), and on a server the S3-compatible bucket that the installation
configures, with no change in the extension:

```properties
mosaikit.files.store=s3
mosaikit.files.s3.endpoint=https://s3.example.org
mosaikit.files.s3.bucket=mosaikit-files
mosaikit.files.s3.path-style=true
mosaikit.files.s3.access-key-id=mosaikit
# from a secret: MOSAIKIT_FILES_S3_SECRET_ACCESS_KEY
```

(see the administration guide of Mosaikit). The tests run on the portable store of the bench; the
kernel serves both stores through the same `FileStorage`, which is all the extension uses.

A file is downloaded only through a signed, expiring link of the kernel (MK-093), which the app
fetches without the session of the person; an expired or altered link answers 404. The archive of
several items is written by the app from the links of their files. The kernel makes the links, and
deletes a content, for the person in the request, also when they reach the file only through a folder
above it (MK-136); a link carries their rights, so revoking their share stops it at its next use. A
file deleted from the catalog leaves the store in the same transaction, its content before its
resource, so that a content is never left without the sharing that protects it.

When a platform administrator deletes the organization (MK-130), its people lose access at once and
its signed links answer not found; the extension, told by the event `organization.deleted`, has
nothing outside the kernel to release and destroys nothing. The kernel keeps the rows of the catalog and the content of
its files for the retention of the installation (`mosaikit.organizations.removal-retention`, so that
the deletion can be undone), then removes the rows of `ext_catalog`, which all carry
`organization_id`, and the files from the store.

## Sharing

A folder or a file is shared in the sharing dialog of the platform (MK-055), with a person, a group,
the whole organization or a link, at the levels `read`, `edit` and `manage`; the app opens it with
the Share button of who has access. A share on a folder counts on everything the folder holds, at any
depth, also on what is added to it later: the types `folder` and `file` declare `inherits: parent`
(MK-136), so the kernel answers every level with the folders above, and a share that is removed
stops counting at the next request of the person.

Next to the files of the organization each person has **Shared with me**
(`/app/catalog?view=shared`): the folders and files that someone else shared with them, a group of
theirs or the organization and that are not inside a folder they read already. A shared folder opens
with everything it holds; a file shared alone shows nothing else of its folder.

Below the content of the open folder, or for the item whose sharing state is chosen in the list, the
app shows **who has access** and through which share: the owner and the grants of the item itself,
then those of each folder above it that the person reads, with the folder they come from. The
administrators of the organization reach everything and are not listed.

Since the kernel passes the levels of a folder to what it holds, the catalog, the sharing dialog, the
file service and its signed links agree: a person with `manage` on a folder shares what it
holds (`canShare`), and one who reads a folder reads and downloads its files. The grants that come
from the folders above are the kernel's (`Sharing.inheritedGrants`); who has access names only the
folders above that the person reads.

The dialog also makes links, which the access lists with their expiry; the catalog does not yet
contribute the page that shows a folder or a file opened through a link (`shared.view`).

## Kinds of files

Other extensions add kinds of files to the file manager (EXT-105), such as a table, an image or a
dataset that a product understands, through the contract `io.github.mosaikit.ext.catalog/file-kind`
version 1 (MK-134). The files stay files of the organization, with their content in the file
service of the kernel: without the extension, the catalog keeps their kind and state, works on them as
on any other file and shows the placeholder of the platform for the kind (EXT-106), and when it comes
back they are of its kind again.

**On the server.** The extension depends on `io.github.mosaikit.ext:ext-catalog-api` (built from
[`api/`](api/)), which its build copies into its `lib/` and lists among its libraries, declares the
contract in its manifest, and implements `io.github.mosaikit.ext.catalog.api.v1.FileKind` in an
`@ApplicationScoped` bean, one per kind:

```yaml
optional:
  io.github.mosaikit.ext.catalog: '>=0.1 <1'
contracts:
  implements:
    - contract: io.github.mosaikit.ext.catalog/file-kind
      version: 1
      api: io.github.mosaikit.ext:ext-catalog-api
```

```java
@ApplicationScoped
public class DatasetKind implements FileKind {
    public String extension() { return "org.example.datasets"; }
    public String name() { return "dataset"; }            // known as org.example.datasets/dataset

    public boolean recognizes(FileSample sample) {          // name, media type, first 4096 bytes
        return sample.extension().equals("csv") || sample.isOfType("text/csv");
    }

    public void changed(FileEvent event) {                  // in a job of the organization
        if (event.change() == Change.STORED || event.change() == Change.REPLACED) {
            try (InputStream content = event.file().open()) {
                load(event.file().id(), content);
                event.file().record(FileState.of("loaded"));
            } catch (IOException | RuntimeException e) {
                event.file().record(FileState.of("failed", e.getMessage()));
            }
        } else if (event.change() == Change.DELETED) {
            unload(event.file().id());
        }
    }
}
```

- **Recognized.** When a person stores a file, or replaces its content, the catalog asks the kinds of
  the extensions active in the organization, in the order of the extensions; the first that
  recognizes it is its kind, kept on the file. When an extension becomes active in an organization
  (installed, installed again, updated or turned on), its kinds look at the files that no kind
  recognized yet. A kind that fails counts as one that does not recognize the file.
- **Told.** The kind is told, in a job of the organization a few seconds after the change commits,
  at least once (MK-085), when its file is `STORED`, `REPLACED`, `RENAMED`, `MOVED` (alone or with a
  folder above it), `DELETED` (also when a new content is no longer of its kind), `SHARING_CHANGED`
  (a share of it or of a folder above it granted, changed or revoked), and `RECOGNIZED` when its
  extension becomes active, for the files it recognizes then and those it knew. `event.file()` gives
  the file, its folder and path, and `open()` reads its content through the catalog, since the file
  service of the kernel keeps it under the catalog; `event.details()` says more, such as the previous
  name or folder, or the share. An exception makes the catalog tell it again later.
- **State.** `record(FileState.of("loaded"))`, or `FileState.of("failed", "why")`, keeps a state on
  the file, which the catalog shows in the list and in its detail. For work that ends after the event,
  or for a request of the extension, the bean `CatalogFiles` of the catalog finds a file of its kinds
  (`Instance<CatalogFiles>`, since the catalog may be absent), with the same `open()`, `link()` and
  `record()`.
- **Content without a copy** (EXT-107, `ext-catalog-api` 1.1.0). `event.file().link(validity)` gives a
  signed, expiring link of the platform to the content (MK-093), for work that goes on outside the
  event or the request of a person, such as a process that loads the file into a database or a tile
  store: it downloads the content over HTTP, without a session, with ranges, at the address of the
  installation (`mosaikit.public-url`) followed by `link.path()`, for at most
  `mosaikit.files.link-max-validity` (7 days unless set). The link names the content the file has: it
  stops working when the file is deleted or replaced, and the kind, told `REPLACED`, takes a new one.
  So the extension keeps links, not copies, and a file counts once against the storage of the
  organization. Made in a job, the link serves the content until it expires; made in a request of a
  person, it carries their rights. A catalog older than 1.1.0 answers `UnsupportedOperationException`.

```java
public void changed(FileEvent event) {                     // in a job of the organization
    switch (event.change()) {
        case STORED, REPLACED, RECOGNIZED -> {
            SignedLink link = event.file().link(Duration.ofHours(2));
            loader.submit(event.file().id(), publicUrl + link.path()); // the loader reads it over HTTP
            event.file().record(FileState.of("loading"));
        }
        case DELETED -> loader.drop(event.file().id());
        default -> { }
    }
}
```

**In the frontend.** The extension contributes its icon, preview, states and actions to the point
`catalog.file-kind` (version 1, whose JSON Schema is in [`manifest.yaml`](manifest.yaml)):

```yaml
contributes:
  catalog.file-kind:
    - id: dataset
      kind: dataset                      # FileKind.name()
      title: Dataset
      icon: web/dataset.svg              # an image of the package of the extension
      preview: example-dataset-preview   # a custom element of its frontend
      states: { loaded: Loaded, failed: Failed }
      actions:
        - { id: publish, title: Publish, element: example-dataset-publish }
      i18n:
        it: { title: Insieme di dati, state.loaded: Caricato, state.failed: Non caricato, action.publish: Pubblica }
```

A file of the kind shows the icon, the title and the state in the list, with its actions; *Details*
shows what it is, its state with its detail, the preview element and the actions.

**Absent.** While the extension is not active in the organization (not installed, not able to run, or
its apps turned off, MK-133), its files keep their kind and state (`fileKind.active` is `false` in the
lists), and the list and *Details* show in place of the kind, its preview and its actions the
placeholder of the platform (`mk-reference-placeholder`, MK-135): which kind is missing and, to
administrators, which extension to install or turn on, as the kernel answers for the kind as a
reference to its extension (`{extension, type: 'file-kind', id: <kind>}`). Download, move, rename,
share, replace and delete work as on any other file (EXT-106). When the extension comes or goes, the
open page shows its files again without a reload; the kind is told `RECOGNIZED` for its files when it
comes back. The preview and
each action are custom elements of the extension, which the catalog creates with the property
`file`: `{ id, name, contentType, size, fileKind, url() }`, `url()` resolving to a signed, expiring
link to its content (EXT-004). An action opens in a dialog; when it changed the file, it dispatches
`catalog-file-changed` (bubbling, composed), and the catalog shows the file again.

[`tests/fixtures/text-notes`](tests/fixtures/text-notes) is a complete example, which the tests
install with the catalog; its app lets the tests turn it off in the organization.

## Documents and their links

A file has its **sheet** at `/app/catalog?file=<id>`, where the platform opens it from its search and
its registry (EXT-006): what it is, its folder, owner and last change, who has access, *Download*
(through a signed, expiring link, EXT-004) and the resources of other extensions it is linked to. The
detail of a file in a list shows the same links, and its name opens the sheet.

**Search.** The catalog is a provider of the search of the platform (point `search.provider`, MK-040):
the platform calls `GET /api/v1/ext/catalog/search` as the person, and the catalog searches the words
of the names of folders and files with the full-text search of PostgreSQL, keeping in the same query
only what the person reads, also through a folder above it (`mk_kernel.allows`, MK-136). Each result
names its item as a resource, which the platform checks again.

**Linked to resources of other extensions.** A report next to the connection it describes, an act next
to the dashboard it explains: other extensions take documents on their resources through the contract
`io.github.mosaikit.ext.catalog/linked-documents` version 1 (`ext-catalog-api` 1.2.0). The extension
declares the contract and implements `LinkedDocuments` in an `@ApplicationScoped` bean: the types of its
resources that take documents, and whether the person of the request may link documents to one of them
(and remove the links), such as one who edits it.

```yaml
optional:
  io.github.mosaikit.ext.catalog: '>=0.1 <1'
contracts:
  implements:
    - contract: io.github.mosaikit.ext.catalog/linked-documents
      version: 1
      api: io.github.mosaikit.ext:ext-catalog-api
```

```java
@ApplicationScoped
public class ConnectionDocuments implements LinkedDocuments {
    @Inject Sharing sharing;
    public String extension() { return "org.example.connections"; }
    public Set<String> types() { return Set.of("connection"); }
    public boolean mayLink(String type, String id) {
        return sharing.allows(new ResourceRef(extension(), type, id), "edit");
    }
}
```

The catalog keeps each link as the reference by which the extension registered the resource with the
platform (MK-054). It links a document when the person reads it and the resource, and the extension,
active in the organization, lets them; it lists the documents of a resource to those who read the
resource, each document only to those who read it. On the sheet of the resource, the frontend of the
extension shows them with the element `mosaikit-ext-catalog-documents` that the catalog defines (for
frontends loaded as modules, while the catalog is active, `context.extensions.isActive`): given the
resource in its property `resource` and its name in the attribute `label`, it lists the documents, each
opening its sheet and with *Download*, and to those who may, *Link a document* (found by name) and
*Remove link*.

```js
const documents = document.createElement('mosaikit-ext-catalog-documents');
documents.setAttribute('label', connection.title);
documents.resource = { extension: 'org.example.connections', type: 'connection', id: connection.id };
sheet.append(documents);
```

On the sheet of the document, the kernel resolves each linked resource for the person (MK-135): its
title, which opens it, or, while its extension is not installed, not able to run or turned off, the
placeholder of the platform (`mk-reference-placeholder`), which tells administrators which extension to
install or turn on. The link stays, and the sheet shows the resource again without a reload when the
extension comes back. A link goes with its document; a link to a resource that is gone stays, shown as
not available. [`tests/fixtures/records`](tests/fixtures/records) is a complete example.

## Build and test

Java 25, Maven and Node.js 24, from this folder:

```bash
mvn -f api install   # the API of the contracts of the catalog, first (EXT-105)
mvn package    # target/ext-catalog-0.1.0.zip, the package to install, and the fixtures of the tests
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
dependencies of a project before any plugin of its build runs, so the API of the contracts is
installed apart, before the catalog is built; the fixtures of `tests/fixtures/` are built by
`mvn package` after the catalog (maven-invoker), and `-Dinvoker.skip` leaves them out.
`MOSAIKIT_INSTALLATION=<mosaikit>/target/dist/mosaikit` tests against a build of Mosaikit.
The kinds of files (EXT-105) need the contracts between extensions of Mosaikit (MK-134): until they
are in its snapshot, build Mosaikit from the branch that brings them and test with
`MOSAIKIT_INSTALLATION` and its packed `@mosaikit/testing`.
