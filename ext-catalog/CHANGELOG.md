# Changelog of ext-catalog

All notable changes of this extension, which is versioned and released on its own from tags
`ext-catalog/vX.Y.Z` (ADR-0001). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- A file of a kind whose extension is absent from the organization (not installed, not able to run,
  or turned off, MK-133) keeps its kind and state and is listed with them, `fileKind.active` `false`,
  instead of as a plain file: the list and the detail show the placeholder of the platform
  (`mk-reference-placeholder`, MK-135) in place of the kind, its preview and its actions, saying which
  kind is missing and, to administrators, which extension to install or turn on; the file is
  downloaded, moved, renamed, shared, replaced and deleted as any other. When the extension comes or
  goes, the open page shows its files again without a reload (EXT-106).

- Folders and files declare `inherits: parent` (MK-136): the kernel answers the level of a person
  with the folders above, and the catalog asks it instead of walking the folders itself. A person
  with `manage` on a folder shares what it holds in the dialog of the platform, and the grants of the
  folders above in who has access are those of the kernel (EXT-003, #22).
- Downloads and deletes happen in the request (EXT-002, EXT-004): `POST downloads` always answers
  `200` with the signed links, made for the person also when they reach a file through a folder;
  the answer no longer has `id` and `status`, and `GET downloads/{id}` is removed with the `202` and
  the job that made the links. Deleting a file deletes its content as the person, before its
  resource; the job that deleted it later is removed. Schema `V4` drops `download` and
  `pending_removal`.
- `PUT items/{id}/content` and `CatalogFile.open` work for a person who edits or reads the file
  through a folder above it (EXT-105, MK-136): the content replaced is deleted as the person in the
  request, and the job `content.discarded` is removed.
- On `organization.deleted` the catalog no longer deletes the content of the files, its folders and
  files: it has nothing outside the kernel to release, and the kernel removes them after the
  retention of the installation, so that the deletion can be undone until then (EXT-004, MK-130).

### Added

- Documents linked to resources of other extensions (EXT-006): the contract
  `io.github.mosaikit.ext.catalog/linked-documents` version 1, `LinkedDocuments` in
  `io.github.mosaikit.ext:ext-catalog-api` 1.2.0 (a minor release); `GET`/`POST /links`,
  `DELETE /links/{id}`, and the element `mosaikit-ext-catalog-documents` for the sheet of a resource of
  another extension. The sheet of a file (`/app/catalog?file=<id>`, `GET /files/{id}`) shows its links,
  each resolved by the kernel, or the placeholder of the platform while the extension of the resource is
  absent (MK-135). Schema `V5`: `document_link`.
- The search of folders and files, `GET /search` (EXT-006), contributed as the provider `files` of the
  search of the platform (`search.provider`, MK-040), with a full-text index on the names (`V5`).
- Files are registered with the platform at their sheet, `/app/catalog?file=<id>`, instead of their
  folder, when they are stored, renamed or moved.

- `CatalogFile.link(Duration)` in `io.github.mosaikit.ext:ext-catalog-api` 1.1.0, a minor release of
  the contract `file-kind` version 1 (EXT-107): a signed, expiring link of the platform to the content
  of a file of the kind (MK-093), which a process of its extension reads outside the request of a
  person, so that it loads the file elsewhere without keeping a copy and the file counts once against
  the storage quota. The link stops working when the file is deleted or replaced; a new one serves
  the new content. A default method: on a catalog older than 1.1.0 it throws
  `UnsupportedOperationException`.
- Kinds of files added by other extensions (EXT-105), through the contract
  `io.github.mosaikit.ext.catalog/file-kind` version 1 (MK-134), whose interfaces are in the new
  library `io.github.mosaikit.ext:ext-catalog-api` 1.0.0 (`api/`): a kind recognizes files by name,
  media type or first bytes when they are stored or replaced, and when its extension becomes active;
  it is told, in a job of the organization, when its files are stored, replaced, renamed, moved,
  deleted or shared differently, reads their content through the catalog, and records a state on
  them (`CatalogFiles` for work after the event). The frontend point `catalog.file-kind` version 1
  takes the icon, title, preview element, states and actions of a kind; the list shows them on the
  files of the kind, with *Details* for every file (type, size, kind, state, preview, actions,
  download, replace). Without the extension the files are plain files. `PUT items/{id}/content`
  replaces the content of a file; files in lists have `contentType` and `fileKind`.
- Sharing of folders and files (EXT-003) in the sharing dialog of the platform, with people, groups,
  the organization or a link, at the levels read, edit and manage: a share on a folder counts on
  everything it holds, also on what is added later, and a share removed stops counting at the next
  request. Shared with me (`/app/catalog?view=shared`, `GET /api/v1/ext/catalog/shared`) lists what
  others shared with the person outside the folders they read; who has access to a folder or a file,
  and through which share (on the item or inherited from which folder), is shown below the list and
  answered by `GET /api/v1/ext/catalog/items/{id}/access`. The root of the files lists only the
  items at the root of the organization.
- Upload, download, move, rename and delete (EXT-002), the same in the list, in the tree and by
  keyboard: files and folders dropped from the computer onto a folder, or chosen with the Upload
  buttons, are uploaded with their structure and a progress per file, after a check of the whole
  upload against the storage quota of the organization that names the limit; items are moved by
  drag and drop, with Move or with Ctrl+X and Ctrl+V, keeping their identity and their shares;
  renamed with Rename or F2, a name used in the folder refused naming the item that has it; deleted
  with Delete or the Delete key after a confirmation with the number of items the folders hold; a
  file downloads with its name, several items as one ZIP archive. API `items/{id}/rename`,
  `items/{id}/move`, `items/{id}/summary`, `DELETE items/{id}`, `uploads/check`, `downloads`.
- Storage through the file service of the platform (EXT-004): the content of files is kept only by
  the file service of the kernel (a directory in the portable distribution, an S3-compatible bucket on
  a server) and downloaded only through its signed, expiring links; deleting a file deletes its
  content. Deleting the organization leaves its folders, files and content to the kernel, which
  removes them from the database and the store after its retention (MK-130).
- Folders and sub-folders of an organization (EXT-001): a Java backend with the schema `ext_catalog`,
  where folders and files are items registered with the kernel as resources of the types `folder`
  and `file` (levels read, edit, manage); a level on a folder counts on what it holds. The app shows
  the tree of folders, the content of the open folder with size, owner, last change and sharing
  state, sorted by name or by date, and its path as breadcrumbs; a folder is opened by its address
  (`/app/catalog?folder=<id>`), and one the person cannot read answers not found, like one that does
  not exist. API under `/api/v1/ext/catalog`; files are stored through the file service of the kernel.
- The folder builds and tests alone on the parent of Mosaikit extensions and the bench of
  `@mosaikit/testing`: manifest, an app page in English and Italian, and its first test (EXT-102).
