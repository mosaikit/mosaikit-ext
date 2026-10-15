# Changelog of ext-catalog

All notable changes of this extension, which is versioned and released on its own from tags
`ext-catalog/vX.Y.Z` (ADR-0001). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the versions [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Folders and sub-folders of an organization (EXT-001): a Java backend with the schema `ext_catalog`,
  where folders and files are items registered with the kernel as resources of the types `folder`
  and `file` (levels read, edit, manage); a level on a folder counts on what it holds. The app shows
  the tree of folders, the content of the open folder with size, owner, last change and sharing
  state, sorted by name or by date, and its path as breadcrumbs; a folder is opened by its address
  (`/app/catalog?folder=<id>`), and one the person cannot read answers not found, like one that does
  not exist. API under `/api/v1/ext/catalog`; files are stored through the file service of the kernel.
- The folder builds and tests alone on the parent of Mosaikit extensions and the bench of
  `@mosaikit/testing`: manifest, an app page in English and Italian, and its first test (EXT-102).
