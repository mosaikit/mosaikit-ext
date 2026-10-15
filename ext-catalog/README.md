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
| `db/` | the migrations of the schema `ext_catalog`: the tree (`V1`), downloads and pending removals (`V2`), kinds of files (`V3`) |
| `api/` | `io.github.mosaikit.ext:ext-catalog-api`, the contracts that other extensions implement (EXT-105): a library of the catalog and of those extensions |
| `web/index.js` | the app, a custom element the shell renders at `/app/catalog`; `web/drop.js` reads what is dropped or chosen, `web/zip.js` writes the archive of a download |
| `web/i18n.js` | the texts of the app in English and Italian, chosen by `context.locale` |
| `pom.xml` | the build, on the parent of Mosaikit extensions `io.github.mosaikit:mosaikit-extension-parent` |
| `src/test/java/` | the unit tests of the backend |
| `package.json`, `playwright.config.ts`, `tests/` | the bench of `@mosaikit/testing` and the Playwright tests |
| `tests/fixtures/text-notes/` | an extension that adds the kind "text note" through the contract, installed with the catalog by the tests |
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
| `POST /api/v1/ext/catalog/downloads` | `{ "items", "name"?, "validFor"? }`: one file, or the entries of an archive (`path`, and `url` for a file), each with a signed link of the kernel valid `validFor` seconds (300 unless given, at most 3600); `200` when ready, `202` while a job makes the links |
| `GET /api/v1/ext/catalog/downloads/{id}` | a download of the person, `pending` until its links are made, then `ready` |
| `PUT /api/v1/ext/catalog/items/{id}/content` | replaces the content of a file with the body and its `Content-Type`, with the level edit on the file itself; the file keeps its identifier, name, folder and shares |

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
several items is written by the app from the links of their files. A file deleted from the catalog
leaves the store, and when the organization is deleted the extension deletes the content of all its
files (on the event `organization.deleted`, which the kernel raises once it can delete organizations,
MK-130).

The kernel does not know yet that a level on a folder counts on what it holds: it makes a link, or
deletes a content, for a person only when they hold a level on the file itself (its owner, a person
the file is shared with, an administrator). For a person who reaches a file only through a folder,
the extension checks them itself and asks a job of the organization (an event of its own, MK-085) to
make the links, or to delete the content, without a person: a download answers `202` and is ready a
few seconds later, and the content of a file they deleted leaves the store a few seconds after it
left the catalog, its resource staying registered until then.

## Sharing

A folder or a file is shared in the sharing dialog of the platform (MK-055), with a person, a group,
the whole organization or a link, at the levels `read`, `edit` and `manage`; the app opens it with
the Share button of who has access. A share on a folder counts on everything the folder holds, at any
depth, also on what is added to it later: the catalog adds this inheritance to the kernel at every
request, so a share that is removed stops counting at the next request of the person.

Next to the files of the organization each person has **Shared with me**
(`/app/catalog?view=shared`): the folders and files that someone else shared with them, a group of
theirs or the organization and that are not inside a folder they read already. A shared folder opens
with everything it holds; a file shared alone shows nothing else of its folder.

Below the content of the open folder, or for the item whose sharing state is chosen in the list, the
app shows **who has access** and through which share: the owner and the grants of the item itself,
then those of each folder above it that the person reads, with the folder they come from. The
administrators of the organization reach everything and are not listed.

The kernel does not know that a share on a folder covers its content (MK-055, "no inheritance from
the parent, for now"). What the catalog answers follows the folders; what the kernel answers on an
item reached only through a folder above does not, until the platform passes grants from a parent
resource to its children: the sharing dialog lets a person share an item only with a level on the
item itself (`canShare`), and the file service, its signed links and search refuse a file to a person
who reaches it only through its folder. The catalog works around it for downloads and deletes, with a
job of the organization after its own check (see Storage); search still refuses such a file.

The dialog also makes links, which the access lists with their expiry; the catalog does not yet
contribute the page that shows a folder or a file opened through a link (`shared.view`).

## Kinds of files

Other extensions add kinds of files to the file manager (EXT-105), such as a table, an image or a
dataset that a product understands, through the contract `io.github.mosaikit.ext.catalog/file-kind`
version 1 (MK-134). The files stay plain files of the organization, with their content in the file
service of the kernel: without the extension, the catalog shows them as any other file, and when it
comes back they are of its kind again.

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
  (`Instance<CatalogFiles>`, since the catalog may be absent), with the same `open()` and `record()`.

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
shows what it is, its state with its detail, the preview element and the actions. The preview and
each action are custom elements of the extension, which the catalog creates with the property
`file`: `{ id, name, contentType, size, fileKind, url() }`, `url()` resolving to a signed, expiring
link to its content (EXT-004). An action opens in a dialog; when it changed the file, it dispatches
`catalog-file-changed` (bubbling, composed), and the catalog shows the file again.

[`tests/fixtures/text-notes`](tests/fixtures/text-notes) is a complete example, which the tests
install with the catalog.

## Build and test

Java 25, Maven and Node.js 24, from this folder:

```bash
mvn -f api install                       # the API of the contracts of the catalog, first (EXT-105)
mvn -f tests/fixtures/text-notes package # the fixture of the tests of the kinds of files
mvn package    # target/ext-catalog-0.1.0.zip, the package to install
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

The CI does the same with the action `mosaikit/.github/actions/kernel-api`.
`MOSAIKIT_INSTALLATION=<mosaikit>/target/dist/mosaikit` tests against a build of Mosaikit.
The kinds of files (EXT-105) need the contracts between extensions of Mosaikit (MK-134): until they
are in its snapshot, build Mosaikit from the branch that brings them and test with
`MOSAIKIT_INSTALLATION` and its packed `@mosaikit/testing`.
