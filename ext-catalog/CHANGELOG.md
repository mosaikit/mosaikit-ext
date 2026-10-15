# Changelog of ext-catalog

All notable changes of this extension, which is versioned and released on its own from tags
`ext-catalog/vX.Y.Z` (ADR-0001). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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
  content, and the event of an organization deleted deletes the content of all its files. Links and
  deletes that the kernel refuses to a person who reaches a file only through a folder are made by a
  job of the organization after the check of the extension. Schema `V2`: `download`,
  `pending_removal`.
- Folders and sub-folders of an organization (EXT-001): a Java backend with the schema `ext_catalog`,
  where folders and files are items registered with the kernel as resources of the types `folder`
  and `file` (levels read, edit, manage); a level on a folder counts on what it holds. The app shows
  the tree of folders, the content of the open folder with size, owner, last change and sharing
  state, sorted by name or by date, and its path as breadcrumbs; a folder is opened by its address
  (`/app/catalog?folder=<id>`), and one the person cannot read answers not found, like one that does
  not exist. API under `/api/v1/ext/catalog`; files are stored through the file service of the kernel.
- The folder builds and tests alone on the parent of Mosaikit extensions and the bench of
  `@mosaikit/testing`: manifest, an app page in English and Italian, and its first test (EXT-102).
