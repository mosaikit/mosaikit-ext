<!--
SPDX-FileCopyrightText: 2026 Massimo Antonini
SPDX-License-Identifier: MPL-2.0
-->

# ADR-0001: One repository, independently released extensions

- Status: accepted
- Date: 2026-10-14

## Context

The common extensions of Mosaikit (`ext-catalog`, `ext-catalog-connection` and its connectors,
`ext-dashboards`, `ext-processes`) could live in this one repository or in one repository each. A
product that needs one extension must not have to take the others, and a developer who works on one
should not have to build them all. The extensions are also young: they change together with the
Mosaikit SDK and with each other. With one repository per extension, each of those changes would
become several coordinated pull requests and CI pipelines.

## Decision

The extensions stay in this repository, one folder each at its root (`ext-<extension>[-<sub>]`), and
each one is an independent unit:

1. **Self-contained folder.** An extension's folder holds everything of it: build, sources, tests,
   changelog, README and its requirements (`ext-<name>/docs/requirements/`). It does not depend on
   files of the root or of another extension's folder; it uses another extension only through the
   published package and its contracts (MK-132, MK-134). The root keeps only what is common to the
   repository: licence, CI, the requirements that span several extensions, these ADRs.
2. **Separate publication.** Each extension is published as its own package with its own version
   (`io.github.mosaikit.ext:ext-<name>`), released from a tag `ext-<name>/vX.Y.Z`. Products compose
   extensions by package and version, never by cloning this repository. A developer who needs only
   one folder uses `git sparse-checkout`.
3. **CI per folder.** A pull request builds and tests only the extensions it changes, plus those that
   depend on them; a change to what is common runs all of them.
4. **Way out.** An extension moves to a repository of its own when it gets its own maintainers, a
   release rhythm unlike the others, or a different licence. Because of point 1 the move is
   mechanical: `git filter-repo --subdirectory-filter ext-<name>` keeps its history, the package
   coordinates do not change, and products notice nothing.

## Consequences

- Changes that cross extensions or follow a new SDK are one pull request.
- Versions, changelogs and release notes are per extension, not per repository.
- The CI needs to know the dependencies between extensions; they are read from the extensions'
  manifests (MK-132), not from a list kept by hand.
- Requirements: EXT-102 (self-contained folders), EXT-103 (separate publication), EXT-104 (CI per
  folder).
