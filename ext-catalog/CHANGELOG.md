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
- Folders and sub-folders of an organization (EXT-001): a Java backend with the schema `ext_catalog`,
  where folders and files are items registered with the kernel as resources of the types `folder`
  and `file` (levels read, edit, manage); a level on a folder counts on what it holds. The app shows
  the tree of folders, the content of the open folder with size, owner, last change and sharing
  state, sorted by name or by date, and its path as breadcrumbs; a folder is opened by its address
  (`/app/catalog?folder=<id>`), and one the person cannot read answers not found, like one that does
  not exist. API under `/api/v1/ext/catalog`; files are stored through the file service of the kernel.
- The folder builds and tests alone on the parent of Mosaikit extensions and the bench of
  `@mosaikit/testing`: manifest, an app page in English and Italian, and its first test (EXT-102).
