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
| `db/` | the migrations of the schema `ext_catalog` |
| `web/index.js` | the app, a custom element the shell renders at `/app/catalog` |
| `web/i18n.js` | the texts of the app in English and Italian, chosen by `context.locale` |
| `pom.xml` | the build, on the parent of Mosaikit extensions `io.github.mosaikit:mosaikit-extension-parent` |
| `src/test/java/` | the unit tests of the backend |
| `package.json`, `playwright.config.ts`, `tests/` | the bench of `@mosaikit/testing` and the Playwright tests |
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
| `GET /api/v1/ext/catalog/folders` | the root of the person: the items at the root they read, and those shared with them whose folder they cannot read |
| `GET /api/v1/ext/catalog/folders/{id}` | a folder with its `path`, the `level` of the person, `canCreate` and its `items`; `404` when it does not exist or the person cannot read it |
| `?sort=name\|changed&order=asc\|desc` | the order of the items, folders first: by name ascending, or by date newest first, by default |
| `POST /api/v1/ext/catalog/folders` | creates a folder, `{ "name", "parent" }`: at the root for the members of the organization, in a folder with the level `edit`; `409` when the folder already holds an item of that name, in any case |
| `POST /api/v1/ext/catalog/folders/{id}/files?name=<name>` | stores the body as a file of the folder, with its `Content-Type`, through the file service of the kernel |

## Build and test

Java 25, Maven and Node.js 24, from this folder:

```bash
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
