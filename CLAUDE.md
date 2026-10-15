# CLAUDE.md

Guidance for Claude Code (and other coding agents) in this repository. A maintainer may keep personal
rules in `CLAUDE.local.md`, which is never committed.

## What this is

The common extensions of [Mosaikit](https://github.com/mosaikit/mosaikit), composed by the products
built on it: `ext-catalog` (file manager), `ext-catalog-connection` and its connectors
`ext-catalog-connection-<source>`, `ext-dashboards`, `ext-processes`. The README says what each one
is and gives the naming rule (`ext-<extension>[-<sub>]`, manifest id
`io.github.mosaikit.ext.<extension>[.<sub>]`).

```
docs/requirements/  EXT-nnn.md that span several extensions (format of Mosaikit), and check.py that checks them all
ext-*/              one folder per extension, a project of its own: manifest, pom.xml, package.json,
                    web/, tests/, CHANGELOG.md, README and docs/requirements/ (README and requirements
                    only, until its code arrives)
tools/              check_self_contained.py and build_steps.py (EXT-102), release.py (EXT-103),
                    affected.py (EXT-104) and their tests
```

## Rules

- **Public and generic.** This repository is public. Never name a product built on these extensions,
  an employer, a company, a customer, a tender or a real place, in files, commits or pull requests;
  examples use `example.org`, Acme, Green. Anything of one business domain belongs to the product
  that needs it, not here: a product contributes its own connectors, widgets and nodes from its own
  extensions.
- **English** everywhere: code, comments, commits, documentation; the texts of the interface go
  through the translations of the shell.
- **Licence.** MPL-2.0. Every source file starts with
  `SPDX-FileCopyrightText: 2026 Massimo Antonini` and `SPDX-License-Identifier: MPL-2.0`; files
  that cannot carry a header are covered by `REUSE.toml`. `reuse lint` must pass.
- **Commits** follow Conventional Commits and are signed off (`git commit -s`, DCO). Never
  `git add -A` in a tree another session may share; never a bare `git stash`.
- **One repository, independent extensions** (ADR-0001, `docs/adr/`): each `ext-*` folder is self-contained
  (build, tests, changelog, README, requirements), is published as its own package from a tag
  `ext-<name>/vX.Y.Z`, and never refers to files outside its folder, so it can move to a repository
  of its own without rework.
- **Independent extensions.** An extension declares what it requires and what it only uses when
  present (MK-132), checks the presence of the others (MK-133), talks to them only through published
  contracts (MK-134), and shows a placeholder for a reference to a resource of an absent extension
  (MK-135). Libraries travel inside the extension that needs them (MK-131).
- **Requirements** are `EXT-nnn.md`, in `ext-<name>/docs/requirements/` when their acceptance is
  implemented entirely inside that extension, in `docs/requirements/` when they span several
  extensions or the whole repository; the id never changes when one moves. `python
  docs/requirements/check.py` checks every `docs/requirements` folder of the repository, also against the requirements of Mosaikit when it is cloned next to this repository. Every
  change is linked to a requirement. What the platform lacks becomes an MK requirement in Mosaikit,
  cited in `depends`. A requirement is `done` when tests tagged with its id (`@Tag("EXT-nnn")`,
  `EXT-nnn` in the title of a test) cover its acceptance; its `## History` gets a line either way.
- **Mosaikit is the platform.** Extensions build on the published Mosaikit SDK and its `-latest`
  snapshot; follow `docs/development/extension-development.md` of Mosaikit.
- **CI**: actions in `.github/workflows` are pinned by commit SHA, as in Mosaikit; changes to
  `.github/` wait for the review of a maintainer.
